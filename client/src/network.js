    class PacketReader {
        constructor(buffer) {
            if (buffer instanceof DataView) this.view = buffer;
            else if (ArrayBuffer.isView(buffer)) {
                this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            } else this.view = new DataView(buffer);
            this.offset = 0;
        }
        ensure(size) {
            if (!Number.isSafeInteger(size) || size < 0 || this.offset + size > this.view.byteLength) {
                throw new RangeError('Packet is truncated');
            }
        }
        uint8() {
            this.ensure(1);
            return this.view.getUint8(this.offset++);
        }
        uint16LE() {
            this.ensure(2);
            const value = this.view.getUint16(this.offset, true);
            this.offset += 2;
            return value;
        }
        uint32LE() {
            this.ensure(4);
            const value = this.view.getUint32(this.offset, true);
            this.offset += 4;
            return value;
        }
        int16LE() {
            this.ensure(2);
            const value = this.view.getInt16(this.offset, true);
            this.offset += 2;
            return value;
        }
        int32LE() {
            this.ensure(4);
            const value = this.view.getInt32(this.offset, true);
            this.offset += 4;
            return value;
        }
        float32LE() {
            this.ensure(4);
            const value = this.view.getFloat32(this.offset, true);
            this.offset += 4;
            return value;
        }
        bytes(size) {
            this.ensure(size);
            const value = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, size);
            this.offset += size;
            return value;
        }
        float64LE() {
            this.ensure(8);
            const value = this.view.getFloat64(this.offset, true);
            this.offset += 8;
            return value;
        }
        utf8z(maxBytes = this.remaining) {
            const start = this.offset;
            const end = Math.min(this.view.byteLength, start + maxBytes);
            while (this.offset < end && this.view.getUint8(this.offset) !== 0) this.offset += 1;
            if (this.offset >= end) throw new RangeError('Missing string terminator');
            const value = decoder.decode(new Uint8Array(this.view.buffer, this.view.byteOffset + start, this.offset - start));
            this.offset += 1;
            return value;
        }
        skip(size) {
            this.ensure(size);
            this.offset += size;
        }
        get remaining() {
            return this.view.byteLength - this.offset;
        }
    }
    class PacketWriter {
        constructor(size) {
            this.view = new DataView(new ArrayBuffer(size));
            this.offset = 0;
        }
        ensure(size) {
            if (!Number.isSafeInteger(size) || size < 0 || this.offset + size > this.view.byteLength) {
                throw new RangeError('Packet writer overflow');
            }
        }
        uint8(value) {
            this.ensure(1);
            this.view.setUint8(this.offset++, value);
            return this;
        }
        int32LE(value) {
            this.ensure(4);
            this.view.setInt32(this.offset, value, true);
            this.offset += 4;
            return this;
        }
        uint32LE(value) {
            this.ensure(4);
            this.view.setUint32(this.offset, value, true);
            this.offset += 4;
            return this;
        }
        bytes(value) {
            const bytes = ArrayBuffer.isView(value)
                ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
                : value instanceof ArrayBuffer
                  ? new Uint8Array(value)
                  : Uint8Array.from(value);
            this.ensure(bytes.byteLength);
            new Uint8Array(this.view.buffer, this.offset, bytes.byteLength).set(bytes);
            this.offset += bytes.byteLength;
            return this;
        }
        utf8z(value) {
            const bytes = encoder.encode(String(value));
            return this.bytes(bytes).uint8(0);
        }
        buffer() {
            return this.view.buffer.slice(0, this.offset);
        }
    }
    class OpcodeMap {
        constructor() {
            this.outgoing = new Uint8Array(256);
            this.incoming = new Uint8Array(256);
            this.ready = false;
        }
        accept(permutation) {
            if (permutation.length !== 256) throw new RangeError('Invalid opcode map');
            const values = Array.from(permutation);
            if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255) || new Set(values).size !== 256) {
                throw new RangeError('Opcode map is not a permutation');
            }
            this.outgoing.set(permutation);
            for (let index = 0; index < permutation.length; index += 1) {
                this.incoming[permutation[index]] = index;
            }
            this.ready = true;
        }
        encode(opcode) {
            if (!this.ready) throw new Error('Opcode map is not ready');
            if (!Number.isInteger(opcode) || opcode < 0 || opcode > 255) throw new RangeError('Invalid opcode');
            return this.outgoing[opcode];
        }
        decode(opcode) {
            if (!this.ready) throw new Error('Opcode map is not ready');
            if (!Number.isInteger(opcode) || opcode < 0 || opcode > 255) throw new RangeError('Invalid opcode');
            return this.incoming[opcode];
        }
        reset() {
            this.outgoing.fill(0);
            this.incoming.fill(0);
            this.ready = false;
        }
    }
    class HostAdapter extends Emitter {
        constructor(kind, resources, logger) {
            super();
            this.kind = kind;
            this.resources = resources;
            this.logger = logger;
        }
        isReady() {
            return false;
        }
        snapshot() {
            return {
                connected: false,
                playing: false,
                selectedView: null,
                position: null,
                score: 0,
                ownedCount: 0,
                border: null,
                latency: null,
                playerCount: null,
            };
        }
        sendPlay() {
            return false;
        }
        sendChat() {
            return false;
        }
        sendMove() {
            return false;
        }
        sendAction() {
            return false;
        }
        setMovementOverride() {}
        start() {}
        destroy() {
            this.resources.dispose();
            this.clear();
        }
    }
    class LeaderboardTracker {
        constructor(emit) {
            this.emit = emit;
            this.top10StartedAt = null;
            this.firstStartedAt = null;
        }
        finishTimer(property, key, now) {
            const startedAt = this[property];
            if (startedAt === null) return;
            this[property] = null;
            this.emit('leaderboard-time', {
                top10: 0,
                first: 0,
                [key]: Math.floor((now - startedAt) / 1_000),
            });
        }
        finish(now = Date.now()) {
            this.finishTimer('top10StartedAt', 'top10', now);
            this.finishTimer('firstStartedAt', 'first', now);
        }
        recordPosition(position) {
            const now = Date.now();
            const inTop10 = position !== null && position <= 10;
            if (inTop10) {
                if (this.top10StartedAt === null) this.top10StartedAt = now;
            } else {
                this.finishTimer('top10StartedAt', 'top10', now);
            }
            if (position === 1) {
                if (this.firstStartedAt === null) this.firstStartedAt = now;
            } else {
                this.finishTimer('firstStartedAt', 'first', now);
            }
            this.emit('leaderboard-position', { position, inTop10 });
        }
        decodePosition(reader) {
            const count = reader.uint32LE();
            let position = null;
            for (let index = 0; index < count && index < 1_000; index += 1) {
                const isPlayer = Boolean(reader.uint32LE());
                reader.utf8z();
                const entryPosition = reader.uint32LE();
                reader.uint32LE();
                if (isPlayer) position = entryPosition;
            }
            this.recordPosition(position);
        }
        decodeText(reader) {
            const entries = [];
            const count = reader.uint32LE();
            for (let index = 0; index < count && index < 1_000; index += 1) {
                entries.push(reader.utf8z());
            }
            this.emit('leaderboard-text', entries);
        }
    }
    const readWorldBorder = (reader) => {
        const left = reader.float64LE();
        const top = reader.float64LE();
        const right = reader.float64LE();
        const bottom = reader.float64LE();
        return {
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
        };
    };
    const readChatMessage = (reader) => {
        reader.skip(1);
        const red = reader.uint8();
        const green = reader.uint8();
        const blue = reader.uint8();
        const name = reader.utf8z();
        const message = reader.utf8z();
        const color = `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
        return { name: name.trim() || 'Unnamed', message, color };
    };
    class NativeProtocol extends Emitter {
        constructor(socket, resources, logger) {
            super();
            this.socket = socket;
            this.resources = resources;
            this.logger = logger;
            this.opcodes = new OpcodeMap();
            this.owned = new Set();
            this.cells = new Map();
            this.border = null;
            this.latency = null;
            this.playerCount = null;
            this.statsPingStarted = null;
            this.movementOverride = null;
            this.killedPlayers = new Set();
            this.leaderboard = new LeaderboardTracker((type, payload) => this.emit(type, payload));
            this.rawSend = socket.send.bind(socket);
            this.snapshotCache = null;
            this.snapshotDirty = true;
            const protocol = this;
            const sendFacade = function (data) {
                if (!protocol.movementOverride || !protocol.isMovementPacket(data)) {
                    return protocol.rawSend(data);
                }
                const { x, y } = protocol.movementOverride;
                return protocol.rawSend(protocol.createMovePacket(x, y));
            };
            resources.patch(socket, 'send', sendFacade);
            resources.listen(socket, 'open', () => this.emit('open'));
            resources.listen(socket, 'close', (event) => {
                this.owned.clear();
                this.cells.clear();
                this.killedPlayers.clear();
                this.snapshotCache = null;
                this.snapshotDirty = true;
                this.leaderboard.finish();
                this.emit('close', event);
            });
            resources.listen(socket, 'error', (event) => this.emit('error', event));
            resources.listen(socket, 'message', (event) => this.handleMessage(event));
        }
        get connected() {
            return this.socket.readyState === WebSocket.OPEN;
        }
        invalidateSnapshot() {
            this.snapshotDirty = true;
        }
        sendPlay(data) {
            if (!this.canSend()) return false;
            const payload = encoder.encode(JSON.stringify(data));
            const packet = new PacketWriter(payload.byteLength + 2)
                .uint8(this.opcodes.encode(OPCODE.play))
                .bytes(payload)
                .uint8(0)
                .buffer();
            return this.send(packet);
        }
        sendChat(message) {
            if (!this.canSend()) return false;
            const payload = encoder.encode(String(message));
            const packet = new PacketWriter(payload.byteLength + 3)
                .uint8(this.opcodes.encode(OPCODE.chat))
                .uint8(0)
                .bytes(payload)
                .uint8(0)
                .buffer();
            return this.send(packet);
        }
        sendMove(x, y) {
            if (!this.canSend()) return false;
            const target = this.movementOverride ?? { x, y };
            return this.send(this.createMovePacket(target.x, target.y));
        }
        createMovePacket(x, y) {
            const int32 = (value) => clamp(Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0, -0x80000000, 0x7fffffff);
            return new PacketWriter(13).uint8(this.opcodes.encode(OPCODE.move)).int32LE(int32(x)).int32LE(int32(y)).uint32LE(0).buffer();
        }
        isMovementPacket(data) {
            if (!this.opcodes.ready) return false;
            try {
                const reader = new PacketReader(data);
                return reader.remaining === 13 && reader.uint8() === this.opcodes.encode(OPCODE.move);
            } catch {
                return false;
            }
        }
        setMovementOverride(position) {
            this.movementOverride = position;
        }
        sendAction(action) {
            if (!this.canSend()) return false;
            const opcode = {
                split: OPCODE.split,
                eject: OPCODE.eject,
                qDown: OPCODE.qDown,
                qUp: OPCODE.qUp,
            }[action];
            if (opcode === undefined) return false;
            return this.send(Uint8Array.of(this.opcodes.encode(opcode)));
        }
        sendStatsPing() {
            if (!this.canSend()) return false;
            this.statsPingStarted = performance.now();
            return this.send(Uint8Array.of(this.opcodes.encode(OPCODE.stats)));
        }
        send(packet) {
            if (!this.canSend()) return false;
            try {
                this.rawSend(packet);
                return true;
            } catch (error) {
                this.logger.warnOnce('native-send', 'Unable to send a game packet', error);
                return false;
            }
        }
        canSend() {
            return this.opcodes.ready && this.connected;
        }
        handleMessage(event) {
            if (!(event.data instanceof ArrayBuffer)) return;
            try {
                const reader = new PacketReader(event.data);
                if (!this.opcodes.ready) {
                    this.acceptHandshake(reader);
                    return;
                }
                const opcode = this.opcodes.decode(reader.uint8());
                this.emit('packet', { opcode, buffer: event.data });
                this.decode(opcode, reader);
            } catch (error) {
                this.logger.warnOnce(`native-packet-${event.data.byteLength}`, 'Unable to inspect a game packet', error);
            }
        }
        acceptHandshake(reader) {
            const protocol = reader.utf8z(64);
            if (protocol !== 'SIG 0.0.1' || reader.remaining !== 256) {
                throw new RangeError('Invalid Sigmally handshake');
            }
            const permutation = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, reader.remaining);
            this.opcodes.accept(permutation);
            this.emit('handshake');
        }
        decode(opcode, reader) {
            switch (opcode) {
                case OPCODE.ownedCell: {
                    const id = reader.uint32LE();
                    const wasPlaying = this.owned.size > 0;
                    this.owned.add(id);
                    this.snapshotDirty = true;
                    this.emit('owned-cell', { id, split: wasPlaying });
                    this.emit('play-state', true);
                    break;
                }
                case 0x14:
                    this.owned.clear();
                    this.snapshotDirty = true;
                    this.resetMatchTracking();
                    this.emit('play-state', false);
                    break;
                case 0x12:
                    this.emit('world', this.worldSnapshot());
                    break;
                case OPCODE.border:
                    this.decodeBorder(reader);
                    break;
                case OPCODE.chat:
                    this.decodeChat(reader);
                    break;
                case OPCODE.leaderboardText:
                    this.leaderboard.decodeText(reader);
                    break;
                case OPCODE.leaderboardFfa:
                    this.leaderboard.decodePosition(reader);
                    break;
                case OPCODE.move:
                    this.decodeWorld(reader);
                    break;
                case OPCODE.passwordRequired:
                    this.emit('password-required');
                    break;
                case OPCODE.stats:
                    this.decodeStats(reader);
                    break;
            }
        }
        resetMatchTracking() {
            this.killedPlayers.clear();
            this.leaderboard.finish();
        }
        decodeWorld(reader) {
            const killCount = reader.uint16LE();
            if (killCount > 10_000 || killCount * 8 > reader.remaining) {
                throw new RangeError('Invalid world kill count');
            }
            for (let index = 0; index < killCount; index += 1) {
                const killerId = reader.uint32LE();
                const killedId = reader.uint32LE();
                this.trackKill(killerId, killedId);
                this.cells.delete(killedId);
                this.owned.delete(killedId);
            }
            let cellCount = 0;
            while (true) {
                const id = reader.uint32LE();
                if (id === 0) break;
                if (++cellCount > 100_000) throw new RangeError('Invalid world cell count');
                const x = reader.int16LE();
                const y = reader.int16LE();
                const radius = reader.uint16LE();
                const flags = reader.uint8();
                reader.skip(3);
                const clan = reader.utf8z();
                const existing = this.cells.get(id);
                let color = existing?.color ?? null;
                let skin = existing?.skin ?? '';
                let name = existing?.name ?? '';
                if (flags & 0x02) color = [reader.uint8(), reader.uint8(), reader.uint8()];
                if (flags & 0x04) skin = reader.utf8z();
                if (flags & 0x08) name = reader.utf8z();
                const eject = Boolean(flags & 0x20);
                const pellet = radius <= 40 && !eject;
                this.cells.set(id, {
                    id,
                    x,
                    y,
                    radius,
                    flags,
                    clan,
                    color,
                    skin,
                    name,
                    eject,
                    pellet,
                });
            }
            const deleteCount = reader.uint16LE();
            if (deleteCount > 100_000 || deleteCount * 4 > reader.remaining) {
                throw new RangeError('Invalid world delete count');
            }
            for (let index = 0; index < deleteCount; index += 1) {
                const id = reader.uint32LE();
                this.cells.delete(id);
                this.owned.delete(id);
            }
            this.snapshotDirty = true;
            const snapshot = this.worldSnapshot();
            this.emit('world-update', snapshot);
            this.emit('world', snapshot);
            if (!snapshot.playing) this.emit('play-state', false);
        }
        trackKill(killerId, killedId) {
            if (!this.owned.has(killerId)) return;
            const killedCell = this.cells.get(killedId);
            if (!killedCell || killedCell.eject || killedCell.pellet) return;
            if (this.owned.has(killedId)) return;
            const playerName = killedCell.name;
            if (!playerName || this.killedPlayers.has(playerName)) return;
            this.killedPlayers.add(playerName);
            this.emit('kill', { name: playerName });
        }
        worldSnapshot() {
            if (!this.snapshotDirty && this.snapshotCache)
                return {
                    ...this.snapshotCache,
                    position: this.snapshotCache.position ? { ...this.snapshotCache.position } : null,
                };
            let score = 0;
            let x = 0;
            let y = 0;
            let count = 0;
            for (const id of this.owned) {
                const cell = this.cells.get(id);
                if (!cell || cell.pellet || cell.eject) continue;
                score += (cell.radius * cell.radius) / 100;
                x += cell.x;
                y += cell.y;
                count += 1;
            }
            this.snapshotCache = {
                playing: count > 0,
                position: count ? { x: x / count, y: y / count } : null,
                score,
                ownedCount: count,
            };
            this.snapshotDirty = false;
            return {
                ...this.snapshotCache,
                position: this.snapshotCache.position ? { ...this.snapshotCache.position } : null,
            };
        }
        decodeBorder(reader) {
            this.border = readWorldBorder(reader);
            this.emit('border', this.border);
        }
        decodeChat(reader) {
            this.emit('chat', readChatMessage(reader));
        }
        decodeStats(reader) {
            const stats = JSON.parse(reader.utf8z(10_000));
            if (Number.isFinite(stats.playing)) this.playerCount = stats.playing;
            if (this.statsPingStarted !== null) {
                this.latency = performance.now() - this.statsPingStarted;
                this.statsPingStarted = null;
            }
            this.emit('stats', { ...stats, latency: this.latency });
        }
        destroy() {
            this.owned.clear();
            this.cells.clear();
            this.snapshotCache = null;
            this.snapshotDirty = true;
            this.resources.dispose();
            this.clear();
        }
    }

    class SigWsHandler {
        constructor() {
            this.handleMessage = this.handleMessage.bind(this);
            this.sendPacket = this.sendPacket.bind(this);
        }
        sendPacket() {}
        handleMessage(event) {
            SigWsHandler.consumer?.(event?.data);
        }
    }
    SigWsHandler.consumer = null;
    class NativeHostAdapter extends HostAdapter {
        constructor(resources, logger) {
            super('native', resources, logger);
            this.socket = null;
            this.protocol = null;
            this.originalWebSocket = window.WebSocket;
            this.seenSockets = new WeakSet();
            this.socketGeneration = 0;
            this.captureGameSockets = true;
            this.started = false;
        }
        start() {
            if (this.started) return;
            this.started = true;
            const adapter = this;
            const NativeWebSocket = this.originalWebSocket;
            const WebSocketObserver = new Proxy(NativeWebSocket, {
                construct(target, args, newTarget) {
                    if (adapter.isSigFixProbe(args[0])) new SigWsHandler();
                    const socket = Reflect.construct(target, args, newTarget);
                    if (adapter.captureGameSockets && adapter.isGameSocketUrl(args[0])) adapter.attach(socket);
                    return socket;
                },
            });
            this.resources.patch(window, 'WebSocket', WebSocketObserver);
        }
        isGameSocketUrl(value) {
            if (typeof value !== 'string' && !(value instanceof URL)) return false;
            try {
                const url = new URL(String(value), location.href);
                return (
                    ['ws:', 'wss:'].includes(url.protocol) && (url.hostname === 'sigmally.com' || url.hostname.endsWith('.sigmally.com'))
                );
            } catch {
                return false;
            }
        }
        isSigFixProbe(value) {
            if (value === 'wss://255.255.255.255/sigmally.com?sigfix') return true;
            if (!isObject(value) || typeof value.includes !== 'function') return false;
            try {
                return value.includes('sigmally.com') === false && String(value).includes('255.255.255.255/sigmally.com?sigfix');
            } catch {
                return false;
            }
        }
        attach(socket) {
            if (this.seenSockets.has(socket)) return;
            this.seenSockets.add(socket);
            this.protocol?.destroy();
            this.socket = socket;
            const generation = ++this.socketGeneration;
            const scope = this.resources.child(`socket-${generation}`);
            this.protocol = new NativeProtocol(socket, scope, this.logger);
            for (const type of [
                'open',
                'close',
                'error',
                'packet',
                'owned-cell',
                'play-state',
                'border',
                'chat',
                'leaderboard',
                'leaderboard-position',
                'leaderboard-time',
                'leaderboard-text',
                'kill',
                'world-update',
                'password-required',
                'stats'
            ]) {
                scope.add(
                    this.protocol.on(type, (payload) => {
                        if (generation === this.socketGeneration && this.captureGameSockets) this.emit(type, payload);
                    })
                );
            }
            this.emit('socket', socket);
        }
        stopGameCapture() {
            this.captureGameSockets = false;
            this.protocol?.destroy();
            this.protocol = null;
            this.socket = null;
        }
        isReady() {
            return Boolean(this.protocol?.opcodes.ready && this.protocol.connected);
        }
        snapshot() {
            const world = this.protocol?.worldSnapshot() ?? {
                playing: false,
                position: null,
                score: 0,
                ownedCount: 0,
            };
            return {
                connected: this.protocol?.connected ?? false,
                playing: world.playing,
                selectedView: null,
                position: world.position,
                score: world.score,
                ownedCount: world.ownedCount,
                border: this.protocol?.border ?? null,
                latency: this.protocol?.latency ?? null,
                playerCount: this.protocol?.playerCount ?? null,
            };
        }
        sendPlay(data) {
            return this.protocol?.sendPlay(data) ?? false;
        }
        sendChat(message) {
            return this.protocol?.sendChat(message) ?? false;
        }
        sendMove(x, y) {
            return this.protocol?.sendMove(x, y) ?? false;
        }
        sendAction(action) {
            return this.protocol?.sendAction(action) ?? false;
        }
        sendStatsPing() {
            return this.protocol?.sendStatsPing() ?? false;
        }
        setMovementOverride(position) {
            this.protocol?.setMovementOverride(position);
        }
    }
    class SigFixHostAdapter extends HostAdapter {
        constructor(resources, logger, api) {
            super('sigfix', resources, logger);
            this.api = api;
            this.movementOverride = null;
            this.bridgeConsumer = (data) => this.handleBridgedPacket(data);
            this.leaderboard = new LeaderboardTracker((type, payload) => this.emit(type, payload));
            this.killedPlayers = new Set();
            this.lastOwnedCount = 0;
            this.snapshotCache = null;
            this.snapshotDirty = true;
        }
        isReady() {
            if (!HostResolver.isSigFixApi(this.api)) return false;
            const connection = this.api.net.connections.get(this.api.world.selected);
            return Boolean(connection?.handshake && connection?.ws?.readyState === WebSocket.OPEN);
        }
        invalidateSnapshot() {
            this.snapshotDirty = true;
        }
        start() {
            const adapter = this;
            const originalMove = this.api.net.move;
            const moveFacade = function (view, x, y) {
                if (adapter.movementOverride && view === adapter.api.world.selected) {
                    return originalMove.call(this, view, adapter.movementOverride.x, adapter.movementOverride.y);
                }
                return originalMove.call(this, view, x, y);
            };
            this.resources.patch(this.api.net, 'move', moveFacade);
            this.lastOwnedCount = this.snapshot().ownedCount;
            // New SigFixes versions can deliver decoded packets directly. Older versions
            // continue to use the SigWsHandler probe below until they migrate.
            if (typeof this.api.net.subscribePackets === 'function') {
                let active = true;
                try {
                    const unsubscribe = this.api.net.subscribePackets((data) => {
                        if (active) this.bridgeConsumer(data);
                    });
                    if (typeof unsubscribe === 'function') {
                        this.resources.add(() => {
                            active = false;
                            unsubscribe();
                        });
                        return;
                    }
                    active = false;
                    this.logger.warnOnce('sigfix-packet-subscription', 'SigFixes packet subscription did not return cleanup');
                } catch (error) {
                    active = false;
                    this.logger.warnOnce('sigfix-packet-subscription', 'SigFixes packet subscription failed', error);
                }
            }
            SigWsHandler.consumer = this.bridgeConsumer;
            this.resources.add(() => {
                if (SigWsHandler.consumer === this.bridgeConsumer) SigWsHandler.consumer = null;
            });
        }
        handleBridgedPacket(data) {
            if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return;
            try {
                const reader = new PacketReader(data);
                const opcode = reader.uint8();
                const packet = { opcode, buffer: data };
                this.emit('packet', packet);
                switch (opcode) {
                    case OPCODE.move:
                        this.invalidateSnapshot();
                        this.decodeBridgeWorld(reader);
                        break;
                    case OPCODE.ownedCell: {
                        this.invalidateSnapshot();
                        const id = reader.uint32LE();
                        const snapshot = this.snapshot();
                        const split = this.lastOwnedCount > 0 && snapshot.ownedCount > this.lastOwnedCount;
                        this.emit('owned-cell', { id, split });
                        this.emit('play-state', snapshot.playing);
                        this.lastOwnedCount = snapshot.ownedCount;
                        break;
                    }
                    case 0x14:
                        this.invalidateSnapshot();
                        this.killedPlayers.clear();
                        this.lastOwnedCount = 0;
                        this.leaderboard.finish();
                        this.emit('play-state', false);
                        break;
                    case OPCODE.border:
                        this.invalidateSnapshot();
                        this.emit('border', readWorldBorder(reader));
                        break;
                    case OPCODE.chat:
                        this.emit('chat', readChatMessage(reader));
                        break;
                    case OPCODE.leaderboardText:
                        this.leaderboard.decodeText(reader);
                        break;
                    case OPCODE.leaderboardFfa: {
                        this.emit('leaderboard', this.remainingBuffer(reader));
                        this.leaderboard.decodePosition(reader);
                        break;
                    }
                    case OPCODE.passwordRequired:
                        this.emit('password-required');
                        break;
                    case OPCODE.stats: {
                        this.invalidateSnapshot();
                        const stats = JSON.parse(reader.utf8z(10_000));
                        const snapshot = this.snapshot();
                        if (Number.isFinite(snapshot.latency) && snapshot.latency >= 0) {
                            stats.latency = snapshot.latency;
                        }
                        this.emit('stats', stats);
                        break;
                    }
                }
            } catch (error) {
                this.logger.warnOnce('sigfix-packet-bridge', 'Unable to inspect a SigFix packet', error);
            }
        }
        ownedIds() {
            const ids = new Set();
            for (const vision of this.api.world.views.values()) {
                const owned = vision?.owned;
                if (!owned) continue;
                for (const id of owned) ids.add(id);
            }
            return ids;
        }
        ownedHashes(ownedIds = this.ownedIds()) {
            const hashes = new Set();
            for (const id of ownedIds) {
                const hash = this.api.world.cells.get(id)?.hash;
                if (hash !== undefined && hash !== null) hashes.add(hash);
            }
            return hashes;
        }
        cellPosition(view, cell) {
            const legacyFrame = cell?.views?.get?.(view)?.frames?.[0];
            const x = Number(cell?.merged?.nx ?? legacyFrame?.nx ?? cell?.tx);
            const y = Number(cell?.merged?.ny ?? legacyFrame?.ny ?? cell?.ty);
            return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
        }
        averageOwnedPosition(view, owned) {
            let x = 0;
            let y = 0;
            let count = 0;
            for (const id of owned ?? []) {
                const cell = this.api.world.cells.get(id);
                if (!cell) continue;
                const position = this.cellPosition(view, cell);
                if (!position) continue;
                x += position.x;
                y += position.y;
                count += 1;
            }
            return count ? { x: x / count, y: y / count } : null;
        }
        decodeBridgeWorld(reader) {
            const killCount = reader.uint16LE();
            if (killCount > 10_000 || killCount * 8 > reader.remaining) throw new RangeError('Invalid SigFix world kill count');
            let ownedIds = null;
            let ownedHashes = null;
            if (killCount > 0) {
                ownedIds = this.ownedIds();
                ownedHashes = this.ownedHashes(ownedIds);
            }
            for (let index = 0; index < killCount; index += 1) {
                const killerId = reader.uint32LE();
                const killedId = reader.uint32LE();
                if (!ownedIds?.has(killerId)) continue;
                if (this.api.world.pellets?.has?.(killedId)) continue;
                const killedCell = this.api.world.cells.get(killedId);
                if (!killedCell) continue;
                if (killedCell.hash !== undefined && killedCell.hash !== null && ownedHashes?.has(killedCell.hash)) {
                    continue;
                }
                const playerName = String(killedCell.name ?? '').trim();
                if (!playerName || this.killedPlayers.has(playerName)) continue;
                this.killedPlayers.add(playerName);
                this.emit('kill', { name: playerName });
            }
            const snapshot = this.snapshot();
            this.lastOwnedCount = snapshot.ownedCount;
            this.emit('world-update', snapshot);
            this.emit('world', snapshot);
            if (!snapshot.playing) this.emit('play-state', false);
        }
        remainingBuffer(reader) {
            const start = reader.view.byteOffset + reader.offset;
            const end = reader.view.byteOffset + reader.view.byteLength;
            return reader.view.buffer.slice(start, end);
        }
        snapshot() {
            const { world, net } = this.api;
            const selected = world.selected;
            if (!this.snapshotDirty && this.snapshotCache && this.snapshotCache.selectedView === selected) {
                const vision = world.views.get(selected);
                const connection = net.connections.get(selected);
                this.snapshotCache.connected = Boolean(connection?.handshake && connection?.ws?.readyState === WebSocket.OPEN);
                this.snapshotCache.position = this.averageOwnedPosition(selected, vision?.owned);
                return {
                    ...this.snapshotCache,
                    playing: vision ? this.snapshotCache.playing : false,
                    position: this.snapshotCache.position ? { ...this.snapshotCache.position } : null,
                    border: this.snapshotCache.border ? { ...this.snapshotCache.border } : null,
                };
            }
            const vision = world.views.get(selected);
            const owned = vision?.owned ?? [];
            const connection = net.connections.get(selected);
            let totalOwned = 0;
            let totalScore = 0;
            for (const [viewId, otherVision] of world.views) {
                const otherOwned = otherVision?.owned;
                totalOwned += Array.isArray(otherOwned) ? otherOwned.length : (otherOwned?.size ?? 0);
                const viewScore = Number(world.score(viewId));
                if (Number.isFinite(viewScore) && viewScore > 0) totalScore += viewScore;
            }
            const position = this.averageOwnedPosition(selected, owned);
            const border = vision?.border
                ? {
                      left: vision.border.l,
                      top: vision.border.t,
                      right: vision.border.r,
                      bottom: vision.border.b,
                      width: vision.border.r - vision.border.l,
                      height: vision.border.b - vision.border.t,
                  }
                : null;
            this.snapshotCache = {
                connected: Boolean(connection?.handshake && connection?.ws?.readyState === WebSocket.OPEN),
                playing: totalOwned > 0,
                selectedView: selected,
                position,
                score: totalScore,
                ownedCount: totalOwned,
                border,
                latency: Number.isFinite(connection?.latency) ? connection.latency : null,
                playerCount: Number.isFinite(vision?.stats?.playing) ? vision.stats.playing : null,
            };
            this.snapshotDirty = false;
            return {
                ...this.snapshotCache,
                position: this.snapshotCache.position ? { ...this.snapshotCache.position } : null,
                border: this.snapshotCache.border ? { ...this.snapshotCache.border } : null,
            };
        }
        sendPlay(data) {
            if (!this.isReady()) return false;
            try {
                this.api.net.play(this.api.world.selected, data);
                return true;
            } catch (error) {
                this.logger.warnOnce('sigfix-send-play', 'Unable to send play through SigFix', error);
                return false;
            }
        }
        sendChat(message) {
            if (!this.isReady()) return false;
            try {
                this.api.net.chat(String(message), this.api.world.selected);
                return true;
            } catch (error) {
                this.logger.warnOnce('sigfix-send-chat', 'Unable to send chat through SigFix', error);
                return false;
            }
        }
        sendMove(x, y) {
            if (!this.isReady()) return false;
            const target = this.movementOverride ?? { x, y };
            try {
                this.api.net.move(this.api.world.selected, target.x, target.y);
                return true;
            } catch (error) {
                this.logger.warnOnce('sigfix-send-move', 'Unable to send movement through SigFix', error);
                return false;
            }
        }
        sendAction(action) {
            if (!this.isReady()) return false;
            const method = {
                split: 'split',
                eject: 'w',
                qDown: 'qdown',
                qUp: 'qup',
            }[action];
            if (!method || typeof this.api.net[method] !== 'function') return false;
            try {
                this.api.net[method](this.api.world.selected);
                return true;
            } catch (error) {
                this.logger.warnOnce(`sigfix-send-${action}`, 'Unable to send action through SigFix', error);
                return false;
            }
        }
        setMovementOverride(position) {
            this.movementOverride = position;
        }
    }
    class HostResolver extends Emitter {
        constructor(resources, logger) {
            super();
            this.resources = resources;
            this.logger = logger;
            this.adapter = null;
            this.native = null;
            this.started = false;
        }
        static isSigFixApi(value) {
            return (
                isObject(value) &&
                value.world?.views instanceof Map &&
                value.world?.cells instanceof Map &&
                typeof value.world?.score === 'function' &&
                value.net?.connections instanceof Map &&
                ['play', 'chat', 'move', 'split', 'w', 'qdown', 'qup'].every((name) => typeof value.net?.[name] === 'function')
            );
        }
        start() {
            if (this.started) return;
            this.started = true;
            this.native = new NativeHostAdapter(this.resources.child('native'), this.logger);
            this.native.start();
            if (HostResolver.isSigFixApi(window.sigfix)) this.selectSigFix(window.sigfix);
            else this.select(this.native);
            const detection = this.resources.child('sigfix-detection');
            const check = () => {
                if (!window.sigfix) return;
                if (!HostResolver.isSigFixApi(window.sigfix)) {
                    this.logger.warnOnce('invalid-sigfix-api', 'Ignoring an incompatible window.sigfix API');
                    return;
                }
                this.selectSigFix(window.sigfix);
            };
            detection.interval(check, 500);
            check();
        }
        selectSigFix(api) {
            if (this.adapter?.kind === 'sigfix' && this.adapter.api === api) return;
            this.native?.stopGameCapture();
            if (this.adapter?.kind === 'sigfix') this.adapter.destroy();
            const sigfix = new SigFixHostAdapter(this.resources.child('sigfix'), this.logger, api);
            sigfix.start();
            this.select(sigfix);
        }
        select(adapter) {
            if (this.adapter === adapter) return;
            if (this.adapter && this.adapter !== this.native && !this.adapter.resources.disposed) this.adapter.destroy();
            this.adapter = adapter;
            this.emit('change', adapter);
        }
        destroy() {
            this.resources.children.get('sigfix-detection')?.dispose();
            if (this.adapter && this.adapter !== this.native) this.adapter.destroy();
            this.native?.destroy();
            this.native = null;
            this.adapter = null;
            this.started = false;
            this.clear();
        }
    }
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // ~ SigMod backend transport and optional browser dependencies                        ~
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    class BackendClient extends Emitter {
        constructor(app) {
            super();
            this.app = app;
            this.resources = app.resources.child('backend');
            this.socket = null;
            this.reconnectAttempts = 0;
            this.closedByClient = false;
            this.generation = 0;
            this.connectedCount = 0;
            this.updateRequired = false;
            this.pingStarted = null;
        }
        connect() {
            if (this.updateRequired) return;
            if (this.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(this.socket.readyState)) return;
            this.closedByClient = false;
            const generation = ++this.generation;
            const socketScope = this.resources.child(`socket-${generation}`);
            const socket = new WebSocket(ENDPOINTS.socket);
            socket.binaryType = 'arraybuffer';
            this.socket = socket;
            socketScope.listen(socket, 'open', () => {
                if (generation !== this.generation) return;
                this.connectedCount += 1;
                this.reconnectAttempts = 0;
                this.app.state.backend.connected = true;
                this.send('version', BUILD.serverVersion);
                this.send('server-changed', getGameMode());
                if (this.connectedCount > 1 && this.app.state.nickname) {
                    this.send('update-nick', this.app.state.nickname);
                }
                this.emit('open');
            });
            socketScope.listen(socket, 'message', (event) => {
                if (generation === this.generation) this.handleMessage(event.data);
            });
            socketScope.listen(socket, 'error', (event) => {
                if (generation === this.generation) this.emit('error', event);
            });
            socketScope.listen(socket, 'close', (event) => {
                if (generation === this.generation) {
                    this.app.state.backend.connected = false;
                    this.emit('close', event);
                    if (!this.closedByClient && !this.updateRequired) this.scheduleReconnect();
                }
                socketScope.dispose();
            });
        }
        scheduleReconnect() {
            const reconnect = this.resources.child('reconnect');
            reconnect.dispose();
            const next = this.resources.child('reconnect');
            const exponential = TIMING.backendReconnectBase * 2 ** this.reconnectAttempts;
            const delay = Math.min(TIMING.backendReconnectMax, exponential);
            this.reconnectAttempts += 1;
            next.timeout(() => {
                next.dispose();
                this.connect();
            }, delay);
        }
        disconnect() {
            this.closedByClient = true;
            this.generation += 1;
            this.resources.children.get('reconnect')?.dispose();
            const socket = this.socket;
            this.socket = null;
            this.app.state.backend.connected = false;
            if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'SigMod stopped');
        }
        send(type, content) {
            const envelope = isObject(type) ? type : { type, content };
            if (!envelope.type || this.socket?.readyState !== WebSocket.OPEN) return false;
            try {
                if (envelope.type === 'get-ping' || envelope.type === 'ping') this.pingStarted = performance.now();
                this.socket.send(encoder.encode(JSON.stringify(envelope)));
                return true;
            } catch (error) {
                this.app.logger.warnOnce('backend-send', 'Unable to send a backend message', error);
                return false;
            }
        }
        handleMessage(data) {
            let envelope;
            try {
                if (typeof data === 'string') envelope = JSON.parse(data);
                else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) envelope = JSON.parse(decoder.decode(data));
            } catch (error) {
                this.app.logger.warnOnce('backend-message', 'Unable to parse a backend message', error);
                return;
            }
            if (!isObject(envelope) || typeof envelope.type !== 'string') return;
            if (envelope.type === 'sid') {
                this.app.state.backend.sid = envelope.content;
            } else if (envelope.type === 'ping' && this.pingStarted !== null) {
                this.app.state.backend.latency = performance.now() - this.pingStarted;
                this.pingStarted = null;
            } else if (envelope.type === 'update-available') {
                this.updateRequired = true;
            }
            this.emit(envelope.type, envelope.content);
        }
        destroy() {
            this.disconnect();
            this.resources.dispose();
            this.clear();
        }
    }