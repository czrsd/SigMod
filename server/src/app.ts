import express, { Application, ErrorRequestHandler } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import useragent from 'express-useragent';
import rateLimit from 'express-rate-limit';
import setupRoutes from './routes';
import { HttpError } from './admin/common';
import { recordHttpMetrics } from './monitoring/instrumentation';

const SetupMiddleware = (app: Application) => {
    app.set('trust proxy', 1);
    app.use(recordHttpMetrics);

    const publicCors = cors({
        origin: [
            'https://sigmally.com',
            'https://beta.sigmally.com',
            'https://one.sigmally.com',
            'http://localhost:5173',
            'http://localhost:3001',
        ],
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        credentials: true,
    });
    const isAdminPath = (pathname: string) => pathname === '/api/v5/admin' || pathname.startsWith('/api/v5/admin/');
    const isDashboardPath = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/');
    app.use((req, res, next) => {
        if (isAdminPath(req.path) || isDashboardPath(req.path)) return next();
        return publicCors(req, res, next);
    });

    app.use(useragent.express());

    app.use(express.json());
    app.use(cookieParser());
    app.use(
        helmet({
            crossOriginOpenerPolicy: false,
            crossOriginResourcePolicy: false,
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'"],
                },
            },
        })
    );

    app.use(
        rateLimit({
            windowMs: 60 * 1000,
            limit: 40,
            skip: (req) => isAdminPath(req.path) || isDashboardPath(req.path),
            message: 'Too many requests, please try again later.',
        })
    );

    setupRoutes(app);
    const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
        void _next;
        if (res.headersSent) return;
        const syntax = error instanceof SyntaxError && 'body' in error;
        const status = error instanceof HttpError ? error.status : syntax ? 400 : 503;
        res.status(status).json({
            success: false,
            error: error instanceof HttpError ? error.message : syntax ? 'Invalid JSON.' : 'Service unavailable.',
        });
    };
    app.use(errors);
};

export default SetupMiddleware;
