import { COUNTERS, GAUGES } from './types';
import { RAW_DAYS, HOURLY_DAYS } from './storage';

const DAY = 86_400_000;
export function historyRange(query: Record<string, unknown>, first: Date | null = null, now = new Date()) {
    const range = query.range ?? 'today';
    if (typeof range !== 'string' || !['today', '7d', '30d', 'all', 'day'].includes(range)) throw new Error('Invalid range.');
    const today = new Date(Math.floor(now.getTime() / DAY) * DAY);
    let from = today;
    let to = now;
    if (range === 'day') {
        if (typeof query.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(query.date)) throw new Error('Invalid UTC date.');
        from = new Date(`${query.date}T00:00:00.000Z`);
        if (!Number.isFinite(from.getTime()) || from.toISOString().slice(0, 10) !== query.date || from > today)
            throw new Error('Invalid UTC date.');
        to = new Date(Math.min(now.getTime(), from.getTime() + DAY));
    }
    if (range === '7d') from = new Date(today.getTime() - 6 * DAY);
    if (range === '30d') from = new Date(today.getTime() - 29 * DAY);
    if (range === 'all') from = first ?? today;
    let resolution: 'minute' | 'hour' | 'day' = range === 'today' || range === 'day' ? 'minute' : 'hour';
    if (range === 'all' || from.getTime() < now.getTime() - HOURLY_DAYS * DAY) resolution = 'day';
    else if (resolution === 'minute' && from.getTime() < now.getTime() - RAW_DAYS * DAY) resolution = 'hour';
    const bucketMs =
        resolution === 'minute'
            ? 60_000
            : resolution === 'hour'
                ? 3_600_000
                : Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY / 400)) * DAY;
    return { range, from, to, resolution, bucketMs };
}

interface GroupedMetric extends Record<string, unknown> {
    _id: Date;
    samples: number;
    coverageSeconds: number;
    networkSamples: number;
}
export function summarizeHistory(rows: GroupedMetric[]) {
    const totals: Record<string, number | null> = { samples: 0, coverageSeconds: 0 };
    for (const key of COUNTERS) totals[key] = 0;
    let networkSamples = 0;
    const points = rows.map((row) => {
        const point: Record<string, string | number | null> = {
            at: row._id.toISOString(),
            samples: row.samples,
            coverageSeconds: row.coverageSeconds,
        };
        totals.samples! += row.samples;
        totals.coverageSeconds! += row.coverageSeconds;
        networkSamples += row.networkSamples;
        for (const key of COUNTERS) {
            point[key] = Number(row[key] ?? 0);
            totals[key]! += Number(row[key] ?? 0);
        }
        for (const key of GAUGES) {
            const weight = Number(row[`${key}Weight`] ?? 0);
            const useMaximum = ['peakConnections', 'eventLoopMaxMs', 'httpDurationMaxMs'].includes(key);
            point[key] = weight > 0 ? Number(row[`${key}${useMaximum ? 'Max' : 'Sum'}`]) / (useMaximum ? 1 : weight) : null;
        }
        if (!row.networkSamples) {
            point.networkRxBytes = null;
            point.networkTxBytes = null;
        }
        return point;
    });
    if (!networkSamples) {
        totals.networkRxBytes = null;
        totals.networkTxBytes = null;
    }
    return { points, totals };
}
