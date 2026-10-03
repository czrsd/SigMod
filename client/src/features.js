class AuthController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.userObserved = false;
    }
    async mount() {
        const controller = this;
        const originalFetch = window.fetch;
        const fetchFacade = function (...args) {
            return originalFetch.apply(this, args).then((response) => {
                controller.inspectResponse(args[0], response);
                return response;
            });
        };
        this.resources.patch(window, 'fetch', fetchFacade);
        this.resources.add(this.app.backend.on('sid', (sid) => this.handleSid(sid)));
        this.resources.add(this.app.backend.on('open', () => this.publishUser()));
        this.resources.listen(document, 'click', (event) => this.handleHourlyClick(event), true);
    }
    handleHourlyClick(event) {
        const target = event.target instanceof Element ? event.target.closest('#free-chest-button') : null;
        if (!(target instanceof HTMLElement) || typeof target.hourly !== 'function') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.runHourlyWithoutAdblockGuard(target);
    }
    runHourlyWithoutAdblockGuard(button) {
        const hourly = button.hourly;
        if (typeof hourly !== 'function') return;
        const root = document.documentElement;
        const hadHideAds = root.classList.contains('sigmod-hide-ads');
        const modMarkers = [...document.querySelectorAll('.settings-menu-holder')];
        const adSelectors = ['#ad_bottom', '#div-gpt-ad-1622841396282-0', '#div-gpt-ad-1622632389350-0', '#div-gpt-ad-1622841482467-0'];
        const adStyles = adSelectors
            .map((selector) => document.querySelector(selector))
            .filter((element) => element instanceof HTMLElement)
            .map((element) => ({
                element,
                value: element.style.getPropertyValue('display'),
                priority: element.style.getPropertyPriority('display'),
            }));
        try {
            for (const marker of modMarkers) marker.classList.remove('settings-menu-holder');
            root.classList.remove('sigmod-hide-ads');
            for (const { element } of adStyles) element.style.setProperty('display', 'block', 'important');
            hourly.call(button);
        } catch (error) {
            this.app.logger.warnOnce('hourly-reward-bypass', 'Unable to open the daily reward directly', error);
        } finally {
            for (const { element, value, priority } of adStyles) {
                if (value) element.style.setProperty('display', value, priority);
                else element.style.removeProperty('display');
            }
            for (const marker of modMarkers) marker.classList.add('settings-menu-holder');
            root.classList.toggle('sigmod-hide-ads', hadHideAds);
        }
    }
    inspectResponse(input, response) {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input instanceof Request ? input.url : '';
        if (!url.includes('/server/auth')) return;
        response
            .clone()
            .json()
            .then((payload) => {
                const user = payload?.body?.user;
                if (!isObject(user)) return;
                this.app.state.user = user;
                if (isObject(window.gameSettings)) window.gameSettings.user = user;
                this.app.state.nickname = user.givenName || user.fullName || this.app.state.nickname;
                const firstUser = !this.userObserved;
                this.userObserved = true;
                this.publishUser();
                if (firstUser && this.app.settings.settings.autoClaimCoins) {
                    const claim = document.querySelector('#free-chest-button');
                    if (claim instanceof HTMLElement && getComputedStyle(claim).display !== 'none') {
                        this.resources.timeout(() => claim.click(), 500);
                    }
                }
                this.app.backend.emit('sigmally-user', user);
            })
            .catch((error) => {
                this.app.logger.warnOnce('host-auth-response', 'Unable to read the Sigmally auth response', error);
            });
    }
    handleSid(sid) {
        if (!this.app.settings.modAccount.authorized || !sid) return;
        this.app.backend.emit('auth-required', sid);
    }
    publishUser() {
        if (!this.app.state.user) return;
        this.app.backend.send('user', {
            ...this.app.state.user,
            nick: this.app.state.nickname,
        });
    }
}
class EmojiPicker {
    constructor(app, resources, getInput) {
        this.app = app;
        this.resources = resources;
        this.getInput = typeof getInput === 'function' ? getInput : () => null;
        this.panel = null;
        this.emojis = null;
        this.emojiByValue = new Map();
        this.emojiRequest = null;
        this.emojiCategory = 'All';
        this.emojiRenderState = null;
        this.emojiScrollFrame = 0;
        this.emojiBatchSize = 49;
        this.recentEmojis = this.loadRecentEmojis();
    }
    loadRecentEmojis() {
        try {
            const value = JSON.parse(localStorage.getItem('sigmod_recent_emojis') || '[]');
            return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 14) : [];
        } catch {
            return [];
        }
    }
    rememberEmoji(value) {
        const emoji = String(value || '');
        if (!emoji) return;
        this.recentEmojis = [emoji, ...this.recentEmojis.filter((item) => item !== emoji)].slice(0, 14);
        try {
            localStorage.setItem('sigmod_recent_emojis', JSON.stringify(this.recentEmojis));
        } catch {
            // Recent emojis are optional; chat remains usable if storage is unavailable.
        }
    }
    createEmojiMenu(emojiButton) {
        const panel = createElement('div', {
            className: 'chatAddedContainer emojisContainer hidden_full',
        });
        const header = createElement('div', {
            className: 'emoji-picker-header',
        });
        const title = createElement('span', { text: 'Emojis' });
        const close = createElement('button', {
            className: 'emoji-picker-close',
            attributes: {
                type: 'button',
                'aria-label': 'Close emoji picker',
            },
            text: '×',
        });
        header.append(title, close);
        const searchWrap = createElement('div', {
            className: 'emoji-search-wrap',
        });
        searchWrap.innerHTML = icon('search', 18);
        const search = createElement('input', {
            className: 'chatInput',
            attributes: {
                id: 'searchEmoji',
                type: 'search',
                placeholder: 'Search emojis...',
                autocomplete: 'off',
                spellcheck: 'false',
            },
        });
        searchWrap.append(search);
        const categoryTabs = createElement('div', {
            className: 'emoji-category-tabs',
            attributes: { id: 'emoji-category-tabs' },
        });
        const categories = createElement('div', {
            className: 'emoji-picker-content',
            attributes: { id: 'categories' },
        });
        panel.append(header, searchWrap, categoryTabs, categories);
        document.body.append(panel);
        this.emojiPanel = panel;
        this.resources.add(() => {
            panel.remove();
            if (this.emojiPanel === panel) this.emojiPanel = null;
        });
        const refresh = () => this.renderEmojis(search.value, this.emojiCategory);
        this.resources.listen(search, 'input', refresh);
        this.resources.listen(search, 'keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                panel.classList.add('hidden_full');
                this.input?.focus();
            }
        });
        this.resources.listen(close, 'click', () => {
            panel.classList.add('hidden_full');
            this.input?.focus();
        });
        this.resources.listen(categoryTabs, 'click', (event) => {
            const button = event.target instanceof Element ? event.target.closest('[data-emoji-category]') : null;
            if (!(button instanceof HTMLButtonElement)) return;
            this.emojiCategory = button.dataset.emojiCategory || 'All';
            for (const item of categoryTabs.querySelectorAll('[data-emoji-category]')) {
                item.classList.toggle('active', item === button);
            }
            this.renderEmojis(search.value, this.emojiCategory);
        });
        // One listener handles every rendered emoji. This avoids retaining a
        // listener/disposer for each button whenever search results are rebuilt.
        this.resources.listen(categories, 'click', (event) => {
            const button = event.target instanceof Element ? event.target.closest('[data-emoji-value]') : null;
            if (!(button instanceof HTMLButtonElement)) return;
            const value = button.dataset.emojiValue;
            if (!value || !(this.input instanceof HTMLInputElement)) return;
            const start = this.input.selectionStart ?? this.input.value.length;
            const end = this.input.selectionEnd ?? start;
            this.input.setRangeText(value, start, end, 'end');
            this.rememberEmoji(value);
            this.renderEmojiCategoryTabs();
            this.input.focus();
        });
        // Only append the next batch when the user gets close to the bottom.
        // requestAnimationFrame keeps the scroll handler cheap during fast scrolling.
        this.resources.listen(categories, 'scroll', () => {
            if (this.emojiScrollFrame) return;
            this.emojiScrollFrame = requestAnimationFrame(() => {
                this.emojiScrollFrame = 0;
                const remaining = categories.scrollHeight - categories.scrollTop - categories.clientHeight;
                if (remaining <= 96) this.appendEmojiBatch();
            });
        });
        this.resources.add(() => {
            if (this.emojiScrollFrame) cancelAnimationFrame(this.emojiScrollFrame);
            this.emojiScrollFrame = 0;
        });
        this.resources.listen(emojiButton, 'click', async () => {
            const opening = panel.classList.contains('hidden_full');
            panel.classList.toggle('hidden_full', !opening);
            if (!opening) return;
            categories.replaceChildren(
                createElement('div', {
                    className: 'emoji-picker-state',
                    text: 'Loading emojis...',
                })
            );
            if (!this.emojis) await this.loadEmojis();
            this.renderEmojiCategoryTabs();
            this.renderEmojis(search.value, this.emojiCategory);
            search.focus();
        });
    }
    renderEmojiCategoryTabs() {
        const root = this.emojiPanel?.querySelector('#emoji-category-tabs');
        if (!(root instanceof HTMLElement) || !Array.isArray(this.emojis)) return;
        const categories = [
            ...new Set(
                this.emojis
                    .filter((item) => isObject(item))
                    .map((item) => String(item.category ?? 'Other'))
                    .filter(Boolean)
            ),
        ];
        const available = ['All'];
        if (this.recentEmojis.length) available.push('Recent');
        available.push(...categories);
        root.replaceChildren();
        if (!available.includes(this.emojiCategory)) this.emojiCategory = 'All';
        for (const category of available) {
            root.append(
                createElement('button', {
                    className: `emoji-category-tab${category === this.emojiCategory ? ' active' : ''}`,
                    text: category,
                    attributes: {
                        type: 'button',
                        'data-emoji-category': category,
                    },
                })
            );
        }
    }
    async loadEmojis() {
        if (this.emojis) return this.emojis;
        if (this.emojiRequest) return this.emojiRequest;
        this.emojiRequest = fetch('https://czrsd.com/static/sigmod/emojis.json')
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((data) => {
                // Normalize once after download so searching/rendering does not
                // rebuild thousands of small objects on every keystroke.
                this.emojis = (Array.isArray(data) ? data : [])
                    .filter((item) => isObject(item))
                    .map((item) => {
                        const emoji = String(item.emoji ?? '');
                        const description = String(item.description ?? '');
                        const category = String(item.category ?? 'Other');
                        const tags = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag)) : [];
                        return {
                            emoji,
                            description,
                            category,
                            tags,
                            searchText: [emoji, description, category, ...tags].join(' ').toLowerCase(),
                        };
                    })
                    .filter((item) => item.emoji);
                this.emojiByValue = new Map(this.emojis.map((item) => [item.emoji, item]));
                return this.emojis;
            })
            .catch((error) => {
                this.app.logger.warnOnce('emoji-list', 'Unable to load the emoji list', error);
                this.emojis = [];
                this.emojiByValue = new Map();
                return this.emojis;
            })
            .finally(() => {
                this.emojiRequest = null;
            });
        return this.emojiRequest;
    }
    renderEmojis(searchTerm = '', selectedCategory = 'All') {
        const root = this.emojiPanel?.querySelector('#categories');
        if (!(root instanceof HTMLElement) || !Array.isArray(this.emojis)) return;
        const query = String(searchTerm).trim().toLowerCase();
        const terms = query.split(/\s+/).filter(Boolean);
        const category = String(selectedCategory || 'All');
        let items;
        if (category === 'Recent') {
            items = this.recentEmojis.map((emoji) => this.emojiByValue.get(emoji)).filter(Boolean);
        } else {
            items = category === 'All' ? this.emojis : this.emojis.filter((item) => item.category === category);
        }
        if (terms.length) {
            items = items.filter((item) => terms.every((term) => item.searchText.includes(term)));
        }
        root.replaceChildren();
        root.scrollTop = 0;
        this.emojiRenderState = {
            items,
            offset: 0,
            category,
            query,
            currentGroup: null,
            currentGrid: null,
        };
        if (!items.length) {
            root.append(
                createElement('div', {
                    className: 'emoji-picker-state',
                    text: query ? `No emojis found for "${searchTerm.trim()}".` : 'No emojis in this category.',
                })
            );
            return;
        }

        this.appendEmojiBatch();
    }
    appendEmojiBatch() {
        const root = this.emojiPanel?.querySelector('#categories');
        const state = this.emojiRenderState;
        if (!(root instanceof HTMLElement) || !state || !Array.isArray(state.items)) return;
        if (state.offset >= state.items.length) return;
        const end = Math.min(state.offset + this.emojiBatchSize, state.items.length);
        let buttons = document.createDocumentFragment();
        const flushButtons = () => {
            if (state.currentGrid instanceof HTMLElement && buttons.childNodes.length) {
                state.currentGrid.append(buttons);
                buttons = document.createDocumentFragment();
            }
        };
        for (let index = state.offset; index < end; index += 1) {
            const item = state.items[index];
            const group = state.category === 'All' && !state.query ? item.category : '';
            if (group !== state.currentGroup || !(state.currentGrid instanceof HTMLElement)) {
                flushButtons();
                const section = createElement('div', {
                    className: 'emoji-picker-section',
                });
                if (group) {
                    section.append(
                        createElement('div', {
                            className: 'emoji-picker-section-title',
                            text: group,
                        })
                    );
                }
                const grid = createElement('div', {
                    className: 'emojiContainer',
                });
                section.append(grid);
                root.append(section);
                state.currentGroup = group;
                state.currentGrid = grid;
            }
            buttons.append(
                createElement('button', {
                    className: 'emoji',
                    text: item.emoji,
                    attributes: {
                        type: 'button',
                        title: item.description || item.emoji,
                        'aria-label': item.description || item.emoji,
                        'data-emoji-value': item.emoji,
                    },
                })
            );
        }
        flushButtons();
        state.offset = end;
    }
}
class ChatController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.root = null;
        this.messages = null;
        this.input = null;
        this.mode = app.settings.chat.showClientChat ? 'party' : 'main';
        this.muted = new Set();
        this.blocked = { names: [], messages: [] };
        this.sendQueue = Promise.resolve();
        this.onContext = null;
        this.settingsPanel = null;
        this.unreadCount = 0;
        this.scrollStateFrame = 0;
        this.nativeChatBlocks = new Map();
        this.nativeChatSyncQueued = false;
        this.blockedRequest = null;
        this.emojiPicker = new EmojiPicker(app, this.resources, () => this.input);
    }
    async mount() {
        this.createView();
        this.overrideNativeChat();
        this.bindHost(this.app.host.adapter);
        this.resources.add(this.app.host.on('change', (adapter) => this.bindHost(adapter)));
        this.resources.add(this.app.backend.on('chat-message', (message) => this.renderBackendMessage(message)));
        this.loadBlockedData();
        this.setMode(this.mode, false);
    }
    createView() {
        const root = createElement('aside', { className: 'modChat' });
        const inner = createElement('div', { className: 'modChat__inner' });
        const scrollButton = createElement('button', {
            attributes: {
                id: 'scroll-down-btn',
                type: 'button',
                'aria-label': 'Jump to latest messages',
                title: 'Jump to latest messages',
            },
        });
        scrollButton.innerHTML = icon('caretDown', 18) + '<span class="chat-new-count"></span>';
        const tabs = createElement('div', {
            className: 'modchat-chatbuttons',
        });
        const main = createElement('button', {
            className: 'chatButton',
            attributes: { id: 'mainchat', type: 'button' },
            text: 'Main',
        });
        const party = createElement('button', {
            className: 'chatButton',
            attributes: { id: 'partychat', type: 'button' },
            text: 'Party',
        });
        const tag = createElement('span', { className: 'tagText' });
        const messages = createElement('div', {
            className: 'scroll',
            attributes: { id: 'mod-messages' },
        });
        const inputContainer = createElement('div', {
            attributes: { id: 'chatInputContainer' },
        });
        const input = createElement('input', {
            className: 'chatInput',
            attributes: {
                id: 'chatSendInput',
                type: 'text',
                maxlength: '250',
                autocomplete: 'off',
                placeholder: 'message...',
            },
        });
        const settings = createElement('button', {
            className: 'chatButton chat-icon-btn',
            attributes: {
                id: 'openChatSettings',
                type: 'button',
                'aria-label': 'Chat settings',
                title: 'Chat settings',
            },
        });
        settings.innerHTML = icon('gear', 15);
        const emoji = createElement('button', {
            className: 'chatButton chat-icon-btn',
            attributes: {
                id: 'openEmojiMenu',
                type: 'button',
                'aria-label': 'Emojis',
                title: 'Emojis',
            },
        });
        emoji.innerHTML = icon('smiley', 16);
        const send = createElement('button', {
            className: 'chatButton chat-send-btn',
            attributes: {
                id: 'sendButton',
                type: 'button',
                'aria-label': 'Send message',
            },
        });
        send.innerHTML = icon('send', 16);
        tabs.append(main, party, tag);
        inputContainer.append(input, settings, emoji, send);
        inner.append(scrollButton, tabs, messages, inputContainer);
        root.append(inner);
        document.body.append(root);
        this.root = root;
        this.messages = messages;
        this.input = input;
        this.createChatSettings(settings);
        this.createEmojiMenu(emoji);
        this.applyChatPreferences();
        this.applyColors();
        this.updateInputAvailability();
        this.resources.add(this.app.backend.on('sigmally-user', () => this.updateInputAvailability()));
        this.resources.listen(main, 'click', () => this.setMode('main'));
        this.resources.listen(party, 'click', () => this.setMode('party'));
        this.resources.listen(send, 'click', () => this.submit());
        this.resources.listen(scrollButton, 'click', () => this.scrollToBottom(true));
        this.resources.listen(messages, 'scroll', () => this.scheduleScrollStateUpdate());
        this.resources.timeout(() => this.updateScrollState(), 0);
        this.resources.listen(input, 'keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                this.submit();
            }
        });
        this.resources.listen(document, 'keydown', (event) => {
            if (event.key !== 'Enter' || isTyping()) return;
            event.preventDefault();
            // Sigmally handles Enter on window and would otherwise focus its hidden textbox.
            event.stopPropagation();
            input.focus();
        });
        this.resources.listen(messages, 'contextmenu', (event) => this.openMessageMenu(event));
        this.resources.add(() => root.remove());
    }
    /**
     * Hide Sigmally's canvas-rendered chat while preserving its DOM and handlers.
     * The host can replace or restyle this node after startup, so CSS is the
     * authority and the observer only reapplies accessibility metadata.
     */
    overrideNativeChat() {
        const style = createElement('style', {
            attributes: {
                'data-sigmod-native-chat-override': BUILD.release,
            },
        });
        style.textContent = `${SELECTORS.chatBlock} { display: none !important; visibility: hidden !important; pointer-events: none !important; }`;
        (document.head || document.documentElement).append(style);
        this.resources.add(() => style.remove());

        setTimeout(() => {
            const showChat = document.querySelector('#showChat');
            if (showChat instanceof HTMLInputElement && showChat.checked) {
                showChat.click();
            }
            if (showChat) {
                const li = showChat.closest('li');
                if (li) li.style.display = 'none';
            }
        }, 1000);

        this.resources.listen(window, 'beforeunload', () => {
            try {
                const settingsStr = localStorage.getItem('settings');
                if (settingsStr) {
                    const settings = JSON.parse(settingsStr);
                    settings.showChat = true;
                    localStorage.setItem('settings', JSON.stringify(settings));
                }
            } catch (e) {}
        });

        const sync = () => {
            this.nativeChatSyncQueued = false;
            const chatBlock = document.querySelector(SELECTORS.chatBlock);
            if (!(chatBlock instanceof HTMLElement) || this.nativeChatBlocks.has(chatBlock)) return;
            this.nativeChatBlocks.set(chatBlock, {
                ariaHidden: chatBlock.getAttribute('aria-hidden'),
                marker: chatBlock.getAttribute('data-sigmod-native-chat'),
            });
            chatBlock.setAttribute('data-sigmod-native-chat', 'overridden');
            chatBlock.setAttribute('aria-hidden', 'true');
        };
        const scheduleSync = () => {
            if (this.nativeChatSyncQueued) return;
            this.nativeChatSyncQueued = true;
            queueMicrotask(sync);
        };
        sync();
        const observer = new MutationObserver(() => {
            const current = document.querySelector(SELECTORS.chatBlock);
            if (!(current instanceof HTMLElement) || !this.nativeChatBlocks.has(current)) scheduleSync();
        });
        this.resources.observe(observer, document.documentElement, {
            childList: true,
            subtree: true,
        });
        this.resources.add(() => {
            for (const [chatBlock, previous] of this.nativeChatBlocks) {
                if (!chatBlock.isConnected) continue;
                if (previous.marker === null) chatBlock.removeAttribute('data-sigmod-native-chat');
                else chatBlock.setAttribute('data-sigmod-native-chat', previous.marker);
                if (previous.ariaHidden === null) chatBlock.removeAttribute('aria-hidden');
                else chatBlock.setAttribute('aria-hidden', previous.ariaHidden);
            }
            this.nativeChatBlocks.clear();
        });
    }
    createChatSettings(settingsButton) {
        const menu = this.app.features.get('menu');
        const panel = menu?.root?.querySelector('#mod_chat_settings');
        if (!(panel instanceof HTMLElement)) return;
        panel.classList.add('scroll');
        panel.replaceChildren();
        const page = createElement('div', { className: 'settings-page' });
        const makeSection = (title) => {
            const section = createElement('section', {
                className: 'settings-section',
            });
            section.append(
                createElement('div', {
                    className: 'settings-section-title',
                    text: title,
                })
            );
            const body = createElement('div', {
                className: 'settings-grid',
            });
            section.append(body);
            return { section, body };
        };
        const makeRow = (label, control, description = '') => {
            const row = createElement('div', {
                className: 'settings-item chat-menu-row',
            });
            const copy = createElement('div', {
                className: 'f-column g-2',
            });
            copy.append(createElement('span', { text: label }));
            if (description) {
                copy.append(
                    createElement('span', {
                        className: 'modDescText',
                        text: description,
                    })
                );
            }
            row.append(copy, control);
            return row;
        };
        const checkbox = (id) => {
            const wrapper = createElement('div', {
                className: 'modCheckbox',
            });
            const input = createElement('input', {
                attributes: { id, type: 'checkbox' },
            });
            wrapper.append(
                input,
                createElement('label', {
                    attributes: { class: 'cbx', for: id },
                })
            );
            return { wrapper, input };
        };
        const keys = makeSection('Keybindings');
        const locationKey = createElement('input', {
            className: 'keybinding',
            attributes: {
                id: 'chat-location-key',
                'data-setting': 'macros.keys.location',
                type: 'text',
                maxlength: '1',
                placeholder: '...',
                'aria-label': 'Send location keybind',
            },
        });
        const toggleKey = createElement('input', {
            className: 'keybinding',
            attributes: {
                id: 'chat-toggle-key',
                'data-setting': 'macros.keys.toggle.chat',
                type: 'text',
                maxlength: '1',
                placeholder: '...',
                'aria-label': 'Show or hide chat keybind',
            },
        });
        keys.body.append(
            makeRow('Send location', locationKey, 'Send your current position to chat.'),
            makeRow('Show / Hide chat', toggleKey)
        );
        const behavior = makeSection('Messages & behavior');
        const time = checkbox('showChatTime');
        const names = checkbox('showNameColors');
        const chatButtons = checkbox('showPartyMain');
        const blurTag = checkbox('blurTag');
        const compact = checkbox('compactChat');
        const locationText = createElement('input', {
            className: 'form-control',
            attributes: {
                id: 'locationText',
                type: 'text',
                placeholder: '{pos}',
                autocomplete: 'off',
            },
        });
        behavior.body.append(
            makeRow('Show timestamps', time.wrapper),
            makeRow('Use name colors', names.wrapper),
            makeRow('Show Main / Party tabs', chatButtons.wrapper),
            makeRow('Blur party tag', blurTag.wrapper),
            makeRow('Compact chat', compact.wrapper),
            makeRow('Location message', locationText, 'Use {pos} where the position should appear.')
        );
        const style = createElement('section', {
            className: 'settings-section',
        });
        style.append(
            createElement('div', {
                className: 'settings-section-title',
                text: 'Colors',
            })
        );
        const colors = createElement('div', {
            className: 'chat-menu-colors',
        });
        for (const [label, containerId, inputId] of [
            ['Text', 'chatTextColor', 'chatTextColorInput'],
            ['Background', 'chatBackground', 'chatBackgroundInput'],
            ['Accent', 'chatThemeChanger', 'chatThemeColorInput'],
        ]) {
            const item = createElement('div', {
                className: 'chat-menu-color',
            });
            const container = createElement('div', {
                attributes: { id: containerId },
            });
            container.append(
                createElement('input', {
                    className: 'colorInput',
                    attributes: { id: inputId, type: 'color' },
                })
            );
            item.append(createElement('span', { text: label }), container);
            colors.append(item);
        }
        style.append(colors);
        page.append(keys.section, behavior.section, style);
        panel.append(page);
        this.settingsPanel = panel;
        const bindKey = (input, path) => {
            input.readOnly = true;
            input.autocomplete = 'off';
            input.value = this.app.settingsStore.get(path) ?? '';
            this.resources.listen(input, 'focus', () => {
                input.dataset.recording = 'true';
                input.value = 'Press a key…';
            });
            this.resources.listen(input, 'keydown', (event) => {
                if (input.dataset.recording !== 'true') return;
                event.preventDefault();
                event.stopPropagation();
                if (event.key === 'Escape') {
                    input.value = this.app.settingsStore.get(path) ?? '';
                } else {
                    const clearBinding =
                        event.key === 'Backspace' ||
                        event.key === 'Delete' ||
                        event.code === 'Backspace' ||
                        event.code === 'Delete' ||
                        event.keyCode === 8 ||
                        event.keyCode === 46;
                    const value = clearBinding ? null : keybindValueFromEvent(event);
                    if (value === null && !clearBinding) return;
                    this.app.settingsStore.set(path, value, true);
                    input.value = this.app.features.get('menu')?.bindingDisplay(value) ?? value;
                }
                input.dataset.recording = 'false';
                input.blur();
            });
        };
        bindKey(locationKey, 'macros.keys.location');
        bindKey(toggleKey, 'macros.keys.toggle.chat');
        const bindBoolean = (input, path) => {
            input.checked = Boolean(this.app.settingsStore.get(path));
            this.resources.listen(input, 'change', () => {
                this.app.settingsStore.set(path, input.checked);
                this.applyChatPreferences();
            });
        };
        bindBoolean(time.input, 'chat.showTime');
        bindBoolean(names.input, 'chat.showNameColors');
        bindBoolean(chatButtons.input, 'chat.showChatButtons');
        bindBoolean(blurTag.input, 'chat.blurTag');
        bindBoolean(compact.input, 'chat.compact');
        locationText.value = this.app.settings.chat.locationText || '{pos}';
        this.resources.listen(locationText, 'input', () => {
            this.app.settingsStore.set('chat.locationText', locationText.value || '{pos}');
        });
        const normalizePickerColor = (value, fallback) =>
            /^#[0-9a-f]{6}/i.test(String(value ?? '')) ? String(value).slice(0, 7) : fallback;
        for (const [id, path, fallback] of [
            ['chatTextColorInput', 'chat.textColor', '#ffffff'],
            ['chatBackgroundInput', 'chat.bgColor', '#000000'],
            ['chatThemeColorInput', 'chat.themeColor', '#8a25e5'],
        ]) {
            const input = panel.querySelector(`#${id}`);
            if (!(input instanceof HTMLInputElement)) continue;
            input.value = normalizePickerColor(this.app.settingsStore.get(path), fallback);
            this.resources.listen(input, 'input', () => {
                this.app.settingsStore.set(path, input.value);
                this.applyColors();
            });
        }
        this.app.dependencies
            .load('colorPicker')
            .then((Alwan) => this.upgradeChatColorPickers(Alwan))
            .catch((error) => this.app.logger.warnOnce('chat-color-picker', 'Unable to load chat color pickers', error));

        this.resources.listen(settingsButton, 'click', () => {
            const menuController = this.app.features.get('menu');
            if (!menuController?.root) return;
            this.emojiPanel?.classList.add('hidden_full');
            menuController.open();
            menuController.openTab('mod_chat_settings');
        });
    }
    upgradeChatColorPickers(Alwan) {
        if (this.resources.disposed || typeof Alwan !== 'function' || !(this.settingsPanel instanceof HTMLElement)) return;
        const definitions = [
            ['chatTextColor', 'chat.textColor', true, DEFAULT_SETTINGS.chat.textColor],
            ['chatBackground', 'chat.bgColor', true, DEFAULT_SETTINGS.chat.bgColor],
            ['chatThemeChanger', 'chat.themeColor', true, DEFAULT_SETTINGS.chat.themeColor],
        ];
        for (const [id, path, opacity, fallback] of definitions) {
            const container = this.settingsPanel.querySelector(`#${id}`);
            if (!(container instanceof HTMLElement)) continue;
            const fallbackChildren = [...container.childNodes].map((node) => node.cloneNode(true));
            container.replaceChildren();
            let picker;
            try {
                picker = new Alwan(`#${id}`, {
                    id: `edit-${id}`,
                    color: this.app.settingsStore.get(path) || fallback,
                    theme: 'dark',
                    opacity,
                    format: 'hex',
                    default: fallback,
                    swatches: ['black', 'white', 'red', 'blue', 'green'],
                });
            } catch (error) {
                container.replaceChildren(...fallbackChildren);
                this.app.logger.warnOnce(`chat-color-picker-${id}`, `Unable to initialize ${id}`, error);
                continue;
            }
            const pickerElement = document.getElementById(`edit-${id}`);
            if (pickerElement instanceof HTMLElement) {
                const reset = createColorPickerReset(`Reset ${id}`);
                pickerElement.append(reset.container);
                this.resources.listen(reset.button, 'click', () => {
                    if (typeof picker.setColor === 'function') picker.setColor(fallback);
                    this.app.settingsStore.set(path, fallback);
                    this.applyColors();
                });
            }
            if (typeof picker.on === 'function') {
                picker.on('change', (event) => {
                    if (typeof event?.hex !== 'string') return;
                    this.app.settingsStore.set(path, event.hex);
                    this.applyColors();
                });
            }
            this.resources.add(() => {
                if (typeof picker.destroy === 'function') picker.destroy();
            });
        }
    }
    get emojiPanel() {
        return this.emojiPicker.panel;
    }
    get recentEmojis() {
        return this.emojiPicker.recentEmojis;
    }
    loadRecentEmojis() {
        return this.emojiPicker.loadRecentEmojis();
    }
    rememberEmoji(value) {
        return this.emojiPicker.rememberEmoji(value);
    }
    createEmojiMenu(emojiButton) {
        return this.emojiPicker.createEmojiMenu(emojiButton);
    }
    renderEmojiCategoryTabs() {
        return this.emojiPicker.renderEmojiCategoryTabs();
    }
    loadEmojis() {
        return this.emojiPicker.loadEmojis();
    }
    renderEmojis(searchTerm = '', selectedCategory = 'All') {
        return this.emojiPicker.renderEmojis(searchTerm, selectedCategory);
    }
    appendEmojiBatch() {
        return this.emojiPicker.appendEmojiBatch();
    }
    applyChatPreferences() {
        if (!(this.root instanceof HTMLElement)) return;
        const settings = this.app.settings.chat;
        const compact = Boolean(settings.compact);
        this.root.classList.toggle('mod-compact', compact);
        this.emojiPanel?.classList.toggle('mod-compact', compact);
        const emojiButton = this.root.querySelector('#openEmojiMenu');
        if (emojiButton instanceof HTMLElement) emojiButton.style.display = 'flex';
        const showButtons = settings.showChatButtons !== false;
        const header = this.root.querySelector('.modchat-chatbuttons');
        if (header instanceof HTMLElement) header.style.display = showButtons ? 'flex' : 'none';
        this.root.style.maxHeight = showButtons ? '285px' : '250px';
        this.root.style.minHeight = showButtons ? '285px' : '250px';
        const inner = this.root.querySelector('.modChat__inner');
        if (inner instanceof HTMLElement) {
            inner.style.maxHeight = showButtons ? '265px' : '230px';
            inner.style.minHeight = showButtons ? '265px' : '230px';
        }
        const blur = Boolean(settings.blurTag);
        this.root.querySelector('.tagText')?.classList.toggle('blur', blur);
        document.querySelector('#tag')?.classList.toggle('blur', blur);
        for (const time of this.root.querySelectorAll('.time')) {
            if (time instanceof HTMLElement) time.style.display = settings.showTime === false ? 'none' : '';
        }
        for (const author of this.root.querySelectorAll('.message_name')) {
            if (!(author instanceof HTMLElement)) continue;
            author.style.color = settings.showNameColors === false ? '#fafafa' : author.dataset.sigmodColor || '#fafafa';
        }
    }
    bindHost(adapter) {
        this.resources.children.get('host-chat')?.dispose();
        if (!adapter) return;
        const events = this.resources.child('host-chat');
        events.add(
            adapter.on('chat', (message) => {
                if (this.mode === 'main') this.addMessage(message);
            })
        );
    }
    setMode(mode, persist = true) {
        this.mode = mode === 'party' ? 'party' : 'main';
        if (persist) this.app.settingsStore.set('chat.showClientChat', this.mode === 'party');
        if (this.messages) this.messages.replaceChildren();
        this.unreadCount = 0;
        const mainButton = this.root?.querySelector('#mainchat');
        const partyButton = this.root?.querySelector('#partychat');
        mainButton?.classList.toggle('active', this.mode === 'main');
        partyButton?.classList.toggle('active', this.mode === 'party');
        const tag = this.root?.querySelector('.tagText');
        if (tag) tag.textContent = this.mode === 'party' && this.app.settings.settings.tag ? `Tag: ${this.app.settings.settings.tag}` : '';
        if (this.mode === 'party') {
            this.addMessage({
                name: '[SERVER]',
                color: '#5a44eb',
                message: this.app.settings.settings.tag
                    ? 'Welcome to the SigMod party chat!'
                    : 'You need to be in a tag to use the SigMod party chat.',
            });
        }
        this.updateInputAvailability();
        this.resources.timeout(() => {
            this.scrollToBottom(false);
            this.updateScrollState();
        }, 0);
    }
    updateInputAvailability() {
        if (!(this.input instanceof HTMLInputElement)) return;
        const requiresLogin = this.mode === 'main' && !this.app.state.user;
        const partyUnavailable = this.mode === 'party' && !this.app.settings.settings.tag;
        this.input.disabled = requiresLogin || partyUnavailable;
        this.input.placeholder = requiresLogin ? 'Login to use the chat' : partyUnavailable ? 'Join a tag to use party chat' : 'Message...';
        const send = this.root?.querySelector('#sendButton');
        if (send instanceof HTMLButtonElement) send.disabled = this.input.disabled;
    }
    submit() {
        const value = this.input?.value.trim();
        if (!value) return;
        this.input.value = '';
        if (this.mode === 'party') {
            if (this.app.settings.settings.tag) {
                this.app.backend.send('chat-message', { message: value });
            }
        } else {
            this.queueGameChat(value);
        }
    }
    queueGameChat(message) {
        const parts = [];
        let current = '';
        for (const word of message.split(/\s+/)) {
            if (!current || current.length + word.length + 1 <= 15) current += `${current ? ' ' : ''}${word}`;
            else {
                parts.push(current);
                current = word;
            }
        }
        if (current) parts.push(current);
        this.sendQueue = this.sendQueue.then(async () => {
            for (let index = 0; index < parts.length; index += 1) {
                if (this.resources.disposed) return;
                this.app.sendChat(parts[index]);
                if (index < parts.length - 1) await sleep(1_000);
            }
        });
    }
    renderBackendMessage(content) {
        if (!isObject(content) || this.mode !== 'party') return;
        let name = typeof content.name === 'string' ? content.name : 'Unnamed';
        if (content.admin) name = `[Owner] ${name}`;
        else if (content.mod) name = `[Mod] ${name}`;
        else if (content.vip) name = `[VIP] ${name}`;
        this.addMessage({
            name,
            message: String(content.message ?? ''),
            color: typeof content.color === 'string' ? content.color : '#fafafa',
        });
    }
    addMessage({ name = 'Unnamed', message = '', color = '#fafafa', time: timestamp = Date.now() }) {
        if (!this.messages || this.isBlocked(name, message) || this.muted.has(name)) return;
        const atBottom = this.messages.scrollHeight - this.messages.scrollTop - this.messages.clientHeight < 30;
        const row = createElement('div', { className: 'message' });
        row.dataset.name = name;
        const line = createElement('div', {
            className: 'sigmod-chat-line',
        });
        const nameWrapper = createElement('div', {
            className: 'sigmod-chat-author',
        });
        const skinNameMatch = String(name).match(/^\{(.*?)\}(.*)$/);
        const displayName = skinNameMatch ? skinNameMatch[2] : String(name);
        const author = createElement('span', {
            className: 'message_name',
            text: displayName,
        });
        const friendSettings = this.app.state.friends.settings;
        const isFriend = this.app.state.friends.names.has(name) || this.app.state.friends.names.has(displayName);
        const glowColor = isFriend ? friendSettings.highlight_color || color : color;
        author.dataset.sigmodColor = glowColor;
        author.style.color = this.app.settings.chat.showNameColors ? glowColor : '#fafafa';
        if (isFriend && friendSettings.highlight_friends) {
            author.style.textShadow = `0 1px 3px ${glowColor}`;
        }
        nameWrapper.append(author, document.createTextNode(':'));
        line.append(nameWrapper);
        const textSpan = createElement('span', {
            className: 'chatMessage-text',
        });
        textSpan.textContent = String(message);
        line.append(textSpan);
        row.append(line);
        if (this.app.settings.chat.showTime && timestamp) {
            const date = new Date(timestamp);
            const hours = date.getHours();
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');
            row.append(
                createElement('span', {
                    className: 'time',
                    text: `${formattedHours}:${minutes} ${ampm}`,
                })
            );
        }
        this.messages.append(row);
        while (this.messages.children.length > 200) this.messages.firstElementChild?.remove();
        if (atBottom) {
            this.scrollToBottom(false);
        } else {
            this.unreadCount += 1;
            this.updateScrollState();
        }
    }
    openMessageMenu(event) {
        if (event.button !== 2) return;
        const row = event.target instanceof Element ? event.target.closest('.message') : null;
        const name = row?.dataset.name;
        if (!name || name === '[SERVER]' || this.onContext) return;
        event.preventDefault();
        const contextMenu = document.createElement('div');
        contextMenu.classList.add('chat-context');
        const muteButton = createElement('button', {
            text: 'Mute',
            attributes: { type: 'button', id: 'muteButton' },
        });
        contextMenu.append(createElement('span', { text: name }), muteButton);
        contextMenu.style.left = `${event.pageX}px`;
        contextMenu.style.top = `${event.pageY - 80}px`;
        document.body.appendChild(contextMenu);
        this.onContext = contextMenu;
        muteButton.addEventListener('click', () => {
            const confirmMsg =
                name === 'Spectator'
                    ? 'Are you sure you want to mute all spectators until you refresh the page?'
                    : `Are you sure you want to mute '${name}' until you refresh the page?`;
            if (confirm(confirmMsg)) {
                this.muted.add(name);
                this.root?.querySelectorAll('.message').forEach((message) => {
                    if (message.dataset.name === name) message.remove();
                });
            }
            contextMenu.remove();
            this.onContext = null;
        });
        const closeMenu = (e) => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.remove();
                this.onContext = null;
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    isBlocked(name, message) {
        const normalizedName = name.toLowerCase();
        const normalizedMessage = message.toLowerCase();
        return (
            this.blocked.names.some((value) => normalizedName.includes(value)) ||
            this.blocked.messages.some((value) => normalizedMessage.includes(value))
        );
    }
    async loadBlockedData() {
        const controller = new AbortController();
        this.blockedRequest = controller;
        this.resources.add(() => controller.abort());
        try {
            const response = await fetch(ENDPOINTS.blockedChat, {
                signal: controller.signal,
            });
            if (!response.ok) return;
            const data = await response.json();
            if (this.resources.disposed) return;
            this.blocked.names = Array.isArray(data.names) ? data.names.map((value) => String(value).toLowerCase()) : [];
            this.blocked.messages = Array.isArray(data.messages) ? data.messages.map((value) => String(value).toLowerCase()) : [];
        } catch (error) {
            if (error?.name === 'AbortError') return;
            this.app.logger.warnOnce('blocked-chat', 'Unable to load the chat filter', error);
        } finally {
            if (this.blockedRequest === controller) this.blockedRequest = null;
        }
    }
    applyColors() {
        if (!this.root) return;
        this.root.style.setProperty('--sigmod-chat-background', this.app.settings.chat.bgColor);
        this.root.style.setProperty('--sigmod-chat-text', this.app.settings.chat.textColor);
        this.root.style.setProperty('--sigmod-chat-accent', this.app.settings.chat.themeColor);
        this.root.style.background = this.app.settings.chat.bgColor;
        for (const text of this.root.querySelectorAll('.chatMessage-text')) {
            text.style.color = this.app.settings.chat.textColor;
        }
    }
    getScrollDistance() {
        if (!this.messages) return 0;
        return Math.max(0, this.messages.scrollHeight - this.messages.scrollTop - this.messages.clientHeight);
    }
    scheduleScrollStateUpdate() {
        if (this.scrollStateFrame) return;
        this.scrollStateFrame = requestAnimationFrame(() => {
            this.scrollStateFrame = 0;
            this.updateScrollState();
        });
    }
    updateScrollState() {
        if (!this.messages || !this.root) return;
        const button = this.root.querySelector('#scroll-down-btn');
        if (!(button instanceof HTMLButtonElement)) return;
        const distance = this.getScrollDistance();
        const atBottom = distance < 36;
        if (atBottom) this.unreadCount = 0;
        button.classList.toggle('is-visible', !atBottom);
        const count = button.querySelector('.chat-new-count');
        if (count instanceof HTMLElement) {
            count.textContent =
                this.unreadCount > 0 ? `${Math.min(this.unreadCount, 99)}${this.unreadCount > 99 ? '+' : ''} new` : 'Latest';
        }
        button.setAttribute(
            'aria-label',
            this.unreadCount > 0 ? `${this.unreadCount} new messages. Jump to latest.` : 'Jump to latest messages'
        );
    }
    scrollToBottom(smooth = true) {
        if (!this.messages) return;
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (typeof this.messages.scrollTo === 'function') {
            this.messages.scrollTo({
                top: this.messages.scrollHeight,
                behavior: smooth && !reducedMotion ? 'smooth' : 'auto',
            });
        } else {
            this.messages.scrollTop = this.messages.scrollHeight;
        }
        this.unreadCount = 0;
        this.resources.timeout(() => this.updateScrollState(), smooth && !reducedMotion ? 180 : 0);
    }
    toggle() {
        if (!this.root) return;
        this.root.hidden = !this.root.hidden;
    }
    destroy() {
        this.onContext?.remove();
        this.onContext = null;
        this.root = null;
        this.messages = null;
        this.input = null;
        this.settingsPanel = null;
        this.emojis = null;
        this.emojiRequest = null;
        this.blockedRequest = null;
        if (this.scrollStateFrame) cancelAnimationFrame(this.scrollStateFrame);
        this.scrollStateFrame = 0;
        this.unreadCount = 0;
        this.muted.clear();
        this.blocked.names = [];
        this.blocked.messages = [];
        this.sendQueue = Promise.resolve();
        super.destroy();
    }
}
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Party, minimap, macros, and gameplay session                                      ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
class PartyController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.members = new Map();
        this.panel = null;
        this.panelDisposer = null;
        this.drag = null;
        this.lastScore = null;
        this.sentPositionNull = false;
        this.lastPositionKey = null;
    }
    async mount() {
        const backend = this.app.backend;
        this.resources.add(backend.on('tag-members', (members) => this.renderMembers(members)));
        this.resources.add(backend.on('join-tag', (member) => this.join(member)));
        this.resources.add(backend.on('leave-tag', ({ id } = {}) => this.leave(id)));
        this.resources.add(backend.on('score-tag', (update) => this.updateScore(update)));
        this.resources.add(
            backend.on('open', () => {
                this.publishIdentity();
                this.syncPublishTimers();
            })
        );
        this.bindIdentityInputs();
        this.syncPublishTimers();
    }
    syncPublishTimers() {
        const enabled = Boolean(this.app.settings.settings.tag);
        const current = this.resources.children.get('party-publish');
        if (!enabled) {
            current?.dispose();
            return;
        }
        if (current && !current.disposed) return;
        const scope = this.resources.child('party-publish');
        scope.interval(() => this.publishPosition(), TIMING.positionPublish);
        scope.interval(() => this.publishScore(), TIMING.scorePublish);
    }
    ensureTagInput() {
        let tagInput = document.querySelector('#tag');
        if (tagInput instanceof HTMLInputElement) return tagInput;
        const nick = document.querySelector(SELECTORS.nickname);
        if (!(nick instanceof HTMLInputElement)) return null;
        const parent = nick.parentElement;
        if (parent instanceof HTMLElement) {
            parent.style.display = 'flex';
            parent.style.gap = '5px';
        }
        tagInput = createElement('input', {
            className: 'form-control',
            attributes: { id: 'tag', placeholder: 'Tag', maxlength: '3' },
        });
        nick.insertAdjacentElement('beforebegin', tagInput);
        return tagInput;
    }
    bindIdentityInputs() {
        const tagInput = this.ensureTagInput();
        const nicknameInput = document.querySelector(SELECTORS.nickname);
        const urlTag = new URLSearchParams(location.search).get('tag')?.replace(/\/$/, '') || null;
        if (urlTag) this.app.settingsStore.set('settings.tag', urlTag, true);
        const updateTagText = (value) => {
            const tagText = document.querySelector('.tagText');
            if (tagText) tagText.textContent = value ? `Tag: ${value}` : '';
        };
        if (tagInput instanceof HTMLInputElement) {
            tagInput.value = urlTag ?? this.app.settings.settings.tag ?? '';
            updateTagText(tagInput.value);
            this.resources.listen(tagInput, 'input', (event) => {
                event.stopPropagation();
                const value = tagInput.value.trim() || null;
                this.app.settingsStore.set('settings.tag', value, true);
            });
        }
        if (nicknameInput instanceof HTMLInputElement) {
            this.app.state.nickname = nicknameInput.value.trim() || 'Guest';
            this.resources.listen(nicknameInput, 'input', () => {
                this.app.state.nickname = nicknameInput.value.trim() || 'Guest';
                this.app.backend.send('update-nick', this.app.state.nickname);
            });
        }

        this.resources.add(
            this.app.settingsStore.onChange((settings, changes) => {
                if (changes.settings?.tag !== undefined) {
                    const value = settings.settings.tag || null;
                    if (tagInput instanceof HTMLInputElement && tagInput.value !== (value || '')) {
                        tagInput.value = value || '';
                    }
                    this.app.backend.send('update-tag', value);
                    updateTagText(value);
                    const minimap = this.app.features.get('minimap');
                    if (minimap) minimap.clear();
                    this.lastScore = null;
                    this.sentPositionNull = false;
                    this.lastPositionKey = null;
                    this.syncPublishTimers();
                    this.members.clear();
                    if (value && settings.settings.showPartyPanel) {
                        this.ensurePanel();
                        this.render();
                    } else {
                        this.closePanel();
                    }
                }
                if (changes.settings?.showPartyPanel !== undefined) {
                    if (settings.settings.showPartyPanel && settings.settings.tag) {
                        this.render();
                    } else {
                        this.closePanel();
                    }
                }
                if (
                    changes.settings?.partyOpacity !== undefined ||
                    changes.settings?.partyScale !== undefined ||
                    changes.settings?.partyBgColor !== undefined ||
                    changes.settings?.partyTextColor !== undefined
                ) {
                    this.updateStyles();
                }
            })
        );

        // Initial style apply
        this.updateStyles();
    }

    updateStyles() {
        if (!this.panel) return;
        const settings = this.app.settings.settings;
        this.panel.style.opacity = settings.partyOpacity ?? 1;
        this.panel.style.transform = `scale(${settings.partyScale ?? 1})`;
        this.panel.style.transformOrigin = 'top left';
        this.panel.style.backgroundColor = settings.partyBgColor ?? '#00000080';
        this.panel.style.color = settings.partyTextColor ?? '#fafafa';
    }
    closePanel() {
        this.members.clear();
        this.drag = null;
        document.body.style.userSelect = '';
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        if (this.panelDisposer) {
            this.resources.remove(this.panelDisposer);
            this.panelDisposer = null;
        }
    }
    publishIdentity() {
        this.app.backend.send('update-nick', this.app.state.nickname);
        if (this.app.settings.settings.tag) {
            this.app.backend.send('update-tag', this.app.settings.settings.tag);
        }
    }
    publishPosition() {
        if (!this.app.settings.settings.tag) return;
        const position = this.app.host.adapter?.snapshot().position;
        if (position) {
            const key = `${position.x}:${position.y}`;
            if (key === this.lastPositionKey) return;
            this.lastPositionKey = key;
            this.sentPositionNull = false;
            this.app.backend.send('position', position);
        } else if (!this.sentPositionNull) {
            this.sentPositionNull = true;
            this.lastPositionKey = null;
            this.app.backend.send('position', { x: null, y: null });
        }
    }
    publishScore() {
        if (!this.app.settings.settings.tag) return;
        const score = Math.round(this.app.host.adapter?.snapshot().score ?? 0);
        if (score === this.lastScore) return;
        this.lastScore = score;
        this.app.backend.send('score', score);
    }
    ensurePanel() {
        if (this.panel?.isConnected) return this.panel;
        const panel = createElement('section', {
            className: 'party_panel',
        });
        const header = createElement('header', {
            className: 'flex centerY justify-sb drag-handle',
        });
        const title = createElement('strong', { text: 'Party' });
        const memberCount = createElement('span', {
            attributes: { id: 'tag_member_len' },
            text: '0',
        });
        const score = createElement('span', {
            attributes: { id: 'tag_score' },
        });
        const members = createElement('div', {
            className: 'flex f-column g-2',
            attributes: { id: 'members_container' },
        });
        const memberIcon = createElement('span', {
            className: 'centerXY g-2',
        });
        memberIcon.innerHTML = icon('users', 18);
        memberIcon.append(memberCount);
        const scoreIcon = createElement('span', {
            className: 'centerXY g-2',
        });
        scoreIcon.innerHTML = icon('user', 18);
        scoreIcon.append(score);
        const totals = createElement('span', { className: 'centerXY g-2' });
        totals.append(memberIcon, scoreIcon);
        header.append(title, totals);
        panel.append(header, members);
        panel.style.left = `${this.app.settings.settings.partyPanel.x ?? 4}px`;
        panel.style.top = `${this.app.settings.settings.partyPanel.y ?? 300}px`;
        document.body.append(panel);
        this.panel = panel;
        this.updateStyles();
        this.resources.listen(header, 'pointerdown', (event) => {
            this.drag = {
                pointerId: event.pointerId,
                offsetX: event.clientX - panel.offsetLeft,
                offsetY: event.clientY - panel.offsetTop,
            };
            header.setPointerCapture?.(event.pointerId);
            document.body.style.userSelect = 'none';
        });
        this.resources.listen(window, 'pointermove', (event) => {
            if (!this.drag || event.pointerId !== this.drag.pointerId) return;
            const x = clamp(event.clientX - this.drag.offsetX, 0, Math.max(0, innerWidth - panel.offsetWidth));
            const y = clamp(event.clientY - this.drag.offsetY, 0, Math.max(0, innerHeight - panel.offsetHeight));
            panel.style.left = `${x}px`;
            panel.style.top = `${y}px`;
            this.drag.x = x;
            this.drag.y = y;
        });
        this.resources.listen(window, 'pointerup', (event) => {
            if (!this.drag || event.pointerId !== this.drag.pointerId) return;
            const { x, y } = this.drag;
            this.drag = null;
            document.body.style.userSelect = '';
            if (Number.isFinite(x) && Number.isFinite(y)) {
                this.app.settingsStore.update((settings) => {
                    settings.settings.partyPanel.x = x;
                    settings.settings.partyPanel.y = y;
                });
            }
        });
        if (this.panelDisposer) this.resources.remove(this.panelDisposer);
        this.panelDisposer = this.resources.add(() => panel.remove());
        return panel;
    }
    renderMembers(input) {
        if (!Array.isArray(input)) return;
        this.members.clear();
        for (const member of input) {
            if (!isObject(member) || member.id === undefined) continue;
            this.members.set(String(member.id), {
                id: String(member.id),
                tagIndex: Number(member.tagIndex) || 0,
                nick: typeof member.nick === 'string' ? member.nick : 'Unnamed',
                score: Number(member.score) || 0,
            });
        }
        this.render();
    }
    join(member) {
        if (!isObject(member) || member.id === undefined) return;
        const id = String(member.id);
        if (this.members.has(id)) return;
        this.members.set(id, {
            id,
            tagIndex: Number(member.tagIndex) || 0,
            nick: typeof member.nick === 'string' ? member.nick : 'Unnamed',
            score: 0,
        });
        this.render();
    }
    leave(id) {
        if (id === undefined || !this.members.delete(String(id))) return;
        this.render();
    }
    updateScore(update) {
        if (!isObject(update) || update.id === undefined) return;
        const member = this.members.get(String(update.id));
        if (!member) return;
        member.score = Number(update.score) || 0;
        this.render();
    }
    render() {
        const panel = this.ensurePanel();
        const container = panel.querySelector('#members_container');
        const count = panel.querySelector('#tag_member_len');
        const total = panel.querySelector('#tag_score');
        if (!container || !count || !total) return;
        container.replaceChildren();
        const members = [...this.members.values()].sort((a, b) => a.tagIndex - b.tagIndex);
        for (const member of members) {
            const row = createElement('div', { className: 'flex g-2' });

            const skinMatch = String(member.nick).match(/^\{(.*?)\}(.*)$/);
            const skinName = skinMatch ? skinMatch[1].replace(/\.png$/i, '') : null;
            const displayName = skinMatch ? skinMatch[2] : member.nick;

            const nameContainer = createElement('span', { className: 'tag-member-nick centerY', attributes: { style: 'gap: 4px;' } });
            if (skinName) {
                nameContainer.append(
                    createElement('img', {
                        attributes: {
                            src: `https://sigmally.com/static/skins/${skinName}.png`,
                            style: 'width: 14px; height: 14px; border-radius: 50%; object-fit: cover;',
                            onerror: "this.style.display='none'",
                        },
                    })
                );
            }
            nameContainer.append(document.createTextNode(displayName));

            row.append(
                createElement('span', {
                    className: 'tag-member-index',
                    text: member.tagIndex,
                }),
                nameContainer,
                createElement('span', {
                    text: member.score > 0 ? this.formatScore(member.score) : '',
                })
            );
            container.append(row);
        }
        count.textContent = String(members.length);
        total.textContent = this.formatScore(members.reduce((sum, member) => sum + member.score, 0));
    }
    formatScore(score) {
        return score >= 1_000 ? `${(score / 1_000).toFixed(1)}k` : String(score);
    }
    destroy() {
        document.body.style.userSelect = '';
        this.panel = null;
        this.members.clear();
        super.destroy();
    }
}
class MinimapController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.players = new Map();
        this.canvas = null;
        this.framePending = false;
    }
    async mount() {
        const container = createElement('div', {
            className: 'minimapContainer',
        });
        const canvas = createElement('canvas', { className: 'minimap' });
        container.append(canvas);
        document.body.append(container);
        this.canvas = canvas;
        this.resources.add(() => container.remove());
        this.resources.listen(window, 'resize', () => this.resize());
        this.resources.add(this.app.backend.on('minimap-data', (data) => this.updatePlayer(data)));
        const bindHost = (adapter) => {
            this.resources.child('host-events').dispose();
            const events = this.resources.child('host-events');
            events.add(adapter.on('border', () => this.scheduleDraw()));
            events.add(adapter.on('play-state', () => this.scheduleDraw()));
        };
        this.resources.add(this.app.host.on('change', bindHost));
        if (this.app.host.adapter) bindHost(this.app.host.adapter);
        this.resize();
    }
    clear() {
        this.players.clear();
        this.scheduleDraw();
    }
    resize() {
        if (!this.canvas) return;
        const scale = Math.max(innerWidth / 1920, innerHeight / 1080);
        const cssSize = Math.max(120, 200 * scale);
        const ratio = devicePixelRatio || 1;
        this.canvas.style.width = `${cssSize}px`;
        this.canvas.style.height = `${cssSize}px`;
        this.canvas.width = Math.round(cssSize * ratio);
        this.canvas.height = Math.round(cssSize * ratio);
        this.scheduleDraw();
    }
    updatePlayer(data) {
        if (!isObject(data) || data.sid === undefined) return;
        const id = String(data.sid);
        if (data.x === null || data.y === null) {
            this.players.delete(id);
        } else {
            const x = Number(data.x);
            const y = Number(data.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) this.players.delete(id);
            else {
                this.players.set(id, {
                    x,
                    y,
                    nick: typeof data.nick === 'string' ? data.nick : 'Unnamed',
                });
            }
        }
        this.scheduleDraw();
    }
    scheduleDraw() {
        if (this.framePending) return;
        this.framePending = true;
        requestAnimationFrame(() => {
            this.framePending = false;
            this.draw();
        });
    }
    draw() {
        const canvas = this.canvas;
        const border = this.app.host.adapter?.snapshot().border;
        if (!canvas || !border) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (!isMenuClosed() || isDeadScreenVisible()) return;
        const width = border.right - border.left;
        const height = border.bottom - border.top;
        if (width <= 0 || height <= 0) return;
        const ratio = devicePixelRatio || 1;
        context.font = `${9 * ratio}px ${this.app.settings.game.font || 'Ubuntu'}`;
        context.textAlign = 'center';
        for (const [id, player] of this.players) {
            if (id === String(this.app.state.backend.sid)) continue;
            const x = ((player.x - border.left) / width) * canvas.width;
            const y = ((player.y - border.top) / height) * canvas.height;
            context.fillStyle = '#3283bd';
            context.beginPath();
            context.arc(x, y, 3 * ratio, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = '#fff';
            const yOffset = y <= 16 * ratio ? 5 * ratio : -10 * ratio;
            context.fillText(player.nick, x, y + yOffset);
        }
    }
    destroy() {
        this.players.clear();
        this.canvas = null;
        super.destroy();
    }
}
class MacroController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.rapidFeedTimer = null;
        this.rapidFeedKey = null;
        this.pointerFeeding = false;
        this.pointerFeedButton = null;
        this.pointerFeedTimer = null;
        this.pointerPosition = { x: 0, y: 0 };
        this.lock = null;
        this.lockPosition = null;
        this.lockOverlay = null;
        this.verticalMoveGeneration = 0;
        this.lastRespawnAt = performance.now();
    }
    async mount() {
        const documentRoot = document;
        this.resources.interval(() => this.syncSigFixHeldFeed(), 500);
        this.resources.listen(documentRoot, 'sigmod:settingchange', () => this.syncSigFixHeldFeed());
        this.resources.listen(documentRoot, 'keydown', (event) => this.handleKeyDown(event));
        this.resources.listen(documentRoot, 'keyup', (event) => this.handleKeyUp(event));
        this.resources.listen(
            documentRoot,
            'pointermove',
            (event) => {
                this.pointerPosition.x = event.clientX;
                this.pointerPosition.y = event.clientY;
            },
            { passive: true }
        );
        // Capture gameplay input before host canvas listeners can stop bubbling.
        this.resources.listen(documentRoot, 'mousedown', (event) => this.handleMouseDown(event), true);
        this.resources.listen(documentRoot, 'mouseup', (event) => this.handleMouseUp(event), true);
        this.resources.listen(documentRoot, 'pointercancel', () => this.stopPointerFeed());
        this.resources.listen(window, 'blur', () => this.stopFeeding());
        this.resources.listen(documentRoot, 'visibilitychange', () => {
            if (document.hidden) this.stopFeeding();
        });
        this.resources.listen(documentRoot, 'focusin', () => {
            if (isTyping()) this.stopFeeding();
        });
        this.resources.listen(documentRoot, 'auxclick', (event) => {
            if (this.isGamePointerEvent(event) && this.mouseBinding(event.button)) event.preventDefault();
        });
        this.resources.listen(documentRoot, 'contextmenu', (event) => {
            if (this.isGamePointerEvent(event)) event.preventDefault();
        });
        this.resources.interval(() => {
            if (this.app.settings.settings.autoRespawn) this.checkAutoRespawn();
        }, TIMING.autoRespawn);
        this.resources.add(
            this.app.host.on('change', (adapter) => {
                this.stopFeeding();
                if (!this.lockPosition) return;
                adapter.setMovementOverride(this.lockPosition);
            })
        );
        if (this.app.inputOwnership) {
            this.resources.add(this.app.inputOwnership.on('change', () => this.cleanupRuntimeState()));
        }
        this.resources.add(() => this.cleanupRuntimeState());
    }
    /** @returns {HostAdapter|null} */
    get adapter() {
        return this.app.host.adapter;
    }
    syncSigFixHeldFeed() {
        if (this.adapter?.kind !== 'sigfix' || this.app.inputOwnership?.owns('keys', 'rapidFeed')) return;
        const settings = this.adapter.api?.sigmod?.settings;
        if (settings && settings.rapidFeedKey !== 'w') settings.rapidFeedKey = 'w';
    }
    /** @returns {Point|null} */
    getPlayerPosition() {
        const position = this.adapter?.snapshot().position ?? this.app.state.player.position;
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
        return { x: position.x, y: position.y };
    }
    /** @param {HostAction} action */
    sendAction(action) {
        return this.adapter?.sendAction(action) ?? false;
    }
    /** @param {number} count */
    split(count = 1) {
        const total = Math.max(0, Math.trunc(Number(count) || 0));
        if (total <= 0) return;
        this.app.state.lastSplitAt = Date.now();
        for (let index = 0; index < total; index += 1) this.sendAction('split');
    }
    /** @param {number} count */
    trickSplit(count) {
        let remaining = Math.max(0, Math.trunc(count));
        const run = () => {
            if (remaining <= 0 || this.resources.disposed) return;
            remaining -= 1;
            this.split(1);
            if (remaining > 0) this.resources.timeout(run, 20);
        };
        run();
    }
    startRapidFeed(key) {
        if (this.rapidFeedTimer !== null) return;
        this.rapidFeedKey = key;
        const delay = Math.max(0, Number(this.app.settings.macros.feedSpeed) || 40);
        this.rapidFeedTimer = window.setInterval(() => {
            if (!this.canFeed()) return this.stopRapidFeed();
            this.sendAction('eject');
        }, delay);
    }
    stopRapidFeed() {
        if (this.rapidFeedTimer === null) return;
        clearInterval(this.rapidFeedTimer);
        this.rapidFeedTimer = null;
        this.rapidFeedKey = null;
    }
    stopPointerFeed() {
        if (this.pointerFeedTimer !== null) clearInterval(this.pointerFeedTimer);
        this.pointerFeedTimer = null;
        this.pointerFeeding = false;
        this.pointerFeedButton = null;
    }
    startPointerFeed(button) {
        this.stopPointerFeed();
        this.pointerFeeding = true;
        this.pointerFeedButton = button;
        this.pointerFeedTimer = window.setInterval(() => {
            if (!this.canFeed()) return this.stopPointerFeed();
            this.sendAction('eject');
        }, TIMING.mouseFeed);
    }
    canFeed() {
        return !document.hidden && !isTyping() && !isDeadScreenVisible() && isMenuClosed();
    }
    stopFeeding() {
        this.stopRapidFeed();
        this.stopPointerFeed();
    }
    /** @param {KeyboardEvent} event */
    handleKeyDown(event) {
        if (isTyping()) {
            this.stopFeeding();
            event.stopPropagation();
            return;
        }
        if (this.app.inputOwnership?.ownsKeyEvent(event)) return;
        const key = String(event.key).toLowerCase();
        const keys = this.app.settings.macros.keys;
        if (key === 'p') event.stopPropagation();
        if (key === 'tab' && !window.screenTop && !window.screenY) event.preventDefault();
        const rapidFeedBinding = this.app.settingsStore.get('macros.keys.rapidFeed');
        if (this.adapter?.kind === 'sigfix' && key === 'w') {
            this.syncSigFixHeldFeed();
            return;
        } else if (this.matches(event, this.adapter?.kind === 'sigfix' ? rapidFeedBinding : keys.rapidFeed)) {
            event.stopPropagation();
            this.startRapidFeed(rapidFeedBinding);
            return;
        }
        if (key === ' ') this.app.state.lastSplitAt = Date.now();
        if (
            this.lock === 'vertical' &&
            (key === ' ' ||
                this.matches(event, keys.splits.double) ||
                this.matches(event, keys.splits.triple) ||
                this.matches(event, keys.splits.quad))
        ) {
            this.nudgeVertical();
        }
        if (this.matches(event, keys.toggle.menu)) this.toggleMenu();
        else if (this.matches(event, keys.splits.double)) this.split(2);
        else if (this.matches(event, keys.splits.triple)) this.split(3);
        else if (this.matches(event, keys.splits.quad)) this.split(4);
        else if (this.matches(event, keys.splits.doubleTrick)) this.trickSplit(2);
        else if (this.matches(event, keys.splits.selfTrick)) this.trickSplit(4);
        else if (this.matches(event, keys.line.horizontal) && isMenuClosed()) this.toggleLock('horizontal');
        else if (this.matches(event, keys.line.vertical) && isMenuClosed()) this.toggleLock('vertical');
        else if (this.matches(event, keys.line.fixed) && isMenuClosed()) this.toggleLock('fixed');
        else if (this.matches(event, keys.location)) this.sendLocation();
        else if (this.matches(event, keys.toggle.chat)) this.toggleChat();
        else if (this.matches(event, keys.toggle.names)) this.toggleSetting('showNames');
        else if (this.matches(event, keys.toggle.skins)) this.toggleSetting('showSkins');
        else if (this.matches(event, keys.toggle.autoRespawn)) this.toggleSetting('autoRespawn');
        else if (this.matches(event, keys.respawn)) this.fastRespawn();
        else if (this.matches(event, keys.saveImage)) this.captureScreenshot();
    }
    /** @param {KeyboardEvent} event */
    handleKeyUp(event) {
        if (this.matches(event, this.rapidFeedKey)) {
            this.stopRapidFeed();
        }
    }
    /** @param {MouseEvent} event */
    handleMouseDown(event) {
        this.pointerPosition.x = event.clientX;
        this.pointerPosition.y = event.clientY;

        const smartPing = this.app.features.get('smartPing');
        if (smartPing && smartPing.wheelOpen) {
            // If wheel is open, let SmartPingController handle the click to cancel it
            return;
        }

        if (!this.isGamePointerEvent(event) || isTyping()) return;
        document.dispatchEvent(
            new CustomEvent('sigmod:mousebuttondetected', {
                detail: { button: event.button },
            })
        );
        if (this.app.inputOwnership?.owns('mouseButtons', event.button)) return;
        const action = this.mouseBinding(event.button);
        if (!action) return;
        if (event.button !== 0) event.preventDefault();
        if (action === 'fastfeed') {
            this.startPointerFeed(event.button);
        } else if (action === 'split') this.split(1);
        else if (action === 'split2') this.split(2);
        else if (action === 'split3') this.split(3);
        else if (action === 'split4') this.split(4);
        else if (action === 'freeze') this.toggleLock('horizontal');
        else if (action === 'dTrick') this.trickSplit(2);
        else if (action === 'sTrick') this.trickSplit(4);
    }
    /** @param {MouseEvent} event */
    handleMouseUp(event) {
        const smartPing = this.app.features.get('smartPing');
        if (smartPing && smartPing.wheelOpen) return;

        if (event.button !== 0 && this.isGamePointerEvent(event) && this.mouseBinding(event.button)) event.preventDefault();
        if (event.button === this.pointerFeedButton) this.stopPointerFeed();
    }
    mouseBinding(button) {
        return this.app.settings.macros.mouse.bindings.find((binding) => binding.button === button)?.action ?? null;
    }
    /** @param {Event} event */
    isGamePointerEvent(event) {
        const canvas =
            this.app.host.adapter?.kind === 'sigfix'
                ? document.querySelector('#sf-canvas')
                : (this.app.dom?.canvas ?? document.querySelector(SELECTORS.canvas));
        if (!(canvas instanceof HTMLCanvasElement)) return false;
        if (event.target === canvas) return true;
        return this.lockOverlay instanceof HTMLElement && event.target === this.lockOverlay;
    }
    /** @param {KeyboardEvent} event @param {unknown} binding */
    matches(event, binding) {
        return keybindMatchesEvent(event, binding);
    }
    /** @param {'horizontal'|'vertical'|'fixed'} kind */
    toggleLock(kind) {
        if (this.lock === kind) {
            this.releaseLock();
            return;
        }
        if (this.lock !== null) return;
        const position = this.getPlayerPosition();
        if (!position) return;
        this.adapter?.sendMove(position.x, position.y);
        this.lock = kind;
        this.lockPosition = position;
        this.adapter?.setMovementOverride(position);
        this.showLockOverlay(kind);
        const instantSplit = this.app.settings.macros.keys.line.instantSplit;
        if (Number(instantSplit) > 0) {
            this.resources.timeout(() => {
                if (this.lock === kind) this.split(instantSplit);
            }, 300);
        }
    }
    releaseLock() {
        this.verticalMoveGeneration += 1;
        this.adapter?.setMovementOverride(null);
        this.lock = null;
        this.lockPosition = null;
        this.lockOverlay?.remove();
        this.lockOverlay = null;
    }
    /** @param {'horizontal'|'vertical'|'fixed'} kind */
    showLockOverlay(kind) {
        this.lockOverlay?.remove();
        const labels = {
            horizontal: 'Movement Stopped',
            vertical: 'Vertical locked',
            fixed: 'Mouse locked',
        };
        const overlay = createElement('div', {
            className: 'sigmod-movement-lock',
        });
        const label = createElement('span', {
            className: 'sigmod-movement-lock-label',
            text: labels[kind],
        });
        overlay.append(label);
        (this.app.dom?.page ?? document.body).append(overlay);
        this.lockOverlay = overlay;
    }
    nudgeVertical() {
        if (this.lock !== 'vertical' || !this.lockPosition) return;
        const generation = ++this.verticalMoveGeneration;
        const { x, y } = this.lockPosition;
        this.adapter?.setMovementOverride(null);
        this.adapter?.sendMove(x, y - 100);
        this.adapter?.setMovementOverride(this.lockPosition);
        this.resources.timeout(() => {
            if (generation !== this.verticalMoveGeneration || this.lock !== 'vertical') return;
            this.adapter?.setMovementOverride(null);
            this.adapter?.sendMove(x, y);
            this.adapter?.setMovementOverride(this.lockPosition);
        }, 50);
    }
    sendLocation() {
        const position = this.getPlayerPosition();
        const border = this.adapter?.snapshot().border ?? this.app.state.border;
        if (!position || !border || !Number.isFinite(border.width) || border.width <= 0) return;
        const height = Number.isFinite(border.height) && border.height > 0 ? border.height : border.width;
        const column = Math.floor((position.x - border.left) / (border.width / 5));
        const row = Math.floor((position.y - border.top) / (height / 5));
        if (column < 0 || column >= 5 || row < 0 || row >= 5) return;
        const field = `${String.fromCharCode(65 + column)}${row + 1}`;
        const template = this.app.settings.chat.locationText || '{pos}';
        this.app.sendChat(template.replace('{pos}', field));
    }

    /** @param {'showNames'|'showSkins'|'autoRespawn'} setting */
    toggleSetting(setting) {
        const input = document.querySelector(`input#${setting}, input#mod-${setting}`);
        if (input instanceof HTMLInputElement) {
            input.click();
            return;
        }
        if (setting === 'autoRespawn') {
            this.app.settingsStore.set('settings.autoRespawn', !this.app.settings.settings.autoRespawn, true);
            return;
        }
        const stored = readLocalJson(STORAGE.gameSettings, {});
        const enabled = !stored[setting];
        stored[setting] = enabled;
        if (!writeLocalJson(STORAGE.gameSettings, stored)) {
            this.app.logger.warnOnce(`macro-setting-${setting}`, `Unable to toggle ${setting}`);
            return;
        }
        if (isObject(window.settings?.gameSettings)) window.settings.gameSettings[setting] = enabled;
        if (typeof window.settings?.change === 'function') window.settings.change(setting, enabled);
    }
    toggleMenu() {
        const menu = document.querySelector('.mod_menu');
        if (!(menu instanceof HTMLElement)) return;
        const hidden = getComputedStyle(menu).display === 'none';
        if (hidden) {
            menu.style.display = 'flex';
            this.resources.timeout(() => {
                menu.style.opacity = '1';
            }, 10);
        } else {
            menu.style.opacity = '0';
            this.resources.timeout(() => {
                if (menu.style.opacity === '0') menu.style.display = 'none';
            }, TIMING.uiTransition);
        }
    }
    toggleChat() {
        const chat = document.querySelector('.modChat');
        if (!(chat instanceof HTMLElement)) return;
        const hidden = getComputedStyle(chat).display === 'none';
        if (hidden) {
            chat.style.opacity = '0';
            chat.style.display = 'flex';
            this.resources.timeout(() => {
                chat.style.opacity = '1';
            }, 10);
        } else {
            chat.style.opacity = '0';
            document.querySelectorAll('.chatAddedContainer').forEach((element) => {
                element.classList.add('hidden_full');
            });
            this.resources.timeout(() => {
                if (chat.style.opacity === '0') chat.style.display = 'none';
            }, TIMING.uiTransition);
        }
    }
    fastRespawn() {
        const score = this.app.currentPlayerScore();
        if (this.adapter?.kind === 'sigfix' || score >= 5_500) return;
        this.app.sendChat('/leaveworld');
        this.resources.timeout(() => {
            this.clickRespawnControls();
            this.resources.timeout(() => this.getPlayButton()?.click(), TIMING.uiTransition);
        }, 50);
    }
    checkAutoRespawn() {
        if (!this.app.settings.settings.autoRespawn || !isDeadScreenVisible()) return;
        const now = performance.now();
        if (now - this.lastRespawnAt < 1_000) return;
        this.lastRespawnAt = now;
        this.resources.timeout(() => this.clickRespawnControls(), 20);
    }
    clickRespawnControls() {
        const continueButton = document.querySelector(SELECTORS.continueButton);
        if (continueButton instanceof HTMLElement) continueButton.click();
        this.getPlayButton()?.click();
    }
    /** @returns {HTMLElement|null} */
    getPlayButton() {
        const button = document.querySelector(SELECTORS.play);
        return button instanceof HTMLElement ? button : null;
    }
    captureScreenshot() {
        const controller = this.app.features.get('screenshots');
        const capture = controller?.saveImage ?? controller?.capture;
        if (typeof capture === 'function') {
            Promise.resolve(capture.call(controller)).catch((error) => {
                this.app.logger.warnOnce('macro-screenshot', 'Unable to capture a screenshot', error);
            });
        }
    }
    cleanupRuntimeState() {
        this.stopFeeding();
        this.releaseLock();
    }
}
class SessionController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.alive = false;
        this.matchStarted = null;
        this.overlay = null;
        this.playTimerInterval = null;
        this.lastLeaderboardEventAt = 0;
        this.lastStatsEventAt = 0;
        this.lastDomFallbackAt = 0;
        this.domTop10Start = null;
        this.domFirstStart = null;
    }
    async mount() {
        this.resources.add(this.app.host.on('change', (adapter) => this.bindHost(adapter)));
        if (this.app.host.adapter) this.bindHost(this.app.host.adapter);
        this.resources.interval(() => this.sample(), 200);
        this.resources.interval(() => this.app.backend.send('get-ping'), TIMING.backendPing);
        this.resources.interval(() => {
            const adapter = this.app.host.adapter;
            if (adapter instanceof NativeHostAdapter) adapter.sendStatsPing();
        }, TIMING.serverStatsPing);
    }
    destroy() {
        this.removeStatsOverlay();
        super.destroy();
    }
    bindHost(adapter) {
        this.resources.children.get('host-session')?.dispose();
        const events = this.resources.child('host-session');
        events.add(adapter.on('play-state', (alive) => this.setAlive(Boolean(alive))));
        events.add(
            adapter.on('owned-cell', (data) => {
                if (data?.split) this.app.features.get('matchStatistics')?.recordSplit();
            })
        );
        events.add(
            adapter.on('stats', (stats) => {
                this.lastStatsEventAt = Date.now();
                this.app.features.get('matchStatistics')?.recordStats(stats);
            })
        );
        events.add(
            adapter.on('border', (border) => {
                this.app.state.border = border;
            })
        );
        events.add(
            adapter.on('kill', () => {
                const matchStatistics = this.app.features.get('matchStatistics');
                const isSplitKill = this.app.state.lastSplitAt != null && Date.now() - this.app.state.lastSplitAt <= 2000;
                matchStatistics?.recordKill(isSplitKill);
            })
        );
        events.add(
            adapter.on('leaderboard-position', (data) => {
                this.lastLeaderboardEventAt = Date.now();
                this.app.features.get('matchStatistics')?.recordLeaderboardPosition(data);
            })
        );
        events.add(
            adapter.on('leaderboard-time', (data) => {
                this.app.features.get('matchStatistics')?.recordLeaderboardTime(data);
            })
        );
        events.add(adapter.on('password-required', () => this.createPasswordField()));
        events.add(adapter.on('close', () => this.recoverHostUi()));
    }
    sample() {
        const snapshot = this.app.host.adapter?.snapshot();
        if (!snapshot) return;
        this.app.state.player.position = snapshot.position;
        this.app.state.player.score = snapshot.score;
        if (snapshot.border) this.app.state.border = snapshot.border;
        this.setAlive(snapshot.playing);
        this.app.features.get('matchStatistics')?.recordScore?.(snapshot.score);
        if (this.app.host.adapter?.kind === 'sigfix') {
            this.hideStrayHostOverlay();
            const now = Date.now();
            if (now - this.lastDomFallbackAt >= 1_000) {
                this.lastDomFallbackAt = now;
                this.sampleSigFixDom(now);
            }
        }
    }
    setAlive(alive) {
        if (alive === this.alive) return;
        this.alive = alive;
        this.app.state.player.alive = alive;
        const matchStatistics = this.app.features.get('matchStatistics');
        if (alive) {
            this.matchStarted = Date.now();
            matchStatistics?.beginMatch();
            this.createStatsOverlay();
        } else if (this.matchStarted !== null) {
            this.flushDomLeaderboardTimes();
            matchStatistics?.endMatch();
            this.matchStarted = null;
            this.removeStatsOverlay();
            this.app.features.get('challenges')?.show();
        }
    }
    createPasswordField() {
        if (document.getElementById('password')) return;
        const gameMode = document.querySelector(SELECTORS.gameMode);
        if (!(gameMode instanceof HTMLElement)) return;
        gameMode.classList.add('gamemode-hide');
        const errorModal = document.getElementById('errormodal');
        if (errorModal instanceof HTMLElement) {
            if (typeof window.closeErrorModalAlert === 'function') window.closeErrorModalAlert();
            else errorModal.style.display = 'none';
            pressEscape();
        }
        const password = createElement('input', {
            className: 'form-control',
            attributes: {
                id: 'password',
                type: 'text',
                placeholder: 'Password',
                autocomplete: 'off',
            },
        });
        gameMode.insertAdjacentElement('beforebegin', password);
        password.focus();
    }
    hideStrayHostOverlay() {
        if (!isMenuClosed() || isDeadScreenVisible()) return;
        const overlays = document.querySelector(SELECTORS.overlays);
        if (overlays instanceof HTMLElement && overlays.style.display !== 'none') overlays.style.display = 'none';
    }
    recoverHostUi() {
        this.app.state.player.position = null;
        document.querySelector('#mod-messages')?.replaceChildren();
        this.resources.timeout(() => {
            for (const selector of [
                SELECTORS.overlays,
                SELECTORS.menuWrapper,
                '#left-menu',
                '#menu-links',
                '#right-menu',
                '#left_ad_block',
                '#ad_bottom',
            ]) {
                const element = document.querySelector(selector);
                if (element instanceof HTMLElement) element.style.removeProperty('display');
            }
            const shop = document.querySelector('#shop-popup');
            if (shop instanceof HTMLElement && !this.app.settings.settings.removeShopPopup) shop.style.removeProperty('display');
        }, 500);
    }
    getLeaderboardPositionFromDom() {
        for (const root of document.querySelectorAll('div[style*="white-space: pre"]')) {
            for (const entry of root.querySelectorAll('div[style*="display: block"]')) {
                const style = entry.getAttribute('style') || '';
                if (!style.includes('rgb(255, 170, 170)')) continue;
                const position = Number.parseInt(entry.textContent?.trim().match(/^(\d+)\./)?.[1] ?? '', 10);
                if (Number.isFinite(position)) return position;
            }
        }
        return null;
    }
    getPingFromDom() {
        for (const element of document.querySelectorAll('div[style*="font-family:"]')) {
            const ping = Number.parseInt(element.textContent?.match(/(\d+)ms\s*\(/)?.[1] ?? '', 10);
            if (Number.isFinite(ping)) return ping;
        }
        return null;
    }
    sampleSigFixDom(now) {
        const matchStatistics = this.app.features.get('matchStatistics');
        if (!matchStatistics || matchStatistics.matchStarted === null) return;
        if (now - this.lastLeaderboardEventAt >= 2_000) {
            const position = this.getLeaderboardPositionFromDom();
            if (position !== null) {
                matchStatistics.recordLeaderboardPosition({
                    position,
                    inTop10: position <= 10,
                });
                if (position <= 10 && this.domTop10Start === null) this.domTop10Start = now;
                else if (position > 10 && this.domTop10Start !== null) {
                    matchStatistics.recordLeaderboardTime({
                        top10: Math.floor((now - this.domTop10Start) / 1_000),
                    });
                    this.domTop10Start = null;
                }
                if (position === 1 && this.domFirstStart === null) this.domFirstStart = now;
                else if (position !== 1 && this.domFirstStart !== null) {
                    matchStatistics.recordLeaderboardTime({
                        first: Math.floor((now - this.domFirstStart) / 1_000),
                    });
                    this.domFirstStart = null;
                }
            }
        }
        if (now - this.lastStatsEventAt >= 2_000) {
            const latency = this.getPingFromDom();
            if (latency !== null) matchStatistics.recordStats({ latency });
        }
    }
    flushDomLeaderboardTimes() {
        const now = Date.now();
        const matchStatistics = this.app.features.get('matchStatistics');
        if (matchStatistics && this.domTop10Start !== null)
            matchStatistics.recordLeaderboardTime({
                top10: Math.floor((now - this.domTop10Start) / 1_000),
            });
        if (matchStatistics && this.domFirstStart !== null)
            matchStatistics.recordLeaderboardTime({
                first: Math.floor((now - this.domFirstStart) / 1_000),
            });
        this.domTop10Start = null;
        this.domFirstStart = null;
    }
    createStatsOverlay() {
        const settings = this.app.settings.settings;
        if (!settings.playTimer && !settings.mouseTracker) return;
        this.removeStatsOverlay();
        const existing = document.getElementById('sigmod_stats');
        if (existing instanceof HTMLElement) existing.remove();
        const stats = [...document.querySelectorAll('div[style*="white-space: pre"]')].find(
            (d) => d.innerText.includes('players') && d.innerText.includes('load')
        );
        let overlay;
        if (stats instanceof HTMLElement) {
            overlay = stats.cloneNode();
            overlay.id = 'sigmod_stats';
            overlay.textContent = '';
            stats.insertAdjacentElement('afterend', overlay);
        } else {
            overlay = createElement('div', {
                attributes: { id: 'sigmod_stats' },
            });
            overlay.style.cssText = `position:absolute;left:10px;top:80px;color:#fff;font-family:${this.app.settings.game.font || 'Ubuntu'};font-size:14px;pointer-events:none;z-index:999;`;
            document.body.append(overlay);
            if (this.app.host.adapter?.kind === 'sigfix') this.observeSigFixStatsAnchor(overlay);
        }
        this.overlay = overlay;
        if (settings.playTimer) {
            const timerEl = createElement('span', {
                attributes: { class: 'playTimer' },
            });
            timerEl.style.display = 'block';
            timerEl.textContent = '0m0s played';
            overlay.append(timerEl);
            let sec = 0;
            this.playTimerInterval = setInterval(() => {
                sec += 1;
                const m = Math.floor(sec / 60);
                const s = sec % 60;
                timerEl.textContent = `${m}m${s}s played`;
            }, 1000);
        }
        if (settings.mouseTracker) {
            const mouseEl = createElement('span', {
                attributes: { class: 'mouseTracker' },
            });
            mouseEl.style.display = 'block';
            mouseEl.textContent = `X: 0; Y: 0`;
            overlay.append(mouseEl);
        }
    }
    observeSigFixStatsAnchor(overlay) {
        const scope = this.resources.child('sigfix-stats-anchor');
        const findStats = () =>
            [...document.querySelectorAll('div[style*="white-space: pre"]')].find(
                (element) => element !== overlay && element.textContent?.includes('players') && element.textContent?.includes('load')
            );
        const anchor = () => {
            const stats = findStats();
            if (!(stats instanceof HTMLElement) || !overlay.isConnected) return false;
            overlay.style.cssText = stats.style.cssText;
            stats.insertAdjacentElement('afterend', overlay);
            scope.dispose();
            return true;
        };
        if (anchor()) return;
        scope.observe(new MutationObserver(() => anchor()), document.documentElement, { childList: true, subtree: true });
        scope.timeout(() => scope.dispose(), 3_000);
    }
    removeStatsOverlay() {
        this.resources.children.get('sigfix-stats-anchor')?.dispose();
        if (this.playTimerInterval !== null) {
            clearInterval(this.playTimerInterval);
            this.playTimerInterval = null;
        }
        if (this.overlay instanceof HTMLElement) {
            this.overlay.remove();
            this.overlay = null;
        }
        document.getElementById('sigmod_stats')?.remove();
    }
}
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Local match statistics, challenges, and screenshot gallery                        ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
class MatchStatisticsController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.matchStarted = null;
        this.pingSamples = [];
        this.playerSamples = [];
        this.data = this.createData();
    }
    createData() {
        return {
            kills: 0,
            splitKills: 0,
            timeAlive: 0,
            highestMass: 0,
            pelletsEaten: 0,
            maxTimeOnLeaderboard: 0,
            maxTimeOnLeaderboardFirst: 0,
            topPosition: null,
            splits: 0,
            averagePlayerCount: 0,
            peakPlayerCount: 0,
            partySize: 1,
            averagePing: 0,
        };
    }
    async mount() {
        this.loadTotals();
    }
    beginMatch() {
        const started = Date.now();
        this.matchStarted = started;
        this.pingSamples.length = 0;
        this.playerSamples.length = 0;
        replaceInPlace(this.data, this.createData());
    }
    recordSplit() {
        if (this.matchStarted !== null) this.data.splits += 1;
    }
    recordStats(stats) {
        if (Number.isFinite(stats?.playing)) {
            this.playerSamples.push(stats.playing);
            this.data.peakPlayerCount = Math.max(this.data.peakPlayerCount, stats.playing);
        }
        if (Number.isFinite(stats?.latency) && stats.latency >= 0) this.pingSamples.push(stats.latency);
    }
    recordScore(score) {
        if (this.matchStarted !== null) {
            this.data.highestMass = Math.max(this.data.highestMass, Math.round(score || 0));
        }
    }
    recordKill(isSplitKill = false) {
        if (this.matchStarted === null) return;
        this.data.kills += 1;
        if (isSplitKill) this.data.splitKills += 1;
    }
    recordLeaderboardPosition({ position, inTop10 }) {
        if (this.matchStarted === null) return;
        if (position && (this.data.topPosition === null || position < this.data.topPosition)) {
            this.data.topPosition = position;
        }
    }
    recordLeaderboardTime({ top10 = 0, first = 0 }) {
        if (this.matchStarted === null) return;
        if (top10) this.data.maxTimeOnLeaderboard += top10;
        if (first) this.data.maxTimeOnLeaderboardFirst += first;
    }
    endMatch() {
        if (this.matchStarted === null) return;
        this.data.timeAlive = Math.max(0, Math.floor((Date.now() - this.matchStarted) / 1_000));
        this.data.highestMass = Math.max(this.data.highestMass, Math.round(this.app.state.player.score || 0));
        this.data.pelletsEaten = Number.parseInt(document.getElementById('food_eaten')?.textContent ?? '0', 10) || 0;
        this.data.partySize = Math.max(1, this.app.features.get('party')?.members?.size ?? 1);
        this.data.averagePlayerCount = this.average(this.playerSamples);
        this.data.averagePing = this.median(this.pingSamples);
        this.updateTotals();
        this.matchStarted = null;
    }
    average(values) {
        return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    }
    median(values) {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
    loadTotals() {
        const fallback = {
            'time-played': 0,
            'highest-mass': 0,
            'total-deaths': 0,
            'total-mass': 0,
        };
        const stored = readLocalJson(STORAGE.stats, null);
        this.totals = isObject(stored) ? { ...fallback, ...stored } : fallback;
    }
    updateTotals() {
        this.totals['time-played'] += this.data.timeAlive;
        this.totals['highest-mass'] = Math.max(this.totals['highest-mass'], this.data.highestMass);
        this.totals['total-deaths'] += 1;
        this.totals['total-mass'] += Math.round(this.data.highestMass);
        if (!writeLocalJson(STORAGE.stats, this.totals)) {
            this.app.logger.warnOnce('stats-storage', 'Unable to save local statistics');
        }
        this.saveMatchHistory().catch((error) =>
            this.app.logger.warnOnce('stats-history-save', 'Unable to finish saving match history', error)
        );
    }
    async saveMatchHistory() {
        const entry = {
            at: Date.now(),
            duration: Math.max(0, Math.round(Number(this.data.timeAlive) || 0)),
            highestMass: Math.max(0, Math.round(Number(this.data.highestMass) || 0)),
            kills: Math.max(0, Math.round(Number(this.data.kills) || 0)),
            splitKills: Math.max(0, Math.round(Number(this.data.splitKills) || 0)),
            pelletsEaten: Math.max(0, Math.round(Number(this.data.pelletsEaten) || 0)),
            splits: Math.max(0, Math.round(Number(this.data.splits) || 0)),
            topPosition: Number.isFinite(this.data.topPosition) ? Math.max(1, Math.round(this.data.topPosition)) : null,
            leaderboardTime: Math.max(0, Math.round(Number(this.data.maxTimeOnLeaderboard) || 0)),
            firstPlaceTime: Math.max(0, Math.round(Number(this.data.maxTimeOnLeaderboardFirst) || 0)),
            averagePing: Math.max(0, Math.round(Number(this.data.averagePing) || 0)),
            averagePlayerCount: Math.max(0, Math.round(Number(this.data.averagePlayerCount) || 0)),
            peakPlayerCount: Math.max(0, Math.round(Number(this.data.peakPlayerCount) || 0)),
            partySize: Math.max(1, Math.round(Number(this.data.partySize) || 1)),
        };
        await this.app.matchHistory.add(entry);
        await this.app.features.get('statistics')?.refresh();
    }
}
class ChallengeController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.view = null;
        this.loading = false;
    }
    async show() {
        if (!this.app.settings.settings.showChallenges || this.loading || this.view?.isConnected) return;
        const email = this.app.state.user?.email;
        if (!email) return;
        this.loading = true;
        try {
            const response = await fetch(`https://sigmally.com/api/user/challenge/${encodeURIComponent(email)}`);
            if (!response.ok) return;
            const payload = await response.json();
            if (payload.status !== 'success' || !Array.isArray(payload.data)) return;
            this.render(payload.data);
        } catch (error) {
            this.app.logger.warnOnce('challenges', 'Unable to load daily challenges', error);
        } finally {
            this.loading = false;
        }
    }
    render(challenges) {
        const parent = document.querySelector('.menu-wrapper--stats-mode');
        if (!(parent instanceof HTMLElement)) return;
        this.resources.children.get('challenge-timer')?.dispose();
        if (this.view instanceof HTMLElement) this.view.remove();
        const view = createElement('section', {
            className: 'challenges_deathscreen',
        });
        const title = createElement('span', {
            className: 'challenges-title',
            text: 'Daily challenges',
        });
        const list = createElement('div', { className: 'challenges-col' });
        const pending = challenges.filter((challenge) => !challenge.status);
        if (!pending.length) {
            list.append(
                createElement('div', {
                    className: 'challenge-row',
                    text: 'All challenges completed.',
                })
            );
        } else {
            for (const challenge of pending) list.append(this.createRow(challenge));
        }
        const timer = createElement('span', {
            className: 'centerXY new-challenges',
            text:
                this.app.i18n?.message('New challenges in {hours}h {minutes}m {seconds}s', {
                    hours: '00',
                    minutes: '00',
                    seconds: '00',
                }) ?? 'New challenges in 0h 0m 0s',
        });
        view.append(title, list, timer);
        parent.prepend(view);
        this.view = view;
        this.updateTimer();
        const timerScope = this.resources.child('challenge-timer');
        timerScope.interval(() => {
            if (!view.isConnected || this.view !== view) {
                timerScope.dispose();
                return;
            }
            this.updateTimer();
        }, 1_000);
        timerScope.add(() => {
            if (this.view === view) this.view = null;
            view.remove();
        });
    }
    createRow(challenge) {
        const row = createElement('div', { className: 'challenge-row' });
        const goal = challenge.task === 'alive' ? Number(challenge.goal) / 60 : challenge.goal;
        const templates = window.shopLocales?.challenge_tab?.tasks ?? {};
        const template = typeof templates[challenge.task] === 'string' ? templates[challenge.task] : `${challenge.task}: %n`;
        row.append(
            createElement('div', {
                className: 'challenge-desc',
                text: template.replace('%n', String(goal)),
            })
        );
        if (challenge.ready) {
            const button = createElement('button', {
                className: 'challenge-collect-secondary',
                attributes: { type: 'button' },
                text: window.shopLocales?.challenge_tab?.collect ?? 'Collect',
            });
            this.resources.listen(button, 'click', () => {
                if (typeof button.challenge === 'function') {
                    button.challenge(challenge.task, challenge.status);
                }
                this.resources.timeout(() => row.remove(), 500);
            });
            row.append(button);
        } else {
            row.append(
                createElement('div', {
                    className: 'challenge-best-secondary',
                    text: `${window.shopLocales?.challenge_tab?.result ?? 'Best: '}${Math.round(Number(challenge.best) || 0)}${challenge.task === 'alive' ? 's' : ''}`,
                })
            );
        }
        return row;
    }
    updateTimer() {
        const output = this.view?.querySelector('.new-challenges');
        if (!output) return;
        const now = new Date();
        const next = new Date(now);
        next.setHours(24, 0, 0, 0);
        const total = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1_000));
        const hours = String(Math.floor(total / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
        const seconds = String(total % 60).padStart(2, '0');
        output.textContent =
            this.app.i18n?.message('New challenges in {hours}h {minutes}m {seconds}s', { hours, minutes, seconds }) ??
            `New challenges in ${hours}h ${minutes}m ${seconds}s`;
    }
}
class ScreenshotController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.database = null;
        this.databasePromise = null;
        this.renderLimit = 20;
        this.objectUrls = new Set();
        this.previewUrl = null;
        this.galleryContainer = null;
    }
    mount() {
        const downloadAll = document.querySelector('#gallery-download');
        const deleteAll = document.querySelector('#gallery-delete');
        if (downloadAll instanceof HTMLButtonElement) this.resources.listen(downloadAll, 'click', () => this.downloadAll());
        if (deleteAll instanceof HTMLButtonElement) this.resources.listen(deleteAll, 'click', () => this.deleteAll());
        const menu = this.app.features.get('menu');
        if (menu?.root) {
            this.resources.listen(menu.root, 'sigmod:tabchange', (event) => {
                if (event.detail?.tabId === 'mod_settings_data') void this.ensureDatabase();
            });
        }
        this.resources.add(() => {
            this.revokeObjectUrls();
            if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = null;
            this.database?.close();
            this.galleryContainer = null;
        });
    }
    async ensureDatabase() {
        if (this.database) return this.database;
        if (!this.databasePromise) {
            this.databasePromise = this.openDatabase()
                .then(async (database) => {
                    if (this.resources.disposed) {
                        database.close();
                        return null;
                    }
                    this.database = database;
                    await this.migrateLegacyEntries();
                    const gallery = document.querySelector('#image-gallery, #gallery, #gallery-container, .gallery');
                    if (gallery instanceof HTMLElement) {
                        if (this.galleryContainer !== gallery) {
                            this.resources.listen(gallery, 'click', (event) => this.handleGalleryClick(event));
                            this.galleryContainer = gallery;
                        }
                        await this.renderGallery(gallery, true);
                    }
                    return database;
                })
                .catch((error) => {
                    this.database?.close();
                    this.database = null;
                    this.databasePromise = null;
                    this.app.logger.warnOnce('gallery-database', 'The screenshot gallery is unavailable', error);
                    return null;
                });
        }
        return this.databasePromise;
    }
    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(STORAGE.galleryDatabase, 2);
            request.addEventListener('upgradeneeded', () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(STORAGE.galleryStore)) {
                    database.createObjectStore(STORAGE.galleryStore, {
                        keyPath: 'timestamp',
                    });
                }
                if (!database.objectStoreNames.contains(STORAGE.galleryMetaStore)) {
                    database.createObjectStore(STORAGE.galleryMetaStore, {
                        keyPath: 'timestamp',
                    });
                }
            });
            request.addEventListener('success', () => resolve(request.result), {
                once: true,
            });
            request.addEventListener('error', () => reject(request.error ?? new Error('Unable to open gallery')), { once: true });
            request.addEventListener('blocked', () => reject(new Error('Gallery database upgrade is blocked')), { once: true });
        });
    }
    requestStore(storeName, mode, operation) {
        return new Promise((resolve, reject) => {
            if (!this.database) {
                reject(new Error('Gallery database is not ready'));
                return;
            }
            const transaction = this.database.transaction(storeName, mode);
            let request;
            try {
                request = operation(transaction.objectStore(storeName));
            } catch (error) {
                reject(error);
                return;
            }
            if (request) {
                request.addEventListener('success', () => resolve(request.result), {
                    once: true,
                });
                request.addEventListener('error', () => reject(request.error ?? new Error('Gallery operation failed')), { once: true });
            } else {
                transaction.addEventListener('complete', () => resolve(undefined), {
                    once: true,
                });
            }
            transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Gallery transaction aborted')), {
                once: true,
            });
        });
    }
    saveRecord(image, meta) {
        return new Promise((resolve, reject) => {
            if (!this.database) {
                reject(new Error('Gallery database is not ready'));
                return;
            }
            const transaction = this.database.transaction([STORAGE.galleryStore, STORAGE.galleryMetaStore], 'readwrite');
            transaction.objectStore(STORAGE.galleryStore).put(image);
            transaction.objectStore(STORAGE.galleryMetaStore).put(meta);
            transaction.addEventListener('complete', resolve, {
                once: true,
            });
            transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Unable to save screenshot')), {
                once: true,
            });
            transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Unable to save screenshot')), {
                once: true,
            });
        });
    }
    remove(timestamp) {
        return new Promise((resolve, reject) => {
            if (!this.database) {
                reject(new Error('Gallery database is not ready'));
                return;
            }
            const transaction = this.database.transaction([STORAGE.galleryStore, STORAGE.galleryMetaStore], 'readwrite');
            transaction.objectStore(STORAGE.galleryStore).delete(timestamp);
            transaction.objectStore(STORAGE.galleryMetaStore).delete(timestamp);
            transaction.addEventListener('complete', resolve, {
                once: true,
            });
            transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Unable to delete screenshot')), {
                once: true,
            });
        });
    }
    async clear() {
        if (!this.database) throw new Error('Gallery database is not ready');
        await new Promise((resolve, reject) => {
            const transaction = this.database.transaction([STORAGE.galleryStore, STORAGE.galleryMetaStore], 'readwrite');
            transaction.objectStore(STORAGE.galleryStore).clear();
            transaction.objectStore(STORAGE.galleryMetaStore).clear();
            transaction.objectStore(STORAGE.galleryMetaStore).put({
                timestamp: '__v2_migrated__',
                migrated: true,
            });
            transaction.addEventListener('complete', resolve, {
                once: true,
            });
            transaction.addEventListener('abort', () => reject(transaction.error), {
                once: true,
            });
        });
    }
    canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Unable to encode screenshot'))), 'image/png');
        });
    }
    dataUrlToBlob(dataURL) {
        if (typeof dataURL !== 'string') return null;
        const match = dataURL.match(/^data:([^;,]+);base64,(.+)$/);
        if (!match) return null;
        try {
            const binary = atob(match[2]);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            return new Blob([bytes], { type: match[1] || 'image/png' });
        } catch {
            return null;
        }
    }
    async createThumbnail(blob, maxWidth = 320) {
        if (!(blob instanceof Blob)) return { blob: null, width: 0, height: 0 };
        let bitmap = null;
        let image = null;
        let sourceWidth = 0;
        let sourceHeight = 0;
        let objectUrl = '';
        try {
            if (typeof createImageBitmap === 'function') {
                bitmap = await createImageBitmap(blob);
                sourceWidth = bitmap.width;
                sourceHeight = bitmap.height;
                image = bitmap;
            } else {
                objectUrl = URL.createObjectURL(blob);
                image = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = objectUrl;
                });
                sourceWidth = image.naturalWidth;
                sourceHeight = image.naturalHeight;
            }
            const scale = Math.min(1, maxWidth / Math.max(1, sourceWidth));
            const width = Math.max(1, Math.round(sourceWidth * scale));
            const height = Math.max(1, Math.round(sourceHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { alpha: false });
            if (!context) throw new Error('Unable to create thumbnail canvas');
            context.drawImage(image, 0, 0, width, height);
            const thumbnail = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
            return {
                blob: thumbnail || blob,
                width: sourceWidth,
                height: sourceHeight,
            };
        } finally {
            bitmap?.close?.();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
    }
    async migrateLegacyEntries() {
        const marker = await this.requestStore(STORAGE.galleryMetaStore, 'readonly', (store) => store.get('__v2_migrated__'));
        if (marker?.migrated) return;
        const entries = await this.requestStore(STORAGE.galleryStore, 'readonly', (store) => store.getAll());
        let migrationComplete = true;
        for (const entry of Array.isArray(entries) ? entries : []) {
            if (!Number.isFinite(Number(entry?.timestamp))) continue;
            const timestamp = Number(entry.timestamp);
            const blob = entry.blob instanceof Blob ? entry.blob : this.dataUrlToBlob(entry.dataURL);
            if (!(blob instanceof Blob)) {
                migrationComplete = false;
                continue;
            }
            const thumb = await this.createThumbnail(blob).catch(() => ({
                blob,
                width: 0,
                height: 0,
            }));
            await this.saveRecord(
                { timestamp, blob },
                {
                    timestamp,
                    thumbnail: thumb.blob,
                    width: thumb.width,
                    height: thumb.height,
                    size: blob.size,
                }
            );
        }
        if (migrationComplete) {
            await this.requestStore(STORAGE.galleryMetaStore, 'readwrite', (store) =>
                store.put({
                    timestamp: '__v2_migrated__',
                    migrated: true,
                })
            );
        }
    }
    async saveImage() {
        const canvas =
            this.app.host.adapter?.kind === 'sigfix'
                ? document.querySelector('#sf-canvas')
                : (this.app.dom?.canvas ?? document.querySelector(SELECTORS.canvas));
        if (!(canvas instanceof HTMLCanvasElement)) return false;
        if (!(await this.ensureDatabase())) return false;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const blob = await this.canvasToBlob(canvas);
        const thumbnail = await this.createThumbnail(blob).catch(() => ({
            blob,
            width: canvas.width,
            height: canvas.height,
        }));
        const timestamp = Date.now();
        await this.saveRecord(
            { timestamp, blob },
            {
                timestamp,
                thumbnail: thumbnail.blob,
                width: thumbnail.width || canvas.width,
                height: thumbnail.height || canvas.height,
                size: blob.size,
            }
        );
        const gallery = document.querySelector('#image-gallery, #gallery, #gallery-container, .gallery');
        if (gallery instanceof HTMLElement) await this.renderGallery(gallery, true);
        fetch(`${ENDPOINTS.app}/screenshot`).catch((error) => {
            this.app.logger.warnOnce('screenshot-counter', 'Unable to register the screenshot', error);
        });
        return true;
    }
    getImage(timestamp) {
        return this.requestStore(STORAGE.galleryStore, 'readonly', (store) => store.get(timestamp));
    }
    async getMeta(limit) {
        const safeLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || 20)));
        return new Promise((resolve, reject) => {
            if (!this.database) {
                reject(new Error('Gallery database is not ready'));
                return;
            }
            const transaction = this.database.transaction(STORAGE.galleryMetaStore, 'readonly');
            const request = transaction.objectStore(STORAGE.galleryMetaStore).openCursor(null, 'prev');
            const entries = [];
            let more = false;
            request.addEventListener('success', () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve({ entries, more });
                    return;
                }
                const value = cursor.value;
                if (!Number.isFinite(Number(value?.timestamp))) {
                    cursor.continue();
                    return;
                }
                if (entries.length >= safeLimit) {
                    more = true;
                    resolve({ entries, more });
                    return;
                }
                entries.push(value);
                cursor.continue();
            });
            request.addEventListener('error', () => reject(request.error), {
                once: true,
            });
        });
    }
    revokeObjectUrls() {
        for (const url of this.objectUrls) URL.revokeObjectURL(url);
        this.objectUrls.clear();
    }
    objectUrl(blob) {
        if (!(blob instanceof Blob)) return '';
        const url = URL.createObjectURL(blob);
        this.objectUrls.add(url);
        return url;
    }
    async renderGallery(container, reset = false) {
        if (!(container instanceof HTMLElement)) return;
        if (reset) this.renderLimit = 20;
        const { entries, more } = await this.getMeta(this.renderLimit);
        this.revokeObjectUrls();
        container.replaceChildren();
        const downloadAll = document.querySelector('#gallery-download');
        const deleteAll = document.querySelector('#gallery-delete');
        const hasEntries = entries.length > 0;
        if (downloadAll instanceof HTMLElement) downloadAll.style.display = hasEntries ? 'block' : 'none';
        if (deleteAll instanceof HTMLElement) deleteAll.style.display = hasEntries ? 'block' : 'none';
        if (!hasEntries) {
            container.append(
                createElement('span', {
                    className: 'gallery-empty',
                    text: 'No images saved yet.',
                })
            );
            return;
        }
        for (const entry of entries) {
            const timestamp = Number(entry.timestamp);
            const card = createElement('div', {
                className: 'image-container',
                attributes: { 'data-timestamp': timestamp },
            });
            const source = this.objectUrl(entry.thumbnail);
            const image = createElement('img', {
                className: 'gallery-image',
                attributes: {
                    src: source,
                    loading: 'lazy',
                    alt: `Screenshot ${new Date(timestamp).toLocaleString()}`,
                    'data-image-id': timestamp,
                },
            });
            const meta = createElement('div', {
                className: 'gallery-card-meta',
            });
            const date = createElement('span', {
                className: 'modDescText',
                text: new Date(timestamp).toLocaleString(),
            });
            const actions = createElement('div', {
                className: 'centerXY g-5',
            });
            actions.append(
                createElement('button', {
                    className: 'download_btn operation_btn',
                    icon: 'download',
                    attributes: {
                        type: 'button',
                        'data-action': 'download',
                        'data-image-id': timestamp,
                        'aria-label': 'Download screenshot',
                    },
                }),
                createElement('button', {
                    className: 'delete_btn operation_btn',
                    icon: 'trash',
                    attributes: {
                        type: 'button',
                        'data-action': 'delete',
                        'data-image-id': timestamp,
                        'aria-label': 'Delete screenshot',
                    },
                })
            );
            meta.append(date, actions);
            card.append(image, meta);
            container.append(card);
        }
        if (more) {
            container.append(
                createElement('button', {
                    className: 'modButton-secondary gallery-load-more',
                    attributes: {
                        type: 'button',
                        'data-action': 'load-more',
                    },
                    text: 'Load more',
                })
            );
        }
    }
    async downloadAll() {
        try {
            if (!(await this.ensureDatabase())) return;
            const entries = await this.requestStore(STORAGE.galleryStore, 'readonly', (store) => store.getAll());
            if (!entries.length) return;
            const JSZip = await this.app.dependencies.load('jszip');
            if (this.resources.disposed) return;
            const archive = new JSZip();
            for (const entry of entries) {
                const blob = entry.blob instanceof Blob ? entry.blob : this.dataUrlToBlob(entry.dataURL);
                if (!(blob instanceof Blob) || !Number.isFinite(Number(entry.timestamp))) continue;
                archive.file(`sigmod-${entry.timestamp}.png`, await blob.arrayBuffer());
            }
            const blob = await archive.generateAsync({ type: 'blob' });
            const href = URL.createObjectURL(blob);
            const anchor = createElement('a', {
                attributes: {
                    href,
                    download: `sigmod-gallery-${Date.now()}.zip`,
                },
            });
            anchor.click();
            this.resources.timeout(() => URL.revokeObjectURL(href), 1_000);
        } catch (error) {
            this.app.features.get('modal')?.alert(error.message || 'Unable to download the gallery.', 'danger');
        }
    }
    async deleteAll() {
        if (!confirm('Delete all saved screenshots?')) return;
        try {
            if (!(await this.ensureDatabase())) return;
            await this.clear();
            const gallery = document.querySelector('#image-gallery, #gallery, #gallery-container, .gallery');
            if (gallery instanceof HTMLElement) await this.renderGallery(gallery, true);
        } catch (error) {
            this.app.features.get('modal')?.alert(error.message || 'Unable to clear the gallery.', 'danger');
        }
    }
    async downloadImage(timestamp) {
        if (!(await this.ensureDatabase())) return;
        const entry = await this.getImage(timestamp);
        const blob = entry?.blob instanceof Blob ? entry.blob : this.dataUrlToBlob(entry?.dataURL);
        if (!(blob instanceof Blob)) return;
        const href = URL.createObjectURL(blob);
        const anchor = createElement('a', {
            attributes: {
                href,
                download: `Sigmally ${new Date(timestamp).toISOString().replace(/[:]/g, '_')}.png`,
            },
        });
        anchor.click();
        this.resources.timeout(() => URL.revokeObjectURL(href), 1_000);
    }
    async showImage(timestamp) {
        if (!(await this.ensureDatabase())) return;
        const entry = await this.getImage(timestamp);
        const blob = entry?.blob instanceof Blob ? entry.blob : this.dataUrlToBlob(entry?.dataURL);
        if (!(blob instanceof Blob)) return;
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
        const href = URL.createObjectURL(blob);
        this.previewUrl = href;
        const body = createElement('div', {
            className: 'gallery-preview-modal',
        });
        const image = createElement('img', {
            className: 'sigmod-avatar',
            attributes: {
                src: href,
                alt: `Screenshot ${new Date(timestamp).toLocaleString()}`,
            },
        });
        const actions = createElement('div', {
            className: 'gallery-preview-actions',
        });
        const download = createElement('button', {
            className: 'modButton-primary',
            attributes: { type: 'button' },
            text: 'Download',
        });
        const close = createElement('button', {
            className: 'modButton-secondary',
            attributes: { type: 'button' },
            text: 'Close',
        });
        actions.append(close, download);
        body.append(image, actions);
        const modal = this.app.features.get('modal');
        modal?.open('gallery-preview', body, {
            className: 'modAlert gallery-preview-shell',
            zIndex: 2147483645,
        });
        const release = () => {
            URL.revokeObjectURL(href);
            if (this.previewUrl === href) this.previewUrl = null;
        };
        const scope = modal?.modals.get('gallery-preview')?.scope;
        if (scope) scope.add(release);
        else release();
        close.addEventListener(
            'click',
            () => {
                modal?.close('gallery-preview');
            },
            { once: true }
        );
        download.addEventListener('click', () => this.downloadImage(timestamp));
    }
    async handleGalleryClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const loadMore = target.closest('[data-action="load-more"]');
        if (loadMore instanceof HTMLElement) {
            this.renderLimit = Math.min(200, this.renderLimit + 20);
            const gallery = loadMore.parentElement;
            if (gallery instanceof HTMLElement) await this.renderGallery(gallery, false);
            return;
        }
        const card = target.closest('[data-timestamp]');
        if (!(card instanceof HTMLElement)) return;
        const timestamp = Number(card.dataset.timestamp);
        if (!Number.isFinite(timestamp)) return;
        const button = target.closest('[data-action]');
        if (button instanceof HTMLElement) {
            event.stopPropagation();
            if (button.dataset.action === 'delete') {
                await this.remove(timestamp);
                if (card.parentElement instanceof HTMLElement) await this.renderGallery(card.parentElement, true);
            } else if (button.dataset.action === 'download') {
                await this.downloadImage(timestamp);
            }
            return;
        }
        if (target.closest('img.gallery-image')) await this.showImage(timestamp);
    }
}
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Menu extensions and host-page enhancements                                        ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
class SavedNamesController extends FeatureController {
    async mount() {
        this.container = document.querySelector('#savedNames');
        this.input = document.querySelector('#saveNameValue');
        this.button = document.querySelector('#saveName');
        if (!(this.container instanceof HTMLElement) || !(this.input instanceof HTMLInputElement) || !(this.button instanceof HTMLElement))
            return;
        this.resources.listen(this.button, 'click', () => this.add(this.input.value));
        this.resources.listen(this.input, 'keydown', (event) => {
            if (event.key === 'Enter') this.add(this.input.value);
        });
        this.resources.listen(this.container, 'click', (event) => this.handleClick(event));
        this.render();
    }
    add(input) {
        const name = String(input).trim();
        if (!name || this.app.settings.settings.savedNames.includes(name)) return;
        this.app.settingsStore.update((settings) => settings.settings.savedNames.push(name), true);
        this.input.value = '';
        this.render();
    }
    remove(name) {
        if (!confirm(`Are you sure you want to delete the name '${name}'?`)) return;
        this.app.settingsStore.update((settings) => {
            settings.settings.savedNames = settings.settings.savedNames.filter((entry) => entry !== name);
        }, true);
        this.render();
    }
    handleClick(event) {
        const row = event.target instanceof Element ? event.target.closest('[data-saved-name]') : null;
        if (!(row instanceof HTMLElement)) return;
        const name = row.dataset.savedName;
        if (!name) return;
        const remove = event.target instanceof Element ? event.target.closest('[data-remove-name]') : null;
        if (remove) {
            event.stopPropagation();
            this.remove(name);
            return;
        }
        navigator.clipboard
            ?.writeText(name)
            .then(() => {
                const displayName = name.length > 20 ? `${name.slice(0, 20)}...` : name;
                const modal = this.app.features.get('modal');
                const dialog = modal?.alert(`Added the name ${displayName} to your clipboard!`, 'success');
                const id = dialog?.dataset?.modalId;
                if (id) this.resources.timeout(() => modal?.close(id), 2_000);
            })
            .catch((error) => {
                this.app.logger.warnOnce('saved-name-clipboard', 'Unable to copy a saved name', error);
            });
    }
    render() {
        this.container.replaceChildren();
        for (const name of this.app.settings.settings.savedNames) {
            const row = createElement('div', {
                className: 'NameDiv',
                attributes: { 'data-saved-name': name },
            });
            row.append(
                createElement('span', {
                    className: 'NameLabel',
                    text: name,
                }),
                createElement('button', {
                    className: 'delName',
                    attributes: { type: 'button', 'data-remove-name': '' },
                    text: '×',
                })
            );
            this.container.append(row);
        }
    }
}
/**
 * @typedef {Object} QuickAccessEntry
 * @property {string} token
 * @property {string} label
 * @property {string} section
 * @property {HTMLElement} source
 * @property {HTMLElement|null} panel
 */
