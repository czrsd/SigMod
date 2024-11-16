import { ObjectId } from 'mongodb';

export enum Role {
    Owner = 'Owner',
    Moderator = 'Moderator',
    Vip = 'Vip',
    Member = 'Member',
}

export type modAccount = {
    _id: ObjectId;
    username: string;
    password: string;
    imageURL: string;
    role: Role;
    bio: string;
    badges: string[];
    online: boolean;
    visible: boolean;
    create_time: string;
};

export type modSettings = {
    target: ObjectId;
    static_status: string;
    accept_requests: Boolean | number;
    highlight_friends: Boolean | number;
    highlight_color: string;
    visible: Boolean | number;
};
