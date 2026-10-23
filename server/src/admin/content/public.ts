import { EventEmitter } from 'events';
import type { FilterQuery } from 'mongoose';
import { ContentRow, ContentRowDocument } from './models';
import { defaultChatFilter } from './chatFilter';
import {
    AlertContent,
    ChatFilterContent,
    LocaleCatalog,
    PromotionContent,
    UpdateNoticeContent,
    isRecord,
    locales,
    translationKeys,
} from './validation';

export const contentEvents = new EventEmitter();

interface ContentRowRecord {
    _id: string;
    revision: number;
    value: Record<string, unknown>;
    updatedAt?: Date;
}

const DEFAULT_ALERT: AlertContent = {
    id: 'alert',
    revision: 0,
    enabled: false,
    title: '',
    description: '',
    link: '',
    buttonText: '',
    expiresAt: null,
};

const DEFAULT_UPDATE_NOTICE: UpdateNoticeContent = {
    id: 'updateNotice',
    revision: 0,
    enabled: false,
    latestClientVersion: '',
    downloadUrl: '',
    message: '',
};

async function row(id: string): Promise<ContentRowRecord | null> {
    return ContentRow.findById(id).lean<ContentRowRecord | null>();
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function alertContent(record: ContentRowRecord | null): AlertContent {
    if (!record || !isRecord(record.value)) return { ...DEFAULT_ALERT };
    return {
        id: 'alert',
        revision: record.revision,
        enabled: record.value.enabled === true,
        title: stringValue(record.value.title),
        description: stringValue(record.value.description),
        link: stringValue(record.value.link),
        buttonText: stringValue(record.value.buttonText),
        expiresAt: typeof record.value.expiresAt === 'string' ? record.value.expiresAt : null,
    };
}

function updateNoticeContent(record: ContentRowRecord | null): UpdateNoticeContent {
    if (!record || !isRecord(record.value)) return { ...DEFAULT_UPDATE_NOTICE };
    return {
        id: 'updateNotice',
        revision: record.revision,
        enabled: record.value.enabled === true,
        latestClientVersion: stringValue(record.value.latestClientVersion),
        downloadUrl: stringValue(record.value.downloadUrl),
        message: stringValue(record.value.message),
    };
}

function effectiveAt(value: unknown, now: number): boolean {
    if (typeof value !== 'string' || !value) return true;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp <= now;
}

function notExpired(value: unknown, now: number): boolean {
    if (typeof value !== 'string' || !value) return true;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp > now;
}

function promotionContent(record: ContentRowRecord): PromotionContent | null {
    if (!isRecord(record.value)) return null;
    const value = record.value;
    if (
        typeof value.title !== 'string' ||
        typeof value.description !== 'string' ||
        typeof value.imageUrl !== 'string' ||
        typeof value.link !== 'string' ||
        typeof value.buttonText !== 'string' ||
        value.placement !== 'menu-card' ||
        typeof value.enabled !== 'boolean'
    ) {
        return null;
    }
    return {
        id: record._id.slice('promotion:'.length),
        revision: record.revision,
        title: value.title,
        description: value.description,
        titleColor: typeof value.titleColor === 'string' && /^#[\da-f]{6}$/i.test(value.titleColor) ? value.titleColor : '#ffffff',
        descriptionColor:
            typeof value.descriptionColor === 'string' && /^#[\da-f]{6}$/i.test(value.descriptionColor)
                ? value.descriptionColor
                : '#a0a0a0',
        imageUrl: value.imageUrl,
        link: value.link,
        buttonText: value.buttonText,
        html: typeof value.html === 'string' ? value.html : '',
        css: typeof value.css === 'string' ? value.css : '',
        placement: value.placement,
        enabled: value.enabled,
        startsAt: typeof value.startsAt === 'string' ? value.startsAt : null,
        expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
    };
}

export async function getPublicContentSnapshot(): Promise<{
    alert: AlertContent;
    updateNotice: UpdateNoticeContent;
    promotions: PromotionContent[];
}> {
    const [alertRecord, updateRecord, promotionRecords] = await Promise.all([
        row('alert'),
        row('updateNotice'),
        ContentRow.find({ _id: /^promotion:/ } as FilterQuery<ContentRowDocument>).lean<ContentRowRecord[]>(),
    ]);
    const now = Date.now();
    const alert = alertContent(alertRecord);
    if (alert.enabled && alert.expiresAt && !notExpired(alert.expiresAt, now)) alert.enabled = false;
    const promotions = promotionRecords
        .map(promotionContent)
        .filter((promotion): promotion is PromotionContent =>
            Boolean(promotion && promotion.enabled && effectiveAt(promotion.startsAt, now) && notExpired(promotion.expiresAt, now))
        )
        .sort((a, b) => {
            const left = Date.parse(a.startsAt ?? '');
            const right = Date.parse(b.startsAt ?? '');
            return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0) || b.revision - a.revision;
        });
    return { alert, updateNotice: updateNoticeContent(updateRecord), promotions };
}

export async function getPublicChatFilterSnapshot(): Promise<ChatFilterContent> {
    const record = await row('chatFilter');
    if (!record || !isRecord(record.value)) return defaultChatFilter();
    const enabled = record.value.enabled === true;
    const names = Array.isArray(record.value.names) ? record.value.names.filter((value): value is string => typeof value === 'string') : [];
    const messages = Array.isArray(record.value.messages)
        ? record.value.messages.filter((value): value is string => typeof value === 'string')
        : [];
    return {
        id: 'chatFilter',
        revision: record.revision,
        enabled,
        names: enabled ? names : [],
        messages: enabled ? messages : [],
    };
}

function isLocaleCatalog(value: LocaleCatalog | undefined): value is LocaleCatalog {
    return value !== undefined;
}

export async function getPublicLocalePack(locale: string): Promise<{
    locale: string;
    messages: Record<string, string>;
    revision: number;
    missingKeys: string[];
} | null> {
    const catalogs = locales();
    if (!Object.hasOwn(catalogs, locale)) return null;
    const catalog = catalogs[locale];
    if (!isLocaleCatalog(catalog)) return null;
    const record = await row(`translation:${locale}`);
    const overrides = record && isRecord(record.value) && isRecord(record.value.messages) ? record.value.messages : {};
    const messages = Object.fromEntries(
        Object.entries({ ...catalog.messages, ...overrides }).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
    return {
        locale,
        messages,
        revision: record?.revision ?? 0,
        missingKeys: translationKeys(catalogs).filter((key) => !Object.hasOwn(messages, key)),
    };
}