class QuickAccessController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        /** @type {Map<string, QuickAccessEntry>} */
        this.catalog = new Map();
        this.mirrors = new Map();
        this.editing = false;
        this.refreshQueued = false;
    }

    message(source, parameters = null) {
        return this.app.i18n?.message(source, parameters) ?? source;
    }

    mount() {
        this.menu = this.app.features.get('menu');
        this.root = this.menu?.root;
        this.container = this.root?.querySelector('#mod_qaccess');
        if (!(this.container instanceof HTMLElement)) return;
        this.buildView();
        this.motion = new OverlayMotion(this.dialog, this.dialog, this.resources);
        this.resources.listen(this.container, 'click', (event) => this.handleClick(event));
        this.resources.listen(this.dialog, 'cancel', (event) => {
            event.preventDefault();
            this.setEditing(false);
        });
        this.resources.listen(this.dialog, 'keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            this.setEditing(false);
        });
        this.resources.listen(this.search, 'input', () => this.renderPicker());
        this.resources.listen(this.search, 'keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            this.setEditing(false);
        });
        this.resources.listen(this.root, 'sigmod:settingchange', () => this.syncMirrors());
        this.resources.listen(document, 'sigmod:languagechange', () => this.syncLocalizedView());
        this.resources.listen(this.root, 'sigmod:tabchange', (event) => {
            if (event.detail?.tabId !== 'mod_home' && this.editing) this.setEditing(false);
            this.refresh();
        });
        for (const type of ['input', 'change']) {
            this.resources.listen(document, type, (event) => {
                if (!this.container.contains(event.target)) this.syncMirrors();
            });
        }
        const observer = new MutationObserver((records) => {
            const changed = records.some((record) => {
                if (this.container.contains(record.target)) return false;
                if (record.attributeName === 'aria-hidden') {
                    if (record.target === this.root && this.root.getAttribute('aria-hidden') === 'true' && this.editing)
                        this.setEditing(false);
                    return false;
                }
                const relevant = (node) =>
                    node instanceof Element &&
                    (node.matches('input, select, option, optgroup, textarea, button, .mod_tab, [data-setting], [data-quick-access]') ||
                        node.querySelector('input, select, textarea, button, [data-setting], [data-quick-access]'));
                return (
                    record.type === 'attributes' ||
                    (record.target instanceof Element && record.target.matches('select, option, optgroup')) ||
                    [...record.addedNodes, ...record.removedNodes].some(relevant)
                );
            });
            if (!changed || this.refreshQueued) return;
            this.refreshQueued = true;
            queueMicrotask(() => {
                this.refreshQueued = false;
                if (!this.resources.disposed) this.refresh();
            });
        });
        this.resources.observe(observer, this.root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'data-setting', 'data-quick-access', 'aria-hidden'],
        });
        this.resources.add(() => {
            if (this.dialog.open) this.dialog.close();
            this.container.replaceChildren();
        });
        this.refresh();
    }

    syncLocalizedView() {
        if (!(this.container instanceof HTMLElement)) return;
        this.customize.textContent = this.message(this.editing ? 'Done' : 'Customize');
        this.dialog.setAttribute('aria-label', this.message('Customize Quick Access'));
        this.search.placeholder = this.message('Find settings, key bindings, tools or pages…');
        this.search.setAttribute('aria-label', this.message('Search Quick Access items'));
        this.renderFavorites();
        if (this.editing) this.renderPicker();
    }

    button(text, action, token = '') {
        return createElement('button', {
            className: 'qa-button',
            text: this.message(text),
            attributes: {
                type: 'button',
                'data-qa-action': action,
                'data-qa-token': token,
            },
        });
    }

    buildView() {
        const toolbar = (this.toolbar = createElement('div', {
            className: 'qa-toolbar',
        }));
        this.count = createElement('span', { className: 'qa-muted' });
        this.customize = this.button('Customize', 'customize');
        this.customize.setAttribute('aria-expanded', 'false');
        this.customize.setAttribute('aria-haspopup', 'dialog');
        this.customize.setAttribute('aria-controls', 'sigmod-quick-picker');
        toolbar.append(this.count, this.customize);
        this.list = createElement('div', { className: 'qa-favorites' });
        this.editor = createElement('div', {
            className: 'qa-editor',
            attributes: { id: 'sigmod-quick-picker' },
        });
        this.editor.hidden = true;
        this.dialog = createElement('dialog', {
            className: 'qa-dialog',
            attributes: {
                'aria-label': this.message('Customize Quick Access'),
            },
        });
        this.search = createElement('input', {
            className: 'qa-search',
            attributes: {
                type: 'search',
                placeholder: this.message('Find settings, key bindings, tools or pages…'),
                'aria-label': this.message('Search Quick Access items'),
                autocomplete: 'off',
            },
        });
        this.results = createElement('div', { className: 'qa-results' });
        this.resultStatus = createElement('span', {
            className: 'qa-muted',
            attributes: { role: 'status' },
        });
        this.editor.append(
            createElement('p', {
                className: 'qa-hint',
                text: this.message(
                    'Add anything you use often. Reorder your favorites above. Editors and tools open in their original tab.'
                ),
            }),
            this.search,
            this.resultStatus,
            this.results
        );
        this.container.replaceChildren(toolbar, this.list, this.editor, this.dialog);
    }

    labelFor(control) {
        if (control.id === 'instant-split-amount') return 'Instant split count';
        if (control.id === 'saveNameValue') return 'Saved name';
        const explicit = control.dataset.quickLabel || control.dataset.label || control.getAttribute('aria-label');
        if (explicit) return explicit.trim();
        const associated = control.labels?.[0]?.textContent?.trim();
        if (associated) return associated;
        const row = control.closest('.macroRow, .stats-line') || control.closest('.justify-sb, .setting-card-wrapper, label');
        const label = row?.querySelector('.setting-card-name, .text, span')?.textContent?.trim();
        if (label && label.length < 100) return label;
        const text = control instanceof HTMLButtonElement ? control.textContent?.trim() : '';
        if (text && text !== '…' && text !== '...') return text;
        return String(control.dataset.setting || control.id || 'Setting')
            .split('.')
            .at(-1)
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[-_]/g, ' ');
    }

    discover() {
        const catalog = new Map();
        const add = (entry) => {
            if (entry.token && !catalog.has(entry.token)) catalog.set(entry.token, entry);
        };
        const panels = this.menu.getTabPanels();
        for (const panel of panels) {
            if (['mod_home', 'mod_category'].includes(panel.id)) continue;
            const external = !panel.matches('[data-mod-panel]');
            const panelKey = panel.id || 'external-' + panels.filter((item) => !item.matches('[data-mod-panel]')).indexOf(panel);
            const meta = this.menu.getNavigationTabMeta?.(panel.id);
            const section =
                meta?.title ||
                panel.getAttribute('aria-label') ||
                (external ? 'Sig Fixes' : panel.id.replace(/^mod_/, '').replace(/[-_]/g, ' '));
            add({
                token: 'panel:' + panelKey,
                label: section,
                section: 'Pages',
                source: panel,
                panel,
            });
            if (external) {
                // SigFixes uses repeated IDs and private listeners; open its original rows.
                for (const source of panel.querySelectorAll('.modRowItems')) {
                    const label = source
                        .querySelector(':scope > span')
                        ?.textContent?.replace(/^\s*\(\?\)\s*/, '')
                        .trim();
                    if (label)
                        add({
                            token: 'external:' + panelKey + ':' + label,
                            label,
                            section,
                            source,
                            panel,
                        });
                }
                continue;
            }
            for (const source of panel.querySelectorAll('input, select, textarea, button[id], [data-quick-access]')) {
                if (!(source instanceof HTMLElement) || this.container.contains(source)) continue;
                if (source.closest('.qa-editor, .home-search-wrap')) continue;
                if (source.closest('[data-quick-access-exclude]')) continue;
                const input = source instanceof HTMLInputElement;
                if (input && ['password', 'hidden', 'file', 'submit', 'button', 'search'].includes(source.type)) continue;
                if (source.closest('[autocomplete="current-password"], [autocomplete="new-password"]')) continue;
                if (
                    source instanceof HTMLButtonElement &&
                    (source.type === 'submit' ||
                        source.matches('.mod_nav_btn, .closeBtn, .resetButton') ||
                        /(?:^|[-_])(close|reset|delete|remove|logout|login|signout)/i.test(source.id) ||
                        /^(delete|reset|remove|log out|sign out)\b/i.test(source.textContent.trim()))
                )
                    continue;
                const path = source.dataset.setting;
                const token = source.dataset.quickAccess || (path ? 'setting:' + path : source.id ? 'control:' + source.id : '');
                if (!token) continue;

                const hostId = {
                    'mod-showNames': 'showNames',
                    'mod-showSkins': 'showSkins',
                }[source.id];
                if (hostId) continue;
                add({
                    token,
                    label: this.labelFor(source),
                    section,
                    source,
                    panel,
                });
            }
        }
        for (const source of document.querySelectorAll('.checkbox-grid input[id], .checkbox-grid select[id]')) {
            if (!(source instanceof HTMLInputElement || source instanceof HTMLSelectElement)) continue;
            if (source instanceof HTMLInputElement && source.type !== 'checkbox') continue;
            if (source.id === 'showChat' || source.id === 'darkTheme') continue;
            const labels = {
                showNames: 'Names',
                showSkins: 'Skins',
                showMass: 'Mass',
                showFood: 'Food',
                showMinimap: 'Minimap',
                showBorder: 'Border',
                showGrid: 'Grid',
                moreZoom: 'Zoomout',
                jellyPhysics: 'Jelly Physics',
                showClanmates: 'Show clanmates',
                showLeaderboard: 'Leaderboard',
                showPosition: 'Position',
                autoRespawn: 'Auto Respawn',
                autoClaimCoins: 'Auto claim coins',
            };
            add({
                token: 'host:' + source.id,
                label: labels[source.id] || this.labelFor(source),
                section: 'Sigmally',
                source,
                panel: null,
            });
        }

        for (const [id, label] of [
            ['mapColor', 'Map color'],
            ['borderColor', 'Border color'],
            ['foodColor', 'Food color'],
            ['cellColor', 'Cell color'],
            ['font-select-container', 'Font'],
            ['nameColor', 'Name color'],
            ['gradientNameColor1', 'Name gradient left'],
            ['gradientNameColor2', 'Name gradient right'],
        ]) {
            const source = this.root.querySelector('#' + CSS.escape(id));
            if (!source) continue;
            const panel = source.closest('.mod_tab');
            const section = this.menu.getNavigationTabMeta?.(panel?.id)?.title || 'Appearance';
            const existing = [...catalog.values()].find((entry) => entry.source === source);
            if (existing) existing.label = label;
            else {
                add({
                    token: 'control:' + id,
                    label,
                    section,
                    source,
                    panel,
                });
            }
        }
        return catalog;
    }

    refresh() {
        const next = this.discover();
        const changed =
            next.size !== this.catalog.size ||
            [...next].some(([token, entry]) => {
                const previous = this.catalog.get(token);
                return !previous || previous.source !== entry.source || previous.label !== entry.label;
            });
        this.catalog = next;
        if (changed || !this.rowsScope) this.renderFavorites();
        else this.syncMirrors();
        if (this.editing) this.renderPicker();
    }

    directControl(source) {
        if (source instanceof HTMLSelectElement) return !source.multiple;
        if (source instanceof HTMLTextAreaElement) return true;
        return (
            source instanceof HTMLInputElement &&
            !source.classList.contains('keybinding') &&
            ['checkbox', 'range', 'number', 'text', 'url', 'email'].includes(source.type)
        );
    }

    renderFavorites() {
        this.rowsScope?.dispose();
        this.rowsScope = this.resources.child('quick-access-rows');
        this.mirrors.clear();
        this.list.replaceChildren();
        const tokens = this.app.settings.settings.quickAccess;
        this.count.textContent = this.message(tokens.length === 1 ? '{count} favorite' : '{count} favorites', {
            count: tokens.length,
        });
        tokens.forEach((token, index) => {
            const entry = this.catalog.get(token);
            const label = entry?.label || token.replace(/^[^:]+:/, '');
            const localizedLabel = this.message(label);
            const localizedSection = this.message(entry?.section || 'Not available');
            const row = createElement('div', {
                className: 'qa-row',
                attributes: { 'data-qa-row': token },
            });
            const identity = createElement('div', {
                className: 'qa-identity',
            });
            identity.title = entry ? localizedLabel + ' — ' + localizedSection : localizedLabel;
            identity.append(
                createElement('span', {
                    className: 'qa-label',
                    text: localizedLabel,
                }),
                createElement('span', {
                    className: entry ? 'qa-muted qa-section' : 'qa-muted',
                    text: entry ? localizedSection : this.message('Not available — kept for when this control returns'),
                })
            );
            row.append(identity);
            if (entry && this.directControl(entry.source)) {
                const source = entry.source;
                const mirror = createElement(source.localName, {
                    className: source.type === 'range' ? 'modSlider qa-control' : 'qa-control',
                    attributes: { 'aria-label': localizedLabel },
                });
                if (mirror instanceof HTMLInputElement) mirror.type = source.type;
                for (const attribute of ['min', 'max', 'step', 'maxlength', 'placeholder', 'rows', 'readonly']) {
                    if (source.hasAttribute(attribute)) mirror.setAttribute(attribute, source.getAttribute(attribute));
                }
                const output = createElement('span', {
                    className: 'qa-value',
                });
                const control = createElement('div', {
                    className: 'qa-control-wrap',
                });
                control.append(mirror);
                if (source.type === 'range') control.append(output);
                row.append(control);
                this.mirrors.set(token, {
                    mirror,
                    output,
                    source,
                    optionsMarkup: null,
                });
                const forward = (event) => {
                    // Do not clone listeners or write settings twice: reuse the real control's handler.
                    if (!source.isConnected || source.matches(':disabled')) return;
                    if (source.type === 'checkbox') {
                        if (source.checked !== mirror.checked) source.click();
                    } else {
                        source.value = mirror.value;
                        source.dispatchEvent(new Event(event.type, { bubbles: true }));
                    }
                    this.syncMirrors();
                };
                this.rowsScope.listen(mirror, 'change', forward);
                if (source.type !== 'checkbox' && !(source instanceof HTMLSelectElement)) {
                    this.rowsScope.listen(mirror, 'input', forward);
                }
            } else if (entry) {
                const keybinding = entry.source.classList.contains('keybinding') || entry.source.querySelector('.keybinding');
                const open = this.button(keybinding ? 'Edit key' : 'Open', 'open', token);
                open.setAttribute('aria-label', this.message('Open {label}', { label: localizedLabel }));
                row.append(open);
            }
            const actions = createElement('div', {
                className: 'qa-row-actions',
            });
            actions.hidden = !this.editing;
            for (const [text, action, description, disabled] of [
                ['↑', 'up', 'Move {label} up', index === 0],
                ['↓', 'down', 'Move {label} down', index === tokens.length - 1],
                ['×', 'remove', 'Remove {label}', false],
            ]) {
                const button = this.button(text, action, token);
                const localizedDescription = this.message(description, {
                    label: localizedLabel,
                });
                button.setAttribute('aria-label', localizedDescription);
                button.title = localizedDescription;
                button.disabled = disabled;
                actions.append(button);
            }
            row.append(actions);
            this.list.append(row);
        });
        if (!tokens.length)
            this.list.append(
                createElement('p', {
                    className: 'qa-hint',
                    text: this.message('Your shortcuts live here. Choose Customize to add your first favorite.'),
                })
            );
        this.syncMirrors();
    }

    syncMirrors() {
        for (const item of this.mirrors.values()) {
            const { source, mirror, output } = item;
            mirror.disabled = source.matches(':disabled') || !source.isConnected;
            if (source instanceof HTMLSelectElement && item.optionsMarkup !== source.innerHTML) {
                item.optionsMarkup = source.innerHTML;
                mirror.replaceChildren(...[...source.children].map((option) => option.cloneNode(true)));
                for (const node of mirror.querySelectorAll('[id]')) node.removeAttribute('id');
            }
            if (source.type === 'checkbox') mirror.checked = source.checked;
            else if (source.type === 'range' || source instanceof HTMLSelectElement || document.activeElement !== mirror)
                mirror.value = source.value;
            if (source.type === 'range') output.textContent = source.value;
        }
    }

    renderPicker() {
        const query = this.search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const pinned = new Set(this.app.settings.settings.quickAccess);
        const entries = [...this.catalog.values()]
            .filter((entry) => {
                const text = (entry.label + ' ' + entry.section + ' ' + entry.token).toLocaleLowerCase();
                return query.every((word) => text.includes(word));
            })
            .sort((a, b) => a.section.localeCompare(b.section) || a.label.localeCompare(b.label));
        this.results.replaceChildren();
        this.resultStatus.textContent = this.message('{count} available items', { count: entries.length });
        for (const entry of entries) {
            const button = this.button('', 'toggle', entry.token);
            button.classList.add('qa-result');
            button.setAttribute('aria-pressed', String(pinned.has(entry.token)));
            const localizedLabel = this.message(entry.label);
            const localizedSection = this.message(entry.section);
            button.setAttribute(
                'aria-label',
                this.message(pinned.has(entry.token) ? 'Remove {label} ({section})' : 'Add {label} ({section})', {
                    label: localizedLabel,
                    section: localizedSection,
                })
            );
            button.append(
                createElement('span', {
                    className: 'qa-result-label',
                    text: localizedLabel,
                }),
                createElement('span', {
                    className: 'qa-muted',
                    text: localizedSection,
                }),
                createElement('span', {
                    text: this.message(pinned.has(entry.token) ? 'Added' : '+ Add'),
                })
            );
            this.results.append(button);
        }
        if (!entries.length)
            this.results.append(
                createElement('p', {
                    className: 'qa-hint',
                    text: this.message('No matching settings or pages.'),
                })
            );
    }

    setEditing(editing, immediate = false, afterClose = () => {}) {
        if (editing === this.editing && !immediate) return;
        this.editing = editing;
        this.customize.setAttribute('aria-expanded', String(editing));
        if (editing) {
            this.dialog.inert = false;
            this.editor.hidden = false;
            this.customize.textContent = this.message('Done');
            for (const actions of this.list.querySelectorAll('.qa-row-actions')) actions.hidden = false;
            this.dialog.append(this.toolbar, this.list, this.editor);
            if (!this.dialog.open) this.dialog.showModal();
            this.refresh();
            this.motion.play(true);
            this.search.focus();
        } else {
            const finish = () => {
                if (this.dialog.open) this.dialog.close();
                this.dialog.inert = false;
                this.editor.hidden = true;
                this.customize.textContent = this.message('Customize');
                for (const actions of this.list.querySelectorAll('.qa-row-actions')) actions.hidden = true;
                this.container.prepend(this.toolbar, this.list, this.editor);
                this.customize.focus();
                afterClose();
            };
            this.dialog.inert = true;
            if (immediate) {
                this.motion.cancel();
                finish();
            } else this.motion.play(false, finish);
        }
    }

    handleClick(event) {
        const button = event.target instanceof Element ? event.target.closest('[data-qa-action]') : null;
        if (!(button instanceof HTMLButtonElement) || !this.container.contains(button)) return;
        const { qaAction: action, qaToken: token } = button.dataset;
        if (action === 'customize') {
            this.setEditing(!this.editing);
            return;
        }
        if (action === 'open') {
            this.reveal(token);
            return;
        }
        const tokens = [...this.app.settings.settings.quickAccess];
        const index = tokens.indexOf(token);
        if (action === 'toggle') {
            if (index >= 0) tokens.splice(index, 1);
            else if (this.catalog.has(token)) tokens.push(token);
        } else if (action === 'remove' && index >= 0) tokens.splice(index, 1);
        else if (['up', 'down'].includes(action) && index >= 0) {
            const next = index + (action === 'up' ? -1 : 1);
            if (next < 0 || next >= tokens.length) return;
            [tokens[index], tokens[next]] = [tokens[next], tokens[index]];
        } else return;
        this.app.settingsStore.set('settings.quickAccess', tokens, true);
        this.renderFavorites();
        if (this.editing) this.renderPicker();
        const selector =
            action === 'toggle'
                ? '[data-qa-action="toggle"][data-qa-token="' + CSS.escape(token) + '"]'
                : '[data-qa-row="' + CSS.escape(token) + '"] button:not(:disabled)';
        (this.container.querySelector(selector) || this.customize).focus();
    }

    reveal(token) {
        const entry = this.catalog.get(token);
        if (!entry?.source.isConnected || !entry.panel) return;
        if (this.editing) {
            this.setEditing(false, false, () => this.reveal(token));
            return;
        }
        if (entry.panel.matches('[data-mod-panel]')) this.menu.openTab(entry.panel.id, true, false);
        else {
            this.menu.externalTabActive = true;
            this.menu.activeCategory = null;
            this.menu.updateCategoryActiveState();
            const panels = this.menu.getTabPanels().filter((panel) => !panel.matches('[data-mod-panel]'));
            const buttons = this.root.querySelectorAll('[data-nav-external-slot] .mod_nav_btn');
            this.menu.switchTabPanel(entry.panel, buttons[panels.indexOf(entry.panel)] || null, false);
        }
        const parameters = entry.source.closest('.setting-parameters');
        if (parameters instanceof HTMLElement) parameters.style.display = 'block';
        this.resources.children.get('quick-access-reveal')?.dispose();
        const scope = this.resources.child('quick-access-reveal');
        scope.frame(() => {
            if (!entry.source.isConnected) {
                scope.dispose();
                return;
            }
            entry.source.scrollIntoView({
                block: 'center',
                behavior: 'auto',
            });
            if (entry.source instanceof HTMLButtonElement && entry.source.matches('.select-btn')) entry.source.click();
            else {
                const externalKeybind =
                    !entry.panel.matches('[data-mod-panel]') && entry.source.querySelector('.keybinding:not([data-setting])');
                const focus = entry.source.matches('input, select, textarea, button')
                    ? entry.source
                    : entry.source.querySelector('input:not([type="hidden"]), select, textarea, button');
                // Leave SigFixes unfocused so its first click starts recording without assigning Mouse 1.
                if (!externalKeybind) focus?.focus({ preventScroll: true });
            }
            scope.dispose();
        });
    }
}

