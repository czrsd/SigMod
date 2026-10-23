import mongoose, { Schema } from 'mongoose';

const partyUsageSchema = new Schema(
    {
        _id: { type: String, required: true },
        day: { type: Date, required: true, index: true },
        metrics: { type: Schema.Types.Mixed, required: true },
        expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    },
    { versionKey: false, collection: 'party_usage_daily', writeConcern: { w: 'majority', j: true, wtimeout: 10_000 } }
);

export default mongoose.model('PartyUsage', partyUsageSchema);
