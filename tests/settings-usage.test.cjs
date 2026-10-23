const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { test } = require('node:test');
const ts = require('../server/node_modules/typescript');
const schema = require('../server/src/config/settingsUsageSchema.json');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
    fileName: filename,
}).outputText, filename);

function memoryStorage() {
    const values = new Map();
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}
function locks() {
    let pending = Promise.resolve();
    return { request(_name, callback) { const result = pending.then(callback); pending = result.catch(() => {}); return result; } };
}
function getPath(value, path) { return path.split('.').reduce((current, part) => current?.[part], value); }
function setPath(value, path, next) {
    const parts = path.split('.');
    let target = value;
    for (const part of parts.slice(0, -1)) target = target[part] ??= {};
    target[parts.at(-1)] = next;
}
function defaults() {
    const source = fs.readFileSync(require.resolve('../client/src/constants_and_utils.js'), 'utf8');
    return vm.runInNewContext(source.slice(source.indexOf('const DEFAULT_SETTINGS ='), source.indexOf('const ENDPOINTS =')) + '\nJSON.parse(JSON.stringify(DEFAULT_SETTINGS));', { BUILD: { settingsVersion: schema.settingsSchemaVersion } });
}
function client(storage = memoryStorage(), sharedLocks = locks()) {
    const listeners = new Map();
    const sent = [];
    const warnings = [];
    const resources = { child: () => resources, add: () => {}, interval: () => {}, listen: () => {}, dispose: () => {} };
    const backend = {
        on(type, callback) { const rows = listeners.get(type) ?? []; rows.push(callback); listeners.set(type, rows); return () => {}; },
        emit(type, value) { for (const callback of listeners.get(type) ?? []) callback(value); },
        send(type, content) { sent.push({ type, content: structuredClone(content) }); return true; },
    };
    const settings = defaults();
    storage.setItem('sigmod', JSON.stringify(settings));
    const context = vm.createContext({
        SETTINGS_USAGE_SCHEMA: schema, DEFAULT_SETTINGS: settings, crypto: crypto.webcrypto, TextEncoder, AbortController,
        BUILD: { settingsVersion: schema.settingsSchemaVersion, release: '11.0.0' },
        STORAGE: { settings: 'sigmod', localization: 'SigModClient-localization' },
        navigator: { locks: sharedLocks }, window: {}, document: {},
        getPath, unwrapSettingScalar: (value) => value, own: (value, key) => Object.hasOwn(value, key),
        setTimeout: () => 1, clearTimeout: () => {}, fetch,
    });
    const app = {
        resources, backend, settings, logger: { warnOnce: (...args) => warnings.push(args) },
        settingsStore: { storage, value: settings, get: (path) => getPath(settings, path), onChange: () => () => {} },
    };
    vm.runInContext(fs.readFileSync(require.resolve('../client/src/keybind_usage.js'), 'utf8') + '\nglobalThis.KeybindUsage = KeybindUsage;', context);
    const tracker = new context.KeybindUsage(app);
    return { tracker, app, backend, sent, storage, settings, context, warnings, sharedLocks };
}
function identity(storage) {
    storage.setItem('SigModClient-settings-usage-v1', JSON.stringify({ installationId: crypto.randomUUID() }));
}
function outbox(harness) { return JSON.parse(harness.storage.getItem(harness.tracker.key)); }
async function settled(harness) { await harness.sharedLocks.request('drain', () => {}); await harness.sharedLocks.request('drain', () => {}); }

test('unsupported servers receive no analytics messages and the pending report survives an update', async () => {
    const h = client();
    identity(h.storage);
    h.tracker.record('macros.keys.splits.double', 'd');
    await h.tracker.flush();
    assert.equal(h.sent.length, 0);
    assert.equal(outbox(h).uses[0].count, 1);
    const updated = client(h.storage, h.sharedLocks);
    updated.backend.emit('usage-capabilities', { keybindUsage: 1 });
    await settled(updated);
    assert.equal(updated.sent[0].type, 'keybind-usage');
    assert.equal(updated.sent[0].content.uses[0].count, 1);
    assert.match(updated.sent[0].content.day, /^\d{4}-\d{2}-\d{2}$/);
});

test('batches preserve every queued entry beyond 100 and accept activity recorded before an acknowledgement', async () => {
    const h = client();
    identity(h.storage);
    h.tracker.supported = true;
    for (let index = 0; index < 145; index++) h.tracker.record('macros.keys.splits.double', 'key-' + index);
    await h.tracker.flush();
    assert.equal(outbox(h).inFlight.uses.length, 100);
    assert.equal(outbox(h).uses.length, 45);
    h.tracker.record('macros.keys.respawn', 'b');
    await h.tracker.acknowledge(outbox(h).inFlight.batchId);
    await settled(h);
    assert.equal(outbox(h).inFlight.uses.length, 46);
    assert.equal(outbox(h).uses.length, 0);
    assert.equal(h.sent.reduce((sum, report) => sum + report.content.uses.length, 0), 146);
});

