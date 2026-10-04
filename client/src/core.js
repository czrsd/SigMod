class MatchHistoryStore {
    constructor(logger) {
        this.logger = logger;
        this.database = null;
        this.databasePromise = null;
        this.recentCache = null;
        this.recentCacheCapacity = 0;
        this.recentCacheComplete = false;
        this.summaryCache = null;
    }
    normalize(entry) {
        if (!isObject(entry)) return null;
        return {
            at: Math.max(0, Number(entry.at) || Date.now()),
            duration: Math.max(0, Math.round(Number(entry.duration) || 0)),
            highestMass: Math.max(0, Math.round(Number(entry.highestMass) || 0)),
            kills: Math.max(0, Math.round(Number(entry.kills) || 0)),
            splitKills: Math.max(0, Math.round(Number(entry.splitKills) || 0)),
            pelletsEaten: Math.max(0, Math.round(Number(entry.pelletsEaten) || 0)),
            splits: Math.max(0, Math.round(Number(entry.splits) || 0)),
            topPosition:
                entry.topPosition != null && Number.isFinite(Number(entry.topPosition))
                    ? Math.max(1, Math.round(Number(entry.topPosition)))
                    : null,
            leaderboardTime: Math.max(0, Math.round(Number(entry.leaderboardTime) || 0)),
            firstPlaceTime: Math.max(0, Math.round(Number(entry.firstPlaceTime) || 0)),
            averagePing: Math.max(0, Math.round(Number(entry.averagePing) || 0)),
            averagePlayerCount: Math.max(0, Math.round(Number(entry.averagePlayerCount) || 0)),
            peakPlayerCount: Math.max(0, Math.round(Number(entry.peakPlayerCount) || 0)),
            partySize: Math.max(1, Math.round(Number(entry.partySize) || 1)),
        };
    }
    legacyId(entry) {
        return `legacy:${entry.at}:${entry.duration}:${entry.highestMass}:${entry.kills}:${entry.splitKills}:${entry.pelletsEaten}:${entry.splits}`;
    }
    legacySignature(entries) {
        const value = JSON.stringify(entries);
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `${entries.length}:${(hash >>> 0).toString(36)}`;
    }
    ready() {
        if (this.databasePromise) return this.databasePromise;
        this.databasePromise = this.openDatabase()
            .then(async (database) => {
                this.database = database;
                const legacyChanged = await this.migrateLegacy(database);
                if (legacyChanged) await this.rebuildSummary(database);
                else await this.ensureSummary(database);
                return database;
            })
            .catch((error) => {
                this.logger?.warnOnce(
                    'statistics-database',
                    'IndexedDB statistics are unavailable; using the legacy local fallback',
                    error
                );
                return null;
            });
        return this.databasePromise;
    }
    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(STORAGE.statsDatabase, 2);
            request.addEventListener('upgradeneeded', () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(STORAGE.statsMatchStore)) {
                    const matches = database.createObjectStore(STORAGE.statsMatchStore, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                    matches.createIndex('at', 'at', { unique: false });
                    matches.createIndex('highestMass', 'highestMass', {
                        unique: false,
                    });
                }
                if (!database.objectStoreNames.contains(STORAGE.statsMetaStore)) {
                    database.createObjectStore(STORAGE.statsMetaStore, {
                        keyPath: 'key',
                    });
                }
            });
            request.addEventListener('success', () => resolve(request.result), {
                once: true,
            });
            request.addEventListener('error', () => reject(request.error ?? new Error('Unable to open statistics database')), {
                once: true,
            });
            request.addEventListener('blocked', () => reject(new Error('Statistics database upgrade is blocked')), { once: true });
        });
    }
    readLegacy() {
        const value = readLocalJson(STORAGE.statsHistory, []);
        return Array.isArray(value) ? value.map((item) => this.normalize(item)).filter(Boolean) : [];
    }
    async migrateLegacy(database) {
        const legacy = this.readLegacy();
        if (!legacy.length) return false;
        const signature = this.legacySignature(legacy);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORAGE.statsMatchStore, STORAGE.statsMetaStore], 'readwrite');
            const store = transaction.objectStore(STORAGE.statsMatchStore);
            const meta = transaction.objectStore(STORAGE.statsMetaStore);
            let changed = false;
            const marker = meta.get('legacy-migration');
            marker.addEventListener('success', () => {
                if (marker.result?.value === signature) return;
                for (const entry of legacy) {
                    const id = this.legacyId(entry);
                    const request = store.getKey(id);
                    request.addEventListener('success', () => {
                        if (request.result !== undefined) return;
                        changed = true;
                        store.put({ ...entry, id });
                    });
                }
                meta.put({
                    key: 'legacy-migration',
                    value: signature,
                });
            });
            transaction.addEventListener('complete', () => resolve(changed), {
                once: true,
            });
            transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Legacy statistics migration was aborted')), {
                once: true,
            });
            transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Unable to migrate legacy statistics')), {
                once: true,
            });
        });
    }
    request(database, mode, action) {
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORAGE.statsMatchStore, mode);
            const store = transaction.objectStore(STORAGE.statsMatchStore);
            let request;
            try {
                request = action(store);
            } catch (error) {
                reject(error);
                return;
            }
            request?.addEventListener('success', () => resolve(request.result), {
                once: true,
            });
            request?.addEventListener('error', () => reject(request.error ?? new Error('Statistics database request failed')), {
                once: true,
            });
            if (!request) {
                transaction.addEventListener('complete', () => resolve(undefined), {
                    once: true,
                });
            }
        });
    }
    async add(entry) {
        const normalized = this.normalize(entry);
        if (!normalized) return false;
        const database = await this.ready();
        if (!database) return this.addLegacyFallback(normalized);
        try {
            let nextSummary = null;
            await new Promise((resolve, reject) => {
                const transaction = database.transaction([STORAGE.statsMatchStore, STORAGE.statsMetaStore], 'readwrite');
                const matches = transaction.objectStore(STORAGE.statsMatchStore);
                const meta = transaction.objectStore(STORAGE.statsMetaStore);
                matches.add(normalized);
                const summaryRequest = meta.get('summary');
                summaryRequest.addEventListener('success', () => {
                    const summary = this.normalizeSummary(summaryRequest.result?.value);
                    this.accumulate(summary, normalized);
                    nextSummary = summary;
                    meta.put({ key: 'summary', value: summary });
                });
                transaction.addEventListener('complete', resolve, {
                    once: true,
                });
                transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Unable to save match history')), {
                    once: true,
                });
                transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Unable to save match history')), {
                    once: true,
                });
            });
            if (nextSummary) this.summaryCache = nextSummary;
            if (this.recentCache) {
                this.recentCache.push(normalized);
                if (this.recentCache.length > this.recentCacheCapacity) {
                    this.recentCache.splice(0, this.recentCache.length - this.recentCacheCapacity);
                    this.recentCacheComplete = false;
                }
            }
            return true;
        } catch (error) {
            this.logger?.warnOnce(
                'statistics-save-match',
                'Unable to save match history to IndexedDB; using the legacy local fallback',
                error
            );
            return this.addLegacyFallback(normalized);
        }
    }
    addLegacyFallback(entry) {
        const history = this.readLegacy();
        history.push(entry);
        if (!writeLocalJson(STORAGE.statsHistory, history.slice(-240))) {
            this.logger?.warnOnce('statistics-legacy-fallback', 'Unable to save local match history');
            return false;
        }
        return true;
    }
    async getRecent(limit = 120) {
        const safeLimit = Math.max(1, Math.min(500, Math.round(Number(limit) || 120)));
        if (this.recentCache && (safeLimit <= this.recentCache.length || this.recentCacheComplete)) {
            return this.recentCache.slice(-safeLimit);
        }
        const database = await this.ready();
        if (!database) return this.readLegacy().slice(-safeLimit);
        if (this.recentCache && (safeLimit <= this.recentCache.length || this.recentCacheComplete)) {
            return this.recentCache.slice(-safeLimit);
        }
        const queryLimit = Math.max(120, safeLimit);
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORAGE.statsMatchStore, 'readonly');
            const index = transaction.objectStore(STORAGE.statsMatchStore).index('at');
            const request = index.openCursor(null, 'prev');
            const items = [];
            request.addEventListener('success', () => {
                const cursor = request.result;
                if (!cursor || items.length >= queryLimit) {
                    this.recentCache = items.reverse();
                    this.recentCacheCapacity = queryLimit;
                    this.recentCacheComplete = !cursor;
                    resolve(this.recentCache.slice(-safeLimit));
                    return;
                }
                const item = this.normalize(cursor.value);
                if (item) items.push(item);
                cursor.continue();
            });
            request.addEventListener('error', () => reject(request.error ?? new Error('Unable to read recent match history')), {
                once: true,
            });
        }).catch((error) => {
            this.logger?.warnOnce('statistics-read-recent', 'Unable to read recent match history', error);
            return this.readLegacy().slice(-safeLimit);
        });
    }
    async getSummary() {
        if (this.summaryCache) return { ...this.summaryCache };
        const database = await this.ready();
        if (!database) return this.summarize(this.readLegacy());
        if (this.summaryCache) return { ...this.summaryCache };
        try {
            const value = await new Promise((resolve, reject) => {
                const transaction = database.transaction(STORAGE.statsMetaStore, 'readonly');
                const request = transaction.objectStore(STORAGE.statsMetaStore).get('summary');
                request.addEventListener('success', () => resolve(request.result?.value ?? null), { once: true });
                request.addEventListener('error', () => reject(request.error ?? new Error('Unable to read statistics summary')), {
                    once: true,
                });
            });
            if (value) {
                this.summaryCache = this.normalizeSummary(value);
                return { ...this.summaryCache };
            }
            return await this.rebuildSummary(database);
        } catch (error) {
            this.logger?.warnOnce('statistics-summary', 'Unable to read statistics summary', error);
            return this.summarize(this.readLegacy());
        }
    }
    normalizeSummary(value) {
        const summary = this.emptySummary();
        if (!isObject(value)) return summary;
        summary.count = Math.max(0, Math.round(Number(value.count) || 0));
        summary.totalDuration = Math.max(0, Math.round(Number(value.totalDuration) || 0));
        summary.totalKills = Math.max(0, Math.round(Number(value.totalKills) || 0));
        summary.totalPellets = Math.max(0, Math.round(Number(value.totalPellets) || 0));
        summary.totalSplits = Math.max(0, Math.round(Number(value.totalSplits) || 0));
        summary.bestPosition = Number.isFinite(Number(value.bestPosition)) ? Math.max(1, Math.round(Number(value.bestPosition))) : null;
        summary.pingTotal = Math.max(0, Math.round(Number(value.pingTotal) || 0));
        summary.pingCount = Math.max(0, Math.round(Number(value.pingCount) || 0));
        return summary;
    }
    async ensureSummary(database) {
        const existing = await new Promise((resolve, reject) => {
            const transaction = database.transaction(STORAGE.statsMetaStore, 'readonly');
            const request = transaction.objectStore(STORAGE.statsMetaStore).get('summary');
            request.addEventListener('success', () => resolve(request.result?.value ?? null), { once: true });
            request.addEventListener('error', () => reject(request.error), {
                once: true,
            });
        });
        if (!existing) await this.rebuildSummary(database);
        else this.summaryCache = this.normalizeSummary(existing);
    }
    rebuildSummary(database) {
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORAGE.statsMatchStore, STORAGE.statsMetaStore], 'readwrite');
            const matches = transaction.objectStore(STORAGE.statsMatchStore);
            const meta = transaction.objectStore(STORAGE.statsMetaStore);
            const summary = this.emptySummary();
            const request = matches.openCursor();
            request.addEventListener('success', () => {
                const cursor = request.result;
                if (!cursor) {
                    meta.put({ key: 'summary', value: summary });
                    return;
                }
                const item = this.normalize(cursor.value);
                if (item) this.accumulate(summary, item);
                cursor.continue();
            });
            transaction.addEventListener(
                'complete',
                () => {
                    this.summaryCache = summary;
                    resolve({ ...summary });
                },
                { once: true }
            );
            transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Unable to rebuild statistics summary')), {
                once: true,
            });
            transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Unable to rebuild statistics summary')), {
                once: true,
            });
        });
    }
    emptySummary() {
        return {
            count: 0,
            totalDuration: 0,
            totalKills: 0,
            totalPellets: 0,
            totalSplits: 0,
            bestPosition: null,
            pingTotal: 0,
            pingCount: 0,
        };
    }
    accumulate(summary, item) {
        summary.count += 1;
        summary.totalDuration += item.duration;
        summary.totalKills += item.kills;
        summary.totalPellets += item.pelletsEaten;
        summary.totalSplits += item.splits;
        if (Number.isFinite(item.topPosition)) {
            summary.bestPosition = summary.bestPosition === null ? item.topPosition : Math.min(summary.bestPosition, item.topPosition);
        }
        if (item.averagePing > 0) {
            summary.pingTotal += item.averagePing;
            summary.pingCount += 1;
        }
        return summary;
    }
    summarize(items) {
        const summary = this.emptySummary();
        for (const item of items) this.accumulate(summary, item);
        return summary;
    }
    close() {
        this.database?.close();
        this.database = null;
        this.databasePromise = null;
        this.recentCache = null;
        this.recentCacheCapacity = 0;
        this.recentCacheComplete = false;
        this.summaryCache = null;
    }
}
const debounce = (callback, delay) => {
    let timer = 0;
    let pendingArgs = null;
    const invoke = () => {
        if (!pendingArgs) return;
        const args = pendingArgs;
        pendingArgs = null;
        timer = 0;
        callback(...args);
    };
    const debounced = (...args) => {
        pendingArgs = args;
        clearTimeout(timer);
        timer = window.setTimeout(invoke, delay);
    };
    debounced.flush = () => {
        clearTimeout(timer);
        invoke();
    };
    debounced.cancel = () => {
        clearTimeout(timer);
        timer = 0;
        pendingArgs = null;
    };
    return debounced;
};
const isTyping = () => {
    const active = document.activeElement;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active?.isContentEditable;
};
const pressEscape = () => {
    for (const type of ['keydown', 'keyup']) {
        document.dispatchEvent(
            new KeyboardEvent(type, {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
                cancelable: true,
            })
        );
    }
};
const isMenuClosed = () => {
    const menu = document.querySelector(SELECTORS.menuWrapper);
    return menu instanceof HTMLElement && getComputedStyle(menu).display === 'none';
};
const isDeadScreenVisible = () => {
    const screen = document.querySelector(SELECTORS.deathScreen);
    if (!(screen instanceof HTMLElement)) return false;
    if (screen.classList.contains('line--hidden')) return false;
    return getComputedStyle(screen).display !== 'none';
};
const getGameMode = () => {
    const select = document.querySelector(SELECTORS.gameMode);
    if (!(select instanceof HTMLSelectElement)) return 'FFA';
    const value = select.value;
    if (!value) return 'FFA';
    const option = select.querySelector(`option[value="${CSS.escape(value)}"]`) ?? select.selectedOptions[0];
    return option?.textContent?.trim().split(/\s+/)[0] || 'FFA';
};
const createElement = (tag, options = {}) => {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = String(options.text);
    if (options.icon) element.innerHTML = icon(options.icon, options.iconSize ?? 18);
    if (options.attributes) {
        for (const [name, value] of Object.entries(options.attributes)) {
            element.setAttribute(name, String(value));
        }
    }
    return element;
};
const createColorPickerReset = (ariaLabel, id = undefined) => {
    const button = createElement('button', {
        className: 'resetButton',
        icon: 'reset',
        attributes: {
            ...(id ? { id } : {}),
            type: 'button',
            'aria-label': ariaLabel,
        },
    });
    const container = createElement('div', {
        className: 'colorpicker-additional',
    });
    container.append(createElement('span', { text: 'Reset Color' }), button);
    return { container, button };
};
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Runtime primitives: diagnostics, lifecycle, events and settings                   ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
class Logger {
    constructor(prefix = 'SigMod') {
        this.prefix = prefix;
        this.seen = new Set();
    }
    info(...values) {
        console.info(`[${this.prefix}]`, ...values);
    }
    warn(...values) {
        console.warn(`[${this.prefix}]`, ...values);
    }
    warnOnce(key, ...values) {
        if (this.seen.has(key)) return;
        this.seen.add(key);
        this.warn(...values);
    }
    error(...values) {
        console.error(`[${this.prefix}]`, ...values);
    }
}
class Disposables {
    constructor(name = 'root', logger = null) {
        this.name = name;
        this.logger = logger;
        this.items = [];
        this.children = new Map();
        this.disposed = false;
        this.onDispose = null;
    }
    add(disposer) {
        if (this.disposed) {
            try {
                disposer();
            } catch (error) {
                this.logger?.warn('Late cleanup failed', this.name, error);
            }
            return disposer;
        }
        this.items.push(disposer);
        return disposer;
    }
    remove(disposer) {
        const index = this.items.indexOf(disposer);
        if (index >= 0) this.items.splice(index, 1);
    }
    listen(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        return this.add(() => target.removeEventListener(type, listener, options));
    }
    timeout(callback, delay) {
        const dispose = () => clearTimeout(id);
        const id = setTimeout(() => {
            this.remove(dispose);
            callback();
        }, delay);
        this.add(dispose);
        return id;
    }
    interval(callback, delay) {
        const id = setInterval(callback, delay);
        this.add(() => clearInterval(id));
        return id;
    }
    frame(callback) {
        const id = requestAnimationFrame(callback);
        this.add(() => cancelAnimationFrame(id));
        return id;
    }
    observe(observer, target, options) {
        observer.observe(target, options);
        this.add(() => observer.disconnect());
        return observer;
    }
    patch(target, property, replacement) {
        const original = target[property];
        target[property] = replacement;
        this.add(() => {
            if (target[property] === replacement) target[property] = original;
        });
        return original;
    }
    child(name) {
        const existing = this.children.get(name);
        if (existing && !existing.disposed) return existing;
        const child = new Disposables(`${this.name}/${name}`, this.logger);
        this.children.set(name, child);
        const disposeChild = () => child.dispose();
        this.add(disposeChild);
        child.onDispose = () => {
            if (this.children.get(name) === child) this.children.delete(name);
            this.remove(disposeChild);
        };
        return child;
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        const items = this.items.splice(0).reverse();
        for (const dispose of items) {
            try {
                dispose();
            } catch (error) {
                this.logger?.warn('Cleanup failed', this.name, error);
            }
        }
        this.children.clear();
        this.onDispose?.();
        this.onDispose = null;
    }
    snapshot() {
        return {
            name: this.name,
            disposed: this.disposed,
            resources: this.items.length,
            children: [...this.children.values()].map((child) => child.snapshot()),
        };
    }
}
class Emitter {
    constructor() {
        this.listeners = new Map();
    }
    on(type, listener) {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
        return () => listeners.delete(listener);
    }
    emit(type, payload) {
        for (const listener of this.listeners.get(type) ?? []) listener(payload);
    }
    clear() {
        this.listeners.clear();
    }
}
class Localization {
    constructor(app) {
        this.app = app;
        this.locale = 'en';
        this.messages = new Map([['en', {}]]);
        this.loading = new Map();
        this.textSources = new WeakMap();
        this.attributeSources = new WeakMap();
        this.requestVersion = 0;
        this.observer = null;
        this.observerRoot = null;
        this.observerQueued = false;
    }
    static languages() {
        return [
            ['en', 'English'],
            ['es', 'Español'],
            ['tr', 'Türkçe'],
            ['fr', 'Français'],
            ['pt', 'Português'],
            ['ru', 'Русский'],
            ['de', 'Deutsch'],
        ];
    }
    normalizeLocale(value) {
        const code = String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/_/g, '-');
        const base = code.split('-')[0];
        return Localization.languages().some(([supported]) => supported === base) ? base : null;
    }
    readPreference() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE.localization) || 'null');
            return this.normalizeLocale(value?.language ?? value);
        } catch {
            return null;
        }
    }
    writePreference(locale) {
        try {
            localStorage.setItem(STORAGE.localization, JSON.stringify({ version: 1, language: locale }));
        } catch (error) {
            this.app.logger.warn('Unable to save language preference', error);
        }
    }
    detectLocale() {
        const pathLocale = this.normalizeLocale(location.pathname.split('/').filter(Boolean)[0]);
        if (pathLocale && pathLocale !== 'en') return pathLocale;
        const candidates = [...(navigator.languages || []), navigator.language, window.lang, document.documentElement.lang];
        for (const candidate of candidates) {
            const locale = this.normalizeLocale(candidate);
            if (locale) return locale;
        }
        return 'en';
    }
    initialize() {
        const stored = this.readPreference();
        if (stored) {
            if (stored !== 'en') void this.setLanguage(stored, { persist: false });
            return;
        }
        const detected = this.detectLocale();
        if (detected === 'en') {
            this.writePreference('en');
            return;
        }
        void this.setLanguage(detected, { detected: true });
    }
    catalogueUrl(locale) {
        const base = SIGMOD_DEV.enabled ? SIGMOD_DEV.localeUrl : SIGMOD_DEV.productionLocaleUrl;
        const suffix = SIGMOD_DEV.enabled ? `?t=${Date.now()}` : '';
        return `${base}/${encodeURIComponent(locale)}.json${suffix}`;
    }
    async load(locale) {
        if (this.messages.has(locale)) return this.messages.get(locale);
        if (this.loading.has(locale)) return this.loading.get(locale);
        const request = (async () => {
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 4_000);
            try {
                const response = await fetch(this.catalogueUrl(locale), {
                    cache: SIGMOD_DEV.enabled ? 'no-store' : 'force-cache',
                    credentials: 'omit',
                    referrerPolicy: 'no-referrer',
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error(`Language pack request failed (${response.status})`);
                const payload = await response.json();
                if (!isObject(payload) || payload.locale !== locale || !isObject(payload.messages)) {
                    throw new Error('Language pack has an invalid format');
                }
                const messages = Object.fromEntries(Object.entries(payload.messages).filter(([, value]) => typeof value === 'string'));
                this.messages.set(locale, messages);
                return messages;
            } finally {
                window.clearTimeout(timeout);
                this.loading.delete(locale);
            }
        })();
        this.loading.set(locale, request);
        return request;
    }
    message(source, parameters = null) {
        const value = this.messages.get(this.locale)?.[source];
        const text = typeof value === 'string' ? value : source;
        if (!parameters || !isObject(parameters)) return text;
        return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
            parameters[key] === undefined || parameters[key] === null ? match : String(parameters[key])
        );
    }
    async setLanguage(value, { persist = true, detected = false } = {}) {
        const locale = this.normalizeLocale(value);
        if (!locale) return false;
        if (persist) this.writePreference(locale);
        const version = ++this.requestVersion;
        this.setStatus('Loading language…');
        try {
            await this.load(locale);
            if (version !== this.requestVersion) return false;
            this.locale = locale;
            this.apply();
            this.setStatus('');
            return true;
        } catch (error) {
            if (version !== this.requestVersion) return false;
            if (detected) this.writePreference('en');
            this.app.logger.warn(`Unable to load ${locale} language pack; using English`, error);
            this.apply();
            this.setStatus('Language pack unavailable. Using English.');
            return false;
        }
    }
    attributeSource(element, name) {
        let sources = this.attributeSources.get(element);
        if (!sources) {
            sources = new Map();
            this.attributeSources.set(element, sources);
        }
        if (!sources.has(name)) sources.set(name, element.getAttribute(name));
        return sources.get(name);
    }
    shouldTranslate(element) {
        if (!(element instanceof Element) || element.closest('[data-i18n-skip]')) return false;
        return !element.closest('script, style, code, pre');
    }
    translateTree(root) {
        if (!(root instanceof Element)) return;
        if (root.matches('[data-sigmod-root]')) {
            for (const name of ['title', 'placeholder', 'aria-label', 'data-label']) {
                if (!root.hasAttribute(name)) continue;
                const source = this.attributeSource(root, name);
                if (source) root.setAttribute(name, this.message(source));
            }
        }
        const scopes = [
            ...(root.matches('[data-mod-panel], [data-sigmod-localize]') ? [root] : []),
            ...root.querySelectorAll('[data-mod-panel], [data-sigmod-localize]'),
        ];
        for (const scope of scopes) {
            const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            while (walker.nextNode()) textNodes.push(walker.currentNode);
            for (const node of textNodes) {
                const parent = node.parentElement;
                if (!this.shouldTranslate(parent)) continue;
                const source = this.textSources.get(node) ?? node.textContent;
                if (!source || !source.trim()) continue;
                this.textSources.set(node, source);
                node.textContent = this.message(source);
            }
            for (const element of scope.querySelectorAll('[title], [placeholder], [aria-label], [data-label]')) {
                if (!this.shouldTranslate(element)) continue;
                for (const name of ['title', 'placeholder', 'aria-label', 'data-label']) {
                    if (!element.hasAttribute(name)) continue;
                    const source = this.attributeSource(element, name);
                    if (source) element.setAttribute(name, this.message(source));
                }
            }
        }
    }
    observe(root) {
        if (!(root instanceof HTMLElement) || this.observerRoot === root) return;
        this.observer?.disconnect();
        this.observerRoot = root;
        this.observer = new MutationObserver(() => {
            if (this.observerQueued) return;
            this.observerQueued = true;
            queueMicrotask(() => {
                this.observerQueued = false;
                if (this.observerRoot !== root) return;
                this.translateTree(root);
                this.syncControl(root);
            });
        });
        this.observer.observe(root, { childList: true, subtree: true });
    }
    syncControl(root) {
        const select = root?.querySelector('[data-localization-language]');
        if (select instanceof HTMLSelectElement) select.value = this.readPreference() || this.locale;
    }
    setStatus(message) {
        const root = this.app.features.get('menu')?.root;
        const status = root?.querySelector('#sigmod-language-status');
        if (status instanceof HTMLElement) status.textContent = this.message(message);
    }
    apply() {
        const root = this.app.features.get('menu')?.root;
        if (!(root instanceof HTMLElement)) return;
        this.observe(root);
        root.lang = this.locale;
        root.dir = 'ltr';
        this.translateTree(root);
        this.syncControl(root);
        this.app.features.get('menu')?.homeSearch?.syncSearchLabel();
        root.dispatchEvent(
            new CustomEvent('sigmod:languagechange', {
                bubbles: true,
                detail: { locale: this.locale },
            })
        );
    }
}

