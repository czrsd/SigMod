import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, QueryState } from '@/components/page';
import './parties.css';

type PartySizeBuckets = { one: number; twoToFour: number; fiveToNine: number; tenPlus: number };
type PartyDailyUsage = {
    day: string;
    sessionsStarted: number;
    sessionsCompleted: number;
    durationSeconds: number;
    joins: number;
    leaves: number;
    reconnects: number;
    chatMessages: number;
    sizeBuckets: PartySizeBuckets;
};
type LiveParty = {
    tag: string;
    server: string;
    memberCount: number;
    members: { nick: string; score: number; isAlive: boolean; ping: number | null }[];
};
type PartiesResponse = {
    capturedAt: string;
    rangeDays: number;
    hasRecordedUsage: boolean;
    livePartyCount: number;
    liveMemberCount: number;
    parties: LiveParty[];
    daily: PartyDailyUsage[];
};

function duration(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const remaining = safe % 60;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${remaining}s`;
    return `${remaining}s`;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <article className="party-metric">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </article>
    );
}

function utcDate(value: string): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', dateStyle: 'medium' }).format(date)
        : value;
}

export function PartiesPage() {
    const [days, setDays] = useState('30');
    const query = useQuery({
        queryKey: ['parties', days],
        queryFn: ({ signal }) => api.get<PartiesResponse>(`/parties?days=${days}`, signal),
        refetchInterval: 15_000,
        refetchIntervalInBackground: false,
    });
    const data = query.data;
    const totals = (data?.daily ?? []).reduce(
        (result, day) => {
            result.sessionsStarted += day.sessionsStarted;
            result.sessionsCompleted += day.sessionsCompleted;
            result.durationSeconds += day.durationSeconds;
            result.joins += day.joins;
            result.leaves += day.leaves;
            result.reconnects += day.reconnects;
            result.chatMessages += day.chatMessages;
            result.sizeBuckets.one += day.sizeBuckets.one;
            result.sizeBuckets.twoToFour += day.sizeBuckets.twoToFour;
            result.sizeBuckets.fiveToNine += day.sizeBuckets.fiveToNine;
            result.sizeBuckets.tenPlus += day.sizeBuckets.tenPlus;
            return result;
        },
        {
            sessionsStarted: 0,
            sessionsCompleted: 0,
            durationSeconds: 0,
            joins: 0,
            leaves: 0,
            reconnects: 0,
            chatMessages: 0,
            sizeBuckets: { one: 0, twoToFour: 0, fiveToNine: 0, tenPlus: 0 },
        }
    );
    const averageDuration = totals.sessionsCompleted ? totals.durationSeconds / totals.sessionsCompleted : 0;
    const buckets = [
        ['1 member', totals.sizeBuckets.one],
        ['2–4 members', totals.sizeBuckets.twoToFour],
        ['5–9 members', totals.sizeBuckets.fiveToNine],
        ['10+ members', totals.sizeBuckets.tenPlus],
    ] as const;
    const bucketTotal = buckets.reduce((sum, [, count]) => sum + count, 0);

    return (
        <div className="page-stack">
            <PageHeader
                title="Parties"
                description="Live tag groups and aggregate party activity from the game server."
                actions={
                    <>
                        <label className="party-range-control" htmlFor="party-range">
                            Stats range
                        </label>
                        <select
                            id="party-range"
                            className="party-range-select"
                            value={days}
                            onChange={(event) => setDays(event.target.value)}
                        >
                            <option value="7">7 days</option>
                            <option value="30">30 days</option>
                            <option value="90">90 days</option>
                            <option value="180">180 days</option>
                        </select>
                        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
                            Refresh
                        </Button>
                    </>
                }
            />

            <QueryState isPending={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
                {data && (
                    <>
                        <section className="section" aria-labelledby="party-usage-heading">
                            <div className="party-section-heading">
                                <div>
                                    <h2 id="party-usage-heading" className="section-title">
                                        Party usage
                                    </h2>
                                </div>
                                <span className="party-live-indicator">
                                    <i /> Live · refreshed every 15 seconds
                                </span>
                            </div>
                            <div className="party-metrics-grid">
                                <Metric
                                    label="Party sessions started"
                                    value={formatNumber(totals.sessionsStarted)}
                                    detail={`Last ${days} days`}
                                />
                                <Metric
                                    label="Average session duration"
                                    value={duration(averageDuration)}
                                    detail={`${formatNumber(totals.sessionsCompleted)} completed sessions`}
                                />
                                <Metric
                                    label="Joins / leaves"
                                    value={`${formatNumber(totals.joins)} / ${formatNumber(totals.leaves)}`}
                                    detail="Member connections"
                                />
                                <Metric
                                    label="Reconnects"
                                    value={formatNumber(totals.reconnects)}
                                    detail="Approximate matches after disconnects"
                                />
                                <Metric
                                    label="Party chat messages"
                                    value={formatNumber(totals.chatMessages)}
                                    detail="Counts only; no message content"
                                />
                                <Metric
                                    label="Live now"
                                    value={`${formatNumber(data.livePartyCount)} parties`}
                                    detail={`${formatNumber(data.liveMemberCount)} members`}
                                />
                            </div>

                            <h3 className="section-title party-subheading">Party size at join</h3>
                            <div className="party-size-grid">
                                {buckets.map(([label, count]) => {
                                    const percent = bucketTotal ? (count / bucketTotal) * 100 : 0;
                                    return (
                                        <div className="party-size-row" key={label}>
                                            <span>{label}</span>
                                            <span className="party-size-track" aria-hidden="true">
                                                <i style={{ width: `${percent}%` }} />
                                            </span>
                                            <strong>{formatNumber(count)}</strong>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="section" aria-labelledby="party-daily-heading">
                            <div className="party-section-heading">
                                <div>
                                    <h2 id="party-daily-heading" className="section-title">
                                        Daily activity
                                    </h2>
                                    <p className="muted">
                                        Completed sessions and their full duration are recorded on the day the party ends.
                                    </p>
                                </div>
                            </div>
                            {data.hasRecordedUsage ? (
                                <div className="party-daily-table-wrap">
                                    <table className="party-daily-table">
                                        <thead>
                                            <tr>
                                                <th>Date (UTC)</th>
                                                <th>Started</th>
                                                <th>Completed</th>
                                                <th>Duration</th>
                                                <th>Joins</th>
                                                <th>Leaves</th>
                                                <th>Reconnects</th>
                                                <th>Chat messages</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...data.daily].reverse().map((day) => (
                                                <tr key={day.day}>
                                                    <th scope="row">{utcDate(day.day)}</th>
                                                    <td>{formatNumber(day.sessionsStarted)}</td>
                                                    <td>{formatNumber(day.sessionsCompleted)}</td>
                                                    <td>{duration(day.durationSeconds)}</td>
                                                    <td>{formatNumber(day.joins)}</td>
                                                    <td>{formatNumber(day.leaves)}</td>
                                                    <td>{formatNumber(day.reconnects)}</td>
                                                    <td>{formatNumber(day.chatMessages)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <EmptyState
                                    title="No party activity recorded yet"
                                    description="New aggregates will appear after party events are received."
                                />
                            )}
                        </section>

                        <section className="section" aria-labelledby="live-parties-heading">
                            <div className="party-section-heading">
                                <div>
                                    <h2 id="live-parties-heading" className="section-title">
                                        Current parties
                                    </h2>
                                </div>
                                <span className="party-live-count">{formatNumber(data.livePartyCount)} active</span>
                            </div>
                            {data.parties.length ? (
                                <div className="party-list-grid">
                                    {data.parties.map((party) => (
                                        <article className="party-card" key={`${party.server}:${party.tag}`}>
                                            <header className="party-card-heading">
                                                <span className="party-tag">{party.tag}</span>
                                                <span className="party-server">{party.server}</span>
                                                <strong className="party-member-count">
                                                    {party.memberCount} {party.memberCount === 1 ? 'member' : 'members'}
                                                </strong>
                                            </header>
                                            <div className="party-member-list">
                                                {party.members.map((member, index) => (
                                                    <div className="party-member-row" key={`${member.nick}:${index}`}>
                                                        <span className={`party-status-dot${member.isAlive ? ' is-alive' : ''}`} />
                                                        <strong>{member.nick}</strong>
                                                        <span className="party-member-score">{formatNumber(member.score)}</span>
                                                        <span className="party-member-ping">
                                                            {member.ping === null ? '—' : `${formatNumber(member.ping)} ms`}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    title="No active parties"
                                    description="Tag groups will appear here while members are connected."
                                />
                            )}
                        </section>
                    </>
                )}
            </QueryState>
        </div>
    );
}
