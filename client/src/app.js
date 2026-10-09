class SigModApp {
    constructor() {
        this.logger = new Logger();
        this.resources = new Disposables('app', this.logger);
        this.matchHistory = new MatchHistoryStore(this.logger);
        this.resources.add(() => this.matchHistory.close());
        this.settingsStore = new SettingsStore(localStorage, STORAGE.settings, DEFAULT_SETTINGS, this.logger);
        this.resources.add(() => this.settingsStore.destroy());
        this.settings = this.settingsStore.load();
        this.state = new RuntimeState(this.settings);
        this.readiness = new DomReadiness(this.resources.child('readiness'));
        this.host = new HostResolver(this.resources.child('host'), this.logger);
        this.backend = new BackendClient(this);
        this.dependencies = new OptionalDependencyLoader(this.resources.child('dependencies'), this.logger);
        this.features = new Map();
        this.i18n = new Localization(this);
        this.starting = false;
        this.started = false;
        this.destroyed = false;
        this.installNativeChatVisibility();
        this.installAdBlockingStyles();
        this.adProtection = adTrackerProtector;
        this.adProtection.bindApp(this);
        this.resources.listen(document, 'sigmod:settingchange', (event) => {
            if (event.detail?.path === 'chat.enabled') void this.syncChatFeature(Boolean(event.detail.value));
        });
    }
    installNativeChatVisibility() {
        const style = createElement('style', {
            attributes: {
                'data-sigmod-native-chat-visibility': BUILD.release,
            },
        });
        style.textContent = `${SELECTORS.chatBlock} { display: none !important; visibility: hidden !important; pointer-events: none !important; }`;
        (document.head || document.documentElement).append(style);
        this.resources.add(() => style.remove());
    }
    installAdBlockingStyles() {
        const style = createElement('style', {
            attributes: {
                'data-sigmod-ad-blocker': BUILD.release,
            },
        });
        style.textContent = `${SELECTORS.adContainers} { display: none !important; visibility: hidden !important; pointer-events: none !important; width: 0 !important; height: 0 !important; }`;
        (document.head || document.documentElement).append(style);
        this.resources.add(() => style.remove());
    }
    async start() {
        if (this.starting || this.started || this.destroyed) return;
        this.starting = true;
        if (document.body?.firstElementChild?.id === 'cf-wrapper') {
            this.logger.warn('Cloudflare rate-limit page detected; SigMod was not initialized.');
            this.starting = false;
            return;
        }
        if (await this.handleDiscordLoginCallback()) {
            this.starting = false;
            return;
        }
        if (window.sigmod && typeof window.sigmod.version === 'number' && window.sigmod.version < 11) {
            this.logger.warn(
                `Legacy SigMod v${window.sigmod.version} is active on the page. Aborting initialization to prevent duplicate execution.`
            );
            this.starting = false;
            return;
        }

        try {
            this.exportCompatibility();
            this.createFeatureSkeleton();
            this.i18n.initialize();
            const authReady = this.mount('auth').catch((err) => this.logger.error('Auth mount failed', err));
            this.host.start();
            await authReady;
            this.dom = await this.readiness.pageShell();
            for (const phase of FEATURE_PHASES) {
                for (const [name] of phase) {
                    try {
                        await this.mount(name);
                    } catch (mountErr) {
                        this.logger.error(`Phase mount error for ${name}`, mountErr);
                    }
                }
            }
            this.backend.connect();
            this.starting = false;
            this.started = true;
            this.logConsoleInfo();
        } catch (error) {
            this.logger.error('Initialization failed', error);
            this.starting = false;
        }
    }
    logConsoleInfo() {
        const adapter = this.host.adapter;
        const featureStatus = Object.fromEntries(
            [...this.features.entries()].map(([name, feature]) => [name, feature.mounted ? 'mounted' : 'unavailable'])
        );
        const title = `SigMod v${BUILD.release} initialized`;
        const styles = [
            'color:#fff',
            'background:#8a25e5',
            'font-size:13px',
            'font-weight:700',
            'padding:3px 8px',
            'border-radius:4px',
        ].join(';');
        if (typeof console.groupCollapsed === 'function') console.groupCollapsed(`%c${title}`, styles);
        else console.log(`%c${title}`, styles);
        console.info('Runtime', {
            release: BUILD.release,
            serverVersion: BUILD.serverVersion,
            host: adapter?.kind || 'not detected',
            sigFixes: Boolean(window.sigfix),
        });
        console.info('Debug access', {
            app: 'window.__sigmodApp',
            facade: 'window.sigmod',
            settings: 'window.sigmod.settings',
            sigFixes: 'window.sigfix',
        });
        console.info('Mounted features', featureStatus);
        console.info('Tip: use window.__sigmodApp.resources.snapshot() to inspect active resources.');
        if (typeof console.groupEnd === 'function') console.groupEnd();
    }
    async handleDiscordLoginCallback() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('discord_login') !== 'success') return false;

        const overlay = createElement('div', {
            className: 'sigmod-discord-login-overlay',
        });
        const status = createElement('span', { text: 'Login complete.' });
        overlay.append(status);
        document.body.append(overlay);
        this.resources.add(() => overlay.remove());

        this.settingsStore.set('modAccount.authorized', true, true);
        setTimeout(() => window.close(), 1000);
        return true;
    }
    currentPlayerScore() {
        const snapshotScore = Number(this.host.adapter?.snapshot().score);
        if (Number.isFinite(snapshotScore)) return Math.max(0, snapshotScore);
        return Math.max(0, Number(this.state.player.score) || 0);
    }
    sendChat(message) {
        const text = String(message);
        if (text === '/leaveworld' && this.currentPlayerScore() >= 5_500) return false;
        return this.host.adapter?.sendChat(text) ?? false;
    }
    createFeatureSkeleton() {
        for (const phase of FEATURE_PHASES) {
            for (const [name, Type] of phase) {
                if (name === 'chat' && this.settings.chat.enabled === false) continue;
                try {
                    this.features.set(name, new Type(this, name));
                } catch (error) {
                    this.logger.error(`Feature ${name} failed to instantiate`, error);
                }
            }
        }
    }
    exportCompatibility() {
        const previous = {
            sigmod: window.sigmod,
            gameSettings: window.gameSettings,
            sendPlay: window.sendPlay,
            sendChat: window.sendChat,
            sendMouseMove: window.sendMouseMove,
            sigModWsHandler: window.sigModWsHandler,
        };
        const app = this;
        this.inputOwnership ??= new InputOwnership(this);
        const getKeyBinding = (path) => {
            if (typeof path !== 'string' || !/^[a-zA-Z]+(?:\.[a-zA-Z]+)*$/.test(path)) return null;
            const value = app.settingsStore.get(`macros.keys.${path}`);
            return typeof value === 'string' ? value : null;
        };
        const sigmodFacade = {
            version: BUILD.version,
            release: BUILD.release,
            server_version: BUILD.serverVersion,
            storageName: STORAGE.settings,
            settings: this.settings,
            integration: Object.freeze({
                version: 1,
                getHostKind: () => app.host.adapter?.kind ?? null,
                getKeyBinding,
                matchesKeyBinding: (event, path) => keybindMatchesEvent(event, getKeyBinding(path)),
                getMouseAction: (button) => app.settings.macros.mouse.bindings.find((binding) => binding.button === button)?.action ?? null,
                getGameSettings: () => clone(app.settings.game),
                claimInputs: (inputs) => app.inputOwnership.claim(inputs),
                onSettingsChange: (listener) => app.settingsStore.onChange(listener),
                onHostChange: (listener) =>
                    typeof listener === 'function' ? app.host.on('change', (adapter) => listener(adapter.kind)) : () => {},
            }),
            debug: {
                resources: () => app.resources.snapshot(),
                destroy: () => app.destroy(),
            },
            privacy: {
                getStatus: () => app.adProtection?.getStatus() ?? { enabled: false },
                getStats: () => app.adProtection?.stats ?? { totalBlocked: 0 },
            },
        };
        Object.defineProperties(sigmodFacade, {
            ws: {
                enumerable: true,
                get: () => app.backend.socket,
            },
            friends_settings: {
                enumerable: true,
                get: () => app.state.friends.settings,
                set: (value) => {
                    app.state.friends.settings = isObject(value) ? value : {};
                },
            },
            friend_names: {
                enumerable: true,
                get: () => app.state.friends.names,
                set: (value) => {
                    app.state.friends.names = value instanceof Set ? value : new Set();
                },
            },
        });
        const gameSettingsFacade = {};
        Object.defineProperties(gameSettingsFacade, {
            ws: {
                enumerable: true,
                get: () => (app.host.adapter?.kind === 'native' ? (app.host.adapter.socket ?? app.state.legacyGameSocket ?? null) : null),
                set: (value) => {
                    app.state.legacyGameSocket = value;
                },
            },
            user: {
                enumerable: true,
                get: () => app.state.user,
                set: (value) => {
                    app.state.user = value;
                },
            },
            isPlaying: {
                enumerable: true,
                get: () => Boolean(app.host.adapter?.snapshot().playing || app.state.player.alive),
                set: (value) => {
                    app.state.player.alive = Boolean(value);
                },
            },
        });
        window.sigmod = sigmodFacade;
        window.gameSettings = gameSettingsFacade;
        const sendPlay = (data) => {
            try {
                const payload = typeof data === 'string' ? JSON.parse(data) : data;
                return isObject(payload) && (app.host.adapter?.sendPlay(payload) ?? false);
            } catch (error) {
                app.logger.warnOnce('compat-send-play', 'Ignoring invalid play data', error);
                return false;
            }
        };
        const sendChat = (message) => app.sendChat(message);
        const sendMouseMove = (x, y) => app.host.adapter?.sendMove(x, y) ?? false;
        let compatStatsGeneration = 0;
        const stopCompatStatsPing = () => {
            for (const [name, child] of app.resources.children) {
                if (name.startsWith('compat-stats-ping-')) child.dispose();
            }
        };
        const sigModWsHandler = {
            get handshake() {
                return app.host.adapter?.isReady() ?? false;
            },
            get C() {
                return app.host.adapter?.protocol?.opcodes?.outgoing ?? new Uint8Array(256);
            },
            get R() {
                return app.host.adapter?.protocol?.opcodes?.incoming ?? new Uint8Array(256);
            },
            sendPacket: (packet) => app.host.adapter?.protocol?.send(packet) ?? false,
            sendStatsPing: () => app.host.adapter?.sendStatsPing?.() ?? false,
            startStatsPing: () => {
                stopCompatStatsPing();
                const scope = app.resources.child(`compat-stats-ping-${++compatStatsGeneration}`);
                scope.interval(() => app.host.adapter?.sendStatsPing?.(), TIMING.serverStatsPing);
            },
            stopStatsPing: stopCompatStatsPing,
            clearOwnCells: () => {
                const protocol = app.host.adapter?.protocol;
                const owned = protocol?.owned;
                if (!(owned instanceof Set)) return false;
                owned.clear();
                protocol.invalidateSnapshot?.();
                return true;
            },
        };
        window.sendPlay = sendPlay;
        window.sendChat = sendChat;
        window.sendMouseMove = sendMouseMove;
        window.sigModWsHandler = sigModWsHandler;
        this.resources.add(() => {
            if (window.sigmod === sigmodFacade) window.sigmod = previous.sigmod;
            if (window.gameSettings === gameSettingsFacade) window.gameSettings = previous.gameSettings;
            if (window.sendPlay === sendPlay) window.sendPlay = previous.sendPlay;
            if (window.sendChat === sendChat) window.sendChat = previous.sendChat;
            if (window.sendMouseMove === sendMouseMove) window.sendMouseMove = previous.sendMouseMove;
            if (window.sigModWsHandler === sigModWsHandler) window.sigModWsHandler = previous.sigModWsHandler;
        });
    }
    async mount(name) {
        const feature = this.features.get(name);
        if (!feature || feature.mounted) return;
        if (name === 'chat' && this.settings.chat.enabled === false) return;
        try {
            await feature.mount();
            feature.mounted = true;
        } catch (error) {
            this.logger.error(`${name} failed to mount`, error);
            feature.destroy();
        }
    }
    async syncChatFeature(enabled) {
        const feature = this.features.get('chat');
        if (enabled) {
            if (!feature) this.features.set('chat', new ChatController(this, 'chat'));
            if (!this.features.get('chat').mounted) await this.mount('chat');
            return;
        }
        if (!feature) return;
        if (feature.mounted) feature.destroy();
        this.features.delete('chat');
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const feature of [...this.features.values()].reverse()) feature.destroy();
        this.features.clear();
        this.backend.destroy();
        this.host.destroy();
        this.resources.dispose();
        this.starting = false;
        this.started = false;
    }
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Standalone host integrations and final entry point                                ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const warmUpStartPageMouse = (resources) => {
    const scope = resources.child('start-page-mouse');
    const end = performance.now() + 200;
    const dispatch = () => {
        const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
        const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
        document.dispatchEvent(
            new MouseEvent('mousemove', {
                clientX: Math.floor(Math.random() * width),
                clientY: Math.floor(Math.random() * height),
                bubbles: true,
                cancelable: true,
            })
        );
    };
    const tick = () => {
        dispatch();
        if (!scope.disposed && performance.now() < end) scope.frame(tick);
        else scope.dispose();
    };
    tick();
};

