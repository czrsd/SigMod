import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { asyncRoute, auditAdminAction, HttpError } from './common';
import { readAdminConfig } from './auth/security';

export const adminAssetDirectory = (): string => path.resolve(process.cwd(), 'admin-assets');
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 2, parts: 4 },
});
router.post(
    '/assets/images',
    (req, res, next) => {
        upload.single('image')(req, res, (error) => {
            if (error instanceof multer.MulterError) {
                console.warn(`[admin-assets] Image upload rejected: ${error.code}`);
                if (error.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, 'Image exceeds the 12 MiB upload limit.'));
                if (error.code === 'LIMIT_UNEXPECTED_FILE') return next(new HttpError(400, 'Upload one image using the image field.'));
                return next(new HttpError(400, `Image upload could not be read (${error.code}).`));
            }
            if (error) {
                console.warn('[admin-assets] Multipart image upload could not be parsed.');
                return next(new HttpError(400, 'Image upload was incomplete. Please choose the file again and retry.'));
            }
            next();
        });
    },
    asyncRoute(async (req, res) => {
        if (!req.file?.buffer) throw new HttpError(400, 'An image file is required.');
        let output: Buffer;
        try {
            const image = sharp(req.file.buffer, { limitInputPixels: 25_000_000, animated: false });
            const metadata = await image.metadata();
            if (!['png', 'jpeg', 'webp'].includes(metadata.format || '')) throw new Error('Unsupported decoded format');
            output = await image.rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
        } catch {
            throw new HttpError(400, 'Image could not be decoded safely.');
        }
        if (output.length > 4 * 1024 * 1024) throw new HttpError(400, 'Processed image exceeds 4 MiB.');
        const filename = `${randomUUID()}.webp`;
        await fs.mkdir(adminAssetDirectory(), { recursive: true });
        await fs.writeFile(path.join(adminAssetDirectory(), filename), output, { flag: 'wx' });
        const url = `${readAdminConfig().adminOrigin}/api/v5/content-assets/${filename}`;
        auditAdminAction('image.upload', req.admin!.id, { filename, bytes: output.length });
        res.status(201).json({ success: true, data: { url, bytes: output.length, contentType: 'image/webp' } });
    })
);
export default router;