test('tabs merge their counters under a shared lock and a stale acknowledgement cannot erase a newer batch', async () => {
    const first = client();
    identity(first.storage);
    const second = client(first.storage, first.sharedLocks);
    first.tracker.record('macros.keys.respawn', 'b');
    second.tracker.record('macros.keys.respawn', 'b');
    await Promise.all([first.tracker.persist(), second.tracker.persist()]);
    assert.equal(outbox(first).uses[0].count, 2);
    first.tracker.supported = true;
    await first.tracker.flush();
    const oldId = outbox(first).inFlight.batchId;
    second.tracker.record('macros.keys.respawn', 'x');
    await second.tracker.persist();
    await first.tracker.acknowledge(oldId);
    await settled(first);
    const newId = outbox(first).inFlight.batchId;
    await second.tracker.acknowledge(oldId);
    assert.equal(outbox(first).inFlight.batchId, newId);
    assert.equal(outbox(first).inFlight.uses[0].binding, 'x');
});

test('mouse changes keep independent before/after snapshots and numeric macro changes are retained', async () => {
    const h = client();
    h.settings.macros.mouse.bindings.push({ button: 3, action: 'split2' });
    h.tracker.settingsChanged(null);
    h.settings.macros.mouse.bindings[0].action = 'split4';
    h.tracker.settingsChanged(null);
    setPath(h.settings, 'macros.keys.line.instantSplit', 2);
    h.tracker.settingsChanged('macros.keys.line.instantSplit');
    await h.tracker.persist();
    const changes = outbox(h).changes;
    assert.deepEqual(changes[0].from, []);
    assert.deepEqual(changes[0].to, [{ button: 3, action: 'split2' }]);
    assert.deepEqual(changes[1].from, [{ button: 3, action: 'split2' }]);
    assert.equal(changes[2].to, 2);
});

test('failed storage writes retain in-memory counters for retry', async () => {
    const h = client();
    h.tracker.record('macros.keys.respawn', 'b');
    const write = h.storage.setItem;
    h.storage.setItem = () => { throw new Error('quota'); };
    await h.tracker.persist();
    assert.equal(h.tracker.pending.uses[0].count, 1);
    assert.equal(h.warnings.length, 1);
    h.storage.setItem = write;
    await h.tracker.persist();
    assert.equal(outbox(h).uses[0].count, 1);
    assert.equal(h.tracker.pending.uses.length, 0);
});

