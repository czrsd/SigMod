const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('../server/node_modules/typescript');
require.extensions['.ts'] = (module, filename) =>
    module._compile(
        ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
            fileName: filename,
        }).outputText,
        filename
    );
const { ObjectId } = require('../server/node_modules/mongodb');
const {
    visibleData,
    fieldCatalog,
    validField,
    parseUserQuery,
    matchesUser,
    mongoUserQuery,
} = require('../server/src/admin/data/user-query.ts');
const input = (filters, q = '', searchField = '') => parseUserQuery({ filters: JSON.stringify(filters), q, searchField });
const filter = (field, op, type, value = '') => ({ field, op, type, value });

test('arbitrary nested fields, arrays, typed values, missing and null filters', () => {
    const row = {
        nick: 'Alpha',
        level: 42,
        isAlive: true,
        lastMessageAt: null,
        user: { cards: { rare: 3 }, skins: ['red', 'blue'], created: '2026-10-22T12:00:00Z' },
    };
    for (const rule of [
        filter('level', 'gte', 'number', '42'),
        filter('isAlive', 'eq', 'boolean', 'true'),
        filter('user.cards.rare', 'gt', 'number', '2'),
        filter('user.skins', 'eq', 'string', 'blue'),
        filter('user.created', 'gte', 'date', '2026-10-21'),
        filter('lastMessageAt', 'eq', 'null'),
        filter('missing', 'missing', 'string'),
        filter('lastMessageAt', 'exists', 'string'),
    ])
        assert.equal(matchesUser(row, input([rule])), true, JSON.stringify(rule));
    assert.equal(matchesUser(row, input([], 'BLUE')), true);
    assert.equal(matchesUser(row, input([], 'alpha', 'user.cards')), false);
    assert.equal(matchesUser(row, input([filter('level', 'lt', 'number', '42')])), false);
    assert.equal(matchesUser(row, input([filter('missing', 'eq', 'null')])), false);
    assert.equal(matchesUser(row, input([filter('missing', 'ne', 'null')])), false);
    assert.equal(matchesUser(row, input([filter('user.skins', 'notContains', 'string', 'green')])), true);
    assert.equal(matchesUser(row, input([filter('nick', 'gte', 'date', '2026-10-21')])), false);
    assert.equal(matchesUser(row, input([filter('nick', 'ne', 'date', '2026-10-21')])), false);
    assert.equal(matchesUser(row, input([filter('user.skins.0', 'contains', 'string', 'red')])), true);
    assert.ok(mongoUserQuery(input([filter('user.cards.rare', 'gte', 'number', '3')])).$and);
});

test('credentials are removed recursively and operator/path injection is rejected', () => {
    const raw = {
        _id: new ObjectId(),
        created: new Date('2026-10-22'),
        token: 'hidden',
        user: { nick: 'Alice', refreshToken: 'hidden', sigma: { password: 'hidden', level: 2 } },
        cards: [{ api_key: 'hidden', value: 3 }],
    };
    const shown = visibleData(raw);
    assert.equal(JSON.stringify(shown).includes('hidden'), false);
    assert.equal(shown._id, raw._id.toString());
    assert.equal(shown.created, '2026-10-22T00:00:00.000Z');
    assert.ok(fieldCatalog([raw]).some((f) => f.path === 'user.sigma.level'));
    assert.equal(
        fieldCatalog([raw]).some((f) => /token|password|api_key/i.test(f.path)),
        false
    );
    for (const path of ['$where', 'user.$ne', '__proto__.x', 'user.token', 'user.password', 'connection.cookie'])
        assert.throws(() => validField(path));
    for (const query of [
        { filters: '{}' },
        { q: {} },
        { filters: JSON.stringify([filter('level', 'gte', 'number', 'NaN')]) },
        { filters: JSON.stringify([{ field: 'nick', op: '$where', type: 'string' }]) },
        { filters: JSON.stringify(Array(21).fill(filter('nick', 'exists', 'string'))) },
    ])
        assert.throws(() => parseUserQuery(query));
});

test('V5 directory includes open guests, filters all linked fields, paginates and removes closed connections', async (t) => {
    const sockets = new Map();
    // Isolate the HTTP router from live socket setup, file watchers and heartbeat timers.
    require.cache[require.resolve('../server/src/socket/setup.ts')] = { exports: { wsHandler: { sockets } } };
    const { db } = require('../server/src/db/connection.ts');
    const router = require('../server/src/admin/data/routes.ts').default;
    const userId = new ObjectId('0123456789abcdef01234567');
    const stored = { _id: userId, nick: 'Alice', hourlyTime: 12, sigma: { reward: { level: 7 } }, token: 'never-return' };
    const docs = { users: [stored], modusers: [], user_settings: [] };
    let lastFind;
    t.mock.method(db, 'collection', (name) => ({
        find: (query, options) => {
            lastFind = { query, options };
            const cursor = { sort: () => cursor, limit: () => cursor, toArray: async () => docs[name] ?? [] };
            return cursor;
        },
        findOne: async () => stored,
    }));
    for (let i = 0; i < 28; i++) {
        const sid = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
        sockets.set(sid, {
            sid,
            ws: { readyState: i === 27 ? 3 : 1, bufferedAmount: 0 },
            req: {
                url: '/ws/v5',
                headers: { 'user-agent': 'Test browser', cookie: 'never-return' },
                socket: { remoteAddress: '127.0.0.1' },
                protocol: 'http',
            },
            connectedAt: new Date(),
            nick: i === 0 ? 'Alice' : null,
            server: 'EU',
            tag: 'ABC',
            score: i,
            isAlive: false,
            user: i === 0 ? { _id: userId, token: 'never-return' } : null,
            modUser: null,
        });
    }
    const express = require('../server/node_modules/express');
    const app = express();
    app.use(router);
    app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (url) => {
        const response = await fetch(base + url);
        assert.equal(response.status, 200);
        return response.json();
    };
    const first = await get('/active-users');
    assert.equal(first.total, 27);
    assert.equal(first.items.length, 25);
    assert.ok(first.nextCursor);
    assert.ok(first.items.some((item) => item.user === null));
    const second = await get('/active-users?cursor=' + first.nextCursor);
    assert.equal(second.items.length, 2);
    assert.equal(second.nextCursor, null);
    const filtered = await get(
        '/active-users?filters=' + encodeURIComponent(JSON.stringify([filter('storedUser.sigma.reward.level', 'gte', 'number', '7')]))
    );
    assert.equal(filtered.items.length, 1);
    assert.equal(filtered.items[0].nick, 'Alice');
    const id = first.items[0].sid;
    const detail = await get('/active-users/' + id);
    assert.equal(detail.user.storedUser.hourlyTime, 12);
    assert.equal(JSON.stringify(detail).includes('never-return'), false);
    sockets.get(id).ws.readyState = 3;
    assert.equal((await fetch(base + '/active-users/' + id)).status, 404);
    assert.equal(
        (await fetch(base + '/active-users?filters=' + encodeURIComponent(JSON.stringify([filter('user.token', 'exists', 'string')]))))
            .status,
        400
    );
    const sigmally = await get('/sigmally-users/' + userId);
    assert.equal(sigmally.user.sigma.reward.level, 7);
    assert.equal(JSON.stringify(sigmally).includes('never-return'), false);
    await get('/sigmally-users?filters=' + encodeURIComponent(JSON.stringify([filter('hourlyTime', 'gte', 'number', '10')])));
    assert.deepEqual(lastFind.query, { $and: [{ hourlyTime: { $gte: 10 } }] });
    assert.equal(lastFind.options.maxTimeMS, 10000);
});
