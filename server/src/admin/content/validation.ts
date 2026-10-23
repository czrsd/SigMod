import fs from 'fs';
import path from 'path';
import sanitizeHtml from 'sanitize-html';

export type JsonObject = Record<string, unknown>;

export interface LocaleCatalog {
    locale: string;
    messages: Record<string, string>;
    schemaVersion?: number;
}

export interface AlertContent {
    id: string;
    revision: number;
    enabled: boolean;
    title: string;
    description: string;
    link: string;
    buttonText: string;
    expiresAt: string | null;
}

export interface UpdateNoticeContent {
    id: string;
    revision: number;
    enabled: boolean;
    latestClientVersion: string;
    downloadUrl: string;
    message: string;
}

export interface ChatFilterContent {
    id: string;
    revision: number;
    enabled: boolean;
    names: string[];
    messages: string[];
}

export interface PromotionContent {
    id: string;
    revision: number;
    title: string;
    description: string;
    titleColor: string;
    descriptionColor: string;
    imageUrl: string;
    link: string;
    buttonText: string;
    html: string;
    css: string;
    placement: 'menu-card';
    enabled: boolean;
    startsAt: string | null;
    expiresAt: string | null;
}

export class ContentError extends Error {
    constructor(
        public readonly status: number,
        message: string
    ) {
        super(message);
        this.name = 'ContentError';
    }
}

export function isRecord(value: unknown): value is JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function object(value: unknown, allowed: readonly string[], required: readonly string[] = []): JsonObject {
    if (!isRecord(value)) throw new ContentError(400, 'Expected a JSON object.');
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new ContentError(400, `Unknown fields: ${unknown.join(', ')}`);
    for (const key of required) {
        if (!Object.hasOwn(value, key)) throw new ContentError(400, `Missing field: ${key}`);
    }
    return value;
}

export function str(value: unknown, name: string, max = 1000, optional = false): string | undefined {
    if (optional && value === undefined) return undefined;
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
        throw new ContentError(400, `Invalid ${name}.`);
    }
    return value.trim();
}

export function safeUrl(value: unknown, name: string, optional = false): string | undefined {
    if (optional && (value === undefined || value === '')) return undefined;
    const text = str(value, name, 2048)!;
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        throw new ContentError(400, `Invalid ${name}.`);
    }
    const dev = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (!['https:', ...(dev ? ['http:'] : [])].includes(url.protocol) || url.username || url.password) {
        throw new ContentError(400, `${name} must be a safe HTTPS URL.`);
    }
    return url.toString();
}

export function revision(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new ContentError(400, 'expectedRevision must be a non-negative integer.');
    }
    return value;
}

const localeDir = path.resolve(process.cwd(), 'dev-server/locales');

export function locales(): Record<string, LocaleCatalog> {
    const roots = [
        localeDir,
        path.resolve(process.cwd(), '../dev-server/locales'),
        path.resolve(__dirname, '../../../../dev-server/locales'),
    ];
    const root = roots.find((candidate) => fs.existsSync(candidate));
    if (!root) throw new ContentError(500, 'Locale catalogs are unavailable.');

    const result = Object.create(null) as Record<string, LocaleCatalog>;
    for (const file of fs.readdirSync(root).filter((name) => /^[a-z]{2}\.json$/.test(name))) {
        const data: unknown = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
        if (!isRecord(data) || typeof data.locale !== 'string' || !isRecord(data.messages)) continue;
        if (data.locale !== file.slice(0, 2)) continue;
        const messages = Object.fromEntries(
            Object.entries(data.messages).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        );
        result[data.locale] = {
            locale: data.locale,
            messages,
            ...(typeof data.schemaVersion === 'number' ? { schemaVersion: data.schemaVersion } : {}),
        };
    }
    return result;
}

export function translationKeys(catalogs: Record<string, LocaleCatalog> = locales()): string[] {
    return [...new Set(Object.values(catalogs).flatMap((catalog) => Object.keys(catalog.messages)))];
}

export function validateTranslations(locale: string, value: unknown): Record<string, string> {
    const catalogs = locales();
    if (!Object.hasOwn(catalogs, locale)) throw new ContentError(404, 'Unsupported locale.');
    const translations = object(value, translationKeys(catalogs));
    for (const [key, text] of Object.entries(translations)) {
        if (typeof text !== 'string' || text.length > 4000 || /<\/?[a-z][^>]*>/i.test(text)) {
            throw new ContentError(400, `Invalid text for translation key: ${key}`);
        }
        const placeholders = (source: string) =>
            [...source.matchAll(/\{[^{}]+\}/g)]
                .map((match) => match[0])
                .sort()
                .join('|');
        if (placeholders(key) !== placeholders(text)) {
            throw new ContentError(400, `Placeholder mismatch for translation key: ${key}`);
        }
    }
    return Object.fromEntries(Object.entries(translations).map(([key, text]) => [key, text as string]));
}

export function sanitizeRichText(value: unknown, name = 'body'): string {
    if (typeof value !== 'string' || value.length > 12000) throw new ContentError(400, `Invalid ${name}.`);
    return sanitizeHtml(value, {
        allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'a'],
        allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
        allowedSchemes: process.env.NODE_ENV === 'production' ? ['https'] : ['https', 'http'],
        allowProtocolRelative: false,
        transformTags: {
            a: (_tagName: string, attributes: Record<string, string>) => ({
                tagName: 'a',
                attribs: { ...attributes, rel: 'noopener noreferrer', target: '_blank' },
            }),
        },
    });
}

export function sanitizeImageUrls(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 12).flatMap((item: unknown) => {
        try {
            return [safeUrl(item, 'image URL')!];
        } catch {
            return [];
        }
    });
}
