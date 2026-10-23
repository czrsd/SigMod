import { NextFunction, Request, Response, Router } from 'express';
import mongoose, { FilterQuery } from 'mongoose';
import AnnouncementModel from '../../models/AnnouncementModel';
import { AnnouncementPreview } from '../../models/AnnouncementModel';
import { asyncRoute, auditAdminAction } from '../common';
import { ContentAudit, ContentRow, ContentRowDocument } from './models';
import { defaultChatFilter } from './chatFilter';
import { contentEvents, getPublicChatFilterSnapshot, getPublicContentSnapshot, getPublicLocalePack } from './public';
import {
    AlertContent,
    ChatFilterContent,
    ContentError,
    JsonObject,
    UpdateNoticeContent,
    isRecord,
    locales,
    object,
    revision,
    safeUrl,
    sanitizeImageUrls,
    sanitizeRichText,
    str,
    translationKeys,
    validateTranslations,
} from './validation';

interface AnnouncementFull {
    title: string;
    description: string;
    images: string[];
}

interface AnnouncementRecord {
    _id: unknown;
    preview: AnnouncementPreview;
    full: AnnouncementFull;
    date: Date;
    status?: 'draft' | 'published' | 'archived';
    revision?: number;
}

type PromotionInput = JsonObject & {
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
};

const router = Router();

function requestBody(req: Request): unknown {
    return req.body as unknown;
}

function adminId(req: Request): string {
    return req.admin?.id ?? '';
}

function isDuplicateKeyError(error: unknown): boolean {
    return isRecord(error) && error.code === 11000;
}

function isCastError(error: unknown): boolean {
    return isRecord(error) && error.name === 'CastError';
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Request failed.';
}

async function auditContentChange(action: string, admin: string, target: string, revisionNumber: number, fields: string[]) {
    await ContentAudit.create({
        actor: admin,
        action,
        target,
        revision: revisionNumber,
        changes: { fields },
    });
    auditAdminAction(action, admin, { target, revision: revisionNumber });
}

async function writeContent(req: Request, id: string, value: JsonObject): Promise<JsonObject> {
    const request = requestBody(req);
    if (!isRecord(request) || !Object.hasOwn(request, 'expectedRevision')) {
        throw new ContentError(400, 'expectedRevision is required.');
    }
    const expected = revision(request.expectedRevision);
    const current = await ContentRow.findById(id).lean<ContentRowDocument | null>();
    if ((current?.revision ?? 0) !== expected) throw new ContentError(409, 'Revision conflict. Refresh and retry.');

    let updated: ContentRowDocument | null;
    try {
        updated = await ContentRow.findOneAndUpdate(
            { _id: id, revision: expected },
            { $set: { value, revision: expected + 1, updatedAt: new Date() } },
            { new: true, upsert: expected === 0, setDefaultsOnInsert: true }
        ).lean<ContentRowDocument | null>();
    } catch (error: unknown) {
        if (isDuplicateKeyError(error)) throw new ContentError(409, 'Revision conflict. Refresh and retry.');
        throw error;
    }
    if (!updated || updated.revision !== expected + 1) {
        throw new ContentError(409, 'Revision conflict. Refresh and retry.');
    }

    await auditContentChange('content.update', adminId(req), id, updated.revision, Object.keys(value));
    contentEvents.emit('changed', id);
    return { id, revision: updated.revision, ...value };
}

function config<T>(id: string, fallback: T) {
    return asyncRoute(async (_req: Request, res: Response) => {
        const record = await ContentRow.findById(id).lean<ContentRowDocument | null>();
        res.json(record ? { id, revision: record.revision, ...record.value } : fallback);
    });
}

function updateConfig(id: string, keys: readonly string[], validate: (body: JsonObject) => JsonObject) {
    return asyncRoute(async (req: Request, res: Response) => {
        const body = object(requestBody(req), ['expectedRevision', ...keys]);
        const value = validate(body);
        res.json({ success: true, data: await writeContent(req, id, value) });
    });
}

function optionalUrl(value: unknown, name: string): string {
    return safeUrl(value, name, true) ?? '';
}

function booleanValue(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') throw new ContentError(400, `${name} must be boolean.`);
    return value;
}

function plainText(value: unknown, name: string, max = 1000): string {
    const text = str(value, name, max) ?? '';
    if (/[<>]/.test(text)) throw new ContentError(400, `${name} must be plain text.`);
    return text;
}

