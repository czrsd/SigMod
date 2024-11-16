import mongoose, { Document, Model, Schema } from 'mongoose';

type UserSettings = Document & {
    target: string;
    static_status: string;
    accept_requests: boolean;
    highlight_friends: boolean;
    highlight_color: string;
};

const userSettingsSchema = new Schema<UserSettings>({
    target: { type: String, required: true },
    static_status: { type: String, required: true },
    accept_requests: { type: Boolean, required: true },
    highlight_friends: { type: Boolean, required: true },
    highlight_color: { type: String, required: true },
});

const userSettingsModel: Model<UserSettings> = mongoose.model<UserSettings>(
    'user_setting',
    userSettingsSchema
);

export default userSettingsModel;
