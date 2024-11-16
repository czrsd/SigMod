import { ObjectId } from 'mongodb';

export type JWTPayload_accessToken = {
    userId: string;
    valid: boolean;
    sessionId: string;
    iat: number;
    exp: number;
};

export type JWTPayload_refreshToken = {
    sessionId: string;
    iat: number;
    exp: number;
};

export type google_user = {
    _id: string | ObjectId;
    imageURL: string;
    gold: number;
    level: number;
    exp: number;
    progress: number;
    nextLevel: number;
    skins: string[] | undefined;
    lastSkinUsed: string[];
    token: string;
    googleID: string;
    email: string;
    fullName: string;
    givenName: string;
    updateTime: string;
    createTime: string;
    __v: number | undefined;
    seasonExp: number;
    hourlyTime: number;
    sigma: any;
    subscription: number;
    clan: string;
    cards: any;
    boost: number;
};
