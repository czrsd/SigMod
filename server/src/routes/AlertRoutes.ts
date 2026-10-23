import { Router } from 'express';
import AlertController from '../controllers/AlertController';

const router = Router();

router.get('/alert', AlertController.getAlert);
router.post('/alert/update', (_req, res) => {
    res.status(410).json({ success: false, error: 'Use the authenticated admin alert API.' });
});

export default router;
