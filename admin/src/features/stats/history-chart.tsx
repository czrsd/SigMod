import { formatNumber } from '@/lib/format';
import { useState } from 'react';
import type { HistoryPoint, HistoryResolution } from './types';

export function expectedBucketSeconds(resolution: HistoryResolution, bucketSeconds?: number): number {
    if (typeof bucketSeconds === 'number' && Number.isFinite(bucketSeconds) && bucketSeconds > 0) return bucketSeconds;
    return resolution === 'minute' ? 60 : resolution === 'hour' ? 3600 : 86400;
}

export function timestampXPositions(points: Pick<HistoryPoint, 'at'>[], width: number, left: number, right: number): number[] {
    const times = points.map((point) => Date.parse(point.at));
    const validTimes = times.filter(Number.isFinite);
    const minTime = Math.min(...validTimes),
        maxTime = Math.max(...validTimes);
    return points.map(
        (_, index) =>
            left +
            (maxTime > minTime && Number.isFinite(times[index])
                ? ((times[index] - minTime) * (width - left - right)) / (maxTime - minTime)
                : points.length <= 1
                  ? 0
                  : (index * (width - left - right)) / (points.length - 1))
    );
}

export function splitLineSegments(points: Pick<HistoryPoint, 'at'>[], values: Array<number | null>, expectedSeconds: number): number[][] {
    const segments: number[][] = [];
    let current: number[] = [];
    values.forEach((value, index) => {
        const time = Date.parse(points[index]?.at ?? '');
        const prevTime = index > 0 ? Date.parse(points[index - 1]?.at ?? '') : Number.NaN;
        const timeGap = Number.isFinite(time) && Number.isFinite(prevTime) && time - prevTime > expectedSeconds * 1500;
        if (value === null || !Number.isFinite(value) || timeGap) {
            if (current.length) segments.push(current);
            current = [];
        }
        if (value !== null && Number.isFinite(value)) current.push(index);
    });
    if (current.length) segments.push(current);
    return segments;
}

export function formatUtcAxisTime(value: string, resolution: HistoryResolution): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    const options: Intl.DateTimeFormatOptions =
        resolution === 'day'
            ? { timeZone: 'UTC', day: '2-digit', month: 'short', year: '2-digit' }
            : { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    return `${new Intl.DateTimeFormat('en-GB', options).format(date)} UTC`;
}

export function HistoryChart({
    title,
    unit,
    points,
    value,
    format = formatNumber,
    resolution,
    bucketSeconds,
}: {
    title: string;
    unit: string;
    points: HistoryPoint[];
    value: (point: HistoryPoint) => number | null;
    format?: (n: number) => string;
    resolution: HistoryResolution;
    bucketSeconds?: number;
}) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const values = points.map(value);
    const present = values.filter((n): n is number => n !== null && Number.isFinite(n));
    if (!present.length)
        return (
            <section className="stats-chart">
                <h3>{title}</h3>
                <p className="muted">No samples available for this metric in this range.</p>
            </section>
        );
    const width = 720,
        height = 190,
        left = 58,
        right = 12,
        top = 12,
        bottom = 34;
    const low = Math.min(0, ...present),
        high = Math.max(...present),
        span = high - low || 1;
    const xPositions = timestampXPositions(points, width, left, right);
    const x = (i: number) => xPositions[i];
    const y = (n: number) => top + ((high - n) * (height - top - bottom)) / span;
    const activeValue = activeIndex === null ? null : values[activeIndex];
    const tooltipText =
        activeIndex !== null && activeValue !== null && activeValue !== undefined
            ? `${format(activeValue)} ${unit} · ${formatUtcAxisTime(points[activeIndex].at, resolution)}`
            : null;
    const tooltipWidth = tooltipText ? Math.min(width - left - right, Math.max(110, tooltipText.length * 6.2 + 16)) : 0;
    const tooltipX = activeIndex === null ? 0 : Math.max(left, Math.min(x(activeIndex) - tooltipWidth / 2, width - right - tooltipWidth));
    const tooltipY = activeIndex === null ? 0 : Math.max(top, y(activeValue!) - 34);
    const segments = splitLineSegments(points, values, expectedBucketSeconds(resolution, bucketSeconds));
    const firstAt = points[0]?.at,
        lastAt = points.at(-1)?.at;
    return (
        <section className="stats-chart" aria-label={`${title} chart`}>
            <h3>{title}</h3>
            <div className="stats-chart-scale">
                <span>
                    {format(high)} {unit}
                </span>
                <span>
                    {format(low)} {unit}
                </span>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}, from ${format(low)} to ${format(high)} ${unit}`}>
                {[0, 0.5, 1].map((fraction) => {
                    const gy = top + fraction * (height - top - bottom);
                    return <line key={fraction} x1={left} x2={width - right} y1={gy} y2={gy} className="stats-gridline" />;
                })}
                {segments.map((segment, i) =>
                    segment.length === 1 ? (
                        <circle key={i} cx={x(segment[0])} cy={y(values[segment[0]]!)} r="3.5" className="stats-point" />
                    ) : (
                        <polyline
                            key={i}
                            points={segment.map((index) => `${x(index)},${y(values[index]!)}`).join(' ')}
                            className="stats-line"
                        />
                    )
                )}
                {values.map((sample, index) =>
                    sample === null || !Number.isFinite(sample) ? null : (
                        <circle
                            key={`interaction-${index}`}
                            cx={x(index)}
                            cy={y(sample)}
                            r="9"
                            className="stats-point-hit-area"
                            tabIndex={0}
                            role="button"
                            aria-label={`${format(sample)} ${unit} at ${formatUtcAxisTime(points[index].at, resolution)}`}
                            onPointerEnter={() => setActiveIndex(index)}
                            onPointerLeave={() => setActiveIndex(null)}
                            onFocus={() => setActiveIndex(index)}
                            onBlur={() => setActiveIndex(null)}
                        />
                    )
                )}
                {activeIndex !== null && activeValue !== null && activeValue !== undefined && tooltipText && (
                    <g className="stats-chart-tooltip" pointerEvents="none" aria-hidden="true">
                        <line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={height - bottom} className="stats-chart-crosshair" />
                        <circle cx={x(activeIndex)} cy={y(activeValue)} r="4.5" className="stats-chart-active-point" />
                        <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height="25" rx="4" className="stats-chart-tooltip-bg" />
                        <text x={tooltipX + 8} y={tooltipY + 16}>{tooltipText}</text>
                    </g>
                )}
            </svg>
            <div className="stats-chart-dates">
                <span>{firstAt ? formatUtcAxisTime(firstAt, resolution) : '—'}</span>
                <span>{lastAt ? formatUtcAxisTime(lastAt, resolution) : '—'}</span>
            </div>
        </section>
    );
}
