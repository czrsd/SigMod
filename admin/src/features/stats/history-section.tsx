import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatBytes, formatNumber } from '@/lib/format';
import { QueryState } from '@/components/page';
import { Button } from '@/components/ui/button';
import { CustomDatePicker } from '@/components/custom-date-picker';
import { HistoryChart } from './history-chart';
import { historyPath, historyQueryOptions, isValidUtcDate, utcDateInput } from './history-api';
import type { HistoryRange, HistoryResponse } from './types';

function duration(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds)),
        days = Math.floor(safe / 86400),
        hours = Math.floor((safe % 86400) / 3600),
        minutes = Math.floor((safe % 3600) / 60);
    return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${safe % 60}s`;
}
function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="data-row">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}
function pointTime(value: string, resolution: HistoryResponse['resolution']): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat(
        undefined,
        resolution === 'day'
            ? { timeZone: 'UTC', dateStyle: 'medium' }
            : { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    ).format(date);
}

const ranges: { value: HistoryRange; label: string }[] = [
    { value: 'today', label: 'Today (UTC)' },
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: 'all', label: 'All time' },
    { value: 'day', label: 'Specific day (UTC)' },
];

export function HistorySection() {
    const [range, setRange] = useState<HistoryRange>('today');
    const [date, setDate] = useState(utcDateInput);
    const [showAllRows, setShowAllRows] = useState(false);
    const options = historyQueryOptions(range, date);
    const query = useQuery({
        ...options,
        queryFn: ({ signal }) => api.get<HistoryResponse>(historyPath(range, date), signal),
    });
    const history = query.data;
    return (
        <section className="section" aria-labelledby="history-heading">
            <div className="stats-history-heading">
                <div>
                    <h2 id="history-heading" className="section-title">
                        Historical diagnostics
                    </h2>
                </div>
                <div className="stats-range-controls">
                    <label htmlFor="stats-range">Range</label>
                    <select id="stats-range" value={range} onChange={(event) => setRange(event.target.value as HistoryRange)}>
                        {ranges.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    {range === 'day' && (
                        <CustomDatePicker
                            label="UTC day"
                            value={date}
                            max={utcDateInput()}
                            clearable={false}
                            onChange={(nextDate) => nextDate && setDate(nextDate)}
                        />
                    )}
                    <Button
                        variant="outline"
                        onClick={() => void query.refetch()}
                        disabled={query.isFetching || (!isValidUtcDate(date) && range === 'day')}
                    >
                        Refresh history
                    </Button>
                </div>
            </div>
            <div className="stats-history-query">
                <QueryState isPending={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
                    {history && (
                        <>
                            <div className="metrics-grid stats-totals">
                                <Metric
                                    label="Samples / covered time"
                                    value={`${formatNumber(history.totals.samples)} / ${duration(history.totals.coverageSeconds)}`}
                                />
                                <Metric
                                    label="HTTP requests / errors / 5xx"
                                    value={`${formatNumber(history.totals.httpRequests)} / ${formatNumber(history.totals.httpErrors)} / ${formatNumber(history.totals.httpServerErrors)}`}
                                />
                                <Metric
                                    label="HTTP app bytes in / out"
                                    value={`${formatBytes(history.totals.httpBytesIn)} / ${formatBytes(history.totals.httpBytesOut)}`}
                                />
                                <Metric
                                    label="WebSocket messages in / out"
                                    value={`${formatNumber(history.totals.wsMessagesIn)} / ${formatNumber(history.totals.wsMessagesOut)}`}
                                />
                                <Metric
                                    label="WebSocket bytes in / out"
                                    value={`${formatBytes(history.totals.wsBytesIn)} / ${formatBytes(history.totals.wsBytesOut)}`}
                                />
                                <Metric
                                    label="WebSocket opened / closed"
                                    value={`${formatNumber(history.totals.wsConnectionsOpened)} / ${formatNumber(history.totals.wsConnectionsClosed)}`}
                                />
                                <Metric
                                    label="Host network RX / TX"
                                    value={
                                        history.monitoring.networkScope === 'unavailable'
                                            ? 'Unavailable'
                                            : `${formatBytes(history.totals.networkRxBytes)} / ${formatBytes(history.totals.networkTxBytes)}`
                                    }
                                />
                            </div>
                            {history.monitoring.pendingSamples !== undefined ||
                            history.monitoring.droppedSamples !== undefined ||
                            history.monitoring.writeFailures !== undefined ? (
                                <p
                                    className={`stats-collector-status${(history.monitoring.droppedSamples ?? 0) > 0 || (history.monitoring.writeFailures ?? 0) > 0 ? ' is-warning' : ''}`}
                                    role="status"
                                >
                                    Collector queue: {formatNumber(history.monitoring.pendingSamples)} pending ·{' '}
                                    {formatNumber(history.monitoring.droppedSamples)} dropped ·{' '}
                                    {formatNumber(history.monitoring.writeFailures)} write failures.
                                </p>
                            ) : null}
                            {[
                                history.totals.processStarts,
                                history.totals.databaseDisconnects,
                                history.totals.databaseReconnects,
                                history.totals.wsErrors,
                                history.totals.httpAborted,
                            ].some((n) => n !== undefined) ? (
                                <div className="metrics-grid stats-totals">
                                    <Metric label="Process starts" value={formatNumber(history.totals.processStarts)} />
                                    <Metric
                                        label="Database disconnects / reconnects"
                                        value={`${formatNumber(history.totals.databaseDisconnects)} / ${formatNumber(history.totals.databaseReconnects)}`}
                                    />
                                    <Metric label="WebSocket errors" value={formatNumber(history.totals.wsErrors)} />
                                    <Metric label="Aborted HTTP requests" value={formatNumber(history.totals.httpAborted)} />
                                </div>
                            ) : null}
                            <div className="stats-chart-grid">
                                <HistoryChart
                                    title="Process CPU (single-core scale; 100% = one core)"
                                    unit="%"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.processCpuPercent}
                                    format={(n) => n.toFixed(1)}
                                />
                                <HistoryChart
                                    title="Host CPU (all cores)"
                                    unit="%"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.hostCpuPercent}
                                    format={(n) => n.toFixed(1)}
                                />
                                <HistoryChart
                                    title="Memory RSS"
                                    unit=""
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.rssBytes}
                                    format={formatBytes}
                                />
                                <HistoryChart
                                    title="Heap used"
                                    unit=""
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.heapUsedBytes}
                                    format={formatBytes}
                                />
                                <HistoryChart
                                    title="Host memory used"
                                    unit=""
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.hostMemoryUsedBytes}
                                    format={formatBytes}
                                />
                                <HistoryChart
                                    title="Disk available"
                                    unit=""
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.diskAvailableBytes}
                                    format={formatBytes}
                                />
                                <HistoryChart
                                    title="Host load (1 min)"
                                    unit="load"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.load1}
                                    format={(n) => n.toFixed(2)}
                                />
                                <HistoryChart
                                    title="Mean sampled event-loop p95 delay"
                                    unit="ms"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.eventLoopP95Ms}
                                    format={(n) => n.toFixed(1)}
                                />
                                <HistoryChart
                                    title="WebSocket connections"
                                    unit="sockets"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.connections}
                                />
                                <HistoryChart
                                    title="Database readiness"
                                    unit="%"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.databaseReadyPercent}
                                    format={(n) => n.toFixed(1)}
                                />
                                <HistoryChart
                                    title="Database ping"
                                    unit="ms"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.databasePingMs}
                                    format={(n) => n.toFixed(1)}
                                />
                                <HistoryChart
                                    title="HTTP requests"
                                    unit="requests"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.httpRequests}
                                />
                                <HistoryChart
                                    title="HTTP errors"
                                    unit="errors"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.httpErrors}
                                />
                                <HistoryChart
                                    title="HTTP mean latency"
                                    unit="ms"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.httpDurationMeanMs}
                                    format={(n) => n.toFixed(1)}
                                />
                                <HistoryChart
                                    title="HTTP max latency"
                                    unit="ms"
                                    points={history.points}
                                    resolution={history.resolution}
                                    bucketSeconds={history.bucketSeconds}
                                    value={(p) => p.httpDurationMaxMs}
                                    format={(n) => n.toFixed(1)}
                                />
                            </div>
                            <details className="stats-traffic-details">
                                <summary>WebSocket and host traffic charts</summary>
                                <div className="stats-chart-grid">
                                    <HistoryChart
                                        title="Host network RX"
                                        unit=""
                                        points={history.points}
                                        resolution={history.resolution}
                                        bucketSeconds={history.bucketSeconds}
                                        value={(p) => p.networkRxBytes}
                                        format={formatBytes}
                                    />
                                    <HistoryChart
                                        title="Host network TX"
                                        unit=""
                                        points={history.points}
                                        resolution={history.resolution}
                                        bucketSeconds={history.bucketSeconds}
                                        value={(p) => p.networkTxBytes}
                                        format={formatBytes}
                                    />
                                    <HistoryChart
                                        title="WebSocket bytes in"
                                        unit=""
                                        points={history.points}
                                        resolution={history.resolution}
                                        bucketSeconds={history.bucketSeconds}
                                        value={(p) => p.wsBytesIn}
                                        format={formatBytes}
                                    />
                                    <HistoryChart
                                        title="WebSocket bytes out"
                                        unit=""
                                        points={history.points}
                                        resolution={history.resolution}
                                        bucketSeconds={history.bucketSeconds}
                                        value={(p) => p.wsBytesOut}
                                        format={formatBytes}
                                    />
                                    <HistoryChart
                                        title="WebSocket messages in"
                                        unit="messages"
                                        points={history.points}
                                        resolution={history.resolution}
                                        bucketSeconds={history.bucketSeconds}
                                        value={(p) => p.wsMessagesIn}
                                    />
                                    <HistoryChart
                                        title="WebSocket messages out"
                                        unit="messages"
                                        points={history.points}
                                        resolution={history.resolution}
                                        bucketSeconds={history.bucketSeconds}
                                        value={(p) => p.wsMessagesOut}
                                    />
                                </div>
                            </details>
                            <h3 className="stats-table-heading">Buckets and sample coverage</h3>
                            {history.points.length ? (
                                <>
                                    {history.points.length > 100 && (
                                        <Button variant="outline" onClick={() => setShowAllRows((show) => !show)}>
                                            {showAllRows ? 'Show latest 100' : `Show all ${formatNumber(history.points.length)} buckets`}
                                        </Button>
                                    )}
                                    <p className="muted stats-history-meta">
                                        Showing {formatNumber(Math.min(history.points.length, showAllRows ? history.points.length : 100))}{' '}
                                        of {formatNumber(history.points.length)} buckets.
                                    </p>
                                    <div className="table-wrap">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th scope="col">Time (UTC)</th>
                                                    <th scope="col">Samples</th>
                                                    <th scope="col">Coverage</th>
                                                    <th scope="col">Connections</th>
                                                    <th scope="col">Peak</th>
                                                    <th scope="col">V5</th>
                                                    <th scope="col">CPU</th>
                                                    <th scope="col">RSS</th>
                                                    <th scope="col">HTTP req / err</th>
                                                    <th scope="col">HTTP 5xx</th>
                                                    <th scope="col">DB ping</th>
                                                    <th scope="col">Host RX / TX</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(showAllRows ? history.points : history.points.slice(-100)).map((point) => (
                                                    <tr key={point.at}>
                                                        <td>{pointTime(point.at, history.resolution)}</td>
                                                        <td>{formatNumber(point.samples)}</td>
                                                        <td>{duration(point.coverageSeconds)}</td>
                                                        <td>{formatNumber(point.connections)}</td>
                                                        <td>{formatNumber(point.peakConnections)}</td>
                                                        <td>{formatNumber(point.v5Connections)}</td>
                                                        <td>
                                                            {point.processCpuPercent === null
                                                                ? '—'
                                                                : `${point.processCpuPercent.toFixed(1)}%`}
                                                        </td>
                                                        <td>{formatBytes(point.rssBytes)}</td>
                                                        <td>
                                                            {formatNumber(point.httpRequests)} / {formatNumber(point.httpErrors)}
                                                        </td>
                                                        <td>{formatNumber(point.httpServerErrors)}</td>
                                                        <td>
                                                            {point.databasePingMs === null ? '—' : `${point.databasePingMs.toFixed(1)} ms`}
                                                        </td>
                                                        <td>
                                                            {history.monitoring.networkScope === 'unavailable'
                                                                ? 'Unavailable'
                                                                : `${formatBytes(point.networkRxBytes)} / ${formatBytes(point.networkTxBytes)}`}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <p className="muted">No historical samples are available for this range yet.</p>
                            )}
                        </>
                    )}
                </QueryState>
            </div>
        </section>
    );
}
