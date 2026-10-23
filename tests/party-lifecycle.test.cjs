const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('../server/node_modules/typescript');

function loadServer(file, dependencies, globals = {}) {
    const filename = path.join(__dirname, '../server/src', file);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(source, {
        exports: module.exports, module, process, TextEncoder, TextDecoder, Uint8Array, ...globals,
        require(name) {
            if (Object.hasOwn(dependencies, name)) return dependencies[name];
            throw new Error(`Unexpected dependency: ${name}`);
        },
    }, { filename });
    return module.exports;
}

function serverHarness() {
    const metrics = { recordPartyJoin() {}, recordPartyLeave() {}, recordPartyNickname() {} };
    const handler = loadServer('socket/SocketController.ts', { '../services/partyUsage': metrics }).default;
    const utils = loadServer('socket/core/socketUtils.ts', {
        '../../utils/helpers': { noXSS: (s) => s }, '../setup': { wsHandler: handler },
        '../../utils/logger': {}, '../../models/ChatModel': {}, '../../db/connection': {},
        mongodb: {}, 'express-useragent': {}, '../../services/partyUsage': metrics,
    });
    const member = (id, server = 'eu', tag = 'ABC') => {
        const s = {
            sid: id, server: null, tag: null, nick: id, score: 7000, isAlive: true,
            skin: null, color: null, ping: 30, sent: [],
            send(message) { this.sent.push(JSON.parse(JSON.stringify(message))); },
        };
        handler.registerSocket(s);
        if (server) utils.onServerChange(server, s);
        if (tag) utils.updateTag(tag, s);
        return s;
    };
    const roster = (s) => s.sent.filter((m) => m.type === 'tag-members').at(-1)?.content;
    return { handler, utils, member, roster };
}

test('departure removes stale mass, minimap location, and reindexes every remaining member', () => {
    const { handler, member, roster } = serverHarness();
    const a = member('a');
    const b = member('b');
    const c = member('c');
    handler.removeSocket(b);
    assert.deepEqual(roster(a).map((m) => [m.id, m.tagIndex]), [['a', 1], ['c', 2]]);
    assert.equal(roster(a).reduce((sum, m) => sum + m.score, 0), 14000);
    assert.ok(a.sent.some((m) => m.type === 'leave-tag' && m.content.id === 'b'));
    assert.ok(a.sent.some((m) => m.type === 'minimap-data' && m.content.sid === 'b' && m.content.x === null));
    const count = a.sent.length;
    handler.removeSocket(b);
    assert.equal(a.sent.length, count);
    handler.removeSocket(a);
    handler.removeSocket(c);
    assert.equal(handler.getActiveTagRooms().length, 0);
});

test('server and tag changes refresh both rooms without leaking other parties', () => {
    const { utils, member, roster } = serverHarness();
    const a = member('a');
    const b = member('b');
    const c = member('c', 'us');
    const isolated = member('isolated', 'eu', 'XYZ');
    const count = isolated.sent.length;
    utils.onServerChange('us', b);
    assert.deepEqual(roster(a).map((m) => m.id), ['a']);
    assert.deepEqual(roster(c).map((m) => m.id), ['c', 'b']);
    assert.deepEqual(roster(b).map((m) => m.id), ['c', 'b']);
    utils.updateTag('XYZ', b);
    assert.deepEqual(roster(c).map((m) => m.id), ['c']);
    assert.deepEqual(roster(b).map((m) => m.id), ['b']);
    utils.updateTag(null, b);
    assert.deepEqual(roster(b), []);
    assert.equal(isolated.sent.length, count);
});

test('tag before server, same-tag resync, reconnect SID, and delimiter-containing rooms', () => {
    const { handler, utils, member, roster } = serverHarness();
    const a = member('a', null);
    utils.onServerChange('eu', a);
    assert.deepEqual(roster(a).map((m) => m.id), ['a']);
    a.sent.length = 0;
    utils.updateTag('ABC', a);
    assert.equal(roster(a).length, 1);
    a.sent.length = 0;
    utils.onServerChange('eu', a);
    assert.equal(roster(a).length, 1);
    handler.removeSocket(a);
    const next = member('new-sid');
    assert.deepEqual(roster(next).map((m) => m.id), ['new-sid']);
    const x = member('x', 'eu:A', 'B');
    const y = member('y', 'eu', 'A:B');
    assert.deepEqual(roster(x).map((m) => m.id), ['x']);
    assert.deepEqual(roster(y).map((m) => m.id), ['y']);
});

