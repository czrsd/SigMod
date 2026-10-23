import type { Request, RequestHandler, Response } from 'express';
import logger from '../utils/logger';

export class HttpError extends Error {
    constructor(
        public readonly status: number,
        message: string
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

export const asyncRoute = (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
        void handler(req, res).catch(next);
    };

export const boundedString = (value: unknown, maxLength: number, field = 'value'): string => {
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
        throw new HttpError(400, `Invalid ${field}`);
    }
    return value;
};

export const boundedInteger = (value: unknown, min: number, max: number, field = 'value'): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new HttpError(400, `Invalid ${field}`);
    }
    return parsed;
};

export const auditAdminAction = (
    action: string,
    adminId: string,
    details: Record<string, string | number | boolean> = {}
): void => {
    logger.info('[admin-audit]', { action, adminId, details });
};
