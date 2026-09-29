    class CanvasHooks extends FeatureController {
        async mount() {
            const visual = this.app.features.get('visuals');
            if (!(visual instanceof VisualController)) throw new Error('Visual controller is unavailable');
            const prototype = CanvasRenderingContext2D.prototype;
            const originalFillRect = prototype.fillRect;
            const originalArc = prototype.arc;
            const originalFillText = prototype.fillText;
            const originalStrokeText = prototype.strokeText;
            const originalStroke = prototype.stroke;
            const originalDrawImage = prototype.drawImage;
            const leaderboardCanvases = new WeakSet();
            const paths = new WeakMap();
            const originalBeginPath = prototype.beginPath;
            const originalFill = prototype.fill;
            const originalRestore = prototype.restore;
            const originalMoveTo = prototype.moveTo;
            const originalLineTo = prototype.lineTo;
            const nativeFoodHidden = () => visual.app.host.adapter?.kind === 'native' && !visual.app.settings.game.showFood;
            const isGameContext = (context) =>
                context?.canvas === this.app.dom?.canvas || context?.canvas?.id === SELECTORS.canvas.slice(1);
            const fillRect = function (x, y, width, height) {
                if (!isGameContext(this)) return originalFillRect.call(this, x, y, width, height);
                if (visual.isBackgroundRect(this.canvas, x, y, width, height)) {
                    this.fillStyle = visual.getMapFill(this);
                }
                return originalFillRect.call(this, x, y, width, height);
            };
            const arc = function (x, y, radius, startAngle, endAngle, counterclockwise) {
                if (!isGameContext(this)) return originalArc.call(this, x, y, radius, startAngle, endAngle, counterclockwise);
                visual.applyCellColor(this, radius);
                if (nativeFoodHidden()) {
                    let state = paths.get(this);
                    if (state) {
                        state.small = radius <= 40 && counterclockwise === false;
                        state.pending = null;
                    } else {
                        paths.set(this, { small: radius <= 40 && counterclockwise === false, pending: null, polygon: false });
                    }
                }
                return originalArc.call(this, x, y, radius, startAngle, endAngle, counterclockwise);
            };
            const fillText = function (text, x, y, maxWidth) {
                if (text === 'Leaderboard' && !isGameContext(this)) leaderboardCanvases.add(this.canvas);
                if (!isGameContext(this)) {
                    const replacement = visual.renderNativeLeaderboardName(text, leaderboardCanvases.has(this.canvas));
                    return maxWidth === undefined
                        ? originalFillText.call(this, replacement, x, y)
                        : originalFillText.call(this, replacement, x, y, maxWidth);
                }
                visual.observeNativeText(text);
                visual.applyTextStyle(this, text, x, y, false);
                const rendered = visual.renderedText(text);
                return maxWidth === undefined
                    ? originalFillText.call(this, rendered, x, y)
                    : originalFillText.call(this, rendered, x, y, maxWidth);
            };
            const strokeText = function (text, x, y, maxWidth) {
                if (!isGameContext(this)) {
                    const replacement = visual.renderNativeLeaderboardName(text, leaderboardCanvases.has(this.canvas));
                    return maxWidth === undefined
                        ? originalStrokeText.call(this, replacement, x, y)
                        : originalStrokeText.call(this, replacement, x, y, maxWidth);
                }
                visual.applyTextStyle(this, text, x, y, true);
                const rendered = visual.renderedText(text);
                return maxWidth === undefined
                    ? originalStrokeText.call(this, rendered, x, y)
                    : originalStrokeText.call(this, rendered, x, y, maxWidth);
            };
            const stroke = function (path) {
                const state = paths.get(this);
                if (state && state.pending !== null) {
                    if (state.pending === undefined) originalFill.call(this);
                    else originalFill.call(this, state.pending);
                    state.pending = null;
                }
                if (isGameContext(this)) visual.applyBorderColor(this);
                return path === undefined ? originalStroke.call(this) : originalStroke.call(this, path);
            };
            const drawImage = function (image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
                if (!isGameContext(this)) {
                    switch (arguments.length) {
                        case 3:
                            return originalDrawImage.call(this, image, sx, sy);
                        case 5:
                            return originalDrawImage.call(this, image, sx, sy, sWidth, sHeight);
                        default:
                            return originalDrawImage.call(this, image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
                    }
                }
                const state = paths.get(this);
                if (state && state.pending !== null) {
                    if (state.pending === undefined) originalFill.call(this);
                    else originalFill.call(this, state.pending);
                    state.pending = null;
                }
                if (!visual.app.settings.game.showLeaderboard && leaderboardCanvases.has(image)) return;
                const replacement = visual.getReplacementImage(image);
                switch (arguments.length) {
                    case 3:
                        return originalDrawImage.call(this, replacement ?? image, sx, sy);
                    case 5:
                        return originalDrawImage.call(this, replacement ?? image, sx, sy, sWidth, sHeight);
                    default:
                        return originalDrawImage.call(this, replacement ?? image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
                }
            };
            this.resources.patch(prototype, 'fillRect', fillRect);
            this.resources.patch(prototype, 'arc', arc);
            this.resources.patch(prototype, 'fillText', fillText);
            this.resources.patch(prototype, 'strokeText', strokeText);
            this.resources.patch(prototype, 'stroke', stroke);
            this.resources.patch(prototype, 'drawImage', drawImage);
            this.resources.patch(prototype, 'beginPath', function () {
                if (isGameContext(this) && nativeFoodHidden()) {
                    let state = paths.get(this);
                    if (state) {
                        state.small = false;
                        state.pending = null;
                        state.polygon = true;
                    } else {
                        paths.set(this, { small: false, pending: null, polygon: true });
                    }
                } else {
                    paths.delete(this);
                }
                return originalBeginPath.call(this);
            });
            const trackPoint = (context) => {
                const state = paths.get(context);
                if (state && state.polygon) {
                    state.small = true;
                    state.polygon = false; // Prevent redundant checks on subsequent vertices
                }
            };
            this.resources.patch(prototype, 'moveTo', function (x, y) {
                trackPoint(this);
                return originalMoveTo.call(this, x, y);
            });
            this.resources.patch(prototype, 'lineTo', function (x, y) {
                trackPoint(this);
                return originalLineTo.call(this, x, y);
            });
            this.resources.patch(prototype, 'fill', function (fillRule) {
                const state = paths.get(this);
                if (isGameContext(this) && nativeFoodHidden() && state && state.small && this.lineWidth === 10) {
                    state.pending = fillRule;
                    return;
                }
                return fillRule === undefined ? originalFill.call(this) : originalFill.call(this, fillRule);
            });
            this.resources.patch(prototype, 'restore', function () {
                paths.delete(this);
                return originalRestore.call(this);
            });
        }
    }
    class VisualController extends FeatureController {
        constructor(app, name) {
            super(app, name);
            this.assets = {
                map: { source: null, image: null, loading: false },
                virus: { source: null, image: null, loading: false },
                skin: { source: null, image: null, loading: false },
            };
            this.mapPatterns = new WeakMap();
            this.loadingPlaceholder = null;
            this.fontFamily = null;
            this.fontLink = null;
            this.fontCache = new Map();
            this.renderConfig = null;
            this.lastNativeScoreSampleAt = 0;
            this.lastNativePositionSampleAt = 0;
            this.sigFixCellDisplays = new Map();
            this.sigFixCellMaps = new WeakSet();
            this.sigFixSkinRenders = new WeakSet();
        }
        async mount() {
            this.syncAssets();
            this.ensureFont();
            this.refreshRenderConfig();
            this.mountGameVisibility();
            this.resources.add(() => {
                for (const [cell, raw] of this.sigFixCellDisplays) {
                    Object.defineProperty(cell, 'name', {
                        configurable: true,
                        enumerable: true,
                        writable: true,
                        value: raw.name(),
                    });
                    Object.defineProperty(cell, 'skin', {
                        configurable: true,
                        enumerable: true,
                        writable: true,
                        value: raw.skin(),
                    });
                }
                this.sigFixCellDisplays.clear();
            });
            this.resources.listen(document, 'sigmod:settingchange', () => {
                this.syncAssets();
                this.ensureFont();
                this.refreshRenderConfig();
            });
            const nickname = this.app.dom?.nickname ?? document.querySelector(SELECTORS.nickname);
            if (nickname instanceof HTMLInputElement) {
                const updateNickname = () => {
                    this.app.state.nickname = nickname.value.trim() || 'Guest';
                    const welcome = document.querySelector('#welcomeUser');
                    if (welcome instanceof HTMLElement) {
                        welcome.textContent = `Welcome ${this.app.state.nickname}, to the SigMod Client!`;
                    }
                };
                updateNickname();
                this.resources.listen(nickname, 'input', updateNickname);
            }
            this.resources.listen(window, 'resize', () => {
                this.mapPatterns = new WeakMap();
            });
            this.resources.timeout(() => {
                const showPosition = document.querySelector('#showPosition');
                if (showPosition instanceof HTMLInputElement && !showPosition.checked) showPosition.click();
            }, 1_000);
            this.resources.add(() => this.clearAssets());
        }
        refreshRenderConfig() {
            const game = this.app.settings.game;
            const virusImage = typeof game.virusImage === 'string' ? game.virusImage.trim() : '';
            const skins = game.skins || {};
            const name = game.name || {};
            this.renderConfig = {
                mapImage: typeof game.map?.image === 'string' ? game.map.image.trim() : '',
                mapColor: game.map?.color || '#111111',
                virusImage,
                virusIsNativeDefault: virusImage === DEFAULT_SETTINGS.game.virusImage,
                skinOriginal: typeof skins.original === 'string' ? skins.original.trim() : '',
                skinReplacement: typeof skins.replacement === 'string' ? skins.replacement.trim() : '',
                cellColor: game.cellColor || '',
                foodColor: game.foodColor || '',
                borderColor: game.borderColor || '',
                shortenNames: Boolean(game.shortenNames),
                removeOutlines: Boolean(game.removeOutlines),
                nameColor: name.color || '',
                nameGradient: Boolean(name.gradient?.enabled),
            };
        }
        /** Render-only compatibility hooks; never remove pellets from the world. */
        mountGameVisibility() {
            let hookedGl = null;
            const hiddenBoards = new Map();
            const hiddenLeaderboardNames = new Map();
            const sync = () => {
                const api = window.sigfix;
                if (api?.world?.cells instanceof Map) this.syncSigFixCellDisplays(api);
                const gl = api?.ui?.game?.gl;
                if (gl && gl !== hookedGl) {
                    hookedGl = gl;
                    let vao = null;
                    let arrayBuffer = null;
                    const bindVao = gl.bindVertexArray;
                    const bindBuffer = gl.bindBuffer;
                    const draw = gl.drawArraysInstanced;
                    const upload = gl.bufferSubData;
                    this.resources.patch(gl, 'bindVertexArray', function (value) {
                        vao = value;
                        return bindVao.call(this, value);
                    });
                    this.resources.patch(gl, 'bindBuffer', function (target, value) {
                        if (target === gl.ARRAY_BUFFER) arrayBuffer = value;
                        return bindBuffer.call(this, target, value);
                    });
                    const app = this.app;
                    this.resources.patch(gl, 'drawArraysInstanced', function (mode, first, count, instanceCount) {
                        if (!app.settings.game.showFood && vao === api.glconf.circlePelletVao) return;
                        return draw.call(this, mode, first, count, instanceCount);
                    });
                    this.resources.patch(gl, 'bufferSubData', function (target, offset, data, srcOffset, length) {
                        if (
                            !app.settings.game.showFood &&
                            target === gl.ARRAY_BUFFER &&
                            offset === 0 &&
                            arrayBuffer === api.glconf.playerBuffer &&
                            data instanceof Float32Array
                        ) {
                            // SigFixes uploads eaten pellets first, in 17-float records.
                            let count = 0;
                            for (const pellet of api.world.pellets.values()) if (pellet.deadTo) count++;
                            if (count) {
                                const copy = data.slice();
                                for (let i = 0; i < count && i * 17 + 15 < copy.length; i++) copy[i * 17 + 15] = 0;
                                return srcOffset === undefined
                                    ? upload.call(this, target, offset, copy)
                                    : upload.call(this, target, offset, copy, srcOffset, length);
                            }
                        }
                        return srcOffset === undefined
                            ? upload.call(this, target, offset, data)
                            : upload.call(this, target, offset, data, srcOffset, length);
                    });
                }
                // SigFixes does not export its leaderboard container. Identify its
                // direct body child by the title and fixed top-right placement.
                if (api)
                    for (const node of document.body.children) {
                        if (
                            node instanceof HTMLElement &&
                            node.style.position === 'fixed' &&
                            node.style.top === '10px' &&
                            node.style.right === '10px' &&
                            node.firstElementChild?.textContent === 'Leaderboard'
                        ) {
                            const entries = api.world.views?.get(api.world.selected)?.leaderboard;
                            const lines = node.children[1]?.children;
                            if (Array.isArray(entries) && lines)
                                entries.forEach((entry, index) => {
                                    const line = lines[index];
                                    if (!(line instanceof HTMLElement)) return;
                                    const name = entry.name || 'An unnamed cell';
                                    const visible = `${entry.place ?? index + 1}. ${name}`;
                                    const hidden = `${entry.place ?? index + 1}. `;
                                    if (this.app.settings.game.hideOwnName && entry.me) {
                                        if (!hiddenLeaderboardNames.has(line)) hiddenLeaderboardNames.set(line, visible);
                                        if (line.textContent !== hidden) line.textContent = hidden;
                                    } else if (hiddenLeaderboardNames.has(line)) {
                                        if (line.textContent !== visible) line.textContent = visible;
                                        hiddenLeaderboardNames.delete(line);
                                    }
                                });
                            if (!this.app.settings.game.showLeaderboard) {
                                if (!hiddenBoards.has(node))
                                    hiddenBoards.set(node, [
                                        node.style.getPropertyValue('visibility'),
                                        node.style.getPropertyPriority('visibility'),
                                    ]);
                                node.style.setProperty('visibility', 'hidden', 'important');
                            } else if (hiddenBoards.has(node)) {
                                const [value, priority] = hiddenBoards.get(node);
                                node.style.setProperty('visibility', value, priority);
                                hiddenBoards.delete(node);
                            }
                        }
                    }
            };
            sync();
            this.resources.interval(sync, 250);
            this.resources.listen(document, 'sigmod:settingchange', sync);
            this.resources.add(() => {
                for (const [node, [value, priority]] of hiddenBoards) node.style.setProperty('visibility', value, priority);
                for (const [line, text] of hiddenLeaderboardNames)
                    if (line.isConnected && line.textContent !== text) line.textContent = text;
            });
        }
        syncSigFixCellDisplays(api) {
            const live = api.world.cells;
            this.syncSigFixSkinRender(api);
            if (!this.sigFixCellMaps.has(live)) {
                this.sigFixCellMaps.add(live);
                const set = live.set;
                const visual = this;
                this.resources.patch(live, 'set', function (id, cell) {
                    const result = set.apply(this, arguments);
                    if (visual.app.settings.game.hideOwnName || visual.app.settings.game.botSkinsOnly)
                        visual.installSigFixCellDisplay(api, cell);
                    return result;
                });
            }
            if (!this.app.settings.game.hideOwnName && !this.app.settings.game.botSkinsOnly) {
                for (const [cell, raw] of this.sigFixCellDisplays) {
                    Object.defineProperty(cell, 'name', {
                        configurable: true,
                        enumerable: true,
                        writable: true,
                        value: raw.name(),
                    });
                    Object.defineProperty(cell, 'skin', {
                        configurable: true,
                        enumerable: true,
                        writable: true,
                        value: raw.skin(),
                    });
                }
                this.sigFixCellDisplays.clear();
                return;
            }
            for (const [cell, raw] of this.sigFixCellDisplays) {
                if (live.get(cell.id) === cell) continue;
                Object.defineProperty(cell, 'name', {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: raw.name(),
                });
                Object.defineProperty(cell, 'skin', {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: raw.skin(),
                });
                this.sigFixCellDisplays.delete(cell);
            }
            for (const cell of live.values()) {
                this.installSigFixCellDisplay(api, cell);
            }
        }
        installSigFixCellDisplay(api, cell) {
            if (!cell || this.sigFixCellDisplays.has(cell)) return;
            let name = cell.name;
            let skin = cell.skin;
            this.sigFixCellDisplays.set(cell, {
                name: () => name,
                skin: () => skin,
            });
            Object.defineProperty(cell, 'name', {
                configurable: true,
                enumerable: true,
                get: () => (this.app.settings.game.hideOwnName && this.isOwnSigFixCell(api, cell.id, name) ? '' : name),
                set: (value) => {
                    name = value;
                },
            });
            Object.defineProperty(cell, 'skin', {
                configurable: true,
                enumerable: true,
                get: () => {
                    if (!this.app.settings.game.botSkinsOnly || BOT_SKIN_NAMES.has(name)) return skin;
                    if (this.app.settings.game.showOwnSkinWithBots && this.isOwnSigFixCell(api, cell.id, name)) return skin;
                    return '';
                },
                set: (value) => {
                    skin = value;
                },
            });
        }
        isOwnSigFixCell(api, id, name) {
            for (const view of api.world.views?.values?.() ?? []) {
                if (view.owned?.has(id)) return true;
            }
            const inputs = api.input?.nick;
            const nicknames = Array.isArray(inputs) ? inputs : [document.querySelector(SELECTORS.nickname)];
            return nicknames.some((input) => {
                const nickname = input instanceof HTMLInputElement ? input.value.replace(/^\{.*?\}/, '') : '';
                return Boolean(nickname && nickname === name);
            });
        }
        syncSigFixSkinRender(api) {
            const render = api.render;
            if (!render || this.sigFixSkinRenders.has(render)) return;
            this.sigFixSkinRenders.add(render);
            const localImage = render.localImage;
            const externalImage = render.externalImage;
            const visual = this;
            if (typeof localImage === 'function')
                this.resources.patch(render, 'localImage', function (key) {
                    if (
                        visual.app.settings.game.botSkinsOnly &&
                        !visual.app.settings.game.showOwnSkinWithBots &&
                        (key === 'selfSkin' || key === 'selfSkinMulti')
                    )
                        return undefined;
                    return localImage.apply(this, arguments);
                });
            if (typeof externalImage === 'function')
                this.resources.patch(render, 'externalImage', function (source) {
                    if (
                        visual.app.settings.game.botSkinsOnly &&
                        !visual.app.settings.game.showOwnSkinWithBots &&
                        source &&
                        (source === api.settings?.selfSkin || source === api.settings?.selfSkinMulti)
                    )
                        return undefined;
                    return externalImage.apply(this, arguments);
                });
        }
        renderNativeLeaderboardName(text, isLeaderboard) {
            if (!isLeaderboard || !this.app.settings.game.hideOwnName) return text;
            const match = String(text).match(/^(\d+\.\s*)(.*)$/);
            return match && this.isOwnName(match[2]) ? match[1] : text;
        }
        syncAssets() {
            this.ensureAsset('map', this.app.settings.game.map.image);
            const virusImage =
                this.app.settings.game.virusImage === DEFAULT_SETTINGS.game.virusImage ? '' : this.app.settings.game.virusImage;
            this.ensureAsset('virus', virusImage);
            this.ensureAsset('skin', this.app.settings.game.skins.replacement);
        }
        /** @param {'map'|'virus'|'skin'} kind @param {unknown} source */
        ensureAsset(kind, source) {
            const normalized = typeof source === 'string' ? source.trim() : '';
            const asset = this.assets[kind];
            if (asset.source === normalized) return asset.image;
            asset.source = normalized;
            asset.image = null;
            asset.loading = false;
            if (kind === 'map') this.mapPatterns = new WeakMap();
            if (!normalized) return null;
            const image = new Image();
            const expectedSource = normalized;
            asset.loading = true;
            image.crossOrigin = 'anonymous';
            image.onload = () => {
                if (this.resources.disposed || asset.source !== expectedSource) return;
                const finish = () => {
                    asset.image = image;
                    asset.loading = false;
                    if (kind === 'map') this.mapPatterns = new WeakMap();
                };
                if (kind !== 'map') {
                    finish();
                    return;
                }
                this.isImageOpaque(image).then((opaque) => {
                    if (this.resources.disposed || asset.source !== expectedSource) return;
                    if (opaque) {
                        finish();
                    } else {
                        this.app.logger.warnOnce(
                            `visual-map-opacity-${expectedSource}`,
                            'Map image contains transparency and will be ignored'
                        );
                        asset.image = null;
                        asset.loading = false;
                        this.mapPatterns = new WeakMap();
                    }
                });
            };
            image.onerror = () => {
                if (asset.source !== expectedSource) return;
                asset.loading = false;
                this.app.logger.warnOnce(`visual-${kind}-${expectedSource}`, `Unable to load ${kind} image`);
            };
            image.src = normalized;
            this.resources.add(() => {
                image.onload = null;
                image.onerror = null;
            });
            return null;
        }
        /** @param {HTMLImageElement} image @returns {Promise<boolean>} */
        isImageOpaque(image) {
            return new Promise((resolve) => {
                try {
                    const maxPixels = 4_000_000;
                    const sourcePixels = image.width * image.height;
                    const scale = sourcePixels > maxPixels ? Math.sqrt(maxPixels / sourcePixels) : 1;
                    const width = Math.max(1, Math.round(image.width * scale));
                    const height = Math.max(1, Math.round(image.height * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const context = canvas.getContext('2d');
                    if (!context) {
                        resolve(true);
                        return;
                    }
                    context.drawImage(image, 0, 0, width, height);
                    const { data } = context.getImageData(0, 0, width, height);
                    for (let index = 3; index < data.length; index += 4) {
                        if (data[index] < 255) {
                            resolve(false);
                            return;
                        }
                    }
                    resolve(true);
                } catch {
                    resolve(true);
                }
            });
        }
        clearAssets() {
            for (const asset of Object.values(this.assets)) {
                asset.image = null;
                asset.loading = false;
            }
            this.mapPatterns = new WeakMap();
            this.fontCache.clear();
            this.fontLink?.remove();
            this.fontLink = null;
        }
        ensureFont() {
            const family = String(this.app.settings.game.font || 'Ubuntu').trim() || 'Ubuntu';
            if (family === this.fontFamily) return family;
            this.fontFamily = family;
            this.fontCache.clear();
            this.fontLink?.remove();
            this.fontLink = null;
            if (family === 'Ubuntu') return family;
            const link = createElement('link', {
                attributes: {
                    rel: 'stylesheet',
                    href: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`,
                },
            });
            document.head.append(link);
            this.fontLink = link;
            return family;
        }
        /** @param {HTMLCanvasElement} canvas */
        isBackgroundRect(canvas, x, y, width, height) {
            if (Math.abs(Number(x)) > 1 || Math.abs(Number(y)) > 1) return false;
            const widths = [canvas.width, canvas.clientWidth, window.innerWidth].filter((value) => value > 0);
            const heights = [canvas.height, canvas.clientHeight, window.innerHeight].filter((value) => value > 0);
            return (
                widths.some((value) => Math.abs(Number(width) - value) <= 2) &&
                heights.some((value) => Math.abs(Number(height) - value) <= 2)
            );
        }
        /** @param {CanvasRenderingContext2D} context */
        getMapFill(context) {
            const config = this.renderConfig || {};
            const source = config.mapImage || '';
            const image = this.ensureAsset('map', source);
            if (image) {
                let pattern = this.mapPatterns.get(context);
                if (!pattern) {
                    pattern = context.createPattern(image, 'no-repeat');
                    if (pattern) this.mapPatterns.set(context, pattern);
                }
                if (pattern) return pattern;
            }
            return config.mapColor || '#111111';
        }
        /** @param {CanvasRenderingContext2D} context @param {number} radius */
        applyCellColor(context, radius) {
            const config = this.renderConfig || {};
            if (!config.cellColor && !config.foodColor) return;
            const numericRadius = Number(radius);
            if (numericRadius >= 86 && config.cellColor) {
                context.fillStyle = config.cellColor;
            } else if (numericRadius <= 20 && config.foodColor) {
                context.fillStyle = config.foodColor;
                context.strokeStyle = config.foodColor;
            }
        }
        /** @param {CanvasRenderingContext2D} context */
        applyBorderColor(context) {
            const color = this.renderConfig?.borderColor || '';
            if (!color || Number(context.lineWidth) < 15) return;
            const current = String(context.strokeStyle).replace(/\s/g, '').toLowerCase();
            if (current === '#0000ff' || current === 'rgb(0,0,255)' || current === 'rgba(0,0,255,1)') {
                context.strokeStyle = color;
            }
        }
        /**
         * @param {CanvasRenderingContext2D} context
         * @param {unknown} text
         * @param {number} x
         * @param {number} y
         * @param {boolean} outline
         */
        applyTextStyle(context, text, x, y, outline) {
            this.applyFont(context);
            const config = this.renderConfig || {};
            const value = String(text);
            const friendSettings = this.app.state.friends.settings;
            const highlightFriends =
                this.app.state.friends.names.size > 0 && friendSettings.highlight_friends && friendSettings.highlight_color;
            if (this.isOwnName(value)) {
                if (config.nameGradient) {
                    const width = context.measureText(value).width;
                    const gradient = context.createLinearGradient(x - width / 2 + 4, y, x + width / 2 - 4, y + 8);
                    gradient.addColorStop(0, this.app.settings.game.name.gradient.left || '#ffffff');
                    gradient.addColorStop(1, this.app.settings.game.name.gradient.right || '#ffffff');
                    context.fillStyle = gradient;
                } else if (config.nameColor) {
                    context.fillStyle = config.nameColor;
                }
            }
            if (highlightFriends) {
                const leaderboardName = value.match(/^\d+\.\s*(.+)$/)?.[1];
                if (leaderboardName && this.app.state.friends.names.has(leaderboardName))
                    context.fillStyle = friendSettings.highlight_color;
            }
            if (this.app.host.adapter?.kind === 'native' && /^X:\s*/.test(value)) {
                context.fillStyle = 'transparent';
            }
            if (config.removeOutlines) {
                context.shadowBlur = 0;
                context.shadowColor = 'transparent';
            } else if (outline) {
                context.shadowBlur = 7;
                context.shadowColor = '#000';
            }
        }
        /** @param {CanvasRenderingContext2D} context */
        applyFont(context) {
            const family = this.ensureFont();
            const current = String(context.font);
            let replacement = this.fontCache.get(current);
            if (!replacement) {
                const escaped = family.replace(/["\\]/g, '\\$&');
                const match = current.match(/^(.*?\b\d+(?:\.\d+)?(?:px|pt|em|rem))\s+.+$/i);
                replacement = match ? `${match[1]} "${escaped}"` : `10px "${escaped}"`;
                this.fontCache.set(current, replacement);
            }
            if (current !== replacement) context.font = replacement;
        }
        /** @param {unknown} text */
        renderedText(text) {
            if (this.app.settings.game.hideOwnName && this.isOwnName(String(text))) return '';
            if (!this.renderConfig?.shortenNames) return text;
            const value = String(text);
            return value.length > 18 ? `${value.slice(0, 18)}...` : text;
        }
        /** @param {string} text */
        isOwnName(text) {
            const nickname = this.app.dom?.nickname ?? document.querySelector(SELECTORS.nickname);
            const playedName = nickname instanceof HTMLInputElement ? nickname.value.trim() : '';
            return Boolean(playedName && text === playedName);
        }
        /** @param {unknown} text */
        observeNativeText(text) {
            if (this.app.host.adapter?.kind !== 'native') return;
            const value = String(text);
            const now = performance.now();
            const scoreMatch =
                value.startsWith('Score:') && now - this.lastNativeScoreSampleAt >= 100 ? value.match(/^Score:\s*([\d,.]+)/i) : null;
            if (scoreMatch) {
                this.lastNativeScoreSampleAt = now;
                const score = Number(scoreMatch[1].replace(/,/g, ''));
                if (Number.isFinite(score)) {
                    this.app.state.player.score = score;
                    this.app.state.player.alive = true;
                }
                return;
            }
            const positionMatch =
                value.startsWith('X:') && now - this.lastNativePositionSampleAt >= 100
                    ? value.match(/^X:\s*(-?\d+(?:\.\d+)?),\s*Y:\s*(-?\d+(?:\.\d+)?)/i)
                    : null;
            if (!positionMatch) return;
            this.lastNativePositionSampleAt = now;
            const x = Number(positionMatch[1]);
            const y = Number(positionMatch[2]);
            if (Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0)) {
                this.app.state.player.position = { x, y };
            }
        }
        getLoadingPlaceholder() {
            if (!this.loadingPlaceholder) {
                const canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                this.loadingPlaceholder = canvas;
            }
            return this.loadingPlaceholder;
        }
        /** @param {CanvasImageSource} image @returns {CanvasImageSource|null} */
        getReplacementImage(image) {
            const source = typeof image?.src === 'string' ? image.src : '';
            if (!source) return null;
            const config = this.renderConfig || {};
            if (config.virusImage && !config.virusIsNativeDefault && /(?:^|\/)(?:2|2-min)\.png(?:[?#]|$)/i.test(source)) {
                const asset = this.ensureAsset('virus', config.virusImage);
                if (asset.image) return asset.image;
                if (asset.loading) return this.getLoadingPlaceholder();
                return null;
            }
            if (config.skinOriginal && config.skinReplacement && source.includes(`${config.skinOriginal}.png`)) {
                const asset = this.ensureAsset('skin', config.skinReplacement);
                if (asset.image) return asset.image;
                if (asset.loading) return this.getLoadingPlaceholder();
                return null;
            }
            return null;
        }
    }
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // ~ Authentication and game chat                                                      ~
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~