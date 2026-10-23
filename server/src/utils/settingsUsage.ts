import { createHash } from 'crypto';
import schema from '../config/settingsUsageSchema.json';

export const SETTINGS_USAGE_SCHEMA = schema;
export const MAX_USAGE_BYTES = 96 * 1024;
export type UsageValues = Record<string, unknown>;
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const actions = new Set(['fastfeed', 'split', 'split2', 'split3', 'split4', 'freeze', 'dTrick', 'sTrick', 'ping']);
const fields: Record<string, { type: string }> = schema.fields;
const validString = (value: unknown): value is string => typeof value === 'string' && value.length <= 8192;

export const validateUsageValues = (input: unknown, snapshot: boolean): UsageValues | null => {
    if (!isRecord(input)) return null;
    const keys = Object.keys(input);
    if (snapshot && keys.length !== Object.keys(fields).length) return null;
    if (!snapshot && (keys.length === 0 || keys.length > Object.keys(fields).length)) return null;
    const result: UsageValues = {};
    for (const path of keys.sort()) {
        if (!Object.hasOwn(fields, path)) return null;
        const value = input[path];
        switch (fields[path].type) {
        case 'language':
            if (typeof value !== 'string' || !['en', 'es', 'tr', 'fr', 'pt', 'ru', 'de'].includes(value)) return null;
            break;
        case 'boolean':
            if (typeof value !== 'boolean') return null;
            break;
        case 'number':
            if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e9) return null;
            break;
        case 'string':
            if (!validString(value)) return null;
            break;
        case 'nullableString':
            if (value !== null && !validString(value)) return null;
            break;
        case 'strings':
            if (!Array.isArray(value) || value.length > 128 || !value.every(validString)) return null;
            break;
        case 'bindings':
            if (!Array.isArray(value) || value.length > 64) return null;
            for (const binding of value) {
                if (!isRecord(binding) || Object.keys(binding).length !== 2) return null;
                const button = binding.button;
                if (!Number.isInteger(button) || Number(button) < 0 || Number(button) > 32767) return null;
                if (typeof binding.action !== 'string' || !actions.has(binding.action)) return null;
            }
            break;
        default:
            return null;
        }
        result[path] =
            fields[path].type === 'bindings'
                ? (value as { button: number; action: string }[]).map(({ button, action }) => ({ button, action }))
                : value;
    }
    return Buffer.byteLength(JSON.stringify(result)) <= MAX_USAGE_BYTES ? result : null;
};

export const usageChecksum = (values: UsageValues): string => {
    const sorted = Object.fromEntries(
        Object.keys(values)
            .sort()
            .map((key) => [key, values[key]])
    );
    return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
};

export const nestUsageValues = (values: UsageValues): UsageValues => {
    const result: UsageValues = {};
    for (const [path, value] of Object.entries(values)) {
        const parts = path.split('.');
        let target = result;
        for (const part of parts.slice(0, -1)) {
            target[part] ??= {};
            target = target[part] as UsageValues;
        }
        target[parts[parts.length - 1]] = value;
    }
    return result;
};

export const flattenUsageValues = (settings: UsageValues): UsageValues => {
    const result: UsageValues = {};
    for (const path of Object.keys(fields).sort()) {
        let value: unknown = settings;
        for (const part of path.split('.')) value = isRecord(value) ? value[part] : undefined;
        if (value !== undefined) result[path] = value;
    }
    return result;
};
