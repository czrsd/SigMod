import mongoose, { Document, Model, Schema } from 'mongoose';

type Request = Document & {
    req_id: mongoose.Types.ObjectId;
    target_id: mongoose.Types.ObjectId;
};

const requestSchema = new Schema<Request>({
    req_id: { type: Schema.Types.ObjectId, required: true },
    target_id: { type: Schema.Types.ObjectId, required: true },
});

const requestModel: Model<Request> = mongoose.model<Request>(
    'request',
    requestSchema
);

export default requestModel;
