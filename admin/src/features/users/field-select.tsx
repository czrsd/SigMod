import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronRight, ChevronsUpDown, Code, Folder, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type FieldInfo = { path: string; types: string[] };

const groups: Record<string, string> = {
    user: 'Game account',
    storedUser: 'Stored game account',
    modUser: 'SigMod account',
    storedModUser: 'Stored SigMod account',
    connection: 'Connection',
    position: 'Position',
    settings: 'Account settings',
    cards: 'Cards',
    sigma: 'Sigma',
    userAgent: 'User agent',
};
const labels: Record<string, string> = {
    _id: 'Record ID',
    sid: 'Connection ID',
    nick: 'Nickname',
    imageURL: 'Avatar URL',
    googleID: 'Google ID',
    discord_id: 'Discord ID',
    isAlive: 'Playing',
    isWsAlive: 'Heartbeat alive',
    ip: 'IP address',
    lastAuth: 'Last authentication',
    create_time: 'Created',
    createTime: 'Created',
    updateTime: 'Updated',
};
function label(path: string): string {
    return path
        .split('.')
        .map(
            (part) =>
                labels[part] ??
                part
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replaceAll('_', ' ')
                    .replace(/^./, (letter) => letter.toUpperCase())
        )
        .join(' › ');
}
export const selectableFields = (fields: FieldInfo[]): FieldInfo[] =>
    fields.filter((field) => !field.path.split('.').some((part) => part === '__v' || part === '_bsontype'));

type FieldNode = { key: string; title: string; children: Map<string, FieldNode>; field?: FieldInfo };
const inventoryField = (path: string) => path.split('.').some((part) => /^(sigma|cards|seasons?|rewards|inventory)$/i.test(part));
const normalize = (text: string) =>
    text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');
function fieldScope(path: string) {
    const [first, ...rest] = path.split('.');
    return rest.length ? { group: groups[first] ?? label(first), parts: rest } : { group: 'General', parts: [first] };
}
function nodeTitle(part: string, parent: string) {
    if (/^[a-f\d]{24}$/i.test(part)) return `${parent.endsWith('sigma') ? 'Season ' : ''}${part.slice(0, 6)}…${part.slice(-4)}`;
    return /^\d+$/.test(part) && parent.endsWith('rewards') ? `Reward ${part}` : label(part);
}
function fieldTree(fields: FieldInfo[]) {
    const result = new Map<string, Map<string, FieldNode>>();
    for (const field of fields) {
        const { group, parts } = fieldScope(field.path);
        if (!result.has(group)) result.set(group, new Map());
        let children = result.get(group)!;
        const prefix = field.path.split('.').slice(0, -parts.length);
        for (let index = 0; index < parts.length; index++) {
            const part = parts[index];
            const parent = prefix.join('.');
            prefix.push(part);
            const key = prefix.join('.');
            if (!children.has(key)) children.set(key, { key, title: nodeTitle(part, parent), children: new Map() });
            const node = children.get(key)!;
            if (index === parts.length - 1) node.field = field;
            children = node.children;
        }
    }
    return [...result].sort(([a], [b]) => (a === 'General' ? -1 : b === 'General' ? 1 : a.localeCompare(b)));
}
function branchKeys(nodes: Map<string, FieldNode>): string[] {
    return [...nodes.values()].flatMap((node) => (node.children.size ? [node.key, ...branchKeys(node.children)] : []));
}