class MainMenuController extends FeatureController {
    async mount() {
        const grid = await this.app.readiness.waitFor(SELECTORS.settingsGrid, 5_000).catch(() => null);
        if (grid instanceof HTMLElement) this.mountHostSettings(grid);
        this.smallMods();
        this.mountClientPing();
        this.replaceDiscordLink();
        const nickname = document.querySelector(SELECTORS.nickname);
        if (nickname instanceof HTMLInputElement) {
            const originalType = nickname.getAttribute('type');
            const originalMaxLength = nickname.getAttribute('maxlength');
            nickname.maxLength = 50;
            nickname.type = 'text';
            this.resources.add(() => {
                if (originalType === null) nickname.removeAttribute('type');
                else nickname.setAttribute('type', originalType);
                if (originalMaxLength === null) nickname.removeAttribute('maxlength');
                else nickname.setAttribute('maxlength', originalMaxLength);
            });
        }
        const gameMode = document.querySelector(SELECTORS.gameMode);
        if (gameMode instanceof HTMLSelectElement) {
            this.resources.listen(gameMode, 'change', () => {
                this.app.backend.send('server-changed', getGameMode());
                document.querySelector('#mod-messages')?.replaceChildren();
            });
        }
        const signOut = document.querySelector('#signOutBtn');
        if (signOut instanceof HTMLElement) {
            this.resources.listen(signOut, 'click', () => {
                this.app.state.user = null;
                if (isObject(window.gameSettings)) window.gameSettings.user = null;
            });
        }
        const shopPopup = document.querySelector('#shop-popup');
        if (this.app.settings.settings.removeShopPopup && shopPopup instanceof HTMLElement) {
            const display = shopPopup.style.display;
            shopPopup.style.display = 'none';
            this.resources.add(() => {
                shopPopup.style.display = display;
            });
        }
    }
    replaceDiscordLink() {
        const menu = document.querySelector(SELECTORS.menuContent);
        if (!(menu instanceof HTMLElement)) return;

        const original = menu.querySelector('#discord_link');
        if (!(original instanceof HTMLElement)) return;
        original.setAttribute('href', 'https://discord.gg/QyUhvUC8AD');

        this.app.features.get('themes')?.applyVisibility();
    }
    smallMods() {
        this.fixTitle();
        this.styleTopUsers();
        this.trackMouse();
        this.redirectOwnedSkins();
        this.applyChallengeGrammar();
        this.handlePasswordUrl();
    }
    mountClientPing() {
        const menu = document.querySelector('.mod_menu');
        if (!(menu instanceof HTMLElement) || menu.querySelector('#clientPing')) return;
        const ping = createElement('span', {
            attributes: { id: 'clientPing' },
            text:
                this.app.i18n?.message('Client Ping: {ping}ms', {
                    ping: 0,
                }) ?? 'Client Ping: 0ms',
        });
        menu.append(ping);
        this.resources.add(() => ping.remove());
        this.resources.add(
            this.app.backend.on('ping', () => {
                const latency = this.app.state.backend.latency;
                if (Number.isFinite(latency))
                    ping.textContent =
                        this.app.i18n?.message('Client Ping: {ping}ms', {
                            ping: Math.round(latency),
                        }) ?? `Client Ping: ${Math.round(latency)}ms`;
            })
        );
    }
    fixTitle() {
        const gameTitle = document.querySelector('#title');
        if (!(gameTitle instanceof HTMLElement)) return;
        const newTitle = createElement('div', {
            className: 'sigmod-title',
        });
        newTitle.append(
            createElement('h1', {
                attributes: { id: 'title' },
                text: 'Sigmally',
            }),
            createElement('span', {
                attributes: { id: 'bycursed' },
                text: 'SigMod by ',
            })
        );
        const authorLink = createElement('a', {
            attributes: {
                href: 'https://www.youtube.com/@sigmallyCursed/',
                target: '_blank',
                rel: 'noopener noreferrer',
            },
            text: 'Cursed',
        });
        newTitle.querySelector('#bycursed')?.append(authorLink);
        this.resources.add(() => {
            if (newTitle.isConnected) newTitle.replaceWith(gameTitle);
        });
        gameTitle.replaceWith(newTitle);
    }
    styleTopUsers() {
        const topUsersInner = document.querySelector('.top-users__inner');
        if (!(topUsersInner instanceof HTMLElement)) return;
        topUsersInner.classList.add('scroll');
        topUsersInner.style.border = 'none';
        this.resources.add(() => {
            topUsersInner.classList.remove('scroll');
            topUsersInner.style.border = '';
        });
    }
    trackMouse() {
        let trackerScope = null;
        let trackerElement = null;
        let mouseFrame = 0;
        let pendingPosition = null;
        const stop = () => {
            trackerScope?.dispose();
            trackerScope = null;
            trackerElement = null;
            pendingPosition = null;
            if (mouseFrame) cancelAnimationFrame(mouseFrame);
            mouseFrame = 0;
        };
        const sync = () => {
            const enabled = Boolean(this.app.settings.settings.mouseTracker);
            if (!enabled) {
                stop();
                return;
            }
            const playing = Boolean(this.app.host.adapter?.snapshot?.().playing);
            const nextElement = playing ? document.querySelector('.mouseTracker') : null;
            if (!(nextElement instanceof HTMLElement)) {
                stop();
                return;
            }
            if (trackerScope && trackerElement === nextElement) return;
            stop();
            trackerElement = nextElement;
            trackerScope = this.resources.child(`mouse-tracker-${Date.now()}`);
            trackerScope.listen(
                document,
                'mousemove',
                (event) => {
                    if (!trackerElement?.isConnected) return;
                    pendingPosition = {
                        x: Math.round(event.clientX + window.scrollX),
                        y: Math.round(event.clientY + window.scrollY),
                    };
                    if (mouseFrame) return;
                    mouseFrame = requestAnimationFrame(() => {
                        mouseFrame = 0;
                        if (!trackerElement?.isConnected || !pendingPosition) return;
                        trackerElement.textContent = `X: ${pendingPosition.x}; Y: ${pendingPosition.y}`;
                        pendingPosition = null;
                    });
                },
                { passive: true }
            );
        };
        sync();
        this.resources.interval(sync, 250);
        this.resources.add(stop);
    }
    redirectOwnedSkins() {
        const original = Element.prototype.openTab;
        const self = this;
        Element.prototype.openTab = function (tab) {
            if (tab === 'skins') {
                self.resources.timeout(() => {
                    Element.prototype.changeTab('owned');
                }, 100);
            }
            return original.apply(this, arguments);
        };
        this.resources.add(() => {
            Element.prototype.openTab = original;
        });
    }
    applyChallengeGrammar() {
        this.resources.timeout(() => {
            if (isObject(window.shopLocales?.challenge_tab?.tasks)) {
                Object.assign(window.shopLocales.challenge_tab.tasks, {
                    eaten: 'Eat %n food in a game.',
                    xp: 'Get %n XP in a game.',
                    alive: 'Stay alive for %n minutes in a game.',
                    pos: 'Reach top %n on leaderboard.',
                });
            }
        }, 1000);
    }
    handlePasswordUrl() {
        if (!location.search.includes('password')) return;
        const passwordField = document.querySelector('#password');
        if (!(passwordField instanceof HTMLInputElement)) return;
        passwordField.style.display = 'none';
        const password = new URLSearchParams(location.search).get('password')?.split('/')[0] || '';
        passwordField.value = password;
        const play = document.querySelector(SELECTORS.play);
        if (!(play instanceof HTMLButtonElement) || window.sigfix) return;
        this.resources.listen(play, 'click', () => {
            const waitForConnection = () =>
                new Promise((resolve) => {
                    const host = this.app.host;
                    if (host?.adapter?.connected) return resolve();
                    const interval = setInterval(() => {
                        if (host?.adapter?.connected) {
                            clearInterval(interval);
                            resolve();
                        }
                    }, 50);
                    this.resources.timeout(() => {
                        clearInterval(interval);
                        resolve();
                    }, 5000);
                });
            waitForConnection()
                .then(() => {
                    return new Promise((resolve) => {
                        this.resources.timeout(resolve, 500);
                    });
                })
                .then(() => {
                    const gameSettings = readLocalJson(STORAGE.gameSettings, {});
                    const user = isObject(window.gameSettings?.user) ? window.gameSettings.user : {};
                    const payload = {
                        name: gameSettings.nick || document.querySelector(SELECTORS.nickname)?.value || '',
                        skin: gameSettings.skin || '',
                        token: user.token || '',
                        clan: user.clan || '',
                        sub: user.subscription > 0,
                        showClanmates: true,
                        password: password || '',
                    };
                    this.app.host.adapter?.sendPlay?.(payload);
                    const errormodal = document.querySelector('#errormodal');
                    if (!(errormodal instanceof HTMLElement)) return;
                    const interval = setInterval(() => {
                        if (errormodal.style.display !== 'none') errormodal.style.display = 'none';
                    }, 100);
                    this.resources.timeout(() => clearInterval(interval), 1000);
                });
        });
    }
    mountHostSettings(grid) {
        const entries = [
            ['showNames', 'Names', true],
            ['showSkins', 'Skins', true],
            ['showMass', 'Mass', false],
            ['showFood', 'Food', true],
            ['showLeaderboard', 'Leaderboard', true],
            ['autoRespawn', 'Auto Respawn', this.app.settings.settings.autoRespawn],
            ['autoClaimCoins', 'Auto claim coins', this.app.settings.settings.autoClaimCoins],
            ['showPosition', 'Position', false],
        ];
        const hostSettings = readLocalJson(STORAGE.gameSettings, {});
        for (const [id, labelText, fallback] of entries) {
            let input = document.getElementById(id);
            if (!(input instanceof HTMLInputElement)) {
                input = createElement('input', {
                    attributes: { id, type: 'checkbox' },
                });
                const label = createElement('label', {
                    text: labelText,
                    attributes: { for: id },
                });
                grid.append(input, label);
                this.resources.add(() => {
                    input.remove();
                    label.remove();
                });
            }
            if (id === 'showFood' || id === 'showLeaderboard') {
                input.checked = this.app.settings.game[id];
                this.resources.listen(input, 'change', () => {
                    this.app.settingsStore.set(`game.${id}`, input.checked, true);
                });
                this.resources.listen(document, 'sigmod:settingchange', () => {
                    input.checked = this.app.settings.game[id];
                });
            } else if (id === 'autoRespawn' || id === 'autoClaimCoins') {
                input.checked = Boolean(this.app.settings.settings[id]);
                this.resources.listen(input, 'change', () => {
                    this.app.settingsStore.set(`settings.${id}`, input.checked, true);
                });
            } else {
                input.checked = typeof hostSettings[id] === 'boolean' ? hostSettings[id] : fallback;
                this.resources.listen(input, 'change', () => {
                    const settings = readLocalJson(STORAGE.gameSettings, {});
                    settings[id] = input.checked;
                    if (!writeLocalJson(STORAGE.gameSettings, settings)) {
                        this.app.logger.warnOnce(`host-setting-${id}`, `Unable to save ${id}`);
                    }
                });
            }
        }
    }
}
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ~ Smart Ping System                                                                 ~
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
class SmartPingController extends FeatureController {
    constructor(app, name) {
        super(app, name);
        this.activePings = new Map();
        this.wheelOpen = false;
        this.wheelElement = null;
        this.wheelSlices = [];
        this.pointerPosition = { x: 0, y: 0 };
        this.wheelCenter = { x: 0, y: 0 };

        this.pingTypes = [
            { id: 'default', name: 'Ping', icon: 'mapPin', color: '#f1c40f' },
            { id: 'danger', name: 'Danger', icon: 'warning', color: '#ff3b3b' },
            { id: 'attack', name: 'Attack', icon: 'sword', color: '#ffa500' },
            { id: 'virus', name: 'Shoot Virus', icon: 'crosshair', color: '#4CAF50' },
            { id: 'defend', name: 'Defend', icon: 'shield', color: '#2196F3' },
        ];
        this.hoveredPing = null;
        this.frameId = null;
    }