class SettingsStore {
    constructor(storage, key, defaults, logger) {
        this.storage = storage;
        this.key = key;
        this.defaults = defaults;
        this.logger = logger;
        this.value = clone(defaults);
        this.savedKeys = clone(defaults.macros.keys);
        this.changeListeners = new Set();
        this.flushLater = debounce(() => this.flush(), 100);
    }
    load() {
        let source;
        try {
            source = this.storage.getItem(this.key);
        } catch (error) {
            this.logger.warn('Unable to read settings; defaults were loaded', error);
            return this.value;
        }
        if (!source) {
            this.flush();
            return this.value;
        }
        let parsed;
        try {
            parsed = JSON.parse(source);
        } catch (error) {
            this.backup(source, 'invalid-json');
            this.logger.warn('Stored settings are invalid; defaults were loaded', error);
            this.flush();
            return this.value;
        }
        const sourceVersion = Number(parsed?.storageVersion) || 1;
        if (sourceVersion > BUILD.settingsVersion) {
            this.backup(source, `future-v${sourceVersion}`);
            this.logger.warn(`Settings version ${sourceVersion} is newer than this client`);
            return this.value;
        }
        if (sourceVersion < BUILD.settingsVersion) this.backup(source, `v${sourceVersion}`);
        const migrated = this.migrate(parsed, sourceVersion);
        this.value = this.normalize(mergeKnown(this.defaults, migrated));
        this.savedKeys = clone(this.value.macros.keys);
        if (JSON.stringify(this.value) !== source) this.flush();
        return this.value;
    }
    migrate(input, sourceVersion) {
        if (!isObject(input)) return clone(this.defaults);
        const value = clone(input);
        if (sourceVersion <= 1) {
            if (value.macros?.feedSpeed !== undefined) {
                value.macros.feedSpeed = Number(value.macros.feedSpeed);
            }
            if (value.macros?.keys?.line?.instantSplit !== undefined) {
                value.macros.keys.line.instantSplit = Number(value.macros.keys.line.instantSplit);
            }
            if (value.settings?.pingDuration !== undefined) {
                value.settings.pingDuration = Number(value.settings.pingDuration);
            }
        }
        if (isObject(value.macros?.mouse)) {
            const mouse = value.macros.mouse;
            const bindings = Array.isArray(mouse.bindings) ? mouse.bindings.filter(isObject) : [];
            for (const [legacyKey, button] of [
                ['left', 0],
                ['right', 2],
            ]) {
                if (own(mouse, legacyKey) && !bindings.some((binding) => binding.button === button)) {
                    bindings.push({ button, action: mouse[legacyKey] });
                }
            }
            value.macros.mouse = { bindings };
        }
        if (own(value, 'virusImage') && !value.game?.virusImage) {
            value.game ??= {};
            value.game.virusImage = value.virusImage;
        }
        if (own(value, 'deathScreenPos') && !value.settings?.deathScreenPos) {
            value.settings ??= {};
            value.settings.deathScreenPos = value.deathScreenPos;
        }
        value.storageVersion = BUILD.settingsVersion;
        return value;
    }
    normalize(value) {
        const normalizeBinding = (binding) => {
            if (binding === null || binding === '') return null;
            return typeof binding === 'string' ? binding.toLowerCase() : null;
        };
        const normalizeNullableString = (input) => (typeof input === 'string' ? input : null);
        const normalizeBoolean = (input, fallback) => (typeof input === 'boolean' ? input : fallback);
        const mouseMacros = new Set(['fastfeed', 'split', 'split2', 'split3', 'split4', 'freeze', 'dTrick', 'sTrick', 'ping']);
        value.storageVersion = BUILD.settingsVersion;
        value.macros.feedSpeed = clamp(Number(value.macros.feedSpeed) || 40, 5, 100);
        value.macros.keys.line.instantSplit = clamp(Math.trunc(Number(value.macros.keys.line.instantSplit) || 0), 0, 4);
        for (const [key, binding] of Object.entries(value.macros.keys)) {
            if (isObject(binding)) {
                for (const [nestedKey, nestedBinding] of Object.entries(binding)) {
                    if (nestedKey !== 'instantSplit') binding[nestedKey] = normalizeBinding(nestedBinding);
                }
            } else value.macros.keys[key] = normalizeBinding(binding);
        }
        const seenBindings = new Set();
        const clearDuplicateBindings = (group) => {
            for (const [name, binding] of Object.entries(group)) {
                if (name === 'instantSplit' || typeof binding !== 'string') continue;
                if (seenBindings.has(binding)) group[name] = null;
                else seenBindings.add(binding);
            }
        };
        for (const [name, binding] of Object.entries(value.macros.keys)) {
            if (isObject(binding)) clearDuplicateBindings(binding);
            else if (typeof binding === 'string') {
                if (seenBindings.has(binding)) value.macros.keys[name] = null;
                else seenBindings.add(binding);
            }
        }
        const mouseBindings = new Map();
        for (const binding of value.macros.mouse.bindings) {
            if (!isObject(binding)) continue;
            const button = Number(binding.button);
            if (!Number.isSafeInteger(button) || button < 0 || button > 32_767 || !mouseMacros.has(binding.action)) continue;
            mouseBindings.set(button, {
                button,
                action: binding.action,
            });
        }
        value.macros.mouse.bindings = [...mouseBindings.values()].sort((left, right) => left.button - right.button);
        for (const field of ['borderColor', 'foodColor', 'cellColor']) {
            value.game[field] = normalizeNullableString(value.game[field]);
        }
        value.game.skins.original = normalizeNullableString(value.game.skins.original);
        value.game.skins.replacement = normalizeNullableString(value.game.skins.replacement);
        value.game.map.color = normalizeNullableString(value.game.map.color);
        value.game.name.color = normalizeNullableString(value.game.name.color);
        value.game.name.gradient.left = normalizeNullableString(value.game.name.gradient.left);
        value.game.name.gradient.right = normalizeNullableString(value.game.name.gradient.right);
        value.themes.custom = value.themes.custom.filter(
            (theme) =>
                isObject(theme) && typeof theme.name === 'string' && typeof theme.background === 'string' && typeof theme.text === 'string'
        );
        value.themes.inputBorderRadius = normalizeNullableString(value.themes.inputBorderRadius);
        value.themes.menuBorderRadius = normalizeNullableString(value.themes.menuBorderRadius);
        for (const key of ['hideDiscordBtns', 'hideLangs', 'hideAds']) {
            value.themes[key] = normalizeBoolean(value.themes[key], this.defaults.themes[key]);
        }
        value.settings.pingDuration = clamp(Number(value.settings.pingDuration) || 2_000, 250, 30_000);
        value.settings.savedNames = [...new Set(value.settings.savedNames.filter((name) => typeof name === 'string'))];
        value.settings.partyPanel.x = Number.isFinite(Number(value.settings.partyPanel.x)) ? Number(value.settings.partyPanel.x) : 0;
        value.settings.partyPanel.y = Number.isFinite(Number(value.settings.partyPanel.y)) ? Number(value.settings.partyPanel.y) : 0;
        value.settings.tag = normalizeNullableString(value.settings.tag);
        if (!['center', 'left', 'right', 'top', 'bottom'].includes(value.settings.deathScreenPos)) {
            value.settings.deathScreenPos = 'center';
        }
        value.settings.quickAccess = Array.isArray(value.settings.quickAccess)
            ? [...new Set(value.settings.quickAccess.filter((item) => typeof item === 'string'))]
            : clone(this.defaults.settings.quickAccess);
        const previousDefaults = [
            [
                'host:showNames',
                'host:showSkins',
                'host:showMass',
                'host:showFood',
                'host:darkTheme',
                'host:showChat',
                'host:showMinimap',
                'host:showBorder',
                'host:showGrid',
                'host:moreZoom',
                'host:jellyPhysics',
                'host:showClanmates',
                'setting:settings.playTimer',
                'setting:settings.mouseTracker',
                'host:autoRespawn',
                'host:showLeaderboard',
                'host:autoClaimCoins',
            ],
            [
                'host:showNames',
                'host:showSkins',
                'host:showMass',
                'host:showFood',
                'setting:settings.playTimer',
                'setting:settings.mouseTracker',
                'host:autoRespawn',
                'host:showLeaderboard',
                'host:autoClaimCoins',
            ],
            [
                'host:showNames',
                'host:showSkins',
                'host:showPosition',
                'host:autoRespawn',
                'host:autoClaimCoins',
                'setting:game.shortenNames',
                'setting:settings.playTimer',
                'setting:settings.mouseTracker',
            ],
        ];
        if (previousDefaults.some((defaults) => JSON.stringify(value.settings.quickAccess) === JSON.stringify(defaults))) {
            value.settings.quickAccess = clone(this.defaults.settings.quickAccess);
        } else
            value.settings.quickAccess = [
                ...new Set(
                    value.settings.quickAccess
                        .filter((item) => item !== 'host:darkTheme')
                        .map((item) => (item === 'host:showChat' ? 'setting:chat.enabled' : item))
                ),
            ];
        for (const key of ['showFood', 'showLeaderboard', 'hideOwnName', 'botSkinsOnly', 'showOwnSkinWithBots']) {
            value.game[key] = normalizeBoolean(value.game[key], this.defaults.game[key]);
        }
        for (const key of ['autoRespawn', 'playTimer', 'mouseTracker', 'autoClaimCoins', 'showChallenges', 'removeShopPopup']) {
            value.settings[key] = normalizeBoolean(value.settings[key], this.defaults.settings[key]);
        }
        value.chat.enabled = normalizeBoolean(value.chat.enabled, this.defaults.chat.enabled);
        return value;
    }
    get(path) {
        if (path.startsWith('macros.keys.')) return getPath(this.savedKeys, path.slice('macros.keys.'.length));
        return getPath(this.value, path);
    }
    onChange(listener) {
        if (typeof listener !== 'function') return () => {};
        this.changeListeners.add(listener);
        return () => this.changeListeners.delete(listener);
    }
    notifyChange(path) {
        for (const listener of this.changeListeners) {
            try {
                listener(path);
            } catch (error) {
                this.logger.warn('Settings change listener failed', error);
            }
        }
    }
    set(path, value, immediate = false) {
        if (path.startsWith('macros.keys.')) setPath(this.savedKeys, path.slice('macros.keys.'.length), value);
        setPath(this.value, path, value);
        const next = mergeKnown(this.defaults, this.value);
        next.macros.keys = clone(this.savedKeys);
        this.normalize(next);
        this.savedKeys = clone(next.macros.keys);
        replaceInPlace(this.value, next);
        if (immediate) this.flush();
        else this.flushLater();
        this.notifyChange(path);
    }
    update(mutator, immediate = false) {
        mutator(this.value);
        const next = mergeKnown(this.defaults, this.value);
        next.macros.keys = clone(this.savedKeys);
        replaceInPlace(this.value, this.normalize(next));
        if (immediate) this.flush();
        else this.flushLater();
        this.notifyChange(null);
    }
    reset(path = null) {
        if (!path) replaceInPlace(this.value, this.defaults);
        else setPath(this.value, path, clone(getPath(this.defaults, path)));
        if (!path) this.savedKeys = clone(this.defaults.macros.keys);
        else if (path === 'macros' || path === 'macros.keys') this.savedKeys = clone(this.defaults.macros.keys);
        else if (path.startsWith('macros.keys.'))
            setPath(this.savedKeys, path.slice('macros.keys.'.length), clone(getPath(this.defaults, path)));
        this.flush();
        this.notifyChange(path);
    }
    replace(input) {
        if (!isObject(input)) throw new TypeError('Settings must be an object');
        const sourceVersion = Number(input.storageVersion) || 1;
        if (sourceVersion > BUILD.settingsVersion) {
            throw new Error(`Settings version ${sourceVersion} is newer than this client`);
        }
        const previous = this.storage.getItem(this.key);
        if (previous) this.backup(previous, 'before-import');
        const migrated = this.migrate(clone(input), sourceVersion);
        const next = this.normalize(mergeKnown(this.defaults, migrated));
        this.savedKeys = clone(next.macros.keys);
        replaceInPlace(this.value, next);
        this.flush();
        this.notifyChange(null);
        return this.value;
    }
    flush() {
        try {
            // SigFixes replaces some key fields with non-enumerable accessors.
            // Read the known settings schema so those keys remain in the saved JSON.
            const snapshot = mergeKnown(this.defaults, this.value);
            snapshot.macros.keys = clone(this.savedKeys);
            this.storage.setItem(this.key, JSON.stringify(snapshot));
        } catch (error) {
            this.logger.error('Unable to save settings', error);
        }
    }
    backup(source, reason) {
        const key = `${STORAGE.settingsBackupPrefix}-${reason}-${Date.now()}`;
        try {
            this.storage.setItem(key, source);
        } catch (error) {
            this.logger.warn('Unable to back up settings', error);
        }
    }
    destroy() {
        this.changeListeners.clear();
        this.flushLater.flush();
    }
}
class DomReadiness {
    constructor(resources) {
        this.resources = resources;
    }
    waitFor(selector, timeout = TIMING.hostReadyTimeout) {
        const existing = document.querySelector(selector);
        if (existing) return Promise.resolve(existing);
        return new Promise((resolve, reject) => {
            let finished = false;
            const finish = (result, error = null) => {
                if (finished) return;
                finished = true;
                observer.disconnect();
                clearTimeout(timer);
                if (error) reject(error);
                else resolve(result);
            };
            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) finish(element);
            });
            const timer = setTimeout(() => finish(null, new Error(`Timed out waiting for ${selector}`)), timeout);
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
            });
            this.resources.add(() => finish(null, new Error('SigMod stopped')));
        });
    }
    async pageShell() {
        const page = await this.waitFor(SELECTORS.page);
        return {
            page,
            canvas: document.querySelector(SELECTORS.canvas),
            nickname: document.querySelector(SELECTORS.nickname),
            gameMode: document.querySelector(SELECTORS.gameMode),
        };
    }
}
class RuntimeState {
    constructor(settings) {
        this.settings = settings;
        this.user = null;
        this.nickname = 'Guest';
        this.player = { position: null, score: 0, alive: false };
        this.border = null;
        this.backend = { connected: false, sid: null, latency: null };
        this.friends = { settings: {}, names: new Set() };
    }
}
class FeatureController {
    constructor(app, name) {
        this.app = app;
        this.name = name;
        this.resources = app.resources.child(name);
        this.mounted = false;
    }
    async mount() {}
    destroy() {
        this.resources.dispose();
        this.mounted = false;
    }
}
class InputOwnership extends Emitter {
    constructor(app) {
        super();
        this.app = app;
        this.claims = new Set();
        this.supportedKeys = new Set([
            'rapidFeed',
            'respawn',
            'line.horizontal',
            'line.vertical',
            'line.fixed',
            'splits.double',
            'splits.triple',
            'splits.quad',
            'splits.doubleTrick',
            'splits.selfTrick',
        ]);
        app.resources.add(() => {
            this.claims.clear();
            this.clear();
        });
    }
    /** Suppress only the inputs explicitly handled by this SigFixes instance. */
    claim({ keys = [], mouseButtons = [] } = {}) {
        if (
            !Array.isArray(keys) ||
            keys.some((key) => !this.supportedKeys.has(key)) ||
            !Array.isArray(mouseButtons) ||
            mouseButtons.some((button) => !Number.isSafeInteger(button) || button < 0 || button > 32_767)
        ) {
            throw new TypeError('Unsupported SigMod input claim');
        }
        const api = window.sigfix;
        if (this.app.resources.disposed || !HostResolver.isSigFixApi(api)) throw new Error('SigFixes is not available');
        const claim = {
            api,
            keys: new Set(keys),
            mouseButtons: new Set(mouseButtons),
        };
        this.claims.add(claim);
        this.emit('change');
        return () => {
            if (this.claims.delete(claim)) this.emit('change');
        };
    }
    owns(type, value) {
        const adapter = this.app.host.adapter;
        if (adapter?.kind !== 'sigfix') return false;
        for (const claim of this.claims) {
            if (claim.api === adapter.api && claim[type].has(value)) return true;
        }
        return false;
    }
    ownsKeyEvent(event) {
        if (!this.claims.size || this.app.host.adapter?.kind !== 'sigfix') return false;
        for (const path of this.supportedKeys) {
            if (this.owns('keys', path) && keybindMatchesEvent(event, this.app.settingsStore.get(`macros.keys.${path}`))) return true;
        }
        return false;
    }
}

