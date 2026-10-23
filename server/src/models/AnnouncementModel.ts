import mongoose, { Document } from 'mongoose';

export type AnnouncementPreview = {
    title: string;
    description: string;
    icon: string;
    pinned: boolean;
};

export type AnnouncementDocument = Document & {
    preview: AnnouncementPreview;
    full: {
        title: string;
        description: string;
        images: string[];
    };
    date: Date;
    status?: 'draft' | 'published' | 'archived';
    revision?: number;
};

const AnnouncementSchema = new mongoose.Schema({
    preview: {
        title: { type: String, required: true },
        description: { type: String, required: true },
        icon: {
            type: String,
            required: false,
            default: 'https://czrsd.com/static/sigmod/announcements/default.svg',
        },
        pinned: { type: Boolean, required: false, default: false },
    },
    full: {
        title: { type: String, required: true },
        description: { type: String, required: true },
        images: { type: [String], required: false },
    },
    date: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'published' },
    revision: { type: Number, min: 0, default: 0 },
});

const AnnouncementModel = mongoose.model<AnnouncementDocument>('Announcement', AnnouncementSchema);

export default AnnouncementModel;
