class OptionalDependencyLoader {
    constructor(resources, logger) {
        this.resources = resources;
        this.logger = logger;
        this.promises = new Map();
    }
    load(name) {
        if (this.promises.has(name)) return this.promises.get(name);
        const definition = LIBRARIES[name];
        if (!definition) return Promise.reject(new Error(`Unknown library: ${name}`));
        const promise = this.loadDefinition(definition).catch((error) => {
            this.promises.delete(name);
            throw error;
        });
        this.promises.set(name, promise);
        return promise;
    }
    async loadDefinition(definition) {
        if (window[definition.global]) return window[definition.global];
        if (definition.style) this.addStyle(definition.style);
        await this.addScript(definition.script);
        if (!window[definition.global]) throw new Error(`${definition.global} did not initialize`);
        return window[definition.global];
    }
    addScript(source) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const script = createElement('script', {
                attributes: { src: source },
            });
            script.addEventListener(
                'load',
                () => {
                    settled = true;
                    resolve();
                },
                { once: true }
            );
            script.addEventListener(
                'error',
                () => {
                    settled = true;
                    reject(new Error(`Unable to load ${source}`));
                },
                { once: true }
            );
            document.head.append(script);
            this.resources.add(() => {
                script.remove();
                if (!settled) reject(new Error(`Loading ${source} was cancelled`));
            });
        });
    }
    addStyle(source) {
        const link = createElement('link', {
            attributes: { rel: 'stylesheet', href: source },
        });
        document.head.append(link);
        this.resources.add(() => link.remove());
    }
}
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Shared interface infrastructure                                                   ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
class StyleController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.element = null;
    }
    async mount() {
        if (this.element) return;
        const chatLayout = createElement('style', {
            attributes: { 'data-sigmod-chat-layout': BUILD.release },
        });
        chatLayout.textContent = `
                .modChat .message { display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: end; column-gap: 6px; min-width: 0; max-width: 100%; }
                .modChat .sigmod-chat-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 3px; min-width: 0; }
                .modChat .sigmod-chat-author { display: inline-flex; flex: 0 1 auto; min-width: 0; max-width: min(42%, 18ch); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
                .modChat .message_name, .modChat .chatMessage-text { overflow-wrap: anywhere; word-break: break-word; }
                .modChat .chatMessage-text { flex: 1 1 12ch; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
                .modChat .time { grid-column: 2; grid-row: 1; align-self: end; white-space: nowrap; }
            `;
        this.resources.add(() => chatLayout.remove());
        const href = SIGMOD_DEV.enabled
            ? `${SIGMOD_DEV.cssUrl}?t=${Date.now()}`
            : `${SIGMOD_DEV.productionCssUrl}?v=${encodeURIComponent(BUILD.release)}`;
        const element = createElement('link', {
            attributes: {
                rel: 'stylesheet',
                href,
                'data-sigmod-style': BUILD.release,
            },
        });
        const loaded = new Promise((resolve, reject) => {
            element.addEventListener('load', resolve, { once: true });
            element.addEventListener('error', () => reject(new Error(`Unable to load SigMod stylesheet: ${href}`)), { once: true });
        });
        document.head.append(element);
        document.head.append(chatLayout);
        const menuTypography = createElement('style', {
            attributes: { 'data-sigmod-menu-typography': BUILD.release },
        });
        menuTypography.textContent = `
                [data-sigmod-root], [data-sigmod-root] *, .mod_overlay, .mod_overlay * {
                    font-family: 'Titillium Web', sans-serif !important;
                }
            `;
        document.head.append(menuTypography);
        this.element = element;
        this.resources.add(() => {
            element.remove();
            menuTypography.remove();
            if (this.element === element) this.element = null;
        });
        try {
            await loaded;
        } catch (error) {
            this.app.logger.error(
                SIGMOD_DEV.enabled
                    ? 'Local SigMod CSS could not be loaded. Start the development server with start-dev.bat.'
                    : 'SigMod CSS could not be loaded.',
                error
            );
        }
        const root = document.documentElement;
        const originallyHiddenAds = root.classList.contains('sigmod-hide-ads');
        root.classList.toggle('sigmod-hide-ads', this.app.settings.themes.hideAds !== false);
        this.resources.add(() => root.classList.toggle('sigmod-hide-ads', originallyHiddenAds));
    }
}
class OverlayMotion {
    constructor(element, panel, resources) {
        this.element = element;
        this.panel = panel;
        this.animations = [];
        this.revision = 0;
        this.finished = Promise.resolve();
        element.dataset.sigmodOverlay = '';
        resources.add(() => this.cancel());
    }

    cancel() {
        this.revision++;
        for (const animation of this.animations) animation.cancel();
        this.animations = [];
        delete this.element.dataset.overlayPhase;
    }

