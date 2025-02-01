import { v4 as uuidv4 } from 'uuid';
import {
    lastOneStanding,
    scoreMode,
    socketMessageData,
    tournamentLobby,
    tournamentMode,
    tournamentSetupData,
} from '../../../types';
import fs from 'fs';
import axios from 'axios';
import socket from '../socket';
import { wsHandler } from '../../setup';
import { parseTimeToMilliseconds } from '../../../utils/helpers';
import scoreSystem from './scoreSystem';

class TournamentController {
    lobbies: tournamentLobby[] = [];
    disconnected: socket[] = [];
    startDelay: number = 5000;

    async setupTournament(data: tournamentSetupData) {
        const tournamentId = uuidv4();
        const { participantIds } = data;

        const totalUsers =
            participantIds.blue.length + participantIds.red.length;

        const modeData: scoreMode | lastOneStanding =
            data.mode === 'score'
                ? ({ blue: [], red: [], state: '0:0' } as scoreMode)
                : ({ emails: [] } as lastOneStanding);

        const password = await this.getPassword();

        const tournamentLobby: tournamentLobby = {
            id: tournamentId,
            ...data,
            totalUsers,
            ready: [],
            currentRound: 0,
            modeData,
            participants: { blue: [], red: [] },
            online: 0,
            started: false,
            roundsData: [],
            password: password || '',
            ended: false,
        };
    }

    private addParticipants(
        userIds: string[],
        tournamentLobby: tournamentLobby,
        team: 'blue' | 'red'
    ) {
        userIds.forEach((userId) => {
            const userSocket = wsHandler.getByUserId(userId);
            if (!userSocket) return;

            if (userSocket?.user) {
                tournamentLobby.online++;
                userSocket.tournamentId = tournamentLobby.id;

                tournamentLobby.participants[team].push(userSocket);
            }
        });
    }

    async playerReady(socket: socket) {
        if (!socket.user?.email) return;
        const lobby = this.getLobbyByEmail(socket.user?.email);

        if (!lobby) return;

        if (lobby.ready.includes(socket.user.email)) return;

        lobby.ready.push(socket.user.email);

        console.log(
            `${socket.user.fullName} is ready. Ready (${lobby.ready.length}/${lobby.totalUsers})`
        );

        if (lobby.ready.length === lobby.totalUsers) {
            await this.startSession(lobby);
            return;
        }

        this.sendToLobby(lobby.id, {
            type: 'round-ready',
            content: {
                userId: socket.user._id,
                ready: lobby.ready.length,
                max: lobby.totalUsers,
            },
        });
    }

    async handleResult(socket: socket, data: any) {
        const lobby = this.getLobbyByEmail(socket.user?.email);

        if (!lobby) return;

        if (lobby.mode === tournamentMode.score) {
            await scoreSystem.receiveResult(socket, data);
        } else if (lobby.mode === tournamentMode.lastOneStanding) {
            // lastOneStandingSystem.receiveResult(socket);
        }
    }

    sendToLobby(lobbyId: string, message: socketMessageData) {
        const lobby = this.lobbies.find((lobby) => lobby.id === lobbyId);

        if (!lobby) return;

        const allSockets = [
            ...lobby.participants.blue,
            ...lobby.participants.red,
        ];

        allSockets.forEach((socket) => {
            if (socket) {
                socket.send(message);
            }
        });
    }

    getLobbyByEmail(email: string | undefined): tournamentLobby | void {
        if (!email) return;

        for (const lobby of this.lobbies) {
            const isInBlueTeam = lobby.participants.blue.some(
                (socket) => socket.user?.email === email
            );
            const isInRedTeam = lobby.participants.red.some(
                (socket) => socket.user?.email === email
            );

            if (isInBlueTeam || isInRedTeam) {
                return lobby;
            }
        }

        return void 0;
    }

    async startSession(lobby: tournamentLobby) {
        try {
            lobby.currentRound++;
            lobby.ready = [];

            if (lobby.currentRound === 1) {
                await this.sendStartWebhook(lobby);
            }

            this.sendToLobby(lobby.id, {
                type: 'tournament-session',
                content: {
                    round: lobby.currentRound,
                    max: lobby.rounds,
                    password: lobby.password,
                    time: lobby.time,
                },
            });

            setTimeout(() => {
                if (!lobby.started) lobby.started = true;
                lobby.roundsData.push({
                    started: Date.now(),
                    winners: [],
                });

                this.sendToLobby(lobby.id, {
                    type: 'tournament-message',
                    content: `Good luck!`,
                });

                this.waitForEnd(lobby);
            }, this.startDelay);
        } catch (e) {
            console.error(e);
        }
    }

    waitForEnd(lobby: tournamentLobby) {
        try {
            const time = parseTimeToMilliseconds(lobby.time);

            if (lobby.mode === tournamentMode.score) {
                setTimeout(() => {
                    this.sendToLobby(lobby.id, {
                        type: 'get-score',
                    });
                }, time);
            } else {
                // last one standing end
            }
        } catch (e) {
            console.error(e);
        }
    }

    disconnectPlayer(socket: socket) {
        const lobby = this.getLobbyByEmail(socket.user?.email);

        if (!lobby) return;

        lobby.totalUsers -= 1;

        if (lobby.totalUsers === 0) {
            return this.deleteLobby(lobby);
        }

        this.disconnected.push(socket);

        this.sendToLobby(lobby.id, {
            type: 'tournament-message',
            content: `${socket.user?.givenName} left the tournament.`,
        });
    }

