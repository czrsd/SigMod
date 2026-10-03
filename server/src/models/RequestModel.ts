import mongoose, { Document, Model, Schema } from 'mongoose';

type Request = Document & {
    req_id: mongoose.Types.ObjectId;
    target_id: mongoose.Types.ObjectId;
};

const requestSchema = new Schema<Request>({
    req_id: { type: Schema.Types.ObjectId, required: true },
    target_id: { type: Schema.Types.ObjectId, required: true },
});

requestSchema.index({ req_id: 1, target_id: 1 }, { unique: true });
requestSchema.index({ target_id: 1 });

const requestModel: Model<Request> = mongoose.model<Request>('request', requestSchema);

export default requestModel;
