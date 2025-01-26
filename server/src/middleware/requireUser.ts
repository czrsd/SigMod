import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { generateAccessToken } from '../utils/jwtUtils';
import AccountModel from '../models/AccountModel';
import { JWTPayload_accessToken, JWTPayload_refreshToken } from '../types';

export const requireUser = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<Response | void> => {
    let accessToken = req.cookies.mod_accessToken;

    if (!accessToken) {
        const refreshToken = req.cookies.mod_refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        try {
            const decodedRefreshToken = jwt.verify(
                refreshToken,
                process.env.JWT_PRIVATE_KEY || ''
            ) as JWTPayload_refreshToken;

            const { userId } = decodedRefreshToken;

            const newAccessToken = generateAccessToken(userId);
            res.cookie('mod_accessToken', newAccessToken, {
                maxAge: 300000, // 5 minutes
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            });

            const user = await AccountModel.findOne({ _id: userId });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            req.user = { userId };
            return next();
        } catch (err) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }
    }

    try {
        req.user = jwt.verify(
            accessToken,
            process.env.JWT_PRIVATE_KEY || ''
        ) as JWTPayload_accessToken;

        return next();
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
};
