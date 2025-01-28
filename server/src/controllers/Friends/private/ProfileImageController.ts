import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import AccountModel from '../../../models/AccountModel';

class ProfileImageController {
    upload: multer.Multer;

    constructor() {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, path.resolve(process.cwd(), 'profiles'));
            },
            filename: (req, file, cb) => {
                const extension = path.extname(file.originalname);
                cb(null, `${Date.now()}${extension}`);
            },
        });

        this.upload = multer({
            storage,
            limits: { fileSize: 2000000 },
            fileFilter: (req, file, cb) => {
                const allowedTypes = ['image/png', 'image/jpeg'];
                if (!allowedTypes.includes(file.mimetype)) {
                    return cb(
                        new Error(
                            'Invalid file type. Only PNG and JPEG formats are supported.'
                        )
                    );
                }
                cb(null, true);
            },
        });

        this.uploadImage = this.uploadImage.bind(this);
    }

    // POST upload profile image
    async uploadImage(req: Request, res: Response): Promise<Response | void> {
        if (!req.file) {
            return res
                .status(400)
                .json({ success: false, message: 'No image uploaded.' });
        }

        const fileBuffer = fs.readFileSync(req.file.path);
        const fileType = this.getFileType(fileBuffer);

        if (!fileType || !['image/png', 'image/jpeg'].includes(fileType)) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                message:
                    'Invalid file type. Only PNG and JPEG formats are supported.',
            });
        }

        const { width, height, hasAlpha } = await sharp(
            req.file.path
        ).metadata();

        if (hasAlpha) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'Image cannot have transparency.',
            });
        }

        if (width !== height) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'Image must have a 1:1 aspect ratio.',
            });
        }

        const imageURL = `${process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.PORT}/profiles/` : 'https://mod.czrsd.com/profiles/'}${req.file.filename}`;

        await AccountModel.updateOne(
            { _id: req.user?.userId },
            { $set: { imageURL } }
        );
        const updatedUser = await AccountModel.findById(
            req.user?.userId
        ).select('-password');

        return res.status(200).json({ success: true, user: updatedUser });
    }

    getFileType = (buffer: Buffer): string | null => {
        if (buffer.length < 4) return null;
        const uint = new Uint8Array(buffer);
        if (uint[0] === 0xff && uint[1] === 0xd8 && uint[2] === 0xff)
            return 'image/jpeg';
        if (
            uint[0] === 0x89 &&
            uint[1] === 0x50 &&
            uint[2] === 0x4e &&
            uint[3] === 0x47
        )
            return 'image/png';
        return null;
    };

    // GET remove profile image
    async removeProfileImage(
        req: Request,
        res: Response
    ): Promise<Response | void> {
        const userId = req.user?.userId;

        try {
            const currentProfile = await AccountModel.findOne(
                { _id: userId },
                { imageURL: 1 }
            );
            if (!currentProfile)
                return res
                    .status(404)
                    .json({ success: false, message: 'User not found.' });

            const filename = path.basename(
                currentProfile.imageURL,
                path.extname(currentProfile.imageURL)
            );
            const filePath = path.join(
                process.cwd(),
                'profiles',
                `${filename}.png`
            );
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

            await AccountModel.updateOne(
                { _id: userId },
                {
                    $set: {
                        imageURL:
                            'https://czrsd.com/static/sigmod/SigMod25-rounded.png',
                    },
                }
            );
            const updatedUser =
                await AccountModel.findById(userId).select('-password');

            return res.status(200).json({ success: true, user: updatedUser });
        } catch (e) {
            console.error('Error removing profile image:', e);
            return res.status(500).json({
                success: false,
                message: 'Error removing profile image.',
            });
        }
    }
}

export default new ProfileImageController();
