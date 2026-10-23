import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { expectedBucketSeconds, formatUtcAxisTime, HistoryChart, splitLineSegments, timestampXPositions } from './history-chart';
import type { HistoryPoint } from './types';

const points = (times: string[]) => times.map((at) => ({ at }) as HistoryPoint);

describe('historical chart timeline', () => {
    it('places points by elapsed time rather than by array index', () => {
        const xs = timestampXPositions(
            points(['2026-10-22T00:00:00.000Z', '2026-10-22T00:01:00.000Z', '2026-10-22T00:03:00.000Z']),
            720,
            58,
            12
        );
        expect(xs[1] - xs[0]).toBeCloseTo((xs[2] - xs[0]) / 3);
    });

    it('breaks a line across null metrics and missing buckets', () => {
        const samples = points([
            '2026-10-22T00:00:00.000Z',
            '2026-10-22T00:01:00.000Z',
            '2026-10-22T00:02:00.000Z',
            '2026-10-22T00:06:00.000Z',
            '2026-10-22T00:07:00.000Z',
        ]);
        expect(splitLineSegments(samples, [2, null, 5, 6, 9], 60)).toEqual([[0], [2], [3, 4]]);
    });

    it('uses resolution fallbacks and an explicit bucket interval when provided', () => {
        expect(expectedBucketSeconds('minute')).toBe(60);
        expect(expectedBucketSeconds('hour')).toBe(3600);
        expect(expectedBucketSeconds('day', 1800)).toBe(1800);
    });

    it('labels chart endpoints in UTC and renders an isolated sample as a visible circle', () => {
        const at = '2026-10-22T00:00:00.000Z';
        expect(formatUtcAxisTime(at, 'minute')).toContain('UTC');
        const point = { at } as HistoryPoint;
        const html = renderToStaticMarkup(<HistoryChart title="CPU" unit="%" points={[point]} value={() => 0} resolution="minute" />);
        expect(html).toContain('<circle');
    });
});
