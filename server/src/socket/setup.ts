import WebSocket, { WebSocketServer } from 'ws';
import { Request } from 'express';
import wsHandler from './SocketController';
import Socket from './core/socket';
import { recordWebSocketMetrics } from '../monitoring/instrumentation';

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket, req: Request) => {
    recordWebSocketMetrics(ws);
    const socket = new Socket(ws, req);
    socket.init();
});

const heartbeatInterval = setInterval(() => {
    for (const socket of wsHandler.sockets.values()) {
        if (!socket.isWsAlive || socket.ws.readyState !== WebSocket.OPEN) {
            void socket.onClose();
            socket.ws.terminate();
            continue;
        }
        socket.isWsAlive = false;
        socket.ws.ping();
    }
    // Reconcile recipients after reconnects or missed local UI updates too.
    for (const room of wsHandler.getActiveTagRooms()) wsHandler.syncTagRoom(room.tag, room.server);
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

export { wsHandler, wss as wsServer };