test('disconnect cleanup completes while the account database write is still pending', async () => {
    const { handler, member, roster } = serverHarness();
    const a = member('a');
    const b = member('b');
    let finishWrite;
    const Socket = loadServer('socket/core/socket.ts', {
        ws: { OPEN: 1 }, fs: { readFileSync: () => '0', watch() {} }, path,
        '../setup': { wsHandler: handler }, uuid: {},
        '../../models/AccountModel': { updateOne: () => new Promise((resolve) => { finishWrite = resolve; }) },
        '../../utils/logger': { info() {}, error() {} }, './messageHandler': {},
        '../../services/clientContent': {},
    }).default;
    const real = Object.assign(Object.create(Socket.prototype), b, { modUser: { _id: 'account' } });
    const closing = real.onClose();
    assert.equal(handler.sockets.has('b'), false);
    assert.deepEqual(roster(a).map((m) => m.id), ['a']);
    assert.equal(typeof finishWrite, 'function');
    await real.onClose(); // duplicate close does not repeat the pending write
    finishWrite();
    await closing;
});

test('heartbeat removes an unresponsive transport and reconciles surviving rosters', () => {
    const { handler, member, roster } = serverHarness();
    const a = member('a');
    const b = member('b');
    let tick;
    let terminated = false;
    a.isWsAlive = true;
    a.ws = { readyState: 1, ping() {} };
    b.isWsAlive = true;
    b.ws = { readyState: 1, ping() {}, terminate() { terminated = true; } };
    b.onClose = () => handler.removeSocket(b);
    loadServer('socket/setup.ts', {
        ws: { OPEN: 1, WebSocketServer: class { on() {} } },
        './SocketController': handler, './core/socket': {},
        '../monitoring/instrumentation': {},
    }, { setInterval(cb, ms) { assert.equal(ms, 30000); tick = cb; }, clearInterval() {} });
    tick();
    assert.equal(handler.sockets.has('b'), true);
    a.isWsAlive = true; // only a answers the transport ping
    tick();
    assert.equal(terminated, true);
    assert.equal(handler.sockets.has('b'), false);
    assert.deepEqual(roster(a).map((m) => m.id), ['a']);
});

test('camera position does not mark dead members alive; malformed mass cannot poison totals', () => {
    const { utils, member } = serverHarness();
    const a = member('a');
    a.isAlive = false;
    utils.updateMinimap({ x: 10, y: 20 }, a);
    assert.equal(a.isAlive, false);
    for (const invalid of [NaN, Infinity, -1, 10_000_000_000]) utils.updateScore(invalid, a);
    assert.equal(a.score, 7000);
    utils.updatePartyMember({ ping: null }, a);
    assert.equal(a.ping, null);
});

function clientHarness() {
    const source = fs.readFileSync(path.join(__dirname, '../client/src/features.js'), 'utf8');
    const events = new Map();
    const intervals = [];
    const sent = [];
    const minimap = { players: new Map(), clear() { this.players.clear(); }, updatePlayer({ sid }) { this.players.delete(String(sid)); } };
    const app = {
        backend: { on(type, cb) { events.set(type, cb); return () => {}; }, send(type, content) { sent.push({ type, content }); return app.sendOK; } },
        sendOK: true, features: new Map([['minimap', minimap]]),
        settings: { settings: { tag: 'ABC', showPartyPanel: true } },
        state: { backend: { sid: 'self', latency: 20 }, nickname: 'Self' },
        host: { adapter: null, on() { return () => {}; } },
    };
    const resources = {
        add() {}, listen() {}, children: new Map(),
        child(name) {
            const scope = { disposed: false, interval(cb) { intervals.push(cb); }, dispose() { this.disposed = true; } };
            this.children.set(name, scope); return scope;
        },
    };
    const Party = vm.runInNewContext(
        source.slice(source.indexOf('class PartyController'), source.indexOf('class MinimapController')) + '\nPartyController;',
        {
            FeatureController: class { constructor(app) { this.app = app; this.resources = resources; } },
            isObject: (v) => v !== null && typeof v === 'object',
            document: { body: { style: {} }, querySelector: () => null }, SELECTORS: { nickname: '#nick' },
            TIMING: { positionPublish: 100, scorePublish: 1000 },
            requestAnimationFrame: () => 1, cancelAnimationFrame() {},
        },
    );
    const party = new Party(app, 'party');
    party.requestRender = () => {};
    party.bindIdentityInputs = () => {};
    party.ensurePanel = () => {};
    party.resolveLocalSkin = () => null;
    party.resolveLocalColor = () => null;
    party.isLocalPlaying = () => false;
    // Use the actual minimap method to ensure positions cannot override party status.
    const start = source.indexOf('    updatePlayer(data) {', source.indexOf('class MinimapController'));
    const end = source.indexOf('    scheduleDraw()', start);
    const updatePlayer = vm.runInNewContext(`({ ${source.slice(start, end)} }).updatePlayer`, { isObject: (v) => v !== null && typeof v === 'object' });
    return { app, party, events, sent, minimap, intervals, updatePlayer };
}

