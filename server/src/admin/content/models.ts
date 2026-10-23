import mongoose, { Schema } from 'mongoose';
import type { JsonObject } from './validation';

export interface ContentRowDocument {
    _id: string;
    revision: number;
    value: JsonObject;
    updatedAt?: Date;
}

export interface ContentAuditDocument {
    actor?: string;
    action: string;
    target: string;
    revision: number;
    at: Date;
    changes: JsonObject;
}

const rowSchema = new Schema<ContentRowDocument>(
    {
        _id: String,
        revision: { type: Number, required: true, default: 0 },
        value: Schema.Types.Mixed,
        updatedAt: Date,
    },
    { versionKey: false }
);

export const ContentRow = mongoose.models.ContentRow || mongoose.model<ContentRowDocument>('ContentRow', rowSchema, 'admin_content');

const auditSchema = new Schema<ContentAuditDocument>(
    {
        actor: String,
        action: String,
        target: String,
        revision: Number,
        at: { type: Date, default: Date.now },
        changes: Schema.Types.Mixed,
    },
    { versionKey: false }
);

export const ContentAudit =
    mongoose.models.ContentAudit || mongoose.model<ContentAuditDocument>('ContentAudit', auditSchema, 'admin_content_audit');
