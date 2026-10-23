import express, { Request } from 'express';
import axios from 'axios';
import { isIP } from 'node:net';
import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';
import AccountModel from '../../models/AccountModel';
import SettingsUsageModel from '../../models/SettingsUsageModel';
import KeybindUsageModel from '../../models/KeybindUsageModel';
import { db } from '../../db/connection';
import { wsHandler } from '../../socket/setup';
import { noXSS } from '../../utils/helpers';
import { validateUsername } from '../../utils/validation';
import schema from '../../config/settingsUsageSchema.json';
import { asyncRoute, auditAdminAction, HttpError, boundedInteger } from '../common';
import { fieldCatalog, mergeFieldCatalogs, matchesUser, mongoUserQuery, parseUserQuery, visibleData, FieldInfo } from './user-query';
import { activeUserSnapshot } from './active-users';

const router = express.Router();
const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;
const CURSOR_RE = /^[a-f\d]{24}$/i;
const ID_RE = /^[a-f\d]{24}$/i;
const ROLES = new Set(['Owner', 'Moderator', 'Vip', 'Member']);
const FIELDS = new Set(Object.keys(schema.fields));
const SIGMALLY_CATALOG_URLS = {
    skins: 'https://sigmally.com/api/skins/all',
    skinImages: 'https://sigmally.com/static/skins/',
    clans: 'https://sigmally.com/api/clans',
    clanDetailBase: 'https://sigmally.com/api/clans/clan/',
} as const;
const SIGMALLY_CATALOG_CACHE_MS = 30 * 60 * 1000;
const sigmallyCatalogCache = new Map<string, { expiresAt: number; payload: unknown }>();
const sigmallyCatalogInFlight = new Map<string, Promise<unknown>>();
const SIGMALLY_SKIN_IMAGE_CACHE_MS = 30 * 60 * 1000;
const SIGMALLY_SKIN_IMAGE_CACHE_LIMIT = 48;
const SIGMALLY_SKIN_IMAGE_MAX_BYTES = 1024 * 1024;
type SkinImage = { expiresAt: number; contentType: string; body: Buffer };
const sigmallySkinImageCache = new Map<string, SkinImage>();
const sigmallySkinImageInFlight = new Map<string, Promise<SkinImage>>();
const IP_GEOLOCATION_CACHE_MS = 24 * 60 * 60 * 1000;
const IP_GEOLOCATION_CACHE_LIMIT = 2000;
type IpGeolocation = Record<string, unknown>;
const ipGeolocationCache = new Map<string, { expiresAt: number; data: IpGeolocation }>();
const ipGeolocationInFlight = new Map<string, Promise<IpGeolocation>>();
let eventLoop: ReturnType<typeof monitorEventLoopDelay> | undefined;
let cpuPrevious: NodeJS.CpuUsage | undefined;
const dbStatusCache = { expires: 0, value: { ready: false as boolean, pingMs: null as number | null } };
const countsCache: {
    expires: number;
    value: { sigmallyUsers: number | null; sigmodUsers: number | null; settingsInstallations: number | null };
} = {
    expires: 0,
    value: { sigmallyUsers: null, sigmodUsers: null, settingsInstallations: null },
};

const actorId = (req: Request): string => {
    const admin = (req as Request & { admin?: { id?: unknown } }).admin;
    return String(admin?.id ?? 'unknown').slice(0, 100);
};

function pageArgs(req: Request) {
    const limit = req.query.limit === undefined ? PAGE_DEFAULT : boundedInteger(req.query.limit, 1, PAGE_MAX, 'limit');
    const cursor = req.query.cursor;
    if (cursor !== undefined && (typeof cursor !== 'string' || !CURSOR_RE.test(cursor))) throw new HttpError(400, 'Invalid cursor');
    return { limit, cursor: cursor as string | undefined };
}

function addCursor(filter: Record<string, unknown>, cursor: string | undefined) {
    if (!cursor) return filter;
    return Object.keys(filter).length ? { $and: [filter, { _id: { $gt: new ObjectId(cursor) } }] } : { _id: { $gt: new ObjectId(cursor) } };
}

function validId(value: unknown) {
    if (typeof value !== 'string' || !ID_RE.test(value)) throw new HttpError(400, 'Invalid id');
    return value;
}