function optionalPlainText(value: unknown, name: string, max: number): string {
    if (value === undefined || value === '') return '';
    return plainText(value, name, max);
}

function optionalHtml(value: unknown, name: string, max: number): string {
    if (value === undefined || value === '') return '';
    if (typeof value !== 'string' || value.length > max)
        throw new ContentError(400, `${name} must be HTML text of at most ${max} characters.`);
    return value;
}

function testText(value: unknown, name: string, max: number): string {
    if (typeof value !== 'string' || value.length > max) throw new ContentError(400, `Invalid ${name}.`);
    return value.trim().toLowerCase();
}

function dateOrNull(value: unknown, name: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' && typeof value !== 'number') throw new ContentError(400, `Invalid ${name}.`);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new ContentError(400, `Invalid ${name}.`);
    return date.toISOString();
}

function displayText(value: unknown, name: string, max: number, enabled: boolean): string {
    if (!enabled && (value === undefined || value === '')) return '';
    return plainText(value, name, max);
}

function isAnnouncementStatus(value: unknown): value is 'draft' | 'published' | 'archived' {
    return value === 'draft' || value === 'published' || value === 'archived';
}

function announcementPreview(value: unknown, required = false): Partial<AnnouncementPreview> {
    const body = object(value, ['title', 'description', 'icon', 'pinned'], required ? ['title', 'description'] : []);
    const result: Partial<AnnouncementPreview> = {};
    if (Object.hasOwn(body, 'title')) result.title = plainText(body.title, 'preview.title', 160);
    if (Object.hasOwn(body, 'description')) result.description = plainText(body.description, 'preview.description', 500);
    if (Object.hasOwn(body, 'icon')) result.icon = safeUrl(body.icon, 'preview.icon')!;
    if (Object.hasOwn(body, 'pinned')) result.pinned = booleanValue(body.pinned, 'preview.pinned');
    return result;
}

function announcementFull(value: unknown, required = false): Partial<AnnouncementFull> {
    const body = object(value, ['title', 'description', 'images'], required ? ['title', 'description'] : []);
    const result: Partial<AnnouncementFull> = {};
    if (Object.hasOwn(body, 'title')) result.title = plainText(body.title, 'full.title', 160);
    if (Object.hasOwn(body, 'description')) result.description = sanitizeRichText(body.description, 'full.description');
    if (Object.hasOwn(body, 'images')) {
        if (!Array.isArray(body.images) || body.images.length > 12) {
            throw new ContentError(400, 'full.images must be an array of at most 12 URLs.');
        }
        result.images = body.images.map((image: unknown) => safeUrl(image, 'image URL')!);
    }
    return result;
}

function announcementDate(value: unknown): Date {
    if (typeof value !== 'string' && typeof value !== 'number') throw new ContentError(400, 'Invalid date.');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new ContentError(400, 'Invalid date.');
    return date;
}

function announcementOutput(record: AnnouncementRecord) {
    return {
        ...record,
        full: {
            ...record.full,
            description: sanitizeRichText(record.full.description, 'full.description'),
            images: sanitizeImageUrls(record.full.images),
        },
        status: record.status ?? 'published',
        revision: record.revision ?? 0,
    };
}

function stringArray(value: unknown, field: string): string[] {
    if (
        !Array.isArray(value) ||
        value.length > 500 ||
        value.some((item: unknown) => typeof item !== 'string' || !item.trim() || item.length > 300)
    ) {
        throw new ContentError(400, `${field} must be an array of up to 500 strings (300 characters each).`);
    }
    return [...new Set(value.map((item: string) => item.trim().toLowerCase()))];
}

function promotionColor(value: unknown, field: string, fallback: string): string {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) {
        throw new ContentError(400, `${field} must be a six-digit hex color.`);
    }
    return value.toLowerCase();
}

