declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
            };
        }
    }
}

export * from './auth';
export * from './discord';
export * from './friends';
export * from './socket';
export * from './tournament';
export * from './alert';
