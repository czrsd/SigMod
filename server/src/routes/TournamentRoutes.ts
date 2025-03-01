import { Router } from 'express';
import TournamentController from '../controllers/TournamentController';

const router = Router();

router.get('/tournaments/players/:key', TournamentController.getPlayers);
router.post('/tournaments/start', TournamentController.startTournament);
router.post('/tournaments/overlay', TournamentController.toggleOverlay);
router.post('/tournaments/users', TournamentController.getUsers);

export default router;
