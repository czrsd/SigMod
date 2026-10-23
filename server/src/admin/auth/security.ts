import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { CookieOptions, Request } from 'express';
import { HttpError } from '../common';

export const IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_TTL_MS = 5 * 60 * 1000;
const COOKIE_MAX = 256;

export type AdminConfig = {
    adminId: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    adminOrigin: string;
    secureCookie: boolean;
    cookieName: string;
};

export const readAdminConfig = (): AdminConfig => {
    const adminId = process.env.DISCORD_ADMIN_ID?.trim();
    const clientId = process.env.DISCORD_CLIENT_ID?.trim();
    const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
    const redirectOverride = process.env.DISCORD_ADMIN_REDIRECT_URI?.trim();
    const originRaw = process.env.ADMIN_ORIGIN?.trim();
    if (!adminId || !/^\d{17,20}$/.test(adminId) || !clientId || !clientSecret || !originRaw) {
        throw new HttpError(503, 'Admin authentication is not configured');
    }

    let redirect: URL;
    let origin: URL;
    try {
        origin = new URL(originRaw);
        redirect = new URL(redirectOverride || '/api/v5/admin/auth/discord/callback', origin);
    } catch {
        throw new HttpError(503, 'Admin authentication is not configured');
    }
    const production = process.env.NODE_ENV === 'production';
    const isLocalHttp = (url: URL): boolean => url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
        redirect.origin !== origin.origin ||
        redirect.username ||
        redirect.password ||
        origin.username ||
        origin.password ||
        origin.pathname !== '/' ||
        origin.search ||
        origin.hash ||
        redirect.pathname !== '/api/v5/admin/auth/discord/callback' ||
        redirect.search ||
        redirect.hash ||
        (production && (redirect.protocol !== 'https:' || origin.protocol !== 'https:')) ||
        (!production &&
            ((redirect.protocol !== 'https:' && !isLocalHttp(redirect)) || (origin.protocol !== 'https:' && !isLocalHttp(origin))))
    ) {
        throw new HttpError(503, 'Admin authentication is not configured');
    }
    const secureCookie = !(isLocalHttp(origin) && !production);
    return {
        adminId,
        clientId,
        clientSecret,
        redirectUri: redirect.toString(),
        adminOrigin: origin.origin,
        secureCookie,
        cookieName: secureCookie ? '__Host-sigmod-admin' : 'sigmod-admin-dev',
    };
};

export const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');
export const pkceChallenge = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');
export const csrfForSessionToken = (token: string): string => createHash('sha256').update(`admin-csrf:${token}`).digest('base64url');

export const safeEqual = (left: string, right: string): boolean => {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
};

export const cookieOptions = (config: AdminConfig, maxAge?: number): CookieOptions => ({
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: 'lax',
    path: '/',
    ...(maxAge === undefined ? {} : { maxAge }),
});

export const getCookieToken = (req: Request, cookieName: string): string | undefined => {
    const token = req.cookies?.[cookieName];
    return typeof token === 'string' && token.length <= COOKIE_MAX ? token : undefined;
};

export const exactOrigin = (req: Request, expectedOrigin: string): boolean => {
    const origin = req.get('origin');
    if (!origin) return false;
    try {
        return new URL(origin).origin === expectedOrigin && origin === new URL(expectedOrigin).origin;
    } catch {
        return false;
    }
};
