import { RequestHandler, Router } from 'express';
import DiscordAuthController from '../controllers/Friends/DiscordAuthController';

const router = Router();

router.get('/discord/callback', DiscordAuthController.callback as unknown as RequestHandler);

export default router;
