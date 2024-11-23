import { RequestHandler, Router } from 'express';
import AccountController from '../controllers/Friends/AccountController';

const router = Router();

router.post(
    '/register',
    AccountController.register as unknown as RequestHandler
);

export default router;
