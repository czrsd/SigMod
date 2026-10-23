import { emptyCounters, Counter } from './types';

export class DiagnosticCounters {
    private values = emptyCounters();
    private durationSum = 0;
    private durationMax = 0;
    private connectionCount = 0;
    private peakCount = 0;

    increment(key: Counter, amount = 1): void {
        if (Number.isFinite(amount) && amount >= 0) this.values[key] += amount;
    }
    request(durationMs: number, status: number, aborted: boolean): void {
        this.increment('httpRequests');
        if (status >= 400) this.increment('httpErrors');
        if (status >= 500) this.increment('httpServerErrors');
        if (aborted) this.increment('httpAborted');
        this.durationSum += durationMs;
        this.durationMax = Math.max(this.durationMax, durationMs);
    }
    opened(): void {
        this.increment('wsConnectionsOpened');
        this.peakCount = Math.max(this.peakCount, ++this.connectionCount);
    }
    closed(): void {
        this.increment('wsConnectionsClosed');
        this.connectionCount = Math.max(0, this.connectionCount - 1);
    }
    drain() {
        const result = {
            counters: this.values,
            httpDurationMeanMs: this.values.httpRequests ? this.durationSum / this.values.httpRequests : null,
            httpDurationMaxMs: this.values.httpRequests ? this.durationMax : null,
            peakConnections: this.peakCount,
        };
        this.values = emptyCounters();
        this.durationSum = this.durationMax = 0;
        this.peakCount = this.connectionCount;
        return result;
    }
}
export const diagnosticCounters = new DiagnosticCounters();
export const metricsEnabled = () => process.env.SERVER_METRICS_ENABLED !== 'false';
