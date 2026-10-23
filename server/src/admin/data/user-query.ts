import { ObjectId } from 'mongodb';
import { HttpError } from '../common';

export type UserFilter = { field: string; op: string; type: string; value?: string };
export type FieldInfo = { path: string; types: string[] };
const operators = new Set(['contains', 'notContains', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'exists', 'missing']);
const types = new Set(['string', 'number', 'boolean', 'date', 'null', 'objectId']);
const secret = /token|password|passwd|secret|cookie|authorization|credential|api[_-]?key|private[_-]?key/i;
export const hiddenField = (field: string): boolean =>
    field.split('.').some((part) => ['__v', '_bsontype', '__proto__', 'prototype', 'constructor'].includes(part) || secret.test(part));

export function validField(field: unknown): string {
    if (typeof field !== 'string' || field.length > 400 || !/^[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*$/u.test(field) || hiddenField(field)) {
        throw new HttpError(400, 'Invalid or protected field.');
    }
    return field;
}

export function parseUserQuery(query: Record<string, unknown>): { q: string; searchField: string; filters: UserFilter[] } {
    const q = query.q ?? '';
    if (typeof q !== 'string' || q.length > 200) throw new HttpError(400, 'Search must be 200 characters or fewer.');
    const searchField = query.searchField === undefined || query.searchField === '' ? '' : validField(query.searchField);
    let filters: unknown = [];
    if (query.filters !== undefined) {
        if (typeof query.filters !== 'string' || query.filters.length > 16000) throw new HttpError(400, 'Invalid filters.');
        try {
            filters = JSON.parse(query.filters);
        } catch {
            throw new HttpError(400, 'Invalid filters.');
        }
    }
    if (!Array.isArray(filters) || filters.length > 20) throw new HttpError(400, 'At most 20 filters are allowed.');
    for (const filter of filters) {
        if (
            !filter ||
            typeof filter !== 'object' ||
            Array.isArray(filter) ||
            Object.keys(filter).some((key) => !['field', 'op', 'type', 'value'].includes(key))
        )
            throw new HttpError(400, 'Invalid filter.');
        validField(filter.field);
        if (
            !operators.has(filter.op) ||
            !types.has(filter.type) ||
            (filter.value !== undefined && (typeof filter.value !== 'string' || filter.value.length > 1000))
        )
            throw new HttpError(400, 'Invalid filter operator or value.');
        if (['contains', 'notContains'].includes(filter.op)) {
            if (!filter.value?.trim()) throw new HttpError(400, 'Contains filters require a value.');
        } else if (!['exists', 'missing'].includes(filter.op)) filterValue(filter);
    }
    return { q: q.trim(), searchField, filters: filters as UserFilter[] };
}

export function filterValue(filter: UserFilter): string | number | boolean | Date | ObjectId | null {
    const value = filter.value ?? '';
    if (filter.type === 'null') return null;
    if (filter.type === 'number') {
        if (!value.trim() || !Number.isFinite(Number(value))) throw new HttpError(400, 'Invalid numeric filter.');
        return Number(value);
    }
    if (filter.type === 'boolean') {
        if (!['true', 'false'].includes(value)) throw new HttpError(400, 'Boolean filters require true or false.');
        return value === 'true';
    }
    if (filter.type === 'date') {
        if (!value || !Number.isFinite(Date.parse(value))) throw new HttpError(400, 'Invalid date filter.');
        return new Date(value);
    }
    if (filter.type === 'objectId') {
        if (!/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, 'Invalid ObjectId filter.');
        return new ObjectId(value);
    }
    return value;
}

export function visibleData(value: unknown): unknown {
    if (value == null || typeof value !== 'object') return value;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof ObjectId) return value.toHexString();
    if ('toObject' in value && typeof value.toObject === 'function') return visibleData(value.toObject());
    if (Array.isArray(value)) return value.map(visibleData);
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !hiddenField(key))
            .map(([key, entry]) => [key, visibleData(entry)])
    );
}

