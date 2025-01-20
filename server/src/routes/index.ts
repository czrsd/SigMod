import { Application } from 'express';
import telemetryRoutes from './TelemetryRoutes';
import announcementRoutes from './AnnouncementRoutes';
import TournamentRoutes from './TournamentRoutes';
import FontRoutes from './FontRoutes';
import DiscordRoutes from './DiscordRoutes';
import FriendRoutes from './FriendRoutes';

export default (app: Application) => {
    app.use(telemetryRoutes);
    app.use(announcementRoutes);
    app.use(TournamentRoutes);
    app.use(FontRoutes);
    app.use(DiscordRoutes);
    app.use(FriendRoutes);
};