    play(entering, complete = () => {}) {
        const interrupted = this.animations.length > 0;
        const opacity = interrupted ? getComputedStyle(this.element).opacity : entering ? '0' : '1';
        this.cancel();
        const revision = this.revision;
        if (!this.element.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            complete();
            this.finished = Promise.resolve();
            return;
        }
        this.element.dataset.overlayPhase = entering ? 'entering' : 'leaving';
        const timing = {
            duration: entering ? 160 : 120,
            easing: 'cubic-bezier(.2,.7,.2,1)',
            fill: 'both',
        };
        this.animations.push(this.element.animate({ opacity: [opacity, entering ? '1' : '0'] }, timing));
        if (this.panel)
            this.animations.push(
                this.panel.animate(
                    {
                        translate: entering ? ['0 5px', '0 0'] : ['0 0', '0 4px'],
                        scale: entering ? ['.99', '1'] : ['1', '.99'],
                    },
                    timing
                )
            );
        this.finished = Promise.all(this.animations.map((animation) => animation.finished)).then(
            () => {
                if (revision !== this.revision) return;
                complete();
                if (revision === this.revision) this.cancel();
            },
            () => {}
        );
    }
}
class ModalController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.modals = new Map();
        this.toastOverlay = null;
        this.scrimScope = null;
    }
    async mount() {
        const overlay = createElement('div', {
            className: 'alert_overlay',
            attributes: { id: 'modAlert_overlay' },
        });
        document.body.append(overlay);
        this.toastOverlay = overlay;
        this.resources.add(() => {
            overlay.remove();
            this.toastOverlay = null;
        });
        this.resources.add(
            this.app.backend.on('alert', (content) => {
                if (isObject(content) && (content.title !== undefined || content.description !== undefined)) {
                    this.handleAlert(content);
                } else {
                    this.alert(String(content ?? ''), 'info');
                }
            })
        );
        this.resources.add(
            this.app.backend.on('error', (content) => {
                this.alert(String(content?.message ?? content ?? 'Unknown error'), 'danger');
            })
        );
        this.resources.add(this.app.backend.on('update-available', (url) => this.showUpdate(url)));
    }
    open(id, content, options = {}) {
        this.close(id, true);
        const useOverlay = options.overlay !== false;
        const dialog = createElement('section', {
            className: options.className || 'modAlert',
            attributes: { role: 'dialog', 'aria-modal': 'true' },
        });
        if (content instanceof Node) dialog.append(content);
        else dialog.textContent = String(content ?? '');
        dialog.dataset.modalId = id;
        const scope = this.resources.child(`modal-${id}-${Date.now()}`);
        let backdrop = null;
        if (useOverlay) {
            backdrop = createElement('div', {
                className: 'mod_overlay',
                attributes: { 'data-modal-id': id },
            });
            if (options.zIndex) backdrop.style.zIndex = String(options.zIndex);
            backdrop.append(dialog);
            document.body.append(backdrop);
            scope.listen(backdrop, 'click', (event) => {
                if (event.target === backdrop && options.closeOnBackdrop !== false) this.close(id);
            });
        } else {
            if (options.zIndex) dialog.style.zIndex = String(options.zIndex);
            document.body.append(dialog);
        }
        scope.add(() => (backdrop || dialog).remove());
        const motion = backdrop ? new OverlayMotion(backdrop, dialog, scope) : null;
        this.modals.set(id, {
            overlay: backdrop,
            dialog,
            scope,
            motion,
            closing: false,
        });
        motion?.play(true);
        return dialog;
    }
    close(id, immediate = false) {
        const modal = this.modals.get(id);
        if (!modal) return;
        const remove = () => {
            modal.scope.dispose();
            if (this.modals.get(id) === modal) this.modals.delete(id);
        };
        if (immediate || !modal.motion) {
            remove();
            return;
        }
        if (modal.closing) return;
        modal.closing = true;
        modal.dialog.inert = true;
        modal.motion.play(false, remove);
    }
    alert(message, kind = 'info') {
        const overlay = this.toastOverlay;
        if (!(overlay instanceof HTMLElement)) return null;
        const toastClass = kind === 'info' ? 'default' : kind;
        const toast = createElement('div', {
            className: `infoAlert modAlert-${toastClass}`,
        });
        toast.append(createElement('span', { text: message }));
        toast.append(createElement('div', { className: 'modAlert-loader' }));
        overlay.append(toast);
        const timer = window.setTimeout(() => toast.remove(), 2_000);
        this.resources?.add?.(() => {
            window.clearTimeout(timer);
            toast.remove();
        });
        return toast;
    }
    showUpdate(value) {
        const url = this.safeUpdateUrl(value);
        const body = createElement('div');
        body.append(
            createElement('p', {
                text: 'A newer SigMod version is required.',
            })
        );
        if (url) {
            body.append(
                createElement('a', {
                    className: 'modButton',
                    attributes: {
                        href: url,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                    },
                    text: 'Update',
                })
            );
        }
        this.open('update-required', body, {
            closeOnBackdrop: false,
            overlay: false,
        });
        for (const selector of [SELECTORS.play, SELECTORS.spectate]) {
            const button = document.querySelector(selector);
            if (button instanceof HTMLButtonElement) button.disabled = true;
        }
    }
    safeUpdateUrl(value) {
        try {
            const url = new URL(String(value));
            return url.protocol === 'https:' ? url.href : null;
        } catch {
            return null;
        }
    }
    handleAlert(data) {
        if (!isObject(data)) return;
        const { title = '', description = '', enabled = false, link = '', buttonText = 'Open' } = data;
        if (this.app.backend.updateRequired) return;
        const hideAlert = Number(localStorage.getItem('hide-alert'));
        if (!enabled || (hideAlert && Date.now() - hideAlert < 3 * 60 * 60 * 1000)) {
            this.scrimScope?.dispose();
            document.getElementById('scrim_alert')?.remove();
            return;
        }
        localStorage.removeItem('hide-alert');
        this.scrimScope?.dispose();
        const modal = createElement('div', {
            className: 'modAlert',
            attributes: { id: 'scrim_alert' },
        });
        const header = createElement('div', {
            className: 'flex justify-sb',
        });
        const closeButton = createElement('button', {
            className: 'modButton',
            text: 'X',
            attributes: {
                type: 'button',
                id: 'close_scrim_alert',
                style: 'width: 35px;',
            },
        });
        header.append(createElement('strong', { text: title }), closeButton);
        const actions = createElement('div', {
            className: 'flex',
            attributes: { style: 'align-items: center; gap: 5px;' },
        });
        let actionBtn = null;
        if (link) {
            actionBtn = createElement('button', {
                className: 'modButton',
                text: buttonText,
                attributes: {
                    type: 'button',
                    id: 'alert_action',
                    style: 'width: 100%;',
                },
            });
            actions.append(actionBtn);
        }
        modal.append(header, createElement('span', { text: description }), actions);
        document.body.append(modal);
        const scope = (this.scrimScope = this.resources.child('scrim-alert'));
        const menuWrapper = document.getElementById('menu-wrapper');
        if (menuWrapper instanceof HTMLElement) {
            const sync = () => {
                modal.style.display = menuWrapper.style.display === 'none' ? 'none' : 'flex';
            };
            sync();
            const observer = new MutationObserver(sync);
            observer.observe(menuWrapper, {
                attributes: true,
                attributeFilter: ['style'],
            });
            scope.add(() => {
                observer.disconnect();
            });
        }
        if (actionBtn && link) {
            scope.listen(actionBtn, 'click', () => {
                window.open(link, '_blank');
                scope.dispose();
            });
        }
        scope.listen(closeButton, 'click', () => {
            scope.dispose();
            localStorage.setItem('hide-alert', Date.now());
        });
        scope.add(() => {
            modal.remove();
        });
    }
    destroy() {
        for (const modal of this.modals.values()) {
            modal.scope.dispose();
            if (modal.overlay) modal.overlay.remove();
            else modal.dialog.remove();
        }
        this.modals.clear();
        super.destroy();
    }
}
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Menu shell, navigation, and settings-panel composition                            ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
class MenuController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.root = null;
        this.launcher = null;
        this.launcherDisposer = null;
        this.activeTab = 'mod_home';
        this.externalTabActive = false;
        this.tabTransitionToken = 0;
        this.tabTransitioning = false;
        this.homeSearch = new HomeSearch(app, this.resources, this);
        this.activeCategory = null;
        this.expandedCategories = new Set();
        this.hideTimer = 0;
        this.mouseBinder = new MouseBindingEditor(
            app,
            this.resources,
            () => this.root,
            () => this.activeTab
        );
        this.keybinds = new KeybindRecorder(app, this.resources, () => this.root);
        this.settingsIO = new SettingsPorter(app, this.resources, this);
    }
    hasSigFixes() {
        return this.settingsIO?.hasSigFixes() === true;
    }
    syncSigFixSkinOptions() {
        if (!this.root) return;
        const visible = this.hasSigFixes();
        for (const id of ['botSkinsOnly', 'showOwnSkinWithBots']) {
            const input = this.root.querySelector(`#${id}`);
            const row = input?.closest('.justify-sb');
            if (!(row instanceof HTMLElement)) continue;
            row.style.display = visible ? '' : 'none';
            row.setAttribute('aria-hidden', String(!visible));
        }
    }
    async mount() {
        if (this.root) return;
        const root = createElement('div', {
            className: 'mod_menu',
            attributes: {
                'data-sigmod-root': '',
                'aria-hidden': 'true',
                role: 'dialog',
                'aria-label': 'SigMod settings',
            },
        });
        root.style.display = 'none';
        root.style.opacity = '0';
        root.innerHTML = this.template();
        document.body.append(root);
        this.root = root;
        const header = root.querySelector('#sigmod-header-image');
        if (header instanceof HTMLImageElement) header.src = ENDPOINTS.headerAnimation;
        const version = root.querySelector('#sigmod-version');
        if (version) version.textContent = BUILD.release;
        this.setupNavigationArchitecture();
        this.syncSigFixSkinOptions();
        this.setupMouseBindingEditor();
        this.setupKeybindRecorder();
        this.syncSettings();
        this.settingsIO.syncSettingsActions();
        this.renderRecentAccess();
        this.openTab(this.activeTab, false, false);
        this.bindLauncher();
        this.resources.listen(root, 'click', (event) => this.handleExternalTabClick(event), true);
        this.resources.listen(root, 'click', (event) => this.handleClick(event));
        this.resources.listen(root, 'input', (event) => this.handleSettingInput(event));
        this.resources.listen(root, 'change', (event) => this.handleSettingInput(event));
        this.resources.listen(root, 'change', (event) => {
            const select = event.target;
            if (select instanceof HTMLSelectElement && select.matches('[data-localization-language]')) {
                void this.app.i18n?.setLanguage(select.value);
            }
        });
        this.resources.add(
            this.app.host?.on('change', () => {
                this.settingsIO.syncSettingsActions();
                this.homeSearch.syncSearchLabel();
                this.syncSigFixSkinOptions();
            }) ?? (() => {})
        );
        const importInput = root.querySelector('#settingsImportFile');
        if (importInput instanceof HTMLInputElement) {
            this.resources.listen(importInput, 'change', () => {
                const file = importInput.files?.[0];
                importInput.value = '';
                if (file) void this.importSettings(file);
            });
        }
        // Intercept SigFixes' window-level zoom handler without preventing menu scrolling.
        this.resources.listen(
            root,
            'wheel',
            async (event) => {
                if (!this.isOpen()) return;
                event.stopPropagation();
            },
            { capture: true, passive: true }
        );
        this.setupHomeSearch();
        this.app.i18n?.apply();
        this.resources.listen(document, 'keydown', (event) => {
            if (event.key === 'Escape' && this.isOpen()) this.close();
        });
        // Cancel delayed SigFixes styles so a closed tab cannot reappear underneath the active one.
        const content = root.querySelector('.mod_menu_content');
        if (content instanceof HTMLElement) {
            const observer = new MutationObserver(() => {
                if (this.externalTabActive || this.tabTransitioning) return;
                for (const tab of content.querySelectorAll(':scope > .mod_tab:not([data-mod-panel])')) {
                    if (!(tab instanceof HTMLElement)) continue;
                    if (!tab.hidden) tab.hidden = true;
                    if (tab.style.display !== 'none') tab.style.display = 'none';
                    if (tab.style.opacity !== '0') tab.style.opacity = '0';
                }
            });
            this.resources.observe(observer, content, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'hidden'],
            });
        }
        this.resources.add(() => {
            clearTimeout(this.hideTimer);
            root.remove();
            if (this.root === root) this.root = null;
        });
    }
    template() {
        return `
                <div class="mod_menu_wrapper">
                    <div class="mod_menu_header" data-sigmod-localize>
                        <img id="sigmod-header-image" alt="" draggable="false" class="header_img">
                        <button type="button" class="modButton" id="closeBtn" data-menu-close aria-label="Close SigMod settings">${icon('close', 20)}</button>
                    </div>
                    <div class="mod_menu_inner">
                        <nav class="mod_menu_navbar" aria-label="SigMod sections" data-sigmod-localize>
                            <div class="mod_nav_home">
                                <button type="button" class="mod_nav_btn mod_selected" id="tab_home_btn" data-mod-tab="mod_home" data-nav-managed>
                                    ${icon('house', 14)}
                                    <span class="mod_nav_label">Home</span>
                                </button>
                            </div>

                            <div class="mod_nav_features-scroll" aria-label="Features">
                                <div class="mod_nav_group" data-nav-group="controls">
                                    <button type="button" class="mod_nav_btn mod_nav_category" data-nav-category="controls" data-nav-managed aria-expanded="false">
                                        ${icon('keyboard', 14)}
                                        <span class="mod_nav_label">Controls</span>
                                        <span class="mod_nav_chevron" aria-hidden="true">›</span>
                                    </button>
                                    <div class="mod_nav_children">
                                        <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_macros" data-nav-managed>Keyboard</button>
                                        <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_controls_mouse" data-nav-managed>Mouse</button>
                                        <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_controls_advanced" data-nav-managed>Advanced</button>
                                    </div>
                                </div>

                                <div class="mod_nav_group" data-nav-group="appearance">
                                    <button type="button" class="mod_nav_btn mod_nav_category" data-nav-category="appearance" data-nav-managed aria-expanded="false">
                                        ${icon('palette', 14)}
                                        <span class="mod_nav_label">Appearance</span>
                                        <span class="mod_nav_chevron" aria-hidden="true">›</span>
                                    </button>
                                    <div class="mod_nav_children">
                                        <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_game" data-nav-managed>Game</button>
                                        <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_name" data-nav-managed>Names</button>
                                        <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_themes" data-nav-managed>Themes</button>
                                        <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_settings_interface" data-nav-managed>Interface</button>
                                        <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_chat_settings" data-nav-managed>Chat</button>
                                        <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_party" data-nav-managed>Party</button>
                                    </div>
                                </div>

                                <button type="button" class="mod_nav_btn" id="tab_friends_btn" data-mod-tab="mod_friends" data-nav-managed>
                                    ${icon('users', 14)}
                                    <span class="mod_nav_label">Friends</span>
                                </button>
                            </div>

                            <div class="mod_nav_external" data-nav-external-slot></div>

                            <div class="mod_nav_misc-section" data-nav-group="misc">
                                <button type="button" class="mod_nav_btn mod_nav_category" data-nav-category="misc" data-nav-managed aria-expanded="false">
                                    ${icon('more', 14)}
                                    <span class="mod_nav_label">Misc</span>
                                    <span class="mod_nav_chevron" aria-hidden="true">›</span>
                                </button>
                                <div class="mod_nav_misc-children">
                                    <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_settings_data" data-nav-managed>Data</button>
                                    <button type="button" class="mod_nav_btn mod_nav_subbtn" data-mod-tab="mod_statistics" data-nav-managed>Statistics</button>
                                    <button type="button" class="mod_nav_btn mod_nav_subbtn" id="tab_info_btn" data-mod-tab="mod_info" data-nav-managed>Info</button>
                                </div>
                            </div>
                        </nav>
                        <main class="mod_menu_content">
                            <section class="mod_tab" id="mod_home" data-mod-panel>
                                <div class="home-intro">
                                    <div class="home-welcome-row">
                                        <span class="f-big" id="welcomeUser">Welcome Guest, to the SigMod Client!</span>
                                    </div>
                                    <div class="home-search-wrap">
                                        <div class="home-search-box">
                                            ${icon('search', 18)}
                                            <input id="sigmod-home-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search SigMod..." aria-label="Search SigMod" aria-controls="sigmod-home-search-results" aria-expanded="false">
                                        </div>
                                        <div id="sigmod-home-search-results" class="home-search-results" role="listbox" hidden></div>
                                    </div>
                                </div>

                                <div class="home-dashboard">
                                    <div class="home-card-wrapper home-quick-wrapper">
                                        <div class="home-section-heading">Quick access</div>
                                        <div class="home-card home-card-quick quickAccess" id="mod_qaccess"></div>
                                    </div>

                                    <div class="home-right-stack">
                                        <div class="home-card-wrapper home-stats-wrapper">
                                            <div class="home-section-heading">Statistics</div>
                                            <button type="button" class="home-card home-card-stats" id="home-statistics-open" aria-label="Open detailed statistics">
                                                <div class="home-stats-top">
                                                    <div class="home-stats-value">
                                                        <span id="home-stats-time">0m</span>
                                                        <small>played</small>
                                                    </div>
                                                    <span class="home-stats-arrow" aria-hidden="true">›</span>
                                                </div>
                                                <div class="home-stats-chart">
                                                    <canvas id="sigmod-stats" width="300" height="54"></canvas>
                                                    <div class="home-stats-empty" id="home-stats-empty" hidden>Play a match to build your timeline</div>
                                                </div>
                                            </button>
                                        </div>

                                        <div class="home-card-wrapper">
                                            <div class="home-section-heading">Recently accessed</div>
                                            <div class="home-card">
                                                <div id="mod-recent-access" class="home-recent-list"></div>
                                            </div>
                                        </div>

                                        <div class="home-card-wrapper">
                                            <div class="home-section-heading">Announcements</div>
                                            <div class="home-card">
                                                <div id="mod-announcements" class="scroll">No announcements yet...</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="mod_tab scroll" id="mod_statistics" data-mod-panel>
                                <div class="statistics-page">
                                    <div class="statistics-header">
                                        <div>
                                            <div class="statistics-title">Statistics</div>
                                        </div>
                                    </div>

                                    <div class="statistics-kpis">
                                        <div class="statistics-kpi">
                                            <span>Time played</span>
                                            <strong id="statistics-time-played">0m</strong>
                                        </div>
                                        <div class="statistics-kpi">
                                            <span>Highest mass</span>
                                            <strong id="statistics-highest-mass">0</strong>
                                        </div>
                                        <div class="statistics-kpi">
                                            <span>Deaths</span>
                                            <strong id="statistics-total-deaths">0</strong>
                                        </div>
                                        <div class="statistics-kpi">
                                            <span>Total mass</span>
                                            <strong id="statistics-total-mass">0</strong>
                                        </div>
                                    </div>

                                    <section class="statistics-panel statistics-panel-wide">
                                        <div class="statistics-panel-head">
                                            <div>
                                                <strong>Play time</strong>
                                                <span>Recent matches</span>
                                            </div>
                                            <span id="statistics-average-time">0m avg.</span>
                                        </div>
                                        <div class="statistics-chart-wrap">
                                            <canvas id="statistics-time-chart" height="126"></canvas>
                                            <div class="statistics-chart-empty" id="statistics-time-empty" hidden>Detailed history starts after your next completed match.</div>
                                        </div>
                                    </section>

                                    <div class="statistics-two-col">
                                        <section class="statistics-panel">
                                            <div class="statistics-panel-head">
                                                <div>
                                                    <strong>Mass</strong>
                                                    <span>Peak mass per match</span>
                                                </div>
                                            </div>
                                            <div class="statistics-chart-wrap statistics-chart-small">
                                                <canvas id="statistics-mass-chart" height="118"></canvas>
                                            </div>
                                        </section>

                                        <section class="statistics-panel">
                                            <div class="statistics-panel-head">
                                                <div>
                                                    <strong>Performance</strong>
                                                    <span>From tracked matches</span>
                                                </div>
                                            </div>
                                            <div class="statistics-detail-grid">
                                                <div><span>Kills</span><strong id="statistics-kills">0</strong></div>
                                                <div><span>Avg. kills</span><strong id="statistics-avg-kills">0</strong></div>
                                                <div><span>Pellets</span><strong id="statistics-pellets">0</strong></div>
                                                <div><span>Splits</span><strong id="statistics-splits">0</strong></div>
                                                <div><span>Best place</span><strong id="statistics-best-position">—</strong></div>
                                                <div><span>Avg. ping</span><strong id="statistics-average-ping">—</strong></div>
                                            </div>
                                        </section>
                                    </div>

                                    <section class="statistics-panel">
                                        <div class="statistics-panel-head">
                                            <div>
                                                <strong>Recent matches</strong>
                                                <span>Your latest completed games</span>
                                            </div>
                                        </div>
                                        <div class="statistics-matches" id="statistics-recent-matches"></div>
                                    </section>
                                </div>
                            </section>

                            <section class="mod_tab scroll" id="mod_macros" data-mod-panel>
                                <div class="modColItems">
                                    <div class="macros_wrapper">
                                        <span class="text-center f-big">Keybindings</span>
                                        <hr style="border-color: #3F3F3F">
                                        <div style="justify-content: center;">
                                            <div class="f-column g-10" style="align-items: center; justify-content: center;">
                                                <div class="macrosContainer">
                                                    <div class="f-column g-10">
                                                        <label class="macroRow"><span class="text">Rapid Feed</span><input id="modinput1" class="keybinding" name="rapidFeed" data-label="Rapid Feed" data-setting="macros.keys.rapidFeed" maxlength="1" placeholder="..."></label>
                                                        <label class="macroRow"><span class="text">Double Split</span><input id="modinput2" class="keybinding" name="splits.double" data-label="Double split" data-setting="macros.keys.splits.double" maxlength="1" placeholder="..."></label>
                                                        <label class="macroRow"><span class="text">Triple Split</span><input id="modinput3" class="keybinding" name="splits.triple" data-label="Triple split" data-setting="macros.keys.splits.triple" maxlength="1" placeholder="..."></label>
                                                        <label class="macroRow"><span class="text">Respawn</span><input id="modinput15" class="keybinding" name="respawn" data-label="Respawn" data-setting="macros.keys.respawn" maxlength="1" placeholder="..."></label>
                                                    </div>
                                                    <div class="f-column g-10">
                                                        <label class="macroRow"><span class="text">Quad Split</span><input id="modinput4" class="keybinding" name="splits.quad" data-label="Quad split" data-setting="macros.keys.splits.quad" maxlength="1" placeholder="..."></label>
                                                        <label class="macroRow"><span class="text">Horizontal Line</span><input id="modinput5" class="keybinding" name="line.horizontal" data-label="Horizontal line" data-setting="macros.keys.line.horizontal" maxlength="1" placeholder="..."></label>
                                                        <label class="macroRow"><span class="text">Vertical Line</span><input id="modinput7" class="keybinding" name="line.vertical" data-label="Vertical line" data-setting="macros.keys.line.vertical" maxlength="1" placeholder="..."></label>
                                                        <label class="macroRow"><span class="text">Fixed Line</span><input id="modinput16" class="keybinding" name="line.fixed" data-label="Fixed line" data-setting="macros.keys.line.fixed" maxlength="1" placeholder="..."></label>
                                                    </div>
                                                </div>
                                                <label class="macroRow" title="You need to be in a tag to use this keybind."><span class="text">Ping</span><input id="modinput18" class="keybinding" name="ping" data-label="Ping" data-setting="macros.keys.ping" maxlength="1" placeholder="..."></label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="macros_wrapper">
                                        <span class="text-center f-big">Advanced Keybinding options</span>
                                        <div class="setting-card-wrapper">
                                            <div class="setting-card"><div class="setting-card-action"><span class="setting-card-name">Rapid feed</span></div></div>
                                            <div class="setting-parameters" style="display: none;">
                                                <div class="my-5"><span class="stats-info-text">Customize feeding</span></div>
                                                <div class="stats-line justify-sb"><span>Feed speed</span><div class="justify-sb g-5" style="width: 200px;"><span class="mod_badge" id="macroSpeedText"></span><input type="range" class="modSlider" id="macroSpeed" min="5" max="100" step="5" data-setting="macros.feedSpeed" data-number style="width: 134px;"></div></div>
                                            </div>
                                        </div>
                                        <div class="setting-card-wrapper">
                                            <div class="setting-card"><div class="setting-card-action"><span class="setting-card-name">Linesplits</span></div></div>
                                            <div class="setting-parameters" style="display: none;">
                                                <div class="my-5"><span class="stats-info-text">Customize linesplits</span></div>
                                                <div class="stats-line justify-sb"><span>Instant split</span><div class="centerXY g-5"><span class="modDescText">Splits - </span><input type="number" class="modInput modNumberInput text-center" min="0" max="4" placeholder="0" title="Splits" style="width: 44px;" id="instant-split-amount"><div class="modCheckbox"><input id="toggle-instant-split" type="checkbox"><label class="cbx" for="toggle-instant-split"></label></div></div></div>
                                            </div>
                                        </div>
                                        <div class="setting-card-wrapper">
                                            <div class="setting-card"><div class="setting-card-action"><span class="setting-card-name">Toggle Settings</span></div></div>
                                            <div class="setting-parameters" style="display: none;">
                                                <div class="my-5"><span class="stats-info-text">Toggle settings with a keybind.</span></div>
                                                ${this.keyRow('Toggle Menu', 'modinput6', 'toggle.menu', 'macros.keys.toggle.menu')}
                                                ${this.keyRow('Toggle Names', 'modinput10', 'toggle.names', 'macros.keys.toggle.names')}
                                                ${this.keyRow('Toggle Skins', 'modinput11', 'toggle.skins', 'macros.keys.toggle.skins')}
                                                ${this.keyRow('Toggle Autorespawn', 'modinput12', 'toggle.autoRespawn', 'macros.keys.toggle.autoRespawn')}
                                            </div>
                                        </div>
                                        <div class="setting-card-wrapper">
                                            <div class="setting-card"><div class="setting-card-action"><span class="setting-card-name">Tricksplits</span></div></div>
                                            <div class="setting-parameters" style="display: none;">
                                                <div class="my-5"><span class="stats-info-text">Other split options - splits with delay</span></div>
                                                ${this.keyRow('Double Trick', 'modinput13', 'splits.doubleTrick', 'macros.keys.splits.doubleTrick')}
                                                ${this.keyRow('Self Trick', 'modinput14', 'splits.selfTrick', 'macros.keys.splits.selfTrick')}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="mod_tab scroll" id="mod_game" data-mod-panel>
                                <div class="modColItems">
                                    <div class="modRowItems" style="align-items: start;">
                                        <div class="modColItems_2">
                                            <span style="font-style: italic;">~ Game Colors</span>
                                            <div class="justify-sb w-100 p-5 rounded"><span class="text">Map</span><div id="mapColor"></div></div>
                                            <div class="justify-sb w-100 accent_row p-5 rounded"><span class="text">Border</span><div id="borderColor"></div></div>
                                            <div class="justify-sb w-100 p-5 rounded"><span class="text" title="Does not work with jelly physics">Food</span><div id="foodColor"></div></div>
                                            <div class="justify-sb w-100 accent_row p-5 rounded"><span class="text" title="Does not work with jelly physics">Cells</span><div id="cellColor"></div></div>
                                        </div>
                                        <div class="modColItems_2">
                                            <span style="font-style: italic;">~ Game Images</span>
                                            <div class="justify-sb w-100 p-5 rounded"><span class="text">Map Image</span><button type="button" class="btn select-btn" id="mapImageSelect" aria-label="Select map image"></button></div>
                                            <div class="justify-sb w-100 accent_row p-5 rounded"><span class="text">Virus Image</span><button type="button" class="btn select-btn" id="virusImageSelect" aria-label="Select virus image"></button></div>
                                            <div class="justify-sb w-100 p-5 rounded"><span class="text">Replace Skins</span><button type="button" class="btn select-btn" id="skinReplaceSelect" aria-label="Select skin replacement"></button></div>
                                        </div>
                                    </div>
                                    <div class="modColItems_2">
                                        <span style="font-style: italic;">~ Game Settings</span>
                                        <div class="justify-sb w-100 accent_row p-10 rounded"><span class="text">Font</span><div id="font-select-container"></div></div>
                                        <div class="justify-sb w-100 p-10"><span class="text">Names</span>${this.checkboxHtml('mod-showNames')}</div>
                                        <div class="justify-sb w-100 p-10 accent_row rounded"><span class="text" title="Your real name is still visible to other players.">Hide my name for me</span>${this.checkboxHtml('hideOwnName', 'game.hideOwnName')}</div>
                                        <div class="justify-sb w-100 accent_row p-10 rounded"><span class="text">Skins</span>${this.checkboxHtml('mod-showSkins')}</div>
                                        <div class="justify-sb w-100 p-10 rounded"><span class="text" title="Matches the listed bot names exactly.">Only show bot skins (SigFixes)</span>${this.checkboxHtml('botSkinsOnly', 'game.botSkinsOnly')}</div>
                                        <div class="justify-sb w-100 p-10 accent_row rounded"><span class="text" title="Keeps your own cell skins visible when bot-only skins are enabled.">Also show my own skin</span>${this.checkboxHtml('showOwnSkinWithBots', 'game.showOwnSkinWithBots')}</div>
                                        <div class="justify-sb w-100 p-10 rounded"><span title="Long nicknames will be shorten on the leaderboard & ingame">Shorten names</span>${this.checkboxHtml('shortenNames', 'game.shortenNames')}</div>
                                        <div class="justify-sb w-100 accent_row p-10"><span>Text outlines & shadows</span>${this.checkboxHtml('removeOutlines', 'game.removeOutlines')}</div>
                                        <div class="justify-sb w-100 rounded" style="padding: 5px 10px;"><span class="text">Death screen Position</span><select id="deathScreenPos" class="form-control" data-setting="settings.deathScreenPos" style="width: 30%"><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option></select></div>
                                        <div class="justify-sb w-100 accent_row p-10 rounded">${this.checkRowInline('Play timer', 'playTimerToggle', 'settings.playTimer')}</div>
                                        <div class="justify-sb w-100 p-10 rounded">${this.checkRowInline('Mouse tracker', 'mouseTrackerToggle', 'settings.mouseTracker')}</div>
                                        <div class="justify-sb w-100 accent_row p-10 rounded">${this.checkRowInline('Merge timer', 'mergeTimerToggle', 'settings.mergeTimer')}</div>
                                    </div>
                                    <div class="settings-actions" id="settingsActions">
                                        <div class="settings-actions-heading"><span class="settings-actions-title">Settings</span></div>
                                        <div class="settings-scope-row" data-scope-row="reset">
                                            <span class="settings-scope-title">Reset</span>
                                            <div class="settings-scope-options">
                                                <button class="settings-scope-option active" data-scope="game" type="button">Game</button>
                                                <button class="settings-scope-option active" data-scope="sigmod" type="button">SigMod</button>
                                                <button class="settings-scope-option" data-scope="sigfix" type="button" hidden>SigFixes</button>
                                            </div>
                                            <button class="settings-icon-action" id="resetSettings" type="button" title="Reset selected settings" aria-label="Reset selected settings">
                                                ${icon('reset', 18)}
                                            </button>
                                        </div>
                                        <div class="settings-scope-row" data-scope-row="backup">
                                            <span class="settings-scope-title">Backup</span>
                                            <div class="settings-scope-options">
                                                <button class="settings-scope-option active" data-scope="game" type="button">Game</button>
                                                <button class="settings-scope-option active" data-scope="sigmod" type="button">SigMod</button>
                                                <button class="settings-scope-option" data-scope="sigfix" type="button" hidden>SigFixes</button>
                                            </div>
                                            <div class="settings-icon-actions">
                                                <button class="settings-icon-action" id="exportSettings" type="button" title="Export selected settings" aria-label="Export selected settings">
                                                    ${icon('export', 18)}
                                                </button>
                                                <button class="settings-icon-action" id="importSettings" type="button" title="Import all settings found in backup" aria-label="Import all settings found in backup">
                                                    ${icon('upload', 18)}
                                                </button>
                                            </div>
                                            <input id="settingsImportFile" type="file" accept="application/json,.json" hidden>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="mod_tab scroll" id="mod_name" data-mod-panel>
                                <div class="modColItems">
                                    <div class="modRowItems justify-sb" style="align-items: start;">
                                        <div class="f-column g-5" style="align-items: start; justify-content: start;">
                                            <span class="modTitleText">Name fonts & special characters</span>
                                            <span class="modDescText">Customize your name with special characters or fonts</span>
                                        </div>
                                        <div class="f-column g-5">
                                            <button class="modButton-secondary" onclick="window.open('https://nickfinder.com', '_blank')">Nickfinder</button>
                                            <button class="modButton-secondary" onclick="window.open('https://www.stylishnamemaker.com', '_blank')">Stylish Name</button>
                                            <button class="modButton-secondary" onclick="window.open('https://www.tell.wtf', '_blank')">Tell.wtf</button>
                                        </div>
                                    </div>
                                    <div class="modRowItems justify-sb">
                                        <div class="f-column g-5">
                                            <span class="modTitleText">Save names</span>
                                            <span class="modDescText">Save your names locally</span>
                                            <div class="flex g-5">
                                                <input class="modInput" placeholder="Enter a name..." id="saveNameValue" />
                                                <button type="button" id="saveName" class="modButton-secondary centerXY" style="border-radius: 5px; padding: 5px 10px;">
                                                    ${icon('plus', 18)}
                                                </button>
                                            </div>
                                            <div id="savedNames" class="f-column scroll"></div>
                                        </div>
                                        <div class="vr"></div>
                                        <div class="f-column g-5">
                                            <span class="modTitleText">Name Color</span>
                                            <span class="modDescText">Customize your name color</span>
                                            <div class="justify-sb">
                                                <input type="color" value="#ffffff" id="nameColor" class="colorInput" data-setting="game.name.color">
                                            </div>
                                            <span class="modTitleText">Gradient Name</span>
                                            <span class="modDescText">Customize your name with a gradient color</span>
                                            <div class="justify-sb">
                                                <div class="flex g-2" style="align-items: center">
                                                    <input type="color" value="#ffffff" id="gradientNameColor1" class="colorInput" data-setting="game.name.gradient.left">
                                                    <span>➜ First color</span>
                                                </div>
                                            </div>
                                            <div class="justify-sb">
                                                <div class="flex g-2" style="align-items: center">
                                                    <input type="color" value="#ffffff" id="gradientNameColor2" class="colorInput" data-setting="game.name.gradient.right">
                                                    <span>➜ Second color</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="mod_tab scroll" id="mod_themes" data-mod-panel>
                                <span>Background presets</span>
                                <div class="themes scroll" id="themes"></div>
                                <div class="modColItems_2" style="margin-top: 5px;">
                                    <div class="justify-sb w-100 p-10"><span>Input border radius</span><div class="centerXY g-10" style="width: 40%"><button type="button" id="reset_input_radius" class="resetButton">${icon('reset', 18)}</button><input type="range" class="modSlider" id="theme-inputBorderRadius" min="0" max="20" step="2" data-setting="themes.inputBorderRadius" data-pixels></div></div>
                                    <div class="justify-sb w-100 p-10 accent_row rounded"><span>Menu border radius</span><div class="centerXY g-10" style="width: 40%"><button type="button" id="reset_menu_radius" class="resetButton">${icon('reset', 18)}</button><input type="range" class="modSlider" id="theme-menuBorderRadius" min="0" max="50" step="2" data-setting="themes.menuBorderRadius" data-pixels></div></div>
                                    <div class="justify-sb w-100 p-10"><span>Input border</span>${this.checkboxHtml('theme-inputBorder', 'themes.inputBorder', '1px', '0px')}</div>
                                    <div class="justify-sb w-100 p-10 accent_row rounded"><span>Challenges on deathscreen</span>${this.checkboxHtml('showChallenges', 'settings.showChallenges')}</div>
                                    <div class="justify-sb w-100 p-10"><span>Remove shop popup</span>${this.checkboxHtml('removeShopPopup', 'settings.removeShopPopup')}</div>
                                    <div class="justify-sb w-100 p-10 accent_row rounded"><span>Hide Discord Button</span>${this.checkboxHtml('hideDiscordBtns', 'themes.hideDiscordBtns')}</div>
                                    <div class="justify-sb w-100 p-10"><span>Hide Language Buttons</span>${this.checkboxHtml('hideLangs', 'themes.hideLangs')}</div>
                                    <div class="justify-sb w-100 p-10 accent_row rounded"><span title="Blocks Google Ads, DoubleClick, Tag Manager & Analytics">Hide Ads & Trackers</span>${this.checkboxHtml('hideAds', 'themes.hideAds')}</div>
                                    <div class="justify-sb w-100 p-10"><span>Show Zig popup</span>${this.checkboxHtml('showZigPopup', 'themes.showZigPopup')}</div>
                                </div>
                            </section>

                            <section class="mod_tab scroll" id="mod_gallery" data-mod-panel>
                                <div class="modColItems_2">
                                    <label class="macroRow w-100"><span class="text">Make screenshot</span><input type="text" name="saveImage" data-label="Save image" id="modinput17" class="keybinding" data-setting="macros.keys.saveImage" maxlength="1" placeholder="..."></label>
                                </div>
                                <div class="modColItems_2">
                                    <span>Image gallery</span>
                                    <div class="flex g-5"><button type="button" class="modButton" id="gallery-download">Download all</button><button type="button" class="modButton" id="gallery-delete">Delete all</button></div>
                                    <div id="image-gallery"></div>
                                </div>
                            </section>

                            <section class="mod_tab scroll" id="mod_friends" data-mod-panel>
                                <div id="friends-guest-intro" class="friends-guest-intro">
                                    <div class="friends-guest-icon">${icon('users', 24)}</div>
                                    <div class="friends-guest-title">Friends on SigMod</div>
                                    <div class="friends-guest-copy">Add other players, see who is online and use private chat from inside SigMod.</div>
                                </div>
                                <div id="friends-auth-actions">
                                    <button type="button" class="modButton-black" id="createAccount">${icon('userPlus', 18)}Create account</button>
                                    <button type="button" class="modButton-black" id="login">${icon('signIn', 18)}Login</button>
                                </div>
                                <div class="friends-guest-support">Account support is available through the <a href="https://discord.gg/RjxeZ2eRGg" target="_blank">SigMod Discord</a>.</div>
                                <div id="friends-content" class="w-100"></div>
                            </section>

                            <section class="mod_tab scroll" id="mod_party" data-mod-panel>
                                <div class="settings-page">
                                    <section class="settings-section">
                                        <div class="settings-section-title">Party panel</div>
                                        <div class="settings-grid">
                                            <div class="settings-item chat-menu-row">
                                                <span class="text">Show party panel</span>
                                                ${this.checkboxHtml('showPartyPanel', 'settings.showPartyPanel')}
                                            </div>
                                            <div class="settings-item chat-menu-row">
                                                <span class="text">Blur party tag</span>
                                                ${this.checkboxHtml('party-blurTag', 'chat.blurTag')}
                                            </div>
                                            <div class="settings-item chat-menu-row">
                                                <span class="text">Panel opacity</span>
                                                <div class="centerXY g-10" style="min-width: 170px;">
                                                    <span class="mod_badge" id="partyOpacityText">100%</span>
                                                    <input type="range" class="modSlider" id="partyOpacity" min="0.1" max="1" step="0.05" data-setting="settings.partyOpacity" data-number style="width: 120px;">
                                                </div>
                                            </div>
                                            <div class="settings-item chat-menu-row">
                                                <span class="text">Panel scale</span>
                                                <div class="centerXY g-10" style="min-width: 170px;">
                                                    <span class="mod_badge" id="partyScaleText">1.00x</span>
                                                    <input type="range" class="modSlider" id="partyScale" min="0.5" max="2" step="0.05" data-setting="settings.partyScale" data-number style="width: 120px;">
                                                </div>
                                            </div>
                                            <div class="settings-item chat-menu-row">
                                                <span class="text">Ping duration</span>
                                                <div class="centerXY g-10" style="min-width: 170px;">
                                                    <span class="mod_badge" id="pingDurationText">2.0s</span>
                                                    <input type="range" class="modSlider" id="pingDuration" min="500" max="15000" step="500" data-setting="settings.pingDuration" data-number style="width: 120px;">
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                    <section class="settings-section">
                                        <div class="settings-section-title">Colors</div>
                                        <div class="chat-menu-colors">
                                            <div class="chat-menu-color">
                                                <span>Background</span>
                                                <div>
                                                    <input type="color" id="partyBgColor" class="colorInput" data-setting="settings.partyBgColor">
                                                </div>
                                            </div>
                                            <div class="chat-menu-color">
                                                <span>Text</span>
                                                <div>
                                                    <input type="color" id="partyTextColor" class="colorInput" data-setting="settings.partyTextColor">
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </section>

                            <section class="mod_tab scroll f-column g-5 text-center" id="mod_info" data-mod-panel>
                                <div class="brand_wrapper">
                                    <img src="https://czrsd.com/static/sigmod/info_bg_2.jpeg" alt="Info background" class="brand_img" />
                                    <span>SigMod V<span id="sigmod-version">${BUILD.release}</span> by Cursed</span>
                                </div>
                                <span>Thanks to</span>
                                <ul class="brand_credits">
                                    <li>Jb</li>
                                    <li>Black</li>
                                    <li>8y8x</li>
                                    <li>Dreamz</li>
                                    <li>Ultra</li>
                                    <li>Xaris</li>
                                    <li>Benzofury</li>
                                </ul>
                                <p>for contributing to the mod's evolution into what it is today.</p>
                                <div class="sigmod-community">
                                    <div class="community-header">Community</div>
                                    <div class="flex">
                                        <div class="community-discord-logo">
                                            <svg width="31" height="30" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-top: 3px;">
                                                <path d="M19.4566 5.35132C21.7154 8.83814 22.8309 12.7712 22.4139 17.299C22.4121 17.3182 22.4026 17.3358 22.3876 17.3473C20.6771 18.666 19.0199 19.4663 17.3859 19.9971C17.3732 20.0011 17.3596 20.0009 17.347 19.9964C17.3344 19.992 17.3234 19.9835 17.3156 19.9721C16.9382 19.4207 16.5952 18.8393 16.2947 18.2287C16.2774 18.1928 16.2932 18.1495 16.3287 18.1353C16.8734 17.9198 17.3914 17.6615 17.8896 17.3557C17.9289 17.3316 17.9314 17.2725 17.8951 17.2442C17.7894 17.1617 17.6846 17.0751 17.5844 16.9885C17.5656 16.9725 17.5404 16.9693 17.5191 16.9801C14.2844 18.5484 10.7409 18.5484 7.46792 16.9801C7.44667 16.9701 7.42142 16.9735 7.40317 16.9893C7.30317 17.0759 7.19817 17.1617 7.09342 17.2442C7.05717 17.2725 7.06017 17.3316 7.09967 17.3557C7.59792 17.6557 8.11592 17.9198 8.65991 18.1363C8.69517 18.1505 8.71192 18.1928 8.69442 18.2287C8.40042 18.8401 8.05742 19.4215 7.67292 19.9729C7.65617 19.9952 7.62867 20.0055 7.60267 19.9971C5.97642 19.4663 4.31917 18.666 2.60868 17.3473C2.59443 17.3358 2.58418 17.3174 2.58268 17.2982C2.23418 13.3817 2.94442 9.41613 5.53717 5.35053C5.54342 5.33977 5.55292 5.33137 5.56392 5.32638C6.83967 4.71165 8.20642 4.25939 9.63491 4.00111C9.66091 3.99691 9.68691 4.00951 9.70041 4.03365C9.87691 4.36176 10.0787 4.78252 10.2152 5.12637C11.7209 4.88489 13.2502 4.88489 14.7874 5.12637C14.9239 4.78987 15.1187 4.36176 15.2944 4.03365C15.3007 4.02167 15.3104 4.01208 15.3221 4.00623C15.3339 4.00039 15.3471 3.99859 15.3599 4.00111C16.7892 4.26018 18.1559 4.71244 19.4306 5.32638C19.4419 5.33137 19.4511 5.33977 19.4566 5.35132ZM10.9807 12.798C10.9964 11.6401 10.1924 10.6821 9.18316 10.6821C8.18217 10.6821 7.38592 11.6317 7.38592 12.798C7.38592 13.9639 8.19792 14.9136 9.18316 14.9136C10.1844 14.9136 10.9807 13.9639 10.9807 12.798ZM17.6261 12.798C17.6419 11.6401 16.8379 10.6821 15.8289 10.6821C14.8277 10.6821 14.0314 11.6317 14.0314 12.798C14.0314 13.9639 14.8434 14.9136 15.8289 14.9136C16.8379 14.9136 17.6261 13.9639 17.6261 12.798Z" fill="currentColor"></path>
                                            </svg>
                                        </div>
                                        <div class="community-discord">
                                            <a href="https://dsc.gg/sigmodz" target="_blank">dsc.gg/sigmodz</a>
                                        </div>
                                    </div>
                                </div>
                                <div>Install <a href="https://greasyfork.org/scripts/483587-sigmally-fixes-v2" target="_blank">Sigmally Fixes</a> for better performance!</div>
                                <div class="mt-auto flex f-column g-10">
                                    <div class="brand_yt">
                                        <div class="yt_wrapper" onclick="window.open('https://www.youtube.com/@sigmallyCursed')">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="26" height="26"><path d="M12 39c-.549 0-1.095-.15-1.578-.447A3.008 3.008 0 0 1 9 36V12c0-1.041.54-2.007 1.422-2.553a3.014 3.014 0 0 1 2.919-.132l24 12a3.003 3.003 0 0 1 0 5.37l-24 12c-.42.21-.885.315-1.341.315z" fill="currentColor"></path></svg>
                                            <span style="font-size: 16px;">Cursed</span>
                                        </div>
                                    </div>
                                    <div class="w-100 centerXY">
                                        <div class="justify-sb" style="width: 50%;">
                                            <a href="https://sigmally.xyz/" target="_blank">Website</a>
                                            <a href="https://greasyfork.org/scripts/454648-sigmod-client-macros/versions" target="_blank">Changelog</a>
                                            <a href="https://sigmally.xyz/tos" target="_blank">Terms of Service</a>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </main>
                    </div>
                </div>
            `;
    }
    get activeMouseButton() {
        return this.mouseBinder.activeMouseButton;
    }
    set activeMouseButton(value) {
        this.mouseBinder.activeMouseButton = value;
    }
    get detectedMouseButtons() {
        return this.mouseBinder.detectedMouseButtons;
    }
    createMouseBindingPanel() {
        return this.mouseBinder.createMouseBindingPanel();
    }
    mouseActionOptions() {
        return this.mouseBinder.mouseActionOptions();
    }
    mouseButtonMeta(button) {
        return this.mouseBinder.mouseButtonMeta(button);
    }
    mouseBindingAction(button) {
        return this.mouseBinder.mouseBindingAction(button);
    }
    setMouseBinding(button, action) {
        return this.mouseBinder.setMouseBinding(button, action);
    }
    setupMouseBindingEditor() {
        return this.mouseBinder.setupMouseBindingEditor();
    }
    renderMouseBindingEditor() {
        return this.mouseBinder.renderMouseBindingEditor();
    }
    keyRow(label, id, name, path) {
        return `<div class="stats-line justify-sb"><span>${label}</span><input id="${id}" class="keybinding" name="${name}" data-label="${label}" data-setting="${path}" maxlength="1" placeholder="..."></div>`;
    }
    checkRow(label, id, path = '', checkedValue = '', uncheckedValue = '') {
        const setting = path ? ` data-setting="${path}"` : '';
        const values = checkedValue ? ` data-checked-value="${checkedValue}" data-unchecked-value="${uncheckedValue}"` : '';
        return `<div class="stats-line justify-sb"><span>${label}</span><div class="modCheckbox"><input id="${id}" type="checkbox"${setting}${values}><label class="cbx" for="${id}"></label></div></div>`;
    }
    checkboxHtml(id, path = '', checkedValue = '', uncheckedValue = '') {
        const setting = path ? ` data-setting="${path}"` : '';
        const values = checkedValue ? ` data-checked-value="${checkedValue}" data-unchecked-value="${uncheckedValue}"` : '';
        return `<div class="modCheckbox"><input id="${id}" type="checkbox"${setting}${values}><label class="cbx" for="${id}"></label></div>`;
    }
    checkRowInline(label, id, path = '', checkedValue = '', uncheckedValue = '') {
        const setting = path ? ` data-setting="${path}"` : '';
        const values = checkedValue ? ` data-checked-value="${checkedValue}" data-unchecked-value="${uncheckedValue}"` : '';
        return `<span>${label}</span><div class="modCheckbox"><input id="${id}" type="checkbox"${setting}${values}><label class="cbx" for="${id}"></label></div>`;
    }
    getNavigationModel() {
        return {
            controls: {
                title: 'Controls',
                description: 'Keybinds and macro behavior.',
                tabs: [
                    {
                        id: 'mod_macros',
                        title: 'Keyboard',
                        description: 'Game actions, split keys, toggles and screenshot keybinds.',
                    },
                    {
                        id: 'mod_controls_mouse',
                        title: 'Mouse',
                        description: 'Assign SigMod actions to mouse buttons.',
                    },
                    {
                        id: 'mod_controls_advanced',
                        title: 'Advanced',
                        description: 'Rapid-feed timing and advanced split behavior.',
                    },
                ],
            },
            appearance: {
                title: 'Appearance',
                description: 'Change how the game and SigMod look.',
                tabs: [
                    {
                        id: 'mod_game',
                        title: 'Game',
                        description: 'Map, cells, skins, food, borders and game images.',
                    },
                    {
                        id: 'mod_name',
                        title: 'Names',
                        description: 'Name display, fonts, colors, gradients and saved names.',
                    },
                    {
                        id: 'mod_themes',
                        title: 'Themes',
                        description: 'Background presets and custom SigMod themes.',
                    },
                    {
                        id: 'mod_settings_interface',
                        title: 'Interface',
                        description: 'Menu, HUD, overlays and visibility preferences.',
                    },
                    {
                        id: 'mod_chat_settings',
                        title: 'Chat',
                        description: 'Chat behavior, keybinds, appearance and message preferences.',
                    },
                    {
                        id: 'mod_party',
                        title: 'Party',
                        description: 'Party panel overlay visibility, opacity, scale and colors.',
                    },
                ],
            },
            misc: {
                title: 'Misc',
                description: 'Data, maintenance and information about SigMod.',
                tabs: [
                    {
                        id: 'mod_settings_data',
                        title: 'Data',
                        description: 'Statistics, reset options and captured screenshots.',
                    },
                    {
                        id: 'mod_statistics',
                        title: 'Statistics',
                        description: 'Gameplay totals, recent matches and performance trends.',
                    },
                    {
                        id: 'mod_info',
                        title: 'Info',
                        description: 'Version, credits, community links and SigMod information.',
                    },
                ],
            },
        };
    }
    getNavigationTabMeta(tabId) {
        for (const [category, config] of Object.entries(this.getNavigationModel())) {
            const tab = config.tabs.find((item) => item.id === tabId);
            if (tab) return { ...tab, category, categoryTitle: config.title };
        }
        if (tabId === 'mod_friends')
            return {
                id: tabId,
                title: 'Friends',
                category: null,
                categoryTitle: 'Friends',
            };
        return null;
    }
    setupNavigationArchitecture() {
        if (!this.root) return;
        const content = this.root.querySelector('.mod_menu_content');
        if (!(content instanceof HTMLElement)) return;
        this.ensureCategoryPanel(content);
        this.restructureFeaturePanels(content);
        this.adoptExternalNavButtons();
        const nav = this.root.querySelector('.mod_menu_navbar');
        if (nav instanceof HTMLElement) {
            const observer = new MutationObserver(() => this.adoptExternalNavButtons());
            this.resources.observe(observer, nav, { childList: true });
        }
    }
    ensureCategoryPanel(content) {
        let panel = content.querySelector('#mod_category');
        if (panel instanceof HTMLElement) return panel;
        panel = createElement('section', {
            className: 'mod_tab mod-category-panel',
            attributes: { id: 'mod_category', 'data-mod-panel': '' },
        });
        const home = content.querySelector('#mod_home');
        if (home?.nextSibling) content.insertBefore(panel, home.nextSibling);
        else content.append(panel);
        return panel;
    }
    ensureNavigationPanel(content, id) {
        let panel = content.querySelector(`#${id}`);
        if (panel instanceof HTMLElement) return panel;
        panel = createElement('section', {
            className: 'mod_tab scroll',
            attributes: { id, 'data-mod-panel': '' },
        });
        content.append(panel);
        return panel;
    }
    createPanelColumn() {
        const outer = createElement('div', { className: 'modColItems' });
        const inner = createElement('div', { className: 'modColItems_2' });
        outer.append(inner);
        return { outer, inner };
    }
    findRowByControl(panel, selector) {
        const control = panel?.querySelector(selector);
        if (!(control instanceof HTMLElement)) return null;
        return control.closest('.justify-sb, .modRowItems, .macroRow, .stats-line');
    }
    restructureFeaturePanels(content) {
        const keyboardPanel = content.querySelector('#mod_macros');
        const gamePanel = content.querySelector('#mod_game');
        const namePanel = content.querySelector('#mod_name');
        const themesPanel = content.querySelector('#mod_themes');
        const galleryPanel = content.querySelector('#mod_gallery');
        const mousePanel = this.ensureNavigationPanel(content, 'mod_controls_mouse');
        const advancedPanel = this.ensureNavigationPanel(content, 'mod_controls_advanced');
        const interfacePanel = this.ensureNavigationPanel(content, 'mod_settings_interface');
        this.ensureNavigationPanel(content, 'mod_chat_settings');
        const dataPanel = this.ensureNavigationPanel(content, 'mod_settings_data');
        const page = () => createElement('div', { className: 'settings-page' });
        const normalizeRow = (row) => {
            if (!(row instanceof HTMLElement)) return null;
            row.classList.remove('accent_row', 'p-5', 'p-10', 'rounded');
            row.classList.add('settings-item');
            row.style.removeProperty('padding');
            row.style.removeProperty('background');
            return row;
        };
        const section = (title, rows, columns = 1) => {
            const root = createElement('section', {
                className: 'settings-section',
            });
            if (title)
                root.append(
                    createElement('div', {
                        className: 'settings-section-title',
                        text: title,
                    })
                );
            const body = createElement('div', {
                className: `settings-grid${columns === 2 ? ' settings-grid-two' : columns === 3 ? ' settings-grid-three' : ''}`,
            });
            for (const row of rows) {
                const normalized = normalizeRow(row);
                if (normalized) body.append(normalized);
            }
            root.append(body);
            return root;
        };
        const row = (panel, selector) => this.findRowByControl(panel, selector);
        const card = (title) =>
            [...(keyboardPanel?.querySelectorAll('.setting-card-wrapper') ?? [])].find(
                (item) => item.querySelector('.setting-card-name')?.textContent?.trim().toLowerCase() === title
            );
        const cardRows = (title) => {
            const parameters = card(title)?.querySelector('.setting-parameters');
            if (!(parameters instanceof HTMLElement)) return [];
            return [...parameters.children].filter(
                (item) =>
                    item instanceof HTMLElement &&
                    (item.matches('.stats-line') || item.querySelector('input, select, button')) &&
                    !item.matches('.my-5')
            );
        };
        const rapidRows = cardRows('rapid feed');
        const lineRows = cardRows('linesplits');
        const toggleRows = cardRows('toggle settings');
        const trickRows = cardRows('tricksplits');
        const displayRows =
            gamePanel instanceof HTMLElement
                ? ['#font-select-container', '#mod-showNames', '#hideOwnName', '#shortenNames', '#removeOutlines']
                      .map((selector) => row(gamePanel, selector))
                      .filter(Boolean)
                : [];
        const interfaceHudRows =
            gamePanel instanceof HTMLElement
                ? ['#deathScreenPos', '#playTimerToggle', '#mouseTrackerToggle', '#mergeTimerToggle']
                      .map((selector) => row(gamePanel, selector))
                      .filter(Boolean)
                : [];
        let screenshotRow = null;
        if (galleryPanel instanceof HTMLElement) screenshotRow = row(galleryPanel, '#modinput17');
        if (keyboardPanel instanceof HTMLElement) {
            const keyboard = page();
            const actions = ['#modinput1', '#modinput15', '#modinput18'].map((selector) => row(keyboardPanel, selector)).filter(Boolean);
            if (screenshotRow instanceof HTMLElement) actions.push(screenshotRow);
            const splits = ['#modinput2', '#modinput3', '#modinput4'].map((selector) => row(keyboardPanel, selector)).filter(Boolean);
            splits.push(...trickRows);
            const movement = ['#modinput5', '#modinput7', '#modinput16'].map((selector) => row(keyboardPanel, selector)).filter(Boolean);
            keyboard.append(
                section('Actions', actions, 2),
                section('Splits', splits, 2),
                section('Movement', movement, 2),
                section('Toggle keybinds', toggleRows, 2)
            );
            keyboardPanel.replaceChildren(keyboard);
        }
        mousePanel.replaceChildren(this.createMouseBindingPanel());
        const advanced = page();
        advanced.append(section('Rapid feed', rapidRows), section('Linesplits', lineRows));
        advancedPanel.replaceChildren(advanced);
        if (gamePanel instanceof HTMLElement) {
            const colors = ['#mapColor', '#borderColor', '#foodColor', '#cellColor']
                .map((selector) => row(gamePanel, selector))
                .filter(Boolean);
            const images = ['#mapImageSelect', '#virusImageSelect'].map((selector) => row(gamePanel, selector)).filter(Boolean);
            const skins = ['#skinReplaceSelect', '#mod-showSkins', '#botSkinsOnly', '#showOwnSkinWithBots']
                .map((selector) => row(gamePanel, selector))
                .filter(Boolean);
            const settingsRow = gamePanel.querySelector('#settingsActions');
            const game = page();
            game.append(section('Colors', colors, 2), section('Images', images, 2), section('Skins', skins, 2));
            gamePanel.replaceChildren(game);
            const interfacePage = page();
            const dataPage = page();
            const menuRows = [];
            const generalRows = [];
            if (themesPanel instanceof HTMLElement) {
                for (const selector of [
                    '#reset_input_radius',
                    '#reset_menu_radius',
                    '#theme-inputBorder',
                    '#hideDiscordBtns',
                    '#hideLangs',
                    '#hideAds',
                    '#showZigPopup',
                ]) {
                    const item = row(themesPanel, selector);
                    if (item instanceof HTMLElement) menuRows.push(item);
                }
                for (const selector of ['#showChallenges', '#removeShopPopup']) {
                    const item = row(themesPanel, selector);
                    if (item instanceof HTMLElement) generalRows.push(item);
                }
            }
            const languageRow = createElement('div', {
                className: 'settings-item justify-sb',
                attributes: { 'data-sigmod-localize': '' },
            });
            languageRow.append(
                createElement('span', {
                    className: 'text',
                    text: 'Language',
                })
            );
            const languageControl = createElement('div', {
                className: 'f-column g-5',
            });
            const languageSelect = createElement('select', {
                className: 'form-control',
                attributes: {
                    id: 'sigmod-language',
                    'data-localization-language': '',
                    'aria-label': 'SigMod language',
                },
            });
            for (const [code, name] of Localization.languages()) {
                languageSelect.append(
                    createElement('option', {
                        text: name,
                        attributes: { value: code, 'data-i18n-skip': '' },
                    })
                );
            }
            languageControl.append(
                languageSelect,
                createElement('span', {
                    className: 'modDescText',
                    attributes: {
                        id: 'sigmod-language-status',
                        'aria-live': 'polite',
                    },
                })
            );
            languageRow.append(languageControl);
            const chatRow = createElement('div', {
                className: 'settings-item justify-sb',
                attributes: { 'data-sigmod-localize': '' },
            });
            const chatInput = createElement('input', {
                attributes: {
                    id: 'sigmod-chat-enabled',
                    type: 'checkbox',
                    'data-setting': 'chat.enabled',
                },
            });
            const chatControl = createElement('div', {
                className: 'modCheckbox',
            });
            chatControl.append(
                chatInput,
                createElement('label', {
                    attributes: {
                        class: 'cbx',
                        for: 'sigmod-chat-enabled',
                    },
                })
            );
            chatRow.append(createElement('span', { className: 'text', text: 'Chat' }), chatControl);

            interfacePage.append(
                section('Language', [languageRow]),
                section('Menu', menuRows),
                section('HUD & game UI', [...interfaceHudRows, ...generalRows, chatRow])
            );
            if (settingsRow instanceof HTMLElement) {
                dataPage.append(section('Settings', [settingsRow]));
            }
            if (galleryPanel instanceof HTMLElement) {
                const gallery = galleryPanel.querySelector('#image-gallery');
                const galleryBlock = gallery?.closest('.modColItems_2');
                if (galleryBlock instanceof HTMLElement) {
                    const galleryTitle = galleryBlock.querySelector(':scope > span');
                    galleryTitle?.remove();
                    const galleryActions = galleryBlock.querySelector(':scope > .flex');
                    if (galleryActions instanceof HTMLElement) galleryActions.classList.add('data-screenshots-actions');
                    galleryBlock.className = 'settings-section';
                    galleryBlock.prepend(
                        createElement('div', {
                            className: 'settings-section-title',
                            text: 'Screenshots',
                        })
                    );
                    dataPage.append(galleryBlock);
                }
                galleryPanel.remove();
            }
            interfacePanel.replaceChildren(interfacePage);
            content.querySelector('#mod_settings_general')?.remove();
            dataPanel.replaceChildren(dataPage);
        }
        if (namePanel instanceof HTMLElement) {
            const name = page();
            const saveInput = namePanel.querySelector('#saveNameValue');
            const saveButton = namePanel.querySelector('#saveName');
            const savedNames = namePanel.querySelector('#savedNames');
            if (saveButton instanceof HTMLButtonElement) {
                saveButton.replaceChildren(document.createTextNode('Save'));
                saveButton.removeAttribute('style');
            }
            const saveSection = createElement('section', {
                className: 'settings-section',
            });
            saveSection.append(
                createElement('div', {
                    className: 'settings-section-title',
                    text: 'Saved names',
                })
            );
            const saveRow = createElement('div', {
                className: 'name-save-row',
            });
            if (saveInput) saveRow.append(saveInput);
            if (saveButton) saveRow.append(saveButton);
            saveSection.append(saveRow);
            if (savedNames) saveSection.append(savedNames);
            const colorSection = createElement('section', {
                className: 'settings-section',
            });
            const preview = createElement('div', {
                className: 'name-color-preview',
                attributes: {
                    id: 'nameColorPreview',
                    'aria-label': 'Name color preview',
                },
            });
            preview.append(
                createElement('span', {
                    className: 'name-color-preview-text',
                    text: 'Your name',
                })
            );
            const colorItem = (label, selector, path) => {
                const input = namePanel.querySelector(selector);
                if (!(input instanceof HTMLElement)) return null;
                const item = createElement('div', {
                    className: 'name-color-item',
                });
                item.append(
                    createElement('span', { text: label }),
                    input,
                    createElement('code', {
                        className: 'name-color-value',
                        text: '#ffffff',
                        attributes: { 'data-name-color-value': path },
                    })
                );
                return item;
            };
            const modeTabs = createElement('div', {
                className: 'name-color-tabs',
                attributes: {
                    role: 'tablist',
                    'aria-label': 'Name color mode',
                },
            });
            for (const [label, mode] of [
                ['Single color', 'solid'],
                ['Gradient', 'gradient'],
            ]) {
                modeTabs.append(
                    createElement('button', {
                        className: 'name-color-tab',
                        text: label,
                        attributes: {
                            type: 'button',
                            role: 'tab',
                            'data-name-color-mode': mode,
                            'aria-controls': `name-color-panel-${mode}`,
                        },
                    })
                );
            }
            const solidPanel = createElement('div', {
                className: 'name-color-mode-panel',
                attributes: {
                    id: 'name-color-panel-solid',
                    role: 'tabpanel',
                    'data-name-color-panel': 'solid',
                },
            });
            const solidItem = colorItem('Name color', '#nameColor', 'game.name.color');
            if (solidItem) solidPanel.append(solidItem);
            const gradientPanel = createElement('div', {
                className: 'name-color-mode-panel',
                attributes: {
                    id: 'name-color-panel-gradient',
                    role: 'tabpanel',
                    'data-name-color-panel': 'gradient',
                },
            });
            const gradientGrid = createElement('div', {
                className: 'settings-grid settings-grid-two',
            });
            const gradientStartItem = colorItem('Gradient start', '#gradientNameColor1', 'game.name.gradient.left');
            const gradientEndItem = colorItem('Gradient end', '#gradientNameColor2', 'game.name.gradient.right');
            if (gradientStartItem) gradientGrid.append(gradientStartItem);
            if (gradientEndItem) gradientGrid.append(gradientEndItem);
            gradientPanel.append(gradientGrid);
            colorSection.append(
                createElement('div', {
                    className: 'settings-section-title',
                    text: 'Name colors',
                }),
                modeTabs,
                preview,
                solidPanel,
                gradientPanel
            );
            const tools = [...namePanel.querySelectorAll('button[onclick]')].filter((button) => button instanceof HTMLButtonElement);
            const toolsSection = createElement('section', {
                className: 'settings-section',
            });
            toolsSection.append(
                createElement('div', {
                    className: 'settings-section-title',
                    text: 'Name tools',
                })
            );
            const toolsRow = createElement('div', {
                className: 'name-tools-row',
            });
            for (const button of tools) toolsRow.append(button);
            toolsSection.append(toolsRow);
            name.append(section('Display', displayRows), saveSection, colorSection, toolsSection);
            namePanel.replaceChildren(name);
        }
        if (themesPanel instanceof HTMLElement) {
            const themes = themesPanel.querySelector('#themes');
            if (themes instanceof HTMLElement) {
                themesPanel.replaceChildren(
                    createElement('div', {
                        className: 'settings-section-title',
                        text: 'Themes',
                    }),
                    themes
                );
            }
        }
    }
    adoptExternalNavButtons() {
        if (!this.root) return;
        const nav = this.root.querySelector('.mod_menu_navbar');
        const slot = this.root.querySelector('[data-nav-external-slot]');
        if (!(nav instanceof HTMLElement) || !(slot instanceof HTMLElement)) return;
        const directButtons = [...nav.children].filter(
            (child) =>
                child instanceof HTMLButtonElement && child.classList.contains('mod_nav_btn') && !child.hasAttribute('data-nav-managed')
        );
        for (const button of directButtons) {
            button.dataset.externalNav = 'true';
            button.setAttribute('type', 'button');
            slot.append(button);
        }
    }
    toggleCategory(categoryId, force = undefined) {
        if (!this.root) return false;
        const group = this.root.querySelector(`[data-nav-group="${CSS.escape(categoryId)}"]`);
        if (!(group instanceof HTMLElement)) return false;
        const next = typeof force === 'boolean' ? force : !group.classList.contains('is-expanded');
        group.classList.toggle('is-expanded', next);
        const button = group.querySelector(':scope > [data-nav-category]');
        if (button instanceof HTMLElement) button.setAttribute('aria-expanded', String(next));
        if (next) this.expandedCategories.add(categoryId);
        else this.expandedCategories.delete(categoryId);
        return next;
    }
    openCategory(categoryId, toggle = true) {
        if (!this.root) return;
        const config = this.getNavigationModel()[categoryId];
        if (!config) return;
        if (toggle) this.toggleCategory(categoryId);
        else this.toggleCategory(categoryId, true);
        const panel = this.root.querySelector('#mod_category');
        const button = this.root.querySelector(`[data-nav-category="${CSS.escape(categoryId)}"]`);
        if (!(panel instanceof HTMLElement) || !(button instanceof HTMLElement)) return;
        this.renderCategoryLanding(categoryId);
        this.externalTabActive = false;
        this.activeCategory = categoryId;
        this.updateCategoryActiveState(null, categoryId);
        this.switchTabPanel(panel, button, true);
        this.activeTab = 'mod_category';
        this.root.dispatchEvent(
            new CustomEvent('sigmod:tabchange', {
                bubbles: true,
                detail: { tabId: 'mod_category', categoryId },
            })
        );
    }
    renderCategoryLanding(categoryId) {
        const panel = this.root?.querySelector('#mod_category');
        const config = this.getNavigationModel()[categoryId];
        if (!(panel instanceof HTMLElement) || !config) return;
        const header = createElement('div', {
            className: 'mod-category-header',
        });
        header.append(
            createElement('div', {
                className: 'mod-category-title',
                text: config.title,
            })
        );
        const grid = createElement('div', {
            className: 'mod-category-grid',
        });
        for (const tab of config.tabs) {
            const card = createElement('button', {
                className: 'mod-category-card',
                attributes: {
                    type: 'button',
                    'data-category-card-tab': tab.id,
                },
            });
            card.append(
                createElement('span', {
                    className: 'mod-category-card-title',
                    text: tab.title,
                }),
                createElement('span', {
                    className: 'mod-category-card-description',
                    text: tab.description,
                }),
                createElement('span', {
                    className: 'mod-category-card-arrow',
                    text: '›',
                })
            );
            grid.append(card);
        }
        panel.replaceChildren(header, grid);
    }
    ensureCategoryExpandedForTab(tabId) {
        const meta = this.getNavigationTabMeta(tabId);
        if (!meta?.category) return;
        this.toggleCategory(meta.category, true);
    }
    updateCategoryActiveState(tabId = null, explicitCategory = null) {
        if (!this.root) return;
        for (const button of this.root.querySelectorAll('[data-nav-category]')) {
            button.classList.remove('mod_category_active');
        }
        const category = explicitCategory ?? this.getNavigationTabMeta(tabId)?.category;
        if (!category) return;
        const button = this.root.querySelector(`[data-nav-category="${CSS.escape(category)}"]`);
        button?.classList.add('mod_category_active');
    }
    readRecentTabs() {
        const value = readLocalJson(STORAGE.recentTabs, []);
        if (!Array.isArray(value)) return [];
        return value.filter((tabId) => typeof tabId === 'string' && this.getNavigationTabMeta(tabId));
    }
    rememberRecentTab(tabId) {
        if (!this.getNavigationTabMeta(tabId)) return;
        const current = this.readRecentTabs().filter((id) => id !== tabId);
        current.unshift(tabId);
        const next = current.slice(0, 5);
        writeLocalJson(STORAGE.recentTabs, next);
        this.renderRecentAccess();
    }
    renderRecentAccess() {
        const container = this.root?.querySelector('#mod-recent-access');
        if (!(container instanceof HTMLElement)) return;
        container.replaceChildren();
        const recent = this.readRecentTabs().slice(0, 3);
        if (!recent.length) {
            container.append(
                createElement('span', {
                    className: 'home-recent-empty',
                    text: 'Pages you open will appear here.',
                })
            );
            return;
        }
        for (const tabId of recent) {
            const meta = this.getNavigationTabMeta(tabId);
            if (!meta) continue;
            container.append(
                createElement('button', {
                    className: 'home-recent-item',
                    text: meta.title,
                    attributes: {
                        type: 'button',
                        'data-recent-tab': tabId,
                    },
                })
            );
        }
    }
    bindLauncher() {
        const findLauncher = () => {
            const container = document.querySelector('#clans_and_settings');
            if (!(container instanceof HTMLElement)) return null;
            const buttons = container.querySelectorAll('button');
            if (buttons[1] instanceof HTMLButtonElement) return buttons[1];
            const labelled = container.querySelector(
                'button[aria-label*="setting" i], button[title*="setting" i], button[id*="setting" i]'
            );
            return labelled instanceof HTMLButtonElement ? labelled : null;
        };
        const bind = () => {
            const launcher = findLauncher();
            if (!(launcher instanceof HTMLButtonElement)) return false;
            if (this.launcher === launcher && this.launcherDisposer) return true;
            if (this.launcherDisposer) {
                this.resources.remove(this.launcherDisposer);
                this.launcherDisposer();
                this.launcherDisposer = null;
            }
            const inlineHandler = launcher.getAttribute('onclick');
            launcher.removeAttribute('onclick');
            // Capture the click before Sigmally's native settings handler.
            const onClick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                this.open();
            };
            launcher.addEventListener('click', onClick, true);
            this.launcher = launcher;
            const dispose = () => {
                launcher.removeEventListener('click', onClick, true);
                if (inlineHandler === null) launcher.removeAttribute('onclick');
                else launcher.setAttribute('onclick', inlineHandler);
                if (this.launcher === launcher) this.launcher = null;
                if (this.launcherDisposer === dispose) this.launcherDisposer = null;
            };
            this.launcherDisposer = this.resources.add(dispose);
            return true;
        };
        bind();
        // The game may rebuild the menu and replace the settings button.
        let observedRoot = document.querySelector(SELECTORS.menuWrapper) ?? document.body;
        const observer = new MutationObserver(() => {
            const nextRoot = document.querySelector(SELECTORS.menuWrapper) ?? document.body;
            if (nextRoot instanceof HTMLElement && nextRoot !== observedRoot) {
                observer.disconnect();
                observedRoot = nextRoot;
                observer.observe(document.body, {
                    childList: true,
                });
                if (observedRoot !== document.body)
                    observer.observe(observedRoot, {
                        childList: true,
                        subtree: true,
                    });
            }
            bind();
        });
        this.resources.observe(observer, document.body, {
            childList: true,
        });
        if (observedRoot !== document.body)
            observer.observe(observedRoot, {
                childList: true,
                subtree: true,
            });
    }
    handleClick(event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const searchResult = target.closest('[data-home-search-result]');
        if (searchResult instanceof HTMLButtonElement) {
            this.openHomeSearchResult(searchResult.dataset.homeSearchResult);
            return;
        }
        const recent = target.closest('[data-recent-tab]');
        if (recent instanceof HTMLButtonElement) {
            this.openTab(recent.dataset.recentTab);
            return;
        }
        const categoryCard = target.closest('[data-category-card-tab]');
        if (categoryCard instanceof HTMLButtonElement) {
            this.openTab(categoryCard.dataset.categoryCardTab);
            return;
        }
        const categoryButton = target.closest('[data-nav-category]');
        if (categoryButton instanceof HTMLButtonElement) {
            this.openCategory(categoryButton.dataset.navCategory, true);
            return;
        }
        const tabButton = target.closest('[data-mod-tab]');
        if (tabButton instanceof HTMLElement) {
            this.openTab(tabButton.dataset.modTab);
            return;
        }
        if (target.closest('[data-menu-close]') || target === this.root) {
            this.close();
            return;
        }
        const settingName = target.closest('.setting-card-name');
        if (settingName instanceof HTMLElement) {
            const wrapper = settingName.closest('.setting-card-wrapper');
            const parameters = wrapper?.querySelector('.setting-parameters');
            if (parameters instanceof HTMLElement) {
                parameters.style.display = parameters.style.display === 'none' ? 'block' : 'none';
            }
            return;
        }
        const scopeOption = target.closest('.settings-scope-option');
        if (scopeOption instanceof HTMLButtonElement) {
            scopeOption.classList.toggle('active');
            return;
        }
        if (target.closest('#resetSettings')) {
            const scopes = this.getSelectedScopes('reset');
            if (!scopes.length) return;
            if (confirm('Reset selected settings? The page will reload.')) {
                if (scopes.includes('sigmod')) this.app.settingsStore.reset();
                if (scopes.includes('game')) localStorage.removeItem(STORAGE.gameSettings);
                if (scopes.includes('sigfix')) localStorage.removeItem('sigfix');
                location.reload();
            }
            return;
        }
        if (target.closest('#resetModSettings')) {
            if (confirm('Reset all SigMod settings? The page will reload.')) {
                this.app.settingsStore.reset();
                location.reload();
            }
            return;
        }
        if (target.closest('#resetGameSettings')) {
            if (confirm('Reset all Sigmally game settings? The page will reload.')) {
                localStorage.removeItem(STORAGE.gameSettings);
                location.reload();
            }
            return;
        }
        if (target.closest('#resetSigFixSettings')) {
            if (confirm('Reset all SigFixes settings? The page will reload.')) {
                localStorage.removeItem('sigfix');
                location.reload();
            }
            return;
        }
        if (target.closest('#exportSettings')) {
            const scopes = this.getSelectedScopes('backup');
            if (!scopes.length) return;
            this.exportSettings(scopes);
            return;
        }
        if (target.closest('#importSettings')) {
            const input = this.root?.querySelector('#settingsImportFile');
            if (input instanceof HTMLInputElement) input.click();
            return;
        }
        if (target.closest('#reset_input_radius')) {
            this.app.settingsStore.set('themes.inputBorderRadius', '4px');
            this.syncSettings();
            return;
        }
        if (target.closest('#reset_menu_radius')) {
            this.app.settingsStore.set('themes.menuBorderRadius', '15px');
            this.syncSettings();
        }
    }
    readStoredSettings(key) {
        return this.settingsIO.readStoredSettings(key);
    }
    getSelectedScopes(row) {
        return this.settingsIO.getSelectedScopes(row);
    }
    selectedScopePayload(scopes) {
        return this.settingsIO.selectedScopePayload(scopes);
    }
    buildSettingsExport() {
        return this.settingsIO.buildSettingsExport();
    }
    exportSettings(scopes = ['game', 'sigmod', 'sigfix']) {
        return this.settingsIO.exportSettings(scopes);
    }
    importSections(payload) {
        return this.settingsIO.importSections(payload);
    }
    get homeSearchTargets() {
        return this.homeSearch.targets;
    }
    get homeSearchSequence() {
        return this.homeSearch.sequence;
    }
    set homeSearchSequence(value) {
        this.homeSearch.sequence = value;
    }
    setupHomeSearch() {
        return this.homeSearch.setupHomeSearch();
    }
    closeHomeSearch() {
        return this.homeSearch.closeHomeSearch();
    }
    renderHomeSearch(rawQuery) {
        return this.homeSearch.renderHomeSearch(rawQuery);
    }
    openHomeSearchResult(id) {
        return this.homeSearch.openHomeSearchResult(id);
    }
    bindingDisplay(value) {
        return this.keybinds.bindingDisplay(value);
    }
    isManagedKeybind(input) {
        return this.keybinds.isManagedKeybind(input);
    }
    setupKeybindRecorder() {
        return this.keybinds.setupKeybindRecorder();
    }
    updateKeybindingConflicts() {
        return this.keybinds.updateKeybindingConflicts();
    }
    findKeybindingConflicts(path, value) {
        return this.keybinds.findKeybindingConflicts(path, value);
    }
    askKeybindingConflict(path, value, labels) {
        return this.keybinds.askKeybindingConflict(path, value, labels);
    }
    handleSettingInput(event) {
        return this.settingsIO.handleSettingInput(event);
    }
    updateInstantSplit(source) {
        return this.settingsIO.updateInstantSplit(source);
    }
    syncSettings() {
        return this.settingsIO.syncSettings();
    }
    readGameSettings() {
        return this.settingsIO.readGameSettings();
    }
    updateMacroSpeedLabel() {
        return this.settingsIO.updateMacroSpeedLabel();
    }
    updatePartySliderLabels() {
        return this.settingsIO.updatePartySliderLabels();
    }
    open() {
        if (!this.root) return;
        this.app.i18n?.apply();
        clearTimeout(this.hideTimer);
        this.root.style.display = 'flex';
        this.root.setAttribute('aria-hidden', 'false');
        this.root.style.opacity = '1';
        this.root.dispatchEvent(
            new CustomEvent('sigmod:menuopen', {
                bubbles: true,
                detail: { tabId: this.activeTab },
            })
        );
        this.menuMotion ??= new OverlayMotion(this.root, this.root.querySelector('.mod_menu_wrapper'), this.resources);
        this.menuMotion.play(true);
        this.root.querySelector('.mod_selected')?.focus();
    }
    close() {
        if (!this.root) return;
        clearTimeout(this.hideTimer);
        this.root.setAttribute('aria-hidden', 'true');
        this.menuMotion ??= new OverlayMotion(this.root, this.root.querySelector('.mod_menu_wrapper'), this.resources);
        this.menuMotion.play(false, () => {
            if (this.root?.getAttribute('aria-hidden') === 'true') {
                this.root.style.display = 'none';
                this.root.style.opacity = '0';
            }
        });
    }
    toggle() {
        if (this.isOpen()) this.close();
        else this.open();
    }
    isOpen() {
        return this.root?.getAttribute('aria-hidden') === 'false';
    }
    handleExternalTabClick(event) {
        const target = event.target;
        if (!(target instanceof Element) || !this.root) return;
        const button = target.closest('.mod_menu_navbar .mod_nav_btn');
        if (
            !(button instanceof HTMLElement) ||
            button.hasAttribute('data-mod-tab') ||
            button.hasAttribute('data-nav-managed') ||
            !button.closest('[data-nav-external-slot]')
        )
            return;
        const content = this.root.querySelector('.mod_menu_content');
        if (!(content instanceof HTMLElement)) return;
        // SigFixes injects its panel as a direct .mod_tab without data-mod-panel.
        const panel = [...content.querySelectorAll(':scope > .mod_tab:not([data-mod-panel])')].find((item) => item instanceof HTMLElement);
        if (!(panel instanceof HTMLElement)) return;
        // Stop SigFixes' fade timer from reopening an inactive panel.
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.externalTabActive = true;
        this.activeCategory = null;
        this.updateCategoryActiveState();
        this.switchTabPanel(panel, button, true);
    }
    getTabPanels() {
        if (!this.root) return [];
        const content = this.root.querySelector('.mod_menu_content');
        const nodes =
            content instanceof HTMLElement ? content.querySelectorAll(':scope > .mod_tab') : this.root.querySelectorAll('.mod_tab');
        return [...nodes].filter((item) => item instanceof HTMLElement);
    }
    getVisibleTabPanel() {
        return (
            this.getTabPanels().find(
                (item) => !item.hidden && item.style.display !== 'none' && getComputedStyle(item).display !== 'none'
            ) ?? null
        );
    }
    switchTabPanel(panel, navButton = null, animate = true) {
        if (!this.root || !(panel instanceof HTMLElement)) return;
        const tabs = this.getTabPanels();
        const previous = this.getVisibleTabPanel();
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const shouldAnimate = animate && !reducedMotion && previous && previous !== panel;
        const token = ++this.tabTransitionToken;
        for (const button of this.root.querySelectorAll('.mod_menu_navbar .mod_nav_btn')) {
            const active = button === navButton;
            button.classList.toggle('mod_selected', active);
            button.setAttribute('aria-selected', String(active));
        }
        const showTarget = () => {
            if (token !== this.tabTransitionToken) return;
            for (const item of tabs) {
                if (item === panel) continue;
                item.hidden = true;
                item.style.display = 'none';
                item.style.opacity = '0';
                item.style.transform = 'translateX(24px)';
            }
            panel.hidden = false;
            panel.style.display = 'flex';
            if (!shouldAnimate) {
                panel.style.opacity = '1';
                panel.style.transform = 'translateX(0)';
                this.tabTransitioning = false;
                return;
            }
            panel.style.transition = 'none';
            panel.style.opacity = '0';
            panel.style.transform = 'translateX(-24px)';
            void panel.offsetWidth;
            panel.style.transition = '';
            requestAnimationFrame(() => {
                if (token !== this.tabTransitionToken) return;
                panel.style.opacity = '1';
                panel.style.transform = 'translateX(0)';
                window.setTimeout(() => {
                    if (token !== this.tabTransitionToken) return;
                    this.tabTransitioning = false;
                    if (!this.externalTabActive) {
                        for (const item of tabs) {
                            if (item !== panel && !item.matches('[data-mod-panel]')) {
                                item.hidden = true;
                                item.style.display = 'none';
                                item.style.opacity = '0';
                            }
                        }
                    }
                }, 210);
            });
        };
        if (!shouldAnimate) {
            this.tabTransitioning = false;
            showTarget();
            return;
        }
        this.tabTransitioning = true;
        previous.hidden = false;
        previous.style.display = 'flex';
        previous.style.opacity = '0';
        previous.style.transform = 'translateX(24px)';
        window.setTimeout(() => {
            if (token !== this.tabTransitionToken) return;
            previous.hidden = true;
            previous.style.display = 'none';
            showTarget();
        }, 160);
    }
    openTab(tabId, notify = true, animate = true) {
        if (!this.root) return;
        const panel = this.root.querySelector(`#${tabId}`);
        if (!(panel instanceof HTMLElement) || !panel.matches('[data-mod-panel]')) return;
        this.externalTabActive = false;
        this.activeCategory = null;
        this.ensureCategoryExpandedForTab(tabId);
        this.updateCategoryActiveState(tabId);
        const navButton = this.root.querySelector(`.mod_menu_navbar .mod_nav_btn[data-mod-tab="${CSS.escape(tabId)}"]`);
        this.switchTabPanel(panel, navButton instanceof HTMLElement ? navButton : null, animate);
        this.activeTab = tabId;
        if (notify) this.rememberRecentTab(tabId);
        if (notify) {
            this.root.dispatchEvent(
                new CustomEvent('sigmod:tabchange', {
                    bubbles: true,
                    detail: { tabId },
                })
            );
        }
    }
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Menu subcomponents: bindings, search, and settings transfer                       ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
class MouseBindingEditor {
    constructor(app, resources, getRoot, getActiveTab) {
        this.app = app;
        this.resources = resources;
        this.getRoot = typeof getRoot === 'function' ? getRoot : () => null;
        this.getActiveTab = typeof getActiveTab === 'function' ? getActiveTab : () => 'mod_home';
        this.activeMouseButton = 0;
        this.detectedMouseButtons = new Set(STANDARD_MOUSE_BUTTONS.map(({ button }) => button));
    }
    get root() {
        return this.getRoot();
    }
    message(source, parameters = null) {
        return this.app.i18n?.message(source, parameters) ?? source;
    }
    createMouseBindingPanel() {
        const page = createElement('div', {
            className: 'settings-page mouse-binding-page',
        });
        page.innerHTML = `<section class="settings-section mouse-binding-section">
                <div class="settings-section-title">Mouse actions</div>
                <p class="mouse-binding-hint">Click a button on the mouse, then choose its action.</p>
                <div class="mouse-binding-workspace">
                    <div class="mouse-visual-wrap">
                        <svg class="mouse-visual" viewBox="0 0 360 440" role="group" aria-label="Interactive mouse button map">
                            <defs><linearGradient id="sigmod-mouse-shell" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#30343e"></stop><stop offset="1" stop-color="#181b22"></stop></linearGradient></defs>
                            <path class="mouse-shell" d="M180 34C119 34 88 79 88 153v128c0 80 39 129 92 129s92-49 92-129V153c0-74-31-119-92-119Z"></path>
                            <path class="mouse-divider" d="M180 35v137M89 172h182"></path>
                            <g class="mouse-button-region" data-mouse-button="0" tabindex="0" role="button" aria-label="Left mouse button"><path d="M177 43c-50 2-79 38-81 104v18h81Z"></path></g>
                            <g class="mouse-button-region" data-mouse-button="2" tabindex="0" role="button" aria-label="Right mouse button"><path d="M183 43c50 2 79 38 81 104v18h-81Z"></path></g>
                            <g class="mouse-button-region mouse-wheel-region" data-mouse-button="1" tabindex="0" role="button" aria-label="Middle mouse button"><rect x="166" y="65" width="28" height="72" rx="14"></rect><path d="M180 76v17M180 107v17"></path></g>
                            <g class="mouse-button-region mouse-side-region" data-mouse-button="4" tabindex="0" role="button" aria-label="Forward mouse button"><rect x="76" y="206" width="23" height="52" rx="9"></rect></g>
                            <g class="mouse-button-region mouse-side-region" data-mouse-button="3" tabindex="0" role="button" aria-label="Back mouse button"><rect x="77" y="271" width="22" height="45" rx="9"></rect></g>
                            <g class="mouse-callout" data-mouse-button="0"><path d="M120 104H35V78"></path><text x="8" y="55">Left</text><text class="mouse-callout-action" data-mouse-assignment="0" x="8" y="72">None</text></g>
                            <g class="mouse-callout" data-mouse-button="1"><path d="M180 65V22"></path><text text-anchor="middle" x="180" y="12">Middle</text><text class="mouse-callout-action" data-mouse-assignment="1" text-anchor="middle" x="180" y="29">None</text></g>
                            <g class="mouse-callout" data-mouse-button="2"><path d="M240 104h85V78"></path><text text-anchor="end" x="352" y="55">Right</text><text class="mouse-callout-action" data-mouse-assignment="2" text-anchor="end" x="352" y="72">None</text></g>
                            <g class="mouse-callout" data-mouse-button="4"><path d="M77 230H20v-35"></path><text x="8" y="187">Forward</text><text class="mouse-callout-action" data-mouse-assignment="4" x="8" y="204">None</text></g>
                            <g class="mouse-callout" data-mouse-button="3"><path d="M78 293H20v35"></path><text x="8" y="347">Back</text><text class="mouse-callout-action" data-mouse-assignment="3" x="8" y="364">None</text></g>
                        </svg>
                    </div>
                    <aside class="mouse-binding-editor" aria-live="polite" data-quick-access-exclude>
                        <strong id="mouse-binding-title">Left mouse button</strong>
                        <label for="mouse-action-select">Action</label>
                        <select id="mouse-action-select" class="form-control macro-extended-input">${this.mouseActionOptions()}</select>
                        <p class="mouse-editor-help">You can also press a side button here to select it.</p>
                    </aside>
                </div>
                <div class="mouse-extra-panel" hidden>
                    <div><strong>Extra buttons</strong></div>
                    <div id="mouse-extra-buttons" class="mouse-extra-buttons"></div>
                </div>
            </section>`;
        return page;
    }
    mouseActionOptions() {
        return MOUSE_ACTIONS.map(({ value, label }) => `<option value="${value ?? ''}">${this.message(label)}</option>`).join('');
    }
    mouseActionLabel(action) {
        return this.message(MOUSE_ACTIONS.find((candidate) => candidate.value === action)?.label ?? 'None');
    }
    mouseButtonLabel(button) {
        const meta = this.mouseButtonMeta(button);
        return button > 4 ? this.message('Extra button {button}', { button }) : this.message(`${meta.name} button`);
    }
    mouseButtonMeta(button) {
        const standard = STANDARD_MOUSE_BUTTONS.find((entry) => entry.button === button);
        return (
            standard ?? {
                button,
                name: `Extra ${button}`,
                code: `Button ${button}`,
            }
        );
    }
    mouseBindingAction(button) {
        return this.app.settings.macros.mouse.bindings.find((binding) => binding.button === button)?.action ?? null;
    }
    setMouseBinding(button, action) {
        const allowed = MOUSE_ACTIONS.some((candidate) => candidate.value === action);
        if (!allowed) return;
        this.app.settingsStore.update((settings) => {
            const bindings = settings.macros.mouse.bindings;
            const index = bindings.findIndex((binding) => binding.button === button);
            if (index >= 0) bindings.splice(index, 1);
            if (action) bindings.push({ button, action });
        }, true);
        this.renderMouseBindingEditor();
        this.root?.dispatchEvent(
            new CustomEvent('sigmod:settingchange', {
                bubbles: true,
                detail: { path: `macros.mouse.bindings.${button}`, action },
            })
        );
    }
    setupMouseBindingEditor() {
        if (!this.root) return;
        const panel = this.root.querySelector('#mod_controls_mouse');
        if (!(panel instanceof HTMLElement)) return;
        const activate = (button) => {
            if (!Number.isSafeInteger(button) || button < 0) return;
            this.detectedMouseButtons.add(button);
            this.activeMouseButton = button;
            this.renderMouseBindingEditor();
        };
        this.resources.listen(panel, 'click', (event) => {
            const target = event.target instanceof Element ? event.target.closest('[data-mouse-button]') : null;
            if (target) activate(Number(target.dataset.mouseButton));
        });
        this.resources.listen(panel, 'keydown', (event) => {
            if (!['Enter', ' '].includes(event.key)) return;
            const target = event.target instanceof Element ? event.target.closest('[data-mouse-button]') : null;
            if (!target) return;
            event.preventDefault();
            activate(Number(target.dataset.mouseButton));
            panel.querySelector('#mouse-action-select')?.focus();
        });
        this.resources.listen(panel, 'change', (event) => {
            const select = event.target;
            if (!(select instanceof HTMLSelectElement) || select.id !== 'mouse-action-select') return;
            this.setMouseBinding(this.activeMouseButton, select.value || null);
        });
        this.resources.listen(
            panel,
            'mousedown',
            (event) => {
                if (event.button === 0) return;
                event.preventDefault();
                activate(event.button);
            },
            true
        );
        this.resources.listen(panel, 'auxclick', (event) => event.preventDefault());
        this.resources.listen(panel, 'contextmenu', (event) => event.preventDefault());
        this.resources.listen(document, 'sigmod:mousebuttondetected', (event) => {
            const button = Number(event.detail?.button);
            if (!Number.isSafeInteger(button) || button < 0) return;
            this.detectedMouseButtons.add(button);
            this.renderMouseBindingEditor();
        });
        this.resources.listen(document, 'sigmod:languagechange', () => {
            const select = this.root?.querySelector('#mouse-action-select');
            if (select instanceof HTMLSelectElement) select.innerHTML = this.mouseActionOptions();
            this.renderMouseBindingEditor();
        });
        this.renderMouseBindingEditor();
    }
    renderMouseBindingEditor() {
        const panel = this.root?.querySelector('#mod_controls_mouse');
        if (!(panel instanceof HTMLElement)) return;
        const action = this.mouseBindingAction(this.activeMouseButton);
        const actionLabel = this.mouseActionLabel(action);
        const title = panel.querySelector('#mouse-binding-title');
        const select = panel.querySelector('#mouse-action-select');
        if (title) title.textContent = this.mouseButtonLabel(this.activeMouseButton);
        if (select instanceof HTMLSelectElement) select.value = action ?? '';
        for (const target of panel.querySelectorAll('[data-mouse-button]')) {
            const button = Number(target.dataset.mouseButton);
            target.classList.toggle('is-active', button === this.activeMouseButton);
            if (target.getAttribute('role') === 'button') target.setAttribute('aria-pressed', String(button === this.activeMouseButton));
            target.classList.toggle('is-assigned', Boolean(this.mouseBindingAction(button)));
        }
        for (const label of panel.querySelectorAll('[data-mouse-assignment]')) {
            const button = Number(label.dataset.mouseAssignment);
            const assigned = this.mouseBindingAction(button);
            label.textContent = assigned ? this.mouseActionLabel(assigned) : this.message('None');
        }
        const extra = panel.querySelector('#mouse-extra-buttons');
        if (!(extra instanceof HTMLElement)) return;
        const buttons = new Set(this.app.settings.macros.mouse.bindings.map((binding) => binding.button));
        for (const button of this.detectedMouseButtons) buttons.add(button);
        const additional = [...buttons].filter((button) => button > 4).sort((left, right) => left - right);
        extra.closest('.mouse-extra-panel').hidden = additional.length === 0;
        if (!additional.length) {
            extra.replaceChildren();
            return;
        }
        extra.replaceChildren(
            ...additional.map((button) => {
                const assignment = this.mouseBindingAction(button);
                const row = createElement('button', {
                    className: 'mouse-extra-button',
                    attributes: {
                        type: 'button',
                        'data-mouse-button': String(button),
                        'aria-pressed': String(button === this.activeMouseButton),
                    },
                });
                row.classList.toggle('is-active', button === this.activeMouseButton);
                row.classList.toggle('is-assigned', Boolean(assignment));
                row.append(
                    createElement('span', {
                        text: this.message('Button {button}', { button }),
                    }),
                    createElement('strong', {
                        text: this.mouseActionLabel(assignment),
                    })
                );
                return row;
            })
        );
        if (title) title.textContent = this.mouseButtonLabel(this.activeMouseButton);
        if (select instanceof HTMLSelectElement) select.value = action ?? '';
        if (actionLabel && this.activeMouseButton > 4) extra.setAttribute('data-active-action', actionLabel);
    }
}
class KeybindRecorder {
    constructor(app, resources, getRoot) {
        this.app = app;
        this.resources = resources;
        this.getRoot = typeof getRoot === 'function' ? getRoot : () => null;
    }
    message(source, parameters = null) {
        return this.app.i18n?.message(source, parameters) ?? source;
    }
    get root() {
        return this.getRoot();
    }
    bindingDisplay(value) {
        const binding = unwrapSettingScalar(value);
        if (typeof binding !== 'string' || !binding.length) return '';
        const labels = {
            ' ': 'Space',
            tab: 'Tab',
            shift: 'Shift',
            control: 'Ctrl',
            alt: 'Alt',
            meta: 'Meta',
            enter: 'Enter',
            escape: 'Esc',
            arrowup: '↑',
            arrowdown: '↓',
            arrowleft: '←',
            arrowright: '→',
            backspace: 'Backspace',
            delete: 'Delete',
        };
        const normalized = binding.toLowerCase();
        return (
            labels[normalized] ??
            (normalized.startsWith(KEYBIND_CODE_PREFIX)
                ? keybindCodeLabel(normalized)
                : binding.length === 1
                  ? binding.toUpperCase()
                  : binding)
        );
    }
    /** @param {EventTarget|null} input */
    isManagedKeybind(input) {
        return (
            input instanceof HTMLInputElement && input.classList.contains('keybinding') && input.dataset.setting?.startsWith('macros.keys.')
        );
    }
    setupKeybindRecorder() {
        if (!this.root) return;
        this.syncKeybindLabels();
        this.resources.listen(document, 'sigmod:languagechange', () => this.syncKeybindLabels());
        this.resources.listen(this.root, 'focusin', (event) => {
            const input = event.target;
            if (!this.isManagedKeybind(input)) return;
            input.dataset.recording = 'true';
            input.value = this.message('Press a key…');
            input.classList.add('is-recording');
        });
        this.resources.listen(this.root, 'focusout', (event) => {
            const input = event.target;
            if (!this.isManagedKeybind(input)) return;
            if (input.dataset.recording === 'true') {
                input.dataset.recording = 'false';
                input.value = this.bindingDisplay(this.app.settingsStore.get(input.dataset.setting));
                input.classList.remove('is-recording');
            }
        });
        this.resources.listen(
            this.root,
            'keydown',
            async (event) => {
                const input = event.target;
                if (!this.isManagedKeybind(input)) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) return;
                const path = input.dataset.setting;
                if (!path) return;
                if (event.key === 'Escape') {
                    input.dataset.recording = 'false';
                    input.classList.remove('is-recording');
                    input.value = this.bindingDisplay(this.app.settingsStore.get(path));
                    input.blur();
                    return;
                }
                const clearBinding =
                    event.key === 'Backspace' ||
                    event.key === 'Delete' ||
                    event.code === 'Backspace' ||
                    event.code === 'Delete' ||
                    event.keyCode === 8 ||
                    event.keyCode === 46;
                const value = clearBinding ? null : keybindValueFromEvent(event);
                if (value === null && !clearBinding) return;
                const conflicts = value === null ? [] : this.findKeybindingConflicts(path, value);
                if (conflicts.length) {
                    const decision = await this.askKeybindingConflict(path, value, conflicts);
                    if (decision === 'cancel') {
                        input.value = this.bindingDisplay(this.app.settingsStore.get(path));
                        input.dataset.recording = 'false';
                        input.blur();
                        return;
                    }
                    if (decision === 'reassign') {
                        for (const candidate of document.querySelectorAll('.keybinding[data-setting^="macros.keys."]')) {
                            const binding =
                                candidate instanceof HTMLInputElement
                                    ? unwrapSettingScalar(this.app.settingsStore.get(candidate.dataset.setting))
                                    : null;
                            if (
                                candidate instanceof HTMLInputElement &&
                                candidate.dataset.setting !== path &&
                                typeof binding === 'string' &&
                                binding.toLowerCase() === value
                            )
                                this.app.settingsStore.set(candidate.dataset.setting, null, true);
                        }
                    }
                }
                this.app.settingsStore.set(path, value, true);
                input.dataset.bindingValue = value ?? '';
                input.dataset.recording = 'false';
                input.classList.remove('is-recording');
                input.value = this.bindingDisplay(value);
                this.updateKeybindingConflicts();
                this.root?.dispatchEvent(
                    new CustomEvent('sigmod:settingchange', {
                        bubbles: true,
                        detail: { path, value },
                    })
                );
                input.blur();
            },
            true
        );
    }
    syncKeybindLabels() {
        if (!this.root) return;
        for (const input of this.root.querySelectorAll('.keybinding[data-setting^="macros.keys."]')) {
            if (!(input instanceof HTMLInputElement)) continue;
            input.readOnly = true;
            input.removeAttribute('maxlength');
            input.autocomplete = 'off';
            const label = input.dataset.label || 'Keybind';
            input.setAttribute('aria-label', `${this.message(label)} ${this.message('keybind')}`);
        }
        this.updateKeybindingConflicts();
    }
    updateKeybindingConflicts() {
        if (!this.root) return;
        for (const badge of this.root.querySelectorAll('.keybinding-conflict')) badge.remove();
        const groups = new Map();
        for (const input of this.root.querySelectorAll('.keybinding[data-setting]')) {
            if (!(input instanceof HTMLInputElement)) continue;
            input.classList.remove('is-conflict');
            input.removeAttribute('data-conflict');
            input.title = this.message(
                'Click and press a key. Dead or unidentified keys use their physical keyboard position. Backspace/Delete clears it.'
            );
            const value = unwrapSettingScalar(this.app.settingsStore.get(input.dataset.setting));
            if (typeof value !== 'string' || !value.length) continue;
            const key = value.toLowerCase();
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(input);
        }
        for (const inputs of groups.values()) {
            if (inputs.length < 2) continue;
            for (const input of inputs) {
                const others = inputs
                    .filter((candidate) => candidate !== input)
                    .map((candidate) => this.message(candidate.dataset.label || candidate.name || 'another action'));
                const message = this.message('Already used by {actions}', {
                    actions: others.join(', '),
                });
                input.classList.add('is-conflict');
                input.dataset.conflict = message;
                input.title = message;
                const badge = createElement('span', {
                    className: 'keybinding-conflict',
                    text: message,
                });
                input.parentElement?.append(badge);
            }
        }
    }
    findKeybindingConflicts(path, value) {
        if (typeof value !== 'string' || !value.length) return [];
        const conflicts = [];
        for (const input of document.querySelectorAll('.keybinding[data-setting^="macros.keys."]')) {
            if (!(input instanceof HTMLInputElement) || input.dataset.setting === path) continue;
            const binding = unwrapSettingScalar(this.app.settingsStore.get(input.dataset.setting));
            if (typeof binding === 'string' && binding.toLowerCase() === value)
                conflicts.push(input.dataset.label || input.name || input.dataset.setting);
        }
        return conflicts;
    }
    askKeybindingConflict(path, value, labels) {
        const modal = this.app.features.get('modal');
        if (!modal) return Promise.resolve('cancel');
        const body = createElement('div', {
            className: 'keybinding-conflict-dialog',
        });
        body.append(
            createElement('strong', {
                text: this.message('Duplicate keybinding detected'),
            }),
            createElement('p', {
                text: this.message('The key {key} is already assigned to {actions}.', {
                    key: this.bindingDisplay(value),
                    actions: labels.map((label) => this.message(label)).join(', '),
                }),
            }),
            createElement('p', {
                text: this.message('Reassign it to this action, or cancel this change. Each key can control only one action.'),
            })
        );
        const actions = createElement('div', { className: 'flex g-5' });
        const cancel = createElement('button', {
            className: 'modButton',
            text: this.message('Cancel'),
            attributes: { type: 'button' },
        });
        const reassign = createElement('button', {
            className: 'modButton',
            text: this.message('Yes, Reassign'),
            attributes: { type: 'button' },
        });
        actions.append(cancel, reassign);
        body.append(actions);
        modal.open('keybinding-conflict', body, {
            className: 'modAlert keybinding-conflict-modal',
        });
        return new Promise((resolve) => {
            const finish = (result) => {
                modal.close('keybinding-conflict');
                resolve(result);
            };
            cancel.addEventListener('click', () => finish('cancel'), {
                once: true,
            });
            reassign.addEventListener('click', () => finish('reassign'), {
                once: true,
            });
        });
    }
}
class HomeSearch {
    constructor(app, resources, menu) {
        this.app = app;
        this.resources = resources;
        this.menu = menu;
        this.targets = new Map();
        this.sequence = 0;
    }
    get root() {
        return this.menu.root;
    }
    get homeSearchTargets() {
        return this.targets;
    }
    get homeSearchSequence() {
        return this.sequence;
    }
    set homeSearchSequence(value) {
        this.sequence = value;
    }
    get activeCategory() {
        return this.menu.activeCategory;
    }
    set activeCategory(value) {
        this.menu.activeCategory = value;
    }
    get externalTabActive() {
        return this.menu.externalTabActive;
    }
    set externalTabActive(value) {
        this.menu.externalTabActive = value;
    }
    syncSearchLabel() {
        const input = this.root?.querySelector('#sigmod-home-search');
        if (!(input instanceof HTMLInputElement)) return;
        const source = this.menu.hasSigFixes() ? 'Search SigMod and SigFixes...' : 'Search SigMod...';
        const label = this.app.i18n?.message(source) ?? source;
        input.placeholder = label;
        const ariaSource = source.replace(/\.\.\.$/, '');
        input.setAttribute('aria-label', this.app.i18n?.message(ariaSource) ?? ariaSource);
    }
    getNavigationTabMeta(panel) {
        return this.menu.getNavigationTabMeta(panel);
    }
    getTabPanels() {
        return this.menu.getTabPanels();
    }
    getVisibleTabPanel() {
        return this.menu.getVisibleTabPanel();
    }
    openTab(tabId, pushHistory, userInitiated) {
        return this.menu.openTab(tabId, pushHistory, userInitiated);
    }
    switchTabPanel(panel, navButton, pushHistory) {
        return this.menu.switchTabPanel(panel, navButton, pushHistory);
    }
    updateCategoryActiveState() {
        return this.menu.updateCategoryActiveState();
    }
    setupHomeSearch() {
        if (!this.root) return;
        const input = this.root.querySelector('#sigmod-home-search');
        const results = this.root.querySelector('#sigmod-home-search-results');
        const wrap = this.root.querySelector('.home-search-wrap');
        if (!(input instanceof HTMLInputElement) || !(results instanceof HTMLElement) || !(wrap instanceof HTMLElement)) return;
        this.syncSearchLabel();
        this.resources.listen(input, 'input', () => this.renderHomeSearch(input.value));
        this.resources.listen(input, 'focus', () => {
            if (input.value.trim()) this.renderHomeSearch(input.value);
        });
        this.resources.listen(input, 'keydown', (event) => {
            if (event.key === 'Escape') {
                input.value = '';
                this.closeHomeSearch();
                return;
            }
            if (event.key === 'Enter') {
                const first = results.querySelector('[data-home-search-result]');
                if (first instanceof HTMLButtonElement) {
                    event.preventDefault();
                    first.click();
                }
                return;
            }
            if (event.key === 'ArrowDown') {
                const first = results.querySelector('[data-home-search-result]');
                if (first instanceof HTMLButtonElement) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });
        this.resources.listen(results, 'keydown', (event) => {
            const current = event.target;
            if (!(current instanceof HTMLButtonElement) || !current.matches('[data-home-search-result]')) return;
            const buttons = [...results.querySelectorAll('[data-home-search-result]')].filter(
                (button) => button instanceof HTMLButtonElement
            );
            const index = buttons.indexOf(current);
            if (event.key === 'ArrowDown' && index >= 0) {
                event.preventDefault();
                buttons[Math.min(index + 1, buttons.length - 1)]?.focus();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (index <= 0) input.focus();
                else buttons[index - 1]?.focus();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                input.focus();
                this.closeHomeSearch();
            }
        });
        this.resources.listen(document, 'pointerdown', (event) => {
            if (!(event.target instanceof Node) || wrap.contains(event.target)) return;
            this.closeHomeSearch();
        });
    }
    closeHomeSearch() {
        const results = this.root?.querySelector('#sigmod-home-search-results');
        const input = this.root?.querySelector('#sigmod-home-search');
        if (results instanceof HTMLElement) {
            results.hidden = true;
            results.replaceChildren();
        }
        if (input instanceof HTMLInputElement) input.setAttribute('aria-expanded', 'false');
        this.homeSearchTargets.clear();
    }
    renderHomeSearch(rawQuery) {
        if (!this.root) return;
        const input = this.root.querySelector('#sigmod-home-search');
        const results = this.root.querySelector('#sigmod-home-search-results');
        if (!(input instanceof HTMLInputElement) || !(results instanceof HTMLElement)) return;
        this.syncSearchLabel();
        const cleanText = (value) =>
            String(value ?? '')
                .replace(/\s+/g, ' ')
                .replace(/\s*[:：]\s*$/, '')
                .trim();
        const normalize = (value) =>
            cleanText(value)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[_./\\-]+/g, ' ')
                .replace(/[^a-z0-9]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        const query = normalize(rawQuery);
        if (!query) {
            this.closeHomeSearch();
            return;
        }
        const aliases = [
            ['sigfix', 'sigfixes', 'sig fixes', 'fixes'],
            ['fps', 'performance', 'lag', 'frame', 'draw delay'],
            ['darkmode', 'dark mode', 'dark', 'theme'],
            ['multibox', 'multiboxing', 'multi box', 'secondary tab', 'other tab'],
            ['keybind', 'keybinds', 'key', 'hotkey', 'bind', 'shortcut'],
            ['rapid feed', 'fast feed', 'feed', 'eject', 'eject mass'],
            ['respawn', 'spawn', 're spawn'],
            ['skin', 'skins', 'appearance'],
            ['background', 'wallpaper', 'map background', 'bg'],
            ['outline', 'outlines', 'border', 'stroke'],
            ['color', 'colour', 'theme color'],
            ['zoom', 'auto zoom', 'zoom speed'],
            ['chat', 'message', 'messages'],
            ['friend', 'friends', 'buddy'],
            ['stats', 'statistics', 'progress'],
            ['ad', 'ads', 'advert', 'advertisement'],
            ['opacity', 'transparent', 'transparency', 'alpha'],
            ['camera', 'view', 'viewport'],
            ['jelly', 'physics'],
            ['spectator', 'spectate', 'spectating'],
            ['name', 'nickname', 'nick'],
            ['macro', 'macros', 'control', 'controls', 'keyboard', 'keybind'],
            ['gallery', 'screenshot', 'screenshots', 'capture', 'image gallery'],
            ['interface', 'ui', 'hud', 'menu'],
            ['settings', 'general', 'preferences', 'options'],
            ['social', 'friends', 'discover', 'users', 'requests', 'profile', 'account'],
        ].map((group) => group.map(normalize));
        const queryTerms = query.split(' ').filter(Boolean);
        const queryConcepts = queryTerms.map((term) => {
            const variants = new Set([term]);
            for (const group of aliases) {
                if (group.some((item) => item === term || item.split(' ').includes(term))) {
                    for (const item of group) {
                        for (const word of item.split(' ')) variants.add(word);
                        variants.add(item);
                    }
                }
            }
            return [...variants].filter(Boolean);
        });
        const distance = (a, b, max) => {
            if (Math.abs(a.length - b.length) > max) return max + 1;
            const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
            for (let i = 1; i <= a.length; i += 1) {
                let left = i;
                let diagonal = i - 1;
                let rowMin = left;
                for (let j = 1; j <= b.length; j += 1) {
                    const up = previous[j];
                    const next = a[i - 1] === b[j - 1] ? diagonal : Math.min(diagonal, up, left) + 1;
                    diagonal = up;
                    previous[j] = next;
                    left = next;
                    rowMin = Math.min(rowMin, next);
                }
                if (rowMin > max) return max + 1;
            }
            return previous[b.length];
        };
        const matchVariant = (variant, title, haystack, titleTokens, allTokens) => {
            if (!variant) return 0;
            if (title === variant) return 100;
            if (title.startsWith(variant)) return 82;
            if (title.includes(variant)) return 72;
            if (haystack.includes(variant)) return 48;
            if (titleTokens.some((token) => token.startsWith(variant))) return 58;
            if (allTokens.some((token) => token.startsWith(variant))) return 34;
            if (variant.length >= 4) {
                const max = variant.length >= 7 ? 2 : 1;
                if (titleTokens.some((token) => distance(variant, token, max) <= max)) return 42;
                if (allTokens.some((token) => distance(variant, token, max) <= max)) return 22;
            }
            return 0;
        };
        const scoreEntry = (titleText, extraText) => {
            const title = normalize(titleText);
            const haystack = normalize(`${titleText} ${extraText}`);
            if (!title || !haystack) return 0;
            let score = 0;
            if (title === query) score += 180;
            else if (title.startsWith(query)) score += 130;
            else if (title.includes(query)) score += 105;
            else if (haystack.includes(query)) score += 55;
            const titleTokens = title.split(' ').filter(Boolean);
            const allTokens = [...new Set(haystack.split(' ').filter(Boolean))];
            for (const concept of queryConcepts) {
                let best = 0;
                for (const variant of concept) {
                    best = Math.max(best, matchVariant(variant, title, haystack, titleTokens, allTokens));
                }
                if (!best) return 0;
                score += best;
            }
            score -= Math.min(title.length, 80) / 80;
            return score;
        };
        const entries = [];
        const seen = new Set();
        const panels = this.getTabPanels();
        const externalPanels = panels.filter((panel) => !panel.matches('[data-mod-panel]'));
        const externalButtons = [...this.root.querySelectorAll('[data-nav-external-slot] .mod_nav_btn[data-external-nav]')].filter(
            (button) => button instanceof HTMLElement
        );
        const pathLabel = (path) =>
            cleanText(
                String(path ?? '')
                    .split('.')
                    .at(-1)
                    ?.replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/[-_]/g, ' ')
            );
        const elementSearchText = (element) => {
            if (!(element instanceof HTMLElement)) return '';
            const pieces = [
                element.textContent,
                element.id,
                element.getAttribute('name'),
                element.getAttribute('title'),
                element.getAttribute('aria-label'),
                element.getAttribute('placeholder'),
                element.dataset.setting,
                element.dataset.label,
            ];
            const row = element.closest('.modRowItems, .macroRow, .setting-card-wrapper, label');
            if (row instanceof HTMLElement) pieces.push(row.textContent);
            const help = row?.querySelector?.('#sfsm-helpbox, [id$="helpbox"]');
            if (help instanceof HTMLElement) pieces.push(help.textContent);
            for (const control of (row || element).querySelectorAll?.('input, select, button') ?? []) {
                if (!(control instanceof HTMLElement)) continue;
                pieces.push(
                    control.id,
                    control.getAttribute('name'),
                    control.getAttribute('title'),
                    control.getAttribute('aria-label'),
                    control.getAttribute('placeholder')
                );
                if (control instanceof HTMLSelectElement) {
                    pieces.push(...[...control.options].map((option) => option.textContent));
                }
            }
            return pieces.filter(Boolean).join(' ');
        };
        const addEntry = ({
            title,
            panel,
            tabId = '',
            tabName,
            navButton = null,
            target,
            kind = 'setting',
            extra = '',
            external = false,
        }) => {
            title = cleanText(title).replace(/^\(\?\)\s*/, '');
            if (!title || title === '...' || title.length > 90) return;
            const score = scoreEntry(title, `${extra} ${tabName}`);
            if (!score) return;
            const panelKey = external ? `external-${externalPanels.indexOf(panel)}` : tabId;
            const key = `${panelKey}|${normalize(title)}`;
            if (seen.has(key)) return;
            seen.add(key);
            entries.push({
                title,
                panel,
                tabId,
                tabName,
                navButton,
                target,
                kind,
                external,
                score,
            });
        };
        for (const panel of panels) {
            if (!(panel instanceof HTMLElement)) continue;
            if (panel.id === 'mod_category') continue;
            const external = !panel.matches('[data-mod-panel]');
            let tabId = external ? '' : panel.id;
            let navButton = null;
            if (external) {
                const index = externalPanels.indexOf(panel);
                navButton = externalButtons[index] ?? externalButtons[0] ?? null;
            } else if (tabId) {
                navButton = this.root.querySelector(`[data-mod-tab="${CSS.escape(tabId)}"]`);
            }
            const rawTabName = cleanText(navButton?.textContent);
            const navMeta = external ? null : this.getNavigationTabMeta(tabId);
            const tabName = rawTabName || navMeta?.title || (external ? 'Sig Fixes' : tabId.replace(/^mod_/, ''));
            const tabAliases = external
                ? 'SigFix SigFixes Sig Fixes fixes performance settings'
                : navMeta
                  ? `${navMeta.categoryTitle ?? ''} ${navMeta.category ?? ''}`
                  : '';
            if (external || tabId !== 'mod_home') {
                addEntry({
                    title: tabName,
                    panel,
                    tabId,
                    tabName,
                    navButton,
                    target: panel,
                    kind: 'section',
                    extra: `${tabAliases} ${panel.textContent}`,
                    external,
                });
            }
            for (const control of panel.querySelectorAll('[data-setting]')) {
                if (!(control instanceof HTMLElement)) continue;
                const path = control.dataset.setting || '';
                const row = control.closest('.setting-card-wrapper, .macroRow, .modRowItems, label');
                const label =
                    control.dataset.label ||
                    row?.querySelector?.('.setting-card-name, .text')?.textContent ||
                    control.closest('label')?.textContent ||
                    pathLabel(path);
                addEntry({
                    title: label,
                    panel,
                    tabId,
                    tabName,
                    navButton,
                    target: control,
                    extra: `${path} ${elementSearchText(control)}`,
                    external,
                });
            }
            for (const row of panel.querySelectorAll('.modRowItems')) {
                if (!(row instanceof HTMLElement)) continue;
                const first = row.querySelector(':scope > span:first-child');
                const title = cleanText(first?.textContent).replace(/^\(\?\)\s*/, '');
                if (!title || title.length < 2) continue;
                addEntry({
                    title,
                    panel,
                    tabId,
                    tabName,
                    navButton,
                    target: row,
                    extra: `${tabAliases} ${elementSearchText(row)}`,
                    external,
                });
            }
            const candidates = panel.querySelectorAll(
                '.setting-card-name, .macroRow .text, .modTitleText, ' +
                    'h2, h3, button:not(.mod_nav_btn):not([data-menu-close]), ' +
                    'span.text-center'
            );
            for (const candidate of candidates) {
                if (!(candidate instanceof HTMLElement)) continue;
                if (candidate.closest('.home-search-wrap')) continue;
                let title = cleanText(candidate.textContent)
                    .replace(/^•\s*/, '')
                    .replace(/\s*•$/, '')
                    .replace(/^\(\?\)\s*/, '');
                if (title.length < 2 || /^(close|back|apply|reset)$/i.test(title)) continue;
                addEntry({
                    title,
                    panel,
                    tabId,
                    tabName,
                    navButton,
                    target: candidate,
                    kind: candidate.matches('h2, h3, span.text-center') ? 'section' : 'setting',
                    extra: `${tabAliases} ${elementSearchText(candidate)}`,
                    external,
                });
            }
        }
        entries.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
        const matches = entries.slice(0, 10);
        this.homeSearchTargets.clear();
        results.replaceChildren();
        if (!matches.length) {
            results.append(
                createElement('div', {
                    className: 'home-search-empty',
                    text: `No results for "${rawQuery.trim()}".`,
                })
            );
        } else {
            for (const match of matches) {
                const id = `home-search-${++this.homeSearchSequence}`;
                this.homeSearchTargets.set(id, match);
                const button = createElement('button', {
                    className: 'home-search-result',
                    attributes: {
                        type: 'button',
                        role: 'option',
                        'data-home-search-result': id,
                    },
                });
                button.append(
                    createElement('span', {
                        className: 'home-search-result-title',
                        text: match.title,
                    }),
                    createElement('span', {
                        className: 'home-search-result-tab',
                        text: match.tabName,
                    })
                );
                results.append(button);
            }
        }
        results.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }
    openHomeSearchResult(id) {
        const match = this.homeSearchTargets.get(String(id));
        if (!match || !this.root) return;
        const input = this.root.querySelector('#sigmod-home-search');
        if (input instanceof HTMLInputElement) input.value = '';
        this.closeHomeSearch();
        const current = this.getVisibleTabPanel();
        const tabChanged = current !== match.panel;
        if (match.external) {
            this.externalTabActive = true;
            this.activeCategory = null;
            this.updateCategoryActiveState();
            this.switchTabPanel(match.panel, match.navButton instanceof HTMLElement ? match.navButton : null, true);
        } else {
            this.openTab(match.tabId);
        }
        const reveal = () => {
            if (!(match.target instanceof HTMLElement) || !match.target.isConnected) return;
            const highlight =
                match.kind === 'section'
                    ? null
                    : match.target.closest('.setting-card-wrapper, .macroRow, .modRowItems, label, .macrosContainer') || match.target;
            match.target.scrollIntoView({
                behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'center',
            });
            if (highlight instanceof HTMLElement) {
                highlight.classList.remove('sigmod-search-hit');
                void highlight.offsetWidth;
                highlight.classList.add('sigmod-search-hit');
                this.resources.timeout(() => highlight.classList.remove('sigmod-search-hit'), 1_200);
            }
        };
        this.resources.timeout(reveal, tabChanged ? 220 : 20);
    }
}
class SettingsPorter {
    constructor(app, resources, menu) {
        this.app = app;
        this.resources = resources;
        this.menu = menu;
    }
    get root() {
        return this.menu.root;
    }
    bindingDisplay(value) {
        return this.menu.bindingDisplay(value);
    }
    updateKeybindingConflicts() {
        return this.menu.updateKeybindingConflicts();
    }
    renderMouseBindingEditor() {
        return this.menu.renderMouseBindingEditor();
    }
    readStoredSettings(key) {
        const value = readLocalJson(key, null);
        return isObject(value) ? value : null;
    }
    hasSigFixes() {
        return this.app.host?.adapter?.kind === 'sigfix' || (isObject(window.sigfix) && isObject(window.sigfix.settings));
    }
    syncSettingsActions() {
        const available = this.hasSigFixes();
        this.root?.querySelectorAll('[data-scope="sigfix"]').forEach((el) => {
            if (el instanceof HTMLButtonElement) el.hidden = !available;
        });
    }
    getSelectedScopes(row) {
        return [...(this.root?.querySelectorAll('[data-scope-row="' + row + '"] .settings-scope-option.active') ?? [])]
            .map((el) => el.dataset.scope)
            .filter(Boolean);
    }
    selectedScopePayload(scopes) {
        const payload = {};
        if (scopes.includes('game')) {
            const sigmally = this.readStoredSettings(STORAGE.gameSettings);
            if (sigmally) payload.sigmally = sigmally;
        }
        if (scopes.includes('sigmod')) payload.sigmod = clone(this.app.settingsStore.value);
        if (scopes.includes('sigfix')) {
            const sigfix = this.readStoredSettings('sigfix');
            if (sigfix) payload.sigfix = sigfix;
        }
        return payload;
    }
    buildSettingsExport() {
        const sigmally = this.readStoredSettings(STORAGE.gameSettings);
        const sigfix = this.readStoredSettings('sigfix');
        return {
            format: 'sigmod-settings',
            version: 1,
            exportedAt: new Date().toISOString(),
            sigmod: clone(this.app.settingsStore.value),
            ...(sigmally ? { sigmally } : {}),
            ...(sigfix ? { sigfix } : {}),
        };
    }
    exportSettings(scopes = ['game', 'sigmod', 'sigfix']) {
        const data = {
            format: 'sigmod-settings',
            version: 1,
            exportedAt: new Date().toISOString(),
            ...this.selectedScopePayload(scopes),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = createElement('a', {
            attributes: {
                href: url,
                download: `sigmod-settings-${new Date().toISOString().slice(0, 10)}.json`,
            },
        });
        document.body.append(link);
        link.click();
        link.remove();
        this.resources.timeout(() => URL.revokeObjectURL(url), 1_000);
    }
    importSections(payload) {
        if (!isObject(payload) || payload.format !== 'sigmod-settings' || payload.version !== 1) {
            throw new Error('This is not a supported SigMod settings export.');
        }
        const sections = {};
        for (const key of ['sigmally', 'sigmod', 'sigfix']) {
            if (isObject(payload[key])) sections[key] = payload[key];
        }
        if (!Object.keys(sections).length) throw new Error('The export does not contain any settings.');
        return sections;
    }
    async importSettings(file) {
        if (file.size > 2 * 1024 * 1024) {
            alert('The settings file is too large.');
            return;
        }
        let payload;
        try {
            payload = JSON.parse(await file.text());
        } catch {
            alert('The selected file is not valid JSON.');
            return;
        }
        let sections;
        try {
            sections = this.importSections(payload);
        } catch (error) {
            alert(error.message || 'Unable to import settings.');
            return;
        }
        const names = Object.keys(sections).map(
            (key) =>
                ({
                    sigmally: 'Sigmally',
                    sigmod: 'SigMod',
                    sigfix: 'SigFixes',
                })[key]
        );
        if (!confirm(`Replace ${names.join(', ')} settings from ${file.name}? The page will reload.`)) return;
        try {
            if (sections.sigmod) this.app.settingsStore.replace(sections.sigmod);
            if (
                (sections.sigmally && !writeLocalJson(STORAGE.gameSettings, sections.sigmally)) ||
                (sections.sigfix && !writeLocalJson('sigfix', sections.sigfix))
            )
                throw new Error('Unable to save imported settings');
        } catch (error) {
            this.app.logger.error('Unable to import settings', error);
            alert('Unable to save every imported setting. Reload the page before making further changes.');
            return;
        }
        location.reload();
    }
    handleSettingInput(event) {
        const input = event.target;
        if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
        if (input.id === 'toggle-instant-split' || input.id === 'instant-split-amount') {
            this.updateInstantSplit(input);
            return;
        }
        if (input.classList.contains('keybinding')) return;
        const path = input.dataset.setting;
        if (!path) return;
        let value;
        if (input instanceof HTMLInputElement && input.type === 'checkbox') {
            value = input.checked ? (input.dataset.checkedValue ?? true) : (input.dataset.uncheckedValue ?? false);
        } else {
            value = input.value;
            if (input.dataset.nullValue === value) value = null;
            else if (own(input.dataset, 'number')) value = Number(value);
            else if (own(input.dataset, 'pixels')) value = `${Number(value) || 0}px`;
            else if (input.classList.contains('keybinding')) value = value.trim().slice(-1).toLowerCase() || null;
        }
        this.app.settingsStore.set(path, value);
        if (input.classList.contains('keybinding')) input.value = value ?? '';
        if (input.id === 'macroSpeed') this.updateMacroSpeedLabel();
        if (input.id === 'partyOpacity') this.updatePartySliderLabels();
        if (input.id === 'partyScale') this.updatePartySliderLabels();
        if (input.id === 'pingDuration') this.updatePartySliderLabels();
        this.root?.dispatchEvent(
            new CustomEvent('sigmod:settingchange', {
                bubbles: true,
                detail: { path, value },
            })
        );
    }
    updateInstantSplit(source) {
        const toggle = this.root?.querySelector('#toggle-instant-split');
        const amount = this.root?.querySelector('#instant-split-amount');
        if (!(toggle instanceof HTMLInputElement) || !(amount instanceof HTMLInputElement)) return;
        let splits = clamp(Math.trunc(Number(amount.value) || 0), 0, 4);
        if (source === toggle && toggle.checked && splits === 0) splits = 1;
        if (!toggle.checked) splits = 0;
        amount.value = String(splits);
        amount.disabled = !toggle.checked;
        this.app.settingsStore.set('macros.keys.line.instantSplit', splits);
    }
    syncSettings() {
        if (!this.root) return;
        for (const input of this.root.querySelectorAll('[data-setting]')) {
            if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) continue;
            const value = this.app.settingsStore.get(input.dataset.setting);
            if (input instanceof HTMLInputElement && input.type === 'checkbox') {
                input.checked = input.dataset.checkedValue === undefined ? Boolean(value) : value === input.dataset.checkedValue;
            } else if (own(input.dataset, 'pixels')) {
                input.value = String(parseFloat(value) || 0);
            } else if (input.dataset.nullValue && value === null) {
                input.value = input.dataset.nullValue;
            } else if (input.type === 'color') {
                input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
            } else if (input.classList.contains('keybinding')) {
                const binding = unwrapSettingScalar(value);
                input.dataset.bindingValue = typeof binding === 'string' ? binding : '';
                input.value = this.bindingDisplay(value);
            } else input.value = value ?? '';
        }
        const game = this.readGameSettings();
        const showNames = this.root.querySelector('#mod-showNames');
        const showSkins = this.root.querySelector('#mod-showSkins');
        if (showNames instanceof HTMLInputElement) showNames.checked = game.showNames !== false;
        if (showSkins instanceof HTMLInputElement) showSkins.checked = game.showSkins !== false;
        const splits = clamp(Math.trunc(Number(this.app.settingsStore.get('macros.keys.line.instantSplit')) || 0), 0, 4);
        const toggle = this.root.querySelector('#toggle-instant-split');
        const amount = this.root.querySelector('#instant-split-amount');
        if (toggle instanceof HTMLInputElement) toggle.checked = splits > 0;
        if (amount instanceof HTMLInputElement) {
            amount.value = String(splits);
            amount.disabled = splits === 0;
        }
        this.root.querySelector('#welcomeUser').textContent = `Welcome ${this.app.state.nickname || 'Guest'}, to the SigMod Client!`;
        this.updateMacroSpeedLabel();
        this.updatePartySliderLabels();
        this.updateKeybindingConflicts();
        this.renderMouseBindingEditor();
    }
    readGameSettings() {
        const value = readLocalJson(STORAGE.gameSettings, {});
        return isObject(value) ? value : {};
    }
    updateMacroSpeedLabel() {
        const label = this.root?.querySelector('#macroSpeedText');
        if (label) label.textContent = `${this.app.settingsStore.get('macros.feedSpeed')}ms`;
    }
    updatePartySliderLabels() {
        const opacityLabel = this.root?.querySelector('#partyOpacityText');
        if (opacityLabel) {
            const v = this.app.settingsStore.get('settings.partyOpacity') ?? 1;
            opacityLabel.textContent = `${Math.round(Number(v) * 100)}%`;
        }
        const scaleLabel = this.root?.querySelector('#partyScaleText');
        if (scaleLabel) {
            const v = this.app.settingsStore.get('settings.partyScale') ?? 1;
            scaleLabel.textContent = `${Number(v).toFixed(2)}x`;
        }
        const pingLabel = this.root?.querySelector('#pingDurationText');
        if (pingLabel) {
            const v = this.app.settingsStore.get('settings.pingDuration') ?? 2000;
            pingLabel.textContent = `${(Number(v) / 1000).toFixed(1)}s`;
        }
    }
}
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Game appearance controls and theme system                                         ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
class GameSettingsController extends FeatureController {
    mount() {
        this.menu = this.app.features.get('menu');
        this.modal = this.app.features.get('modal');
        this.root = this.menu?.root ?? null;
        if (!(this.root instanceof HTMLElement)) return;
        this.setupColors();
        this.setupImages();
        this.setupFont();
        this.setupHostToggles();
        this.setupDeathScreen();
        this.setupNameColorActions();
        this.syncNameColorControls();
        this.resources.listen(this.root, 'sigmod:settingchange', (event) => {
            const path = event.detail?.path;
            if (
                path === 'game.name.color' ||
                path === 'game.name.gradient.enabled' ||
                path === 'game.name.gradient.left' ||
                path === 'game.name.gradient.right'
            )
                this.syncNameColorControls();
            if (path === 'settings.deathScreenPos') this.applyDeathScreenPosition();
        });
    }
    setupNameColorActions() {
        if (!(this.root instanceof HTMLElement)) return;
        this.resources.listen(this.root, 'click', (event) => {
            const target = event.target instanceof Element ? event.target.closest('[data-name-color-mode]') : null;
            if (!(target instanceof HTMLButtonElement)) return;
            const mode = target.dataset.nameColorMode;
            if (mode !== 'solid' && mode !== 'gradient') return;
            this.set('game.name.gradient.enabled', mode === 'gradient', true);
        });
    }
    syncNameColorControls() {
        if (!(this.root instanceof HTMLElement)) return;
        const valueFor = (path) => {
            const value = this.app.settingsStore.get(path);
            return /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
        };
        const solid = valueFor('game.name.color');
        const left = valueFor('game.name.gradient.left');
        const right = valueFor('game.name.gradient.right');
        const gradient = this.app.settingsStore.get('game.name.gradient.enabled') === true;
        const mode = gradient ? 'gradient' : 'solid';
        for (const tab of this.root.querySelectorAll('[data-name-color-mode]')) {
            if (!(tab instanceof HTMLButtonElement)) continue;
            const active = tab.dataset.nameColorMode === mode;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
        }
        for (const panel of this.root.querySelectorAll('[data-name-color-panel]')) {
            if (!(panel instanceof HTMLElement)) continue;
            panel.hidden = panel.dataset.nameColorPanel !== mode;
        }
        for (const element of this.root.querySelectorAll('[data-name-color-value]')) {
            const path = element.getAttribute('data-name-color-value');
            if (element instanceof HTMLElement && path) element.textContent = valueFor(path).toUpperCase();
        }
        const preview = this.root.querySelector('#nameColorPreview');
        if (!(preview instanceof HTMLElement)) return;
        const previewText = preview.querySelector('.name-color-preview-text');
        if (!(previewText instanceof HTMLElement)) return;
        preview.dataset.mode = gradient ? 'gradient' : 'solid';
        preview.setAttribute('aria-label', gradient ? 'Gradient name color preview' : 'Name color preview');
        if (gradient) {
            previewText.style.color = 'transparent';
            previewText.style.backgroundImage = `linear-gradient(90deg, ${left}, ${right})`;
            previewText.style.webkitBackgroundClip = 'text';
            previewText.style.backgroundClip = 'text';
            previewText.style.webkitTextFillColor = 'transparent';
        } else {
            previewText.style.backgroundImage = 'none';
            previewText.style.webkitBackgroundClip = 'border-box';
            previewText.style.backgroundClip = 'border-box';
            previewText.style.webkitTextFillColor = solid;
            previewText.style.color = solid;
        }
        previewText.textContent = 'Your name';
    }
    setupColors() {
        const definitions = [
            ['mapColor', 'game.map.color', '#111111'],
            ['borderColor', 'game.borderColor', '#0000ff'],
            ['foodColor', 'game.foodColor', '#ffffff'],
            ['cellColor', 'game.cellColor', '#ffffff'],
        ];
        for (const [id, path, fallback] of definitions) {
            const container = this.root.querySelector(`#${id}`);
            if (!(container instanceof HTMLElement)) continue;
            const input = createElement('input', {
                className: 'colorInput',
                attributes: { type: 'color', 'aria-label': id },
            });
            const reset = createElement('button', {
                className: 'resetButton',
                icon: 'reset',
                attributes: { type: 'button', 'aria-label': `Reset ${id}` },
            });
            const current = this.app.settingsStore.get(path);
            input.value = /^#[0-9a-f]{6}$/i.test(current) ? current : fallback;
            container.replaceChildren(input, reset);
            this.resources.listen(input, 'input', () => {
                if (path.includes('gradient')) this.set('game.name.gradient.enabled', true);
                this.set(path, input.value);
            });
            this.resources.listen(reset, 'click', () => {
                this.set(path, null);
                input.value = fallback;
            });
        }
        for (const [id, path] of [
            ['nameColor', 'game.name.color'],
            ['gradientNameColor1', 'game.name.gradient.left'],
            ['gradientNameColor2', 'game.name.gradient.right'],
        ]) {
            const input = this.root.querySelector(`#${id}`);
            if (!(input instanceof HTMLInputElement)) continue;
            const reset = createElement('button', {
                className: 'resetButton',
                icon: 'reset',
                attributes: { type: 'button', 'aria-label': `Reset ${id}` },
            });
            input.parentElement?.append(reset);
            this.resources.listen(reset, 'click', () => {
                this.set(path, null);
                input.value = '#ffffff';
                if (path.includes('gradient')) this.set('game.name.gradient.enabled', false);
            });
            this.resources.add(() => reset.remove());
        }
        this.app.dependencies
            .load('colorPicker')
            .then((Alwan) => this.upgradeColorPickers(Alwan))
            .catch((error) =>
                this.app.logger.warnOnce('color-picker', 'Unable to load Alwan; native color inputs remain available', error)
            );
    }
    upgradeColorPickers(Alwan) {
        if (this.resources.disposed || typeof Alwan !== 'function' || !(this.root instanceof HTMLElement)) return;
        const definitions = [
            {
                id: 'mapColor',
                path: 'game.map.color',
                opacity: false,
                fallback: '#111111',
                reset: '#111111',
                container: true,
            },
            {
                id: 'borderColor',
                path: 'game.borderColor',
                opacity: true,
                fallback: '#0000ff',
                reset: '#0000ff',
                container: true,
            },
            {
                id: 'foodColor',
                path: 'game.foodColor',
                opacity: true,
                fallback: '#ffffff',
                reset: null,
                container: true,
            },
            {
                id: 'cellColor',
                path: 'game.cellColor',
                opacity: true,
                fallback: '#ffffff',
                reset: null,
                container: true,
            },
            {
                id: 'nameColor',
                path: 'game.name.color',
                opacity: false,
                fallback: '#ffffff',
                reset: '#ffffff',
            },
            {
                id: 'gradientNameColor1',
                path: 'game.name.gradient.left',
                opacity: false,
                fallback: '#ffffff',
                reset: '#ffffff',
            },
            {
                id: 'gradientNameColor2',
                path: 'game.name.gradient.right',
                opacity: false,
                fallback: '#ffffff',
                reset: '#ffffff',
            },
        ];
        for (const definition of definitions) {
            const reference = this.root.querySelector(`#${definition.id}`);
            if (!(reference instanceof HTMLElement)) continue;
            if (definition.container) reference.replaceChildren();
            else {
                reference.removeAttribute('data-setting');
                reference.parentElement?.querySelector('button.resetButton')?.remove();
            }
            const current = this.app.settingsStore.get(definition.path);
            let picker;
            try {
                picker = new Alwan(`#${definition.id}`, {
                    id: `edit-${definition.id}`,
                    color: current || definition.fallback,
                    theme: 'dark',
                    opacity: definition.opacity,
                    format: 'hex',
                    default: definition.reset,
                    swatches: ['black', 'white', 'red', 'blue', 'green'],
                });
            } catch (error) {
                this.app.logger.warnOnce(`color-picker-${definition.id}`, `Unable to initialize ${definition.id}`, error);
                continue;
            }
            const pickerElement = document.getElementById(`edit-${definition.id}`);
            if (pickerElement instanceof HTMLElement) {
                const reset = createColorPickerReset(`Reset ${definition.id}`, `reset-${definition.id}`);
                pickerElement.append(reset.container);
                this.resources.listen(reset.button, 'click', () => {
                    const next = definition.reset;
                    if (typeof picker.setColor === 'function') picker.setColor(next || definition.fallback);
                    this.set(definition.path, next);
                    if (definition.path.includes('gradient')) this.set('game.name.gradient.enabled', false);
                    this.syncNameColorControls();
                });
            }
            if (typeof picker.on === 'function') {
                picker.on('change', (event) => {
                    const value = typeof event?.hex === 'string' ? event.hex : null;
                    if (!value) return;
                    if (definition.path.includes('gradient')) this.set('game.name.gradient.enabled', true);
                    this.set(definition.path, value);
                    this.syncNameColorControls();
                });
            }
            this.resources.add(() => {
                if (typeof picker.destroy === 'function') picker.destroy();
            });
        }
    }
    setupImages() {
        const definitions = {
            mapImageSelect: 'map',
            virusImageSelect: 'virus',
            skinReplaceSelect: 'skin',
        };
        for (const [id, kind] of Object.entries(definitions)) {
            const button = this.root.querySelector(`#${id}`);
            if (!(button instanceof HTMLButtonElement)) continue;
            button.style.backgroundImage = '';
            button.style.backgroundPosition = '';
            button.style.backgroundSize = '';
            this.resources.listen(button, 'click', () => this.openImageDialog(kind));
        }
    }
    openImageDialog(kind) {
        const config = {
            map: {
                title: 'Map Image',
                path: 'game.map.image',
                previewId: 'preview-mapImage',
            },
            virus: {
                title: 'Virus Image',
                path: 'game.virusImage',
                previewId: 'preview-virusImage',
            },
            skin: {
                title: 'Skin Replacement',
                path: 'game.skins.replacement',
                originalPath: 'game.skins.original',
                previewId: 'preview-skinImage',
            },
        }[kind];
        if (!config || !this.modal) return;
        const fragment = document.createDocumentFragment();
        const header = createElement('div', {
            className: 'default-modal-header',
        });
        const close = createElement('button', {
            className: 'btn closeBtn',
            attributes: {
                type: 'button',
                'aria-label': 'Close',
                id: 'closeCustomModal',
            },
        });
        close.innerHTML = icon('close', 24);
        header.append(createElement('h2', { text: config.title }), close);
        const body = createElement('div', {
            className: 'default-modal-body',
        });
        let original = null;
        if (kind === 'skin') {
            body.append(
                createElement('span', {
                    text: 'Select a skin that should be replaced:',
                })
            );
            original = createElement('select', {
                className: 'form-control',
                attributes: {
                    id: 'skin-list',
                    'aria-label': 'Original skin',
                },
            });
            body.append(original);
            body.append(
                createElement('span', {
                    className: 'sigmod-skin-replacement-hint',
                    text: 'Replacement image - Enter an image URL:',
                })
            );
        } else {
            body.append(createElement('span', { text: 'Enter an image URL:' }));
        }
        const previewRow = createElement('div', {
            className: 'centerXY g-10',
        });
        const url = createElement('input', {
            className: 'form-control',
            attributes: {
                type: 'text',
                id: 'image-url',
                placeholder: 'https://i.imgur/...',
            },
        });
        url.value = String(this.app.settingsStore.get(config.path) ?? '');
        const preview = createElement('div', {
            className: 'imagePreview',
            attributes: { id: config.previewId, title: 'Image Preview' },
        });
        const noPreview = createElement('span', {
            className: 'no-preview',
            text: 'No Preview Available',
        });
        preview.append(noPreview);
        previewRow.append(url, preview);
        const actions = createElement('div', {
            className: 'centerXY g-10',
        });
        const apply = createElement('button', {
            className: 'modButton-black',
            text: 'Apply Image',
            attributes: { type: 'button', id: `apply-${kind}-image` },
        });
        const reset = createElement('button', {
            className: 'resetButton',
            icon: 'reset',
            attributes: {
                type: 'button',
                id: `reset-${kind}-image`,
                title: `Reset ${config.title.toLowerCase()}`,
                'aria-label': `Reset ${config.title}`,
            },
        });
        actions.append(apply, reset);
        body.append(previewRow, actions);
        fragment.append(header, body);
        this.modal.open('game-image-setting', fragment, {
            className: 'default-modal',
            closeOnBackdrop: true,
        });
        const scope = this.modal.modals.get('game-image-setting')?.scope;
        if (!scope) return;
        const updatePreview = (source) => {
            const raw = String(source ?? '').trim();
            if (!raw) {
                preview.style.backgroundImage = 'none';
                noPreview.style.display = 'block';
                return;
            }
            const safe = this.safeImageUrl(raw, true);
            if (!safe) {
                preview.style.backgroundImage = 'none';
                noPreview.style.display = 'block';
                return;
            }
            const image = new Image();
            image.onload = () => {
                preview.style.backgroundImage = `url("${safe}")`;
                noPreview.style.display = 'none';
            };
            image.onerror = () => {
                preview.style.backgroundImage = 'none';
                noPreview.style.display = 'block';
            };
            image.src = safe;
        };
        updatePreview(url.value);
        scope.listen(url, 'input', () => updatePreview(url.value));
        scope.listen(close, 'click', () => this.modal.close('game-image-setting'));
        if (original) {
            this.loadSkinList(original).then(() => {
                original.value = String(this.app.settingsStore.get(config.originalPath) ?? '');
            });
        }
        scope.listen(apply, 'click', () => {
            const raw = url.value.trim();
            const source = raw ? this.safeImageUrl(raw, true) : '';
            if (raw && !source) {
                this.app.features.get('modal')?.alert('Enter a valid image URL.', 'danger');
                return;
            }
            if (kind === 'skin') {
                const originalSkin = original?.value?.trim();
                if (!originalSkin) {
                    this.app.features.get('modal')?.alert('Select the original skin.', 'danger');
                    return;
                }
                this.set(config.originalPath, originalSkin, true);
            }
            this.set(config.path, source, true);
            this.app.features.get('visuals')?.syncAssets();
            this.app.features.get('modal')?.alert(`Successfully applied ${config.title}.`, 'success');
        });
        scope.listen(reset, 'click', () => {
            if (kind === 'skin') this.set(config.originalPath, null, true);
            this.set(config.path, null, true);
            this.app.features.get('visuals')?.syncAssets();
            this.app.features.get('modal')?.alert(`The ${config.title} has been successfully reset.`, 'success');
        });
    }
    async loadSkinList(select) {
        try {
            const response = await fetch('https://one.sigmally.com/api/skins');
            if (!response.ok) return;
            const payload = await response.json();
            const skins = Array.isArray(payload?.data)
                ? payload.data.map((item) => (typeof item.name === 'string' ? item.name.replace('.png', '') : String(item)))
                : [];
            select.replaceChildren(
                ...skins.map((skin) =>
                    createElement('option', {
                        text: skin,
                        attributes: { value: skin },
                    })
                )
            );
        } catch (error) {
            this.app.logger.warnOnce('skin-list', 'Unable to load the skin list', error);
        }
    }
    updateImagePreview(button, kind) {
        const path = kind === 'map' ? 'game.map.image' : kind === 'virus' ? 'game.virusImage' : 'game.skins.replacement';
        const source = this.app.settingsStore.get(path);
        const safe = this.safeImageUrl(source, true);
        button.style.backgroundImage = safe ? `url("${safe}")` : '';
        button.style.backgroundPosition = 'center';
        button.style.backgroundSize = 'cover';
    }
    safeImageUrl(value, allowRelative = false) {
        return safeHttpUrl(value, allowRelative);
    }
    setupFont() {
        const host = this.root.querySelector('#font-select-container');
        if (!(host instanceof HTMLElement)) return;
        const render = (fonts) => {
            if (this.resources.disposed) return;
            const names = [...new Set(['Ubuntu', ...fonts.filter((font) => typeof font === 'string' && font.trim())])];
            const current = names.includes(this.app.settings.game.font) ? this.app.settings.game.font : 'Ubuntu';
            const row = createElement('div', { className: 'centerXY g-5' });
            const reset = createElement('button', {
                className: 'resetButton',
                icon: 'reset',
                attributes: { type: 'button', 'aria-label': 'Reset font' },
            });
            const container = createElement('div', {
                className: 'sigmod-font-select',
            });
            const selectButton = createElement('div', {
                className: 'sigmod-font-select-button',
            });
            const arrow = icon('caretDown', 18);
            const setSelected = (value) => {
                selectButton.innerHTML = arrow;
                selectButton.prepend(createElement('span', { text: value }));
            };
            setSelected(current);
            const dropdown = createElement('div', {
                className: 'sigmod-font-select-dropdown',
            });
            const searchBox = createElement('input', {
                attributes: { type: 'text', placeholder: 'Search...' },
            });
            searchBox.classList.add('sigmod-font-select-search');
            dropdown.append(searchBox);
            for (const font of names) {
                const option = createElement('div', {
                    className: 'sigmod-font-select-option',
                    text: font,
                });
                option.dataset.fontOption = font;
                this.resources.listen(option, 'click', () => {
                    setSelected(font);
                    dropdown.style.display = 'none';
                    this.setFont(font);
                });
                dropdown.append(option);
            }
            this.resources.listen(selectButton, 'click', (event) => {
                event.stopPropagation();
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            });
            this.resources.listen(document, 'click', (event) => {
                if (!container.contains(event.target)) dropdown.style.display = 'none';
            });
            this.resources.listen(searchBox, 'input', () => {
                const filter = searchBox.value.toLowerCase();
                for (const option of dropdown.querySelectorAll('[data-font-option]')) {
                    if (!(option instanceof HTMLElement)) continue;
                    option.style.display = option.textContent.toLowerCase().includes(filter) ? 'block' : 'none';
                }
            });
            this.resources.listen(reset, 'click', () => {
                if (this.app.settings.game.font === 'Ubuntu') return;
                setSelected('Ubuntu');
                this.setFont('Ubuntu');
            });
            container.append(selectButton, dropdown);
            row.append(reset, container);
            host.replaceChildren(row);
        };
        render(['Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Courier New']);
        fetch(`${ENDPOINTS.app}/fonts`)
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((fonts) => {
                if (!this.resources.disposed && Array.isArray(fonts)) render(fonts);
            })
            .catch((error) => this.app.logger.warnOnce('font-list', 'Using the built-in font list', error));
    }
    setFont(font) {
        this.set('game.font', font, true);
        const visuals = this.app.features.get('visuals');
        if (visuals) {
            visuals.fontFamily = null;
            visuals.fontCache.clear();
            visuals.ensureFont();
        }
    }
    setupHostToggles() {
        for (const [modId, hostId] of [
            ['mod-showNames', 'showNames'],
            ['mod-showSkins', 'showSkins'],
        ]) {
            const modInput = this.root.querySelector(`#${modId}`);
            const hostInput = document.getElementById(hostId);
            if (!(modInput instanceof HTMLInputElement) || !(hostInput instanceof HTMLInputElement)) continue;
            modInput.checked = hostInput.checked;
            this.resources.listen(modInput, 'change', () => {
                if (modInput.checked !== hostInput.checked) hostInput.click();
            });
            this.resources.listen(hostInput, 'change', () => {
                modInput.checked = hostInput.checked;
            });
        }
    }
    async setupDeathScreen() {
        const screen = await this.app.readiness.waitFor(SELECTORS.deathScreen).catch(() => null);
        if (this.resources.disposed || !(screen instanceof HTMLElement)) return;
        const original = {
            margin: screen.style.margin,
            marginLeft: screen.style.marginLeft,
            marginRight: screen.style.marginRight,
            marginTop: screen.style.marginTop,
            marginBottom: screen.style.marginBottom,
        };
        this.deathScreen = screen;
        this.resources.add(() => Object.assign(screen.style, original));
        this.applyDeathScreenPosition();
    }
    applyDeathScreenPosition() {
        const screen = this.deathScreen;
        if (!(screen instanceof HTMLElement)) return;
        Object.assign(screen.style, {
            margin: '',
            marginLeft: '',
            marginRight: '',
            marginTop: '',
            marginBottom: '',
        });
        const position = this.app.settings.settings.deathScreenPos;
        if (position === 'left') screen.style.marginLeft = '0';
        else if (position === 'right') screen.style.marginRight = '0';
        else if (position === 'top') screen.style.marginTop = '20px';
        else if (position === 'bottom') screen.style.marginBottom = '20px';
        else screen.style.margin = 'auto';
    }
    set(path, value, immediate = false) {
        this.app.settingsStore.set(path, value, immediate);
        this.root.dispatchEvent(
            new CustomEvent('sigmod:settingchange', {
                bubbles: true,
                detail: { path, value },
            })
        );
    }
}
class GradientEditor {
    constructor(app, resources, getEditor, onUpdatePreview) {
        this.app = app;
        this.resources = resources;
        this.getEditor = typeof getEditor === 'function' ? getEditor : () => null;
        this.onUpdatePreview = typeof onUpdatePreview === 'function' ? onUpdatePreview : () => {};
        this.gradientStops = [
            { color: '#0b1020', position: 0 },
            { color: '#274c77', position: 52 },
            { color: '#7b2cbf', position: 100 },
        ];
        this.editorPickers = new Map();
        this.editorAlwan = null;
        this.gradientDrag = null;
    }
    get editor() {
        return this.getEditor();
    }
    value(id) {
        const input = this.editor?.querySelector(`#${id}`);
        return input instanceof HTMLInputElement || input instanceof HTMLSelectElement ? input.value : '';
    }
    syncGradientStopInputs() {
        if (!this.editor) return;
        for (const input of this.editor.querySelectorAll('[data-gradient-stop-color]')) {
            if (!(input instanceof HTMLInputElement)) continue;
            const index = Number(input.dataset.gradientStopColor);
            if (!this.gradientStops[index]) continue;
            if (/^#[0-9a-f]{6}$/i.test(input.value)) this.gradientStops[index].color = input.value;
        }
        for (const input of this.editor.querySelectorAll('[data-gradient-stop-position]')) {
            if (!(input instanceof HTMLInputElement)) continue;
            const index = Number(input.dataset.gradientStopPosition);
            if (!this.gradientStops[index]) continue;
            this.gradientStops[index].position = clamp(Number(input.value) || 0, 0, 100);
        }
    }
    renderGradientStops() {
        if (!this.editor) return;
        this.destroyGradientStopPickers();
        const list = this.editor.querySelector('#theme-gradient-stop-list');
        const layer = this.editor.querySelector('#theme-gradient-marker-layer');
        if (!(list instanceof HTMLElement) || !(layer instanceof HTMLElement)) return;
        list.replaceChildren();
        layer.replaceChildren();
        this.gradientStops.forEach((stop, index) => {
            const marker = createElement('button', {
                className: 'theme-gradient-marker',
                attributes: {
                    type: 'button',
                    'data-gradient-marker': index,
                    'aria-label': `Gradient stop ${index + 1}`,
                },
            });
            marker.style.left = `${clamp(stop.position, 0, 100)}%`;
            marker.style.background = stop.color;
            layer.append(marker);
            const row = createElement('div', {
                className: 'theme-gradient-stop-row',
            });
            const number = createElement('span', {
                className: 'theme-gradient-stop-number',
                text: String(index + 1),
            });
            const color = createElement('input', {
                className: 'theme-gradient-color-input',
                attributes: {
                    id: `theme-gradient-color-${index}`,
                    type: 'color',
                    value: stop.color,
                    'data-gradient-stop-color': index,
                    'aria-label': `Color for gradient stop ${index + 1}`,
                },
            });
            color.value = stop.color;
            const position = createElement('input', {
                className: 'form-control theme-gradient-position',
                attributes: {
                    type: 'number',
                    min: '0',
                    max: '100',
                    step: '1',
                    value: Math.round(stop.position),
                    'data-gradient-stop-position': index,
                    'aria-label': `Position for gradient stop ${index + 1}`,
                },
            });
            position.value = String(Math.round(stop.position));
            const suffix = createElement('span', {
                className: 'theme-gradient-percent',
                text: '%',
            });
            const remove = createElement('button', {
                className: 'theme-gradient-remove',
                attributes: {
                    type: 'button',
                    'data-remove-gradient-stop': index,
                    'aria-label': `Remove gradient stop ${index + 1}`,
                },
                text: '×',
            });
            if (this.gradientStops.length <= 2) remove.disabled = true;
            row.append(number, color, position, suffix, remove);
            list.append(row);
        });
        if (this.editorAlwan) this.upgradeGradientStopPickers();
        this.onUpdatePreview();
    }
    addGradientStop() {
        if (this.gradientStops.length >= 6) {
            const hint = this.editor?.querySelector('#theme-editor-hint');
            if (hint) hint.textContent = 'A gradient can have up to 6 stops.';
            return;
        }
        const sorted = [...this.gradientStops].sort((a, b) => a.position - b.position);
        let bestStart = 0;
        let bestEnd = 100;
        let gap = -1;
        for (let index = 0; index < sorted.length - 1; index += 1) {
            const currentGap = sorted[index + 1].position - sorted[index].position;
            if (currentGap > gap) {
                gap = currentGap;
                bestStart = sorted[index].position;
                bestEnd = sorted[index + 1].position;
            }
        }
        const position = Math.round((bestStart + bestEnd) / 2);
        let before = sorted[0];
        for (const stop of sorted) {
            if (stop.position <= position) before = stop;
        }
        this.gradientStops.push({
            color: before?.color || '#ffffff',
            position,
        });
        this.renderGradientStops();
    }
    removeGradientStop(index) {
        if (this.gradientStops.length <= 2 || !this.gradientStops[index]) return;
        this.gradientStops.splice(index, 1);
        this.renderGradientStops();
    }
    setupGradientDrag() {
        if (!this.editor) return;
        this.resources.listen(this.editor, 'pointerdown', (event) => {
            const marker = event.target instanceof Element ? event.target.closest('[data-gradient-marker]') : null;
            if (!(marker instanceof HTMLElement)) return;
            const track = this.editor?.querySelector('#theme-gradient-stop-track');
            if (!(track instanceof HTMLElement)) return;
            event.preventDefault();
            const index = Number(marker.dataset.gradientMarker);
            if (!this.gradientStops[index]) return;
            this.gradientDrag = {
                index,
                pointerId: event.pointerId,
                track,
            };
            marker.setPointerCapture?.(event.pointerId);
            this.updateGradientDrag(event);
        });
        this.resources.listen(window, 'pointermove', (event) => {
            if (!this.gradientDrag || event.pointerId !== this.gradientDrag.pointerId) return;
            this.updateGradientDrag(event);
        });
        const end = (event) => {
            if (!this.gradientDrag || event.pointerId !== this.gradientDrag.pointerId) return;
            this.gradientDrag = null;
        };
        this.resources.listen(window, 'pointerup', end);
        this.resources.listen(window, 'pointercancel', end);
    }
    updateGradientDrag(event) {
        const drag = this.gradientDrag;
        if (!drag || !this.gradientStops[drag.index]) return;
        const rect = drag.track.getBoundingClientRect();
        if (rect.width <= 0) return;
        const position = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
        this.gradientStops[drag.index].position = Math.round(position);
        const positionInput = this.editor?.querySelector(`[data-gradient-stop-position="${drag.index}"]`);
        if (positionInput instanceof HTMLInputElement) positionInput.value = String(Math.round(position));
        this.onUpdatePreview();
    }
    destroyGradientStopPickers() {
        for (const [key, picker] of [...this.editorPickers]) {
            if (!String(key).startsWith('stop:')) continue;
            if (typeof picker?.destroy === 'function') picker.destroy();
            this.editorPickers.delete(key);
        }
    }
    destroyEditorPickers() {
        for (const picker of this.editorPickers.values()) {
            if (typeof picker?.destroy === 'function') picker.destroy();
        }
        this.editorPickers.clear();
    }
    createEditorPicker(key, input, color, onChange) {
        if (!this.editorAlwan || !(input instanceof HTMLInputElement)) return;
        const old = this.editorPickers.get(key);
        if (typeof old?.destroy === 'function') old.destroy();
        let picker;
        try {
            picker = new this.editorAlwan(`#${input.id}`, {
                id: `theme-editor-picker-${String(key).replace(/[^a-z0-9_-]/gi, '-')}`,
                color,
                theme: 'dark',
                opacity: false,
                format: 'hex',
                swatches: ['#0d0d0d', '#ffffff', '#6871f1', '#7b2cbf', '#287a78', '#8d2025'],
            });
        } catch (error) {
            this.app.logger.warnOnce(`theme-editor-picker-${key}`, 'Unable to initialize a theme color picker', error);
            return;
        }
        this.editorPickers.set(key, picker);
        if (typeof picker.on === 'function') {
            picker.on('change', (event) => {
                const value = typeof event?.hex === 'string' ? event.hex.slice(0, 7) : null;
                if (!value) return;
                input.value = value;
                onChange(value);
                this.onUpdatePreview();
            });
        }
    }
    upgradeEditorColorPickers() {
        if (!this.editor || !this.editorAlwan) return;
        const definitions = [
            ['static-bg', 'theme-editor-bgcolorinput'],
            ['static-text', 'theme-editor-colorinput'],
            ['gradient-text', 'theme-editor-gcolor2'],
            ['image-text', 'theme-editor-textcolorImage'],
        ];
        for (const [key, id] of definitions) {
            const input = this.editor.querySelector(`#${id}`);
            if (!(input instanceof HTMLInputElement)) continue;
            this.createEditorPicker(key, input, input.value, (value) => {
                input.value = value;
            });
        }
        this.upgradeGradientStopPickers();
    }
    upgradeGradientStopPickers() {
        if (!this.editor || !this.editorAlwan) return;
        this.destroyGradientStopPickers();
        for (const input of this.editor.querySelectorAll('[data-gradient-stop-color]')) {
            if (!(input instanceof HTMLInputElement)) continue;
            const index = Number(input.dataset.gradientStopColor);
            const stop = this.gradientStops[index];
            if (!stop) continue;
            this.createEditorPicker(`stop:${index}`, input, stop.color, (value) => {
                if (this.gradientStops[index]) this.gradientStops[index].color = value;
            });
        }
    }
    gradientValue() {
        const stops = [...this.gradientStops]
            .map((stop) => ({
                color: /^#[0-9a-f]{6}$/i.test(stop.color) ? stop.color : '#ffffff',
                position: clamp(Number(stop.position) || 0, 0, 100),
            }))
            .sort((a, b) => a.position - b.position)
            .map((stop) => `${stop.color} ${Math.round(stop.position)}%`)
            .join(', ');
        const type = this.value('gradient-type') || 'linear';
        const angle = clamp(Number(this.value('g_angle')) || 0, 0, 360);
        if (type === 'radial') return `radial-gradient(circle at center, ${stops})`;
        if (type === 'conic') return `conic-gradient(from ${angle}deg at center, ${stops})`;
        return `linear-gradient(${angle}deg, ${stops})`;
    }
}
class ThemeController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.current = null;
        this.editorAnimation = null;
        this.editorAnimationRevision = 0;
        this.container = null;
        this.editor = null;
        this.originalStyles = new Map();
        this.originalClasses = new Map();
        this.editorType = 'gradient';
        this.gradientEditor = new GradientEditor(
            app,
            this.resources,
            () => this.editor,
            () => this.updateEditorPreview()
        );
        this.defaults = [
            {
                name: 'Dark',
                background: '#151515',
                text: '#FFFFFF',
            },
            {
                name: 'White',
                background: '#ffffff',
                text: '#000000',
            },
            {
                name: 'Transparent',
                background: 'rgba(0, 0, 0, 0)',
                text: '#FFFFFF',
            },
        ];
        this.orderly = [
            {
                name: 'THC',
                background: 'linear-gradient(145deg, #07140a 0%, #123d18 42%, #2d7a32 100%)',
                text: '#FFFFFF',
            },
            {
                name: '4 AM',
                background: 'linear-gradient(135deg, #090713 0%, #211442 38%, #4b2371 72%, #72418e 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'OTO',
                background: 'linear-gradient(155deg, #090909 0%, #421013 58%, #8d2025 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Shapes',
                background: 'https://i.ibb.co/h8TmVyM/BG-2.png',
                preview: 'https://czrsd.com/static/sigmod/themes/BG-2.jpg',
                text: '#FFFFFF',
            },
            {
                name: 'Blue',
                background: 'https://i.ibb.co/9yQBfWj/BG-3.png',
                preview: 'https://czrsd.com/static/sigmod/themes/BG-3.jpg',
                text: '#FFFFFF',
            },
            {
                name: 'Purple',
                background: 'https://i.ibb.co/vxY15Tv/BG-5.png',
                preview: 'https://czrsd.com/static/sigmod/themes/BG-5.jpg',
                text: '#FFFFFF',
            },
            {
                name: 'Gradient',
                background: 'https://i.ibb.co/hWMLwLS/BG-7.png',
                preview: 'https://czrsd.com/static/sigmod/themes/BG-7.jpg',
                text: '#FFFFFF',
            },
            {
                name: 'Sky',
                background: 'https://i.ibb.co/P4XqDFw/BG-9.png',
                preview: 'https://czrsd.com/static/sigmod/themes/BG-9.jpg',
                text: '#000000',
            },
            {
                name: 'Sunset',
                background: 'https://i.ibb.co/0BVbYHC/BG-10.png',
                preview: 'https://czrsd.com/static/sigmod/themes/BG-10.jpg',
                text: '#FFFFFF',
            },
            {
                name: 'Galaxy',
                background: 'https://i.ibb.co/MsssDKP/Galaxy.png',
                preview: 'https://czrsd.com/static/sigmod/themes/Galaxy.jpg',
                text: '#FFFFFF',
            },
            {
                name: 'Planet',
                background: 'https://i.ibb.co/KLqWM32/Planet.png',
                preview: 'https://czrsd.com/static/sigmod/themes/Planet.jpg',
                text: '#FFFFFF',
            },
            {
                name: 'Cloudy',
                background: 'https://i.ibb.co/MCW7Bcd/cloudy.png',
                preview: 'https://czrsd.com/static/sigmod/themes/cloudy.jpg',
                text: '#000000',
            },
            {
                name: 'Glow',
                background:
                    'https://images.pexels.com/photos/19896227/pexels-photo-19896227.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
                preview: 'https://images.pexels.com/photos/19896227/pexels-photo-19896227.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=300&w=500',
                text: '#FFFFFF',
            },
            {
                name: 'Forest',
                background:
                    'https://images.pexels.com/photos/31612077/pexels-photo-31612077.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
                preview: 'https://images.pexels.com/photos/31612077/pexels-photo-31612077.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=300&w=500',
                text: '#FFFFFF',
            },
            {
                name: 'Lake',
                background:
                    'https://images.pexels.com/photos/1748990/pexels-photo-1748990.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
                preview: 'https://images.pexels.com/photos/1748990/pexels-photo-1748990.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=300&w=500',
                text: '#FFFFFF',
            },
            {
                name: 'Stars',
                background:
                    'https://images.pexels.com/photos/33872979/pexels-photo-33872979.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
                preview: 'https://images.pexels.com/photos/33872979/pexels-photo-33872979.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=300&w=500',
                text: '#FFFFFF',
            },
            {
                name: 'Night',
                background:
                    'https://images.pexels.com/photos/33329150/pexels-photo-33329150.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
                preview: 'https://images.pexels.com/photos/33329150/pexels-photo-33329150.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=300&w=500',
                text: '#FFFFFF',
            },
            {
                name: 'Beach',
                background:
                    'https://images.pexels.com/photos/17916414/pexels-photo-17916414.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
                preview: 'https://images.pexels.com/photos/17916414/pexels-photo-17916414.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=300&w=500',
                text: '#FFFFFF',
            },
            {
                name: 'Ocean',
                background:
                    'https://images.pexels.com/photos/36216420/pexels-photo-36216420.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
                preview: 'https://images.pexels.com/photos/36216420/pexels-photo-36216420.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=300&w=500',
                text: '#FFFFFF',
            },
            {
                name: 'Cyan',
                background:
                    'https://images.pexels.com/photos/36957456/pexels-photo-36957456.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
                preview: 'https://images.pexels.com/photos/36957456/pexels-photo-36957456.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=300&w=500',
                text: '#FFFFFF',
            },
            {
                name: 'Waves',
                background:
                    'https://images.pexels.com/photos/33360833/pexels-photo-33360833.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
                preview: 'https://images.pexels.com/photos/33360833/pexels-photo-33360833.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=300&w=500',
                text: '#FFFFFF',
            },
            {
                name: 'Ink',
                background: 'linear-gradient(90deg, #080b12 0%, #152844 55%, #2d5b7c 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Berry',
                background: 'linear-gradient(180deg, #7b315e 0%, #39172f 48%, #130912 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Slate',
                background: 'linear-gradient(25deg, #485563 0%, #29323c 46%, #11151a 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Ice',
                background: 'radial-gradient(circle at 50% 45%, #53a5b8 0%, #214d60 38%, #08151e 78%)',
                text: '#FFFFFF',
            },
            {
                name: 'Wine',
                background: 'radial-gradient(circle at 15% 80%, #8e344e 0%, #461828 38%, #15080d 75%)',
                text: '#FFFFFF',
            },
            {
                name: 'Moss',
                background: 'linear-gradient(110deg, #243d27 0%, #4e6540 32%, #233524 58%, #0c160f 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Violet',
                background: 'linear-gradient(270deg, #76529a 0%, #402e6b 35%, #1d1739 70%, #0c0a14 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Steel',
                background: 'radial-gradient(ellipse at top, #596a79 0%, #303b46 32%, #11161c 72%)',
                text: '#FFFFFF',
            },
            {
                name: 'Ember',
                background: 'radial-gradient(circle at 85% 80%, #d16632 0%, #7a301b 28%, #32150f 56%, #100806 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Mint',
                background: 'linear-gradient(0deg, #0a1816 0%, #16413b 44%, #4c8879 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Dusk',
                background: 'linear-gradient(165deg, #b87978 0%, #725069 31%, #372b52 62%, #161324 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Rose',
                background: 'radial-gradient(ellipse at 80% 20%, #c95e82 0%, #732d56 35%, #291227 72%, #100912 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Aqua',
                background: 'linear-gradient(90deg, #071719 0%, #0d4c50 30%, #23837f 63%, #78b7a9 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Void',
                background: 'radial-gradient(circle at center, #302249 0%, #171225 38%, #08070c 72%)',
                text: '#FFFFFF',
            },
            {
                name: 'Peach',
                background: 'linear-gradient(200deg, #efb08c 0%, #c87068 31%, #71384a 65%, #251724 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Lime',
                background: 'linear-gradient(70deg, #0d1609 0%, #355125 27%, #7c8f45 61%, #bcc474 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Candy',
                background: 'conic-gradient(from 210deg at 45% 55%, #3e285c, #815078, #d8798e, #8a638e, #3e285c)',
                text: '#FFFFFF',
            },
            {
                name: 'Rust',
                background: 'linear-gradient(135deg, #a84b25 0%, #672719 25%, #26100c 52%, #4a1c12 75%, #8a3820 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Cobalt',
                background:
                    'radial-gradient(circle at 80% 15%, #386d9b 0%, transparent 38%), radial-gradient(circle at 10% 90%, #253e74 0%, transparent 45%), #0b111c',
                text: '#FFFFFF',
            },
            {
                name: 'Plum',
                background:
                    'radial-gradient(circle at 15% 20%, #71458e 0%, transparent 37%), radial-gradient(circle at 85% 80%, #373a83 0%, transparent 43%), #120e1a',
                text: '#FFFFFF',
            },
            {
                name: 'Heat',
                background: 'linear-gradient(90deg, #32111a 0%, #832833 24%, #c45c37 50%, #9a3430 72%, #301018 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Deep',
                background: 'linear-gradient(180deg, #071623 0%, #092d48 35%, #0c5167 58%, #092b3e 78%, #060e16 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Smoke',
                background:
                    'radial-gradient(ellipse at bottom left, #4d5661 0%, #272e36 38%, transparent 68%), linear-gradient(120deg, #15191e, #090b0e)',
                text: '#FFFFFF',
            },
            {
                name: 'Pulse',
                background: 'radial-gradient(circle at 50% 100%, #72487d 0%, #352b59 32%, #15152a 59%, #090a11 100%)',
                text: '#FFFFFF',
            },
            {
                name: 'Sun',
                background: 'radial-gradient(circle at 75% 25%, #f0a45e 0%, #b95b49 24%, #61334c 48%, #23213b 74%, #10121f 100%)',
                text: '#FFFFFF',
            },
        ];
        this.themeSelectors = [
            '#menu',
            '#title',
            '.top-users',
            '#left-menu',
            '.menu-links',
            '.menu--stats-mode',
            '#left_ad_block',
            '#ad_bottom',
            '.ad-block',
            '#left_ad_block > .right-menu',
            '#text-block > .right-menu',
            '#sigma-pass .connecting__content',
            '#sigma-status',
            '.alert',
            '#updates',
            '#shop-area',
        ];
        this.textSelectors = ['#challenge-coins .alert-heading', '#sigma-pass h3', '.alert *'];
        this.modalRootSelector = '.connecting, .chest-modal, #payments-modal, .ctrl-modal';
        this.modalPanelSelector = [
            '.connecting__content',
            '.alert',
            '#payments-modal > div',
            '.ctrl-modal__modal',
            '#chest-modal-body',
            '#total-chest-modal-body',
            '#chest-total-items',
            '#clans-list',
            '#clan-members',
            '#clan-requests',
            '.chest-content-item',
            '.goldmodal-contain',
            '.free-coins-body > div',
        ].join(',');
        this.modalTextSelector = [
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'p',
            'span',
            'li',
            'label',
            'small',
            'strong',
            'b',
            '.chest-modal-title',
            '.chest-content-item-text > div:last-child',
            '.card-particles-value',
        ].join(',');
    }
    async mount() {
        const menu = this.app.features.get('menu');
        if (!(menu instanceof MenuController) || !menu.root) throw new Error('Menu controller is unavailable');
        this.container = menu.root.querySelector('#themes');
        if (!(this.container instanceof HTMLElement)) throw new Error('Theme container is unavailable');
        this.installCompatibility();
        this.createEditor();
        this.setupGradientDrag();
        this.renderThemes();
        this.app.dependencies
            .load('colorPicker')
            .then((Alwan) => {
                if (this.resources.disposed || typeof Alwan !== 'function') return;
                this.editorAlwan = Alwan;
                this.upgradeEditorColorPickers();
            })
            .catch((error) =>
                this.app.logger.warnOnce(
                    'theme-editor-color-picker',
                    'Unable to load Alwan for the theme editor; native color inputs remain available',
                    error
                )
            );
        this.resources.listen(menu.root, 'click', (event) => this.handleMenuClick(event));
        this.resources.listen(menu.root, 'contextmenu', (event) => this.handleThemeRemoval(event));
        this.resources.listen(menu.root, 'sigmod:settingchange', (event) => this.handleSettingChange(event));
        this.resources.listen(this.editor, 'click', (event) => this.handleEditorClick(event));
        this.resources.listen(this.editor, 'input', () => this.updateEditorPreview());
        this.resources.listen(this.editor, 'change', () => this.updateEditorPreview());
        const pendingAdded = new Set();
        const pendingRemoved = new Set();
        const visibilitySelector = [...this.themeSelectors, '.ch-lang', '#discord_link'].join(',');
        const affectsVisibility = (node) =>
            node instanceof Element && (node.matches(visibilitySelector) || Boolean(node.querySelector(visibilitySelector)));
        let visibilityDirty = false;
        let observerFrame = 0;
        const flushMutations = () => {
            observerFrame = 0;
            for (const node of pendingRemoved) this.restoreTree(node);
            for (const node of pendingAdded) {
                this.applyToTree(node);
                this.applyLayoutToTree(node);
            }
            pendingAdded.clear();
            pendingRemoved.clear();
            if (visibilityDirty) {
                visibilityDirty = false;
                this.applyVisibility();
            }
        };
        const observer = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.removedNodes) {
                    if (node instanceof Element) {
                        pendingRemoved.add(node);
                        visibilityDirty ||= affectsVisibility(node);
                    }
                }
                for (const node of record.addedNodes) {
                    if (node instanceof Element) {
                        pendingAdded.add(node);
                        visibilityDirty ||= affectsVisibility(node);
                    }
                }
            }
            if (!observerFrame) observerFrame = requestAnimationFrame(flushMutations);
        });
        const observedRoots = new Set([this.app.dom?.page, document.querySelector(SELECTORS.menuWrapper), menu.root]);
        for (const root of observedRoots) {
            if (root instanceof HTMLElement) {
                this.resources.observe(observer, root, {
                    childList: true,
                    subtree: true,
                });
            }
        }
        this.resources.add(() => {
            if (observerFrame) cancelAnimationFrame(observerFrame);
        });
        this.applyLayout();
        this.applyVisibility();
        visibilityDirty = false;
        this.select(this.findTheme(this.app.settings.themes.current) ?? this.defaults[0], false);
        this.resources.add(() => this.restoreMutations());
    }
    installCompatibility() {
        const previousThemes = window.themes;
        const previousElements = window.themeElements;
        const facade = { defaults: this.defaults, orderly: this.orderly };
        const elementFacade = [...this.themeSelectors];
        window.themes = facade;
        window.themeElements = elementFacade;
        this.resources.add(() => {
            if (window.themes === facade) window.themes = previousThemes;
            if (window.themeElements === elementFacade) window.themeElements = previousElements;
        });
    }
    createEditor() {
        const editor = createElement('div', {
            className: 'theme-editor-content',
            attributes: {
                'aria-label': 'Theme editor',
            },
        });
        editor.innerHTML = `
                <div class="theme-editor-topbar">
                    <div>
                        <div class="theme-editor-title">Theme Editor</div>
                    </div>
                    <button type="button" class="theme-editor-close" id="closeThemeEditor" aria-label="Close theme editor">×</button>
                </div>
                <div class="theme-editor-type-switch" role="tablist" aria-label="Theme type">
                    <button type="button" data-theme-editor-type="color">Color</button>
                    <button type="button" data-theme-editor-type="gradient" class="is-active">Gradient</button>
                    <button type="button" data-theme-editor-type="image">Image</button>
                </div>
                <div class="theme-editor-grid">
                    <div class="theme-editor-controls">
                        <section id="theme_editor_color" class="theme-editor-tab" hidden>
                            <div class="theme-editor-section-title">Colors</div>
                            <label class="theme-editor-row"><span>Background</span><input type="color" value="#111111" id="theme-editor-bgcolorinput"></label>
                            <label class="theme-editor-row"><span>Text</span><input type="color" value="#ffffff" id="theme-editor-colorinput"></label>
                        </section>

                        <section id="theme_editor_gradient" class="theme-editor-tab">
                            <div class="theme-editor-section-head">
                                <div class="theme-editor-section-title">Gradient</div>
                                <button type="button" class="theme-editor-small-btn" id="theme-editor-add-stop">+ Stop</button>
                            </div>
                            <label class="theme-editor-row">
                                <span>Type</span>
                                <select id="gradient-type" class="form-control theme-editor-select">
                                    <option value="linear">Linear</option>
                                    <option value="radial">Radial</option>
                                    <option value="conic">Conic</option>
                                </select>
                            </label>
                            <label class="theme-editor-row" id="theme-editor-gradient_angle">
                                <span id="gradient_angle_text">Angle · 135°</span>
                                <input type="range" class="modSlider" id="g_angle" value="135" min="0" max="360" step="1">
                            </label>
                            <div class="theme-gradient-track" id="theme-gradient-stop-track" aria-label="Gradient stop positions">
                                <div class="theme-gradient-marker-layer" id="theme-gradient-marker-layer"></div>
                            </div>
                            <div class="theme-gradient-stop-list" id="theme-gradient-stop-list"></div>
                            <label class="theme-editor-row"><span>Text</span><input type="color" value="#ffffff" id="theme-editor-gcolor2"></label>
                        </section>

                        <section id="theme_editor_image" class="theme-editor-tab" hidden>
                            <div class="theme-editor-section-title">Image</div>
                            <label class="theme-editor-field">
                                <span>Image or GIF URL</span>
                                <input type="url" id="theme-editor-imagelink" class="form-control" placeholder="https://example.com/background.jpg">
                            </label>
                            <label class="theme-editor-row"><span>Text</span><input type="color" value="#ffffff" id="theme-editor-textcolorImage"></label>
                        </section>
                    </div>

                    <aside class="theme-editor-preview-column">
                        <div class="theme-editor-preview-label">Preview</div>
                        <div class="theme-editor-preview" id="theme_editor_preview">
                            <div class="theme-editor-preview-sidebar"></div>
                            <div class="theme-editor-preview-content">
                                <span class="theme-editor-preview-title">SigMod</span>
                                <span class="theme-editor-preview-copy">Preview text</span>
                                <div class="theme-editor-preview-button">Play</div>
                            </div>
                        </div>
                        <label class="theme-editor-field theme-editor-name-field">
                            <span>Name</span>
                            <input type="text" class="form-control" maxlength="20" placeholder="Theme name" id="themeEditorName">
                        </label>
                        <button type="button" class="modButton-primary theme-editor-save" id="saveTheme">Save theme</button>
                        <div class="theme-editor-hint" id="theme-editor-hint">Right-click a custom preset later to delete it.</div>
                    </aside>
                </div>
            `;
        this.editor = editor;
        this.renderGradientStops();
        this.updateEditorPreview();
        this.resources.add(() => {
            this.editorAnimation?.cancel();
            this.destroyEditorPickers();
            editor.remove();
            if (this.editor === editor) this.editor = null;
        });
    }
    renderThemes() {
        this.container.replaceChildren();
        const createCard = createElement('div', {
            className: 'theme',
            attributes: {
                id: 'createTheme',
                role: 'button',
                tabindex: '0',
            },
        });
        createCard.innerHTML = `
                <div class="themeContent centerXY">
                    ${icon('plus', 20)}
                </div>
                <div class="themeName text" style="color: #fff">Create</div>
            `;
        this.container.append(createCard);
        const custom = this.customThemes();
        const ordered = [...this.orderly, ...custom].sort((a, b) => a.name.localeCompare(b.name));
        for (const theme of [...this.defaults, ...ordered]) {
            this.container.append(this.createThemeCard(theme, custom.includes(theme)));
        }
    }
    createThemeCard(theme, custom) {
        const card = createElement('div', {
            className: 'theme',
            attributes: {
                'data-theme-name': theme.name,
                'data-custom-theme': String(custom),
                role: 'button',
                tabindex: '0',
            },
        });
        const preview = createElement('div', { className: 'themeContent' });
        const previewBackground = this.safeImageUrl(theme.preview) ? theme.preview : theme.background;
        this.setPreview(preview, previewBackground, theme.text);
        const name = createElement('div', {
            className: 'themeName text sigmod-theme-name',
            text: theme.name,
        });
        card.append(preview, name);
        return card;
    }
    handleMenuClick(event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const card = target.closest('[data-theme-name]');
        if (card instanceof HTMLElement) {
            const theme = this.findTheme(card.dataset.themeName);
            if (theme) this.select(theme);
            return;
        }
        if (target.closest('#createTheme')) this.showEditor();
        if (target.closest('#reset_input_radius') || target.closest('#reset_menu_radius')) {
            queueMicrotask(() => this.applyLayout());
        }
    }
    handleThemeRemoval(event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const card = target.closest('[data-custom-theme="true"]');
        if (!(card instanceof HTMLElement)) return;
        event.preventDefault();
        if (!confirm(`Delete the theme "${card.dataset.themeName}"?`)) return;
        this.removeCustomTheme(card.dataset.themeName);
    }
    handleSettingChange(event) {
        const { path } = event.detail ?? {};
        if (path?.startsWith('themes.input') || path === 'themes.menuBorderRadius') this.applyLayout();
        if (path === 'themes.hideDiscordBtns' || path === 'themes.hideLangs' || path === 'themes.hideAds' || path === 'themes.showZigPopup')
            this.applyVisibility();
    }
    handleEditorClick(event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('#closeThemeEditor')) {
            this.hideEditor();
            return;
        }
        const typeButton = target.closest('[data-theme-editor-type]');
        if (typeButton instanceof HTMLButtonElement) {
            this.editorType = typeButton.dataset.themeEditorType || 'gradient';
            this.updateEditorPreview();
            return;
        }
        if (target.closest('#theme-editor-add-stop')) {
            this.addGradientStop();
            return;
        }
        const remove = target.closest('[data-remove-gradient-stop]');
        if (remove instanceof HTMLElement) {
            this.removeGradientStop(Number(remove.dataset.removeGradientStop));
            return;
        }
        if (target.closest('#saveTheme')) this.saveEditorTheme(this.editorType);
    }
    showEditor() {
        if (!this.editor) return;
        const editor = this.editor;
        const modal = this.app.features.get('modal');
        if (!modal) return;
        editor.style.display = 'block';
        modal.open('theme-editor', editor, {
            className: 'modAlert theme-editor-modal',
            closeOnBackdrop: true,
        });
        // Alwan must be connected before its picker mounts.
        this.upgradeEditorColorPickers();
        this.updateEditorPreview();
        this.editor.querySelector('#themeEditorName')?.focus();
    }
    hideEditor() {
        this.app.features.get('modal')?.close('theme-editor');
        this.gradientDrag = null;
    }
    updateEditorPreview() {
        if (!this.editor) return;
        this.syncGradientStopInputs();
        for (const button of this.editor.querySelectorAll('[data-theme-editor-type]')) {
            button.classList.toggle('is-active', button.dataset.themeEditorType === this.editorType);
        }
        const colorPanel = this.editor.querySelector('#theme_editor_color');
        const gradientPanel = this.editor.querySelector('#theme_editor_gradient');
        const imagePanel = this.editor.querySelector('#theme_editor_image');
        if (colorPanel instanceof HTMLElement) colorPanel.hidden = this.editorType !== 'color';
        if (gradientPanel instanceof HTMLElement) gradientPanel.hidden = this.editorType !== 'gradient';
        if (imagePanel instanceof HTMLElement) imagePanel.hidden = this.editorType !== 'image';
        const gradientType = this.value('gradient-type') || 'linear';
        const angleRow = this.editor.querySelector('#theme-editor-gradient_angle');
        if (angleRow instanceof HTMLElement) angleRow.hidden = gradientType === 'radial';
        const angleText = this.editor.querySelector('#gradient_angle_text');
        if (angleText) {
            const angle = Math.round(Number(this.value('g_angle')) || 0);
            angleText.textContent = this.app.i18n?.message('Angle · {angle}°', { angle }) ?? `Angle · ${angle}°`;
        }
        const track = this.editor.querySelector('#theme-gradient-stop-track');
        if (track instanceof HTMLElement) track.style.background = this.gradientValue();
        for (const marker of this.editor.querySelectorAll('[data-gradient-marker]')) {
            const index = Number(marker.getAttribute('data-gradient-marker'));
            const stop = this.gradientStops[index];
            if (!(marker instanceof HTMLElement) || !stop) continue;
            marker.style.left = `${clamp(stop.position, 0, 100)}%`;
            marker.style.background = stop.color;
        }
        let background = '#111111';
        let text = '#ffffff';
        if (this.editorType === 'color') {
            background = this.value('theme-editor-bgcolorinput') || '#111111';
            text = this.value('theme-editor-colorinput') || '#ffffff';
        } else if (this.editorType === 'gradient') {
            background = this.gradientValue();
            text = this.value('theme-editor-gcolor2') || '#ffffff';
        } else {
            const image = this.safeImageUrl(this.value('theme-editor-imagelink'));
            background = image ? `url("${image}")` : '#111111';
            text = this.value('theme-editor-textcolorImage') || '#ffffff';
        }
        const preview = this.editor.querySelector('#theme_editor_preview');
        if (preview instanceof HTMLElement) {
            preview.style.background = background;
            preview.style.backgroundPosition = 'center';
            preview.style.backgroundSize = 'cover';
            preview.style.color = text;
            for (const child of preview.querySelectorAll('.theme-editor-preview-title, .theme-editor-preview-copy')) {
                if (child instanceof HTMLElement) child.style.color = text;
            }
        }
    }
    saveEditorTheme(type) {
        const name = this.value('themeEditorName').trim().slice(0, 20);
        const hint = this.editor?.querySelector('#theme-editor-hint');
        if (!name) {
            if (hint) hint.textContent = 'Give the theme a name first.';
            return;
        }
        if (this.findTheme(name)) {
            if (hint) hint.textContent = 'That theme name is already used.';
            return;
        }
        let background;
        let text;
        if (type === 'color') {
            background = this.value('theme-editor-bgcolorinput') || '#111111';
            text = this.value('theme-editor-colorinput') || '#ffffff';
        } else if (type === 'gradient') {
            if (this.gradientStops.length < 2) return;
            background = this.gradientValue();
            text = this.value('theme-editor-gcolor2') || '#ffffff';
        } else {
            background = this.safeImageUrl(this.value('theme-editor-imagelink'));
            text = this.value('theme-editor-textcolorImage') || '#ffffff';
            if (!background) {
                if (hint) hint.textContent = 'Enter a valid http(s) image URL.';
                return;
            }
        }
        const theme = { name, background, text };
        this.app.settingsStore.update((settings) => settings.themes.custom.push(theme), true);
        this.renderThemes();
        this.select(theme);
        this.hideEditor();
        this.container.scrollTop = this.container.scrollHeight;
        const nameInput = this.editor?.querySelector('#themeEditorName');
        if (nameInput instanceof HTMLInputElement) nameInput.value = '';
        if (hint) hint.textContent = 'Right-click a custom preset later to delete it.';
    }
    removeCustomTheme(name) {
        const selected = this.current?.name === name;
        this.app.settingsStore.update((settings) => {
            settings.themes.custom = settings.themes.custom.filter((theme) => theme.name !== name);
        }, true);
        this.renderThemes();
        if (selected) this.select(this.defaults[0]);
    }
    select(theme, persist = true) {
        if (!this.isTheme(theme)) return;
        this.current = theme;
        this.applyToTree(document);
        if (persist && this.app.settings.themes.current !== theme.name) {
            this.app.settingsStore.set('themes.current', theme.name, true);
        }
        for (const card of this.container?.querySelectorAll('[data-theme-name]') ?? []) {
            card.classList.toggle('selectedTheme', card.getAttribute('data-theme-name') === theme.name);
        }
        document.dispatchEvent(new CustomEvent('sigmod:themechange', { detail: { theme } }));
    }
    applyToTree(root) {
        if (!this.current) return;
        this.applyThemeVariables();
        for (const selector of this.themeSelectors) {
            if (root instanceof Element && root.matches(selector)) this.applyThemeElement(root);
            for (const element of root.querySelectorAll?.(selector) ?? []) this.applyThemeElement(element);
        }
        for (const selector of this.textSelectors) {
            if (root instanceof Element && root.matches(selector)) this.setStyle(root, 'color', this.current.text, 'important');
            for (const element of root.querySelectorAll?.(selector) ?? []) {
                this.setStyle(element, 'color', this.current.text, 'important');
            }
        }
        const page = document.querySelector(SELECTORS.page);
        if (page) {
            for (const element of page.children) this.setStyle(element, 'color', this.current.text);
        }
        this.applyLauncherColor();
        this.applyModalTheme(root);
    }
    applyModalTheme(root) {
        if (!this.current) return;
        const modalRoots = new Set();
        if (root instanceof Element) {
            if (root.matches(this.modalRootSelector)) modalRoots.add(root);
            const ancestor = root.closest(this.modalRootSelector);
            if (ancestor) modalRoots.add(ancestor);
        }
        for (const modal of root.querySelectorAll?.(this.modalRootSelector) ?? []) modalRoots.add(modal);
        if (!modalRoots.size) return;

        const isDark = this.current.name === 'Dark' && this.current.background === '#151515';
        const themeBackground = this.safeImageUrl(this.current.background)
            ? `url("${this.safeImageUrl(this.current.background)}")`
            : this.safeBackground(this.current.background);
        const panelBackground = isDark ? '#151515' : themeBackground;
        const surfaceBackground = isDark ? '#0d0d0d' : themeBackground;
        const scrim = isDark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.5)';

        for (const modal of modalRoots) {
            this.setStyle(modal, 'background-color', scrim, 'important');
            this.setStyle(modal, 'color', this.current.text, 'important');

            const panels = [];
            if (modal.matches(this.modalPanelSelector)) panels.push(modal);
            panels.push(...modal.querySelectorAll(this.modalPanelSelector));
            for (const panel of panels) {
                this.setStyle(panel, 'background', panelBackground, 'important');
                this.setStyle(panel, 'color', this.current.text, 'important');
                this.setStyle(panel, 'border-color', isDark ? '#333333' : 'var(--sigmod-theme-border)', 'important');
            }

            const surfaces = modal.querySelectorAll(
                '.goldmodal-contain, .free-coins-body > div, #chest-modal-body, #total-chest-modal-body, #chest-total-items, #clans-list, #clan-members, #clan-requests'
            );
            for (const surface of surfaces) {
                this.setStyle(surface, 'background', surfaceBackground, 'important');
                this.setStyle(surface, 'color', this.current.text, 'important');
                this.setStyle(surface, 'border-color', isDark ? '#333333' : 'var(--sigmod-theme-border)', 'important');
            }

            for (const text of modal.querySelectorAll(this.modalTextSelector)) {
                this.setStyle(text, 'color', this.current.text, 'important');
            }
            for (const control of modal.querySelectorAll('input, select, textarea')) {
                this.setStyle(control, 'background-color', isDark ? '#111111' : surfaceBackground, 'important');
                this.setStyle(control, 'color', this.current.text, 'important');
                this.setStyle(control, 'border-color', isDark ? '#333333' : 'var(--sigmod-theme-border)', 'important');
            }
        }
    }
    applyThemeVariables() {
        if (!this.current) return;
        const root = document.documentElement;
        const image = this.safeImageUrl(this.current.background);
        const background = image ? `url("${image}")` : this.safeBackground(this.current.background);
        const text = this.current.text;
        const bright =
            /^#[0-9a-f]{6}$/i.test(text) &&
            Number.parseInt(text.slice(1, 3), 16) * 0.299 +
                Number.parseInt(text.slice(3, 5), 16) * 0.587 +
                Number.parseInt(text.slice(5, 7), 16) * 0.114 >
                186;
        this.setStyle(root, '--sigmod-theme-background', background);
        this.setStyle(root, '--sigmod-theme-text', text);
        if (this.current.name === 'Dark' && this.current.background === '#151515') {
            this.setStyle(root, '--sigmod-theme-surface', '#111111');
            this.setStyle(root, '--sigmod-theme-surface-strong', '#0d0d0d');
            this.setStyle(root, '--sigmod-theme-border', '#000000');
            this.setStyle(root, '--sigmod-theme-muted', '#7d7d7d');
            this.setStyle(root, '--sigmod-shop-card-border', '#47759b');
            this.setStyle(root, '--sigmod-shop-card-top', '#52779b');
            this.setStyle(root, '--sigmod-shop-card-bottom', '#2f5371');
            this.setStyle(root, '--sigmod-shop-card-hover-bottom', '#39627f');
        } else if (bright) {
            this.setStyle(root, '--sigmod-theme-surface', 'rgba(0, 0, 0, 0.38)');
            this.setStyle(root, '--sigmod-theme-surface-strong', 'rgba(0, 0, 0, 0.58)');
            this.setStyle(root, '--sigmod-theme-border', 'rgba(255, 255, 255, 0.15)');
            this.setStyle(root, '--sigmod-theme-muted', 'rgba(255, 255, 255, 0.62)');
        } else {
            this.setStyle(root, '--sigmod-theme-surface', 'rgba(255, 255, 255, 0.55)');
            this.setStyle(root, '--sigmod-theme-surface-strong', 'rgba(255, 255, 255, 0.78)');
            this.setStyle(root, '--sigmod-theme-border', 'rgba(0, 0, 0, 0.18)');
            this.setStyle(root, '--sigmod-theme-muted', 'rgba(0, 0, 0, 0.62)');
        }
        if (!(this.current.name === 'Dark' && this.current.background === '#151515')) {
            this.setStyle(root, '--sigmod-shop-card-border', '#4ab3ff');
            this.setStyle(root, '--sigmod-shop-card-top', '#a7d9ff');
            this.setStyle(root, '--sigmod-shop-card-bottom', '#4ab3ff');
            this.setStyle(root, '--sigmod-shop-card-hover-bottom', '#33a5f6');
        }
        this.setStyle(root, '--sigmod-theme-icon-filter', bright ? 'invert(1)' : 'invert(0)');
    }
    applyThemeElement(element) {
        if (element.matches('#title')) {
            this.setStyle(element, 'color', this.current.text);
            return;
        }
        const image = this.safeImageUrl(this.current.background);
        if (image) {
            this.setStyle(element, 'background', `url("${image}")`);
            this.setStyle(element, 'background-position', 'center');
            this.setStyle(element, 'background-size', 'cover');
            this.setStyle(element, 'background-repeat', 'no-repeat');
        } else {
            this.setStyle(element, 'background', this.safeBackground(this.current.background));
            this.setStyle(element, 'background-position', '');
            this.setStyle(element, 'background-size', '');
            this.setStyle(element, 'background-repeat', 'no-repeat');
        }
        this.setStyle(element, 'color', this.current.text);
    }
    applyLayout() {
        this.applyLayoutToTree(document);
    }
    applyLayoutToTree(root) {
        const inputRadius = this.app.settings.themes.inputBorderRadius || '4px';
        const menuRadius = this.app.settings.themes.menuBorderRadius || '15px';
        const inputBorder = this.app.settings.themes.inputBorder === '0px' ? '0px' : '1px';
        const controls = [];
        if (root instanceof Element && root.matches('.form-control')) controls.push(root);
        controls.push(...(root.querySelectorAll?.('.form-control') ?? []));
        for (const element of controls) {
            this.setStyle(element, 'border-radius', inputRadius);
            this.setStyle(element, 'border-width', inputBorder);
        }
        for (const selector of [...this.themeSelectors, '.text-block']) {
            const elements = [];
            if (root instanceof Element && root.matches(selector)) elements.push(root);
            elements.push(...(root.querySelectorAll?.(selector) ?? []));
            for (const element of elements) {
                this.setStyle(element, 'border-radius', menuRadius);
            }
        }
    }
    applyVisibility() {
        const hideDiscord = Boolean(this.app.settings.themes.hideDiscordBtns);
        const hideLanguages = Boolean(this.app.settings.themes.hideLangs);
        const hideAds = this.app.settings.themes.hideAds !== false;
        zigAdEnabled = this.app.settings.themes.showZigPopup === true;
        const discord = document.querySelector('#discord_link');
        const languages = document.querySelector('.ch-lang');
        if (discord) this.setHidden(discord, hideDiscord);
        if (languages) this.setHidden(languages, hideLanguages);
        document.documentElement.classList.toggle('sigmod-hide-ads', hideAds);
        this.app.adProtection?.setEnabled(hideAds);
        if (!zigAdEnabled || hasZigGlobal()) removeZigAd();
        else insertZigAd(this.resources);
    }
    applyLauncherColor() {
        const path = document.querySelector('#clans_and_settings > button:nth-of-type(2) svg path');
        if (!path || !this.current) return;
        const text = this.current.text;
        const bright =
            /^#[0-9a-f]{6}$/i.test(text) &&
            Number.parseInt(text.slice(1, 3), 16) * 0.299 +
                Number.parseInt(text.slice(3, 5), 16) * 0.587 +
                Number.parseInt(text.slice(5, 7), 16) * 0.114 >
                186;
        this.setStyle(path, 'fill', bright ? text : '#222');
    }
    setPreview(element, background, text) {
        if (!(element instanceof HTMLElement)) return;
        const image = this.safeImageUrl(background);
        element.style.background = image ? `url("${image}")` : this.safeBackground(background);
        element.style.backgroundPosition = 'center';
        element.style.backgroundSize = 'cover';
        const label = element.querySelector('.text');
        if (label instanceof HTMLElement) label.style.color = text;
    }
    setStyle(element, property, value, priority = '') {
        if (!(element instanceof HTMLElement || element instanceof SVGElement)) return;
        let properties = this.originalStyles.get(element);
        if (!properties) {
            properties = new Map();
            this.originalStyles.set(element, properties);
        }
        if (!properties.has(property)) {
            properties.set(property, {
                value: element.style.getPropertyValue(property),
                priority: element.style.getPropertyPriority(property),
            });
        }
        element.style.setProperty(property, value, priority);
    }
    setHidden(element, hidden) {
        if (!this.originalClasses.has(element)) this.originalClasses.set(element, element.classList.contains('hidden_full'));
        element.classList.toggle('hidden_full', hidden);
    }
    restoreMutations() {
        for (const [element, properties] of this.originalStyles) {
            this.restoreElementStyles(element, properties);
        }
        for (const [element, hidden] of this.originalClasses) element.classList.toggle('hidden_full', hidden);
        this.originalStyles.clear();
        this.originalClasses.clear();
    }
    restoreTree(root) {
        for (const [element, properties] of this.originalStyles) {
            if (element !== root && !root.contains(element)) continue;
            this.restoreElementStyles(element, properties);
            this.originalStyles.delete(element);
        }
        for (const [element, hidden] of this.originalClasses) {
            if (element !== root && !root.contains(element)) continue;
            element.classList.toggle('hidden_full', hidden);
            this.originalClasses.delete(element);
        }
    }
    restoreElementStyles(element, properties) {
        for (const [property, original] of properties) {
            if (original.value) element.style.setProperty(property, original.value, original.priority);
            else element.style.removeProperty(property);
        }
    }
    get gradientStops() {
        return this.gradientEditor.gradientStops;
    }
    get editorPickers() {
        return this.gradientEditor.editorPickers;
    }
    get editorAlwan() {
        return this.gradientEditor.editorAlwan;
    }
    set editorAlwan(value) {
        this.gradientEditor.editorAlwan = value;
    }
    get gradientDrag() {
        return this.gradientEditor.gradientDrag;
    }
    set gradientDrag(value) {
        this.gradientEditor.gradientDrag = value;
    }
    syncGradientStopInputs() {
        return this.gradientEditor.syncGradientStopInputs();
    }
    renderGradientStops() {
        return this.gradientEditor.renderGradientStops();
    }
    addGradientStop() {
        return this.gradientEditor.addGradientStop();
    }
    removeGradientStop(index) {
        return this.gradientEditor.removeGradientStop(index);
    }
    setupGradientDrag() {
        return this.gradientEditor.setupGradientDrag();
    }
    updateGradientDrag(event) {
        return this.gradientEditor.updateGradientDrag(event);
    }
    destroyGradientStopPickers() {
        return this.gradientEditor.destroyGradientStopPickers();
    }
    destroyEditorPickers() {
        return this.gradientEditor.destroyEditorPickers();
    }
    createEditorPicker(key, input, color, onChange) {
        return this.gradientEditor.createEditorPicker(key, input, color, onChange);
    }
    upgradeEditorColorPickers() {
        return this.gradientEditor.upgradeEditorColorPickers();
    }
    upgradeGradientStopPickers() {
        return this.gradientEditor.upgradeGradientStopPickers();
    }
    gradientValue() {
        return this.gradientEditor.gradientValue();
    }
    value(id) {
        const input = this.editor?.querySelector(`#${id}`);
        return input instanceof HTMLInputElement || input instanceof HTMLSelectElement ? input.value : '';
    }
    findTheme(name) {
        return [...this.defaults, ...this.orderly, ...this.customThemes()].find((theme) => theme.name === name);
    }
    customThemes() {
        return this.app.settings.themes.custom.filter((theme) => this.isTheme(theme));
    }
    isTheme(theme) {
        return isObject(theme) && typeof theme.name === 'string' && typeof theme.background === 'string' && typeof theme.text === 'string';
    }
    safeImageUrl(value) {
        return safeHttpUrl(value);
    }
    safeBackground(value) {
        if (typeof value !== 'string' || /url\s*\(/i.test(value)) return '#151515';
        return CSS.supports('background', value) ? value : '#151515';
    }
}
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Canvas and in-game visual rendering                                               ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
