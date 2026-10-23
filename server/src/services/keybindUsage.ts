import { createHash } from 'crypto';
import KeybindUsageModel from '../models/KeybindUsageModel';
import schema from '../config/settingsUsageSchema.json';
import { isRecord, validateUsageValues } from '../utils/settingsUsage';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keybindPaths = new Set(Object.entries(schema.fields).filter(([path, field]) => path.startsWith('macros.keys.') && field.type === 'nullableString').map(([path]) => path));
const changePaths = new Set([...Object.keys(schema.fields).filter((path) => path.startsWith('macros.keys.')), 'macros.mouse.bindings']);
const mouseActions = new Set(['fastfeed', 'split', 'split2', 'split3', 'split4', 'freeze', 'dTrick', 'sTrick', 'ping']);

type ReportResult = { batchId: string | null; status: 'accepted' | 'invalid' | 'unavailable' };

export async function storeKeybindUsage(input: unknown, at = new Date()): Promise<ReportResult> {
    const batchId = isRecord(input) && typeof input.batchId === 'string' && uuid.test(input.batchId) ? input.batchId : null;
    const invalid: ReportResult = { batchId, status: 'invalid' };
    if (!isRecord(input) || !batchId || typeof input.installationId !== 'string' || !uuid.test(input.installationId) ||
        !Array.isArray(input.uses) || input.uses.length > 100 || !Array.isArray(input.changes) || input.changes.length > 100 ||
        Buffer.byteLength(JSON.stringify(input)) > 96 * 1024) return invalid;
    const today = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    const dayValue = input.day ?? today.toISOString().slice(0, 10);
    if (typeof dayValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayValue)) return invalid;
    const day = new Date(dayValue + 'T00:00:00.000Z');
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== dayValue || day > today ||
        day.getTime() <= today.getTime() - 180 * 24 * 60 * 60 * 1000) return invalid;
    const metrics: Record<string, number> = {};
    const labels: Record<string, string> = {};
    const add = (label: string, count: number) => {
        const id = 'm_' + createHash('sha256').update(label).digest('hex').slice(0, 32);
        metrics[id] = (metrics[id] ?? 0) + count;
        labels[id] = label;
    };
    for (const item of input.uses) {
        if (!isRecord(item) || typeof item.action !== 'string' || !['keyboard', 'mouse'].includes(String(item.input)) ||
            !(item.input === 'keyboard' ? keybindPaths.has(item.action) : mouseActions.has(item.action)) ||
            typeof item.binding !== 'string' || item.binding.length > 8192 || !Number.isSafeInteger(item.count) || Number(item.count) < 1) return invalid;
        add(JSON.stringify({ type: 'use', action: item.action, input: item.input, binding: item.binding }), Number(item.count));
    }
    for (const item of input.changes) {
        if (!isRecord(item) || typeof item.action !== 'string' || !changePaths.has(item.action) ||
            !Number.isSafeInteger(item.count) || Number(item.count) < 1 ||
            !validateUsageValues({ [item.action]: item.from }, false) || !validateUsageValues({ [item.action]: item.to }, false)) return invalid;
        add(JSON.stringify({ type: 'change', action: item.action, from: item.from, to: item.to }), Number(item.count));
    }
    if (!Object.keys(metrics).length) return { batchId, status: 'accepted' };
    const id = input.installationId + ':' + dayValue;
    const expiresAt = new Date(day.getTime() + 180 * 24 * 60 * 60 * 1000);
    try {
        try {
            await KeybindUsageModel.updateOne({ _id: id }, { $setOnInsert: { day, metrics: {}, labels: {}, batches: [], expiresAt } }, { upsert: true });
        } catch (error) {
            if (!isRecord(error) || error.code !== 11000) throw error;
        }
        await KeybindUsageModel.updateOne({ _id: id, batches: { $ne: batchId } }, {
            $inc: Object.fromEntries(Object.entries(metrics).map(([key, value]) => ['metrics.' + key, value])),
            $set: Object.fromEntries(Object.entries(labels).map(([key, value]) => ['labels.' + key, value])),
            $addToSet: { batches: batchId },
        });
        return { batchId, status: 'accepted' };
    } catch {
        return { batchId, status: 'unavailable' };
    }
}
