import socket from './socket';
import { formatDate, noXSS, sanitizeNick } from '../../utils/helpers';
import { wsHandler } from '../setup';
import { google_user, minimapData, PingData } from '../../types';
import logger from '../../utils/logger';
import ChatModel from '../../models/ChatModel';
import FriendModel from '../../models/FriendModel';
import { db } from '../../db/connection';
import { ObjectId } from 'mongodb';
import useragent from 'express-useragent';
import { recordPartyChatMessage, recordPartyNickname } from '../../services/partyUsage';

const checkVersion = (version: string, socket: socket) => {
    if (typeof version !== 'string' || version.length > 80) return;
    socket.clientVersion = version;
    if (version === wsHandler.version || version.startsWith('4.')) return;

    socket.send({
        type: 'update-available',
        content: wsHandler.modLink,
    });

    socket.ws.close();
};

const updateNick = (nick: string, socket: socket) => {
    if (typeof nick !== 'string') return;
    const sanitizedNick = nick.slice(0, 50).trim() || 'Unnamed';
    if (socket.nick === sanitizedNick) return;
    socket.nick = sanitizedNick;

    if (socket.tag && socket.server) recordPartyNickname(socket.tag, socket.server, socket.nick);

    if (socket.tag && socket.server) {
        const sockets = wsHandler.getTagMembersOnServer(socket.tag, socket.server);
        for (const s of sockets) {
            s.send({
                type: 'party-member-update',
                content: {
                    id: socket.sid,
                    nick: socket.nick,
                },
            });
        }
    }
};

const onServerChange = (serverName: string, socket: socket) => {
    if (typeof serverName !== 'string' || !serverName.trim() || serverName.length > 200) {
        throw new Error('Invalid server specified');
    }

    const sanitizedServer = noXSS(serverName);
    wsHandler.setSocketServer(socket, sanitizedServer);
};

const updateTag = (tag: string | null | undefined, socket: socket) => {
    const sanitizedTag = typeof tag === 'string' && tag.trim().length > 0 ? tag.trim().slice(0, 3) : null;

    if (socket.tag === sanitizedTag) {
        if (sanitizedTag && socket.server) wsHandler.syncTagRoom(sanitizedTag, socket.server);
        else socket.send({ type: 'tag-members', content: [] });
        return;
    }
    // Keep the tag even if it arrives before server-changed; joining the server
    // will then publish the authoritative roster.
    wsHandler.setSocketTag(socket, sanitizedTag);
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
    if (!socket.tag || !socket.server || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 9_999_999_999) {
        return;
    }

    socket.score = score;

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
    if (data.ping === null) socket.ping = null;
    else if (typeof data.ping === 'number' && Number.isFinite(data.ping)) socket.ping = Math.max(0, Math.round(data.ping));

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

    recordPartyChatMessage();

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

    if (!data || typeof data.text !== 'string' || typeof data.target !== 'string' || !/^[a-f0-9]{24}$/i.test(data.target))
        throw new Error('Invalid private message.');
    const { target } = data;
    const text = noXSS(data.text);

    if (!text || text.length > 200 || !target || !user._id) throw new Error('Invalid private message.');

    const timestamp = Date.now();

    if (!socket.privateMessageWindowStarted || timestamp - socket.privateMessageWindowStarted >= 10_000) {
        socket.privateMessageWindowStarted = timestamp;
        socket.privateMessageCount = 0;
    }
    if (socket.privateMessageCount >= 10) throw new Error('Please wait before sending more private messages.');
    socket.privateMessageCount += 1;
    if (!(await FriendModel.exists({ user_id: user._id, friend_id: target }))) throw new Error('Only friends can send private messages.');

    try {
        await ChatModel.create({
            sender_id: user._id,
            target_id: target,
            timestamp: new Date(timestamp),
            content: text,
        });
        sendToUser(user._id.toString(), target, text, timestamp);
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

    user = { ...user };
    delete (user as unknown as Record<string, unknown>).token;
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
