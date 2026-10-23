import { RequestHandler, Response } from 'express';
import WebSocket from 'ws';
import { diagnosticCounters, metricsEnabled } from './counters';

export function payloadBytes(value: unknown, encoding?: unknown): number {
    if (typeof value === 'string') {
        return Buffer.byteLength(value, typeof encoding === 'string' && Buffer.isEncoding(encoding) ? encoding : 'utf8');
    }
    if (Buffer.isBuffer(value)) return value.byteLength;
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value.byteLength;
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + payloadBytes(item), 0);
    return 0;
}

export const recordHttpMetrics: RequestHandler = (req, res, next) => {
    if (!metricsEnabled()) return next();
    const started = performance.now();
    // Do not put streaming requests into flowing mode before their async auth and body parser run.
    // In particular, Multer must receive the complete multipart stream after admin session checks.
    if (!req.is('multipart/form-data')) {
        req.on('data', (chunk: unknown) => diagnosticCounters.increment('httpBytesIn', payloadBytes(chunk)));
    }
    const write = res.write;
    const end = res.end;
    res.write = function (this: Response, chunk: unknown, ...args: unknown[]) {
        diagnosticCounters.increment('httpBytesOut', payloadBytes(chunk, args[0]));
        return Reflect.apply(write, this, [chunk, ...args]);
    } as typeof res.write;
    res.end = function (this: Response, chunk?: unknown, ...args: unknown[]) {
        diagnosticCounters.increment('httpBytesOut', payloadBytes(chunk, args[0]));
        return Reflect.apply(end, this, [chunk, ...args]);
    } as typeof res.end;
    let recorded = false;
    const finish = () => {
        if (recorded) return;
        recorded = true;
        diagnosticCounters.request(performance.now() - started, res.statusCode, !res.writableFinished);
    };
    res.once('finish', finish);
    res.once('close', finish);
    next();
};

export function recordWebSocketMetrics(ws: WebSocket): void {
    if (!metricsEnabled()) return;
    diagnosticCounters.opened();
    ws.on('message', (data) => {
        diagnosticCounters.increment('wsMessagesIn');
        diagnosticCounters.increment('wsBytesIn', payloadBytes(data));
    });
    ws.once('close', () => diagnosticCounters.closed());
    ws.on('error', () => diagnosticCounters.increment('wsErrors'));
    const send = ws.send;
    ws.send = function (this: WebSocket, data: unknown, ...args: unknown[]) {
        const result = Reflect.apply(send, this, [data, ...args]);
        if (this.readyState === WebSocket.OPEN) {
            diagnosticCounters.increment('wsMessagesOut');
            diagnosticCounters.increment('wsBytesOut', payloadBytes(data));
        }
        return result;
    } as typeof ws.send;
}
