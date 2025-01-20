import { Request, Response, Router } from 'express';
import { wsHandler } from '../socket/setup';
import AccountModel from '../models/AccountModel';
import getPlayers from '../utils/getTotalPlayers';

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

export default router;
