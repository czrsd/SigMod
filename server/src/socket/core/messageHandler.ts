import socket from './socket';
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
    updatePartyMember,
} from './socketUtils';
import { socketMessageData } from '../../types';

const onMessage = async (raw: ArrayBuffer, socket: socket): Promise<void> => {
    if (raw.byteLength > 100 * 1024) {
        socket.ws.close(1009, 'Payload too large');
        return;
    }

    const buf: Uint8Array = new Uint8Array(raw);
    const jsonString: string = new TextDecoder().decode(buf);

    try {
        const data = JSON.parse(jsonString);

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
            case 'party-member-update':
                updatePartyMember(content, socket);
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
                await onGoogleAuth(content, socket);
                break;
            default:
                socket.send({
                    type: 'error',
                    content: { message: `Unknown message type: ${type}.` },
                });
                return;
        }
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';

        socket.send({
            type: 'error',
            content: {
                message: errorMessage,
            },
        });
    }
};

export default onMessage;