function successWithArrayData(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const payload = value as Record<string, unknown>;
    return payload.status === 'success' && Array.isArray(payload.data);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function isPublicIp(value: string): boolean {
    const version = isIP(value);
    if (version === 4) {
        const octets = value.split('.').map(Number);
        const [first, second, third] = octets;
        if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
        if (first === 100 && second >= 64 && second <= 127) return false;
        if (first === 169 && second === 254) return false;
        if (first === 172 && second >= 16 && second <= 31) return false;
        if (first === 192 && second === 0 && [0, 2].includes(third)) return false;
        if (first === 192 && second === 88 && third === 99) return false;
        if (first === 192 && second === 168) return false;
        if (first === 198 && [18, 19].includes(second)) return false;
        if (first === 198 && second === 51 && third === 100) return false;
        if (first === 203 && second === 0 && third === 113) return false;
        return true;
    }
    if (version !== 6) return false;
    const normalized = value.toLowerCase();
    if (normalized === '::' || normalized === '::1') return false;
    if (
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        /^fe[89ab]/.test(normalized) ||
        normalized.startsWith('ff')
    )
        return false;
    if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:10:')) return false;
    const first = Number.parseInt(normalized.split(':')[0] || '0', 16);
    return (first & 0xe000) === 0x2000;
}

async function ipGeolocation(ip: string): Promise<IpGeolocation> {
    const cached = ipGeolocationCache.get(ip);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (cached) ipGeolocationCache.delete(ip);
    const pending = ipGeolocationInFlight.get(ip);
    if (pending) return pending;

    const request = axios
        .get<unknown>(`https://ipwho.is/${encodeURIComponent(ip)}`, {
            timeout: 8000,
            maxContentLength: 64 * 1024,
            maxBodyLength: 64 * 1024,
            headers: { Accept: 'application/json' },
        })
        .then(({ data }) => {
            const location = objectRecord(data);
            if (!location || location.success !== true || typeof location.ip !== 'string')
                throw new HttpError(502, 'Geolocation lookup failed.');
            ipGeolocationCache.set(ip, { expiresAt: Date.now() + IP_GEOLOCATION_CACHE_MS, data: location });
            while (ipGeolocationCache.size > IP_GEOLOCATION_CACHE_LIMIT) {
                const oldest = ipGeolocationCache.keys().next().value;
                if (oldest === undefined) break;
                ipGeolocationCache.delete(oldest);
            }
            return location;
        })
        .catch((error: unknown) => {
            if (error instanceof HttpError) throw error;
            throw new HttpError(503, 'Geolocation provider is unavailable.');
        })
        .finally(() => ipGeolocationInFlight.delete(ip));
    ipGeolocationInFlight.set(ip, request);
    return request;
}

function successWithClanData(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const payload = value as Record<string, unknown>;
    const data = payload.data;
    return (
        payload.status === 'success' &&
        Boolean(data && typeof data === 'object' && !Array.isArray(data)) &&
        Array.isArray((data as Record<string, unknown>).requests)
    );
}

async function sigmallyCatalog(source: 'skins' | 'clans' | { clanId: string }): Promise<unknown> {
    let key: string;
    let url: string;
    let cacheMs: number;
    let validate: (payload: unknown) => boolean;
    if (source === 'skins') {
        key = 'skins';
        url = SIGMALLY_CATALOG_URLS.skins;
        cacheMs = SIGMALLY_CATALOG_CACHE_MS;
        validate = successWithArrayData;
    } else if (source === 'clans') {
        key = 'clans';
        url = SIGMALLY_CATALOG_URLS.clans;
        cacheMs = SIGMALLY_CATALOG_CACHE_MS;
        validate = successWithArrayData;
    } else {
        const detailId = validId(source.clanId);
        key = `clan:${detailId}`;
        url = `${SIGMALLY_CATALOG_URLS.clanDetailBase}${detailId}`;
        cacheMs = 0;
        validate = successWithClanData;
    }
    const cached = sigmallyCatalogCache.get(key);
    if (cacheMs && cached && cached.expiresAt > Date.now()) return cached.payload;
    const pending = sigmallyCatalogInFlight.get(key);
    if (pending) return pending;

    const request = axios
        .get(url, { timeout: 8000, maxContentLength: 5 * 1024 * 1024, maxBodyLength: 5 * 1024 * 1024 })
        .then(({ data }) => {
            if (!validate(data)) throw new HttpError(502, 'Sigmally catalog returned an invalid response.');
            if (cacheMs) sigmallyCatalogCache.set(key, { expiresAt: Date.now() + cacheMs, payload: data });
            return data as unknown;
        })
        .catch((error: unknown) => {
            if (error instanceof HttpError) throw error;
            throw new HttpError(503, 'Sigmally catalog is unavailable.');
        })
        .finally(() => sigmallyCatalogInFlight.delete(key));
    sigmallyCatalogInFlight.set(key, request);
    return request;
}

async function sigmallySkinImage(name: string): Promise<SkinImage> {
    const cached = sigmallySkinImageCache.get(name);
    if (cached && cached.expiresAt > Date.now()) return cached;
    if (cached) sigmallySkinImageCache.delete(name);
    const pending = sigmallySkinImageInFlight.get(name);
    if (pending) return pending;

    const request = (async () => {
        const payload = objectRecord(await sigmallyCatalog('skins'));
        const rows = payload && Array.isArray(payload.data) ? payload.data : [];
        const skin = rows.find((row) => objectRecord(row)?.name === name);
        if (!skin) throw new HttpError(404, 'Skin not found.');

        const response = await axios.get<ArrayBuffer>(
            `${SIGMALLY_CATALOG_URLS.skinImages}${encodeURIComponent(name)}`,
            {
                responseType: 'arraybuffer',
                timeout: 8000,
                maxContentLength: SIGMALLY_SKIN_IMAGE_MAX_BYTES,
                maxBodyLength: SIGMALLY_SKIN_IMAGE_MAX_BYTES,
                headers: { Accept: 'image/png,image/jpeg,image/webp' },
            }
        );
        const contentType = String(response.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType))
            throw new HttpError(502, 'Sigmally returned an unsupported skin image.');
        const body = Buffer.from(response.data);
        if (!body.length || body.length > SIGMALLY_SKIN_IMAGE_MAX_BYTES)
            throw new HttpError(502, 'Sigmally returned an invalid skin image.');

        const image: SkinImage = { expiresAt: Date.now() + SIGMALLY_SKIN_IMAGE_CACHE_MS, contentType, body };
        sigmallySkinImageCache.delete(name);
        sigmallySkinImageCache.set(name, image);
        while (sigmallySkinImageCache.size > SIGMALLY_SKIN_IMAGE_CACHE_LIMIT) {
            const oldest = sigmallySkinImageCache.keys().next().value;
            if (oldest === undefined) break;
            sigmallySkinImageCache.delete(oldest);
        }
        return image;
    })().finally(() => sigmallySkinImageInFlight.delete(name));
    sigmallySkinImageInFlight.set(name, request);
    return request;
}

function isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

const SIGMALLY_LIST_FIELDS = '_id nick imageURL givenName email gold subscription clan level lastAuth createTime';
const MOD_LIST_FIELDS = '_id username imageURL role bio badges online lastOnline visible create_time';
const MOD_DETAIL_FIELDS = `${MOD_LIST_FIELDS} discord_id`;

let userFieldsCache: { expires: number; fields: FieldInfo[] } | undefined;
let modUserFieldsCache: { expires: number; fields: FieldInfo[] } | undefined;
let userFieldsInFlight: Promise<FieldInfo[]> | undefined;
let modUserFieldsInFlight: Promise<FieldInfo[]> | undefined;

async function discoverFields(collectionName: string, known: FieldInfo[]): Promise<FieldInfo[]> {
    const discovered = new Map<string, Set<string>>();
    const cursor = db
        .collection(collectionName)
        .find({}, { projection: { token: 0, password: 0 }, maxTimeMS: 8000 })
        .sort({ _id: -1 })
        .batchSize(250);
    let batch: unknown[] = [];
    const mergeBatch = () => {
        for (const field of fieldCatalog(batch)) {
            if (!discovered.has(field.path)) discovered.set(field.path, new Set());
            for (const type of field.types) discovered.get(field.path)!.add(type);
        }
        batch = [];
    };
    try {
        for await (const doc of cursor) {
            batch.push(doc);
            if (batch.length === 250) mergeBatch();
        }
        if (batch.length) mergeBatch();
    } finally {
        await cursor.close();
    }
    const observed = [...discovered].map(([path, types]) => ({ path, types: [...types] }));
    return mergeFieldCatalogs(observed, known);
}

