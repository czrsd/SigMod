import express, { Application, Response } from 'express';
import announcementRoutes from './AnnouncementRoutes';
import FontRoutes from './FontRoutes';
import DiscordRoutes from './DiscordRoutes';
import FriendRoutes from './FriendRoutes';
import path from 'path';
import genericRoutes from './GenericRoutes';
import alertRoutes from './AlertRoutes';
import settingsUsageRoutes from './SettingsUsageRoutes';
import adminRoutes from '../admin';
import publicContentRoutes from './PublicContentRoutes';
import { adminAssetDirectory } from '../admin/assets';
import dashboardRoutes from '../dashboard';

export default (app: Application) => {
    app.use('/admin', dashboardRoutes);
    const apiRouter = express.Router();

    apiRouter.use('/admin', adminRoutes);
    apiRouter.use(publicContentRoutes);
    apiRouter.use(
        '/content-assets',
        express.static(adminAssetDirectory(), {
            dotfiles: 'deny',
            index: false,
            immutable: true,
            maxAge: '1y',
            setHeaders(res) {
                res.setHeader('X-Content-Type-Options', 'nosniff');
            },
        })
    );
    apiRouter.use(announcementRoutes);
    apiRouter.use(FontRoutes);
    apiRouter.use(DiscordRoutes);
    apiRouter.use(FriendRoutes);
    apiRouter.use(genericRoutes);
    apiRouter.use(alertRoutes);
    apiRouter.use(settingsUsageRoutes);

    app.use('/api/v5', apiRouter);

    app.use('/profiles', express.static(path.join(process.cwd(), 'profiles')));

    app.get('/', (_, res: Response) => {
        res.redirect('https://sigmally.xyz/');
    });
};