function promotionValue(body: JsonObject): PromotionInput {
    if (body.placement !== 'menu-card') throw new ContentError(400, 'placement must be menu-card.');
    const buttonText = optionalPlainText(body.buttonText, 'buttonText', 80);
    const imageUrl = optionalUrl(body.imageUrl, 'imageUrl');
    const value: PromotionInput = {
        title: plainText(body.title, 'title', 120),
        description: optionalPlainText(body.description, 'description', 500),
        titleColor: promotionColor(body.titleColor, 'titleColor', '#ffffff'),
        descriptionColor: promotionColor(body.descriptionColor, 'descriptionColor', '#a0a0a0'),
        imageUrl,
        link: safeUrl(body.link, 'link')!,
        buttonText,
        html: optionalHtml(body.html, 'html', 20000),
        css: optionalPlainText(body.css, 'css', 20000),
        placement: 'menu-card',
        enabled: booleanValue(body.enabled, 'enabled'),
        startsAt: dateOrNull(body.startsAt, 'startsAt'),
        expiresAt: dateOrNull(body.expiresAt, 'expiresAt'),
    };
    if (value.startsAt && value.expiresAt && value.startsAt >= value.expiresAt) {
        throw new ContentError(400, 'expiresAt must be later than startsAt.');
    }
    return value;
}

function fail(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
    void _next;
    const status = error instanceof ContentError ? error.status : isCastError(error) ? 400 : 500;
    if (status === 500) console.error('[admin-content] request failed');
    res.status(status).json({
        success: false,
        error: status === 500 ? 'Internal Server Error' : errorMessage(error),
    });
}

router.get(
    '/announcements',
    asyncRoute(async (_req, res) => {
        const rows = await AnnouncementModel.find({}).sort({ date: -1 }).limit(100).lean<AnnouncementRecord[]>();
        res.json({ success: true, data: rows.map(announcementOutput) });
    })
);

router.post(
    '/announcements',
    asyncRoute(async (req, res) => {
        const body = object(requestBody(req), ['preview', 'full', 'date', 'status']);
        const preview = announcementPreview(body.preview, true) as AnnouncementPreview;
        preview.icon ??= 'https://czrsd.com/static/sigmod/announcements/default.svg';
        preview.pinned ??= false;
        const full = announcementFull(body.full, true) as AnnouncementFull;
        full.images ??= [];
        const status = body.status === undefined ? 'draft' : body.status;
        if (!isAnnouncementStatus(status)) throw new ContentError(400, 'Invalid status.');
        const date = body.date === undefined ? new Date() : announcementDate(body.date);
        const document = await AnnouncementModel.create({ preview, full, date, status, revision: 0 });
        const target = String(document._id);
        await auditContentChange('announcement.create', adminId(req), target, 0, ['status', 'preview', 'full']);
        contentEvents.emit('announcement', target);
        res.status(201).json({ success: true, data: document });
    })
);

router.get(
    '/announcements/:id',
    asyncRoute(async (req, res) => {
        const record = await AnnouncementModel.findById(req.params.id).lean<AnnouncementRecord | null>();
        if (!record) throw new ContentError(404, 'Announcement not found.');
        res.json({ success: true, data: announcementOutput(record) });
    })
);

router.patch(
    '/announcements/:id',
    asyncRoute(async (req, res) => {
        const body = object(requestBody(req), ['expectedRevision', 'status', 'preview', 'full', 'date'], ['expectedRevision']);
        const expected = revision(body.expectedRevision);
        const current = await AnnouncementModel.findById(req.params.id).lean<AnnouncementRecord | null>();
        if (!current) throw new ContentError(404, 'Announcement not found.');
        if ((current.revision ?? 0) !== expected) throw new ContentError(409, 'Revision conflict. Refresh and retry.');

        const set: Record<string, unknown> = {};
        if (Object.hasOwn(body, 'status')) {
            if (!isAnnouncementStatus(body.status)) throw new ContentError(400, 'Invalid status.');
            set.status = body.status;
        }
        if (Object.hasOwn(body, 'preview')) set.preview = { ...current.preview, ...announcementPreview(body.preview) };
        if (Object.hasOwn(body, 'full')) set.full = { ...current.full, ...announcementFull(body.full) };
        if (Object.hasOwn(body, 'date')) set.date = announcementDate(body.date);
        set.revision = expected + 1;

        const compareAndSet: FilterQuery<AnnouncementRecord> =
            expected === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expected };
        const document = await AnnouncementModel.findOneAndUpdate(
            { _id: req.params.id, ...compareAndSet },
            { $set: set },
            { new: true }
        ).lean<AnnouncementRecord | null>();
        if (!document) throw new ContentError(409, 'Revision conflict. Refresh and retry.');
        await auditContentChange('announcement.update', adminId(req), req.params.id, expected + 1, Object.keys(set));
        contentEvents.emit('announcement', req.params.id);
        res.json({ success: true, data: announcementOutput(document) });
    })
);

