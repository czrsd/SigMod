import socket from './socket';
import { formatDate, noXSS, sanitizeNick } from '../../utils/helpers';
import { wsHandler } from '../setup';
import { google_user, minimapData, PingData } from '../../types';
import logger from '../../utils/logger';
import ChatModel from '../../models/ChatModel';
import { db } from '../../db/connection';
import { ObjectId } from 'mongodb';
import useragent from 'express-useragent';

const checkVersion = (version: string, socket: socket) => {
    if (version === wsHandler.version || version.startsWith('4.')) return;

    socket.send({
        type: 'update-available',
        content: wsHandler.modLink,
    });

    socket.ws.close();
};

const updateNick = (nick: string, socket: socket) => {
    if (nick.length <= 50) socket.nick = nick;
};

const onServerChange = (serverName: string, socket: socket) => {
    if (!serverName) throw new Error('No server specified');

    const sanitizedServer = noXSS(serverName);
    wsHandler.setSocketServer(socket, sanitizedServer);
};

const updateTag = (tag: string, socket: socket) => {
    if (!tag) {
        const previousTag = socket.tag;
        wsHandler.setSocketTag(socket, null);
        if (previousTag && socket.server) {
            const prevSockets = wsHandler.getTagMembersOnServer(previousTag, socket.server);
            for (const s of prevSockets) {
                s.send({
                    type: 'leave-tag',
                    content: {
                        id: socket.sid,
                    },
                });
            }
        }
        return;
    }
    if (typeof tag !== 'string' || tag.trim().length > 3 || !socket.server) return;

    const previousTag = socket.tag;

    if (previousTag === tag) {
        return;
    }

    wsHandler.setSocketTag(socket, tag);

    const tagSockets = wsHandler.getTagMembersOnServer(tag, socket.server);
    tagSockets.forEach((s, i) => (s.tagIndex = i + 1));

    tagSockets.forEach((s) => {
        if (s === socket) return;
        s.send({
            type: 'join-tag',
            content: {
                id: socket.sid,
                tagIndex: socket.tagIndex,
                nick: socket.nick,
                score: socket.score,
                skin: socket.skin,
                color: socket.color,
                isAlive: socket.isAlive,
                ping: socket.ping,
            },
        });
    });

    socket.send({
        type: 'tag-members',
        content: tagSockets.map((m) => ({
            id: m.sid,
            tagIndex: m.tagIndex,
            nick: m.nick,
            score: m.score,
            skin: m.skin,
            color: m.color,
            isAlive: m.isAlive,
            ping: m.ping,
        })),
    });

    if (previousTag && previousTag !== tag) {
        const prevSockets = wsHandler.getTagMembersOnServer(previousTag, socket.server);
        for (const s of prevSockets) {
            s.send({
                type: 'leave-tag',
                content: {
                    id: socket.sid,
                },
            });
        }
    }
};

const sendPing = (data: PingData, socket: socket) => {
    if (!socket.tag || !socket.server) return;

    if (Date.now() - socket.lastPingSent < wsHandler.PING_COOLDOWN) return;

    const { x, y, t } = data;

    const sockets = wsHandler.getTagMembersOnServer(socket.tag, socket.server);

    for (const s of sockets) {
        s.send({
            type: 'tag-ping',
            content: {
                i: socket.tagIndex,
                x,
                y,
                t,
            },
        });
    }

    socket.lastPingSent = Date.now();
};

const updateMinimap = (data: minimapData, socket: socket) => {
    if (!socket.tag || !socket.server) return;

    const { x, y } = data;

    socket.position = {
        x,
        y,
    };
    if (x === null || y === null) {
        socket.isAlive = false;
    } else {
        socket.isAlive = true;
    }

    const sockets = wsHandler.getTagMembersOnServer(socket.tag, socket.server, socket.sid);

    for (const s of sockets) {
        s.send({
            type: 'minimap-data',
            content: {
                x,
                y,
                nick: socket.nick,
                sid: socket.sid,
            },
        });
    }
};

const updateScore = (score: number, socket: socket) => {
    if (!socket.tag || !socket.server || typeof score !== 'number' || score > 9_999_999_999) return;

    socket.score = score;
    if (score > 0) socket.isAlive = true;

    const sockets = wsHandler.getTagMembersOnServer(socket.tag, socket.server);

    for (const s of sockets) {
        s.send({
            type: 'score-tag',
            content: {
                id: socket.sid,
                score,
            },
        });
    }
};

