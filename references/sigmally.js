(() => {
    "use strict";
    var t = {
            427: (t, e, s) => {
                s.d(e, {
                    Af: () => v,
                    Cw: () => p,
                    _4: () => m,
                    y4: () => u
                });
                var n = s(0),
                    i = s(292),
                    o = s(352),
                    a = s(429),
                    r = s(776),
                    c = s(520);
                const {
                    serverProtocol: l
                } = o.settings;
                let d, h;

                function m() {
                    const t = localStorage.getItem("save");
                    t && g({
                        google_access_token: t
                    })
                }

                function p(t) {
                    localStorage.setItem("save", t.credential), g({
                        google_access_token: t.credential
                    })
                }

                function g(t) {
                    fetch((0, i.sB)(), {
                        method: "POST",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(t)
                    }).then((t => t.json())).then((t => {
                        if ("success" === t.result) {
                            const e = o.options.store,
                                s = e.save.bind(e),
                                a = t.body.user,
                                r = a.email;
                            a.id = t.body.user._id, o.settings.userData = a, o.settings.updateTimer(a), o.settings.checkBoost(), s(0, r), document.querySelector("#signInBtn").classList.add("hide"), document.querySelector("#signOutBtn").classList.remove("hide");
                            const c = document.querySelector(".profile-image");
                            d = c.innerHTML, c.innerHTML = `<img class="profile-image-icon" src="${o.settings.userData.imageURL}">`;
                            document.querySelector(".profile-image-icon").classList.add("no-click");
                            const l = document.querySelector(".profile-name");
                            h = l.innerHTML, l.innerHTML = o.settings.userData.givenName;
                            document.querySelector("#user-level").innerHTML = t.body.user.level || 0;
                            document.querySelector("#progress-next").innerText = `${t.body.user.exp}/${t.body.user.nextLevel}`;
                            document.querySelector("#user-line-progress").setAttribute("style", `width:${t.body.user.progress||0}%`);
                            const m = document.querySelectorAll(".coins-value");
                            for (let e = 0; m[e]; e++) m[e].innerHTML = t.body.user.gold;
                            if (o.settings.userData.lastSkinUsed && o.settings.userData.lastSkinUsed[0]) {
                                const t = o.settings.shop.skins.find((({
                                    _id: t
                                }) => t === o.settings.userData.lastSkinUsed[0]));
                                t && t.name && ((0, n.iO)((0, i.Uj)(t.name)), o.settings.change("skin", "1%" + t.name.replace(".png", "")), o.settings.storeSettings())
                            }
                            o.settings.winners && o.settings.renderWinnersLeaderboard()
                        }
                    })).catch((t => {}))
                }

                function u(t = (() => {})) {
                    const {
                        serverURL: e,
                        userData: s
                    } = o.settings;
                    fetch(`${l}://${e}/userdata/${s.email}`, {
                        method: "GET",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json",
                            Authorization: `TOKEN ${s.token}`
                        }
                    }).then((t => t.json())).then((e => {
                        if ("success" === e.result) {
                            const s = e.body.user;
                            s.id = e.body.user._id, o.settings.userData = s, o.settings.updateTimer(s), a.A3.extractUserData(), a.A3.drawLevel();
                            const n = document.querySelector(".profile-image");
                            d = n.innerHTML, n.innerHTML = `<img class="profile-image-icon" src="${o.settings.userData.imageURL}">`;
                            document.querySelector(".profile-image-icon").classList.add("no-click");
                            const i = document.querySelector(".profile-name");
                            h = i.innerHTML, i.innerHTML = o.settings.userData.givenName;
                            document.querySelector("#user-level").innerHTML = e.body.user.level || 0;
                            document.querySelector("#progress-next").innerText = `${e.body.user.exp}/${e.body.user.nextLevel}`;
                            document.querySelector("#user-line-progress").setAttribute("style", `width:${e.body.user.progress||0}%`);
                            const r = document.querySelectorAll(".coins-value");
                            for (let t = 0; r[t]; t++) r[t].innerHTML = e.body.user.gold;
                            t()
                        }
                    })).catch((t => {}))
                }

                function v(t) {
                    const e = document.getElementById("skin-select_add"),
                        s = document.getElementById("skin-select_remove");
                    t ? (e?.classList.remove("hide"), s?.classList.add("hide")) : (e?.classList.add("hide"), s?.classList.remove("hide"))
                }

                function f() {
                    const t = document.getElementById("avatar");
                    t && (t.src = "");
                    const e = document.getElementById("js-skin-select-icon"),
                        s = document.getElementById("js-skin-select-icon-text");
                    if (e) {
                        const {
                            serverURL: t
                        } = o.settings;
                        e.style.backgroundImage = `url("${l}://${t.replace("server","assets")}/images/checkerboard.png")`
                    }
                    s && (s.style.opacity = "1"), v(!0), o.settings.change("skin", ""), o.settings.storeSettings()
                }
                Element.prototype.withoutSkin = () => {
                    o.settings.userData.token && ((0, i.AV)(), fetch((0, i.m)(o.settings.userData.email), {
                        method: "GET",
                        headers: {
                            Authorization: `TOKEN ${o.settings.userData.token}`
                        }
                    }).then((t => t.json())).then((({
                        status: t,
                        message: e
                    }) => {
                        if ("success" !== t) return (0, r.uk)(e);
                        f(), (0, i.gl)()
                    })).catch((t => {
                        (0, i.gl)(), (0, r.uk)(t.message)
                    })))
                }, window.attachSigninGoogle = function(t, e) {
                    e.attachClickHandler(t, {}, (function(t) {
                        m()
                    }), (function(t) {
                        "http" === l && JSON.stringify(t, void 0, 2)
                    }))
                }, window.signOut = function() {
                    o.settings.userData = {}, o.settings.clearInterval(), localStorage.removeItem("save"),
                        function() {
                            document.querySelector(".profile-image-icon").classList.remove("no-click"), document.querySelector("#signInBtn").classList.remove("hide"), document.querySelector("#signOutBtn").classList.add("hide"), document.querySelector(".profile-image").innerHTML = d, document.querySelector(".profile-name").innerHTML = h, document.querySelector("#user-level").innerHTML = "0", document.querySelector("#progress-next").innerText = "0/0 XP", document.querySelector("#user-line-progress").setAttribute("style", "width:0");
                            const t = document.querySelectorAll(".coins-value");
                            for (let e = 0; t[e]; e++) t[e].innerHTML = 0;
                            f()
                        }(), document.querySelector("#signOutBtn").classList.add("hide"), document.querySelector("#signInBtn").classList.remove("hide"), o.options.gameOptions.ws && (0, c.SS)()
                }
            },
            428: (t, e, s) => {
                s.d(e, {
                    Eb: () => l,
                    Oo: () => c,
                    gJ: () => r
                });
                var n = s(776),
                    i = s(352);
                const {
                    gameSettings: o
                } = i.settings, {
                    EMPTY_NAME: a
                } = i.options.constants, r = Object.create({
                    messages: [],
                    waitUntil: 0,
                    canvas: document.createElement("canvas"),
                    visible: !1
                }), c = {
                    chtblock: null,
                    vsblBtn: null,
                    thumb: null,
                    track: null,
                    contentShiftY: 0,
                    chatLeftOffset: 0,
                    chatBlockHeight: 182,
                    wrapperHeight: 0,
                    _percent: 0,
                    visability: !0,
                    _alpha: 1,
                    init: function() {
                        return this.chtblock = document.getElementById("chat_block"), this.vsblBtn = document.getElementById("chat_vsbltyBtn"), this.track = document.getElementById("chat_scrollbar"), this.thumb = document.getElementById("chat_thumb"), !!(this.chtblock && this.vsblBtn && this.track && this.thumb) && (this.thumb.addEventListener("pointerdown", this.pDown.bind(this)), this.vsblBtn.addEventListener("click", this.visabilatyChange.bind(this)), this.inited = !0, !0)
                    },
                    visabilatyChange: function() {
                        this.visability ? (this.chtblock.classList.add("chatblock--opacity"), this._alpha = .2, this.visability = !1) : (this.chtblock.classList.remove("chatblock--opacity"), this._alpha = 1, this.visability = !0)
                    },
                    show: function() {
                        this.wrapperHeight = this.chatBlockHeight / i.options.camera.viewportScale, this.inited && r.canvas.height > this.wrapperHeight && r.messages.length ? (this.track.classList.add("chatblock__scrollbar--active"), this.chatLeftOffset = 27, this._updateScrollBar()) : (this.track.classList.remove("chatblock__scrollbar--active"), this.thumb.style.bottom = "0px", this.chatLeftOffset = 0, this.contentShiftY = 0)
                    },
                    pDown: function(t) {
                        t.preventDefault();
                        const e = this,
                            s = t.clientY;
                        let n = 0;

                        function i(t) {
                            t.preventDefault();
                            const i = t.clientY,
                                o = n - (i - s),
                                a = e.track.clientHeight - e.thumb.offsetHeight;
                            o >= 0 && o <= a ? (e.thumb.style.bottom = o + "px", e.shiftContent(100 * o / a)) : o >= 0 ? (e.thumb.style.bottom = a + "px", e.shiftContent(100)) : (e.thumb.style.bottom = "0px", e.shiftContent(0))
                        }
                        e.thumb.style.bottom ? n = +e.thumb.style.bottom.slice(0, -2) : e.thumb.style.bottom = "0px", document.addEventListener("pointermove", i), document.addEventListener("pointerup", (function t(e) {
                            document.removeEventListener("pointermove", i), document.removeEventListener("pointerup", t)
                        }))
                    },
                    shiftContent: function(t) {
                        this._percent = t;
                        const e = this.wrapperHeight,
                            s = r.canvas.height;
                        this.contentShiftY = t * (e - s) / 100
                    },
                    wrapTheChat: function(t) {
                        const e = document.createElement("canvas"),
                            s = e.getContext("2d");
                        return e.height = this.wrapperHeight, e.width = r.canvas.width, s.globalAlpha = this._alpha, s.drawImage(r.canvas, 0, e.height - r.canvas.height - this.contentShiftY), e
                    },
                    _mslngth: 0,
                    _updateScrollBar: function() {
                        if (this._mslngth === r.messages.length) return;
                        this._mslngth = r.messages.length;
                        const t = this.track.clientHeight * this.wrapperHeight / r.canvas.height;
                        this.thumb.style.height = t >= 20 ? t + "px" : "20px";
                        const e = this.track.clientHeight - this.thumb.offsetHeight,
                            s = e / 100,
                            n = this.wrapperHeight - r.canvas.height,
                            i = 100 * this.contentShiftY / n;
                        this.thumb.style.bottom = i * s >= 0 && i * s <= e ? i * s + "px" : i * s >= 0 ? e + "px" : "0px"
                    },
                    destroy: function() {}
                }, l = () => {
                    if (0 === r.messages.length && o.showChat) return r.visible = !1;
                    r.messages.length > 100 && (r.messages = r.messages.slice(r.messages.length - 100)), r.visible = !0;
                    const t = r.canvas,
                        e = t.getContext("2d"),
                        s = r.messages,
                        i = [],
                        l = s.length;
                    for (const t of s) {
                        const s = (0, n.gr)(e, t.name, 150, 30) || a,
                            r = (0, n.gr)(e, t.message, 400, 30).trim();
                        r && i.push([{
                            text: s,
                            color: t.color
                        }, {
                            text: " " + r,
                            color: o.darkTheme ? "#FFF" : "#000"
                        }])
                    }
                    let d = 0;
                    const h = 20 * l + 8;
                    for (const t of i) {
                        let s = 0;
                        for (const n of t) e.font = "18px sans-serif", n.width = e.measureText(n.text).width, s += n.width;
                        d = Math.max(s, d)
                    }
                    t.width = d, t.height = h;
                    for (let t = 0; t < i.length; t++) {
                        const s = i[t];
                        let n = 0;
                        for (const i of s) e.font = "18px sans-serif", e.fillStyle = i.color, e.fillText(i.text, n, 20 * (1 + t)), n += i.width
                    }
                    c.show()
                }
            },
            920: (t, e, s) => {
                s.d(e, {
                    I: () => a,
                    s: () => o
                });
                var n = s(352),
                    i = s(776);

                function o(t, e, s, i, o) {
                    document.getElementById("highest_mass").innerHTML = t;
                    const a = Math.floor(e / 3600),
                        r = Math.floor(e % 3600 / 60),
                        c = Math.floor(e % 3600 % 60),
                        l = a > 0 ? a + " h " : "",
                        d = r > 0 ? r + " m " : "",
                        h = c > 0 ? c + " s" : "";
                    document.getElementById("time_alive").innerHTML = l + " " + d + " " + h, document.getElementById("food_eaten").innerHTML = s, document.getElementById("top_leaderboard_position").innerHTML = i;
                    const m = document.getElementById("menu__bonus"),
                        p = document.querySelector("#menu__bonus > span");
                    o > 0 ? (p.innerHTML = o, m.show()) : (p.innerHTML = 0, m.hide()), n.options.change("escOverlayShown", !0), __line2.classList.remove("line--hidden"), window.googletag && (window.googletag.cmd.push((function() {
                        window.googletag.display(window.adSlot4)
                    })), window.googletag.cmd.push((function() {
                        window.googletag.display(window.adSlot5)
                    })), window.googletag.cmd.push((function() {
                        window.googletag.display(window.adSlot6)
                    })))
                }

                function a() {
                    (0, i.wj)("shop-popup").show(), n.options.change("escOverlayShown", !1), __line2.classList.add("line--hidden"), window.googletag && window.googletag.cmd.push((function() {
                        window.googletag.pubads().refresh()
                    }))
                }
            },
            716: (t, e, s) => {
                s.d(e, {
                    IN: () => b,
                    a_: () => k,
                    PD: () => u,
                    sH: () => f
                });
                var n = s(352),
                    i = s(776);
                const o = function() {
                    function t(t, e, s, n) {
                        this.x = t, this.y = e, this.w = s, this.h = n, this.points = [], this.children = null
                    }

                    function e(e, s, n, i, o) {
                        this.root = new t(e, s, n, i), this.maxPoints = o
                    }
                    return t.prototype = {
                        containsPoint: function(t) {
                            return t.x >= this.x && t.x <= this.x + this.w && t.y >= this.y && t.y <= this.y + this.h
                        },
                        overlaps: function(t) {
                            return t.x < this.x + this.w && t.x + t.w > this.x && t.y < this.y + this.h && t.y + t.h > this.y
                        },
                        insert: function(t, e) {
                            if (null != this.children) {
                                const s = t.x > this.x + this.w / 2,
                                    n = t.y > this.y + this.h / 2;
                                this.children[s + 2 * n].insert(t, 1.1 * e)
                            } else this.points.push(t), this.points.length > e && this.w > 1 && this.split(e)
                        },
                        some: function(e, s) {
                            if (null != this.children)
                                for (let t = 0; t < this.children.length; ++t) {
                                    const n = this.children[t];
                                    if (n.overlaps(e) && n.some(e, s)) return !0
                                } else
                                    for (let n = 0; n < this.points.length; ++n) {
                                        const i = this.points[n];
                                        if (t.prototype.containsPoint.call(e, i) && s(i)) return !0
                                    }
                            return !1
                        },
                        split: function(e) {
                            this.children = [];
                            const s = this.w / 2,
                                n = this.h / 2;
                            for (let e = 0; e < 2; ++e)
                                for (let i = 0; i < 2; ++i) {
                                    const o = this.x + i * s,
                                        a = this.y + e * n;
                                    this.children.push(new t(o, a, s, n))
                                }
                            const i = this.points;
                            this.points = [];
                            const o = this.x + s,
                                a = this.y + n;
                            for (let t = 0; t < i.length; ++t) {
                                const s = i[t],
                                    n = s.x > o,
                                    r = s.y > a;
                                this.children[n + 2 * r].insert(s, 1.1 * e)
                            }
                        },
                        clear: function() {
                            if (null != this.children) {
                                for (let t = 0; t < 4; ++t) this.children[t].clear();
                                this.children.length = 0, this.children = null
                            }
                            this.points.length = 0, this.points = null
                        }
                    }, e.prototype = {
                        clear: function() {
                            this.root.clear()
                        },
                        insert: function(t) {
                            this.root.containsPoint(t) && this.root.insert(t, this.maxPoints)
                        },
                        some: function(t, e) {
                            return this.root.some(t, e)
                        }
                    }, e
                }();
                var a = s(428);
                const {
                    EMPTY_NAME: r,
                    QUADTREE_MAX_POINTS: c,
                    PI_2: l
                } = n.options.constants, d = {}, h = {}, m = window.location.host;

                function p(t) {
                    const e = ~~((t = ~~t) / 60);
                    if (e < 1) return "<1 min";
                    const s = ~~(e / 60);
                    if (s < 1) return e + "min";
                    const n = ~~(s / 24);
                    return n < 1 ? s + "h" : n + "d"
                }
                const g = "#FFC826";

                function u() {
                    const {
                        stats: t
                    } = n.options;
                    if (!t.info) return t.visible = !1;
                    n.options.stats.visible = !0;
                    const e = t.canvas,
                        s = e.getContext("2d");
                    s.font = "14px sans-serif";
                    const i = [t.info.name + " (" + t.info.mode + ")", t.info.playersTotal + " / " + t.info.playersLimit + " players", t.info.playersAlive + " playing", t.info.playersSpect + " spectating", (2.5 * t.info.update).toFixed(1) + "% load @ " + p(t.info.uptime)];
                    let o = 0;
                    for (let t = 0; t < i.length; t++) o = Math.max(o, 2 + s.measureText(i[t]).width + 2);
                    e.width = o, e.height = 16 * i.length, s.font = "14px sans-serif", s.fillStyle = n.settings.gameSettings.darkTheme ? "#AAA" : "#555", s.textBaseline = "top";
                    for (let t = 0; t < i.length; t++) s.fillText(i[t], 2, 16 * t - 1)
                }

                function v(t, e, s, n, i) {
                    t.font = i + "px sans-serif", t.textBaseline = "middle", t.textAlign = "center", t.lineWidth = Math.max(~~(i / 10), 2), t.fillStyle = "#FFF", t.strokeStyle = "#000", 1 !== t.lineWidth && t.strokeText(n, e, s), t.fillText(n, e, s), t.restore()
                }

                function f(t, e, s, o, a, r, c, l) {
                    if (t.save(), a > 500) return v(t, s, o, c, r);
                    if (t.imageSmoothingQuality = "high", e) {
                        const e = function(t) {
                            const e = Object.keys(h);
                            for (let s = 0, n = e.length; s < n; s++)
                                if ((0, i.gX)(t, e[s], t / 4)) return h[e[s]];
                            return function(t) {
                                const e = {
                                    0: {},
                                    1: {},
                                    2: {},
                                    3: {},
                                    4: {},
                                    5: {},
                                    6: {},
                                    7: {},
                                    8: {},
                                    9: {}
                                };
                                for (const s in e) {
                                    const n = e[s].canvas = document.createElement("canvas"),
                                        i = n.getContext("2d");
                                    w(n, i, s, t), e[s].canvas = n, e[s].width = n.width, e[s].height = n.height
                                }
                                return h[t] = {
                                    canvases: e,
                                    size: t,
                                    lineWidth: Math.max(~~(t / 10), 2),
                                    accessTime: n.options.gameOptions.syncAppStamp
                                }, h[t]
                            }(t)
                        }(a);
                        e.accessTime = n.options.gameOptions.syncAppStamp;
                        const l = e.canvases,
                            d = r / e.size;
                        let m = 0;
                        for (let t = 0; t < c.length; t++) m += l[c[t]].width - 2 * e.lineWidth;
                        t.scale(d, d), s /= d, o /= d, s -= m / 2;
                        for (let n = 0; n < c.length; n++) {
                            const i = l[c[n]];
                            t.drawImage(i.canvas, s, o - i.height / 2), s += i.width - 2 * e.lineWidth
                        }
                    } else {
                        const e = function(t, e, s) {
                            if (!d[t]) return y(t, e, s);
                            const n = Object.keys(d[t]);
                            for (let s = 0, o = n.length; s < o; s++)
                                if ((0, i.gX)(e, n[s], e / 4)) return d[t][n[s]];
                            return y(t, e, s)
                        }(c, a, l);
                        e.accessTime = n.options.gameOptions.syncAppStamp;
                        const h = e.canvas,
                            m = r / e.size;
                        t.scale(m, m), s /= m, o /= m, t.drawImage(h, s - h.width / 2, o - h.height / 2)
                    }
                    t.restore()
                }

                function w(t, e, s, n, i) {
                    const o = e.createLinearGradient(0, 50, 200, 50);
                    o.addColorStop(0, "#EB9500"), o.addColorStop(.53, "#F9BF0D"), o.addColorStop(1, "#E4B110"), e.font = n + "px sans-serif", e.lineWidth = Math.max(~~(n / 10), 2), t.width = e.measureText(s).width + 2 * e.lineWidth, t.height = 4 * n, e.font = n + "px sans-serif", e.shadowColor = "#000", e.shadowBlur = 7, e.lineWidth = Math.max(~~(n / 10), 2), e.textBaseline = "middle", e.textAlign = "center", e.fillStyle = i ? o : "#FFF", e.strokeStyle = i ? "#40200A" : "#000", e.translate(t.width / 2, 2 * n), 1 !== e.lineWidth && e.strokeText(s, 0, 0), e.shadowBlur = 0, e.fillText(s, 0, 0)
                }

                function y(t, e, s) {
                    const i = document.createElement("canvas"),
                        o = i.getContext("2d");
                    return w(i, o, t, e, s), d[t] = d[t] || {}, d[t][e] = {
                        width: i.width,
                        height: i.height,
                        canvas: i,
                        value: t,
                        size: e,
                        accessTime: n.options.gameOptions.syncAppStamp
                    }, d[t][e]
                }

                function b() {
                    n.options.stats.fps += (1e3 / Math.max(Date.now() - n.options.gameOptions.syncAppStamp, 1) - n.options.stats.fps) / 10, n.options.change("syncAppStamp", Date.now());
                    const t = n.options.cells.list.slice(0).sort(i.kh);
                    for (let e = 0, s = t.length; e < s; e++) t[e].update(n.options.gameOptions.syncAppStamp);
                    if (function() {
                            const t = [];
                            for (let e = 0; e < n.options.cells.mine.length; e++) n.options.cells.byId.hasOwnProperty(n.options.cells.mine[e]) && t.push(n.options.cells.byId[n.options.cells.mine[e]]);
                            if (t.length > 0) {
                                const e = t.length;
                                let s = 0,
                                    i = 0,
                                    o = 0,
                                    a = 0,
                                    r = 0;
                                const c = n.settings.haveBoost(),
                                    l = c ? 2 : 1;
                                for (let n = 0; n < e; n++) {
                                    const e = t[n],
                                        d = ~~(e.ns * e.ns / 100);
                                    a += d * l, s += e.x, i += e.y, o += e.s, c && (r += d)
                                }
                                if (n.options.camera.target.x = s / e, n.options.camera.target.y = i / e, n.options.camera.sizeScale = Math.pow(Math.min(64 / o, 1), .4), n.options.camera.target.scale = n.options.camera.sizeScale, n.options.camera.target.scale *= n.options.camera.viewportScale * n.options.camera.userZoom, n.options.camera.x = (n.options.camera.target.x + n.options.camera.x) / 2, n.options.camera.y = (n.options.camera.target.y + n.options.camera.y) / 2, n.options.stats.score = a, a > n.options.gameOptions.maxWeight && (n.options.change("maxWeight", a), c)) {
                                    const t = Math.max(+n.options.gameOptions.bonus, +r);
                                    n.options.change("bonus", t)
                                }
                                const d = Math.max(n.options.stats.maxScore, a);
                                n.options.stats.maxScore = d, n.options.store.save(10, d)
                            } else n.options.store.reset(), n.options.stats.score = NaN, n.options.stats.maxScore = 0, n.options.stats.bonus = 0, n.options.store.save(10, 0), n.options.store.save(11, 0), n.options.store.save(12, 100), n.options.store.save(13, 0), n.options.camera.x += (n.options.camera.target.x - n.options.camera.x) / 20, n.options.camera.y += (n.options.camera.target.y - n.options.camera.y) / 20;
                            n.options.camera.scale += (n.options.camera.target.scale - n.options.camera.scale) / 9
                        }(), n.settings.gameSettings.jellyPhysics) {
                        ! function() {
                            const {
                                camera: t
                            } = n.options, e = 1920 / t.sizeScale, s = 1080 / t.sizeScale, i = t.x - e / 2, a = t.y - s / 2, r = new o(i, a, e, s, c);
                            n.options.change("quadtree", r);
                            for (let t = 0; t < n.options.cells.list.length; ++t) {
                                const e = n.options.cells.list[t];
                                for (let t = 0; t < e.points.length; ++t) n.options.gameOptions.quadtree.insert(e.points[t])
                            }
                        }();
                        for (let e = 0, s = t.length; e < s; ++e) {
                            const s = t[e];
                            s.updateNumPoints(), s.movePoints()
                        }
                    }
                    n.options.gameOptions.mainCtx.save(), n.options.gameOptions.mainCtx.fillStyle = n.settings.gameSettings.darkTheme ? "#111" : "#F2FBFF", n.options.gameOptions.mainCtx.fillRect(0, 0, n.options.gameOptions.mainCanvas.width, n.options.gameOptions.mainCanvas.height), n.settings.gameSettings.showGrid && function() {
                            const {
                                gameOptions: t,
                                camera: e
                            } = n.options, {
                                mainCanvas: s,
                                mainCtx: i
                            } = t;
                            i.save(), i.lineWidth = 1, i.strokeStyle = n.settings.gameSettings.darkTheme ? "#AAA" : "#000", i.globalAlpha = .2;
                            const o = 50;
                            let a;
                            const r = s.width / e.scale,
                                c = s.height / e.scale,
                                l = (-e.x + r / 2) % o,
                                d = (-e.y + c / 2) % o;
                            for (x(i), i.beginPath(), a = l; a < r; a += o) i.moveTo(a, 0), i.lineTo(a, c);
                            for (a = d; a < c; a += o) i.moveTo(0, a), i.lineTo(r, a);
                            i.stroke(), i.restore()
                        }(), n.settings.gameSettings.backgroundSectors && function() {
                            const {
                                gameOptions: {
                                    mainCtx: t
                                },
                                border: e
                            } = n.options;
                            if (void 0 === e || void 0 === e.width) return;
                            t.save();
                            const s = 5,
                                i = ["ABCDE", "12345"],
                                o = e.width / s,
                                a = e.height / s;
                            S(t), t.fillStyle = n.settings.gameSettings.darkTheme ? "#666" : "#DDD", t.textBaseline = "middle", t.textAlign = "center", t.font = (o / 3 | 0) + "px sans-serif";
                            for (let n = 0; n < s; ++n)
                                for (let r = 0; r < s; ++r) {
                                    const s = i[0][r] + i[1][n],
                                        c = (r + .5) * o + e.left,
                                        l = (n + .5) * a + e.top;
                                    t.fillText(s, c, l)
                                }
                            t.restore()
                        }(), S(n.options.gameOptions.mainCtx),
                        function() {
                            if (!n.settings.gameSettings.showBorder) return;
                            const {
                                border: t,
                                gameOptions: e
                            } = n.options, {
                                mainCtx: s
                            } = e;
                            s.strokeStyle = "#0000ff", s.lineWidth = 20, s.lineCap = "round", s.lineJoin = "round", s.beginPath(), s.moveTo(t.left, t.top), s.lineTo(t.right, t.top), s.lineTo(t.right, t.bottom), s.lineTo(t.left, t.bottom), s.closePath(), s.stroke()
                        }();
                    for (let e = 0, s = t.length; e < s; e++) t[e].draw(n.options.gameOptions.mainCtx);
                    ! function(t) {
                        const {
                            gameOptions: {
                                mainCanvas: e
                            },
                            camera: s
                        } = n.options;
                        t.translate(s.x, s.y),
                            function(t) {
                                const {
                                    camera: e
                                } = n.options;
                                t.scale(1 / e.scale, 1 / e.scale)
                            }(t), t.translate(-e.width / 2, -e.height / 2)
                    }(n.options.gameOptions.mainCtx), n.options.change("quadtree", null), n.options.gameOptions.mainCtx.scale(n.options.camera.viewportScale, n.options.camera.viewportScale);
                    let e = 2;
                    n.options.gameOptions.mainCtx.fillStyle = n.settings.gameSettings.darkTheme ? "#FFF" : "#000", n.options.gameOptions.mainCtx.textBaseline = "top", isNaN(n.options.stats.score) || (n.options.gameOptions.mainCtx.font = "30px sans-serif", n.options.gameOptions.mainCtx.fillText("Score: " + n.options.stats.score, 2, e), e += 30), n.options.gameOptions.mainCtx.font = "20px sans-serif";
                    let s = ~~n.options.stats.fps + " FPS";
                    if (isNaN(n.options.stats.latency) || (s += " " + n.options.stats.latency + "ms ping"), n.options.gameOptions.mainCtx.fillText(s, 2, e), e += 24, n.options.stats.visible && n.options.gameOptions.mainCtx.drawImage(n.options.stats.canvas, 2, e), n.options.leaderboard.visible && n.options.gameOptions.mainCtx.drawImage(n.options.leaderboard.canvas, n.options.gameOptions.mainCanvas.width / n.options.camera.viewportScale - 10 - n.options.leaderboard.canvas.width, 10), n.settings.gameSettings.showChat && a.gJ.visible && (n.options.gameOptions.mainCtx.drawImage(a.Oo.wrapTheChat(a.gJ.canvas), (10 + a.Oo.chatLeftOffset) / n.options.camera.viewportScale, (n.options.gameOptions.mainCanvas.height - 54) / n.options.camera.viewportScale - a.Oo.wrapperHeight), n.options.gameOptions.mainCtx.globalAlpha = 1), function() {
                            const {
                                gameOptions: t,
                                camera: e,
                                border: s
                            } = n.options, {
                                mainCanvas: i,
                                mainCtx: o
                            } = t;
                            if (0 !== s.centerX || 0 !== s.centerY || !n.settings.gameSettings.showMinimap) return;
                            o.save(), o.resetTransform();
                            const a = 200,
                                c = s.width / s.height,
                                d = a * c * e.viewportScale,
                                h = a / c * e.viewportScale,
                                m = i.width - d,
                                p = i.height - h;
                            o.fillStyle = "#000", o.globalAlpha = .4, o.fillRect(m, p, d, h), o.globalAlpha = 1;
                            const g = 5,
                                u = ["ABCDE", "12345"],
                                v = d / g,
                                f = h / g,
                                w = Math.min(v, f) / 3;
                            o.fillStyle = n.settings.gameSettings.darkTheme ? "#666" : "#DDD", o.textBaseline = "middle", o.textAlign = "center", o.font = w + "px sans-serif";
                            for (let t = 0; t < g; t++) {
                                const e = (t + .5) * v;
                                for (let s = 0; s < g; s++) {
                                    const n = (s + .5) * f;
                                    o.fillText(u[0][t] + u[1][s], m + e, p + n)
                                }
                            }
                            const y = d / s.width,
                                b = h / s.height,
                                S = s.width / 2,
                                x = s.height / 2,
                                k = m + (e.x + S) * y,
                                T = p + (e.y + x) * b,
                                _ = m + ((k - m) / v | 0) * v,
                                L = p + ((T - p) / f | 0) * f;
                            if (o.fillStyle = "yellow", o.globalAlpha = .3, o.fillRect(_, L, v, f), o.globalAlpha = 1, o.beginPath(), n.options.cells.mine.length)
                                for (let t = 0; t < n.options.cells.mine.length; t++) {
                                    const e = n.options.cells.byId[n.options.cells.mine[t]];
                                    if (e) {
                                        o.fillStyle = e.color;
                                        const t = m + (e.x + S) * y,
                                            s = p + (e.y + x) * b,
                                            n = Math.max(e.s, 200) * (y + b) / 2;
                                        o.moveTo(t + n, s), o.arc(t, s, n, 0, l)
                                    }
                                } else o.fillStyle = "#FAA", o.arc(k, T, 5, 0, l);
                            o.fill();
                            let j = null;
                            for (let t = 0, e = n.options.cells.mine.length; t < e; t++)
                                if (n.options.cells.byId.hasOwnProperty(n.options.cells.mine[t])) {
                                    j = n.options.cells.byId[n.options.cells.mine[t]];
                                    break
                                } if (null !== j) {
                                o.fillStyle = n.settings.gameSettings.darkTheme ? "#DDD" : "#222";
                                const t = w;
                                o.font = t + "px sans-serif", o.fillText(j.name || r, k, T - 7 - t / 2)
                            }
                            const C = n.options.cells.list.filter((t => t.clan && t.clan === n.options.cells.clan)),
                                O = C.filter((({
                                    x: t,
                                    y: e
                                }) => {
                                    if (!t || !e || !j) return !1;
                                    const s = Math.abs(t - j.x),
                                        n = Math.abs(e - j.y);
                                    return s > 2400 || n > 1580
                                }));
                            C.forEach((t => {
                                if (n.options.cells.mine.includes(t.id)) return;
                                o.beginPath(), o.fillStyle = t.color;
                                const e = m + (t.x + S) * y,
                                    s = p + (t.y + x) * b,
                                    i = Math.max(t.s, 200) * (y + b) / 2;
                                o.moveTo(e + i, s), o.arc(e, s, i, 0, l), o.fill()
                            })), O.forEach((t => {
                                const e = m + (t.x + S) * y,
                                    s = p + (t.y + x) * b,
                                    i = .7 * w;
                                o.fillStyle = n.settings.gameSettings.darkTheme ? "#DDD" : "#222", o.font = i + "px sans-serif", o.fillText(t.name || r, e, s - 7 - i / 2)
                            })), o.restore()
                        }(), function() {
                            const {
                                border: t,
                                gameOptions: e,
                                camera: s
                            } = n.options, {
                                mainCanvas: i,
                                mainCtx: o
                            } = e;
                            if (0 !== t.centerX || 0 !== t.centerY || !n.settings.gameSettings.showPosition) return;
                            const a = t.width / t.height * 200,
                                r = t.height / t.width * 40;
                            let c = i.width / s.viewportScale - a,
                                l = i.height / s.viewportScale - r;
                            n.settings.gameSettings.showMinimap ? (o.font = "15px sans-serif", c += a / 2 - 1, l -= 194 * t.height / t.width, o.textAlign = "right", o.fillStyle = n.settings.gameSettings.darkTheme ? "#AAA" : "#555", o.fillText("X: " + ~~s.x + ", Y: " + ~~s.y, c + a / 2, l + r / 2)) : (o.fillStyle = "#000", o.globalAlpha = .4, o.fillRect(c, l, a, r), o.globalAlpha = 1, v(o, c + a / 2, l + r / 2, "X: " + ~~s.x + ", Y: " + ~~s.y))
                        }(), n.options.gameOptions.mainCtx.restore(), n.options.gameOptions.minionControlled) {
                        n.options.gameOptions.mainCtx.save(), n.options.gameOptions.mainCtx.font = "12px sans-serif", n.options.gameOptions.mainCtx.textAlign = "center", n.options.gameOptions.mainCtx.textBaseline = "hanging", n.options.gameOptions.mainCtx.fillStyle = "#eea236";
                        const t = "You are controlling a minion, press Q to switch back.";
                        n.options.gameOptions.mainCtx.fillText(t, n.options.gameOptions.mainCanvas.width / 2, 5), n.options.gameOptions.mainCtx.restore()
                    }! function() {
                        for (const t in d) {
                            for (const e in d[t]) n.options.gameOptions.syncAppStamp - d[t][e].accessTime >= 5e3 && delete d[t][e];
                            d[t] === {} && delete d[t]
                        }
                        for (const t in h) n.options.gameOptions.syncAppStamp - h[t].accessTime >= 5e3 && delete h[t]
                    }(), window.requestAnimationFrame(b)
                }

                function S(t) {
                    const {
                        gameOptions: {
                            mainCanvas: e
                        },
                        camera: s
                    } = n.options;
                    t.translate(e.width / 2, e.height / 2), x(t), t.translate(-s.x, -s.y)
                }

                function x(t) {
                    const {
                        camera: e
                    } = n.options;
                    t.scale(e.scale, e.scale)
                }

                function k() {
                    const {
                        topLeaderboardPosition: t
                    } = n.options.gameOptions;
                    if ("string" != typeof n.options.leaderboard.type) return n.options.leaderboard.visible = !1;
                    if (!n.settings.gameSettings.showNames || 0 === n.options.leaderboard.items.length) return n.options.leaderboard.visible = !1;
                    n.options.leaderboard.visible = !0;
                    const e = n.options.leaderboard.canvas,
                        s = e.getContext("2d"),
                        i = n.options.leaderboard.items.length;
                    e.width = 200;
                    const o = i + 1;
                    if (e.height = "pie" !== n.options.leaderboard.type ? 60 + 24 * o : 240, s.globalAlpha = .4, s.fillStyle = "#000", s.fillRect(0, 0, 200, e.height), s.globalAlpha = 1, s.fillStyle = "#FFF", s.font = "28px sans-serif", s.fillText("Leaderboard", 100 - s.measureText("Leaderboard").width / 2, 40), "pie" === n.options.leaderboard.type) {
                        let t = 0;
                        for (let e = 0; e < i; e++) s.fillStyle = n.options.leaderboard.teams[e], s.beginPath(), s.moveTo(100, 140), s.arc(100, 140, 80, t, t += n.options.leaderboard.items[e] * l, !1), s.closePath(), s.fill()
                    } else {
                        let e, o, a, r = !1;
                        if (s.font = "18px sans-serif", 0 !== parseInt(n.options.leaderboard.items[0].myposition) && parseInt(n.options.leaderboard.items[0].myposition) < t) {
                            const t = parseInt(n.options.leaderboard.items[0].myposition);
                            n.options.store.save(12, t), n.options.change("topLeaderboardPosition", t)
                        }
                        if (n.options.leaderboard.items[0].myposition >= 10) {
                            for (let t = 0; t < i - 1; t++) {
                                "text" === n.options.leaderboard.type ? e = n.options.leaderboard.items[t] : (e = n.options.leaderboard.items[t].name, r = n.options.leaderboard.items[t].me);
                                const {
                                    subscription: i
                                } = n.options.leaderboard.items[t];
                                s.fillStyle = r ? "#FAA" : i ? g : "#FFF", "ffa" === n.options.leaderboard.type && (e = t + 1 + ". " + e), a = (o = s.measureText(e).width) > 200 ? 2 : 100 - .5 * o, s.fillText(e, a, 70 + 24 * t)
                            }
                            if (0 !== n.options.leaderboard.items[0].myposition) {
                                s.fillStyle = "#FAA";
                                const t = n.options.leaderboard.items[0].myposition + ". " + n.settings.gameSettings.nick || m;
                                a = (o = s.measureText(t).width) > 200 ? 2 : 100 - .5 * o, s.fillText(t, a, 70 + 24 * (i - 1))
                            }
                        } else
                            for (let t = 0; t < i; t++) {
                                "text" === n.options.leaderboard.type ? e = n.options.leaderboard.items[t] : (e = n.options.leaderboard.items[t].name, r = n.options.leaderboard.items[t].me);
                                const {
                                    subscription: i
                                } = n.options.leaderboard.items[t];
                                s.fillStyle = r ? "#FAA" : i ? g : "#FFF", "ffa" === n.options.leaderboard.type && (e = t + 1 + ". " + e), a = (o = s.measureText(e).width) > 200 ? 2 : 100 - .5 * o, s.fillText(e, a, 70 + 24 * t)
                            }
                    }
                }
            },
            776: (t, e, s) => {
                function n(t) {
                    return document.getElementById(t) || {}
                }

                function i(t, e, s, n) {
                    for (;;) {
                        const i = t.measureText(e),
                            o = Math.abs(i.actualBoundingBoxLeft) + Math.abs(i.actualBoundingBoxRight),
                            a = Math.abs(i.actualBoundingBoxDescent) + Math.abs(i.actualBoundingBoxAscent);
                        if (o < s && a < n) break;
                        e = e.slice(0, -1)
                    }
                    return e
                }

                function o(t, e, s) {
                    return t - s <= e && e <= t + s
                }

                function a(t, e) {
                    return t.s === e.s ? t.id - e.id : t.s - e.s
                }

                function r(t) {
                    for (const e in t) delete t[e]
                }

                function c(t, e) {
                    return (t.x - e.x) * (t.x - e.x) + (t.y - e.y) * (t.y - e.y)
                }

                function l(t, e, s) {
                    return "#" + (1 << 24 | t << 16 | e << 8 | s).toString(16).slice(1)
                }

                function d(t) {
                    const e = function(t) {
                        let e = t.slice(1);
                        if (3 === e.length && (e = e.split("").map((function(t) {
                                return t + t
                            }))), 6 !== e.length) throw new Error("invalid color " + t);
                        const s = parseInt(e, 16);
                        return {
                            r: s >>> 16 & 255,
                            g: s >>> 8 & 255,
                            b: 255 & s
                        }
                    }(t);
                    return l(.9 * e.r, .9 * e.g, .9 * e.b)
                }

                function h(t) {
                    const e = document.querySelectorAll(".coins-value");
                    for (let s = 0; e[s]; s++) e[s].innerHTML = t
                }

                function m(t) {
                    const e = n("errormodal"),
                        s = document.querySelector("#errormodal p");
                    t && (s.innerHTML = t.replace("Error: ", "")), e.show(.2)
                }

                function p() {
                    const t = function() {
                            if (window.innerWidth <= 640) return !0;
                            return [/Android/i, /webOS/i, /iPhone/i, /iPad/i, /iPod/i, /BlackBerry/i, /Windows Phone/i].some((t => navigator.userAgent.match(t)))
                        }(),
                        e = t => !t || "none" === window.getComputedStyle(t).display,
                        s = document.querySelector([37, 18, 4, 19, 19, 8, 13, 6, 18, 36, 12, 4, 13, 20, 36, 7, 14, 11, 3, 4, 17].map((t => "abcdefghijklmnopqrstuvwxyz0123456789-." [t])).join("")),
                        n = document.querySelector("#ad_bottom"),
                        i = document.querySelector("#div-gpt-ad-1622841396282-0"),
                        o = document.querySelector("#div-gpt-ad-1622632389350-0"),
                        a = document.querySelector("#div-gpt-ad-1622841482467-0");
                    if (s) return "mod";
                    if (t) {
                        if (e(i) || e(o)) return "other"
                    } else {
                        if (e(n)) return "blocker";
                        if (e(i) || e(o) || e(a)) return "other"
                    }
                    return null
                }
                s.d(e, {
                    C0: () => c,
                    EH: () => l,
                    Iv: () => d,
                    UZ: () => h,
                    WQ: () => p,
                    gX: () => o,
                    gr: () => i,
                    kh: () => a,
                    uO: () => r,
                    uk: () => m,
                    wj: () => n
                })
            },
            732: (t, e, s) => {
                s.r(e), s.d(e, {
                    init: () => D
                });
                var n = s(776),
                    i = s(352),
                    o = s(920),
                    a = s(428),
                    r = s(716),
                    c = s(0),
                    l = s(429),
                    d = s(292);
                const h = new class {
                    clans = [];
                    joined = {};
                    _name = "";
                    clan = null;
                    _email = null;
                    tab = "clan";
                    reset() {
                        this.clans = [], this.joined = {}, this._name = "", this._email = null, this.clan = null, this.tab = "clan"
                    }
                    handleClan(t) {
                        this.clan = t
                    }
                    renderClans() {
                        const {
                            clans: t,
                            joined: e
                        } = this, s = t.map((({
                            _id: t,
                            name: s,
                            membersLength: n
                        }) => {
                            const i = !0 === e[t];
                            return `<div class="clans-item">\n        <div><b>${s}</b><span>(${n}/60)</span></div>\n        <button${i?' class="sent"':""} onclick="this.joinClan('${t}')">${i?clanLocales.sent:clanLocales.join}</button>\n      </div>`
                        })).join("");
                        (0, n.wj)("clans-list").innerHTML = s
                    }
                    createClan() {
                        return i.settings.userData.token ? i.settings.userData.subscription < Date.now() ? (0, n.uk)("Only subscribers can create a clan") : this._name.length ? void(0, d.op)({
                            token: i.settings.userData.token,
                            name: this._name,
                            email: i.settings.userData.email
                        }).then((({
                            data: t,
                            status: e,
                            message: s
                        }) => {
                            if ("success" !== e) return (0, n.uk)(s);
                            const {
                                _id: o
                            } = t;
                            this.reset(), i.settings.userData.clan = o, this.handleClan(t), (0, n.wj)("clans").hide(), this.drawClanModal()
                        })) : (0, n.uk)("You should give a name for a clan") : (0, n.wj)("needtobeloggined").show(.3)
                    }
                    drawClansModal() {
                        const t = this,
                            e = document.querySelector("#clans-input input"),
                            s = document.querySelector("#clans-input button");
                        e.value = t._name, e.onchange = e => t._name = e.target.value, s.onclick = this.createClan.bind(this), this.renderClans(), (0, n.wj)("clans").show(.3)
                    }
                    isAdmin(t) {
                        const {
                            role: e
                        } = this.clan.members.find((({
                            email: e
                        }) => e === t));
                        return "leader" === e || "co-leader" === e
                    }
                    drawClanModal() {
                        if (!this.clan) return (0, n.uk)("Something goes wrong. Try to restart the page");
                        "clan" === this.tab ? this.drawClanTab() : this.drawRequestsTab(), (0, n.wj)("clan").show(.3)
                    }
                    drawRequestsTab() {
                        const {
                            requests: t
                        } = this.clan, e = this.isAdmin(i.settings.userData.email) ? ' class="requests"' : "", s = t.map((({
                            givenName: t,
                            email: e,
                            level: s,
                            subscription: n
                        }) => `<div class="${"number"==typeof n&&n>Date.now()?"clan-request sub":"clan-request"}">\n        <div class="request-name">${t}</div>\n      <div>\n        <div class="member-level">\n          <div class="star-icon"></div><span>${s}</span>\n        </div>\n        <button class="member-reject" onclick="this.handleClan('reject', '${e}')">\n          <div class="reject-icon"></div>\n        </button>\n        <button class="member-resolve" onclick="this.handleClan('resolve', '${e}')">\n          <div class="resolve-icon"></div>\n        </button>\n      </div>\n    </div>`)).join(""), o = `<div class="connecting__content">\n      <div class="close-connecting-button">\n        <i onclick="closeClanModal()" class="fas fa-times"></i>\n      </div>\n      <h2>${clanLocales.clan}</h2>\n      <div id="clan-content"${e}>\n\n        <div class="clan-head">\n          <div class="head-buttons">\n            <button id="clan-handler" onclick="this.handleClan('clan-tab')">${clanLocales.clan}</button>\n            <button id="request-handler">${clanLocales.requests}</button>\n          </div>\n        </div>\n\n        <div id="clan-requests" class="hidden-scroll">\n          ${s}\n        </div>\n        \n      </div>\n    </div>`;
                        (0, n.wj)("clan").innerHTML = o
                    }
                    drawClanTab() {
                        const {
                            name: t,
                            membersLength: e,
                            members: s
                        } = this.clan, o = this.isAdmin(i.settings.userData.email) ? ' class="role"' : "", a = s.sort(((t, e) => e.level - t.level)).map((({
                            role: t,
                            givenName: e,
                            imageURL: s,
                            email: n,
                            level: i,
                            subscription: o
                        }, a) => `<div class="${"number"==typeof o&&o>Date.now()?"clan-member sub":"clan-member"}">\n      <div>\n        <div class="member-index">${a+1}</div>\n        <div class="member-avatar" style="background-image:url('${s}')"></div>\n        <div class="member-desc">\n          <p>${e}</p>\n          <p>${clanLocales[t]}</p>\n        </div>\n      </div>\n      <div>\n        <div class="member-level">\n          <div class="star-icon"></div><span>${i}</span>\n        </div>\n        <button class="member-role" onclick="this.handleClan('role', '${n}')">\n          <div class="role-icon"></div>\n        </button>\n      </div>\n    </div>`)).join(""), r = `<div class="connecting__content">\n      <div class="close-connecting-button">\n        <i onclick="closeClanModal()" class="fas fa-times"></i>\n      </div>\n      <h2>${clanLocales.clan}</h2>\n      <div id="clan-content"${o}>\n        <div class="clan-head">\n          <div class="head-buttons">\n            <button id="clan-handler">${clanLocales.clan}</button>\n            <button id="request-handler" onclick="this.handleClan('requests-tab')">${clanLocales.requests}</button>\n          </div>\n          <div class="head-desc">\n            <div>\n              <div class="head-icon">\n                <div class="clan-icon"></div>\n              </div>\n              <div id="clan-head-name">${t}</div>\n            </div>\n            <div>\n              <div>${clanLocales.members}<b id="clan-header-members">${e}/60</b></div>\n            </div>\n          </div>\n        </div>\n        <div id="clan-members" class="hidden-scroll">\n          ${a}\n        </div>\n        <div id="clan-leave">\n          <div>${clanLocales.members}<b id="clan-footer-members">${e}/60</b></div>\n          <button onclick="this.handleClan('confirm-leave', '${i.settings.userData.email}')">${clanLocales.leave}</button>\n        </div>\n      </div>\n    </div>`;
                        (0, n.wj)("clan").innerHTML = r
                    }
                    render() {
                        const {
                            clan: t
                        } = i.settings.userData;
                        this.reset(), t ? (0, d.YP)(t).then((({
                            data: t,
                            status: e,
                            message: s
                        }) => {
                            if ("success" !== e) return (0, n.uk)(s);
                            this.handleClan(t), this.drawClanModal()
                        })) : (0, d.LH)().then((({
                            data: t,
                            status: e,
                            message: s
                        }) => {
                            if ("success" !== e) return (0, n.uk)(s);
                            this.clans = t, this.drawClansModal()
                        }))
                    }
                };
                Element.prototype.handleClan = function t(e, s) {
                    "role" === e && (h._email = s, (0, n.wj)("clan-assign").show(.2)), "confirm-leave" === e && (h._email = s, (0, n.wj)("clan-leave-modal").show(.2)), "confirmed-leave" === e && ((0, n.wj)("clan-leave-modal").hide(), t("leave", h._email)), "confirm-role" === e && ((0, n.wj)("clan-assign").hide(), "expel" === s ? t("leave", h._email) : (0, d.aC)({
                        token: i.settings.userData.token,
                        email: h._email,
                        role: s,
                        id: h.clan._id,
                        moderator: i.settings.userData.email
                    }).then((({
                        data: t,
                        status: e,
                        message: s
                    }) => {
                        if ("success" !== e) return (0, n.uk)(s);
                        h.handleClan(t), h.drawClanTab()
                    }))), "clan-tab" === e && h.drawClanTab(), "requests-tab" === e && h.drawRequestsTab(), "resolve" === e && (0, d.Kh)({
                        id: h.clan._id,
                        token: i.settings.userData.token,
                        email: s,
                        moderator: i.settings.userData.email
                    }).then((({
                        data: t,
                        status: e,
                        message: s
                    }) => {
                        if ("success" !== e) return (0, n.uk)(s);
                        h.handleClan(t), h.drawRequestsTab()
                    })), "reject" === e && (0, d.m_)({
                        id: h.clan._id,
                        token: i.settings.userData.token,
                        email: s,
                        moderator: i.settings.userData.email
                    }).then((({
                        data: t,
                        status: e,
                        message: s
                    }) => {
                        if ("success" !== e) return (0, n.uk)(s);
                        h.handleClan(t), h.drawRequestsTab()
                    })), "leave" === e && (0, d.OM)({
                        id: h.clan._id,
                        token: i.settings.userData.token,
                        email: s,
                        moderator: i.settings.userData.email
                    }).then((({
                        data: t,
                        status: e,
                        message: o
                    }) => {
                        if ("success" !== e) return (0, n.uk)(o);
                        s === i.settings.userData.email ? (i.settings.userData.clan = null, h.reset(), (0, n.wj)("clan").hide(), (0, n.wj)("clans").hide(), (0, n.wj)("clan-assign").hide()) : (h.handleClan(t), h.drawClanTab())
                    }))
                };
                var m = s(520),
                    p = s(427);
                const {
                    IE_KEYS: g,
                    CODE_TO_KEY: u
                } = i.options.constants;
                Element.prototype.openSigma = l.mw, Element.prototype.sigmaReward = l.gb, Element.prototype.openClan = function() {
                    if (!i.settings.userData.token) return (0, n.wj)("needtobeloggined").show(.3);
                    h.render()
                }, Element.prototype.joinClan = function(t) {
                    return i.settings.userData.token ? !h.joined[t] && void(0, d.UR)({
                        token: i.settings.userData.token,
                        email: i.settings.userData.email,
                        id: t
                    }).then((({
                        status: e,
                        message: s
                    }) => {
                        if ("success" !== e) return (0, n.uk)(s);
                        h.joined[t] = !0, h.renderClans()
                    })) : (0, n.wj)("needtobeloggined").show(.3)
                }, Element.prototype.rightmenu = t => {
                    const e = document.querySelector(".top-users_buttons > button:last-of-type"),
                        s = document.querySelector(".top-users_buttons > button:first-of-type"),
                        n = document.querySelector(".top-users__inner > table:last-of-type"),
                        i = document.querySelector(".top-users__inner > table:first-of-type");
                    "winners" === t ? (e.classList.value = "active", s.classList.value = "", i.classList.value = "hide", n.classList.value = "") : (s.classList.value = "active", e.classList.value = "", n.classList.value = "hide", i.classList.value = "")
                };
                let v = window.isDev ? ["dev.sigmally.com"] : window.servers.flatMap((([t]) => t)),
                    f = window.isDev ? ["Dev"] : window.servers.flatMap((([t, e]) => e)),
                    w = "";
                window.tourneyServer && window.tourneyServer.length && (v = [window.tourneyServer], f = ["Tourney"]);
                let y, b = !1,
                    S = null;
                const x = {
                        " ": !1,
                        w: !1,
                        e: !1,
                        r: !1,
                        t: !1,
                        p: !1,
                        q: !1,
                        enter: !1,
                        escape: !1
                    },
                    k = {
                        " ": 17,
                        w: 21,
                        q: 18,
                        e: 22,
                        r: 23,
                        t: 24,
                        p: 25
                    },
                    T = {};

                function _(t) {
                    let e;
                    return u[t.code] ? e = u[t.code] : t.key && (e = t.key.toLowerCase()), g.hasOwnProperty(e) && (e = g[e]), e
                }

                function L(t) {
                    const e = _(t);
                    if (!x[e])
                        if (x.hasOwnProperty(e) && (x[e] = !0), "enter" === e) {
                            if (i.options.gameOptions.escOverlayShown || !i.settings.gameSettings.showChat) return;
                            if (i.options.gameOptions.isTyping) {
                                const t = (0, n.wj)("chat_textbox"),
                                    e = "string" == typeof i.settings.userData.token && i.settings.userData.token.length > 0,
                                    s = "number" == typeof i.settings.userData.level && i.settings.userData.level < 10;
                                if (i.options.gameOptions.chatBox.blur(), !e) return t.placeholder = "Log In To Account To Chat!", void(t.value = "");
                                t.placeholder = s ? "Reach Level 10 To Chat" : "Press Enter To Chat!";
                                const o = i.options.gameOptions.chatBox.value;
                                o.length > 0 && !s && (0, m.wp)(o), i.options.gameOptions.chatBox.value = ""
                            } else i.options.gameOptions.chatBox.focus()
                        } else if ("escape" === e) i.options.gameOptions.escOverlayShown ? O() : $(), (0, n.wj)("shop-popup").hide();
                    else {
                        if (i.options.gameOptions.isTyping || i.options.gameOptions.escOverlayShown) return;
                        const t = k[e];
                        void 0 !== t && (0, m.IP)(m.C.slice(t, t + 1)), "w" === e && (y = setInterval((() => {
                            (0, m.IP)(m.C.slice(t, t + 1))
                        }), 142.836737608913))
                    }
                }

                function j(t) {
                    const e = _(t);
                    x.hasOwnProperty(e) && (x[e] = !1), "w" === e && clearInterval(y)
                }

                function C(t) {
                    t.target === i.options.gameOptions.mainCanvas && (i.options.camera.userZoom *= t.deltaY > 0 ? .8 : 1.2, i.options.camera.userZoom = Math.max(i.options.camera.userZoom, i.settings.gameSettings.moreZoom ? .1 : 1), i.options.camera.userZoom = Math.min(i.options.camera.userZoom, 4))
                }

                function O() {
                    i.options.change("escOverlayShown", !1), (0, n.wj)("overlays").hide(), (0, n.wj)("menu-wrapper").hide(), (0, n.wj)("left-menu").hide(), (0, n.wj)("menu-links").hide(), (0, n.wj)("right-menu").hide(), (0, n.wj)("left_ad_block").hide(), (0, n.wj)("ad_bottom").hide()
                }

                function $() {
                    i.options.change("escOverlayShown", !0), (0, n.wj)("overlays").show(.5), (0, n.wj)("menu-wrapper").show(), (0, n.wj)("left-menu").show(), (0, n.wj)("menu-links").show(), (0, n.wj)("right-menu").show(), (0, n.wj)("left_ad_block").show(), (0, n.wj)("ad_bottom").show()
                }
                const D = () => {
                        const t = window.CAPTCHA2,
                            e = window.CAPTCHA3,
                            s = window.TURNSTILE;
                        (0, d.mE)(v), "undefined" != typeof WebSocket && "undefined" != typeof DataView && "undefined" != typeof ArrayBuffer && "undefined" != typeof Uint8Array || (alert("Your browser does not support required features, please update your browser or get a new one."), window.stop()),
                            function() {
                                const t = CanvasRenderingContext2D.prototype;
                                t.resetTransform || (t.resetTransform = function() {
                                    this.setTransform(1, 0, 0, 1, 0, 0)
                                })
                            }(), i.options.change("mainCanvas", document.getElementById("canvas")), i.options.change("mainCtx", i.options.gameOptions.mainCanvas.getContext("2d")), i.options.change("chatBox", (0, n.wj)("chat_textbox")), i.options.change("soundsVolume", (0, n.wj)("soundsVolume"));
                        const {
                            mainCanvas: l,
                            chatBox: h
                        } = i.options.gameOptions;
                        l.focus(), i.settings.loadShop(c.wV), i.settings.loadSettings(), window.addEventListener("beforeunload", i.settings.storeSettings.bind(i.settings)), document.addEventListener("wheel", C, {
                            passive: !0
                        }), (0, n.wj)("continue_button").addEventListener("click", (function() {
                            $(), (0, o.I)(), i.settings.userData.token && i.settings.userData.email && (0, p.y4)(), (0, n.wj)("spectate-btn").disabled = !1
                        }));
                        let g = null;
                        const u = t => {
                                if (!b) return;
                                const e = setInterval((() => {
                                    const {
                                        ws: s
                                    } = i.options.gameOptions;
                                    s && s.readyState >= WebSocket.OPEN && (clearInterval(e), setTimeout(t, 300))
                                }), 100)
                            },
                            f = () => {
                                const {
                                    serverURL: t,
                                    serverProtocol: e
                                } = i.settings;
                                return `${e}://${"localhost"===window.location.hostname?"localhost:3003/server":t}/recaptcha/v3`
                            },
                            y = async () => {
                                const o = {};
                                if (!b) {
                                    const a = f(),
                                        {
                                            version: r
                                        } = await fetch(a).then((t => t.json()));
                                    if (i.settings.captcha = r, "v3" === r) {
                                        const t = await grecaptcha.execute(e);
                                        o.token = t
                                    } else if ("v2" === r) {
                                        let e = "";
                                        const s = document.createElement("div"),
                                            i = (0, n.wj)("play-btn"),
                                            a = (0, n.wj)("spectate-btn");
                                        s.id = "g-recaptcha", i.parentNode.insertBefore(s, i.nextSibling), i.disabled = !0, i.hide(), a.hide(), e = await new Promise((e => {
                                            g = grecaptcha.render("g-recaptcha", {
                                                sitekey: t,
                                                callback: t => (grecaptcha.reset(g), (0, n.wj)("g-recaptcha").remove(), (0, n.wj)("play-btn").disabled = !1, i.show(), a.show(), e(t))
                                            })
                                        })), o.token = e
                                    } else if ("turnstile" === r) {
                                        const {
                                            turnstile: t
                                        } = window, e = document.createElement("div"), i = (0, n.wj)("play-btn"), a = (0, n.wj)("spectate-btn");
                                        e.id = "cf-turnstile", e.className = "cf-turnstile", e.dataset.sitekey = s, i.parentNode.insertBefore(e, i.nextSibling), i.disabled = !0, i.hide(), a.hide();
                                        const r = await new Promise((e => {
                                            t.render("#cf-turnstile", {
                                                sitekey: s,
                                                callback: function(t) {
                                                    return (0, n.wj)("cf-turnstile").remove(), (0, n.wj)("play-btn").disabled = !1, i.show(), a.show(), e(t)
                                                }
                                            })
                                        }));
                                        o.token = r
                                    } else "none" === r && (b || (0, m.me)(w), b = !0)
                                }
                                return o
                            }, x = async t => {
                                if (b) return;
                                const e = f(),
                                    {
                                        token: s
                                    } = t || {};
                                await fetch(e, {
                                    method: "POST",
                                    body: JSON.stringify({
                                        token: s
                                    }),
                                    headers: {
                                        "Content-Type": "application/json"
                                    }
                                }).then((t => t.json())).then((({
                                    status: t
                                }) => {
                                    "complete" === t && (b = !0, (0, m.me)(w))
                                })).catch(console.error)
                            };
                        (0, n.wj)("play-btn").addEventListener("click", (async function() {
                            (0, n.wj)("shop-popup").hide();
                            const {
                                userData: t,
                                gameSettings: e
                            } = i.settings, s = {
                                name: e.nick,
                                skin: e.skin,
                                token: t.token,
                                showClanmates: e.showClanmates
                            };
                            t?.email && (s.email = t.email), window.tourneyServer && (s.password = e.password);
                            const o = await y();
                            if (await x(o), (0, m.KC)(JSON.stringify(o)), (0, n.wj)("spectate-btn").disabled = !0, i.settings.userData && i.settings.userData.subscription && i.settings.userData.subscription) {
                                const t = "number" == typeof i.settings.userData.subscription && i.settings.userData.subscription > Date.now();
                                s.sub = t
                            }
                            i.settings.userData && i.settings.userData.clan && (s.clan = i.settings.userData.clan);
                            u((() => (t => {
                                const e = window.location.host;
                                (0, m.mC)(JSON.stringify(t) || e), i.options.change("maxWeight", 0), i.options.change("bonus", 0), O(), i.options.change("sec", 0), i.options.change("foodEaten", 0), S && (clearInterval(S), S = null), S = setInterval(k, 1e3), i.options.change("session", null)
                            })(s)));
                            const a = (0, n.wj)("chat_textbox");
                            if ("string" == typeof t.token && t.token.length > 0) {
                                const t = "number" == typeof i.settings.userData.level && i.settings.userData.level < 10;
                                a.placeholder = t ? "Reach Level 10 To Chat" : "Press Enter To Chat!"
                            } else a.placeholder = "Log In To Account To Chat!", a.value = ""
                        }));

                        function k() {
                            const t = i.options.gameOptions.sec + 1;
                            i.options.change("sec", t), (0, m.mY)()
                        }(0, n.wj)("spectate-btn").addEventListener("click", (async function() {
                            const t = {
                                state: 2
                            };
                            i.settings?.userData?.email && (t.email = i.settings.userData.email);
                            const e = await y();
                            await x(e), (0, m.KC)(JSON.stringify(e));
                            u((() => (t => {
                                (0, m.mC)(JSON.stringify(t)), O(), (0, n.wj)("shop-popup").hide(), i.options.change("session", null)
                            })(t)))
                        })), window.onkeydown = L, window.onkeyup = j, h.onblur = function() {
                            i.options.change("isTyping", !1), (0, a.Eb)()
                        }, h.onfocus = function() {
                            i.options.change("isTyping", !0), (0, a.Eb)()
                        }, a.Oo.init(), l.onmousemove = function(t) {
                            i.options.change("mouseX", t.clientX), i.options.change("mouseY", t.clientY)
                        }, setInterval((function() {
                            (0, m.kp)((i.options.gameOptions.mouseX - l.width / 2) / i.options.camera.scale + i.options.camera.x, (i.options.gameOptions.mouseY - l.height / 2) / i.options.camera.scale + i.options.camera.y)
                        }), 40), window.onresize = function() {
                            const t = l.width = window.innerWidth,
                                e = l.height = window.innerHeight;
                            i.options.camera.viewportScale = Math.max(t / 1920, e / 1080)
                        }, window.onresize();
                        const T = (0, n.wj)("mobileStuff"),
                            _ = (0, n.wj)("touchCircle");
                        let D = !1;
                        const E = function(t) {
                            const e = t.touches[0],
                                s = .2 * innerWidth,
                                n = .2 * innerHeight;
                            if (e.pageX < s && e.pageY > innerHeight - n) {
                                const t = innerWidth / 2 + (e.pageX - s / 2) * innerWidth / s,
                                    o = innerHeight / 2 + (e.pageY - (innerHeight - n / 2)) * innerHeight / n;
                                i.options.change("mouseX", t), i.options.change("mouseY", o)
                            } else i.options.change("mouseX", e.pageX), i.options.change("mouseY", e.pageY);
                            const o = .02 * innerWidth;
                            _.style.left = i.options.gameOptions.mouseX - o + "px", _.style.top = i.options.gameOptions.mouseY - o + "px"
                        };
                        window.addEventListener("touchmove", E), window.addEventListener("touchstart", (function(t) {
                            D || (D = !0, T.show()), "splitBtn" === t.target.id ? (0, m.IP)(m.C.slice(17, 18)) : "ejectBtn" === t.target.id ? (0, m.IP)(m.C.slice(21, 22)) : E(t), _.show()
                        })), window.addEventListener("touchend", (function(t) {
                            0 === t.touches.length && _.hide()
                        })), (0, m._6)(), $();
                        const M = window.location.search;
                        let I;
                        M && (I = /ip=([\w\W]+:[0-9]+)/.exec(M.slice(1))) ? window.setserver(I[1]) : window.setserver((0, n.wj)("gamemode").value), window.requestAnimationFrame(r.IN), i.Y.info("init done in " + (Date.now() - i.settings.LOAD_START) + "ms"),
                            function() {
                                let t;
                                window.showHide = function(e, s) {
                                    const n = document.getElementById(s),
                                        i = document.getElementById(e);
                                    "Hide" !== i.textContent && (t = i.textContent), n && ("none" === n.style.display ? (n.style.display = "", i.textContent = "Hide") : (i.textContent = t, n.style.display = "none"))
                                }
                            }(),
                            function() {
                                let t;
                                window.showHideFromMaxHeight = function(e) {
                                    const s = document.getElementById(e);
                                    "none" !== s.style.maxHeight && (t = s.style.maxHeight), s && ("none" === s.style.maxHeight ? (s.style.maxHeight = t, s.classList.remove("shown")) : (s.style.maxHeight = "none", s.classList.add("shown")))
                                }
                            }()
                    },
                    E = async () => {
                        for (let t = 0; t < v.length; t++) {
                            const e = v[t];
                            fetch("https://" + e + "/server/serversstats", {
                                method: "GET",
                                headers: {
                                    Accept: "application/json",
                                    "Content-Type": "application/json"
                                }
                            }).then((e => {
                                if (200 !== e.status) throw new Error(`Failed to fetch server stats from ${f[t]} (${e.status}: ${e.statusText})`);
                                return e.json()
                            })).then((s => {
                                document.getElementById("option_" + t).innerHTML = f[t] + " " + s.body.serverstats.players_current + "/" + s.body.serverstats.players_max, T[e] = s.body.serverstats
                            })).catch((t => {}))
                        }
                        setTimeout(E, 6e4)
                    };

                function M(t, e) {
                    const s = ["Europe-1"],
                        n = window.servers.filter((([t, e]) => !s.includes(e))).flatMap((([t]) => `${t}/ws/`));
                    if (! function(t) {
                            const e = T[t];
                            return e && e.players_current < e.players_max
                        }(t.replace("/ws/", ""))) {
                        const s = "number" == typeof e ? e + 1 : n.indexOf(t) + 1;
                        return s >= n.length ? null : M(n[s], s)
                    }
                    return t
                }
                E(), window.setserver = function(t) {
                    t && t.length || (t = document.querySelector("#gamemode > option:first-child").value), w = t, b = !1;
                    const e = M(t);
                    if (e) {
                        if (e !== t) {
                            const t = document.getElementById("gamemode");
                            t && (t.value = e)
                        }
                        w = t = e
                    }
                    i.settings.serverURL = "http" === i.settings.serverProtocol ? t.replace(":8081/ws/", "/server") : t.replace("/ws/", "/server"), i.settings.serverURL = -1 !== i.settings.serverURL.indexOf("localhost") ? i.settings.serverURL.replace("localhost/server", "localhost:3003/server") : i.settings.serverURL, i.settings.serverURL = i.settings.serverURL.replace("beta.sigmally.com:8081", "beta.sigmally.com:3001");
                    const {
                        wsUrl: s,
                        ws: n
                    } = i.options.gameOptions;
                    t === s && n && n.readyState <= WebSocket.OPEN || ((0, m._6)(), b && (0, m.me)(t))
                }, window.loginIfNoUser = () => {
                    if (!i.settings.userData.id) {
                        const t = new MouseEvent("click", {
                            bubbles: !0,
                            cancelable: !0,
                            view: window
                        });
                        return document.getElementById("signInBtn").dispatchEvent(t), !1
                    }
                }, window.Share = function(t) {
                    "fb" === t && window.open("http://www.facebook.com/sharer.php?u=https://sigmally.com&quote=Play+to+Sigmally!%20Highest%20Mass%20" + document.getElementById("highest_mass").innerHTML + "%20Top%20Position%20" + document.getElementById("top_leaderboard_position").innerHTML + "%20Time%20Alive%20" + document.getElementById("time_alive").innerHTML + "%20Food%20Eaten%20" + document.getElementById("food_eaten").innerHTML, "pagename", "resizable"), "tw" === t && window.open("https://twitter.com/intent/tweet?text=Play%20To%20sigmally.com%20Highest%20Mass%20" + document.getElementById("highest_mass").innerHTML + "%20Top%20Position%20" + document.getElementById("top_leaderboard_position").innerHTML + "%20Time%20Alive%20" + document.getElementById("time_alive").innerHTML + "%20Food%20Eaten%20" + document.getElementById("food_eaten").innerHTML, "pagename", "resizable")
                }
            },
            292: (t, e, s) => {
                s.d(e, {
                    AP: () => S,
                    AV: () => v,
                    Co: () => b,
                    E7: () => H,
                    ED: () => h,
                    Gg: () => x,
                    Ke: () => w,
                    Kh: () => E,
                    LH: () => $,
                    OM: () => D,
                    Q9: () => A,
                    UF: () => y,
                    UR: () => I,
                    Uj: () => g,
                    YP: () => O,
                    YT: () => k,
                    aC: () => M,
                    cD: () => T,
                    cn: () => B,
                    g$: () => L,
                    gl: () => f,
                    m: () => u,
                    mE: () => P,
                    m_: () => U,
                    mu: () => m,
                    op: () => C,
                    sB: () => l,
                    uO: () => j,
                    wV: () => _
                });
                var n = s(776);
                const i = window.isDev,
                    o = window.isLocal,
                    a = i ? o ? "http://localhost:3333/api" : "https://dev.sigmally.com/api" : "https://sigmally.com/api",
                    r = i ? "https://dev.sigmally.com/static" : "https://sigmally.com/static",
                    c = i ? "https://dev.sigmally.com/server" : "https://eu0.sigmally.com/server",
                    l = () => `${c}/auth`,
                    d = () => `${a}/skins`,
                    h = t => `${a}/coins/hourly/${t}`,
                    m = () => `${a}/coins/sale`,
                    p = () => `${a}/chests`,
                    g = t => `${r}/skins/${t}`,
                    u = t => `${a}/user/without/${t}`,
                    v = () => {
                        (0, n.wj)("connecting").show(1)
                    },
                    f = () => {
                        (0, n.wj)("connecting").hide(0)
                    },
                    w = ({
                        token: t,
                        coinsID: e,
                        payment: s = "paypal",
                        email: n
                    }) => (v(), new Promise(((i, o) => fetch(((t, e, s = "payop") => `${a}/coins/buy/${t}/${e}/${s}`)(n, e, s), {
                        method: "GET",
                        headers: {
                            Authorization: `TOKEN ${t}`
                        }
                    }).then((t => t.json())).then((t => {
                        i(t)
                    })).catch((t => {
                        f(), o(t)
                    }))))),
                    y = ({
                        token: t,
                        month: e,
                        payment: s = "paypal",
                        email: n
                    }) => (v(), new Promise(((i, o) => fetch(((t, e, s = "payop") => `${a}/subscribe/buy/${t}/${e}/${s}`)(n, e, s), {
                        method: "GET",
                        headers: {
                            Authorization: `TOKEN ${t}`
                        }
                    }).then((t => t.json())).then((t => {
                        i(t)
                    })).catch((t => {
                        f(), o(t)
                    }))))),
                    b = () => new Promise(((t, e) => fetch(d()).then((t => t.json())).then(t).catch(e))),
                    S = () => new Promise(((t, e) => fetch(`${a}/coins`).then((t => t.json())).then(t).catch(e))),
                    x = () => new Promise(((t, e) => fetch(p()).then((t => t.json())).then(t).catch(e))),
                    k = t => (v(), new Promise(((e, s) => fetch(`${a}/skins/change`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(t)
                    }).then((t => t.json())).then((t => {
                        f(), e(t)
                    })).catch((t => {
                        f(), s(t)
                    }))))),
                    T = t => (v(), new Promise(((e, s) => fetch(d(), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(t)
                    }).then((t => t.json())).then((t => {
                        f(), e(t)
                    })).catch((t => {
                        f(), s(t)
                    }))))),
                    _ = t => (v(), new Promise(((e, s) => fetch(p(), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(t)
                    }).then((t => t.json())).then((t => {
                        f(), e(t)
                    })).catch((t => {
                        f(), s(t)
                    }))))),
                    L = () => new Promise(((t, e) => fetch(`${a}/sigma`).then((t => t.json())).then(t).catch(e))),
                    j = t => (v(), new Promise(((e, s) => fetch(`${a}/sigma/reward`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(t)
                    }).then((t => t.json())).then((t => {
                        f(), e(t)
                    })).catch((t => {
                        f(), s(t)
                    }))))),
                    C = ({
                        token: t,
                        name: e,
                        email: s
                    }) => (v(), new Promise(((n, i) => fetch(`${a}/clans/create`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            token: t,
                            name: e,
                            email: s
                        })
                    }).then((t => t.json())).then((t => {
                        f(), n(t)
                    })).catch((t => {
                        f(), i(t)
                    }))))),
                    O = t => (v(), new Promise(((e, s) => {
                        return fetch((n = t, `${a}/clans/clan/${n}`)).then((t => t.json())).then((t => {
                            f(), e(t)
                        })).catch((t => {
                            f(), s(t)
                        }));
                        var n
                    }))),
                    $ = () => (v(), new Promise(((t, e) => fetch(`${a}/clans`).then((t => t.json())).then((e => {
                        f(), t(e)
                    })).catch((t => {
                        f(), e(t)
                    }))))),
                    D = ({
                        token: t,
                        email: e,
                        id: s,
                        moderator: n
                    }) => (v(), new Promise(((i, o) => fetch((t => `${a}/clans/leave/${t}`)(s), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            token: t,
                            email: e,
                            moderator: n
                        })
                    }).then((t => t.json())).then((t => {
                        f(), i(t)
                    })).catch((t => {
                        f(), o(t)
                    }))))),
                    E = ({
                        token: t,
                        email: e,
                        id: s,
                        moderator: n
                    }) => (v(), new Promise(((i, o) => fetch((t => `${a}/clans/join/${t}`)(s), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            token: t,
                            email: e,
                            moderator: n
                        })
                    }).then((t => t.json())).then((t => {
                        f(), i(t)
                    })).catch((t => {
                        f(), o(t)
                    }))))),
                    M = ({
                        token: t,
                        email: e,
                        role: s,
                        id: n,
                        moderator: i
                    }) => (v(), new Promise(((o, r) => fetch((t => `${a}/clans/role/${t}`)(n), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            token: t,
                            email: e,
                            role: s,
                            moderator: i
                        })
                    }).then((t => t.json())).then((t => {
                        f(), o(t)
                    })).catch((t => {
                        f(), r(t)
                    }))))),
                    I = ({
                        token: t,
                        id: e,
                        email: s
                    }) => (v(), new Promise(((n, i) => fetch((t => `${a}/clans/request/${t}`)(e), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            token: t,
                            email: s
                        })
                    }).then((t => t.json())).then((t => {
                        f(), n(t)
                    })).catch((t => {
                        f(), i(t)
                    }))))),
                    U = ({
                        token: t,
                        id: e,
                        email: s,
                        moderator: n
                    }) => (v(), new Promise(((i, o) => fetch((t => `${a}/clans/reject/${t}`)(e), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            token: t,
                            email: s,
                            moderator: n
                        })
                    }).then((t => t.json())).then((t => {
                        f(), i(t)
                    })).catch((t => {
                        f(), o(t)
                    })))));

                function P(t) {
                    let e = !1;
                    t.map((t => function(t) {
                        return fetch(`https://${t}/server/topusers`).then((t => t.json()))
                    }(t).then((t => {
                        if (e) return !1;
                        if ("success" === t.result) {
                            document.getElementsByClassName("top-users__list")[0].innerHTML = "";
                            for (let e = 0; e < t.body.topUsers.length; e++) {
                                const {
                                    fullName: s,
                                    exp: n,
                                    subscription: i
                                } = t.body.topUsers[e], o = i >= Date.now() ? ' class="sub"' : "";
                                document.getElementsByClassName("top-users__list")[0].innerHTML += "<tr" + o + "><td>" + (e + 1) + "</td><td>" + s + '</td><td align="right">' + n + "</td></tr>"
                            }
                            e = !0
                        }
                    }))))
                }
                const A = ({
                        token: t,
                        hours: e,
                        email: s
                    }) => (v(), new Promise(((n, i) => fetch(`${a}/user/boost`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            token: t,
                            value: e,
                            email: s
                        })
                    }).then((t => t.json())).then((t => {
                        f(), n(t)
                    })).catch((t => {
                        f(), i(t)
                    }))))),
                    H = (t, e = !0) => (e && v(), new Promise(((s, n) => fetch((t => `${a}/user/challenge/${t}`)(t)).then((t => t.json())).then((t => {
                        e && f(), s(t)
                    })).catch((t => {
                        e && f(), n(t)
                    }))))),
                    B = ({
                        token: t,
                        task: e,
                        email: s
                    }) => (v(), new Promise(((n, i) => fetch(`${a}/user/challenge`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            token: t,
                            task: e,
                            email: s
                        })
                    }).then((t => t.json())).then((t => {
                        f(), n(t)
                    })).catch((t => {
                        f(), i(t)
                    })))))
            },
            352: (t, e, s) => {
                s.d(e, {
                    Y: () => f,
                    options: () => b,
                    settings: () => y
                });
                var n = s(776),
                    i = s(292);
                const o = "NEWS";
                const a = class {
                        constructor(t, e = "en", s = !0) {
                            if (this.lang = e, this.data = t, this.opened = !1, !t || !Array.isArray(t) || !t.length) return !1;
                            this.updateFeed(), this.bindOnClick()
                        }
                        bindOnClick() {
                            document.querySelector("#updates-button").style.display = "block";
                            document.querySelector("#updates-button > button").onclick = this.handleShow.bind(this)
                        }
                        handleShow() {
                            const t = document.querySelector("#updates-wrap");
                            t && "none" === t.style.display && (this.opened = !1), this.opened ? this.hide() : this.show(!1)
                        }
                        hide() {
                            this.opened = !1, window.closeUpdateModal()
                        }
                        show(t) {
                            const {
                                date: e
                            } = this.data[0], s = localStorage.getItem(o), n = () => {
                                this.opened = !0;
                                const t = document.getElementById("updates-scroll");
                                t.style.maxHeight = "0px", document.getElementById("updates-wrap").show(.3), setTimeout((() => t.style.maxHeight = ""), 100), localStorage.setItem(o, e)
                            };
                            if (t && (e + "" === s || "number" != typeof e)) return !1;
                            t ? setTimeout(n, 1200) : n()
                        }
                        toDateString(t) {
                            return new Date(t).toLocaleDateString(this.lang, {
                                year: "numeric",
                                month: "long",
                                day: "numeric"
                            })
                        }
                        updateFeed() {
                            const t = this.data.sort(((t, e) => e.date - t.date)).map((({
                                    date: t,
                                    image: e,
                                    locale: s
                                }) => {
                                    const n = s[this.lang]?.text ?? s.en.text,
                                        i = s[this.lang]?.title ?? s.en.title,
                                        o = e && "object" == typeof e && "string" == typeof e.type ? `<div class="updates-${e.type}">\n            <img src="${e.url}" loading="lazy" alt="Update" title="Update" crossorigin="anonymous">\n          </div>` : "",
                                        a = n && Array.isArray(n) ? n.map((t => `<p>${t}</p>`)).join("") : "";
                                    return `<div>\n        <h3>${i}</h3>\n        <i>${this.toDateString(t)}</i>\n        ${o}\n        ${a}\n      </div>`
                                })).join(""),
                                e = document.getElementById("updates-feed");
                            e && (e.innerHTML = t)
                        }
                    },
                    r = "https:" === window.location.protocol ? "https" : "http",
                    c = {
                        nick: "",
                        skin: "",
                        gamemode: "",
                        password: "",
                        showSkins: !0,
                        showNames: !0,
                        darkTheme: !0,
                        showColor: !0,
                        showMass: !1,
                        showClanmates: !0,
                        _showChat: !0,
                        get showChat() {
                            return this._showChat
                        },
                        set showChat(t) {
                            const e = (0, n.wj)("chat_block");
                            t ? e.show() : e.hide(), this._showChat = t
                        },
                        showMinimap: !0,
                        showPosition: !1,
                        showBorder: !1,
                        showGrid: !0,
                        playSounds: !1,
                        soundsVolume: .5,
                        moreZoom: !1,
                        fillSkin: !0,
                        backgroundSectors: !1,
                        jellyPhysics: !0,
                        boost: 1
                    },
                    l = Object.create({
                        fps: 0,
                        latency: NaN,
                        supports: null,
                        info: null,
                        pingLoopId: NaN,
                        pingLoopStamp: null,
                        canvas: document.createElement("canvas"),
                        visible: !1,
                        score: NaN,
                        maxScore: 0,
                        bonus: 0
                    }),
                    d = {
                        x: 0,
                        y: 0,
                        target: {
                            x: 0,
                            y: 0,
                            scale: 1
                        },
                        viewportScale: 1,
                        userZoom: 1,
                        sizeScale: 1,
                        scale: 1
                    },
                    h = {
                        USE_HTTPS: "https:" === window.location.protocol,
                        EMPTY_NAME: "An unnamed cell",
                        QUADTREE_MAX_POINTS: 32,
                        CELL_POINTS_MIN: 5,
                        CELL_POINTS_MAX: 120,
                        PI_2: 2 * Math.PI,
                        IE_KEYS: {
                            spacebar: " ",
                            esc: "escape"
                        },
                        CODE_TO_KEY: {
                            Space: " ",
                            KeyW: "w",
                            KeyQ: "q",
                            KeyE: "e",
                            KeyR: "r",
                            KeyT: "t",
                            KeyP: "p"
                        }
                    },
                    m = {
                        ws: null,
                        wsUrl: null,
                        reconnectDelay: 1e3,
                        syncUpdStamp: Date.now(),
                        syncAppStamp: Date.now(),
                        mainCanvas: null,
                        mainCtx: null,
                        pattern: null,
                        soundsVolume: void 0,
                        knownSkins: {},
                        skinCache: new Map,
                        escOverlayShown: !1,
                        isTyping: !1,
                        chatBox: null,
                        mapCenterSet: !1,
                        minionControlled: !1,
                        mouseX: NaN,
                        mouseY: NaN,
                        quadtree: null,
                        maxWeight: 0,
                        bonus: 0,
                        sec: 0,
                        foodEaten: 0,
                        topLeaderboardPosition: 1e3,
                        session: null
                    };

                function p() {
                    this.c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-", this.buffer = [], this.cache = ""
                }
                p.prototype = {
                    save: function(t, e) {
                        this.buffer[t] = e
                    },
                    reset: function() {
                        this.buffer.length = 1
                    },
                    stringify: function() {
                        this.cache = JSON.stringify(this.buffer.reduce(((t, e, s) => ({
                            ...t,
                            [s]: e
                        })), {}));
                        const t = `${this.buffer[13]}-${this.buffer[12]}-${this.buffer[11]}-`.replace(/\r\n/g, "\n");
                        let e = "";
                        for (let s = 0; s < t.length; s++) {
                            const n = t.charCodeAt(s);
                            n < 128 ? e += String.fromCharCode(n) : n > 127 && n < 2048 ? (e += String.fromCharCode(n >> 6 | 192), e += String.fromCharCode(63 & n | 128)) : (e += String.fromCharCode(n >> 12 | 224), e += String.fromCharCode(n >> 6 & 63 | 128), e += String.fromCharCode(63 & n | 128))
                        }
                        return e
                    },
                    getID: function() {
                        let t, e, s, n, i, o, a, r = "",
                            c = 0;
                        const l = this.stringify();
                        for (; c < l.length;) t = l.charCodeAt(c++), e = l.charCodeAt(c++), s = l.charCodeAt(c++), n = t >> 2, i = (3 & t) << 4 | e >> 4, o = (15 & e) << 2 | s >> 6, a = 63 & s, isNaN(e) ? o = a = 64 : isNaN(s) && (a = 64), r = r + this.c.charAt(n) + this.c.charAt(i) + this.c.charAt(o) + this.c.charAt(a);
                        return r
                    },
                    toBytes: function() {
                        let t, e, s, n, i, o, a, r, c, l, d = this.cache;
                        for (/[^\x00-\xFF]/.test(d), t = "\0\0\0\0".slice(d.length % 4 || 4), d += t, e = [], s = 0, n = d.length; n > s; s += 4) i = (d.charCodeAt(s) << 24) + (d.charCodeAt(s + 1) << 16) + (d.charCodeAt(s + 2) << 8) + d.charCodeAt(s + 3), 0 !== i ? (l = i % 85, i = (i - l) / 85, c = i % 85, i = (i - c) / 85, r = i % 85, i = (i - r) / 85, a = i % 85, i = (i - a) / 85, o = i % 85, e.push(o + 33, a + 33, r + 33, c + 33, l + 33)) : e.push(122);
                        return function(t, e) {
                            for (let s = e; s > 0; s--) t.pop()
                        }(e, t.length), "<~" + String.fromCharCode.apply(String, e) + "~>"
                    }
                };
                const g = Object.create({
                        left: -2e3,
                        right: 2e3,
                        top: -2e3,
                        bottom: 2e3,
                        width: 4e3,
                        height: 4e3,
                        centerX: -1,
                        centerY: -1
                    }),
                    u = Object.create({
                        mine: [],
                        byId: {},
                        list: [],
                        clanmates: {},
                        clan: null
                    }),
                    v = Object.create({
                        type: NaN,
                        items: null,
                        canvas: document.createElement("canvas"),
                        teams: ["#F33", "#3F3", "#33F"]
                    });
                const f = new class {
                        verbosity = 2;
                        error() {
                            this.verbosity
                        }
                        warn() {
                            this.verbosity
                        }
                        info() {
                            this.verbosity
                        }
                        debug() {
                            this.verbosity
                        }
                    },
                    w = {
                        tabCategory: "",
                        skinsTab: "owned",
                        status: "loading",
                        chests: [],
                        coins: [],
                        skins: [],
                        sigma: null,
                        boosts: [],
                        onSale: !1,
                        subDiscount: 0
                    };
                const y = new class {
                        FREE_TIME = 144e5;
                        timer = null;
                        boostInterval = null;
                        gameSettings = c;
                        globalTab = 1;
                        userData = {};
                        serverURL = "";
                        serverProtocol = r;
                        LOAD_START = Date.now();
                        shop = w;
                        captcha = null;
                        winners = [];
                        change(t, e) {
                            this.gameSettings[t] = e
                        }
                        haveBoost() {
                            return this.userData && this.userData.boost && this.userData.boost >= Date.now()
                        }
                        checkBoost() {
                            this.haveBoost() && this.createBoostTimer(this.userData.boost)
                        }
                        createBoostTimer = t => {
                            const e = this;

                            function s() {
                                clearInterval(e.boostInterval), e.boostInterval = null
                            }
                            e.boostInterval && s(), e.boostInterval = setInterval((function() {
                                const e = Date.now(),
                                    i = t - e,
                                    o = (0, n.wj)("boost_timer");
                                if (i <= 0) s(), o.innerHTML = "";
                                else {
                                    const t = function(t) {
                                        const e = new Date(t).toISOString().slice(11, 19),
                                            [s, n, i] = e.split(":");
                                        return `${60*+s+ +n}m ${i}s`
                                    }(i);
                                    o.innerHTML = t
                                }
                            }), 1e3)
                        };
                        updateTimer(t) {
                            if (t.hourlyTime) this.createInterval();
                            else {
                                const e = (0, i.ED)(t.email);
                                fetch(e, {
                                    method: "GET",
                                    headers: {
                                        Authorization: `TOKEN ${t.token}`
                                    }
                                }).then((t => t.json())).then((({
                                    status: t,
                                    date: e
                                }) => {
                                    this.userData.hourlyTime = e, this.createInterval()
                                }))
                            }
                        }
                        createInterval() {
                            if (this.timer) return;
                            const t = setInterval((() => this.timeCheck()), 100);
                            this.timer = t
                        }
                        clearInterval() {
                            this.timer && (clearInterval(this.timer), this.timer = null)
                        }
                        timeCheck() {
                            if (this.userData.hourlyTime) {
                                const t = this.userData.hourlyTime,
                                    e = Date.now(),
                                    s = this.FREE_TIME - (e - t);
                                if (s <= 0)(0, n.wj)("free-chest-button").show(), (0, n.wj)("collect-button").hide(), this.clearInterval();
                                else {
                                    const t = (0, n.wj)("collect_button_time"),
                                        e = this.timeToString(s);
                                    t.innerHTML = e, (0, n.wj)("free-chest-button").hide(), (0, n.wj)("collect-button").show()
                                }
                            }
                        }
                        timeToString(t) {
                            const e = new Date(t).toISOString().slice(11, 19),
                                [s, n, i] = e.split(":");
                            return `${s[1]}h ${n}m ${i}s`
                        }
                        preload([t, e, s, n, i, o, a, r, c, l]) {
                            this.shop.skins = t, this.shop.coins = e, this.shop.chests = s, this.shop.sigma = n, this.shop.boosts = o, this.shop.onSale = a, this.shop.subDiscount = l, this.winners = c, this.showUpdatesFeed(i), this.renderWinnersLeaderboard()
                        }
                        renderWinnersLeaderboard() {
                            document.getElementsByClassName("top-winners__list")[0].innerHTML = "";
                            for (let t = 0; t < this.winners.length; t++) {
                                const {
                                    fullName: e,
                                    id: s,
                                    position: n
                                } = this.winners[t], i = 1e5 - 1e4 * t, o = s === this.userData.googleID ? ' class="active"' : "";
                                document.getElementsByClassName("top-winners__list")[0].innerHTML += "<tr" + o + "><td>" + n + "</td><td>" + e + '</td><td align="right">' + i + '<img width="15" height="15" src="/assets/images/icon/coin.svg" alt="Coin" title="Coin" loading="lazy" /></td></tr>'
                            }
                        }
                        showUpdatesFeed(t) {
                            this.updates = new a(t, window.lang)
                        }
                        loadShop(t) {
                            this.shop.skins.length && this.shop.coins.length && this.shop.chests.length && this.shop.sigma ? (this.setShopStatus("loaded"), t && t()) : Promise.all([(0, i.Co)(), (0, i.AP)(), (0, i.Gg)(), (0, i.g$)()]).then((([e, s, n, i]) => {
                                if ("success" !== e.status || "success" !== s.status || "success" !== n.status || "success" !== i.status) return this.setShopStatus("error");
                                this.shop.skins = e.data, this.shop.coins = s.data, this.shop.chests = n.data, this.shop.sigma = i.data, this.setShopStatus("loaded"), t && t()
                            })).catch((() => this.setShopStatus("error")))
                        }
                        setShopStatus(t) {
                            this.shop.status = t
                        }
                        loadSettings() {
                            const t = localStorage.getItem("settings"),
                                e = t ? JSON.parse(t) : this.gameSettings;
                            isDev && "dev.sigmally.com/ws/" !== e.gamemode ? e.gamemode = window.tourneyServer && window.tourneyServer.length ? window.tourneyServer : "dev.sigmally.com/ws/" : isDev || "dev.sigmally.com/ws/" !== e.gamemode || (e.gamemode = window.tourneyServer && window.tourneyServer.length ? window.tourneyServer : "us0.sigmally.com/ws/"), ["u0.sigmally.com/ws/", "u1.sigmally.com/ws/", "u2.sigmally.com/ws/"].includes(e.gamemode) && (e.gamemode = "us0.sigmally.com/ws/", e.skin = "");
                            for (const t in this.gameSettings) {
                                const s = (0, n.wj)("_" === t.charAt(0) ? t.slice(1) : t);
                                e.hasOwnProperty(t) && this.change(t, e[t]), s ? this.initSetting(t, s) : f.info("setting " + t + " not loaded because there is no element for it.")
                            }
                        }
                        initSetting(t, e) {
                            const s = this;

                            function n(t, e, n) {
                                "" !== s.gameSettings[t] && (e[n] = s.gameSettings[t]), e.addEventListener("change", (function() {
                                    requestAnimationFrame((function() {
                                        s.gameSettings[t] = e[n]
                                    }))
                                }))
                            }
                            if (e && e.tagName) switch (e.tagName.toLowerCase()) {
                                case "input":
                                    switch (e.type.toLowerCase()) {
                                        case "range":
                                        case "text":
                                            n(t, e, "value");
                                            break;
                                        case "checkbox":
                                            n(t, e, "checked")
                                    }
                                    break;
                                case "select":
                                    n(t, e, "value")
                            }
                        }
                        storeSettings() {
                            const {
                                password: t,
                                ...e
                            } = this.gameSettings;
                            localStorage.setItem("settings", JSON.stringify(e))
                        }
                    },
                    b = new class {
                        stats = l;
                        camera = d;
                        gameOptions = m;
                        border = g;
                        cells = u;
                        leaderboard = v;
                        constants = h;
                        store = new p;
                        change(t, e) {
                            this.gameOptions[t] = e
                        }
                    }
            },
            0: (t, e, s) => {
                s.d(e, {
                    e0: () => m,
                    eQ: () => y,
                    iO: () => d,
                    w7: () => w,
                    wV: () => f
                });
                var n = s(352),
                    i = s(776),
                    o = s(292),
                    a = s(520),
                    r = s(427);
                let c = null;
                const l = () => {
                    c = setInterval((() => {
                        const t = (t => {
                                const e = t ? new Date(t) : new Date,
                                    [s] = e.toISOString().split("T");
                                return s
                            })(),
                            e = new Date(t).getTime() + 864e5 - Date.now(),
                            s = function(t) {
                                const e = new Date(t).toISOString().slice(11, 19),
                                    [s, n, i] = e.split(":");
                                return `${s}h ${n}m ${i}s`
                            }(e),
                            i = document.querySelectorAll(".challenge-time");
                        i && i.forEach((t => t.innerHTML = s)), e < 1e3 && (n.settings.userData.email && setTimeout((() => u(!1)), 1500), clearInterval(c), l())
                    }), 1e3)
                };

                function d(t) {
                    fetch(t).then((t => t.blob())).then((t => {
                        const e = URL.createObjectURL(t),
                            s = document.getElementById("avatar");
                        s && (s.crossOrigin = "anonymous", s.src = e);
                        const n = document.getElementById("js-skin-select-icon"),
                            i = document.getElementById("js-skin-select-icon-text");
                        n && (n.crossOrigin = "anonymous", n.style.backgroundImage = `url("${e}")`, (0, r.Af)(!1)), i && (i.style.opacity = "0")
                    }))
                }

                function h(t, e, s) {
                    if ("skin" === t) {
                        const {
                            id: t,
                            tab: e
                        } = this.dataset || {}, {
                            userData: s,
                            shop: a
                        } = n.settings || {};
                        if (!t || !s.email) return !1;
                        const r = a.skins.find((({
                            _id: e
                        }) => t === e));
                        if (!r) return !1;
                        if ("level" === e && s.level < r.level) return !1;
                        const c = {
                            skin: t,
                            token: s.token,
                            email: s.email
                        };
                        if ("owned" === e) return (0, o.YT)(c).then((({
                            lastSkinUsed: t,
                            status: e
                        }) => {
                            if (!e || "error" === e) return (0, i.wj)("errormodal").show(.3);
                            var s;
                            n.settings.userData.lastSkinUsed = t, s = r.name, d((0, o.Uj)(s)), n.settings.change("skin", "1%" + s.replace(".png", "")), n.settings.storeSettings(), (0, i.wj)("shop").hide()
                        })), !0;
                        (0, o.cD)(c).then((({
                            data: e,
                            status: o
                        }) => {
                            if ("error" === o) {
                                const e = (0, i.wj)("goldmodal_title"),
                                    n = (0, i.wj)("goldmodal_message"),
                                    o = (0, i.wj)("goldmodal_image"),
                                    a = (0, i.wj)("goldmodal_button"),
                                    {
                                        quantity: c = 0,
                                        cost: l = 0
                                    } = r,
                                    {
                                        gold: d = 0,
                                        cards: h = {}
                                    } = s,
                                    p = h[t] || 0,
                                    g = () => (0, i.wj)("goldmodal").hide(),
                                    u = t => () => {
                                        m(t), g()
                                    };
                                return o.src = `${siteName}/assets/images/icon/coin.svg`, a.onclick = u("coins"), a.innerHTML = shopLocales.skins_tab.error_gold_btn, p < c && d < l ? (n.innerHTML = shopLocales.skins_tab.messages.both, e.innerHTML = shopLocales.skins_tab.titles.both) : d < l ? (n.innerHTML = shopLocales.skins_tab.messages.gold, e.innerHTML = shopLocales.skins_tab.titles.gold) : (n.innerHTML = shopLocales.skins_tab.messages.cards, e.innerHTML = shopLocales.skins_tab.titles.cards, o.src = `${siteName}/assets/images/chests/mystery.svg`, a.innerHTML = shopLocales.skins_tab.error_card_btn, a.onclick = u("chests")), (0, i.wj)("goldmodal").show(.3)
                            }
                            const {
                                skins: a,
                                gold: c
                            } = e;
                            "number" == typeof r.cost && (n.settings.userData.gold = c), n.settings.userData.skins = a, v(!1), p("owned")
                        }))
                    }
                    if ("coin" === t) {
                        if (!n.settings.userData.token) return !1;
                        (0, o.Ke)({
                            token: n.settings.userData.token,
                            coinsID: e,
                            payment: s,
                            email: n.settings.userData.email
                        }).then((({
                            message: t,
                            status: e,
                            url: s
                        }) => {
                            if (!e || "error" === e) return (0, i.wj)("errormodal").show(.3);
                            window.location.href = s
                        }))
                    }
                    if ("sub" === t) {
                        if (!n.settings.userData.token) return !1;
                        (0, o.UF)({
                            token: n.settings.userData.token,
                            month: e,
                            payment: s,
                            email: n.settings.userData.email
                        }).then((({
                            message: t,
                            status: e,
                            url: s
                        }) => {
                            if (!e || "error" === e) return (0, i.wj)("errormodal").show(.3);
                            window.location.href = s
                        }))
                    }
                    if ("chest" === t) {
                        const {
                            type: t,
                            hide: e
                        } = this.dataset || {}, {
                            userData: s,
                            shop: i
                        } = n.settings || {};
                        if (!t || !s.email) return !1;
                        w(i.chests.find((e => e.type === t)), e)
                    }
                    if ("chest-modal" === t) {
                        const {
                            type: t
                        } = this.dataset || {}, {
                            userData: e
                        } = n.settings || {};
                        if (!t || !e.email) return !1;
                        const s = {
                            token: e.token,
                            rarity: t,
                            email: e.email
                        };
                        (0, o.wV)(s).then((({
                            data: e,
                            status: s
                        }) => s && "error" !== s ? "sold" === s ? (0, i.wj)("particlesalert").show(.3) : void y(e, t) : (0, i.wj)("errormodal").show(.3)))
                    }
                }

                function m(t) {
                    const {
                        userData: e,
                        shop: s
                    } = n.settings || {};
                    return e.email ? "error" === s.status ? (0, i.wj)("errormodal").show(.3) : "loaded" === s.status ? (b(), t && g(t), v()) : (function() {
                        if (!n.settings.userData) return !1;
                        const {
                            subscription: t = 0
                        } = n.settings.userData;
                        "number" == typeof t && t > Date.now() ? ((0, i.wj)("sub-valid").innerHTML = new Date(t).toLocaleDateString("tr"), (0, i.wj)("without_sub").hide(), (0, i.wj)("with_sub").show()) : ((0, i.wj)("with_sub").hide(), (0, i.wj)("without_sub").show())
                    }(), p(s.skinsTab), (0, i.wj)("shop").show(.3), void(t && g(t))) : (0, i.wj)("needtobeloggined").show(.3)
                }

                function p(t = "free") {
                    if (t === n.settings.shop.skinsTab) return !1;
                    const e = t => `${t}-tab`;
                    ["free", "premium", "clan", "level", "owned"].forEach((s => {
                        s !== t ? (0, i.wj)(e(s)).hide() : (0, i.wj)(e(s)).show()
                    })), n.settings.shop.skinsTab = t
                }

                function g(t = "skins") {
                    if (t === n.settings.shop.tabCategory) return !1;
                    const e = t => `${t}-tab`,
                        s = t => `shop-nav-${t}`;
                    ["skins", "coins", "chests", "boosts", "sub", "challenge"].forEach((n => {
                        n !== t ? ((0, i.wj)(e(n)).hide(), (0, i.wj)(s(n)).classList.remove("selected")) : ("challenge" === t && u(!0), (0, i.wj)(e(n)).show(), (0, i.wj)(s(n)).classList.add("selected"))
                    })), (0, i.wj)("shop-header-title").innerHTML = shopLocales[(t => `${t}_tab`)(t)].title, n.settings.shop.tabCategory = t
                }
                l();

                function u(t) {
                    (0, o.E7)(n.settings.userData.email, t).then((({
                        data: t,
                        status: e,
                        message: s
                    }) => {
                        if (!e || "error" === e) return (0, i.uk)(s);
                        const n = t.filter((({
                                status: t
                            }) => !t)).map((({
                                task: t,
                                best: e,
                                status: s,
                                ready: n,
                                goal: i
                            }) => {
                                const o = shopLocales.challenge_tab.tasks[t].replace("%n", "alive" === t ? i / 60 : i),
                                    a = n ? `<button class="challenge-collect" onclick="this.challenge('${t}', ${s})">${shopLocales.challenge_tab.collect}</button>` : `<div class="challenge-best">${shopLocales.challenge_tab.result}${e}${"alive"===t?"s":""}</div>`;
                                return `\n        <div class="challenge">\n          <div class="challenge-text">\n            <div class="challenge-time">00h 00m 00s</div>\n            <div class="challenge-text-flex">\n              <div class="challenge-header">${shopLocales.challenge_tab.daily}</div>\n              <div class="challenge-desc">${o}</div>\n            </div>\n          </div>\n          ${a}\n        </div>\n      `
                            })),
                            o = n.length ? n.join("") : `<div class="challenge-completed"><div class="challenge-time">00h 00m 00s</div>${shopLocales.challenge_tab.completed}</div>`;
                        (0, i.wj)("challenge-tab").innerHTML = o
                    }))
                }

                function v(t = !0) {
                    const {
                        userData: e,
                        shop: s
                    } = n.settings || {}, a = s.skins, r = e.skins || [], c = e.gold || 0;
                    (0, i.UZ)(c);
                    const l = e.cards || {},
                        d = {
                            free: [],
                            premium: [],
                            clan: [],
                            level: [],
                            owned: []
                        };
                    a.forEach((t => {
                        const e = t._id,
                            s = l[e] || 0;
                        t.userParticles = s, r.includes(e) ? d.owned.push(t) : d[t.category].push(t)
                    })), Object.keys(d).forEach((t => function(t, e) {
                        const s = t => {
                                switch (t) {
                                    case "legendary":
                                        return 3;
                                    case "epic":
                                        return 2;
                                    case "rare":
                                        return 1;
                                    default:
                                        return 0
                                }
                            },
                            {
                                userData: a
                            } = n.settings,
                            r = (0, i.wj)(`${t}-tab`),
                            c = e.sort(((t, e) => s(t.rarity) - s(e.rarity))).map((e => {
                                const {
                                    quantity: s,
                                    userParticles: n,
                                    name: i,
                                    _id: r,
                                    cost: c,
                                    level: l
                                } = e, d = "string" == typeof e.rarity ? e.rarity : "common", h = "free" === t ? "free" : d;
                                let m = "common" === h ? "card" : `card ${h}-card`;
                                "level" === t && a.level < l && (m += " disabled-card");
                                const p = Math.ceil(n / (s || 1) * 100),
                                    g = s ? "" : 'style="display:none;"',
                                    u = "free" === t || "owned" === t || "level" === t ? "text" : "text-coin";
                                let v = c;
                                return "free" === t && (v = shopLocales.skins_tab.action_button.free), "owned" === t && (v = shopLocales.skins_tab.action_button.use), "level" === t && (v = `${l} ${shopLocales.skins_tab.action_button.level}`), `\n      <div class="${m}">\n        <div class="card-area">\n          <div class="card-body">\n            <div class="card-body-content">\n              <div class="card-avatar">\n                <img src="${(0,o.Uj)(i)}" crossorigin="anonymous" />\n              </div>\n              <div class="card-name">${i.replace(".png","")}</div>\n              <button class="card-buy-button" data-id="${r}" data-tab="${t}"\n                onclick="if (event.target === this) this.check('skin')">\n                <div class="layer-1"></div>\n                <div class="layer-2"></div>\n                <div class="layer-3"></div>\n                <div class="layer-4"></div>\n                <div class="${u}">${v}</div>\n              </button>\n            </div>\n          </div>\n          <div class="card-header">\n            <div class="card-header-underline"></div>\n            <div class="card-header-main-bg"></div>\n            <div class="card-header-center-bg"></div>\n            <div class="card-header-left-bg"></div>\n            <div class="card-header-right-bg"></div>\n            <div class="card-rarity-title">${shopLocales.skins_tab.rarity[d]}</div>\n          </div>\n        </div>\n        <div class="card-pillow" ${g}>\n          <div class="card-pillow-bg"></div>\n          <div class="card-particles">\n            <div class="card-particles-bar-bg"></div>\n            <div class="card-particles-bar-border"></div>\n            <div class="card-particles-bar" style="width:${p}%">\n              <div class="card-particles-bar-body"></div>\n              <div class="card-particles-bar-blink"></div>\n            </div>\n            <div class="card-particles-value">${n}/${s}</div>\n          </div>\n        </div>\n      </div>\n  `
                            }));
                        r.innerHTML = c.join("")
                    }(t, d[t]))), n.settings.setShopStatus("ready"), g(s.tabCategory || "skins"), p("free"), t && m()
                }

                function f() {
                    const {
                        shop: t
                    } = n.settings || {}, {
                        coins: e = [],
                        chests: s = [],
                        boosts: o = []
                    } = t || {};
                    ! function(t) {
                        const e = (0, i.wj)("coins-tab"),
                            s = t => `${siteName}/assets/images/coins/${t}.svg`,
                            n = t.map((({
                                type: t,
                                gold: e,
                                price: n,
                                _id: i
                            }) => {
                                const o = t => t.toLocaleString("en-US").replace(".", ",") + " $",
                                    a = o(n),
                                    r = o(Math.floor(.5 * n * 100) / 100);
                                return `\n    <div class="card coin-card">\n      <div class="card-area">\n        <div class="card-body">\n          <div class="card-body-content">\n            <div class="sale-box">${shopLocales.sub_tab.options.save} 50%</div>\n            <div class="card-avatar">\n              <img loading="lazy" src="${s(t)}" alt="Coins" title="Coins" />\n            </div>\n            <div class="card-info">${e.toLocaleString("ru-RU")}</div>\n          </div>\n        </div>\n        <div class="card-header">\n          <div class="card-header-underline"></div>\n          <div class="card-header-main-bg"></div>\n          <div class="card-header-center-bg"></div>\n          <div class="card-header-left-bg"></div>\n          <div class="card-header-right-bg"></div>\n          <div class="card-rarity-title">${shopLocales.coins_tab.type[t]}</div>\n        </div>\n      </div>\n      <div class="card-pillow">\n        <div class="card-pillow-bg"></div>\n        <button class="card-buy-button" onclick="if (event.target === this) this.payment('coin', '${i}')" data-type="${t}">\n                <div class="layer-1 layers"></div>\n                <div class="layer-2 layers"></div>\n                <div class="layer-3 layers"></div>\n                <div class="layer-4 layers"></div>\n                <div class="text"><span>${r}</span><span>${a}</span></div>\n              </button>\n      </div>\n    </div>\n`
                            }));
                        e.innerHTML = n.join("")
                    }(e),
                    function(t) {
                        const e = (0, i.wj)("chests-tab"),
                            s = t => `${siteName}/assets/images/chests/${t}.svg`,
                            n = t.map((({
                                type: t,
                                price: e,
                                entities: n
                            }) => {
                                const i = Object.values(n).reduce(((t, e) => t + e), 0);
                                return `\n    <div class="card chest-card ${t}-card">\n      <div class="card-area">\n        <div class="card-body">\n          <div class="card-body-content">\n            <div class="card-avatar">\n              <img src="${s(t)}" loading="lazy" />\n            </div>\n            <div class="card-info">x${i} ${shopLocales.chests_tab.cards}</div>\n          </div>\n        </div>\n        <div class="card-header">\n          <div class="card-header-underline"></div>\n          <div class="card-header-main-bg"></div>\n          <div class="card-header-center-bg"></div>\n          <div class="card-header-left-bg"></div>\n          <div class="card-header-right-bg"></div>\n          <div class="card-rarity-title">${shopLocales.chests_tab.type[t]}</div>\n        </div>\n      </div>\n      <div class="card-pillow">\n        <div class="card-pillow-bg"></div>\n        <button class="card-buy-button" onclick="if (event.target === this) this.check('chest')" data-type="${t}">\n                <div class="layer-1 layers"></div>\n                <div class="layer-2 layers"></div>\n                <div class="layer-3 layers"></div>\n                <div class="layer-4 layers"></div>\n                <div class="text-coin">${e}</div>\n              </button>\n      </div>\n    </div>\n`
                            }));
                        e.innerHTML = n.join("")
                    }(s),
                    function(t) {
                        const e = (0, i.wj)("boosts-tab"),
                            s = t => `${siteName}/assets/images/star.${t}`,
                            n = t.map((({
                                hours: t,
                                price: e
                            }) => `\n    <div class="card ${1===t?"common-card":"rare-card"} boost-card">\n      <div class="card-area">\n        <div class="card-body">\n          <div class="card-body-content">\n            <div class="card-avatar">\n              <picture>\n                <source src=${s("webp")}" type="image/webp" />\n                <img src="${s("png")}" loading="lazy" alt="Star" title="Star" />\n              </picture>\n            </div>\n            <div class="card-info">${t} ${shopLocales.boosts_tab.hour}</div>\n          </div>\n        </div>\n        <div class="card-header">\n          <div class="card-header-underline"></div>\n          <div class="card-header-main-bg"></div>\n          <div class="card-header-center-bg"></div>\n          <div class="card-header-left-bg"></div>\n          <div class="card-header-right-bg"></div>\n          <div class="card-rarity-title">${shopLocales.boosts_tab.triple}</div>\n        </div>\n      </div>\n      <div class="card-pillow">\n        <div class="card-pillow-bg"></div>\n        <button class="card-buy-button" onclick="if (event.target === this) this.boost(${t})">\n                <div class="layer-1 layers"></div>\n                <div class="layer-2 layers"></div>\n                <div class="layer-3 layers"></div>\n                <div class="layer-4 layers"></div>\n                <div class="text-coin">${e.toLocaleString("ru-RU")}</div>\n              </button>\n      </div>\n    </div>\n`));
                        e.innerHTML = n.join("")
                    }(o)
                }

                function w({
                    type: t,
                    price: e,
                    entities: s
                }, n = !1) {
                    const o = (0, i.wj)("chest-content"),
                        a = Object.keys(s),
                        r = ["common", "rare", "epic", "legendary"].filter((t => a.includes(t))),
                        c = Object.values(s).reduce(((t, e) => t + e), 0),
                        l = "card-buy-button" + (n ? "` card-buy-button__hide" : ""),
                        d = r.map((t => `\n  <div class="chest-content-item ${t}">\n    <div class="chest-content-image">\n      <div class="chest-content-card"></div>\n    </div>\n    <div class="chest-content-item-text">\n      <div>x${s[t]}</div>\n      <div>${shopLocales.chests_tab.rarity[t]}</div>\n    </div>\n  </div>\n    `)).join(""),
                        h = `\n<div class="connecting__content">\n  <div class="close-connecting-button">\n    <i onclick="closeChestContentModal()" class="fas fa-times"></i>\n  </div>\n  <div class="chest-modal-image ${t}"></div>\n  <div class="chest-modal-title">${shopLocales.chests_tab.type[t]}</div>\n  <div id="chest-modal-body">\n    <div id="chest-body-upto" class="${t}">\n      <div id="upto-card">\n        <div class="chest-upto-card"></div>\n      </div>\n      <div>\n        <p>${shopLocales.chests_tab.upto}</p>\n        <p>x${c} ${shopLocales.chests_tab.cards}</p>\n      </div>\n    </div>\n    <div id="chest-body-content">${d}</div>\n    <button class="${l}" onclick="if (event.target === this) this.check('chest-modal')" data-type="${t}">\n      <div class="layer-1 layers"></div>\n      <div class="layer-2 layers"></div>\n      <div class="layer-3 layers"></div>\n      <div class="layer-4 layers"></div>\n      <div class="text-coin">${e}</div>\n    </button>\n  </div>\n</div>\n  `;
                    o.innerHTML = h, o.show(.3)
                }

                function y({
                    user: t,
                    chest: e
                }, s) {
                    (0, i.wj)("chest-content").hide();
                    const {
                        gold: a,
                        cards: r
                    } = t;
                    n.settings.userData.cards = r, a && (n.settings.userData.gold = a), a && (0, i.UZ)(a), v(!1);
                    const c = (0, i.wj)("chest-results"),
                        l = ["legendary", "epic", "rare", "common"].reduce(((t, s) => {
                            const n = e[s],
                                i = [];
                            for (const t in n) {
                                n[t] && i.push(t)
                            }
                            return t = [...t, ...i]
                        }), []),
                        d = l.reduce(((t, e, s) => ({
                            ...t,
                            [e]: s
                        })), {});
                    Element.prototype.claim = function() {
                        const t = 309 * l.length - 30;
                        let a = 0;
                        return function() {
                            a++;
                            const r = 339 * a;
                            if (r > t) return function(t, e) {
                                const s = {},
                                    a = ["legendary", "epic", "rare", "common"],
                                    r = a.reduce(((e, n) => {
                                        const i = t[n],
                                            o = [];
                                        for (const t in i) {
                                            const e = i[t];
                                            e && (o.push(t), s[t] = e)
                                        }
                                        return e = [...e, ...o]
                                    }), []),
                                    c = r.reduce(((t, e, s) => ({
                                        ...t,
                                        [e]: s
                                    })), {}),
                                    l = Object.values(s).reduce(((t, e) => t + e), 0),
                                    d = n.settings.shop.skins.filter((t => r.includes(t._id))).sort(((t, e) => c[e._id] - c[t._id])),
                                    h = d.map((t => {
                                        const {
                                            name: e,
                                            _id: n
                                        } = t, i = "string" == typeof t.rarity ? t.rarity : "common", a = "common" === i ? "card mini-card" : `card mini-card ${i}-card`, r = s[n];
                                        return `<div class="${a}">\n    <div class="card-area">\n      <div class="card-body">\n        <div class="card-body-content">\n          <div class="card-avatar">\n            <img src="${(0,o.Uj)(e)}" loading="lazy" crossorigin="anonymous" />\n          </div>\n          <div class="card-name">${e.replace(".png","")}</div>\n          \n          <div class="card-particles">\n            <div class="card-particles-bar-bg"></div>\n            <div class="card-particles-bar-border"></div>\n            <div class="card-particles-bar" style="width:100%">\n              <div class="card-particles-bar-body"></div>\n              <div class="card-particles-bar-blink"></div>\n            </div>\n            <div class="card-particles-value">+${r}</div>\n          </div>\n\n        </div>\n      </div>\n      <div class="card-header">\n        <div class="card-header-underline"></div>\n        <div class="card-header-main-bg"></div>\n        <div class="card-header-center-bg"></div>\n        <div class="card-header-left-bg"></div>\n        <div class="card-header-right-bg"></div>\n        <div class="card-rarity-title">${shopLocales.skins_tab.rarity[i]}</div>\n      </div>\n    </div>\n  </div>`
                                    })).join("");
                                (0, i.wj)("chest-total-items").innerHTML = h, (0, i.wj)("total-cards-number").innerHTML = l, (0, i.wj)("total-chest-title").innerHTML = shopLocales.chests_tab.type[e], (0, i.wj)("chest-total-upto").className = e
                            }(e, s), (0, i.wj)("chest-results").hide(), void(0, i.wj)("chest-total").show(.2);
                            (0, i.wj)("chest-results-slider-child").style.transform = `translateX(-${r}px)`
                        }
                    }();
                    const h = n.settings.shop.skins.filter((t => l.includes(t._id))).sort(((t, e) => d[e._id] - d[t._id])).map((t => {
                            const {
                                quantity: s,
                                userParticles: n,
                                name: i,
                                _id: a
                            } = t, r = i.replace(".png", ""), c = "string" == typeof t.rarity ? t.rarity : "common", l = e[c][a], d = Math.ceil(n / (s || 1) * 100);
                            return `\n        <div class="chest-results-body ${c}">\n          <div class="chest-results-card">\n            <div class="results-text">\n              <div>${r}</div>\n              <div>x${l} ${shopLocales.chests_tab.rarity[c]}</div>\n            </div>\n            <div class="results-avatar">\n              <img src="${(0,o.Uj)(i)}" loading="lazy" crossorigin="anonymous" />\n            </div>\n          </div>\n          <div class="card-particles">\n            <div class="card-particles-bar-bg"></div>\n            <div class="card-particles-bar-border"></div>\n            <div class="card-particles-bar" style="width:${d}%">\n              <div class="card-particles-bar-body"></div>\n            </div>\n            <div class="card-particles-value">${n}/${s}</div>\n          </div>\n        </div>\n    `
                        })).join(""),
                        m = `\n  <div class="connecting__content">\n    <div class="close-connecting-button">\n      <i onclick="closeChestResultModal()" class="fas fa-times"></i>\n    </div>\n    <div class="chest-modal-image ${s}"></div>\n\n    <div id="chest-results-slider">\n      <div id="chest-results-slider-child">${h}</div>\n    </div>\n\n    <button class="card-buy-button" onclick="if (event.target === this) this.claim()">\n      <div class="layer-1 layers"></div>\n      <div class="layer-2 layers"></div>\n      <div class="layer-3 layers"></div>\n      <div class="layer-4 layers"></div>\n      <div class="text">${shopLocales.chests_tab.claim}</div>\n    </button>\n  </div>\n  `;
                    c.innerHTML = m, c.show(.3)
                }
                Element.prototype.setCategory = g, Element.prototype.check = h, Element.prototype.openTab = m, Element.prototype.changeTab = p, Element.prototype.hourly = function() {
                    if ((0, i.WQ)()) return (0, i.wj)("modalfolks").show(.3);
                    if (!n.settings.userData.hourlyTime || !n.settings.userData.token) return (0, i.wj)("needtobeloggined").show(.3);
                    fetch((0, o.ED)(n.settings.userData.email), {
                        method: "GET",
                        headers: {
                            Authorization: `TOKEN ${n.settings.userData.token}`
                        }
                    }).then((t => t.json())).then((({
                        status: t,
                        date: e,
                        gold: s
                    }) => {
                        "success" === t && (n.settings.userData.hourlyTime = e, n.settings.userData.gold += s, n.settings.createInterval(), (0, i.UZ)(n.settings.userData.gold), function(t) {
                            (0, i.wj)("free-coins-value").innerHTML = t, (0, i.wj)("free-coins").show(.2)
                        }(s))
                    }))
                }, Element.prototype.payment = (...t) => {
                    (0, i.wj)("paypal_btn").onclick = e => h(...t, "paypal"), (0, i.wj)("payop_btn").onclick = e => h(...t, "payop"), (0, i.wj)("payments-modal").show(.3)
                }, Element.prototype.boost = t => {
                    (0, o.Q9)({
                        token: n.settings.userData.token,
                        hours: t,
                        email: n.settings.userData.email
                    }).then((({
                        status: t,
                        message: e,
                        data: s
                    }) => {
                        if (!t || "error" === t) return (0, i.wj)("errormodal").show(.3);
                        const {
                            gold: o,
                            boost: r
                        } = s;
                        n.settings.userData.boost = r, n.settings.userData.gold = o, (0, i.UZ)(o), n.settings.createBoostTimer(r), (0, a._C)(), (0, i.wj)("shop").hide()
                    }))
                }, Element.prototype.challenge = function(t, e) {
                    e || (0, o.cn)({
                        token: n.settings.userData.token,
                        task: t,
                        email: n.settings.userData.email
                    }).then((({
                        data: t,
                        status: e,
                        message: s
                    }) => {
                        if (!e || "error" === e) return (0, i.uk)(s);
                        (0, i.UZ)(t.gold), (0, i.wj)("challenge-coins-value").innerHTML = t.reward, (0, i.wj)("challenge-coins").show(.2), u(!1)
                    }))
                };
                const b = () => new Promise(((t, e) => fetch((0, o.mu)()).then((t => t.json())).then((t => {
                    const {
                        status: e,
                        onSale: s,
                        discount: i
                    } = t;
                    if ("success" !== e) return;
                    n.settings.shop.onSale = s, n.settings.shop.subDiscount = i || 0;
                    const o = document.querySelectorAll(".sub-price"),
                        a = document.querySelectorAll(".coin-card"),
                        r = document.querySelectorAll(".coin-card .card-body-content > .sale-box"),
                        c = document.querySelectorAll(".coin-card .card-buy-button > .text");
                    i > 0 ? o.forEach((t => {
                        const e = ((t, e) => Math.floor(t * (1 - e / 100) * 100) / 100)(+t.children[1].innerHTML.slice(1), i);
                        t.children[0].innerHTML = "$" + e, t.children[1].className = "sale"
                    })) : o.forEach((t => {
                        t.children[0].className = "hide"
                    })), s > 0 ? (a.forEach((t => t.classList = "coin coin-card sale")), r.forEach((t => {
                        t.classList = "sale-box", t.innerHTML = `SALE ${Math.floor(100*s)}%`
                    })), c.forEach((t => {
                        const e = ((t, e) => Math.floor(t * (1 - e) * 100) / 100)(+t.children[1].innerHTML.split(" ")[0].replace(",", "."), s);
                        t.children[0].innerHTML = "$" + e, t.children[1].className = "sale"
                    }))) : (a.forEach((t => t.classList = "coin coin-card")), r.forEach((t => t.classList = "hide")), c.forEach((t => {
                        t.children[0].className = "hide"
                    })))
                }))))
            },
            429: (t, e, s) => {
                s.d(e, {
                    A3: () => c,
                    gb: () => d,
                    mw: () => l
                });
                var n = s(352),
                    i = s(776),
                    o = s(0),
                    a = s(292),
                    r = (s(427), s(520));
                const c = new class {
                    rewards = [];
                    _id = null;
                    start_date = 0;
                    end_date = 0;
                    userSigma = {
                        level: 0,
                        rewards: {}
                    };
                    reset() {
                        this.rewards = [], this._id = null, this.start_date = 0, this.end_date = 0, this.userSigma = {
                            level: 0,
                            rewards: {}
                        }
                    }
                    handlePass(t) {
                        this.rewards = t.rewards, this._id = t._id, this.start_date = t.start_date, this.end_date = t.end_date
                    }
                    createItem(t = "common", e = "sub", s, n = 0) {
                        const i = `sigma-item sigma-${t}`,
                            o = s + 1,
                            a = n < o,
                            r = !0 === this.userSigma.rewards[s];
                        return `\n      <div class="${i}" onclick="this.sigmaReward(${s},${r},${a},'${e}','${t}')">\n        ${`<div class="sigma-requirement">\n      ${a?'<div class="sigma-lock">'+o+"</div>":`<label class="sigmabox"><input type="checkbox" ${r?"checked":""} onchange="this.checked = ${r}" /><span>${o}</span></label>`}\n    </div>`}\n        <div class="sigma-${e}"></div>\n        <div class="sigma-reward"></div>\n      </div>\n    `
                    }
                    handleTime() {
                        const t = Date.now();
                        this.start_date <= t && t <= this.end_date ? this.setTime() : this.comingSoon()
                    }
                    comingSoon() {
                        (0, i.wj)("sigma-time-text").innerHTML = sigmaLocales.comming, (0, i.wj)("sigma-time-value").innerHTML = sigmaLocales.soon
                    }
                    setTime() {
                        const t = Date.now();
                        (0, i.wj)("sigma-time-text").innerHTML = sigmaLocales.get_pass, (0, i.wj)("sigma-time-value").innerHTML = this.getTimeDiff(t, this.end_date)
                    }
                    getTimeDiff(t, e) {
                        const s = Math.abs(t - e) / 36e5;
                        return `${Math.floor(s/24)}d ${Math.floor(s%24)}h`
                    }
                    createItems() {
                        const {
                            lvl: t
                        } = this.getLevel(), e = this.rewards.map((({
                            reward: e,
                            type: s
                        }, n) => this.createItem(e, s, n, t))).join("");
                        (0, i.wj)("sigma-content").innerHTML = e
                    }
                    getLevel() {
                        const t = 1e6,
                            e = Math.floor(this.userSigma.level / t);
                        return {
                            limit: t,
                            lvl: e,
                            points: this.userSigma.level - t * e
                        }
                    }
                    drawLevel() {
                        const {
                            points: t,
                            limit: e,
                            lvl: s
                        } = this.getLevel(), n = 100 * +(t / e).toFixed(2) + 1 + "%";
                        (0, i.wj)("sigma-line-progress").style.width = n, (0, i.wj)("sigma-progress").innerHTML = `${t.toLocaleString()}/1M`, (0, i.wj)("sigma-level").innerHTML = s
                    }
                    draw() {
                        this.handleTime(), this.createItems(), this.drawLevel()
                    }
                    extractUserData() {
                        const {
                            sigma: t
                        } = n.settings.shop, e = t._id, s = n.settings.userData.sigma || {};
                        s[e] || (s[e] = {});
                        const i = s[e];
                        i.level || (i.level = 0), i.rewards || (i.rewards = {}), this.userSigma = i
                    }
                    render() {
                        const {
                            sigma: t
                        } = n.settings.shop;
                        t ? (this.extractUserData(), this.handlePass(t), this.draw()) : (this.reset(), this.draw())
                    }
                };

                function l() {
                    if (!n.settings.userData.token) return (0, i.wj)("needtobeloggined").show(.3);
                    c.render(), (0, i.wj)("sigma-pass").show(.3), (0, i.wj)("sigma-scroll").scrollTop = 0
                }

                function d(t, e, s, l, d) {
                    if (e || s || !n.settings.userData.token) return !1;
                    const h = n.settings.userData.subscription >= Date.now();
                    if (!e && !h && "sub" === l && ["common", "rare", "epic", "legendary", "gold", "boost-1h", "boost-3h"].includes(d)) return function(t) {
                        const e = (0, i.wj)("sigma_contais"),
                            s = (0, i.wj)("contains_show_btn"),
                            a = (0, i.wj)("contains_sub_btn"),
                            r = (0, i.wj)("contains_text"),
                            c = () => e.hide();
                        if ("gold" === t) s.classList = "hide", r.innerHTML = sigmaLocales.contains_gold;
                        else if ("boost-1h" === t || "boost-3h" === t) s.classList = "hide", r.innerHTML = sigmaLocales.contains_boost;
                        else {
                            const {
                                shop: e
                            } = n.settings || {}, i = e.chests.find((e => e.type === t));
                            r.innerHTML = sigmaLocales.contains_chest, s.classList = "", s.onclick = () => {
                                (0, o.w7)(i, !0), c()
                            }
                        }
                        var l;
                        a.onclick = (l = "sub", () => {
                            (0, o.e0)(l), c()
                        }), e.show(.3)
                    }(d);
                    (0, a.uO)({
                        id: c._id,
                        index: t,
                        token: n.settings.userData.token,
                        email: n.settings.userData.email
                    }).then((({
                        data: e,
                        status: s,
                        message: a
                    }) => {
                        if ("success" !== s) return (0, i.uk)(a);
                        if ("chest" === e.type) {
                            const {
                                chest: s,
                                cards: i,
                                sigma: a
                            } = e;
                            n.settings.userData.sigma = a, (0, o.eQ)({
                                user: {
                                    cards: i
                                },
                                chest: s
                            }, c.rewards[t].reward)
                        } else if ("boost-1h" === e.type || "boost-3h" === e.type) {
                            const {
                                hours: t,
                                sigma: s,
                                boost: o
                            } = e;
                            n.settings.userData.sigma = s, n.settings.userData.boost = o, n.settings.createBoostTimer(o), (0, r._C)(), (0, i.wj)("reward-booster-value").innerHTML = t, (0, i.wj)("reward-booster").show(.2)
                        } else {
                            const {
                                gold: t,
                                sigma: s,
                                value: o
                            } = e;
                            n.settings.userData.sigma = s, (0, i.UZ)(t), (0, i.wj)("reward-coins-value").innerHTML = o, (0, i.wj)("reward-coins").show(.2)
                        }
                        c.extractUserData(), c.draw()
                    }))
                }
            },
            520: (t, e, s) => {
                s.d(e, {
                    C: () => w,
                    _6: () => q,
                    cT: () => P,
                    _C: () => N,
                    KC: () => U,
                    wp: () => F,
                    SS: () => I,
                    kp: () => M,
                    mC: () => A,
                    mY: () => H,
                    me: () => j,
                    IP: () => D
                });
                var n = s(352),
                    i = s(776),
                    o = s(292),
                    a = s(428),
                    r = s(716);
                class c {
                    constructor(t, e, s) {
                        this.src = t, this.volume = "number" == typeof e ? e : .5, this.maximum = "number" == typeof s ? s : 1 / 0, this.elms = []
                    }
                    add() {
                        if (this.elms.length >= this.maximum) return this.elms[0];
                        const t = new Audio(this.src);
                        return this.elms.push(t), t
                    }
                    play(t) {
                        let e;
                        "number" == typeof t && (this.volume = t);
                        for (let t = 0; t < this.elms.length; t++) {
                            const s = this.elms[t];
                            if (s.paused) {
                                e = s;
                                break
                            }
                        }
                        e || (e = this.add()), e.volume = this.volume, e.play()
                    }
                }
                const l = new Image;
                l.src = window.origin + "/assets/images/viruses/2-min.png";
                const d = new c("https://sigmally.com/assets/sound/eat.mp3", .5, 10),
                    h = new c("https://sigmally.com/assets/sound/pellet.mp3", .5, 10);
                s(427);
                var m = s(920);
                const {
                    USE_HTTPS: p,
                    EMPTY_NAME: g,
                    CELL_POINTS_MIN: u,
                    CELL_POINTS_MAX: v,
                    PI_2: f
                } = n.options.constants, w = new Uint8Array(256), y = new Uint8Array(256), b = "SIG 0.0.1", S = new DataView(new ArrayBuffer(8));
                let x = !1;

                function k(t) {
                    return this._e = t, this.reset(), this
                }

                function T(t, e, s) {
                    this._e = s, t && this.repurpose(t, e)
                }

                function _(t, e, s, i, o, a, r, c, d, h) {
                    this.isPlayer = d, this.isSub = h, this.id = t, this.x = this.nx = this.ox = e, this.y = this.ny = this.oy = s, this.s = this.ns = this.os = i, this.ejected = !!(32 & c), this.setColor(a), this.setName(o), this.setSkin(r), this.isJagged = 1 & c || 16 & c, this.isPellet = i <= 40, this.isJagged && (this.image = l), this.born = n.options.gameOptions.syncUpdStamp, this.points = [], this.pointsVel = []
                }

                function L() {
                    const {
                        ws: t
                    } = n.options.gameOptions;
                    t && (n.Y.debug("ws cleanup trigger"), t.onopen = null, t.onmessage = null, t.close(), n.options.change("ws", null))
                }

                function j(t) {
                    n.options.gameOptions.ws && (n.Y.debug("ws init on existing conn"), L()), n.options.change("wsUrl", t);
                    const e = new WebSocket("ws" + (p ? "s" : "") + "://" + t);
                    e.binaryType = "arraybuffer", e.onopen = C, e.onmessage = E, e.onerror = O, e.onclose = $, n.options.change("ws", e)
                }

                function C() {
                    x = !1, n.options.change("reconnectDelay", 1e3), (0, i.wj)("gameloading").hide(), (0, i.wj)("needtobeloggined").hide();
                    const t = new k;
                    t.setStringUTF8(b), D(t)
                }

                function O(t) {
                    (0, i.wj)("gameloading").show(.2), n.Y.warn(t)
                }

                function $(t) {
                    t.currentTarget === n.options.gameOptions.ws && (n.Y.debug("ws disconnected " + t.code + " '" + t.reason + "'"), L(), q(), setTimeout((function() {
                        window.setserver(n.options.gameOptions.wsUrl)
                    }), n.options.gameOptions.reconnectDelay *= 1.5))
                }

                function D(t) {
                    const {
                        ws: e
                    } = n.options.gameOptions;
                    e && 1 === e.readyState && (t.build ? e.send(t.build()) : e.send(t))
                }

                function E(t) {
                    n.options.change("syncUpdStamp", Date.now());
                    const e = new T(new DataView(t.data), 0, !0);
                    if (!x) {
                        if (e.getStringUTF8(!1) !== b) return n.options.gameOptions.ws.close();
                        w.set(new Uint8Array(e.raw(256)));
                        for (const t in w) y[w[t]] = ~~t;
                        return void(x = !0)
                    }
                    const s = e.getUint8();
                    switch (y[s]) {
                        case 16: {
                            let t, s, o, a, r, c, l, m, p, g, u, v, f, w, y, b, S, x, k;
                            b = e.getUint16();
                            for (let i = 0; i < b; i++) {
                                t = e.getUint32(), s = e.getUint32();
                                const i = n.options.cells.byId[t],
                                    o = n.options.cells.byId[s];
                                n.settings.gameSettings.playSounds && n.options.cells.mine.includes(t) && (o.isPellet ? h : d).play(parseFloat(n.settings.gameSettings.soundsVolume.value)), n.options.cells.mine.includes(t) && o && (o.isPellet && n.options.gameOptions.foodEaten++, B()), o.destroy(i ? t : null)
                            }
                            for (; o = e.getUint32(), 0 !== o;) a = e.getInt16(), r = e.getInt16(), c = e.getUint16(), l = e.getUint8(), p = !!(2 & l), u = !!(4 & l), g = !!(8 & l), v = 0 === e.getUint8(), f = !!e.getUint8(), w = !!e.getUint8(), y = e.getStringUTF8(), S = p ? (0, i.EH)(e.getUint8(), e.getUint8(), e.getUint8()) : null, k = u ? e.getStringUTF8() : null, x = g ? e.getStringUTF8() : null, n.options.cells.byId.hasOwnProperty(o) ? (m = n.options.cells.byId[o], m.update(n.options.gameOptions.syncUpdStamp), m.updated = n.options.gameOptions.syncUpdStamp, m.ox = m.x, m.oy = m.y, m.os = m.s, m.nx = a, m.ny = r, m.ns = c, m.isPlayer = f, m.isSub = w, S && m.setColor(S), x && m.setName(x), k && m.setSkin(k)) : (m = new _(o, a, r, c, x, S, k, l, f, w), m.setClan(y), n.options.cells.byId[o] = m, n.options.cells.list.push(m));
                            b = e.getUint16();
                            for (let t = 0; t < b; t++) s = e.getUint32(), n.options.cells.byId.hasOwnProperty(s) && !n.options.cells.byId[s].destroyed && n.options.cells.byId[s].destroy(null);
                            break
                        }
                        case 17:
                            n.options.camera.target.x = e.getFloat32(), n.options.camera.target.y = e.getFloat32(), n.options.camera.target.scale = e.getFloat32(), n.options.camera.target.scale *= n.options.camera.viewportScale, n.options.camera.target.scale *= n.options.camera.userZoom;
                            break;
                        case 18:
                            for (const t in n.options.cells.byId) n.options.cells.byId[t].destroy(null);
                            break;
                        case 20:
                            n.options.cells.mine = [];
                            break;
                        case 21:
                            n.Y.warn("got packet 0x15 (draw line) which is unsupported");
                            break;
                        case 32: {
                            const t = e.getUint32();
                            n.options.cells.mine.push(t);
                            break
                        }
                        case 48: {
                            n.options.leaderboard.items = [], n.options.leaderboard.type = "text";
                            const t = e.getUint32();
                            for (let s = 0; s < t; ++s) n.options.leaderboard.items.push(e.getStringUTF8());
                            (0, r.a_)();
                            break
                        }
                        case 49: {
                            n.options.leaderboard.items = [], n.options.leaderboard.type = "ffa";
                            const t = e.getUint32();
                            for (let s = 0; s < t; ++s) {
                                const t = !!e.getUint32(),
                                    s = e.getStringUTF8(),
                                    i = e.getUint32(),
                                    o = !!e.getUint32();
                                n.options.leaderboard.items.push({
                                    me: t,
                                    myposition: i,
                                    name: _.prototype.parseName(s).name || g,
                                    subscription: o
                                })
                            }(0, r.a_)();
                            break
                        }
                        case 64:
                            if (n.options.border.left = e.getFloat64(), n.options.border.top = e.getFloat64(), n.options.border.right = e.getFloat64(), n.options.border.bottom = e.getFloat64(), n.options.border.width = n.options.border.right - n.options.border.left, n.options.border.height = n.options.border.bottom - n.options.border.top, n.options.border.centerX = (n.options.border.left + n.options.border.right) / 2, n.options.border.centerY = (n.options.border.top + n.options.border.bottom) / 2, 33 === t.data.byteLength) break;
                            n.options.gameOptions.mapCenterSet || (n.options.change("mapCenterSet", !0), n.options.camera.x = n.options.camera.target.x = n.options.border.centerX, n.options.camera.y = n.options.camera.target.y = n.options.border.centerY, n.options.camera.scale = n.options.camera.target.scale = 1), e.getUint32(), n.options.stats.pingLoopId = setInterval((function() {
                                D(w.slice(254, 255)), n.options.stats.pingLoopStamp = Date.now()
                            }), 2e3);
                            break;
                        case 99: {
                            const t = e.getUint8(),
                                s = (0, i.EH)(e.getUint8(), e.getUint8(), e.getUint8());
                            let o = e.getStringUTF8();
                            o = _.prototype.parseName(o).name || g;
                            const r = e.getStringUTF8(),
                                c = !!(128 & t),
                                l = !!(64 & t),
                                d = !!(32 & t);
                            c && "SERVER" !== o && (o = "[SERVER] " + o), l && (o = "[ADMIN] " + o), d && (o = "[MOD] " + o);
                            const h = Math.max(3e3, 1e3 + 150 * r.length);
                            a.gJ.waitUntil = n.options.gameOptions.syncUpdStamp - a.gJ.waitUntil > 1e3 ? n.options.gameOptions.syncUpdStamp + h : a.gJ.waitUntil + h, a.gJ.messages.push({
                                server: c,
                                admin: l,
                                mod: d,
                                color: s,
                                name: o,
                                message: r,
                                time: n.options.gameOptions.syncUpdStamp
                            }), n.settings.gameSettings.showChat && (0, a.Eb)();
                            break
                        }
                        case 254:
                            n.options.stats.info = JSON.parse(e.getStringUTF8()), n.options.stats.latency = n.options.gameOptions.syncUpdStamp - n.options.stats.pingLoopStamp, (0, r.PD)();
                            break;
                        case 221: {
                            const t = !!e.getUint8(),
                                {
                                    session: s
                                } = n.options.gameOptions;
                            t && s && s();
                            break
                        }
                        case 180:
                            (0, i.uk)("Password is incorrect");
                            break;
                        default:
                            L()
                    }
                }

                function M(t, e) {
                    const s = new k(!0);
                    s.setUint8(w[16]), s.setUint32(t), s.setUint32(e), s._b.push(0, 0, 0, 0), D(s)
                }

                function I() {
                    const t = new k(!0);
                    t.setUint8(w[205]), D(t)
                }

                function U(t) {
                    const e = new k(!0);
                    e.setUint8(w[220]), e.setStringUTF8(t), D(e)
                }

                function P(t) {
                    if (!t || !t.blocker) return;
                    const e = JSON.stringify(t),
                        s = new k(!0);
                    s.setUint8(w[208]), s.setStringUTF8(e), D(s)
                }

                function A(t) {
                    const e = new k(!0);
                    e.setUint8(w[0]), e.setStringUTF8(t), D(e)
                }

                function H() {
                    const t = new k(!0);
                    t.setUint8(w[191]), D(t)
                }

                function B() {
                    const t = new k(!0);
                    t.setUint8(w[192]), D(t)
                }

                function N() {
                    const t = new k(!0);
                    t.setUint8(w[190]), D(t)
                }

                function F(t) {
                    const e = new k;
                    e.setUint8(w[99]), e.setUint8(0), e.setStringUTF8(t), D(e)
                }

                function q() {
                    (0, i.uO)(n.options.cells), (0, i.uO)(n.options.border), (0, i.uO)(n.options.leaderboard), (0, i.uO)(a.gJ), (0, i.uO)(n.options.stats), a.gJ.messages = [], a.Oo.show(), n.options.leaderboard.items = [], n.options.cells.mine = [], n.options.cells.byId = {}, n.options.cells.list = [], n.options.camera.x = n.options.camera.y = n.options.camera.target.x = n.options.camera.target.y = 0, n.options.camera.scale = n.options.camera.target.scale = 1, n.options.change("mapCenterSet", !1)
                }
                k.prototype = {
                    writer: !0,
                    reset: function(t) {
                        this._b = [], this._o = 0
                    },
                    setUint8: function(t) {
                        return t >= 0 && t < 256 && this._b.push(t), this
                    },
                    setInt8: function(t) {
                        return t >= -128 && t < 128 && this._b.push(t), this
                    },
                    setUint16: function(t) {
                        return S.setUint16(0, t, this._e), this._move(2), this
                    },
                    setInt16: function(t) {
                        return S.setInt16(0, t, this._e), this._move(2), this
                    },
                    setUint32: function(t) {
                        return S.setUint32(0, t, this._e), this._move(4), this
                    },
                    setInt32: function(t) {
                        return S.setInt32(0, t, this._e), this._move(4), this
                    },
                    setFloat32: function(t) {
                        return S.setFloat32(0, t, this._e), this._move(4), this
                    },
                    setFloat64: function(t) {
                        return S.setFloat64(0, t, this._e), this._move(8), this
                    },
                    _move: function(t) {
                        for (let e = 0; e < t; e++) this._b.push(S.getUint8(e))
                    },
                    setStringUTF8: function(t) {
                        const e = unescape(encodeURIComponent(t));
                        for (let t = 0, s = e.length; t < s; t++) this._b.push(e.charCodeAt(t));
                        return this._b.push(0), this
                    },
                    build: function() {
                        return new Uint8Array(this._b)
                    }
                }, T.prototype = {
                    reader: !0,
                    repurpose: function(t, e) {
                        this.view = t, this._o = e || 0
                    },
                    getUint8: function() {
                        return this.view.getUint8(this._o++, this._e)
                    },
                    getInt8: function() {
                        return this.view.getInt8(this._o++, this._e)
                    },
                    getUint16: function() {
                        return this.view.getUint16((this._o += 2) - 2, this._e)
                    },
                    getInt16: function() {
                        return this.view.getInt16((this._o += 2) - 2, this._e)
                    },
                    getUint32: function() {
                        return this.view.getUint32((this._o += 4) - 4, this._e)
                    },
                    getInt32: function() {
                        return this.view.getInt32((this._o += 4) - 4, this._e)
                    },
                    getFloat32: function() {
                        return this.view.getFloat32((this._o += 4) - 4, this._e)
                    },
                    getFloat64: function() {
                        return this.view.getFloat64((this._o += 8) - 8, this._e)
                    },
                    getStringUTF8: function(t = !0) {
                        let e, s = "";
                        for (; 0 !== (e = this.view.getUint8(this._o++));) s += String.fromCharCode(e);
                        return t ? decodeURIComponent(escape(s)) : s
                    },
                    raw: function(t = 0) {
                        const e = this.view.buffer.slice(this._o, this._o + t);
                        return this._o += t, e
                    }
                }, _.prototype = {
                    isMain: !0,
                    isPlayer: !1,
                    isSub: !1,
                    destroyed: !1,
                    id: 0,
                    diedBy: 0,
                    ox: 0,
                    x: 0,
                    nx: 0,
                    oy: 0,
                    y: 0,
                    ny: 0,
                    os: 0,
                    s: 0,
                    ns: 0,
                    nameSize: 0,
                    drawNameSize: 0,
                    color: "#FFF",
                    sColor: "#E5E5E5",
                    skin: null,
                    jagged: !1,
                    isPellet: !1,
                    born: null,
                    updated: null,
                    dead: null,
                    destroy: async function(t) {
                        delete n.options.cells.clanmates[this.id], delete n.options.cells.byId[this.id], n.options.cells.mine.remove(this.id) && 0 === n.options.cells.mine.length && ((0, m.s)(n.options.gameOptions.maxWeight, n.options.gameOptions.sec, n.options.gameOptions.foodEaten, n.options.gameOptions.topLeaderboardPosition, n.options.gameOptions.bonus), n.options.change("maxWeight", 0), n.options.change("bonus", 0)), this.destroyed = !0, this.dead = n.options.gameOptions.syncUpdStamp, t && !this.diedBy && (this.diedBy = t, this.updated = n.options.gameOptions.syncUpdStamp)
                    },
                    update: function(t) {
                        let e = (t - this.updated) / 120;
                        e = Math.max(Math.min(e, 1), 0), this.destroyed && (this.isJagged || Date.now() > this.dead + 200) ? n.options.cells.list.remove(this) : this.diedBy && n.options.cells.byId.hasOwnProperty(this.diedBy) && (this.nx = n.options.cells.byId[this.diedBy].x, this.ny = n.options.cells.byId[this.diedBy].y), this.x = this.ox + (this.nx - this.ox) * e, this.y = this.oy + (this.ny - this.oy) * e, this.s = this.os + (this.ns - this.os) * e, this.nameSize = 3 * ~~(~~Math.max(~~(.3 * this.ns), 24) / 3), this.drawNameSize = 3 * ~~(~~Math.max(~~(.3 * this.s), 24) / 3)
                    },
                    updateNumPoints: function() {
                        let t = this.s * n.options.camera.scale | 0;
                        for (t = Math.max(t, u), t = Math.min(t, v); this.points.length > t;) {
                            const t = Math.random() * this.points.length | 0;
                            this.points.splice(t, 1), this.pointsVel.splice(t, 1)
                        }
                        for (0 === this.points.length && 0 !== t && (this.points.push({
                                x: this.x,
                                y: this.y,
                                rl: this.s,
                                parent: this
                            }), this.pointsVel.push(Math.random() - .5)); this.points.length < t;) {
                            const t = Math.random() * this.points.length | 0,
                                e = this.points[t],
                                s = this.pointsVel[t];
                            this.points.splice(t, 0, {
                                x: e.x,
                                y: e.y,
                                rl: e.rl,
                                parent: this
                            }), this.pointsVel.splice(t, 0, s)
                        }
                    },
                    movePoints: function() {
                        const t = this.pointsVel.slice(),
                            e = this.points.length;
                        for (let s = 0; s < e; ++s) {
                            const n = t[(s - 1 + e) % e],
                                i = t[(s + 1) % e];
                            let o = .7 * (this.pointsVel[s] + Math.random() - .5);
                            o = Math.max(Math.min(o, 10), -10), this.pointsVel[s] = (n + i + 8 * o) / 10
                        }
                        for (let t = 0; t < e; ++t) {
                            const s = this.points[t];
                            let o = s.rl;
                            const a = this.points[(t - 1 + e) % e].rl,
                                r = this.points[(t + 1) % e].rl,
                                c = this;
                            let l = n.options.gameOptions.quadtree.some({
                                x: s.x - 5,
                                y: s.y - 5,
                                w: 10,
                                h: 10
                            }, (function(t) {
                                return t.parent !== c && (0, i.C0)(t, s) <= 25
                            }));
                            !l && (s.x < n.options.border.left || s.y < n.options.border.top || s.x > n.options.border.right || s.y > n.options.border.bottom) && (l = !0), l && (this.pointsVel[t] = Math.min(this.pointsVel[t], 0), this.pointsVel[t] -= 1), o += this.pointsVel[t], o = Math.max(o, 0), o = (9 * o + this.s) / 10, s.rl = (a + r + 8 * o) / 10;
                            const d = 2 * Math.PI * t / e,
                                h = s.rl;
                            s.x = this.x + Math.cos(d) * h, s.y = this.y + Math.sin(d) * h
                        }
                    },
                    parseName: function(t) {
                        const e = /^(?:\{([^}]*)\})?([^]*)/.exec(t = t || "");
                        return {
                            name: e[2].trim(),
                            skin: (e[1] || "").trim()
                        }
                    },
                    setName: function(t) {
                        if (null === t || this.isPellet || this.ejected) return;
                        const {
                            mainCtx: e
                        } = n.options.gameOptions, s = _.prototype.parseName(t);
                        e.font = "20px sans-serif", this.name = (0, i.gr)(e, s.name, 250, 30) || g
                    },
                    setSkin: function(t) {
                        if (t) {
                            if (this.skin = t, n.options.gameOptions.skinCache.has(this.skin)) return;
                            const e = new Image;
                            n.options.gameOptions.skinCache.set(this.skin, e);
                            const s = t.replace(/^1\%/, "").replace(/^2\%/, "").replace(/^3\%/, "") + ".png";
                            e.crossOrigin = "anonymus", e.src = (0, o.Uj)(s)
                        }
                    },
                    setColor: function(t) {
                        t ? (this.color = t, this.sColor = (0, i.Iv)(t)) : n.Y.warn("got no color")
                    },
                    setClan: function(t) {
                        if (t && t.length) {
                            this.clan = t;
                            n.options.cells.mine[0] === this.id ? n.options.cells.clan = t : n.options.cells.clan !== t || n.options.cells.clanmates[this.id] || (n.options.cells.clanmates[this.id] = !0)
                        }
                    },
                    draw: function(t) {
                        t.save(), this.drawShape(t), this.drawText(t), t.restore()
                    },
                    drawShape: function(t) {
                        this.destroyed ? t.globalAlpha = Math.max(120 - Date.now() + this.dead, 0) / 120 : t.globalAlpha = Math.min(Date.now() - this.born, 120) / 120;
                        const e = 2 * this.s,
                            s = this.s / 2;
                        if (this.isJagged) return void t.drawImage(this.image, this.x - s, this.y - s, e, e);
                        if (t.fillStyle = n.settings.gameSettings.showColor ? this.color : _.prototype.color, t.strokeStyle = n.settings.gameSettings.showColor ? this.sColor : _.prototype.sColor, t.lineWidth = Math.max(~~(this.s / 50), 10), this.isPellet || (this.s -= t.lineWidth / 2), t.beginPath(), n.settings.gameSettings.jellyPhysics && this.points.length) {
                            const e = this.points[0];
                            t.moveTo(e.x, e.y);
                            for (let e = 0; e < this.points.length; ++e) {
                                const s = this.points[e];
                                t.lineTo(s.x, s.y)
                            }
                        } else this.isJagged || t.arc(this.x, this.y, this.s, 0, f, !1);
                        t.closePath();
                        const i = n.options.gameOptions.skinCache.get(this.skin);
                        n.settings.gameSettings.showSkins && this.skin && i && i.complete && i.width && i.height ? (n.settings.gameSettings.fillSkin && t.fill(), t.save(), t.clip(), t.drawImage(i, this.x - this.s, this.y - this.s, e, e), t.restore()) : t.fill(), this.isPellet || (t.stroke(), this.s += t.lineWidth / 2)
                    },
                    drawText: function(t) {
                        if (this.isPellet || this.isJagged) return;
                        let e = this.y;
                        if (this.name && n.settings.gameSettings.showNames && ((0, r.sH)(t, !1, this.x, this.y, this.nameSize, this.drawNameSize, this.name, this.isSub), e += Math.max(this.s / 4.5, this.nameSize / 1.5)), n.settings.gameSettings.showMass && (-1 !== n.options.cells.mine.indexOf(this.id) || 0 === n.options.cells.mine.length)) {
                            const s = (~~(this.s * this.s / 100)).toString();
                            (0, r.sH)(t, !0, this.x, e, this.nameSize / 2, this.drawNameSize / 2, s, this.isSub)
                        }
                    }
                }
            }
        },
        e = {};

    function s(n) {
        var i = e[n];
        if (void 0 !== i) return i.exports;
        var o = e[n] = {
            exports: {}
        };
        return t[n](o, o.exports, s), o.exports
    }
    s.d = (t, e) => {
        for (var n in e) s.o(e, n) && !s.o(t, n) && Object.defineProperty(t, n, {
            enumerable: !0,
            get: e[n]
        })
    }, s.o = (t, e) => Object.prototype.hasOwnProperty.call(t, e), s.r = t => {
        "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(t, Symbol.toStringTag, {
            value: "Module"
        }), Object.defineProperty(t, "__esModule", {
            value: !0
        })
    }, (() => {
        var t = s(427),
            e = s(352);
        window.CAPTCHA2, window.CAPTCHA3, window.TURNSTILE;

        function n(t) {
            return document.getElementById(t) || {}
        }
        n("shop").hide(), n("gameloading").hide(), setTimeout((() => {
            ["reward-booster", "sigma_contais", "gameloading", "needtobeloggined", "connecting", "errormodal", "goldmodal", "particlesalert", "chest-content", "chest-results", "chest-total", "reward-coins", "free-coins", "sigma-pass", "clan-assign", "clan", "clans", "clan-leave-modal", "modalfolks", "payments-modal"].forEach((t => n(t)?.classList?.remove("hide")))
        }), 1e3);

        function i(t) {
            o(), t.currentTarget.removeEventListener(t.type, i)
        }

        function o() {
            ! function(t) {
                if (window.googleDidInit) return !1;
                window.googleDidInit = !0;
                const e = document.createElement("script");
                e.type = "text/javascript", e.async = !0, e.onload = () => {
                    t && t()
                }, e.src = "https://accounts.google.com/gsi/client", document.head.appendChild(e)
            }((() => {
                ! function(t) {
                    if (window.gtmDidInit) return !1;
                    window.gtmDidInit = !0;
                    const e = document.createElement("script");
                    e.type = "text/javascript", e.async = !0, e.onload = () => {
                        window.dataLayer = window.dataLayer || [], window.dataLayer.push({
                            event: "gtm.js",
                            "gtm.start": (new Date).getTime(),
                            "gtm.uniqueEventId": 0
                        }), "function" == typeof t && t()
                    }, e.src = "https://www.googletagmanager.com/gtm.js?id=GTM-WV7SCVB", document.head.appendChild(e)
                }(a),
                function() {
                    if (window.anlDidInit) return !1;
                    window.anlDidInit = !0;
                    const t = document.createElement("script");
                    t.type = "text/javascript", t.async = !0, t.onload = () => {
                        function t() {
                            window.dataLayer = window.dataLayer || [], dataLayer.push(arguments)
                        }
                        t("js", new Date), t("config", "G-D108VD6936")
                    }, t.src = "https://www.googletagmanager.com/gtag/js?id=G-D108VD6936", document.head.appendChild(t)
                }(),
                function() {
                    e.settings.preload(window.preload);
                    const s = {
                        client_id: window.OAUTH,
                        cookiepolicy: "single_host_origin",
                        prompt: "select_account",
                        callback: t.Cw
                    };
                    window.isDev && (s.plugin_name = "dev server"), google.accounts.id.initialize(s), google.accounts.id.renderButton(document.getElementById("signInWrap"), {
                        theme: "outline",
                        size: "large",
                        width: 269
                    }), (0, t._4)()
                }(),
                function(t, e) {
                    const s = document.createElement("link");
                    s.rel = "stylesheet", s.href = t ? `${window.siteName}/assets/css/min/${t}.css` : e, s.type = "text/css", document.querySelector("head").appendChild(s)
                }("shop")
            }))
        }

        function a() {
            if (window.adsDidInit) return !1;
            window.adsDidInit = !0;
            const t = document.createElement("script");
            t.type = "text/javascript", t.async = !0, t.onload = () => {
                setTimeout((() => function() {
                    function t() {
                        setTimeout((() => {
                            googletag.cmd.push((function() {
                                googletag.display(window.adSlot1)
                            }))
                        })), setTimeout((() => {
                            googletag.cmd.push((function() {
                                googletag.display(window.adSlot2)
                            }))
                        })), setTimeout((() => {
                            googletag.cmd.push((function() {
                                googletag.display(window.adSlot3)
                            }))
                        }))
                    }
                    window.googletag = window.googletag || {
                        cmd: []
                    }, googletag.cmd.push((function() {
                        window.adSlot1 = googletag.defineSlot("/21727042/sigmally-main-1", [300, 250], "div-gpt-ad-1622632389350-0").addService(googletag.pubads()), window.adSlot2 = googletag.defineSlot("/21727042/sigmally-main-3", [300, 250], "div-gpt-ad-1622841396282-0").addService(googletag.pubads()), window.adSlot3 = googletag.defineSlot("/21727042/sigmally-main-4", [728, 90], "div-gpt-ad-1622841482467-0").addService(googletag.pubads()), window.adSlot4 = googletag.defineSlot("/21727042/sigmally-final-1", [300, 250], "div-gpt-ad-1622635433462-0").addService(googletag.pubads()), window.adSlot5 = googletag.defineSlot("/21727042/sigmally-final-2", [160, 600], "div-gpt-ad-1622636498971-0").addService(googletag.pubads()), window.adSlot6 = googletag.defineSlot("/21727042/sigmally-final-3", [160, 600], "div-gpt-ad-1622636569591-0").addService(googletag.pubads()), googletag.pubads().enableSingleRequest(), googletag.enableServices(), t()
                    }))
                }()), 10)
            }, t.src = "https://securepubads.g.doubleclick.net/tag/js/gpt.js", document.head.appendChild(t)
        }
        window.addEventListener("DOMContentLoaded", (() => {
            function t(s) {
                e(), s.currentTarget.removeEventListener(s.type, t)
            }

            function e() {
                if (window.recaptchaDidInit) return !1;
                window.recaptchaDidInit = !0,
                    function() {
                        const t = document.createElement("script");
                        t.src = "https://challenges.cloudflare.com/turnstile/v0/api.js", t.async = !0, t.onload = () => {
                            const {
                                init: t
                            } = s(732);
                            t()
                        }, document.head.appendChild(t)
                    }()
            }
            document.addEventListener("DOMContentLoaded", (() => {
                setTimeout(e, 10)
            })), document.addEventListener("scroll", t), document.addEventListener("mousemove", t), document.addEventListener("touchstart", t)
        })), document.addEventListener("DOMContentLoaded", (() => {
            setTimeout(o, 6e3)
        })), document.addEventListener("scroll", i), document.addEventListener("mousemove", i), document.addEventListener("touchstart", i)
    })()
})();