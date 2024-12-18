import WebSocket, { WebSocketServer } from 'ws';
import { Request } from 'express';
import wsHandler from './handler';
import Socket from './socket';

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket, req: Request) => {
    const socket = new Socket(ws, req);
    wsHandler.sockets.set(socket.sid, socket);

    socket.init();
});

export { wsHandler, wss as wsServer };
