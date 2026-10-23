import { Request, Response } from 'express';
import AnnouncementModel from '../models/AnnouncementModel';
import logger from '../utils/logger';
import { sanitizeRichText, sanitizeImageUrls } from '../admin/content/validation';

class AnnouncementController {
    async getAnnouncements(req: Request, res: Response) {
        try {
            const announcements = await AnnouncementModel.find(
                { $or: [{ status: 'published' }, { status: { $exists: false } }] },
                { preview: 1, date: 1 }
            ).sort({ 'preview.pinned': -1, date: -1 });

            if (!announcements) {
                res.status(400).json({
                    success: false,
                    message: "Couldn't fetch announcements.",
                });
                return;
            }

            const previewData = announcements.map((announcement) => ({
                _id: announcement._id,
                title: announcement.preview.title,
                description: announcement.preview.description,
                icon: announcement.preview.icon,
                pinned: announcement.preview.pinned,
                date: announcement.date,
            }));

            res.json({
                success: true,
                data: previewData,
            });
        } catch (error) {
            logger.error(error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
            });
        }
    }

    async getAnnouncementById(req: Request, res: Response) {
        try {
            const { id } = req.params;

            if (!id) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid ID.',
                });
                return;
            }

            const announcement = await AnnouncementModel.findOne({
                _id: id,
                $or: [{ status: 'published' }, { status: { $exists: false } }],
            });

            if (!announcement) {
                res.status(404).json({
                    success: false,
                    message: 'Announcement not found.',
                });
                return;
            }

            res.json({
                success: true,
                data: {
                    ...announcement.toObject(),
                    full: {
                        ...announcement.full,
                        description: sanitizeRichText(announcement.full.description, 'full.description'),
                        images: sanitizeImageUrls(announcement.full.images),
                    },
                },
            });
        } catch (error) {
            logger.error(error);
            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
            });
        }
    }
}

export default new AnnouncementController();
