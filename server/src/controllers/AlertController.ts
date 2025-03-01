import { Request, Response } from 'express';
import { wsHandler } from '../socket/setup';
import { readFile } from '../utils/helpers';
import getTournamentPassword from '../utils/tournamentPassword';
import logger from '../utils/logger';

class AlertController {
    async getAlert(req: Request, res: Response) {
        res.json({
            success: true,
            data: wsHandler.alert,
        });
    }

    async setAlert(req: Request, res: Response) {
        try {
            const { key, title, description, enabled } = req.body;
            if (
                !key ||
                key !== readFile(process.env.TOURNAMENT_KEY_PATH || '')
            ) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized.',
                });
                return;
            }

            wsHandler.alert.title = title;
            wsHandler.alert.description = description;
            wsHandler.alert.enabled = enabled;

            if (enabled) {
                wsHandler.alert.password = await getTournamentPassword();
            } else {
                wsHandler.alert.password = null;
            }

            wsHandler.sendToAll({
                type: 'alert',
                content: wsHandler.alert,
            });

            res.status(200).json({
                success: true,
                data: wsHandler.alert,
            });
        } catch (e) {
            logger.error(e);
            res.status(400).json({
                success: false,
                message: 'Something went wrong. Please try again.',
            });
        }
    }
}

export default new AlertController();
