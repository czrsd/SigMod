import { Request, Response, Router } from 'express';
import { wsHandler } from '../socket/setup';
import AccountModel from '../models/AccountModel';
import getPlayers from '../utils/getTotalPlayers';
import fs from 'fs';
import path from 'path';

const router = Router();

router.get('/onlineUsers', async (req: Request, res: Response) => {
    try {
        const onlineUsers = wsHandler.sockets.size;
        const onlineModUsers = await AccountModel.find({ online: 1 });

        res.status(200).json({
            success: true,
            sigmallyPlayers: await getPlayers(),
            onlineUsers,
            onlineModUsers: onlineModUsers.length,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// track usage of this feature to improve sigmod
router.get('/screenshot', (_, res: Response) => {
    const filePath = path.join(process.cwd(), 'screenshots');

    fs.readFile(filePath, 'utf8', (err, data) => {
        const count = parseInt(data) || 0;

        fs.writeFile(filePath, String(count + 1), () => {
            res.sendStatus(200);
        });
    });
});

export default router;
