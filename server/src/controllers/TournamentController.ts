import { Request, Response } from 'express';
import { getFutureTimestamp, readFile } from '../utils/helpers';
import { wsHandler } from '../socket/setup';
import socket from '../socket/core/socket';
import TournamentSystem from '../socket/core/tournaments/TournamentController';
import { google_user } from '../types';
import { db } from '../db/connection';
import logger from '../utils/logger';

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
            const { key, data } = req.body;
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

            await TournamentSystem.setupTournament(data);

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
                    type: 'tournament-data',
                    content: {
                        overlay: wsHandler.tournamentOverlay,
                        details: wsHandler.tournamentDetails,
                        timer: wsHandler.tournamentTimer,
                    },
                })
            );

            res.status(200).json({ success: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    async getUsers(req: Request, res: Response): Promise<void> {
        const { key, nicknames } = req.body;
        try {
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
            const users = new Map<string, google_user | null>();

            for (let i = 0; i < nicknames.length; i++) {
                const nick = nicknames[i];
                const socket = Array.from(wsHandler.sockets.values()).find(
                    (s) => s.nick === nick
                );

                if (socket && socket.user) {
                    users.set(nick, socket.user);
                } else {
                    const user = (await db.collection('users').findOne(
                        { nick },
                        {
                            projection: {
                                userAgent: 0,
                                ip: 0,
                                token: 0,
                                sigma: 0,
                                skins: 0,
                            },
                        }
                    )) as google_user;

                    if (!user) {
                        users.set(nick, null);
                        continue;
                    }

                    users.set(nick, user);
                }
            }

            res.status(200).json({
                success: true,
                users: Object.fromEntries(users),
            });
        } catch (error) {
            logger.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    getTournamentData(req: Request, res: Response): void {
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

            res.status(200).json({
                success: true,
                data: {
                    details: wsHandler.tournamentDetails,
                    timer: wsHandler.tournamentTimer,
                },
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    updateTournamentData(req: Request, res: Response): void {
        try {
            const { key, details, timer } = req.body;
            const tournamentKey = readFile(
                process.env.TOURNAMENT_KEY_PATH || ''
            );

            if (!key || key !== tournamentKey) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized.',
                });
                return;
            }

            const futureTimer = timer && getFutureTimestamp(timer);
            wsHandler.tournamentTimer = futureTimer;

            if (!details) {
                wsHandler.tournamentDetails = null;
                wsHandler.sendToServer('Tourney', {
                    type: 'tournament-data',
                    content: { details: null, timer: futureTimer },
                });
                res.status(200).json({ success: true });
                return;
            }

            wsHandler.tournamentDetails = details;
            wsHandler.sendToServer('Tourney', {
                type: 'tournament-data',
                content: { details, timer: futureTimer },
            });

            res.status(200).json({ success: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

export default new TournamentController();
