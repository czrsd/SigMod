import { Request, Response } from 'express';

class FontsController {
    async getFonts(req: Request, res: Response): Promise<void> {
        try {
            const fontsRes = await fetch(
                `https://www.googleapis.com/webfonts/v1/webfonts?key=${process.env.GOOGLE_FONTS_API_KEY || ''}`
            );
            if (!fontsRes.ok) {
                res.status(fontsRes.status).json({
                    error: 'Failed to fetch fonts.',
                });
                return;
            }

            const data = await fontsRes.json();
            const fontFamilies = data.items.map(
                (font: { family: string }) => font.family
            );

            res.status(200).json(fontFamilies);
        } catch (error) {
            console.error('Error fetching fonts:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

export default new FontsController();
