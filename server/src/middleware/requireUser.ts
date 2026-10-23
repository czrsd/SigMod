import { Request, Response, NextFunction } from 'express';
import { generateAccessToken, verifyAccessToken, verifyRefreshToken } from '../utils/jwtUtils';
import AccountModel from '../models/AccountModel';

export const requireUser = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    let accessToken: string | undefined = req.cookies?.mod_accessToken;
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
        accessToken = authHeader.slice('Bearer '.length).trim() || undefined;
    }

    if (accessToken) {
        let decoded;
        try {
            decoded = verifyAccessToken(accessToken);
        } catch {}
        if (decoded) {
            try {
                const account = await AccountModel.findById(decoded.userId).select('_id merged_into session_version');
                if (!account || account.merged_into || (account.session_version ?? 0) !== (decoded.sessionVersion ?? 0)) {
                    return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
                }
                req.user = { userId: decoded.userId, sessionVersion: decoded.sessionVersion ?? 0 };
                return next();
            } catch {
                return res.status(503).json({ success: false, message: 'Authentication unavailable.' });
            }
        }
    }

    const refreshToken = req.cookies?.mod_refreshToken || req.headers['x-refresh-token'];
    if (!refreshToken || typeof refreshToken !== 'string') {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    let decodedRefreshToken;
    try {
        decodedRefreshToken = verifyRefreshToken(refreshToken);
    } catch {
        return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
    try {
        const { userId } = decodedRefreshToken;

        const user = await AccountModel.findById(userId);
        if (!user || user.merged_into || (user.session_version ?? 0) !== (decodedRefreshToken.sessionVersion ?? 0)) {
            return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
        }

        const newAccessToken = generateAccessToken(userId, user.session_version);
        res.cookie('mod_accessToken', newAccessToken, {
            maxAge: 300000,
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });
        res.setHeader('x-new-access-token', newAccessToken);

        req.user = { userId, sessionVersion: decodedRefreshToken.sessionVersion ?? 0 };
        return next();
    } catch {
        return res.status(503).json({ success: false, message: 'Authentication unavailable.' });
    }
};
