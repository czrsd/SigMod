import fs from 'fs';

export const readFile = (path: string) =>
    fs.readFileSync(path, { encoding: 'utf8' }).trim();

export const noXSS = (text: string | any) => {
    const xssChars = /&|<|>|"|'/g;
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

export function parseTxt(val: string): string {
    const match = /^(?:\{([^}]*)\})?([^]*)/.exec(val);
    return match ? match[2].trim() : '';
}

function getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateProductKey() {
    let tokens: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        chars: number = 4,
        segments: number = 4,
        keyString: string = '';

    for (let i = 0; i < segments; i++) {
        let segment = '';

        for (let j = 0; j < chars; j++) {
            let k = getRandomInt(0, 35);
            segment += tokens[k];
        }

        keyString += segment;

        if (i < segments - 1) {
            keyString += '-';
        }
    }

    return keyString;
}

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
        const normalizedText = withoutEmoji
            .normalize('NFKD')
            .replace(/[^\w\s]/g, '');
        return normalizedText;
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

    const remainingTime = targetDate.getTime() - now.getTime() - 3600000;

    return remainingTime;
}