export function fieldCatalog(rows: unknown[]): FieldInfo[] {
    const fields = new Map<string, Set<string>>();
    const walk = (value: unknown, prefix = '', depth = 0): void => {
        if (!value || typeof value !== 'object' || depth > 16) return;
        for (const [key, entry] of Object.entries(value)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (hiddenField(path)) continue;
            const type =
                entry == null
                    ? 'null'
                    : entry instanceof ObjectId
                      ? 'objectId'
                      : entry instanceof Date
                        ? 'date'
                        : Array.isArray(entry)
                          ? 'array'
                          : typeof entry;
            if (!fields.has(path)) fields.set(path, new Set());
            fields.get(path)!.add(type);
            if (type === 'object') walk(entry, path, depth + 1);
            if (type === 'array')
                for (const child of entry as unknown[]) if (child && typeof child === 'object') walk(child, path, depth + 1);
        }
    };
    rows.forEach((row) => walk(row));
    return [...fields].sort(([a], [b]) => a.localeCompare(b)).map(([path, types]) => ({ path, types: [...types] }));
}

export function mergeFieldCatalogs(...catalogs: FieldInfo[][]): FieldInfo[] {
    const fields = new Map<string, Set<string>>();
    for (const catalog of catalogs) {
        for (const field of catalog) {
            if (hiddenField(field.path)) continue;
            if (!fields.has(field.path)) fields.set(field.path, new Set());
            for (const type of field.types) fields.get(field.path)!.add(type);
        }
    }
    return [...fields].sort(([a], [b]) => a.localeCompare(b)).map(([path, types]) => ({ path, types: [...types] }));
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function searchableValues(value: unknown, depth = 0): unknown {
    if (depth > 16) return [];
    return {
        $let: {
            vars: { [`v${depth}`]: value },
            in: {
                $cond: [
                    { $in: [{ $type: `$$v${depth}` }, ['object', 'array']] },
                    {
                        $reduce: {
                            input: {
                                $cond: [
                                    { $isArray: `$$v${depth}` },
                                    { $map: { input: `$$v${depth}`, as: 'element', in: { k: '', v: '$$element' } } },
                                    { $objectToArray: `$$v${depth}` },
                                ],
                            },
                            initialValue: [],
                            in: {
                                $concatArrays: [
                                    '$$value',
                                    {
                                        $cond: [
                                            {
                                                $regexMatch: {
                                                    input: '$$this.k',
                                                    regex: 'token|password|passwd|secret|cookie|authorization|credential|api[_-]?key|private[_-]?key|^(__v|_bsontype|__proto__|prototype|constructor)$',
                                                    options: 'i',
                                                },
                                            },
                                            [],
                                            searchableValues('$$this.v', depth + 1),
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                    [{ $convert: { input: `$$v${depth}`, to: 'string', onNull: '', onError: '' } }],
                ],
            },
        },
    };
}

function mongoFieldValue(field: string): unknown {
    if (!field) return '$$ROOT';
    if (!field.split('.').some((part) => /^\d+$/.test(part))) return `$${field}`;
    return field.split('.').reduce<unknown>((input, part) => {
        const property = (value: string) => ({
            $getField: { field: part, input: { $cond: [{ $eq: [{ $type: value }, 'object'] }, value, {}] } },
        });
        return {
            $let: {
                vars: { node: input },
                in: {
                    $cond: [
                        { $isArray: '$$node' },
                        /^\d+$/.test(part)
                            ? { $arrayElemAt: ['$$node', Number(part)] }
                            : { $map: { input: '$$node', as: 'entry', in: property('$$entry') } },
                        property('$$node'),
                    ],
                },
            },
        };
    }, '$$ROOT');
}
function containsExpression(field: string, value: string): Record<string, unknown> {
    return {
        $expr: {
            $anyElementTrue: [
                {
                    $map: {
                        input: searchableValues(mongoFieldValue(field)),
                        as: 'text',
                        in: { $regexMatch: { input: '$$text', regex: escapeRegex(value), options: 'i' } },
                    },
                },
            ],
        },
    };
}

export function mongoUserQuery(input: ReturnType<typeof parseUserQuery>): Record<string, unknown> {
    const clauses: Record<string, unknown>[] = [];
    if (input.q) clauses.push(containsExpression(input.searchField, input.q));
    for (const filter of input.filters) {
        const { field, op } = filter;
        if (op === 'exists' || op === 'missing') clauses.push({ [field]: { $exists: op === 'exists' } });
        else if (op === 'contains' || op === 'notContains') {
            const condition = containsExpression(field, filter.value ?? '');
            clauses.push(op === 'contains' ? condition : { $nor: [condition] });
        } else {
            const value = filterValue(filter);
            if (filter.type === 'date') {
                const date = { $convert: { input: mongoFieldValue(field), to: 'date', onError: null, onNull: null } };
                clauses.push({ $expr: { $and: [{ $ne: [date, null] }, { [`$${op}`]: [date, value] }] } });
            } else clauses.push({ [field]: { [`$${op}`]: value } });
            if (op === 'eq' && value === null) clauses.push({ [field]: { $exists: true } });
        }
    }
    return clauses.length ? { $and: clauses } : {};
}

function pathValues(value: unknown, path: string[]): unknown[] {
    if (!path.length) return [value];
    if (Array.isArray(value) && !/^\d+$/.test(path[0])) return value.flatMap((item) => pathValues(item, path));
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, path[0])) return [];
    return pathValues((value as Record<string, unknown>)[path[0]], path.slice(1));
}
function leafValues(value: unknown): unknown[] {
    if (value && typeof value === 'object') return Object.values(value).flatMap(leafValues);
    return [value];
}

export function matchesUser(row: Record<string, unknown>, input: ReturnType<typeof parseUserQuery>): boolean {
    const contains = (value: unknown, term: string) =>
        leafValues(value).some((v) =>
            String(v ?? '')
                .toLowerCase()
                .includes(term.toLowerCase())
        );
    if (input.q && !contains(input.searchField ? pathValues(row, input.searchField.split('.')) : row, input.q)) return false;
    return input.filters.every((filter) => {
        const values = pathValues(row, filter.field.split('.'));
        if (filter.op === 'exists') return values.length > 0;
        if (filter.op === 'missing') return !values.length;
        if (filter.op === 'contains') return contains(values, filter.value ?? '');
        if (filter.op === 'notContains') return !contains(values, filter.value ?? '');
        const parsed = filterValue(filter);
        const target = parsed instanceof Date ? parsed.getTime() : parsed instanceof ObjectId ? parsed.toString() : parsed;
        if (
            filter.type === 'date' &&
            !values.some((value) => value != null && Number.isFinite(typeof value === 'string' ? Date.parse(value) : Number(value)))
        )
            return false;
        const compare = (value: unknown): boolean => {
            if (Array.isArray(value)) return value.some(compare);
            const actual = filter.type === 'date' && typeof value === 'string' ? Date.parse(value) : value;
            if (filter.type === 'date' && (typeof actual !== 'number' || !Number.isFinite(actual))) return false;
            if (filter.op === 'eq' || filter.op === 'ne') return actual === target;
            if (
                actual == null ||
                target == null ||
                typeof actual !== typeof target ||
                (typeof actual !== 'string' && typeof actual !== 'number')
            )
                return false;
            const order =
                actual === target ? 0 : typeof actual === 'number' ? (actual < Number(target) ? -1 : 1) : actual < String(target) ? -1 : 1;
            if (filter.op === 'gt') return order > 0;
            if (filter.op === 'gte') return order >= 0;
            if (filter.op === 'lt') return order < 0;
            return order <= 0;
        };
        const matched = values.some(compare);
        if (filter.op === 'ne' && parsed === null && !values.length) return false;
        return filter.op === 'ne' ? !matched : matched;
    });
}
