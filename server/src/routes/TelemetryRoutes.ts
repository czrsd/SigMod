import { Router } from 'express';
import TelemetryController from '../controllers/TelemetryController';

const router = Router();

router.post('/user', TelemetryController.saveUser);

export default router;