test('hiding/reopening the panel retains membership and processes departures while hidden', () => {
    const { app, party } = clientHarness();
    party.renderMembers([{ id: 'a', nick: 'A', score: 7000, isAlive: true }]);
    app.settings.settings.showPartyPanel = false;
    party.closePanel();
    assert.equal(party.members.size, 1);
    party.join({ id: 'b', nick: 'B' });
    party.leave('a');
    assert.deepEqual([...party.members.keys()], ['b']);
    app.settings.settings.showPartyPanel = true;
    assert.deepEqual(Array.from(party.getCombinedMembers(), (m) => m.id), ['b']);
});

test('authoritative roster removes missed departures and their minimap markers', () => {
    const { party, minimap } = clientHarness();
    party.renderMembers([{ id: 'a', nick: 'A' }, { id: 'b', nick: 'B' }]);
    minimap.players.set('b', { x: 1, y: 2 });
    party.renderMembers([{ id: 'a', nick: 'A' }]);
    assert.equal(party.members.has('b'), false);
    assert.equal(minimap.players.has('b'), false);
    party.renderMembers([]);
    assert.equal(party.members.size, 0);
});

test('backend close clears stale members; reconnect republishes unchanged score and status', async () => {
    const { party, events, sent, minimap } = clientHarness();
    await party.mount();
    party.renderMembers([{ id: 'old', nick: 'Old', score: 7000 }]);
    minimap.players.set('old', {});
    party.lastScore = 0;
    party.lastStatusKey = '||false|20';
    party.sentPositionNull = true;
    events.get('close')();
    assert.equal(party.members.size, 0);
    assert.equal(minimap.players.size, 0);
    events.get('open')();
    assert.ok(sent.some((m) => m.type === 'update-tag' && m.content === 'ABC'));
    assert.ok(sent.some((m) => m.type === 'score' && m.content === 0));
    assert.ok(sent.some((m) => m.type === 'position' && m.content.x === null));
    assert.ok(sent.some((m) => m.type === 'party-member-update'));
});

test('failed sends are retried and dead players publish zero mass and no camera position', () => {
    const { app, party, sent } = clientHarness();
    app.host.adapter = { snapshot: () => ({ score: 7000, position: { x: 10, y: 20 }, latency: 20 }) };
    app.sendOK = false;
    party.publishScore(); party.publishPosition(); party.publishMemberStatus();
    assert.equal(party.lastScore, null);
    assert.equal(party.lastStatusKey, null);
    assert.equal(party.sentPositionNull, false);
    app.sendOK = true;
    sent.length = 0;
    party.publishScore(); party.publishPosition(); party.publishMemberStatus();
    assert.equal(sent.find((m) => m.type === 'score').content, 0);
    assert.equal(sent.find((m) => m.type === 'position').content.x, null);
    assert.equal(sent.find((m) => m.type === 'party-member-update').content.isAlive, false);
});

test('minimap camera coordinates cannot resurrect a dead party member', () => {
    const { party, updatePlayer } = clientHarness();
    party.join({ id: 'a', isAlive: false });
    updatePlayer.call({ players: new Map(), scheduleDraw() {} }, { sid: 'a', x: 10, y: 20 });
    assert.equal(party.members.get('a').isAlive, false);
});

test('leaving one of several same-name tabs removes exactly that tab and its mass', () => {
    const { party } = clientHarness();
    party.renderMembers([
        { id: 'a', nick: 'Same', score: 7000, isAlive: true },
        { id: 'b', nick: 'Same', score: 3000, isAlive: true },
    ]);
    assert.equal(party.getCombinedMembers()[0].score, 10000);
    party.leave('a');
    assert.equal(party.getCombinedMembers()[0].score, 3000);
    party.leave('b');
    assert.equal(party.getCombinedMembers().length, 0);
});
