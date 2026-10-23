import { formatBytes, formatDate, formatNumber } from '@/lib/format';
import { QueryState } from '@/components/page';
import type { UseQueryResult } from '@tanstack/react-query';
import type { StatsResponse } from './types';

function duration(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const days = Math.floor(safe / 86400),
        hours = Math.floor((safe % 86400) / 3600),
        minutes = Math.floor((safe % 3600) / 60),
        remaining = safe % 60;
    return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${remaining}s`;
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="data-row">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

export function CurrentSnapshot({ query }: { query: UseQueryResult<StatsResponse> }) {
    const data = query.data;
    const cpu = data?.process.cpuDeltaMicros;
    const serverRows = Object.entries(data?.websocket.v5ConnectionsByServer ?? {}).sort(([a], [b]) => a.localeCompare(b));
    return (
        <>
            <div className="muted" aria-live="polite">
                {query.dataUpdatedAt ? `Last successful update: ${formatDate(query.dataUpdatedAt)}` : 'No successful update yet.'}
            </div>
            <QueryState isPending={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
                {data && (
                    <>
                        <section className="section" aria-labelledby="health-heading">
                            <h2 id="health-heading" className="section-title">
                                Health and capacity
                            </h2>
                            <div className="metrics-grid">
                                <Metric label="Database" value={data.database.ready ? 'Ready' : 'Unavailable'} />
                                <Metric
                                    label="Database ping"
                                    value={data.database.pingMs === null ? 'Unavailable' : `${formatNumber(data.database.pingMs)} ms`}
                                />
                                <Metric label="Process uptime" value={duration(data.process.uptimeSeconds)} />
                                <Metric label="RSS memory" value={formatBytes(data.process.rssBytes)} />
                                <Metric label="Heap used" value={formatBytes(data.process.heapUsedBytes)} />
                                <Metric label="WebSocket connections" value={formatNumber(data.websocket.connections)} />
                            </div>
                        </section>
                        <section className="section" aria-labelledby="counts-heading">
                            <h2 id="counts-heading" className="section-title">
                                Collection counts
                            </h2>
                            <div className="metrics-grid">
                                <Metric label="Sigmally users" value={formatNumber(data.counts.sigmallyUsers)} />
                                <Metric label="SigMod users" value={formatNumber(data.counts.sigmodUsers)} />
                                <Metric label="Settings installations" value={formatNumber(data.counts.settingsInstallations)} />
                            </div>
                        </section>
                        <section className="section" aria-labelledby="servers-heading">
                            <h2 id="servers-heading" className="section-title">
                                V5 connections by game server
                            </h2>
                            {serverRows.length ? (
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th scope="col">Game server</th>
                                                <th scope="col">Connections</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {serverRows.map(([server, count]) => (
                                                <tr key={server}>
                                                    <td>{server}</td>
                                                    <td>{formatNumber(count)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="muted">No V5 connections are currently grouped by server.</p>
                            )}
                        </section>
                        <section className="section" aria-labelledby="runtime-heading">
                            <h2 id="runtime-heading" className="section-title">
                                Runtime diagnostics
                            </h2>
                            <div className="metrics-grid">
                                <Metric
                                    label="CPU time in sample"
                                    value={
                                        cpu ? `user ${formatNumber(cpu.user)} µs · system ${formatNumber(cpu.system)} µs` : 'Unavailable'
                                    }
                                />
                                <Metric label="Event-loop delay (mean)" value={`${formatNumber(data.eventLoop.delayMeanMs)} ms`} />
                                <Metric label="Event-loop delay (max)" value={`${formatNumber(data.eventLoop.delayMaxMs)} ms`} />
                                <Metric
                                    label="Host load average (1 / 5 / 15 min)"
                                    value={data.host.loadAverage.map((value) => formatNumber(value)).join(' / ')}
                                />
                            </div>
                        </section>
                    </>
                )}
            </QueryState>
        </>
    );
}
