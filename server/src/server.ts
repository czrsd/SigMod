import { config as loadConfig } from 'typescript-eslint';
loadConfig();
import express, { Application } from 'express';
import logger from './utils/logger';
import { wsServer } from './socket/setup';
import setupMiddleware from './app';
import connectDB from './db/connection';

const app: Application = express();
const PORT = process.env.PORT || 3001;

(async () => {
    await connectDB();
})();

setupMiddleware(app);

const server = app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}.`);
});

server.on('upgrade', (req, socket, head): void => {
    if (req.url === '/ws') {
        wsServer.handleUpgrade(req, socket, head, (ws): void => {
            wsServer.emit('connection', ws, req);
        });
    }
});
