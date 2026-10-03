import express, { Application, Request, Response } from 'express';
import announcementRoutes from './AnnouncementRoutes';
import FontRoutes from './FontRoutes';
import DiscordRoutes from './DiscordRoutes';
import FriendRoutes from './FriendRoutes';
import path from 'path';
import genericRoutes from './GenericRoutes';
import alertRoutes from './AlertRoutes';

export default (app: Application) => {
    const apiRouter = express.Router();

    apiRouter.use(announcementRoutes);
    apiRouter.use(FontRoutes);
    apiRouter.use(DiscordRoutes);
    apiRouter.use(FriendRoutes);
    apiRouter.use(genericRoutes);
    apiRouter.use(alertRoutes);

    app.use('/api/v5', apiRouter);

    app.use('/profiles', express.static(path.join(process.cwd(), 'profiles')));

    app.get('/', (_, res: Response) => {
        res.redirect('https://sigmally.xyz/');
    });
};
