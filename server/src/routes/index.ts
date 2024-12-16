import { Application } from 'express';
import telemetryRoutes from './telemetryRoutes';
import announcementRoutes from './announcementRoutes';
import TournamentRoutes from './TournamentRoutes';
import FontRoutes from './FontRoutes';

export default (app: Application) => {
    app.use(telemetryRoutes);
    app.use(announcementRoutes);
    app.use(TournamentRoutes);
    app.use(FontRoutes);
};