const SIGMALLY_KNOWN_FIELDS: FieldInfo[] = [
    { path: '_id', types: ['objectId'] },
    { path: 'nick', types: ['string'] },
    { path: 'imageURL', types: ['string'] },
    { path: 'givenName', types: ['string'] },
    { path: 'fullName', types: ['string'] },
    { path: 'email', types: ['string'] },
    { path: 'googleID', types: ['string'] },
    { path: 'ip', types: ['string'] },
    { path: 'userAgent', types: ['string'] },
    { path: 'clan', types: ['string'] },
    { path: 'level', types: ['number'] },
    { path: 'gold', types: ['number'] },
    { path: 'exp', types: ['number'] },
    { path: 'progress', types: ['number'] },
    { path: 'nextLevel', types: ['number'] },
    { path: 'seasonExp', types: ['number'] },
    { path: 'hourlyTime', types: ['number'] },
    { path: 'lastAuth', types: ['number'] },
    { path: 'subscription', types: ['number'] },
    { path: 'skins', types: ['array', 'string'] },
    { path: 'lastSkinUsed', types: ['array', 'string'] },
    { path: 'createTime', types: ['string'] },
    { path: 'updateTime', types: ['string'] },
    { path: 'boost', types: ['number'] },
    { path: 'cards', types: ['array', 'object'] },
    { path: 'sigma', types: ['object', 'array'] },
];
const SIGMOD_KNOWN_FIELDS: FieldInfo[] = [
    { path: '_id', types: ['objectId'] },
    { path: 'username', types: ['string'] },
    { path: 'discord_id', types: ['string'] },
    { path: 'imageURL', types: ['string'] },
    { path: 'role', types: ['string'] },
    { path: 'bio', types: ['string'] },
    { path: 'badges', types: ['array', 'string'] },
    { path: 'online', types: ['boolean'] },
    { path: 'lastOnline', types: ['date'] },
    { path: 'visible', types: ['boolean'] },
    { path: 'create_time', types: ['date'] },
];
const ACTIVE_KNOWN_FIELDS: FieldInfo[] = [
    { path: 'sid', types: ['string'] },
    { path: 'nick', types: ['string'] },
    { path: 'connectedAt', types: ['date', 'string'] },
    { path: 'lastMessageAt', types: ['date', 'string'] },
    { path: 'lastPongAt', types: ['date', 'string'] },
    { path: 'clientVersion', types: ['string'] },
    { path: 'server', types: ['string'] },
    { path: 'tag', types: ['string'] },
    { path: 'tagIndex', types: ['number'] },
    { path: 'score', types: ['number'] },
    { path: 'lastPingSent', types: ['number'] },
    { path: 'position', types: ['object'] },
    { path: 'position.x', types: ['number'] },
    { path: 'position.y', types: ['number'] },
    { path: 'isAlive', types: ['boolean'] },
    { path: 'isWsAlive', types: ['boolean'] },
    { path: 'skin', types: ['string'] },
    { path: 'color', types: ['string'] },
    { path: 'ping', types: ['number'] },
    { path: 'connection', types: ['object'] },
    { path: 'connection.path', types: ['string'] },
    { path: 'connection.ip', types: ['string'] },
    { path: 'connection.forwardedFor', types: ['string', 'null'] },
    { path: 'connection.userAgent', types: ['string', 'null'] },
    { path: 'connection.origin', types: ['string', 'null'] },
    { path: 'connection.protocol', types: ['string'] },
    { path: 'connection.bufferedAmount', types: ['number'] },
    { path: 'user', types: ['object', 'null'] },
    ...SIGMALLY_KNOWN_FIELDS.map((field) => ({ ...field, path: `user.${field.path}` })),
    { path: 'modUser', types: ['object', 'null'] },
    ...SIGMOD_KNOWN_FIELDS.map((field) => ({ ...field, path: `modUser.${field.path}` })),
    { path: 'storedUser', types: ['object', 'null'] },
    ...SIGMALLY_KNOWN_FIELDS.map((field) => ({ ...field, path: `storedUser.${field.path}` })),
    { path: 'storedModUser', types: ['object', 'null'] },
    ...SIGMOD_KNOWN_FIELDS.map((field) => ({ ...field, path: `storedModUser.${field.path}` })),
    { path: 'settings', types: ['object', 'null'] },
    { path: 'settings.target', types: ['string'] },
    { path: 'settings.static_status', types: ['string'] },
    { path: 'settings.accept_requests', types: ['boolean'] },
    { path: 'settings.highlight_friends', types: ['boolean'] },
    { path: 'settings.highlight_color', types: ['string'] },
];

router.get(
    '/sigmally-users/fields',
    asyncRoute(async (_req, res) => {
        if (!userFieldsCache || Date.now() > userFieldsCache.expires) {
            userFieldsInFlight ??= discoverFields('users', SIGMALLY_KNOWN_FIELDS);
            try {
                userFieldsCache = { expires: Date.now() + 60_000, fields: await userFieldsInFlight };
            } finally {
                userFieldsInFlight = undefined;
            }
        }
        res.json({ fields: userFieldsCache.fields });
    })
);

router.get(
    '/sigmod-users/fields',
    asyncRoute(async (_req, res) => {
        if (!modUserFieldsCache || Date.now() > modUserFieldsCache.expires) {
            modUserFieldsInFlight ??= discoverFields('modusers', SIGMOD_KNOWN_FIELDS);
            try {
                modUserFieldsCache = { expires: Date.now() + 60_000, fields: await modUserFieldsInFlight };
            } finally {
                modUserFieldsInFlight = undefined;
            }
        }
        res.json({ fields: modUserFieldsCache.fields });
    })
);

router.get(
    '/sigmally-catalog/skins',
    asyncRoute(async (_req, res) => {
        res.json(await sigmallyCatalog('skins'));
    })
);

router.get(
    '/ip-geolocation',
    asyncRoute(async (req, res) => {
        if (typeof req.query.ip !== 'string') throw new HttpError(400, 'Invalid IP address.');
        const ip = req.query.ip.trim();
        if (ip.length > 45 || isIP(ip) === 0) throw new HttpError(400, 'Invalid IP address.');
        if (!isPublicIp(ip)) {
            res.json({ ip, location: null, reason: 'private-or-reserved' });
            return;
        }
        res.json({ ip, location: await ipGeolocation(ip) });
    })
);

router.get(
    '/sigmally-catalog/skin-images/:name',
    asyncRoute(async (req, res) => {
        const name = req.params.name;
        if (!name || name.length > 160 || name.includes('/') || name.includes('\\') || name === '.' || name === '..')
            throw new HttpError(400, 'Invalid skin name.');
        const image = await sigmallySkinImage(name);
        res.setHeader('Cache-Control', `private, max-age=${Math.floor(SIGMALLY_SKIN_IMAGE_CACHE_MS / 1000)}`);
        res.setHeader('Content-Type', image.contentType);
        res.setHeader('Content-Length', image.body.length);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(image.body);
    })
);

