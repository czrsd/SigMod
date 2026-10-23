import { describe, expect, it } from 'vitest';
import { historyPath, historyQueryKey, historyQueryOptions, isValidUtcDate, utcDateInput } from './history-api';

describe('stats history request helpers', () => {
    it('includes the selected day in both request path and cache key', () => {
        expect(historyPath('day', '2026-10-22')).toBe('/stats/history?range=day&date=2026-10-22');
        expect(historyQueryKey('day', '2026-10-22')).toEqual(['stats', 'history', 'day', '2026-10-22']);
    });

    it('keeps non-day ranges independent of the date input', () => {
        expect(historyPath('7d', '2026-10-22')).toBe('/stats/history?range=7d');
        expect(historyQueryKey('7d', '2026-10-22')).toEqual(historyQueryKey('7d', '2000-01-01'));
    });

    it('disables an invalid UTC calendar day and derives input values in UTC', () => {
        expect(isValidUtcDate('2026-02-29')).toBe(false);
        expect(isValidUtcDate('2024-02-29')).toBe(true);
        expect(historyQueryOptions('day', '2026-02-29').enabled).toBe(false);
        expect(utcDateInput(new Date('2026-10-22T00:30:00+02:00'))).toBe('2026-10-21');
    });
});
