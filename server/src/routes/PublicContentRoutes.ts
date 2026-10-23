import { Router } from 'express';
import { asyncRoute, HttpError } from '../admin/common';
import { getPublicChatFilterSnapshot, getPublicContentSnapshot, getPublicLocalePack } from '../admin/content/public';

const router = Router();
router.get(
    '/client-content',
    asyncRoute(async (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.json({ success: true, data: await getPublicContentSnapshot() });
    })
);
router.get(
    '/chat-filter',
    asyncRoute(async (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.json(await getPublicChatFilterSnapshot());
    })
);
router.get(
    '/locales/:locale',
    asyncRoute(async (req, res) => {
        const locale = typeof req.params.locale === 'string' ? req.params.locale.replace(/\.json$/, '') : '';
        const pack = await getPublicLocalePack(locale);
        if (!pack) throw new HttpError(404, 'Language pack not found.');
        res.setHeader('Cache-Control', 'no-cache');
        res.json(pack);
    })
);
export default router;
