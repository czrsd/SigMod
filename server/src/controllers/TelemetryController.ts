import { Request, Response } from 'express';
import { formatDate, sanitizeNick } from '../utils/helpers';
import { db } from '../db/connection';
import logger from '../utils/logger';

/*
 * SigMod collects user data for the purpose of hosting giveaways and providing Sigmally-related services (e.g., Coins, Subscriptions).
 * Your email is required for these activities and may also be needed for other specific situations.
 * You can disable data collection in the settings of SigMod at any time.
 * Your data will NOT be shared with any third parties and will ALWAYS remain private.
 *
 * If you wish to request the removal of your collected data, please reach out to me via Discord: czrsd.
 * @TODO Add page for removal
 */

class TelemetryController {
    async saveUser(req: Request, res: Response) {
        try {
            const maxPayloadSize = 512000;
            if (
                req.headers['content-length'] &&
                Number(req.headers['content-length']) > maxPayloadSize
            ) {
                res.status(413).json({
                    success: false,
                    message:
                        'Request payload is too large. Maximum size is 500KB.',
                });
                return;
            }

            const ip =
                req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const { browser, platform, version, source } = req.useragent || {};
            const { user } = req.body;

            if (!user || typeof user !== 'object' || !user._id || !user.email) {
                res.status(400).json({
                    success: false,
                    message: '`_id` and `email` are required fields.',
                });
                return;
            }

            user.nick = sanitizeNick(user.nick || 'Unnamed');
            user.ip = ip;
            user.userAgent = { browser, platform, version, source };

            logger.info(
                `[User manager] User authorized: ${user.fullName || 'Unnamed'} on ${formatDate(new Date())}`
            );

            const usersCollection = db.collection('users');
            const userDoc = await usersCollection.findOne({ _id: user._id });

            if (!userDoc) {
                await usersCollection.insertOne(user);
            } else {
                const updates: Record<string, any> = { ...user, ip };
                await usersCollection.updateOne(
                    { _id: user._id },
                    { $set: updates }
                );
            }

            res.json({ success: true });
        } catch (error) {
            console.error(`[TelemetryController] Error:`, error);
            res.status(500).send('Internal Server Error');
        }
    }
}

export default new TelemetryController();
