import { Collection, Db, Document } from 'mongodb';
import { COUNTERS, GAUGES, MetricRollup, MetricSample } from './types';

export const RAW_DAYS = 30;
export const HOURLY_DAYS = 90;
const DAY_MS = 86_400_000;
const durableWrite = { writeConcern: { w: 'majority' as const, j: true }, maxTimeMS: 3000, timeoutMS: 5000 };
export const bucketStart = (at: Date, sizeMs: number) => new Date(Math.floor(at.getTime() / sizeMs) * sizeMs);
export const gaugeWeight = (sample: MetricSample, key: string) =>
    key === 'httpDurationMeanMs' ? sample.counters.httpRequests : Math.max(0.001, sample.coverageSeconds);

export class MetricsStore {
    readonly raw: Collection<MetricSample & { expiresAt: Date; rollupsPending: boolean }>;
    readonly rollups: Collection<MetricRollup>;
    constructor(database: Db) {
        this.raw = database.collection('server_metric_samples');
        this.rollups = database.collection('server_metric_rollups');
    }
    async ensureIndexes(): Promise<void> {
        const options = { maxTimeMS: 3000, timeoutMS: 5000 };
        await this.raw.createIndex({ at: 1 }, options);
        await this.raw.createIndex({ rollupsPending: 1, at: 1 }, options);
        await this.raw.createIndex({ expiresAt: 1 }, { ...options, expireAfterSeconds: 0 });
        await this.rollups.createIndex({ resolution: 1, at: 1 }, options);
        await this.rollups.createIndex({ resolution: 1, lastAt: -1 }, options);
        await this.rollups.createIndex({ expiresAt: 1 }, { ...options, expireAfterSeconds: 0 });
    }
    async save(sample: MetricSample): Promise<void> {
        await this.raw.updateOne(
            { _id: sample._id },
            {
                $setOnInsert: { ...sample, rollupsPending: true, expiresAt: new Date(sample.at.getTime() + RAW_DAYS * DAY_MS) },
            },
            { ...durableWrite, upsert: true }
        );
        // Ordered per boot; the sequence guard makes retries safe even after only one rollup was written.
        for (const resolution of ['hour', 'day'] as const) {
            const at = bucketStart(sample.at, resolution === 'hour' ? 3_600_000 : DAY_MS);
            const id = `${resolution}:${at.toISOString()}:${sample.bootId}`;
            const inc: Record<string, number> = {
                samples: 1,
                coverageSeconds: sample.coverageSeconds,
                networkSamples: sample.networkAvailable ? 1 : 0,
            };
            const max: Record<string, number> = {};
            for (const key of COUNTERS) inc[`counters.${key}`] = sample.counters[key];
            for (const key of GAUGES) {
                const value = sample.gauges[key];
                if (value === null) continue;
                const weight = gaugeWeight(sample, key);
                inc[`gauges.${key}.sum`] = value * weight;
                inc[`gauges.${key}.weight`] = weight;
                max[`gauges.${key}.max`] = value;
            }
            try {
                await this.rollups.updateOne(
                    { _id: id, lastSequence: { $lt: sample.sequence } },
                    {
                        $setOnInsert: {
                            bootId: sample.bootId,
                            at,
                            resolution,
                            ...(resolution === 'hour' ? { expiresAt: new Date(at.getTime() + HOURLY_DAYS * DAY_MS) } : {}),
                        },
                        $set: { lastSequence: sample.sequence, lastAt: sample.at },
                        $inc: inc,
                        $max: max,
                    },
                    { ...durableWrite, upsert: true }
                );
            } catch (error) {
                if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
                const saved = await this.rollups.findOne(
                    { _id: id },
                    { projection: { lastSequence: 1 }, maxTimeMS: 3000, timeoutMS: 5000 }
                );
                if (!saved || saved.lastSequence < sample.sequence) throw error;
            }
        }
        await this.raw.updateOne({ _id: sample._id }, { $set: { rollupsPending: false } }, { maxTimeMS: 3000, timeoutMS: 5000 });
    }
    async recoverPending(): Promise<void> {
        // A crash between durable raw insertion and either rollup is repairable after restart.
        const pending = await this.raw
            .find({ rollupsPending: true }, { maxTimeMS: 3000, timeoutMS: 5000 })
            .sort({ at: 1 })
            .limit(100)
            .toArray();
        for (const sample of pending) await this.save(sample);
    }
    async history(from: Date, to: Date, resolution: 'minute' | 'hour' | 'day', bucketMs: number) {
        const raw = resolution === 'minute';
        const group: Document = {
            _id: { $toDate: { $subtract: [{ $toLong: '$at' }, { $mod: [{ $toLong: '$at' }, bucketMs] }] } },
            samples: { $sum: raw ? 1 : '$samples' },
            coverageSeconds: { $sum: '$coverageSeconds' },
            networkSamples: { $sum: raw ? { $cond: ['$networkAvailable', 1, 0] } : '$networkSamples' },
        };
        for (const key of COUNTERS) group[key] = { $sum: `$counters.${key}` };
        for (const key of GAUGES) {
            const weight = key === 'httpDurationMeanMs' ? '$counters.httpRequests' : { $max: [0.001, '$coverageSeconds'] };
            group[`${key}Sum`] = { $sum: raw ? { $multiply: [`$gauges.${key}`, weight] } : `$gauges.${key}.sum` };
            group[`${key}Weight`] = { $sum: raw ? { $cond: [{ $ne: [`$gauges.${key}`, null] }, weight, 0] } : `$gauges.${key}.weight` };
            group[`${key}Max`] = { $max: raw ? `$gauges.${key}` : `$gauges.${key}.max` };
        }
        const pipeline: Document[] = [
            { $match: { at: { $gte: from, $lt: to }, ...(raw ? {} : { resolution }) } },
            { $group: group },
            { $sort: { _id: 1 } },
            { $limit: 1500 },
        ];
        const collection = raw ? this.raw : this.rollups;
        return collection.aggregate(pipeline, { maxTimeMS: 5000, timeoutMS: 6000 }).toArray();
    }
    async bounds() {
        const [first, last] = await Promise.all([
            this.rollups.findOne({ resolution: 'day' }, { sort: { at: 1 }, projection: { at: 1 }, maxTimeMS: 3000, timeoutMS: 5000 }),
            this.rollups.findOne(
                { resolution: 'day' },
                { sort: { lastAt: -1 }, projection: { lastAt: 1 }, maxTimeMS: 3000, timeoutMS: 5000 }
            ),
        ]);
        return { first: first?.at ?? null, last: last?.lastAt ?? null };
    }
}
