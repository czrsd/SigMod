import mongoose, { Document, Model, Schema } from 'mongoose';

type Session = Document & {
    sessionId: mongoose.Types.ObjectId;
    userId: string;
    valid: boolean;
};

const sessionSchema = new Schema<Session>({
    sessionId: {
        type: Schema.Types.ObjectId,
        required: true,
        unique: true,
        default: () => new mongoose.Types.ObjectId(),
    },
    userId: { type: String, required: true },
    valid: { type: Boolean, default: true },
});

const Session: Model<Session> = mongoose.model<Session>(
    'Session',
    sessionSchema
);

export default Session;
