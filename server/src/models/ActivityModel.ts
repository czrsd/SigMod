import mongoose, { Document, Model, Schema } from 'mongoose';

type Activity = Document & {
    userId: string;
    connected: number;
    disconnected: number;
};

const ActivitySchema = new Schema<Activity>({
    userId: { type: String, required: false },
    connected: { type: Number, required: true },
    disconnected: { type: Number, required: true },
});

const ActivityModel: Model<Activity> = mongoose.model<Activity>(
    'Activity',
    ActivitySchema
);

export default ActivityModel;
