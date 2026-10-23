import type Socket from '../../socket/core/socket';
import { visibleData } from './user-query';

export function activeUserSnapshot(socket: Socket): Record<string, unknown> {
    return visibleData({
        sid: socket.sid,
        nick: socket.nick,
        connectedAt: socket.connectedAt,
        lastMessageAt: socket.lastMessageAt,
        lastPongAt: socket.lastPongAt,
        clientVersion: socket.clientVersion,
        server: socket.server,
        tag: socket.tag,
        tagIndex: socket.tagIndex,
        score: socket.score,
        lastPingSent: socket.lastPingSent,
        position: socket.position,
        isAlive: socket.isAlive,
        isWsAlive: socket.isWsAlive,
        skin: socket.skin,
        color: socket.color,
        ping: socket.ping,
        connection: {
            path: socket.req.url?.split('?')[0],
            ip: socket.req.ip ?? socket.req.socket.remoteAddress,
            forwardedFor: socket.req.headers['x-forwarded-for'] ?? null,
            userAgent: socket.req.headers['user-agent'] ?? null,
            origin: socket.req.headers.origin ?? null,
            protocol: socket.req.protocol,
            bufferedAmount: socket.ws.bufferedAmount,
        },
        user: socket.user,
        modUser: socket.modUser,
    }) as Record<string, unknown>;
}
