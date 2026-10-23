// SETTINGS_USAGE_SCHEMA is embedded by build.js from the server's shared allowlist.
class SettingsUsageSync {
    constructor(app) {
        this.app = app;
        this.storage = app.settingsStore.storage;
        this.key = 'SigModClient-settings-usage-v1';
        this.lockName = 'SigModClient-settings-usage-v1';
        this.resources = app.resources.child('settings-usage');
        this.started = false;
        this.enabled = false;
        this.destroyed = false;
        this.running = false;
        this.again = false;
        this.needsCheck = true;
        this.retryDelay = 2000;
        this.timer = null;
        this.controller = null;
    }
    start() {
        if (this.destroyed) return;
        // Web Locks serialize the shared installation/outbox across tabs on this origin.
        // Do not fall back to an unsafe localStorage read/modify/write lock.
        if (!navigator.locks?.request || !crypto.subtle) {
            this.app.logger.warnOnce('settings-usage-unavailable', 'Settings usage sync requires Web Locks and Web Crypto.');
            return;
        }
        if (!this.started) {
            this.started = true;
            this.resources.add(
                this.app.settingsStore.onChange((path) => {
                    if (path === 'analytics') {
                        this.setEnabled(this.app.settings.analytics !== 'off');
                        return;
                    }
                    if (!this.enabled) return;
                    this.app.settingsStore.flush();
                    this.schedule();
                })
            );
            this.resources.listen(window, 'storage', (event) => {
                if (event.key === STORAGE.settings) {
                    let allowed = true;
                    try { allowed = JSON.parse(event.newValue || 'null')?.analytics !== 'off'; } catch { /* Keep the last known consent. */ }
                    this.setEnabled(allowed);
                }
                if (this.enabled && (event.key === STORAGE.settings || event.key === STORAGE.localization || event.key === null)) this.schedule();
            });
            this.resources.listen(document, 'sigmod:languagechange', () => { if (this.enabled) this.schedule(); });
            const reconcile = () => {
                if (!this.enabled) return;
                this.needsCheck = true;
                this.schedule();
            };
            this.resources.listen(window, 'online', reconcile);
            this.resources.add(this.app.backend.on('open', reconcile));
            this.resources.interval(reconcile, 5 * 60 * 1000);
            this.resources.listen(window, 'pagehide', () => { if (this.enabled) this.app.settingsStore.flush(); });
        }
        this.setEnabled(this.app.settings.analytics !== 'off');
    }
    setEnabled(enabled) {
        if (this.destroyed || this.enabled === enabled) return;
        this.enabled = enabled;
        clearTimeout(this.timer);
        this.timer = null;
        if (!enabled) {
            this.controller?.abort();
            this.storage.removeItem(this.key);
            this.again = false;
            return;
        }
        this.needsCheck = true;
        this.schedule();
    }
    schedule(delay = 2000) {
        if (!this.started || !this.enabled || this.destroyed) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.run();
        }, delay);
    }
    project() {
        // Read persisted settings inside the cross-tab lock, not another tab's stale runtime state.
        const raw = this.storage.getItem(STORAGE.settings);
        const source = raw ? JSON.parse(raw) : this.app.settingsStore.value;
        const result = {};
        for (const path of Object.keys(SETTINGS_USAGE_SCHEMA.fields).sort()) {
            const rule = SETTINGS_USAGE_SCHEMA.fields[path];
            let value = getPath(source, path);
            if (path === 'localization.language') {
                let preference;
                try {
                    preference = JSON.parse(this.storage.getItem(STORAGE.localization) || 'null');
                } catch {
                }
                const locale = preference?.language ?? preference;
                value = ['en', 'es', 'tr', 'fr', 'pt', 'ru', 'de'].includes(locale) ? locale : 'en';
            }
            if (value === undefined) value = getPath(DEFAULT_SETTINGS, path);
            if (path === 'themes.current' && source.themes?.custom?.some((theme) => theme?.name === value)) {
                value = '__custom__';
            }
            if (rule.type === 'bindings') {
                value = value.slice(0, 64).map(({ button, action }) => ({ button, action }));
            } else if (rule.type === 'strings') {
                value = value.slice(0, 128).map((item) => item.slice(0, 8192));
            } else if (typeof value === 'string') {
                value = value.slice(0, 8192);
            }
            result[path] = value;
        }
        return this.canonical(result);
    }
    canonical(values) {
        return Object.fromEntries(
            Object.keys(values)
                .sort()
                .map((key) => [key, values[key]])
        );
    }
    async checksum(values) {
        const bytes = new TextEncoder().encode(JSON.stringify(this.canonical(values)));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    readState() {
        const raw = this.storage.getItem(this.key);
        if (raw) {
            let state;
            try {
                state = JSON.parse(raw);
            } catch {
            }
            if (
                state?.contractVersion === SETTINGS_USAGE_SCHEMA.version &&
                typeof state.installationId === 'string' &&
                /^[0-9a-f-]{36}$/i.test(state.installationId) &&
                typeof state.writeKey === 'string' &&
                /^[0-9a-f]{64}$/.test(state.writeKey) &&
                Number.isSafeInteger(state.revision) &&
                state.revision >= 0
            ) {
                // Never replay an outbox from an unknown contract or containing excluded paths.
                const allowed = (values, full = false) =>
                    values &&
                    !Array.isArray(values) &&
                    typeof values === 'object' &&
                    (!full || Object.keys(values).length === Object.keys(SETTINGS_USAGE_SCHEMA.fields).length) &&
                    Object.keys(values).every((path) => own(SETTINGS_USAGE_SCHEMA.fields, path));
                if (state.acknowledged && !allowed(state.acknowledged, true)) state.acknowledged = null;
                if (
                    state.pending &&
                    (!allowed(state.pending.values) ||
                        !allowed(state.pending.target, true) ||
                        state.pending.contractVersion !== SETTINGS_USAGE_SCHEMA.version ||
                        state.pending.settingsSchemaVersion !== BUILD.settingsVersion)
                ) {
                    state.pending = null;
                    state.acknowledged = null;
                    this.needsCheck = true;
                }
                return state;
            }
        }
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const state = {
            contractVersion: SETTINGS_USAGE_SCHEMA.version,
            installationId: crypto.randomUUID(),
            writeKey: [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
            revision: 0,
            acknowledged: null,
            clientVersion: null,
            pending: null,
        };
        this.saveState(state);
        return state;
    }
    saveState(state) {
        this.storage.setItem(this.key, JSON.stringify(state));
    }
    async request(state, operation) {
        this.controller = new AbortController();
        const timeout = setTimeout(() => this.controller?.abort(), 15_000);
        try {
            const body = { installationId: state.installationId, kind: operation.kind };
            if (operation.kind !== 'check') {
                for (const key of [
                    'baseRevision',
                    'operationId',
                    'clientVersion',
                    'settingsSchemaVersion',
                    'contractVersion',
                    'checksum',
                    'values',
                ]) {
                    body[key] = operation[key];
                }
            }
            const response = await fetch(`${ENDPOINTS.app}/settings-usage/sync`, {
                method: 'POST',
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                headers: { 'Content-Type': 'application/json', 'X-Settings-Write-Key': state.writeKey },
                body: JSON.stringify(body),
                signal: this.controller.signal,
            });
            const payload = await response.json();
            if (response.status === 409) {
                state.pending = null;
                state.acknowledged = null;
                this.needsCheck = true;
                this.saveState(state);
                throw new Error('Settings revision conflict');
            }
            if (!response.ok || payload.success !== true || !Number.isSafeInteger(payload.revision) || payload.revision < 0) {
                throw new Error('Settings sync unavailable');
            }
            return payload;
        } finally {
            clearTimeout(timeout);
            this.controller = null;
        }
    }
    async acknowledge(state) {
        const pending = state.pending;
        const response = await this.request(state, pending);
        if (response.revision !== pending.baseRevision + 1 || response.checksum !== pending.checksum) {
            throw new Error('Settings acknowledgement mismatch');
        }
        state.revision = response.revision;
        state.acknowledged = pending.target;
        state.clientVersion = pending.clientVersion;
        state.pending = null;
        this.saveState(state);
    }
    async synchronize() {
        if (this.destroyed || !this.enabled) return;
        let storedSettings;
        try { storedSettings = JSON.parse(this.storage.getItem(STORAGE.settings) || 'null'); } catch { storedSettings = null; }
        if (storedSettings?.analytics === 'off') {
            this.setEnabled(false);
            return;
        }
        const state = this.readState();
        // Retry the identical persisted operation first if its previous response was lost.
        if (state.pending) await this.acknowledge(state);
        if (this.needsCheck) {
            const response = await this.request(state, { kind: 'check' });
            const knownChecksum = state.acknowledged ? await this.checksum(state.acknowledged) : null;
            if (response.checksum !== knownChecksum || response.revision !== state.revision) state.acknowledged = null;
            state.revision = response.revision;
            this.needsCheck = false;
            this.saveState(state);
        }
        const target = this.project();
        const snapshot = !state.acknowledged || state.clientVersion !== BUILD.release;
        const values = snapshot
            ? target
            : Object.fromEntries(
                  Object.entries(target).filter(([path, value]) => JSON.stringify(value) !== JSON.stringify(state.acknowledged[path]))
              );
        if (!snapshot && Object.keys(values).length === 0) return;
        state.pending = {
            kind: snapshot ? 'snapshot' : 'patch',
            baseRevision: state.revision,
            operationId: crypto.randomUUID(),
            clientVersion: BUILD.release,
            settingsSchemaVersion: BUILD.settingsVersion,
            contractVersion: SETTINGS_USAGE_SCHEMA.version,
            checksum: await this.checksum(target),
            values,
            target,
        };
        this.saveState(state);
        await this.acknowledge(state);
        // An edit may have happened in this or another tab while the request was in flight.
        if (JSON.stringify(this.project()) !== JSON.stringify(target)) this.again = true;
    }
    async run() {
        if (this.destroyed || !this.enabled || navigator.onLine === false) return;
        if (this.running) {
            this.again = true;
            return;
        }
        this.running = true;
        try {
            await navigator.locks.request(this.lockName, () => this.synchronize());
            this.retryDelay = 2000;
        } catch {
            if (!this.destroyed && this.enabled) {
                this.app.logger.warnOnce('settings-usage-retry', 'Settings usage sync is pending; it will retry automatically.');
                this.schedule(this.retryDelay);
                this.retryDelay = Math.min(this.retryDelay * 2, 5 * 60 * 1000);
            }
        } finally {
            this.running = false;
            if (this.again) {
                this.again = false;
                this.schedule();
            }
        }
    }
    destroy() {
        this.destroyed = true;
        clearTimeout(this.timer);
        this.controller?.abort();
        this.resources.dispose();
    }
}
