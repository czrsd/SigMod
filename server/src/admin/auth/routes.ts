import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { AdminOAuthTransactionModel, AdminSessionModel } from './models';
import {
    cookieOptions,
    csrfForSessionToken,
    exactOrigin,
    getCookieToken,
    hash,
    ABSOLUTE_MS,
    IDLE_MS,
    OAUTH_TTL_MS,
    pkceChallenge,
    randomToken,
    readAdminConfig,
    safeEqual,
} from './security';
import { HttpError } from '../common';
import { auditAdminAction } from '../common';
import './types';

const router = Router();
const txCookie = (secure: boolean): string => (secure ? '__Host-sigmod-admin-oauth' : 'sigmod-admin-oauth-dev');
const jsonError = (res: Response, status: number, message: string): void => {
    res.status(status).json({ error: message });
};
const noCache = (_req: Request, res: Response, next: NextFunction): void => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    next();
};
router.use(noCache);
const oauthRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
});

router.get('/auth/discord', oauthRateLimit, async (_req, res, next) => {
    try {
        const config = readAdminConfig();
        const state = randomToken(32);
        const browser = randomToken(32);
        const verifier = randomToken(48);
        await AdminOAuthTransactionModel.create({
            stateHash: hash(state),
            browserHash: hash(browser),
            verifier,
            expiresAt: new Date(Date.now() + OAUTH_TTL_MS),
        });
        res.cookie(txCookie(config.secureCookie), browser, { ...cookieOptions(config, OAUTH_TTL_MS), httpOnly: true });
        const authorize = new URL('https://discord.com/oauth2/authorize');
        authorize.searchParams.set('client_id', config.clientId);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('redirect_uri', config.redirectUri);
        authorize.searchParams.set('scope', 'identify');
        authorize.searchParams.set('state', state);
        authorize.searchParams.set('code_challenge', pkceChallenge(verifier));
        authorize.searchParams.set('code_challenge_method', 'S256');
        res.redirect(302, authorize.toString());
    } catch (error) {
        next(error);
    }
});

router.get('/auth/discord/callback', oauthRateLimit, async (req, res, next) => {
    let config;
    try {
        config = readAdminConfig();
    } catch (error) {
        next(error);
        return;
    }
    res.clearCookie(txCookie(config.secureCookie), cookieOptions(config));
    const fail = (): void => {
        res.redirect(302, `${config.adminOrigin}/admin/?adminAuth=error`);
    };
    const state = typeof req.query.state === 'string' && req.query.state.length <= 128 ? req.query.state : '';
    const code = typeof req.query.code === 'string' && req.query.code.length <= 2048 ? req.query.code : '';
    const browser = getCookieToken(req, txCookie(config.secureCookie));
    if (!state || !code || !browser) {
        fail();
        return;
    }

    try {
        const tx = await AdminOAuthTransactionModel.findOneAndDelete({ stateHash: hash(state) });
        if (!tx || tx.expiresAt <= new Date() || !safeEqual(tx.browserHash, hash(browser))) {
            fail();
            return;
        }
        const tokenResponse = await axios.post(
            'https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: config.redirectUri,
                code_verifier: tx.verifier,
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 8000,
                maxRedirects: 0,
            }
        );
        const accessToken = tokenResponse.data?.access_token;
        if (typeof accessToken !== 'string' || accessToken.length > 4096) {
            fail();
            return;
        }
        const discord = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 8000,
            maxRedirects: 0,
        });
        const discordId = discord.data?.id;
        if (typeof discordId !== 'string' || discordId !== config.adminId) {
            fail();
            return;
        }
        const now = new Date();
        const token = randomToken(32);
        const csrfToken = csrfForSessionToken(token);
        let displayName = 'Admin';
        if (typeof discord.data?.global_name === 'string' && discord.data.global_name.length > 0) {
            displayName = discord.data.global_name.slice(0, 128);
        } else if (typeof discord.data?.username === 'string') {
            displayName = discord.data.username.slice(0, 128);
        }
        await AdminSessionModel.create({
            tokenHash: hash(token),
            csrfHash: hash(csrfToken),
            adminId: discordId,
            displayName,
            lastSeenAt: now,
            absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS),
            expiresAt: new Date(now.getTime() + IDLE_MS),
        });
        res.cookie(config.cookieName, token, { ...cookieOptions(config, IDLE_MS) });
        auditAdminAction('login', discordId);
        res.redirect(302, `${config.adminOrigin}/admin/`);
    } catch {
        fail();
    }
});

router.get('/auth/session', async (req, res, next) => {
    try {
        const config = readAdminConfig();
        if (req.get('origin') && !exactOrigin(req, config.adminOrigin)) {
            jsonError(res, 403, 'Forbidden');
            return;
        }
        const token = getCookieToken(req, config.cookieName);
        if (!token) {
            jsonError(res, 401, 'Authentication required');
            return;
        }
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
            jsonError(res, 401, 'Authentication required');
            return;
        }
        const csrfToken = csrfForSessionToken(token);
        const nextExpiry = new Date(Math.min(Date.now() + IDLE_MS, session.absoluteExpiresAt.getTime()));
        await AdminSessionModel.updateOne(
            { _id: session._id },
            { $set: { csrfHash: hash(csrfToken), lastSeenAt: now, expiresAt: nextExpiry } }
        );
        res.cookie(config.cookieName, token, cookieOptions(config, Math.max(0, nextExpiry.getTime() - Date.now())));
        res.json({ authenticated: true, admin: { id: session.adminId, displayName: session.displayName }, csrfToken });
    } catch (error) {
        next(error);
    }
});

router.post('/auth/logout', async (req, res, next) => {
    try {
        const config = readAdminConfig();
        if (!exactOrigin(req, config.adminOrigin)) {
            jsonError(res, 403, 'Forbidden');
            return;
        }
        const contentType = req.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
        if (contentType !== 'application/json') {
            jsonError(res, 415, 'Unsupported media type');
            return;
        }
        const token = getCookieToken(req, config.cookieName);
        const csrfToken = req.get('x-admin-csrf');
        if (token) {
            const session = await AdminSessionModel.findOne({ tokenHash: hash(token) });
            if (session && (typeof csrfToken !== 'string' || csrfToken.length > 128 || !safeEqual(hash(csrfToken), session.csrfHash))) {
                jsonError(res, 403, 'Forbidden');
                return;
            }
            if (session) {
                await AdminSessionModel.deleteOne({ _id: session._id });
                auditAdminAction('logout', session.adminId);
            }
        }
        res.clearCookie(config.cookieName, cookieOptions(config));
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError && status < 500 ? error.message : 'Admin authentication failed';
    jsonError(res, status, message);
});

export default router;
