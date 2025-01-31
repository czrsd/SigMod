import socket from './socket';
import CircularJSON from 'circular-json';
import {
    checkVersion,
    handlePrivateMessage,
    onGoogleAuth,
    onPartyChatMessage,
    onServerChange,
    updateNick,
    updateTag,
} from './socketUtils';
import { socketMessageData } from '../../types';

const onMessage = async (raw: ArrayBuffer, socket: socket) => {
    const bin: Uint8Array = new Uint8Array(raw);
    const jsonString: string = new TextDecoder().decode(bin);

    try {
        const data = CircularJSON.parse(jsonString);

        if (!data || !data.type) throw new Error('Invalid message.');

        const { type, content }: socketMessageData = data;

        switch (type) {
            case 'version':
                checkVersion(content, socket);
                break;
            case 'server-changed':
                onServerChange(content, socket);
                break;
            case 'update-tag':
                updateTag(content, socket);
                break;
            case 'get-ping':
                socket.send({ type: 'ping' });
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
            default:
                throw new Error(`Unknown message type: ${type}.`);
        }
    } catch (e: any) {
        socket.send({
            type: 'error',
            content: {
                message: e.message || 'An error occurred.',
            },
        });
    }
};

export default onMessage;
