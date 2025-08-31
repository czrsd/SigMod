import express, { Application, Request, Response } from 'express';
import announcementRoutes from './AnnouncementRoutes';
import TournamentRoutes from './TournamentRoutes';
import FontRoutes from './FontRoutes';
import DiscordRoutes from './DiscordRoutes';
import FriendRoutes from './FriendRoutes';
import path from 'path';
import genericRoutes from './GenericRoutes';
import alertRoutes from './AlertRoutes';

export default (app: Application) => {
    app.use(announcementRoutes);
    app.use(TournamentRoutes);
    app.use(FontRoutes);
    app.use(DiscordRoutes);
    app.use(FriendRoutes);
    app.use(genericRoutes);
    app.use(alertRoutes);

    app.use('/profiles', express.static(path.join(process.cwd(), 'profiles')));

    app.get('/', (_, res: Response) => {
        res.redirect('https://sigmally.xyz/');
    });
};
