import { createHmac, randomBytes } from 'crypto';
import PartyUsageModel from '../models/PartyUsageModel';
import logger from '../utils/logger';

const RETENTION_DAYS = 180;
const FLUSH_INTERVAL_MS = 10_000;
const RECONNECT_WINDOW_MS = 2 * 60_000;
const RECONNECT_KEY_LIMIT = 5_000;
const reconnectSecret = randomBytes(32);

type MetricPath =
    | 'sessionsStarted'
    | 'sessionsCompleted'
    | 'durationSeconds'
    | 'joins'
    | 'leaves'
    | 'reconnects'
    | 'chatMessages'
    | 'sizeBuckets.one'
    | 'sizeBuckets.twoToFour'
    | 'sizeBuckets.fiveToNine'
    | 'sizeBuckets.tenPlus';

type DailyDelta = Record<MetricPath, number>;
type PartySession = { startedAt: number };

const pending = new Map<string, Partial<DailyDelta>>();
const activeSessions = new Map<string, PartySession>();
// Nicknames are converted to a process-local keyed digest and only kept briefly to estimate reconnects.
const recentDisconnects = new Map<string, number[]>();
let pendingReconnectKeys = 0;
let flushInFlight: Promise<void> | null = null;
let acceptingEvents = true;

function utcDay(at: number): string {
    return new Date(at).toISOString().slice(0, 10);
}

function increment(day: string, metric: MetricPath, amount = 1): void {
    const delta = pending.get(day) ?? {};
    delta[metric] = (delta[metric] ?? 0) + amount;
    pending.set(day, delta);
}

function incrementNow(metric: MetricPath, amount = 1, at = Date.now()): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    increment(utcDay(at), metric, amount);
}

function partyKey(tag: string, server: string): string {
    return JSON.stringify([server, tag]);
}

function reconnectKey(tag: string, server: string, nick: string | null): string | null {
    const normalizedNick = typeof nick === 'string' ? nick.trim().toLocaleLowerCase() : '';
    if (!normalizedNick) return null;
    return createHmac('sha256', reconnectSecret).update(JSON.stringify([server, tag, normalizedNick])).digest('hex');
}

function cleanDisconnects(now: number): void {
    for (const [key, timestamps] of recentDisconnects) {
        const valid = timestamps.filter((timestamp) => now - timestamp <= RECONNECT_WINDOW_MS);
        pendingReconnectKeys -= timestamps.length - valid.length;
        if (valid.length) recentDisconnects.set(key, valid);
        else recentDisconnects.delete(key);
    }
}

function noteDisconnect(tag: string, server: string, nick: string | null, now: number): void {
    const key = reconnectKey(tag, server, nick);
    if (!key) return;
    cleanDisconnects(now);
    const timestamps = recentDisconnects.get(key) ?? [];
    timestamps.push(now);
    if (timestamps.length > 20) {
        timestamps.shift();
        pendingReconnectKeys--;
    }
    recentDisconnects.set(key, timestamps);
    pendingReconnectKeys++;
    while (pendingReconnectKeys > RECONNECT_KEY_LIMIT) {
        const oldestKey = recentDisconnects.keys().next().value;
        if (oldestKey === undefined) break;
        const oldest = recentDisconnects.get(oldestKey);
        if (oldest?.length) {
            oldest.shift();
            pendingReconnectKeys--;
            if (!oldest.length) recentDisconnects.delete(oldestKey);
        } else {
            recentDisconnects.delete(oldestKey);
        }
    }
}

function consumeReconnect(tag: string, server: string, nick: string | null, now: number): boolean {
    cleanDisconnects(now);
    const key = reconnectKey(tag, server, nick);
    if (!key) return false;
    const timestamps = recentDisconnects.get(key);
    if (!timestamps?.length) return false;
    timestamps.shift();
    pendingReconnectKeys--;
    if (!timestamps.length) recentDisconnects.delete(key);
    return true;
}

