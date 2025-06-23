import socket from './socket';
import CircularJSON from 'circular-json';
import {
    checkVersion,
    handlePrivateMessage,
    onGoogleAuth,
    onPartyChatMessage,
    onServerChange,
    updateMinimap,
    updateNick,
    updateTag,
    updateScore,
    sendPing,
} from './socketUtils';
import { socketMessageData } from '../../types';
import TournamentController from './tournaments/TournamentController';

const onMessage = async (raw: ArrayBuffer, socket: socket): Promise<void> => {
    const buf: Uint8Array = new Uint8Array(raw);
    const jsonString: string = new TextDecoder().decode(buf);

    try {
        const data = CircularJSON.parse(jsonString);

        if (!data || !data.type) {
            socket.send({
                type: 'error',
                content: { message: 'Invalid message.' },
            });
            return;
        }

        const { type, content }: socketMessageData = data;

        switch (type) {
            case 'version':
                checkVersion(content, socket);
                break;
            case 'get-ping':
                socket.send({ type: 'ping' });
                break;
            case 'server-changed':
                onServerChange(content, socket);
                break;
            case 'update-tag':
                updateTag(content, socket);
                break;
            case 'position':
                updateMinimap(content, socket);
                break;
            case 'tag-ping':
                sendPing(content, socket);
                break;
            case 'score':
                updateScore(content, socket);
                break;
            case 'update-nick':
                updateNick(content, socket);
                break;
            case 'chat-message':
                onPartyChatMessage(content, socket);
                break;
            case 'private-message':
                await handlePrivateMessage(content, socket);
                break;
            case 'user':
                onGoogleAuth(content, socket);
                break;
            // Tournaments
            case 'ready':
                await TournamentController.playerReady(socket);
                break;
            case 'result':
                await TournamentController.handleResult(content, socket);
                break;
            default:
                socket.send({
                    type: 'error',
                    content: { message: `Unknown message type: ${type}.` },
                });
                return;
        }
    } catch (e) {
        const errorMessage =
            e instanceof Error ? e.message : 'An unknown error occurred';

        socket.send({
            type: 'error',
            content: {
                message: errorMessage,
            },
        });
    }
};

export default onMessage;
