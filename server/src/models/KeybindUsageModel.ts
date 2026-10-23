import mongoose, { Schema } from 'mongoose';

const keybindUsageSchema = new Schema(
    {
        _id: { type: String, required: true },
        day: { type: Date, required: true, index: true },
        metrics: { type: Schema.Types.Mixed, required: true },
        labels: { type: Schema.Types.Mixed, required: true },
        batches: { type: [String], required: true },
        expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    },
    { versionKey: false, collection: 'keybind_usage', writeConcern: { w: 'majority', j: true, wtimeout: 10_000 } }
);

export default mongoose.model('KeybindUsage', keybindUsageSchema);
