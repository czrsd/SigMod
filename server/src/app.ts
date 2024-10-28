import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

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
};

export default SetupMiddleware;
