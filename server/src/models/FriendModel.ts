import mongoose, { Document, Model, Schema } from 'mongoose';

type Friend = Document & {
    user_id: mongoose.Types.ObjectId;
    friend_id: mongoose.Types.ObjectId;
    timestamp: Date;
};

const friendsSchema = new Schema<Friend>({
    user_id: { type: Schema.Types.ObjectId, required: true },
    friend_id: { type: Schema.Types.ObjectId, required: true },
    timestamp: { type: Date, default: Date.now },
});

const friendsModel: Model<Friend> = mongoose.model<Friend>(
    'friend',
    friendsSchema
);

export default friendsModel;
