import { NextFunction, Request, Response } from 'express';

export function requireUser(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        return res.status(403).json({
            success: false,
            message: 'Invalid session. Please refresh the page or login again.',
        });
    }

    next();
}