let zigAdDismissed = false;
let zigAdClosedForSession = false;
let zigAdEnabled = DEFAULT_SETTINGS.themes.showZigPopup;
let zigAdMenuWasVisible = false;
let zigAdSyncFrame = 0;
let zigAdDomObserver = null;
let zigAdHostObserver = null;
let zigAdObservedHosts = [];
let zigAdObservedMutationRoot = null;
let zigAdClickHandler = null;
let zigAdEscapeHandler = null;
let zigAdLifecycleResources = null;
let zigAdGlobalCheckTimer = 0;

// Zig exposes this marker on the page window when its userscript is active.
const hasZigGlobal = () => typeof window !== 'undefined' && Boolean(window.__ZIG_COMBINED_USERSCRIPT__ || window.zig);

const removeZigAd = () => {
    const ad = document.querySelector('.zig-ad');
    if (!(ad instanceof HTMLElement)) return;
    setZigAdHidden(ad, true);
    ad.remove();
};

const stopZigAdMonitoring = () => {
    zigAdDomObserver?.disconnect();
    zigAdHostObserver?.disconnect();
    if (zigAdSyncFrame) cancelAnimationFrame(zigAdSyncFrame);
    if (zigAdGlobalCheckTimer) clearInterval(zigAdGlobalCheckTimer);
    if (zigAdClickHandler) document.removeEventListener('click', zigAdClickHandler, true);
    if (zigAdEscapeHandler) document.removeEventListener('keydown', zigAdEscapeHandler, true);
    zigAdDomObserver = null;
    zigAdHostObserver = null;
    zigAdObservedHosts = [];
    zigAdObservedMutationRoot = null;
    zigAdClickHandler = null;
    zigAdEscapeHandler = null;
    zigAdSyncFrame = 0;
    zigAdGlobalCheckTimer = 0;
};