class AdTrackerProtector {
    constructor(logger = null) {
        this.logger = logger;
        this.resources = new Disposables('ad-tracker-protector', logger);
        this.enabled = this.resolveInitialSetting();
        this.stats = {
            scripts: 0,
            iframes: 0,
            networkRequests: 0,
            totalBlocked: 0,
        };
        this.app = null;
        this.initialized = false;
    }

    resolveInitialSetting() {
        try {
            const raw = localStorage.getItem(STORAGE.settings);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.themes?.hideAds === false) return false;
            }
        } catch {}
        return true;
    }

    initializeEarly() {
        if (this.initialized) return;
        this.initialized = true;

        this.installGlobalFlags();
        this.installApiStubs();
        this.installDomGuard();
        this.installNetworkGuard();
        this.installAntiAdblockShield();
        this.installDomSanitizer();
    }

    installGlobalFlags() {
        const defineFlag = (name) => {
            try {
                Object.defineProperty(window, name, {
                    value: true,
                    writable: false,
                    configurable: true,
                    enumerable: true,
                });
            } catch {
                window[name] = true;
            }
        };

        defineFlag('gtmDidInit');
        defineFlag('anlDidInit');
        defineFlag('adsDidInit');
    }

    installApiStubs() {
        const noop = () => {};
        const createDummySlot = () => {
            const slot = {
                addService: () => slot,
                clearCategoryExclusions: () => slot,
                clearTargeting: () => slot,
                defineSizeMapping: () => slot,
                get: () => null,
                getAttributeKeys: () => [],
                getCategoryExclusions: () => [],
                getResponseInformation: () => null,
                getSlotElementId: () => '',
                getTargeting: () => [],
                getTargetingKeys: () => [],
                set: () => slot,
                setCategoryExclusion: () => slot,
                setClickUrl: () => slot,
                setCollapseEmptyDiv: () => slot,
                setForceSafeFrame: () => slot,
                setSafeFrameConfig: () => slot,
                setTargeting: () => slot,
            };
            return slot;
        };

        const dummyPubAds = {
            addEventListener: noop,
            clear: noop,
            clearCategoryExclusions: noop,
            clearTagging: noop,
            clearTargeting: noop,
            collapseEmptyDivs: noop,
            disableInitialLoad: noop,
            display: noop,
            enableAsyncRendering: noop,
            enableLazyLoad: noop,
            enableSingleRequest: noop,
            enableSyncRendering: noop,
            enableVideoAds: noop,
            get: () => null,
            getAttributeKeys: () => [],
            getTargeting: () => [],
            getTargetingKeys: () => [],
            refresh: noop,
            set: noop,
            setCategoryExclusion: noop,
            setCentering: noop,
            setCookieOptions: noop,
            setForceSafeFrame: noop,
            setLocation: noop,
            setPrivacySettings: noop,
            setPublisherProvidedId: noop,
            setRequestNonPersonalizedAds: noop,
            setSafeFrameConfig: noop,
            setTagForChildDirectedTreatment: noop,
            setTagForUnderAgeOfConsent: noop,
            setTargeting: noop,
            setVideoContent: noop,
            updateCorrelator: noop,
        };

        const dummyGoogletag = {
            apiReady: true,
            cmd: {
                push: (fn) => {
                    if (typeof fn === 'function') {
                        try {
                            fn();
                        } catch {}
                    }
                    return 1;
                },
            },
            defineSlot: () => createDummySlot(),
            defineOutOfPageSlot: () => createDummySlot(),
            destroySlots: noop,
            disablePublisherConsole: noop,
            display: noop,
            enableServices: noop,
            getVersion: () => '1.0.0-sigmod-stub',
            openConsole: noop,
            pubads: () => dummyPubAds,
            pubadsReady: true,
            setAdIframeTitle: noop,
            sizeMapping: () => ({ addSize: () => createDummySlot(), build: () => [] }),
        };

        if (!window.googletag || !window.googletag.apiReady) {
            window.googletag = dummyGoogletag;
        }

        for (let i = 1; i <= 6; i += 1) {
            const slotName = `adSlot${i}`;
            if (!window[slotName]) {
                window[slotName] = createDummySlot();
            }
        }

        if (typeof window.gtag !== 'function') {
            window.gtag = noop;
        }

        if (!Array.isArray(window.dataLayer)) {
            window.dataLayer = [];
        }
    }

    installDomGuard() {
        const protector = this;

        const isBlockedNode = (node) => {
            if (!protector.enabled || !(node instanceof Element)) return false;
            const tag = node.tagName?.toLowerCase();
            if (tag === 'script') {
                const src = node.getAttribute('src') || node.src || '';
                return isBlockedAdOrTrackerUrl(src);
            }
            if (tag === 'iframe' || tag === 'embed' || tag === 'object') {
                const src = node.getAttribute('src') || node.src || node.getAttribute('data') || '';
                return isBlockedAdOrTrackerUrl(src);
            }
            if (tag === 'link') {
                const href = node.getAttribute('href') || node.href || '';
                return isBlockedAdOrTrackerUrl(href);
            }
            return false;
        };

        const disarmNode = (node) => {
            if (!(node instanceof Element)) return;
            const tag = node.tagName?.toLowerCase();
            try {
                if (tag === 'script') {
                    protector.stats.scripts += 1;
                    protector.stats.totalBlocked += 1;
                    node.type = 'text/plain';
                    node.src = '';
                    node.removeAttribute('src');
                    if (typeof node.onload === 'function') {
                        const handler = node.onload;
                        queueMicrotask(() => {
                            try {
                                handler.call(node, new Event('load'));
                            } catch {}
                        });
                    }
                } else if (tag === 'iframe' || tag === 'embed' || tag === 'object') {
                    protector.stats.iframes += 1;
                    protector.stats.totalBlocked += 1;
                    node.src = 'about:blank';
                    node.removeAttribute('src');
                }
            } catch {}
        };

        const sanitizeTree = (node) => {
            if (!protector.enabled || !(node instanceof Element)) return;
            if (isBlockedNode(node)) {
                disarmNode(node);
                return true;
            }
            const children = node.querySelectorAll ? node.querySelectorAll('script, iframe, embed, object') : [];
            for (let i = 0; i < children.length; i += 1) {
                const child = children[i];
                if (isBlockedNode(child)) {
                    disarmNode(child);
                    child.remove();
                }
            }
            return false;
        };

        const originalAppendChild = Node.prototype.appendChild;
        Node.prototype.appendChild = function (child) {
            if (child instanceof Node) {
                if (isBlockedNode(child)) {
                    disarmNode(child);
                    return child;
                }
                sanitizeTree(child);
            }
            return originalAppendChild.call(this, child);
        };
        this.resources.add(() => {
            Node.prototype.appendChild = originalAppendChild;
        });

        const originalInsertBefore = Node.prototype.insertBefore;
        Node.prototype.insertBefore = function (newNode, referenceNode) {
            if (newNode instanceof Node) {
                if (isBlockedNode(newNode)) {
                    disarmNode(newNode);
                    return newNode;
                }
                sanitizeTree(newNode);
            }
            return originalInsertBefore.call(this, newNode, referenceNode);
        };
        this.resources.add(() => {
            Node.prototype.insertBefore = originalInsertBefore;
        });

        const originalReplaceChild = Node.prototype.replaceChild;
        Node.prototype.replaceChild = function (newChild, oldChild) {
            if (newChild instanceof Node) {
                if (isBlockedNode(newChild)) {
                    disarmNode(newChild);
                    return newChild;
                }
                sanitizeTree(newChild);
            }
            return originalReplaceChild.call(this, newChild, oldChild);
        };
        this.resources.add(() => {
            Node.prototype.replaceChild = originalReplaceChild;
        });

        const originalAppend = Element.prototype.append;
        Element.prototype.append = function (...nodes) {
            const filtered = nodes.filter((node) => {
                if (node instanceof Node) {
                    if (isBlockedNode(node)) {
                        disarmNode(node);
                        return false;
                    }
                    sanitizeTree(node);
                }
                return true;
            });
            return originalAppend.apply(this, filtered);
        };
        this.resources.add(() => {
            Element.prototype.append = originalAppend;
        });

        const originalPrepend = Element.prototype.prepend;
        Element.prototype.prepend = function (...nodes) {
            const filtered = nodes.filter((node) => {
                if (node instanceof Node) {
                    if (isBlockedNode(node)) {
                        disarmNode(node);
                        return false;
                    }
                    sanitizeTree(node);
                }
                return true;
            });
            return originalPrepend.apply(this, filtered);
        };
        this.resources.add(() => {
            Element.prototype.prepend = originalPrepend;
        });

        const scriptDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
        if (scriptDescriptor && scriptDescriptor.set) {
            const originalSet = scriptDescriptor.set;
            Object.defineProperty(HTMLScriptElement.prototype, 'src', {
                set(value) {
                    if (protector.enabled && isBlockedAdOrTrackerUrl(String(value))) {
                        disarmNode(this);
                        return;
                    }
                    return originalSet.call(this, value);
                },
                get: scriptDescriptor.get,
                configurable: true,
                enumerable: true,
            });
            this.resources.add(() => {
                Object.defineProperty(HTMLScriptElement.prototype, 'src', scriptDescriptor);
            });
        }
    }

    installNetworkGuard() {
        const protector = this;

        if (typeof navigator.sendBeacon === 'function') {
            const originalSendBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = function (url, data) {
                const targetUrl = typeof url === 'string' ? url : url?.href || '';
                if (protector.enabled && isBlockedAdOrTrackerUrl(targetUrl)) {
                    protector.stats.networkRequests += 1;
                    protector.stats.totalBlocked += 1;
                    return true;
                }
                return originalSendBeacon(url, data);
            };
            this.resources.add(() => {
                navigator.sendBeacon = originalSendBeacon;
            });
        }

        if (typeof XMLHttpRequest !== 'undefined') {
            const originalOpen = XMLHttpRequest.prototype.open;
            const originalSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                const targetUrl = typeof url === 'string' ? url : String(url || '');
                this.__sigmod_blocked = protector.enabled && isBlockedAdOrTrackerUrl(targetUrl);
                if (this.__sigmod_blocked) {
                    this.__sigmod_url = targetUrl;
                    protector.stats.networkRequests += 1;
                    protector.stats.totalBlocked += 1;
                    return;
                }
                return originalOpen.call(this, method, url, ...rest);
            };

            XMLHttpRequest.prototype.send = function (body) {
                if (this.__sigmod_blocked) {
                    Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
                    Object.defineProperty(this, 'status', { value: 204, configurable: true });
                    Object.defineProperty(this, 'statusText', { value: 'No Content', configurable: true });
                    Object.defineProperty(this, 'responseText', { value: '', configurable: true });
                    queueMicrotask(() => {
                        this.dispatchEvent(new Event('readystatechange'));
                        this.dispatchEvent(new Event('load'));
                        this.dispatchEvent(new Event('loadend'));
                    });
                    return;
                }
                return originalSend.call(this, body);
            };

            this.resources.add(() => {
                XMLHttpRequest.prototype.open = originalOpen;
                XMLHttpRequest.prototype.send = originalSend;
            });
        }

        if (typeof window.fetch === 'function') {
            const originalFetch = window.fetch;
            const fetchWrapper = function (input, init) {
                const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
                if (protector.enabled && isBlockedAdOrTrackerUrl(url)) {
                    protector.stats.networkRequests += 1;
                    protector.stats.totalBlocked += 1;
                    return Promise.resolve(
                        new Response('{}', {
                            status: 200,
                            statusText: 'OK',
                            headers: { 'Content-Type': 'application/json' },
                        })
                    );
                }
                return originalFetch.call(this, input, init);
            };
            window.fetch = fetchWrapper;
            this.resources.add(() => {
                if (window.fetch === fetchWrapper) window.fetch = originalFetch;
            });
        }
    }

    installAntiAdblockShield() {
        const protector = this;

        const neutralizeModalfolks = (element) => {
            if (!(element instanceof HTMLElement) || element.id !== 'modalfolks') return;
            element.style.display = 'none';
            element.classList.add('hide');
            element.show = () => {
                element.style.display = 'none';
                element.classList.add('hide');
            };
        };

        const existingModal = document.querySelector('#modalfolks');
        if (existingModal) neutralizeModalfolks(existingModal);

        let rawHourly = Element.prototype.hourly;
        Object.defineProperty(Element.prototype, 'hourly', {
            configurable: true,
            enumerable: true,
            get() {
                return rawHourly;
            },
            set(fn) {
                if (typeof fn === 'function') {
                    rawHourly = function (...args) {
                        if (!protector.enabled) return fn.apply(this, args);
                        const adSelectors = [
                            '#ad_bottom',
                            '#div-gpt-ad-1622841396282-0',
                            '#div-gpt-ad-1622632389350-0',
                            '#div-gpt-ad-1622841482467-0',
                        ];
                        const adElements = adSelectors.map((s) => document.querySelector(s)).filter((el) => el instanceof HTMLElement);
                        const prevStyles = adElements.map((el) => ({
                            element: el,
                            value: el.style.getPropertyValue('display'),
                            priority: el.style.getPropertyPriority('display'),
                        }));
                        const markers = [...document.querySelectorAll('.settings-menu-holder')];
                        for (let i = 0; i < markers.length; i += 1) markers[i].classList.remove('settings-menu-holder');
                        for (let i = 0; i < adElements.length; i += 1) adElements[i].style.setProperty('display', 'block', 'important');
                        try {
                            return fn.apply(this, args);
                        } finally {
                            for (let i = 0; i < prevStyles.length; i += 1) {
                                const { element, value, priority } = prevStyles[i];
                                if (value) element.style.setProperty('display', value, priority);
                                else element.style.removeProperty('display');
                            }
                            for (let i = 0; i < markers.length; i += 1) markers[i].classList.add('settings-menu-holder');
                        }
                    };
                } else {
                    rawHourly = fn;
                }
            },
        });
    }

    installDomSanitizer() {
        const protector = this;

        this.cleanupAdDom();

        const observer = new MutationObserver((mutations) => {
            if (!protector.enabled) return;
            for (let m = 0; m < mutations.length; m += 1) {
                const added = mutations[m].addedNodes;
                for (let i = 0; i < added.length; i += 1) {
                    const node = added[i];
                    if (node instanceof Element) {
                        if (node.id === 'modalfolks') {
                            node.style.display = 'none';
                            node.classList.add('hide');
                            node.show = () => {
                                node.style.display = 'none';
                                node.classList.add('hide');
                            };
                        }
                        if (
                            node.matches?.(
                                'script[src*="googletagmanager"], script[src*="doubleclick"], script[src*="google-analytics"], iframe[src*="googletagmanager"], iframe[src*="doubleclick"], iframe[id^="google_ads"], ins.adsbygoogle'
                            )
                        ) {
                            node.remove();
                        }
                    }
                }
            }
        });

        if (document.documentElement) {
            observer.observe(document.documentElement, { childList: true, subtree: true });
            this.resources.add(() => observer.disconnect());
        }
    }

    cleanupAdDom() {
        if (!this.enabled || typeof document === 'undefined') return;
        const selector =
            '#left_ad_block, #ad_bottom, .ad-block, .ad-block-left, .ad-block-right, [id^="div-gpt-ad"], iframe[id^="google_ads"], iframe[src*="doubleclick.net"], iframe[src*="googletagmanager.com"], ins.adsbygoogle';
        const elements = document.querySelectorAll(selector);
        for (let i = 0; i < elements.length; i += 1) {
            const el = elements[i];
            el.replaceChildren();
            el.style.setProperty('display', 'none', 'important');
        }
        const noscripts = document.querySelectorAll('noscript');
        for (let i = 0; i < noscripts.length; i += 1) {
            if (noscripts[i].innerHTML?.includes('googletagmanager')) {
                noscripts[i].remove();
            }
        }
    }

    bindApp(app) {
        this.app = app;
        const enabled = app.settings?.themes?.hideAds !== false;
        this.setEnabled(enabled);

        app.resources.listen(document, 'sigmod:settingchange', (event) => {
            if (event.detail?.path === 'themes.hideAds') {
                this.setEnabled(Boolean(event.detail.value));
            }
        });

        app.resources.add(() => {
            this.resources.dispose();
        });
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (this.enabled) {
            this.cleanupAdDom();
        }
    }

    getStatus() {
        return {
            enabled: this.enabled,
            stats: { ...this.stats },
        };
    }
}

const adTrackerProtector = new AdTrackerProtector();
adTrackerProtector.initializeEarly();
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Host integration: packet protocol, native capture and SigFix adapter              ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
