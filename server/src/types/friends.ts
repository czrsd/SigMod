import { ObjectId } from 'mongodb';

export enum Role {
    Owner = 'Owner',
    Moderator = 'Moderator',
    Vip = 'Vip',
    Member = 'Member',
}

export type modAccount = {
    _id?: ObjectId | string;
    username: string;
    password?: string;
    imageURL: string;
    role: string | Role;
    bio?: string;
    badges?: string[];
    online: boolean;
    visible: boolean;
    create_time: Date;
    save(): any;
};

export type modSettings = {
    target: ObjectId;
    static_status: string;
    accept_requests: Boolean | number;
    highlight_friends: Boolean | number;
    highlight_color: string;
    visible: Boolean | number;
};