export function FieldSelect({
    fields,
    value,
    onChange,
    label: ariaLabel,
    all = false,
    disabled = false,
}: {
    fields: FieldInfo[];
    value: string;
    onChange: (value: string) => void;
    label: string;
    all?: boolean;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [inventory, setInventory] = useState(false);
    const [paths, setPaths] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const searchRef = useRef<HTMLInputElement>(null);
    const options = useMemo(() => selectableFields(fields), [fields]);
    const terms = normalize(search).trim().split(/\s+/).filter(Boolean);
    const searching = terms.length > 0;
    const visible = options.filter((field) =>
        searching
            ? terms.every((term) => normalize(`${field.path} ${label(field.path)} ${fieldScope(field.path).group}`).includes(term))
            : inventory || !inventoryField(field.path)
    );
    const tree = fieldTree(visible);
    const selected = options.find((field) => field.path === value);
    const hidden = options.filter((field) => inventoryField(field.path)).length;
    const changeOpen = (next: boolean) => {
        setOpen(next);
        if (next) setSearch('');
    };
    const select = (path: string) => {
        onChange(path);
        changeOpen(false);
    };
    const toggle = (key: string) =>
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    const item = (field: FieldInfo, title: string, depth = 0) => (
        <Command.Item
            key={`field:${field.path}`}
            value={`field:${field.path}`}
            onSelect={() => select(field.path)}
            className="field-option"
            style={{ paddingLeft: 12 + depth * 14 }}
            title={field.path}
        >
            <Check size={14} className={value === field.path ? 'field-check is-checked' : 'field-check'} />
            <span className="field-option-label">
                <span>{title}</span>
                {paths && <small>{field.path}</small>}
            </span>
            <span className="field-type">{field.types.filter((type) => type !== 'null').join(' / ') || 'null'}</span>
        </Command.Item>
    );
    const nodes = (entries: Map<string, FieldNode>, depth = 0): ReactNode =>
        [...entries.values()].map((node) => {
            if (!node.children.size) return node.field ? item(node.field, node.title, depth) : null;
            const isOpen = expanded.has(node.key);
            return (
                <div key={node.key}>
                    <Command.Item
                        value={`group:${node.key}`}
                        className="field-folder"
                        style={{ paddingLeft: 12 + depth * 14 }}
                        onSelect={() => toggle(node.key)}
                        aria-expanded={isOpen}
                    >
                        <ChevronRight size={13} className={isOpen ? 'is-expanded' : ''} />
                        <Folder size={14} />
                        <span>{node.title}</span>
                        <small>{countFields(node)}</small>
                    </Command.Item>
                    {isOpen && (
                        <>
                            {node.field && item(node.field, `Entire ${node.title.toLowerCase()}`, depth + 1)}
                            {nodes(node.children, depth + 1)}
                        </>
                    )}
                </div>
            );
        });
    return (
        <Popover open={open} onOpenChange={changeOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    role="combobox"
                    aria-label={ariaLabel}
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    aria-required={!all}
                    variant="outline"
                    className="field-select field-combobox"
                    disabled={disabled}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                            event.preventDefault();
                            changeOpen(true);
                        }
                    }}
                >
                    <span>
                        {value
                            ? selected
                                ? `${fieldScope(value).group} · ${label(fieldScope(value).parts.join('.'))}`
                                : 'Unavailable field'
                            : all
                              ? 'All fields'
                              : 'Choose field'}
                    </span>
                    <ChevronsUpDown size={14} />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="field-picker"
                aria-label={`${ariaLabel} picker`}
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    searchRef.current?.focus();
                }}
            >
                <Command label={`${ariaLabel} options`} shouldFilter={false} loop>
                    <div className="field-picker-search">
                        <Search size={15} />
                        <Command.Input
                            ref={searchRef}
                            value={search}
                            onValueChange={setSearch}
                            placeholder="Search fields…"
                            aria-label="Search available fields"
                        />
                        {search && (
                            <button
                                type="button"
                                aria-label="Clear field search"
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
                                }}
                                onClick={() => {
                                    setSearch('');
                                    searchRef.current?.focus();
                                }}
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                    <div
                        className="field-picker-tools"
                        onKeyDown={(event) => {
                            if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) event.stopPropagation();
                        }}
                    >
                        <button
                            type="button"
                            aria-pressed={inventory}
                            onClick={() => setInventory(!inventory)}
                            title="Show Sigma, seasons, rewards and cards"
                        >
                            <Folder size={12} />
                            Inventory
                        </button>
                        <button type="button" aria-pressed={paths} onClick={() => setPaths(!paths)}>
                            <Code size={12} />
                            Paths
                        </button>
                        {!searching && (
                            <>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setExpanded(new Set(tree.flatMap(([group, entries]) => [`scope:${group}`, ...branchKeys(entries)])))
                                    }
                                >
                                    Expand all
                                </button>
                                <button type="button" onClick={() => setExpanded(new Set())}>
                                    Collapse all
                                </button>
                            </>
                        )}
                    </div>
                    <Command.List className="field-picker-list">
                        {all && !searching && (
                            <Command.Group>
                                <Command.Item className="field-option" value="all-fields" onSelect={() => select('')}>
                                    <Check size={14} className={!value ? 'field-check is-checked' : 'field-check'} />
                                    All fields
                                </Command.Item>
                            </Command.Group>
                        )}
                        {searching ? (
                            <>
                                {!visible.length && (
                                    <div className="field-picker-empty" role="status">
                                        No matching fields
                                    </div>
                                )}
                                {fieldTree(visible.slice(0, 150)).map(([group]) => (
                                    <Command.Group heading={group} key={group}>
                                        {visible
                                            .slice(0, 150)
                                            .filter((field) => fieldScope(field.path).group === group)
                                            .map((field) => item(field, label(fieldScope(field.path).parts.join('.'))))}
                                    </Command.Group>
                                ))}
                            </>
                        ) : (
                            tree.map(([group, entries]) => (
                                <Command.Group key={group} aria-label={group}>
                                    <Command.Item
                                        value={`scope:${group}`}
                                        className="field-folder field-category"
                                        onSelect={() => toggle(`scope:${group}`)}
                                        aria-expanded={expanded.has(`scope:${group}`)}
                                    >
                                        <ChevronRight size={13} className={expanded.has(`scope:${group}`) ? 'is-expanded' : ''} />
                                        <span>{group}</span>
                                        <small>{[...entries.values()].reduce((count, node) => count + countFields(node), 0)}</small>
                                    </Command.Item>
                                    {expanded.has(`scope:${group}`) && nodes(entries)}
                                </Command.Group>
                            ))
                        )}
                        {!searching && !visible.length && (
                            <div className="field-picker-empty" role="status">
                                No fields available
                            </div>
                        )}
                    </Command.List>
                    <div className="field-picker-footer">
                        <span>
                            {searching ? `${Math.min(visible.length, 150)} of ${visible.length} matches` : `${visible.length} fields`}
                        </span>
                        <span>{!searching && !inventory && hidden ? `${hidden} inventory fields hidden` : `${tree.length} groups`}</span>
                    </div>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
function countFields(node: FieldNode): number {
    return (node.field ? 1 : 0) + [...node.children.values()].reduce((count, child) => count + countFields(child), 0);
}
