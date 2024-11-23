import { config as loadConfig } from 'dotenv';
import { expand as expandConfig } from 'dotenv-expand';

const commonConfig = loadConfig();
expandConfig(commonConfig);

if (process.env.NODE_ENV === 'production') {
    const prodConfig = loadConfig({ path: '.env.production' });
    expandConfig(prodConfig);
} else {
    const devConfig = loadConfig({ path: '.env.development' });
    expandConfig(devConfig);
}

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
