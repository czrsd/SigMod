// https://greasyfork.org/en/scripts/483587-sigmally-fixes-v2

// ==UserScript==
// @name         Sigmally Fixes V2
// @version      2.5.3
// @description  Easily 10X your FPS on Sigmally.com + many bug fixes + great for multiboxing + supports SigMod
// @author       8y8x
// @match        https://*.sigmally.com/*
// @license      MIT
// @grant        none
// @namespace    https://8y8x.dev/sigmally-fixes
// @icon         https://raw.githubusercontent.com/8y8x/sigmally-fixes/refs/heads/main/icon.png
// @compatible   chrome Recommended for all users, works perfectly out of the box
// @compatible   opera Works fine, multiboxers may need to change some browser keybinds
// @compatible   edge Works fine, multiboxers may need to change some browser keybinds
// ==/UserScript==

// @ts-check
/* eslint
	camelcase: 'error',
	comma-dangle: ['error', 'always-multiline'],
	indent: ['error', 'tab', { SwitchCase: 1 }],
	max-len: ['error', { code: 120 }],
	no-console: ['error', { allow: ['warn', 'error'] }],
	no-trailing-spaces: 'error',
	quotes: ['error', 'single'],
	semi: 'error',
*/ // a light eslint configuration that doesn't compromise code quality
"use strict";

