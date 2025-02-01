import { lastOneStanding, scoreMode, tournamentLobby } from '../../../types';
import socket from '../socket';
import TournamentController from './TournamentController';

class ScoreSystem {
    public async receiveResult(socket: socket, score: number) {
        const lobby = TournamentController.getLobbyByEmail(socket.user?.email);

        if (!lobby || !this.isScoreMode(lobby.modeData)) return;

        const userEmail = socket.user?.email;
        if (!userEmail) return;

        const team = this.determineTeam(lobby, userEmail);

        if (this.hasSentScore(lobby, userEmail)) return;

        this.recordScore(lobby, team, userEmail, score);

        console.log(`Score from ${userEmail}: ${score}.`);

        if (this.allScoresSubmitted(lobby)) {
            const modeData = lobby.modeData as scoreMode;
            const blueScore = this.calculateTotalScore(modeData.blue);
            const redScore = this.calculateTotalScore(modeData.red);

            const winnersArray = this.determineWinners(
                lobby,
                blueScore,
                redScore
            );

            this.updateState(lobby, modeData, blueScore, redScore);

            lobby.roundsData[lobby.currentRound - 1].winners.push(
                ...winnersArray
            );

            let end = false;
            if (this.shouldEndTournament(lobby, modeData)) {
                lobby.ended = true;
                end = true;
            }

            TournamentController.sendToLobby(lobby.id, {
                type: 'round-end',
                content: lobby,
            });

            await TournamentController.sendRoundEndWebhook(lobby);

            this.resetRoundScores(modeData);

            if (end) {
                console.log(`Closing lobby with ID ${lobby.id}.`);
                TournamentController.deleteLobby(lobby);
            }

            setTimeout(TournamentController.restartServer, 2000);
        }
    }

    private isScoreMode(
        modeData: scoreMode | lastOneStanding
    ): modeData is scoreMode {
        return (modeData as scoreMode).blue !== undefined;
    }

    private determineTeam(
        lobby: tournamentLobby,
        email: string
    ): 'blue' | 'red' {
        return lobby.participants.blue.some((p) => p.user?.email === email)
            ? 'blue'
            : 'red';
    }

    private hasSentScore(lobby: tournamentLobby, email: string): boolean {
        const modeData = lobby.modeData as scoreMode;
        return (
            modeData.blue.some((user) => user.email === email) ||
            modeData.red.some((user) => user.email === email)
        );
    }

    private recordScore(
        lobby: tournamentLobby,
        team: 'blue' | 'red',
        email: string,
        score: number
    ) {
        const modeData = lobby.modeData as scoreMode;
        modeData[team].push({ email, score });
    }

    private allScoresSubmitted(lobby: tournamentLobby): boolean {
        const modeData = lobby.modeData as scoreMode;
        return modeData.red.length + modeData.blue.length === lobby.totalUsers;
    }

    private calculateTotalScore(
        teamData: { email: string; score: number }[]
    ): number {
        return teamData.reduce((total, user) => total + user.score, 0);
    }

    private determineWinners(
        lobby: tournamentLobby,
        blueScore: number,
        redScore: number
    ): string[] {
        const modeData = lobby.modeData as scoreMode;

        if (blueScore > redScore) {
            return lobby.participants.blue
                .map((p) => p.user?.email)
                .filter((email) => email !== undefined) as string[];
        }
        if (redScore > blueScore) {
            return lobby.participants.red
                .map((p) => p.user?.email)
                .filter((email) => email !== undefined) as string[];
        }

        const boost = 323;
        if (Math.random() < 0.5) {
            modeData.blue.forEach((user) => (user.score += boost));
            return lobby.participants.blue
                .map((p) => p.user?.email)
                .filter((email) => email !== undefined) as string[];
        } else {
            modeData.red.forEach((user) => (user.score += boost));
            return lobby.participants.red
                .map((p) => p.user?.email)
                .filter((email) => email !== undefined) as string[];
        }
    }

    private updateState(
        lobby: tournamentLobby,
        modeData: scoreMode,
        blueScore: number,
        redScore: number
    ) {
        if (!modeData.state) modeData.state = '0:0';

        const [bluePoints, redPoints] = modeData.state.split(':').map(Number);

        if (blueScore > redScore) {
            modeData.state = `${bluePoints + 1}:${redPoints}`;
        } else if (redScore > blueScore) {
            modeData.state = `${bluePoints}:${redPoints + 1}`;
        } else {
            modeData.state =
                blueScore + 323 > redScore
                    ? `${bluePoints + 1}:${redPoints}`
                    : `${bluePoints}:${redPoints + 1}`;
        }
    }

    private resetRoundScores(modeData: scoreMode) {
        modeData.red = [];
        modeData.blue = [];
    }

    private shouldEndTournament(
        lobby: tournamentLobby,
        modeData: scoreMode
    ): boolean {
        const remainingRounds = lobby.rounds - lobby.currentRound;
        const [bluePoints, redPoints] = modeData.state.split(':').map(Number);

        if (bluePoints > redPoints) {
            const canRedCatchUp = redPoints + remainingRounds >= bluePoints;
            return !canRedCatchUp;
        } else if (redPoints > bluePoints) {
            const canBlueCatchUp = bluePoints + remainingRounds >= redPoints;
            return !canBlueCatchUp;
        }

        return false;
    }
}

export default new ScoreSystem();