    async mount() {
        const documentRoot = document;

        this.resources.listen(
            documentRoot,
            'pointermove',
            (event) => {
                this.pointerPosition.x = event.clientX;
                this.pointerPosition.y = event.clientY;
                if (this.wheelOpen) this.updateWheelHover();
            },
            { passive: true }
        );

        this.resources.listen(documentRoot, 'mousedown', (event) => this.handleMouseDown(event));
        this.resources.listen(documentRoot, 'mouseup', (event) => this.handleMouseUp(event));
        this.resources.listen(documentRoot, 'keydown', (event) => this.handleKeyDown(event));
        this.resources.listen(documentRoot, 'keyup', (event) => this.handleKeyUp(event));
        this.resources.listen(documentRoot, 'contextmenu', (event) => {
            if (this.wheelOpen || Date.now() - (this.lastCancelTime || 0) < 100) {
                event.preventDefault();
                event.stopPropagation();
            }
        });

        // Listen to backend pings
        this.resources.add(this.app.backend.on('tag-ping', (data) => this.receivePing(data)));

        // Loop for drawing in-world pings
        const loop = () => {
            this.drawPings();
            this.frameId = requestAnimationFrame(loop);
        };
        this.frameId = requestAnimationFrame(loop);
        this.resources.add(() => cancelAnimationFrame(this.frameId));
    }