const updatePartyMember = (
    data: { skin?: string | null; color?: string | null; isAlive?: boolean; ping?: number | null },
    socket: socket
) => {
    if (!socket.tag || !socket.server || !data) return;

    if (data.skin !== undefined) socket.skin = typeof data.skin === 'string' ? data.skin.slice(0, 100) : null;
    if (data.color !== undefined) socket.color = typeof data.color === 'string' ? data.color.slice(0, 30) : null;
    if (typeof data.isAlive === 'boolean') socket.isAlive = data.isAlive;
    if (typeof data.ping === 'number' && Number.isFinite(data.ping)) socket.ping = Math.round(data.ping);

    const sockets = wsHandler.getTagMembersOnServer(socket.tag, socket.server);

    for (const s of sockets) {
        s.send({
            type: 'party-member-update',
            content: {
                id: socket.sid,
                skin: socket.skin,
                color: socket.color,
                isAlive: socket.isAlive,
                ping: socket.ping,
            },
        });
    }
};

const onPartyChatMessage = (data: { message: string }, socket: socket) => {
    const message = noXSS(data.message.slice(0, 250));
    if (!socket.tag || !socket.server || !message) throw new Error('Invalid chat message.');

    const { modUser, nick } = socket;

    const roleColors: Record<string, string> = {
        Owner: '#6b72c4',
        Moderator: '#60DDD7',
        Vip: '#DDC760',
    };

    const role = modUser?.role;
    const color = roleColors[role as keyof typeof roleColors] ?? null;

    const sockets = wsHandler.getTagMembersOnServer(socket.tag, socket.server);

    sockets.forEach((s) => {
        s.send({
            type: 'chat-message',
            content: {
                admin: role === 'Owner',
                mod: role === 'Moderator',
                vip: role === 'Vip',
                name: nick || 'Unnamed',
                message,
                color,
            },
        });
    });
};

const handlePrivateMessage = async (data: { text: string; target: string }, socket: socket) => {
    const user = socket.modUser;
    if (!user) {
        throw new Error('Not authorized.');
    }

    const { target } = data;
    const text = noXSS(data.text);

    if (!text || text.length > 200 || !target || !user._id) throw new Error('Invalid private message.');

    const timestamp = Date.now();

    sendToUser(user._id.toString(), target, text, timestamp);

    try {
        await ChatModel.create({
            sender_id: user._id,
            target_id: target,
            timestamp: new Date(timestamp),
            content: text,
        });
    } catch (e) {
        logger.error('Error saving message: ', e);
        throw new Error('Failed to save message.');
    }
};

const sendToUser = (userId: string, targetId: string, text: string, timestamp: number) => {
    wsHandler.sendToUser(userId, {
        type: 'private-message',
        content: {
            sender_id: userId,
            target_id: targetId,
            message: text,
            timestamp,
        },
    });

    wsHandler.sendToUser(targetId, {
        type: 'private-message',
        content: {
            sender_id: userId,
            target_id: targetId,
            message: text,
            timestamp,
        },
    });
};

interface extended_user extends google_user {
    _id: ObjectId;
    nick: string;
    ip: string;
    userAgent: {
        browser: string;
        platform: string;
        version: string;
        source: string;
    };
}

const onGoogleAuth = async (user: extended_user, socket: socket) => {
    if (!user || !user._id) return;

    socket.user = user as google_user;

    try {
        const ip = socket.req.headers['x-forwarded-for'] || socket.req.socket.remoteAddress;

        const userAgentString = Array.isArray(socket.req.headers['user-agent'])
            ? socket.req.headers['user-agent'][0]
            : socket.req.headers['user-agent'];
        const agent = useragent.parse(userAgentString);

        const { browser, platform, version, source } = agent;

        if (!user || typeof user !== 'object' || !user._id || !user.email || !agent || typeof ip !== 'string') {
            logger.info('Something went wrong.');
            return;
        }

        user._id = new ObjectId(user._id);
        user.nick = sanitizeNick(user.nick || 'Unnamed');
        user.ip = ip;
        user.userAgent = {
            browser: browser || '',
            platform: platform || '',
            version: version || '',
            source: source || '',
        };

        logger.info(`[User manager] User authorized: ${user.fullName || 'Unnamed'} on ${formatDate(new Date())}`);

        const usersCollection = db.collection('users');
        const userDoc = await usersCollection.findOne({ _id: user._id });

        if (!userDoc) {
            await usersCollection.insertOne(user);
        } else {
            const updates: Record<string, any> = { ...user, ip };
            await usersCollection.updateOne({ _id: user._id }, { $set: updates });
        }

        wsHandler.setSocketUser(socket, user._id.toString());
    } catch (e) {
        logger.error(e);
    }
};

export {
    checkVersion,
    updateNick,
    onServerChange,
    updateTag,
    updateScore,
    sendPing,
    updateMinimap,
    onPartyChatMessage,
    handlePrivateMessage,
    onGoogleAuth,
    updatePartyMember,
};
