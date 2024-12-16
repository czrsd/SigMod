import { Router } from 'express';
import FontsController from '../controllers/FontsController';

const router = Router();

router.get('/fonts', FontsController.getFonts);

export default router;
