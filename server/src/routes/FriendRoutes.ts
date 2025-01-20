import { RequestHandler, Router } from 'express';
import AccountController from '../controllers/Friends/AccountController';
import { requireUser } from '../middleware/requireUser';

const router = Router();

router.post(
    '/register',
    AccountController.register as unknown as RequestHandler
);

router.post('/login', AccountController.login as unknown as RequestHandler);

router.get(
    '/auth',
    requireUser as unknown as RequestHandler,
    AccountController.auth as unknown as RequestHandler
);

export default router;
