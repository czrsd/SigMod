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
import { wsServer } from './socket/setup';

const app: Application = express();
const PORT = process.env.PORT || 3001;

(async () => {
    try {
        await connectDB();
    } catch (err) {
        logger.error('Failed to initialize database connection. Exiting.', err);
        process.exit(1);
    }
})();

setupMiddleware(app);

const server = app.listen(PORT, () => logger.info(`Server running on port ${PORT}.`));

setupExitHandlers(server, wsServer);

server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws' || req.url === '/ws/v5' || req.url?.startsWith('/ws')) {
        wsServer.handleUpgrade(req, socket, head, (ws) => wsServer.emit('connection', ws, req));
    }
});
