import mongoose from 'mongoose';
import { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import AccountModel from '../models/AccountModel';
import logger from './logger';
import { wsHandler } from '../socket/setup';

let isShuttingDown = false;

export const gracefulShutdown = async (server?: HttpServer, wss?: WebSocketServer): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('[Shutdown] Initiating graceful shutdown...');

    try {
        // 1. Close active WebSocket connections
        if (wsHandler) {
            for (const socket of wsHandler.sockets.values()) {
                try {
                    socket.ws.close(1001, 'Server shutting down');
                } catch (_) {}
            }
        }
        if (wss) {
            wss.close();
        }

        // 2. Stop HTTP server from receiving new requests
        if (server) {
            await new Promise((resolve) => server.close(resolve));
            logger.info('[Shutdown] HTTP server closed.');
        }

        // 3. Reset online states in database
        await AccountModel.updateMany({ online: true }, { online: false, lastOnline: new Date() });
        logger.info('[Shutdown] Online statuses cleaned up.');

        // 4. Close database connection
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close(false);
            logger.info('[Shutdown] Database connection closed.');
        }
    } catch (err) {
        logger.error('[Shutdown] Error during graceful shutdown:', err);
    } finally {
        process.exit(0);
    }
};

const setupExitHandlers = (server?: HttpServer, wss?: WebSocketServer) => {
    process.on('SIGINT', () => gracefulShutdown(server, wss));
    process.on('SIGTERM', () => gracefulShutdown(server, wss));
};

export default setupExitHandlers;
