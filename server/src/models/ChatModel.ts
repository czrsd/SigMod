import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChat extends Document {
    sender_id: mongoose.Types.ObjectId;
    target_id: mongoose.Types.ObjectId;
    content: string;
    timestamp: Date;
}

const chatSchema: Schema<IChat> = new Schema({
    sender_id: { type: Schema.Types.ObjectId, required: true },
    target_id: { type: Schema.Types.ObjectId, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});

const ChatModel: Model<IChat> = mongoose.model<IChat>('message', chatSchema);

export default ChatModel;