const getZigAdHostElements = () => ({
    leftMenu: document.querySelector('#left-menu'),
    menuWrapper: document.querySelector('#menu-wrapper'),
});

const isZigAdHostVisible = () => {
    const { leftMenu, menuWrapper } = getZigAdHostElements();
    if (!(leftMenu instanceof HTMLElement)) return null;
    return (
        getComputedStyle(leftMenu).display !== 'none' &&
        (!(menuWrapper instanceof HTMLElement) || getComputedStyle(menuWrapper).display !== 'none')
    );
};

const setZigAdHidden = (ad, hidden) => {
    if (!(ad instanceof HTMLElement)) return;
    ad.classList.toggle('hidden', hidden);
    ad.hidden = hidden;
    ad.style.display = hidden ? 'none' : 'flex';
};

const dismissZigAd = () => {
    zigAdDismissed = true;
    const ad = document.querySelector('.zig-ad');
    if (!(ad instanceof HTMLElement)) return;
    setZigAdHidden(ad, true);
    ad.remove();
};

const bindZigAdHostObservers = () => {
    const hosts = Object.values(getZigAdHostElements()).filter((element) => element instanceof HTMLElement);
    if (hosts.length === zigAdObservedHosts.length && hosts.every((element, index) => element === zigAdObservedHosts[index])) return;
    zigAdHostObserver?.disconnect();
    zigAdObservedHosts = hosts;
    if (!hosts.length) return;
    zigAdHostObserver ??= new MutationObserver(() => scheduleZigAdSync());
    for (const host of hosts) {
        zigAdHostObserver.observe(host, {
            attributes: true,
            attributeFilter: ['class', 'hidden', 'style'],
        });
    }
};

