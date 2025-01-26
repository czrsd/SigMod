import express, { Application } from 'express';
import telemetryRoutes from './TelemetryRoutes';
import announcementRoutes from './AnnouncementRoutes';
import TournamentRoutes from './TournamentRoutes';
import FontRoutes from './FontRoutes';
import DiscordRoutes from './DiscordRoutes';
import FriendRoutes from './FriendRoutes';
import path from 'path';

export default (app: Application) => {
    app.use(telemetryRoutes);
    app.use(announcementRoutes);
    app.use(TournamentRoutes);
    app.use(FontRoutes);
    app.use(DiscordRoutes);
    app.use(FriendRoutes);

    app.use(`/profiles`, express.static(path.join(process.cwd(), 'profiles')));
};
