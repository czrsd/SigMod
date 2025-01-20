import { Router } from 'express';
import AnnouncementController from '../controllers/AnnouncementController';

const router = Router();

router.get('/announcements', AnnouncementController.getAnnouncements);
router.get('/announcement/:id', AnnouncementController.getAnnouncementById);

export default router;
