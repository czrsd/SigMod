import mongoose, { Document } from 'mongoose';

export type ChatDocument = Document & {
    _id?: mongoose.Schema.Types.ObjectId;
    sender_id: mongoose.Schema.Types.ObjectId;
    content: string;
    timestamp: Date;
};

const chatSchema = new mongoose.Schema({
    sender_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'moduser',
        required: true,
    },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});

const ModChatModel = mongoose.model<ChatDocument>('mod_message', chatSchema);

export default ModChatModel;
