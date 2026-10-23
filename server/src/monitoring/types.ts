export const GAUGES = [
    'processCpuPercent',
    'hostCpuPercent',
    'rssBytes',
    'heapUsedBytes',
    'heapLimitBytes',
    'hostMemoryUsedBytes',
    'hostMemoryTotalBytes',
    'load1',
    'load5',
    'load15',
    'eventLoopP95Ms',
    'eventLoopMaxMs',
    'connections',
    'peakConnections',
    'v5Connections',
    'databaseReadyPercent',
    'databasePingMs',
    'diskTotalBytes',
    'diskAvailableBytes',
    'openFileDescriptors',
    'httpDurationMeanMs',
    'httpDurationMaxMs',
] as const;
export const COUNTERS = [
    'httpRequests',
    'httpErrors',
    'httpServerErrors',
    'httpAborted',
    'httpBytesIn',
    'httpBytesOut',
    'wsConnectionsOpened',
    'wsConnectionsClosed',
    'wsMessagesIn',
    'wsMessagesOut',
    'wsBytesIn',
    'wsBytesOut',
    'wsErrors',
    'processStarts',
    'databaseDisconnects',
    'databaseReconnects',
    'networkRxBytes',
    'networkTxBytes',
] as const;
export type Gauge = (typeof GAUGES)[number];
export type Counter = (typeof COUNTERS)[number];
export type Gauges = Record<Gauge, number | null>;
export type Counters = Record<Counter, number>;
export interface MetricSample {
    _id: string;
    bootId: string;
    sequence: number;
    at: Date;
    coverageSeconds: number;
    gauges: Gauges;
    counters: Counters;
    networkAvailable: boolean;
}
export interface AggregateGauge {
    sum: number;
    weight: number;
    max: number;
}
export interface MetricRollup {
    _id: string;
    bootId: string;
    at: Date;
    resolution: 'hour' | 'day';
    lastSequence: number;
    lastAt: Date;
    samples: number;
    coverageSeconds: number;
    networkSamples: number;
    gauges: Record<Gauge, AggregateGauge>;
    counters: Counters;
    expiresAt?: Date;
}
export const emptyCounters = (): Counters => Object.fromEntries(COUNTERS.map((key) => [key, 0])) as Counters;
