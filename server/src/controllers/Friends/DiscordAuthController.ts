import { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import axios from 'axios';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwtUtils';
import { DiscordAccountConflict, resolveDiscordAccount } from '../../services/discordAccount';
import logger from '../../utils/logger';

const redirectUri = () =>
    process.env.NODE_ENV === 'development'
        ? 'http://localhost:3001/api/v5/discord/callback'
        : 'https://mod.czrsd.com/api/v5/discord/callback';
const stateCookie = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax' as const,
    path: '/api/v5/discord',
});

class DiscordAuthController {
    start(_req: Request, res: Response) {
        const state = randomBytes(32).toString('hex');
        res.setHeader('Cache-Control', 'no-store');
        res.cookie('mod_discord_state', state, { ...stateCookie(), maxAge: 10 * 60 * 1000 });
        const url = new URL('https://discord.com/oauth2/authorize');
        url.search = new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID || '',
            response_type: 'code',
            redirect_uri: redirectUri(),
            scope: 'identify',
            state,
        }).toString();
        return res.redirect(url.toString());
    }

    async callback(req: Request, res: Response) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        const { code, state } = req.query;
        const expected = req.cookies?.mod_discord_state;
        res.clearCookie('mod_discord_state', stateCookie());
        if (
            typeof state !== 'string' ||
            !/^[0-9a-f]{64}$/.test(state) ||
            typeof expected !== 'string' ||
            !/^[0-9a-f]{64}$/.test(expected) ||
            !timingSafeEqual(Buffer.from(state), Buffer.from(expected))
        ) {
            return res
                .status(400)
                .json({ success: false, message: 'Discord login expired or was not started here. Please try signing in again.' });
        }
        if (typeof code !== 'string' || !code || code.length > 2048) {
            return res.status(400).json({ success: false, message: 'Discord authorization was cancelled or no code was provided.' });
        }
        try {
            const params = new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID || '',
                client_secret: process.env.DISCORD_CLIENT_SECRET || '',
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri(),
            });
            const response = await axios.post('https://discord.com/api/oauth2/token', params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10_000,
            });
            if (typeof response.data?.access_token !== 'string') throw new Error('Missing Discord access token.');
            const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `Bearer ${response.data.access_token}` },
                timeout: 10_000,
            });
            const { account } = await resolveDiscordAccount(userResponse.data);
            const accessToken = generateAccessToken(account._id.toString(), account.session_version);
            const refreshToken = generateRefreshToken(account._id.toString(), account.session_version);
            res.cookie('mod_accessToken', accessToken, { maxAge: 300000, httpOnly: true, secure: true, sameSite: 'none' });
            res.cookie('mod_refreshToken', refreshToken, { maxAge: 31536000000, httpOnly: true, secure: true, sameSite: 'none' });
            const message = JSON.stringify({ type: 'SIGMOD_AUTH_SUCCESS', payload: { accessToken, refreshToken } }).replace(
                /</g,
                '\\u003c'
            );
            return res.send(`<!DOCTYPE html><html><head><title>Login Complete</title></head><body><script>
                if (window.opener) {
                    const message = ${message};
                    for (const origin of ['https://sigmally.com', 'https://beta.sigmally.com', 'https://one.sigmally.com', 'http://localhost:5173']) {
                        window.opener.postMessage(message, origin);
                    }
                }
                window.close();
                </script>Login complete. You can close this window.</body></html>`);
        } catch (error) {
            if (error instanceof DiscordAccountConflict) return res.status(409).json({ success: false, message: error.message });
            // Axios errors can contain OAuth codes, provider tokens and the client secret.
            logger.error('Discord authentication failed.', { code: (error as { code?: string }).code });
            return res.status(502).json({ success: false, message: 'Discord authentication failed. Please try again.' });
        }
    }
}

export default new DiscordAuthController();
