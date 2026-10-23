import { Router, ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import authRoutes from './auth/routes';
import { requireAdmin, requireAdminMutation } from './auth/middleware';
import contentRoutes from './content/routes';
import dataRoutes from './data/routes';
import partyRoutes from './data/party-routes';
import assetRoutes from './assets';
import { HttpError } from './common';
import monitoringRoutes from '../monitoring/routes';

const router = Router();
router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});
router.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
router.use(authRoutes);
router.use(requireAdmin);
router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
router.use((req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return next();
    const allowMultipart = req.method === 'POST' && req.path === '/assets/images';
    return requireAdminMutation({ allowMultipart })(req, res, next);
});
router.use(dataRoutes);
router.use(partyRoutes);
router.use(monitoringRoutes);
router.use(assetRoutes);
router.use(contentRoutes);
router.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Admin endpoint not found.' });
});

const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next;
    if (res.headersSent) return;
    const malformedJson = error instanceof SyntaxError && 'body' in error;
    const status = error instanceof HttpError ? error.status : malformedJson ? 400 : 503;
    const message = error instanceof HttpError ? error.message : malformedJson ? 'Invalid JSON.' : 'Admin service unavailable.';
    res.status(status).json({ success: false, error: message });
};
router.use(handleError);
export default router;
