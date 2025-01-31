import socket from './socket';
import { noXSS } from '../../utils/helpers';
import { wsHandler } from '../setup';
import { google_user, minimapData } from '../../types';
import logger from '../../utils/logger';
import ChatModel from '../../models/ChatModel';

const checkVersion = (version: string, socket: socket) => {
    if (version === wsHandler.version) return;

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

    socket.server = noXSS(serverName);

    if (wsHandler.tournamentOverlay && socket.server === 'Tourney') {
        socket.send({
            type: 'tournament-overlay',
            content: wsHandler.tournamentOverlay,
        });
    }
};

const updateTag = (tag: string, socket: socket) => {
    if (tag.length <= 3) socket.tag = tag;
};

const updateMinimap = (data: minimapData, socket: socket) => {
    if (!socket.tag || socket.tag.length > 3) return;

    socket.position = {
        x: data.x,
        y: data.y,
    };

    const sockets = wsHandler.getSocketsByTag(socket.tag);

    if (!sockets.every((s) => s.server === socket.server)) return;

    wsHandler.sendToTag(
        {
            type: 'minimap-data',
            content: data,
        },
        socket.tag
    );
};

const onPartyChatMessage = (data: { message: string }, socket: socket) => {
    const message = noXSS(data.message.slice(0, 250));
    if (!socket.tag || !message) throw new Error('Invalid chat message.');

    const { tag, modUser, nick } = socket;

    const roleColors: Record<string, string> = {
        Owner: '#6b72c4',
        Moderator: '#60DDD7',
        Vip: '#DDC760',
    };

    const role = modUser?.role;
    const color = roleColors[role as keyof typeof roleColors] ?? null;

    wsHandler.sendToTag(
        {
            type: 'chat-message',
            content: {
                admin: role === 'Owner',
                mod: role === 'Moderator',
                vip: role === 'Vip',
                name: nick || 'Unnamed',
                message,
                color,
            },
        },
        tag
    );
};

const handlePrivateMessage = async (
    data: { text: string; target: string },
    socket: socket
) => {
    const user = socket.modUser;
    if (!user) {
        throw new Error('Not authorized.');
    }

    const { target } = data;
    const text = noXSS(data.text);

    if (!text || text.length > 200 || !target || !user._id)
        throw new Error('Invalid private message.');

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

const sendToUser = (
    userId: string,
    targetId: string,
    text: string,
    timestamp: number
) => {
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

const onGoogleAuth = (userData: google_user, socket: socket) => {
    if (!userData || !userData._id) return;

    socket.user = userData;

    // adding more for tournaments soon
};

export {
    checkVersion,
    updateNick,
    onServerChange,
    updateTag,
    updateMinimap,
    onPartyChatMessage,
    handlePrivateMessage,
    onGoogleAuth,
};
