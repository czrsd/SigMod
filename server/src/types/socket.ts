export type socketMessageData = {
    type: string;
    content?: any;
};

export type PingData = {
    x: number;
    y: number;
    sW: number; // Screen width
    sH: number; // Screen height
};

export type minimapData = {
    x: number;
    y: number;
    nick: string;
    sid: string;
};
