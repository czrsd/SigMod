import socket from '../socket';
import { lastOneStanding, tournamentLobby } from '../../../types';
import TournamentController from './TournamentController';

class LastOneStandingSystem {
    public async receiveResult(socket: socket) {
        if (!socket.user?.email) return;

        const lobby = TournamentController.getLobbyByEmail(socket.user?.email);
        if (!lobby) return;

        const modeData = lobby.modeData as lastOneStanding;

        if (modeData.emails.includes(socket.user.email)) return;

        modeData.emails.push(socket.user.email);

        if (lobby.currentRound === lobby.rounds) {
            lobby.ended = true;
        }

        if (this.receivedAll(lobby)) {
            this.setWinner(lobby);

            TournamentController.sendToLobby(lobby.id, {
                type: 'round-end',
                content: lobby,
            });

            setTimeout(() => TournamentController.restartServer(), 2000);
        }

        await TournamentController.sendLOSEndWebhook(lobby);

        this.cleanUp(lobby);

        if (this.shouldEnd(lobby)) {
            TournamentController.deleteLobby(lobby);
        }
    }

    private setWinner(lobby: tournamentLobby) {
        const modeData = lobby.modeData as lastOneStanding;

        const winner = lobby.participants.blue.find((socket) => {
            const user = socket.user;
            if (!user) return '...';

            return !modeData.emails.includes(user.email);
        });

        if (!winner || !winner.user) return;

        lobby.roundsData[lobby.currentRound - 1].winners.push(
            winner.user.email
        );
    }

    private receivedAll(lobby: tournamentLobby): boolean {
        return (
            (lobby.modeData as lastOneStanding).emails.length ===
            lobby.totalUsers - 1
        ); // -1 for the last one standing
    }

    private cleanUp(lobby: tournamentLobby) {
        lobby.roundsData[lobby.currentRound - 1].winners = [];

        const modeData = lobby.modeData as lastOneStanding;
        modeData.emails = [];
    }

    private shouldEnd(lobby: tournamentLobby): boolean {
        return lobby.currentRound === lobby.rounds;
    }
}

export default new LastOneStandingSystem();