test('real MongoDB: settings sync, WebSocket reports, replay protection, and admin reads', { skip: !process.env.SIGMOD_TEST_MONGO_URI }, async (t) => {
    const uri = new URL(process.env.SIGMOD_TEST_MONGO_URI);
    assert.ok(['localhost', '127.0.0.1'].includes(uri.hostname), 'integration test requires local MongoDB');
    const mongoose = require('../server/node_modules/mongoose');
    const database = 'sigmod_usage_test_' + crypto.randomUUID().replaceAll('-', '');
    await mongoose.connect(uri.toString(), { dbName: database, serverSelectionTimeoutMS: 3000 });
    t.after(async () => {
        assert.equal(mongoose.connection.name, database);
        assert.ok(database.startsWith('sigmod_usage_test_'));
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    });
    require.cache[require.resolve('../server/src/socket/setup.ts')] = { exports: { wsHandler: { sockets: new Map() } } };
    const SettingsUsage = require('../server/src/models/SettingsUsageModel.ts').default;
    const KeybindUsage = require('../server/src/models/KeybindUsageModel.ts').default;
    const { storeKeybindUsage } = require('../server/src/services/keybindUsage.ts');
    await Promise.all([SettingsUsage.init(), KeybindUsage.init()]);
    const express = require('../server/node_modules/express');
    const { WebSocketServer, WebSocket } = require('../server/node_modules/ws');
    const app = express();
    app.use(express.json());
    app.use('/api/v5', require('../server/src/routes/SettingsUsageRoutes.ts').default);
    app.use('/admin', require('../server/src/admin/data/routes.ts').default);
    app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: error.message }));
    const server = app.listen(0, '127.0.0.1');
    if (!server.listening) await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const wss = new WebSocketServer({ server });
    t.after(async () => {
        for (const socket of wss.clients) socket.terminate();
        await new Promise((resolve) => wss.close(resolve));
        await new Promise((resolve) => server.close(resolve));
    });
    const handleMessage = require('../server/src/socket/core/messageHandler.ts').default;
    wss.on('connection', (ws) => {
        const client = { ws, send: (message) => ws.send(JSON.stringify(message)) };
        ws.on('message', (raw) => void handleMessage(raw, client));
        ws.send(JSON.stringify({ type: 'usage-capabilities', content: { keybindUsage: 1 } }));
    });
    const h = client();
    h.context.ENDPOINTS = { app: base + '/api/v5' };
    vm.runInContext(fs.readFileSync(require.resolve('../client/src/settings_usage.js'), 'utf8') + '\nglobalThis.SettingsUsageSync = SettingsUsageSync;', h.context);
    const sync = new h.context.SettingsUsageSync(h.app);
    sync.start();
    await sync.synchronize();
    const installId = JSON.parse(h.storage.getItem('SigModClient-settings-usage-v1')).installationId;
    let stored = await SettingsUsage.findById(installId).lean();
    assert.equal(stored.revision, 1);
    assert.equal(stored.settings.macros.keys.respawn, 'b');
    setPath(h.settings, 'macros.keys.respawn', 'x');
    h.storage.setItem('sigmod', JSON.stringify(h.settings));
    await sync.synchronize();
    stored = await SettingsUsage.findById(installId).lean();
    assert.equal(stored.revision, 2);
    assert.equal(stored.settings.macros.keys.respawn, 'x');
    let response = await fetch(base + '/admin/settings-usage/fields/macros.keys.respawn');
    let result = await response.json();
    assert.equal(result.totalInstallations, 1);
    assert.equal(result.customizedInstallations, 1);
    assert.equal(result.values[0].value, 'x');

    const ws = new WebSocket(base.replace('http:', 'ws:'));
    const replies = [];
    ws.on('message', (raw) => { const message = JSON.parse(raw.toString()); replies.push(message); h.backend.emit(message.type, message.content); });
    h.backend.send = (type, content) => { h.sent.push({ type, content: structuredClone(content) }); ws.send(JSON.stringify({ type, content })); return true; };
    await once(ws, 'open');
    await new Promise((resolve) => setImmediate(resolve));
    for (let i = 0; i < 3; i++) h.tracker.record('macros.keys.splits.double', 'd');
    h.tracker.record('split4', 'mouse:3', 'mouse');
    h.tracker.settingsChanged('macros.keys.respawn');
    const acknowledged = new Promise((resolve) => ws.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'keybind-usage-ack') resolve(message.content);
    }));
    await h.tracker.flush();
    const batchId = await acknowledged;
    const report = h.sent.find((message) => message.content.batchId === batchId).content;
    assert.ok(replies.every((message) => message.type !== 'error'));
    await settled(h);
    assert.equal(outbox(h).inFlight, null);
    let keyDoc = await KeybindUsage.findOne({ batches: batchId }).lean();
    assert.equal(Object.values(keyDoc.metrics).reduce((sum, count) => sum + count, 0), 5);
    const replayed = once(ws, 'message');
    ws.send(JSON.stringify({ type: 'keybind-usage', content: report }));
    await replayed;
    keyDoc = await KeybindUsage.findOne({ batches: batchId }).lean();
    assert.equal(Object.values(keyDoc.metrics).reduce((sum, count) => sum + count, 0), 5);
    response = await fetch(base + '/admin/settings-usage/keybinds?days=7');
    result = await response.json();
    assert.equal(result.uses.find((item) => item.action === 'macros.keys.splits.double').count, 3);
    assert.equal(result.uses.find((item) => item.input === 'mouse').count, 1);
    assert.equal(result.changes.find((item) => item.action === 'macros.keys.respawn').to, 'x');

    const yesterday = new Date(); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const midnightReport = { ...report, batchId: crypto.randomUUID(), day: yesterday.toISOString().slice(0, 10) };
    assert.equal((await storeKeybindUsage(midnightReport, yesterday)).status, 'accepted');
    assert.equal((await storeKeybindUsage(midnightReport)).status, 'accepted');
    const midnightDocs = await KeybindUsage.find({ batches: midnightReport.batchId }).lean();
    assert.equal(midnightDocs.length, 1);
    assert.equal(Object.values(midnightDocs[0].metrics).reduce((sum, count) => sum + count, 0), 5);
    const largeMouse = Array.from({ length: 64 }, (_, button) => ({ button, action: 'split4' }));
    assert.equal((await storeKeybindUsage({ ...report, batchId: crypto.randomUUID(), uses: [], changes: [
        { action: 'macros.mouse.bindings', from: [], to: largeMouse, count: 1 },
        { action: 'macros.keys.line.instantSplit', from: 0, to: 2, count: 1 },
    ] })).status, 'accepted');
    assert.equal((await storeKeybindUsage({ ...report, uses: [{ action: 'not-a-binding', input: 'keyboard', binding: 'x', count: 1 }] })).status, 'invalid');
    ws.close();
    await once(ws, 'close');
});
