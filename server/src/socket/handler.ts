import socket from './socket';
import { modAccount } from '../types';

class WebSocketHandler {
    // replace any types later
    public sockets: Map<string, socket>;
    public tournamentLobbies: any[];
    public modLink: string;
    public tournamentOverlay: boolean;
    public version: string = '4.0.0';

    constructor() {
        this.sockets = new Map();
        this.tournamentLobbies = [];
        this.tournamentOverlay = false;

        this.modLink =
            'https://update.greasyfork.org/scripts/454648/SigMod%20Client%20%28Macros%29.user.js';
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

export default new WebSocketHandler();
