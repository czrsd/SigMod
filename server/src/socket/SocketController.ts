import { alert, socketMessageData } from '../types';
import socket from './core/socket';

class SocketController {
    public sockets: Map<string, socket>;
    public modLink: string;
    public tournamentOverlay: boolean;
    public version: string = '4.0.3';
    public alert: alert;
    public tournamentDetails: string | null = null;
    public tournamentTimer: number | null = null;

    constructor() {
        this.sockets = new Map();
        this.tournamentOverlay = false;

        this.modLink =
            'https://update.greasyfork.org/scripts/454648/SigMod%20Client%20%28Macros%29.user.js';

        this.alert = {
            title: 'Scrim',
            description:
                'We are hosting a scrim in the tournament server! You can win 50k Gold!',
            enabled: false,
            password: null, // hide password if there are no active scrims
        };
    }

    sendToAll(data: socketMessageData) {
        this.sockets.forEach((socket) => socket.send(data));
    }

    getByUserId(id: string): socket | void {
        for (const [_, socket] of this.sockets) {
            if (socket.user?._id === id) return socket;
        }
        return void 0;
    }

    getServerSockets(server: string) {
        const allSockets = Array.from(this.sockets.values());
        const serverSockets: socket[] = [];

        allSockets.forEach((socket) => {
            if (socket.server === server) {
                serverSockets.push(socket);
            }
        });

        return serverSockets;
    }

    sendToServer(server: string, data: socketMessageData) {
        this.sockets.forEach((socket) => {
            if (socket.server === server) {
                socket.send(data);
            }
        });
    }

    sendToTag(data: socketMessageData, tag: string, excludeSid?: string) {
        this.sockets.forEach((socket) => {
            if (excludeSid && socket.sid === excludeSid) return;

            if (socket.tag === tag) socket.send(data);
        });
    }

    getSocketsByTag(tag: string): socket[] {
        const matchingSockets: socket[] = [];

        this.sockets.forEach((socket) => {
            if (socket.tag === tag) matchingSockets.push(socket);
        });

        return matchingSockets;
    }

    sendToUser(userId: string, data: any) {
        this.sockets.forEach((socket) => {
            if (socket.modUser?._id?.toString() == userId) {
                socket.send(data);
                return;
            }
        });
    }

    onlineFriends(ids: string[]): socket[] {
        const onlineFriendSockets: socket[] = [];

        ids.forEach((userId) => {
            const socket = Array.from(this.sockets.values()).find(
                (socket) => socket.modUser && socket.modUser._id === userId
            );
            if (socket) {
                onlineFriendSockets.push(socket);
            }
        });

        return onlineFriendSockets;
    }
}

export default new SocketController();
