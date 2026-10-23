import mongoose, { Schema } from 'mongoose';

export type AdminOAuthTransaction = {
    stateHash: string;
    browserHash: string;
    verifier: string;
    expiresAt: Date;
};

const oauthTransactionSchema = new Schema<AdminOAuthTransaction>(
    {
        stateHash: { type: String, required: true, unique: true },
        browserHash: { type: String, required: true },
        verifier: { type: String, required: true },
        expiresAt: { type: Date, required: true, expires: 0 },
    },
    { timestamps: true }
);

export const AdminOAuthTransactionModel = mongoose.model<AdminOAuthTransaction>('AdminOAuthTransaction', oauthTransactionSchema);

export type AdminSession = {
    tokenHash: string;
    csrfHash: string;
    adminId: string;
    displayName: string;
    lastSeenAt: Date;
    absoluteExpiresAt: Date;
    expiresAt: Date;
};

const adminSessionSchema = new Schema<AdminSession>(
    {
        tokenHash: { type: String, required: true, unique: true },
        csrfHash: { type: String, required: true },
        adminId: { type: String, required: true, index: true },
        displayName: { type: String, required: true, maxlength: 128 },
        lastSeenAt: { type: Date, required: true },
        absoluteExpiresAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true, expires: 0 },
    },
    { timestamps: true }
);

export const AdminSessionModel = mongoose.model<AdminSession>('AdminSession', adminSessionSchema);