router.get(
    '/sigmally-catalog/clans',
    asyncRoute(async (_req, res) => {
        res.json(await sigmallyCatalog('clans'));
    })
);

router.get(
    '/sigmally-catalog/clans/:id',
    asyncRoute(async (req, res) => {
        res.json(await sigmallyCatalog({ clanId: req.params.id }));
    })
);

async function activeRows() {
    const rows = [...wsHandler.sockets.values()].filter((socket) => socket.ws.readyState === 1).map(activeUserSnapshot);
    const ids = [
        ...new Set(
            rows
                .map((row) => (row.user as { _id?: string } | null)?._id)
                .filter((id): id is string => typeof id === 'string' && ID_RE.test(id))
        ),
    ];
    const modIds = [
        ...new Set(
            rows
                .map((row) => (row.modUser as { _id?: string } | null)?._id)
                .filter((id): id is string => typeof id === 'string' && ID_RE.test(id))
        ),
    ];
    const [users, accounts, settings] = await Promise.all([
        ids.length
            ? db
                  .collection('users')
                  .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { token: 0, password: 0 }, maxTimeMS: 2500 })
                  .toArray()
            : [],
        modIds.length
            ? db
                  .collection('modusers')
                  .find({ _id: { $in: modIds.map((id) => new ObjectId(id)) } }, { projection: { password: 0 }, maxTimeMS: 2500 })
                  .toArray()
            : [],
        modIds.length
            ? db
                  .collection('user_settings')
                  .find({ target: { $in: modIds } }, { maxTimeMS: 2500 })
                  .toArray()
            : [],
    ]);
    const userMap = new Map(users.map((user) => [String(user._id), user]));
    const accountMap = new Map(accounts.map((user) => [String(user._id), user]));
    const settingsMap = new Map(settings.map((item) => [String(item.target), item]));
    return rows.map(
        (row) =>
            visibleData({
                ...row,
                storedUser: userMap.get(String((row.user as { _id?: string } | null)?._id)) ?? null,
                storedModUser: accountMap.get(String((row.modUser as { _id?: string } | null)?._id)) ?? null,
                settings: settingsMap.get(String((row.modUser as { _id?: string } | null)?._id)) ?? null,
            }) as Record<string, unknown>
    );
}

router.get(
    '/active-users',
    asyncRoute(async (req, res) => {
        const input = parseUserQuery(req.query);
        const limit = req.query.limit === undefined ? 25 : boundedInteger(req.query.limit, 1, 100, 'limit');
        const cursor = req.query.cursor;
        if (cursor !== undefined && (typeof cursor !== 'string' || !/^[a-f\d-]{36}$/i.test(cursor)))
            throw new HttpError(400, 'Invalid cursor');
        const all = await activeRows();
        const filtered = all.filter((row) => matchesUser(row, input)).sort((a, b) => String(a.sid).localeCompare(String(b.sid)));
        const page = filtered.filter((row) => !cursor || String(row.sid) > String(cursor)).slice(0, limit + 1);
        const items = page.slice(0, limit).map((row) => ({
            sid: row.sid,
            nick: row.nick,
            server: row.server,
            tag: row.tag,
            score: row.score,
            ping: row.ping,
            isAlive: row.isAlive,
            connectedAt: row.connectedAt,
            clientVersion: row.clientVersion,
            user: row.user ? { _id: (row.user as Record<string, unknown>)._id, nick: (row.user as Record<string, unknown>).nick } : null,
            modUser: row.modUser
                ? { _id: (row.modUser as Record<string, unknown>)._id, username: (row.modUser as Record<string, unknown>).username }
                : null,
        }));
        res.json({
            items,
            total: all.length,
            matched: filtered.length,
            capturedAt: new Date(),
            fields: mergeFieldCatalogs(fieldCatalog(all), ACTIVE_KNOWN_FIELDS),
            nextCursor: page.length > limit ? String(items.at(-1)?.sid) : null,
        });
    })
);

router.get(
    '/active-users/:id',
    asyncRoute(async (req, res) => {
        if (!/^[a-f\d-]{36}$/i.test(req.params.id)) throw new HttpError(400, 'Invalid connection ID');
        const socket = wsHandler.sockets.get(req.params.id);
        if (!socket || socket.ws.readyState !== 1) throw new HttpError(404, 'Connection ended.');
        const row = (await activeRows()).find((row) => row.sid === req.params.id);
        if (!row || socket.ws.readyState !== 1) throw new HttpError(404, 'Connection ended.');
        res.json({ user: row, capturedAt: new Date() });
    })
);

