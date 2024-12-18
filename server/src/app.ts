import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import useragent from 'express-useragent';
import rateLimit from 'express-rate-limit';
import setupRoutes from './routes';

const SetupMiddleware = (app: Application) => {
    app.use(
        cors({
            origin: [
                'https://beta.sigmally.com',
                'https://one.sigmally.com',
                'https://tournament.czrsd.com',
                'http://localhost:5173',
                'http://localhost:3003',
            ],
            methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
            credentials: true,
        })
    );

    app.use(useragent.express());

    app.use(express.json());
    app.use(cookieParser());
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                },
            },
        })
    );

    app.use(
        rateLimit({
            windowMs: 60 * 1000,
            limit: 40,
            message: 'Too many requests, please try again later.',
        })
    );

    setupRoutes(app);
};

export default SetupMiddleware;
