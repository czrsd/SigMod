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
} from './socketUtils';
import { socketMessageData } from '../../types';

const onMessage = async (raw: ArrayBuffer, socket: socket): Promise<void> => {
    const bin: Uint8Array = new Uint8Array(raw);
    const jsonString: string = new TextDecoder().decode(bin);

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
            case 'position':
                updateMinimap(content, socket);
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
