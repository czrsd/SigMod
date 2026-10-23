export function formatStoredDate(value: unknown): string {
    let date: Date;
    let storedValue: string;

    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) return '—';
        date = value;
        storedValue = value.toISOString();
    } else if (typeof value === 'number') {
        if (!Number.isFinite(value) || Math.abs(value) < 100_000_000_000) return '—';
        date = new Date(value);
        storedValue = String(value);
    } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^-?\d+$/.test(trimmed)) {
            if (trimmed.replace('-', '').length < 11) return '—';
            const timestamp = Number(trimmed);
            if (!Number.isFinite(timestamp) || Math.abs(timestamp) < 100_000_000_000) return '—';
            date = new Date(timestamp);
        } else {
            const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(trimmed);
            if (!match) return '—';
            const [, year, month, day] = match;
            const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
            if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth) return '—';
            date = new Date(trimmed);
        }
        storedValue = value;
    } else {
        return '—';
    }

    if (!Number.isFinite(date.getTime())) return '—';
    const formatted = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
    return `${formatted} (${storedValue})`;
}

export function formatDate(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
        : '—';
}
export const formatNumber = (value: number | null | undefined): string =>
    typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat().format(value) : '—';
export function formatBytes(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    if (value < 1024) return `${value} B`;
    const units = ['KiB', 'MiB', 'GiB'];
    let amount = value / 1024;
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
        amount /= 1024;
        unit++;
    }
    return `${amount.toFixed(1)} ${units[unit]}`;
}
export function displayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}
