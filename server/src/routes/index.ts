import express, { Application, Request, Response } from 'express';
import telemetryRoutes from './TelemetryRoutes';
import announcementRoutes from './AnnouncementRoutes';
import TournamentRoutes from './TournamentRoutes';
import FontRoutes from './FontRoutes';
import DiscordRoutes from './DiscordRoutes';
import FriendRoutes from './FriendRoutes';
import path from 'path';
import genericRoutes from './GenericRoutes';

export default (app: Application) => {
    app.use(telemetryRoutes);
    app.use(announcementRoutes);
    app.use(TournamentRoutes);
    app.use(FontRoutes);
    app.use(DiscordRoutes);
    app.use(FriendRoutes);
    app.use(genericRoutes);

    app.use('/profiles', express.static(path.join(process.cwd(), 'profiles')));

    const websitePath = process.env.WEBSITE_PATH;
    if (!websitePath) {
        console.log('Website path is not defined!');
        return;
    }

    app.use(express.static(path.join(websitePath)));

    app.get('/', (req: Request, res: Response) => {
        res.sendFile(path.join(websitePath, 'index.html'));
    });

    app.get('/changelog', (req: Request, res: Response) => {
        res.sendFile(path.join(websitePath, 'pages', 'changelog.html'));
    });

    app.get('/tos', (req: Request, res: Response) => {
        res.sendFile(path.join(websitePath, 'pages', 'tos.html'));
    });

    app.use((req: Request, res: Response) => {
        res.status(404).sendFile(path.join(websitePath, 'pages', '404.html'));
    });
};
