const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const constants = fs.readFileSync(require.resolve('../client/src/constants_and_utils.js'), 'utf8');
const core = fs.readFileSync(require.resolve('../client/src/core.js'), 'utf8');
const legacyKey = 'SigModClient-settings';
const prefix = `${legacyKey}-backup-v1-`;

function harness(entries = {}) {
    const values = new Map(Object.entries(entries));
    const storage = {
        get length() { return values.size; },
        key: (index) => [...values.keys()][index] ?? null,
        getItem: (key) => values.get(key) ?? null,
        removeItem: (key) => values.delete(key),
        setItem(key, value) {
            if (storage.fail?.(key)) throw new Error('Storage unavailable');
            values.set(key, String(value));
        },
    };
    const context = vm.createContext({ window: { setTimeout }, clearTimeout, TextEncoder, TextDecoder, localStorage: storage });
    vm.runInContext(constants + '\n' + core.slice(core.indexOf('const debounce ='), core.indexOf('const isTyping =')) + '\n' +
        core.slice(core.indexOf('class SettingsStore {'), core.indexOf('class DomReadiness {')) +
        '\nglobalThis.createStore = (storage) => new SettingsStore(storage, STORAGE.settings, DEFAULT_SETTINGS, {warn() {}, error() {}});' +
        '\nglobalThis.defaults = () => clone(DEFAULT_SETTINGS);', context);
    const store = () => context.createStore(storage);
    const legacy = () => {
        const value = context.defaults();
        value.storageVersion = 1;
        value.macros.mouse = { left: 'fastfeed', right: 'split2' };
        value.macros.keys.saveImage = 'i';
        value.settings.analytics = 'off';
        delete value.analytics;
        return value;
    };
    return { storage, context, store, legacy, read: (key = 'sigmod') => JSON.parse(storage.getItem(key)) };
}

test('production import preserves the original and merges preferences with v11 defaults once', () => {
    const h = harness();
    const old = h.legacy();
    old.macros.keys.respawn = null;
    old.game.name.color = '#123456';
    old.themes.custom = [{ name: 'Mine', background: '#111111', text: '#ffffff' }];
    const raw = JSON.stringify(old);
    h.storage.setItem(legacyKey, raw);
    const settings = h.store().load();
    assert.equal(h.storage.getItem(legacyKey), raw);
    assert.equal(settings.macros.keys.respawn, null);
    assert.equal(settings.game.name.color, '#123456');
    assert.equal(settings.themes.custom[0].name, 'Mine');
    assert.equal(settings.analytics, 'off');
    assert.equal(settings.macros.mouse.bindings[1].action, 'split2');
    assert.equal(settings.storageVersion, 3);
    h.storage.setItem(legacyKey, JSON.stringify(h.legacy()));
    assert.equal(h.store().load().game.name.color, '#123456');
});

test('old v11 data is moved before the shared entry is converted for production', () => {
    const h = harness();
    const old = h.context.defaults();
    old.macros.mouse.bindings = [{ button: 0, action: 'fastfeed' }, { button: 2, action: 'split3' }, { button: 4, action: 'ping' }];
    h.storage.setItem(legacyKey, JSON.stringify(old));
    h.store().load();
    assert.equal(h.read().macros.mouse.bindings.length, 3);
    assert.equal(h.read(legacyKey).storageVersion, 1);
    assert.equal(h.read(legacyKey).macros.mouse.right, 'split3');
    assert.equal(h.read(legacyKey).macros.keys.saveImage, null);
    const restored = h.storage.getItem(legacyKey);
    h.store().load();
    assert.equal(h.storage.getItem(legacyKey), restored);
});

test('the newest valid production backup is restored while current v11 settings win', () => {
    const h = harness();
    const old = JSON.stringify(h.legacy());
    h.storage.setItem(`${prefix}100`, old);
    h.storage.setItem(`${prefix}200`, 'broken');
    h.storage.setItem(legacyKey, JSON.stringify(h.context.defaults()));
    const current = h.context.defaults();
    current.game.font = 'Custom';
    h.storage.setItem('sigmod', JSON.stringify(current));
    assert.equal(h.store().load().game.font, 'Custom');
    assert.equal(h.storage.getItem(legacyKey), old);
});

test('failed saves or backups never rewrite the shared entry and repair can retry', () => {
    const h = harness({ [legacyKey]: '{}' });
    const old = JSON.stringify(h.context.defaults());
    h.storage.setItem(legacyKey, old);
    h.storage.fail = (key) => key === 'sigmod';
    h.store().load();
    assert.equal(h.storage.getItem(legacyKey), old);
    assert.equal(h.storage.getItem('sigmod'), null);
    h.storage.fail = (key) => key.includes('before-storage-migration');
    h.store().load();
    assert.equal(h.storage.getItem(legacyKey), old);
    assert.equal(h.read().storageVersion, 3);
    h.storage.fail = null;
    h.store().load();
    assert.equal(h.read(legacyKey).storageVersion, 1);
});

test('future settings survive settings changes, resets, and shutdown', () => {
    for (const key of ['sigmod', legacyKey]) {
        const future = JSON.stringify({ storageVersion: 99, future: true });
        const h = harness({ [key]: future });
        const store = h.store();
        store.load();
        store.set('game.font', 'Changed', true);
        store.reset();
        store.destroy();
        assert.equal(h.storage.getItem(key), future);
    }
});

test('malformed values are backed up without breaking startup', () => {
    for (const raw of ['null', '[]', '{broken']) {
        const h = harness({ sigmod: raw });
        assert.equal(h.store().load().storageVersion, 3);
        assert.equal(h.storage.getItem('sigmod'), JSON.stringify(h.context.defaults()));
        assert.ok([...Array(h.storage.length)].some((_, i) => h.storage.getItem(h.storage.key(i)) === raw));
    }
});

for (const version of ['2.8.10', '2.8.11-BETA']) {
    test(`SigFixes ${version} accessors persist key changes and unbinding in sigmod`, () => {
        const h = harness();
        const store = h.store();
        const value = store.load();
        h.context.window.sigmod = { settings: value };
        h.context.window.sigfix = { sigmod: { settings: {} } };
        const source = fs.readFileSync(require.resolve(`../references/sigfixes-v${version}.js`), 'utf8');
        vm.runInContext(`(() => { const real = window.sigmod; const sigmod = window.sigfix.sigmod; ${source.slice(source.indexOf('const getset ='), source.indexOf('// create a fake sigmally proxy'))} })();`, h.context);
        store.set('macros.keys.splits.double', 'q', true);
        assert.equal(h.context.window.sigfix.sigmod.settings.doubleKey, 'q');
        assert.equal(h.read().macros.keys.splits.double, 'q');
        store.set('macros.keys.splits.double', null, true);
        assert.equal(h.read().macros.keys.splits.double, null);
        assert.equal(h.context.window.sigfix.sigmod.settings.doubleKey, undefined);
        assert.equal(h.store().load().macros.keys.splits.double, null);
        assert.equal(h.storage.getItem(legacyKey), null);
    });
}