(async () => {
  const sfVersion = "2.5.3";
  const undefined = void 0; // yes, this actually makes a significant difference

  ////////////////////////////////
  // Define Auxiliary Functions //
  ////////////////////////////////
  const aux = (() => {
    const aux = {};

    /** @type {Map<string, string>} */
    aux.clans = new Map();
    function fetchClans() {
      fetch("https://sigmally.com/api/clans")
        .then((r) => r.json())
        .then((r) => {
          if (r.status !== "success") {
            setTimeout(() => fetchClans(), 10_000);
            return;
          }

          aux.clans.clear();
          r.data.forEach((clan) => {
            if (typeof clan._id !== "string" || typeof clan.name !== "string")
              return;
            aux.clans.set(clan._id, clan.name);
          });

          // does not need to be updated often, but just enough so people who leave their tab open don't miss out
          setTimeout(() => fetchClans(), 600_000);
        })
        .catch((err) => {
          console.warn("Error while fetching clans:", err);
          setTimeout(() => fetchClans(), 10_000);
        });
    }
    fetchClans();

    /**
     * @template T
     * @param {T} x
     * @param {string} err should be readable and easily translatable
     * @returns {T extends (null | undefined | false | 0) ? never : T}
     */
    aux.require = (x, err) => {
      if (!x) {
        err = "[Sigmally Fixes]: " + err;
        prompt(err, err); // use prompt, so people can paste the error message into google translate
        throw err;
      }

      return /** @type {any} */ (x);
    };

    /**
     * consistent exponential easing relative to 60fps.
     * for example, with a factor of 2, o=0, n=1:
     * - at 60fps, 0.5 is returned.
     * - at 30fps (after 2 frames), 0.75 is returned.
     * - at 15fps (after 4 frames), 0.875 is returned.
     * - at 120fps, 0.292893 is returned. if you called this again with o=0.292893, n=1, you would get 0.5.
     *
     * @param {number} o
     * @param {number} n
     * @param {number} factor
     * @param {number} dt in seconds
     */
    aux.exponentialEase = (o, n, factor, dt) => {
      return o + (n - o) * (1 - (1 - 1 / factor) ** (60 * dt));
    };

    /**
     * @param {string} hex
     * @returns {[number, number, number, number]}
     */
    aux.hex2rgba = (hex) => {
      switch (hex.length) {
        case 4: // #rgb
        case 5: // #rgba
          return [
            (parseInt(hex[1], 16) || 0) / 15,
            (parseInt(hex[2], 16) || 0) / 15,
            (parseInt(hex[3], 16) || 0) / 15,
            hex.length === 5 ? (parseInt(hex[4], 16) || 0) / 15 : 1,
          ];
        case 7: // #rrggbb
        case 9: // #rrggbbaa
          return [
            (parseInt(hex.slice(1, 3), 16) || 0) / 255,
            (parseInt(hex.slice(3, 5), 16) || 0) / 255,
            (parseInt(hex.slice(5, 7), 16) || 0) / 255,
            hex.length === 9 ? (parseInt(hex.slice(7, 9), 16) || 0) / 255 : 1,
          ];
        default:
          return [1, 1, 1, 1];
      }
    };

    /**
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @param {number} a
     */
    aux.rgba2hex = (r, g, b, a) => {
      return [
        "#",
        Math.floor(r * 255)
          .toString(16)
          .padStart(2, "0"),
        Math.floor(g * 255)
          .toString(16)
          .padStart(2, "0"),
        Math.floor(b * 255)
          .toString(16)
          .padStart(2, "0"),
        Math.floor(a * 255)
          .toString(16)
          .padStart(2, "0"),
      ].join("");
    };

    // i don't feel like making an awkward adjustment to aux.rgba2hex
    /**
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @param {any} _a
     */
    aux.rgba2hex6 = (r, g, b, _a) => {
      return [
        "#",
        Math.floor(r * 255)
          .toString(16)
          .padStart(2, "0"),
        Math.floor(g * 255)
          .toString(16)
          .padStart(2, "0"),
        Math.floor(b * 255)
          .toString(16)
          .padStart(2, "0"),
      ].join("");
    };

    /** @param {string} name */
    aux.parseName = (name) => name.match(/^\{.*?\}(.*)$/)?.[1] ?? name;

    /** @param {string} skin */
    aux.parseSkin = (skin) => {
      if (!skin) return skin;
      skin = skin.replace("1%", "").replace("2%", "").replace("3%", "");
      return "/static/skins/" + skin + ".png";
    };

    /**
     * @param {DataView} dat
     * @param {number} o
     * @returns {[string, number]}
     */
    aux.readZTString = (dat, o) => {
      if (dat.getUint8(o) === 0) return ["", o + 1]; // quick return for empty strings (there are a lot)
      const startOff = o;
      for (; o < dat.byteLength; ++o) {
        if (dat.getUint8(o) === 0) break;
      }

      return [
        aux.textDecoder.decode(
          new DataView(dat.buffer, startOff, o - startOff),
        ),
        o + 1,
      ];
    };

    /**
     * @param {string} selector
     * @param {boolean} value
     */
    aux.setting = (selector, value) => {
      /** @type {HTMLInputElement | null} */
      const el = document.querySelector(selector);
      return el ? el.checked : value;
    };

    /** @param {boolean} accessSigmod */
    const settings = (accessSigmod) => {
      try {
        // current skin is saved in localStorage
        aux.settings = JSON.parse(localStorage.getItem("settings") ?? "");
      } catch (_) {
        aux.settings = /** @type {any} */ ({});
      }

      // sigmod doesn't have a checkbox for dark theme, so we infer it from the custom map color
      const { mapColor } = accessSigmod ? sigmod.settings : {};
      if (mapColor) {
        aux.settings.darkTheme = mapColor
          ? mapColor[0] < 0.6 && mapColor[1] < 0.6 && mapColor[2] < 0.6
          : true;
      } else {
        aux.settings.darkTheme = aux.setting("input#darkTheme", true);
      }
      aux.settings.jellyPhysics = aux.setting("input#jellyPhysics", false);
      aux.settings.showBorder = aux.setting("input#showBorder", true);
      aux.settings.showClanmates = aux.setting("input#showClanmates", true);
      aux.settings.showGrid = aux.setting("input#showGrid", true);
      aux.settings.showMass = aux.setting("input#showMass", false);
      aux.settings.showMinimap = aux.setting("input#showMinimap", true);
      aux.settings.showSkins = aux.setting("input#showSkins", true);
      aux.settings.zoomout = aux.setting("input#moreZoom", true);
      return aux.settings;
    };

    /** @type {{ darkTheme: boolean, jellyPhysics: boolean, showBorder: boolean, showClanmates: boolean,
         showGrid: boolean, showMass: boolean, showMinimap: boolean, showSkins: boolean, zoomout: boolean,
         gamemode: any, skin: any }} */
    aux.settings = settings(false);
    setInterval(() => settings(true), 250);
    // apply saved gamemode because sigmally fixes connects before the main game even loads
    if (aux.settings?.gamemode) {
      /** @type {HTMLSelectElement | null} */
      const gamemode = document.querySelector("select#gamemode");
      if (gamemode) gamemode.value = aux.settings.gamemode;
    }

    let caught = false;
    const tabScan = new BroadcastChannel("sigfix-tabscan");
    tabScan.addEventListener("message", () => {
      if (caught || world.score(world.selected) <= 50) return;
      caught = true;
      const str =
        "hi! sigmally fixes v2.5.0 is now truly one-tab, so you don't need multiple tabs anymore. " +
        'set a keybind under the "One-tab multibox key" setting and enjoy!';
      prompt(str, str);
    });
    setInterval(() => {
      if (world.score(world.selected) > 50 && !caught)
        tabScan.postMessage(undefined);
    }, 5000);

    aux.textEncoder = new TextEncoder();
    aux.textDecoder = new TextDecoder();

    const trimCtx = aux.require(
      document.createElement("canvas").getContext("2d"),
      "Unable to get 2D context for text utilities. This is probably your browser being dumb, maybe reload " +
        "the page?",
    );
    trimCtx.font = "20px Ubuntu";
    /**
     * trims text to a max of 250px at 20px font, same as vanilla sigmally
     * @param {string} text
     */
    aux.trim = (text) => {
      while (trimCtx.measureText(text).width > 250) text = text.slice(0, -1);

      return text;
    };

    /** @type {{ token: string, updated: number } | undefined} */
    aux.token = undefined;

    /** @type {object | undefined} */
    aux.userData = undefined;
    aux.oldFetch = fetch.bind(window);
    let lastUserData = -Infinity;
    // this is the best method i've found to get the userData object, since game.js uses strict mode
    Object.defineProperty(window, "fetch", {
      value: new Proxy(fetch, {
        apply: (target, thisArg, args) => {
          let url = args[0];
          const data = args[1];
          if (typeof url === "string") {
            if (url.includes("/server/recaptcha/v3"))
              return new Promise(() => {}); // block game.js from attempting to go through captcha flow

            // game.js doesn't think we're connected to a server, we default to eu0 because that's the
            // default everywhere else
            if (url.includes("/userdata/")) {
              // when holding down the respawn key, you can easily make 30+ requests a second,
              // bombing you into ratelimit hell
              const now = performance.now();
              if (now - lastUserData < 500) return new Promise(() => {});
              url = url.replace("///", "//eu0.sigmally.com/server/");
              lastUserData = now;
            }

            // patch the current token in the url and body of the request
            if (aux.token) {
              // 128 hex characters surrounded by non-hex characters (lookahead and lookbehind)
              const tokenTest =
                /(?<![0-9a-fA-F])[0-9a-fA-F]{128}(?![0-9a-fA-F])/g;
              url = url.replaceAll(tokenTest, aux.token.token);
              if (typeof data?.body === "string")
                data.body = data.body.replaceAll(tokenTest, aux.token.token);
            }

            args[0] = url;
            args[1] = data;
          }

          return target.apply(thisArg, args).then(
            (res) =>
              new Proxy(res, {
                get: (target, prop, _receiver) => {
                  if (prop !== "json") {
                    const val = target[prop];
                    if (typeof val === "function") return val.bind(target);
                    else return val;
                  }

                  return () =>
                    target.json().then((obj) => {
                      if (obj?.body?.user) {
                        aux.userData = obj.body.user;
                        // NaN if invalid / undefined
                        let updated = Number(new Date(aux.userData.updateTime));
                        if (Number.isNaN(updated)) updated = Date.now();

                        if (!aux.token || updated >= aux.token.updated) {
                          aux.token = { token: aux.userData.token, updated };
                        }
                      }

                      return obj;
                    });
                },
              }),
          );
        },
      }),
    });

    return aux;
  })();

  ////////////////////////
  // Destroy Old Client //
  ////////////////////////
  const destructor = (() => {
    const destructor = {};
    // #1 : kill the rendering process
    const oldRQA = requestAnimationFrame;
    window.requestAnimationFrame = function (fn) {
      try {
        throw new Error();
      } catch (err) {
        // prevent drawing the game, but do NOT prevent saving settings (which is called on RQA)
        if (!err.stack.includes("/game.js") || err.stack.includes("HTML"))
          return oldRQA(fn);
      }

      return -1;
    };

    // #2 : kill access to using a WebSocket
    destructor.realWebSocket = WebSocket;
    Object.defineProperty(window, "WebSocket", {
      value: new Proxy(WebSocket, {
        construct(_target, argArray, _newTarget) {
          if (argArray[0]?.includes("sigmally.com")) {
            throw new Error("Nope :) - hooked by Sigmally Fixes");
          }

          // @ts-expect-error
          return new destructor.realWebSocket(...argArray);
        },
      }),
    });

    const cmdRepresentation = new TextEncoder()
      .encode("/leaveworld")
      .toString();
    /** @type {WeakSet<WebSocket>} */
    destructor.safeWebSockets = new WeakSet();
    destructor.realWsSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (x) {
      if (
        !destructor.safeWebSockets.has(this) &&
        this.url.includes("sigmally.com")
      ) {
        this.onclose = null;
        this.close();
        throw new Error("Nope :) - hooked by Sigmally Fixes");
      }

      if (settings.blockNearbyRespawns) {
        let buf;
        if (x instanceof ArrayBuffer) buf = x;
        else if (x instanceof DataView) buf = x.buffer;
        else if (x instanceof Uint8Array) buf = x.buffer;

        if (
          buf &&
          buf.byteLength === "/leaveworld".length + 3 &&
          new Uint8Array(buf).toString().includes(cmdRepresentation)
        ) {
          let con, view, vision; // cba to put explicit types here
          for (const [otherView, otherCon] of net.connections) {
            if (otherCon.ws === this) {
              con = otherCon;
              view = otherView;
              vision = world.views.get(otherView);
              break;
            }
          }
          if (con && view !== undefined && vision) {
            // block respawns if we haven't actually respawned yet
            // (with a 500ms max in case something fails)
            if (
              performance.now() - (con.respawnBlock?.started ?? -Infinity) <
              500
            )
              return;
            con.respawnBlock = undefined;
            // trying to respawn; see if we are nearby an alive multi-tab
            if (world.score(view) > 0 && vision.border) {
              const { border } = vision;
              // use a smaller respawn radius on EU servers
              const radius =
                Math.min(border.r - border.l, border.b - border.t) / 5;
              for (const [otherView, otherVision] of world.views) {
                if (vision === otherVision) continue;
                if (world.score(otherView) <= 0) continue;
                const dx = vision.camera.tx - otherVision.camera.tx;
                const dy = vision.camera.ty - otherVision.camera.ty;
                if (Math.hypot(dx, dy) <= radius) return;
              }
            }

            // we are allowing a respawn, take note
            con.respawnBlock = {
              status: "pending",
              started: performance.now(),
            };
          }
        }
      }

      return destructor.realWsSend.apply(this, arguments);
    };

    // #3 : prevent keys from being registered by the game
    setInterval(() => (onkeydown = onkeyup = null), 200);

    return destructor;
  })();

  //////////////////////////////////
  // Apply Complex SigMod Patches //
  //////////////////////////////////
  const sigmod = (() => {
    const sigmod = {};

    /** @type {{
     * 	cellColor?: [number, number, number, number],
     * 	foodColor?: [number, number, number, number],
     * 	mapColor?: [number, number, number, number],
     * 	outlineColor?: [number, number, number, number],
     * 	nameColor1?: [number, number, number, number],
     * 	nameColor2?: [number, number, number, number],
     * 	hidePellets?: boolean,
     * 	rapidFeedKey?: string,
     * 	removeOutlines?: boolean,
     * 	showNames?: boolean,
     * 	skinReplacement?: { original: string | null, replacement?: string | null, replaceImg?: string | null },
     * 	tripleKey?: string,
     * 	virusImage?: string,
     * }} */
    sigmod.settings = {};
    setInterval(() => {
      // @ts-expect-error
      const real = window.sigmod?.settings;
      if (!real) return;
      /**
       * @param {'cellColor' | 'foodColor' | 'mapColor' | 'outlineColor' | 'nameColor1' | 'nameColor2'} prop
       * @param {any[]} lookups
       */
      const applyColor = (prop, lookups) => {
        for (const lookup of lookups) {
          if (lookup) {
            sigmod.settings[prop] = aux.hex2rgba(lookup);
            return;
          }
        }
      };
      applyColor("cellColor", [real.game?.cellColor]);
      applyColor("foodColor", [real.game?.foodColor]);
      applyColor("mapColor", [real.game?.map?.color, real.mapColor]);
      // sigmod treats the map border as cell borders for some reason
      if (
        !["#00f", "#00f0", "#0000ff", "#000000ffff"].includes(
          real.game?.borderColor,
        )
      )
        applyColor("outlineColor", [real.game?.borderColor]);
      // note: singular nameColor takes priority
      applyColor("nameColor1", [
        real.game?.name?.color,
        real.game?.name?.gradient?.enabled && real.game.name.gradient.left,
      ]);
      applyColor("nameColor2", [
        real.game?.name?.color,
        real.game?.name?.gradient?.enabled && real.game.name.gradient.right,
      ]);
      // v10 does not have a 'hide food' setting; check food's transparency
      sigmod.settings.hidePellets = real.settings.foodColor?.[3] === 0;
      sigmod.settings.removeOutlines = real.game?.removeOutlines;
      sigmod.settings.skinReplacement = real.game?.skins;
      sigmod.settings.virusImage = real.game?.virusImage;
      sigmod.settings.rapidFeedKey = real.macros?.keys?.rapidFeed;
      // sigmod's showNames setting is always "true" interally (i think??)
      sigmod.settings.showNames = aux.setting("input#showNames", true);

      sigmod.settings.tripleKey =
        real.macros?.keys?.splits?.triple || undefined; // blank keys are ''
    }, 200);

    // patch sigmod when it's ready; typically sigmod loads first, but i can't guarantee that
    sigmod.proxy = {};
    let patchInterval;
    patchInterval = setInterval(() => {
      const real = /** @type {any} */ (window).sigmod;
      if (!real) return;

      clearInterval(patchInterval);

      // anchor chat and minimap to the screen, so scrolling to zoom doesn't move them
      // it's possible that cursed will change something at any time so i'm being safe here
      const minimapContainer = /** @type {HTMLElement | null} */ (
        document.querySelector(".minimapContainer")
      );
      if (minimapContainer) minimapContainer.style.position = "fixed";

      const modChat = /** @type {HTMLElement | null} */ (
        document.querySelector(".modChat")
      );
      if (modChat) modChat.style.position = "fixed";

      // sigmod keeps track of the # of displayed messages with a counter, but it doesn't reset on clear
      // therefore, if the chat gets cleared with 200 (the maximum) messages in it, it will stay permanently*
      // blank
      const modMessages = /** @type {HTMLElement | null} */ (
        document.querySelector("#mod-messages")
      );
      if (modMessages) {
        const old = modMessages.removeChild;
        modMessages.removeChild = (node) => {
          if (modMessages.children.length > 200)
            return old.call(modMessages, node);
          else return node;
        };
      }

      // create a fake sigmally proxy for sigmod, which properly relays some packets (because SigMod does not
      // support one-tab technology). it should also fix chat bugs due to disconnects and stuff
      // we do this by hooking into the SigWsHandler object
      {
        /** @type {object | undefined} */
        let handler;
        const old = Function.prototype.bind;
        Function.prototype.bind = function (obj) {
          if (obj.constructor?.name === "SigWsHandler") handler = obj;
          return old.call(this, obj);
        };
        new destructor.realWebSocket("wss://255.255.255.255/sigmally.com");
        Function.prototype.bind = old;
        // handler is expected to be a "SigWsHandler", but it might be something totally different
        if (handler && "sendPacket" in handler && "handleMessage" in handler) {
          // first, set up the handshake (opcode not-really-a-shuffle)
          // handshake is reset to false on close (which may or may not happen immediately)
          Object.defineProperty(handler, "handshake", {
            get: () => true,
            set: () => {},
          });
          handler.R = handler.C = new Uint8Array(256); // R and C are linked
          for (let i = 0; i < 256; ++i) handler.C[i] = i;

          // expose some functions here, don't directly access the handler anywhere else
          sigmod.proxy = {
            /** @param {DataView} dat */
            handleMessage: (dat) => handler.handleMessage({ data: dat.buffer }),
            isPlaying: () =>
              /** @type {any} */ (window.gameSettings.isPlaying = true),
          };

          // override sendPacket to properly handle what sigmod expects
          /** @param {object} buf */
          handler.sendPacket = (buf) => {
            if ("build" in buf) buf = buf.build(); // convert sigmod/sigmally Writer class to a buffer
            if ("buffer" in buf) buf = buf.buffer;
            const dat = new DataView(/** @type {ArrayBuffer} */ (buf));
            switch (dat.getUint8(0)) {
              // case 0x00, sendPlay, isn't really used outside of secret tournaments
              case 0x10: {
                // used for linesplits and such
                net.move(
                  world.selected,
                  dat.getInt32(1, true),
                  dat.getInt32(5, true),
                );
                break;
              }
              // case 0x63, sendChat, already goes directly to sigfix.net.chat
              // case 0xdc, sendFakeCaptcha, is not used outside of secret tournaments
            }
          };
        }
      }
    }, 500);

    return sigmod;
  })();

  /////////////////////
  // Prepare Game UI //
  /////////////////////
  const ui = (() => {
    const ui = {};

    (() => {
      const title = document.querySelector("#title");
      if (!title) return;

      const watermark = document.createElement("span");
      watermark.innerHTML = `<a href="https://greasyfork.org/scripts/483587/versions" \
				target="_blank">Sigmally Fixes ${sfVersion}</a> by yx`;
      if (sfVersion.includes("BETA")) {
        watermark.innerHTML +=
          ' <br><a \
					href="https://raw.githubusercontent.com/8y8x/sigmally-fixes/refs/heads/main/sigmally-fixes.user.js"\
					target="_blank">[Update beta here]</a>';
      }
      title.insertAdjacentElement("afterend", watermark);

      // check if this version is problematic, don't do anything if this version is too new to be in versions.json
      // take care to ensure users can't be logged
      fetch(
        "https://raw.githubusercontent.com/8y8x/sigmally-fixes/main/versions.json",
      )
        .then((res) => res.json())
        .then((res) => {
          if (sfVersion in res && !res[sfVersion].ok && res[sfVersion].alert) {
            const color = res[sfVersion].color || "#f00";
            const box = document.createElement("div");
            box.style.cssText = `background: ${color}3; border: 1px solid ${color}; width: 100%; \
							height: fit-content; font-size: 1em; padding: 5px; margin: 5px 0; border-radius: 3px; \
							color: ${color}`;
            box.innerHTML = String(res[sfVersion].alert)
              .replace(/\<|\>/g, "") // never allow html tag injection
              .replace(
                /\{link\}/g,
                '<a href="https://greasyfork.org/scripts/483587">[click here]</a>',
              )
              .replace(
                /\{autolink\}/g,
                '<a href="\
								https://update.greasyfork.org/scripts/483587/Sigmally%20Fixes%20V2.user.js">\
								[click here]</a>',
              );

            watermark.insertAdjacentElement("afterend", box);
          }
        })
        .catch((err) =>
          console.warn("Failed to check Sigmally Fixes version:", err),
        );
    })();

    ui.game = (() => {
      const game = {};

      /** @type {HTMLCanvasElement | null} */
      const oldCanvas = document.querySelector("canvas#canvas");
      if (!oldCanvas) {
        throw "exiting script - no canvas found";
      }

      const newCanvas = document.createElement("canvas");
      newCanvas.id = "sf-canvas";
      newCanvas.style.cssText = `background: #003; width: 100vw; height: 100vh; position: fixed; top: 0; left: 0;
				z-index: 1;`;
      game.canvas = newCanvas;
      (document.querySelector("body div") ?? document.body).appendChild(
        newCanvas,
      );

      // leave the old canvas so the old client can actually run
      oldCanvas.style.display = "none";

      // forward macro inputs from the canvas to the old one - this is for sigmod mouse button controls
      newCanvas.addEventListener("mousedown", (e) =>
        oldCanvas.dispatchEvent(new MouseEvent("mousedown", e)),
      );
      newCanvas.addEventListener("mouseup", (e) =>
        oldCanvas.dispatchEvent(new MouseEvent("mouseup", e)),
      );
      // forward mouse movements from the old canvas to the window - this is for sigmod keybinds that move
      // the mouse
      oldCanvas.addEventListener("mousemove", (e) =>
        dispatchEvent(new MouseEvent("mousemove", e)),
      );

      const gl = aux.require(
        newCanvas.getContext("webgl2", { alpha: false, depth: false }),
        "Couldn't get WebGL2 context. Possible causes:\r\n" +
          "- Maybe GPU/Hardware acceleration needs to be enabled in your browser settings; \r\n" +
          "- Maybe your browser is just acting weird and it might fix itself after a restart; \r\n" +
          "- Maybe your GPU drivers are exceptionally old.",
      );

      game.gl = gl;

      // indicate that we will restore the context
      newCanvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault(); // signal that we want to restore the context
        // cleanup old caches (after render), as we can't do this within initWebGL()
        render.resetTextCache();
        render.resetTextureCache();
      });
      newCanvas.addEventListener("webglcontextrestored", () => glconf.init());

      function resize() {
        // devicePixelRatio does not have very high precision; it could be 0.800000011920929 for example
        newCanvas.width = Math.ceil(innerWidth * (devicePixelRatio - 0.0001));
        newCanvas.height = Math.ceil(innerHeight * (devicePixelRatio - 0.0001));
        game.gl.viewport(0, 0, newCanvas.width, newCanvas.height);
      }

      addEventListener("resize", resize);
      resize();

      return game;
    })();

    ui.stats = (() => {
      const container = document.createElement("div");
      container.style.cssText =
        "position: fixed; top: 10px; left: 10px; width: 400px; height: fit-content; \
				user-select: none; z-index: 2; transform-origin: top left;";
      document.body.appendChild(container);

      const score = document.createElement("div");
      score.style.cssText =
        "font-family: Ubuntu; font-size: 30px; color: #fff; line-height: 1.0;";
      container.appendChild(score);

      const measures = document.createElement("div");
      measures.style.cssText =
        "font-family: Ubuntu; font-size: 20px; color: #fff; line-height: 1.1;";
      container.appendChild(measures);

      const misc = document.createElement("div");
      // white-space: pre; allows using \r\n to insert line breaks
      misc.style.cssText =
        "font-family: Ubuntu; font-size: 14px; color: #fff; white-space: pre; \
				line-height: 1.1; opacity: 0.5;";
      container.appendChild(misc);

      /** @param {number} view */
      const update = (view) => {
        const color = aux.settings.darkTheme ? "#fff" : "#000";
        score.style.color = color;
        measures.style.color = color;
        misc.style.color = color;

        score.style.fontWeight = measures.style.fontWeight = settings.boldUi
          ? "bold"
          : "normal";
        measures.style.opacity = settings.showStats ? "1" : "0.5";
        misc.style.opacity = settings.showStats ? "0.5" : "0";

        const scoreVal = world.score(world.selected);
        const multiplier =
          typeof aux.userData?.boost === "number" &&
          aux.userData.boost > Date.now()
            ? 2
            : 1;
        if (scoreVal * multiplier > world.stats.highestScore)
          world.stats.highestScore = scoreVal * multiplier;
        let scoreHtml;
        if (scoreVal <= 0) scoreHtml = "";
        else if (settings.separateBoost) {
          scoreHtml = `Score: ${Math.floor(scoreVal)}`;
          if (multiplier > 1)
            scoreHtml += ` <span style="color: #fc6;">(X${multiplier})</span>`;
        } else {
          scoreHtml = "Score: " + Math.floor(scoreVal * multiplier);
        }
        score.innerHTML = scoreHtml;

        const con = net.connections.get(view);
        let measuresText = `${Math.floor(render.fps)} FPS`;
        if (con?.latency !== undefined) {
          const spectateCon = net.connections.get(world.viewId.spectate);
          if (settings.spectatorLatency && spectateCon?.latency !== undefined) {
            measuresText += ` ${Math.floor(con.latency)}ms (${Math.floor(spectateCon.latency)}ms) ping`;
          } else {
            measuresText += ` ${Math.floor(con.latency)}ms ping`;
          }
        }
        measures.textContent = measuresText;
      };

      /** @param {object | undefined} stats */
      const updateStats = (stats) => {
        if (!stats) {
          misc.textContent = "";
          return;
        }

        let uptime;
        if (stats.uptime < 60) {
          uptime = Math.floor(stats.uptime) + "s";
        } else {
          uptime = Math.floor((stats.uptime / 60) % 60) + "min";
          if (stats.uptime >= 60 * 60)
            uptime = Math.floor((stats.uptime / 60 / 60) % 24) + "hr " + uptime;
          if (stats.uptime >= 24 * 60 * 60)
            uptime =
              Math.floor((stats.uptime / 24 / 60 / 60) % 60) + "d " + uptime;
        }

        misc.textContent = [
          `${stats.name} (${stats.mode})`,
          `${stats.playersTotal} / ${stats.playersLimit} players`,
          `${stats.playersAlive} playing`,
          `${stats.playersSpect} spectating`,
          `${(stats.update * 2.5).toFixed(1)}% load @ ${uptime}`,
        ].join("\r\n");
      };

      /** @type {object | undefined} */
      let lastStats;
      setInterval(() => {
        // update as frequently as possible
        const currentStats = world.views.get(world.selected)?.stats;
        if (currentStats !== lastStats) updateStats((lastStats = currentStats));
      });

      return { update };
    })();

    ui.leaderboard = (() => {
      const container = document.createElement("div");
      container.style.cssText =
        "position: fixed; top: 10px; right: 10px; width: 200px; height: fit-content; \
				user-select: none; z-index: 2; background: #0006; padding: 15px 5px; transform-origin: top right; \
				display: none;";
      document.body.appendChild(container);

      const title = document.createElement("div");
      title.style.cssText =
        "font-family: Ubuntu; font-size: 30px; color: #fff; text-align: center; width: 100%;";
      title.textContent = "Leaderboard";
      container.appendChild(title);

      const linesContainer = document.createElement("div");
      linesContainer.style.cssText =
        "font-family: Ubuntu; font-size: 20px; line-height: 1.2; width: 100%; \
				height: fit-content; text-align: center; white-space: pre; overflow: hidden;";
      container.appendChild(linesContainer);

      /** @type {HTMLDivElement[]} */
      const lines = [];
      /** @param {{ me: boolean, name: string, sub: boolean, place: number | undefined }[]} lb */
      function update(lb) {
        const friends = /** @type {any} */ (window).sigmod?.friend_names;
        const friendSettings = /** @type {any} */ (window).sigmod
          ?.friends_settings;
        lb.forEach((entry, i) => {
          let line = lines[i];
          if (!line) {
            line = document.createElement("div");
            line.style.display = "none";
            linesContainer.appendChild(line);
            lines.push(line);
          }

          line.style.display = "block";
          line.textContent = `${entry.place ?? i + 1}. ${entry.name || "An unnamed cell"}`;
          if (entry.me) line.style.color = "#faa";
          else if (
            friends instanceof Set &&
            friends.has(entry.name) &&
            friendSettings?.highlight_friends
          )
            line.style.color = friendSettings.highlight_color;
          else if (entry.sub) line.style.color = "#ffc826";
          else line.style.color = "#fff";
        });

        for (let i = lb.length; i < lines.length; ++i)
          lines[i].style.display = "none";

        container.style.display = lb.length > 0 ? "" : "none";
        container.style.fontWeight = settings.boldUi ? "bold" : "normal";
      }

      /** @type {object | undefined} */
      let lastLb;
      setInterval(() => {
        // update leaderboard frequently
        const currentLb = world.views.get(world.selected)?.leaderboard;
        if (currentLb !== lastLb) update((lastLb = currentLb) ?? []);
      });
    })();

    /** @type {HTMLElement} */
    const mainMenu = aux.require(
      document.querySelector("#__line1")?.parentElement,
      "Can't find the main menu UI. Try reloading the page?",
    );

    /** @type {HTMLElement} */
    const statsContainer = aux.require(
      document.querySelector("#__line2"),
      "Can't find the death screen UI. Try reloading the page?",
    );

    /** @type {HTMLElement} */
    const continueButton = aux.require(
      document.querySelector("#continue_button"),
      "Can't find the continue button (on death). Try reloading the page?",
    );

    /** @type {HTMLElement | null} */
    const menuLinks = document.querySelector("#menu-links");
    /** @type {HTMLElement | null} */
    const overlay = document.querySelector("#overlays");

    // sigmod uses this to detect if the menu is closed or not, otherwise this is unnecessary
    /** @type {HTMLElement | null} */
    const menuWrapper = document.querySelector("#menu-wrapper");

    let escOverlayVisible = true;
    /**
     * @param {boolean} [show]
     */
    ui.toggleEscOverlay = (show) => {
      escOverlayVisible = show ?? !escOverlayVisible;
      if (escOverlayVisible) {
        mainMenu.style.display = "";
        if (overlay) overlay.style.display = "";
        if (menuLinks) menuLinks.style.display = "";
        if (menuWrapper) menuWrapper.style.display = "";

        ui.deathScreen.hide();
      } else {
        mainMenu.style.display = "none";
        if (overlay) overlay.style.display = "none";
        if (menuLinks) menuLinks.style.display = "none";
        if (menuWrapper) menuWrapper.style.display = "none";
      }
    };

    ui.escOverlayVisible = () => escOverlayVisible;

    ui.deathScreen = (() => {
      const deathScreen = {};

      continueButton.addEventListener("click", () => {
        ui.toggleEscOverlay(true);
      });

      // TODO: figure out how this thing works
      /** @type {HTMLElement | null} */
      const bonus = document.querySelector("#menu__bonus");
      if (bonus) bonus.style.display = "none";

      let shown = false;
      deathScreen.check = () => {
        if (world.stats.spawnedAt === undefined) return;
        if (!world.alive()) deathScreen.show();
      };

      deathScreen.show = () => {
        const foodEatenElement = document.querySelector("#food_eaten");
        if (foodEatenElement)
          foodEatenElement.textContent = world.stats.foodEaten.toString();

        const highestMassElement = document.querySelector("#highest_mass");
        if (highestMassElement)
          highestMassElement.textContent = Math.round(
            world.stats.highestScore,
          ).toString();

        const highestPositionElement = document.querySelector(
          "#top_leaderboard_position",
        );
        if (highestPositionElement)
          highestPositionElement.textContent =
            world.stats.highestPosition.toString();

        const timeAliveElement = document.querySelector("#time_alive");
        if (timeAliveElement) {
          const time =
            (performance.now() - (world.stats.spawnedAt ?? 0)) / 1000;
          const hours = Math.floor(time / 60 / 60);
          const mins = Math.floor((time / 60) % 60);
          const seconds = Math.floor(time % 60);

          timeAliveElement.textContent =
            `${hours ? hours + " h" : ""} ${mins ? mins + " m" : ""} ` +
            `${seconds ? seconds + " s" : ""}`;
        }

        statsContainer.classList.remove("line--hidden");
        ui.toggleEscOverlay(false);
        if (overlay) overlay.style.display = "";
        shown = true;
        world.stats = {
          foodEaten: 0,
          highestPosition: 0,
          highestScore: 0,
          spawnedAt: undefined,
        };

        // refresh ads... ...yep
        const { adSlot4, adSlot5, adSlot6, googletag } = /** @type {any} */ (
          window
        );
        if (googletag) {
          googletag.cmd.push(() => googletag.display(adSlot4));
          googletag.cmd.push(() => googletag.display(adSlot5));
          googletag.cmd.push(() => googletag.display(adSlot6));
        }
      };

      deathScreen.hide = () => {
        statsContainer?.classList.add("line--hidden");
        const { googletag } = /** @type {any} */ (window);
        if (shown && googletag)
          googletag.cmd.push(() => googletag.pubads().refresh());
        shown = false;
      };

      return deathScreen;
    })();

    ui.minimap = (() => {
      const canvas = document.createElement("canvas");
      canvas.style.cssText =
        "position: fixed; bottom: 0; right: 0; background: #0006; width: 200px; \
				height: 200px; z-index: 2; user-select: none;";
      canvas.width = canvas.height = 200;
      document.body.appendChild(canvas);

      const ctx = aux.require(
        canvas.getContext("2d", { willReadFrequently: false }),
        "Unable to get 2D context for the minimap. This is probably your browser being dumb, maybe reload " +
          "the page?",
      );

      return { canvas, ctx };
    })();

    ui.chat = (() => {
      const chat = {};

      const block = aux.require(
        document.querySelector("#chat_block"),
        "Can't find the chat UI. Try reloading the page?",
      );

      /**
       * @param {ParentNode} root
       * @param {string} selector
       */
      function clone(root, selector) {
        /** @type {HTMLElement} */
        const old = aux.require(
          root.querySelector(selector),
          `Can't find this chat element: ${selector}. Try reloading the page?`,
        );

        const el = /** @type {HTMLElement} */ (old.cloneNode(true));
        el.id = "";
        old.style.display = "none";
        old.insertAdjacentElement("afterend", el);

        return el;
      }

      // can't just replace the chat box - otherwise sigmod can't hide it - so we make its children invisible
      // elements grabbed with clone() are only styled by their class, not id
      const toggle = clone(document, "#chat_vsbltyBtn");
      const scrollbar = clone(document, "#chat_scrollbar");
      const thumb = clone(scrollbar, "#chat_thumb");

      const input = (chat.input = /** @type {HTMLInputElement} */ (
        aux.require(
          document.querySelector("#chat_textbox"),
          "Can't find the chat textbox. Try reloading the page?",
        )
      ));

      // allow zooming in/out on trackpad without moving the UI
      input.style.position = "fixed";
      toggle.style.position = "fixed";
      scrollbar.style.position = "fixed";

      const list = document.createElement("div");
      list.style.cssText =
        "width: 400px; height: 182px; position: fixed; bottom: 54px; left: 46px; \
				overflow: hidden; user-select: none; z-index: 301;";
      block.appendChild(list);

      let toggled = true;
      toggle.style.borderBottomLeftRadius = "10px"; // a bug fix :p
      toggle.addEventListener("click", () => {
        toggled = !toggled;
        input.style.display = toggled ? "" : "none";
        scrollbar.style.display = toggled ? "block" : "none";
        list.style.display = toggled ? "" : "none";

        if (toggled) {
          toggle.style.borderTopRightRadius =
            toggle.style.borderBottomRightRadius = "";
          toggle.style.opacity = "";
        } else {
          toggle.style.borderTopRightRadius =
            toggle.style.borderBottomRightRadius = "10px";
          toggle.style.opacity = "0.25";
        }
      });

      scrollbar.style.display = "block";
      let scrollTop = 0; // keep a float here, because list.scrollTop is always casted to an int
      let thumbHeight = 1;
      let lastY;
      thumb.style.height = "182px";

      function updateThumb() {
        thumb.style.bottom =
          (1 - list.scrollTop / (list.scrollHeight - 182)) *
            (182 - thumbHeight) +
          "px";
      }

      function scroll() {
        if (scrollTop >= list.scrollHeight - 182 - 40) {
          // close to bottom, snap downwards
          list.scrollTop = scrollTop = list.scrollHeight - 182;
        }

        thumbHeight = Math.min(Math.max(182 / list.scrollHeight, 0.1), 1) * 182;
        thumb.style.height = thumbHeight + "px";
        updateThumb();
      }

      let scrolling = false;
      thumb.addEventListener("mousedown", () => void (scrolling = true));
      addEventListener("mouseup", () => void (scrolling = false));
      addEventListener("mousemove", (e) => {
        const deltaY = e.clientY - lastY;
        lastY = e.clientY;

        if (!scrolling) return;
        e.preventDefault();

        if (lastY === undefined) {
          lastY = e.clientY;
          return;
        }

        list.scrollTop = scrollTop = Math.min(
          Math.max(scrollTop + (deltaY * list.scrollHeight) / 182, 0),
          list.scrollHeight - 182,
        );
        updateThumb();
      });

      let lastWasBarrier = true; // init to true, so we don't print a barrier as the first ever message (ugly)
      /**
       * @param {string} authorName
       * @param {[number, number, number, number]} rgb
       * @param {string} text
       * @param {boolean} server
       */
      chat.add = (authorName, rgb, text, server) => {
        lastWasBarrier = false;

        const container = document.createElement("div");
        const author = document.createElement("span");
        author.style.cssText = `color: ${aux.rgba2hex(...rgb)}; padding-right: 0.75em;`;
        author.textContent = aux.trim(authorName);
        container.appendChild(author);

        const msg = document.createElement("span");
        if (server) msg.style.cssText = `color: ${aux.rgba2hex(...rgb)}`;
        msg.textContent = server ? text : aux.trim(text); // /help text can get cut off
        container.appendChild(msg);

        while (list.children.length > 100) list.firstChild?.remove();

        list.appendChild(container);

        scroll();
      };

      chat.barrier = () => {
        if (lastWasBarrier) return;
        lastWasBarrier = true;

        const barrier = document.createElement("div");
        barrier.style.cssText =
          "width: calc(100% - 20px); height: 1px; background: #8888; margin: 10px;";
        list.appendChild(barrier);

        scroll();
      };

      chat.matchTheme = () => {
        list.style.color = aux.settings.darkTheme ? "#fffc" : "#000c";
        // make author names darker in light theme
        list.style.filter = aux.settings.darkTheme ? "" : "brightness(75%)";
      };

      return chat;
    })();

    /** @param {string} msg */
    ui.error = (msg) => {
      const modal = /** @type {HTMLElement | null} */ (
        document.querySelector("#errormodal")
      );
      const desc = document.querySelector("#errormodal p");
      if (desc) desc.innerHTML = msg;

      if (modal) modal.style.display = "block";
    };

    // sigmod quick fix
    // TODO does this work?
    (() => {
      // the play timer is inserted below the top-left stats, but because we offset them, we need to offset this
      // too
      const style = document.createElement("style");
      style.textContent = ".playTimer { transform: translate(5px, 10px); }";
      document.head.appendChild(style);
    })();

    return ui;
  })();

  /////////////////////////
  // Create Options Menu //
  /////////////////////////
  const settings = (() => {
    const settings = {
      /** @type {'auto' | 'never'} */
      autoZoom: "auto",
      background: "",
      blockBrowserKeybinds: false,
      blockNearbyRespawns: false,
      boldUi: false,
      cellGlow: false,
      cellOpacity: 1,
      cellOutlines: true,
      clans: false,
      clanScaleFactor: 1,
      drawDelay: 120,
      jellySkinLag: true,
      massBold: false,
      massOpacity: 1,
      massScaleFactor: 1,
      /** @type {'flawless' | 'alpha'} */
      mergeStrategy: "flawless",
      multibox: "",
      /** @type {'natural' | 'delta' | 'weighted' | 'none'} */
      multiCamera: "natural",
      nameBold: false,
      nameScaleFactor: 1,
      outlineMulti: 0.2,
      // delta's default colors, #ff00aa and #ffffff
      outlineMultiColor: /** @type {[number, number, number, number]} */ ([
        1,
        0,
        2 / 3,
        1,
      ]),
      outlineMultiInactiveColor:
        /** @type {[number, number, number, number]} */ ([1, 1, 1, 1]),
      pelletGlow: false,
      rainbowBorder: false,
      scrollFactor: 1,
      selfSkin: "",
      selfSkinMulti: "",
      separateBoost: false,
      showStats: true,
      spectator: false,
      spectatorLatency: false,
      textOutlinesFactor: 1,
      tracer: false,
      unsplittableOpacity: 1,
    };

    try {
      Object.assign(settings, JSON.parse(localStorage.getItem("sigfix") ?? ""));
    } catch (_) {}

    // convert old settings
    if (/** @type {any} */ (settings.multibox) === true)
      settings.multibox = "Tab";
    else if (/** @type {any} */ (settings.multibox) === false)
      settings.multibox = "";

    /** @type {Set<() => void>} */
    const onSaves = new Set();

    const channel = new BroadcastChannel("sigfix-settings");
    channel.addEventListener("message", (msg) => {
      Object.assign(settings, msg.data);
      onSaves.forEach((fn) => fn());
    });

    // #1 : define helper functions
    /**
     * @param {string} html
     * @returns {HTMLElement}
     */
    function fromHTML(html) {
      const div = document.createElement("div");
      div.innerHTML = html;
      return /** @type {HTMLElement} */ (div.firstElementChild);
    }

    function save() {
      localStorage.setItem("sigfix", JSON.stringify(settings));
      channel.postMessage(settings);
    }

    /**
     * @template O, T
     * @typedef {{ [K in keyof O]: O[K] extends T ? K : never }[keyof O]} PropertyOfType
     */

    /** @type {HTMLElement | null} */
    const vanillaModal = document.querySelector(
      "#cm_modal__settings .ctrl-modal__modal",
    );
    if (vanillaModal) vanillaModal.style.width = "440px"; // make modal wider to fit everything properly

    const vanillaMenu = document.querySelector(
      "#cm_modal__settings .ctrl-modal__content",
    );
    vanillaMenu?.appendChild(
      fromHTML(`
			<div class="menu__item">
				<div style="width: 100%; height: 1px; background: #bfbfbf;"></div>
			</div>
		`),
    );

    const vanillaContainer = document.createElement("div");
    vanillaContainer.className = "menu__item";
    vanillaMenu?.appendChild(vanillaContainer);

    const sigmodContainer = document.createElement("div");
    sigmodContainer.className = "mod_tab scroll";
    sigmodContainer.style.display = "none";

    /**
     * @param {PropertyOfType<typeof settings, number>} property
     * @param {string} title
     * @param {number | undefined} initial
     * @param {number} min
     * @param {number} max
     * @param {number} step
     * @param {number} decimals
     * @param {string} help
     */
    function slider(property, title, initial, min, max, step, decimals, help) {
      /**
       * @param {HTMLInputElement} slider
       * @param {HTMLInputElement} display
       */
      const listen = (slider, display) => {
        slider.value = settings[property].toString();
        display.value = settings[property].toFixed(decimals);

        slider.addEventListener("input", () => {
          settings[property] = Number(slider.value);
          display.value = settings[property].toFixed(decimals);
          save();
        });

        display.addEventListener("change", () => {
          const value = Number(display.value);
          if (!Number.isNaN(value)) settings[property] = value;

          display.value = slider.value = settings[property].toFixed(decimals);
          save();
        });

        onSaves.add(() => {
          slider.value = settings[property].toString();
          display.value = settings[property].toFixed(decimals);
        });
      };

      const datalist = `<datalist id="sf-${property}-markers"> <option value="${initial}"></option> </datalist>`;
      const vanilla = fromHTML(`
				<div style="height: 25px; position: relative;" title="${help}">
					<div style="height: 25px; line-height: 25px; position: absolute; top: 0; left: 0;">${title}</div>
					<div style="height: 25px; margin-left: 5px; position: absolute; right: 0; bottom: 0;">
						<input id="sf-${property}" style="display: block; float: left; height: 25px; line-height: 25px;\
							margin-left: 5px;" min="${min}" max="${max}" step="${step}" value="${initial}"
							list="sf-${property}-markers" type="range" />
						${initial !== undefined ? datalist : ""}
						<input id="sf-${property}-display" style="display: block; float: left; height: 25px; \
							line-height: 25px; width: 50px; text-align: right;" />
					</div>
				</div>
			`);
      listen(
        /** @type {HTMLInputElement} */ (
          vanilla.querySelector(`input#sf-${property}`)
        ),
        /** @type {HTMLInputElement} */ (
          vanilla.querySelector(`input#sf-${property}-display`)
        ),
      );
      vanillaContainer.appendChild(vanilla);

      const datalistSm = `<datalist id="sfsm-${property}-markers"> <option value="${initial}"></option> </datalist>`;
      const sigmod = fromHTML(`
				<div class="modRowItems justify-sb" style="padding: 5px 10px;" title="${help}">
					<span>${title}</span>
					<span class="justify-sb">
						<input id="sfsm-${property}" style="width: 200px;" type="range" min="${min}" max="${max}"
							step="${step}" value="${initial}" list="sfsm-${property}-markers" />
						${initial !== undefined ? datalistSm : ""}
						<input id="sfsm-${property}-display" class="text-center form-control" style="border: none; \
							width: 50px; margin: 0 15px;" />
					</span>
				</div>
			`);
      listen(
        /** @type {HTMLInputElement} */ (
          sigmod.querySelector(`input#sfsm-${property}`)
        ),
        /** @type {HTMLInputElement} */ (
          sigmod.querySelector(`input#sfsm-${property}-display`)
        ),
      );
      sigmodContainer.appendChild(sigmod);
    }

    /**
     * @param {PropertyOfType<typeof settings, string>} property
     * @param {string} title
     * @param {string} placeholder
     * @param {string} help
     */
    function input(property, title, placeholder, help) {
      /**
       * @param {HTMLInputElement} input
       */
      const listen = (input) => {
        input.value = /** @type {never} */ (settings[property]);
        input.addEventListener("input", () => {
          settings[property] = /** @type {never} */ (input.value);
          save();
        });

        onSaves.add(() => (input.value = settings[property]));
      };

      const vanilla = fromHTML(`
				<div style="height: 25px; position: relative;" title="${help}">
					<div style="height: 25px; line-height: 25px; position: absolute; top: 0; left: 0;">${title}</div>
					<div style="height: 25px; margin-left: 5px; position: absolute; right: 0; bottom: 0;">
						<input id="sf-${property}" placeholder="${placeholder}" type="text" />
					</div>
				</div>
			`);
      listen(
        /** @type {HTMLInputElement} */ (
          vanilla.querySelector(`input#sf-${property}`)
        ),
      );
      vanillaContainer.appendChild(vanilla);

      const sigmod = fromHTML(`
				<div class="modRowItems justify-sb" style="padding: 5px 10px;" title="${help}">
					<span>${title}</span>
					<input class="modInput" id="sfsm-${property}" placeholder="${placeholder}" \
						style="width: 250px;" type="text" />
				</div>
			`);
      listen(
        /** @type {HTMLInputElement} */ (
          sigmod.querySelector(`input#sfsm-${property}`)
        ),
      );
      sigmodContainer.appendChild(sigmod);
    }

    /**
     * @param {PropertyOfType<typeof settings, boolean>} property
     * @param {string} title
     * @param {string} help
     */
    function checkbox(property, title, help) {
      /**
       * @param {HTMLInputElement} input
       */
      const listen = (input) => {
        input.checked = settings[property];
        input.addEventListener("input", () => {
          settings[property] = input.checked;
          save();
        });

        onSaves.add(() => (input.checked = settings[property]));
      };

      const vanilla = fromHTML(`
				<div style="height: 25px; position: relative;" title="${help}">
					<div style="height: 25px; line-height: 25px; position: absolute; top: 0; left: 0;">${title}</div>
					<div style="height: 25px; margin-left: 5px; position: absolute; right: 0; bottom: 0;">
						<input id="sf-${property}" type="checkbox" />
					</div>
				</div>
			`);
      listen(
        /** @type {HTMLInputElement} */ (
          vanilla.querySelector(`input#sf-${property}`)
        ),
      );
      vanillaContainer.appendChild(vanilla);

      const sigmod = fromHTML(`
				<div class="modRowItems justify-sb" style="padding: 5px 10px;" title="${help}">
					<span>${title}</span>
					<div style="width: 75px; text-align: center;">
						<div class="modCheckbox" style="display: inline-block;">
							<input id="sfsm-${property}" type="checkbox" />
							<label class="cbx" for="sfsm-${property}"></label>
						</div>
					</div>
				</div>
			`);
      listen(
        /** @type {HTMLInputElement} */ (
          sigmod.querySelector(`input#sfsm-${property}`)
        ),
      );
      sigmodContainer.appendChild(sigmod);
    }

    /**
     * @param {PropertyOfType<typeof settings, [number, number, number, number]>} property
     * @param {string} title
     * @param {string} help
     */
    function color(property, title, help) {
      /**
       * @param {HTMLInputElement} input
       * @param {HTMLInputElement} visible
       */
      const listen = (input, visible) => {
        input.value = aux.rgba2hex6(...settings[property]);
        visible.checked = settings[property][3] > 0;
        const changed = () => {
          settings[property] = aux.hex2rgba(input.value);
          settings[property][3] = visible.checked ? 1 : 0;
          save();
        };
        input.addEventListener("input", changed);
        visible.addEventListener("input", changed);

        onSaves.add(() => {
          input.value = aux.rgba2hex6(...settings[property]);
          visible.checked = settings[property][3] > 0;
        });
      };

      const vanilla = fromHTML(`
				<div style="height: 25px; position: relative;" title="${help}">
					<div style="height: 25px; line-height: 25px; position: absolute; top: 0; left: 0;">${title}</div>
					<div style="height: 25px; margin-left: 5px; position: absolute; right: 0; bottom: 0;">
						<input id="sf-${property}-visible" type="checkbox" />
						<input id="sf-${property}" type="color" />
					</div>
				</div>
			`);
      listen(
        /** @type {HTMLInputElement} */ (
          vanilla.querySelector(`input#sf-${property}`)
        ),
        /** @type {HTMLInputElement} */ (
          vanilla.querySelector(`input#sf-${property}-visible`)
        ),
      );
      vanillaContainer.appendChild(vanilla);

      const sigmod = fromHTML(`
				<div class="modRowItems justify-sb" style="padding: 5px 10px;" title="${help}">
					<span>${title}</span>
					<div style="width: 75px; text-align: center;">
						<div class="modCheckbox" style="display: inline-block;">
							<input id="sfsm-${property}-visible" type="checkbox" />
							<label class="cbx" for="sfsm-${property}-visible"></label>
						</div>
						<input id="sfsm-${property}" type="color" />
					</div>
				</div>
			`);
      listen(
        /** @type {HTMLInputElement} */ (
          sigmod.querySelector(`input#sfsm-${property}`)
        ),
        /** @type {HTMLInputElement} */ (
          sigmod.querySelector(`input#sfsm-${property}-visible`)
        ),
      );
      sigmodContainer.appendChild(sigmod);
    }

    /**
     * @param {PropertyOfType<typeof settings, string>} property
     * @param {string} title
     * @param {[string, string][]} options
     * @param {string} help
     */
    function dropdown(property, title, options, help) {
      /**
       * @param {HTMLSelectElement} input
       */
      const listen = (input) => {
        input.value = settings[property];
        input.addEventListener("input", () => {
          settings[property] = /** @type {never} */ (input.value);
          save();
        });

        onSaves.add(() => {
          input.value = settings[property];
        });
      };

      const vanilla = fromHTML(`
				<div style="height: 25px; position: relative;" title="${help}">
					<div style="height: 25px; line-height: 25px; position: absolute; top: 0; left: 0;">${title}</div>
					<div style="height: 25px; margin-left: 5px; position: absolute; right: 0; bottom: 0;">
						<select id="sf-${property}">
							${options.map(([value, name]) => `<option value="${value}">${name}</option>`).join("\n")}
						</select>
					</div>
				</div>
			`);
      listen(
        /** @type {HTMLSelectElement} */ (
          vanilla.querySelector(`select#sf-${property}`)
        ),
      );
      vanillaContainer.appendChild(vanilla);

      const sigmod = fromHTML(`
				<div class="modRowItems justify-sb" style="padding: 5px 10px;" title="${help}">
					<span>${title}</span>
					<select class="form-control" id="sfsm-${property}" style="width: 250px;">
						${options.map(([value, name]) => `<option value="${value}">${name}</option>`).join("\n")}
					</select>
				</div>
			`);
      listen(
        /** @type {HTMLSelectElement} */ (
          sigmod.querySelector(`select#sfsm-${property}`)
        ),
      );
      sigmodContainer.appendChild(sigmod);
    }

    /**
     * @param {PropertyOfType<typeof settings, string>} property
     * @param {string} title
     * @param {string} help
     */
    function keybind(property, title, help) {
      /**
       * @param {HTMLSelectElement} input
       */
      const listen = (input) => {
        input.value = settings[property];
        input.addEventListener("keydown", (e) => {
          if (e.code === "Escape" || e.code === "Backspace") {
            settings[property] = /** @type {never} */ (input.value = "");
          } else {
            settings[property] = /** @type {never} */ (input.value = e.key);
          }
          e.preventDefault(); // prevent the actual key from being input
          save();
        });

        onSaves.add(() => {
          input.value = settings[property];
        });
      };

      const vanilla = fromHTML(`
				<div style="height: 25px; position: relative;" title="${help}">
					<div style="height: 25px; line-height: 25px; position: absolute; top: 0; left: 0;">${title}</div>
					<div style="height: 25px; margin-left: 5px; position: absolute; right: 0; bottom: 0;">
						<input id="sf-${property}" placeholder="..." type="text" style="width: 40px;" />
					</div>
				</div>
			`);
      listen(
        /** @type {HTMLSelectElement} */ (
          vanilla.querySelector(`input#sf-${property}`)
        ),
      );
      vanillaContainer.appendChild(vanilla);

      const sigmod = fromHTML(`
				<div class="modRowItems justify-sb" style="padding: 5px 10px;" title="${help}">
					<span>${title}</span>
					<input class="keybinding" id="sfsm-${property}" placeholder="..." \
						style="width: 50px;" type="text" />
				</div>
			`);
      listen(
        /** @type {HTMLSelectElement} */ (
          sigmod.querySelector(`input#sfsm-${property}`)
        ),
      );
      sigmodContainer.appendChild(sigmod);
    }

    function separator(text = "•") {
      vanillaContainer.appendChild(
        fromHTML(`<div style="text-align: center; width: 100%;">${text}</div>`),
      );
      sigmodContainer.appendChild(
        fromHTML(`<span class="text-center">${text}</span>`),
      );
    }

    // #2 : generate ui for settings
    separator("Hover over a setting for more info");
    slider(
      "drawDelay",
      "Draw delay",
      120,
      40,
      300,
      1,
      0,
      "How long (in ms) cells will lag behind for. Lower values mean cells will very quickly catch up to where " +
        "they actually are.",
    );
    checkbox(
      "cellOutlines",
      "Cell outlines",
      "Whether the subtle dark outlines around cells (including skins) " +
        "should draw.",
    );
    slider(
      "cellOpacity",
      "Cell opacity",
      undefined,
      0.5,
      1,
      0.005,
      3,
      "How opaque cells should be. 1 = fully visible, 0 = invisible. It can be helpful to see the size of a " +
        "smaller cell under a big cell.",
    );
    input(
      "selfSkin",
      "Self skin URL",
      "https://i.imgur.com/...",
      "Direct URL to a custom skin for yourself. Not visible to others.",
    );
    input(
      "selfSkinMulti",
      "Secondary skin URL",
      "https://i.imgur.com/...",
      "Direct URL to a custom skin for your secondary multibox tab. Not visible to others.",
    );
    input(
      "background",
      "Map background image",
      "https://i.imgur.com/...",
      "A square background image to use within the entire map border. Images under 1024x1024 will be treated " +
        "as a repeating pattern, where 50 pixels = 1 grid square.",
    );
    checkbox(
      "tracer",
      "Lines between cells and mouse",
      "If enabled, draws a line between all of the cells you " +
        "control and your mouse. Useful as a hint to your subconscious about which tab you're currently on.",
    );
    separator("• multibox •");
    keybind(
      "multibox",
      "One-tab multibox key",
      "Pressing this key will switch between two game connections in " +
        "this browser tab. When this key is set, a weighted camera will be used. You can unbind the key by " +
        "setting it to Escape or Backspace. If you're used to Ctrl+Tab, consider enabling &quot;Block all " +
        "browser keybinds&quot;.",
    );
    dropdown(
      "multiCamera",
      "Camera style",
      [
        ["natural", "Merge weighted (natural)"],
        ["delta", "Merge Delta-style"],
        ["weighted", "No merge, weighted"],
        ["none", "No merge, not weighted"],
      ],
      "How the camera should move when multiboxing.\n" +
        "- &quot;Merge weighted (natural)&quot; is the default. Your camera will be put at the center of your " +
        "total mass. Use this if you're not sure.\n" +
        "- &quot;Merge Delta-style&quot; places the camera in between each tab's center of mass. This is " +
        "how Delta positions its camera.\n" +
        "- &quot;No merge, weighted&quot; puts the camera at the center of mass of your current tab.\n" +
        "- &quot;No merge, not weighted&quot; uses the default non-multiboxing camera. Use this if you're used " +
        "two-tab multiboxing.",
    );
    dropdown(
      "mergeStrategy",
      "Vision merging strategy",
      [
        ["flawless", "Synchronize - flawless"],
        ["alpha", "Compatibility - stable"],
      ],
      "Which algorithm to use when combining visible cells between tabs.\n" +
        "- &quot;Synchronize - flawless&quot; synchronizes all connections and prevents warping. However, if any " +
        "tab starts lagging, the rest will freeze too. Default for Sigmally Fixes. Highly recommended.\n" +
        "- &quot;Compatibility - prefer primary&quot; uses the primary tab's cells if possible, though the most " +
        "opaque cell will be chosen. Cells may warp around, but will stay usable if your internet is unstable. " +
        "Similar to Delta.",
    );
    slider(
      "outlineMulti",
      "Current tab cell outline thickness",
      0.2,
      0,
      1,
      0.01,
      2,
      "Draws an inverse outline on your cells, the thickness being a % of your cell radius. This only shows " +
        "when 'merge camera between tabs' is enabled and when you're near one of your tabs.",
    );
    color(
      "outlineMultiColor",
      "Current tab outline color",
      "The outline color of your current multibox tab.",
    );
    color(
      "outlineMultiInactiveColor",
      "Other tab outline color",
      "The outline color for the cells of your other unfocused multibox tabs. Turn off the checkbox to disable.",
    );
    separator("• inputs •");
    slider(
      "scrollFactor",
      "Zoom speed",
      1,
      0.05,
      1,
      0.05,
      2,
      "A smaller zoom speed lets you fine-tune your zoom.",
    );
    dropdown(
      "autoZoom",
      "Auto-zoom",
      [
        ["auto", "When not multiboxing"],
        ["never", "Never"],
      ],
      "When enabled, automatically zooms in/out for you based on how big you are. ",
    );
    checkbox(
      "blockBrowserKeybinds",
      "Block all browser keybinds",
      "When enabled, only F11 is allowed to be pressed when in fullscreen. Most other browser and system " +
        "keybinds will be disabled.",
    );
    checkbox(
      "blockNearbyRespawns",
      "Block respawns near other tabs",
      "Disables the respawn keybind (SigMod-only) when near one of your bigger tabs.",
    );
    separator("• text •");
    slider(
      "nameScaleFactor",
      "Name scale factor",
      1,
      0.5,
      2,
      0.01,
      2,
      "The size multiplier of names.",
    );
    slider(
      "massScaleFactor",
      "Mass scale factor",
      1,
      0.5,
      4,
      0.01,
      2,
      "The size multiplier of mass (which is half the size of names)",
    );
    slider(
      "massOpacity",
      "Mass opacity",
      1,
      0,
      1,
      0.01,
      2,
      "The opacity of the mass text. You might find it visually appealing to have mass be a little dimmer than " +
        "names.",
    );
    checkbox(
      "nameBold",
      "Bold name text",
      "Uses the bold Ubuntu font for names (like Agar.io).",
    );
    checkbox("massBold", "Bold mass text", "Uses a bold font for mass.");
    checkbox(
      "clans",
      "Show clans",
      "When enabled, shows the name of the clan a player is in above their name. " +
        "If you turn off names (using SigMod), then player names will be replaced with their clan's.",
    );
    slider(
      "clanScaleFactor",
      "Clan scale factor",
      1,
      0.5,
      4,
      0.01,
      2,
      "The size multiplier of a player's clan displayed above their name (only when 'Show clans' is " +
        "enabled). When names are off, names will be replaced with clans and use the name scale factor instead.",
    );
    slider(
      "textOutlinesFactor",
      "Text outline thickness factor",
      1,
      0,
      2,
      0.01,
      2,
      "The multiplier of the thickness of the black stroke around names, mass, and clans on cells. You can set " +
        "this to 0 to disable outlines AND text shadows.",
    );
    separator("• other •");
    slider(
      "unsplittableOpacity",
      "Unsplittable cell outline opacity",
      1,
      0,
      1,
      0.01,
      2,
      "How visible the white outline around cells that can't split should be. 0 = not visible, 1 = fully " +
        "visible.",
    );
    checkbox(
      "jellySkinLag",
      "Jelly physics cell size lag",
      "Jelly physics causes cells to grow and shrink slower than text and skins, making the game more " +
        "satisfying. If you have a skin that looks weird only with jelly physics, try turning this off.",
    );
    checkbox(
      "cellGlow",
      "Cell glow",
      "When enabled, makes cells have a slight glow. This could slightly " +
        "affect performance.",
    );
    checkbox(
      "pelletGlow",
      "Pellet glow",
      "When enabled, gives pellets a slight glow. This should not affect " +
        "performance.",
    );
    checkbox("rainbowBorder", "Rainbow border", "Rainbow border");
    checkbox(
      "boldUi",
      "Top UI uses bold text",
      "When enabled, the top-left score and stats UI and the " +
        "leaderboard will use the bold Ubuntu font.",
    );
    checkbox(
      "showStats",
      "Show server stats",
      "When disabled, hides the top-left server stats including the " +
        "player count and server uptime.",
    );
    checkbox(
      "spectator",
      "Connect spectating tab",
      "Automatically connects an extra tab and sets it to spectate " + "#1.",
    );
    checkbox(
      "spectatorLatency",
      "Spectator tab latency",
      "When enabled, shows another ping measurement for your " +
        "spectator tab.",
    );
    checkbox(
      "separateBoost",
      "Separate XP boost from score",
      "If you have an XP boost, your score will be " +
        "doubled. If you don't want that, you can separate the XP boost from your score.",
    );

    // #3 : create options for sigmod
    let sigmodInjection;
    sigmodInjection = setInterval(() => {
      const nav = document.querySelector(".mod_menu_navbar");
      const content = document.querySelector(".mod_menu_content");
      if (!nav || !content) return;

      clearInterval(sigmodInjection);

      content.appendChild(sigmodContainer);

      const navButton = fromHTML(
        '<button class="mod_nav_btn">🔥 Sig Fixes</button>',
      );
      nav.appendChild(navButton);
      navButton.addEventListener("click", () => {
        // basically openModTab() from sigmod
        /** @type {NodeListOf<HTMLElement>} */ (
          document.querySelectorAll(".mod_tab")
        ).forEach((tab) => {
          tab.style.opacity = "0";
          setTimeout(() => (tab.style.display = "none"), 200);
        });

        /** @type {NodeListOf<HTMLElement>} */ (
          document.querySelectorAll(".mod_nav_btn")
        ).forEach((tab) => {
          tab.classList.remove("mod_selected");
        });

        navButton.classList.add("mod_selected");
        setTimeout(() => {
          sigmodContainer.style.display = "flex";
          setTimeout(() => (sigmodContainer.style.opacity = "1"), 10);
        }, 200);
      });
    }, 100);

    return settings;
  })();

  ///////////////////////////
  // Setup World Variables //
  ///////////////////////////
  /** @typedef {{
   * id: number,
   * ox: number, nx: number,
   * oy: number, ny: number,
   * or: number, nr: number, jr: number,
   * Rgb: number, rGb: number, rgB: number,
   * updated: number, born: number, deadTo: number, deadAt: number | undefined,
   * jagged: boolean, pellet: boolean,
   * name: string, skin: string, sub: boolean, clan: string,
   * }} Cell */
  const world = (() => {
    const world = {};

    // #1 : define cell variables and functions
    let nextViewId = 0;
    /** @type {Map<number, { merged: Cell | undefined, model: Cell | undefined, views: Map<number, Cell> }>} */
    world.cells = new Map();
    /** @type {Map<number, { merged: Cell | undefined, model: Cell | undefined, views: Map<number, Cell> }>} */
    world.pellets = new Map();
    world.viewId = {
      // decoupling views like this should make it easier to do n-boxing in the future
      primary: nextViewId++,
      secondary: nextViewId++,
      spectate: nextViewId++,
    };
    world.selected = world.viewId.primary;
    /** @type {Map<number, {
     * 		border: { l: number, r: number, t: number, b: number } | undefined,
     * 		camera: {
     * 			x: number, tx: number,
     * 			y: number, ty: number,
     * 			scale: number, tscale: number,
     * 			merging: number[],
     * 		},
     * 		leaderboard: { name: string, me: boolean, sub: boolean, place: number | undefined }[],
     * 		owned: number[],
     * 		stats: object | undefined,
     * }>} */
    world.views = new Map();

    // sigmod compatibility; place a fake cell whose radius yields the current score. this is for respawn
    // blocking and respawn compatibility
    /** @type {[symbol]} */
    world.mine = [Symbol()];
    const fakeEntry = {
      deadAt: undefined, // make sure sigmod doesn't skip this cell
      merged: undefined,
      model: undefined,
      views: new Map([
        [
          /** @type {any} */ (Symbol()),
          {
            id: NaN,
            ox: NaN,
            nx: NaN,
            oy: NaN,
            ny: NaN,
            or: NaN,
            nr: NaN,
            jr: NaN,
            Rgb: 0,
            rGb: 0,
            rgB: 0,
            born: Infinity,
            updated: NaN,
            deadAt: undefined,
            deadTo: -1,
            name: "",
            skin: "",
            clan: "",
            sub: false,
            jagged: false,
            pellet: false,
          },
        ],
      ]),
    };
    Object.defineProperty(fakeEntry, "nr", {
      get: () => {
        // only let sigmod block respawns if we're in a main server
        if (
          ["ca0.sigmally.com", "ca1.sigmally.com", "eu0.sigmally.com"].some(
            (url) => net.url().includes(url),
          )
        )
          return Math.sqrt(world.score(world.selected) * 100);
        else return 0;
      },
      set: () => {},
    });
    world.cells.set(/** @type {any} */ (world.mine[0]), fakeEntry);

    world.alive = () => {
      for (const vision of world.views.values()) {
        for (const id of vision.owned) {
          const cell = world.cells.get(id)?.merged;
          // if a cell does not exist yet, we treat it as alive
          if (!cell || cell.deadAt === undefined) return true;
        }
      }
      return false;
    };

    /**
     * @param {number} view
     * @param {number} weightExponent
     * @param {number} now
     * @returns {{ scale: number, sumX: number, sumY: number, weight: number }}
     */
    world.singleCamera = (view, weightExponent, now) => {
      let r = 0;
      let sumX = 0;
      let sumY = 0;
      let weight = 0;
      for (const id of world.views.get(view)?.owned ?? []) {
        const cell = world.cells.get(id)?.merged;
        if (!cell || cell.deadAt !== undefined) continue;
        const xyr = world.xyr(cell, undefined, now);
        r += cell.nr;
        sumX += xyr.x * cell.nr ** weightExponent;
        sumY += xyr.y * cell.nr ** weightExponent;
        weight += cell.nr ** weightExponent;
      }

      const scale = Math.min(64 / r, 1) ** 0.4;
      return { scale, sumX, sumY, weight };
    };

    /**
     * @param {number} view
     * @param {number} now
     * @param {number} dt
     */
    world.camera = (view, now, dt) => {
      // temporary default camera for now
      const vision = world.views.get(view);
      if (!vision) return;

      const weighted = settings.multibox && settings.multiCamera !== "none";
      /** @type {number[]} */
      const merging = [];
      /** @type {{ scale: number, sumX: number, sumY: number, weight: number }[]} */
      const mergingCameras = [];
      const desc = world.singleCamera(view, weighted ? 2 : 0, now);
      let xyFactor;
      if (desc.weight > 0) {
        const mainX = desc.sumX / desc.weight;
        const mainY = desc.sumY / desc.weight;
        if (settings.multibox) {
          const mainWeight = desc.weight;
          const mainWidth = 1920 / 2 / desc.scale;
          const mainHeight = 1080 / 2 / desc.scale;
          for (const otherView of world.views.keys()) {
            if (otherView === view) continue;
            const otherDesc = world.singleCamera(otherView, 2, now);
            if (otherDesc.weight <= 0) continue;

            const otherX = otherDesc.sumX / otherDesc.weight;
            const otherY = otherDesc.sumY / otherDesc.weight;
            const otherWidth = 1920 / 2 / otherDesc.scale;
            const otherHeight = 1080 / 2 / otherDesc.scale;

            // only merge with tabs if their vision regions are close. expand threshold depending on
            // how much mass each tab has (if both tabs are large, allow them to go pretty far)
            const threshold =
              1000 +
              Math.min(mainWeight / 100 / 25, otherDesc.weight / 100 / 25);
            if (
              Math.abs(otherX - mainX) < mainWidth + otherWidth + threshold &&
              Math.abs(otherY - mainY) < mainHeight + otherHeight + threshold
            ) {
              merging.push(otherView);
              mergingCameras.push(otherDesc);
            }
          }
        }

        let targetX, targetY, zoom;
        if (!settings.multibox || settings.multiCamera === "none") {
          // default camera, autozoom
          targetX = desc.sumX / desc.weight;
          targetY = desc.sumY / desc.weight;
          zoom = settings.autoZoom === "auto" ? desc.scale : 0.25;
        } else if (settings.multiCamera === "weighted") {
          // weighted two-tab camera, no autozoom
          targetX = desc.sumX / desc.weight;
          targetY = desc.sumY / desc.weight;
          zoom = 0.25;
        } else if (settings.multiCamera === "delta") {
          targetX = mainX;
          targetY = mainY;
          for (const camera of mergingCameras) {
            targetX += camera.sumX / camera.weight;
            targetY += camera.sumY / camera.weight;
          }
          targetX /= mergingCameras.length + 1;
          targetY /= mergingCameras.length + 1;
          zoom = 0.25;
        } else {
          // settings.multiCamera === 'natural'
          targetX = desc.sumX;
          targetY = desc.sumY;
          let totalWeight = desc.weight;
          for (const camera of mergingCameras) {
            targetX += camera.sumX;
            targetY += camera.sumY;
            totalWeight += camera.weight;
          }
          targetX /= totalWeight;
          targetY /= totalWeight;
          zoom = 0.25;
        }

        vision.camera.tx = targetX;
        vision.camera.ty = targetY;
        vision.camera.tscale = zoom;
        xyFactor = 2;
      } else {
        xyFactor = 20;
      }

      vision.camera.x = aux.exponentialEase(
        vision.camera.x,
        vision.camera.tx,
        xyFactor,
        dt,
      );
      vision.camera.y = aux.exponentialEase(
        vision.camera.y,
        vision.camera.ty,
        xyFactor,
        dt,
      );
      vision.camera.scale = aux.exponentialEase(
        vision.camera.scale,
        input.zoom * vision.camera.tscale,
        9,
        dt,
      );
      vision.camera.merging = merging;
    };

    /** @param {number} view */
    world.create = (view) => {
      const old = world.views.get(view);
      if (old) return old;

      const vision = {
        border: undefined,
        camera: { x: 0, tx: 0, y: 0, ty: 0, scale: 0, tscale: 0, merging: [] },
        leaderboard: [],
        owned: [],
        stats: undefined,
      };
      world.views.set(view, vision);
      return vision;
    };

    world.merge = () => {
      const now = performance.now();
      if (world.views.size === 1 && world.views.has(world.viewId.primary)) {
        // no-merge strategy
        for (const key of /** @type {const} */ (["cells", "pellets"])) {
          for (const resolution of world[key].values()) {
            resolution.merged = resolution.views.get(world.viewId.primary);
          }
        }
      } else if (settings.mergeStrategy === "alpha") {
        // maximize alpha, prefer primary tab
        for (const key of /** @type {const} */ (["cells", "pellets"])) {
          for (const resolution of world[key].values()) {
            let alpha = 0;
            /** @type {Cell | undefined} */
            let best;
            for (const [view, cell] of resolution.views) {
              let thisAlpha = now - cell.born;
              if (cell.deadAt !== undefined)
                thisAlpha = Math.min(thisAlpha, 100 - (now - cell.deadAt));
              thisAlpha = Math.min(thisAlpha, 100);
              if (
                !best ||
                thisAlpha > alpha ||
                (thisAlpha === alpha && view === world.viewId.primary)
              ) {
                alpha = thisAlpha;
                best = cell;
              }
            }
            resolution.merged = best;
          }
        }
      } else {
        // settings.mergeStrategy === 'flawless'
        // for camera merging to look extremely smooth, we need to merge packets and apply them *ONLY* when all
        // tabs are synchronized.
        // if you simply fall back to what the other tabs see, you will get lots of flickering and warping (what
        // delta suffers from).
        // threfore, we make sure that all tabs that share visible cells see them in the same spots, to make
        // sure they are all on the same tick.
        // it's also not sufficient to simply count how many update (0x10) packets we get, as /leaveworld (part
        // of respawn functionality) stops those packets from coming in.
        // if the view areas are disjoint, then there's nothing we can do but this should never happen when
        // splitrunning
        for (const key of /** @type {const} */ (["cells", "pellets"])) {
          for (const resolution of world[key].values()) {
            /** @type {Cell | undefined} */
            let model;
            for (const cell of resolution.views.values()) {
              if (!model) {
                model = cell;
                continue;
              }

              const modelDisappeared =
                model.deadAt !== undefined && model.deadTo === -1;
              const cellDisappeared =
                cell.deadAt !== undefined && cell.deadTo === -1;
              if (!modelDisappeared && !cellDisappeared) {
                // both cells are visible; are they at the same place?
                if (
                  model.nx !== cell.nx ||
                  model.ny !== cell.ny ||
                  model.nr !== cell.nr
                )
                  return;
              } else if (modelDisappeared && !cellDisappeared) {
                // model went out of view; prefer the visible cell
                model = cell;
              } else if (!modelDisappeared && cellDisappeared) {
                // cell went out of view; prefer the model
              } else {
                // modelDisappeared && cellDisappeared
                // both cells disappeared; prefer the one that disappeared last
                if (
                  /** @type {number} */ (cell.deadAt) >
                  /** @type {number} */ (model.deadAt)
                ) {
                  model = cell;
                }
              }
            }
            // we don't want to maintain a separate map for models because indexes are very expensive
            resolution.model = model;
          }
        }

        // all views are synced; merge according to the models
        for (const key of /** @type {const} */ (["cells", "pellets"])) {
          for (const resolution of world[key].values()) {
            const { merged, model } = resolution;
            if (!model) {
              resolution.merged = undefined;
              continue;
            }

            if (!merged) {
              // merged cell doesn't exist; only make it if the cell didn't immediately die
              // otherwise, it would just stay transparent
              if (model.deadAt === undefined) {
                resolution.merged = {
                  id: model.id,
                  ox: model.nx,
                  nx: model.nx,
                  oy: model.ny,
                  ny: model.ny,
                  or: model.nr,
                  nr: model.nr,
                  jr: model.nr,
                  Rgb: model.Rgb,
                  rGb: model.rGb,
                  rgB: model.rgB,
                  jagged: model.jagged,
                  pellet: model.pellet,
                  name: model.name,
                  skin: model.skin,
                  sub: model.sub,
                  clan: model.clan,
                  born: model.born,
                  updated: now,
                  deadAt: undefined,
                  deadTo: -1,
                };
              }
            } else {
              // merged cell *does* exist, move it if the cell is not currently dead
              if (model.deadAt === undefined) {
                if (merged.deadAt === undefined) {
                  const { x, y, r, jr } = world.xyr(merged, undefined, now);
                  merged.ox = x;
                  merged.oy = y;
                  merged.or = r;
                  merged.jr = jr;
                } else {
                  // came back to life (probably back into view)
                  merged.ox = model.nx;
                  merged.oy = model.ny;
                  merged.or = model.nr;
                  merged.jr = model.jr;
                  merged.deadAt = undefined;
                  merged.deadTo = -1;
                  merged.born = now;
                }
                merged.nx = model.nx;
                merged.ny = model.ny;
                merged.nr = model.nr;
                merged.updated = now;
              } else {
                // model died; only kill/update the merged cell once
                if (merged.deadAt === undefined) {
                  merged.deadAt = now;
                  merged.deadTo = model.deadTo;
                  merged.updated = now;
                }
              }
            }
          }
        }
      }
    };

    /** @param {number} view */
    world.score = (view) => {
      let score = 0;
      for (const id of world.views.get(view)?.owned ?? []) {
        const cell = world.cells.get(id)?.merged;
        if (!cell || cell.deadAt !== undefined) continue;
        score += (cell.nr * cell.nr) / 100; // use exact score as given by the server, no interpolation
      }

      return score;
    };

    /**
     * @param {Cell} cell
     * @param {Cell | undefined} killer
     * @param {number} now
     * @returns {{ x: number, y: number, r: number, jr: number }}
     */
    world.xyr = (cell, killer, now) => {
      let a = (now - cell.updated) / settings.drawDelay;
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      let nx = cell.nx;
      let ny = cell.ny;
      if (
        killer &&
        cell.deadAt !== undefined &&
        (killer.deadAt === undefined || cell.deadAt <= killer.deadAt)
      ) {
        // do not animate death towards a cell that died already (went offscreen)
        nx = killer.nx;
        ny = killer.ny;
      }

      const x = cell.ox + (nx - cell.ox) * a;
      const y = cell.oy + (ny - cell.oy) * a;
      const r = cell.or + (cell.nr - cell.or) * a;

      const dt = (now - cell.updated) / 1000;
      return {
        x,
        y,
        r,
        jr: aux.exponentialEase(cell.jr, r, 5, dt), // vanilla uses a factor of 10, but it's basically unusable
      };
    };

    // clean up dead, invisible cells ONLY before uploading pellets
    let lastClean = performance.now();
    world.clean = () => {
      const now = performance.now();
      if (now - lastClean < 200) return;
      for (const key of /** @type {const} */ (["cells", "pellets"])) {
        for (const [id, resolution] of world[key]) {
          for (const [view, cell] of resolution.views) {
            if (cell.deadAt !== undefined && now - cell.deadAt >= 200)
              resolution.views.delete(view);
          }
          if (resolution.views.size === 0) world[key].delete(id);
        }
      }
    };

    // #2 : define stats
    world.stats = {
      foodEaten: 0,
      highestPosition: 200,
      highestScore: 0,
      /** @type {number | undefined} */
      spawnedAt: undefined,
    };

    return world;
  })();

  //////////////////////////
  // Setup All Networking //
  //////////////////////////
  const net = (() => {
    const net = {};

    // #1 : define state
    /** @type {Map<number, {
     * 		handshake: { shuffle: Uint8Array, unshuffle: Uint8Array } | undefined,
     * 		latency: number | undefined,
     *		opened: boolean,
     * 		pinged: number | undefined,
     * 		rejected: boolean,
     * 		respawnBlock: { status: 'left' | 'pending', started: number } | undefined,
     * 		ws: WebSocket | undefined,
     * }>} */
    net.connections = new Map();

    /** @param {number} view */
    net.create = (view) => {
      if (net.connections.has(view)) return;

      net.connections.set(view, {
        handshake: undefined,
        latency: undefined,
        opened: false,
        pinged: undefined,
        rejected: false,
        respawnBlock: undefined,
        ws: connect(view),
      });
    };

    /**
     * @param {number} view
     * @returns {WebSocket | undefined}
     */
    const connect = (view) => {
      if (net.connections.get(view)?.ws) return; // already being handled by another process

      // do not allow sigmod's args[0].includes('sigmally.com') check to pass
      const fakeUrl = /** @type {any} */ ({
        includes: () => false,
        toString: () => net.url(),
      });
      let ws;
      try {
        ws = new destructor.realWebSocket(fakeUrl);
      } catch (err) {
        console.error("can't make WebSocket:", err);
        aux.require(
          null,
          "The server address is invalid. Try changing the server, reloading the page, and " +
            "clearing your browser cache.",
        );
        return; // ts-check is dumb
      }

      destructor.safeWebSockets.add(ws);
      ws.binaryType = "arraybuffer";
      ws.addEventListener("close", () => {
        const connection = net.connections.get(view);
        const vision = world.views.get(view);
        if (!connection || !vision) return; // if the entry no longer exists, don't reconnect

        connection.handshake = undefined;
        connection.latency = undefined;
        connection.pinged = undefined;
        connection.respawnBlock = undefined;
        if (!connection.opened) connection.rejected = true;
        connection.opened = false;

        vision.border = undefined;
        // don't reset vision.camera
        vision.owned = [];
        vision.leaderboard = [];

        for (const key of /** @type {const} */ (["cells", "pellets"])) {
          for (const [id, resolution] of world[key]) {
            resolution.views.delete(view);
            if (resolution.views.size === 0) world[key].delete(id);
          }
        }

        connection.ws = undefined;
        setTimeout(
          () => (connection.ws = connect(view)),
          connection.rejected ? 1500 : 0,
        );
      });
      ws.addEventListener("error", (err) =>
        console.error("WebSocket error:", err),
      );
      ws.addEventListener("message", (e) => {
        const connection = net.connections.get(view);
        const vision = world.views.get(view);
        if (!connection || !vision) return ws.close();
        const dat = new DataView(e.data);

        if (!connection.handshake) {
          // skip version "SIG 0.0.1\0"
          let o = 10;

          const shuffle = new Uint8Array(256);
          const unshuffle = new Uint8Array(256);
          for (let i = 0; i < 256; ++i) {
            const shuffled = dat.getUint8(o + i);
            shuffle[i] = shuffled;
            unshuffle[shuffled] = i;
          }

          connection.handshake = { shuffle, unshuffle };
          return;
        }

        // do this so the packet can easily be sent to sigmod afterwards
        dat.setUint8(0, connection.handshake.unshuffle[dat.getUint8(0)]);

        const now = performance.now();
        let o = 1;
        switch (dat.getUint8(0)) {
          case 0x10: {
            // world update
            if (connection.respawnBlock?.status === "left")
              connection.respawnBlock = undefined;

            // (a) : kills / consumes
            const killCount = dat.getUint16(o, true);
            o += 2;
            for (let i = 0; i < killCount; ++i) {
              const killerId = dat.getUint32(o, true);
              const killedId = dat.getUint32(o + 4, true);
              o += 8;

              const killed = (
                world.pellets.get(killedId) ?? world.cells.get(killedId)
              )?.views.get(view);
              if (killed) {
                killed.deadAt = killed.updated = now;
                killed.deadTo = killerId;
                if (killed.pellet && vision.owned.includes(killerId))
                  ++world.stats.foodEaten;
              }
            }

            // (b) : updates
            do {
              const id = dat.getUint32(o, true);
              o += 4;
              if (id === 0) break;

              const x = dat.getInt16(o, true);
              const y = dat.getInt16(o + 2, true);
              const r = dat.getUint16(o + 4, true);
              const flags = dat.getUint8(o + 6);
              // (void 1 byte, "isUpdate")
              // (void 1 byte, "isPlayer")
              const sub = !!dat.getUint8(o + 9);
              o += 10;

              let clan;
              [clan, o] = aux.readZTString(dat, o);

              /** @type {number | undefined} */
              let Rgb, rGb, rgB;
              if (flags & 0x02) {
                // update color
                Rgb = dat.getUint8(o++) / 255;
                rGb = dat.getUint8(o++) / 255;
                rgB = dat.getUint8(o++) / 255;
              }

              let skin = "";
              if (flags & 0x04) {
                // update skin
                [skin, o] = aux.readZTString(dat, o);
                skin = aux.parseSkin(skin);
              }

              let name = "";
              if (flags & 0x08) {
                // update name
                [name, o] = aux.readZTString(dat, o);
                name = aux.parseName(name);
                if (name) render.textFromCache(name, sub); // make sure the texture is ready on render
              }

              const jagged = !!(flags & 0x11); // spiked or agitated
              const eject = !!(flags & 0x20);
              const pellet = r < 75 && !eject; // tourney servers have bigger pellets
              const cell = (pellet ? world.pellets : world.cells)
                .get(id)
                ?.views.get(view);
              if (cell && cell.deadAt === undefined) {
                const {
                  x: ix,
                  y: iy,
                  r: ir,
                  jr,
                } = world.xyr(cell, undefined, now);
                cell.ox = ix;
                cell.oy = iy;
                cell.or = ir;
                cell.jr = jr;
                cell.nx = x;
                cell.ny = y;
                cell.nr = r;
                cell.jagged = jagged;
                cell.updated = now;

                cell.clan = clan;
                if (Rgb !== undefined) {
                  cell.Rgb = Rgb;
                  cell.rGb = /** @type {number} */ (rGb);
                  cell.rgB = /** @type {number} */ (rgB);
                }
                if (skin) cell.skin = skin;
                if (name) cell.name = name;
                cell.sub = sub;
              } else {
                if (cell?.deadAt !== undefined) {
                  // when respawning, OgarII does not send the description of cells if you spawn in
                  // the same area, despite those cells being deleted from your view area
                  if (Rgb === undefined) ({ Rgb, rGb, rgB } = cell);
                  name ||= cell.name; // note the || and not ??
                  skin ||= cell.skin;
                }

                /** @type {Cell} */
                const ncell = {
                  id,
                  ox: x,
                  nx: x,
                  oy: y,
                  ny: y,
                  or: r,
                  nr: r,
                  jr: r,
                  Rgb: Rgb ?? 1,
                  rGb: rGb ?? 1,
                  rgB: rgB ?? 1,
                  jagged,
                  pellet,
                  updated: now,
                  born: now,
                  deadAt: undefined,
                  deadTo: -1,
                  name,
                  skin,
                  sub,
                  clan,
                };
                let resolution = world[pellet ? "pellets" : "cells"].get(id);
                if (!resolution) {
                  resolution = {
                    merged: undefined,
                    model: undefined,
                    views: new Map(),
                  };
                  world[pellet ? "pellets" : "cells"].set(id, resolution);
                }
                resolution.views.set(view, ncell);
              }
            } while (true);

            // (c) : deletes
            const deleteCount = dat.getUint16(o, true);
            o += 2;
            for (let i = 0; i < deleteCount; ++i) {
              const deletedId = dat.getUint32(o, true);
              o += 4;

              const deleted = (
                world.pellets.get(deletedId) ?? world.cells.get(deletedId)
              )?.views.get(view);
              if (deleted && deleted.deadAt === undefined) {
                deleted.deadAt = now;
                deleted.deadTo = -1;
              }
            }

            // (d) : finalize, upload data
            world.merge();
            world.clean();
            render.upload("pellets");

            // (e) : clear own cells that don't exist anymore (NOT on world.clean!)
            for (let i = 0; i < vision.owned.length; ++i) {
              if (world.cells.has(vision.owned[i])) continue;
              vision.owned.splice(i--, 1);
            }
            ui.deathScreen.check();
            break;
          }

          case 0x11: {
            // update camera pos
            vision.camera.tx = dat.getFloat32(o, true);
            vision.camera.ty = dat.getFloat32(o + 4, true);
            vision.camera.tscale = dat.getFloat32(o + 8, true);
            break;
          }

          case 0x12: {
            // delete all cells
            // happens every time you respawn
            if (connection.respawnBlock?.status === "pending")
              connection.respawnBlock.status = "left";

            // DO NOT just clear the maps! when respawning, OgarII will not resend cell data if we spawn
            // nearby.
            for (const key of /** @type {const} */ (["cells", "pellets"])) {
              for (const resolution of world[key].values()) {
                const cell = resolution.views.get(view);
                if (cell && cell.deadAt === undefined) cell.deadAt = now;
              }
            }
            world.merge();
            render.upload("pellets");
            // passthrough
          }
          case 0x14: {
            // delete my cells
            vision.owned = [];
            ui.deathScreen.check();
            break;
          }

          case 0x20: {
            // new owned cell
            // check if this is the first owned cell
            let first = true;
            for (const [otherView, otherVision] of world.views) {
              for (const id of otherVision.owned) {
                const cell = world.cells.get(id)?.views.get(otherView);
                if (!cell || cell.deadAt !== undefined) continue;
                first = false;
                break;
              }
              if (!first) break;
            }
            if (first) world.stats.spawnedAt = now;

            vision.owned.push(dat.getUint32(o, true));
            break;
          }

          // case 0x30 is a text list (not a numbered list), leave unsupported
          case 0x31: {
            // ffa leaderboard list
            const lb = [];
            const count = dat.getUint32(o, true);
            o += 4;

            /** @type {number | undefined} */
            let myPosition;
            for (let i = 0; i < count; ++i) {
              const me = !!dat.getUint32(o, true);
              o += 4;

              let name;
              [name, o] = aux.readZTString(dat, o);
              name = aux.parseName(name);

              // why this is copied into every leaderboard entry is beyond my understanding
              myPosition = dat.getUint32(o, true);
              const sub = !!dat.getUint32(o + 4, true);
              o += 8;

              lb.push({ name, sub, me, place: undefined });
            }

            if (myPosition !== undefined) {
              if (myPosition - 1 >= lb.length) {
                /** @type {HTMLInputElement | null} */
                const inputName = document.querySelector("input#nick");
                lb.push({
                  me: true,
                  name: aux.parseName(inputName?.value ?? ""),
                  place: myPosition,
                  sub: false, // doesn't matter
                });
              }

              world.stats.highestPosition = Math.min(
                world.stats.highestPosition,
                myPosition,
              );
            }

            vision.leaderboard = lb;
            break;
          }

          case 0x40: {
            // border update
            vision.border = {
              l: dat.getFloat64(o, true),
              t: dat.getFloat64(o + 8, true),
              r: dat.getFloat64(o + 16, true),
              b: dat.getFloat64(o + 24, true),
            };
            break;
          }

          case 0x63: {
            // chat message
            // only handle chat messages on the primary tab, to prevent duplicate messages
            // this means that command responses won't be shown on the secondary tab but who actually cares
            if (view !== world.viewId.primary) return;
            const flags = dat.getUint8(o++);
            const rgb =
              /** @type {[number, number, number, number]} */
              ([
                dat.getUint8(o++) / 255,
                dat.getUint8(o++) / 255,
                dat.getUint8(o++) / 255,
                1,
              ]);

            let name;
            [name, o] = aux.readZTString(dat, o);
            let msg;
            [msg, o] = aux.readZTString(dat, o);
            ui.chat.add(name, rgb, msg, !!(flags & 0x80));
            break;
          }

          case 0xb4: {
            // incorrect password alert
            ui.error("Password is incorrect");
            break;
          }

          case 0xdd: {
            net.howarewelosingmoney(view);
            break;
          }

          case 0xfe: {
            // server stats (in response to a ping)
            let statString;
            [statString, o] = aux.readZTString(dat, o);
            vision.stats = JSON.parse(statString);
            if (connection.pinged === -1) connection.latency = -1;
            else if (connection.pinged !== undefined)
              connection.latency = now - connection.pinged;
            connection.pinged = undefined;
            break;
          }
        }

        sigmod.proxy.handleMessage?.(dat);
      });
      ws.addEventListener("open", (e) => {
        const connection = net.connections.get(view);
        const vision = world.views.get(view);
        if (!connection || !vision) return ws.close();

        connection.rejected = false;
        connection.opened = true;

        vision.camera.x = vision.camera.tx = 0;
        vision.camera.y = vision.camera.ty = 0;
        vision.camera.scale = input.zoom;
        vision.camera.tscale = 1;
        ws.send(aux.textEncoder.encode("SIG 0.0.1\x00"));
      });

      return ws;
    };

    // ping loop
    setInterval(() => {
      for (const connection of net.connections.values()) {
        if (
          !connection.handshake ||
          connection.ws?.readyState !== WebSocket.OPEN
        )
          continue;
        connection.pinged = performance.now();
        connection.ws.send(connection.handshake.shuffle.slice(0xfe, 0xfe + 1));
      }
    }, 2000);

    // #2 : define helper functions
    /** @type {HTMLSelectElement | null} */
    const gamemode = document.querySelector("#gamemode");
    /** @type {HTMLOptionElement | null} */
    const firstGamemode = document.querySelector("#gamemode option");
    net.url = () => {
      if (location.search.startsWith("?ip="))
        return location.search.slice("?ip=".length);
      else
        return (
          "wss://" +
          (gamemode?.value || firstGamemode?.value || "ca0.sigmally.com/ws/")
        );
    };

    // disconnect if a different gamemode is selected
    // an interval is preferred because the game can apply its gamemode setting *after* connecting without
    // triggering any events
    setInterval(() => {
      for (const connection of net.connections.values()) {
        if (!connection.ws) continue;
        if (
          connection.ws.readyState !== WebSocket.CONNECTING &&
          connection.ws.readyState !== WebSocket.OPEN
        )
          continue;
        if (connection.ws.url === net.url()) continue;
        connection.ws.close();
      }
    }, 200);

    /**
     * @param {number} view
     * @param {number} opcode
     * @param {object} data
     */
    const sendJson = (view, opcode, data) => {
      // must check readyState as a weboscket might be in the 'CLOSING' state (so annoying!)
      const connection = net.connections.get(view);
      if (
        !connection?.handshake ||
        connection.ws?.readyState !== WebSocket.OPEN
      )
        return;
      const dataBuf = aux.textEncoder.encode(JSON.stringify(data));
      const dat = new DataView(new ArrayBuffer(dataBuf.byteLength + 2));

      dat.setUint8(0, connection.handshake.shuffle[opcode]);
      for (let i = 0; i < dataBuf.byteLength; ++i) {
        dat.setUint8(1 + i, dataBuf[i]);
      }
      connection.ws.send(dat);
    };

    // #5 : export input functions
    /**
     * @param {number} view
     * @param {number} x
     * @param {number} y
     */
    net.move = (view, x, y) => {
      const connection = net.connections.get(view);
      if (
        !connection?.handshake ||
        connection.ws?.readyState !== WebSocket.OPEN
      )
        return;
      const dat = new DataView(new ArrayBuffer(13));

      dat.setUint8(0, connection.handshake.shuffle[0x10]);
      dat.setInt32(1, x, true);
      dat.setInt32(5, y, true);
      connection.ws.send(dat);

      sigmod.proxy.isPlaying?.(); // without this, the respawn key will build up timeouts and make the game laggy
    };

    /** @param {number} opcode */
    const bindOpcode = (opcode) => /** @param {number} view */ (view) => {
      const connection = net.connections.get(view);
      if (
        !connection?.handshake ||
        connection.ws?.readyState !== WebSocket.OPEN
      )
        return;
      connection.ws.send(
        connection.handshake.shuffle.slice(opcode, opcode + 1),
      );
    };
    net.w = bindOpcode(21);
    net.qdown = bindOpcode(18);
    net.qup = bindOpcode(19);
    net.split = bindOpcode(17);

    // reversed argument order for sigmod compatibility
    /**
     * @param {string} msg
     * @param {number=} view
     */
    net.chat = (msg, view = world.selected) => {
      const connection = net.connections.get(view);
      if (
        !connection?.handshake ||
        connection.ws?.readyState !== WebSocket.OPEN
      )
        return;
      const msgBuf = aux.textEncoder.encode(msg);
      const dat = new DataView(new ArrayBuffer(msgBuf.byteLength + 3));

      dat.setUint8(0, connection.handshake.shuffle[0x63]);
      // skip flags
      for (let i = 0; i < msgBuf.byteLength; ++i) {
        dat.setUint8(2 + i, msgBuf[i]);
      }
      connection.ws.send(dat);
    };

    /**
     * @param {number} view
     * @param {{ name: string, skin: string, [x: string]: any }} data
     */
    net.play = (view, data) => {
      sendJson(view, 0x00, data);
    };

    /** @param {number} view */
    net.howarewelosingmoney = (view) => {
      // this is a new thing added with the rest of the recent source code obfuscation (2024/02/18)
      // which collects and links to your sigmally account, seemingly just for light data analysis but probably
      // just for the fun of it:
      // - your IP and country
      // - whether you are under a proxy
      // - whether you are using sigmod (because it also blocks ads)
      // - whether you are using a traditional adblocker
      //
      // so, no thank you
      // TODO: this has been updated. check case 221 (which is 0xdd).
      sendJson(view, 0xd0, {
        ip: "",
        country: "",
        proxy: false,
        user: null,
        blocker: "sigmally fixes @8y8x",
      });
    };

    // create initial connection
    world.create(world.viewId.primary);
    net.create(world.viewId.primary);
    let lastChangedSpectate = -Infinity;
    setInterval(() => {
      if (!settings.multibox) world.selected = world.viewId.primary;
      if (settings.spectator) {
        const vision = world.create(world.viewId.spectate);
        net.create(world.viewId.spectate);
        net.play(world.viewId.spectate, {
          name: "",
          skin: "",
          clan: aux.userData?.clan,
          state: 2,
        });

        // only press Q to toggle once in a while, in case ping is above 200
        const now = performance.now();
        if (now - lastChangedSpectate > 1000) {
          if (vision.camera.tscale > 0.39) {
            // when roaming, the spectate scale is set to ~0.4
            net.qdown(world.viewId.spectate);
          }
        } else {
          net.qup(world.viewId.spectate); // doubly serves as anti-afk
        }
      } else {
        const con = net.connections.get(world.viewId.spectate);
        if (
          con?.ws &&
          con?.ws.readyState !== WebSocket.CLOSED &&
          con?.ws.readyState !== WebSocket.CLOSING
        ) {
          con?.ws.close();
        }
        net.connections.delete(world.viewId.spectate);
        world.views.delete(world.viewId.spectate);
        input.views.delete(world.viewId.spectate);

        for (const key of /** @type {const} */ (["cells", "pellets"])) {
          for (const [id, resolution] of world[key]) {
            resolution.views.delete(world.viewId.spectate);
            if (resolution.views.size === 0) world[key].delete(id);
          }
        }
      }
    }, 200);

    return net;
  })();

  //////////////////////////
  // Setup Input Handlers //
  //////////////////////////
  const input = (() => {
    const input = {};

    // #1 : general inputs
    // between -1 and 1
    /** @type {[number, number]} */
    input.current = [0, 0];
    /** @type {Map<number, {
     * 		forceW: boolean,
     * 		lock: { mouse: [number, number], world: [number, number], until: number } | undefined,
     * 		mouse: [number, number], // between -1 and 1
     * 		w: boolean,
     * 		world: [number, number], // world position; only updates when tab is selected
     * }>} */
    input.views = new Map();
    input.zoom = 1;

    /** @param {number} view */
    const create = (view) => {
      const old = input.views.get(view);
      if (old) return old;

      /** @type {typeof input.views extends Map<number, infer T> ? T : never} */
      const inputs = {
        forceW: false,
        lock: undefined,
        mouse: [0, 0],
        w: false,
        world: [0, 0],
      };
      input.views.set(view, inputs);
      return inputs;
    };

    /**
     * @param {number} view
     * @param {[number, number]} x, y
     * @returns {[number, number]}
     */
    input.toWorld = (view, [x, y]) => {
      const camera = world.views.get(view)?.camera;
      if (!camera) return [0, 0];
      return [
        camera.x + (x * (innerWidth / innerHeight) * 540) / camera.scale,
        camera.y + (y * 540) / camera.scale,
      ];
    };

    // sigmod freezes the player by overlaying an invisible div, so we just listen for canvas movements instead
    addEventListener("mousemove", (e) => {
      if (ui.escOverlayVisible()) return;
      // sigmod freezes the player by overlaying an invisible div, so we respect it
      if (
        e.target instanceof HTMLDivElement &&
        /** @type {CSSUnitValue | undefined} */ (
          e.target.attributeStyleMap.get("z-index")
        )?.value === 99
      )
        return;
      input.current = [
        (e.clientX / innerWidth) * 2 - 1,
        (e.clientY / innerHeight) * 2 - 1,
      ];
    });

    const unfocused = () =>
      ui.escOverlayVisible() || document.activeElement?.tagName === "INPUT";

    /**
     * @param {number} view
     * @param {boolean} forceUpdate
     */
    input.move = (view, forceUpdate) => {
      const now = performance.now();
      const inputs = input.views.get(view) ?? create(view);
      if (inputs.lock && now <= inputs.lock.until) {
        const d = Math.hypot(
          input.current[0] - inputs.lock.mouse[0],
          input.current[1] - inputs.lock.mouse[1],
        );
        // only lock the mouse as long as the mouse has not moved further than 25% (of 2) of the screen away
        if (d < 0.5) {
          net.move(view, ...inputs.lock.world);
          return;
        }
      }

      inputs.lock = undefined;
      if (world.selected === view || forceUpdate) {
        inputs.world = input.toWorld(view, (inputs.mouse = input.current));
      }
      net.move(view, ...inputs.world);
    };

    setInterval(() => {
      create(world.selected);
      for (const [view, inputs] of input.views) {
        input.move(view, false);
        // if tapping W very fast, make sure at least one W is ejected
        if (inputs.forceW || inputs.w) net.w(view);
        inputs.forceW = false;
      }
    }, 40);

    addEventListener("wheel", (e) => {
      if (unfocused()) return;
      // support for the very obscure "scroll by page" setting in windows
      // i don't think browsers support DOM_DELTA_LINE, so assume DOM_DELTA_PIXEL otherwise
      const deltaY =
        e.deltaMode === e.DOM_DELTA_PAGE ? e.deltaY : e.deltaY / 100;
      input.zoom *= 0.8 ** (deltaY * settings.scrollFactor);
      const minZoom =
        !settings.multibox && !aux.settings.zoomout ? 1 : 0.8 ** 15;
      input.zoom = Math.min(Math.max(input.zoom, minZoom), 0.8 ** -21);
    });

    /**
     * @param {string} name
     * @param {boolean} spectating
     */
    const playData = (name, spectating) => {
      /** @type {HTMLInputElement | null} */
      const password = document.querySelector("input#password");

      return {
        state: spectating ? 2 : undefined,
        name,
        skin: aux.settings.skin,
        token: aux.token?.token,
        sub: (aux.userData?.subscription ?? 0) > Date.now(),
        clan: aux.userData?.clan,
        showClanmates: aux.settings.showClanmates,
        password: password?.value,
      };
    };

    /** @type {HTMLInputElement} */
    const nickElement = aux.require(
      document.querySelector("input#nick"),
      "Can't find the nickname element. Try reloading the page?",
    );
    const secondaryNickElement = /** @type {HTMLInputElement} */ (
      nickElement?.cloneNode(true)
    );
    secondaryNickElement.style.display = settings.multibox ? "" : "none";
    setInterval(
      () =>
        (secondaryNickElement.style.display = settings.multibox ? "" : "none"),
      200,
    );
    // this apparently just works perfectly in vanilla and sigmod
    nickElement.parentElement?.appendChild(secondaryNickElement);

    // sigmod probably won't apply this to the second nick element, so we do it ourselves too
    nickElement.maxLength = secondaryNickElement.maxLength = 50;

    addEventListener("keydown", (e) => {
      const view = world.selected;
      const inputs = input.views.get(view) ?? create(view);
      if (
        settings.multibox &&
        e.key.toLowerCase() === settings.multibox.toLowerCase()
      ) {
        e.preventDefault(); // prevent selecting anything on the page
        if (settings.multibox) {
          inputs.w = false; // stop current tab from feeding; don't change forceW
          // update mouse immediately (after setTimeout, when mouse events happen)
          setTimeout(
            () =>
              (inputs.world = input.toWorld(
                view,
                (inputs.mouse = input.current),
              )),
          );

          // swap tabs
          if (world.selected === world.viewId.primary)
            world.selected = world.viewId.secondary;
          else world.selected = world.viewId.primary;
          world.create(world.selected);
          net.create(world.selected);
        }

        // also, press play on the current tab ONLY if any tab is alive
        if (world.alive()) {
          const name =
            world.selected === world.viewId.primary
              ? nickElement.value
              : secondaryNickElement.value;
          net.play(world.selected, playData(name, false));
        }
        return;
      }

      if (e.code === "Escape") {
        if (document.activeElement === ui.chat.input) ui.chat.input.blur();
        else ui.toggleEscOverlay();
        return;
      }

      if (unfocused()) {
        if (
          e.code === "Enter" &&
          document.activeElement === ui.chat.input &&
          ui.chat.input.value.length > 0
        ) {
          net.chat(ui.chat.input.value.slice(0, 15), world.selected);
          ui.chat.input.value = "";
          ui.chat.input.blur();
        }

        return;
      }

      if (settings.blockBrowserKeybinds) {
        if (e.code === "F11") {
          // force true fullscreen to make sure Ctrl+W and other binds are caught.
          // not well supported on safari
          if (!document.fullscreenElement) {
            document.body.requestFullscreen?.()?.catch(() => {});
            /** @type {any} */ (navigator).keyboard?.lock()?.catch(() => {});
          } else {
            document.exitFullscreen?.()?.catch(() => {});
            /** @type {any} */ (navigator).keyboard?.unlock()?.catch(() => {});
          }
        }
        e.preventDefault();
      } else if (e.ctrlKey && e.code === "KeyW") {
        e.preventDefault(); // doesn't seem to work for me, but works for others
      }

      // if fast feed is rebound, only allow the spoofed W's from sigmod
      let fastFeeding = e.code === "KeyW";
      if (
        sigmod.settings.rapidFeedKey &&
        sigmod.settings.rapidFeedKey !== "w"
      ) {
        fastFeeding &&= !e.isTrusted;
      }
      if (fastFeeding) inputs.forceW = inputs.w = true;

      switch (e.code) {
        case "KeyQ":
          if (!e.repeat) net.qdown(world.selected);
          break;
        case "Space": {
          if (!e.repeat) {
            // send mouse position immediately, so the split will go in the correct direction.
            // setTimeout is used to ensure that our mouse position is actually updated (it comes after
            // keydown events)
            setTimeout(() => {
              input.move(view, true);
              net.split(view);
            });
          }
          break;
        }
        case "Enter": {
          ui.chat.input.focus();
          break;
        }
      }

      if (
        e.isTrusted &&
        e.key.toLowerCase() === sigmod.settings.tripleKey?.toLowerCase()
      ) {
        inputs.lock ||= {
          mouse: inputs.mouse,
          world: input.toWorld(world.selected, inputs.mouse),
          until: performance.now() + 650,
        };
      }
    });

    addEventListener("keyup", (e) => {
      // allow inputs if unfocused
      if (e.code === "KeyQ") net.qup(world.selected);
      else if (e.code === "KeyW") {
        const inputs =
          input.views.get(world.selected) ?? create(world.selected);
        inputs.w = false; // don't change forceW
      }
    });

    // prompt before closing window
    addEventListener("beforeunload", (e) => e.preventDefault());

    // prevent right clicking on the game
    ui.game.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // prevent dragging when some things are selected - i have a habit of unconsciously clicking all the time,
    // making me regularly drag text, disabling my mouse inputs for a bit
    addEventListener("dragstart", (e) => e.preventDefault());

    // #2 : play and spectate buttons, and captcha
    /** @type {HTMLButtonElement} */
    const play = aux.require(
      document.querySelector("button#play-btn"),
      "Can't find the play button. Try reloading the page?",
    );
    /** @type {HTMLButtonElement} */
    const spectate = aux.require(
      document.querySelector("button#spectate-btn"),
      "Can't find the spectate button. Try reloading the page?",
    );

    play.disabled = spectate.disabled = true;
    const playText = play.textContent;

    (async () => {
      const mount = document.createElement("div");
      mount.id = "sf-captcha-mount";
      mount.style.display = "none";
      play.parentNode?.insertBefore(mount, play);

      /** @type {Set<() => void> | undefined} */
      let onGrecaptchaReady = new Set();
      /** @type {Set<() => void> | undefined} */
      let onTurnstileReady = new Set();
      let grecaptcha, turnstile, CAPTCHA2, CAPTCHA3, TURNSTILE;

      let readyCheck;
      readyCheck = setInterval(() => {
        // it's possible that recaptcha or turnstile may be removed in the future, so we be redundant to stay
        // safe
        if (onGrecaptchaReady) {
          ({ grecaptcha, CAPTCHA2, CAPTCHA3 } = /** @type {any} */ (window));
          if (grecaptcha?.ready && CAPTCHA2 && CAPTCHA3) {
            const handlers = onGrecaptchaReady;
            onGrecaptchaReady = undefined;

            grecaptcha.ready(() => {
              handlers.forEach((cb) => cb());
              // prevent game.js from using grecaptcha and messing things up
              ({ grecaptcha } = /** @type {any} */ (window));
              /** @type {any} */ (window).grecaptcha = {
                execute: () => {},
                ready: () => {},
                render: () => {},
                reset: () => {},
              };
            });
          }
        }

        if (onTurnstileReady) {
          ({ turnstile, TURNSTILE } = /** @type {any} */ (window));
          if (turnstile?.ready && TURNSTILE) {
            const handlers = onTurnstileReady;
            onTurnstileReady = undefined;
            handlers.forEach((cb) => cb());

            // prevent game.js from using turnstile and messing things up
            /** @type {any} */ (window).turnstile = {
              execute: () => {},
              ready: () => {},
              render: () => {},
              reset: () => {},
            };
          }
        }

        if (!onGrecaptchaReady && !onTurnstileReady) clearInterval(readyCheck);
      }, 50);

      /**
       * @param {string} url
       * @returns {Promise<string>}
       */
      const tokenVariant = async (url) => {
        const host = new URL(url).host;
        if (host.includes("sigmally.com"))
          return aux
            .oldFetch(`https://${host}/server/recaptcha/v3`)
            .then((res) => res.json())
            .then((res) => res.version ?? "none");
        else return Promise.resolve("none");
      };

      /** @type {unique symbol} */
      const used = Symbol();
      /** @type {unique symbol} */
      const waiting = Symbol();
      let nextTryAt = 0;
      /** @type {undefined | typeof waiting | typeof used
       * | { variant: string, token: string | undefined }} */
      let token = undefined;
      /** @type {string | undefined} */
      let turnstileHandle;
      /** @type {number | undefined} */
      let v2Handle;

      input.captchaAcceptedAt = undefined;

      /**
       * @param {string} url
       * @param {string} variant
       * @param {string | undefined} captchaToken
       */
      const publishToken = (url, variant, captchaToken) => {
        const url2 = net.url();
        play.textContent = `${playText} (validating)`;
        if (url === url2) {
          const host = new URL(url).host;
          aux
            .oldFetch(`https://${host}/server/recaptcha/v3`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ token: captchaToken }),
            })
            .then((res) => res.json())
            .then((res) => {
              if (res.status === "complete") {
                token = used;
                play.disabled = spectate.disabled = false;
                play.textContent = playText;
                input.captchaAcceptedAt = performance.now();
                net.rejected = false; // wait until we try connecting again
              }
            })
            .catch((err) => {
              play.textContent = playText;
              token = undefined;
              nextTryAt = performance.now() + 400;
              throw err;
            });
        } else {
          token = { variant, token: captchaToken };
        }
      };

      setInterval(() => {
        const con = net.connections.get(world.selected);
        if (!con) return;

        const canPlay = !net.rejected && con?.ws?.readyState === WebSocket.OPEN;
        if (play.disabled !== !canPlay) {
          play.disabled = spectate.disabled = !canPlay;
          play.textContent = playText;
        }

        if (token === waiting) return;
        if (!con.rejected) return;

        const url = net.url();

        if (typeof token !== "object") {
          // get a new token if first time, or if we're on a new connection now
          if (performance.now() < nextTryAt) return;

          token = waiting;
          play.disabled = spectate.disabled = true;
          play.textContent = `${playText} (getting type)`;
          tokenVariant(url)
            .then(async (variant) => {
              const url2 = net.url();
              if (url !== url2) {
                // server changed and may want a different variant; restart
                token = undefined;
                return;
              }

              if (variant === "v2") {
                mount.style.display = "block";
                play.style.display = spectate.style.display = "none";
                play.textContent = playText;
                if (v2Handle !== undefined) {
                  grecaptcha.reset(v2Handle);
                } else {
                  const cb = () =>
                    void (v2Handle = grecaptcha.render("sf-captcha-mount", {
                      sitekey: CAPTCHA2,
                      callback: (v2) => {
                        mount.style.display = "none";
                        play.style.display = spectate.style.display = "";
                        publishToken(url, variant, v2);
                      },
                    }));
                  if (onGrecaptchaReady) onGrecaptchaReady.add(cb);
                  else grecaptcha.ready(cb);
                }
              } else if (variant === "v3") {
                play.textContent = `${playText} (solving)`;
                const cb = () =>
                  grecaptcha
                    .execute(CAPTCHA3)
                    .then((v3) => publishToken(url, variant, v3));
                if (onGrecaptchaReady) onGrecaptchaReady.add(cb);
                else grecaptcha.ready(cb);
              } else if (variant === "turnstile") {
                mount.style.display = "block";
                play.style.display = spectate.style.display = "none";
                play.textContent = playText;
                if (turnstileHandle !== undefined) {
                  turnstile.reset(turnstileHandle);
                } else {
                  const cb = () =>
                    void (turnstileHandle = turnstile.render(
                      "#sf-captcha-mount",
                      {
                        sitekey: TURNSTILE,
                        callback: (turnstileToken) => {
                          mount.style.display = "none";
                          play.style.display = spectate.style.display = "";
                          publishToken(url, variant, turnstileToken);
                        },
                      },
                    ));
                  if (onTurnstileReady) onTurnstileReady.add(cb);
                  else cb();
                }
              } else {
                // server wants "none" or unknown token variant; don't show a captcha
                publishToken(url, variant, undefined);
                play.disabled = spectate.disabled = false;
                play.textContent = playText;
              }
            })
            .catch((err) => {
              token = undefined;
              nextTryAt = performance.now() + 400;
              console.warn("Error while getting token variant:", err);
            });
        } else {
          // token is ready to be used, check variant
          const got = token;
          token = waiting;
          play.disabled = spectate.disabled = true;
          play.textContent = `${playText} (getting type)`;
          tokenVariant(url)
            .then((variant2) => {
              if (got.variant !== variant2) {
                // server wants a different token variant
                token = undefined;
              } else publishToken(url, got.variant, got.token);
            })
            .catch((err) => {
              token = got;
              nextTryAt = performance.now() + 400;
              console.warn("Error while getting token variant:", err);
            });
        }
      }, 100);

      /** @param {MouseEvent} e */
      async function clickHandler(e) {
        const name =
          world.selected === world.viewId.primary
            ? nickElement.value
            : secondaryNickElement.value;

        const con = net.connections.get(world.selected);
        if (!con || con.rejected) return;
        ui.toggleEscOverlay(false);
        if (e.currentTarget === spectate) {
          // you should be able to escape sigmod auto-respawn and spectate as long as you don't have mass
          const score = world.score(world.selected);
          if (0 < score && score < 5500) {
            world.stats.spawnedAt = undefined; // prevent death screen from appearing
            net.chat("/leaveworld", world.selected); // instant respawn
            net.play(world.selected, playData(name, true)); // required, idk why
            // spectating doesn't automatically put you back into the world
            net.chat("/joinworld 1", world.selected);
          }
        }

        net.play(world.selected, playData(name, e.currentTarget === spectate));
      }

      play.addEventListener("click", clickHandler);
      spectate.addEventListener("click", clickHandler);
    })();

    return input;
  })();

  //////////////////////////
  // Configure WebGL Data //
  //////////////////////////
  const glconf = (() => {
    // note: WebGL functions only really return null if the context is lost - in which case, data will be replaced
    // anyway after it's restored. so, we cast everything to a non-null type.
    const glconf = {};
    const programs = (glconf.programs = {});
    const uniforms = (glconf.uniforms = {});
    /** @type {WebGLBuffer} */
    glconf.pelletAlphaBuffer = /** @type {never} */ (undefined);
    /** @type {WebGLBuffer} */
    glconf.pelletBuffer = /** @type {never} */ (undefined);
    /** @type {{
     * 	vao: WebGLVertexArrayObject,
     * 	circleBuffer: WebGLBuffer,
     * 	alphaBuffer: WebGLBuffer,
     * 	alphaBufferSize: number }[]} */
    glconf.vao = [];

    const gl = ui.game.gl;
    /** @type {Map<string, number>} */
    const uboBindings = new Map();

    /**
     * @param {string} name
     * @param {number} type
     * @param {string} source
     */
    function shader(name, type, source) {
      const s = /** @type {WebGLShader} */ (gl.createShader(type));
      gl.shaderSource(s, source);
      gl.compileShader(s);

      // note: compilation errors should not happen in production
      aux.require(
        gl.getShaderParameter(s, gl.COMPILE_STATUS) || gl.isContextLost(),
        `Can\'t compile WebGL2 shader "${name}". You might be on a weird browser.\n\nFull error log:\n` +
          gl.getShaderInfoLog(s),
      );

      return s;
    }

    /**
     * @param {string} name
     * @param {string} vSource
     * @param {string} fSource
     * @param {string[]} ubos
     * @param {string[]} textures
     */
    function program(name, vSource, fSource, ubos, textures) {
      const vShader = shader(
        `${name}.vShader`,
        gl.VERTEX_SHADER,
        vSource.trim(),
      );
      const fShader = shader(
        `${name}.fShader`,
        gl.FRAGMENT_SHADER,
        fSource.trim(),
      );
      const p = /** @type {WebGLProgram} */ (gl.createProgram());

      gl.attachShader(p, vShader);
      gl.attachShader(p, fShader);
      gl.linkProgram(p);

      // note: linking errors should not happen in production
      aux.require(
        gl.getProgramParameter(p, gl.LINK_STATUS) || gl.isContextLost(),
        `Can\'t link WebGL2 program "${name}". You might be on a weird browser.\n\nFull error log:\n` +
          gl.getProgramInfoLog(p),
      );

      for (const tag of ubos) {
        const index = gl.getUniformBlockIndex(p, tag); // returns 4294967295 if invalid... just don't make typos
        let binding = uboBindings.get(tag);
        if (binding === undefined)
          uboBindings.set(tag, (binding = uboBindings.size));
        gl.uniformBlockBinding(p, index, binding);

        const size = gl.getActiveUniformBlockParameter(
          p,
          index,
          gl.UNIFORM_BLOCK_DATA_SIZE,
        );
        const ubo = (uniforms[tag] = gl.createBuffer());
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
        gl.bufferData(gl.UNIFORM_BUFFER, size, gl.DYNAMIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, binding, ubo);
      }

      // bind texture uniforms to TEXTURE0, TEXTURE1, etc.
      gl.useProgram(p);
      for (let i = 0; i < textures.length; ++i) {
        const loc = gl.getUniformLocation(p, textures[i]);
        gl.uniform1i(loc, i);
      }
      gl.useProgram(null);

      return p;
    }

    const parts = {
      boilerplate:
        "#version 300 es\nprecision highp float; precision highp int;",
      borderUbo: `layout(std140) uniform Border { // size = 0x28
				vec4 u_border_color; // @ 0x00, i = 0
				vec4 u_border_xyzw_lrtb; // @ 0x10, i = 4
				int u_border_flags; // @ 0x20, i = 8
				float u_background_width; // @ 0x24, i = 9
				float u_background_height; // @ 0x28, i = 10
				float u_border_time; // @ 0x2c, i = 11
			};`,
      cameraUbo: `layout(std140) uniform Camera { // size = 0x10
				float u_camera_ratio; // @ 0x00
				float u_camera_scale; // @ 0x04
				vec2 u_camera_pos; // @ 0x08
			};`,
      cellUbo: `layout(std140) uniform Cell { // size = 0x28
				float u_cell_radius; // @ 0x00, i = 0
				float u_cell_radius_skin; // @ 0x04, i = 1
				vec2 u_cell_pos; // @ 0x08, i = 2
				vec4 u_cell_color; // @ 0x10, i = 4
				float u_cell_alpha; // @ 0x20, i = 8
				int u_cell_flags; // @ 0x24, i = 9
			};`,
      cellSettingsUbo: `layout(std140) uniform CellSettings { // size = 0x40
				vec4 u_cell_active_outline; // @ 0x00
				vec4 u_cell_inactive_outline; // @ 0x10
				vec4 u_cell_unsplittable_outline; // @ 0x20
				vec4 u_cell_subtle_outline_override; // @ 0x30
				float u_cell_active_outline_thickness; // @ 0x40
			};`,
      circleUbo: `layout(std140) uniform Circle { // size = 0x08
				float u_circle_alpha; // @ 0x00
				float u_circle_scale; // @ 0x04
			};`,
      textUbo: `layout(std140) uniform Text { // size = 0x38
				vec4 u_text_color1; // @ 0x00, i = 0
				vec4 u_text_color2; // @ 0x10, i = 4
				float u_text_alpha; // @ 0x20, i = 8
				float u_text_aspect_ratio; // @ 0x24, i = 9
				float u_text_scale; // @ 0x28, i = 10
				int u_text_silhouette_enabled; // @ 0x2c, i = 11
				vec2 u_text_offset; // @ 0x30, i = 12
			};`,
      tracerUbo: `layout(std140) uniform Tracer { // size = 0x10
				vec2 u_tracer_pos1; // @ 0x00, i = 0
				vec2 u_tracer_pos2; // @ 0x08, i = 2
			};`,
    };

    glconf.init = () => {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // create programs and uniforms
      programs.bg = program(
        "bg",
        `
				${parts.boilerplate}
				layout(location = 0) in vec2 a_vertex;
				${parts.borderUbo}
				${parts.cameraUbo}
				flat out float f_blur;
				flat out float f_thickness;
				out vec2 v_uv;
				out vec2 v_world_pos;
 
				void main() {
					f_blur = 1.0 * (540.0 * u_camera_scale);
					f_thickness = max(3.0 / f_blur, 25.0); // force border to always be visible, otherwise it flickers
 
					v_world_pos = a_vertex * vec2(u_camera_ratio, 1.0) / u_camera_scale;
					v_world_pos += u_camera_pos * vec2(1.0, -1.0);
 
					if ((u_border_flags & 0x04) != 0) { // background repeating
						v_uv = v_world_pos * 0.02 * (50.0 / u_background_width);
						v_uv /= vec2(1.0, u_background_height / u_background_width);
					} else {
						v_uv = (v_world_pos - vec2(u_border_xyzw_lrtb.x, u_border_xyzw_lrtb.z))
							/ vec2(u_border_xyzw_lrtb.y - u_border_xyzw_lrtb.x,
								u_border_xyzw_lrtb.w - u_border_xyzw_lrtb.z);
						v_uv = vec2(v_uv.x, 1.0 - v_uv.y); // flip vertically
					}
 
					gl_Position = vec4(a_vertex, 0, 1); // span the whole screen
				}
			`,
        `
				${parts.boilerplate}
				flat in float f_blur;
				flat in float f_thickness;
				in vec2 v_uv;
				in vec2 v_world_pos;
				${parts.borderUbo}
				${parts.cameraUbo}
				uniform sampler2D u_texture;
				out vec4 out_color;
 
				void main() {
					if ((u_border_flags & 0x01) != 0) { // background enabled
						if ((u_border_flags & 0x04) != 0 // repeating
							|| (0.0 <= min(v_uv.x, v_uv.y) && max(v_uv.x, v_uv.y) <= 1.0)) { // within border
							out_color = texture(u_texture, v_uv);
						}
					}
 
					// make a larger inner rectangle and a normal inverted outer rectangle
					float inner_alpha = min(
						min((v_world_pos.x + f_thickness) - u_border_xyzw_lrtb.x,
							u_border_xyzw_lrtb.y - (v_world_pos.x - f_thickness)),
						min((v_world_pos.y + f_thickness) - u_border_xyzw_lrtb.z,
							u_border_xyzw_lrtb.w - (v_world_pos.y - f_thickness))
					);
					float outer_alpha = max(
						max(u_border_xyzw_lrtb.x - v_world_pos.x, v_world_pos.x - u_border_xyzw_lrtb.y),
						max(u_border_xyzw_lrtb.z - v_world_pos.y, v_world_pos.y - u_border_xyzw_lrtb.w)
					);
					float alpha = clamp(f_blur * min(inner_alpha, outer_alpha), 0.0, 1.0);
					if (u_border_color.a == 0.0) alpha = 0.0;
 
					vec4 border_color;
					if ((u_border_flags & 0x08) != 0) { // rainbow border
						float angle = atan(v_world_pos.y, v_world_pos.x) + u_border_time;
						float red = (2.0/3.0) * cos(6.0 * angle) + 1.0/3.0;
						float green = (2.0/3.0) * cos(6.0 * angle - 2.0 * 3.1415926535 / 3.0) + 1.0/3.0;
						float blue = (2.0/3.0) * cos(6.0 * angle - 4.0 * 3.1415926535 / 3.0) + 1.0/3.0;
						border_color = vec4(red, green, blue, 1.0);
					} else {
						border_color = u_border_color;
					}
 
					out_color = out_color * (1.0 - alpha) + border_color * alpha;
				}
			`,
        ["Border", "Camera"],
        ["u_texture"],
      );

      programs.cell = program(
        "cell",
        `
				${parts.boilerplate}
				layout(location = 0) in vec2 a_vertex;
				${parts.cameraUbo}
				${parts.cellUbo}
				${parts.cellSettingsUbo}
				flat out vec4 f_active_outline;
				flat out float f_active_radius;
				flat out float f_blur;
				flat out int f_show_skin;
				flat out vec4 f_subtle_outline;
				flat out float f_subtle_radius;
				flat out vec4 f_unsplittable_outline;
				flat out float f_unsplittable_radius;
				out vec2 v_vertex;
				out vec2 v_uv;
 
				void main() {
					f_blur = 0.5 * u_cell_radius * (540.0 * u_camera_scale);
					f_show_skin = u_cell_flags & 0x01;
 
					// subtle outlines (at least 1px wide)
					float subtle_thickness = max(max(u_cell_radius * 0.02, 2.0 / (540.0 * u_camera_scale)), 10.0);
					f_subtle_radius = 1.0 - (subtle_thickness / u_cell_radius);
					if ((u_cell_flags & 0x02) != 0) {
						f_subtle_outline = u_cell_color * 0.9; // darker outline by default
						f_subtle_outline.rgb += (u_cell_subtle_outline_override.rgb - f_subtle_outline.rgb)
							* u_cell_subtle_outline_override.a;
					} else {
						f_subtle_outline = vec4(0, 0, 0, 0);
					}
 
					// active multibox outlines (thick, a % of the visible cell radius)
					f_active_radius = 1.0 - u_cell_active_outline_thickness;
					if ((u_cell_flags & 0x0c) != 0) {
						f_active_outline = (u_cell_flags & 0x04) != 0 ? u_cell_active_outline : u_cell_inactive_outline;
					} else {
						f_active_outline = vec4(0, 0, 0, 0);
					}
 
					// unsplittable cell outline, 2x the subtle thickness
					// (except at small sizes, it shouldn't look overly thick)
					float unsplittable_thickness = max(max(u_cell_radius * 0.04, 4.0 / (540.0 * u_camera_scale)), 10.0);
					f_unsplittable_radius = 1.0 - (unsplittable_thickness / u_cell_radius);
					if ((u_cell_flags & 0x10) != 0) {
						f_unsplittable_outline = u_cell_unsplittable_outline;
					} else {
						f_unsplittable_outline = vec4(0, 0, 0, 0);
					}
 
					v_vertex = a_vertex;
					v_uv = a_vertex * (u_cell_radius / u_cell_radius_skin) * 0.5 + 0.5;
 
					vec2 clip_pos = -u_camera_pos + u_cell_pos + v_vertex * u_cell_radius;
					clip_pos *= u_camera_scale * vec2(1.0 / u_camera_ratio, -1.0);
					gl_Position = vec4(clip_pos, 0, 1);
				}
			`,
        `
				${parts.boilerplate}
				flat in vec4 f_active_outline;
				flat in float f_active_radius;
				flat in float f_blur;
				flat in int f_show_skin;
				flat in vec4 f_subtle_outline;
				flat in float f_subtle_radius;
				flat in vec4 f_unsplittable_outline;
				flat in float f_unsplittable_radius;
				in vec2 v_vertex;
				in vec2 v_uv;
				${parts.cameraUbo}
				${parts.cellUbo}
				${parts.cellSettingsUbo}
				uniform sampler2D u_skin;
				out vec4 out_color;
 
				void main() {
					float d = length(v_vertex.xy);
 
					// skin; square clipping, outskirts should use the cell color
					if (f_show_skin != 0 && 0.0 <= min(v_uv.x, v_uv.y) && max(v_uv.x, v_uv.y) <= 1.0) {
						vec4 tex = texture(u_skin, v_uv);
						out_color = out_color * (1.0 - tex.a) + tex;
					} else {
						out_color = u_cell_color;
					}
 
					// subtle outline
					float a = clamp(f_blur * (d - f_subtle_radius), 0.0, 1.0) * f_subtle_outline.a;
					out_color.rgb += (f_subtle_outline.rgb - out_color.rgb) * a;
 
					// active multibox outline
					a = clamp(f_blur * (d - f_active_radius), 0.0, 1.0) * f_active_outline.a;
					out_color.rgb += (f_active_outline.rgb - out_color.rgb) * a;
 
					// unsplittable cell outline
					a = clamp(f_blur * (d - f_unsplittable_radius), 0.0, 1.0) * f_unsplittable_outline.a;
					out_color.rgb += (f_unsplittable_outline.rgb - out_color.rgb) * a;
 
					// final circle mask
					a = clamp(-f_blur * (d - 1.0), 0.0, 1.0);
					out_color.a *= a * u_cell_alpha;
				}
			`,
        ["Camera", "Cell", "CellSettings"],
        ["u_skin"],
      );

      // also used to draw glow
      programs.circle = program(
        "circle",
        `
				${parts.boilerplate}
				layout(location = 0) in vec2 a_vertex;
				layout(location = 1) in vec2 a_cell_pos;
				layout(location = 2) in float a_cell_radius;
				layout(location = 3) in vec4 a_cell_color;
				layout(location = 4) in float a_cell_alpha;
				${parts.cameraUbo}
				${parts.circleUbo}
				out vec2 v_vertex;
				flat out float f_blur;
				flat out vec4 f_cell_color;
 
				void main() {
					float radius = a_cell_radius;
					f_cell_color = a_cell_color * vec4(1, 1, 1, a_cell_alpha * u_circle_alpha);
					if (u_circle_scale > 0.0) {
						f_blur = 1.0;
						radius *= u_circle_scale;
					} else {
						f_blur = 0.5 * a_cell_radius * (540.0 * u_camera_scale);
					}
					v_vertex = a_vertex;
 
					vec2 clip_pos = -u_camera_pos + a_cell_pos + v_vertex * radius;
					clip_pos *= u_camera_scale * vec2(1.0 / u_camera_ratio, -1.0);
					gl_Position = vec4(clip_pos, 0, 1);
				}
			`,
        `
				${parts.boilerplate}
				in vec2 v_vertex;
				flat in float f_blur;
				flat in vec4 f_cell_color;
				out vec4 out_color;
 
				void main() {
					// use squared distance for more natural glow; shouldn't matter for pellets
					float d = length(v_vertex.xy);
					out_color = f_cell_color;
					out_color.a *= clamp(f_blur * (1.0 - d), 0.0, 1.0);
				}
			`,
        ["Camera", "Circle"],
        [],
      );

      programs.text = program(
        "text",
        `
				${parts.boilerplate}
				layout(location = 0) in vec2 a_vertex;
				${parts.cameraUbo}
				${parts.cellUbo}
				${parts.textUbo}
				out vec4 v_color;
				out vec2 v_uv;
				out vec2 v_vertex;
 
				void main() {
					v_uv = a_vertex * 0.5 + 0.5;
					float c2_alpha = (v_uv.x + v_uv.y) / 2.0;
					v_color = u_text_color1 * (1.0 - c2_alpha) + u_text_color2 * c2_alpha;
					v_vertex = a_vertex;
 
					vec2 clip_space = v_vertex * u_text_scale + u_text_offset;
					clip_space *= u_cell_radius_skin * 0.45 * vec2(u_text_aspect_ratio, 1.0);
					clip_space += -u_camera_pos + u_cell_pos;
					clip_space *= u_camera_scale * vec2(1.0 / u_camera_ratio, -1.0);
					gl_Position = vec4(clip_space, 0, 1);
				}
			`,
        `
				${parts.boilerplate}
				in vec4 v_color;
				in vec2 v_uv;
				in vec2 v_vertex;
				${parts.cameraUbo}
				${parts.cellUbo}
				${parts.textUbo}
				uniform sampler2D u_texture;
				uniform sampler2D u_silhouette;
				out vec4 out_color;
 
				void main() {
					vec4 normal = texture(u_texture, v_uv);
 
					if (u_text_silhouette_enabled != 0) {
						vec4 silhouette = texture(u_silhouette, v_uv);
 
						// #fff - #000 => color (text)
						// #fff - #fff => #fff (respect emoji)
						// #888 - #888 => #888 (respect emoji)
						// #fff - #888 => #888 + color/2 (blur/antialias)
						out_color = silhouette + (normal - silhouette) * v_color;
					} else {
						out_color = normal * v_color;
					}
 
					out_color.a *= u_text_alpha;
				}
			`,
        ["Camera", "Cell", "Text"],
        ["u_texture", "u_silhouette"],
      );

      programs.tracer = program(
        "tracer",
        `
				${parts.boilerplate}
				layout(location = 0) in vec2 a_vertex;
				${parts.cameraUbo}
				${parts.tracerUbo}
				out vec2 v_vertex;
 
				void main() {
					v_vertex = a_vertex;
					float alpha = (a_vertex.x + 1.0) / 2.0;
					float d = length(u_tracer_pos2 - u_tracer_pos1);
					float thickness = 0.002 / u_camera_scale;
					// black magic
					vec2 world_pos = u_tracer_pos1 + (u_tracer_pos2 - u_tracer_pos1)
						* mat2(alpha, a_vertex.y / d * thickness, a_vertex.y / d * -thickness, alpha);
 
					vec2 clip_pos = -u_camera_pos + world_pos;
					clip_pos *= u_camera_scale * vec2(1.0 / u_camera_ratio, -1.0);
					gl_Position = vec4(clip_pos, 0, 1);
				}
			`,
        `
				${parts.boilerplate}
				in vec2 v_pos;
				out vec4 out_color;
 
				void main() {
					out_color = vec4(0.5, 0.5, 0.5, 0.25);
				}
			`,
        ["Camera", "Tracer"],
        [],
      );

      // initialize two VAOs; one for pellets, one for cell glow only
      glconf.vao = [];
      for (let i = 0; i < 2; ++i) {
        const vao = /** @type {WebGLVertexArrayObject} */ (
          gl.createVertexArray()
        );
        gl.bindVertexArray(vao);

        // square (location = 0), used for all instances
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW,
        );
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        // pellet/circle buffer (each instance is 6 floats or 24 bytes)
        const circleBuffer = /** @type {WebGLBuffer} */ (gl.createBuffer());
        gl.bindBuffer(gl.ARRAY_BUFFER, circleBuffer);
        // a_cell_pos, vec2 (location = 1)
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 4 * 7, 0);
        gl.vertexAttribDivisor(1, 1);
        // a_cell_radius, float (location = 2)
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 4 * 7, 4 * 2);
        gl.vertexAttribDivisor(2, 1);
        // a_cell_color, vec3 (location = 3)
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 4 * 7, 4 * 3);
        gl.vertexAttribDivisor(3, 1);

        // pellet/circle alpha buffer, updated every frame
        const alphaBuffer = /** @type {WebGLBuffer} */ (gl.createBuffer());
        gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuffer);
        // a_cell_alpha, float (location = 4)
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(4, 1);

        glconf.vao.push({ vao, alphaBuffer, circleBuffer, alphaBufferSize: 0 });
      }

      gl.bindVertexArray(glconf.vao[0].vao);
    };

    glconf.init();
    return glconf;
  })();

  ///////////////////////////////
  // Define Rendering Routines //
  ///////////////////////////////
  const render = (() => {
    const render = {};
    const { gl } = ui.game;

    // #1 : define small misc objects
    // no point in breaking this across multiple lines
    // eslint-disable-next-line max-len
    const darkGridSrc =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAGBJREFUaIHtz4EJwCAAwDA39oT/H+qeEAzSXNA+a61xgfmeLtilEU0jmkY0jWga0TSiaUTTiKYRTSOaRjSNaBrRNKJpRNOIphFNI5pGNI1oGtE0omlEc83IN8aYpyN2+AH6nwOVa0odrQAAAABJRU5ErkJggg==";
    // eslint-disable-next-line max-len
    const lightGridSrc =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAGFJREFUaIHtzwENgDAQwMA9LvAvdJgg2UF6CtrZe6+vm5n7Oh3xlkY0jWga0TSiaUTTiKYRTSOaRjSNaBrRNKJpRNOIphFNI5pGNI1oGtE0omlE04imEc1vRmatdZ+OeMMDa8cDlf3ZAHkAAAAASUVORK5CYII=";

    let lastMinimapDraw = performance.now();
    /** @type {{ bg: ImageData, darkTheme: boolean } | undefined} */
    let minimapCache;
    document.fonts.ready.then(() => void (minimapCache = undefined)); // make sure minimap is drawn with Ubuntu font

    // #2 : define helper functions
    const { resetTextureCache, textureFromCache } = (() => {
      /** @type {Map<string, { texture: WebGLTexture, width: number, height: number } | null>} */
      const cache = new Map();
      render.textureCache = cache;

      return {
        resetTextureCache: () => cache.clear(),
        /**
         * @param {string} src
         * @returns {{ texture: WebGLTexture, width: number, height: number } | undefined}
         */
        textureFromCache: (src) => {
          const cached = cache.get(src);
          if (cached !== undefined) return cached ?? undefined;

          cache.set(src, null);

          const image = new Image();
          image.crossOrigin = "anonymous";
          image.addEventListener("load", () => {
            const texture = /** @type {WebGLTexture} */ (gl.createTexture());
            if (!texture) return;

            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              image,
            );
            gl.texParameteri(
              gl.TEXTURE_2D,
              gl.TEXTURE_MIN_FILTER,
              gl.LINEAR_MIPMAP_NEAREST,
            );
            gl.generateMipmap(gl.TEXTURE_2D);
            cache.set(src, {
              texture,
              width: image.width,
              height: image.height,
            });
          });
          image.src = src;

          return undefined;
        },
      };
    })();
    render.resetTextureCache = resetTextureCache;

    const {
      refreshTextCache,
      massTextFromCache,
      resetTextCache,
      textFromCache,
    } = (() => {
      /**
       * @template {boolean} T
       * @typedef {{
       * 	aspectRatio: number,
       * 	text: WebGLTexture | null,
       *	silhouette: WebGLTexture | null | undefined,
       * 	accessed: number
       * }} CacheEntry
       */
      /** @type {Map<string, CacheEntry<boolean>>} */
      const cache = new Map();
      render.textCache = cache;

      setInterval(() => {
        // remove text after not being used for 1 minute
        const now = performance.now();
        cache.forEach((entry, text) => {
          if (now - entry.accessed > 60_000) {
            // immediately delete text instead of waiting for GC
            if (entry.text !== undefined) gl.deleteTexture(entry.text);
            if (entry.silhouette !== undefined)
              gl.deleteTexture(entry.silhouette);
            cache.delete(text);
          }
        });
      }, 60_000);

      const canvas = document.createElement("canvas");
      const ctx = aux.require(
        canvas.getContext("2d", { willReadFrequently: true }),
        "Unable to get 2D context for text drawing. This is probably your browser being weird, maybe reload " +
          "the page?",
      );

      // sigmod forces a *really* ugly shadow on ctx.fillText so we have to lock the property beforehand
      const realProps = Object.getOwnPropertyDescriptors(
        Object.getPrototypeOf(ctx),
      );
      const realShadowBlurSet = aux
        .require(
          realProps.shadowBlur.set,
          "did CanvasRenderingContext2D spec change?",
        )
        .bind(ctx);
      const realShadowColorSet = aux
        .require(
          realProps.shadowColor.set,
          "did CanvasRenderingContext2D spec change?",
        )
        .bind(ctx);
      Object.defineProperties(ctx, {
        shadowBlur: {
          get: () => 0,
          set: (x) => {
            if (x === 0) realShadowBlurSet(0);
            else realShadowBlurSet(8);
          },
        },
        shadowColor: {
          get: () => "transparent",
          set: (x) => {
            if (x === "transparent") realShadowColorSet("transparent");
            else realShadowColorSet("#0003");
          },
        },
      });

      /**
       * @param {string} text
       * @param {boolean} silhouette
       * @param {boolean} mass
       * @returns {WebGLTexture | null}
       */
      const texture = (text, silhouette, mass) => {
        const texture = gl.createTexture();
        if (!texture) return texture;

        const baseTextSize = 96;
        const textSize =
          baseTextSize *
          (mass ? 0.5 * settings.massScaleFactor : settings.nameScaleFactor);
        const lineWidth =
          Math.ceil(textSize / 10) * settings.textOutlinesFactor;

        let font = "";
        if (mass ? settings.massBold : settings.nameBold) font = "bold";
        font += " " + textSize + "px Ubuntu";

        ctx.font = font;
        // if rendering an empty string (somehow) then width can be 0 with no outlines
        canvas.width = ctx.measureText(text).width + lineWidth * 2 || 1;
        canvas.height = textSize * 3;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // setting canvas.width resets the canvas state
        ctx.font = font;
        ctx.lineJoin = "round";
        ctx.lineWidth = lineWidth;
        ctx.fillStyle = silhouette ? "#000" : "#fff";
        ctx.strokeStyle = "#000";
        ctx.textBaseline = "middle";

        ctx.shadowBlur = lineWidth;
        ctx.shadowColor = lineWidth > 0 ? "#0002" : "transparent";

        // add a space, which is to prevent sigmod from detecting the name
        if (lineWidth > 0)
          ctx.strokeText(text + " ", lineWidth, textSize * 1.5);
        ctx.shadowColor = "transparent";
        ctx.fillText(text + " ", lineWidth, textSize * 1.5);

        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          data,
        );
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          gl.NEAREST_MIPMAP_LINEAR,
        );
        gl.generateMipmap(gl.TEXTURE_2D);
        return texture;
      };

      let massAspectRatio = 1; // assumption: all mass digits are the same aspect ratio - true in the Ubuntu font
      /** @type {(WebGLTexture | undefined)[]} */
      const massTextCache = [];

      /**
       * @param {string} digit
       * @returns {{ aspectRatio: number, texture: WebGLTexture | null }}
       */
      const massTextFromCache = (digit) => {
        let cached = massTextCache[digit];
        if (!cached) {
          cached = massTextCache[digit] = texture(digit, false, true);
          massAspectRatio = canvas.width / canvas.height;
        }

        return { aspectRatio: massAspectRatio, texture: cached };
      };

      const resetTextCache = () => {
        cache.clear();
        while (massTextCache.pop());
      };

      let drawnMassBold = false;
      let drawnMassScaleFactor = -1;
      let drawnNamesBold = false;
      let drawnNamesScaleFactor = -1;
      let drawnOutlinesFactor = 1;

      const refreshTextCache = () => {
        if (
          drawnMassBold !== settings.massBold ||
          drawnMassScaleFactor !== settings.massScaleFactor ||
          drawnNamesScaleFactor !== settings.nameScaleFactor ||
          drawnNamesBold !== settings.nameBold ||
          drawnOutlinesFactor !== settings.textOutlinesFactor
        ) {
          resetTextCache();
          drawnMassBold = settings.massBold;
          drawnMassScaleFactor = settings.massScaleFactor;
          drawnNamesBold = settings.nameBold;
          drawnNamesScaleFactor = settings.nameScaleFactor;
          drawnOutlinesFactor = settings.textOutlinesFactor;
        }
      };

      /**
       * @template {boolean} T
       * @param {string} text
       * @param {T} silhouette
       * @returns {CacheEntry<T>}
       */
      const textFromCache = (text, silhouette) => {
        let entry = cache.get(text);
        if (!entry) {
          const shortened = aux.trim(text);
          /** @type {CacheEntry<T>} */
          entry = {
            text: texture(shortened, false, false),
            aspectRatio: canvas.width / canvas.height, // mind the execution order
            silhouette: silhouette
              ? texture(shortened, true, false)
              : undefined,
            accessed: performance.now(),
          };
          cache.set(text, entry);
        } else {
          entry.accessed = performance.now();
        }

        if (silhouette && entry.silhouette === undefined) {
          setTimeout(() => {
            entry.silhouette = texture(aux.trim(text), true, false);
          });
        }

        return entry;
      };

      // reload text once Ubuntu has loaded, prevents some serif fonts from being locked in
      document.fonts.ready.then(() => resetTextCache());

      return {
        refreshTextCache,
        massTextFromCache,
        resetTextCache,
        textFromCache,
      };
    })();
    render.resetTextCache = resetTextCache;
    render.textFromCache = textFromCache;

    let cellAlpha = new Float32Array(0);
    let cellBuffer = new Float32Array(0);
    let pelletAlpha = new Float32Array(0);
    let pelletBuffer = new Float32Array(0);
    let uploadedPellets = 0;
    /**
     * @param {'cells' | 'pellets'} key
     * @param {number=} now
     */
    render.upload = (key, now) => {
      if (
        (key === "pellets" && sigmod.settings.hidePellets) ||
        performance.now() - render.lastFrame > 45_000
      ) {
        // do not render pellets on inactive windows (very laggy!)
        uploadedPellets = 0;
        return;
      }

      now ??= performance.now(); // the result will never actually be used, just for type checking
      const vao = glconf.vao[key === "pellets" ? 0 : 1];

      // find expected # of pellets (exclude any that are being *animated*)
      let expected = 0;
      if (key === "pellets") {
        for (const resolution of world.pellets.values()) {
          if (resolution.merged?.deadTo === -1) ++expected;
        }
      } else {
        for (const resolution of world.cells.values()) {
          if (resolution.merged) ++expected;
        }
      }

      // grow the pellet buffer by 2x multiples if necessary
      let alphaBuffer = key === "cells" ? cellAlpha : pelletAlpha;
      let objBuffer = key === "cells" ? cellBuffer : pelletBuffer;
      let instances = alphaBuffer.length || 1;
      while (instances < expected) {
        instances *= 2;
      }
      // when the webgl context is lost, the buffer sizes get reset to zero
      const resizing = instances * 4 !== vao.alphaBufferSize;
      if (resizing) {
        if (key === "pellets") {
          alphaBuffer = pelletAlpha = new Float32Array(instances);
          objBuffer = pelletBuffer = new Float32Array(instances * 7);
        } else {
          alphaBuffer = cellAlpha = new Float32Array(instances);
          objBuffer = cellBuffer = new Float32Array(instances * 7);
        }
      }

      const color =
        key === "pellets"
          ? sigmod.settings.foodColor
          : sigmod.settings.cellColor;
      const foodBlank =
        key === "pellets" &&
        color?.[0] === 0 &&
        color?.[1] === 0 &&
        color?.[2] === 0;

      let i = 0;
      /** @param {Cell} cell */
      const iterate = (cell) => {
        /** @type {number} */
        let nx, ny, nr;
        if (key !== "cells") {
          if (cell.deadTo !== -1) return;
          nx = cell.nx;
          ny = cell.ny;
          nr = cell.nr;
        } else {
          let jr;
          ({ x: nx, y: ny, r: nr, jr } = world.xyr(cell, undefined, now));
          if (aux.settings.jellyPhysics) nr = jr;
        }

        objBuffer[i * 7] = nx;
        objBuffer[i * 7 + 1] = ny;
        objBuffer[i * 7 + 2] = nr;
        if (color && !foodBlank) {
          objBuffer[i * 7 + 3] = color[0];
          objBuffer[i * 7 + 4] = color[1];
          objBuffer[i * 7 + 5] = color[2];
          objBuffer[i * 7 + 6] = color[3];
        } else {
          objBuffer[i * 7 + 3] = cell.Rgb;
          objBuffer[i * 7 + 4] = cell.rGb;
          objBuffer[i * 7 + 5] = cell.rgB;
          objBuffer[i * 7 + 6] = foodBlank ? color[3] : 1;
        }
        ++i;
      };
      for (const cell of world[key].values()) {
        if (cell.merged) iterate(cell.merged);
      }

      // now, upload data
      if (resizing) {
        gl.bindBuffer(gl.ARRAY_BUFFER, vao.alphaBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, alphaBuffer.byteLength, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, vao.circleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, objBuffer, gl.STATIC_DRAW);
        vao.alphaBufferSize = alphaBuffer.byteLength;
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, vao.circleBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, objBuffer);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      if (key === "pellets") uploadedPellets = expected;
    };

    // #3 : define ubo views
    // firefox adds some padding to uniform buffer sizes, so best to check its size
    gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Border);
    const borderUboBuffer = new ArrayBuffer(
      gl.getBufferParameter(gl.UNIFORM_BUFFER, gl.BUFFER_SIZE),
    );
    // must reference an arraybuffer for the memory to be shared between these views
    const borderUboFloats = new Float32Array(borderUboBuffer);
    const borderUboInts = new Int32Array(borderUboBuffer);

    gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Cell);
    const cellUboBuffer = new ArrayBuffer(
      gl.getBufferParameter(gl.UNIFORM_BUFFER, gl.BUFFER_SIZE),
    );
    const cellUboFloats = new Float32Array(cellUboBuffer);
    const cellUboInts = new Int32Array(cellUboBuffer);

    gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Text);
    const textUboBuffer = new ArrayBuffer(
      gl.getBufferParameter(gl.UNIFORM_BUFFER, gl.BUFFER_SIZE),
    );
    const textUboFloats = new Float32Array(textUboBuffer);
    const textUboInts = new Int32Array(textUboBuffer);

    gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Tracer);
    const tracerUboBuffer = new ArrayBuffer(
      gl.getBufferParameter(gl.UNIFORM_BUFFER, gl.BUFFER_SIZE),
    );
    const tracerUboFloats = new Float32Array(tracerUboBuffer);

    gl.bindBuffer(gl.UNIFORM_BUFFER, null); // leaving uniform buffer bound = scary!

    // #4 : define the render function
    const start = performance.now();
    render.fps = 0;
    render.lastFrame = performance.now();
    function renderGame() {
      const now = performance.now();
      const dt = Math.max(now - render.lastFrame, 0.1) / 1000; // there's a chance (now - lastFrame) can be 0
      render.fps += (1 / dt - render.fps) / 10;
      render.lastFrame = now;

      if (gl.isContextLost()) {
        requestAnimationFrame(renderGame);
        return;
      }

      // get settings
      const defaultVirusSrc = "/assets/images/viruses/2.png";
      const virusSrc = sigmod.settings.virusImage || defaultVirusSrc;

      const showNames = sigmod.settings.showNames ?? true;

      const { cellColor, foodColor, outlineColor, skinReplacement } =
        sigmod.settings;

      /** @type {HTMLInputElement | null} */
      const nickElement = document.querySelector("input#nick");
      const nick = nickElement?.value ?? "?";

      refreshTextCache();

      const vision = aux.require(
        world.views.get(world.selected),
        "no selected vision (BAD BUG)",
      );
      for (const view of world.views.keys()) {
        world.camera(view, now, dt);
      }

      // note: most routines are named, for benchmarking purposes
      (function setGlobalUniforms() {
        // note that binding the same buffer to gl.UNIFORM_BUFFER twice in a row causes it to not update.
        // why that happens is completely beyond me but oh well.
        // for consistency, we always bind gl.UNIFORM_BUFFER to null directly after updating it.
        gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Camera);
        gl.bufferSubData(
          gl.UNIFORM_BUFFER,
          0,
          new Float32Array([
            ui.game.canvas.width / ui.game.canvas.height,
            vision.camera.scale / 540,
            vision.camera.x,
            vision.camera.y,
          ]),
        );
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);

        gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.CellSettings);
        gl.bufferSubData(
          gl.UNIFORM_BUFFER,
          0,
          new Float32Array([
            ...settings.outlineMultiColor, // cell_active_outline
            ...settings.outlineMultiInactiveColor, // cell_inactive_outline
            ...(aux.settings.darkTheme ? [1, 1, 1, 1] : [0, 0, 0, 1]), // cell_unsplittable_outline
            ...(outlineColor ?? [0, 0, 0, 0]), // cell_subtle_outline_override
            settings.outlineMulti,
          ]),
        );
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
      })();

      (function background() {
        if (sigmod.settings.mapColor) {
          gl.clearColor(...sigmod.settings.mapColor);
        } else if (aux.settings.darkTheme) {
          gl.clearColor(0x11 / 255, 0x11 / 255, 0x11 / 255, 1); // #111
        } else {
          gl.clearColor(0xf2 / 255, 0xfb / 255, 0xff / 255, 1); // #f2fbff
        }
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(glconf.programs.bg);

        let texture;
        if (settings.background) {
          texture = textureFromCache(settings.background);
        } else if (aux.settings.showGrid) {
          texture = textureFromCache(
            aux.settings.darkTheme ? darkGridSrc : lightGridSrc,
          );
        }
        gl.bindTexture(gl.TEXTURE_2D, texture?.texture ?? null);
        const repeating =
          texture && texture.width <= 1024 && texture.height <= 1024;

        let borderColor;
        let borderLrtb;
        if (aux.settings.showBorder && vision.border) {
          borderColor = [0, 0, 1, 1]; // #00ff
          borderLrtb = vision.border;
        } else {
          borderColor = [0, 0, 0, 0]; // transparent
          borderLrtb = { l: 0, r: 0, t: 0, b: 0 };
        }

        // u_border_color
        borderUboFloats[0] = borderColor[0];
        borderUboFloats[1] = borderColor[1];
        borderUboFloats[2] = borderColor[2];
        borderUboFloats[3] = borderColor[3];
        // u_border_xyzw_lrtb
        borderUboFloats[4] = borderLrtb.l;
        borderUboFloats[5] = borderLrtb.r;
        borderUboFloats[6] = borderLrtb.t;
        borderUboFloats[7] = borderLrtb.b;

        // flags
        borderUboInts[8] =
          (texture ? 0x01 : 0) |
          (aux.settings.darkTheme ? 0x02 : 0) |
          (repeating ? 0x04 : 0) |
          (settings.rainbowBorder ? 0x08 : 0);

        // u_background_width and u_background_height
        borderUboFloats[9] = texture?.width ?? 1;
        borderUboFloats[10] = texture?.height ?? 1;
        borderUboFloats[11] = (((now - start) / 1000) * 0.2) % (Math.PI * 2);

        gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Border);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, borderUboFloats);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      })();

      (function cells() {
        // for white cell outlines
        let nextCellIdx = 0;
        const ownedToMerged = vision.owned.map(
          (id) => world.cells.get(id)?.merged,
        );
        for (const cell of ownedToMerged) {
          if (cell && cell.deadAt === undefined) ++nextCellIdx;
        }
        const canSplit = ownedToMerged.map((cell) => {
          if (!cell || cell.nr < 128) return false;
          return nextCellIdx++ < 16;
        });

        /**
         * @param {Cell} cell
         * @returns {number}
         */
        const calcAlpha = (cell) => {
          let alpha = (now - cell.born) / 100;
          if (cell.deadAt !== undefined) {
            const alpha2 = 1 - (now - cell.deadAt) / 100;
            if (alpha2 < alpha) alpha = alpha2;
          }
          return alpha > 1 ? 1 : alpha < 0 ? 0 : alpha;
        };

        /**
         * @param {Cell} cell
         */
        function draw(cell) {
          // #1 : draw cell
          gl.useProgram(glconf.programs.cell);

          const alpha = calcAlpha(cell);
          cellUboFloats[8] = alpha * settings.cellOpacity;

          /** @type {Cell | undefined} */
          let killer;
          if (cell.deadTo !== -1) {
            killer = world.cells.get(cell.deadTo)?.merged;
          }
          const { x, y, r, jr } = world.xyr(cell, killer, now);
          // without jelly physics, the radius of cells is adjusted such that its subtle outline doesn't go
          // past its original radius.
          // jelly physics does not do this, so colliding cells need to look kinda 'joined' together,
          // so we multiply the radius by 1.02 (approximately the size increase from the stroke thickness)
          cellUboFloats[2] = x;
          cellUboFloats[3] = y;
          if (aux.settings.jellyPhysics && !cell.jagged && !cell.pellet) {
            const strokeThickness = Math.max(jr * 0.01, 10);
            cellUboFloats[0] = jr + strokeThickness;
            cellUboFloats[1] =
              (settings.jellySkinLag ? r : jr) + strokeThickness;
          } else {
            cellUboFloats[0] = cellUboFloats[1] = r;
          }

          if (cell.jagged) {
            const virusTexture = textureFromCache(virusSrc);
            if (virusTexture) {
              gl.bindTexture(gl.TEXTURE_2D, virusTexture.texture);
              cellUboInts[9] = 0x01; // skin and nothing else
              // draw a fully transparent cell
              cellUboFloats[4] =
                cellUboFloats[5] =
                cellUboFloats[6] =
                cellUboFloats[7] =
                  0;
            } else {
              cellUboInts[9] = 0;
              cellUboFloats[4] = 1;
              cellUboFloats[5] = 0;
              cellUboFloats[6] = 0;
              cellUboFloats[7] = 0.5;
            }

            gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Cell);
            gl.bufferSubData(gl.UNIFORM_BUFFER, 0, cellUboBuffer);
            gl.bindBuffer(gl.UNIFORM_BUFFER, null);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            // draw default viruses twice for better contrast against light theme
            if (!aux.settings.darkTheme && virusSrc === defaultVirusSrc)
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            return;
          }

          cellUboInts[9] = 0;
          const color = (cell.pellet ? foodColor : cellColor) ?? [
            cell.Rgb,
            cell.rGb,
            cell.rgB,
            1,
          ];
          cellUboFloats[4] = color[0];
          cellUboFloats[5] = color[1];
          cellUboFloats[6] = color[2];
          cellUboFloats[7] = color[3];

          cellUboInts[9] |= settings.cellOutlines ? 0x02 : 0;

          if (!cell.pellet) {
            const myIndex = vision.owned.indexOf(cell.id);
            if (myIndex !== -1) {
              if (vision.camera.merging.length > 0) cellUboInts[9] |= 0x04; // active multi outline
              if (!canSplit[myIndex] && settings.unsplittableOpacity > 0)
                cellUboInts[9] |= 0x10;
            }
            let ownedByOther = false;
            for (const otherVision of world.views.values()) {
              if (otherVision === vision) continue;
              if (!otherVision.owned.includes(cell.id)) continue;
              ownedByOther = true;
              // inactive multi outline
              if (otherVision.camera.merging.includes(world.selected))
                cellUboInts[9] |= 0x08;
              break;
            }

            let skin = "";
            if (myIndex !== -1) {
              skin =
                world.selected === world.viewId.primary
                  ? settings.selfSkin
                  : settings.selfSkinMulti;
            } else if (ownedByOther) {
              skin =
                world.selected === world.viewId.secondary
                  ? settings.selfSkin
                  : settings.selfSkinMulti;
            }
            if (!skin && aux.settings.showSkins && cell.skin) {
              if (
                skinReplacement &&
                cell.skin.includes(skinReplacement.original + ".png")
              )
                skin =
                  skinReplacement.replacement ??
                  skinReplacement.replaceImg ??
                  "";
              else skin = cell.skin;
            }

            if (skin) {
              const texture = textureFromCache(skin);
              if (texture) {
                cellUboInts[9] |= 0x01; // skin
                gl.bindTexture(gl.TEXTURE_2D, texture.texture);
              }
            }
          }

          gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Cell);
          gl.bufferSubData(gl.UNIFORM_BUFFER, 0, cellUboBuffer);
          gl.bindBuffer(gl.UNIFORM_BUFFER, null);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

          // #2 : draw text
          if (cell.pellet) return;
          const name = cell.name || "An unnamed cell";
          const showThisName = showNames && cell.nr > 75;
          const showThisMass = aux.settings.showMass && cell.nr > 75;
          const clan = (settings.clans && aux.clans.get(cell.clan)) || "";
          if (!showThisName && !showThisMass && !clan) return;

          gl.useProgram(glconf.programs.text);
          textUboFloats[8] = alpha; // text_alpha

          let useSilhouette = false;
          if (cell.sub) {
            // text_color1 = #eb9500
            textUboFloats[0] = 0xeb / 255;
            textUboFloats[1] = 0x95 / 255;
            textUboFloats[2] = 0x00 / 255;
            textUboFloats[3] = 1;
            // text_color2 = #e4b110
            textUboFloats[4] = 0xe4 / 255;
            textUboFloats[5] = 0xb1 / 255;
            textUboFloats[6] = 0x10 / 255;
            textUboFloats[7];
            useSilhouette = true;
          } else {
            // text_color1 = text_color2 = #fff
            textUboFloats[0] =
              textUboFloats[1] =
              textUboFloats[2] =
              textUboFloats[3] =
                1;
            textUboFloats[4] =
              textUboFloats[5] =
              textUboFloats[6] =
              textUboFloats[7] =
                1;
          }

          if (name === nick) {
            const { nameColor1, nameColor2 } = sigmod.settings;
            if (nameColor1) {
              textUboFloats[0] = nameColor1[0];
              textUboFloats[1] = nameColor1[1];
              textUboFloats[2] = nameColor1[2];
              textUboFloats[3] = nameColor1[3];
              useSilhouette = true;
            }

            if (nameColor2) {
              textUboFloats[4] = nameColor2[0];
              textUboFloats[5] = nameColor2[1];
              textUboFloats[6] = nameColor2[2];
              textUboFloats[7] = nameColor2[3];
              useSilhouette = true;
            }
          }

          if (clan) {
            const { aspectRatio, text, silhouette } = textFromCache(
              clan,
              useSilhouette,
            );
            if (text) {
              textUboFloats[9] = aspectRatio; // text_aspect_ratio
              textUboFloats[10] = showThisName
                ? settings.clanScaleFactor * 0.5
                : settings.nameScaleFactor;
              textUboInts[11] = Number(useSilhouette); // text_silhouette_enabled
              textUboFloats[12] = 0; // text_offset.x
              textUboFloats[13] = showThisName
                ? -settings.nameScaleFactor / 3 - settings.clanScaleFactor / 6
                : 0; // text_offset.y

              gl.bindTexture(gl.TEXTURE_2D, text);
              if (silhouette) {
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, silhouette);
                gl.activeTexture(gl.TEXTURE0);
              }

              gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Text);
              gl.bufferSubData(gl.UNIFORM_BUFFER, 0, textUboBuffer);
              gl.bindBuffer(gl.UNIFORM_BUFFER, null);
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
          }

          if (showThisName) {
            const { aspectRatio, text, silhouette } = textFromCache(
              name,
              useSilhouette,
            );
            if (text) {
              textUboFloats[9] = aspectRatio; // text_aspect_ratio
              textUboFloats[10] = settings.nameScaleFactor; // text_scale
              textUboInts[11] = Number(silhouette); // text_silhouette_enabled
              textUboFloats[12] = textUboFloats[13] = 0; // text_offset = (0, 0)

              gl.bindTexture(gl.TEXTURE_2D, text);
              if (silhouette) {
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, silhouette);
                gl.activeTexture(gl.TEXTURE0);
              }

              gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Text);
              gl.bufferSubData(gl.UNIFORM_BUFFER, 0, textUboBuffer);
              gl.bindBuffer(gl.UNIFORM_BUFFER, null);
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
          }

          if (showThisMass) {
            textUboFloats[8] = alpha * settings.massOpacity; // text_alpha
            textUboFloats[10] = 0.5 * settings.massScaleFactor; // text_scale
            textUboInts[11] = 0; // text_silhouette_enabled

            let yOffset;
            if (showThisName)
              yOffset =
                (settings.nameScaleFactor + 0.5 * settings.massScaleFactor) / 3;
            else if (clan) yOffset = (1 + 0.5 * settings.massScaleFactor) / 3;
            else yOffset = 0;
            // draw each digit separately, as Ubuntu makes them all the same width.
            // significantly reduces the size of the text cache
            const mass = Math.floor((cell.nr * cell.nr) / 100).toString();
            for (let i = 0; i < mass.length; ++i) {
              const { aspectRatio, texture } = massTextFromCache(mass[i]);
              textUboFloats[9] = aspectRatio; // text_aspect_ratio
              // text_offset.x
              // thickness 0 => 1.00 multiplier
              // thickness 1 => 0.75
              // probably a reciprocal function
              textUboFloats[12] =
                (i - (mass.length - 1) / 2) *
                (1 - 0.25 * Math.sqrt(settings.textOutlinesFactor)) *
                settings.massScaleFactor;
              textUboFloats[13] = yOffset;
              gl.bindTexture(gl.TEXTURE_2D, texture);

              gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Text);
              gl.bufferSubData(gl.UNIFORM_BUFFER, 0, textUboBuffer);
              gl.bindBuffer(gl.UNIFORM_BUFFER, null);
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
          }
        }

        // draw static pellets first
        let i = 0;
        for (const resolution of world.pellets.values()) {
          // deadTo property should never change in between upload('pellets') calls
          if (resolution.merged?.deadTo !== -1) continue;
          pelletAlpha[i++] = calcAlpha(resolution.merged);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, glconf.vao[0].alphaBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, pelletAlpha);
        gl.bindBuffer(gl.ARRAY_BUFFER, null); // TODO: necessary unbinding?

        // setup no-glow for static pellets
        if (settings.pelletGlow && aux.settings.darkTheme) {
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // make sure pellets (and glow) are visible in light theme
        }
        gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Circle);
        gl.bufferData(
          gl.UNIFORM_BUFFER,
          new Float32Array([1, 0]),
          gl.STATIC_DRAW,
        );
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);

        // draw static pellets
        gl.useProgram(glconf.programs.circle);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, uploadedPellets);
        if (settings.pelletGlow) {
          // setup glow for static pellets
          gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Circle);
          gl.bufferData(
            gl.UNIFORM_BUFFER,
            new Float32Array([0.25, 2]),
            gl.STATIC_DRAW,
          );
          gl.bindBuffer(gl.UNIFORM_BUFFER, null);

          // draw glow for static pellets
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, uploadedPellets);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }

        // then draw *animated* pellets
        for (const resolution of world.pellets.values()) {
          // animated pellets shouldn't glow
          if (resolution.merged && resolution.merged.deadTo !== -1)
            draw(resolution.merged);
        }

        /** @type {[Cell, number][]} */
        const sorted = [];
        for (const resolution of world.cells.values()) {
          const cell = resolution.merged;
          if (!cell) continue;
          const rAlpha = Math.min(
            Math.max((now - cell.updated) / settings.drawDelay, 0),
            1,
          );
          const computedR = cell.or + (cell.nr - cell.or) * rAlpha;
          sorted.push([cell, computedR]);
        }

        // sort by smallest to biggest
        sorted.sort(([_a, ar], [_b, br]) => ar - br);
        for (const [cell] of sorted) draw(cell);

        if (settings.cellGlow) {
          render.upload("cells", now);
          let i = 0;
          for (const resolution of world.cells.values()) {
            const cell = resolution.merged;
            if (!cell) continue;
            if (cell.jagged) cellAlpha[i++] = 0;
            else {
              let alpha = calcAlpha(cell);
              // it looks kinda weird when cells get sucked in when being eaten
              if (cell.deadTo !== -1) alpha *= 0.25;
              cellAlpha[i++] = alpha;
            }
          }

          gl.bindBuffer(gl.ARRAY_BUFFER, glconf.vao[1].alphaBuffer);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, cellAlpha);
          gl.bindBuffer(gl.ARRAY_BUFFER, null);

          // use a separate vao for cells, so pellet data doesn't have to be copied as often
          gl.useProgram(glconf.programs.circle);
          gl.bindVertexArray(glconf.vao[1].vao);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

          gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Circle);
          gl.bufferData(
            gl.UNIFORM_BUFFER,
            new Float32Array([0.25, 1.5]),
            gl.STATIC_DRAW,
          );
          gl.bindBuffer(gl.UNIFORM_BUFFER, null);

          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, i);
          gl.bindVertexArray(glconf.vao[0].vao);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }

        // draw tracers
        if (settings.tracer) {
          gl.useProgram(glconf.programs.tracer);

          const inputs = input.views.get(world.selected);
          if (inputs) {
            let mouse;
            if (inputs.lock && now <= inputs.lock.until)
              mouse = inputs.lock.world;
            else mouse = input.toWorld(world.selected, input.current);
            [tracerUboFloats[2], tracerUboFloats[3]] = mouse; // tracer_pos2.xy
          }

          ownedToMerged.forEach((cell) => {
            if (!cell || cell.deadAt !== undefined) return;

            let { x, y } = world.xyr(cell, undefined, now);
            tracerUboFloats[0] = x; // tracer_pos1.x
            tracerUboFloats[1] = y; // tracer_pos1.y
            gl.bindBuffer(gl.UNIFORM_BUFFER, glconf.uniforms.Tracer);
            gl.bufferSubData(gl.UNIFORM_BUFFER, 0, tracerUboBuffer);
            gl.bindBuffer(gl.UNIFORM_BUFFER, null);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          });
        }
      })();

      ui.stats.update(world.selected);

      (function minimap() {
        if (now - lastMinimapDraw < 40) return; // should be good enough when multiboxing, may change later
        lastMinimapDraw = now;

        if (!aux.settings.showMinimap) {
          ui.minimap.canvas.style.display = "none";
          return;
        } else {
          ui.minimap.canvas.style.display = "";
        }

        const { canvas, ctx } = ui.minimap;
        // clears the canvas
        const canvasLength =
          (canvas.width =
          canvas.height =
            Math.ceil(200 * (devicePixelRatio - 0.0001)));
        const sectorSize = canvas.width / 5;

        // cache the background if necessary (25 texts = bad)
        if (
          minimapCache &&
          minimapCache.bg.width === canvasLength &&
          minimapCache.darkTheme === aux.settings.darkTheme
        ) {
          ctx.putImageData(minimapCache.bg, 0, 0);
        } else {
          // draw section names
          ctx.font = `${Math.floor(sectorSize / 3)}px Ubuntu`;
          ctx.fillStyle = "#fff";
          ctx.globalAlpha = aux.settings.darkTheme ? 0.3 : 0.7;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const cols = ["1", "2", "3", "4", "5"];
          const rows = ["A", "B", "C", "D", "E"];
          cols.forEach((col, y) => {
            rows.forEach((row, x) => {
              ctx.fillText(
                row + col,
                (x + 0.5) * sectorSize,
                (y + 0.5) * sectorSize,
              );
            });
          });

          minimapCache = {
            bg: ctx.getImageData(0, 0, canvas.width, canvas.height),
            darkTheme: aux.settings.darkTheme,
          };
        }

        const { border } = vision;
        if (!border) return;

        // sigmod overlay resizes itself differently, so we correct it whenever we need to
        /** @type {HTMLCanvasElement | null} */
        const sigmodMinimap = document.querySelector("canvas.minimap");
        if (sigmodMinimap) {
          // we need to check before updating the canvas, otherwise we will clear it
          if (
            sigmodMinimap.style.width !== "200px" ||
            sigmodMinimap.style.height !== "200px"
          )
            sigmodMinimap.style.width = sigmodMinimap.style.height = "200px";

          if (
            sigmodMinimap.width !== canvas.width ||
            sigmodMinimap.height !== canvas.height
          )
            sigmodMinimap.width = sigmodMinimap.height = canvas.width;
        }

        const gameWidth = border.r - border.l;
        const gameHeight = border.b - border.t;

        // highlight current section
        ctx.fillStyle = "#ff0";
        ctx.globalAlpha = 0.3;

        const sectionX = Math.floor(
          ((vision.camera.x - border.l) / gameWidth) * 5,
        );
        const sectionY = Math.floor(
          ((vision.camera.y - border.t) / gameHeight) * 5,
        );
        ctx.fillRect(
          sectionX * sectorSize,
          sectionY * sectorSize,
          sectorSize,
          sectorSize,
        );

        // draw section names
        ctx.font = `${Math.floor(sectorSize / 3)}px Ubuntu`;
        ctx.fillStyle = aux.settings.darkTheme ? "#fff" : "#000";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.globalAlpha = 1;

        // draw cells
        /** @param {{ nx: number, ny: number, nr: number, Rgb: number, rGb: number, rgB: number }} cell */
        const drawCell = function drawCell(cell) {
          const x = ((cell.nx - border.l) / gameWidth) * canvas.width;
          const y = ((cell.ny - border.t) / gameHeight) * canvas.height;
          const r = Math.max((cell.nr / gameWidth) * canvas.width, 2);

          ctx.scale(0.01, 0.01); // prevent sigmod from treating minimap cells as pellets
          ctx.fillStyle = aux.rgba2hex(cell.Rgb, cell.rGb, cell.rgB, 1);
          ctx.beginPath();
          ctx.moveTo((x + r) * 100, y * 100);
          ctx.arc(x * 100, y * 100, r * 100, 0, 2 * Math.PI);
          ctx.fill();
          ctx.resetTransform();
        };

        /**
         * @param {number} x
         * @param {number} y
         * @param {string} name
         */
        const drawName = function drawName(x, y, name) {
          x = ((x - border.l) / gameWidth) * canvas.width;
          y = ((y - border.t) / gameHeight) * canvas.height;

          ctx.fillStyle = "#fff";
          // add a space to prevent sigmod from detecting names
          ctx.fillText(
            name + " ",
            x,
            y - 7 * devicePixelRatio - sectorSize / 6,
          );
        };

        // draw clanmates first, below yourself
        // we sort clanmates by color AND name, to ensure clanmates stay separate
        /** @type {Map<string, { name: string, n: number, x: number, y: number }>} */
        const avgPos = new Map();
        for (const resolution of world.cells.values()) {
          const cell = resolution.merged;
          if (!cell) continue;
          let owned = false;
          for (const vision of world.views.values())
            owned ||= vision.owned.includes(cell.id);
          if (!owned && (!cell.clan || cell.clan !== aux.userData?.clan))
            continue;
          drawCell(cell);

          const name = cell.name || "An unnamed cell";
          const id = name + cell.Rgb + cell.rGb + cell.rgB;
          const entry = avgPos.get(id);
          if (entry) {
            ++entry.n;
            entry.x += cell.nx;
            entry.y += cell.ny;
          } else {
            avgPos.set(id, { name, n: 1, x: cell.nx, y: cell.ny });
          }
        }

        avgPos.forEach((entry) => {
          drawName(entry.x / entry.n, entry.y / entry.n, entry.name);
        });

        // draw my cells above everyone else
        let myName = "";
        let ownN = 0;
        let ownX = 0;
        let ownY = 0;
        vision.owned.forEach((id) => {
          const cell = world.cells.get(id)?.merged;
          if (!cell) return;

          drawCell(cell);
          myName = cell.name || "An unnamed cell";
          ++ownN;
          ownX += cell.nx;
          ownY += cell.ny;
        });

        if (ownN <= 0) {
          // if no cells were drawn, draw our spectate pos instead
          drawCell({
            nx: vision.camera.x,
            ny: vision.camera.y,
            nr: (gameWidth / canvas.width) * 5,
            Rgb: 1,
            rGb: 0.6,
            rgB: 0.6,
          });
        } else {
          ownX /= ownN;
          ownY /= ownN;
          // draw name above player's cells
          drawName(ownX, ownY, myName);

          // send a hint to sigmod
          ctx.globalAlpha = 0;
          ctx.fillText(`X: ${ownX}, Y: ${ownY}`, 0, -1000);
        }
      })();

      ui.chat.matchTheme();

      requestAnimationFrame(renderGame);
    }

    requestAnimationFrame(renderGame);
    return render;
  })();

  // @ts-expect-error for debugging purposes and other scripts. dm me on discord @ 8y8x to guarantee stability
  window.sigfix = {
    destructor,
    aux,
    sigmod,
    ui,
    settings,
    world,
    net,
    input,
    glconf,
    render,
  };
})();
