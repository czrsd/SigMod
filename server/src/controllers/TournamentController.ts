import { Request, Response } from 'express';
import { readFile } from '../utils/helpers';
import { wsHandler } from '../socket/setup';
import socket from '../socket/core/socket';

class TournamentController {
    // returns online users (authorized and unauthorized) connected to the tournament server
    async getPlayers(req: Request, res: Response): Promise<void> {
        try {
            const { key } = req.params;
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

            const sockets = wsHandler.getServerSockets('Tourney');
            const users = sockets.map((conn: socket) => ({
                sid: conn.sid,
                nick: conn.nick,
                user: conn.user,
            }));

            res.status(200).json({ success: true, users });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    async startTournament(req: Request, res: Response): Promise<void> {
        try {
            const { key /* data */ } = req.body;
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

            // @TODO Implement Tournament system
            // system.setupTournament(data);

            res.status(200).json({ success: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    async toggleOverlay(req: Request, res: Response): Promise<void> {
        try {
            const { key, status } = req.body;
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

            if (typeof status !== 'boolean') {
                res.status(400).json({
                    success: false,
                    message: 'Status has to be a boolean.',
                });
                return;
            }

            wsHandler.tournamentOverlay = status;
            const sockets = wsHandler.getServerSockets('Tourney');
            sockets.forEach((socket) =>
                socket.send({
                    type: 'tournament-overlay',
                    content: status,
                })
            );

            res.status(200).json({ success: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

export default new TournamentController();
