function safePromotionColor(value, fallback) {
    return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

class RemoteContentController {
    constructor(app) {
        this.app = app;
        this.resources = app.resources.child('remote-content');
        this.snapshot = null;
        this.requestController = null;
        this.localeControllers = new Set();
        this.requestGeneration = 0;
        this.snapshotGeneration = 0;
        this.started = false;
        this.destroyed = false;
        this.lastAlertKey = null;
        this.lastNoticeKey = null;
        this.lastAlertState = null;
        this.lastNoticeState = null;
        this.menuWrapper = null;
        this.menuWrapperObserver = null;
        this.bodyObserver = null;
        this.menuVisible = false;
        this.hideForGameplay = false;
        this.dismissedPromotions = new Set();
        this.transitionTimer = 0;
    }

    start() {
        if (this.started || this.destroyed) return;
        this.started = true;
        this.resources.add(this.app.backend.on('client-content', (snapshot) => this.apply(snapshot, 'socket')));
        this.resources.add(this.app.backend.on('chat-filter-updated', (value) => this.applyChatFilter(value)));
        this.resources.add(this.app.backend.on('announcements-updated', () => this.app.features.get('announcements')?.load?.()));
        this.resources.add(this.app.backend.on('locale-updated', (value) => this.applyLocaleUpdate(value)));
        this.resources.listen(document, 'sigmod:settingchange', (event) => {
            if (event.detail?.path === 'themes.showPromotions') this.renderPromotions();
        });
        this.resources.listen(
            document,
            'click',
            (event) => {
                const target = event.target;
                if (target instanceof Element && target.closest(SELECTORS.play)) {
                    this.hideForGameplay = true;
                    this.renderPromotions();
                }
            },
            true
        );
        this.resources.listen(
            document,
            'keydown',
            (event) => {
                if (event.key === 'Escape') {
                    this.hideForGameplay = true;
                    this.renderPromotions();
                }
            },
            true
        );
        this.observeMenu();
        this.resources.interval(() => void this.refresh(), 60_000);
        void this.refresh();
    }

    async refresh() {
        if (this.destroyed) return null;
        const generation = ++this.requestGeneration;
        this.requestController?.abort();
        const controller = new AbortController();
        this.requestController = controller;
        const timeout = window.setTimeout(() => controller.abort(), 5_000);
        const snapshotAtRequest = this.snapshotGeneration;
        try {
            const response = await fetch(`${ENDPOINTS.app}/client-content`, {
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                cache: 'no-store',
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (generation !== this.requestGeneration || snapshotAtRequest !== this.snapshotGeneration || this.destroyed) return null;
            if (!isObject(payload) || payload.success !== true || !isObject(payload.data)) throw new Error('Invalid content response');
            return this.apply(payload.data, 'http');
        } catch (error) {
            if (error?.name !== 'AbortError') this.app.logger.warnOnce('client-content', 'Unable to refresh remote content', error);
            return null;
        } finally {
            window.clearTimeout(timeout);
            if (this.requestController === controller) this.requestController = null;
        }
    }

    apply(snapshot, source = 'socket') {
        if (!isObject(snapshot) || this.destroyed) return false;
        if (source === 'socket') {
            this.snapshotGeneration += 1;
            this.requestController?.abort();
        }
        this.snapshot = {
            alert: isObject(snapshot.alert) ? snapshot.alert : { enabled: false },
            updateNotice: isObject(snapshot.updateNotice) ? snapshot.updateNotice : { enabled: false },
            promotions: Array.isArray(snapshot.promotions) ? snapshot.promotions.filter(isObject) : [],
        };
        this.applyAlert(this.snapshot.alert);
        this.applyUpdateNotice(this.snapshot.updateNotice);
        this.renderPromotions();
        this.scheduleNextTransition();
        return true;
    }

    isCurrentlyEnabled(item, now = Date.now()) {
        if (!isObject(item) || item.enabled !== true) return false;
        const startsAt = item.startsAt ? Date.parse(item.startsAt) : null;
        const expiresAt = item.expiresAt ? Date.parse(item.expiresAt) : null;
        if ((startsAt !== null && !Number.isFinite(startsAt)) || (expiresAt !== null && !Number.isFinite(expiresAt))) return false;
        return (startsAt === null || startsAt <= now) && (expiresAt === null || expiresAt > now);
    }

    dismissalKey(type, item) {
        if (!isObject(item) || item.id === undefined || item.revision === undefined) return null;
        return `sigmod:${type}:${encodeURIComponent(String(item.id))}:${encodeURIComponent(String(item.revision))}`;
    }

    hasDismissal(type, item) {
        const key = this.dismissalKey(type, item);
        if (!key) return false;
        try {
            return sessionStorage.getItem(key) === '1';
        } catch {
            return false;
        }
    }

    setDismissal(type, item) {
        const key = this.dismissalKey(type, item);
        if (!key) return false;
        try {
            sessionStorage.setItem(key, '1');
            return true;
        } catch {
            return false;
        }
    }

    dismissAlert(alert) {
        if (!this.setDismissal('alert', alert)) return false;
        this.lastAlertKey = this.contentKey(alert);
        this.app.features.get('modal')?.handleAlert?.({ ...alert, enabled: false });
        return true;
    }

    hasAlertDismissal(alert) {
        return this.hasDismissal('alert', alert);
    }

    contentKey(item) {
        return isObject(item) ? `${String(item.id ?? '')}:${String(item.revision ?? '')}` : '';
    }

    applyAlert(alert) {
        const current = this.isCurrentlyEnabled(alert) && !this.hasAlertDismissal(alert);
        const key = this.contentKey(alert);
        const state = `${key}:${current}`;
        if (this.lastAlertState === state) return;
        this.lastAlertKey = key;
        this.lastAlertState = state;
        this.app.features.get('modal')?.handleAlert?.(current ? alert : { ...alert, enabled: false });
    }

    compareVersions(left, right) {
        const parse = (value) => {
            const match = String(value ?? '')
                .trim()
                .match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
            return match ? { numbers: match.slice(1, 4).map(Number), prerelease: match[4] ? match[4].split('.') : [] } : null;
        };
        const a = parse(left);
        const b = parse(right);
        if (!a || !b) return null;
        for (let i = 0; i < 3; i += 1) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] < b.numbers[i] ? -1 : 1;
        if (!a.prerelease.length || !b.prerelease.length)
            return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
        const len = Math.max(a.prerelease.length, b.prerelease.length);
        for (let i = 0; i < len; i += 1) {
            if (a.prerelease[i] === undefined) return -1;
            if (b.prerelease[i] === undefined) return 1;
            if (a.prerelease[i] === b.prerelease[i]) continue;
            const aNumber = /^\d+$/.test(a.prerelease[i]);
            const bNumber = /^\d+$/.test(b.prerelease[i]);
            if (aNumber && bNumber) return Number(a.prerelease[i]) < Number(b.prerelease[i]) ? -1 : 1;
            if (aNumber !== bNumber) return aNumber ? -1 : 1;
            return a.prerelease[i] < b.prerelease[i] ? -1 : 1;
        }
        return 0;
    }

    isSafePublicUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return null;
        try {
            const url = new URL(value);
            const devLocal = typeof SIGMOD_DEV !== 'undefined' && SIGMOD_DEV.enabled && ['localhost', '127.0.0.1'].includes(url.hostname);
            if (!['https:', ...(devLocal ? ['http:'] : [])].includes(url.protocol) || url.username || url.password) return null;
            return url.href;
        } catch {
            return null;
        }
    }

    dismissUpdateNotice(notice) {
        if (!this.setDismissal('update-notice', notice)) return false;
        this.lastNoticeKey = this.contentKey(notice);
        this.app.backend.emit('release-notice', { ...notice, enabled: false });
        return true;
    }

    hasUpdateNoticeDismissal(notice) {
        return this.hasDismissal('update-notice', notice);
    }

    applyUpdateNotice(notice) {
        const safeUrl = this.isSafePublicUrl(notice.downloadUrl);
        const newer = this.compareVersions(BUILD.release, notice.latestClientVersion) === -1;
        const current = this.isCurrentlyEnabled(notice) && newer && Boolean(safeUrl) && !this.hasUpdateNoticeDismissal(notice);
        const key = this.contentKey(notice);
        const state = `${key}:${current}`;
        if (this.lastNoticeState === state) return;
        this.lastNoticeKey = key;
        this.lastNoticeState = state;
        this.app.backend.emit('release-notice', current ? { ...notice, downloadUrl: safeUrl } : { ...notice, enabled: false });
    }

    applyChatFilter(value) {
        const feature = this.app.features.get('chat');
        if (!feature) return;
        if (isObject(value) && Array.isArray(value.names) && Array.isArray(value.messages)) {
            feature.blocked =
                value.enabled === false
                    ? { names: [], messages: [] }
                    : {
                          names: value.names.filter((item) => typeof item === 'string').map((item) => item.toLowerCase()),
                          messages: value.messages.filter((item) => typeof item === 'string').map((item) => item.toLowerCase()),
                      };
            return;
        }
        void feature.loadBlockedData?.();
    }

    async applyLocaleUpdate(value) {
        if (this.destroyed) return;
        const locale = typeof value === 'string' ? value : value?.locale;
        if (typeof locale !== 'string' || !/^[a-z]{2}$/.test(locale)) return;
        let pack = value?.messages && isObject(value.messages) ? value : null;
        if (!pack) {
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 5_000);
            this.localeControllers.add(controller);
            try {
                const response = await fetch(`${ENDPOINTS.app}/locales/${encodeURIComponent(locale)}`, {
                    credentials: 'omit',
                    referrerPolicy: 'no-referrer',
                    cache: 'no-store',
                    signal: controller.signal,
                });
                if (!response.ok) return;
                const payload = await response.json();
                pack = payload?.data ?? payload;
            } catch {
                return;
            } finally {
                window.clearTimeout(timeout);
                this.localeControllers.delete(controller);
            }
        }
        if (this.destroyed || pack?.locale !== locale || !isObject(pack.messages)) return;
        this.app.i18n.messages.set(
            locale,
            Object.fromEntries(Object.entries(pack.messages).filter(([, text]) => typeof text === 'string'))
        );
        if (this.app.i18n.locale === locale) this.app.i18n.apply();
    }

    observeMenu() {
        const sync = () => {
            const wrapper = document.querySelector(SELECTORS.menuWrapper);
            if (wrapper !== this.menuWrapper) {
                this.menuWrapperObserver?.disconnect();
                this.menuWrapper = wrapper;
                if (wrapper instanceof HTMLElement) {
                    this.menuWrapperObserver = new MutationObserver(() => this.syncMenuVisibility());
                    this.menuWrapperObserver.observe(wrapper, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
                }
            }
            this.syncMenuVisibility();
        };
        this.bodyObserver = new MutationObserver(sync);
        // Watch shell replacement, not every changing chat/score node in the game.
        if (document.body) this.bodyObserver.observe(document.body, { childList: true });
        this.resources.add(() => {
            this.bodyObserver?.disconnect();
            this.menuWrapperObserver?.disconnect();
            this.bodyObserver = null;
            this.menuWrapperObserver = null;
            this.menuWrapper = null;
        });
        sync();
    }

    isMenuVisible() {
        const wrapper = document.querySelector(SELECTORS.menuWrapper);
        if (!(wrapper instanceof HTMLElement) || wrapper.hidden || wrapper.style.display === 'none') return false;
        return getComputedStyle(wrapper).display !== 'none' && getComputedStyle(wrapper).visibility !== 'hidden';
    }

    syncMenuVisibility() {
        const visible = this.isMenuVisible();
        if (visible && !this.menuVisible) this.hideForGameplay = false;
        this.menuVisible = visible;
        this.renderPromotions();
    }

    scheduleNextTransition() {
        if (this.transitionTimer) window.clearTimeout(this.transitionTimer);
        this.transitionTimer = 0;
        const candidates = [this.snapshot?.alert, this.snapshot?.updateNotice, ...(this.snapshot?.promotions ?? [])];
        const now = Date.now();
        const transitions = candidates
            .flatMap((item) => [item?.startsAt, item?.expiresAt])
            .map((value) => (value ? Date.parse(value) : NaN))
            .filter((time) => Number.isFinite(time) && time > now);
        if (!transitions.length) return;
        const delay = Math.min(Math.min(...transitions) - now + 10, 2_147_000_000);
        this.transitionTimer = window.setTimeout(
            () => {
                this.transitionTimer = 0;
                if (this.destroyed) return;
                this.applyAlert(this.snapshot?.alert ?? { enabled: false });
                this.applyUpdateNotice(this.snapshot?.updateNotice ?? { enabled: false });
                this.renderPromotions();
                this.scheduleNextTransition();
            },
            Math.max(0, delay)
        );
    }

    renderPromotions() {
        const visible = this.isMenuVisible();
        if (visible && !this.menuVisible) this.hideForGameplay = false;
        this.menuVisible = visible;
        const host = document.querySelector('#left-menu')?.closest('.menu-wrapper.top');
        const shouldShow =
            this.app.settings?.themes?.showPromotions === true && visible && !this.hideForGameplay && host instanceof HTMLElement;
        const active = shouldShow
            ? (this.snapshot?.promotions
                  .filter(
                      (item) =>
                          !this.dismissedPromotions.has(String(item.id ?? '')) &&
                          this.isCurrentlyEnabled(item) &&
                          this.isSafePublicUrl(item.link) &&
                          item.placement === 'menu-card'
                  )
                  .sort((a, b) => (Date.parse(b.startsAt ?? '') || 0) - (Date.parse(a.startsAt ?? '') || 0)) ?? [])
            : [];
        const wanted = new Set(active.map((item) => this.contentKey(item)));
        for (const existing of document.querySelectorAll('[data-sigmod-promotion-controller]')) {
            if (!wanted.has(existing.dataset.promotionKey) || existing.parentElement !== host) existing.remove();
        }
        if (!shouldShow) return;
        for (const item of active) {
            const key = this.contentKey(item);
            let card = [...host.querySelectorAll('[data-sigmod-promotion-controller]')].find(
                (existing) => existing.dataset.promotionKey === key
            );
            if (card) {
                host.append(card);
                continue;
            }
            const link = this.isSafePublicUrl(item.link);
            if (!link) continue;
            const wrapper = document.createElement('div');
            wrapper.className = 'sigmod-promotion-wrap';
            wrapper.dataset.sigmodPromotionController = 'true';
            wrapper.dataset.promotionKey = key;
            card = document.createElement('a');
            card.className = 'sigmod-promotion';
            card.href = link;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            card.style.setProperty('--promotion-title-color', safePromotionColor(item.titleColor, '#ffffff'));
            card.style.setProperty('--promotion-description-color', safePromotionColor(item.descriptionColor, '#a0a0a0'));
            const values = {
                title: String(item.title ?? ''),
                description: String(item.description ?? ''),
                imageUrl: this.isSafePublicUrl(item.imageUrl) ?? '',
                link,
                buttonText: String(item.buttonText ?? ''),
            };
            const escapeHtml = (value) =>
                value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
            const template =
                typeof item.html === 'string' && item.html
                    ? item.html
                    : '<article><img src="{{imageUrl}}" alt=""><div><h2>{{title}}</h2><p>{{description}}</p></div></article>';
            const html = template.replace(/\{\{(title|description|imageUrl|link|buttonText)\}\}/g, (_match, key) =>
                escapeHtml(values[key])
            );
            const content = document.createElement('template');
            content.innerHTML = html;
            this.sanitizePromotionContent(content.content);
            card.append(content.content);
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'sigmod-promotion-close';
            close.setAttribute('aria-label', `Close ${String(item.title ?? 'promotion')}`);
            close.title = 'Close promotion until this page is reloaded';
            const closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            closeIcon.setAttribute('viewBox', '0 0 24 24');
            closeIcon.setAttribute('width', '14');
            closeIcon.setAttribute('height', '14');
            closeIcon.setAttribute('aria-hidden', 'true');
            const closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            closePath.setAttribute('d', 'M18 6 6 18M6 6l12 12');
            closePath.setAttribute('fill', 'none');
            closePath.setAttribute('stroke', 'currentColor');
            closePath.setAttribute('stroke-width', '1.8');
            closePath.setAttribute('stroke-linecap', 'round');
            closeIcon.append(closePath);
            close.append(closeIcon);
            close.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.dismissedPromotions.add(String(item.id ?? key));
                wrapper.remove();
            });
            wrapper.append(card, close);
            host.append(wrapper);
        }
    }

    sanitizePromotionContent(root) {
        const allowed = new Set([
            'ARTICLE',
            'DIV',
            'SPAN',
            'P',
            'BR',
            'STRONG',
            'B',
            'EM',
            'I',
            'U',
            'UL',
            'OL',
            'LI',
            'BLOCKQUOTE',
            'H1',
            'H2',
            'H3',
            'H4',
            'IMG',
        ]);
        const discard = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'LINK', 'META', 'BASE']);
        const visit = (parent) => {
            for (const node of [...parent.childNodes]) {
                if (node.nodeType === Node.TEXT_NODE) continue;
                if (!(node instanceof HTMLElement) || discard.has(node.tagName)) {
                    node.remove();
                    continue;
                }
                visit(node);
                if (!allowed.has(node.tagName)) {
                    node.replaceWith(...node.childNodes);
                    continue;
                }
                const urlAttr = node.tagName === 'IMG' ? 'src' : null;
                const url = urlAttr ? this.isSafePublicUrl(node.getAttribute(urlAttr)) : null;
                const alt = node.tagName === 'IMG' ? node.getAttribute('alt') : null;
                for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name);
                if (url && urlAttr) node.setAttribute(urlAttr, url);
                if (alt !== null && node.tagName === 'IMG') node.setAttribute('alt', alt.slice(0, 300));
            }
        };
        visit(root);
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.requestGeneration += 1;
        this.requestController?.abort();
        for (const controller of this.localeControllers) controller.abort();
        this.localeControllers.clear();
        this.requestController = null;
        this.resources.dispose();
        if (this.transitionTimer) window.clearTimeout(this.transitionTimer);
        this.transitionTimer = 0;
        for (const card of document.querySelectorAll('[data-sigmod-promotion-controller]')) card.remove();
        this.snapshot = null;
    }
}
