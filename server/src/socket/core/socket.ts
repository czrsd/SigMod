import WebSocket from 'ws';
import { readFileSync, watch, WatchEventType } from 'fs';
import path from 'path';
import { Request } from 'express';
import { wsHandler } from '../setup';
import { v4 as uuidv4 } from 'uuid';
import AccountModel from '../../models/AccountModel';
import logger from '../../utils/logger';
import { google_user, modAccount, socketMessageData } from '../../types';
import messageHandler from './messageHandler';
import { getCachedClientContent } from '../../services/clientContent';
import { randomBytes } from 'crypto';

const zigFilePath: string = path.join(process.cwd(), 'zig');
let isZigActive: boolean = false;

const updateZigState = (): void => {
    try {
        const content: string = readFileSync(zigFilePath, 'utf-8').trim();
        isZigActive = content === '1';
        logger.info(`[WS] Zig state updated to: ${isZigActive}`);
    } catch (err: unknown) {
        logger.error(`[WS] Could not read zig file:`, err);
    }
};
updateZigState();

watch(zigFilePath, (eventType: WatchEventType, filename: string | null): void => {
    if (eventType === 'change') {
        updateZigState();
    }
});

class Socket {
    ws: WebSocket;
    req: Request;
    sid: string;
    authNonce: string = randomBytes(32).toString('hex');
    privateMessageWindowStarted: number = 0;
    privateMessageCount: number = 0;
    connectedAt: Date = new Date();
    lastMessageAt: Date | null = null;
    lastPongAt: Date | null = null;
    clientVersion: string | null = null;
    server: string | null = null;
    tag: string | null = null;
    tagIndex: number | null = null;
    score: number = 0;
    lastPingSent = 0;
    nick: string | null = null;
    user: google_user | null = null;
    modUser: modAccount | null = null;
    position: {
        x: number | null;
        y: number | null;
    };
    isAlive: boolean = false;
    isWsAlive: boolean = true;
    skin: string | null = null;
    color: string | null = null;
    ping: number | null = null;

    constructor(ws: WebSocket, req: Request) {
        this.ws = ws;
        this.req = req;
        this.sid = uuidv4();

        this.position = {
            x: null,
            y: null,
        };
    }

    public send(data: socketMessageData): void {
        if (!data || this.ws.readyState !== WebSocket.OPEN) return;
        try {
            const json = JSON.stringify(data);
            const encoder = new TextEncoder();
            const binaryData = encoder.encode(json);
            this.ws.send(binaryData);
        } catch (err) {
            logger.error(`[WS] Error sending message to SID ${this.sid}:`, err);
        }
    }

    onError(e: Error): void {
        logger.error(`[WS] Socket error on SID ${this.sid}:`, e);
    }

    private async updateUserStatus() {
        if (this.modUser?._id && !wsHandler.onlineFriends([this.modUser._id.toString()]).length) {
            try {
                await AccountModel.updateOne({ _id: this.modUser._id }, { $set: { online: false, lastOnline: new Date() } });
            } catch (err) {
                logger.error(`[WS] Error updating user offline status:`, err);
            }
        }
    }

    async onClose() {
        // Party cleanup must not depend on database availability.
        if (!wsHandler.sockets.has(this.sid)) return;
        wsHandler.removeSocket(this);
        await this.updateUserStatus();
    }

    init(): void {
        wsHandler.registerSocket(this);

        this.ws.on('message', async (message: ArrayBuffer) => {
            await messageHandler(message, this);
        });
        this.ws.on('error', (e: any) => this.onError(e));
        this.ws.on('close', () => this.onClose());
        this.ws.on('pong', () => {
            this.isWsAlive = true;
            this.lastPongAt = new Date();
        });

        this.send({
            type: 'sid',
            content: this.sid,
        });

        this.send({ type: 'usage-capabilities', content: { keybindUsage: 1 } });
        this.send({ type: 'auth-challenge', content: this.authNonce });

        this.send({ type: 'client-content', content: getCachedClientContent() });

        this.send({
            type: 'zig-active',
            content: isZigActive,
        });

        if (wsHandler.alert.enabled) {
            this.send({
                type: 'alert',
                content: wsHandler.alert,
            });
        }

        logger.info(`[WS Manager] WebSocket initialized. SID: ${this.sid}`);
    }
}

export default Socket;
