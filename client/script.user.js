// ==UserScript==
// @name         SigMod Client (Macros)
// @version      10.1.0
// @description  The best mod you can find for Sigmally - Agar.io: Macros, Friends, tag system (minimap, chat), color mod, custom skins, AutoRespawn, save names, themes and more!
// @author       Cursed
// @match        https://*.sigmally.com/*
// @icon         https://czrsd.com/static/sigmod/SigMod25-rounded.png
// @run-at       document-end
// @license      MIT
// @grant        none
// @namespace    https://greasyfork.org/users/981958
// ==/UserScript==

(function() {
    'use strict';
    const version = 10;
    const serverVersion = '4.0.0';
    const storageVersion = 1.0;
    const storageName = 'SigModClient-settings';
    const headerAnim = 'https://czrsd.com/static/sigmod/sigmodclient.gif';

    /* Allowed by greasyfork's CDN list: https://greasyfork.org/en/help/cdns
   * ------
   * Chart.js: https://github.com/chartjs/Chart.js
   * Alwan: https://github.com/sefianecho/alwan
   * JSZip: https://github.com/Stuk/jszip
   */
    const libs = {
        chart: {
            url: 'https://cdn.jsdelivr.net/npm/chart.js',
        },
        colorPicker: {
            url: 'https://unpkg.com/alwan/dist/js/alwan.min.js',
            css: ['https://unpkg.com/alwan/dist/css/alwan.min.css'],
        },
        JSZip: {
            url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
        },
    };

    const defaultSettings = {
        storageVersion,
        macros: {
            feedSpeed: 40,
            keys: {
                rapidFeed: 'w',
                respawn: 'b',
                location: 'y',
                saveImage: null,
                splits: {
                    double: 'd',
                    triple: 'f',
                    quad: 'g',
                    doubleTrick: null,
                    selfTrick: null,
                },
                line: {
                    horizontal: 's',
                    vertical: 't',
                    fixed: null,
                    instantSplit: 0,
                },
                toggle: {
                    menu: 'v',
                    chat: 'z',
                    names: null,
                    skins: null,
                    autoRespawn: null,
                },
            },
            mouse: {
                left: null,
                right: null,
            },
        },
        game: {
            font: 'Ubuntu',
            borderColor: null,
            foodColor: null,
            cellColor: null,
            virusImage: '/assets/images/viruses/2.png',
            shortenNames: false,
            removeOutlines: false,
            skins: {
                original: null,
                replacement: null,
            },
            map: {
                color: null,
                image: '',
            },
            name: {
                color: null,
                gradient: {
                    enabled: false,
                    left: null,
                    right: null,
                },
            },
        },
        themes: {
            current: 'Dark',
            custom: [],
            inputBorderRadius: null,
            menuBorderRadius: null,
            inputBorder: '1px',
        },
        settings: {
            tag: null,
            savedNames: [],
            autoRespawn: false,
            playTimer: false,
            mouseTracker: false,
            autoClaimCoins: false,
            showChallenges: false,
            deathScreenPos: 'center',
        },
        chat: {
            limit: 100,
            bgColor: '#00000040',
            textColor: '#ffffff',
            compact: false,
            themeColor: '#8a25e5',
            showTime: true,
            showNameColors: true,
            showClientChat: false,
            showChatButtons: true,
            blurTag: false,
            locationText: '{pos}',
        },
        modAccount: {
            authorized: false,
        },
    };

    let modSettings = localStorage.getItem(storageName);
    if (!modSettings) {
        modSettings = defaultSettings;
        updateStorage();
    } else {
        modSettings = JSON.parse(modSettings);

        if (
            !modSettings.storageVersion ||
            modSettings.storageVersion < storageVersion
        ) {
            localStorage.removeItem(storageName);
            location.reload();
        }
    }

    // intercept fetches
    let fetchedUser = 0;
    const originalFetch = window.fetch;

    window.fetch = new Proxy(originalFetch, {
        async apply(target, thisArg, argumentsList) {
            const [url] = argumentsList;
            const response = await target.apply(thisArg, argumentsList);

            if (typeof url === 'string') {
                if (url.includes('/server/auth')) {
                    const data = await response.clone().json();
                    if (data) mods.handleGoogleAuth(data.body?.user);
                }
            }

            return response;
        },
    });

    // for development
    let isDev = true;
    let port = 3001;

    // global sigmod
    window.sigmod = {
        version,
        server_version: serverVersion,
        storageName,
        settings: modSettings,
    };

    // Global gameSettings object to store the Sigmally WebSocket, User instance and playing status
    /*
   * @typedef {Object} User
   * @property {string} _id
   * @property {number} boost
   * @property {Object.<string, number>} cards
   * @property {string} clan
   * @property {string} createTime
   * @property {string} email
   * @property {number} exp
   * @property {string} fullName
   * @property {string} givenName
   * @property {number} gold
   * @property {string} googleID
   * @property {number} hourlyTime
   * @property {string} imageURL
   * @property {any[]} lastSkinUsed
   * @property {number} level
   * @property {number} nextLevel
   * @property {number} progress
   * @property {number} seasonExp
   * @property {Object.<string, any>} sigma
   * @property {string[]} skins
   * @property {number} subscription
   * @property {string} updateTime
   * @property {string} token
   *
   * @property {WebSocket} ws
   * @property {User} user
   * @property {boolean} isPlaying
   */
    window.gameSettings = {
        ws: null,
        user: null,
        isPlaying: false,
    };

    // --------- HELPER FUNCTIONS --------- \\
    // --- General
    // --- Colors
    // --- Game
    // --- Time
    // --- (Coordinates)

    function updateStorage() {
        localStorage.setItem(storageName, JSON.stringify(modSettings));
    }

    const byId = (id) => document.getElementById(id);

    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    }

    async function wait(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    function noXSS(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function parsetxt(val) {
        return /^(?:\{([^}]*)\})?([^]*)/.exec(val)[2].trim();
    }

    // generate random string
    const rdmString = (length) => {
        return [...Array(length)]
            .map(() => Math.random().toString(36).charAt(2))
            .join('');
    };

    // --------- Colors --------- //

    // rgba values to hex color code
    function RgbaToHex(code) {
        const rgbaValues = code.match(/\d+/g);
        const [r, g, b] = rgbaValues.slice(0, 3);
        return `#${Number(r).toString(16).padStart(2, '0')}${Number(g).toString(16).padStart(2, '0')}${Number(b).toString(16).padStart(2, '0')}`;
    }

    function bytesToHex(r, g, b) {
        return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    }

    // --------- Game --------- //

    function menuClosed() {
        const menuWrapper = byId('menu-wrapper');

        return menuWrapper.style.display === 'none';
    }

    function isDead() {
        const __line2 = byId('__line2');
        return !__line2.classList.contains('line--hidden');
    }

    function getGameMode() {
        const gameMode = byId('gamemode');
        if (!gameMode.value) {
            return 'Tourney';
        }
        const options = Object.values(gameMode.querySelectorAll('option'));
        const selectedOption = options.filter(
            (option) => option.value === gameMode.value,
        )[0];
        return selectedOption.textContent.split(' ')[0];
    }

    function keypress(key, keycode) {
        const keyDownEvent = new KeyboardEvent('keydown', {
            key: key,
            code: keycode,
        });
        const keyUpEvent = new KeyboardEvent('keyup', { key: key, code: keycode });

        window.dispatchEvent(keyDownEvent);
        window.dispatchEvent(keyUpEvent);
    }

    function mousemove(sx, sy) {
        const mouseMoveEvent = new MouseEvent('mousemove', {
            clientX: sx,
            clientY: sy,
        });
        const canvas = byId('canvas');
        canvas.dispatchEvent(mouseMoveEvent);
    }

    // time formatters
    const prettyTime = {
        fullDate: (dateTimestamp, time = false) => {
            const date = new Date(dateTimestamp);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const formattedDate = `${day}.${month}.${year}`;

            if (time) {
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                return `${hours}:${minutes}:${seconds} ${formattedDate}`;
            }

            return formattedDate;
        },
        am_pm: (date) => {
            if (!date) return '';

            const d = new Date(date);
            const hours = d.getHours();
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');

            return `${formattedHours}:${minutes} ${ampm}`;
        },
        time_ago: (timestamp, isIso = false) => {
            if (!timestamp) return '';
            const currentTime = new Date();
            const elapsedTime = isIso
                ? currentTime - new Date(timestamp)
                : currentTime - timestamp;

            const seconds = Math.floor(elapsedTime / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            const years = Math.floor(days / 365);

            if (years > 0) {
                return years === 1 ? '1 year ago' : `${years} years ago`;
            } else if (days > 0) {
                return days === 1 ? '1 day ago' : `${days} days ago`;
            } else if (hours > 0) {
                return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
            } else if (minutes > 0) {
                return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
            } else {
                return seconds <= 1 ? '1s>' : `${seconds}s ago`;
            }
        },
    };

    // EU server
    const coordinates = {};
    const gridSize = 4500;
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            const label = String.fromCharCode(65 + i) + (j + 1);

            const minX = -11000 + i * gridSize;
            const minY = -11000 + j * gridSize;
            const maxX = -6500 + i * gridSize;
            const maxY = -6500 + j * gridSize;

            coordinates[label] = {
                min: {
                    x: minX,
                    y: minY,
                },
                max: {
                    x: maxX,
                    y: maxY,
                },
            };
        }
    }

    // US1; US2 servers
    const coordinates2 = {};
    const gridSize2 = 7000;
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            const label = String.fromCharCode(65 + i) + (j + 1);

            const minX = -17022 + i * gridSize2;
            const minY = -17022 + j * gridSize2;
            const maxX = -10000 + i * gridSize2;
            const maxY = -10000 + j * gridSize2;

            coordinates2[label] = {
                min: {
                    x: minX,
                    y: minY,
                },
                max: {
                    x: maxX,
                    y: maxY,
                },
            };
        }
    }

    class Reader {
        constructor(view, offset, littleEndian) {
            this._e = littleEndian;
            if (view) this.repurpose(view, offset);
        }

        repurpose(view, offset) {
            this.view = view;
            this._o = offset || 0;
        }

        getUint8() {
            return this.view.getUint8(this._o++, this._e);
        }

        getFloat64() {
            return this.view.getFloat64((this._o += 8) - 8, this._e);
        }

        getInt16() {
            return this.view.getInt16((this._o += 2) - 2, this._e);
        }

        getUint16() {
            return this.view.getUint16((this._o += 2) - 2, this._e);
        }

        getUint32() {
            return this.view.getUint32((this._o += 4) - 4, this._e);
        }

        getFloat32() {
            return this.view.getFloat32((this._o += 4) - 4, this._e);
        }

        getStringUTF8(decode = true) {
            let bytes = [];
            let b;
            while ((b = this.view.getUint8(this._o++)) !== 0) bytes.push(b);

            let uint8Array = new Uint8Array(bytes);
            let decoder = new TextDecoder('utf-8');
            let s = decoder.decode(uint8Array);

            return decode ? s : uint8Array;
        }

        raw(len = 0) {
            const buf = this.view.buffer.slice(this._o, this._o + len);
            this._o += len;
            return buf;
        }
    }

    const __buf = new DataView(new ArrayBuffer(8));

    class Writer {
        constructor(littleEndian) {
            this._e = littleEndian;
            this.reset();
        }

        reset() {
            this._b = [];
            this._o = 0;
        }

        setUint8(a) {
            if (a >= 0 && a < 256) this._b.push(a);
            return this;
        }

        setUint32(a) {
            __buf.setUint32(0, a, this._e);
            this._move(4);
            return this;
        }

        _move(b) {
            for (let i = 0; i < b; i++) this._b.push(__buf.getUint8(i));
        }

        setStringUTF8(s) {
            const bytesStr = unescape(encodeURIComponent(s));
            for (let i = 0, l = bytesStr.length; i < l; i++) {
                this._b.push(bytesStr.charCodeAt(i));
            }
            this._b.push(0);
            return this;
        }

        build() {
            return new Uint8Array(this._b);
        }
    }

    // --------- END HELPER FUNCTIONS --------- //

    let client = null;
    let freezepos = false;

    // --------- Sigmally WebSocket Handler --------- //
    class SigWsHandler {
        constructor() {
            this.handshake = false;
            this.C = new Uint8Array(256);
            this.R = new Uint8Array(256);

            this.overrideWebSocketSend();
        }

        overrideWebSocketSend() {
            const handler = this;

            window.WebSocket = new Proxy(window.WebSocket, {
                construct(target, args) {
                    const wsInstance = new target(...args);

                    if (args[0].includes('sigmally.com')) {
                        handler.setupWebSocket(wsInstance);
                    }

                    return wsInstance;
                },
            });
        }

        setupWebSocket(ws) {
            window.gameSettings.ws = ws;

            if (!client) {
                client = new modClient();
            }

            // if respawned with more than 5.5k mass: slow respawn
            // click play button once websocket connection is opened
            ws.addEventListener('open', () => {
                if (mods.isRespawned) {
                    mods.isRespawned = false;

                    byId('play-btn').click();
                }
            });

            ws.addEventListener('close', () => this.handleWebSocketClose());
            ws.sendPacket = this.sendPacket.bind(this);

            window.sendPlay = this.sendPlay.bind(this);
            window.sendChat = this.sendChat.bind(this);
            window.sendMouseMove = this.sendMouseMove.bind(this);

            const originalSend = ws.send.bind(ws);
            ws.send = (data) => {
                try {
                    const arrayBuffer = data instanceof ArrayBuffer ? data : data.buffer;
                    const dataView = new DataView(arrayBuffer);
                    const reader = new Reader(dataView, 0, true);
                    const r = reader.getUint8();

                    if (this.R[r] === 0) {
                        window.gameSettings.isPlaying = true;
                    }

                    if (!window.sigfix && freezepos && this.R[r] === 16) {
                        return;
                    }

                    originalSend(data);
                } catch (e) {
                    console.error(e);
                }
            };

            ws.addEventListener('message', (event) => this.handleMessage(event));
        }

        handleWebSocketClose() {
            this.handshake = false;
            window.gameSettings.isPlaying = false;

            playerPosition.x = null;
            playerPosition.y = null;
            byId('mod-messages').innerHTML = '';
            setTimeout(mods.showOverlays, 500);
        }

        sendPacket(packet) {
            if (!window.gameSettings.ws) {
                console.error('WebSocket is not defined.');
                return;
            }

            if (packet.build) return window.gameSettings.ws.send(packet.build());
            window.gameSettings.ws.send(packet);
        }

        sendPlay(playData) {
            const { sigfix } = window;
            if (sigfix) {
                sigfix.net.play(sigfix.world.selected, JSON.parse(playData));
                return;
            }

            const writer = new Writer(true);
            writer.setUint8(this.C[0x00]);
            writer.setStringUTF8(playData);
            this.sendPacket(writer);
        }

        sendChat(text) {
            if (mods.aboveRespawnLimit && text === mods.respawnCommand) return;

            if (window.sigfix) {
                window.sigfix.net.chat(text);
                return;
            }

            const writer = new Writer();
            writer.setUint8(this.C[0x63]);
            writer.setUint8(0);
            writer.setStringUTF8(text);
            this.sendPacket(writer);
        }

        sendMouseMove(x, y) {
            const writer = new Writer(true);
            writer.setUint8(this.C[0x10]);
            writer.setUint32(x);
            writer.setUint32(y);
            writer._b.push(0, 0, 0, 0);
            this.sendPacket(writer);
        }

        removePlayer(id) {
            const index = this.cells.players.indexOf(id);
            if (index !== -1) {
                this.cells.players.splice(index, 1);
            }
        }

        handleMessage(event) {
            const reader = new Reader(new DataView(event.data), 0, true);

            if (!this.handshake) {
                this.performHandshake(reader);
                return;
            }

            const r = reader.getUint8();
            switch (this.R[r]) {
                case 0x63:
                    this.handleChatMessage(reader);
                    break;
                case 0x40:
                    this.updateBorder(reader);
                    break;
            }
        }

        performHandshake(reader) {
            reader.getStringUTF8(false);
            this.C.set(new Uint8Array(reader.raw(256)));

            for (const i in this.C) {
                this.R[this.C[i]] = ~~i;
            }

            this.handshake = true;
        }

        handleChatMessage(reader) {
            const flags = reader.getUint8();
            const color = bytesToHex(
                reader.getUint8(),
                reader.getUint8(),
                reader.getUint8(),
            );
            let name = reader.getStringUTF8();
            const message = reader.getStringUTF8();
            const server = !!(flags & 0x80);
            const admin = !!(flags & 0x40);
            const mod = !!(flags & 0x20);

            name = this.formatName(name, server, admin, mod);
            if (mods.mutedUsers.includes(name)) {
                return;
            }

            if (!modSettings.chat.showClientChat) {
                mods.updateChat({
                    server,
                    admin,
                    mod,
                    color: modSettings.chat.showNameColors ? color : '#fafafa',
                    name,
                    message,
                    time: modSettings.chat.showTime ? Date.now() : null,
                });
            }
        }

        formatName(name, server, admin, mod) {
            if (server && name !== 'SERVER') name = '[SERVER]';
            if (admin) name = '[ADMIN] ' + name;
            if (mod) name = '[MOD] ' + name;
            if (name === '') name = 'Unnamed';
            return parsetxt(name);
        }

        updateBorder(reader) {
            mods.border.left = reader.getFloat64();
            mods.border.top = reader.getFloat64();
            mods.border.right = reader.getFloat64();
            mods.border.bottom = reader.getFloat64();

            mods.border.width = mods.border.right - mods.border.left;
            mods.border.height = mods.border.bottom - mods.border.top;
            mods.border.centerX = (mods.border.left + mods.border.right) / 2;
            mods.border.centerY = (mods.border.top + mods.border.bottom) / 2;
        }
    }

    new SigWsHandler();

    class SigFixHandler {
        constructor() {
            this.checkInterval = null;
            this.init();
        }

        overrideMoveFunction() {
            if (!window.sigfix?.net?.move) return;

            const originalMove = window.sigfix.net.move;
            let isHandlingFreeze = false;

            window.sigfix.net.move = (...args) => {
                if (freezepos) {
                    if (!isHandlingFreeze) {
                        isHandlingFreeze = true;
                        originalMove.call(this, playerPosition.x, playerPosition.y);
                        isHandlingFreeze = false;
                    }
                    return;
                }
                return originalMove.apply(this, args);
            };
        }

        init() {
            const checkSigFix = () => {
                if (window.sigfix?.net) {
                    this.overrideMoveFunction();
                    clearInterval(this.checkInterval);

                    setTimeout(() => {
                        if (window.sigfix?.net) {
                            this.checkInterval = null;
                        }
                    }, 1000);
                }
            };

            this.checkInterval = setInterval(checkSigFix, 100);
        }
    }

    new SigFixHandler();

    // --------- Mod Client --------- //
    class modClient {
        constructor() {
            this.ws = null;
            this.wsUrl = isDev
                ? `ws://localhost:${port}/ws`
                : 'wss://mod.czrsd.com/ws';
            this.readyState = null;

            this.retries = 0;
            this.maxRetries = 4;
            this.updateAvailable = false;

            this.id = null;

            this.connect();
        }

        connect() {
            this.ws = new WebSocket(this.wsUrl);
            this.ws.binaryType = 'arraybuffer';

            this.ws.addEventListener('open', this.onOpen.bind(this));
            this.ws.addEventListener('close', this.onClose.bind(this));
            this.ws.addEventListener('message', this.onMessage.bind(this));
            this.ws.addEventListener('error', this.onError.bind(this));
        }

        async onOpen() {
            this.readyState = 1;
            await this.waitForDOMLoad();

            this.updateClientInfo();
            this.updateTagInfo();
        }

        waitForDOMLoad() {
            return new Promise((resolve) => setTimeout(resolve, 500));
        }

        updateClientInfo() {
            this.send({
                type: 'server-changed',
                content: getGameMode(),
            });
            this.send({
                type: 'version',
                content: serverVersion,
            });
            this.send({
                type: 'update-nick',
                content: mods.nick,
            });
        }

        updateTagInfo() {
            const tagElement = document.querySelector('#tag');
            const tagText = document.querySelector('.tagText');
            const tagValue = this.getTagFromUrl();

            if (tagValue) {
                modSettings.settings.tag = tagValue;
                updateStorage();
                tagElement.value = tagValue;
                tagText.innerText = `Tag: ${tagValue}`;
                this.send({
                    type: 'update-tag',
                    content: modSettings.settings.tag,
                });
            } else if (modSettings.settings.tag) {
                tagElement.value = modSettings.settings.tag;
                tagText.innerText = `Tag: ${modSettings.settings.tag}`;
                this.send({
                    type: 'update-tag',
                    content: modSettings.settings.tag,
                });
            }
        }

        getTagFromUrl() {
            const urlParams = new URLSearchParams(window.location.search);
            const tagValue = urlParams.get('tag');
            return tagValue ? tagValue.replace(/\/$/, '') : null;
        }

        onClose() {
            this.readyState = 3;
            if (this.updateAvailable) return;

            this.retries++;
            if (this.retries > this.maxRetries)
                throw new Error('SigMod server down.');

            setTimeout(() => this.connect(), 2000); // auto reconnect with delay
        }

        onMessage(event) {
            const message = this.parseMessage(event.data);
            if (!message || !message.type) return;

            switch (message.type) {
                case 'sid':
                    this.handleSidMessage(message.content);
                    break;
                case 'ping':
                    this.handlePingMessage();
                    break;
                case 'minimap-data':
                    mods.updData(message.content);
                    break;
                case 'chat-message':
                    this.handleChatMessage(message.content);
                    break;
                case 'private-message':
                    mods.updatePrivateChat(message.content);
                    break;
                case 'update-available':
                    this.handleUpdateAvailable(message.content);
                    break;
                case 'tournament-preview':
                    mods.tData = message.content;
                    mods.showTournament(message.content);
                    break;
                case 'tournament-message':
                    mods.updateChat({
                        name: '[TOURNAMENT]',
                        message: message.content,
                        time: modSettings.chat.showTime ? Date.now() : null,
                    });
                    break;
                case 'tournament-session':
                    mods.tournamentSession(message.content);
                    break;
                case 'get-score':
                    mods.getScore(message.content);
                    break;
                case 'round-end':
                    mods.roundEnd(message.content);
                    break;
                case 'round-ready':
                    mods.tournamentReady(message.content);
                    break;
                case 'tournament-overlay':
                    mods.toggleOverlay(message.content);
                    break;
                case 'error':
                    mods.modAlert(message.content.message, 'danger');
                    break;
                default:
                    console.error('Unknown message type:', message.type);
            }
        }

        onError(event) {
            console.error('WebSocket error:', event);
        }

        send(data) {
            if (!data || this.readyState !== 1) return;
            const binaryData = new TextEncoder().encode(JSON.stringify(data));
            this.ws.send(binaryData);
        }

        parseMessage(data) {
            try {
                const stringData = new TextDecoder().decode(new Uint8Array(data));
                return JSON.parse(stringData);
            } catch (error) {
                console.error('Failed to parse message:', error);
                return null;
            }
        }

        handleSidMessage(content) {
            this.id = content;
            if (!modSettings.modAccount.authorized) return;

            setTimeout(() => {
                mods.auth(content);
            }, 1000);
        }

        handlePingMessage() {
            const latency = Date.now() - mods.ping.start;
            mods.ping.end = Date.now();
            mods.ping.latency = latency;
            byId('clientPing').innerHTML = `Client Ping: ${latency}ms`;
        }

        handleChatMessage(content) {
            if (!content) return;
            let { admin, mod, vip, name, message, color } = content;

            name = this.formatChatName(admin, mod, vip, name);

            mods.updateChat({
                admin,
                mod,
                color,
                name,
                message,
                time: modSettings.chat.showTime ? Date.now() : null,
            });
        }

        formatChatName(admin, mod, vip, name) {
            if (admin) name = '[Owner] ' + name;
            if (mod) name = '[Mod] ' + name;
            if (vip) name = '[VIP] ' + name;
            if (!name) name = 'Unnamed';
            return name;
        }

        handleUpdateAvailable(content) {
            byId('play-btn').setAttribute('disabled', 'disabled');
            byId('spectate-btn').setAttribute('disabled', 'disabled');
            this.updateAvailable = true;
            this.createModAlert(content);
        }

        createModAlert(content) {
            const modAlert = document.createElement('div');
            modAlert.classList.add('modAlert');
            modAlert.innerHTML = `
                <span>You are using an old mod version. Please update.</span>
                <div class="flex" style="align-items: center; gap: 5px;">
                    <button id="updateMod" class="modButton" style="width: 100%">Update</button>
                </div>
            `;
            document.body.append(modAlert);

            byId('updateMod').addEventListener('click', () => {
                window.open(content);
            });
        }
    }

    function randomPos() {
        let eventOptions = {
            clientX: Math.floor(Math.random() * window.innerWidth),
            clientY: Math.floor(Math.random() * window.innerHeight),
            bubbles: true,
            cancelable: true,
        };

        let event = new MouseEvent('mousemove', eventOptions);

        document.dispatchEvent(event);
    }

    let moveInterval = setInterval(randomPos);
    setTimeout(() => clearInterval(moveInterval), 600);

    function addSettings() {
        const gameSettings = document.querySelector('.checkbox-grid');
        if (!gameSettings) return;

        const div = document.createElement('div');
        div.innerHTML = `
            <input type="checkbox" id="showNames">
            <label>Names</label>
            <input type="checkbox" id="showSkins">
            <label>Skins</label>
            <input type="checkbox" id="autoRespawn">
            <label>Auto Respawn</label>
            <input type="checkbox" id="removeShopPopup">
            <label>Remove shop popup</label>
            <input type="checkbox" id="autoClaimCoins">
            <label>Auto claim coins</label>
            <input type="checkbox" id="showChallenges">
            <label>Challenges deathscreen</label>
            <input type="checkbox" id="showPosition">
            <label>Position</label>
        `;
        while (div.children.length > 0) gameSettings.append(div.children[0]);
    }

    addSettings();

    let mods = {};

    let playerPosition = { x: null, y: null };
    let lastGetScore = 0;
    let lastPosTime = 0;
    let dead = false;
    let dead2 = false;

    function mod() {
        this.nick = null;
        this.profile = {};
        this.friends_settings = window.sigmod.friends_settings = {};
        this.friend_names = window.sigmod.friend_names = new Set();

        this.splitKey = {
            keyCode: 32,
            code: 'Space',
            cancelable: true,
            composed: true,
            isTrusted: true,
            which: 32,
        };

        this.ping = {
            latency: NaN,
            intervalId: null,
            start: null,
            end: null,
        };

        this.dayTimer = null;
        this.challenges = [];

        this.scrolling = false;
        this.onContext = false;
        this.mouseDown = false;

        this.mouseX = 0;
        this.mouseY = 0;
        this.screenSide = null;

        this.renderedMessages = 0;
        this.maxChatMessages = 200;
        this.mutedUsers = [];
        this.blackListCharacters = ['﷽', '𒐫', '𒈟'];

        this.respawnCommand = '/leaveworld';
        this.aboveRespawnLimit = false;
        this.isRespawned = false;
        this.cellSize = 0;
        this.miniMapData = [];
        this.border = {};

        this.dbCache = null;

        this.tourneyPassword = '';
        this.lastOneStanding = false;

        this.skins = [];

        this.virusImageLoaded = false;
        this.skinImageLoaded = false;

        this.routes = {
            discord: {
                auth: isDev
                    ? `https://discord.com/oauth2/authorize?client_id=1067097357780516874&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fdiscord%2Fcallback&scope=identify`
                    : 'https://discord.com/oauth2/authorize?client_id=1067097357780516874&response_type=code&redirect_uri=https%3A%2F%2Fmod.czrsd.com%2Fdiscord%2Fcallback&scope=identify',
            },
        };

        // for SigMod specific
        this.appRoutes = {
            user: isDev
                ? `http://localhost:${port}/user`
                : 'https://mod.czrsd.com/user',
            badge: isDev
                ? `http://localhost:${port}/badge`
                : 'https://mod.czrsd.com/badge',
            discordLogin: isDev
                ? `http://localhost:${port}/discord/login/`
                : 'https://mod.czrsd.com/discord/login/',
            signIn: (path) =>
                isDev
                    ? `http://localhost:${port}/${path}`
                    : `https://mod.czrsd.com/${path}`,
            auth: isDev
                ? `http://localhost:${port}/auth`
                : `https://mod.czrsd.com/auth`,
            users: isDev
                ? `http://localhost:${port}/users`
                : `https://mod.czrsd.com/users`,
            search: isDev
                ? `http://localhost:${port}/search`
                : `https://mod.czrsd.com/search`,
            request: isDev
                ? `http://localhost:${port}/request`
                : `https://mod.czrsd.com/request`,
            friends: isDev
                ? `http://localhost:${port}/me/friends`
                : `https://mod.czrsd.com/me/friends`,
            profile: (id) =>
                isDev
                    ? `http://localhost:${port}/profile/${id}`
                    : `https://mod.czrsd.com/profile/${id}`,
            myRequests: isDev
                ? `http://localhost:${port}/me/requests`
                : `https://mod.czrsd.com/me/requests`,
            handleRequest: isDev
                ? `http://localhost:${port}/me/handle`
                : `https://mod.czrsd.com/me/handle`,
            logout: isDev
                ? `http://localhost:${port}/logout`
                : `https://mod.czrsd.com/logout`,
            imgUpload: isDev
                ? `http://localhost:${port}/me/upload`
                : `https://mod.czrsd.com/me/upload`,
            removeAvatar: isDev
                ? `http://localhost:${port}/me/handle`
                : `https://mod.czrsd.com/me/handle`,
            editProfile: isDev
                ? `http://localhost:${port}/me/edit`
                : `https://mod.czrsd.com/me/edit`,
            delProfile: isDev
                ? `http://localhost:${port}/me/remove`
                : `https://mod.czrsd.com/me/remove`,
            updateSettings: isDev
                ? `http://localhost:${port}/me/update-settings`
                : `https://mod.czrsd.com/me/update-settings`,
            chatHistory: (id) =>
                isDev
                    ? `http://localhost:${port}/me/chat/${id}`
                    : `https://mod.czrsd.com/me/chat/${id}`,
            onlineUsers: isDev
                ? `http://localhost:${port}/onlineUsers`
                : `https://mod.czrsd.com/onlineUsers`,
            announcements: isDev
                ? `http://localhost:${port}/announcements`
                : `https://mod.czrsd.com/announcements`,
            announcement: (id) =>
                isDev
                    ? `http://localhost:${port}/announcement/${id}`
                    : `https://mod.czrsd.com/announcement/${id}`,
            fonts: isDev
                ? `http://localhost:${port}/fonts`
                : 'https://mod.czrsd.com/fonts',
        };

        this.createMenu();
    }

    mod.prototype = {
        get style() {
            return `
        @import url('https://fonts.googleapis.com/css2?family=Titillium+Web:wght@400;600;700&display=swap');

        .mod_menu {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100vh;
            background: rgba(0, 0, 0, .6);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
            transition: all .3s ease;
        }

        .mod_menu * {
            margin: 0;
            padding: 0;
            font-family: 'Ubuntu';
            box-sizing: border-box;
        }

        .mod_menu_wrapper {
            position: relative;
            display: flex;
            flex-direction: column;
            width: 700px;
            height: 500px;
            background: #111;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 5px 10px #000;
        }

        .mod_menu_header {
            display: flex;
            width: 100%;
            position: relative;
            height: 60px;
        }

        .mod_menu_header .header_img {
            width: 100%;
            height: 60px;
            object-fit: cover;
            object-position: center;
            position: absolute;
        }

        .mod_menu_header button {
            display: flex;
            justify-content: center;
            align-items: center;
            position: absolute;
            right: 10px;
            top: 30px;
            background: rgba(11, 11, 11, .7);
            width: 42px;
            height: 42px;
            font-size: 16px;
            transform: translateY(-50%);
        }

        .mod_menu_header button:hover {
            background: rgba(11, 11, 11, .5);
        }

        .mod_menu_inner {
            display: flex;
        }

        .mod_menu_navbar {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 132px;
            padding: 10px;
            background: #181818;
            height: 440px;
        }

        .mod_nav_btn, .modButton-black {
            display: flex;
            justify-content: space-evenly;
            align-items: center;
            padding: 5px;
            background: #050505;
            border-radius: 8px;
            font-size: 16px;
            border: 1px solid transparent;
            outline: none;
            width: 100%;
            transition: all .3s ease;
        }
        label.modButton-black {
            font-weight: 400;
            cursor: pointer;
        }

        .modButton-black[disabled] {
            background: #333;
            cursor: default;
        }

        .mod_selected {
            border: 1px solid rgba(89, 89, 89, .9);
        }

        .mod_nav_btn img {
            width: 22px;
        }

        .mod_menu_content {
            width: 100%;
            padding: 10px;
            position: relative;
			max-width: 568px;
        }

        .mod_tab {
            width: 100%;
			height: 100%;
            display: flex;
            flex-direction: column;
            gap: 5px;
            overflow-y: auto;
            overflow-x: hidden;
            max-height: 420px;
            opacity: 1;
            transition: all .2s ease;
        }
        .modColItems {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 15px;
            width: 100%;
        }

        .modColItems_2 {
            display: flex;
            flex-direction: column;
            align-items: start;
            justify-content: start;
            background: #050505;
            gap: 8px;
            border-radius: 0.5rem;
            padding: 10px;
            width: 100%;
        }

        .modRowItems {
            display: flex;
            justify-content: center;
            align-items: center;
            background: #050505;
            gap: 58px;
            border-radius: 0.5rem;
            padding: 10px;
            width: 100%;
        }

        .form-control {
            border-width: 1px;
        }
        .form-control.error-border {
            border-color: #AC3D3D;
        }

		.modSlider {
		  --thumb-color: #d9d9d9;
		  -webkit-appearance: none;
		  appearance: none;
		  width: 100%;
		  height: 8px;
		  background: #333;
		  border-radius: 5px;
		  outline: none;
		  transition: all 0.3s ease;
		}

		.modSlider::-webkit-slider-thumb {
		  -webkit-appearance: none;
		  appearance: none;
		  width: 20px;
		  height: 20px;
		  border-radius: 50%;
		  background: var(--thumb-color);
		}

		.modSlider::-moz-range-thumb {
		  width: 20px;
		  height: 20px;
		  border-radius: 50%;
		  background: var(--thumb-color);
		}

		.modSlider::-ms-thumb {
		  width: 20px;
		  height: 20px;
		  border-radius: 50%;
		  background: var(--thumb-color);
		}

        input:focus, select:focus, button:focus{
             outline: none;
        }
        .macros_wrapper {
            display: flex;
            width: 100%;
            justify-content: center;
            flex-direction: column;
            gap: 10px;
            background: #050505;
            padding: 10px;
            border-radius: 0.75rem;
        }
        .macrosContainer {
            display: flex;
            width: 100%;
            justify-content: center;
            align-items: center;
            gap: 20px;
        }
        .macroRow {
            background: #121212;
            border-radius: 5px;
            padding: 7px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
        }
        .keybinding {
            border-radius: 5px;
            background: #242424;
            border: none;
            color: #fff;
            padding: 2px 5px;
            max-width: 50px;
            font-weight: 500;
            text-align: center;
        }
        .closeBtn{
             width: 46px;
             background-color: transparent;
			 display: flex;
			 justify-content: center;
			 align-items: center;
        }
        .select-btn {
            padding: 15px 20px;
            background: #222;
            border-radius: 2px;
            position: relative;
        }

        .select-btn:active {
            scale: 0.95
        }

        .select-btn::before {
            content: "...";
            font-size: 20px;
            color: #fff;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
         .text {
             user-select: none;
             font-weight: 500;
             text-align: left;
        }
         .modButton {
             background-color: #252525;
             border-radius: 4px;
             color: #fff;
             transition: all .3s;
             outline: none;
             padding: 7px;
             font-size: 13px;
             border: none;
        }
         .modButton:hover {
             background-color: #222
        }
         .modInput {
             background-color: #111;
             border: none;
             border-radius: 5px;
             position: relative;
             border-top-right-radius: 4px;
             border-top-left-radius: 4px;
             font-weight: 500;
             padding: 5px;
             color: #fff;
        }
		.modNumberInput:disabled {
			color: #777;
		}

        .modCheckbox input[type="checkbox"] {
             display: none;
             visibility: hidden;
        }
        .modCheckbox label {
          display: inline-block;
        }

        .modCheckbox .cbx {
          position: relative;
          top: 1px;
          width: 17px;
          height: 17px;
          margin: 2px;
          border: 1px solid #c8ccd4;
          border-radius: 3px;
          vertical-align: middle;
          transition: background 0.1s ease;
          cursor: pointer;
        }

        .modCheckbox .cbx:after {
          content: '';
          position: absolute;
          top: 1px;
          left: 5px;
          width: 5px;
          height: 11px;
          opacity: 0;
          transform: rotate(45deg) scale(0);
          border-right: 2px solid #fff;
          border-bottom: 2px solid #fff;
          transition: all 0.3s ease;
          transition-delay: 0.15s;
        }

        .modCheckbox input[type="checkbox"]:checked ~ .cbx {
          border-color: transparent;
          background: #6871f1;
          box-shadow: 0 0 10px #2E2D80;
        }

        .modCheckbox input[type="checkbox"]:checked ~ .cbx:after {
          opacity: 1;
          transform: rotate(45deg) scale(1);
        }

         .SettingsButton{
             border: none;
             outline: none;
             margin-right: 10px;
             transition: all .3s ease;
        }
         .SettingsButton:hover {
             scale: 1.1;
        }
         .colorInput{
             background-color: transparent;
             width: 31px;
             height: 35px;
             border-radius: 50%;
             border: none;
        }
         .colorInput::-webkit-color-swatch {
             border-radius: 50%;
             border: 2px solid #fff;
        }
        .whiteBorder_colorInput::-webkit-color-swatch {
            border-color: #fff;
        }
		.menu-center>div>.menu-center-content>div>div>.menu__form-group {
			margin-bottom: 14px !important;
		}
         #dclinkdiv {
             display: flex;
             flex-direction: row;
        }
         .dclinks {
             width: calc(50% - 5px);
             height: 36px;
             display: flex;
             justify-content: center;
             align-items: center;
             background-color: rgba(88, 101, 242, 1);
             border-radius: 6px;
             margin: 0 auto;
             color: #fff;
        }
         #cm_close__settings {
             width: 50px;
             transition: all .3s ease;
        }
         #cm_close__settings svg:hover {
             scale: 1.1;
        }
         #cm_close__settings svg {
             transition: all .3s ease;
        }
         .modTitleText {
             text-align: center;
             font-size: 16px;
        }
        .modItem {
             display: flex;
             justify-content: center;
             align-items: center;
             flex-direction: column;
        }
        .accent_row {
            background: #111111;
        }
         .mod_tab-content {
             width: 100%;
             margin: 10px;
             overflow: auto;
             display: flex;
             flex-direction: column;
        }

        #Tab6 .mod_tab-content {
             overflow-y: auto;
             max-height: 230px;
             display: flex;
             flex-wrap: nowrap;
             flex-direction: column;
             gap: 10px;
        }

        .tab-content, #coins-tab, #chests-tab {
            overflow-x: hidden;
            justify-content: center;
        }

        #shop-skins-buttons::after {
            background: #050505;
        }

		#sigma-status {
			background: rgba(0, 0, 0, .6) !important;
		}

         .w-100 {
             width: 100%
        }
         .btn:hover {
             color: unset;
        }

        #savedNames {
            background-color: #000;
            padding: 5px;
            border-radius: 5px;
            overflow-y: auto;
            height: 155px;
            background-image: url("https://raw.githubusercontent.com/Sigmally/SigMod/main/images/purple_gradient.png");
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            box-shadow: 0 0 10px #000;
        }

        .scroll {
            scroll-behavior: smooth;
        }

        /* Chrome, Safari */
        .scroll::-webkit-scrollbar {
            width: 7px;
        }

        .scroll::-webkit-scrollbar-track {
            background: #222;
            border-radius: 5px;
        }

        .scroll::-webkit-scrollbar-thumb {
            background-color: #333;
            border-radius: 5px;
        }

        .scroll::-webkit-scrollbar-thumb:hover {
            background: #353535;
        }

        /* Firefox */
        .scroll {
            scrollbar-width: thin;
            scrollbar-color: #333 #222;
        }

        .scroll:hover {
            scrollbar-color: #353535 #222;
        }

        .themes {
            display: flex;
            flex-direction: row;
			flex: 1;
            flex-wrap: wrap;
            justify-content: center;
            width: 100%;
			min-height: 254px;
            max-height: 420px;
            background: #000;
            border-radius: 5px;
            overflow-y: scroll;
            gap: 10px;
            padding: 5px;
        }

        .themeContent {
          width: 50px;
          height: 50px;
          border: 2px solid #222;
          border-radius: 50%;
          background-position: center;
        }

        .theme {
            height: 75px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            cursor: pointer;
        }
         .delName {
             font-weight: 500;
             background: #e17e7e;
             height: 20px;
             border: none;
             border-radius: 5px;
             font-size: 10px;
             margin-left: 5px;
             color: #fff;
             display: flex;
             justify-content: center;
             align-items: center;
             width: 20px;
        }
         .NameDiv {
             display: flex;
             background: #111;
             border-radius: 5px;
             margin: 5px;
             padding: 3px 8px;
             height: 34px;
             align-items: center;
             justify-content: space-between;
             cursor: pointer;
             box-shadow: 0 5px 10px -2px #000;
        }
        .NameLabel {
            cursor: pointer;
            font-weight: 500;
            text-align: center;
            color: #fff;
        }
        .alwan {
            border-radius: 8px;
        }
        .colorpicker-additional {
            display: flex;
            justify-content: space-between;
            width: 100%;
            color: #fafafa;
            padding: 10px;
        }
        .resetButton {
            width: 25px;
            height: 25px;
            background-image: url("https://raw.githubusercontent.com/Sigmally/SigMod/main/images/reset.svg");
            background-color: transparent;
			background-repeat: no-repeat;
            border: none;
        }

        .modAlert {
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 99995;
            background: #3F3F3F;
            border-radius: 10px;
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 10px;
            color: #fff;
        }

        .alert_overlay {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 999999999;
            pointer-events: none;
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: start;
            align-items: center;
        }

        .infoAlert {
            padding: 5px;
            border-radius: 5px;
            margin-top: 5px;
            color: #fff;
        }

        .modAlert-success {
            background: #5BA55C;
        }
        .modAlert-success .modAlert-loader {
            background: #6BD56D;
        }
        .modAlert-default {
            background: #151515;
        }
        .modAlert-default .modAlert-loader {
            background: #222;
        }
        .modAlert-danger {
            background: #D44121;
        }
        .modAlert-danger .modAlert-loader {
            background: #A5361E;
        }
        #free-coins .modAlert-danger {
            background: #fff !important;
        }

        .modAlert-loader {
            width: 100%;
            height: 2px;
            margin-top: 5px;
            transition: all .3s ease-in-out;
            animation: loadAlert 2s forwards;
        }

        @keyframes loadAlert {
            0% {
                width: 100%;
            }
            100% {
                width: 0%;
            }
        }

        .themeEditor {
            z-index: 999999999999;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, .85);
            color: #fff;
            padding: 10px;
            border-radius: 10px;
            box-shadow: 0 0 10px #000;
            width: 400px;
        }

        .theme_editor_header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
        }

        .theme-editor-tab {
            display: flex;
            justify-content: center;
            align-items: start;
            flex-direction: column;
            margin-top: 10px
        }

        .themes_preview {
            width: 50px;
            height: 50px;
            border: 2px solid #fff;
            border-radius: 2px;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .sigmod-title {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
        }
        .sigmod-title #title {
            width: fit-content;
        }
        #bycursed {
            font-family: "Titillium Web", sans-serif;
			font-weight: 400;
            font-size: 16px;
        }
        #bycursed a {
            color: #71aee3;
        }
        .stats__item>span, #title, .stats-btn__text {
           color: #fff;
        }

        .top-users__inner::-webkit-scrollbar-thumb {
            border: none;
        }
        #signInBtn, #nick, #gamemode, .form-control, .profile-header, .coins-num, #clan-members, .member-index, .member-level, #clan-requests {
            background: rgba(0, 0, 0, 0.4) !important;
            color: #fff !important;
        }
        .profile-name, #progress-next, .member-desc > p:first-child, #clan-leave > div, .clans-item > div > b, #clans-input input, #shop-nav button {
            color: #fff !important;
        }
        .head-desc, #shop-nav button {
            border: 1px solid #000;
        }
        #shop-nav button {
           transition: background .1s ease;
        }
        #shop-nav button:hover {
           background: #121212 !important;
        }
        #clan-handler, #request-handler, #clans-list, #clans-input, .clans-item button, #shop-content, .card-particles-bar-bg {
            background: #111 !important;
            color: #fff !important;
        }
        #clans_and_settings {
            height: auto !important;
        }
        .card-body {
            background: linear-gradient(180deg, #000 0%, #1b354c 100%);
        }
        .free-card:hover .card-body {
            background: linear-gradient(180deg, #111 0%, #1b354c 100%);
        }
        #shop-tab-body, #shop-nav, #shop-skins-buttons {
            background: #050505 !important;
        }
        #clan-leave {
            background: #111;
            bottom: -1px;
        }
        .sent {
            position: relative;
            width: 100px;
        }

        .sent::before {
            content: "Sent request";
            width: 100%;
            height: 10px;
            word-spacing: normal;
            white-space: nowrap;
            position: absolute;
            background: #4f79f9;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .btn, .sign-in-out-btn {
            transition: all .2s ease;
        }
		.free-coins-body > div, .goldmodal-contain {
			background: rgba(0, 0, 0, .5);
		}
        #clan .connecting__content, #clans .connecting__content {
            background: #151515;
            color: #fff;
            box-shadow: 0 0 10px rgba(0, 0, 0, .5);
        }

        .skin-select__icon-text {
            color: #fff;
        }

        .justify-sb {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .macro-extanded_input {
            width: 75px;
            text-align: center;
        }
        .form-control option {
            background: #111;
        }

        .stats-line {
            width: 100%;
            user-select: none;
            margin-bottom: 5px;
            padding: 5px;
            background: #050505;
            border: 1px solid var(--default-mod);
            border-radius: 5px;
        }

        .stats-info-text {
            color: #7d7d7d;
        }

        .setting-card-wrapper {
            margin-right: 10px;
            padding: 10px;
            background: #161616;
            border-radius: 5px;
            display: flex;
            flex-direction: column;
			width: 100%;
        }

        .setting-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .setting-card-action {
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
        }

        .setting-card-action {
            width: 100%;
        }

        .setting-card-name {
            font-size: 16px;
            user-select: none;
            width: 100%;
        }

        .mod-small-modal {
            display: flex;
            flex-direction: column;
            gap: 10px;
            position: absolute;
            z-index: 99999;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #191919;
            box-shadow: 0 5px 15px -2px #000;
            padding: 10px;
            border-radius: 5px;
        }

        .mod-small-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .mod-small-modal-header h1 {
            font-size: 20px;
            font-weight: 500;
            margin: 0;
        }

        .mod-small-modal-content {
            display: flex;
            flex-direction: column;
            width: 100%;
            align-items: center;
        }

        .mod-small-modal-content_selectImage {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .imagePreview {
            min-width: 34px;
            width: 34px;
            height: 34px;
            border: 2px solid #353535;
			border-radius: 5px;
			background-size: contain;
			background-repeat: no-repeat;
			background-position: center;

			/* for preview text */
			display: flex;
			justify-content: center;
			align-items: center;
			font-size: 7px;
			overflow: hidden;
			text-align: center;
        }

        .modChat {
            min-width: 450px;
            max-width: 450px;
            min-height: 285px;
            max-height: 285px;
            color: #fafafa;
            padding: 10px;
            position: absolute;
            bottom: 10px;
            left: 10px;
            z-index: 999;
            border-radius: .5rem;
            overflow: hidden;
            opacity: 1;
            transition: all .3s ease;
        }

        .modChat__inner {
            min-width: 430px;
            max-width: 430px;
            min-height: 265px;
            max-height: 265px;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 5px;
            justify-content: flex-end;
            opacity: 1;
            transition: all .3s ease;
        }

        .mod-compact {
            transform: scale(0.78);
        }
        .mod-compact.modChat {
            left: -40px;
            bottom: -20px;
        }
        .mod-compact.chatAddedContainer {
            left: 350px;
            bottom: -17px;
        }

        #scroll-down-btn {
            position: absolute;
            bottom: 60px;
            left: 50%;
            transform: translateX(-50%);
            width: 80px;
            display:none;
            box-shadow:0 0 5px #000;
            z-index: 5;
        }

        .modchat-chatbuttons {
            margin-bottom: auto;
            display: flex;
            gap: 5px;
        }

        .chat-context {
            position: absolute;
            z-index: 999999;
            width: 100px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 5px;
            background: #181818;
            border-radius: 5px;
        }

        .chat-context span {
            color: #fff;
            user-select: none;
            padding: 5px;
            white-space: nowrap;
        }

        .chat-context button {
            width: 100%;
            background-color: transparent;
            border: none;
            border-top: 2px solid #747474;
            outline: none;
            color: #fff;
            transition: all .3s ease;
        }

        .chat-context button:hover {
            backgrokund-color: #222;
        }

        .tagText {
            margin-left: auto;
            font-size: 14px;
        }

        #mod-messages {
            position: relative;
            display: flex;
            flex-direction: column;
            max-height: 185px;
            overflow-y: auto;
            direction: rtl;
            scroll-behavior: smooth;
        }
        .message {
            direction: ltr;
            margin: 2px 0 0 5px;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .message_name {
            user-select: none;
        }

        .message .time {
            color: rgba(255, 255, 255, 0.7);
            font-size: 12px;
        }

        #chatInputContainer {
            display: flex;
            gap: 5px;
            align-items: center;
            padding: 5px;
            background: rgba(25,25,25, .6);
            border-radius: .5rem;
            overflow: hidden;
        }

        .chatInput {
            flex-grow: 1;
            border: none;
            background: transparent;
            color: #fff;
            padding: 5px;
            outline: none;
            max-width: 100%;
        }

        .chatButton {
            background: #8a25e5;
            border: none;
            border-radius: 5px;
            padding: 5px 10px;
            height: 100%;
            color: #fff;
            transition: all 0.3s;
            cursor: pointer;
            display: flex;
            align-items: center;
            height: 28px;
            justify-content: center;
            gap: 5px;
        }
        .chatButton:hover {
            background: #7a25e5;
        }
        .chatCloseBtn {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }

        .emojisContainer {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .chatAddedContainer {
            position: absolute;
            bottom: 10px;
            left: 465px;
            z-index: 9999;
            padding: 10px;
            background: #151515;
            border-radius: .5rem;
            min-width: 172px;
            max-width: 172px;
            min-height: 250px;
            max-height: 250px;
        }
        #categories {
            overflow-y: auto;
            max-height: calc(250px - 50px);
            gap: 2px;
        }
        .category {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .category span {
            color: #fafafa;
            font-size: 14px;
            text-align: center;
        }

        .emojiContainer {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
        }

        #categories .emoji {
            padding: 2px;
            border-radius: 5px;
            font-size: 16px;
            user-select: none;
            cursor: pointer;
        }

        .chatSettingsContainer {
            padding: 10px 3px;
        }
        .chatSettingsContainer .scroll {
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 235px;
            overflow-y: auto;
            padding: 0 10px;
        }

        .csBlock {
            border: 2px solid #050505;
            border-radius: .5rem;
            color: #fff;
            display: flex;
            align-items: center;
            flex-direction: column;
            gap: 5px;
            padding-bottom: 5px;
        }

        .csBlock .csBlockTitle {
            background: #080808;
            width: 100%;
            padding: 3px;
            text-align: center;
        }

        .csRow {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 5px;
            width: 100%;
        }

        .csRowName {
            display: flex;
            gap: 5px;
            align-items: start;
        }

        .csRowName .infoIcon {
            width: 14px;
            cursor: pointer;
        }

        .modInfoPopup {
            position: absolute;
            top: 2px;
            left: 58%;
            text-align: center;
            background: #151515;
            border: 1px solid #607bff;
            border-radius: 10px;
            transform: translateX(-50%);
            white-space: nowrap;
            padding: 5px;
            z-index: 99999;
        }

        .modInfoPopup::after {
            content: '';
            display: block;
            position: absolute;
            bottom: -7px;
            background: #151515;
            right: 50%;
            transform: translateX(-50%) rotate(-45deg);
            width: 12px;
            height: 12px;
            border-left: 1px solid #607bff;
            border-bottom: 1px solid #607bff;
        }

        .modInfoPopup p {
            margin: 0;
            font-size: 12px;
            color: #fff;
        }

        .minimapContainer {
            display: flex;
            flex-direction: column;
            align-items: end;
            pointer-events: none;
            position: absolute;
            bottom: 0;
            right: 0;
            z-index: 99999;
        }
        .minimap {
            border-radius: 2px;
            border-top: 1px solid rgba(255, 255, 255, .5);
            border-left: 1px solid rgba(255, 255, 255, .5);
            box-shadow: 0 0 4px rgba(255, 255, 255, .5);
        }

        #tag {
            width: 50px;
        }

        .blur {
            color: transparent!important;
            text-shadow: 0 0 6px hsl(0deg 0% 90% / 70%);
            transition: all .2s;
        }

        .blur:focus, .blur:hover {
            color: #fafafa!important;
            text-shadow: none;
        }
        .progress-row button {
            background: transparent;
        }

        #mod_home .justify-sb {
            z-index: 2;
        }

        .modTitleText {
            font-size: 15px;
            color: #fafafa;
            text-align: start;
        }
        .modDescText {
            text-align: start;
            font-size: 12px;
            color: #777;
        }
        .modButton-secondary {
            background-color: #171717;
            color: #fff;
            border: none;
            padding: 5px 15px;
            border-radius: 15px;
        }
        .vr {
            width: 2px;
            height: 250px;
            background-color: #fafafa;
        }
        .vr2 {
            width: 1px;
            height: 26px;
            background-color: #202020;
        }

		.home-card-row {
			display: flex;
			flex-wrap: nowrap;
			justify-content: space-between;
			gap: 18px;
		}
        .home-card-wrapper {
            display: flex;
			flex: 1;
            flex-direction: column;
            gap: 5px;
			width: 50%;
        }
        .home-card {
            display: flex;
            flex-direction: column;
			justify-content: center;
            gap: 7px;
            border-radius: 5px;
            background: #050505;
            min-height: 164px;
			max-height: 164px;
			max-width: 256px;
            padding: 5px 10px;
        }
		.quickAccess {
			gap: 5px;
			max-height: 164px;
            overflow-y: auto;
			justify-content: start;
        }

        .quickAccess div.modRowItems {
            padding: 2px!important;
        }

		#my-profile-badges {
			display: flex;
			flex-wrap: wrap;
			gap: 5px;
		}
        #my-profile-bio {
            overflow-y: scroll;
            max-height: 75px;
        }

        .brand_wrapper {
            position: relative;
            height: 72px;
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
        }
		.brand_wrapper span {
			font-size: 24px;
			z-index: 2;
			font-family: "Titillium Web", sans-serif;
			font-weight: 600;
			letter-spacing: 3px;
		}

        .brand_img {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 72px;
            border-radius: 10px;
            object-fit: cover;
            object-position: center;
            z-index: 1;
            box-shadow: 0 0 10px #000;
        }
		.brand_credits {
			position: relative;
			font-size: 16px;
			color: #D3A7FF;
			list-style: none;
			width: 100%;
			display: flex;
			justify-content: space-between;
			padding: 0 24px;
		}

		.brand_credits li {
			position: relative;
			display: inline-block;
			text-shadow: 0px 0px 8px #D3A7FF;
		}

		.brand_credits li:not(:last-child)::after {
			content: '•';
			position: absolute;
			right: -20px;
			color: #D3A7FF;
		}
        .brand_yt {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
        }
        .yt_wrapper {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            width: 122px;
            padding: 5px;
            background-color: #B63333;
            border-radius: 15px;
            cursor: pointer;
        }
        .yt_wrapper span {
            user-select: none;
        }

        .hidden_full {
            display: none !important;
            visibility: hidden;
        }

        .mod_overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100vh;
            background: rgba(0, 0, 0, .7);
            z-index: 9999999;
            display: flex;
            justify-content: center;
            align-items: center;
            transition: all .3s ease;
        }

		.black_overlay {
			background: rgba(0, 0, 0, 0);
			z-index: 99999999;
			opacity: 1;
			animation: 2s ease fadeInBlack forwards;
		}

		@keyframes fadeInBlack {
			0% {
				background: rgba(0, 0, 0, 0);
			}
			100% {
				background: rgba(0, 0, 0, 1);
			}
		}

		.default-modal {
            position: relative;
            display: flex;
            flex-direction: column;
			min-width: 300px;
            background: #111;
			color: #fafafa;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 5px 10px #000;
		}

		.default-modal-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			background: #1c1c1c;
			padding: 5px 10px;
		}

		.default-modal-header h2 {
			margin: 0;
		}

		.default-modal-body {
			display: flex;
			flex-direction: column;
			gap: 6px;
			padding: 15px;
		}

        .tournament-overlay-info {
            display: flex;
            flex-direction: column;
            align-items: center;
            color: white;
            font-size: 28px;
            line-height: 1.4;
        }

        .tournament-overlay-info img {
            margin-bottom: 26px;
        }

        .tournaments-wrapper {
		    font-family: 'Titillium Web', sans-serif;
			font-weight: 400;
            position: absolute;
            top: 60%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #000;
            border: 2px solid #222222;
            border-radius: 1.125rem;
            padding: 1.5rem;
            color: #fafafa;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            min-width: 632px;
            opacity: 0;
            transition: all .3s ease;
            animation: 0.5s ease fadeIn forwards;
        }
        @keyframes fadeIn {
            0% {
                top: 60%;
                opacity: 0;
            }
            100% {
                top: 50%;
                opacity: 1;
            }
        }
        .tournaments h1 {
            margin: 0;
			font-weight: 600;
        }

		.teamCards {
			display: flex;
			gap: 5px;
			position: absolute;
			top: 50%;
			transform: translate(-50%, -50%);
		}
        .teamCard {
            display: flex;
            flex-direction: column;
            align-items: center;
			background: rgba(0, 0, 0, 0.4);
			border-radius: 12px;
			padding: 6px;
			height: fit-content;
        }
		.teamCard.userReady {
			border: 2px solid var(--green);
		}
        .teamCard img {
            border-radius: 50%;
        }
		.teamCard span {
			font-size: 12px;
		}

		.redTeam {
			left: 81%;
		}

		.blueTeam {
			left: 24%;
		}

		.lastOneStanding_list {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			width: 100%;
			height: 240px;
			max-height: 240px;
			background: #050505;
		}

        .tournament_timer {
			position: absolute;
			top: 20px;
			left: 50%;
			transform: translateX(-50%);
            color: #fff;
            font-size: 15px;
			z-index: 99999;
			user-select: none;
			pointer-events: none;
        }

        details {
          border: 1px solid #aaa;
          border-radius: 4px;
          padding: 0.5em 0.5em 0;
          user-select: none;
          text-align: start;
        }

        summary {
          font-weight: bold;
          margin: -0.5em -0.5em 0;
          padding: 0.5em;
        }

        details[open] {
          padding: 0.5em;
        }

        details[open] summary {
          border-bottom: 1px solid #aaa;
          margin-bottom: 0.5em;
        }
        button[disabled] {
            filter: grayscale(1);
        }

		.tournament-text-lost,
		.tournament-text-won {
			font-size: 6rem;
			font-weight: 600;
			font-family: 'Titillium Web', sans-serif;
		}

		.tournament-text-lost {
			color: var(--red);
		}
		.tournament-text-won {
			color: var(--green);
		}

        .tournament_alert {
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #151515;
            color: #fff;
            text-align: center;
            padding: 20px;
            z-index: 999999;
            border-radius: 10px;
            box-shadow: 0 0 10px #000;
            display: flex;
            gap: 10px;
        }
        .tournament-profile {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            box-shadow: 0 0 10px #000;
        }

        .tournament-text {
            color: #fff;
            font-size: 24px;
        }

        .claimedBadgeWrapper {
            background: linear-gradient(232deg, #020405 1%, #04181E 100%);
            border-radius: 10px;
            width: 320px;
            height: 330px;
            box-shadow: 0 0 40px -20px #39bdff;
            display: flex;
            flex-direction: column;
            gap: 10px;
            align-items: center;
            justify-content: center;
            color: #fff;
            padding: 10px;
        }

        .btn-cyan {
            background: #53B6CC;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            color: #fff;
            font-weight: 500;
            width: fit-content;
            padding: 5px 10px;
        }

        .playTimer {
            z-index: 2;
            position: absolute;
            top: 128px;
            left: 4px;
            color: #8d8d8d;
            font-size: 14px;
            font-weight: 500;
            user-select: none;
            pointer-events: none;
        }

        .mouseTracker {
            z-index: 2;
            position: absolute;
            top: 144px;
            left: 4px;
            color: #8d8d8d;
            font-size: 14px;
            font-weight: 500;
            user-select: none;
            pointer-events: none;
        }

        .modInput-wrapper {
          position: relative;
          display: inline-block;
          width: 100%;
        }

        .modInput-secondary {
          display: inline-block;
          width: 100%;
          padding: 10px 0 10px 15px;
          font-weight: 400;
          color: #E9E9E9;
          background: #050505;
          border: 0;
          border-radius: 3px;
          outline: 0;
          text-indent: 70px;
          transition: all .3s ease-in-out;
        }
        .modInput-secondary.t-indent-120 {
            text-indent: 120px;
        }
        .modInput-secondary::-webkit-input-placeholder {
          color: #050505;
          text-indent: 0;
          font-weight: 300;
        }
        .modInput-secondary + label {
          display: inline-block;
          position: absolute;
          top: 8px;
          left: 0;
          bottom: 8px;
          padding: 5px 15px;
          color: #E9E9E9;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          text-shadow: 0 1px 0 rgba(19, 74, 70, 0);
          transition: all .3s ease-in-out;
          border-radius: 3px;
          background: rgba(122, 134, 184, 0);
        }
        .modInput-secondary + label:after {
          position: absolute;
          content: "";
          width: 0;
          height: 0;
          top: 100%;
          left: 50%;
          margin-left: -3px;
          border-left: 3px solid transparent;
          border-right: 3px solid transparent;
          border-top: 3px solid rgba(122, 134, 184, 0);
          transition: all .3s ease-in-out;
        }

        .modInput-secondary:focus,
        .modInput-secondary:active {
          color: #E9E9E9;
          text-indent: 0;
          background: #050505;
        }
        .modInput-secondary:focus::-webkit-input-placeholder,
        .modInput-secondary:active::-webkit-input-placeholder {
          color: #aaa;
        }
        .modInput-secondary:focus + label,
        .modInput-secondary:active + label {
          color: #fff;
          text-shadow: 0 1px 0 rgba(19, 74, 70, 0.4);
          background: #7A86B8;
          transform: translateY(-40px);
        }
        .modInput-secondary:focus + label:after,
        .modInput-secondary:active + label:after {
          border-top: 4px solid #7A86B8;
        }

        /* Friends & account */

        .signIn-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100vh;
            background: rgba(0, 0, 0, .4);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #E3E3E3;
            opacity: 0;
            transition: all .3s ease;
        }

        .signIn-wrapper {
            background: #111111;
            width: 450px;
            display: flex;
            flex-direction: column;
            align-items: center;
            border-radius: 10px;
            color: #fafafa;
        }

        .signIn-header {
            background: #181818;
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            border-radius: 10px 10px 0 0;
        }
        .signIn-header span {
            font-weight: 500;
            font-size: 20px;
        }

        .signIn-body {
            display: flex;
            flex-direction: column;
            gap: 10px;
            align-items: center;
            justify-content: start;
            padding: 40px 40px 5px 40px;
            width: 100%;
        }

        #errMessages {
            color: #AC3D3D;
            flex-direction: column;
            gap: 5px;
        }

        .friends_header {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            width: 100%;
            padding: 10px;
        }

        .friends_body {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            width: 100%;
            height: 360px;
            max-height: 360px;
            overflow-y: auto;
            padding-right: 10px;
        }
        .allusers {
            padding: 0;
        }

        #users-container {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            width: 100%;
            height: 340px;
            max-height: 340px;
            overflow-y: auto;
            padding-right: 10px;
        }

        .profile-img {
            position: relative;
            width: 52px;
            height: 52px;
            border-radius: 100%;
            border: 1px solid #C8C9D9;
        }

        .profile-img img {
            width: 100%;
            height: 100%;
            border-radius: 100%;
        }

        .status_icon {
            position: absolute;
            width: 15px;
            height: 15px;
            top: 0;
            left: 0;
            border-radius: 50%;
        }

        .online_icon {
            background-color: #3DB239;
        }
        .offline_icon {
            background-color: #B23939;
        }
        .Owner_role {
            color: #3979B2;
        }
        .Moderator_role {
            color: #39B298;
        }
        .Vip_role {
            color: #E1A33E;
        }

        .friends_row {
            display: flex;
            flex-direction: row;
            width: 100%;
            justify-content: space-between;
            align-items: center;
            background: #090909;
            border-radius: 8px;
            padding: 10px;
        }

        .friends_row .val {
            width: fit-content;
            height: fit-content;
            padding: 5px 20px;
            box-sizing: content-box;
        }

        .user-profile-wrapper {
            cursor: pointer;
        }
        .user-profile-wrapper > .centerY.g-5 {
            pointer-events: none;
            user-select: none;
            cursor: pointer;
        }

        .textarea-container {
            position: relative;
            width: 100%;
        }
        .textarea-container textarea {
            width: 100%;
            height: 120px;
            resize: none;
        }
        .char-counter {
            position: absolute;
            bottom: 5px;
            right: 5px;
            color: gray;
        }

        .mod_badges {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }

        .mod_badge {
            width: fit-content;
            background: #222;
            color: #fafafa;
            padding: 2px 7px;
            border-radius: 9px;
        }

        .friends-chat-wrapper {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #111111;
            display: flex;
            flex-direction: column;
            z-index: 999;
            opacity: 0;
            transition: all .3s ease;
        }

        .friends-chat-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #050505;
            width: 100%;
            padding: 8px;
            height: 68px;
        }

        .friends-chat-body {
            height: calc(100% - 68px);
            display: flex;
            flex-direction: column;
        }

        .friends-chat-messages {
            height: 300px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 10px;
        }
        .friends-message {
            background: linear-gradient(180deg, rgb(12 12 12), #000);
            padding: 8px;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
			min-width: 80px;
            max-width: 200px;
            width: fit-content;
        }

        .message-date {
            color: #8a8989;
            font-size: 11px;
        }

        .message-right {
            align-self: flex-end;
        }

        .messenger-wrapper {
            width: 100%;
            height: 60px;
            padding: 10px;
        }
        .messenger-wrapper .container {
            display: flex;
            flex-direction: row;
            gap: 10px;
            width: 100%;
            background: #0a0a0a;
            padding: 10px 5px;
            border-radius: 10px;
        }

        .messenger-wrapper .container input {
            padding: 5px;
        }
        .messenger-wrapper .container button {
            width: 150px;
        }

        /* deathscreen challenges */

        #menu-wrapper {
            overflow-x: visible;
            overflow-y: visible;
        }

        .challenges_deathscreen {
            width: 450px;
            background: rgb(21, 21, 21);
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 7px;
            border-radius: 10px;
            margin-bottom: 15px;
        }

        .challenges-col {
            display: flex;
            flex-direction: column;
            gap: 4px;
            align-items: center;
            width: 100%;
        }
        .challenge-row {
            display: flex;
            align-items: center;
            background: rgba(0, 0, 0, .4);
            justify-content: space-between;
            padding: 5px 10px;
            border-radius: 4px;
            width: 100%;
        }

        .challenges-title {
            font-size: 16px;
            font-weight: 600;
        }

        .challenge-best-secondary {
            background: #1d1d1d;
            border-radius: 10px;
            text-align: center;
            padding: 5px 8px;
            min-width: 130px;
        }
        .challenge-collect-secondary {
            background: #4C864B;
            border-radius: 10px;
            text-align: center;
            padding: 5px 8px;
            outline: none;
            border: none;
            min-width: 130px;
        }

        .alwan__reference {
            border-width: 2px !important;
        }

		#mod-announcements {
			display: flex;
			flex-direction: column;
			gap: 6px;
			max-height: 144px;
			overflow-y: auto;
		}

		.mod-announcement {
			background: #111111;
			border-radius: 4px;
			display: flex;
			gap: 3px;
			width: 100%;
			cursor: pointer;
			padding: 5px 8px;
		}

		.mod-announcement-icon {
			border-radius: 50%;
			width: 35px;
			height: 35px;
			align-self: center;
		}

		.mod-announcement-text {
			display: flex;
			flex-direction: column;
			gap: 3px;
			overflow: hidden;
			flex-grow: 1;
		}

		.mod-announcement-text > * {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}

		.mod-announcement-text span {
			font-size: 14px;
			color: #ffffff;
			flex-shrink: 0;
		}

		.mod-announcement-text p {
			font-size: 10px;
			color: #898989;
			flex-shrink: 0;
			margin: 0;
		}

		.mod-announcements-wrapper {
			display: flex;
			flex-direction: column;
			gap: 10px;
		}

		.mod-announcement-content {
			display: flex;
			justify-content: space-between;
			gap: 10px;
			background-color: #050505;
			padding: 10px;
			border-radius: 10px;
			background-image: url('https://czrsd.com/static/general/bg_blur.png');
			background-repeat: no-repeat;
			background-position: 300px 40%;
			background-size: cover;
		}

		.mod-announcement-content p {
			text-align: justify;
			max-height: 330px;
			overflow-y: auto;
			padding-right: 10px;
		}

		.mod-announcement-images {
			display: flex;
			flex-direction: column;
			gap: 20px;
			min-width: 30%;
			width: 30%;
			max-height: 330px;
			padding-right: 10px;
			overflow-y: auto;
		}

		.mod-announcement-images img {
			border-radius: 5px;
			cursor: pointer;
		}

		#image-gallery {
			display: flex;
			flex-wrap: wrap;
			gap: 5px;
		}

		.image-container {
			display: flex;
			flex-direction: column;
		}

		.image-container img {
			width: 172px;
			height: auto;
			aspect-ratio: 16 / 9;
			border-radius: 5px;
			cursor: pointer;
		}

		.download_btn {
			background: url('https://czrsd.com/static/sigmod/icons/download.svg');

		}

		.delete_btn {
			background: url('https://czrsd.com/static/sigmod/icons/trash-bin.svg');
		}

		.operation_btn {
			background-size: contain;
			background-repeat: no-repeat;
			border: none;
			width: 22px;
			height: 22px;
		}

		.sigmod-community {
			display: flex;
			flex-direction: column;
			margin: auto;
			border-radius: 10px;
			width: 50%;
			align-self: center;
			font-size: 19px;
			overflow: hidden;
		}

		.community-header {
			background: linear-gradient(179deg, #000000, #0c0c0c);
			text-align: center;
			font-family: "Titillium Web", sans-serif;
			padding: 6px;
		}

		.community-discord-logo {
			background: rgb(88, 101, 242);
			padding: 5px 12px;
		}
		.community-discord {
			text-align: center;
			padding: 10px;
			background: #0c0c0c;
			width: 100%;
		}
		.community-discord a {
			font-family: "Titillium Web", sans-serif;
		}

		/* common */
        .flex {
             display: flex;
        }
        .centerX {
             display: flex;
             justify-content: center;
        }
        .centerY {
             display: flex;
             align-items: center;
        }
        .centerXY {
             display: flex;
             align-items: center;
             justify-content: center
        }
        .f-column {
             display: flex;
             flex-direction: column;
        }
		mx-5 {
			margin: 0 5px;
		}
        .my-5 {
            margin: 5px 0;
        }
		.mt-auto {
			margin-top: auto !important;
		}
        .g-2 {
            gap: 2px;
        }
        .g-5 {
            gap: 5px;
        }
        .g-10 {
            gap: 10px;
        }
        .p-2 {
            padding: 2px;
        }
        .p-5 {
            padding: 5px;
        }
        .p-10 {
            padding: 10px;
        }
        .rounded {
            border-radius: 10px;
        }
        .text-center {
            text-align: center;
        }
        .f-big {
            font-size: 18px;
        }
        .hidden {
             display: none;
        }
            `;
        },
        respawnTime: Date.now(),
        respawnCooldown: 1000,
        get friends_settings() {
            return this._friends_settings;
        },
        set friends_settings(value) {
            this._friends_settings = value;
            window.sigmod.friends_settings = value;
        },
        get friend_names() {
            return this._friend_names;
        },

        set friend_names(value) {
            this._friend_names = value;
            window.sigmod.friend_names = value;
        },

        async game() {
            const { fillRect, fillText, strokeText, arc, drawImage } =
                CanvasRenderingContext2D.prototype;

            const showPosition = byId('showPosition');
            if (showPosition && !showPosition.checked) showPosition.click();

            const loadStorage = () => {
                if (modSettings.virusImage) {
                    loadVirusImage(modSettings.virusImage);
                }

                if (modSettings.game.skins.original !== null) {
                    loadSkinImage(
                        modSettings.game.skins.original,
                        modSettings.game.skins.replacement,
                    );
                }
            };

            loadStorage();

            let cachedPattern = null;
            let patternCanvas = null;
            let isUpdatingPattern = false;

            function updatePattern(ctx) {
                isUpdatingPattern = true;
                loadPattern(ctx)
                    .then((pattern) => {
                        if (mods.mapImageLoaded) {
                            cachedPattern = pattern;
                            ctx.fillStyle = cachedPattern;
                            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                        } else {
                            clearPattern(ctx);
                        }
                        isUpdatingPattern = false;
                    })
                    .catch((e) => {
                        console.error('Error loading map image:', e);
                        clearPattern(ctx);
                        isUpdatingPattern = false;
                    });
            }

            function loadPattern(ctx) {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.src = modSettings.game.map.image;
                    img.crossOrigin = 'Anonymous';

                    img.onload = () => {
                        if (!patternCanvas) {
                            patternCanvas = document.createElement('canvas');
                        }
                        patternCanvas.width = img.width;
                        patternCanvas.height = img.height;
                        const patternCtx = patternCanvas.getContext('2d');
                        patternCtx.drawImage(img, 0, 0);

                        const imageData = patternCtx.getImageData(
                            0,
                            0,
                            patternCanvas.width,
                            patternCanvas.height,
                        );
                        const data = imageData.data;
                        mods.mapImageLoaded = !Array.from(data).some(
                            (_, i) => i % 4 === 3 && data[i] < 255,
                        );

                        if (mods.mapImageLoaded) {
                            resolve(ctx.createPattern(patternCanvas, 'no-repeat'));
                        } else {
                            resolve(null);
                        }
                    };

                    img.onerror = () => reject(new Error('Failed to load image.'));
                });
            }

            function clearPattern(ctx) {
                isUpdatingPattern = true;
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                ctx.fillStyle = modSettings.game.map.color || '#111111';
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                isUpdatingPattern = false;
            }

            window.addEventListener('resize', () => {
                const canvas = document.getElementById('canvas');
                if (canvas && modSettings.game.map.image) {
                    updatePattern(canvas.getContext('2d'));
                }
            });

            /* CanvasRenderingContext2D.prototype */

            CanvasRenderingContext2D.prototype.fillRect = function(
                x,
                y,
                width,
                height,
            ) {
                if (this.canvas.id !== 'canvas') return fillRect.apply(this, arguments);

                const isCanvasSize =
                    (width + height) / 2 === (window.innerWidth + window.innerHeight) / 2;

                if (isCanvasSize) {
                    if (modSettings.game.map.image && !mods.mapImageLoaded) {
                        mods.mapImageLoaded = true;
                        updatePattern(this);
                    } else if (!modSettings.game.map.image || !mods.mapImageLoaded) {
                        if (!isUpdatingPattern) {
                            clearPattern(this);
                        }
                    } else {
                        this.fillStyle =
                            cachedPattern || modSettings.game.map.color || '#111111';
                    }
                }

                fillRect.apply(this, arguments);
            };

            CanvasRenderingContext2D.prototype.arc = function(
                x,
                y,
                radius,
                startAngle,
                endAngle,
                anticlockwise,
            ) {
                if (!this.canvas.id === 'canvas') return;

                if (radius >= 86 && modSettings.game.cellColor) {
                    this.fillStyle = modSettings.game.cellColor;
                } else if (radius <= 20 && modSettings.game.foodColor !== null) {
                    this.fillStyle = modSettings.game.foodColor;
                    this.strokeStyle = modSettings.game.foodColor;
                }

                arc.apply(this, arguments);
            };

            CanvasRenderingContext2D.prototype.fillText = function(text, x, y) {
                if (!this.canvas.id === 'canvas') return;

                const currentFontSizeMatch = this.font.match(/^(\d+)px/);
                const fontSize = currentFontSizeMatch ? currentFontSizeMatch[0] : '';

                this.font = `${fontSize} ${modSettings.game.font || 'Ubuntu'}`;

                if (
                    text === mods.nick &&
                    !modSettings.game.name.gradient.enabled &&
                    modSettings.game.name.color !== null
                ) {
                    this.fillStyle = modSettings.game.name.color;
                }

                if (text === mods.nick && modSettings.game.name.gradient.enabled) {
                    const width = this.measureText(text).width;
                    const fontSize = 8;
                    const gradient = this.createLinearGradient(
                        x - width / 2 + fontSize / 2,
                        y,
                        x + width / 2 - fontSize / 2,
                        y + fontSize,
                    );

                    const color1 = modSettings.game.name.gradient.left ?? '#ffffff';
                    const color2 = modSettings.game.name.gradient.right ?? '#ffffff';

                    gradient.addColorStop(0, color1);
                    gradient.addColorStop(1, color2);

                    this.fillStyle = gradient;
                }

                if (text.startsWith('Score') && !window.sigifx) {
                    if (Date.now() - lastGetScore >= 250) {
                        const score = parseInt(text.split(': ')[1]);

                        mods.cellSize = score;

                        mods.aboveRespawnLimit = score >= 5500;

                        lastGetScore = Date.now();
                    }
                }

                if (text.startsWith('X:')) {
                    this.fillStyle = 'transparent';

                    const [, xValue, yValue] = /X: (.*), Y: (.*)/.exec(text) || [];
                    if (!xValue) return;

                    const position = { x: parseFloat(xValue), y: parseFloat(yValue) };

                    if (menuClosed() && !isDead()) {
                        if (position.x === 0 && position.y === 0) return;

                        playerPosition.x = position.x;
                        playerPosition.y = position.y;

                        // send position every 300 milliseconds
                        if (Date.now() - lastPosTime >= 300) {
                            if (client.readyState === 1) {
                                client.send({
                                    type: 'position',
                                    content: {
                                        x: playerPosition.x,
                                        y: playerPosition.y,
                                        nick: mods.nick,
                                        sid: client.id,
                                    },
                                });
                            }
                            lastPosTime = Date.now();
                        }
                    } else if (isDead() && !dead2) {
                        dead2 = true;
                        playerPosition.x = null;
                        playerPosition.y = null;
                        client.send({
                            type: 'position',
                            content: [null, null, null, client.id],
                        });
                    }
                }

                if (modSettings.game.removeOutlines) {
                    this.shadowBlur = 0;
                    this.shadowColor = 'transparent';
                }

                if (text.length > 18 && modSettings.game.shortenNames) {
                    arguments[0] = text.slice(0, 18) + '...';
                }

                // only for leaderboard
                const name = text.match(/\d+\.\s*(.+)/)?.[1];

                if (
                    name &&
                    mods.friend_names.has(name) &&
                    mods.friends_settings.highlight_friends
                ) {
                    this.fillStyle = mods.friends_settings.highlight_color;
                }

                fillText.apply(this, arguments);
            };

            CanvasRenderingContext2D.prototype.strokeText = function(text, x, y) {
                if (!this.canvas.id === 'canvas') return;

                const currentFontSizeMatch = this.font.match(/^(\d+)px/);
                const fontSize = currentFontSizeMatch ? currentFontSizeMatch[0] : '';

                this.font = `${fontSize} ${modSettings.game.font || 'Ubuntu'}`;

                if (text.length > 18 && modSettings.game.shortenNames) {
                    arguments[0] = text.slice(0, 18) + '...';
                }

                if (modSettings.game.removeOutlines) {
                    this.shadowBlur = 0;
                    this.shadowColor = 'transparent';
                } else {
                    this.shadowBlur = 7;
                    this.shadowColor = '#000';
                }

                strokeText.apply(this, arguments);
            };

            CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
                if (this.canvas.id !== 'canvas')
                    return drawImage.call(this, image, ...args);

                if (
                    image.src &&
                    (image.src.endsWith('2.png') || image.src.endsWith('2-min.png')) &&
                    modSettings.game.virusImage
                ) {
                    if (mods.virusImageLoaded) {
                        return drawImage.call(this, mods.virusImage, ...args);
                    } else {
                        loadVirusImage(modSettings.game.virusImage).then(() => {
                            drawImage.call(this, mods.virusImage, ...args);
                        });
                        return;
                    }
                }

                if (
                    image instanceof HTMLImageElement &&
                    modSettings.game.skins.original &&
                    image.src.includes(`${modSettings.game.skins.original}.png`)
                ) {
                    if (mods.skinImageLoaded) {
                        return drawImage.call(this, mods.skinImage, ...args);
                    } else {
                        loadSkinImage(
                            modSettings.game.skins.original,
                            modSettings.game.skins.replacement,
                        ).then(() => {
                            drawImage.call(this, mods.skinImage, ...args);
                        });
                        return;
                    }
                }

                drawImage.call(this, image, ...args);
            };

            function loadVirusImage(imgSrc) {
                return new Promise((resolve, reject) => {
                    const replacementVirus = new Image();
                    replacementVirus.src = imgSrc;
                    replacementVirus.crossOrigin = 'Anonymous';

                    replacementVirus.onload = () => {
                        mods.virusImage = replacementVirus;
                        mods.virusImageLoaded = true;
                        resolve();
                    };

                    replacementVirus.onerror = () => {
                        console.error('Failed to load virus image.');
                        reject(new Error('Failed to load virus image.'));
                    };
                });
            }

            function loadSkinImage(originalSkinName, replacementImgSrc) {
                return new Promise((resolve, reject) => {
                    const replacementSkin = new Image();
                    replacementSkin.src = replacementImgSrc;
                    replacementSkin.crossOrigin = 'Anonymous';

                    replacementSkin.onload = () => {
                        mods.skinImage = replacementSkin;
                        mods.skinImageLoaded = true;
                        resolve();
                    };

                    replacementSkin.onerror = () =>
                        reject(new Error('Failed to load skin image.'));
                });
            }

            const modals = {
                map: {
                    title: 'Map Image',
                    applyId: 'apply-map-image',
                    resetId: 'reset-map-image',
                    previewId: 'preview-mapImage',
                    modalId: 'map-modal',
                    storagePath: 'game.map.image',
                },
                virus: {
                    title: 'Virus Image',
                    applyId: 'apply-virus-image',
                    resetId: 'reset-virus-image',
                    previewId: 'preview-virusImage',
                    modalId: 'virus-modal',
                    storagePath: 'game.virusImage',
                },
                skin: {
                    title: 'Skin Replacement',
                    applyId: 'apply-skin-image',
                    resetId: 'reset-skin-image',
                    previewId: 'preview-skinImage',
                    modalId: 'skin-modal',
                    storagePath: ['game.skins.original', 'game.skins.replacement'],
                    additional: true,
                },
            };

            function createModal({
                                     title,
                                     applyId,
                                     resetId,
                                     previewId,
                                     modalId,
                                     additional,
                                 }) {
                const additionalContent = additional
                    ? `
					<span>Select a skin that should be replaced:</span>
					<select class="form-control" id="skin-list"></select>
					<span style="font-size: 12px;">Replacement image - Enter an image URL:</span>
				`
                    : `
					<span>Enter an image URL:</span>
				`;

                return `
					<div class="default-modal">
						<div class="default-modal-header">
							<h2>${title}</h2>
							<button class="btn closeBtn" id="closeCustomModal">
								<svg width="22" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M1.6001 14.4L14.4001 1.59998M14.4001 14.4L1.6001 1.59998" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
								</svg>
							</button>
						</div>
						<div class="default-modal-body">
							${additionalContent}
							<div class="centerXY g-10">
								<input type="text" placeholder="https://i.imgur/..." class="form-control" id="image-url" />
								<div class="imagePreview" id="${previewId}" title="Image Preview">
									<span class="no-preview">No Preview Available</span>
								</div>
							</div>
							<div class="centerXY g-10">
								<button type="button" class="modButton-black" id="${applyId}">Apply Image</button>
								<button type="button" class="resetButton" title="Reset ${title.toLowerCase()}" id="${resetId}"></button>
							</div>
						</div>
					</div>
				`;
            }

            function setupModalEvents(id, type) {
                byId(id).addEventListener('click', async () => {
                    mods.customModal(createModal(modals[type]), modals[type].modalId);
                    document
                        .querySelector('#closeCustomModal')
                        .addEventListener('click', () => closeModal(type));

                    const modal = modals[type];
                    const imageUrlInput = byId('image-url');

                    let initialUrl = '';
                    if (modal.additional && type === 'skin') {
                        const [originalPath, replacementPath] = modal.storagePath;
                        initialUrl = getNestedValue(modSettings, replacementPath) || '';
                        byId('skin-list').value =
                            getNestedValue(modSettings, originalPath) || '';
                    } else {
                        initialUrl = getNestedValue(modSettings, modal.storagePath) || '';
                    }
                    imageUrlInput.value = initialUrl;
                    updatePreview(initialUrl);

                    imageUrlInput.addEventListener('input', (e) => {
                        updatePreview(e.target.value);
                    });

                    byId(modal.applyId).addEventListener('click', () =>
                        applyChanges(type),
                    );
                    byId(modal.resetId).addEventListener('click', () =>
                        resetChanges(type),
                    );

                    if (type === 'skin') {
                        const skinList = byId('skin-list');
                        const skins =
                            mods.skins.length > 0
                                ? mods.skins
                                : await fetch('https://one.sigmally.com/api/skins')
                                    .then((response) => response.json())
                                    .then((data) => {
                                        const skinNames = data.data.map((item) =>
                                            item.name.replace('.png', ''),
                                        );
                                        mods.skins = skinNames;
                                        return skinNames;
                                    });

                        skinList.innerHTML = skins
                            .map(
                                (skin) =>
                                    `<option value="${skin}" ${skin === modSettings.game.skins.original ? 'selected' : ''}>${skin}</option>`,
                            )
                            .join('');
                    }
                });
            }

            function getNestedValue(obj, path) {
                return path.split('.').reduce((acc, part) => acc && acc[part], obj);
            }

            function setNestedValue(obj, path, value) {
                const parts = path.split('.');
                const last = parts.pop();
                const target = parts.reduce(
                    (acc, part) => (acc[part] = acc[part] || {}),
                    obj,
                );
                target[last] = value;
            }

            function updatePreview(url) {
                const preview = document.querySelector('.imagePreview');
                const noPreviewSpan = document.querySelector('.no-preview');

                const updateVisibility = (showPreview) => {
                    preview.style.backgroundImage = showPreview ? `url(${url})` : 'none';
                    noPreviewSpan.style.display = showPreview ? 'none' : 'block';
                };

                if (url) {
                    const img = new Image();
                    img.src = url;
                    img.onload = () => updateVisibility(true);
                    img.onerror = () => updateVisibility(false);
                } else {
                    updateVisibility(false);
                }
            }

            function applyChanges(type) {
                let { title, storagePath, additional } = modals[type];
                const url = byId('image-url').value;

                mods[`${type}ImageLoaded`] = false;

                if (additional && type === 'skin') {
                    const selectedSkin = byId('skin-list').value;
                    setNestedValue(modSettings, storagePath[0], selectedSkin);
                    setNestedValue(modSettings, storagePath[1], url);
                } else {
                    setNestedValue(modSettings, storagePath, url);
                }

                updateStorage();

                mods.modAlert(`Successfully applied ${title}.`, 'success');
            }

            function resetChanges(type) {
                const { title, storagePath, additional } = modals[type];

                if (additional && type === 'skin') {
                    setNestedValue(modSettings, storagePath[0], null);
                    setNestedValue(modSettings, storagePath[1], null);
                } else {
                    setNestedValue(modSettings, storagePath, null);
                }

                mods[`${type}ImageLoaded`] = false;

                updateStorage();

                mods.modAlert(`The ${title} has been successfully reset.`, 'success');
            }

            function closeModal(type) {
                const overlay = byId(`${type}-modal`);
                overlay.style.opacity = 0;
                setTimeout(() => overlay.remove(), 300);
            }

            setupModalEvents('mapImageSelect', 'map');
            setupModalEvents('virusImageSelect', 'virus');
            setupModalEvents('skinReplaceSelect', 'skin');

            const shortenNames = byId('shortenNames');
            const removeOutlines = byId('removeOutlines');

            shortenNames.addEventListener('change', () => {
                modSettings.game.shortenNames = shortenNames.checked;
                updateStorage();
            });
            removeOutlines.addEventListener('change', () => {
                modSettings.game.removeOutlines = removeOutlines.checked;
                updateStorage();
            });

            const showNames = byId('mod-showNames');
            const showSkins = byId('mod-showSkins');

            const originalShowNames = byId('showNames');
            const originalShowSkins = byId('showSkins');

            function syncCheckboxes() {
                if (showNames.checked !== originalShowNames.checked) {
                    originalShowNames.click();
                }
                if (showSkins.checked !== originalShowSkins.checked) {
                    originalShowSkins.click();
                }
            }

            showNames.addEventListener('change', syncCheckboxes);
            showSkins.addEventListener('change', syncCheckboxes);

            const deathScreenPos = byId('deathScreenPos');
            const deathScreen = byId('__line2');

            const applyMargin = (position) => {
                switch (position) {
                    case 'left':
                        deathScreen.style.marginLeft = '0';
                        break;
                    case 'right':
                        deathScreen.style.marginRight = '0';
                        break;
                    case 'top':
                        deathScreen.style.marginTop = '20px';
                        break;
                    case 'bottom':
                        deathScreen.style.marginBottom = '20px';
                        break;
                    default:
                        deathScreen.style.margin = 'auto';
                }
            };

            deathScreenPos.addEventListener('change', () => {
                const selected = deathScreenPos.value;
                applyMargin(selected);
                modSettings.deathScreenPos = selected;
                updateStorage();
            });

            const defaultPosition = modSettings.deathScreenPos || 'center';

            applyMargin(defaultPosition);
            deathScreenPos.value = defaultPosition;
        },

        customModal(children, id, zindex = '999999') {
            const overlay = document.createElement('div');
            overlay.classList.add('mod_overlay');
            id && overlay.setAttribute('id', id);
            overlay.innerHTML = children;
            overlay.style.zIndex = zindex;
            overlay.style.opacity = 0;

            document.body.append(overlay);

            setTimeout(() => {
                overlay.style.opacity = '1';
            });

            const handleClickOutside = (e) => {
                if (e.target === overlay) {
                    overlay.style.opacity = 0;
                    setTimeout(() => {
                        overlay.remove();
                        document.removeEventListener('click', handleClickOutside);
                    }, 300);
                }
            };

            document.addEventListener('click', handleClickOutside);
        },

        handleGoogleAuth(user) {
            fetchedUser++;

            window.gameSettings.user = user;

            if (client.ws) {
                client.send({
                    type: 'user',
                    content: user,
                });
            }

            fetch(mods.appRoutes.user, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    user: user,
                    nick: mods.nick,
                }),
            });

            const claim = document.getElementById('free-chest-button');
            if (
                fetchedUser === 1 &&
                modSettings.settings.autoClaimCoins &&
                claim &&
                claim.style.display !== 'none'
            ) {
                setTimeout(() => claim.click(), 500);
            }
        },

        async menu() {
            const mod_menu = document.createElement('div');
            mod_menu.classList.add('mod_menu');
            mod_menu.style.display = 'none';
            mod_menu.style.opacity = '0';
            mod_menu.innerHTML = `
                <div class="mod_menu_wrapper">
                    <div class="mod_menu_header">
                        <img alt="Header image" src="${headerAnim}" draggable="false" class="header_img" />
                        <button type="button" class="modButton" id="closeBtn">
                            <svg width="18" height="20" viewBox="0 0 16 16" fill="#ffffff" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1.6001 14.4L14.4001 1.59998M14.4001 14.4L1.6001 1.59998" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="mod_menu_inner">
                        <div class="mod_menu_navbar">
                            <button class="mod_nav_btn mod_selected" id="tab_home_btn">
                                <img src="https://raw.githubusercontent.com/Sigmally/SigMod/main/images/icons/home%20(1).png" alt="Home Icon" />
                                Home
                            </button>
                            <button class="mod_nav_btn" id="tab_macros_btn">
                                <img src="https://raw.githubusercontent.com/Sigmally/SigMod/main/images/icons/keyboard%20(1).png" alt="Keyboard Icon" />
                                Macros
                            </button>
                            <button class="mod_nav_btn" id="tab_game_btn">
                                <img src="https://raw.githubusercontent.com/Sigmally/SigMod/main/images/icons/games.png" alt="Game Icon" />
                                Game
                            </button>
                            <button class="mod_nav_btn" id="tab_name_btn">
                                <img src="https://raw.githubusercontent.com/Sigmally/SigMod/836ca0f4c25fc6de2e429ee3583be5f860884a0c/images/icons/name.svg" alt="Name Icon" />
                                Name
                            </button>
                            <button class="mod_nav_btn" id="tab_themes_btn">
                                <img src="https://raw.githubusercontent.com/Sigmally/SigMod/main/images/icons/theme.png" alt="Themes Icon" />
                                Themes
                            </button>
                            <button class="mod_nav_btn" id="tab_gallery_btn">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="22"><path fill="#ffffff" d="M0 96C0 60.7 28.7 32 64 32l384 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zM323.8 202.5c-4.5-6.6-11.9-10.5-19.8-10.5s-15.4 3.9-19.8 10.5l-87 127.6L170.7 297c-4.6-5.7-11.5-9-18.7-9s-14.2 3.3-18.7 9l-64 80c-5.8 7.2-6.9 17.1-2.9 25.4s12.4 13.6 21.6 13.6l96 0 32 0 208 0c8.9 0 17.1-4.9 21.2-12.8s3.6-17.4-1.4-24.7l-120-176zM112 192a48 48 0 1 0 0-96 48 48 0 1 0 0 96z"/></svg>
                                Gallery
                            </button>

                            <button class="mod_nav_btn" id="tab_friends_btn">
                                <img src="https://raw.githubusercontent.com/Sigmally/SigMod/main/images/icons/friends%20(1).png" alt="Friends Icon" />
                                Friends
                            </button>
                            <button class="mod_nav_btn mt-auto" id="tab_info_btn">
                                <img src="https://raw.githubusercontent.com/Sigmally/SigMod/main/images/icons/info.png" alt="Info Icon" />
                                Info
                            </button>
                        </div>
                        <div class="mod_menu_content">
                            <div class="mod_tab" id="mod_home">
                                <span class="text-center f-big" id="welcomeUser">Welcome ${this.nick || 'Guest'}, to the SigMod Client!</span>
                                <div class="home-card-row">
									<!-- CARD.1 -->
									<div class="home-card-wrapper">
										<span>Your stats</span>
										<div class="home-card">
											<canvas id="sigmod-stats" width="200" height="100"></canvas>
										</div>
									</div>
									<!-- CARD.2 -->
									<div class="home-card-wrapper">
                                        <span>Announcements</span>
                                        <div class="home-card" style="justify-content: start;">
											<div id="mod-announcements">No announcements yet...</div>
										</div>
                                    </div>
                                </div>
                                <div class="home-card-row">
									<!-- CARD.3 -->
                                    <div class="home-card-wrapper">
                                        <span>Quick access</span>
                                        <div class="home-card quickAccess scroll" id="mod_qaccess"></div>
                                    </div>
									<!-- CARD.4 -->
                                    <div class="home-card-wrapper">
                                        <span>Mod profile</span>
                                        <div class="home-card">
                                            <div class="justify-sb">
                                                <div class="flex" style="align-items: center; gap: 5px;">
                                                    <img src="https://sigmally.com/assets/images/agario-profile.png" alt="Agar-io profile" width="50" height="50" id="my-profile-img" style="border-radius: 50%;" draggable="false" />
                                                    <span id="my-profile-name">Guest</span>
                                                </div>
                                                <span id="my-profile-role">Guest</span>
                                            </div>
											<div id="my-profile-badges"></div>
                                            <hr />
                                            <span id="my-profile-bio" class="scroll">No Bio.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="mod_tab scroll" id="mod_macros" style="display: none">
								<div class="modColItems">
                                    <div class="macros_wrapper">
                                        <span class="text-center f-big">Keybindings</span>
                                        <hr style="border-color: #3F3F3F">
                                        <div style="justify-content: center;">
                                            <div class="f-column g-10" style="align-items: center; justify-content: center;">
                                                <div class="macrosContainer">
                                                    <div class="f-column g-10">
                                                        <label class="macroRow">
                                                          <span class="text">Rapid Feed</span>
                                                          <input type="text" name="rapidFeed" id="modinput1" class="keybinding" value="${modSettings.macros.keys.rapidFeed || ''}" maxlength="1" onfocus="this.select()" placeholder="..." />
                                                        </label>
                                                        <label class="macroRow">
                                                          <span class="text">Double Split</span>
                                                          <input type="text" name="splits.double" id="modinput2" class="keybinding" value="${modSettings.macros.keys.splits.double || ''}" maxlength="1" onfocus="this.select()" placeholder="..." />
                                                        </label>
                                                        <label class="macroRow">
                                                          <span class="text">Triple Split</span>
                                                          <input type="text" name="splits.triple" id="modinput3" class="keybinding" value="${modSettings.macros.keys.splits.triple || ''}" maxlength="1" onfocus="this.select()" placeholder="..." />
                                                        </label>
                                                        <label class="macroRow">
                                                          <span class="text">Respawn</span>
                                                          <input type="text" name="respawn" id="modinput16" class="keybinding" value="${modSettings.macros.keys.respawn || ''}" maxlength="1" onfocus="this.select()" placeholder="..." />
                                                        </label>
                                                    </div>
                                                    <div class="f-column g-10">
                                                        <label class="macroRow">
                                                          <span class="text">Quad Split</span>
                                                          <input type="text" name="splits.quad" id="modinput4" class="keybinding" value="${modSettings.macros.keys.splits.quad || ''}" maxlength="1" onfocus="this.select()" placeholder="..." />
                                                        </label>
                                                        <label class="macroRow">
                                                          <span class="text">Horizontal Line</span>
                                                          <input type="text" name="line.horizontal" id="modinput5" class="keybinding" value="${modSettings.macros.keys.line.horizontal || ''}" maxlength="1" onfocus="this.select()" placeholder="..." />
                                                        </label>
                                                        <label class="macroRow">
                                                          <span class="text">Vertical Line</span>
                                                          <input type="text" name="line.vertical" id="modinput8" class="keybinding" value="${modSettings.macros.keys.line.vertical || ''}" maxlength="1" onfocus="this.select()" placeholder="..." />
                                                        </label>
                                                        <label class="macroRow">
                                                          <span class="text">Fixed Line</span>
                                                          <input type="text" name="line.fixed" id="modinput18" class="keybinding" value="${modSettings.macros.keys.line.fixed || ''}" maxlength="1" onfocus="this.select()" placeholder="..." />
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="macros_wrapper">
                                        <span class="text-center f-big">Advanced Keybinding options</span>
                                        <div class="setting-card-wrapper">
                                            <div class="setting-card">
                                                <div class="setting-card-action">
                                                    <span class="setting-card-name">Mouse macros</span>
                                                </div>
                                            </div>
                                            <div class="setting-parameters" style="display: none;">
                                                <div class="my-5">
                                                    <span class="stats-info-text">Feed or Split with mouse buttons</span>
                                                </div>
                                                <div class="stats-line justify-sb">
                                                    <span class="centerXY g-5">
                                                        Mouse Button 1
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="#ffffff" width="24px" height="24px" viewBox="0 0 356.57 356.57"><path d="M181.563,0C120.762,0,59.215,30.525,59.215,88.873V237.5c0,65.658,53.412,119.071,119.071,119.071 c65.658,0,119.07-53.413,119.07-119.071V88.873C297.356,27.809,237.336,0,181.563,0z M274.945,237.5 c0,53.303-43.362,96.657-96.659,96.657c-53.299,0-96.657-43.354-96.657-96.657v-69.513c20.014,6.055,57.685,15.215,102.221,15.215 c28.515,0,59.831-3.809,91.095-14.567V237.5z M274.945,144.794c-81.683,31.233-168.353,7.716-193.316-0.364V88.873 c0-43.168,51.489-66.46,99.934-66.46c46.481,0,93.382,20.547,93.382,66.46V144.794z M190.893,48.389v81.248 c0,6.187-5.023,11.208-11.206,11.208c-6.185,0-11.207-5.021-11.207-11.208V48.389c0-6.186,5.021-11.207,11.207-11.207 C185.869,37.182,190.893,42.203,190.893,48.389z M154.938,40.068V143.73c-15.879,2.802-62.566-10.271-62.566-10.271 C80.233,41.004,154.938,40.068,154.938,40.068z"></path></svg>
                                                    </span>
                                                    <select class="form-control macro-extanded_input" style="padding: 2px; text-align: left; width: 100px" id="m1_macroSelect">
                                                        <option value="none">None</option>
                                                        <option value="fastfeed">Fast Feed</option>
                                                        <option value="split">Split (1)</option>
                                                        <option value="split2">Double Split</option>
                                                        <option value="split3">Triple Split</option>
                                                        <option value="split4">Quad Split</option>
                                                        <option value="freeze">Horizontal Line</option>
                                                        <option value="dTrick">Double Trick</option>
                                                        <option value="sTrick">Self Trick</option>
                                                    </select>
                                                </div>
                                                <div class="stats-line justify-sb">
                                                    <span class="centerXY g-5">
                                                        Mouse Button 2
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="#ffffff" width="24px" height="24px" viewBox="0 0 356.57 356.57"><path d="M181.563,0C120.762,0,59.215,30.525,59.215,88.873V237.5c0,65.658,53.412,119.071,119.071,119.071 c65.658,0,119.07-53.413,119.07-119.071V88.873C297.356,27.809,237.336,0,181.563,0z M274.945,237.5 c0,53.303-43.362,96.657-96.659,96.657c-53.299,0-96.657-43.354-96.657-96.657v-69.513c20.014,6.055,57.685,15.215,102.221,15.215 c28.515,0,59.831-3.809,91.095-14.567V237.5z M274.945,144.794c-81.683,31.233-168.353,7.716-193.316-0.364V88.873 c0-43.168,51.489-66.46,99.934-66.46c46.481,0,93.382,20.547,93.382,66.46V144.794z M190.893,48.389v81.248 c0,6.187-5.023,11.208-11.206,11.208c-6.185,0-11.207-5.021-11.207-11.208V48.389c0-6.186,5.021-11.207,11.207-11.207 C185.869,37.182,190.893,42.203,190.893,48.389z M154.938,40.068V143.73c-15.879,2.802-62.566-10.271-62.566-10.271 C80.233,41.004,154.938,40.068,154.938,40.068z"></path></svg>
                                                    </span>
                                                    <select class="form-control" style="padding: 2px; text-align: left; width: 100px" id="m2_macroSelect">
                                                        <option value="none">None</option>
                                                        <option value="fastfeed">Fast Feed</option>
                                                        <option value="split">Split (1)</option>
                                                        <option value="split2">Double Split</option>
                                                        <option value="split3">Triple Split</option>
                                                        <option value="split4">Quad Split</option>
                                                        <option value="freeze">Horizontal Line</option>
                                                        <option value="dTrick">Double Trick</option>
                                                        <option value="sTrick">Self Trick</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
										<div class="setting-card-wrapper">
                                            <div class="setting-card">
                                                <div class="setting-card-action">
                                                    <span class="setting-card-name">Rapid feed</span>
                                                </div>
                                            </div>

                                            <div class="setting-parameters" style="display: none;">
                                                <div class="my-5">
                                                    <span class="stats-info-text">Customize feeding</span>
                                                </div>
                                                <div class="stats-line justify-sb">
                                                    <span>Speed</span>
													<div class="justify-sb g-5" style="width: 200px;">
														<span class="mod_badge" id="macroSpeedText">${modSettings.macros.feedSpeed || '50'}ms</span>
														<input
															type="range"
															class="modSlider"
															id="macroSpeed"
															min="5"
															max="100"
															value="${modSettings.macros.feedSpeed || 50}"
															step="5"
															style="width: 134px;"
														/>
													</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="setting-card-wrapper">
                                            <div class="setting-card">
                                                <div class="setting-card-action">
                                                    <span class="setting-card-name">Linesplits</span>
                                                </div>
                                            </div>

                                            <div class="setting-parameters" style="display: none;">
                                                <div class="my-5">
                                                    <span class="stats-info-text">Customize linesplits</span>
                                                </div>

                                                <div class="stats-line justify-sb">
                                                    <span>Instant split</span>
													<div class="centerXY g-5">
														<span class="modDescText">Splits - </span>
														<input type="text" class="modInput modNumberInput text-center" placeholder="0" title="Splits" style="width: 30px;" id="instant-split-amount" onclick="this.select()" />
														<div class="modCheckbox">
														  <input id="toggle-instant-split" type="checkbox" checked />
														  <label class="cbx" for="toggle-instant-split"></label>
														</div>
													</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="setting-card-wrapper">
                                            <div class="setting-card">
                                                <div class="setting-card-action">
                                                    <span class="setting-card-name">Toggle Settings</span>
                                                </div>
                                            </div>

                                            <div class="setting-parameters" style="display: none;">
                                                <div class="my-5">
                                                    <span class="stats-info-text">Toggle settings with a keybind.</span>
                                                </div>

                                                <div class="stats-line justify-sb">
                                                    <span>Toggle Menu</span>
                                                    <input type="text" name="toggle.menu" id="modinput6" class="keybinding" value="${modSettings.macros.keys.toggle.menu || ''}" maxlength="1" onfocus="this.select()" placeholder="..." />
                                                </div>

                                                <div class="stats-line justify-sb">
                                                    <span>Toggle Names</span>
                                                    <input value="${modSettings.macros.keys.toggle.names || ''}" placeholder="..." readonly id="modinput11" name="toggle.names" class="keybinding" onfocus="this.select();">
                                                </div>

                                                <div class="stats-line justify-sb">
                                                    <span>Toggle Skins</span>
                                                    <input value="${modSettings.macros.keys.toggle.skins || ''}" placeholder="..." readonly id="modinput12" name="toggle.skins" class="keybinding" onfocus="this.select();">
                                                </div>

                                                <div class="stats-line justify-sb">
                                                <span>Toggle Autorespawn</span>
                                                    <input value="${modSettings.macros.keys.toggle.autoRespawn || ''}" placeholder="..." readonly id="modinput13" name="toggle.autoRespawn" class="keybinding" onfocus="this.select();">
                                                </div>
                                            </div>
                                        </div>
                                        <div class="setting-card-wrapper">
                                            <div class="setting-card">
                                                <div class="setting-card-action">
                                                    <span class="setting-card-name">Tricksplits</span>
                                                </div>
                                            </div>
                                            <div class="setting-parameters" style="display: none;">
                                                <div class="my-5">
                                                    <span class="stats-info-text">Other split options - splits with delay</span>
                                                </div>
                                                <div class="stats-line justify-sb">
                                                    <span>Double Trick</span>
                                                    <input value="${modSettings.macros.keys.splits.doubleTrick || ''}" placeholder="..." readonly id="modinput14" name="splits.doubleTrick" class="keybinding" onfocus="this.select();">
                                                </div>
                                                <div class="stats-line justify-sb">
                                                    <span>Self Trick</span>
                                                    <input value="${modSettings.macros.keys.splits.selfTrick || ''}" placeholder="..." readonly id="modinput15" name="splits.selfTrick" class="keybinding" onfocus="this.select();">
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="mod_tab scroll" id="mod_game" style="display: none">
                                <div class="modColItems">
                                    <div class="modRowItems" style="align-items: start;">
                                        <div class="modColItems_2">
                                            <span style="font-style: italic;">~ Game Colors</span>
                                            <div class="justify-sb w-100 p-5 rounded">
                                                <span class="text">Map</span>
                                                <div id="mapColor"></div>
                                            </div>
                                            <div class="justify-sb w-100 accent_row p-5 rounded">
                                                <span class="text">Border</span>
                                                <div id="borderColor"></div>
                                            </div>
                                            <div class="justify-sb w-100 p-5 rounded">
                                                <span class="text" title="Does not work with jelly physics">Food</span>
                                                <div id="foodColor"></div>
                                            </div>
                                            <div class="justify-sb w-100 accent_row p-5 rounded">
                                                <span class="text" title="Does not work with jelly physics">Cells</span>
                                                <div id="cellColor"></div>
                                            </div>
                                        </div>
                                        <div class="modColItems_2">
                                            <span style="font-style: italic;">~ Game Images</span>
                                            <div class="justify-sb w-100 p-5 rounded">
                                                <span class="text">Map Image</span>
                                                <button class="btn select-btn" id="mapImageSelect"></button>
                                            </div>
                                            <div class="justify-sb w-100 accent_row p-5 rounded">
                                                <span class="text">Virus Image</span>
                                                <button class="btn select-btn" id="virusImageSelect"></button>
                                            </div>
                                            <div class="justify-sb w-100 p-5 rounded">
                                                <span class="text">Replace Skins</span>
                                                <button class="btn select-btn" id="skinReplaceSelect"></button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="modColItems_2">
										<span style="font-style: italic;">~ Game Settings</span>
										<div class="justify-sb w-100 accent_row p-10 rounded">
											<span class="text">Font</span>
											<div id="font-select-container"></div>
										</div>
										<div class="justify-sb w-100 p-10">
											<span class="text">Names</span>
											<div class="modCheckbox">
											  <input id="mod-showNames" type="checkbox" ${JSON.parse(localStorage.getItem('settings'))?.showNames ? 'checked' : ''} />
											  <label class="cbx" for="mod-showNames"></label>
											</div>
										</div>
										<div class="justify-sb w-100 accent_row p-10 rounded">
											<span class="text">Skins</span>
											<div class="modCheckbox">
											  <input id="mod-showSkins" type="checkbox" ${JSON.parse(localStorage.getItem('settings'))?.showSkins ? 'checked' : ''} />
											  <label class="cbx" for="mod-showSkins"></label>
											</div>
										</div>
										<div class="justify-sb w-100 p-10 rounded">
											<span title="Long nicknames will be shorten on the leaderboard & ingame">Shorten names</span>
											<div class="modCheckbox">
											  <input id="shortenNames" type="checkbox" ${modSettings.game.shortenNames && 'checked'} />
											  <label class="cbx" for="shortenNames"></label>
											</div>
										</div>
										<div class="justify-sb w-100 accent_row p-10">
											<span>Text outlines & shadows</span>
											<div class="modCheckbox">
											  <input id="removeOutlines" type="checkbox" ${modSettings.gameShortenNames && 'checked'} />
											  <label class="cbx" for="removeOutlines"></label>
											</div>
										</div>
										<div class="justify-sb w-100 rounded" style="padding: 5px 10px;">
                                        	<span class="text">Death screen Position</span>
											<select id="deathScreenPos" class="form-control" style="width: 30%">
												<option value="center" selected>Center</option>
												<option value="left">Left</option>
												<option value="right">Right</option>
												<option value="top">Top</option>
												<option value="bottom">Bottom</option>
											</select>
										</div>
										<div class="justify-sb w-100 accent_row p-10 rounded">
											<span class="text">Play timer</span>
											<div class="modCheckbox">
											  <input type="checkbox" id="playTimerToggle" ${modSettings.settings.playTimer && 'checked'} />
											  <label class="cbx" for="playTimerToggle"></label>
											</div>
										</div>
										<div class="justify-sb w-100 p-10 rounded">
											<span class="text">Mouse tracker</span>
											<div class="modCheckbox">
											  <input type="checkbox" id="mouseTrackerToggle" ${modSettings.settings.mouseTracker && 'checked'} />
											  <label class="cbx" for="mouseTrackerToggle"></label>
											</div>
										</div>
                                    </div>
                                    <div class="modRowItems justify-sb">
                                        <span class="text">Reset settings: </span>
                                        <button class="modButton-secondary" id="resetModSettings" type="button">Reset mod settings</button>
                                        <button class="modButton-secondary" id="resetGameSettings" type="button">Reset game settings</button>
                                    </div>
                                </div>
                            </div>

                            <div class="mod_tab scroll" id="mod_name" style="display: none">
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
                                            <button id="saveName" class="modButton-secondary f-big" style="border-radius: 5px; background: url('https://sigmally.com/assets/images/icon/plus.svg'); background-color: #111; background-size: 50% auto; background-repeat: no-repeat; background-position: center;"></button>
                                        </div>
                                        <div id="savedNames" class="f-column scroll"></div>
                                    </div>
                                    <div class="vr"></div>
                                    <div class="f-column g-5">
                                        <span class="modTitleText">Name Color</span>
                                        <span class="modDescText">Customize your name color</span>
                                        <div class="justify-sb">
                                            <input type="color" value="#ffffff" id="nameColor" class="colorInput">
                                        </div>
                                        <span class="modTitleText">Gradient Name</span>
                                        <span class="modDescText">Customize your name with a gradient color</span>
                                        <div class="justify-sb">
                                            <div class="flex g-2" style="align-items: center">
                                                <input type="color" value="#ffffff" id="gradientNameColor1" class="colorInput">
                                                <span>➜ First color</span>
                                            </div>
                                        </div>
                                        <div class="justify-sb">
                                            <div class="flex g-2" style="align-items: center">
                                                <input type="color" value="#ffffff" id="gradientNameColor2" class="colorInput">
                                                <span>➜ Second color</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            </div>
                            <div class="mod_tab scroll" id="mod_themes" style="display: none">
								<span>Background presets</span>
                                <div class="themes scroll" id="themes">
                                    <div class="theme" id="createTheme">
                                        <div class="themeContent" style="background: url('https://sigmally.com/assets/images/icon/plus.svg'); background-size: 50% auto; background-repeat: no-repeat; background-position: center;"></div>
                                        <div class="themeName text" style="color: #fff">Create</div>
                                    </div>
                                </div>

								<div class="modColItems_2" style="margin-top: 5px;">
									<div class="justify-sb w-100 p-10">
										<span>Input border radius</span>
										<input type="range" class="modSlider" style="width: 40%;" id="theme-inputBorderRadius" max="20" step="2" />
									</div>
									<div class="justify-sb w-100 p-10">
										<span>Menu border radius</span>
										<input type="range" class="modSlider" style="width: 40%;" id="theme-menuBorderRadius" max="50" step="2" />
									</div>
									<div class="justify-sb w-100 p-10">
										<span>Input border</span>
										<div class="modCheckbox">
										  <input id="theme-inputBorder" type="checkbox" />
										  <label class="cbx" for="theme-inputBorder"></label>
										</div>
									</div>
								</div>
                            </div>
                            <div class="mod_tab scroll" id="mod_gallery" style="display: none">
								<div class="modColItems_2">
									<label class="macroRow w-100">
									  <span class="text">Keybind to save image</span>
									  <input type="text" name="saveImage" id="modinput17" class="keybinding" value="${modSettings.macros.keys.saveImage || ''}" maxlength="1" onfocus="this.select()" placeholder="..." />
									</label>
								</div>
								<div class="modColItems_2">
									<span>Image gallery</span>
									<div class="flex g-5">
										<button class="modButton" id="gallery-download">Download all</button>
										<button class="modButton" id="gallery-delete">Delete all</button>
									</div>
									<div id="image-gallery"></div>
								</div>
                            </div>
                            <div class="mod_tab scroll centerXY" id="mod_friends" style="display: none">
                                <div class="centerXY f-big" style="margin-top: 10px;">Connect and discover new friends with SigMod.</div>
                                <div class="centerXY">Do you have problems with your account? Create a support ticket in our <a href="https://discord.gg/RjxeZ2eRGg" target="_blank">Discord server</a>.</div>

                                <div class="centerXY f-column g-5" style="height: 300px; width: 165px;">
                                    <button class="modButton-black" id="createAccount">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16"><path fill="#ffffff" d="M471.6 21.7c-21.9-21.9-57.3-21.9-79.2 0L362.3 51.7l97.9 97.9 30.1-30.1c21.9-21.9 21.9-57.3 0-79.2L471.6 21.7zm-299.2 220c-6.1 6.1-10.8 13.6-13.5 21.9l-29.6 88.8c-2.9 8.6-.6 18.1 5.8 24.6s15.9 8.7 24.6 5.8l88.8-29.6c8.2-2.7 15.7-7.4 21.9-13.5L437.7 172.3 339.7 74.3 172.4 241.7zM96 64C43 64 0 107 0 160V416c0 53 43 96 96 96H352c53 0 96-43 96-96V320c0-17.7-14.3-32-32-32s-32 14.3-32 32v96c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32V160c0-17.7 14.3-32 32-32h96c17.7 0 32-14.3 32-32s-14.3-32-32-32H96z"/></svg>
                                        Create account
                                    </button>
                                    <button class="modButton-black" id="login">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16"><path fill="#ffffff" d="M217.9 105.9L340.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L217.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1L32 320c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM352 416l64 0c17.7 0 32-14.3 32-32l0-256c0-17.7-14.3-32-32-32l-64 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l64 0c53 0 96 43 96 96l0 256c0 53-43 96-96 96l-64 0c-17.7 0-32-14.3-32-32s14.3-32 32-32z"/></svg>
                                        Login
                                    </button>
                                </div>
                            </div>
                            <div class="mod_tab scroll f-column g-5 text-center" id="mod_info" style="display: none">
                                <div class="brand_wrapper">
                                    <img src="https://czrsd.com/static/sigmod/info_bg_2.jpeg" alt="Info background" class="brand_img" />
                                    <span>SigMod V${version} by Cursed</span>
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
                                <p>for contributing to the mod’s evolution into what it is today.</p>

								<div class="sigmod-community">
									<div class="community-header">
										Community
									</div>
									<div class="flex">
										<div class="community-discord-logo">
											<svg width="31" height="30" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-top: 3px;">
												<path d="M19.4566 5.35132C21.7154 8.83814 22.8309 12.7712 22.4139 17.299C22.4121 17.3182 22.4026 17.3358 22.3876 17.3473C20.6771 18.666 19.0199 19.4663 17.3859 19.9971C17.3732 20.0011 17.3596 20.0009 17.347 19.9964C17.3344 19.992 17.3234 19.9835 17.3156 19.9721C16.9382 19.4207 16.5952 18.8393 16.2947 18.2287C16.2774 18.1928 16.2932 18.1495 16.3287 18.1353C16.8734 17.9198 17.3914 17.6615 17.8896 17.3557C17.9289 17.3316 17.9314 17.2725 17.8951 17.2442C17.7894 17.1617 17.6846 17.0751 17.5844 16.9885C17.5656 16.9725 17.5404 16.9693 17.5191 16.9801C14.2844 18.5484 10.7409 18.5484 7.46792 16.9801C7.44667 16.9701 7.42142 16.9735 7.40317 16.9893C7.30317 17.0759 7.19817 17.1617 7.09342 17.2442C7.05717 17.2725 7.06017 17.3316 7.09967 17.3557C7.59792 17.6557 8.11592 17.9198 8.65991 18.1363C8.69517 18.1505 8.71192 18.1928 8.69442 18.2287C8.40042 18.8401 8.05742 19.4215 7.67292 19.9729C7.65617 19.9952 7.62867 20.0055 7.60267 19.9971C5.97642 19.4663 4.31917 18.666 2.60868 17.3473C2.59443 17.3358 2.58418 17.3174 2.58268 17.2982C2.23418 13.3817 2.94442 9.41613 5.53717 5.35053C5.54342 5.33977 5.55292 5.33137 5.56392 5.32638C6.83967 4.71165 8.20642 4.25939 9.63491 4.00111C9.66091 3.99691 9.68691 4.00951 9.70041 4.03365C9.87691 4.36176 10.0787 4.78252 10.2152 5.12637C11.7209 4.88489 13.2502 4.88489 14.7874 5.12637C14.9239 4.78987 15.1187 4.36176 15.2944 4.03365C15.3007 4.02167 15.3104 4.01208 15.3221 4.00623C15.3339 4.00039 15.3471 3.99859 15.3599 4.00111C16.7892 4.26018 18.1559 4.71244 19.4306 5.32638C19.4419 5.33137 19.4511 5.33977 19.4566 5.35132ZM10.9807 12.798C10.9964 11.6401 10.1924 10.6821 9.18316 10.6821C8.18217 10.6821 7.38592 11.6317 7.38592 12.798C7.38592 13.9639 8.19792 14.9136 9.18316 14.9136C10.1844 14.9136 10.9807 13.9639 10.9807 12.798ZM17.6261 12.798C17.6419 11.6401 16.8379 10.6821 15.8289 10.6821C14.8277 10.6821 14.0314 11.6317 14.0314 12.798C14.0314 13.9639 14.8434 14.9136 15.8289 14.9136C16.8379 14.9136 17.6261 13.9639 17.6261 12.798Z" fill="white"></path>
											</svg>
										</div>
										<div class="community-discord">
											<a href="https://dsc.gg/sigmodz" target="_blank">dsc.gg/sigmodz</a>
										</div>
									</div>
								</div>

                                <div class="mt-auto flex f-column g-10">
									<div class="brand_yt">
										<div class="yt_wrapper" onclick="window.open('https://www.youtube.com/@sigmallyCursed')">
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="26" height="26">
												<path d="M12 39c-.549 0-1.095-.15-1.578-.447A3.008 3.008 0 0 1 9 36V12c0-1.041.54-2.007 1.422-2.553a3.014 3.014 0 0 1 2.919-.132l24 12a3.003 3.003 0 0 1 0 5.37l-24 12c-.42.21-.885.315-1.341.315z" fill="#ffffff"></path>
											</svg>
											<span style="font-size: 16px;">Cursed</span>
										</div>
										<div class="yt_wrapper" onclick="window.open('https://www.youtube.com/@sigmally')">
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="26" height="26">
												<path d="M12 39c-.549 0-1.095-.15-1.578-.447A3.008 3.008 0 0 1 9 36V12c0-1.041.54-2.007 1.422-2.553a3.014 3.014 0 0 1 2.919-.132l24 12a3.003 3.003 0 0 1 0 5.37l-24 12c-.42.21-.885.315-1.341.315z" fill="#ffffff"></path>
											</svg>
											<span style="font-size: 16px;">Sigmally</span>
										</div>
									</div>
									<div class="w-100 centerXY">
										<div class="justify-sb" style="width: 50%;">
											<a href="https://mod.czrsd.com/" target="_blank">Website</a>
											<a href="https://mod.czrsd.com/changelog" target="_blank">Changelog</a>
											<a href="https://mod.czrsd.com/tos" target="_blank">Terms of Service</a>
										</div>
									</div>
								</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.append(mod_menu);

            const styleTag = document.createElement('style');
            styleTag.innerHTML = this.style;
            document.head.append(styleTag);

            this.getSettings();
            this.smallMods();

            mod_menu.addEventListener('click', (event) => {
                if (event.target.closest('.mod_menu_wrapper')) return;

                mod_menu.style.opacity = 0;
                setTimeout(() => {
                    mod_menu.style.display = 'none';
                }, 300);
            });

            function openModTab(tabId) {
                const allTabs = document.getElementsByClassName('mod_tab');
                const allTabButtons = document.querySelectorAll('.mod_nav_btn');

                for (const tab of allTabs) {
                    tab.style.opacity = 0;
                    setTimeout(() => {
                        tab.style.display = 'none';
                    }, 200);
                }

                allTabButtons.forEach((tabBtn) =>
                    tabBtn.classList.remove('mod_selected'),
                );

                if (tabId === 'mod_gallery') {
                    mods.updateGallery();
                }

                const selectedTab = byId(tabId);
                setTimeout(() => {
                    selectedTab.style.display = 'flex';
                    setTimeout(() => {
                        selectedTab.style.opacity = 1;
                    }, 10);
                }, 200);
                this.id && this.classList.add('mod_selected');
            }

            window.openModTab = openModTab;

            document.querySelectorAll('.mod_nav_btn').forEach((tabBtn) => {
                tabBtn.addEventListener('click', function() {
                    openModTab.call(
                        this,
                        this.id.replace('tab_', 'mod_').replace('_btn', ''),
                    );
                });
            });

            const openMenu = document.querySelectorAll(
                '#clans_and_settings button',
            )[1];
            openMenu.removeAttribute('onclick');
            openMenu.addEventListener('click', () => {
                mod_menu.style.display = 'flex';
                setTimeout(() => {
                    mod_menu.style.opacity = 1;
                }, 10);
            });

            const closeModal = byId('closeBtn');
            closeModal.addEventListener('click', () => {
                mod_menu.style.opacity = 0;
                setTimeout(() => {
                    mod_menu.style.display = 'none';
                }, 300);
            });

            const fontSelectContainer = document.querySelector(
                '#font-select-container',
            );

            const fonts = await this.getGoogleFonts();
            const selectElement = this.render_sm_select(
                'Select Font',
                fonts,
                {
                    width: '200px',
                },
                modSettings.game.font,
            );
            fontSelectContainer.replaceWith(selectElement);

            selectElement.addEventListener('change', (e) => {
                const link = document.createElement('link');
                link.href = `https://fonts.googleapis.com/css2?family=${e.detail}&display=swap`;
                link.rel = 'stylesheet';
                document.head.appendChild(link);

                modSettings.game.font = e.detail;
                updateStorage();
            });

            if (modSettings.game.font !== 'Ubuntu') {
                const link = document.createElement('link');
                link.href = `https://fonts.googleapis.com/css2?family=${modSettings.game.font}&display=swap`;
                link.rel = 'stylesheet';
                document.head.appendChild(link);
            }

            const playTimerToggle = byId('playTimerToggle');
            playTimerToggle.addEventListener('change', () => {
                modSettings.playTimer = playTimerToggle.checked;
                updateStorage();
            });

            const mouseTrackerToggle = byId('mouseTrackerToggle');
            mouseTrackerToggle.addEventListener('change', () => {
                modSettings.mouseTracker = mouseTrackerToggle.checked;
                updateStorage();
            });

            const macroSpeed = byId('macroSpeed');
            const macroSpeedText = byId('macroSpeedText');

            macroSpeed.addEventListener('input', () => {
                modSettings.macros.feedSpeed = macroSpeed.value;
                macroSpeedText.textContent = `${modSettings.macros.feedSpeed.toString()}ms`;
                updateStorage();
            });

            const resetModSettings = byId('resetModSettings');
            resetModSettings.addEventListener('click', () => {
                if (
                    confirm(
                        'Are you sure you want to reset the mod settings? A reload is required.',
                    )
                ) {
                    this.removeStorage(storageName);
                    location.reload();
                }
            });

            const resetGameSettings = byId('resetGameSettings');
            resetGameSettings.addEventListener('click', () => {
                if (
                    confirm(
                        'Are you sure you want to reset the game settings? Your nick and more settings will be lost. A reload is required.',
                    )
                ) {
                    window.settings.gameSettings = null;
                    this.removeStorage('settings');
                    location.reload();
                }
            });
        },

        render_sm_select(label, items, style = {}, defaultValue) {
            const createElement = (tag, styles, text = '') => {
                const el = document.createElement(tag);
                el.textContent = text;
                Object.assign(el.style, styles);
                return el;
            };

            const defaultcontainerStyles = {
                position: 'relative',
                display: 'inline-block',
            };

            const container = createElement('div', {
                ...defaultcontainerStyles,
                ...style,
            });

            const selectButton = document.createElement('div');
            selectButton.style.cssText =
                'background: rgba(0, 0, 0, 0.4); color: #fff; border: 1px solid #A2A2A2; border-radius: 5px; padding: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';

            selectButton.innerHTML = `
        <span>${label}</span>
        <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="#000000" width="20">
          <path fill="#fafafa" d="M13.098 8H6.902c-.751 0-1.172.754-.708 1.268L9.292 12.7c.36.399 1.055.399 1.416 0l3.098-3.433C14.27 8.754 13.849 8 13.098 8Z"></path>
        </svg>
      `;

            if (defaultValue && items.includes(defaultValue)) {
                selectButton.innerHTML = `<span>${defaultValue}</span> ${selectButton.innerHTML.split('</svg>')[1]}`;
            }

            container.appendChild(selectButton);

            const dropdown = createElement('div', {
                display: 'none',
                position: 'absolute',
                background: '#111',
                color: '#fafafa',
                borderRadius: '0 0 10px 10px',
                padding: '5px 0',
                zIndex: '999999',
                maxHeight: '200px',
                overflowY: 'auto',
            });

            const searchBox = createElement('input', {
                width: '100%',
                padding: '5px',
                marginBottom: '5px',
                background: '#222',
                border: 'none',
                color: '#fff',
            });
            searchBox.placeholder = 'Search...';

            dropdown.append(searchBox);

            items.forEach((item) => {
                const option = createElement(
                    'div',
                    { padding: '5px', cursor: 'pointer' },
                    item,
                );
                option.onclick = () => {
                    selectButton.innerHTML = `
            <span>${item}</span>
            <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="#000000" width="20">
              <path fill="#fafafa" d="M13.098 8H6.902c-.751 0-1.172.754-.708 1.268L9.292 12.7c.36.399 1.055.399 1.416 0l3.098-3.433C14.27 8.754 13.849 8 13.098 8Z"></path>
            </svg>`;
                    dropdown.style.display = 'none';
                    container.dispatchEvent(new CustomEvent('change', { detail: item }));
                };
                option.onmouseover = (e) => (e.target.style.background = '#555');
                option.onmouseout = (e) => (e.target.style.background = 'transparent');
                dropdown.append(option);
            });

            container.append(dropdown);

            selectButton.onclick = () => {
                dropdown.style.display =
                    dropdown.style.display === 'none' ? 'block' : 'none';
            };

            document.onclick = (e) => {
                if (!container.contains(e.target)) dropdown.style.display = 'none';
            };

            searchBox.addEventListener('input', () => {
                const filter = searchBox.value.toLowerCase();
                Array.from(dropdown.children)
                    .slice(1)
                    .forEach((item) => {
                        item.style.display = item.textContent.toLowerCase().includes(filter)
                            ? 'block'
                            : 'none';
                    });
            });

            return container;
        },

        setProfile(user) {
            const img = byId('my-profile-img');
            const name = byId('my-profile-name');
            const role = byId('my-profile-role');
            const bioText = byId('my-profile-bio');
            const badges = byId('my-profile-badges');

            const bio = user.bio ? user.bio : 'No bio.';

            img.src = user.imageURL;
            name.innerText = user.username;
            role.innerText = user.role;
            bioText.innerHTML = bio;
            badges.innerHTML =
                user.badges && user.badges.length > 0
                    ? user.badges
                        .map((badge) => `<span class="mod_badge">${badge}</span>`)
                        .join('')
                    : '<span>User has no badges.</span>';

            role.classList.add(`${user.role}_role`);
        },

        getSettings() {
            const mod_qaccess = document.querySelector('#mod_qaccess');
            const settingsGrid = document.querySelector('#settings > .checkbox-grid');
            const settingsNames = settingsGrid.querySelectorAll('label:not([class])');
            const inputs = settingsGrid.querySelectorAll('input');

            inputs.forEach((checkbox, index) => {
                if (
                    checkbox.id === 'showChat' ||
                    checkbox.id === 'showMinimap' ||
                    checkbox.id === 'darkTheme'
                )
                    return;
                const modrow = document.createElement('div');
                modrow.classList.add('justify-sb', 'p-2');

                if (
                    checkbox.id === 'showPosition' ||
                    checkbox.id === 'showNames' ||
                    checkbox.id === 'showSkins'
                ) {
                    modrow.style.display = 'none';
                }

                modrow.innerHTML = `
                    <span>${settingsNames[index].textContent}</span>
                    <div class="modCheckbox" id="${checkbox.id}_wrapper"></div>
                `;
                mod_qaccess.append(modrow);

                const cbWrapper = byId(`${checkbox.id}_wrapper`);
                cbWrapper.appendChild(checkbox);

                cbWrapper.appendChild(
                    Object.assign(document.createElement('label'), {
                        classList: ['cbx'],
                        htmlFor: checkbox.id,
                    }),
                );
            });
        },

        themes() {
            const elements = [
                '#menu',
                '#title',
                '.top-users__inner',
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
            ];

            const customTextElements = [
                '#challenge-coins .alert-heading',
                '#sigma-pass h3',
                '.alert *',
            ];

            let checkInterval;
            const appliedElements = new Set();

            window.themeElements = elements;

            const themeEditor = document.createElement('div');
            themeEditor.classList.add('themeEditor');
            themeEditor.style.display = 'none';

            themeEditor.innerHTML = `
                <div class="theme_editor_header">
                    <h3>Theme Editor</h3>
                    <button class="btn closeBtn" id="closeThemeEditor">
                        <svg width="22" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1.6001 14.4L14.4001 1.59998M14.4001 14.4L1.6001 1.59998" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </button>
                </div>
                <hr />
                <main class="theme_editor_content">
                    <div class="centerXY" style="justify-content: flex-end;gap: 10px">
                        <span class="text">Select Theme Type: </span>
                        <select class="form-control" style="background: #222; color: #fff; width: 150px" id="theme-type-select">
                            <option>Static Color</option>
                            <option>Gradient</option>
                            <option>Image / Gif</option>
                        </select>
                    </div>

                    <div id="theme_editor_color" class="theme-editor-tab">
                        <div class="centerXY">
                            <label for="theme-editor-bgcolorinput" class="text">Background color:</label>
                            <input type="color" value="#000000" class="colorInput whiteBorder_colorInput" id="theme-editor-bgcolorinput"/>
                        </div>
                        <div class="centerXY">
                            <label for="theme-editor-colorinput" class="text">Text color:</label>
                            <input type="color" value="#000000" class="colorInput whiteBorder_colorInput" id="theme-editor-colorinput"/>
                        </div>
                        <div style="background-color: #000000" class="themes_preview" id="color_preview">
                            <span class="text" style="color: #fff; font-size: 9px;">preview</span>
                        </div>
                        <div class="centerY" style="gap: 10px; margin-top: 10px;">
                            <input type="text" class="form-control" style="background: #222; color: #fff;" maxlength="15" placeholder="Theme name..." id="colorThemeName"/>
                            <button class="btn btn-success" id="saveColorTheme">Save</button>
                        </div>
                    </div>


                    <div id="theme_editor_gradient" class="theme-editor-tab" style="display: none;">
                        <div class="centerXY">
                            <label for="theme-editor-gcolor1" class="text">Color 1:</label>
                            <input type="color" value="#000000" class="colorInput whiteBorder_colorInput" id="theme-editor-gcolor1"/>
                        </div>
                        <div class="centerXY">
                            <label for="theme-editor-g_color" class="text">Color 2:</label>
                            <input type="color" value="#ffffff" class="colorInput whiteBorder_colorInput" id="theme-editor-g_color"/>
                        </div>
                        <div class="centerXY">
                            <label for="theme-editor-gcolor2" class="text">Text Color:</label>
                            <input type="color" value="#ffffff" class="colorInput whiteBorder_colorInput" id="theme-editor-gcolor2"/>
                        </div>

                        <div class="centerXY" style="gap: 10px">
                            <label for="gradient-type" class="text">Gradient Type:</label>
                            <select id="gradient-type" class="form-control" style="background: #222; color: #fff; width: 120px;">
                                <option value="linear">Linear</option>
                                <option value="radial">Radial</option>
                            </select>
                        </div>

                        <div id="theme-editor-gradient_angle" class="centerY" style="gap: 10px; width: 100%">
                            <label for="g_angle" class="text" id="gradient_angle_text" style="width: 115px;">Angle (0deg):</label>
                            <input type="range" id="g_angle" value="0" min="0" max="360">
                        </div>

                        <div style="background: linear-gradient(0deg, #000, #fff)" class="themes_preview" id="gradient_preview">
                            <span class="text" style="color: #fff; font-size: 9px;">preview</span>
                        </div>
                        <div class="centerY" style="gap: 10px; margin-top: 10px;">
                            <input type="text" class="form-control" style="background: #222; color: #fff;" placeholder="Theme name..." id="GradientThemeName"/>
                            <button class="btn btn-success" id="saveGradientTheme">Save</button>
                        </div>
                    </div>



                    <div id="theme_editor_image" class="theme-editor-tab" style="display: none">
                        <div class="centerXY">
                            <input type="text" id="theme-editor-imagelink" placeholder="Image / GIF URL (https://i.ibb.co/k6hn4v0/Galaxy-Example.png)" class="form-control" style="background: #222; color: #fff"/>
                        </div>
                        <div class="centerXY" style="margin: 5px; gap: 5px;">
                            <label for="theme-editor-textcolorImage" class="text">Text Color: </label>
                            <input type="color" class="colorInput whiteBorder_colorInput" value="#ffffff" id="theme-editor-textcolorImage"/>
                        </div>

                        <div style="background: url('https://i.ibb.co/k6hn4v0/Galaxy-Example.png'); background-position: center; background-size: cover;" class="themes_preview" id="image_preview">
                            <span class="text" style="color: #fff; font-size: 9px;">preview</span>
                        </div>
                        <div class="centerY" style="gap: 10px; margin-top: 10px;">
                            <input type="text" class="form-control" style="background: #222; color: #fff;" placeholder="Theme name..." id="imageThemeName"/>
                            <button class="btn btn-success" id="saveImageTheme">Save</button>
                        </div>
                    </div>
                </main>
            `;

            document.body.append(themeEditor);

            setTimeout(() => {
                document
                    .querySelectorAll('.stats-btn__share-btn')[1]
                    .querySelector('rect')
                    .remove();

                const themeTypeSelect = byId('theme-type-select');
                const colorTab = byId('theme_editor_color');
                const gradientTab = byId('theme_editor_gradient');
                const imageTab = byId('theme_editor_image');
                const gradientAngleDiv = byId('theme-editor-gradient_angle');

                themeTypeSelect.addEventListener('change', function() {
                    const selectedOption = themeTypeSelect.value;
                    switch (selectedOption) {
                        case 'Static Color':
                            colorTab.style.display = 'flex';
                            gradientTab.style.display = 'none';
                            imageTab.style.display = 'none';
                            break;
                        case 'Gradient':
                            colorTab.style.display = 'none';
                            gradientTab.style.display = 'flex';
                            imageTab.style.display = 'none';
                            break;
                        case 'Image / Gif':
                            colorTab.style.display = 'none';
                            gradientTab.style.display = 'none';
                            imageTab.style.display = 'flex';
                            break;
                        default:
                            colorTab.style.display = 'flex';
                            gradientTab.style.display = 'none';
                            imageTab.style.display = 'none';
                    }
                });

                const colorInputs = document.querySelectorAll(
                    '#theme_editor_color .colorInput',
                );
                colorInputs.forEach((input) => {
                    input.addEventListener('input', function() {
                        const bgColorInput = byId('theme-editor-bgcolorinput').value;
                        const textColorInput = byId('theme-editor-colorinput').value;

                        applyColorTheme(bgColorInput, textColorInput);
                    });
                });

                const gradientInputs = document.querySelectorAll(
                    '#theme_editor_gradient .colorInput',
                );
                gradientInputs.forEach((input) => {
                    input.addEventListener('input', function() {
                        const gColor1 = byId('theme-editor-gcolor1').value;
                        const gColor2 = byId('theme-editor-g_color').value;
                        const gTextColor = byId('theme-editor-gcolor2').value;
                        const gAngle = byId('g_angle').value;
                        const gradientType = byId('gradient-type').value;

                        applyGradientTheme(
                            gColor1,
                            gColor2,
                            gTextColor,
                            gAngle,
                            gradientType,
                        );
                    });
                });

                const imageInputs = document.querySelectorAll(
                    '#theme_editor_image .colorInput',
                );
                imageInputs.forEach((input) => {
                    input.addEventListener('input', function() {
                        const imageLinkInput = byId('theme-editor-imagelink').value;
                        const textColorImageInput = byId(
                            'theme-editor-textcolorImage',
                        ).value;

                        let img;
                        if (imageLinkInput === '') {
                            img = 'https://i.ibb.co/k6hn4v0/Galaxy-Example.png';
                        } else {
                            img = imageLinkInput;
                        }
                        applyImageTheme(img, textColorImageInput);
                    });
                });
                const image_preview = byId('image_preview');
                const image_link = byId('theme-editor-imagelink');

                let isWriting = false;
                let timeoutId;

                image_link.addEventListener('input', () => {
                    if (!isWriting) {
                        isWriting = true;
                    } else {
                        clearTimeout(timeoutId);
                    }

                    timeoutId = setTimeout(() => {
                        const imageLinkInput = image_link.value;
                        const textColorImageInput = byId(
                            'theme-editor-textcolorImage',
                        ).value;

                        let img;
                        if (imageLinkInput === '') {
                            img = 'https://i.ibb.co/k6hn4v0/Galaxy-Example.png';
                        } else {
                            img = imageLinkInput;
                        }

                        applyImageTheme(img, textColorImageInput);
                        isWriting = false;
                    }, 1000);
                });

                const gradientTypeSelect = byId('gradient-type');
                const angleInput = byId('g_angle');

                gradientTypeSelect.addEventListener('change', function() {
                    const selectedType = gradientTypeSelect.value;
                    gradientAngleDiv.style.display =
                        selectedType === 'linear' ? 'flex' : 'none';

                    const gColor1 = byId('theme-editor-gcolor1').value;
                    const gColor2 = byId('theme-editor-g_color').value;
                    const gTextColor = byId('theme-editor-gcolor2').value;
                    const gAngle = byId('g_angle').value;

                    applyGradientTheme(
                        gColor1,
                        gColor2,
                        gTextColor,
                        gAngle,
                        selectedType,
                    );
                });

                angleInput.addEventListener('input', function() {
                    const gradient_angle_text = byId('gradient_angle_text');
                    gradient_angle_text.innerText = `Angle (${angleInput.value}deg): `;
                    const gColor1 = byId('theme-editor-gcolor1').value;
                    const gColor2 = byId('theme-editor-g_color').value;
                    const gTextColor = byId('theme-editor-gcolor2').value;
                    const gAngle = byId('g_angle').value;
                    const gradientType = byId('gradient-type').value;

                    applyGradientTheme(
                        gColor1,
                        gColor2,
                        gTextColor,
                        gAngle,
                        gradientType,
                    );
                });

                function applyColorTheme(bgColor, textColor) {
                    const previewDivs = document.querySelectorAll(
                        '#theme_editor_color .themes_preview',
                    );
                    previewDivs.forEach((previewDiv) => {
                        previewDiv.style.backgroundColor = bgColor;
                        const textSpan = previewDiv.querySelector('span.text');
                        textSpan.style.color = textColor;
                    });
                }

                function applyGradientTheme(
                    gColor1,
                    gColor2,
                    gTextColor,
                    gAngle,
                    gradientType,
                ) {
                    const previewDivs = document.querySelectorAll(
                        '#theme_editor_gradient .themes_preview',
                    );
                    previewDivs.forEach((previewDiv) => {
                        const gradient =
                            gradientType === 'linear'
                                ? `linear-gradient(${gAngle}deg, ${gColor1}, ${gColor2})`
                                : `radial-gradient(circle, ${gColor1}, ${gColor2})`;
                        previewDiv.style.background = gradient;
                        const textSpan = previewDiv.querySelector('span.text');
                        textSpan.style.color = gTextColor;
                    });
                }

                function applyImageTheme(imageLink, textColor) {
                    const previewDivs = document.querySelectorAll(
                        '#theme_editor_image .themes_preview',
                    );
                    previewDivs.forEach((previewDiv) => {
                        previewDiv.style.backgroundImage = `url('${imageLink}')`;
                        const textSpan = previewDiv.querySelector('span.text');
                        textSpan.style.color = textColor;
                    });
                }

                const createTheme = byId('createTheme');
                createTheme.addEventListener('click', () => {
                    themeEditor.style.display = 'block';
                });

                const closeThemeEditor = byId('closeThemeEditor');
                closeThemeEditor.addEventListener('click', () => {
                    themeEditor.style.display = 'none';
                });

                let themesDiv = byId('themes');

                const saveColorThemeBtn = byId('saveColorTheme');
                const saveGradientThemeBtn = byId('saveGradientTheme');
                const saveImageThemeBtn = byId('saveImageTheme');

                saveColorThemeBtn.addEventListener('click', () => {
                    const name = byId('colorThemeName').value;
                    const bgColorInput = byId('theme-editor-bgcolorinput').value;
                    const textColorInput = byId('theme-editor-colorinput').value;

                    if (name === '') return;

                    const theme = {
                        name: name,
                        background: bgColorInput,
                        text: textColorInput,
                    };

                    const themeCard = document.createElement('div');
                    themeCard.classList.add('theme');
                    let themeBG;
                    if (theme.background.includes('http')) {
                        themeBG = `background: url(${theme.preview || theme.background})`;
                    } else {
                        themeBG = `background: ${theme.background}`;
                    }
                    themeCard.innerHTML = `
                        <div class="themeContent" style="${themeBG}; background-size: cover; background-position: center"></div>
                        <div class="themeName text" style="color: #fff">${theme.name}</div>
                    `;

                    themeCard.addEventListener('click', () => {
                        toggleTheme(theme);
                    });

                    themeCard.addEventListener('contextmenu', (ev) => {
                        ev.preventDefault();
                        if (confirm('Do you want to delete this Theme?')) {
                            themeCard.remove();
                            const themeIndex = modSettings.themes.custom.findIndex(
                                (addedTheme) => addedTheme.name === theme.name,
                            );
                            if (themeIndex !== -1) {
                                modSettings.themes.custom.splice(themeIndex, 1);
                                updateStorage();
                            }
                        }
                    });

                    themesDiv.appendChild(themeCard);

                    modSettings.themes.custom.push(theme);
                    updateStorage();

                    themeEditor.style.display = 'none';
                    themesDiv.scrollTop = themesDiv.scrollHeight;
                });

                saveGradientThemeBtn.addEventListener('click', () => {
                    const name = byId('GradientThemeName').value;
                    const gColor1 = byId('theme-editor-gcolor1').value;
                    const gColor2 = byId('theme-editor-g_color').value;
                    const gTextColor = byId('theme-editor-gcolor2').value;
                    const gAngle = byId('g_angle').value;
                    const gradientType = byId('gradient-type').value;

                    if (name === '') return;

                    let gradient_radial_linear = () => {
                        if (gradientType === 'linear') {
                            return `${gradientType}-gradient(${gAngle}deg, ${gColor1}, ${gColor2})`;
                        } else if (gradientType === 'radial') {
                            return `${gradientType}-gradient(circle, ${gColor1}, ${gColor2})`;
                        }
                    };
                    const theme = {
                        name: name,
                        background: gradient_radial_linear(),
                        text: gTextColor,
                    };

                    const themeCard = document.createElement('div');
                    themeCard.classList.add('theme');
                    let themeBG;
                    if (theme.background.includes('http')) {
                        themeBG = `background: url(${theme.preview || theme.background})`;
                    } else {
                        themeBG = `background: ${theme.background}`;
                    }
                    themeCard.innerHTML = `
                        <div class="themeContent" style="${themeBG}; background-size: cover; background-position: center"></div>
                        <div class="themeName text" style="color: #fff">${theme.name}</div>
                    `;

                    themeCard.addEventListener('click', () => {
                        toggleTheme(theme);
                    });

                    themeCard.addEventListener('contextmenu', (ev) => {
                        ev.preventDefault();
                        if (confirm('Do you want to delete this Theme?')) {
                            themeCard.remove();
                            const themeIndex = modSettings.themes.custom.findIndex(
                                (addedTheme) => addedTheme.name === theme.name,
                            );
                            if (themeIndex !== -1) {
                                modSettings.themes.custom.splice(themeIndex, 1);
                                updateStorage();
                            }
                        }
                    });

                    themesDiv.appendChild(themeCard);

                    modSettings.themes.custom.push(theme);
                    updateStorage();

                    themeEditor.style.display = 'none';
                    themesDiv.scrollTop = themesDiv.scrollHeight;
                });

                saveImageThemeBtn.addEventListener('click', () => {
                    const name = byId('imageThemeName').value;
                    const imageLink = byId('theme-editor-imagelink').value;
                    const textColorImageInput = byId('theme-editor-textcolorImage').value;

                    if (name === '' || imageLink === '') return;

                    const theme = {
                        name: name,
                        background: imageLink,
                        text: textColorImageInput,
                    };

                    const themeCard = document.createElement('div');
                    themeCard.classList.add('theme');
                    let themeBG;
                    if (theme.background.includes('http')) {
                        themeBG = `background: url(${theme.preview || theme.background})`;
                    } else {
                        themeBG = `background: ${theme.background}`;
                    }
                    themeCard.innerHTML = `
                        <div class="themeContent" style="${themeBG}; background-size: cover; background-position: center"></div>
                        <div class="themeName text" style="color: #fff">${theme.name}</div>
                    `;

                    themeCard.addEventListener('click', () => {
                        toggleTheme(theme);
                    });

                    themeCard.addEventListener('contextmenu', (ev) => {
                        ev.preventDefault();
                        if (confirm('Do you want to delete this Theme?')) {
                            themeCard.remove();
                            const themeIndex = modSettings.themes.custom.findIndex(
                                (addedTheme) => addedTheme.name === theme.name,
                            );
                            if (themeIndex !== -1) {
                                modSettings.themes.custom.splice(themeIndex, 1);
                                updateStorage();
                            }
                        }
                    });

                    themesDiv.appendChild(themeCard);

                    modSettings.themes.custom.push(theme);
                    updateStorage();

                    themeEditor.style.display = 'none';
                    themesDiv.scrollTop = themesDiv.scrollHeight;
                });
            });

            const b_inner = document.querySelector('.body__inner');
            let bodyColorElements = b_inner.querySelectorAll(
                '.body__inner > :not(.body__inner), #s-skin-select-icon-text',
            );

            const toggleColor = (element, background, text) => {
                let image = `url("${background}")`;
                if (background.includes('http')) {
                    element.style.background = image;
                    element.style.backgroundPosition = 'center';
                    element.style.backgroundSize = 'cover';
                    element.style.backgroundRepeat = 'no-repeat';
                } else {
                    element.style.background = background;
                    element.style.backgroundRepeat = 'no-repeat';
                }
                element.style.color = text;
            };

            const openSVG = document.querySelector(
                '#clans_and_settings > Button:nth-of-type(2) > svg',
            );
            const openSVGPath = openSVG.querySelector('path');
            openSVG.setAttribute('width', '36');
            openSVG.setAttribute('height', '36');

            const applyThemeToElement = (el, theme) => {
                if (el.matches('#title')) {
                    el.style.color = theme.text;
                } else {
                    toggleColor(el, theme.background, theme.text);
                }
                appliedElements.add(el);
            };

            const toggleTheme = (theme) => {
                try {
                    if (checkInterval) clearInterval(checkInterval);
                    appliedElements.clear();

                    const applyTheme = () => {
                        let allApplied = true;

                        elements.forEach((selector) => {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach((el) => {
                                if (el && !appliedElements.has(el)) {
                                    applyThemeToElement(el, theme);
                                    allApplied = false;
                                }
                            });
                        });

                        customTextElements.forEach((qs) => {
                            document.querySelectorAll(qs).forEach((el) => {
                                if (!appliedElements.has(el)) {
                                    el.style.setProperty('color', theme.text, 'important');
                                    appliedElements.add(el);
                                    allApplied = false;
                                }
                            });
                        });

                        bodyColorElements.forEach((el) => {
                            if (!appliedElements.has(el)) {
                                el.style.color = theme.text;
                                appliedElements.add(el);
                                allApplied = false;
                            }
                        });

                        if (allApplied) {
                            clearInterval(checkInterval);
                            return;
                        }

                        // Apply the SVG path color
                        openSVGPath.setAttribute(
                            'fill',
                            theme.text === '#FFFFFF' ? '#fff' : '#222',
                        );

                        modSettings.themes.current = theme.name;
                        updateStorage();
                    };

                    checkInterval = setInterval(applyTheme, 100);
                } catch (e) {
                    console.error(e);
                }
            };

            const themes = (window.themes = {
                defaults: [
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
                        background: 'rgba(0, 0, 0,0)',
                        text: '#FFFFFF',
                    },
                ],
                orderly: [
                    {
                        name: 'THC',
                        background: 'linear-gradient(160deg, #9BEC7A, #117500)',
                        text: '#000000',
                    },
                    {
                        name: '4 AM',
                        background: 'linear-gradient(160deg, #8B0AE1, #111)',
                        text: '#FFFFFF',
                    },
                    {
                        name: 'OTO',
                        background: 'linear-gradient(160deg, #A20000, #050505)',
                        text: '#FFFFFF',
                    },
                    {
                        name: 'Gaming',
                        background: 'https://i.ibb.co/DwKkQfh/BG-1-lower-quality.jpg',
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
                        name: 'Blue - 2',
                        background: 'https://i.ibb.co/7RJvNCX/BG-4.png',
                        preview: 'https://czrsd.com/static/sigmod/themes/BG-4.jpg',
                        text: '#FFFFFF',
                    },
                    {
                        name: 'Purple',
                        background: 'https://i.ibb.co/vxY15Tv/BG-5.png',
                        preview: 'https://czrsd.com/static/sigmod/themes/BG-5.jpg',
                        text: '#FFFFFF',
                    },
                    {
                        name: 'Orange Blue',
                        background: 'https://i.ibb.co/99nfFBN/BG-6.png',
                        preview: 'https://czrsd.com/static/sigmod/themes/BG-6.jpg',
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
                        name: 'colorful',
                        background: 'https://i.ibb.co/VqtB3TX/colorful.png',
                        preview: 'https://czrsd.com/static/sigmod/themes/colorful.jpg',
                        text: '#FFFFFF',
                    },
                    {
                        name: 'Sunset - 2',
                        background: 'https://i.ibb.co/TLp2nvv/Sunset.png',
                        preview: 'https://czrsd.com/static/sigmod/themes/Sunset.jpg',
                        text: '#FFFFFF',
                    },
                    {
                        name: 'Epic',
                        background: 'https://i.ibb.co/kcv4tvn/Epic.png',
                        preview: 'https://czrsd.com/static/sigmod/themes/Epic.jpg',
                        text: '#FFFFFF',
                    },
                    {
                        name: 'Galaxy - 2',
                        background: 'https://i.ibb.co/smRs6V0/galaxy.png',
                        preview: 'https://czrsd.com/static/sigmod/themes/galaxy2.jpg',
                        text: '#FFFFFF',
                    },
                    {
                        name: 'Cloudy',
                        background: 'https://i.ibb.co/MCW7Bcd/cloudy.png',
                        preview: 'https://czrsd.com/static/sigmod/themes/cloudy.jpg',
                        text: '#000000',
                    },
                ],
            });

            function createThemeCard(theme) {
                const themeCard = document.createElement('div');
                themeCard.classList.add('theme');
                let themeBG;
                if (theme.background.includes('http')) {
                    themeBG = `background: url(${theme.preview || theme.background})`;
                } else {
                    themeBG = `background: ${theme.background}`;
                }
                themeCard.innerHTML = `
                  <div class="themeContent" style="${themeBG}; background-size: cover; background-position: center"></div>
                  <div class="themeName text" style="color: #fff">${theme.name}</div>
                `;

                themeCard.addEventListener('click', () => {
                    toggleTheme(theme);
                });

                if (modSettings.themes.custom.includes(theme)) {
                    themeCard.addEventListener(
                        'contextmenu',
                        (ev) => {
                            ev.preventDefault();
                            if (confirm('Do you want to delete this Theme?')) {
                                themeCard.remove();
                                const themeIndex = modSettings.themes.custom.findIndex(
                                    (addedTheme) => addedTheme.name === theme.name,
                                );
                                if (themeIndex !== -1) {
                                    modSettings.themes.custom.splice(themeIndex, 1);
                                    updateStorage();
                                }
                            }
                        },
                        false,
                    );
                }

                return themeCard;
            }

            const themesContainer = byId('themes');

            themes.defaults.forEach((theme) => {
                const themeCard = createThemeCard(theme);
                themesContainer.append(themeCard);
            });

            const orderlyThemes = [...themes.orderly, ...modSettings.themes.custom];
            orderlyThemes.sort((a, b) => a.name.localeCompare(b.name));
            orderlyThemes.forEach((theme) => {
                const themeCard = createThemeCard(theme);
                themesContainer.appendChild(themeCard);
            });

            const savedTheme = modSettings.themes.current;
            if (savedTheme) {
                let selectedTheme;
                selectedTheme = themes.defaults.find(
                    (theme) => theme.name === savedTheme,
                );
                if (!selectedTheme) {
                    selectedTheme =
                        themes.orderly.find((theme) => theme.name === savedTheme) ||
                        modSettings.themes.custom.find(
                            (theme) => theme.name === savedTheme,
                        );
                }

                if (selectedTheme) {
                    toggleTheme(selectedTheme);
                }
            }

            const inputBorderRadius = byId('theme-inputBorderRadius');
            const menuBorderRadius = byId('theme-menuBorderRadius');
            const inputBorder = byId('theme-inputBorder');

            function setCSS(key, value, targets, property) {
                modSettings.themes[key] = value;
                targets.forEach((target) => {
                    document
                        .querySelectorAll(target)
                        .forEach((el) => (el.style[property] = value));
                });
                updateStorage();
            }

            inputBorderRadius.value = modSettings.themes.inputBorderRadius
                ? modSettings.themes.inputBorderRadius.replace('px', '')
                : '4';
            menuBorderRadius.value = modSettings.themes.menuBorderRadius
                ? modSettings.themes.menuBorderRadius.replace('px', '')
                : '15';
            inputBorder.checked = modSettings.themes.inputBorder
                ? modSettings.themes.inputBorder === '1px'
                : '1px';

            setCSS(
                'inputBorderRadius',
                `${inputBorderRadius.value}px`,
                ['.form-control'],
                'borderRadius',
            );
            setCSS(
                'menuBorderRadius',
                `${menuBorderRadius.value}px`,
                [...elements, '.text-block'],
                'borderRadius',
            );
            setCSS(
                'inputBorder',
                inputBorder.checked ? '1px' : '0px',
                ['.form-control'],
                'borderWidth',
            );

            inputBorderRadius.addEventListener('input', () =>
                setCSS(
                    'inputBorderRadius',
                    `${inputBorderRadius.value}px`,
                    ['.form-control'],
                    'borderRadius',
                ),
            );
            menuBorderRadius.addEventListener('input', () =>
                setCSS(
                    'menuBorderRadius',
                    `${menuBorderRadius.value}px`,
                    [...elements, '.text-block'],
                    'borderRadius',
                ),
            );
            inputBorder.addEventListener('input', () =>
                setCSS(
                    'inputBorder',
                    inputBorder.checked ? '1px' : '0px',
                    ['.form-control'],
                    'borderWidth',
                ),
            );
        },

        chat() {
            // disable old chat
            setTimeout(() => {
                const showChat = document.querySelector('#showChat');
                if (showChat && showChat.checked) {
                    showChat.click();
                }
                if (showChat) {
                    showChat.remove();
                }
            }, 300);

            // If someone uninstalls the mod, the chat is visible again
            window.addEventListener('beforeunload', () => {
                localStorage.setItem(
                    'settings',
                    JSON.stringify({
                        ...JSON.parse(localStorage.getItem('settings')),
                        showChat: true,
                    }),
                );
            });

            const chatDiv = document.createElement('div');
            chatDiv.classList.add('modChat');
            chatDiv.innerHTML = `
                <div class="modChat__inner">
                    <button id="scroll-down-btn" class="modButton">↓</button>
                    <div class="modchat-chatbuttons">
                        <button class="chatButton" id="mainchat">Main</button>
                        <button class="chatButton" id="partychat">Party</button>
                        <span class="tagText"></span>
                    </div>
                    <div id="mod-messages" class="scroll"></div>
                    <div id="chatInputContainer">
                        <input type="text" id="chatSendInput" class="chatInput" placeholder="message..." maxlength="250" minlength="1" />
                        <button class="chatButton" id="openChatSettings">
                            <svg width="15" height="15" viewBox="0 0 20 20" fill="#fff" xmlns="http://www.w3.org/2000/svg">
                                <path d="M17.4249 7.45169C15.7658 7.45169 15.0874 6.27836 15.9124 4.83919C16.3891 4.00503 16.1049 2.94169 15.2708 2.46503L13.6849 1.55753C12.9608 1.12669 12.0258 1.38336 11.5949 2.10753L11.4941 2.28169C10.6691 3.72086 9.31242 3.72086 8.47825 2.28169L8.37742 2.10753C7.96492 1.38336 7.02992 1.12669 6.30575 1.55753L4.71992 2.46503C3.88575 2.94169 3.60158 4.01419 4.07825 4.84836C4.91242 6.27836 4.23408 7.45169 2.57492 7.45169C1.62159 7.45169 0.833252 8.23086 0.833252 9.19336V10.8067C0.833252 11.76 1.61242 12.5484 2.57492 12.5484C4.23408 12.5484 4.91242 13.7217 4.07825 15.1609C3.60158 15.995 3.88575 17.0584 4.71992 17.535L6.30575 18.4425C7.02992 18.8734 7.96492 18.6167 8.39575 17.8925L8.49658 17.7184C9.32158 16.2792 10.6783 16.2792 11.5124 17.7184L11.6133 17.8925C12.0441 18.6167 12.9791 18.8734 13.7033 18.4425L15.2891 17.535C16.1233 17.0584 16.4074 15.9859 15.9307 15.1609C15.0966 13.7217 15.7749 12.5484 17.4341 12.5484C18.3874 12.5484 19.1758 11.7692 19.1758 10.8067V9.19336C19.1666 8.24003 18.3874 7.45169 17.4249 7.45169ZM9.99992 12.9792C8.35908 12.9792 7.02075 11.6409 7.02075 10C7.02075 8.35919 8.35908 7.02086 9.99992 7.02086C11.6408 7.02086 12.9791 8.35919 12.9791 10C12.9791 11.6409 11.6408 12.9792 9.99992 12.9792Z" fill="#fff"></path>
                            </svg>
                        </button>
                        <button class="chatButton" id="openEmojiMenu">😎</button>
                        <button id="sendButton" class="chatButton">
                            Send
                            <img src="https://raw.githubusercontent.com/Sigmally/SigMod/main/images/send.svg" width="20" height="20" draggable="false"/>
                        </button>
                    </div>
                </div>
            `;
            document.body.append(chatDiv);

            const chatContainer = byId('mod-messages');
            const scrollDownButton = byId('scroll-down-btn');

            chatContainer.addEventListener('scroll', () => {
                if (chatContainer.scrollHeight - chatContainer.scrollTop > 300) {
                    scrollDownButton.style.display = 'block';
                }
                if (
                    chatContainer.scrollHeight - chatContainer.scrollTop < 299 &&
                    scrollDownButton.style.display === 'block'
                ) {
                    scrollDownButton.style.display = 'none';
                }
            });

            scrollDownButton.addEventListener('click', () => {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            });

            const messageCount = chatContainer.children.length;
            const messageLimit = modSettings.chat.limit;
            if (messageCount > messageLimit) {
                const messagesToRemove = messageCount - messageLimit;
                for (let i = 0; i < messagesToRemove; i++) {
                    chatContainer.removeChild(chatContainer.firstChild);
                }
            }

            const main = byId('mainchat');
            const party = byId('partychat');
            main.addEventListener('click', () => {
                if (modSettings.chat.showClientChat) {
                    byId('mod-messages').innerHTML = '';
                    modSettings.chat.showClientChat = false;
                    updateStorage();
                }
            });
            party.addEventListener('click', () => {
                if (!modSettings.chat.showClientChat) {
                    modSettings.chat.showClientChat = true;
                    updateStorage();
                }
                const modMessages = byId('mod-messages');
                if (!modSettings.settings.tag) {
                    modMessages.innerHTML = `
                        <div class="message">
                            <span>
                                <span style="color: #5a44eb" class="message_name">[SERVER]</span>: You need to be in a tag to use the SigMod party chat.
                            </span>
                        </div>
                    `;
                } else {
                    modMessages.innerHTML = `
                        <div class="message">
                            <span>
                                <span style="color: #5a44eb" class="message_name">[SERVER]</span>: Welcome to the SigMod party chat!
                            </span>
                        </div>
                    `;
                }
            });

            if (modSettings.chat.showClientChat) {
                const modMessages = byId('mod-messages');
                if (modMessages.children.length > 1) return;
                modMessages.innerHTML = `
                    <div class="message">
                        <span>
                            <span style="color: #5a44eb" class="message_name">[SERVER]</span>: Welcome to the SigMod party chat!
                        </span>
                    </div>
                `;
            }

            const text = byId('chatSendInput');
            const send = byId('sendButton');

            send.addEventListener('click', () => {
                let val = text.value;
                if (val === '') return;

                if (modSettings.chat.showClientChat) {
                    // party chat message
                    client.send({
                        type: 'chat-message',
                        content: {
                            message: val,
                        },
                    });
                } else {
                    // Sigmally chat message - split text into parts if message is
                    // longer than 15 characters.
                    if (val.length > 15) {
                        const parts = [];
                        let currentPart = '';

                        val.split(' ').forEach((word) => {
                            // Split the input value into individual words
                            if (currentPart.length + word.length + 1 <= 15) {
                                // if adding the current word to the current part does not exceed the length limit
                                currentPart += (currentPart ? ' ' : '') + word;
                                // add the current word to the current part with a space separator
                            } else {
                                // if adding the current word exceeds the length limit
                                parts.push(currentPart);
                                currentPart = word;
                            }
                        });

                        if (currentPart) {
                            // Push the last current part to the parts array
                            parts.push(currentPart);
                        }

                        let index = 0;
                        const sendPart = () => {
                            // If there are still parts left to send
                            if (index < parts.length) {
                                window.sendChat(parts[index]);
                                index++;
                                setTimeout(sendPart, 1000); // 1s cooldown from sigmally
                            }
                        };

                        sendPart();
                    } else {
                        window.sendChat(val);
                    }
                }

                text.value = '';
                text.blur();
            });

            this.chatSettings();
            this.emojiMenu();

            const chatSettingsContainer = document.querySelector(
                '.chatSettingsContainer',
            );
            const emojisContainer = document.querySelector('.emojisContainer');

            byId('openChatSettings').addEventListener('click', () => {
                if (chatSettingsContainer.classList.contains('hidden_full')) {
                    chatSettingsContainer.classList.remove('hidden_full');
                    emojisContainer.classList.add('hidden_full');
                } else {
                    chatSettingsContainer.classList.add('hidden_full');
                }
            });

            const scrollUpButton = byId('scroll-down-btn');
            let focused = false;
            let typed = false;

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && text.value.length > 0) {
                    send.click();
                    focused = false;
                    scrollUpButton.click();
                } else if (e.key === 'Enter') {
                    if (
                        document.activeElement.tagName === 'INPUT' ||
                        document.activeElement.tagName === 'TEXTAREA'
                    )
                        return;

                    focused ? text.blur() : text.focus();
                    focused = !focused;
                }
            });

            text.addEventListener('input', () => {
                typed = text.value.length > 1;
            });

            text.addEventListener('blur', () => {
                focused = false;
            });

            text.addEventListener('keydown', () => {
                const key = e.key.toLowerCase();
                if (key === 'w') {
                    e.stopPropagation();
                }

                if (key === ' ') {
                    e.stopPropagation();
                }
            });

            // switch to compact chat

            const chatElements = [
                '.modChat',
                '.emojisContainer',
                '.chatSettingsContainer',
            ];

            const emojiBtn = byId('openEmojiMenu');
            const compactChat = byId('compactChat');
            compactChat.addEventListener('change', () => {
                compactChat.checked ? compactMode() : defaultMode();
            });

            function compactMode() {
                chatElements.forEach((querySelector) => {
                    const el = document.querySelector(querySelector);
                    if (el) {
                        el.classList.add('mod-compact');
                    }
                });
                emojiBtn.style.display = 'none';

                modSettings.chat.compact = true;
                updateStorage();
            }

            function defaultMode() {
                chatElements.forEach((querySelector) => {
                    const el = document.querySelector(querySelector);
                    if (el) {
                        el.classList.remove('mod-compact');
                    }
                });
                emojiBtn.style.display = 'flex';

                modSettings.chat.compact = false;
                updateStorage();
            }

            if (modSettings.chat.compact) compactMode();
        },

        updateChat(data) {
            if (this.blackListCharacters.includes(data.message)) return;

            let that = this;
            let time = '';
            if (data.time !== null) {
                time = prettyTime.am_pm(data.time);
            }

            let { name, message } = data;
            name = noXSS(name);
            message = noXSS(message);
            const color = this.friend_names.has(name)
                ? this.friends_settings.highlight_color
                : data.color || '#ffffff';
            const glow =
                this.friend_names.has(name) && this.friends_settings.highlight_friends
                    ? `text-shadow: 0 1px 3px ${color}`
                    : '';
            const id = rdmString(12);

            const chatMessage = document.createElement('div');
            chatMessage.classList.add('message');

            chatMessage.innerHTML = `
                <div class="centerXY" style="gap: 3px;">
					<div class="flex">
						<span style="color: ${color};${glow}" class="message_name" id="${id}">${name}</span>
						<span>&#58;</span>
					</div>
					<span class="chatMessage-text">${message}</span>
                </div>
                <span class="time">${time}</span>
            `;

            const chatContainer = byId('mod-messages');
            const isScrolledToBottom =
                chatContainer.scrollHeight - chatContainer.scrollTop <=
                chatContainer.clientHeight + 1;
            const isNearBottom =
                chatContainer.scrollHeight - chatContainer.scrollTop - 200 <=
                chatContainer.clientHeight;

            chatContainer.append(chatMessage);

            if (isScrolledToBottom || isNearBottom) {
                if (!this.scrolling) {
                    this.scrolling = true;
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                    this.scrolling = false;
                }
            }

            if (name == this.nick) return;

            const nameEl = byId(id);
            nameEl.addEventListener('mousedown', (e) => {
                if (that.onContext) return;
                if (e.button === 2) {
                    // Create a custom context menu
                    const contextMenu = document.createElement('div');
                    contextMenu.classList.add('chat-context');
                    contextMenu.innerHTML = `
                        <span>${name}</span>
                        <button id="muteButton">Mute</button>
                    `;

                    const contextMenuTop = e.clientY - 80;
                    const contextMenuLeft = e.clientX;

                    // Set the position of the context menu
                    contextMenu.style.top = `${contextMenuTop}px`;
                    contextMenu.style.left = `${contextMenuLeft}px`;

                    document.body.appendChild(contextMenu);
                    that.onContext = true;

                    const muteButton = byId('muteButton');
                    muteButton.addEventListener('click', () => {
                        let message =
                            name === 'Spectator'
                                ? `Are you sure you want to mute all spectators until you refresh the page?`
                                : `Are you sure you want to mute '${name}' until you refresh the page?`;
                        if (confirm(message)) {
                            this.muteUser(name);
                            contextMenu.remove();
                        }
                    });

                    document.addEventListener('click', (event) => {
                        if (!contextMenu.contains(event.target)) {
                            that.onContext = false;
                            contextMenu.remove();
                        }
                    });
                }
            });

            nameEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            this.renderedMessages++;
            if (this.renderedMessages > this.maxChatMessages) {
                chatContainer.removeChild(chatContainer.firstChild);
                this.renderedMessages--;
            }
        },

        muteUser(name) {
            this.mutedUsers.push(name);

            const msgNames = document.querySelectorAll('.message_name');
            msgNames.forEach((msgName) => {
                if (msgName.innerHTML == name) {
                    const msgParent = msgName.closest('.message');
                    msgParent.remove();
                }
            });
        },

        async getGoogleFonts() {
            const fontFamilies = await (await fetch(this.appRoutes.fonts)).json();

            return fontFamilies;
        },

        async getEmojis() {
            const response = await fetch(
                'https://czrsd.com/static/sigmod/emojis.json',
            );
            return await response.json();
        },

        emojiMenu() {
            const updateEmojis = (searchTerm = '') => {
                const emojisContainer = document.querySelector('.emojisContainer');
                const categoriesContainer =
                    emojisContainer.querySelector('#categories');

                categoriesContainer.innerHTML = '';
                window.emojis.forEach((emojiData) => {
                    const { emoji, description, category, tags } = emojiData;
                    if (
                        !searchTerm ||
                        tags.some((tag) => tag.includes(searchTerm.toLowerCase()))
                    ) {
                        let categoryId = category
                            .replace(/\s+/g, '-')
                            .replace('&', 'and')
                            .toLowerCase();
                        let categoryDiv = categoriesContainer.querySelector(
                            `#${categoryId}`,
                        );
                        if (!categoryDiv) {
                            categoryDiv = document.createElement('div');
                            categoryDiv.id = categoryId;
                            categoryDiv.classList.add('category');
                            categoryDiv.innerHTML = `<span>${category}</span><div class="emojiContainer"></div>`;
                            categoriesContainer.appendChild(categoryDiv);
                        }
                        const emojiContainer = categoryDiv.querySelector('.emojiContainer');
                        const emojiDiv = document.createElement('div');
                        emojiDiv.classList.add('emoji');
                        emojiDiv.innerHTML = emoji;
                        emojiDiv.title = `${emoji} - ${description}`;
                        emojiDiv.addEventListener('click', () => {
                            const chatInput = document.querySelector('#chatSendInput');
                            chatInput.value += emoji;
                        });
                        emojiContainer.appendChild(emojiDiv);
                    }
                });
            };

            const emojisContainer = document.createElement('div');
            emojisContainer.classList.add(
                'chatAddedContainer',
                'emojisContainer',
                'hidden_full',
            );
            emojisContainer.innerHTML = `<input type="text" class="chatInput" id="searchEmoji" style="background-color: #050505; border-radius: .5rem; flex-grow: 0;" placeholder="Search..." /><div id="categories" class="scroll"></div>`;

            const chatInput = emojisContainer.querySelector('#searchEmoji');
            chatInput.addEventListener('input', (event) => {
                const searchTerm = event.target.value.toLowerCase();
                updateEmojis(searchTerm);
            });

            document.body.append(emojisContainer);

            const chatSettingsContainer = document.querySelector(
                '.chatSettingsContainer',
            );

            byId('openEmojiMenu').addEventListener('click', () => {
                if (!window.emojis) {
                    this.getEmojis().then((emojis) => {
                        window.emojis = emojis;
                        updateEmojis();
                    });
                }

                if (emojisContainer.classList.contains('hidden_full')) {
                    emojisContainer.classList.remove('hidden_full');
                    chatSettingsContainer.classList.add('hidden_full');
                } else {
                    emojisContainer.classList.add('hidden_full');
                }
            });
        },

        chatSettings() {
            const menu = document.createElement('div');
            menu.classList.add(
                'chatAddedContainer',
                'chatSettingsContainer',
                'scroll',
                'hidden_full',
            );
            menu.innerHTML = `
                <div class="modInfoPopup" style="display: none">
                    <p>Send location in chat with keybind</p>
                </div>
                <div class="scroll">
                    <div class="csBlock">
                        <div class="csBlockTitle">
                            <span>Keybindings</span>
                        </div>
                        <div class="csRow">
                            <div class="csRowName">
                                <span>Location</span>
                                <span class="infoIcon">
                                    <svg fill="#ffffff" id="Capa_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 416.979 416.979" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M356.004,61.156c-81.37-81.47-213.377-81.551-294.848-0.182c-81.47,81.371-81.552,213.379-0.181,294.85 c81.369,81.47,213.378,81.551,294.849,0.181C437.293,274.636,437.375,142.626,356.004,61.156z M237.6,340.786 c0,3.217-2.607,5.822-5.822,5.822h-46.576c-3.215,0-5.822-2.605-5.822-5.822V167.885c0-3.217,2.607-5.822,5.822-5.822h46.576 c3.215,0,5.822,2.604,5.822,5.822V340.786z M208.49,137.901c-18.618,0-33.766-15.146-33.766-33.765 c0-18.617,15.147-33.766,33.766-33.766c18.619,0,33.766,15.148,33.766,33.766C242.256,122.755,227.107,137.901,208.49,137.901z"></path> </g> </g></svg>
                                </span>
                            </div>
                            <input type="text" name="location" id="modinput9" class="keybinding" value="${modSettings.macros.keys.location || ''}" placeholder="..." maxlength="1" onfocus="this.select()">
                        </div>
                        <div class="csRow">
                            <div class="csRowName">
                                <span>Show / Hide</span>
                            </div>
                            <input type="text" name="toggle.chat" id="modinput10" class="keybinding" value="${modSettings.macros.keys.toggle.chat || ''}" placeholder="..." maxlength="1" onfocus="this.select()">
                        </div>
                    </div>
                    <div class="csBlock">
                        <div class="csBlockTitle">
                            <span>General</span>
                        </div>
                        <div class="csRow">
                            <div class="csRowName">
                                <span>Time</span>
                            </div>
                            <div class="modCheckbox">
                              <input id="showChatTime" type="checkbox" checked />
                              <label class="cbx" for="showChatTime"></label>
                            </div>
                        </div>
                        <div class="csRow">
                            <div class="csRowName">
                                <span>Name colors</span>
                            </div>
                            <div class="modCheckbox">
                              <input id="showNameColors" type="checkbox" checked />
                              <label class="cbx" for="showNameColors"></label>
                            </div>
                        </div>
                        <div class="csRow">
                            <div class="csRowName">
                                <span>Party / Main</span>
                            </div>
                            <div class="modCheckbox">
                              <input id="showPartyMain" type="checkbox" checked />
                              <label class="cbx" for="showPartyMain"></label>
                            </div>
                        </div>
                        <div class="csRow">
                            <div class="csRowName">
                                <span>Blur Tag</span>
                            </div>
                            <div class="modCheckbox">
                              <input id="blurTag" type="checkbox" checked />
                              <label class="cbx" for="blurTag"></label>
                            </div>
                        </div>
                        <div class="flex f-column g-5 centerXY" style="padding: 0 5px">
                            <div class="csRowName">
                                <span>Location text</span>
                            </div>
                          <input type="text" id="locationText" placeholder="{pos}..." value="{pos}" class="form-control" />
                        </div>
                    </div>
                    <div class="csBlock">
                        <div class="csBlockTitle">
                            <span>Style</span>
                        </div>
                        <div class="csRow">
                            <div class="csRowName">
                                <span>Compact chat</span>
                            </div>
                            <div class="modCheckbox">
                              <input id="compactChat" type="checkbox" ${modSettings.chat.compact ? 'checked' : ''} />
                              <label class="cbx" for="compactChat"></label>
                            </div>
                        </div>
                        <div class="csRow">
                            <div class="csRowName">
                                <span>Text</span>
                            </div>
							<div id="chatTextColor"></div>
                        </div>
                        <div class="csRow">
                            <div class="csRowName">
                                <span>Background</span>
                            </div>
							<div id="chatBackground"></div>
                        </div>
                        <div class="csRow">
                            <div class="csRowName">
                                <span>Theme</span>
                            </div>
							<div id="chatThemeChanger"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.append(menu);

            const infoIcon = document.querySelector('.infoIcon');
            const modInfoPopup = document.querySelector('.modInfoPopup');
            let popupOpen = false;

            infoIcon.addEventListener('click', (event) => {
                event.stopPropagation();
                modInfoPopup.style.display = popupOpen ? 'none' : 'block';
                popupOpen = !popupOpen;
            });

            document.addEventListener('click', (event) => {
                if (popupOpen && !modInfoPopup.contains(event.target)) {
                    modInfoPopup.style.display = 'none';
                    popupOpen = false;
                }
            });

            const showChatTime = document.querySelector('#showChatTime');
            const showNameColors = document.querySelector('#showNameColors');

            showChatTime.addEventListener('change', () => {
                const timeElements = document.querySelectorAll('.time');
                if (showChatTime.checked) {
                    modSettings.chat.showTime = true;
                    updateStorage();
                } else {
                    modSettings.chat.showTime = false;
                    if (timeElements) {
                        timeElements.forEach((el) => (el.innerHTML = ''));
                    }
                    updateStorage();
                }
            });

            showNameColors.addEventListener('change', () => {
                const message_names = document.querySelectorAll('.message_name');
                if (showNameColors.checked) {
                    modSettings.chat.showNameColors = true;
                    updateStorage();
                } else {
                    modSettings.chat.showNameColors = false;
                    if (message_names) {
                        message_names.forEach((el) => (el.style.color = '#fafafa'));
                    }
                    updateStorage();
                }
            });

            // remove old rgba val
            if (modSettings.chat.bgColor.includes('rgba')) {
                modSettings.chat.bgColor = RgbaToHex(modSettings.chat.bgColor);
            }

            const modChat = document.querySelector('.modChat');
            modChat.style.background = modSettings.chat.bgColor;

            const showPartyMain = document.querySelector('#showPartyMain');
            const chatHeader = document.querySelector('.modchat-chatbuttons');

            const changeButtonsState = (show) => {
                chatHeader.style.display = show ? 'flex' : 'none';
                modChat.style.maxHeight = show ? '285px' : '250px';
                modChat.style.minHeight = show ? '285px' : '250px';
                const modChatInner = document.querySelector('.modChat__inner');
                modChatInner.style.maxHeight = show ? '265px' : '230px';
                modChatInner.style.minHeight = show ? '265px' : '230px';
            };

            showPartyMain.addEventListener('change', () => {
                const show = showPartyMain.checked;
                modSettings.chat.showChatButtons = show;
                changeButtonsState(show);
                updateStorage();
            });

            showPartyMain.checked = modSettings.chat.showChatButtons;
            changeButtonsState(modSettings.chat.showChatButtons);

            setTimeout(() => {
                const blurTag = byId('blurTag');
                const tagText = document.querySelector('.tagText');
                const tagElement = document.querySelector('#tag');
                blurTag.addEventListener('change', () => {
                    const state = blurTag.checked;

                    state
                        ? (tagText.classList.add('blur'), tagElement.classList.add('blur'))
                        : (tagText.classList.remove('blur'),
                            tagElement.classList.remove('blur'));
                    modSettings.chat.blurTag = state;
                    updateStorage();
                });
                blurTag.checked = modSettings.chat.blurTag;
                if (modSettings.chat.blurTag) {
                    tagText.classList.add('blur');
                    tagElement.classList.add('blur');
                }
            });

            const locationText = byId('locationText');
            locationText.addEventListener('input', (e) => {
                e.stopPropagation();
                modSettings.chat.locationText = locationText.value;
            });
            locationText.value = modSettings.chat.locationText || '{pos}';
        },

        toggleChat() {
            const modChat = document.querySelector('.modChat');
            const modChatAdded = document.querySelectorAll('.chatAddedContainer');

            const isModChatHidden =
                modChat.style.display === 'none' ||
                getComputedStyle(modChat).display === 'none';

            if (isModChatHidden) {
                modChat.style.opacity = 0;
                modChat.style.display = 'flex';

                setTimeout(() => {
                    modChat.style.opacity = 1;
                }, 10);
            } else {
                modChat.style.opacity = 0;
                modChatAdded.forEach((container) =>
                    container.classList.add('hidden_full'),
                );

                setTimeout(() => {
                    modChat.style.display = 'none';
                }, 300);
            }
        },

        macroSettings() {
            const allSettingNames = document.querySelectorAll('.setting-card-name');

            for (const settingName of Object.values(allSettingNames)) {
                settingName.addEventListener('click', (event) => {
                    const settingCardWrappers = document.querySelectorAll(
                        '.setting-card-wrapper',
                    );
                    const currentWrapper = Object.values(settingCardWrappers).filter(
                        (wrapper) =>
                            wrapper.querySelector('.setting-card-name').textContent ===
                            settingName.textContent,
                    )[0];
                    const settingParameters = currentWrapper.querySelector(
                        '.setting-parameters',
                    );

                    settingParameters.style.display =
                        settingParameters.style.display === 'none' ? 'block' : 'none';
                });
            }
        },

        smallMods() {
            const modAlert_overlay = document.createElement('div');
            modAlert_overlay.classList.add('alert_overlay');
            modAlert_overlay.id = 'modAlert_overlay';
            document.body.append(modAlert_overlay);

            const popup = byId('shop-popup');
            const removeShopPopup = byId('removeShopPopup');
            removeShopPopup.addEventListener('change', () => {
                const checked = removeShopPopup.checked;
                if (checked) {
                    popup.classList.add('hidden_full');
                    modSettings.settings.removeShopPopup = true;
                } else {
                    popup.classList.remove('hidden_full');
                    modSettings.settings.removeShopPopup = false;
                }
                updateStorage();
            });
            if (modSettings.settings.removeShopPopup) {
                popup.classList.add('hidden_full');
                removeShopPopup.checked = true;
            }

            const autoRespawn = byId('autoRespawn');
            if (modSettings.settings.autoRespawn) {
                autoRespawn.checked = true;
            }

            autoRespawn.addEventListener('change', () => {
                modSettings.settings.autoRespawn = autoRespawn.checked;
                updateStorage();
            });

            const auto = byId('autoClaimCoins');
            auto.addEventListener('change', () => {
                const checked = auto.checked;
                modSettings.settings.autoClaimCoins = !!checked;
                updateStorage();
            });
            if (modSettings.settings.autoClaimCoins) {
                auto.checked = true;
            }

            const showChallenges = byId('showChallenges');
            showChallenges.addEventListener('change', () => {
                if (showChallenges.checked) {
                    modSettings.showChallenges = true;
                } else {
                    modSettings.showChallenges = false;
                }
                updateStorage();
            });
            if (modSettings.showChallenges) {
                auto.checked = true;
            }

            const gameTitle = byId('title');

            const newTitle = document.createElement('div');
            newTitle.classList.add('sigmod-title');
            newTitle.innerHTML = `
        <h1 id="title">Sigmally</h1>
        <span id="bycursed">Mod by <a href="https://www.youtube.com/@sigmallyCursed/" target="_blank">Cursed</a></span>
      `;
            gameTitle.replaceWith(newTitle);

            const nickName = byId('nick');
            nickName.maxLength = 50;
            nickName.type = 'text';

            function updNick() {
                const nick = nickName.value;
                mods.nick = nick;
                const welcome = byId('welcomeUser');
                if (welcome) {
                    welcome.innerHTML = `Welcome ${mods.nick || 'Unnamed'}, to the SigMod Client!`;
                }
            }

            nickName.addEventListener('input', () => {
                updNick();
            });

            updNick();

            // Better grammar in the descriptions of the challenges
            setTimeout(() => {
                window.shopLocales.challenge_tab.tasks = {
                    eaten: 'Eat %n food in a game.',
                    xp: 'Get %n XP in a game.',
                    alive: 'Stay alive for %n minutes in a game.',
                    pos: 'Reach top %n on leaderboard.',
                };
            }, 1000);

            const topusersInner = document.querySelector('.top-users__inner');
            topusersInner.classList.add('scroll');
            topusersInner.style.border = 'none';

            byId('signOutBtn').addEventListener('click', () => {
                window.gameSettings.user = null;
            });

            const mode = byId('gamemode');
            mode.addEventListener('change', () => {
                client.send({
                    type: 'server-changed',
                    content: getGameMode(),
                });

                window.gameSettings.isPlaying = false;
            });

            // redirect to owned skins instead of free skins
            const ot = Element.prototype.openTab;
            Element.prototype.openTab = function(tab) {
                if (!tab === 'skins') return;

                setTimeout(() => {
                    Element.prototype.changeTab('owned');
                }, 100);

                ot.apply(this, arguments);
            };

            // Updating the mouse position & the side of the mouse position on the screen
            document.addEventListener('mousemove', (e) => {
                this.mouseX = e.clientX + window.pageXOffset;
                this.mouseY = e.clientY + window.pageYOffset;
                this.screenSide =
                    this.mouseX < window.innerWidth / 2 ? 'left' : 'right';

                const mouseTracker = document.querySelector('.mouseTracker');
                if (!mouseTracker) return;

                mouseTracker.innerText = `X: ${this.mouseX}; Y: ${this.mouseY}`;
            });

            if (window.sigfix) {
                const scoreElement = document.querySelector(
                    'div[style="position: fixed; top: 10px; left: 10px; width: 400px; height: fit-content; user-select: none; z-index: 2; transform-origin: left top;"] > div',
                );

                setInterval(() => {
                    if (scoreElement.innerHTML === '' || !window.gameSettings.isPlaying)
                        return;
                    const score = parseInt(scoreElement.innerHTML.split(': ')[1]);
                    // TODO: fix for tournaments
                }, 1000);
            }

            // change password input type in tournament server to password
            if (!window.tourneyServer) return;
            const password = byId('password');
            if (!password) return;

            password.type = 'password';
            password.autocomplete = 'off';
        },

        removeStorage(storage) {
            localStorage.removeItem(storage);
        },

        credits() {
            console.log(
                `%c
‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎
‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎░█▀▀▀█ ▀█▀ ░█▀▀█ ░█▀▄▀█ ░█▀▀▀█ ░█▀▀▄ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎
‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎─▀▀▀▄▄ ░█─ ░█─▄▄ ░█░█░█ ░█──░█ ░█─░█ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ V${version} ‎ ‎ ‎ ‎
‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎░█▄▄▄█ ▄█▄ ░█▄▄█ ░█──░█ ░█▄▄▄█ ░█▄▄▀ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎
‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎
‎ ‎ ‎ ██████╗░██╗░░░██╗  ░█████╗░██╗░░░██╗██████╗░░██████╗███████╗██████╗░ ‎ ‎ ‎
‎ ‎ ‎ ██╔══██╗╚██╗░██╔╝  ██╔══██╗██║░░░██║██╔══██╗██╔════╝██╔════╝██╔══██╗ ‎ ‎ ‎
‎ ‎ ‎ ██████╦╝░╚████╔╝░  ██║░░╚═╝██║░░░██║██████╔╝╚█████╗░█████╗░░██║░░██║ ‎ ‎ ‎
‎ ‎ ‎ ██╔══██╗░░╚██╔╝░░  ██║░░██╗██║░░░██║██╔══██╗░╚═══██╗██╔══╝░░██║░░██║ ‎ ‎ ‎
‎ ‎ ‎ ██████╦╝░░░██║░░░  ╚█████╔╝╚██████╔╝██║░░██║██████╔╝███████╗██████╔╝ ‎ ‎ ‎
‎ ‎ ‎ ╚═════╝░░░░╚═╝░░░  ░╚════╝░░╚═════╝░╚═╝░░╚═╝╚═════╝░╚══════╝╚═════╝░ ‎ ‎ ‎
‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎
`,
                'background-color: black; color: green',
            );
        },
        saveNames() {
            let savedNames = modSettings.settings.savedNames;
            let savedNamesOutput = byId('savedNames');
            let saveNameBtn = byId('saveName');
            let saveNameInput = byId('saveNameValue');

            const createNameDiv = (name) => {
                let nameDiv = document.createElement('div');
                nameDiv.classList.add('NameDiv');

                let nameLabel = document.createElement('label');
                nameLabel.classList.add('NameLabel');
                nameLabel.innerText = name;

                let delName = document.createElement('button');
                delName.innerText = 'X';
                delName.classList.add('delName');

                nameDiv.addEventListener('click', () => {
                    const name = nameLabel.innerText;
                    navigator.clipboard.writeText(name).then(() => {
                        this.modAlert(
                            `Added the name '${name}' to your clipboard!`,
                            'success',
                        );
                    });
                });

                delName.addEventListener('click', () => {
                    if (
                        confirm(
                            'Are you sure you want to delete the name \'' +
                            nameLabel.innerText +
                            '\'?',
                        )
                    ) {
                        nameDiv.remove();
                        savedNames = savedNames.filter((n) => n !== nameLabel.innerText);
                        modSettings.settings.savedNames = savedNames;
                        updateStorage();
                    }
                });

                nameDiv.appendChild(nameLabel);
                nameDiv.appendChild(delName);
                return nameDiv;
            };

            saveNameBtn.addEventListener('click', () => {
                if (saveNameInput.value === '') return;

                setTimeout(() => {
                    saveNameInput.value = '';
                }, 10);

                if (savedNames.includes(saveNameInput.value)) {
                    return;
                }

                let nameDiv = createNameDiv(saveNameInput.value);
                savedNamesOutput.appendChild(nameDiv);

                savedNames.push(saveNameInput.value);
                modSettings.settings.savedNames = savedNames;
                updateStorage();
            });

            if (savedNames.length > 0) {
                savedNames.forEach((name) => {
                    let nameDiv = createNameDiv(name);
                    savedNamesOutput.appendChild(nameDiv);
                });
            }
        },

        initStats() {
            // initialize player stats
            const statElements = [
                'stat-time-played',
                'stat-highest-mass',
                'stat-total-deaths',
                'stat-total-mass',
            ];
            this.storage = localStorage.getItem('game-stats');

            if (!this.storage) {
                this.storage = {
                    'time-played': 0, // seconds
                    'highest-mass': 0,
                    'total-deaths': 0,
                    'total-mass': 0,
                };
                localStorage.setItem('game-stats', JSON.stringify(this.storage));
            } else {
                this.storage = JSON.parse(this.storage);
            }

            statElements.forEach((rawStat) => {
                const stat = rawStat.replace('stat-', '');
                const value = this.storage[stat];
                this.updateStatElm(rawStat, value);
            });

            this.session.bind(this)();
        },

        updateStat(key, value) {
            this.storage[key] = value;
            localStorage.setItem('game-stats', JSON.stringify(this.storage));
            this.updateStatElm(key, value);
        },

        updateStatElm(stat, value) {
            const element = byId(stat);

            if (element) {
                if (stat === 'stat-time-played') {
                    const hours = Math.floor(value / 3600);
                    const minutes = Math.floor((value % 3600) / 60);
                    const formattedTime =
                        hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                    element.innerHTML = formattedTime;
                } else {
                    const formattedValue =
                        stat === 'stat-highest-mass' || stat === 'stat-total-mass'
                            ? value > 999
                                ? `${(value / 1000).toFixed(1)}k`
                                : value.toString()
                            : value.toString();
                    element.innerHTML = formattedValue;
                }
            }
        },

        session() {
            let playingInterval;
            let minPlaying = 0;
            let isPlaying = window.gameSettings.isPlaying;

            const playBtn = byId('play-btn');
            let a = null;

            playBtn.addEventListener('click', async () => {
                if (isPlaying) return;

                while (!window.gameSettings.isPlaying) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }

                isPlaying = true;
                let timer = null;

                if (modSettings.playTimer) {
                    timer = document.createElement('span');
                    timer.classList.add('playTimer');
                    timer.innerText = '0m0s played';
                    document.body.append(timer);
                }

                // mouse tracker in session method so it's only visible when playing
                if (modSettings.mouseTracker) {
                    const mouse = document.createElement('span');
                    mouse.classList.add('mouseTracker');
                    mouse.innerText = 'X: 0; Y: 0';
                    document.body.append(mouse);

                    if (!modSettings.playTimer) {
                        mouse.style.top = '128px';
                    }
                }

                let count = 0;
                playingInterval = setInterval(() => {
                    count++;
                    this.storage['time-played']++;
                    if (count % 60 === 0) {
                        minPlaying++;
                    }
                    this.updateStat('time-played', this.storage['time-played']);

                    if (modSettings.playTimer) {
                        this.updateTimeStat(timer, count);
                    }
                }, 1000);
            });

            setInterval(() => {
                if (menuClosed() && byId('overlays').style.display !== 'none') {
                    byId('overlays').style.display = 'none';
                }

                if (isDead() && !dead) {
                    clearInterval(playingInterval);
                    dead = true;

                    const playTimer = document.querySelector('.playTimer');
                    if (playTimer) playTimer.remove();

                    const mouseTracker = document.querySelector('.mouseTracker');
                    if (mouseTracker) mouseTracker.remove();

                    const score = parseFloat(byId('highest_mass').innerText);
                    const highest = this.storage['highest-mass'];

                    if (score > highest) {
                        this.storage['highest-mass'] = score;
                        this.updateStat('highest-mass', this.storage['highest-mass']);
                    }

                    this.storage['total-deaths']++;
                    this.updateStat('total-deaths', this.storage['total-deaths']);

                    this.storage['total-mass'] += score;
                    this.updateStat('total-mass', this.storage['total-mass']);
                    isPlaying = window.gameSettings.isPlaying = false;

                    if (this.lastOneStanding) {
                        client.send({
                            type: 'result',
                            content: null,
                        });
                        playBtn.disabled = true;
                    }

                    if (modSettings.showChallenges && window.gameSettings.user)
                        this.showChallenges();
                } else if (!isDead()) {
                    dead = false;
                    const challengesDeathscreen = document.querySelector(
                        '.challenges_deathscreen',
                    );
                    if (challengesDeathscreen) challengesDeathscreen.remove();
                }
            });
        },
        updateTimeStat(el, seconds) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            const timeString = `${minutes}m${remainingSeconds}s`;

            el.innerText = `${timeString} played`;
        },

        async showChallenges() {
            const challengeData = await (
                await fetch(
                    `https://sigmally.com/api/user/challenge/${window.gameSettings.user.email}`,
                )
            ).json();

            if (challengeData.status !== 'success') return;

            const shopLocales = window.shopLocales;
            let challengesCompleted = 0;

            const allChallenges = challengeData.data;
            allChallenges.forEach(({ status }) => {
                if (status) challengesCompleted++;
            });

            let challenges;
            if (challengesCompleted === allChallenges.length) {
                challenges = `<div class="challenge-row" style="justify-content: center;">All challenges completed.</div>`;
            } else {
                challenges = allChallenges
                    .filter(({ status }) => !status)
                    .map(({ task, best, status, ready, goal }) => {
                        const desc = shopLocales.challenge_tab.tasks[task].replace(
                            '%n',
                            task === 'alive' ? goal / 60 : goal,
                        );
                        const btn = ready
                            ? `<button class="challenge-collect-secondary" onclick="this.challenge('${task}', ${status})">${shopLocales.challenge_tab.collect}</button>`
                            : `<div class="challenge-best-secondary">${shopLocales.challenge_tab.result}${Math.round(best)}${task === 'alive' ? 's' : ''}</div>`;
                        return `
                        <div class="challenge-row">
                          <div class="challenge-desc">${desc}</div>
                          ${btn}
                        </div>`;
                    })
                    .join('');
            }

            const modal = document.createElement('div');
            modal.classList.add('challenges_deathscreen');
            modal.innerHTML = `
                <span class="challenges-title">Daily challenges</span>
                <div class="challenges-col">${challenges}</div>
                <span class="centerXY new-challenges">New challenges in 0h 0m 0s</span>
            `;

            const toggleColor = (element, background, text) => {
                let image = `url("${background}")`;
                if (background.includes('http')) {
                    element.style.background = image;
                    element.style.backgroundPosition = 'center';
                    element.style.backgroundSize = 'cover';
                    element.style.backgroundRepeat = 'no-repeat';
                } else {
                    element.style.background = background;
                    element.style.backgroundRepeat = 'no-repeat';
                }
                element.style.color = text;
            };

            if (modSettings.themes.current !== 'Dark') {
                let selectedTheme;
                selectedTheme =
                    window.themes.defaults.find(
                        (theme) => theme.name === modSettings.themes.current,
                    ) ||
                    modSettings.themes.custom.find(
                        (theme) => theme.name === modSettings.themes.current,
                    ) ||
                    null;
                if (!selectedTheme) {
                    selectedTheme =
                        window.themes.orderly.find(
                            (theme) => theme.name === modSettings.themes.current,
                        ) ||
                        modSettings.themes.custom.find(
                            (theme) => theme.name === modSettings.themes.current,
                        );
                }

                if (selectedTheme) {
                    toggleColor(modal, selectedTheme.background, selectedTheme.text);
                }
            }

            document
                .querySelector('.menu-wrapper--stats-mode')
                .insertAdjacentElement('afterbegin', modal);

            if (challengesCompleted < allChallenges.length) {
                document
                    .querySelectorAll('.challenge-collect-secondary')
                    .forEach((btn) => {
                        btn.addEventListener('click', () => {
                            const parentChallengeRow = btn.closest('.challenge-row');
                            if (parentChallengeRow) {
                                setTimeout(() => {
                                    parentChallengeRow.remove();
                                }, 500);
                            }
                        });
                    });
            }

            this.createDayTimer();
        },

        timeToString(timeLeft) {
            const string = new Date(timeLeft).toISOString().slice(11, 19);
            const [hours, minutes, seconds] = string.split(':');

            return `${hours}h ${minutes}m ${seconds}s`;
        },
        toISODate: (date) => {
            const withTime = date ? new Date(date) : new Date();
            const [withoutTime] = withTime.toISOString().split('T');
            return withoutTime;
        },
        createDayTimer() {
            const oneDay = 1000 * 60 * 60 * 24;
            const getTime = () => {
                const today = this.toISODate();
                const from = new Date(today).getTime();
                const to = from + oneDay;

                const distance = to - Date.now();
                const time = this.timeToString(distance);
                return time;
            };

            const children = document.querySelector('.new-challenges');
            if (children) {
                children.innerHTML = `New challenges in ${getTime()}`;
            }

            this.dayTimer = setInterval(() => {
                const today = this.toISODate();
                const from = new Date(today).getTime();
                const to = from + oneDay;

                const distance = to - Date.now();
                const time = this.timeToString(distance);

                const children = document.querySelector('.new-challenges');
                if (!children || distance < 1000 || !isDead()) {
                    clearInterval(this.dayTimer);
                    return;
                }
                children.innerHTML = `New challenges in ${getTime()}`;
            }, 1000);
        },

        macros() {
            let that = this;
            const KEY_SPLIT = this.splitKey;
            let ff = null;
            let keydown = false;
            let open = false;
            const canvas = byId('canvas');
            const mod_menu = document.querySelector('.mod_menu');

            const freezeType = byId('freezeType');
            let freezeKeyPressed = false;
            let freezeMouseClicked = false;
            let freezeOverlay = null;

            let vOverlay = null;
            let vLocked = false;
            let activeVLine = false;

            let fixedOverlay = null;
            let fixedLocked = false;
            let activeFixedLine = false;

            /* intervals */

            // Respawn interval
            setInterval(() => {
                if (
                    modSettings.settings.autoRespawn &&
                    this.respawnTime &&
                    Date.now() - this.respawnTime >= this.respawnCooldown
                ) {
                    this.respawn();
                }
            });

            // mouse fast feed interval
            setInterval(() => {
                if (dead || !menuClosed() || !this.mouseDown) return;
                keypress('w', 'KeyW');
            }, 50);

            async function split(times) {
                if (times > 0) {
                    window.dispatchEvent(new KeyboardEvent('keydown', KEY_SPLIT));
                    window.dispatchEvent(new KeyboardEvent('keyup', KEY_SPLIT));
                    split(times - 1);
                }
            }

            async function selfTrick() {
                let i = 4;

                while (i--) {
                    split(1);
                    await wait(20);
                }
            }

            async function doubleTrick() {
                let i = 2;

                while (i--) {
                    split(1);
                    await wait(20);
                }
            }

            function mouseToScreenCenter() {
                const screenCenterX = canvas.width / 2;
                const screenCenterY = canvas.height / 2;

                mousemove(screenCenterX, screenCenterY);

                return {
                    x: screenCenterX,
                    y: screenCenterY,
                };
            }

            async function instantSplit() {
                await wait(300);

                if (
                    modSettings.macros.keys.line.instantSplit &&
                    modSettings.macros.keys.line.instantSplit > 0
                ) {
                    split(modSettings.macros.keys.line.instantSplit);
                }
            }

            async function vLine() {
                if (!activeVLine) return;
                const x = playerPosition.x;
                const y = playerPosition.y;

                const offsetUpX = playerPosition.x;
                const offsetUpY = playerPosition.y - 100;
                const offsetDownX = playerPosition.x;
                const offsetDownY = playerPosition.y + 100;

                freezepos = false;
                window.sendMouseMove(offsetUpX, offsetUpY);
                freezepos = true;

                await wait(50);

                freezepos = false;
                window.sendMouseMove(offsetDownX, offsetDownY);
                freezepos = true;
            }

            async function toggleHorizontal(mouse = false) {
                if (!freezeKeyPressed) {
                    if (activeVLine || activeFixedLine) return;

                    window.sendMouseMove(playerPosition.x, playerPosition.y);
                    freezepos = true;

                    instantSplit();

                    freezeOverlay = document.createElement('div');
                    freezeOverlay.innerHTML = `
							<span style="position: absolute; bottom: 50px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 26px; user-select: none;">Movement Stopped</span>
						`;
                    freezeOverlay.style =
                        'position: absolute; top: 0; left: 0; z-index: 99; width: 100%; height: 100vh; overflow: hidden; pointer-events: none;';

                    if (
                        mouse &&
                        (modSettings.macros.mouse.left === 'freeze' ||
                            modSettings.macros.mouse.right === 'freeze')
                    ) {
                        freezeOverlay.addEventListener('mousedown', (e) => {
                            if (
                                e.button === 0 &&
                                modSettings.macros.mouse.left === 'freeze'
                            ) {
                                // Left mouse button (1)
                                handleFreezeEvent();
                            }
                            if (
                                e.button === 2 &&
                                modSettings.macros.mouse.right === 'freeze'
                            ) {
                                // Right mouse button (2)
                                handleFreezeEvent();
                            }
                        });

                        if (modSettings.macros.mouse.right === 'freeze') {
                            freezeOverlay.addEventListener('contextmenu', (e) => {
                                e.preventDefault();
                            });
                        }
                    }

                    function handleFreezeEvent() {
                        if (freezeOverlay != null) freezeOverlay.remove();
                        freezeOverlay = null;
                        freezeKeyPressed = false;
                    }

                    document.querySelector('.body__inner').append(freezeOverlay);

                    freezeKeyPressed = true;
                } else {
                    if (freezeOverlay != null) freezeOverlay.remove();
                    freezeOverlay = null;
                    freezeKeyPressed = false;

                    freezepos = false;
                }
            }

            async function toggleVertical() {
                if (!activeVLine) {
                    if (freezeKeyPressed || activeFixedLine) return;

                    window.sendMouseMove(playerPosition.x, playerPosition.y);
                    freezepos = true;

                    instantSplit();

                    vOverlay = document.createElement('div');
                    vOverlay.style = 'pointer-events: none;';
                    vOverlay.innerHTML = `
                        <span style="position: absolute; bottom: 50px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 26px; user-select: none;">Vertical locked</span>
                    `;
                    vOverlay.style =
                        'position: absolute; top: 0; left: 0; z-index: 99; width: 100%; height: 100vh; overflow: hidden; pointer-events: none;';

                    document.querySelector('.body__inner').append(vOverlay);

                    activeVLine = true;
                } else {
                    activeVLine = false;
                    freezepos = false;
                    if (vOverlay) vOverlay.remove();
                    vOverlay = null;
                }
            }

            async function toggleFixed() {
                if (!activeFixedLine) {
                    if (freezeKeyPressed || activeVLine) return;

                    window.sendMouseMove(playerPosition.x, playerPosition.y);

                    freezepos = true;

                    instantSplit();

                    fixedOverlay = document.createElement('div');
                    fixedOverlay.style = 'pointer-events: none;';
                    fixedOverlay.innerHTML = `
                        <span style="position: absolute; bottom: 50px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 26px; user-select: none;">Mouse locked</span>
                    `;
                    fixedOverlay.style =
                        'position: absolute; top: 0; left: 0; z-index: 99; width: 100%; height: 100vh; overflow: hidden; pointer-events: none;';

                    document.querySelector('.body__inner').append(fixedOverlay);

                    activeFixedLine = true;
                } else {
                    activeFixedLine = false;
                    freezepos = false;
                    if (fixedOverlay) fixedOverlay.remove();
                    fixedOverlay = null;
                }
            }

            function sendLocation() {
                if (!playerPosition.x || !playerPosition.y) return;

                const gamemode = byId('gamemode');
                const coordinatesToCheck =
                    gamemode.value === 'eu0.sigmally.com/ws/'
                        ? coordinates
                        : coordinates2;

                let field = '';

                for (const label in coordinatesToCheck) {
                    const { min, max } = coordinatesToCheck[label];

                    if (
                        playerPosition.x >= min.x &&
                        playerPosition.x <= max.x &&
                        playerPosition.y >= min.y &&
                        playerPosition.y <= max.y
                    ) {
                        field = label;
                        break;
                    }
                }

                const locationText = modSettings.chat.locationText || field;
                const message = locationText.replace('{pos}', field);
                window.sendChat(message);
            }

            function toggleSettings(setting) {
                const settingElement = document.querySelector(`input#${setting}`);
                if (settingElement) {
                    settingElement.click();
                } else {
                    console.error(`Setting "${setting}" not found`);
                }
            }

            document.addEventListener('keyup', (e) => {
                const key = e.key.toLowerCase();
                if (key == modSettings.macros.keys.rapidFeed && keydown) {
                    clearInterval(ff);
                    keydown = false;
                }
            });
            document.addEventListener('keydown', (e) => {
                // prevent disconnecting & using macros on input fields
                if (
                    document.activeElement.tagName === 'INPUT' ||
                    document.activeElement.tagName === 'TEXTAREA'
                ) {
                    e.stopPropagation();
                    return;
                }
                const key = e.key.toLowerCase();

                if (key === 'p') {
                    e.stopPropagation();
                }
                if (key === 'tab' && !window.screenTop && !window.screenY) {
                    e.preventDefault();
                }

                if (key === modSettings.macros.keys.rapidFeed) {
                    e.stopPropagation(); // block actual feeding key
                    if (!keydown) {
                        keydown = true;
                        ff = setInterval(
                            () => keypress('w', 'KeyW'),
                            modSettings.macros.feedSpeed,
                        );
                    }
                }
                // vertical linesplit
                if (
                    activeVLine &&
                    (key === ' ' ||
                        key === modSettings.macros.keys.splits.doubleSplit ||
                        key === modSettings.macros.keys.splits.tripleSplit ||
                        key === modSettings.macros.keys.splits.quadSplit)
                ) {
                    vLine();
                }

                handleKeydown(key);
            });

            async function handleKeydown(key) {
                switch (key) {
                    case modSettings.macros.keys.toggle.menu: {
                        if (!open) {
                            mod_menu.style.display = 'flex';
                            setTimeout(() => {
                                mod_menu.style.opacity = 1;
                            }, 10);
                            open = true;
                        } else {
                            mod_menu.style.opacity = 0;
                            setTimeout(() => {
                                mod_menu.style.display = 'none';
                            }, 300);
                            open = false;
                        }
                        break;
                    }

                    case modSettings.macros.keys.splits.double:
                        split(2);
                        break;

                    case modSettings.macros.keys.splits.triple:
                        split(3);
                        break;

                    case modSettings.macros.keys.splits.quad:
                        split(4);
                        break;

                    case modSettings.macros.keys.splits.selfTrick:
                        selfTrick();
                        break;

                    case modSettings.macros.keys.splits.doubleTrick:
                        doubleTrick();
                        break;

                    case modSettings.macros.keys.line.horizontal:
                        if (menuClosed()) toggleHorizontal();
                        break;

                    case modSettings.macros.keys.line.vertical:
                        if (menuClosed()) toggleVertical();
                        break;

                    case modSettings.macros.keys.line.fixed:
                        if (menuClosed()) toggleFixed();
                        break;

                    case modSettings.macros.keys.location:
                        sendLocation();
                        break;

                    case modSettings.macros.keys.toggle.chat:
                        mods.toggleChat();
                        break;

                    case modSettings.macros.keys.toggle.names:
                        toggleSettings('showNames');
                        break;

                    case modSettings.macros.keys.toggle.skins:
                        toggleSettings('showSkins');
                        break;

                    case modSettings.macros.keys.toggle.autoRespawn:
                        toggleSettings('autoRespawn');
                        break;

                    case modSettings.macros.keys.respawn:
                        mods.respawnGame();
                        break;

                    case modSettings.macros.keys.saveImage:
                        await mods.saveImage();
                        break;
                }
            }

            canvas.addEventListener('mousedown', (e) => {
                const {
                    macros: { mouse },
                } = modSettings;

                if (e.button === 0) {
                    // Left mouse button (0)
                    if (mouse.left === 'fastfeed') {
                        if (
                            document.activeElement.tagName === 'INPUT' ||
                            document.activeElement.tagName === 'TEXTAREA'
                        )
                            return;
                        this.mouseDown = true;
                    } else if (mouse.left === 'split') {
                        split(1);
                    } else if (mouse.left === 'split2') {
                        split(2);
                    } else if (mouse.left === 'split3') {
                        split(3);
                    } else if (mouse.left === 'split4') {
                        split(4);
                    } else if (mouse.left === 'freeze') {
                        toggleHorizontal(true);
                    } else if (mouse.left === 'dTrick') {
                        doubleTrick();
                    } else if (mouse.left === 'sTrick') {
                        selfTrick();
                    }
                } else if (e.button === 2) {
                    // Right mouse button (2)
                    e.preventDefault();
                    if (mouse.right === 'fastfeed') {
                        if (
                            document.activeElement.tagName === 'INPUT' ||
                            document.activeElement.tagName === 'TEXTAREA'
                        )
                            return;
                        this.mouseDown = true;
                    } else if (mouse.right === 'split') {
                        split(1);
                    } else if (mouse.right === 'split2') {
                        split(2);
                    } else if (mouse.right === 'split3') {
                        split(3);
                    } else if (mouse.right === 'split4') {
                        split(4);
                    } else if (mouse.right === 'freeze') {
                        toggleHorizontal(true);
                    } else if (mouse.right === 'dTrick') {
                        doubleTrick();
                    } else if (mouse.right === 'sTrick') {
                        selfTrick();
                    }
                }
            });

            canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });

            canvas.addEventListener('mouseup', () => {
                if (modSettings.macros.mouse.left === 'fastfeed') {
                    this.mouseDown = false;
                } else if (modSettings.macros.mouse.right === 'fastfeed') {
                    this.mouseDown = false;
                }
            });

            const macroSelectHandler = (macroSelect, key) => {
                const {
                    macros: { mouse },
                } = modSettings;
                macroSelect.value = modSettings[key] || 'none';

                macroSelect.addEventListener('change', () => {
                    const selectedOption = macroSelect.value;

                    const optionActions = {
                        none: () => {
                            mouse[key] = null;
                        },
                        fastfeed: () => {
                            mouse[key] = 'fastfeed';
                        },
                        split: () => {
                            mouse[key] = 'split';
                        },
                        split2: () => {
                            mouse[key] = 'split2';
                        },
                        split3: () => {
                            mouse[key] = 'split3';
                        },
                        split4: () => {
                            mouse[key] = 'split4';
                        },
                        freeze: () => {
                            mouse[key] = 'freeze';
                        },
                        dTrick: () => {
                            mouse[key] = 'dTrick';
                        },
                        sTrick: () => {
                            mouse[key] = 'sTrick';
                        },
                    };

                    if (optionActions[selectedOption]) {
                        optionActions[selectedOption]();
                        updateStorage();
                    }
                });
            };

            const m1_macroSelect = byId('m1_macroSelect');
            const m2_macroSelect = byId('m2_macroSelect');

            macroSelectHandler(m1_macroSelect, 'left');
            macroSelectHandler(m2_macroSelect, 'right');

            const instantSplitAmount = byId('instant-split-amount');
            const instantSplitStatus = byId('toggle-instant-split');

            instantSplitStatus.checked =
                modSettings.macros.keys.line.instantSplit > 0;
            instantSplitAmount.disabled = !instantSplitStatus.checked;
            instantSplitAmount.value =
                modSettings.macros.keys.line.instantSplit.toString();

            instantSplitStatus.addEventListener('change', () => {
                if (instantSplitStatus.checked) {
                    modSettings.macros.keys.line.instantSplit =
                        Number(instantSplitAmount.value) || 0;
                    instantSplitAmount.disabled = false;
                } else {
                    modSettings.macros.keys.line.instantSplit = 0;
                    instantSplitAmount.disabled = true;
                }

                updateStorage();
            });

            instantSplitAmount.addEventListener('input', (e) => {
                modSettings.macros.keys.line.instantSplit =
                    Number(instantSplitAmount.value) || 0;
                updateStorage();
            });
        },

        setInputActions() {
            const numModInputs = 18;
            const macroInputs = Array.from(
                { length: numModInputs },
                (_, i) => `modinput${i + 1}`,
            );

            macroInputs.forEach((modkey) => {
                const modInput = byId(modkey);

                document.addEventListener('keydown', (event) => {
                    if (document.activeElement !== modInput) return;

                    if (event.key === 'Backspace') {
                        modInput.value = '';
                        updateModSettings(modInput.name, '');
                        return;
                    }

                    const newValue = event.key.toLowerCase();
                    modInput.value = newValue;

                    const isDuplicate = macroInputs.some((key) => {
                        const input = byId(key);
                        return input && input !== modInput && input.value === newValue;
                    });

                    if (newValue && isDuplicate) {
                        alert('You can\'t use 2 keybindings at the same time.');
                        setTimeout(() => (modInput.value = ''), 0);
                        return;
                    }

                    updateModSettings(modInput.name, newValue);
                });
            });

            function updateModSettings(propertyName, value) {
                const properties = propertyName.split('.');
                let settings = modSettings.macros.keys;

                properties.slice(0, -1).forEach((prop) => (settings = settings[prop]));
                settings[properties.pop()] = value;

                updateStorage();
            }

            const modNumberInput = document.querySelector('.modNumberInput');

            modNumberInput.addEventListener('keydown', (event) => {
                if (
                    !['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(
                        event.key,
                    ) &&
                    !/^[0-9]$/.test(event.key)
                ) {
                    event.preventDefault();
                }
            });
        },

        openDB() {
            if (this.dbCache) return Promise.resolve(this.dbCache);

            return new Promise((resolve, reject) => {
                const request = indexedDB.open('imageGalleryDB', 1);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('images')) {
                        db.createObjectStore('images', { keyPath: 'timestamp' });
                    }
                };

                request.onsuccess = () => {
                    this.dbCache = request.result;
                    resolve(this.dbCache);
                };

                request.onerror = (event) => reject(event.target.error);
            });
        },

        async saveImage() {
            const canvas = window.sigfix ? byId('sf-canvas') : byId('canvas');

            requestAnimationFrame(async () => {
                const dataURL = canvas.toDataURL('image/png');

                if (!dataURL) {
                    console.error(
                        'Failed to capture the image. The canvas might be empty or the rendering is incomplete.',
                    );
                    return;
                }

                const timestamp = Date.now();

                if (!indexedDB)
                    return alert(
                        'Your browser does not support indexedDB. Please update your browser.',
                    );

                try {
                    const db = await this.openDB();
                    const transaction = db.transaction('images', 'readwrite');
                    const store = transaction.objectStore('images');
                    store.put({ timestamp, dataURL });

                    await new Promise((resolve, reject) => {
                        transaction.oncomplete = resolve;
                        transaction.onerror = (event) => reject(event.target.error);
                    });

                    this.addImageToGallery({ timestamp, dataURL });
                } catch (error) {
                    console.error('Transaction error:', error);
                }
            });
        },

        addImageToGallery(image) {
            const galleryElement = byId('image-gallery');

            if (!galleryElement) return;

            const placeholderURL =
                'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

            const imageHTML = `
				<div class="image-container">
					<img class="gallery-image lazy" data-src="${image.dataURL}" src="${placeholderURL}" data-image-id="${image.timestamp}" />
					<div class="justify-sb">
						<span class="modDescText">${prettyTime.fullDate(image.timestamp, true)}</span>
						<div class="centerXY g-5">
							<button type="button" class="download_btn operation_btn" data-image-id="${image.timestamp}"></button>
							<button type="button" class="delete_btn operation_btn" data-image-id="${image.timestamp}"></button>
						</div>
					</div>
				</div>
			`;

            galleryElement.insertAdjacentHTML('afterbegin', imageHTML);

            const lazyImages = document.querySelectorAll('.lazy');
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const image = entry.target;
                        image.src = image.getAttribute('data-src');
                        image.classList.remove('lazy');
                        observer.unobserve(image);
                    }
                });
            });

            lazyImages.forEach((image) => {
                imageObserver.observe(image);
            });

            this.attachEventListeners([image]);
        },
        async updateGallery() {
            try {
                const db = await this.openDB();
                const transaction = db.transaction('images', 'readonly');
                const store = transaction.objectStore('images');
                const request = store.getAll();

                request.onsuccess = () => {
                    const gallery = request.result;
                    const galleryElement = byId('image-gallery');
                    const downloadAll = byId('gallery-download');
                    const deleteAll = byId('gallery-delete');

                    if (!galleryElement) return;

                    if (gallery.length === 0) {
                        galleryElement.innerHTML = `<span>No images saved yet.</span>`;

                        downloadAll.style.display = 'none';
                        deleteAll.style.display = 'none';
                        return;
                    }

                    downloadAll.style.display = 'block';
                    deleteAll.style.display = 'block';

                    downloadAll.addEventListener('click', async () => {
                        if (gallery.length === 0) return;
                        const { JSZip } = window;
                        const zip = JSZip();

                        gallery.forEach((item) => {
                            const imageData = item.dataURL.split(',')[1];
                            const imgExtension = item.dataURL.split(';')[0].split('/')[1];
                            zip.file(`${item.timestamp}.${imgExtension}`, imageData, {
                                base64: true,
                            });
                        });

                        zip
                            .generateAsync({ type: 'blob' })
                            .then((zipContent) => {
                                const a = document.createElement('a');
                                a.href = URL.createObjectURL(zipContent);
                                a.download = 'sigmally_gallery.zip';
                                a.click();
                            })
                            .catch((error) => {
                                console.error('Error generating ZIP file:', error);
                            });
                    });

                    deleteAll.addEventListener('click', () => {
                        const confirmDelete = confirm(
                            'Are you sure you want to delete all images? This action cannot be undone.',
                        );
                        if (!confirmDelete) return;

                        const deleteTransaction = db.transaction('images', 'readwrite');
                        const deleteStore = deleteTransaction.objectStore('images');
                        deleteStore.clear();

                        deleteTransaction.oncomplete = () => {
                            galleryElement.innerHTML = `<span>No images saved yet.</span>`;
                        };

                        deleteTransaction.onerror = (error) => {
                            console.error('Error deleting images:', error);
                        };
                    });

                    gallery.sort((a, b) => b.timestamp - a.timestamp);

                    let galleryHTML = gallery
                        .map(
                            (item) => `
						<div class="image-container">
							<img class="gallery-image lazy" data-src="${item.dataURL}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-image-id="${item.timestamp}" />
							<div class="justify-sb">
								<span class="modDescText">${prettyTime.fullDate(item.timestamp, true)}</span>
								<div class="centerXY g-5">
									<button type="button" class="download_btn operation_btn" data-image-id="${item.timestamp}"></button>
									<button type="button" class="delete_btn operation_btn" data-image-id="${item.timestamp}"></button>
								</div>
							</div>
						</div>
					`,
                        )
                        .join('');

                    galleryElement.innerHTML = galleryHTML;

                    // Use Intersection Observer to load images
                    const lazyImages = document.querySelectorAll('.lazy');
                    const imageObserver = new IntersectionObserver(
                        (entries, observer) => {
                            entries.forEach((entry) => {
                                if (entry.isIntersecting) {
                                    const image = entry.target;
                                    image.src = image.getAttribute('data-src');
                                    image.classList.remove('lazy');
                                    observer.unobserve(image);
                                }
                            });
                        },
                    );

                    lazyImages.forEach((image) => {
                        imageObserver.observe(image);
                    });

                    this.attachEventListeners(gallery);
                };
            } catch (error) {
                console.error('Transaction error:', error);
            }
        },

        attachEventListeners(gallery) {
            const galleryElement = byId('image-gallery');

            galleryElement.querySelectorAll('.gallery-image').forEach((img) => {
                img.addEventListener('click', (event) => {
                    const dataURL = event.target.src;
                    this.openImage(dataURL);
                });
            });

            galleryElement.querySelectorAll('.download_btn').forEach((button) => {
                button.addEventListener('click', () => {
                    const imageId = button.getAttribute('data-image-id');
                    const image = gallery.find(
                        (item) => item.timestamp === parseInt(imageId, 10),
                    );
                    if (image) {
                        const link = document.createElement('a');
                        link.href = image.dataURL;
                        link.download = `Sigmally ${this.sanitizeFilename(prettyTime.fullDate(image.timestamp, true))}.png`;
                        link.click();
                    }
                });
            });

            galleryElement.querySelectorAll('.delete_btn').forEach((button) => {
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const imageId = button.getAttribute('data-image-id');
                    this.deleteImage(parseInt(imageId, 10));
                });
            });
        },

        sanitizeFilename: (filename) => filename.replace(/:/g, '_'),

        openImage(dataURL) {
            const blob = this.dataURLToBlob(dataURL);
            const url = URL.createObjectURL(blob);
            const imgWindow = window.open(url, '_blank');
            // Release the object URL after a short delay
            if (imgWindow) {
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        },

        dataURLToBlob(dataURL) {
            const [header, data] = dataURL.split(',');
            const mime = header.match(/:(.*?);/)[1];
            const binary = atob(data);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                array[i] = binary.charCodeAt(i);
            }
            return new Blob([array], { type: mime });
        },

        async deleteImage(timestamp) {
            try {
                const db = await this.openDB();
                const transaction = db.transaction('images', 'readwrite');
                const store = transaction.objectStore('images');
                store.delete(timestamp);

                await new Promise((resolve, reject) => {
                    transaction.oncomplete = resolve;
                    transaction.onerror = (event) => reject(event.target.error);
                });

                this.updateGallery();
            } catch (error) {
                console.error('Transaction error:', error);
            }
        },

        mainMenu() {
            let menucontent = document.querySelector('.menu-center-content');
            menucontent.style.margin = 'auto';

            const discordlinks = document.createElement('div');
            discordlinks.setAttribute('id', 'dclinkdiv');
            discordlinks.innerHTML = `
                <a href="https://discord.gg/${window.tourneyServer ? 'ERtbMJCp8s' : '4j4Rc4dQTP'}" target="_blank" class="dclinks">
                    <svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19.4566 5.35132C21.7154 8.83814 22.8309 12.7712 22.4139 17.299C22.4121 17.3182 22.4026 17.3358 22.3876 17.3473C20.6771 18.666 19.0199 19.4663 17.3859 19.9971C17.3732 20.0011 17.3596 20.0009 17.347 19.9964C17.3344 19.992 17.3234 19.9835 17.3156 19.9721C16.9382 19.4207 16.5952 18.8393 16.2947 18.2287C16.2774 18.1928 16.2932 18.1495 16.3287 18.1353C16.8734 17.9198 17.3914 17.6615 17.8896 17.3557C17.9289 17.3316 17.9314 17.2725 17.8951 17.2442C17.7894 17.1617 17.6846 17.0751 17.5844 16.9885C17.5656 16.9725 17.5404 16.9693 17.5191 16.9801C14.2844 18.5484 10.7409 18.5484 7.46792 16.9801C7.44667 16.9701 7.42142 16.9735 7.40317 16.9893C7.30317 17.0759 7.19817 17.1617 7.09342 17.2442C7.05717 17.2725 7.06017 17.3316 7.09967 17.3557C7.59792 17.6557 8.11592 17.9198 8.65991 18.1363C8.69517 18.1505 8.71192 18.1928 8.69442 18.2287C8.40042 18.8401 8.05742 19.4215 7.67292 19.9729C7.65617 19.9952 7.62867 20.0055 7.60267 19.9971C5.97642 19.4663 4.31917 18.666 2.60868 17.3473C2.59443 17.3358 2.58418 17.3174 2.58268 17.2982C2.23418 13.3817 2.94442 9.41613 5.53717 5.35053C5.54342 5.33977 5.55292 5.33137 5.56392 5.32638C6.83967 4.71165 8.20642 4.25939 9.63491 4.00111C9.66091 3.99691 9.68691 4.00951 9.70041 4.03365C9.87691 4.36176 10.0787 4.78252 10.2152 5.12637C11.7209 4.88489 13.2502 4.88489 14.7874 5.12637C14.9239 4.78987 15.1187 4.36176 15.2944 4.03365C15.3007 4.02167 15.3104 4.01208 15.3221 4.00623C15.3339 4.00039 15.3471 3.99859 15.3599 4.00111C16.7892 4.26018 18.1559 4.71244 19.4306 5.32638C19.4419 5.33137 19.4511 5.33977 19.4566 5.35132ZM10.9807 12.798C10.9964 11.6401 10.1924 10.6821 9.18316 10.6821C8.18217 10.6821 7.38592 11.6317 7.38592 12.798C7.38592 13.9639 8.19792 14.9136 9.18316 14.9136C10.1844 14.9136 10.9807 13.9639 10.9807 12.798ZM17.6261 12.798C17.6419 11.6401 16.8379 10.6821 15.8289 10.6821C14.8277 10.6821 14.0314 11.6317 14.0314 12.798C14.0314 13.9639 14.8434 14.9136 15.8289 14.9136C16.8379 14.9136 17.6261 13.9639 17.6261 12.798Z" fill="white"></path>
                    </svg>
                    <span>${window.tourneyServer ? 'Tourney Server' : 'Sigmally'}</span>
                </a>
                <a href="https://discord.gg/QyUhvUC8AD" target="_blank" class="dclinks">
                    <svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19.4566 5.35132C21.7154 8.83814 22.8309 12.7712 22.4139 17.299C22.4121 17.3182 22.4026 17.3358 22.3876 17.3473C20.6771 18.666 19.0199 19.4663 17.3859 19.9971C17.3732 20.0011 17.3596 20.0009 17.347 19.9964C17.3344 19.992 17.3234 19.9835 17.3156 19.9721C16.9382 19.4207 16.5952 18.8393 16.2947 18.2287C16.2774 18.1928 16.2932 18.1495 16.3287 18.1353C16.8734 17.9198 17.3914 17.6615 17.8896 17.3557C17.9289 17.3316 17.9314 17.2725 17.8951 17.2442C17.7894 17.1617 17.6846 17.0751 17.5844 16.9885C17.5656 16.9725 17.5404 16.9693 17.5191 16.9801C14.2844 18.5484 10.7409 18.5484 7.46792 16.9801C7.44667 16.9701 7.42142 16.9735 7.40317 16.9893C7.30317 17.0759 7.19817 17.1617 7.09342 17.2442C7.05717 17.2725 7.06017 17.3316 7.09967 17.3557C7.59792 17.6557 8.11592 17.9198 8.65991 18.1363C8.69517 18.1505 8.71192 18.1928 8.69442 18.2287C8.40042 18.8401 8.05742 19.4215 7.67292 19.9729C7.65617 19.9952 7.62867 20.0055 7.60267 19.9971C5.97642 19.4663 4.31917 18.666 2.60868 17.3473C2.59443 17.3358 2.58418 17.3174 2.58268 17.2982C2.23418 13.3817 2.94442 9.41613 5.53717 5.35053C5.54342 5.33977 5.55292 5.33137 5.56392 5.32638C6.83967 4.71165 8.20642 4.25939 9.63491 4.00111C9.66091 3.99691 9.68691 4.00951 9.70041 4.03365C9.87691 4.36176 10.0787 4.78252 10.2152 5.12637C11.7209 4.88489 13.2502 4.88489 14.7874 5.12637C14.9239 4.78987 15.1187 4.36176 15.2944 4.03365C15.3007 4.02167 15.3104 4.01208 15.3221 4.00623C15.3339 4.00039 15.3471 3.99859 15.3599 4.00111C16.7892 4.26018 18.1559 4.71244 19.4306 5.32638C19.4419 5.33137 19.4511 5.33977 19.4566 5.35132ZM10.9807 12.798C10.9964 11.6401 10.1924 10.6821 9.18316 10.6821C8.18217 10.6821 7.38592 11.6317 7.38592 12.798C7.38592 13.9639 8.19792 14.9136 9.18316 14.9136C10.1844 14.9136 10.9807 13.9639 10.9807 12.798ZM17.6261 12.798C17.6419 11.6401 16.8379 10.6821 15.8289 10.6821C14.8277 10.6821 14.0314 11.6317 14.0314 12.798C14.0314 13.9639 14.8434 14.9136 15.8289 14.9136C16.8379 14.9136 17.6261 13.9639 17.6261 12.798Z" fill="white"></path>
                    </svg>
                    <span>Sigmally Modz</span>
                </a>
                `;
            byId('discord_link').remove();
            byId('menu').appendChild(discordlinks);

            let clansbtn = document.querySelector('#clans_and_settings button');
            clansbtn.innerHTML = 'Clans';
            document
                .querySelectorAll('#clans_and_settings button')[1]
                .removeAttribute('onclick');
        },

        respawn() {
            const __line2 = byId('__line2');
            const c = byId('continue_button');
            const p = byId('play-btn');

            if (__line2.classList.contains('line--hidden')) return;

            this.respawnTime = null;

            setTimeout(() => {
                c.click();
                p.click();
            }, 20);

            this.respawnTime = Date.now();
        },

        respawnGame() {
            const { sigfix } = window;
            if (this.aboveRespawnLimit || (sigfix && sigfix.world.score(sigfix.world.selected) >= 5500)) {
                sigfix ? sigfix.net.connections.get(sigfix.world.selected).ws.close() : window.gameSettings.ws.close();
                this.isRespawned = true;
            } else {
                this.fastRespawn();
            }
        },

        fastRespawn() {
            // leave the world with chat command
            window.sendChat(this.respawnCommand);
            const p = byId('play-btn');

            const intervalId = setInterval(() => {
                if (isDead() || menuClosed()) {
                    this.respawn();
                    p.click();
                } else {
                    clearInterval(intervalId);
                }
            }, 50);
            setTimeout(() => {
                clearInterval(intervalId);
            }, 1000);
        },

        clientPing() {
            const pingElement = document.createElement('span');
            pingElement.innerHTML = `Client Ping: 0ms`;
            pingElement.id = 'clientPing';
            pingElement.style = `
                position: absolute;
                right: 10px;
                bottom: 5px;
                color: #fff;
                font-size: 1.8rem;
            `;
            document.querySelector('.mod_menu').append(pingElement);

            this.ping.intervalId = setInterval(() => {
                if (!client || client.readyState != 1) return;
                this.ping.start = Date.now();

                client.send({
                    type: 'get-ping',
                });
            }, 2000);
        },

        createMinimap() {
            const dataContainer = document.createElement('div');
            dataContainer.classList.add('minimapContainer');

            const miniMap = document.createElement('canvas');
            miniMap.width = 200;
            miniMap.height = 200;
            miniMap.classList.add('minimap');
            this.canvas = miniMap;

            let viewportScale = 1;

            document.body.append(dataContainer);
            dataContainer.append(miniMap);

            function resizeMiniMap() {
                viewportScale = Math.max(
                    window.innerWidth / 1920,
                    window.innerHeight / 1080,
                );

                miniMap.width = miniMap.height = 200 * viewportScale;
            }

            resizeMiniMap();

            window.addEventListener('resize', resizeMiniMap);

            const playBtn = byId('play-btn');
            playBtn.addEventListener('click', () => {
                setTimeout(() => {
                    lastPosTime = Date.now();
                }, 300);
            });
        },

        updData(data) {
            const { x, y, sid: playerId } = data;
            const playerIndex = this.miniMapData.findIndex(
                (player) => player[3] === playerId,
            );
            const nick = parsetxt(data.nick);

            if (playerIndex === -1) {
                this.miniMapData.push([x, y, nick, playerId]);
            } else {
                if (x !== null && y !== null) {
                    this.miniMapData[playerIndex] = [x, y, nick, playerId];
                } else {
                    this.miniMapData.splice(playerIndex, 1);
                }
            }

            this.updMinimap();
        },

        updMinimap() {
            if (isDead()) return;
            const miniMap = mods.canvas;
            const border = mods.border;
            const ctx = miniMap.getContext('2d');
            ctx.clearRect(0, 0, miniMap.width, miniMap.height);

            if (!menuClosed()) {
                ctx.clearRect(0, 0, miniMap.width, miniMap.height);
                return;
            }

            for (const miniMapData of this.miniMapData) {
                if (!border.width) break;

                if (miniMapData[2] === null || miniMapData[3] === client.id) continue;
                if (!miniMapData[0] && !miniMapData[1]) {
                    ctx.clearRect(0, 0, miniMap.width, miniMap.height);
                    continue;
                }

                const fullX = miniMapData[0] + border.width / 2;
                const fullY = miniMapData[1] + border.width / 2;
                const x = (fullX / border.width) * miniMap.width;
                const y = (fullY / border.width) * miniMap.height;

                ctx.fillStyle = '#3283bd';
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, 2 * Math.PI);
                ctx.fill();

                const minDist = y - 15.5;
                const nameYOffset = minDist <= 1 ? -4.5 : 10;

                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.font = '9px Ubuntu';
                ctx.fillText(miniMapData[2], x, y - nameYOffset);
            }
        },

        tagsystem() {
            const nick = document.querySelector('#nick');
            const tagElement = document.createElement('input');
            const tagText = document.querySelector('.tagText');

            tagElement.classList.add('form-control');
            tagElement.placeholder = 'tag';
            tagElement.id = 'tag';
            tagElement.maxLength = 3;

            const pnick = nick.parentElement;
            pnick.style = 'display: flex; gap: 5px;';

            tagElement.addEventListener('input', (e) => {
                e.stopPropagation();
                const tagValue = tagElement.value;

                tagText.innerText = tagValue ? `Tag: ${tagValue}` : '';

                modSettings.settings.tag = tagElement.value;
                updateStorage();
                client.send({
                    type: 'update-tag',
                    content: modSettings.settings.tag,
                });
                const miniMap = this.canvas;
                const ctx = miniMap.getContext('2d');
                ctx.clearRect(0, 0, miniMap.width, miniMap.height);
                this.miniMapData = [];
            });

            nick.insertAdjacentElement('beforebegin', tagElement);
        },
        updateNick() {
            const nick = byId('nick');
            this.nick = nick.value;
            nick.addEventListener('input', () => {
                this.nick = nick.value;
                client.send({
                    type: 'update-nick',
                    content: nick.value,
                });
            });
        },

        showOverlays() {
            byId('overlays').show(0.5);
            byId('menu-wrapper').show();
            byId('left-menu').show();
            byId('menu-links').show();
            byId('right-menu').show();
            byId('left_ad_block').show();
            byId('ad_bottom').show();
            !modSettings.settings.removeShopPopup && byId('shop-popup').show();
        },

        hideOverlays() {
            byId('overlays').hide();
            byId('menu-wrapper').hide();
            byId('left-menu').hide();
            byId('menu-links').hide();
            byId('right-menu').hide();
            byId('left_ad_block').hide();
            byId('ad_bottom').hide();
            byId('shop-popup').hide();
        },

        /*
     * @param {boolean} status
     */
        toggleOverlay(status) {
            if (status && menuClosed()) location.reload();

            if (status) {
                const overlay = document.createElement('div');
                overlay.setAttribute('id', 'tournament-overlay');
                overlay.classList.add('mod_overlay');
                overlay.innerHTML = `
                    <div class="tournament-overlay-info">
                        <img src="https://czrsd.com/static/sigmod/tournaments/Sigmally_Tournaments.png" width="650" draggable="false" />
                        <span>The tournament is currently being prepared. Please remain patient.</span>
                        <span>В настоящее время турнир находится в стадии подготовки. Пожалуйста, сохраняйте терпение.</span>
                        <span>El torneo se está preparando actualmente. Le rogamos que sea paciente.</span>
                        <span>O torneio está sendo preparado no momento. Por favor, seja paciente.</span>
                        <span>Turnuva şu anda hazırlanmaktadır. Lütfen sabırlı olun.</span>
                    </div>
				`;

                document.body.appendChild(overlay);
            } else {
                const overlay = byId('tournament-overlay');
                if (overlay) overlay.remove();
            }
        },

        showTournament(data) {
            if (menuClosed()) location.reload();

            const infoOverlay = byId('tournament-overlay');
            if (infoOverlay) infoOverlay.remove();

            let {
                name,
                password,
                mode,
                hosts,
                participants,
                time,
                rounds,
                prizes,
                totalUsers,
            } = data;

            if (mode === 'lastOneStanding') {
                this.lastOneStanding = true;
            }
            this.tourneyPassword = password || '';

            const teamHTML = (team) =>
                team
                    .map(
                        (socket) => `
				<div class="teamCard" data-user-id="${socket.user._id}">
					<img src="${socket.user.imageURL}" width="50" />
					<span>${socket.user.givenName}</span>
				</div>
			`,
                    )
                    .join('');

            prizes = prizes.join(',');

            const overlay = document.createElement('div');
            overlay.classList.add('mod_overlay');
            overlay.id = 'tournaments_preview';
            if (!this.lastOneStanding) {
                overlay.innerHTML = `
					<div class="tournaments-wrapper">
						<h1 style="margin: 0;">${name}</h1>
						<span>Hosted by ${hosts}</span>
						<div class="flex g-10" style="align-items: center; position: relative;">
							<img src="https://czrsd.com/static/sigmod/tournaments/vsScreen.png" draggable="false" />

							<div class="teamCards blueTeam">
								${teamHTML(participants.blue)}
							</div>

							<div class="teamCards redTeam">
								${teamHTML(participants.red)}
							</div>
						</div>
						<details>
							<summary style="cursor: pointer;">Match Details</summary>
							Rounds: ${rounds}<br>
							Prizes: ${prizes}
							<br>
							Time: ${time}
						</details>
						<div class="justify-sb w-100">
							<span>Powered by SigMod</span>
							<div class="centerXY g-10">
								<span id="round-ready">Ready (0/${totalUsers})</span>
								<button type="button" class="btn btn-success f-big" id="btn_ready">Ready</button>
							</div>
						</div>
					</div>
				`;
            } else {
                overlay.innerHTML = `
					<div class="tournaments-wrapper">
						<h1 style="margin: 0;">${name}</h1>
						<span>Hosted by ${hosts}</span>
						<div class="flex g-10" style="align-items: center">
							<div class="lastOneStanding_list scroll">
								${teamHTML(participants.blue)}
							</div>
						</div>
						<details>
							<summary style="cursor: pointer;">Match Details</summary>
							Rounds: ${rounds}<br>
							Prizes: ${prizes}
							<br>
							Time: ${time}
						</details>
						<div class="justify-sb w-100">
							<span>Powered by SigMod</span>
							<div class="centerXY g-10">
								<span id="round-ready">Ready (0/${totalUsers})</span>
								<button type="button" class="btn btn-success f-big" id="btn_ready">Ready</button>
							</div>
						</div>
					</div>
				`;
            }
            document.body.append(overlay);

            const btn_ready = byId('btn_ready');
            btn_ready.addEventListener('click', () => {
                btn_ready.disabled = true;
                client.send({
                    type: 'ready',
                });
            });

            byId('play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideOverlays();
                this.sendPlay(password);

                const passwordIncorrect = setInterval(() => {
                    const errorModal = byId('errormodal');
                    if (errorModal.style.display !== 'none') {
                        clearInterval(passwordIncorrect);
                        errorModal.style.display = 'none';
                    }
                });
            });
        },

        tournamentReady(data) {
            const { userId, ready, max } = data;

            const readyText = byId('round-ready');
            readyText.textContent = `Ready (${ready}/${max})`;

            const card = document.querySelector(
                `.teamCard[data-user-id="${userId}"]`,
            );
            if (!card) return;

            card.classList.add('userReady');
        },

        tournamentSession(data) {
            try {
                const roundResults = byId('round-results');
                if (roundResults) roundResults.remove();

                const preview = byId('tournaments_preview');
                if (preview) preview.remove();

                const continueBtn = byId('continue_button');
                continueBtn.click();

                this.hideOverlays();

                keypress('Escape', 'Escape');

                this.showCountdownOverlay(data);

                if (data.lobby) {
                    this.lastOneStanding =
                        data.lobby.mode === 'lastOneStanding' ? true : false;
                }
            } catch (e) {
                console.error(e);
            }
        },

        sendPlay(password) {
            const gameSettings = JSON.parse(localStorage.getItem('settings'));
            const sendingData = JSON.stringify({
                name: gameSettings.nick,
                skin: gameSettings.skin,
                token: window.gameSettings.user.token,
                clan: window.gameSettings.user.clan,
                sub: window.gameSettings.subscription > 0,
                showClanmates: true,
                password: this.tourneyPassword || password || '',
            });

            window.sendPlay(sendingData);
        },

        showCountdownOverlay(data) {
            const { round, max, password, time } = data;
            const countdownTime = 5000;

            const overlay = document.createElement('div');
            overlay.classList.add('mod_overlay', 'f-column', 'g-5');
            overlay.style = 'pointer-events: none;';
            overlay.innerHTML = `
				<span class="tournament-text">Round ${round}/${max || 3}</span>
				<span class="tournament-text" id="tournament-countdown" style="font-size: 32px; font-weight: 600;">${countdownTime / 1000}</span>
			`;
            document.body.append(overlay);

            const countdown = byId('tournament-countdown');
            let remainingTime = countdownTime;

            const cdInterval = setInterval(() => {
                remainingTime -= 1000;
                countdown.textContent = Math.ceil(remainingTime / 1000);

                if (remainingTime <= 0) {
                    clearInterval(cdInterval);
                    document.body.removeChild(overlay);

                    this.sendPlay(password);
                    this.tournamentTimer(time);
                }
            }, 1000);
        },

        tournamentTimer(time) {
            const existingTimer = document.querySelector('.tournament_timer');
            if (existingTimer) existingTimer.remove();

            const timer = document.createElement('span');
            timer.classList.add('tournament_timer');
            document.body.append(timer);

            let totalTimeInSeconds = parseTimeToSeconds(time);
            let currentTimeInSeconds = totalTimeInSeconds;

            function parseTimeToSeconds(timeString) {
                const timeComponents = timeString.split(/[ms]/);
                const minutes = parseInt(timeComponents[0], 10) || 0;
                const seconds = parseInt(timeComponents[1], 10) || 0;
                return minutes * 60 + seconds;
            }

            function updTime() {
                let minutes = Math.floor(currentTimeInSeconds / 60);
                let seconds = currentTimeInSeconds % 60;

                timer.textContent = `${minutes}m ${seconds}s`;

                if (currentTimeInSeconds <= 0) {
                    // time up
                    clearInterval(timerInterval);

                    if (mods.lastOneStanding) {
                        timer.textContent = 'OVERTIME';
                    } else {
                        timer.remove();
                    }
                } else {
                    currentTimeInSeconds--;
                }
            }

            updTime();
            const timerInterval = setInterval(updTime, 1000);
        },

        getScore(data) {
            const { sigfix } = window;
            if (menuClosed()) {
                client.send({
                    type: 'result',
                    content: sigfix ? Math.floor(sigfix.world.score(sigfix.world.selected)) : mods.cellSize,
                });
            } else {
                client.send({
                    type: 'result',
                    content: 0,
                });
            }
        },

        async roundEnd(lobby) {
            const winners = lobby.roundsData[lobby.currentRound - 1].winners;

            let result = 'lost';
            if (winners.includes(window.gameSettings.user.email)) {
                result = 'won';
            }

            const isEnd = lobby.ended;

            const buttonText = isEnd ? 'Leave' : 'Ready';

            const resultOverlay = document.createElement('div');
            resultOverlay.classList.add('mod_overlay', 'black_overlay');
            document.body.appendChild(resultOverlay);

            const fullResult = document.createElement('div'); // overlay for round stats
            fullResult.classList.add('mod_overlay');
            fullResult.style.display = 'none';
            fullResult.style.minWidth = '530px';
            fullResult.setAttribute('id', 'round-results');
            fullResult.innerHTML = `
				<div class="tournaments-wrapper f-column g-5">
					<span class="text-center" style="font-size: 24px; font-weight: 600;">${isEnd ? `END OF ${lobby.name}` : `Round ${lobby.currentRound}/${lobby.rounds}`}</span>
					<div class="centerXY" style="gap: 20px; height: 140px; margin-top: 16px;">
						${this.createStats(lobby)}
					</div>
					<div class="justify-sb w-100">
						<span>Powered by SigMod</span>
						<div class="centerXY g-10">
							${!isEnd ? `<span id="round-ready">Ready (0/${lobby.totalUsers})</span>` : ''}
							<button type="button" class="btn btn-success f-big" id="tourney-button-action">${buttonText}</button>
						</div>
					</div>
				</div>
			`;
            document.body.appendChild(fullResult);

            const button = byId('tourney-button-action');
            let clickedReady = false;
            let checkInterval = null;

            const updateButtonState = () => {
                if (clickedReady) {
                    clearInterval(checkInterval);
                    return;
                }
                button.disabled = !window.gameSettings?.ws;
            };

            button.addEventListener('click', () => {
                button.disabled = true;
                if (!isEnd) {
                    clickedReady = true;
                    client.send({ type: 'ready' });
                } else {
                    location.href = '/';
                }
            });

            checkInterval = setInterval(updateButtonState, 100);

            await wait(1000);

            resultOverlay.innerHTML = `
				<span class="tournament-text-${result}">YOU ${result.toUpperCase()}!</span>
			`;

            await wait(500);
            fullResult.style.display = 'flex';

            await wait(2000);

            resultOverlay.style.opacity = '0';

            await wait(300);
            resultOverlay.remove();
        },

        createStats(lobby) {
            if (lobby.mode === 'lastOneStanding') {
                const team = lobby.participants.blue.length > 0 ? 'blue' : 'red';
                const winner = lobby.participants[team].find((socket) =>
                    lobby.roundsData[lobby.currentRound - 1].winners.includes(
                        socket.user.email,
                    ),
                );
                if (!winner) return `<span>Unkown winner.</span>`;

                const { user } = winner;
                return `
					<div class="f-column g-5">
						<div class="flex g-10" style="justify-content: center;">
							<div class="teamCard" data-user-id="${user._id}" style="flex: 1;">
								<img src="${user.imageURL}" class="tournament-profile" />
								<span>${winner.nick || user.givenName}</span>
							</div>
						</div>
					</div>
				`;
            }

            const { blue: blueParticipants, red: redParticipants } =
                lobby.participants;
            const winners = new Set(lobby.roundsData[lobby.currentRound - 1].winners);
            const [bluePoints, redPoints] = lobby.modeData.state
                .split(':')
                .map(Number);

            const blueScores = new Map(
                lobby.modeData.blue.map(({ email, score }) => [email, score]),
            );
            const redScores = new Map(
                lobby.modeData.red.map(({ email, score }) => [email, score]),
            );

            const calculateTeamScore = (participants, scores) =>
                participants.reduce(
                    (total, { user }) => total + (scores.get(user.email) || 0),
                    0,
                );

            const blueScore = calculateTeamScore(blueParticipants, blueScores);
            const redScore = calculateTeamScore(redParticipants, redScores);

            const isBlueWinning = blueScore > redScore;
            const winningTeam = isBlueWinning ? 'blue' : 'red';
            const losingTeam = isBlueWinning ? 'red' : 'blue';

            const winningScore = isBlueWinning ? blueScore : redScore;
            const losingScore = isBlueWinning ? redScore : blueScore;
            const winningPoints = isBlueWinning ? bluePoints : redPoints;
            const losingPoints = isBlueWinning ? redPoints : bluePoints;

            const generateHTML = (participants) =>
                participants
                    .map(
                        ({ user }) => `
					<div class="teamCard" data-user-id="${user._id}" style="flex: 1;">
						<img src="${user.imageURL}" class="tournament-profile" />
						<span>${user.givenName}</span>
					</div>
				`,
                    )
                    .join('');

            const winnersForTeam = (teamParticipants) =>
                teamParticipants.filter(({ user }) => winners.has(user.email));

            const losersForTeam = (teamParticipants) =>
                teamParticipants.filter(({ user }) => !winners.has(user.email));

            const winnerHTML = generateHTML(
                winnersForTeam(isBlueWinning ? blueParticipants : redParticipants),
            );
            const loserHTML = generateHTML(
                losersForTeam(isBlueWinning ? redParticipants : blueParticipants),
            );

            return `
				<div class="f-column g-5">
					<div class="flex g-10" style="justify-content: center;">
						${winnerHTML}
					</div>
					<span class="text-center" style="font-size: 20px; font-weight: 400;">Score: ${winningScore}</span>
					<span class="text-center" style="font-size: 26px; font-weight: 600;">${winningPoints || 0}</span>
				</div>
				<div class="f-column" style="height: 100%; position: relative">
					<svg style="margin: auto;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="60"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <rect x="142.853" y="486.511" style="fill:#56361D;" width="225.654" height="24.763"></rect> <path style="fill:#CCA400;" d="M223.069,256.172v50.773l0,0c8.126,0,14.712,6.587,14.712,14.712v96.74h36.49v-96.74 c0-8.126,6.587-14.712,14.712-14.712l0,0v-50.773H223.069z"></path> <rect x="223.064" y="251.211" style="opacity:0.16;fill:#664400;enable-background:new ;" width="65.919" height="40.689"></rect> <path style="fill:#EEBF00;" d="M274.378,271.341h-36.756c-50.613,0-91.644-41.03-91.644-91.644V0h220.043v179.697 C366.022,230.311,324.991,271.341,274.378,271.341z"></path> <g> <path style="fill:#664400;" d="M334.827,463.284H177.483V430.71c0-6.801,5.513-12.314,12.314-12.314h132.715 c6.801,0,12.314,5.513,12.314,12.314v32.574H334.827z"></path> <rect x="142.853" y="452.842" style="fill:#664400;" width="225.779" height="58.726"></rect> </g> <g> <path style="fill:#56361D;" d="M310.42,430.732l0.109,22.353l24.403-0.046l-0.109-22.307c-0.013-6.801-5.536-12.305-12.338-12.291 l-23.489,0.044C305.369,418.942,310.408,424.239,310.42,430.732z"></path> <polygon style="fill:#56361D;" points="368.616,452.85 344.213,452.896 344.324,511.573 142.951,511.954 142.951,512 368.727,511.573 "></polygon> </g> <g> <path style="fill:#EEBF00;" d="M99.268,40.707c-35.955,0-65.102,29.147-65.102,65.102s29.147,65.102,65.102,65.102h46.71V40.707 H99.268z M120.57,137.625H97.327c-17.89,0-32.393-14.502-32.393-32.393S79.437,72.84,97.327,72.84h23.242v64.785H120.57z"></path> <path style="fill:#EEBF00;" d="M412.732,40.707h-46.71v130.203h46.71c35.955,0,65.102-29.147,65.102-65.102 S448.687,40.707,412.732,40.707z M414.672,138.778H391.43V73.993h23.242c17.89,0,32.393,14.502,32.393,32.393 S432.562,138.778,414.672,138.778z"></path> </g> <rect x="145.974" y="75.284" style="fill:#CCA400;" width="219.828" height="77.612"></rect> <path style="fill:#FFEB99;" d="M189.004,184.953c-4.324,0-7.83-3.506-7.83-7.83V27.75c0-4.324,3.506-7.83,7.83-7.83 s7.83,3.506,7.83,7.83v149.373C196.835,181.447,193.329,184.953,189.004,184.953z"></path> <g> <rect x="366.022" y="40.707" style="opacity:0.16;fill:#664400;enable-background:new ;" width="14.996" height="129.113"></rect> <rect x="130.982" y="40.667" style="opacity:0.16;fill:#664400;enable-background:new ;" width="14.996" height="129.113"></rect> <path style="opacity:0.31;fill:#664400;enable-background:new ;" d="M335.941,0v157.465c0,50.613-41.03,91.644-91.644,91.644 h-36.756c-13.653,0-26.606-2.99-38.246-8.344c16.782,18.763,41.172,30.576,68.326,30.576h36.756 c50.613,0,91.644-41.03,91.644-91.644V0H335.941z"></path> </g> <rect x="177.483" y="439.03" style="fill:#56361D;" width="136.025" height="14.046"></rect> </g></svg>
					<span style="text-align: center; font-size: 32px; font-weight: 600; position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%)">&#8211;</span>
				</div>
				<div class="f-column g-5">
					<div class="flex g-10" style="justify-content: center;">
						${loserHTML}
					</div>
					<span class="text-center" style="font-size: 20px; font-weight: 400;">Score: ${losingScore}</span>
					<span class="text-center" style="font-size: 26px; font-weight: 600;">${losingPoints || 0}</span>
				</div>
			`;
        },

        modAlert(text, type) {
            const overlay = document.querySelector('#modAlert_overlay');
            const alertWrapper = document.createElement('div');
            alertWrapper.classList.add('infoAlert');
            if (type == 'success') {
                alertWrapper.classList.add('modAlert-success');
            } else if (type == 'danger') {
                alertWrapper.classList.add('modAlert-danger');
            } else if (type == 'default') {
                alertWrapper.classList.add('modAlert-default');
            }

            alertWrapper.innerHTML = `
                <span>${text}</span>
                <div class="modAlert-loader"></div>
            `;

            overlay.append(alertWrapper);

            setTimeout(() => {
                alertWrapper.remove();
            }, 2000);
        },

        async account() {
            const createAccountBtn = byId('createAccount');
            const loginBtn = byId('login');

            createAccountBtn.addEventListener('click', () => {
                this.createSignInWrapper(false);
            });
            loginBtn.addEventListener('click', () => {
                this.createSignInWrapper(true);
            });

            // popup window from discord login
            const urlParams = new URLSearchParams(window.location.search);
            let accessToken = urlParams.get('access_token');
            let refreshToken = urlParams.get('refresh_token');

            if (!accessToken || !refreshToken) return;

            const overlay = document.createElement('div');
            overlay.style = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #050505; display: flex; justify-content: center; align-items: center; z-index: 999999`;
            overlay.innerHTML = `
                <span style="font-size: 5rem; color: #fafafa;">Login...</span>
            `;
            document.body.append(overlay);

            setTimeout(async () => {
                if (refreshToken.endsWith('/')) {
                    refreshToken = refreshToken.substring(0, refreshToken.length - 1);
                } else {
                    return;
                }

                await fetch(
                    `${this.appRoutes.discordLogin}?accessToken=${accessToken}&refreshToken=${refreshToken}`,
                    {
                        method: 'GET',
                        credentials: 'include',
                    },
                );

                modSettings.modAccount.authorized = true;
                updateStorage();
                window.close();
            }, 500);
        },

        createSignInWrapper(isLogin) {
            let that = this;
            const overlay = document.createElement('div');
            overlay.classList.add('signIn-overlay');

            const headerText = isLogin ? 'Login' : 'Create an account';
            const btnText = isLogin ? 'Login' : 'Create account';
            const btnId = isLogin ? 'loginButton' : 'registerButton';
            const confPass = isLogin
                ? ''
                : '<input class="form-control" id="mod_pass_conf" type="password" placeholder="Confirm password" />';

            overlay.innerHTML = `
                <div class="signIn-wrapper">
                    <div class="signIn-header">
                        <span>${headerText}</span>
                        <div class="centerXY" style="width: 32px; height: 32px;">
                            <button class="modButton-black" id="closeSignIn">
                                <svg width="18" height="20" viewBox="0 0 16 16" fill="#ffffff" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M1.6001 14.4L14.4001 1.59998M14.4001 14.4L1.6001 1.59998" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="signIn-body">
                        <input class="form-control" id="mod_username" type="text" placeholder="Username" />
                        <input class="form-control" id="mod_pass" type="password" placeholder="Password" />
                        ${confPass}
                        <div id="errMessages" style="display: none;"></div>
                        <span>or continue with...</span>
                        <button class="dclinks" style="border: none;" id="discord_login">
                            <svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19.4566 5.35132C21.7154 8.83814 22.8309 12.7712 22.4139 17.299C22.4121 17.3182 22.4026 17.3358 22.3876 17.3473C20.6771 18.666 19.0199 19.4663 17.3859 19.9971C17.3732 20.0011 17.3596 20.0009 17.347 19.9964C17.3344 19.992 17.3234 19.9835 17.3156 19.9721C16.9382 19.4207 16.5952 18.8393 16.2947 18.2287C16.2774 18.1928 16.2932 18.1495 16.3287 18.1353C16.8734 17.9198 17.3914 17.6615 17.8896 17.3557C17.9289 17.3316 17.9314 17.2725 17.8951 17.2442C17.7894 17.1617 17.6846 17.0751 17.5844 16.9885C17.5656 16.9725 17.5404 16.9693 17.5191 16.9801C14.2844 18.5484 10.7409 18.5484 7.46792 16.9801C7.44667 16.9701 7.42142 16.9735 7.40317 16.9893C7.30317 17.0759 7.19817 17.1617 7.09342 17.2442C7.05717 17.2725 7.06017 17.3316 7.09967 17.3557C7.59792 17.6557 8.11592 17.9198 8.65991 18.1363C8.69517 18.1505 8.71192 18.1928 8.69442 18.2287C8.40042 18.8401 8.05742 19.4215 7.67292 19.9729C7.65617 19.9952 7.62867 20.0055 7.60267 19.9971C5.97642 19.4663 4.31917 18.666 2.60868 17.3473C2.59443 17.3358 2.58418 17.3174 2.58268 17.2982C2.23418 13.3817 2.94442 9.41613 5.53717 5.35053C5.54342 5.33977 5.55292 5.33137 5.56392 5.32638C6.83967 4.71165 8.20642 4.25939 9.63491 4.00111C9.66091 3.99691 9.68691 4.00951 9.70041 4.03365C9.87691 4.36176 10.0787 4.78252 10.2152 5.12637C11.7209 4.88489 13.2502 4.88489 14.7874 5.12637C14.9239 4.78987 15.1187 4.36176 15.2944 4.03365C15.3007 4.02167 15.3104 4.01208 15.3221 4.00623C15.3339 4.00039 15.3471 3.99859 15.3599 4.00111C16.7892 4.26018 18.1559 4.71244 19.4306 5.32638C19.4419 5.33137 19.4511 5.33977 19.4566 5.35132ZM10.9807 12.798C10.9964 11.6401 10.1924 10.6821 9.18316 10.6821C8.18217 10.6821 7.38592 11.6317 7.38592 12.798C7.38592 13.9639 8.19792 14.9136 9.18316 14.9136C10.1844 14.9136 10.9807 13.9639 10.9807 12.798ZM17.6261 12.798C17.6419 11.6401 16.8379 10.6821 15.8289 10.6821C14.8277 10.6821 14.0314 11.6317 14.0314 12.798C14.0314 13.9639 14.8434 14.9136 15.8289 14.9136C16.8379 14.9136 17.6261 13.9639 17.6261 12.798Z" fill="white"></path>
                            </svg>
                            Discord
                        </button>
						<div id="sigmod-captcha"></div>
                        <div class="w-100 centerXY">
                            <button class="modButton-black" id="${btnId}" style="margin-top: 26px; width: 200px;">${btnText}</button>
                        </div>
                        <p class="mt-auto">Your data is stored safely and securely.</p>
                    </div>
                </div>
            `;
            document.body.append(overlay);

            const close = byId('closeSignIn');
            close.addEventListener('click', hide);

            function hide() {
                overlay.style.opacity = '0';
                setTimeout(() => {
                    overlay.remove();
                }, 300);
            }

            overlay.addEventListener('mousedown', (e) => {
                if (e.target == overlay) hide();
            });

            setTimeout(() => {
                overlay.style.opacity = '1';
            });

            // DISCORD LOGIN

            const discord_login = byId('discord_login');

            const w = 600;
            const h = 800;
            const left = (window.innerWidth - w) / 2;
            const top = (window.innerHeight - h) / 2;

            function receiveMessage(event) {
                if (event.data.type === 'profileData') {
                    const data = event.data.data;
                    successHandler(data);
                }
            }

            discord_login.addEventListener('click', () => {
                const popupWindow = window.open(
                    this.routes.discord.auth,
                    '_blank',
                    `width=${w}, height=${h}, left=${left}, top=${top}`,
                );

                const interval = setInterval(() => {
                    if (popupWindow.closed) {
                        clearInterval(interval);
                        setTimeout(() => {
                            location.reload();
                        }, 1500);
                    }
                }, 1000);
            });

            // LOGIN / REGISTER:
            const button = byId(btnId);

            button.addEventListener('click', async () => {
                const path = isLogin ? 'login' : 'register';
                const username = byId('mod_username').value;
                const password = byId('mod_pass').value;
                const confirmedPassword = confPass ? byId('mod_pass_conf').value : null;

                if (!username || !password) return;

                button.hide();

                const accountData = {
                    username,
                    password,
                    ...(confirmedPassword && { confirmedPassword }),
                    user: window.gameSettings.user,
                };

                try {
                    const response = await fetch(this.appRoutes.signIn(path), {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(accountData),
                    });

                    const data = await response.json();

                    if (data.success) {
                        successHandler(data);
                        that.profile = data.user;
                    } else {
                        errorHandler(data.errors);
                    }
                } catch (error) {
                    console.error(error);
                } finally {
                    button.show();
                }
            });

            function successHandler(data) {
                that.friends_settings = data.settings;
                that.profile = data.user;

                hide();
                that.setFriendsMenu();
                modSettings.modAccount.authorized = true;
                updateStorage();
            }

            function errorHandler(errors) {
                errors.forEach((error) => {
                    const errMessages = byId('errMessages');
                    if (!errMessages) return;

                    if (errMessages.style.display == 'none')
                        errMessages.style.display = 'flex';

                    let input = null;
                    switch (error.fieldName) {
                        case 'Username':
                            input = 'mod_username';
                            break;
                        case 'Password':
                            input = 'mod_pass';
                            break;
                    }

                    errMessages.innerHTML += `
                        <span>${error.message}</span>
                    `;

                    if (input && byId(input)) {
                        const el = byId(input);
                        el.classList.add('error-border');

                        el.addEventListener('input', () => {
                            el.classList.remove('error-border');
                            errMessages.innerHTML = '';
                        });
                    }
                });
            }
        },

        async auth(sid) {
            const res = await fetch(`${this.appRoutes.auth}/?sid=${sid}`, {
                credentials: 'include',
            });

            res
                .json()
                .then((data) => {
                    if (data.success) {
                        this.setFriendsMenu();
                        this.profile = data.user;
                        this.setProfile(data.user);
                        this.friends_settings = data.settings;
                    } else {
                        console.error('Not a valid account.');
                    }
                })
                .catch((error) => {
                    console.error(error);
                });
        },

        setFriendsMenu() {
            const that = this;
            const friendsMenu = byId('mod_friends');
            friendsMenu.innerHTML = ''; // clear content

            // add new content
            friendsMenu.innerHTML = `
                <div class="friends_header">
                    <button class="modButton-black" id="friends_btn">Friends</button>
                    <button class="modButton-black" id="allusers_btn">All users</button>
                    <button class="modButton-black" id="requests_btn">Requests</button>
                    <button class="modButton-black" id="friends_settings_btn" style="width: 80px;">
                        <img src="https://czrsd.com/static/sigmod/icons/settings.svg" width="22" />
                    </button>
                </div>
                <div class="friends_body scroll"></div>
            `;

            const elements = [
                '#friends_btn',
                '#allusers_btn',
                '#requests_btn',
                '#friends_settings_btn',
            ];

            elements.forEach((el) => {
                const button = document.querySelector(el);
                button.addEventListener('click', () => {
                    elements.forEach((btn) =>
                        document.querySelector(btn).classList.remove('mod_selected'),
                    );
                    button.classList.add('mod_selected');
                    switch (button.id) {
                        case 'friends_btn':
                            that.openFriendsTab();
                            break;
                        case 'allusers_btn':
                            that.openAllUsers();
                            break;
                        case 'requests_btn':
                            that.openRequests();
                            break;
                        case 'friends_settings_btn':
                            that.openFriendSettings();
                            break;
                        default:
                            console.error('Unknown button clicked');
                    }
                });
            });

            byId('friends_btn').click(); // open friends first
        },

        async showProfileHandler(event) {
            const userId = event.currentTarget.getAttribute('data-user-profile');
            const req = await fetch(this.appRoutes.profile(userId), {
                credentials: 'include',
            }).then((res) => res.json());

            if (req.success) {
                const user = req.user;
                let badges =
                    user.badges && user.badges.length > 0
                        ? user.badges
                            .map((badge) => `<span class="mod_badge">${badge}</span>`)
                            .join('')
                        : '<span>User has no badges.</span>';
                let icon = null;

                const overlay = document.createElement('div');
                overlay.classList.add('mod_overlay');
                overlay.style.opacity = '0';
                overlay.innerHTML = `
                    <div class="signIn-wrapper">
                        <div class="signIn-header">
                            <span>Profile of ${user.username}</span>
                            <div class="centerXY" style="width: 32px; height: 32px;">
                                <button class="modButton-black" id="closeProfileEditor">
                                    <svg width="18" height="20" viewBox="0 0 16 16" fill="#ffffff" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M1.6001 14.4L14.4001 1.59998M14.4001 14.4L1.6001 1.59998" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="signIn-body" style="padding-bottom: 40px;">
                            <div class="friends_row">
                                <div class="centerY g-5">
                                    <div class="profile-img">
                                        <img src="${user.imageURL}" alt="${user.username}">
                                        <span class="status_icon ${user.online ? 'online_icon' : 'offline_icon'}"></span>
                                    </div>
                                    <div class="f-big">${user.username}</div>
                                </div>
                                <div class="centerY g-10">
                                    <div class="${user.role}_role">${user.role}</div>
                                </div>
                            </div>
                            <div class="f-column g-5 w-100">
                                <strong>Bio:</strong>
                                <p>${user.bio || 'User has no bio.'}</p>
                                <strong>Badges:</strong>
                                <div class="mod_badges">
                                    ${badges}
                                </div>
                                ${user.lastOnline ? `<strong>Last online:</strong><span>${prettyTime.am_pm(user.lastOnline)} (${prettyTime.time_ago(user.lastOnline, true)})</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
                document.body.append(overlay);

                function hide() {
                    overlay.style.opacity = '0';
                    setTimeout(() => {
                        overlay.remove();
                    }, 300);
                }

                overlay.addEventListener('click', (e) => {
                    if (e.target == overlay) hide();
                });

                setTimeout(() => {
                    overlay.style.opacity = '1';
                });

                byId('closeProfileEditor').addEventListener('click', hide);
            }
        },

        async openFriendsTab() {
            let that = this;
            const friends_body = document.querySelector('.friends_body');
            if (friends_body.classList.contains('allusers'))
                friends_body.classList.remove('allusers');
            friends_body.innerHTML = '';

            const res = await fetch(this.appRoutes.friends, {
                credentials: 'include',
            });

            res
                .json()
                .then((data) => {
                    if (!data.success) return;
                    if (data.friends.length !== 0) {
                        const newUsersHTML = data.friends
                            .map(
                                (user) => `
                      <div class="friends_row user-profile-wrapper" data-user-profile="${user._id}">
                        <div class="centerY g-5">
                          <div class="profile-img">
                            <img src="${user.imageURL}" alt="${user.username}" onerror="this.onerror=null; this.src='https://czrsd.com/static/sigmod/SigMod25-rounded.png';">
                            <span class="status_icon ${user.online ? 'online_icon' : 'offline_icon'}"></span>
                          </div>
                          ${
                                    user.nick
                                        ? `
                              <div class="f-column centerX">
                                  <div class="f-big">${user.username}</div>
                                  <span style="color: #A2A2A2" title="Nickname">${user.nick}</span>
                              </div>
                          `
                                        : `
                              <div class="f-big">${user.username}</div>
                          `
                                }
                        </div>
                        <div class="centerY g-10">
                            ${
                                    user.server
                                        ? `
                                <span>${user.server}</span>
                                <div class="vr2"></div>
                            `
                                        : ''
                                }
                            ${
                                    user.tag
                                        ? `
                                <span>Tag: ${user.tag}</span>
                                <div class="vr2"></div>
                            `
                                        : ''
                                }
                            <div class="${user.role}_role">${user.role}</div>
                            <div class="vr2"></div>
                            <button class="modButton centerXY" id="remove-${user._id}" style="padding: 7px;">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="16"><path fill="#ffffff" d="M96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM0 482.3C0 383.8 79.8 304 178.3 304h91.4C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7H29.7C13.3 512 0 498.7 0 482.3zM472 200H616c13.3 0 24 10.7 24 24s-10.7 24-24 24H472c-13.3 0-24-10.7-24-24s10.7-24 24-24z"/></svg>
                            </button>
                            <div class="vr2"></div>
                            <button class="modButton centerXY" id="chat-${user._id}" style="padding: 7px;">
                                <svg fill="#ffffff" width="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 458 458"stroke="#ffffff"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <g> <path d="M428,41.534H30c-16.569,0-30,13.431-30,30v252c0,16.568,13.432,30,30,30h132.1l43.942,52.243 c5.7,6.777,14.103,10.69,22.959,10.69c8.856,0,17.258-3.912,22.959-10.69l43.942-52.243H428c16.568,0,30-13.432,30-30v-252 C458,54.965,444.568,41.534,428,41.534z M323.916,281.534H82.854c-8.284,0-15-6.716-15-15s6.716-15,15-15h241.062 c8.284,0,15,6.716,15,15S332.2,281.534,323.916,281.534z M67.854,198.755c0-8.284,6.716-15,15-15h185.103c8.284,0,15,6.716,15,15 s-6.716,15-15,15H82.854C74.57,213.755,67.854,207.039,67.854,198.755z M375.146,145.974H82.854c-8.284,0-15-6.716-15-15 s6.716-15,15-15h292.291c8.284,0,15,6.716,15,15C390.146,139.258,383.43,145.974,375.146,145.974z"></path> </g> </g> </g></svg>
                            </button>
                        </div>
                      </div>
                    `,
                            )
                            .join('');
                        friends_body.innerHTML = newUsersHTML;

                        const userProfiles = document.querySelectorAll(
                            '.user-profile-wrapper',
                        );

                        userProfiles.forEach((button) => {
                            if (button.getAttribute('data-user-profile') == this.profile._id)
                                return;
                            button.addEventListener('click', (e) => {
                                if (e.target == button) {
                                    this.showProfileHandler(e);
                                }
                            });
                        });

                        data.friends.forEach((friend) => {
                            if (friend.nick) {
                                this.friend_names.add(friend.nick);
                            }
                            const remove = byId(`remove-${friend._id}`);
                            remove.addEventListener('click', async () => {
                                if (confirm('Are you sure you want to remove this friend?')) {
                                    const res = await fetch(this.appRoutes.removeAvatar, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                            type: 'remove-friend',
                                            userId: friend._id,
                                        }),
                                        credentials: 'include',
                                    }).then((res) => res.json());

                                    if (res.success) {
                                        that.openFriendsTab();
                                    } else {
                                        let message =
                                            res.message ||
                                            'Something went wrong. Please try again later.';
                                        that.modAlert(message, 'danger');
                                    }
                                }
                            });

                            const chat = byId(`chat-${friend._id}`);
                            chat.addEventListener('click', () => {
                                this.openChat(friend._id);
                            });
                        });
                    } else {
                        friends_body.innerHTML = `
                        <span>You have no friends yet :(</span>
                        <span>Go to the <strong>All users</strong> tab to find new friends.</span>
                    `;
                    }
                })
                .catch((error) => {
                    console.error(error);
                });
        },

        async openChat(id) {
            const res = await fetch(this.appRoutes.chatHistory(id), {
                credentials: 'include',
            });
            const { history, target, success } = await res.json();

            if (!success) {
                this.modAlert('Something went wrong...', 'danger');
                return;
            }

            const body = document.querySelector('.mod_menu_content');

            const chatDiv = document.createElement('div');
            chatDiv.classList.add('friends-chat-wrapper');
            chatDiv.id = id;
            setTimeout(() => {
                chatDiv.style.opacity = '1';
            });

            const messagesHTML = history
                .map(
                    (message) => `
                <div class="friends-message ${message.sender_id === this.profile._id ? 'message-right' : ''}">
                    <span>${message.content}</span>
                    <span class="message-date">${prettyTime.am_pm(message.timestamp)}</span>
                </div>
            `,
                )
                .join('');

            chatDiv.innerHTML = `
                <div class="friends-chat-header">
                    <div class="centerXY g-5">
                        <div class="profile-img">
                            <img src="${target.imageURL}" alt="${target.username}">
                            <span class="status_icon ${target.online ? 'online_icon' : 'offline_icon'}"></span>
                        </div>
                        <span class="f-big">${target.username}</span>
                    </div>
                    <button class="modButton centerXY g-5" id="back-friends-chat">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="16"><path fill="#ffffff" d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg>
                        Back
                    </button>
                </div>
                <div class="friends-chat-body">
                    <div class="friends-chat-messages private-chat-content scroll">
                        ${history.length > 0 ? messagesHTML : '<center id=\'beginning-of-conversation\'>This is the beginning of your conversation...</center>'}
                    </div>
                    <div class="messenger-wrapper">
                        <div class="container">
                            <input type="text" class="form-control" placeholder="Enter a message..." id="private-message-text" />
                            <button class="modButton-black" id="send-private-message">Send</button>
                        </div>
                    </div>
                </div>
            `;

            body.appendChild(chatDiv);
            const messagesContainer = chatDiv.querySelector('.private-chat-content');
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            const back = byId('back-friends-chat');
            back.addEventListener('click', (e) => {
                chatDiv.style.opacity = '0';
                setTimeout(() => {
                    chatDiv.remove();
                }, 300);
            });

            const text = byId('private-message-text');
            const send = byId('send-private-message');

            text.addEventListener('keydown', (e) => {
                const key = e.key.toLowerCase();
                if (key === 'enter') {
                    sendMessage(text.value, id);
                    text.value = '';
                }
            });

            send.addEventListener('click', () => {
                sendMessage(text.value, id);
                text.value = '';
            });

            function sendMessage(val, target) {
                if (!val || val.length > 200) return;
                client.send({
                    type: 'private-message',
                    content: {
                        text: val,
                        target,
                    },
                });
            }
        },

        updatePrivateChat(data) {
            const { sender_id, target_id, message, timestamp } = data;

            let chatDiv = byId(target_id) || byId(sender_id);
            if (!chatDiv) {
                console.error('Could not find chat div for either sender or target');
                return;
            }

            const bocElement = document.querySelector('#beginning-of-conversation');
            if (bocElement)
                bocElement.remove();

            const messages = chatDiv.querySelector('.friends-chat-messages');
            messages.innerHTML += `
        <div class="friends-message ${sender_id === this.profile._id ? 'message-right' : ''}">
            <span>${message}</span>
            <span class="message-date">${prettyTime.am_pm(timestamp)}</span>
        </div>
      `;
            messages.scrollTop = messages.scrollHeight;
        },

        async searchUser(user) {
            if (!user) {
                this.openAllUsers();
                return;
            }
            const response = await fetch(`${this.appRoutes.search}/?q=${user}`, {
                credentials: 'include',
            }).then((res) => res.json());
            const usersDiv = document;

            const usersContainer = byId('users-container');
            usersContainer.innerHTML = '';
            if (!response.success) {
                usersContainer.innerHTML = `
                    <span>Couldn't find ${user}...</span>
                `;
                return;
            }

            const handleAddButtonClick = (event) => {
                const userId = event.currentTarget.getAttribute('data-user-id');
                const add = event.currentTarget;
                fetch(this.appRoutes.request, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ req_id: userId }),
                    credentials: 'include',
                })
                    .then((res) => res.json())
                    .then((req) => {
                        const type = req.success ? 'success' : 'danger';
                        this.modAlert(req.message, type);

                        if (req.success) {
                            add.disabled = true;
                            add.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="16"><path fill="#ffffff" d="M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64V75c0 42.4 16.9 83.1 46.9 113.1L146.7 256 78.9 323.9C48.9 353.9 32 394.6 32 437v11c-17.7 0-32 14.3-32 32s14.3 32 32 32H64 320h32c17.7 0 32-14.3 32-32s-14.3-32-32-32V437c0-42.4-16.9-83.1-46.9-113.1L237.3 256l67.9-67.9c30-30 46.9-70.7 46.9-113.1V64c17.7 0 32-14.3 32-32s-14.3-32-32-32H320 64 32zM288 437v11H96V437c0-25.5 10.1-49.9 28.1-67.9L192 301.3l67.9 67.9c18 18 28.1 42.4 28.1 67.9z"/></svg>
                        `;
                        }
                    });
            };

            response.users.forEach((user) => {
                const userHTML = `
                    <div class="friends_row user-profile-wrapper" style="${this.profile._id == user._id ? `background: linear-gradient(45deg, #17172d, black)` : ''}" data-user-profile="${user._id}">
                        <div class="centerY g-5">
                            <div class="profile-img">
                                <img src="${user.imageURL}" alt="${user.username}" onerror="this.onerror=null; this.src='https://czrsd.com/static/sigmod/SigMod25-rounded.png';">
                                <span class="status_icon ${user.online ? 'online_icon' : 'offline_icon'}"></span>
                            </div>
                            <div class="f-big">${this.profile.username === user.username ? `${user.username} (You)` : user.username}</div>
                        </div>
                        <div class="centerY g-10">
                            <div class="${user.role}_role">${user.role}</div>
                            ${
                    this.profile._id == user._id
                        ? ''
                        : `
                                <div class="vr2"></div>
                                <button class="modButton centerXY add-button" data-user-id="${user._id}" style="padding: 7px;">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="16"><path fill="#ffffff" d="M96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM0 482.3C0 383.8 79.8 304 178.3 304h91.4C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7H29.7C13.3 512 0 498.7 0 482.3zM504 312V248H440c-13.3 0-24-10.7-24-24s10.7-24 24-24h64V136c0-13.3 10.7-24 24-24s24 10.7 24 24v64h64c13.3 0 24 10.7 24 24s-10.7 24-24 24H552v64c0 13.3-10.7 24-24 24s-24-10.7-24-24z"/></svg>
                                </button>
                            `
                }
                        </div>
                    </div>
                `;
                usersContainer.insertAdjacentHTML('beforeend', userHTML);

                if (user._id == this.profile._id) return;
                // Add event listener to view user profile
                const newUserProfile = usersContainer.querySelector(
                    `[data-user-profile="${user._id}"]`,
                );
                newUserProfile.addEventListener('click', (e) => {
                    if (e.target == newUserProfile) {
                        this.showProfileHandler(e);
                    }
                });

                // Add event listener to request button
                const addButton = newUserProfile.querySelector('.add-button');
                if (!addButton) return;
                addButton.addEventListener('click', handleAddButtonClick);
            });
        },

        async openAllUsers() {
            let offset = 0;
            let maxReached = false;
            let defaultAmount = 5; // min: 1; max: 100

            const friends_body = document.querySelector('.friends_body');
            friends_body.innerHTML = `
                <input type="text" id="search-user" placeholder="Search user by username or id" class="form-control p-10" style="border: none" />
                <div id="users-container"></div>
            `;
            const usersContainer = byId('users-container');
            friends_body.classList.add('allusers');

            // search user
            const search = byId('search-user');
            search.addEventListener(
                'input',
                debounce(() => {
                    this.searchUser(search.value);
                }, 500),
            );

            const handleAddButtonClick = (event) => {
                const userId = event.currentTarget.getAttribute('data-user-id');
                const add = event.currentTarget;
                fetch(this.appRoutes.request, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ req_id: userId }),
                    credentials: 'include',
                })
                    .then((res) => res.json())
                    .then((req) => {
                        const type = req.success ? 'success' : 'danger';
                        this.modAlert(req.message, type);

                        if (req.success) {
                            add.disabled = true;
                            add.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="16"><path fill="#ffffff" d="M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64V75c0 42.4 16.9 83.1 46.9 113.1L146.7 256 78.9 323.9C48.9 353.9 32 394.6 32 437v11c-17.7 0-32 14.3-32 32s14.3 32 32 32H64 320h32c17.7 0 32-14.3 32-32s-14.3-32-32-32V437c0-42.4-16.9-83.1-46.9-113.1L237.3 256l67.9-67.9c30-30 46.9-70.7 46.9-113.1V64c17.7 0 32-14.3 32-32s-14.3-32-32-32H320 64 32zM288 437v11H96V437c0-25.5 10.1-49.9 28.1-67.9L192 301.3l67.9 67.9c18 18 28.1 42.4 28.1 67.9z"/></svg>
                        `;
                        }
                    });
            };

            // Set to store displayed user IDs
            const displayedUserIDs = new Set();

            const fetchNewUsers = async () => {
                const newUsersResponse = await fetch(this.appRoutes.users, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ amount: defaultAmount, offset }),
                    credentials: 'include',
                }).then((res) => res.json());

                const newUsers = newUsersResponse.users;

                if (newUsers.length === 0) {
                    maxReached = true;
                    return;
                }
                offset += defaultAmount;

                newUsers.forEach((user) => {
                    if (!displayedUserIDs.has(user._id)) {
                        displayedUserIDs.add(user._id);

                        const newUserHTML = `
                            <div class="friends_row user-profile-wrapper" style="${this.profile._id == user._id ? `background: linear-gradient(45deg, #17172d, black)` : ''}" data-user-profile="${user._id}">
                                <div class="centerY g-5">
                                    <div class="profile-img">
                                        <img src="${user.imageURL}" alt="${user.username}" onerror="this.onerror=null; this.src='https://czrsd.com/static/sigmod/SigMod25-rounded.png';">
                                        <span class="status_icon ${user.online ? 'online_icon' : 'offline_icon'}"></span>
                                    </div>
                                    <div class="f-big">${this.profile.username === user.username ? `${user.username} (You)` : user.username}</div>
                                </div>
                                <div class="centerY g-10">
                                    <div class="${user.role}_role">${user.role}</div>
                                    ${
                            this.profile._id == user._id
                                ? ''
                                : `
                                        <div class="vr2"></div>
                                        <button class="modButton centerXY add-button" data-user-id="${user._id}" style="padding: 7px;">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="16"><path fill="#ffffff" d="M96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM0 482.3C0 383.8 79.8 304 178.3 304h91.4C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7H29.7C13.3 512 0 498.7 0 482.3zM504 312V248H440c-13.3 0-24-10.7-24-24s10.7-24 24-24h64V136c0-13.3 10.7-24 24-24s24 10.7 24 24v64h64c13.3 0 24 10.7 24 24s-10.7 24-24 24H552v64c0 13.3-10.7 24-24 24s-24-10.7-24-24z"/></svg>
                                        </button>
                                    `
                        }
                                </div>
                            </div>
                        `;

                        usersContainer.insertAdjacentHTML('beforeend', newUserHTML);

                        // Add event listener to view user profile
                        const newUserProfile = usersContainer.querySelector(
                            `[data-user-profile="${user._id}"]`,
                        );
                        newUserProfile.addEventListener('click', (e) => {
                            if (e.target == newUserProfile) {
                                this.showProfileHandler(e);
                            }
                        });

                        // Add event listener to request button
                        const addButton = newUserProfile.querySelector('.add-button');
                        if (!addButton) return;
                        addButton.addEventListener('click', handleAddButtonClick);
                    }
                });
            };

            const scrollHandler = async () => {
                if (maxReached) return;
                if (
                    usersContainer.scrollTop + usersContainer.clientHeight >=
                    usersContainer.scrollHeight - 1
                ) {
                    await fetchNewUsers();
                }
            };

            // Initial fetch
            await fetchNewUsers();

            // remove existing scroll event listener if exists
            usersContainer.removeEventListener('scroll', scrollHandler);

            // add new scroll event listener
            usersContainer.addEventListener('scroll', scrollHandler);
        },

        async openRequests() {
            let that = this;
            const friends_body = document.querySelector('.friends_body');
            friends_body.innerHTML = '';
            if (friends_body.classList.contains('allusers'))
                friends_body.classList.remove('allusers');

            const requests = await fetch(this.appRoutes.myRequests, {
                credentials: 'include',
            }).then((res) => res.json());

            if (!requests.body) return;
            if (requests.body.length > 0) {
                const reqHtml = requests.body
                    .map(
                        (user) => `
                    <div class="friends_row">
                        <div class="centerY g-5">
                            <div class="profile-img">
                                <img src="${user.imageURL}" alt="${user.username}" onerror="this.onerror=null; this.src='https://czrsd.com/static/sigmod/SigMod25-rounded.png';">
                                <span class="status_icon ${user.online ? 'online_icon' : 'offline_icon'}"></span>
                            </div>
                            <div class="f-big">${user.username}</div>
                        </div>
                        <div class="centerY g-10">
                            <div class="${user.role}_role">${user.role}</div>
                            <div class="vr2"></div>
                            <button class="modButton centerXY accept" data-user-id="${user._id}" style="padding: 6px 7px;">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="16"><path fill="#ffffff" d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>
                            </button>
                            <button class="modButton centerXY decline" data-user-id="${user._id}" style="padding: 5px 8px;">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="16"><path fill="#ffffff" d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
                            </button>
                        </div>
                    </div>
                `,
                    )
                    .join('');

                friends_body.innerHTML = reqHtml;

                friends_body.querySelectorAll('.accept').forEach((accept) => {
                    accept.addEventListener('click', async () => {
                        const userId = accept.getAttribute('data-user-id');
                        const req = await fetch(this.appRoutes.handleRequest, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ type: 'accept-request', userId }),
                            credentials: 'include',
                        }).then((res) => res.json());
                        that.openRequests();
                    });
                });

                friends_body.querySelectorAll('.decline').forEach((decline) => {
                    decline.addEventListener('click', async () => {
                        const userId = decline.getAttribute('data-user-id');
                        const req = await fetch(this.appRoutes.handleRequest, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ type: 'decline-request', userId }),
                            credentials: 'include',
                        }).then((res) => res.json());
                        that.openRequests();
                    });
                });
            } else {
                friends_body.innerHTML = `<span>No requests!</span>`;
            }
        },

        async openFriendSettings() {
            const friends_body = document.querySelector('.friends_body');
            if (friends_body.classList.contains('allusers'))
                friends_body.classList.remove('allusers');

            friends_body.innerHTML = `
                <div class="friends_row">
                    <div class="centerY g-5">
                        <div class="profile-img">
                            <img src="${this.profile.imageURL}" alt="Profile picture" />
                        </div>
                        <span class="f-big" id="profile_username_00" title="${this.profile._id}">${this.profile.username}</span>
                    </div>
                    <button class="modButton-black val" id="editProfile">Edit Profile</button>
                </div>
                <div class="friends_row">
                    <span>Status</span>
                    <select class="form-control val" id="edit_static_status">
                        <option value="online" ${this.friends_settings.static_status === 'online' ? 'selected' : ''}>Online</option>
                        <option value="offline" ${this.friends_settings.static_status === 'offline' ? 'selected' : ''}>Offline</option>
                    </select>
                </div>
                <div class="friends_row">
                    <span>Accept friend requests</span>
                    <div class="modCheckbox val">
                        <input type="checkbox" ${this.friends_settings.accept_requests ? 'checked' : ''} id="edit_accept_requests" />
                        <label class="cbx" for="edit_accept_requests"></label>
                    </div>
                </div>
                <div class="friends_row">
                    <span>Highlight friends</span>
                    <div class="modCheckbox val">
                        <input type="checkbox" ${this.friends_settings.highlight_friends ? 'checked' : ''} id="edit_highlight_friends" />
                        <label class="cbx" for="edit_highlight_friends"></label>
                    </div>
                </div>
                <div class="friends_row">
                    <span>Highlight color</span>
                    <input type="color" class="colorInput" value="${this.friends_settings.highlight_color}" style="margin-right: 12px;" id="edit_highlight_color" />
                </div>
                <div class="friends_row">
                    <span>Public profile</span>
                    <div class="modCheckbox val">
                        <input type="checkbox" ${this.profile.visible ? 'checked' : ''} id="edit_visible" />
                        <label class="cbx" for="edit_visible"></label>
                    </div>
                </div>
                <div class="friends_row">
                    <span>Logout</span>
                    <button class="modButton-black" id="logout_mod" style="width: 150px">Logout</button>
                </div>
            `;

            const editProfile = byId('editProfile');
            editProfile.addEventListener('click', () => {
                this.openProfileEditor();
            });

            const logout = byId('logout_mod');
            logout.addEventListener('click', async () => {
                if (confirm('Are you sure you want to logout?')) {
                    try {
                        const res = await fetch(this.appRoutes.logout, {
                            credentials: 'include',
                        });

                        const data = await res.json();

                        if (!data.success) return alert('Something went wrong...');

                        modSettings.modAccount.authorized = false;
                        updateStorage();
                        location.reload();
                    } catch (error) {
                        console.error('Error logging out:', error);
                    }
                }
            });

            const edit_static_status = byId('edit_static_status');
            const edit_accept_requests = byId('edit_accept_requests');
            const edit_highlight_friends = byId('edit_highlight_friends');
            const edit_highlight_color = byId('edit_highlight_color');
            const edit_visible = byId('edit_visible');

            edit_static_status.addEventListener('change', () => {
                const val = edit_static_status.value;
                updateSettings('static_status', val);
            });

            edit_accept_requests.addEventListener('change', () => {
                const val = edit_accept_requests.checked;
                updateSettings('accept_requests', val);
            });

            edit_highlight_friends.addEventListener('change', () => {
                const val = edit_highlight_friends.checked;
                updateSettings('highlight_friends', val);
            });

            // Debounce the updateSettings function
            edit_highlight_color.addEventListener(
                'input',
                debounce(() => {
                    const val = edit_highlight_color.value;
                    updateSettings('highlight_color', val);
                }, 500),
            );

            edit_visible.addEventListener('change', () => {
                const val = edit_visible.checked;
                updateSettings('visible', val);
            });

            const updateSettings = async (type, data) => {
                const resData = await (
                    await fetch(this.appRoutes.updateSettings, {
                        method: 'POST',
                        body: JSON.stringify({ type, data }),
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    })
                ).json();

                if (resData.success) {
                    this.friends_settings[type] = data;
                }
            };
        },

        openProfileEditor() {
            let that = this;

            const overlay = document.createElement('div');
            overlay.classList.add('mod_overlay');
            overlay.style.opacity = '0';
            overlay.innerHTML = `
                <div class="signIn-wrapper">
                    <div class="signIn-header">
                        <span>Edit mod profile</span>
                        <div class="centerXY" style="width: 32px; height: 32px;">
                            <button class="modButton-black" id="closeProfileEditor">
                                <svg width="18" height="20" viewBox="0 0 16 16" fill="#ffffff" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M1.6001 14.4L14.4001 1.59998M14.4001 14.4L1.6001 1.59998" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="signIn-body" style="width: fit-content;">
                        <div class="centerXY g-10">
                            <div class="profile-img" style="width: 6em;height: 6em;">
                                <img src="${this.profile.imageURL}" alt="Profile picture" />
                            </div>
                            <div class="f-column g-5">
                                <input type="file" id="imageUpload" accept="image/*" style="display: none;">
                                <label for="imageUpload" class="modButton-black g-10">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16"><path fill="#ffffff" d="M149.1 64.8L138.7 96H64C28.7 96 0 124.7 0 160V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H373.3L362.9 64.8C356.4 45.2 338.1 32 317.4 32H194.6c-20.7 0-39 13.2-45.5 32.8zM256 192a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/></svg>
                                    Upload avatar
                                </label>
                                <button class="modButton-black g-10" id="deleteAvatar">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="16"><path fill="#ffffff" d="M135.2 17.7C140.6 6.8 151.7 0 163.8 0H284.2c12.1 0 23.2 6.8 28.6 17.7L320 32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64S14.3 32 32 32h96l7.2-14.3zM32 128H416V448c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V128zm96 64c-8.8 0-16 7.2-16 16V432c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16V432c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16V432c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16z"/></svg>
                                    Delete avatar
                                </button>
                            </div>
                        </div>
                        <div class="f-column w-100">
                            <label for="username_edit">Username</label>
                            <input type="text" class="form-control" id="username_edit" value="${this.profile.username}" maxlength="40" minlength="4" />
                        </div>
                        <div class="f-column w-100">
                            <label for="bio_edit">Bio</label>
                            <div class="textarea-container">
                                <textarea placeholder="Hello! I'm ..." class="form-control" maxlength="250" id="bio_edit">${this.profile.bio || ''}</textarea>
                                <span class="char-counter" id="charCount">${this.profile.bio ? this.profile.bio.length : '0'}/250</span>
                            </div>
                        </div>
                        <button class="modButton-black" style="margin-bottom: 20px;" id="saveChanges">Save changes</button>
                    </div>
                </div>
            `;
            document.body.append(overlay);

            function hide() {
                overlay.style.opacity = '0';
                setTimeout(() => {
                    overlay.remove();
                }, 300);
            }

            overlay.addEventListener('click', (e) => {
                if (e.target == overlay) hide();
            });

            setTimeout(() => {
                overlay.style.opacity = '1';
            });

            byId('closeProfileEditor').addEventListener('click', hide);

            let changes = new Set(); // Use a Set to store unique changes

            const bio_edit = byId('bio_edit');
            const charCountSpan = byId('charCount');
            bio_edit.addEventListener('input', updCharcounter);

            function updCharcounter() {
                const currentTextLength = bio_edit.value.length;
                charCountSpan.textContent = currentTextLength + '/250';

                // Update changes
                changes.add('bio');
            }

            // Upload avatar
            byId('imageUpload').addEventListener('input', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('image', file);

                try {
                    const data = await (
                        await fetch(this.appRoutes.imgUpload, {
                            method: 'POST',
                            credentials: 'include',
                            body: formData,
                        })
                    ).json();

                    if (data.success) {
                        const profileImg = document.querySelector('.profile-img img');
                        profileImg.src = data.user.imageURL;
                        hide();
                        that.profile = data.user;
                    } else {
                        that.modAlert(data.message, 'danger');
                        console.error('Failed to upload image');
                    }
                } catch (error) {
                    console.error('Error uploading image:', error);
                }
            });

            const username_edit = byId('username_edit');
            username_edit.addEventListener('input', () => {
                changes.add('username');
            });

            const saveChanges = byId('saveChanges');
            saveChanges.addEventListener('click', async () => {
                if (changes.size === 0) return;
                let changedData = {};
                changes.forEach((change) => {
                    if (change === 'username') {
                        changedData.username = username_edit.value;
                    } else if (change === 'bio') {
                        changedData.bio = bio_edit.value;
                    }
                });

                const resData = await (
                    await fetch(this.appRoutes.editProfile, {
                        method: 'POST',
                        body: JSON.stringify({
                            changes: Array.from(changes),
                            data: changedData,
                        }),
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    })
                ).json();

                if (resData.success) {
                    if (that.profile.username !== resData.user.username) {
                        const p_username = byId('profile_username_00');
                        if (p_username) p_username.innerText = resData.user.username;
                    }
                    that.profile = resData.user;
                    changes.clear();
                    hide();
                    const name = byId('my-profile-name');
                    const bioText = byId('my-profile-bio');

                    name.innerText = resData.user.username;
                    bioText.innerHTML = resData.user.bio || 'No bio.';
                } else {
                    if (resData.message) {
                        this.modAlert(resData.message, 'danger');
                    }
                }
            });

            const deleteAvatar = byId('deleteAvatar');
            deleteAvatar.addEventListener('click', async () => {
                if (
                    confirm(
                        'Are you sure you want to remove your profile picture? It will be changed to the default profile picture.',
                    )
                ) {
                    try {
                        const data = await (
                            await fetch(this.appRoutes.delProfile, {
                                credentials: 'include',
                            })
                        ).json();
                        const profileImg = document.querySelector('.profile-img img');
                        profileImg.src = data.user.imageURL;
                        hide();
                        that.profile = data.user;
                    } catch (error) {
                        console.error('Couldn\'t remove image: ', error);
                        this.modAlert(error.message, 'danger');
                    }
                }
            });
        },

        async announcements() {
            const previewContainer = byId('mod-announcements');

            const announcements = await (
                await fetch(this.appRoutes.announcements)
            ).json();
            if (!announcements.success) return;

            const { data } = announcements;

            const pinnedAnnouncements = data.filter(
                (announcement) => announcement.pinned,
            );
            const unpinnedAnnouncements = data.filter(
                (announcement) => !announcement.pinned,
            );

            pinnedAnnouncements.sort((a, b) => new Date(b.date) - new Date(a.date));
            unpinnedAnnouncements.sort((a, b) => new Date(b.date) - new Date(a.date));

            const sortedAnnouncements = [
                ...pinnedAnnouncements,
                ...unpinnedAnnouncements,
            ];

            const previews = sortedAnnouncements
                .map(
                    (announcement) => `
				<div class="mod-announcement" data-announcement-id="${announcement._id}">
					<img class="mod-announcement-icon" src="${announcement.icon}" width="32" draggable="false" />
					<div class="mod-announcement-text">
						<span>${announcement.title}</span>
						<div>${announcement.description}</div>
					</div>
					${announcement.pinned ? '<img src="https://czrsd.com/static/icons/pinned.svg" draggable="false" style="width: 22px; align-self: start;" />' : ''}
				</div>
			`,
                )
                .join('');

            previewContainer.innerHTML = previews;

            const announcementElements =
                document.querySelectorAll('.mod-announcement');
            announcementElements.forEach((element) => {
                element.addEventListener('click', async (event) => {
                    const announcementId = element.getAttribute('data-announcement-id');
                    try {
                        const data = await (
                            await fetch(this.appRoutes.announcement(announcementId))
                        ).json();
                        if (data.success) {
                            createAnnouncementTab(data.data);
                        }
                    } catch (error) {
                        console.error('Error fetching announcement details:', error);
                    }
                });
            });

            function createAnnouncementTab(data) {
                const menuContent = document.querySelector('.mod_menu_content');
                const modHome = byId('mod_home');
                const content = document.createElement('div');

                content.setAttribute('id', 'announcement-tab');
                content.classList.add('mod_tab');
                content.style.display = 'none';
                content.style.opacity = '0';

                const announcementHTML = `
					<div class="centerY justify-sb">
						<div class="centerY g-5">
							<img style="border-radius: 50%;" src="${data.preview.icon}" width="64" draggable="false" />
							<div class="f-column centerX">
								<h2>${data.full.title}</h2>
								<span style="color: #7E7E7E">${prettyTime.fullDate(data.date)}</span>
							</div>
						</div>
						<button class="modButton-black" style="width: 20%;" id="mod-announcement-back">Back</button>
					</div>
					<div class="mod-announcement-content">
						<div class="f-column g-10 scroll">${data.full.description}</div>
						<div class="mod-announcement-images scroll">
							${data.full.images.map((image) => `<img src="${image}" onclick="window.open('${image}')" />`).join('')}
						</div>
					</div>
				`;

                content.innerHTML = announcementHTML;
                menuContent.appendChild(content);

                window.openModTab('announcement-tab');

                const back = byId('mod-announcement-back');
                back.addEventListener('click', () => {
                    const mod_home = byId('mod_home');
                    content.style.opacity = '0';
                    setTimeout(() => {
                        content.remove();

                        mod_home.style.display = 'flex';
                        mod_home.style.opacity = '1';
                    }, 300);

                    byId('tab_home_btn').classList.add('mod_selected');
                });
                1;
            }
        },

        chart() {
            const canvas = byId('sigmod-stats');
            const { Chart } = window;

            const stats = JSON.parse(localStorage.getItem('game-stats'));

            // max values
            const statValues = {
                timeplayed: [
                    10_000, 50_000, 100_000, 150_000, 200_000, 250_000, 300_000, 400_000,
                    800_000, 1_000_000,
                ],
                highestmass: [
                    50_000, 100_000, 500_000, 700_000, 1_000_000, 5_000_000, 10_000_000,
                ],
                totaldeaths: [
                    100, 500, 1_000, 2_000, 3_000, 4_000, 5_000, 8_000, 10_000, 30_000,
                    50_000, 100_000,
                ],
                totalmass: [
                    100_000, 500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000,
                    10_000_000, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000,
                    2_000_000_000, 5_000_000_000,
                ],
            };

            const getBestValue = (stat, values) => {
                for (let value of values) {
                    if (stat < value) return value;
                }
                return values[values.length - 1];
            };

            const emojiLabels = ['⏲', '🏆', '💀', '🔢'];
            const textLabels = [
                'Time Played',
                'Highest Mass',
                'Total Deaths',
                'Total Mass',
            ];

            const data = {
                labels: emojiLabels,
                datasets: [
                    {
                        label: 'Your Stats',
                        data: [
                            stats['time-played'] /
                            getBestValue(stats['time-played'], statValues.timeplayed),
                            stats['highest-mass'] /
                            getBestValue(stats['highest-mass'], statValues.highestmass),
                            stats['total-deaths'] /
                            getBestValue(stats['total-deaths'], statValues.totaldeaths),
                            stats['total-mass'] /
                            getBestValue(stats['total-mass'], statValues.totalmass),
                        ],
                        backgroundColor: [
                            'rgba(255, 99, 132, 0.2)',
                            'rgba(54, 162, 235, 0.2)',
                            'rgba(255, 206, 86, 0.2)',
                            'rgba(153, 102, 255, 0.2)',
                        ],
                        borderColor: [
                            'rgba(255, 99, 132, 1)',
                            'rgba(54, 162, 235, 1)',
                            'rgba(255, 206, 86, 1)',
                            'rgba(153, 102, 255, 1)',
                        ],
                        borderWidth: 1,
                    },
                ],
            };

            const formatLabel = (labelType, actualValue) => {
                if (labelType === 'Time Played') {
                    const hours = Math.floor(actualValue / 3600);
                    const minutes = Math.floor((actualValue % 3600) / 60);
                    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                } else if (labelType === 'Highest Mass' || labelType === 'Total Mass') {
                    return actualValue > 999
                        ? `${(actualValue / 1000).toFixed(1)}k`
                        : actualValue.toString();
                } else {
                    return actualValue.toString();
                }
            };

            const createChart = () => {
                try {
                    new Chart(canvas, {
                        type: 'bar',
                        data: data,
                        options: {
                            indexAxis: 'y',
                            scales: {
                                x: {
                                    beginAtZero: true,
                                    max: 1,
                                    ticks: {
                                        callback: (value) => `${(value * 100).toFixed(0)}%`,
                                    },
                                },
                            },
                            plugins: {
                                legend: {
                                    display: false,
                                },
                                tooltip: {
                                    callbacks: {
                                        title: (context) => textLabels[context[0].dataIndex],
                                        label: (context) => {
                                            const dataIndex = context.dataIndex;
                                            const labelType = textLabels[dataIndex];
                                            const actualValue =
                                                context.dataset.data[dataIndex] *
                                                getBestValue(
                                                    stats[labelType.toLowerCase().replace(' ', '-')],
                                                    statValues[labelType.toLowerCase().replace(' ', '')],
                                                );
                                            return formatLabel(labelType, actualValue);
                                        },
                                    },
                                },
                            },
                        },
                    });
                } catch (error) {
                    console.error('An error occurred while rendering the chart:', error);
                }
            };

            createChart();
        },

        // Color input events & Reset color event handler
        colorPicker() {
            const colorPickerConfig = {
                mapColor: {
                    path: 'game.map.color',
                    opacity: false,
                    color: modSettings.game.map.color,
                    default: '#111111',
                },
                borderColor: {
                    path: 'game.borderColor',
                    opacity: true,
                    color: modSettings.game.borderColor,
                    default: '#0000ff',
                },
                foodColor: {
                    path: 'game.foodColor',
                    opacity: true,
                    color: modSettings.game.foodColor,
                    default: null,
                },
                cellColor: {
                    path: 'game.cellColor',
                    opacity: true,
                    color: modSettings.game.cellColor,
                    default: null,
                },
                nameColor: {
                    path: 'game.name.color',
                    opacity: false,
                    color: modSettings.game.name.color,
                    default: '#ffffff',
                },
                gradientNameColor1: {
                    path: 'game.name.gradient.left',
                    opacity: false,
                    color: modSettings.game.name.gradient.left,
                    default: '#ffffff',
                },
                gradientNameColor2: {
                    path: 'game.name.gradient.right',
                    opacity: false,
                    color: modSettings.game.name.gradient.right,
                    default: '#ffffff',
                },
                chatBackground: {
                    path: 'chat.bgColor',
                    opacity: true,
                    color: modSettings.chat.bgColor,
                    default: defaultSettings.chat.bgColor,
                    elementTarget: { selector: '.modChat', property: 'background' },
                },
                chatTextColor: {
                    path: 'chat.textColor',
                    opacity: true,
                    color: modSettings.chat.textColor,
                    default: defaultSettings.chat.textColor,
                    elementTarget: { selector: '.chatMessage-text', property: 'color' },
                },
                chatThemeChanger: {
                    path: 'chat.themeColor',
                    opacity: true,
                    color: modSettings.chat.themeColor,
                    default: defaultSettings.chat.themeColor,
                    elementTarget: { selector: '.chatButton', property: 'background' },
                },
            };

            const { Alwan } = window;

            Object.entries(colorPickerConfig).forEach(
                ([
                     selector,
                     { path, opacity, color, default: defaultColor, elementTarget },
                 ]) => {
                    const storagePath = path.split('.');
                    const colorPickerInstance = new Alwan(`#${selector}`, {
                        id: `edit-${selector}`,
                        color: color || defaultColor || '#000000',
                        theme: 'dark',
                        opacity,
                        format: 'hex',
                        default: defaultColor,
                        swatches: ['black', 'white', 'red', 'blue', 'green'],
                    });

                    const pickerElement = byId(`edit-${selector}`);
                    pickerElement.insertAdjacentHTML(
                        'beforeend',
                        `
					<div class="colorpicker-additional">
						<span>Reset Color</span>
						<button class="resetButton" id="reset-${selector}"></button>
					</div>
				`,
                    );

                    colorPickerInstance.on('change', (e) => {
                        let storageElement = modSettings;
                        storagePath
                            .slice(0, -1)
                            .forEach((part) => (storageElement = storageElement[part]));
                        storageElement[storagePath.at(-1)] = e.hex;

                        if (
                            path.includes('gradientName') &&
                            modSettings.game.name.gradient.enabled
                        ) {
                            modSettings.game.name.gradient.enabled = true;
                        }

                        if (elementTarget) {
                            const targets = document.querySelectorAll(elementTarget.selector);

                            targets.forEach((target) => {
                                target.style[elementTarget.property] = e.hex;
                            });
                        }

                        updateStorage();
                    });

                    byId(`reset-${selector}`)?.addEventListener('click', () => {
                        colorPickerInstance.setColor(defaultColor);

                        let storageElement = modSettings;
                        storagePath
                            .slice(0, -1)
                            .forEach((part) => (storageElement = storageElement[part]));
                        storageElement[storagePath.at(-1)] = defaultColor;

                        if (
                            path.includes('gradientName') &&
                            !modSettings.game.name.gradient.left &&
                            !modSettings.game.name.gradient.right
                        ) {
                            modSettings.game.name.gradient.enabled = false;
                        }

                        if (elementTarget) {
                            const targets = document.querySelectorAll(elementTarget.selector);

                            targets.forEach((target) => {
                                target.style[elementTarget.property] = defaultColor;
                            });
                        }

                        updateStorage();
                    });
                },
            );
        },

        async loadLibraries() {
            for (const lib in libs) {
                const { url, css, module } = libs[lib];
                const startTime = performance.now();

                if (module) {
                    // Handle ES modules using import
                    const library = await import(url);
                    console.log(`%c✅ Loaded ${lib}.`, 'color: lime');
                } else {
                    // Handle CommonJS modules using script tag
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = url;
                        script.type = 'text/javascript';
                        document.head.appendChild(script);

                        script.onload = () => {
                            console.log(`%c✅ Loaded ${lib}.`, 'color: lime');
                            resolve();
                        };
                        script.onerror = (error) => reject(error);
                    });
                }

                const downloadTime = performance.now() - startTime;
                console.log(`⏬ Download time: ${downloadTime.toFixed(2)}ms`);

                if (typeof this[lib] === 'function') {
                    this[lib]();
                }

                if (css) {
                    const cssStartTime = performance.now();

                    await Promise.all(
                        css.map(
                            (cssUrl) =>
                                new Promise((resolve, reject) => {
                                    const link = document.createElement('link');
                                    link.rel = 'stylesheet';
                                    link.href = cssUrl;
                                    document.head.appendChild(link);

                                    link.onload = () => resolve();
                                    link.onerror = (error) => reject(error);
                                }),
                        ),
                    );
                    const cssDownloadTime = performance.now() - cssStartTime;
                    console.log(
                        `%c✅ Loaded CSS for ${lib}. ⏬ Download time: ${cssDownloadTime.toFixed(2)}ms`,
                        'color: #40D476',
                    );
                }
            }
        },

        createMenu() {
            if (document.body.children[0]?.id === 'cf-wrapper') {
                console.log('User is rate limited.');
                return;
            }
            // only initialize sigmod on the main page
            if (!document.querySelector('.body__inner'))
                return;

            try {
                this.loadLibraries();
                this.menu();
                this.credits();
                this.chat();
                this.macros();
                this.tagsystem();
                this.updateNick();
                this.clientPing();
                this.themes();
                this.createMinimap();
                this.saveNames();
                this.setInputActions();
                this.game();
                this.mainMenu();
                this.macroSettings();
                this.initStats();
                this.account();
                this.announcements();
            } catch (e) {
                console.error('An error occurred while loading SigMod: ', e);
            }
        },
    };

    mods = new mod();
})();