    isPingInput(event) {
        if (isTyping() || !this.app.settings.settings.tag || !this.app.state.backend.connected) return false;
        const macros = this.app.features.get('macros');
        if (event instanceof KeyboardEvent && macros) {
            if (event.ctrlKey || event.metaKey) return false;
            return macros.matches(event, this.app.settings.macros.keys.ping);
        } else if (event instanceof MouseEvent && macros) {
            const action = macros.mouseBinding(event.button);
            return action === 'ping';
        }
        return false;
    }

    handleKeyDown(event) {
        if (event.repeat) return; // Prevent browser auto-repeat from immediately reopening cancelled wheel

        if (this.isPingInput(event) && !this.wheelOpen) {
            event.preventDefault();
            this.openWheel();
            this.wheelCancelled = false;
        }
    }

    handleKeyUp(event) {
        if (this.isPingInput(event) && this.wheelOpen) {
            event.preventDefault();
            this.closeWheel();
            if (!this.wheelCancelled) {
                this.sendPing(this.hoveredPing || 'default');
            }
        }
    }

    handleMouseDown(event) {
        if (this.wheelOpen && (event.button === 0 || event.button === 2)) {
            event.preventDefault();
            event.stopPropagation();
            this.closeWheel();
            this.wheelCancelled = true;
            this.lastCancelTime = Date.now();
            return;
        }
        if (this.isPingInput(event) && !this.wheelOpen) {
            event.preventDefault();
            this.openWheel();
            this.wheelCancelled = false;
        }
    }

