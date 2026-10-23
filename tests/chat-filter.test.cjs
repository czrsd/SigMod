const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('../server/node_modules/typescript');

// Load server sources so these regressions can run without stale build artifacts.
require.extensions['.ts'] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
        fileName: filename,
    });
    module._compile(outputText, filename);
};

const { ContentRow, ContentAudit } = require('../server/src/admin/content/models.ts');
const { defaultChatFilter } = require('../server/src/admin/content/chatFilter.ts');
const { getPublicChatFilterSnapshot, contentEvents } = require('../server/src/admin/content/public.ts');

test('internal rules are editable from revision zero and saved settings override defaults', async (t) => {
    let stored = null;
    const audits = [];
    t.mock.method(ContentRow, 'findById', () => ({ lean: async () => stored }));
    t.mock.method(ContentRow, 'findOneAndUpdate', (query, update) => ({
        lean: async () => {
            assert.equal(query.revision, stored?.revision ?? 0);
            stored = { _id: query._id, ...update.$set };
            return stored;
        },
    }));
    t.mock.method(ContentAudit, 'create', async (entry) => {
        audits.push(entry);
    });
    const express = require('../server/node_modules/express');
    const app = express();
    app.use(express.json());
    app.use('/admin', require('../server/src/admin/content/routes.ts').default);
    app.use('/public', require('../server/src/routes/PublicContentRoutes.ts').default);
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const read = async (url) => {
        const response = await fetch(base + url);
        assert.equal(response.status, 200);
        return response.json();
    };
    const defaults = defaultChatFilter();
    assert.equal(defaults.enabled, true);
    assert.equal(defaults.names.length, 25);
    assert.deepEqual(defaults.names, defaults.messages);
    for (const fragment of ['𝘢𝙜𝙖rio.ᴄity', '﷽', '𒐫', '𒈟']) assert.ok(defaults.names.includes(fragment));
    assert.deepEqual(await read('/admin/chat-filter'), defaults);
    assert.deepEqual(await read('/public/chat-filter'), defaults);
    defaults.names.length = 0;
    assert.equal(defaultChatFilter().names.length, 25);

    const changed = [];
    const listener = (id) => changed.push(id);
    contentEvents.on('changed', listener);
    t.after(() => contentEvents.off('changed', listener));
    const save = (body) =>
        fetch(base + '/admin/chat-filter', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    const edited = { expectedRevision: 0, enabled: true, names: ['CUSTOM'], messages: ['new spam'] };
    const response = await save(edited);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.revision, 1);
    assert.deepEqual((await getPublicChatFilterSnapshot()).names, ['custom']);
    assert.deepEqual((await read('/admin/chat-filter')).messages, ['new spam']);
    assert.equal((await save(edited)).status, 409);
    assert.equal((await save({ ...edited, expectedRevision: 1, enabled: false })).status, 200);
    const disabled = await read('/public/chat-filter');
    assert.equal(disabled.enabled, false);
    assert.deepEqual(disabled.names, []);
    assert.deepEqual(disabled.messages, []);
    assert.deepEqual((await read('/admin/chat-filter')).names, ['custom']);
    assert.equal(audits.length, 2);
    assert.deepEqual(changed, ['chatFilter', 'chatFilter']);
});

test('client loads revision-zero internal rules, retains them on failure, and respects disable', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../client/src/features.js'), 'utf8');
    const method = source.slice(
        source.indexOf('    async loadBlockedData() {'),
        source.indexOf('    applyColors() {', source.indexOf('    async loadBlockedData() {'))
    );
    let payload = defaultChatFilter();
    let failing = false;
    const requested = [];
    const context = vm.createContext({
        AbortController,
        setTimeout,
        clearTimeout,
        ENDPOINTS: { app: 'https://internal.example/api/v5' },
        isObject: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
        fetch: async (url) => {
            requested.push(url);
            if (failing) throw new Error('offline');
            return { ok: true, json: async () => payload };
        },
    });
    const load = vm.runInContext(`({${method}}).loadBlockedData`, context);
    const cleanups = new Set();
    const chat = {
        resources: { disposed: false, add: (fn) => cleanups.add(fn), remove: (fn) => cleanups.delete(fn) },
        blocked: { names: [], messages: [] },
        app: { logger: { warnOnce() {} } },
    };
    await load.call(chat);
    assert.deepEqual(
        Array.from(chat.blocked.names),
        payload.names.map((value) => value.toLowerCase())
    );
    failing = true;
    await load.call(chat);
    assert.equal(chat.blocked.names.length, 25);
    failing = false;
    payload = { ...payload, enabled: false };
    await load.call(chat);
    assert.equal(chat.blocked.names.length, 0);
    assert.equal(chat.blocked.messages.length, 0);
    assert.deepEqual(requested, Array(3).fill('https://internal.example/api/v5/chat-filter'));
    assert.equal(cleanups.size, 0);
    assert.equal(chat.blockedRequest, null);
});
