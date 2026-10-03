import WebSocket, { WebSocketServer } from 'ws';
import { Request } from 'express';
import wsHandler from './SocketController';
import Socket from './core/socket';

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket, req: Request) => {
    const socket = new Socket(ws, req);
    socket.init();
});

// Periodic heartbeat to clean up dead/zombie sockets
const heartbeatInterval = setInterval(() => {
    for (const socket of wsHandler.sockets.values()) {
        if (!socket.isAlive) {
            socket.ws.terminate();
            continue;
        }
        socket.isAlive = false;
        socket.ws.ping();
    }
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

export { wsHandler, wss as wsServer };
