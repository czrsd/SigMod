import { contentUrl } from '@/lib/content-url';
import type { Promotion, Draft } from './types';

export function dateInput(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}
export function dateValue(value: string): string | null {
    return value ? new Date(value).toISOString() : null;
}
export const safeHref = contentUrl;
export function localDate(value: string | null): string {
    return value ? new Date(value).toLocaleString() : 'None';
}

export function destination(value: string): string {
    try {
        return new URL(value).host;
    } catch {
        return 'Invalid URL';
    }
}
export function schedule(item: Promotion): string {
    return `${item.startsAt ? new Date(item.startsAt).toLocaleDateString() : 'Now'} – ${item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'No expiry'}`;
}

export function validDate(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function toDraft(item: Promotion): Draft {
    return {
        title: item.title,
        description: item.description,
        titleColor: item.titleColor || '#ffffff',
        descriptionColor: item.descriptionColor || '#a0a0a0',
        imageUrl: item.imageUrl,
        link: item.link,
        buttonText: item.buttonText,
        html: item.html ?? '',
        css: '',
        placement: item.placement,
        enabled: item.enabled,
        startsAt: item.startsAt,
        expiresAt: item.expiresAt,
    };
}
