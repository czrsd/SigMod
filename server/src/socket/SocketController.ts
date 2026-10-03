import { alert, socketMessageData } from '../types';
import socket from './core/socket';

class SocketController {
    public sockets: Map<string, socket>;
    private userSockets: Map<string, Set<string>>;
    private serverRooms: Map<string, Set<string>>;
    private tagRooms: Map<string, Set<string>>;

    public modLink: string;
    public version: string = '5.0.0';
    public alert: alert;
    public PING_COOLDOWN: number = 1000;

    constructor() {
        this.sockets = new Map();
        this.userSockets = new Map();
        this.serverRooms = new Map();
        this.tagRooms = new Map();

        this.modLink = 'https://update.greasyfork.org/scripts/454648/SigMod%20Client%20%28Macros%29.user.js';

        this.alert = {
            title: 'Welcome to SigMod v11',
            description: 'Enjoy the new ultra-fast backend engine and party syncing!',
            enabled: false,
            link: null,
            buttonText: null,
        };
    }

    public registerSocket(s: socket): void {
        this.sockets.set(s.sid, s);
    }

    public removeSocket(s: socket): void {
        if (s.server) {
            const serverSet = this.serverRooms.get(s.server);
            if (serverSet) {
                serverSet.delete(s.sid);
                if (serverSet.size === 0) this.serverRooms.delete(s.server);
            }
            if (s.tag) {
                const roomKey = `${s.server}:${s.tag}`;
                const tagSet = this.tagRooms.get(roomKey);
                if (tagSet) {
                    tagSet.delete(s.sid);
                    if (tagSet.size === 0) this.tagRooms.delete(roomKey);
                }
            }
        }

        const userId = s.modUser?._id?.toString() || (s.user as any)?._id?.toString();
        if (userId) {
            const userSet = this.userSockets.get(userId);
            if (userSet) {
                userSet.delete(s.sid);
                if (userSet.size === 0) this.userSockets.delete(userId);
            }
        }

        this.sockets.delete(s.sid);
    }

    public setSocketServer(s: socket, newServer: string): void {
        const oldServer = s.server;
        if (oldServer === newServer) return;

        if (oldServer) {
            const oldServerSet = this.serverRooms.get(oldServer);
            if (oldServerSet) {
                oldServerSet.delete(s.sid);
                if (oldServerSet.size === 0) this.serverRooms.delete(oldServer);
            }
            if (s.tag) {
                const oldTagKey = `${oldServer}:${s.tag}`;
                const oldTagSet = this.tagRooms.get(oldTagKey);
                if (oldTagSet) {
                    oldTagSet.delete(s.sid);
                    if (oldTagSet.size === 0) this.tagRooms.delete(oldTagKey);
                }
            }
        }

        s.server = newServer;

        let newServerSet = this.serverRooms.get(newServer);
        if (!newServerSet) {
            newServerSet = new Set();
            this.serverRooms.set(newServer, newServerSet);
        }
        newServerSet.add(s.sid);

        if (s.tag) {
            const newTagKey = `${newServer}:${s.tag}`;
            let newTagSet = this.tagRooms.get(newTagKey);
            if (!newTagSet) {
                newTagSet = new Set();
                this.tagRooms.set(newTagKey, newTagSet);
            }
            newTagSet.add(s.sid);
        }
    }

    public setSocketTag(s: socket, newTag: string | null): void {
        const oldTag = s.tag;
        if (oldTag === newTag) return;

        if (oldTag && s.server) {
            const oldKey = `${s.server}:${oldTag}`;
            const oldSet = this.tagRooms.get(oldKey);
            if (oldSet) {
                oldSet.delete(s.sid);
                if (oldSet.size === 0) this.tagRooms.delete(oldKey);
            }
        }

        s.tag = newTag;

        if (newTag && s.server) {
            const newKey = `${s.server}:${newTag}`;
            let newSet = this.tagRooms.get(newKey);
            if (!newSet) {
                newSet = new Set();
                this.tagRooms.set(newKey, newSet);
            }
            newSet.add(s.sid);
        }
    }

    public setSocketUser(s: socket, userId: string): void {
        let userSet = this.userSockets.get(userId);
        if (!userSet) {
            userSet = new Set();
            this.userSockets.set(userId, userSet);
        }
        userSet.add(s.sid);
    }

    public sendToAll(data: socketMessageData): void {
        this.sockets.forEach((socket) => socket.send(data));
    }

    public getServerSockets(server: string): socket[] {
        const sids = this.serverRooms.get(server);
        if (!sids) return [];
        const result: socket[] = [];
        for (const sid of sids) {
            const s = this.sockets.get(sid);
            if (s) result.push(s);
        }
        return result;
    }

    public sendToServer(server: string, data: socketMessageData): void {
        const sids = this.serverRooms.get(server);
        if (!sids) return;
        for (const sid of sids) {
            const s = this.sockets.get(sid);
            if (s) s.send(data);
        }
    }

    public getTagMembersOnServer(tag: string, server: string, excludeSid?: string): socket[] {
        const roomKey = `${server}:${tag}`;
        const sids = this.tagRooms.get(roomKey);
        if (!sids) return [];

        const members: socket[] = [];
        for (const sid of sids) {
            if (excludeSid && sid === excludeSid) continue;
            const s = this.sockets.get(sid);
            if (s) members.push(s);
        }
        return members;
    }

    public sendToTag(data: socketMessageData, tag: string, excludeSid?: string, server?: string): void {
        if (server) {
            const members = this.getTagMembersOnServer(tag, server, excludeSid);
            for (const s of members) s.send(data);
            return;
        }

        // Broadcast across all servers for this tag if server is not specified
        for (const [roomKey, sids] of this.tagRooms.entries()) {
            if (roomKey.endsWith(`:${tag}`)) {
                for (const sid of sids) {
                    if (excludeSid && sid === excludeSid) continue;
                    const s = this.sockets.get(sid);
                    if (s) s.send(data);
                }
            }
        }
    }

    public sendToUser(userId: string, data: any): void {
        const sids = this.userSockets.get(userId);
        if (!sids) return;
        for (const sid of sids) {
            const s = this.sockets.get(sid);
            if (s) s.send(data);
        }
    }

    public onlineFriends(ids: string[]): socket[] {
        const onlineFriendSockets: socket[] = [];
        for (const userId of ids) {
            const sids = this.userSockets.get(userId);
            if (sids && sids.size > 0) {
                for (const sid of sids) {
                    const s = this.sockets.get(sid);
                    if (s && s.modUser) {
                        onlineFriendSockets.push(s);
                        break;
                    }
                }
            }
        }
        return onlineFriendSockets;
    }
}

export default new SocketController();
