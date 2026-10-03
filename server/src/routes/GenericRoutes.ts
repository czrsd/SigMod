import { Request, Response, Router } from 'express';
import { wsHandler } from '../socket/setup';
import AccountModel from '../models/AccountModel';
import getPlayers from '../utils/getTotalPlayers';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import logger from '../utils/logger';

const router = Router();

router.get('/health', (_: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/onlineUsers', async (req: Request, res: Response) => {
    try {
        const [sigmallyPlayers, onlineModUsers] = await Promise.all([getPlayers(), AccountModel.countDocuments({ online: true })]);

        res.status(200).json({
            success: true,
            sigmallyPlayers,
            onlineUsers: wsHandler.sockets.size,
            onlineModUsers,
        });
    } catch (error) {
        logger.error('Error fetching online user counts:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

let screenshotCount = 0;
let screenshotLoaded = false;
const screenshotPath = path.join(process.cwd(), 'screenshots');

const loadScreenshotCount = async () => {
    try {
        if (existsSync(screenshotPath)) {
            const data = await fs.readFile(screenshotPath, 'utf8');
            screenshotCount = parseInt(data, 10) || 0;
        }
        screenshotLoaded = true;
    } catch (_) {
        screenshotLoaded = true;
    }
};

router.get('/screenshot', async (_, res: Response) => {
    try {
        if (!screenshotLoaded) {
            await loadScreenshotCount();
        }
        screenshotCount += 1;
        // Non-blocking flush
        fs.writeFile(screenshotPath, String(screenshotCount), 'utf8').catch((err) => {
            logger.warn('Failed to flush screenshot count to disk:', err);
        });
        res.sendStatus(200);
    } catch (err) {
        res.sendStatus(200);
    }
});

export default router;
