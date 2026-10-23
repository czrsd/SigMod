import type { HistoryRange, HistoryResponse } from './types';

export function utcDateInput(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

export function isValidUtcDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function historyQueryKey(range: HistoryRange, date: string) {
    return ['stats', 'history', range, range === 'day' ? date : null] as const;
}

export function historyPath(range: HistoryRange, date: string): string {
    return `/stats/history?range=${range}${range === 'day' ? `&date=${encodeURIComponent(date)}` : ''}`;
}

export function historyQueryOptions(range: HistoryRange, date: string) {
    return {
        queryKey: historyQueryKey(range, date),
        enabled: range !== 'day' || isValidUtcDate(date),
        staleTime: 15_000,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
    } as const;
}

export type StatsHistoryResponse = HistoryResponse;
