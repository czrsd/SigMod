import { Router } from 'express';
import AlertController from '../controllers/AlertController';

const router = Router();

router.get('/alert', AlertController.getAlert);
router.post('/alert/update', AlertController.setAlert);

export default router;