router.get(
    '/alert',
    config<AlertContent>('alert', {
        id: 'alert',
        revision: 0,
        enabled: false,
        title: '',
        description: '',
        link: '',
        buttonText: '',
        expiresAt: null,
    })
);
router.put(
    '/alert',
    updateConfig('alert', ['enabled', 'title', 'description', 'link', 'buttonText', 'expiresAt'], (body) => {
        const enabled = booleanValue(body.enabled, 'enabled');
        const title = displayText(body.title, 'title', 160, enabled);
        const description = displayText(body.description, 'description', 1000, enabled);
        const buttonText = displayText(body.buttonText, 'buttonText', 80, false);
        const link = optionalUrl(body.link, 'link');
        if (enabled && (!title || !description || !!buttonText !== !!link)) {
            throw new ContentError(400, 'Enabled alerts require a title and description; link and buttonText must be set together.');
        }
        return { enabled, title, description, link, buttonText, expiresAt: dateOrNull(body.expiresAt, 'expiresAt') };
    })
);

router.get(
    '/update-notice',
    config<UpdateNoticeContent>('updateNotice', {
        id: 'updateNotice',
        revision: 0,
        enabled: false,
        latestClientVersion: '',
        downloadUrl: '',
        message: '',
    })
);
router.put(
    '/update-notice',
    updateConfig('updateNotice', ['enabled', 'latestClientVersion', 'downloadUrl', 'message'], (body) => {
        const enabled = booleanValue(body.enabled, 'enabled');
        const latestClientVersion = displayText(body.latestClientVersion, 'latestClientVersion', 80, enabled);
        const downloadUrl = optionalUrl(body.downloadUrl, 'downloadUrl');
        const message = displayText(body.message, 'message', 1000, enabled);
        if (
            latestClientVersion &&
            !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(latestClientVersion)
        ) {
            throw new ContentError(400, 'Invalid semantic client version.');
        }
        if (enabled && (!latestClientVersion || !downloadUrl || !message)) {
            throw new ContentError(400, 'Enabled update notices require a version, download URL and message.');
        }
        return { enabled, latestClientVersion, downloadUrl, message };
    })
);

router.get('/chat-filter', config<ChatFilterContent>('chatFilter', defaultChatFilter()));
router.put(
    '/chat-filter',
    updateConfig('chatFilter', ['enabled', 'names', 'messages'], (body) => ({
        enabled: booleanValue(body.enabled, 'enabled'),
        names: stringArray(body.names, 'names'),
        messages: stringArray(body.messages, 'messages'),
    }))
);
router.post('/chat-filter/test', (req, res) => {
    const body = object(requestBody(req), ['name', 'message', 'names', 'messages'], ['name', 'message', 'names', 'messages']);
    const name = testText(body.name, 'name', 1000);
    const message = testText(body.message, 'message', 1000);
    const names = stringArray(body.names, 'names').filter((item) => name.includes(item));
    const messages = stringArray(body.messages, 'messages').filter((item) => message.includes(item));
    res.json({ success: true, data: { matched: names.length > 0 || messages.length > 0, names, messages } });
});

router.get(
    '/translations',
    asyncRoute(async (_req, res) => {
        const catalogs = locales();
        const records = await ContentRow.find({ _id: /^translation:/ }).lean<ContentRowDocument[]>();
        const revisions = new Map(records.map((record) => [record._id.slice('translation:'.length), record.revision]));
        res.json({
            success: true,
            data: Object.keys(catalogs).map((locale) => ({ locale, revision: revisions.get(locale) ?? 0 })),
        });
    })
);
router.get(
    '/translations/:locale',
    asyncRoute(async (req, res) => {
        const catalogs = locales();
        if (!Object.hasOwn(catalogs, req.params.locale)) throw new ContentError(404, 'Unsupported locale.');
        const catalog = catalogs[req.params.locale];
        const record = await ContentRow.findById(`translation:${req.params.locale}`).lean<ContentRowDocument | null>();
        const storedMessages = record && isRecord(record.value) && isRecord(record.value.messages) ? record.value.messages : {};
        const overrides = Object.fromEntries(
            Object.entries(storedMessages).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        );
        const messages = Object.fromEntries(
            Object.entries({ ...catalog.messages, ...overrides }).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        );
        res.json({
            success: true,
            data: {
                locale: req.params.locale,
                messages,
                revision: record?.revision ?? 0,
                missingKeys: translationKeys(catalogs).filter((key) => !Object.hasOwn(messages, key)),
                baseMessages: catalog.messages,
                overrides,
                sourceKeys: translationKeys(catalogs),
            },
        });
    })
);
router.put(
    '/translations/:locale',
    asyncRoute(async (req, res) => {
        const body = object(requestBody(req), ['expectedRevision', 'messages'], ['expectedRevision', 'messages']);
        const messages = validateTranslations(req.params.locale, body.messages);
        const data = await writeContent(req, `translation:${req.params.locale}`, { messages });
        res.json({
            success: true,
            data: { ...data, missingKeys: translationKeys().filter((key) => !Object.hasOwn(messages, key)) },
        });
    })
);

