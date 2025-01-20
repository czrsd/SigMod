import WebSocket from 'ws';
import { Request } from 'express';
import CircularJSON from 'circular-json';
import { wsHandler } from './setup';
import { v4 as uuidv4 } from 'uuid';
import AccountModel from '../models/AccountModel';
import logger from '../utils/logger';
import { google_user } from '../types';
import { modAccount } from '../types';

class Socket {
    ws: WebSocket;
    req: Request;
    sid: string;
    server: string | null;
    tag: string | null;
    nick: string | null;
    user: google_user | null;
    modUser: modAccount | null;
    position: {
        x: number | null;
        y: number | null;
    };
    tournamentId: null | string;

    constructor(ws: WebSocket, req: Request) {
        this.ws = ws;
        this.req = req;
        this.sid = uuidv4();
        this.user = null;
        this.modUser = null;

        this.server = null;
        this.tag = null;
        this.nick = null;

        this.position = {
            x: null,
            y: null,
        };

        this.tournamentId = null;
    }

    public send(data: { type: string; content: any }): void {
        if (!data) return;
        const json = CircularJSON.stringify(data);
        const encoder = new TextEncoder();
        const binaryData = encoder.encode(json);

        this.ws.send(binaryData);
    }

    onError(e: Error): void {
        console.error(e);
    }

    async onClose() {
        // offline handling for mod users
        if (this.modUser) {
            await AccountModel.updateOne(
                { _id: this.modUser._id },
                { $set: { online: false, lastOnline: new Date() } }
            );
        }

        /*
        if (this.user && tournamentSystem.getLobbyByEmail(this.user.email)) {
            tournamentSystem.disconnectPlayer(this);
        }
         */

        wsHandler.sockets.delete(this.sid);
    }

    init(): void {
        this.ws.on('message', async (message: WebSocket.Data) => {
            // await onMessage(message as Buffer, this);
            // logger.info('New WebSocket message: ', message);
        });
        this.ws.on('error', (e: any) => this.onError(e));
        this.ws.on('close', () => this.onClose());

        // assign socket id to client
        this.send({
            type: 'sid',
            content: this.sid,
        });

        logger.info(`[WS Manager] WebSocket initialized. SID: ${this.sid}`);
    }
}

export default Socket;
