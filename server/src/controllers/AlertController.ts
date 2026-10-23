import { Request, Response } from 'express';
import { getCachedClientContent } from '../services/clientContent';

class AlertController {
    async getAlert(_req: Request, res: Response) {
        res.json({
            success: true,
            data: getCachedClientContent().alert,
        });
    }
}

export default new AlertController();
