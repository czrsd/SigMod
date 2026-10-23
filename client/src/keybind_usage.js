class KeybindUsage {
    constructor(app) {
        this.app = app;
        this.storage = app.settingsStore.storage;
        this.key = 'SigModClient-keybind-usage-v1';
        this.pending = { uses: [], changes: [] };
        this.lastBindings = this.bindings();
        this.supported = false;
        this.destroyed = false;
        this.resources = app.resources.child('keybind-usage');
        this.saveTimer = null;
        this.enabled = () => this.app.settings.analytics !== 'off';
        this.resources.add(() => clearTimeout(this.saveTimer));
        this.resources.add(app.settingsStore.onChange((path) => this.settingsChanged(path)));
        this.resources.add(app.backend.on('open', () => { this.supported = false; }));
        this.resources.add(app.backend.on('close', () => { this.supported = false; }));
        this.resources.add(app.backend.on('usage-capabilities', (value) => {
            this.supported = value?.keybindUsage === 1;
            if (this.supported) void this.flush();
        }));
        this.resources.add(app.backend.on('keybind-usage-ack', (batchId) => void this.acknowledge(batchId)));
        this.resources.add(app.backend.on('keybind-usage-status', (value) => {
            this.app.logger.warnOnce('keybind-usage-' + value?.status, 'Keybind analytics report is pending: ' + (value?.status || 'unavailable'));
        }));
        this.resources.interval(() => void this.flush(), 60_000);
        this.resources.listen(window, 'pagehide', () => void this.persist());
        this.resources.listen(document, 'visibilitychange', () => {
            if (document.hidden) void this.persist();
        });
    }
    read() {
        const raw = this.storage.getItem(this.key);
        if (!raw) return { version: 1, uses: [], changes: [] };
        const value = JSON.parse(raw);
        if (value?.version !== 1 || !Array.isArray(value.uses) || !Array.isArray(value.changes)) throw new Error('Invalid analytics outbox');
        return value;
    }
    async locked(callback) {
        try {
            if (!navigator.locks?.request) return;
            await navigator.locks.request(this.key, callback);
        } catch {
            this.app.logger.warnOnce('keybind-usage-storage', 'Keybind analytics could not be persisted; pending reports will retry.');
        }
    }
    save() {
        if (this.saveTimer) return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            void this.persist();
        }, 2000);
    }
    merge(outbox) {
        for (const item of this.pending.uses) {
            const previous = outbox.uses.find((entry) => entry.action === item.action && entry.input === item.input && entry.binding === item.binding);
            if (previous) previous.count += item.count;
            else outbox.uses.push({ ...item });
        }
        for (const item of this.pending.changes) {
            const previous = outbox.changes.find((entry) => entry.action === item.action && JSON.stringify(entry.from) === JSON.stringify(item.from) && JSON.stringify(entry.to) === JSON.stringify(item.to));
            if (previous) previous.count += item.count;
            else outbox.changes.push({ ...item });
        }
    }
    write(outbox) {
        this.storage.setItem(this.key, JSON.stringify(outbox));
        this.pending.uses = [];
        this.pending.changes = [];
    }
    persist() {
        return this.locked(() => {
            if (!this.enabled()) {
                this.pending = { uses: [], changes: [] };
                this.storage.removeItem(this.key);
                return;
            }
            const outbox = this.read();
            this.merge(outbox);
            this.write(outbox);
        });
    }
    bindings() {
        const values = {};
        for (const path of Object.keys(SETTINGS_USAGE_SCHEMA.fields)) {
            if (path.startsWith('macros.keys.')) values[path] = unwrapSettingScalar(this.app.settingsStore.get(path)) ?? null;
        }
        values['macros.mouse.bindings'] = (this.app.settingsStore.get('macros.mouse.bindings') || []).map(({ button, action }) => ({ button, action: unwrapSettingScalar(action) }));
        return JSON.parse(JSON.stringify(values));
    }
    settingsChanged(path) {
        if (path === 'analytics') {
            if (!this.enabled()) {
                clearTimeout(this.saveTimer);
                this.saveTimer = null;
                this.pending = { uses: [], changes: [] };
                this.storage.removeItem(this.key);
                void this.locked(() => this.storage.removeItem(this.key));
            } else this.lastBindings = this.bindings();
            return;
        }
        if (!this.enabled()) return;
        if (path !== null && path !== 'macros' && !path?.startsWith('macros.keys') && !path?.startsWith('macros.mouse')) return;
        const next = this.bindings();
        for (const [action, to] of Object.entries(next)) {
            const from = this.lastBindings[action] ?? null;
            if (JSON.stringify(from) !== JSON.stringify(to)) this.pending.changes.push({ action, from, to, count: 1 });
        }
        this.lastBindings = next;
        this.save();
    }
    record(action, binding, input = 'keyboard') {
        if (this.destroyed || !this.enabled()) return;
        const value = String(binding ?? '');
        const entry = this.pending.uses.find((item) => item.action === action && item.input === input && item.binding === value);
        if (entry) entry.count += 1;
        else this.pending.uses.push({ action, input, binding: value, count: 1 });
        this.save();
    }
    flush() {
        return this.locked(() => {
            if (!this.enabled()) {
                this.pending = { uses: [], changes: [] };
                this.storage.removeItem(this.key);
                return;
            }
            const outbox = this.read();
            this.merge(outbox);
            if (this.supported && !this.destroyed && !outbox.inFlight && (outbox.uses.length || outbox.changes.length)) {
                const identity = JSON.parse(this.storage.getItem('SigModClient-settings-usage-v1') || 'null');
                if (typeof identity?.installationId === 'string') {
                    const batch = { batchId: crypto.randomUUID(), installationId: identity.installationId, day: new Date().toISOString().slice(0, 10), uses: [], changes: [] };
                    for (const type of ['uses', 'changes']) {
                        while (outbox[type].length && batch[type].length < 100) {
                            const item = outbox[type][0];
                            batch[type].push(item);
                            if (new TextEncoder().encode(JSON.stringify(batch)).length > 90 * 1024) {
                                batch[type].pop();
                                break;
                            }
                            outbox[type].shift();
                        }
                    }
                    if (batch.uses.length || batch.changes.length) outbox.inFlight = batch;
                }
            }
            if (outbox.inFlight && !outbox.inFlight.day) outbox.inFlight.day = new Date().toISOString().slice(0, 10);
            this.write(outbox);
            if (this.supported && !this.destroyed && outbox.inFlight) this.app.backend.send('keybind-usage', outbox.inFlight);
        });
    }
    async acknowledge(batchId) {
        await this.locked(() => {
            const outbox = this.read();
            this.merge(outbox);
            if (outbox.inFlight?.batchId === batchId) outbox.inFlight = null;
            this.write(outbox);
        });
        if (!this.destroyed && this.supported) void this.flush();
    }
    destroy() {
        void this.persist();
        this.destroyed = true;
        this.resources.dispose();
    }
}
