import { Request, Response, NextFunction } from 'express';
import { generateAccessToken, verifyAccessToken, verifyRefreshToken } from '../utils/jwtUtils';
import AccountModel from '../models/AccountModel';

export const requireUser = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    let accessToken = req.cookies.mod_accessToken;
    const authHeader = req.headers.authorization;

    if (!accessToken && authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.split(' ')[1];
    }

    if (!accessToken) {
        const refreshToken = req.cookies.mod_refreshToken || req.headers['x-refresh-token'];

        if (!refreshToken || typeof refreshToken !== 'string') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        try {
            const decodedRefreshToken = verifyRefreshToken(refreshToken);
            const { userId } = decodedRefreshToken;

            const user = await AccountModel.findById(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            const newAccessToken = generateAccessToken(userId);
            res.cookie('mod_accessToken', newAccessToken, {
                maxAge: 300000, // 5 minutes
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            });
            res.setHeader('x-new-access-token', newAccessToken);

            req.user = { userId };
            return next();
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid refresh token' });
        }
    }

    try {
        const decoded = verifyAccessToken(accessToken);
        req.user = { userId: decoded.userId };
        return next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
};