export function recordPartyNickname(tag: string, server: string, nick: string | null, at = Date.now()): void {
    if (!acceptingEvents) return;
    if (consumeReconnect(tag, server, nick, at)) incrementNow('reconnects', 1, at);
}

function recordDuration(startedAt: number, endedAt: number): void {
    const seconds = Math.round(Math.max(0, endedAt - startedAt) / 1000);
    if (seconds > 0) incrementNow('durationSeconds', seconds, endedAt);
}

export function recordPartyJoin(tag: string, server: string, size: number, nick: string | null, at = Date.now()): void {
    if (!acceptingEvents) return;
    const key = partyKey(tag, server);
    if (size <= 1) {
        activeSessions.set(key, { startedAt: at });
        incrementNow('sessionsStarted', 1, at);
    }

    incrementNow('joins', 1, at);
    const sizeMetric: MetricPath = size <= 1 ? 'sizeBuckets.one'
        : size <= 4 ? 'sizeBuckets.twoToFour'
          : size <= 9 ? 'sizeBuckets.fiveToNine'
            : 'sizeBuckets.tenPlus';
    incrementNow(sizeMetric, 1, at);

    recordPartyNickname(tag, server, nick, at);
}

export function recordPartyLeave(
    tag: string,
    server: string,
    size: number,
    nick: string | null,
    disconnected: boolean,
    at = Date.now()
): void {
    if (!acceptingEvents) return;
    incrementNow('leaves', 1, at);
    if (disconnected) noteDisconnect(tag, server, nick, at);

    if (size <= 1) {
        const key = partyKey(tag, server);
        const session = activeSessions.get(key);
        activeSessions.delete(key);
        if (session) {
            incrementNow('sessionsCompleted', 1, at);
            recordDuration(session.startedAt, at);
        }
    }
}

export function recordPartyChatMessage(at = Date.now()): void {
    if (!acceptingEvents) return;
    incrementNow('chatMessages', 1, at);
}

export async function stopPartyUsageCollection(at = Date.now()): Promise<void> {
    if (!acceptingEvents) return;
    acceptingEvents = false;
    for (const session of activeSessions.values()) {
        incrementNow('sessionsCompleted', 1, at);
        recordDuration(session.startedAt, at);
    }
    activeSessions.clear();
    await flushPartyUsage();
    if (pending.size) await flushPartyUsage();
}

export async function flushPartyUsage(): Promise<void> {
    if (flushInFlight) return flushInFlight;
    if (!pending.size) return;

    const batch = [...pending.entries()];
    pending.clear();
    flushInFlight = (async () => {
        const operations = batch.map(([day, metrics]) => {
            const dayDate = new Date(`${day}T00:00:00.000Z`);
            const expiresAt = new Date(dayDate.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
            const increments = Object.fromEntries(Object.entries(metrics).map(([key, amount]) => [`metrics.${key}`, amount]));
            return {
                updateOne: {
                    filter: { _id: day },
                    update: { $setOnInsert: { day: dayDate, expiresAt }, $inc: increments },
                    upsert: true,
                },
            };
        });

        try {
            await PartyUsageModel.bulkWrite(operations, { ordered: false });
        } catch (error) {
            for (const [day, metrics] of batch) {
                const current = pending.get(day) ?? {};
                for (const [key, amount] of Object.entries(metrics) as [MetricPath, number][]) {
                    current[key] = (current[key] ?? 0) + amount;
                }
                pending.set(day, current);
            }
            logger.error('[Party usage] Aggregate write failed; events remain queued in memory.', error);
        }
    })().finally(() => {
        flushInFlight = null;
    });

    return flushInFlight;
}

const flushTimer = setInterval(() => {
    cleanDisconnects(Date.now());
    void flushPartyUsage();
}, FLUSH_INTERVAL_MS);
flushTimer.unref();
