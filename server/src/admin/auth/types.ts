export type AdminIdentity = {
    id: string;
    displayName: string;
    sessionId: string;
};

declare module 'express-serve-static-core' {
    interface Request {
        admin?: AdminIdentity;
    }
}

export {};
