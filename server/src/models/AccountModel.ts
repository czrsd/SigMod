import mongoose, { Document, Schema } from 'mongoose';

export type IAccount = Document & {
    _id: string;
    username: string;
    password?: string;
    discord_id?: string;
    imageURL: string;
    role: string;
    bio?: string;
    badges: string[];
    online: boolean;
    lastOnline: Date;
    visible: boolean;
    create_time: Date;
};

const modAccountSchema: Schema<IAccount> = new mongoose.Schema({
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: false },
    discord_id: { type: String, required: false, unique: true, sparse: true, index: true },
    imageURL: { type: String, required: true },
    role: { type: String, required: true, default: 'Member' },
    bio: { type: String, required: false },
    badges: { type: [String], required: true, default: [] },
    online: { type: Boolean, required: true, default: false, index: true },
    lastOnline: { type: Date, default: Date.now },
    visible: { type: Boolean, required: true, default: true, index: true },
    create_time: { type: Date, default: Date.now },
});

const AccountModel = mongoose.model<IAccount>('moduser', modAccountSchema);

export default AccountModel;
