declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
                sessionVersion?: number;
            };
        }
    }
}

export * from './auth';
export * from './discord';
export * from './friends';
export * from './socket';
export * from './alert';
