import { Request, Response } from 'express';
import { wsHandler } from '../socket/setup';
import crypto from 'crypto';
import logger from '../utils/logger';

const isAuthorizedAdmin = (key: unknown): boolean => {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey || typeof key !== 'string' || !key) return false;
    try {
        const keyBuf = Buffer.from(key);
        const adminBuf = Buffer.from(adminKey);
        if (keyBuf.length !== adminBuf.length) return false;
        return crypto.timingSafeEqual(keyBuf, adminBuf);
    } catch {
        return false;
    }
};

class AlertController {
    async getAlert(req: Request, res: Response) {
        res.json({
            success: true,
            data: wsHandler.alert,
        });
    }

    async setAlert(req: Request, res: Response) {
        try {
            const { key, title, description, enabled, link, buttonText } = req.body;
            if (!isAuthorizedAdmin(key)) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized.',
                });
                return;
            }

            wsHandler.alert = {
                title: String(title ?? ''),
                description: String(description ?? ''),
                enabled: Boolean(enabled),
                link: link ? String(link) : null,
                buttonText: buttonText ? String(buttonText) : null,
            };

            wsHandler.sendToAll({
                type: 'alert',
                content: wsHandler.alert,
            });

            res.status(200).json({
                success: true,
                data: wsHandler.alert,
            });
        } catch (e) {
            logger.error('Error updating alert:', e);
            res.status(500).json({
                success: false,
                message: 'Something went wrong. Please try again.',
            });
        }
    }
}

export default new AlertController();