router.get(
    '/stats',
    asyncRoute(async (_req, res) => {
        if (!eventLoop) eventLoop = monitorEventLoopDelay({ resolution: 20 });
        eventLoop.enable();
        if (Date.now() >= dbStatusCache.expires) {
            if (mongoose.connection.readyState !== 1) dbStatusCache.value = { ready: false, pingMs: null };
            else {
                const start = Date.now();
                try {
                    await db.db?.admin().ping({ maxTimeMS: 1500 });
                    dbStatusCache.value = { ready: true, pingMs: Date.now() - start };
                } catch {
                    dbStatusCache.value = { ready: false, pingMs: null };
                }
            }
            dbStatusCache.expires = Date.now() + 5000;
        }
        const cpu = process.cpuUsage(cpuPrevious);
        cpuPrevious = process.cpuUsage();
        if (Date.now() >= countsCache.expires) {
            const counts = await Promise.allSettled([
                db.collection('users').countDocuments({}, { maxTimeMS: 2500 }),
                AccountModel.countDocuments({}).maxTimeMS(2500),
                SettingsUsageModel.countDocuments({}).maxTimeMS(2500),
            ]);
            countsCache.value = {
                sigmallyUsers: counts[0].status === 'fulfilled' ? counts[0].value : null,
                sigmodUsers: counts[1].status === 'fulfilled' ? counts[1].value : null,
                settingsInstallations: counts[2].status === 'fulfilled' ? counts[2].value : null,
            };
            countsCache.expires = Date.now() + 30_000;
        }
        const byServer: Record<string, number> = Object.create(null);
        for (const client of wsHandler.sockets.values()) {
            if (client.req?.url?.startsWith('/ws/v5')) {
                const key = typeof client.server === 'string' && client.server.length <= 100 ? client.server : 'unassigned';
                byServer[key] = (byServer[key] ?? 0) + 1;
            }
        }
        res.json({
            process: {
                uptimeSeconds: Math.floor(process.uptime()),
                rssBytes: process.memoryUsage().rss,
                heapUsedBytes: process.memoryUsage().heapUsed,
                cpuDeltaMicros: cpu,
            },
            eventLoop: {
                delayMeanMs: Number.isFinite(eventLoop.mean) ? eventLoop.mean / 1e6 : 0,
                delayMaxMs: Number.isFinite(eventLoop.max) ? eventLoop.max / 1e6 : 0,
            },
            database: dbStatusCache.value,
            counts: countsCache.value,
            websocket: { connections: wsHandler.sockets.size, v5ConnectionsByServer: byServer },
            host: { loadAverage: os.loadavg() },
        });
    })
);

router.get(
    '/sigmally-users',
    asyncRoute(async (req, res) => {
        const { limit, cursor } = pageArgs(req);
        const query: Record<string, unknown> = {
            ...mongoUserQuery(parseUserQuery(req.query)),
        };
        if (req.query.clan !== undefined) {
            if (typeof req.query.clan !== 'string' || req.query.clan.length < 1 || req.query.clan.length > 50)
                throw new HttpError(400, 'Invalid clan');
            query.clan = req.query.clan;
        }
        const levelFilter: Record<string, number> = {};
        if (req.query.minLevel !== undefined) levelFilter.$gte = boundedInteger(req.query.minLevel, 0, 100_000, 'minLevel');
        if (req.query.maxLevel !== undefined) levelFilter.$lte = boundedInteger(req.query.maxLevel, 0, 100_000, 'maxLevel');
        if (levelFilter.$gte !== undefined && levelFilter.$lte !== undefined && levelFilter.$gte > levelFilter.$lte)
            throw new HttpError(400, 'minLevel must not exceed maxLevel');
        if (Object.keys(levelFilter).length) query.level = levelFilter;
        const cursorFilter = addCursor(query, cursor);
        const docs = await db
            .collection('users')
            .find(cursorFilter, { projection: SIGMALLY_LIST_FIELDS.split(' ').reduce((p, k) => ({ ...p, [k]: 1 }), {}), maxTimeMS: 10000 })
            .sort({ _id: 1 })
            .limit(limit + 1)
            .toArray();
        const hasMore = docs.length > limit;
        const rows = docs.slice(0, limit);
        res.json({
            identitySource: 'client-submitted-unverified',
            items: rows,
            nextCursor: hasMore ? (rows.at(-1)?._id?.toString() ?? null) : null,
        });
    })
);

router.get(
    '/sigmally-users/:id',
    asyncRoute(async (req, res) => {
        const id = validId(req.params.id);
        const doc = await db.collection('users').findOne(
            { _id: new ObjectId(id) },
            {
                projection: { token: 0, password: 0 },
                maxTimeMS: 2500,
            }
        );
        if (!doc) throw new HttpError(404, 'User not found');
        res.json({ identitySource: 'client-submitted-unverified', user: visibleData(doc) });
    })
);

router.get(
    '/sigmod-users',
    asyncRoute(async (req, res) => {
        const { limit, cursor } = pageArgs(req);
        const filter = addCursor(mongoUserQuery(parseUserQuery(req.query)), cursor);
        const docs = await AccountModel.find(filter)
            .select(MOD_LIST_FIELDS)
            .sort({ _id: 1 })
            .limit(limit + 1)
            .maxTimeMS(2500)
            .lean();
        const hasMore = docs.length > limit;
        const rows = docs.slice(0, limit);
        res.json({ items: rows, nextCursor: hasMore ? String(rows.at(-1)?._id ?? '') : null });
    })
);