    handleMouseUp(event) {
        if (this.isPingInput(event) && this.wheelOpen) {
            event.preventDefault();
            this.closeWheel();
            if (!this.wheelCancelled) {
                this.sendPing(this.hoveredPing || 'default');
            }
        }
    }

    openWheel() {
        this.wheelOpen = true;
        this.wheelCancelled = false;
        this.wheelCenter = { x: this.pointerPosition.x, y: this.pointerPosition.y };

        const cam = this.getCamera();
        if (cam && cam.scale) {
            this.wheelWorldPos = {
                x: (this.wheelCenter.x - window.innerWidth / 2) / cam.scale + cam.x,
                y: (this.wheelCenter.y - window.innerHeight / 2) / cam.scale + cam.y,
            };
        } else {
            this.wheelWorldPos = null;
        }

        if (this.wheelElement) this.wheelElement.remove();

        this.wheelElement = createElement('div', {
            className: 'ping-wheel-container',
        });
        this.wheelElement.style.left = `${this.wheelCenter.x}px`;
        this.wheelElement.style.top = `${this.wheelCenter.y}px`;

        this.wheelSlices = [];

        this.pingTypes.forEach((type, i) => {
            const isCenter = i === 0;
            // Subtract 1 from i for the outer slices to keep Top, Right, Bottom, Left
            const angle = (i - 1) * 90 - 90;

            const slice = createElement('div', {
                className: 'ping-wheel-slice' + (isCenter ? ' center-slice' : ''),
                attributes: { 'data-id': type.id },
            });

            const rad = (angle * Math.PI) / 180;
            const dist = isCenter ? 0 : 60;

            slice.style.setProperty('--tx', `${Math.cos(rad) * dist}px`);
            slice.style.setProperty('--ty', `${Math.sin(rad) * dist}px`);
            slice.style.setProperty('--ping-color', type.color || '#fff');
            slice.style.transform = `translate(var(--tx), var(--ty))`;

            const iconEl = createElement('div', {
                className: 'ping-wheel-icon',
                icon: type.icon,
            });
            iconEl.style.color = type.color;

            const translatedName = this.app.i18n?.message(type.name) ?? type.name;
            const label = createElement('span', { text: translatedName });

            slice.append(iconEl, label);
            this.wheelElement.append(slice);
            this.wheelSlices.push({ element: slice, id: type.id, angle: angle });
        });

        // Add center default ping
        const centerSlice = createElement('div', {
            className: 'ping-wheel-slice',
            attributes: { 'data-id': 'default' },
        });
        centerSlice.style.transform = `translate(0px, 0px)`;

        const centerIconEl = createElement('div', {
            className: 'ping-wheel-icon',
            icon: 'mapPin',
        });
        centerIconEl.style.color = '#ffeb3b';

        const centerLabel = createElement('span', { text: 'Ping' });

        centerSlice.append(centerIconEl, centerLabel);
        this.wheelElement.append(centerSlice);
        this.wheelSlices.push({ element: centerSlice, id: 'default', angle: 0 });

        document.body.append(this.wheelElement);
        this.updateWheelHover();
    }

