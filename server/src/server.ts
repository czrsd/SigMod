import { config as loadConfig } from 'dotenv';
import { expand as expandConfig } from 'dotenv-expand';
import logger from './utils/logger';
import setupExitHandlers from './utils/exitHandler';

const loadEnvironment = () => {
    const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
    try {
        expandConfig(loadConfig());
        expandConfig(loadConfig({ path: envFile }));
        logger.info(`Loaded ${process.env.NODE_ENV || 'development'} environment.`);
    } catch (err) {
        logger.error('Failed to load environment variables.', err);
        process.exit(1);
    }
};

loadEnvironment();

import express, { Application } from 'express';
import './config/passport';
import connectDB from './db/connection';
import setupMiddleware from './app';
import { wsServer, wsHandler } from './socket/setup';
import { validateJwtConfiguration } from './utils/jwtUtils';
import { startClientContentPublisher, ClientContentSnapshot } from './services/clientContent';
import { startServerMonitoring } from './monitoring/runtime';

const app: Application = express();
const PORT = process.env.PORT || 3001;

setupMiddleware(app);

(async () => {
    try {
        validateJwtConfiguration();
        await connectDB();
        startServerMonitoring();
        const stopPublisher = await startClientContentPublisher((type, content) => {
            if (type === 'client-content') wsHandler.alert = (content as ClientContentSnapshot).alert;
            wsHandler.sendToAll({ type, content });
        });
        const server = app.listen(PORT, () => logger.info(`Server running on port ${PORT}.`));
        server.on('close', stopPublisher);
        setupExitHandlers(server, wsServer);
        server.on('upgrade', (req, socket, head) => {
            if (req.url === '/ws' || req.url === '/ws/v5') {
                wsServer.handleUpgrade(req, socket, head, (ws) => wsServer.emit('connection', ws, req));
            } else socket.destroy();
        });
    } catch {
        logger.error('Server initialization failed. Check database and JWT configuration.');
        process.exit(1);
    }
})();