router.get(
    '/sigmod-users/:id',
    asyncRoute(async (req, res) => {
        const id = validId(req.params.id);
        const doc = await AccountModel.findById(id).select(MOD_DETAIL_FIELDS).maxTimeMS(2500).lean();
        if (!doc) throw new HttpError(404, 'User not found');
        res.json(doc);
    })
);

router.patch(
    '/sigmod-users/:id',
    asyncRoute(async (req, res) => {
        const id = validId(req.params.id);
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid body');
        const allowed = new Set(['username', 'bio', 'badges', 'role', 'avatarOperation']);
        if (Object.keys(body).some((key) => !allowed.has(key)) || Object.keys(body).length === 0)
            throw new HttpError(400, 'Unsupported fields');
        const update: Record<string, unknown> = {};
        if ('username' in body) {
            if (validateUsername(body.username) !== true) throw new HttpError(400, 'Invalid username');
            update.username = body.username;
        }
        if ('bio' in body) {
            if (typeof body.bio !== 'string') throw new HttpError(400, 'Invalid bio');
            const bio = noXSS(body.bio.trim());
            if (bio.length > 250) throw new HttpError(400, 'Invalid bio');
            update.bio = bio;
        }
        if ('badges' in body) {
            if (
                !Array.isArray(body.badges) ||
                body.badges.length > 20 ||
                body.badges.some((v: unknown) => typeof v !== 'string' || v.length > 40)
            )
                throw new HttpError(400, 'Invalid badges');
            update.badges = [...new Set(body.badges)];
        }
        if ('role' in body) {
            if (typeof body.role !== 'string' || !ROLES.has(body.role)) throw new HttpError(400, 'Invalid role');
            update.role = body.role;
        }
        if ('avatarOperation' in body) {
            if (body.avatarOperation !== 'reset') throw new HttpError(400, 'Invalid avatar operation');
            update.imageURL = 'https://czrsd.com/static/sigmod/SigMod25-rounded.png';
        }
        let updated;
        try {
            updated = await AccountModel.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true })
                .select(MOD_DETAIL_FIELDS)
                .maxTimeMS(2500)
                .lean();
        } catch (error: unknown) {
            if (isDuplicateKeyError(error)) throw new HttpError(409, 'Username is already in use');
            throw error;
        }
        if (!updated) throw new HttpError(404, 'User not found');
        for (const client of wsHandler.sockets.values()) {
            if (client.modUser?._id?.toString() === id) Object.assign(client.modUser, update);
        }
        auditAdminAction('sigmod-user-updated', actorId(req), { userId: id, fields: Object.keys(update).sort().join(',') });
        res.json(updated);
    })
);

function settingsFilters(req: Request) {
    const filter: Record<string, unknown> = {};
    if (req.query.activeSince !== undefined) {
        if (
            typeof req.query.activeSince !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T/.test(req.query.activeSince) ||
            !Number.isFinite(Date.parse(req.query.activeSince))
        )
            throw new HttpError(400, 'Invalid activeSince');
        filter.lastSyncedAt = { $gte: new Date(req.query.activeSince) };
    }
    if (req.query.clientVersion !== undefined) {
        if (typeof req.query.clientVersion !== 'string' || req.query.clientVersion.length < 1 || req.query.clientVersion.length > 50)
            throw new HttpError(400, 'Invalid clientVersion');
        filter.clientVersion = req.query.clientVersion;
    }
    return filter;
}

const usageTotal = async (filter: Record<string, unknown>) => SettingsUsageModel.countDocuments(filter).maxTimeMS(2500);

router.get(
    '/settings-usage',
    asyncRoute(async (req, res) => {
        const filter = settingsFilters(req);
        const now = new Date();
        const [total, versions, syncAges] = await Promise.all([
            usageTotal(filter),
            SettingsUsageModel.aggregate([
                { $match: filter },
                { $group: { _id: '$clientVersion', installations: { $sum: 1 }, latestSyncAt: { $max: '$lastSyncedAt' } } },
                { $sort: { installations: -1, _id: 1 } },
                { $limit: 50 },
            ])
                .option({ maxTimeMS: 2500 })
                .exec(),
            SettingsUsageModel.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: {
                            $switch: {
                                branches: [
                                    {
                                        case: { $gte: ['$lastSyncedAt', new Date(now.getTime() - 24 * 60 * 60 * 1000)] },
                                        then: 'within24Hours',
                                    },
                                    {
                                        case: { $gte: ['$lastSyncedAt', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)] },
                                        then: 'within7Days',
                                    },
                                ],
                                default: 'older',
                            },
                        },
                        installations: { $sum: 1 },
                    },
                },
            ])
                .option({ maxTimeMS: 2500 })
                .exec(),
        ]);
        res.json({ denominator: 'installations', totalInstallations: total, byClientVersion: versions, syncAge: syncAges });
    })
);