const PROMOTION_KEYS = [
    'title',
    'description',
    'titleColor',
    'descriptionColor',
    'imageUrl',
    'link',
    'buttonText',
    'html',
    'css',
    'placement',
    'enabled',
    'startsAt',
    'expiresAt',
] as const;

router.get(
    '/promotions',
    asyncRoute(async (_req, res) => {
        const rows = await ContentRow.find({ _id: /^promotion:/ }).lean<ContentRowDocument[]>();
        const data = rows.map((row) => ({ id: row._id.slice('promotion:'.length), revision: row.revision, ...row.value }));
        res.json({ success: true, data });
    })
);

router.post(
    '/promotions',
    asyncRoute(async (req, res) => {
        const body = object(requestBody(req), ['expectedRevision', ...PROMOTION_KEYS, 'id']);
        if (revision(body.expectedRevision) !== 0) throw new ContentError(409, 'New promotions start at revision 0.');
        const id = body.id === undefined ? new mongoose.Types.ObjectId().toString() : body.id;
        if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
            throw new ContentError(400, 'Invalid promotion id.');
        }
        const value = promotionValue(body);
        try {
            await ContentRow.create({ _id: `promotion:${id}`, revision: 1, value, updatedAt: new Date() });
        } catch (error: unknown) {
            if (isDuplicateKeyError(error)) throw new ContentError(409, 'Promotion id already exists.');
            throw error;
        }
        await auditContentChange('promotion.create', adminId(req), id, 1, Object.keys(value));
        contentEvents.emit('changed', `promotion:${id}`);
        res.status(201).json({ success: true, data: { id, revision: 1, ...value } });
    })
);

router.patch(
    '/promotions/:id',
    asyncRoute(async (req, res) => {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(req.params.id)) throw new ContentError(400, 'Invalid promotion id.');
        const body = object(requestBody(req), ['expectedRevision', ...PROMOTION_KEYS]);
        const current = await ContentRow.findById(`promotion:${req.params.id}`).lean<ContentRowDocument | null>();
        if (!current) throw new ContentError(404, 'Promotion not found.');
        if (revision(body.expectedRevision) !== current.revision) {
            throw new ContentError(409, 'Revision conflict. Refresh and retry.');
        }
        const value = promotionValue({ ...current.value, ...body });
        const updated = await writeContent(req, `promotion:${req.params.id}`, value);
        res.json({ success: true, data: { ...updated, id: req.params.id } });
    })
);

router.delete(
    '/promotions/:id',
    asyncRoute(async (req, res) => {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(req.params.id)) throw new ContentError(400, 'Invalid promotion id.');
        const body = object(requestBody(req), ['expectedRevision']);
        const expected = revision(body.expectedRevision);
        const deleted = await ContentRow.findOneAndDelete({
            _id: `promotion:${req.params.id}`,
            revision: expected,
        }).lean<ContentRowDocument | null>();
        if (!deleted) {
            const current = await ContentRow.findById(`promotion:${req.params.id}`).select('revision').lean<{ revision: number } | null>();
            if (!current) throw new ContentError(404, 'Promotion not found.');
            throw new ContentError(409, 'Revision conflict. Refresh and retry.');
        }
        await auditContentChange('promotion.delete', adminId(req), req.params.id, deleted.revision, ['deleted']);
        contentEvents.emit('changed', `promotion:${req.params.id}`);
        res.status(204).end();
    })
);

router.use(fail);

export { getPublicChatFilterSnapshot, getPublicContentSnapshot, getPublicLocalePack };
export default router;