const syncZigAd = () => {
    zigAdSyncFrame = 0;
    if (!zigAdEnabled) {
        removeZigAd();
        return;
    }
    if (hasZigGlobal()) {
        stopZigAdMonitoring();
        removeZigAd();
        return;
    }
    bindZigAdHostObservers();
    const hostVisible = isZigAdHostVisible();
    if (hostVisible === null) return;
    if (hostVisible && !zigAdMenuWasVisible && !zigAdClosedForSession) zigAdDismissed = false;
    zigAdMenuWasVisible = hostVisible;
    const ad = document.querySelector('.zig-ad');
    if (!hostVisible || zigAdDismissed) {
        setZigAdHidden(ad, true);
        return;
    }
    if (!ad) {
        insertZigAd();
        return;
    }
    setZigAdHidden(ad, false);
};

function scheduleZigAdSync() {
    if (zigAdSyncFrame) return;
    zigAdSyncFrame = requestAnimationFrame(syncZigAd);
}

const bindZigAdLifecycle = (resources = null) => {
    if (hasZigGlobal()) {
        stopZigAdMonitoring();
        removeZigAd();
        return;
    }
    if (resources && resources !== zigAdLifecycleResources) {
        zigAdLifecycleResources = resources;
        resources.add(() => {
            stopZigAdMonitoring();
            document.querySelector('.zig-ad')?.remove();
            zigAdLifecycleResources = null;
            zigAdDismissed = false;
            zigAdClosedForSession = false;
            zigAdMenuWasVisible = false;
        });
    }
    bindZigAdHostObservers();
    if (!zigAdDomObserver) {
        zigAdDomObserver = new MutationObserver(() => {
            bindZigAdHostObservers();
            const nextRoot = document.querySelector(SELECTORS.menuWrapper) ?? document.body;
            if (nextRoot instanceof HTMLElement && nextRoot !== zigAdObservedMutationRoot) {
                zigAdDomObserver.disconnect();
                zigAdObservedMutationRoot = nextRoot;
                zigAdDomObserver.observe(document.body, {
                    childList: true,
                });
                if (nextRoot !== document.body)
                    zigAdDomObserver.observe(nextRoot, {
                        childList: true,
                        subtree: true,
                    });
            }
            scheduleZigAdSync();
        });
        zigAdObservedMutationRoot = document.querySelector(SELECTORS.menuWrapper) ?? document.body;
        if (document.body instanceof HTMLElement)
            zigAdDomObserver.observe(document.body, {
                childList: true,
            });
        if (zigAdObservedMutationRoot instanceof HTMLElement && zigAdObservedMutationRoot !== document.body)
            zigAdDomObserver.observe(zigAdObservedMutationRoot, {
                childList: true,
                subtree: true,
            });
    }
    if (!zigAdClickHandler) {
        zigAdClickHandler = (event) => {
            const target = event.target;
            if (target instanceof Element && target.closest(SELECTORS.play)) dismissZigAd();
        };
        document.addEventListener('click', zigAdClickHandler, true);
    }
    if (!zigAdEscapeHandler) {
        zigAdEscapeHandler = (event) => {
            if (event.key === 'Escape') dismissZigAd();
        };
        document.addEventListener('keydown', zigAdEscapeHandler, true);
    }
    if (!zigAdGlobalCheckTimer) {
        zigAdGlobalCheckTimer = window.setInterval(() => {
            if (hasZigGlobal()) {
                stopZigAdMonitoring();
                removeZigAd();
            }
        }, 1000);
    }
};

