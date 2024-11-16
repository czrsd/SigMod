import { NextFunction, Request, Response } from 'express';
import { getSession } from '../utils/sessions';
import { signJWT, verifyJWT } from '../utils/JWT';

async function deserializeUser(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const { mod_accessToken, mod_refreshToken } = req.cookies;

    const { payload: accessPayload } = verifyJWT(mod_accessToken);

    // @ts-ignore
    if (accessPayload && !req.user) {
        // @ts-ignore
        req.user = accessPayload;
        return next();
    }

    // if (!accessExpired) return next();

    let refreshPayload;
    if (mod_refreshToken) {
        refreshPayload = verifyJWT(mod_refreshToken).payload;
    }

    if (!refreshPayload) {
        return next();
    }

    // @ts-ignore
    let session: any = await getSession(refreshPayload.sessionId);
    if (!session) {
        return next();
    }

    const newAccessToken = signJWT(session, '5m');

    res.cookie('mod_accessToken', newAccessToken, {
        maxAge: 300000, // 5 minutes
        httpOnly: true,
        secure: true,
        sameSite: 'none',
    });

    // @ts-ignore
    req.user = verifyJWT(newAccessToken).payload;

    return next();
}

export default deserializeUser;
