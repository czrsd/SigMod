import mongoose, { Schema } from 'mongoose';

const settingsUsageSchema = new Schema(
    {
        _id: { type: String, required: true },
        writeKeyHash: { type: String, required: true, select: false },
        revision: { type: Number, required: true },
        operationId: { type: String, required: true },
        clientVersion: { type: String, required: true },
        settingsSchemaVersion: { type: Number, required: true },
        contractVersion: { type: Number, required: true },
        checksum: { type: String, required: true },
        settings: { type: Schema.Types.Mixed, required: true },
        createdAt: { type: Date, required: true },
        lastSyncedAt: { type: Date, required: true },
    },
    {
        versionKey: false,
        collection: 'settings_usage',
        writeConcern: { w: 'majority', j: true, wtimeout: 10_000 },
    }
);

export default mongoose.model('SettingsUsage', settingsUsageSchema);
