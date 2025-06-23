export type socketMessageData = {
    type: string;
    content?: any;
};

export type PingData = {
    x: number;
    y: number;
};

export type minimapData = {
    x: number;
    y: number;
    nick: string;
    sid: string;
};
