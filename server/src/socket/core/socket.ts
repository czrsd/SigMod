import WebSocket from 'ws';
import { Request } from 'express';
import CircularJSON from 'circular-json';
import { wsHandler } from '../setup';
import { v4 as uuidv4 } from 'uuid';
import AccountModel from '../../models/AccountModel';
import logger from '../../utils/logger';
import { google_user, modAccount, socketMessageData } from '../../types';
import messageHandler from './messageHandler';
import TournamentController from './tournaments/TournamentController';

class Socket {
    ws: WebSocket;
    req: Request;
    sid: string;
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
    tournamentId: null | string = null;

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
        if (!data) return;
        const json = CircularJSON.stringify(data);
        const encoder = new TextEncoder();
        const binaryData = encoder.encode(json);

        this.ws.send(binaryData);
    }

    onError(e: Error): void {
        console.error(e);
    }

    private async updateUserStatus() {
        if (this.modUser) {
            await AccountModel.updateOne(
                { _id: this.modUser._id },
                { $set: { online: false, lastOnline: new Date() } }
            );
        }
    }

    private updateTournamentLobby() {
        if (
            this.user &&
            TournamentController.getLobbyByEmail(this.user.email)
        ) {
            TournamentController.disconnectPlayer(this);
        }
    }

    private clearMinimap() {
        if (!this.tag) return;

        wsHandler.sendToTag(
            {
                type: 'minimap-data',
                content: {
                    x: null,
                    y: null,
                    nick: this.nick,
                    sid: this.sid,
                },
            },
            this.tag
        );
    }

    private clearTagMember() {
        if (!this.tag || !this.server) return;
        const sockets = wsHandler.getTagMembersOnServer(this.tag, this.server);

        for (const s of sockets) {
            s.send({
                type: 'leave-tag',
                content: {
                    id: this.sid,
                },
            });
        }
    }

    async onClose() {
        this.updateUserStatus();
        this.updateTournamentLobby();
        this.clearMinimap();
        this.clearTagMember();

        wsHandler.sockets.delete(this.sid);
    }

    init(): void {
        this.ws.on('message', async (message: ArrayBuffer) => {
            await messageHandler(message, this);
        });
        this.ws.on('error', (e: any) => this.onError(e));
        this.ws.on('close', () => this.onClose());

        // assign socket id to client
        this.send({
            type: 'sid',
            content: this.sid,
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
