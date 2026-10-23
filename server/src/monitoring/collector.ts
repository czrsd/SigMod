import { randomUUID } from 'node:crypto';
import { MetricSample } from './types';

export interface SampleSource {
    sample(bootId: string, sequence: number): Promise<MetricSample>;
    stop(): void;
}
export interface SampleStore {
    save(sample: MetricSample): Promise<void>;
    ensureIndexes(): Promise<void>;
    recoverPending?(): Promise<void>;
}

export class MetricsCollector {
    private readonly bootId = randomUUID();
    private sequence = 0;
    private queue: MetricSample[] = [];
    private running: Promise<void> | null = null;
    private timer: NodeJS.Timeout | undefined;
    private indexesReady = false;
    private stopping = false;
    lastPersistedAt: Date | null = null;
    droppedSamples = 0;
    writeFailures = 0;
    constructor(
        private source: SampleSource,
        private store: SampleStore,
        private onFailure: () => void
    ) {}

    start(): void {
        this.timer = setInterval(() => {
            void this.tick();
        }, 60_000);
        this.timer.unref();
    }
    async tick(): Promise<void> {
        if (this.running || this.stopping) return;
        this.running = this.collectAndFlush();
        try {
            await this.running;
        } finally {
            this.running = null;
        }
    }
    private async collectAndFlush(): Promise<void> {
        try {
            this.queue.push(await this.source.sample(this.bootId, ++this.sequence));
            if (this.queue.length > 360) {
                this.queue.shift();
                this.droppedSamples++;
            }
            await this.flush();
        } catch {
            this.writeFailures++;
            this.onFailure();
        }
    }
    private async flush(limit = 30, deadline = Infinity): Promise<void> {
        if (!this.indexesReady) {
            await this.store.ensureIndexes();
            this.indexesReady = true;
        }
        await this.store.recoverPending?.();
        // Limit catch-up work per tick, while allowing six hours of memory-only buffering during DB outages.
        for (let count = 0; this.queue.length && count < limit && Date.now() < deadline; count++) {
            const sample = this.queue[0];
            await this.store.save(sample);
            this.lastPersistedAt = sample.at;
            this.queue.shift();
        }
    }
    get pendingSamples() {
        return this.queue.length;
    }
    async stop(): Promise<void> {
        if (this.stopping) return;
        clearInterval(this.timer);
        if (this.running) await this.running;
        await this.tick();
        this.stopping = true;
        this.source.stop();
        if (this.queue.length) {
            try {
                await this.flush(360, Date.now() + 10_000);
            } catch {
                this.onFailure();
            }
            if (this.queue.length) this.onFailure();
        }
    }
}
