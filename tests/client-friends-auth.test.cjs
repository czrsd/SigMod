const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { JSDOM } = require('../admin/node_modules/jsdom');

function harness(
    fetcher = async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ success: true, user: { _id: 'account' }, settings: {} }),
    })
) {
    const dom = new JSDOM('<body></body>', { url: 'https://one.sigmally.com/' });
    const values = new Map();
    const storage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
    };
    const intervals = [];
    const disposers = [];
    const resources = {
        add(fn) {
            disposers.push(fn);
            return fn;
        },
        listen(target, type, fn) {
            target.addEventListener(type, fn);
            const remove = () => target.removeEventListener(type, fn);
            disposers.push(remove);
            return remove;
        },
        timeout(fn) {
            fn();
        },
    };
    dom.window.setInterval = (fn) => {
        intervals.push(fn);
        return intervals.length;
    };
    dom.window.clearInterval = () => {};
    let reloads = 0;
    const scope = resources;
    const modal = {
        modals: new Map(),
        open(name, body) {
            dom.window.document.body.replaceChildren(body);
            this.modals.set(name, { scope });
        },
        close() {},
        alert() {},
    };
    const app = {
        state: { backend: { sid: 'one', authNonce: 'nonce' }, friends: {} },
        settingsStore: { set() {} },
        logger: { warnOnce() {} },
        features: { get: (name) => (name === 'modal' ? modal : null) },
        resources,
    };
    const context = vm.createContext({
        window: dom.window,
        document: dom.window.document,
        localStorage: storage,
        Headers,
        URL,
        fetch: fetcher,
        ENDPOINTS: { app: 'https://mod.czrsd.com/api/v5', discordAuth: 'https://mod.czrsd.com/api/v5/discord/login' },
        HTMLElement: dom.window.HTMLElement,
        Element: dom.window.Element,
        HTMLInputElement: dom.window.HTMLInputElement,
        location: {
            reload() {
                reloads++;
            },
        },
        icon: () => '',
        safeHttpUrl: (value) => value,
        isObject: (value) => value && typeof value === 'object' && !Array.isArray(value),
        FeatureController: class {
            constructor(app) {
                this.app = app;
                this.resources = resources;
            }
            message(value) {
                return value;
            }
            destroy() {}
        },
    });
    const core = fs.readFileSync(require.resolve('../client/src/core.js'), 'utf8');
    const social = fs.readFileSync(require.resolve('../client/src/social.js'), 'utf8');
    vm.runInContext(
        core.slice(core.indexOf('class Emitter {'), core.indexOf('class Localization {')) +
            core.slice(core.indexOf('const createElement ='), core.indexOf('const createColorPickerReset =')) +
            social.slice(0, social.indexOf('class FriendPresenceTracker {')) +
            '\nglobalThis.ProfileController = ProfileController;',
        context
    );
    app.backend = new (vm.runInContext('Emitter', context))();
    const profile = new context.ProfileController(app, 'profile');
    return {
        app,
        profile,
        storage,
        dom,
        intervals,
        get reloads() {
            return reloads;
        },
        close() {
            for (const fn of disposers) fn?.();
            dom.window.close();
        },
    };
}

test('successful logout clears bearer and refresh credentials before reload', async (t) => {
    const h = harness();
    t.after(() => h.close());
    h.profile.storeTokens({ accessToken: 'access', refreshToken: 'refresh' });
    h.profile.applyAccount({ _id: 'account' });
    await h.profile.mount();
    await h.profile.logout();
    assert.equal(h.storage.getItem('mod_accessToken'), null);
    assert.equal(h.storage.getItem('mod_refreshToken'), null);
    assert.equal(h.profile.profile, null);
    assert.equal(h.reloads, 1);
});

test('late refresh and auth responses cannot restore a logged-out account', async (t) => {
    let finish;
    const h = harness(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            })
    );
    t.after(() => h.close());
    h.profile.storeTokens({ accessToken: 'access', refreshToken: 'refresh' });
    const pending = h.profile.authenticate('one');
    h.profile.clearTokens();
    h.profile.clearAccount();
    finish({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-new-access-token': 'late-access' }),
        json: async () => ({ success: true, user: { _id: 'old-account' } }),
    });
    await pending;
    assert.equal(h.profile.profile, null);
    assert.equal(h.storage.getItem('mod_accessToken'), null);
});

test('an account change during authentication queues authentication for the new credentials', async (t) => {
    const requests = [];
    const h = harness((_url, options) => new Promise((resolve) => requests.push({ options, resolve })));
    t.after(() => h.close());
    h.profile.storeTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const first = h.profile.authenticate('one');
    h.profile.storeTokens({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    h.profile.authenticate('one');
    requests[0].resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ success: true, user: { _id: 'old-account' } }),
    });
    for (let i = 0; i < 10 && requests.length < 2; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests.length, 2);
    assert.equal(requests[1].options.headers.get('Authorization'), 'Bearer new-access');
    requests[1].resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ success: true, user: { _id: 'new-account' } }),
    });
    await first;
    assert.equal(h.profile.profile._id, 'new-account');
});

test('expired sessions clear client account state, while unavailable services retain credentials', async (t) => {
    for (const status of [401, 503]) {
        const h = harness(async () => ({ ok: false, status, headers: new Headers(), json: async () => ({ message: 'unavailable' }) }));
        t.after(() => h.close());
        h.profile.storeTokens({ accessToken: 'access', refreshToken: 'refresh' });
        h.profile.applyAccount({ _id: 'account' });
        await assert.rejects(h.profile.request('/me/friends'));
        assert.equal(h.storage.getItem('mod_refreshToken'), status === 401 ? null : 'refresh');
        assert.equal(h.profile.profile?._id ?? null, status === 401 ? null : 'account');
    }
});

test('Discord popup accepts credentials only from the API origin and the opened window', async (t) => {
    const h = harness();
    t.after(() => h.close());
    await h.profile.mount();
    const popup = { closed: false };
    h.dom.window.open = () => popup;
    h.profile.openAccountDialog(true);
    h.dom.window.document.querySelector('#discord_login').click();
    const send = (origin, source) =>
        h.dom.window.dispatchEvent(
            new h.dom.window.MessageEvent('message', {
                origin,
                source,
                data: { type: 'SIGMOD_AUTH_SUCCESS', payload: { accessToken: 'access', refreshToken: 'refresh' } },
            })
        );
    send('https://attacker.example', popup);
    send('https://mod.czrsd.com', {});
    assert.equal(h.storage.getItem('mod_refreshToken'), null);
    send('https://mod.czrsd.com', popup);
    assert.equal(h.storage.getItem('mod_refreshToken'), 'refresh');
});

test('a logout notification removes local credentials without another HTTP request', async (t) => {
    const h = harness();
    t.after(() => h.close());
    await h.profile.mount();
    h.profile.storeTokens({ accessToken: 'access', refreshToken: 'refresh' });
    h.profile.applyAccount({ _id: 'account' });
    h.app.backend.emit('account-logged-out');
    assert.equal(h.storage.getItem('mod_refreshToken'), null);
    assert.equal(h.profile.profile, null);
});