    closeWheel() {
        this.wheelOpen = false;
        if (this.wheelElement) {
            this.wheelElement.remove();
            this.wheelElement = null;
        }
    }

    updateWheelHover() {
        if (!this.wheelElement) return;
        const dx = this.pointerPosition.x - this.wheelCenter.x;
        const dy = this.pointerPosition.y - this.wheelCenter.y;
        const dist = Math.hypot(dx, dy);

        this.wheelSlices.forEach((s) => s.element.classList.remove('active'));
        this.hoveredPing = null;

        if (dist > 25) {
            let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (angle < -45 && angle >= -135) this.hoveredPing = 'danger';
            else if (angle >= -45 && angle < 45) this.hoveredPing = 'attack';
            else if (angle >= 45 && angle < 135) this.hoveredPing = 'virus';
            else this.hoveredPing = 'defend';
        } else {
            this.hoveredPing = 'default';
        }

        const activeSlice = this.wheelSlices.find((s) => s.id === this.hoveredPing);
        if (activeSlice) activeSlice.element.classList.add('active');
    }

    getCamera() {
        if (window.sigfix && window.sigfix.world) {
            const vision = window.sigfix.world.views?.get(window.sigfix.world.selected);
            if (vision && vision.camera) {
                return {
                    x: vision.camera.x,
                    y: vision.camera.y,
                    scale: (window.innerHeight / 1080) * vision.camera.scale,
                };
            }
        }
        if (this.app.state.camera && this.app.state.camera.scale > 0) {
            const { scale, x, y, offsetX, offsetY, cw, ch } = this.app.state.camera;
            const canvasW = cw > 0 ? cw : window.innerWidth;
            const canvasH = ch > 0 ? ch : window.innerHeight;
            return {
                x: x !== undefined ? x : (canvasW / 2 - offsetX) / scale,
                y: y !== undefined ? y : (canvasH / 2 - offsetY) / scale,
                scale: scale * (window.innerWidth / canvasW),
            };
        }
        const position = this.app.host.adapter?.snapshot().position;
        if (position) {
            return {
                x: position.x,
                y: position.y,
                scale: (window.innerHeight / 1080) * 0.25, // Default scale fallback
            };
        }
        return null;
    }

