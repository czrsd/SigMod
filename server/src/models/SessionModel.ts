import mongoose, { Document, Model, Schema } from 'mongoose';

export type ISession = Document & {
    _id: string;
    sessionId: mongoose.Types.ObjectId;
    userId: string;
    valid: boolean;
};

const sessionSchema = new Schema<ISession>({
    sessionId: {
        type: Schema.Types.ObjectId,
        required: true,
        unique: true,
        default: () => new mongoose.Types.ObjectId(),
    },
    userId: { type: String, required: true },
    valid: { type: Boolean, default: true },
});

const Session: Model<ISession> = mongoose.model<ISession>(
    'Session',
    sessionSchema
);

export default Session;
