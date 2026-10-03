import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import AccountModel from '../../../models/AccountModel';
import logger from '../../../utils/logger';

class ProfileImageController {
    upload: multer.Multer;
    profilesDir: string;

    constructor() {
        this.profilesDir = path.resolve(process.cwd(), 'profiles');

        // Use memory storage for fast processing with Sharp before writing to disk
        this.upload = multer({
            storage: multer.memoryStorage(),
            limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
            fileFilter: (req, file, cb) => {
                const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
                if (!allowedTypes.includes(file.mimetype)) {
                    return cb(new Error('Invalid file type. PNG, JPEG, and WebP formats are supported.'));
                }
                cb(null, true);
            },
        });

        this.uploadImage = this.uploadImage.bind(this);
        this.removeProfileImage = this.removeProfileImage.bind(this);
    }

    // POST upload profile image
    async uploadImage(req: Request, res: Response): Promise<Response | void> {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized.' });
        }

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: 'No image uploaded.' });
        }

        try {
            if (!existsSync(this.profilesDir)) {
                await fs.mkdir(this.profilesDir, { recursive: true });
            }

            const fileName = `${userId}-${Date.now()}.webp`;
            const filePath = path.join(this.profilesDir, fileName);

            // Automatically smart-crop, resize to standard 256x256, and compress to WebP
            await sharp(req.file.buffer).resize(256, 256, { fit: 'cover', position: 'center' }).webp({ quality: 85 }).toFile(filePath);

            // Remove old custom avatar file if present
            const oldUser = await AccountModel.findById(userId, { imageURL: 1 });
            if (oldUser?.imageURL && oldUser.imageURL.includes('/profiles/')) {
                const oldFilename = path.basename(oldUser.imageURL);
                const oldPath = path.join(this.profilesDir, oldFilename);
                if (existsSync(oldPath)) {
                    await fs.unlink(oldPath).catch(() => {});
                }
            }

            const host = req.get('host') || `localhost:${process.env.PORT || 3001}`;
            const protocol = req.protocol === 'https' || req.secure ? 'https' : 'http';
            const imageURL =
                process.env.NODE_ENV === 'development'
                    ? `http://localhost:${process.env.PORT || 3001}/profiles/${fileName}`
                    : `https://mod.czrsd.com/profiles/${fileName}`;

            await AccountModel.updateOne({ _id: userId }, { $set: { imageURL } });

            const updatedUser = await AccountModel.findById(userId).select('-password');
            return res.status(200).json({ success: true, user: updatedUser });
        } catch (err) {
            logger.error('Error processing profile image:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to process and save avatar image.',
            });
        }
    }

    // POST/DELETE remove profile image
    async removeProfileImage(req: Request, res: Response): Promise<Response | void> {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized.' });
        }

        try {
            const currentProfile = await AccountModel.findById(userId, { imageURL: 1 });
            if (!currentProfile) return res.status(404).json({ success: false, message: 'User not found.' });

            if (currentProfile.imageURL && currentProfile.imageURL.includes('/profiles/')) {
                const filename = path.basename(currentProfile.imageURL);
                const filePath = path.join(this.profilesDir, filename);
                if (existsSync(filePath)) {
                    await fs.unlink(filePath).catch(() => {});
                }
            }

            await AccountModel.updateOne(
                { _id: userId },
                {
                    $set: {
                        imageURL: 'https://czrsd.com/static/sigmod/SigMod25-rounded.png',
                    },
                }
            );

            const updatedUser = await AccountModel.findById(userId).select('-password');
            return res.status(200).json({ success: true, user: updatedUser });
        } catch (e) {
            logger.error('Error removing profile image:', e);
            return res.status(500).json({
                success: false,
                message: 'Error removing profile image.',
            });
        }
    }
}

export default new ProfileImageController();
