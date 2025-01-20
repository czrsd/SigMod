import { config as loadConfig } from 'dotenv';
import { expand as expandConfig } from 'dotenv-expand';
import logger from './utils/logger';

const loadEnvironment = () => {
    const envFile =
        process.env.NODE_ENV === 'production'
            ? '.env.production'
            : '.env.development';
    try {
        expandConfig(loadConfig());
        expandConfig(loadConfig({ path: envFile }));
        logger.info(
            `Loaded ${process.env.NODE_ENV || 'development'} environment.`
        );
    } catch (err) {
        logger.error('Failed to load environment variables.', err);
        process.exit(1);
    }
};

loadEnvironment();

import './config/passport';
import express, { Application } from 'express';
import { wsServer } from './socket/setup';
import setupMiddleware from './app';
import connectDB from './db/connection';

const app: Application = express();
const PORT = process.env.PORT || 3001;

(async () => {
    try {
        await connectDB();
        logger.info('Database connected.');
    } catch (err) {
        logger.error('Database connection failed.', err);
        process.exit(1);
    }
})();

setupMiddleware(app);

const server = app.listen(PORT, () =>
    logger.info(`Server running on port ${PORT}.`)
);

server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
        wsServer.handleUpgrade(req, socket, head, (ws) =>
            wsServer.emit('connection', ws, req)
        );
    }
});
