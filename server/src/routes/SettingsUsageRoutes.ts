import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { syncSettingsUsage } from '../controllers/SettingsUsageController';

const router = Router();
router.post('/settings-usage/sync', rateLimit({ windowMs: 60_000, limit: 20 }), syncSettingsUsage);
export default router;