    sendPing(type) {
        let worldX, worldY;
        if (this.wheelWorldPos) {
            worldX = this.wheelWorldPos.x;
            worldY = this.wheelWorldPos.y;
        } else {
            const cam = this.getCamera();
            if (!cam || !cam.scale) return;

            worldX = (this.wheelCenter.x - window.innerWidth / 2) / cam.scale + cam.x;
            worldY = (this.wheelCenter.y - window.innerHeight / 2) / cam.scale + cam.y;
        }

        this.app.backend.send('tag-ping', { x: worldX, y: worldY, t: type });
    }

    receivePing(data) {
        if (!isObject(data)) return;
        const { x, y, t, i } = data;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        const id = `ping-${i}-${Date.now()}`;
        const typeConfig = this.pingTypes.find((p) => p.id === t) || { id: 'default', icon: 'mapPin', color: '#ffeb3b' };

        const element = createElement('div', {
            className: 'world-ping-marker',
            attributes: { id },
        });

        const animatorEl = createElement('div', {
            className: 'world-ping-animator',
        });
        animatorEl.style.color = typeConfig.color;

        const iconEl = createElement('div', {
            className: 'world-ping-icon',
            icon: typeConfig.icon,
        });

        animatorEl.append(iconEl);

        if (i !== undefined) {
            const badgeEl = createElement('div', {
                className: 'world-ping-badge',
                text: i,
            });
            badgeEl.style.backgroundColor = typeConfig.color;
            animatorEl.append(badgeEl);
        }

        element.append(animatorEl);
        document.body.append(element);

        this.activePings.set(id, {
            x,
            y,
            type: typeConfig,
            element,
            createdAt: Date.now(),
        });

        const duration = this.app.settings.settings.pingDuration ?? 2000;

        setTimeout(() => {
            element.remove();
            this.activePings.delete(id);
        }, duration);
    }

    drawPings() {
        if (this.activePings.size === 0) return;
        const cam = this.getCamera();
        if (!cam || !cam.scale) {
            this.activePings.forEach((p) => (p.element.style.display = 'none'));
            return;
        }

        const scale = cam.scale;
        const hw = window.innerWidth / 2;
        const hh = window.innerHeight / 2;

        this.activePings.forEach((ping) => {
            ping.element.style.display = 'flex';
            let sx = (ping.x - cam.x) * scale + hw;
            let sy = (ping.y - cam.y) * scale + hh;

            const margin = 30;
            let isOffscreen = false;

            if (sx < margin || sx > window.innerWidth - margin || sy < margin || sy > window.innerHeight - margin) {
                isOffscreen = true;
                sx = Math.max(margin, Math.min(sx, window.innerWidth - margin));
                sy = Math.max(margin, Math.min(sy, window.innerHeight - margin));
            }

            ping.element.style.transition = 'none';
            ping.element.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;

            if (isOffscreen) {
                ping.element.classList.add('is-offscreen');
                const angle = (Math.atan2((ping.y - cam.y) * scale, (ping.x - cam.x) * scale) * 180) / Math.PI;
                ping.element.style.setProperty('--arrow-angle', `${angle}deg`);
            } else {
                ping.element.classList.remove('is-offscreen');
                ping.element.style.setProperty('--arrow-angle', `0deg`);
            }
        });
    }
}
