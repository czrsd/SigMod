import { Request, Response } from 'express';
import AnnouncementModel, {
    AnnouncementDocument,
    AnnouncementPreview,
} from '../models/AnnouncementModel';
import logger from '../utils/logger';

class AnnouncementController {
    async getAnnouncements(req: Request, res: Response) {
        try {
            const announcements = await AnnouncementModel.find(
                {},
                { preview: 1 }
            );

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

            const announcement = await AnnouncementModel.findById(id);

            if (!announcement) {
                res.status(404).json({
                    success: false,
                    message: 'Announcement not found.',
                });
                return;
            }

            res.json({
                success: true,
                data: announcement,
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
