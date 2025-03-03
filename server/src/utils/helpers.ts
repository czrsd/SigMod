import fs from 'fs';

export const readFile = (path: string) =>
    fs.readFileSync(path, { encoding: 'utf8' }).trim();

export const noXSS = (text: string | any) => {
    const xssChars = /[&<>"']/g;
    return text.replace(xssChars, (match: string) => {
        switch (match) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&#039;';
            default:
                return match;
        }
    });
};

export function formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

export function sanitizeNick(input: string): string {
    try {
        const withoutEmoji = input.replace(/[\u{1F600}-\u{1F6FF}]/gu, '');
        return withoutEmoji.normalize('NFKD').replace(/[^\w\s]/g, '');
    } catch (error) {
        return 'Unnamed';
    }
}

export function parseTimeToMilliseconds(timeString: string) {
    const [minutes, seconds] = timeString.split(/[ms]/).filter(Boolean);
    return (parseInt(minutes, 10) * 60 + parseInt(seconds, 10)) * 1000;
}

// get time from a time HTML element
export function getRemainingTime(string: string) {
    const now = new Date();

    const [targetHours, targetMinutes] = string.split(':').map(Number);

    const targetDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        targetHours,
        targetMinutes,
        0,
        0
    );

    return targetDate.getTime() - now.getTime() - 3600000;
}

export function getFutureTimestamp(timeString: string): number {
    const timeUnits: Record<string, number> = {
        s: 1,
        m: 60,
        h: 3600,
        d: 86400,
    };
    let totalSeconds = 0;

    const matches = timeString.match(/(\d+)([smhd])/g);
    if (!matches) throw new Error('Invalid time format');

    for (const match of matches) {
        const parts = match.match(/(\d+)([smhd])/);
        if (!parts) throw new Error('Invalid time segment');
        const value = parseInt(parts[1], 10);
        const unit = parts[2];
        totalSeconds += value * (timeUnits[unit] || 0);
    }

    return Date.now() + totalSeconds * 1000;
}
