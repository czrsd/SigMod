import os from 'node:os';
import { getHeapStatistics } from 'node:v8';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import mongoose from 'mongoose';
import { db } from '../db/connection';
import { wsHandler } from '../socket/setup';
import logger from '../utils/logger';
import { DiagnosticCounters, diagnosticCounters, metricsEnabled } from './counters';
import { cpuTicks, readDisk, readNetwork, networkDelta, readOpenFileDescriptors } from './host';
import { MetricSample, Gauges } from './types';
import { MetricsCollector, SampleSource } from './collector';
import { MetricsStore } from './storage';

class RuntimeSource implements SampleSource {
    private histogram = monitorEventLoopDelay({ resolution: 20 });
    private cpu = process.cpuUsage();
    private hostCpu = cpuTicks();
    private since = performance.now();
    private network = readNetwork();
    constructor(private counters: DiagnosticCounters) {
        this.histogram.enable();
    }

    async sample(bootId: string, sequence: number): Promise<MetricSample> {
        const [previousNetwork, network, disk, fds, database] = await Promise.all([
            this.network,
            readNetwork(),
            readDisk(),
            readOpenFileDescriptors(),
            this.databaseStatus(),
        ]);
        const now = performance.now();
        const seconds = Math.max(0.001, (now - this.since) / 1000);
        this.since = now;
        const cpuNow = process.cpuUsage();
        const hostCpuNow = cpuTicks();
        const hostTotal = hostCpuNow.total - this.hostCpu.total;
        const traffic = networkDelta(previousNetwork, network);
        this.network = Promise.resolve(network);
        const drained = this.counters.drain();
        drained.counters.networkRxBytes = traffic?.rx ?? 0;
        drained.counters.networkTxBytes = traffic?.tx ?? 0;
        const memory = process.memoryUsage();
        const loads = os.loadavg();
        const gauges: Gauges = {
            processCpuPercent: (cpuNow.user - this.cpu.user + (cpuNow.system - this.cpu.system)) / (seconds * 10_000),
            hostCpuPercent:
                hostTotal > 0 ? Math.max(0, Math.min(100, 100 * (1 - (hostCpuNow.idle - this.hostCpu.idle) / hostTotal))) : null,
            rssBytes: memory.rss,
            heapUsedBytes: memory.heapUsed,
            heapLimitBytes: getHeapStatistics().heap_size_limit,
            hostMemoryTotalBytes: os.totalmem(),
            hostMemoryUsedBytes: os.totalmem() - os.freemem(),
            load1: process.platform === 'win32' ? null : loads[0],
            load5: process.platform === 'win32' ? null : loads[1],
            load15: process.platform === 'win32' ? null : loads[2],
            eventLoopP95Ms: this.histogram.count ? this.histogram.percentile(95) / 1e6 : null,
            eventLoopMaxMs: this.histogram.count ? this.histogram.max / 1e6 : null,
            connections: [...wsHandler.sockets.values()].filter((socket) => socket.ws.readyState === 1).length,
            v5Connections: [...wsHandler.sockets.values()].filter(
                (socket) => socket.ws.readyState === 1 && socket.req.url?.startsWith('/ws/v5')
            ).length,
            peakConnections: drained.peakConnections,
            databaseReadyPercent: database.ready ? 100 : 0,
            databasePingMs: database.pingMs,
            diskTotalBytes: disk?.total ?? null,
            diskAvailableBytes: disk?.available ?? null,
            openFileDescriptors: fds,
            httpDurationMeanMs: drained.httpDurationMeanMs,
            httpDurationMaxMs: drained.httpDurationMaxMs,
        };
        this.cpu = cpuNow;
        this.hostCpu = hostCpuNow;
        this.histogram.reset();
        return {
            _id: `${bootId}:${sequence}`,
            bootId,
            sequence,
            at: new Date(),
            coverageSeconds: seconds,
            gauges,
            counters: drained.counters,
            networkAvailable: traffic !== null,
        };
    }
    private async databaseStatus() {
        const started = performance.now();
        if (mongoose.connection.readyState !== 1 || !db.db) return { ready: false, pingMs: null };
        try {
            await db.db.admin().ping({ maxTimeMS: 1500, timeoutMS: 2000 });
            return { ready: true, pingMs: performance.now() - started };
        } catch {
            return { ready: false, pingMs: null };
        }
    }
    stop() {
        this.histogram.disable();
    }
}

let collector: MetricsCollector | undefined;
let stopping: Promise<void> | undefined;
export const monitoringState = () => ({
    collecting: Boolean(collector && !stopping),
    lastPersistedAt: collector?.lastPersistedAt?.toISOString() ?? null,
    pendingSamples: collector?.pendingSamples ?? 0,
    droppedSamples: collector?.droppedSamples ?? 0,
    writeFailures: collector?.writeFailures ?? 0,
});

export function startServerMonitoring(): void {
    if (!metricsEnabled() || collector) return;
    if (!db.db) throw new Error('Metrics require an initialized database.');
    const store = new MetricsStore(db.db);
    let lastWarning = -Infinity;
    collector = new MetricsCollector(
        new RuntimeSource(diagnosticCounters),
        {
            ensureIndexes: () => {
                if (mongoose.connection.readyState !== 1) return Promise.reject(new Error('Database unavailable.'));
                return store.ensureIndexes();
            },
            recoverPending: () => {
                if (mongoose.connection.readyState !== 1) return Promise.reject(new Error('Database unavailable.'));
                return store.recoverPending();
            },
            save: (sample) => {
                if (mongoose.connection.readyState !== 1) return Promise.reject(new Error('Database unavailable.'));
                return store.save(sample);
            },
        },
        () => {
            if (Date.now() - lastWarning > 300_000) {
                lastWarning = Date.now();
                logger.warn('[Diagnostics] Metrics persistence failed; bounded retry queue is active.');
            }
        }
    );
    diagnosticCounters.increment('processStarts');
    db.on('disconnected', onDisconnected);
    db.on('reconnected', onReconnected);
    collector.start();
}
const onDisconnected = () => diagnosticCounters.increment('databaseDisconnects');
const onReconnected = () => diagnosticCounters.increment('databaseReconnects');
export function stopServerMonitoring(): Promise<void> {
    if (stopping) return stopping;
    db.off('disconnected', onDisconnected);
    db.off('reconnected', onReconnected);
    stopping = collector?.stop() ?? Promise.resolve();
    return stopping;
}
