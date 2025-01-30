import socket from '../socket/core/socket';

export type tournamentSetupData = {
    name: string;
    mode: tournamentMode;
    participantIds: participants;
    prizes: string[];
    rounds: number;
    time: string;
    hosts: string;
    schedule: boolean;
    schedule_time: string;
    webhookURL: string;
};

export enum tournamentMode {
    score = 'score',
    lastOneStanding = 'lastOneStanding',
}

export type participants = {
    blue: string[];
    red: string[];
};

export interface tournamentLobby extends tournamentSetupData {
    id: string;
    participants: participantSockets;
    totalUsers: number;
    ready: string[];
    currentRound: number;
    modeData: scoreMode | lastOneStanding;
    online: number;
    started: boolean;
    roundsData: { started: null | number; winners: string[] }[];
    password: string;
    ended: boolean;
}

export type participantSockets = {
    blue: socket[];
    red: socket[];
};

export type scoreMode = {
    blue: { email: string; score: number }[];
    red: { email: string; score: number }[];
    state: string;
};

export type lastOneStanding = {
    emails: string[];
};

export type lobby = {
    currentRound: number;
    started: number;
    rounds: number;
    time: number;
    tag: string;
};
