import { Router } from 'express';
import TournamentController from '../controllers/TournamentController';

const router = Router();

router.get('/tournaments/players/:key', TournamentController.getPlayers);
router.post('/tournaments/start', TournamentController.startTournament);
router.post('/tournaments/overlay', TournamentController.toggleOverlay);
router.post('/tournaments/users', TournamentController.getUsers);
router.get('/tournaments/data/:key', TournamentController.getTournamentData);
router.post(
    '/tournaments/update-data',
    TournamentController.updateTournamentData
);

export default router;
