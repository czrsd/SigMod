import socket from './socket';

class WebSocketHandler {
    // replace any types later
    public sockets: Map<string, socket>;
    public tournamentLobbies: any[];
    public modLink: string;
    public tournamentOverlay: boolean;

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
}

export default new WebSocketHandler();