    public deleteLobby(lobby: tournamentLobby) {
        this.disconnected = this.disconnected.filter((socket) => {
            const socketLobby = this.getLobbyByEmail(socket.user?.email);
            return socketLobby?.id !== lobby.id;
        });

        this.lobbies = this.lobbies.filter((l) => l.id !== lobby.id);

        console.log(`Lobby with ID ${lobby.id} has been deleted.`);
    }

    omitWebSocket(socket: socket) {
        const { ws, ...rest } = socket;
        return rest as socket;
    }

    // webhooks
    public async sendStartWebhook(lobby: tournamentLobby) {
        const blueNicks = lobby.participants.blue
            .map((p) => p.nick || p.user?.givenName)
            .join(', ');
        const redNicks = lobby.participants.red
            .map((p) => p.nick || p.user?.givenName)
            .join(', ');
        const allParticipants = [
            ...lobby.participants.blue,
            ...lobby.participants.red,
        ];
        const allNicks = allParticipants
            .map((p) => p.nick || p.user?.givenName)
            .join(', ');

        await axios.post(lobby.webhookURL, {
            content: null,
            embeds: [
                {
                    title: `START - ${lobby.name}`,
                    description: `The tournament has been started!\n*Hosted by ${lobby.hosts.split(',')}*\n\nMode: ${lobby.mode === 'score' ? 'Score' : 'Last one standing'}\nRounds: ${lobby.rounds}\nTime per round: ${lobby.time}\nPrizes:\n${lobby.prizes.map((prize, index) => `${index + 1}. ${prize}\n`).join('')}`,
                    color: 3049153,
                    fields:
                        lobby.mode === 'score'
                            ? [
                                  {
                                      name: 'Blue Team',
                                      value: blueNicks || 'No participants',
                                  },
                                  {
                                      name: 'Red Team',
                                      value: redNicks || 'No participants',
                                  },
                              ]
                            : [
                                  {
                                      name: 'Participants',
                                      value: allNicks || 'No participants',
                                  },
                              ],
                },
            ],
            attachments: [],
        });
    }

    public async sendRoundEndWebhook(lobby: tournamentLobby) {
        const modeData = lobby.modeData as scoreMode;
        const blueScore = this.calculateTotalScore(modeData.blue);
        const redScore = this.calculateTotalScore(modeData.red);

        const blueNicks = lobby.participants.blue
            .map((p) => p.nick || p.user?.givenName)
            .join(', ');
        const redNicks = lobby.participants.red
            .map((p) => p.nick || p.user?.givenName)
            .join(', ');

        await axios.post(lobby.webhookURL, {
            content: null,
            embeds: [
                {
                    title: `${lobby.ended ? 'TOURNAMENT' : 'ROUND'} END - ${lobby.name}`,
                    description: `${lobby.ended ? `The tournament has ended.` : `Round ${lobby.currentRound}/${lobby.rounds} has ended.`}`,
                    color: 3066993,
                    fields: [
                        {
                            name: 'Blue team',
                            value: `${blueNicks}\nScore: ${blueScore}\nPoints: ${modeData.state.split(':')[0]}`,
                        },
                        {
                            name: 'Red team',
                            value: `${redNicks}\nScore: ${redScore}\nPoints: ${modeData.state.split(':')[1]}`,
                        },
                    ],
                },
            ],
            attachments: [],
        });
    }

    public async sendLOSEndWebhook(lobby: tournamentLobby) {
        const team = lobby.participants.blue.length > 0 ? 'blue' : 'red';
        const winner = lobby.participants[team].find((socket: any) =>
            lobby.roundsData[lobby.currentRound - 1].winners.includes(
                socket.user?.email
            )
        );

        if (!winner || !winner.user) {
            console.log("Couldn't get winner.");
            return;
        }

        await axios.post(lobby.webhookURL, {
            content: null,
            embeds: [
                {
                    title: `${lobby.ended ? 'TOURNAMENT' : 'ROUND'} END - ${lobby.name}`,
                    description: `${lobby.ended ? `The tournament has ended.` : `Round ${lobby.currentRound}/${lobby.rounds} has ended.`}`,
                    color: 3066993,
                    fields: [
                        {
                            name: 'Winner',
                            value: `${winner.nick || winner.user.givenName}`,
                        },
                    ],
                },
            ],
            attachments: [],
        });
    }

    public async restartServer() {
        const tournamentKey = this.getTournamentKey();
        const url =
            process.env.NODE_ENV === 'development'
                ? `http://localhost:3003/restart/${tournamentKey}`
                : `https://tournament.czrsd.com/restart/${tournamentKey}`;

        await axios.post(url, {
            key: tournamentKey,
        });
    }

    private calculateTotalScore(
        teamData: { email: string; score: number }[]
    ): number {
        return teamData.reduce((total, user) => total + user.score, 0);
    }

    private async getPassword() {
        const tournamentKey = this.getTournamentKey();
        const url =
            process.env.NODE_ENV === 'development'
                ? `http://localhost:3003/data/${tournamentKey}`
                : `https://tournament.czrsd.com/data/${tournamentKey}`;
        const res = await axios.get(url);

        return res.data.password;
    }

    private async getTournamentKey() {
        const keyPath = process.env.TOURNAMENT_KEY_PATH || '';
        return fs.readFileSync(keyPath, { encoding: 'utf-8' });
    }
}

export default new TournamentController();
