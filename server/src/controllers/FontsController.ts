import { Request, Response } from 'express';
import logger from '../utils/logger';

let cachedFonts: string[] | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const FALLBACK_FONTS = ['Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Poppins', 'Oswald', 'Inter', 'Raleway', 'Ubuntu', 'Nunito'];

class FontsController {
    async getFonts(req: Request, res: Response): Promise<void> {
        try {
            const now = Date.now();
            if (cachedFonts && now < cacheExpiry) {
                res.status(200).json(cachedFonts);
                return;
            }

            const apiKey = process.env.GOOGLE_FONTS_API_KEY;
            if (!apiKey) {
                res.status(200).json(FALLBACK_FONTS);
                return;
            }

            const fontsRes = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}`);
            if (!fontsRes.ok) {
                if (cachedFonts) {
                    res.status(200).json(cachedFonts);
                    return;
                }
                res.status(200).json(FALLBACK_FONTS);
                return;
            }

            const data = await fontsRes.json();
            const fontFamilies: string[] = Array.isArray(data?.items)
                ? data.items.map((font: { family: string }) => font.family)
                : FALLBACK_FONTS;

            cachedFonts = fontFamilies;
            cacheExpiry = now + CACHE_TTL_MS;

            res.status(200).json(fontFamilies);
        } catch (error) {
            logger.error('Error fetching fonts:', error);
            res.status(200).json(cachedFonts || FALLBACK_FONTS);
        }
    }
}

export default new FontsController();