const insertZigAd = (resources = null) => {
    bindZigAdLifecycle(resources);
    if (!zigAdEnabled || hasZigGlobal() || zigAdDismissed || document.querySelector('.zig-ad')) {
        if (hasZigGlobal()) removeZigAd();
        return;
    }

    const leftMenu = document.querySelector('#left-menu');
    const anchor = leftMenu?.closest('.menu-wrapper.top');

    if (!(anchor instanceof HTMLElement)) return;

    const card = document.createElement('div');
    card.className = 'zig-ad';
    card.setAttribute('data-sigmod-zig-ad', 'true');
    card.style.backgroundColor = 'rgb(21, 21, 21)';
    card.style.border = '0';

    card.innerHTML = `
            <a class="zig-ad-content" href="https://zig.sigmally.xyz" target="_blank" rel="noopener noreferrer">
                <img class="zig-ad-logo" src="https://czrsd.com/static/zig/zig.webp" alt="Zig" draggable="false">

                <div class="zig-ad-text">
                    <strong>See the whole map with Zig</strong>
                </div>
            </a>

            <button class="zig-ad-close" type="button" aria-label="Close Zig ad">
                ${icon('close', 18)}
            </button>
        `;
    const logo = card.querySelector('.zig-ad-logo');
    if (logo instanceof HTMLImageElement) logo.classList.add('sigmod-zig-ad-logo');

    const closeButton = card.querySelector('.zig-ad-close');
    if (closeButton instanceof HTMLElement) {
        closeButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            zigAdClosedForSession = true;
            dismissZigAd();
        });
    }

    anchor.appendChild(card);
    syncZigAd();
};

const previousApp = window.__sigmodApp;
if (previousApp && typeof previousApp.destroy === 'function') previousApp.destroy();
const app = new SigModApp();
window.__sigmodApp = app;
app.resources.add(() => {
    if (window.__sigmodApp === app) delete window.__sigmodApp;
});
warmUpStartPageMouse(app.resources);
app.start();
