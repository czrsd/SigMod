import { alert, socketMessageData } from '../types';
import socket from './core/socket';
import { recordPartyJoin, recordPartyLeave } from '../services/partyUsage';

class SocketController {
    public sockets: Map<string, socket>;
    private userSockets: Map<string, Set<string>>;
    private socketUsers: Map<string, string>;
    private serverRooms: Map<string, Set<string>>;
    private tagRooms: Map<string, Set<string>>;

    public modLink: string;
    public version: string = '5.0.0';
    public alert: alert;
    public PING_COOLDOWN: number = 1000;

    constructor() {
        this.sockets = new Map();
        this.userSockets = new Map();
        this.socketUsers = new Map();
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

    public syncTagRoom(tag: string, server: string): void {
        const members = this.getTagMembersOnServer(tag, server);
        const content = members.map((m, i) => {
            m.tagIndex = i + 1;
            return {
                id: m.sid,
                tagIndex: m.tagIndex,
                nick: m.nick,
                score: m.score,
                skin: m.skin,
                color: m.color,
                isAlive: m.isAlive,
                ping: m.ping,
            };
        });
        for (const member of members) member.send({ type: 'tag-members', content });
    }

    private notifyTagDeparture(s: socket, tag: string, server: string): void {
        this.sendToTag({ type: 'leave-tag', content: { id: s.sid } }, tag, s.sid, server);
        this.sendToTag({ type: 'minimap-data', content: { sid: s.sid, nick: s.nick, x: null, y: null } }, tag, s.sid, server);
        this.syncTagRoom(tag, server);
    }

    public removeSocket(s: socket): void {
        if (!this.sockets.has(s.sid)) return;

        if (s.tag && s.server) {
            const roomKey = JSON.stringify([s.server, s.tag]);
            const roomSize = this.tagRooms.get(roomKey)?.size ?? 0;
            recordPartyLeave(s.tag, s.server, roomSize, s.nick, true);
            const tagSet = this.tagRooms.get(roomKey);
            if (tagSet) {
                tagSet.delete(s.sid);
                if (tagSet.size === 0) this.tagRooms.delete(roomKey);
            }
            this.notifyTagDeparture(s, s.tag, s.server);
            s.tag = null;
        }

        if (s.server) {
            const serverSet = this.serverRooms.get(s.server);
            if (serverSet) {
                serverSet.delete(s.sid);
                if (serverSet.size === 0) this.serverRooms.delete(s.server);
            }
        }

        const userId = this.socketUsers.get(s.sid);
        if (userId) {
            const userSet = this.userSockets.get(userId);
            if (userSet) {
                userSet.delete(s.sid);
                if (userSet.size === 0) this.userSockets.delete(userId);
            }
        }

        this.sockets.delete(s.sid);
        this.socketUsers.delete(s.sid);
    }

    public setSocketServer(s: socket, newServer: string): void {
        const oldServer = s.server;
        if (oldServer === newServer) {
            if (s.tag) this.syncTagRoom(s.tag, newServer);
            else s.send({ type: 'tag-members', content: [] });
            return;
        }

        if (oldServer) {
            const oldServerSet = this.serverRooms.get(oldServer);
            if (oldServerSet) {
                oldServerSet.delete(s.sid);
                if (oldServerSet.size === 0) this.serverRooms.delete(oldServer);
            }
            if (s.tag) {
                const oldTagKey = JSON.stringify([oldServer, s.tag]);
                const oldTagSet = this.tagRooms.get(oldTagKey);
                if (oldTagSet) recordPartyLeave(s.tag, oldServer, oldTagSet.size, s.nick, false);
                if (oldTagSet) {
                    oldTagSet.delete(s.sid);
                    if (oldTagSet.size === 0) this.tagRooms.delete(oldTagKey);
                }
                this.notifyTagDeparture(s, s.tag, oldServer);
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
            const newTagKey = JSON.stringify([newServer, s.tag]);
            let newTagSet = this.tagRooms.get(newTagKey);
            if (!newTagSet) {
                newTagSet = new Set();
                this.tagRooms.set(newTagKey, newTagSet);
            }
            newTagSet.add(s.sid);
            recordPartyJoin(s.tag, newServer, newTagSet.size, s.nick);
            this.syncTagRoom(s.tag, newServer);
        } else {
            s.send({ type: 'tag-members', content: [] });
        }
    }

    public setSocketTag(s: socket, newTag: string | null): void {
        const oldTag = s.tag;
        if (oldTag === newTag) return;

        if (oldTag && s.server) {
            const oldKey = JSON.stringify([s.server, oldTag]);
            const oldSet = this.tagRooms.get(oldKey);
            if (oldSet) recordPartyLeave(oldTag, s.server, oldSet.size, s.nick, false);
            if (oldSet) {
                oldSet.delete(s.sid);
                if (oldSet.size === 0) this.tagRooms.delete(oldKey);
            }
            this.notifyTagDeparture(s, oldTag, s.server);
        }

        s.tag = newTag;

        if (newTag && s.server) {
            const newKey = JSON.stringify([s.server, newTag]);
            let newSet = this.tagRooms.get(newKey);
            if (!newSet) {
                newSet = new Set();
                this.tagRooms.set(newKey, newSet);
            }
            newSet.add(s.sid);
            recordPartyJoin(newTag, s.server, newSet.size, s.nick);
            this.syncTagRoom(newTag, s.server);
        } else {
            s.tagIndex = null;
            s.send({ type: 'tag-members', content: [] });
        }
    }

    public setSocketUser(s: socket, userId: string): void {
        const previous = this.socketUsers.get(s.sid);
        if (previous && previous !== userId) {
            const oldSet = this.userSockets.get(previous);
            oldSet?.delete(s.sid);
            if (!oldSet?.size) this.userSockets.delete(previous);
        }
        this.socketUsers.set(s.sid, userId);
        let userSet = this.userSockets.get(userId);
        if (!userSet) {
            userSet = new Set();
            this.userSockets.set(userId, userSet);
        }
        userSet.add(s.sid);
    }

    public clearSocketUser(s: socket): void {
        const previous = this.socketUsers.get(s.sid);
        if (previous) {
            const oldSet = this.userSockets.get(previous);
            oldSet?.delete(s.sid);
            if (!oldSet?.size) this.userSockets.delete(previous);
        }
        this.socketUsers.delete(s.sid);
        s.modUser = null;
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
        const roomKey = JSON.stringify([server, tag]);
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

    public getActiveTagRooms(): Array<{ tag: string; server: string; members: socket[] }> {
        const groups = new Map<string, { tag: string; server: string; members: socket[] }>();
        for (const s of this.sockets.values()) {
            if (!s.tag || !s.server) continue;
            const key = JSON.stringify([s.server, s.tag]);
            const group = groups.get(key) ?? { tag: s.tag, server: s.server, members: [] };
            group.members.push(s);
            groups.set(key, group);
        }
        return [...groups.values()];
    }

    public sendToTag(data: socketMessageData, tag: string, excludeSid?: string, server?: string): void {
        if (server) {
            const members = this.getTagMembersOnServer(tag, server, excludeSid);
            for (const s of members) s.send(data);
            return;
        }

        for (const s of this.sockets.values()) {
            if (s.tag === tag && s.sid !== excludeSid) s.send(data);
        }
    }

    public sendToUser(userId: string, data: any): void {
        const sids = this.userSockets.get(userId);
        if (!sids) return;
        for (const sid of sids) {
            const s = this.sockets.get(sid);
            if (s?.modUser?._id?.toString() === userId) s.send(data);
        }
    }

    public onlineFriends(ids: string[]): socket[] {
        const onlineFriendSockets: socket[] = [];
        for (const userId of ids) {
            const sids = this.userSockets.get(userId);
            if (sids && sids.size > 0) {
                for (const sid of sids) {
                    const s = this.sockets.get(sid);
                    if (s?.modUser?._id?.toString() === userId && s.modUser.online !== false) {
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
