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
        this.keybindUsage = new KeybindUsage(this);
        this.resources.add(() => this.keybindUsage.destroy());
        this.settingsUsage = new SettingsUsageSync(this);
        this.resources.add(() => this.settingsUsage.destroy());
        this.remoteContent = new RemoteContentController(this);
        this.resources.add(() => this.remoteContent.destroy());
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
        const sync = (enabled) => {
            style.textContent = enabled
                ? `${SELECTORS.adContainers} { display: none !important; visibility: hidden !important; pointer-events: none !important; width: 0 !important; height: 0 !important; }`
                : '';
        };
        sync(this.settings.themes.hideAds !== false);
        this.resources.listen(document, 'sigmod:settingchange', (event) => {
            if (event.detail?.path === 'themes.hideAds') sync(Boolean(event.detail.value));
        });
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
            this.host.start();
            this.exportCompatibility();
            this.createFeatureSkeleton();
            this.i18n.initialize();
            const authReady = this.mount('auth').catch((err) => this.logger.error('Auth mount failed', err));
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
            this.remoteContent.start();
            this.backend.connect();
            this.settingsUsage.start();
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
        const registerOtherExtension = (options) => {
            const menu = app.features.get('menu');
            if (menu) return menu.registerOtherExtension(options);
            app.__pendingExtensions ??= [];
            app.__pendingExtensions.push(options);
            return {
                id: String(options?.id || ''),
                open: () => app.features.get('menu')?.openOtherExtension(String(options?.id || '')),
                remove: () => app.features.get('menu')?.unregisterOtherExtension(String(options?.id || '')),
            };
        };
        const unregisterOtherExtension = (id) => app.features.get('menu')?.unregisterOtherExtension(id) ?? false;
        const sigmodFacade = {
            version: BUILD.version,
            release: BUILD.release,
            server_version: BUILD.serverVersion,
            storageName: STORAGE.settings,
            settings: this.settings,
            settingsStore: this.settingsStore,
            registerExtension: registerOtherExtension,
            unregisterExtension: unregisterOtherExtension,
            addNavbarButton: registerOtherExtension,
            extensions: {
                register: registerOtherExtension,
                unregister: unregisterOtherExtension,
                add: registerOtherExtension,
                remove: unregisterOtherExtension,
                get: (id) => app.features.get('menu')?.getOtherExtension(id) ?? null,
                getAll: () => app.features.get('menu')?.getAllOtherExtensions() ?? [],
                open: (id) => app.features.get('menu')?.openOtherExtension(id) ?? false,
                createPanelTemplate: (template, ext) => app.features.get('menu')?.createExtensionPanelFromTemplate(template, ext) ?? null,
            },
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
            utils: {
                rgbToHex,
                formatScore,
                formatNumber,
                formatDuration,
                formatTime,
                calculateLuminance,
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
        const queue = Array.isArray(window.sigmodExtensions) ? window.sigmodExtensions : [];
        window.sigmodExtensions = queue;
        for (const item of queue) {
            registerOtherExtension(item);
        }
        queue.push = (...items) => {
            for (const item of items) {
                registerOtherExtension(item);
            }
            return queue.length;
        };
        window.sigmodRegisterExtension = registerOtherExtension;
        const handleRegisterEvent = (event) => {
            if (event?.detail) registerOtherExtension(event.detail);
        };
        window.addEventListener('sigmod:register-extension', handleRegisterEvent);
        document.addEventListener('sigmod:register-extension', handleRegisterEvent);
        window.dispatchEvent(new CustomEvent('sigmod:ready', { detail: sigmodFacade }));
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
            window.removeEventListener('sigmod:register-extension', handleRegisterEvent);
            document.removeEventListener('sigmod:register-extension', handleRegisterEvent);
            if (window.sigmodRegisterExtension === registerOtherExtension) delete window.sigmodRegisterExtension;
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

const previousApp = window.__sigmodApp;
if (previousApp && typeof previousApp.destroy === 'function') previousApp.destroy();
const app = new SigModApp();
window.__sigmodApp = app;
app.resources.add(() => {
    if (window.__sigmodApp === app) delete window.__sigmodApp;
});
warmUpStartPageMouse(app.resources);
app.start();
