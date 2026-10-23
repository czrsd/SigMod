import { Router } from 'express';
import { db } from '../db/connection';
import { asyncRoute, HttpError } from '../admin/common';
import { MetricsStore, RAW_DAYS } from './storage';
import { historyRange, summarizeHistory } from './history';
import { monitoringState } from './runtime';

const router = Router();
router.get(
    '/stats/history',
    asyncRoute(async (req, res) => {
        try {
            historyRange(req.query);
        } catch (error) {
            throw new HttpError(400, (error as Error).message);
        }
        if (!db.db) throw new HttpError(503, 'Metrics database unavailable.');
        const store = new MetricsStore(db.db);
        const bounds = await store.bounds();
        const range = historyRange(req.query, bounds.first);
        const grouped = await store.history(range.from, range.to, range.resolution, range.bucketMs);
        res.json({
            range: range.range,
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            resolution: range.resolution,
            bucketSeconds: range.bucketMs / 1000,
            earliestAt: bounds.first?.toISOString() ?? null,
            retainedRawDays: RAW_DAYS,
            ...summarizeHistory(grouped as Parameters<typeof summarizeHistory>[0]),
            monitoring: {
                intervalSeconds: 60,
                rawRetentionDays: RAW_DAYS,
                hourlyRetentionDays: 90,
                scope: 'v5-process',
                networkScope: process.platform === 'linux' ? 'host-interfaces' : 'unavailable',
                timeZone: 'UTC',
                ...monitoringState(),
                lastPersistedAt: bounds.last?.toISOString() ?? null,
            },
        });
    })
);
export default router;