router.get(
    '/settings-usage/fields/:path',
    asyncRoute(async (req, res) => {
        const path = req.params.path;
        if (!FIELDS.has(path)) throw new HttpError(400, 'Unknown settings field');
        const filter = settingsFilters(req);
        const fieldExpr = `$settings.${path}`;
        const defaultValue = (schema.fields as Record<string, { default?: unknown }>)[path]?.default;
        const pipeline = [
            { $match: filter },
            {
                $facet: {
                    counts: [
                        {
                            $project: {
                                state: {
                                    $cond: [
                                        { $eq: [{ $type: fieldExpr }, 'missing'] },
                                        'missing',
                                        { $cond: [{ $eq: [fieldExpr, { $literal: defaultValue }] }, 'default', 'customized'] },
                                    ],
                                },
                            },
                        },
                        { $group: { _id: '$state', installations: { $sum: 1 } } },
                    ],
                    values: [
                        { $project: { value: fieldExpr } },
                        { $group: { _id: '$value', installations: { $sum: 1 } } },
                        { $sort: { installations: -1 as const, _id: 1 as const } },
                        { $limit: 20 },
                    ],
                },
            },
        ];
        const [total, groups] = await Promise.all([
            usageTotal(filter),
            SettingsUsageModel.aggregate(pipeline).option({ maxTimeMS: 2500 }).exec(),
        ]);
        const result = groups[0] ?? { counts: [], values: [] };
        const counts = Object.fromEntries(
            (result.counts ?? []).map((group: { _id: string; installations: number }) => [group._id, group.installations])
        );
        res.json({
            field: path,
            denominator: 'installations',
            totalInstallations: total,
            defaultInstallations: counts.default ?? 0,
            customizedInstallations: counts.customized ?? 0,
            missingInstallations: counts.missing ?? 0,
            values: (result.values ?? []).map((group: { _id: unknown; installations: number }) => ({
                value: group._id,
                installations: group.installations,
            })),
        });
    })
);

router.get(
    '/settings-usage/keybinds',
    asyncRoute(async (req, res) => {
        const rawDays = req.query.days === undefined ? 30 : Number(req.query.days);
        if (!Number.isInteger(rawDays) || rawDays < 1 || rawDays > 180) throw new HttpError(400, 'days must be between 1 and 180');
        const since = new Date();
        since.setUTCHours(0, 0, 0, 0);
        since.setUTCDate(since.getUTCDate() - rawDays + 1);
        const rows = await KeybindUsageModel.find({ day: { $gte: since } })
            .select('_id day metrics labels')
            .maxTimeMS(5000)
            .lean();
        const uses = new Map<string, { action: string; input: string; binding: string; count: number; installations: Set<string> }>();
        const changes = new Map<string, { action: string; from: unknown; to: unknown; count: number; installations: Set<string> }>();
        const daily = new Map<string, { uses: number; changes: number; installations: Set<string> }>();
        for (const row of rows) {
            const installation = String(row._id).split(':')[0];
            const date = new Date(row.day).toISOString().slice(0, 10);
            const day = daily.get(date) ?? { uses: 0, changes: 0, installations: new Set<string>() };
            day.installations.add(installation);
            for (const [key, count] of Object.entries(row.metrics ?? {})) {
                const label = (row.labels ?? {})[key];
                if (typeof label !== 'string') continue;
                let metric: any;
                try { metric = JSON.parse(label); } catch { continue; }
                if (metric.type === 'use' && typeof metric.action === 'string' && typeof metric.input === 'string' && typeof metric.binding === 'string') {
                    const id = JSON.stringify([metric.action, metric.input, metric.binding]);
                    const item = uses.get(id) ?? { action: metric.action, input: metric.input, binding: metric.binding, count: 0, installations: new Set<string>() };
                    item.count += Number(count) || 0;
                    item.installations.add(installation);
                    uses.set(id, item);
                    day.uses += Number(count) || 0;
                } else if (metric.type === 'change' && typeof metric.action === 'string') {
                    const id = JSON.stringify([metric.action, metric.from, metric.to]);
                    const item = changes.get(id) ?? { action: metric.action, from: metric.from, to: metric.to, count: 0, installations: new Set<string>() };
                    item.count += Number(count) || 0;
                    item.installations.add(installation);
                    changes.set(id, item);
                    day.changes += Number(count) || 0;
                }
            }
            daily.set(date, day);
        }
        res.json({
            days: rawDays,
            reportingInstallationDays: rows.length,
            uses: [...uses.values()].map(({ installations, ...item }) => ({ ...item, installations: installations.size }))
                .sort((a, b) => b.count - a.count),
            changes: [...changes.values()].map(({ installations, ...item }) => ({ ...item, installations: installations.size }))
                .sort((a, b) => b.count - a.count),
            daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, item]) => ({
                date, uses: item.uses, changes: item.changes, installations: item.installations.size,
            })),
        });
    })
);

export default router;
