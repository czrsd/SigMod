import type { RequestHandler } from 'express';
import { AdminSessionModel } from './models';
import { HttpError } from '../common';
import { cookieOptions, exactOrigin, getCookieToken, hash, IDLE_MS, readAdminConfig, safeEqual } from './security';
import './types';

const createAdminMiddleware = (mutation: boolean, allowMultipart = false): RequestHandler => {
    return (req, res, next) => {
        void (async () => {
            const config = readAdminConfig();
            if (req.get('origin') && !exactOrigin(req, config.adminOrigin)) throw new HttpError(403, 'Forbidden');
            const token = getCookieToken(req, config.cookieName);
            if (!token) throw new HttpError(401, 'Authentication required');
            const now = new Date();
            const session = await AdminSessionModel.findOne({ tokenHash: hash(token) });
            if (
                !session ||
                session.adminId !== config.adminId ||
                session.expiresAt <= now ||
                session.absoluteExpiresAt <= now ||
                now.getTime() - session.lastSeenAt.getTime() >= IDLE_MS
            ) {
                if (session) await AdminSessionModel.deleteOne({ _id: session._id });
                throw new HttpError(401, 'Authentication required');
            }
            if (mutation) {
                const csrfToken = req.get('x-admin-csrf');
                const csrfMatches =
                    typeof csrfToken === 'string' && csrfToken.length <= 128 && safeEqual(hash(csrfToken), session.csrfHash);
                if (!exactOrigin(req, config.adminOrigin) || !csrfMatches) throw new HttpError(403, 'Forbidden');
                const contentType = req.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
                if (contentType !== 'application/json' && !(allowMultipart && contentType === 'multipart/form-data')) {
                    throw new HttpError(415, 'Unsupported media type');
                }
            }
            req.admin = { id: session.adminId, displayName: session.displayName, sessionId: String(session._id) };
            res.locals.admin = req.admin;
            const remainingAbsolute = Math.max(0, session.absoluteExpiresAt.getTime() - Date.now());
            const nextExpiry = new Date(Math.min(Date.now() + IDLE_MS, session.absoluteExpiresAt.getTime()));
            await AdminSessionModel.updateOne(
                { _id: session._id, tokenHash: session.tokenHash, adminId: config.adminId },
                { $set: { lastSeenAt: now, expiresAt: nextExpiry } }
            );
            res.cookie(config.cookieName, token, cookieOptions(config, Math.min(IDLE_MS, remainingAbsolute)));
            next();
        })().catch((error: unknown) => {
            if (res.headersSent) {
                next(error);
                return;
            }
            const status = error instanceof HttpError ? error.status : 500;
            const message = error instanceof HttpError && status < 500 ? error.message : 'Admin authentication failed';
            res.status(status).json({ error: message });
        });
    };
};

export const requireAdmin: RequestHandler = createAdminMiddleware(false);
export const requireAdminMutation = (options: { allowMultipart?: boolean } = {}): RequestHandler =>
    createAdminMiddleware(true, options.allowMultipart === true);
