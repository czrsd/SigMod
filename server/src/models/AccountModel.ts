import mongoose, { Document, Schema } from 'mongoose';

export type IAccount = Document & {
    _id: string;
    username: string;
    password?: string;
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
    username: { type: String, required: true },
    password: { type: String, required: false },
    imageURL: { type: String, required: true },
    role: { type: String, required: true },
    bio: { type: String, required: false },
    badges: { type: [String], required: true },
    online: { type: Boolean, required: true },
    lastOnline: { type: Date, default: Date.now },
    visible: { type: Boolean, required: true },
    create_time: { type: Date, default: Date.now },
});

const AccountModel = mongoose.model<IAccount>('moduser', modAccountSchema);

export default AccountModel;
