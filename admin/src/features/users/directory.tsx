import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Copy, Filter, Plus, RefreshCw, Search, Star, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { PageHeader, QueryState, EmptyState } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatStoredDate, displayValue } from '@/lib/format';
import { FieldSelect, selectableFields, type FieldInfo } from './field-select';
import { SigmallyClanField, SigmallyLastSkinField, SigmallySkinsField } from '@/features/sigmally-users/profile-extras';

type Mode = 'active-users' | 'sigmally-users' | 'sigmod-users';
type User = Record<string, unknown>;
type Rule = { field: string; op: string; type: string; value: string };
type UserPage = {
    items: User[];
    nextCursor?: string | null;
    page?: number;
    totalPages?: number;
    total?: number;
    matched?: number;
    capturedAt?: string;
    fields?: FieldInfo[];
};
const operators = [
    ['contains', 'Contains'],
    ['notContains', 'Does not contain'],
    ['eq', 'Equals'],
    ['ne', 'Does not equal'],
    ['gt', 'Greater than'],
    ['gte', 'At least'],
    ['lt', 'Less than'],
    ['lte', 'At most'],
    ['exists', 'Exists'],
    ['missing', 'Missing'],
];
const valueTypes = ['string', 'number', 'boolean', 'date', 'null', 'objectId'];
const fieldType = (field?: FieldInfo): string =>
    field?.types.includes('date')
        ? 'date'
        : field?.types.includes('objectId')
          ? 'objectId'
          : (field?.types.find((type) => valueTypes.includes(type) && type !== 'null') ??
            (field?.types.includes('null') ? 'null' : 'string'));
const newRule = (): Rule => ({ field: '', op: 'contains', type: 'string', value: '' });
function isCompleteRule(rule: Rule): boolean {
    if (!rule.field) return false;
    if (['exists', 'missing'].includes(rule.op)) return true;
    if (['contains', 'notContains'].includes(rule.op)) return Boolean(rule.value.trim());
    if (rule.type === 'null') return true;
    if (rule.type === 'number') return Boolean(rule.value.trim()) && Number.isFinite(Number(rule.value));
    if (rule.type === 'boolean') return ['true', 'false'].includes(rule.value);
    if (rule.type === 'date') return Boolean(rule.value) && Number.isFinite(Date.parse(rule.value));
    if (rule.type === 'objectId') return /^[a-f\d]{24}$/i.test(rule.value);
    return true;
}
function readRules(raw: string | null): Rule[] {
    try {
        const result: unknown = JSON.parse(raw ?? '[]');
        return Array.isArray(result)
            ? result
                  .filter(
                      (r): r is Rule =>
                          r &&
                          typeof r.field === 'string' &&
                          typeof r.op === 'string' &&
                          typeof r.type === 'string' &&
                          (r.value === undefined || typeof r.value === 'string')
                  )
                  .map((r) => ({ ...r, value: r.value ?? '' }))
            : [];
    } catch {
        return [];
    }
}
const object = (value: unknown): User => (value && typeof value === 'object' && !Array.isArray(value) ? (value as User) : {});
const text = (value: unknown): string => (value == null || value === '' ? '—' : displayValue(value));
const number = (value: unknown): string => (typeof value === 'number' ? value.toLocaleString() : '—');
function nameOf(user: User, active: boolean): string {
    return String(
        (!active && user.fullName) ||
            user.username ||
            user.nick ||
            user.givenName ||
            object(user.user).nick ||
            object(user.user).givenName ||
            object(user.modUser).username ||
            (active ? 'Guest' : user._id) ||
            'Unnamed'
    );
}
function avatarUrl(user: User): string | undefined {
    const candidates = [user.imageURL, object(user.user).imageURL, object(user.modUser).imageURL];
    return candidates.find((value): value is string => typeof value === 'string' && /^https:\/\//i.test(value));
}
function UserAvatar({ user, active, className = 'user-avatar' }: { user: User; active: boolean; className?: string }) {
    const name = nameOf(user, active);
    const image = avatarUrl(user);
    return (
        <span className={className}>
            <span>{name.slice(0, 2).toUpperCase()}</span>
            {image ? (
                <img
                    src={image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(event) => (event.currentTarget.hidden = true)}
                />
            ) : null}
        </span>
    );
}
function LevelValue({ value }: { value: unknown }) {
    return (
        <span className="level-badge">
            <Star size={12} fill="currentColor" aria-hidden="true" />
            {number(value)}
        </span>
    );
}
type ClanSummary = { _id?: string; id?: string; name: string; membersLength: number };
function ClanSummaryCell({ clan, id, href }: { clan?: ClanSummary; id: string; href: string }) {
    if (!id) return <span className="muted">No clan</span>;
    const members = Number.isFinite(clan?.membersLength) ? Math.min(50, Math.max(0, clan!.membersLength)) : 0;
    return (
        <Link className="clan-summary-cell" to={href} title={clan ? `${clan.name} · ${members}/50 members` : id}>
            <strong>{clan?.name ?? 'Unknown clan'}</strong>
            <span className="clan-summary-progress">
                {clan ? (
                    <span className="clan-summary-meter" aria-label={`${members} of 50 members`}>
                        <i style={{ width: `${(members / 50) * 100}%` }} />
                    </span>
                ) : null}
                <span className="clan-summary-count">{clan ? `${members}/50` : id}</span>
            </span>
        </Link>
    );
}

export function UsersDirectory({ mode }: { mode: Mode }) {
    const active = mode === 'active-users';
    const mod = mode === 'sigmod-users';
    const [params, setParams] = useSearchParams();
    const signature = params.toString();
    const [search, setSearch] = useState(params.get('q') ?? '');
    const [searchField, setSearchField] = useState(params.get('searchField') ?? '');
    const [rules, setRules] = useState<Rule[]>(() => readRules(params.get('filters')));
    const [expanded, setExpanded] = useState(rules.length > 0);
    useEffect(() => {
        const current = new URLSearchParams(signature);
        setSearch(current.get('q') ?? '');
        setSearchField(current.get('searchField') ?? '');
        setRules(readRules(current.get('filters')));
    }, [signature]);
    useEffect(() => {
        const timeout = window.setTimeout(() => {
            const current = new URLSearchParams(signature);
            const next = new URLSearchParams(current);
            const trimmedSearch = search.trim();
            const trimmedSearchField = searchField.trim();
            if (trimmedSearch) next.set('q', trimmedSearch);
            else next.delete('q');
            if (trimmedSearchField) next.set('searchField', trimmedSearchField);
            else next.delete('searchField');
            const activeRules = rules.filter(isCompleteRule);
            if (activeRules.length) next.set('filters', JSON.stringify(activeRules));
            else next.delete('filters');
            const queryChanged = ['q', 'searchField', 'filters'].some((key) => next.get(key) !== current.get(key));
            if (queryChanged) {
                next.delete('page');
                next.delete('cursor');
                next.delete('cursors');
                setParams(next, { replace: true });
            }
        }, 100);
        return () => window.clearTimeout(timeout);
    }, [search, searchField, rules, signature, setParams]);
    const limit = [10, 25, 50, 100].includes(Number(params.get('limit'))) ? Number(params.get('limit')) : 25;
    const request = new URLSearchParams(params);
    request.delete('cursors');
    request.set('limit', String(limit));
    const requestedPage = Math.max(1, Number(params.get('page')) || 1);
    if (!active) {
        request.delete('cursor');
        request.set('page', String(requestedPage));
    }
    const query = useQuery({
        queryKey: [mode, request.toString()],
        queryFn: ({ signal }) => api.get<UserPage>(`/${mode}?${request}`, signal),
        refetchInterval: active ? 10_000 : false,
        placeholderData: active ? undefined : keepPreviousData,
    });
    const data = active && query.error ? undefined : query.data;
    const catalog = useQuery({
        queryKey: [mode, 'fields'],
        queryFn: ({ signal }) => api.get<{ fields: FieldInfo[] }>(`/${mode}/fields`, signal),
        enabled: !active,
        staleTime: 60_000,
    });
    const fields = selectableFields(active ? (data?.fields ?? []) : (catalog.data?.fields ?? []));
    const clans = useQuery({
        queryKey: ['sigmally-catalog', 'clans'],
        queryFn: async ({ signal }) => {
            const response = await api.get<ClanSummary[] | { status?: string; data?: ClanSummary[] }>('/sigmally-catalog/clans', signal);
            return Array.isArray(response) ? response : (response.data ?? []);
        },
        enabled: !active && !mod,
        staleTime: 30 * 60_000,
        gcTime: 60 * 60_000,
    });
    const clansById = new Map((clans.data ?? []).map((clan) => [clan._id ?? clan.id ?? '', clan]));
    const stack = (params.get('cursors') ?? '').split(',').filter(Boolean);
    const pageNumber = active ? stack.length + 1 : (data?.page ?? requestedPage);
    const totalPages = data?.totalPages ?? 1;
    const visiblePages = Array.from(
        { length: Math.min(totalPages, 5) },
        (_, index) => Math.max(1, Math.min(pageNumber - 2, totalPages - 4)) + index
    );
    const page = (direction: 'next' | 'previous') => {
        if (!active) {
            goToPage(pageNumber + (direction === 'next' ? 1 : -1));
            return;
        }
        const next = new URLSearchParams(params);
        if (direction === 'next' && data?.nextCursor) {
            stack.push(params.get('cursor') || '-');
            next.set('cursor', data.nextCursor);
        } else {
            const previous = stack.pop();
            if (previous && previous !== '-') next.set('cursor', previous);
            else next.delete('cursor');
        }
        if (stack.length) next.set('cursors', stack.join(','));
        else next.delete('cursors');
        setParams(next);
    };
    const goToPage = (targetPage: number) => {
        const next = new URLSearchParams(params);
        if (!active) {
            next.set('page', String(Math.max(1, Math.min(targetPage, totalPages))));
            next.delete('cursor');
            next.delete('cursors');
            setParams(next);
            return;
        }
        if (targetPage <= 1) {
            next.delete('cursor');
            next.delete('cursors');
        } else if (targetPage <= stack.length + 1) {
            const token = stack[targetPage - 1];
            if (token && token !== '-') next.set('cursor', token);
            else next.delete('cursor');
            const previousPages = stack.slice(0, targetPage - 1);
            if (previousPages.length) next.set('cursors', previousPages.join(','));
            else next.delete('cursors');
        }
        setParams(next);
    };
    const pageSizeChanged = (value: number) => {
        const next = new URLSearchParams(params);
        next.set('limit', String(value));
        next.delete('page');
        next.delete('cursor');
        next.delete('cursors');
        setParams(next);
    };
    const updateRule = (index: number, patch: Partial<Rule>) =>
        setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
    return (
        <div className="page-stack">
            <PageHeader
                title={active ? 'Active Users' : mod ? 'SigMod Users' : 'Sigmally Users'}
                actions={
                    <>
                        {active && !query.error && (
                            <span className="live-badge">
                                <i />
                                Live
                            </span>
                        )}
                        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
                            <RefreshCw size={14} />
                            Refresh
                        </Button>
                    </>
                }
            />
            {!active && data && (
                <div className="directory-metrics">
                    <div>
                        <span>Total accounts</span>
                        <strong>{number(data.total)}</strong>
                    </div>
                    <div>
                        <span>Matching accounts</span>
                        <strong>{number(data.matched)}</strong>
                    </div>
                </div>
            )}
            {active && data && (
                <div className="directory-metrics">
                    <div>
                        <span>Connected</span>
                        <strong>{number(data.total)}</strong>
                    </div>
                    <div>
                        <span>Matching</span>
                        <strong>{number(data.matched)}</strong>
                    </div>
                    <div>
                        <span>Updated</span>
                        <strong className="metric-time">{formatStoredDate(data.capturedAt)}</strong>
                    </div>
                    <span className="metric-caption">Live connections</span>
                </div>
            )}
            <section className="section directory-panel">
                <form onSubmit={(event) => event.preventDefault()}>
                    <div className="directory-search">
                        <div className="search-input">
                            <Search size={16} />
                            <Input
                                aria-label="Search users"
                                placeholder="Search users…"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                maxLength={200}
                            />
                        </div>
                        <FieldSelect label="Search field" fields={fields} all value={searchField} onChange={setSearchField} />
                        <Button type="button" variant={expanded ? 'secondary' : 'outline'} onClick={() => setExpanded(!expanded)}>
                            <Filter size={14} />
                            Filters{rules.length > 0 ? <span className="count-badge">{rules.length}</span> : null}
                        </Button>
                    </div>
                    {expanded && (
                        <div className="filter-builder">
                            {rules.map((rule, index) => (
                                <div className="filter-row" key={index}>
                                    <span className="filter-conjunction">{index ? 'AND' : 'WHERE'}</span>
                                    <FieldSelect
                                        label={`Filter ${index + 1} field`}
                                        fields={fields}
                                        value={rule.field}
                                        onChange={(field) => {
                                            const info = fields.find((entry) => entry.path === field);
                                            const type = fieldType(info);
                                            updateRule(index, {
                                                field,
                                                type,
                                                op: ['number', 'boolean', 'date', 'objectId'].includes(type) ? 'eq' : 'contains',
                                                value: type === 'boolean' ? 'true' : rule.value,
                                            });
                                        }}
                                    />
                                    <select
                                        className="native-select"
                                        aria-label={`Filter ${index + 1} operator`}
                                        value={rule.op}
                                        onChange={(event) => updateRule(index, { op: event.target.value })}
                                    >
                                        {operators.map(([value, label]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        className="native-select"
                                        aria-label={`Filter ${index + 1} type`}
                                        value={rule.type}
                                        disabled={['exists', 'missing'].includes(rule.op)}
                                        onChange={(event) =>
                                            updateRule(index, {
                                                type: event.target.value,
                                                op:
                                                    event.target.value === 'null' ||
                                                    (['number', 'boolean', 'date', 'objectId'].includes(event.target.value) &&
                                                        ['contains', 'notContains'].includes(rule.op))
                                                        ? 'eq'
                                                        : rule.op,
                                                value:
                                                    event.target.value === 'boolean'
                                                        ? 'true'
                                                        : event.target.value === 'null'
                                                          ? ''
                                                          : rule.value,
                                            })
                                        }
                                    >
                                        {valueTypes.map((type) => (
                                            <option key={type} value={type}>
                                                {type === 'objectId' ? 'Object ID' : type[0].toUpperCase() + type.slice(1)}
                                            </option>
                                        ))}
                                    </select>
                                    {rule.type === 'boolean' && !['exists', 'missing'].includes(rule.op) ? (
                                        <select
                                            className="native-select"
                                            aria-label={`Filter ${index + 1} value`}
                                            value={rule.value}
                                            onChange={(event) => updateRule(index, { value: event.target.value })}
                                        >
                                            <option value="true">True</option>
                                            <option value="false">False</option>
                                        </select>
                                    ) : (
                                        <Input
                                            aria-label={`Filter ${index + 1} value`}
                                            placeholder={rule.type === 'date' ? '2026-10-22T12:00:00Z' : 'Value'}
                                            value={rule.value}
                                            disabled={['exists', 'missing'].includes(rule.op) || rule.type === 'null'}
                                            type={rule.type === 'number' ? 'number' : 'text'}
                                            step="any"
                                            onChange={(event) => updateRule(index, { value: event.target.value })}
                                        />
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Remove filter ${index + 1}`}
                                        onClick={() => setRules(rules.filter((_, i) => i !== index))}
                                    >
                                        <X size={15} />
                                    </Button>
                                </div>
                            ))}
                            <div className="toolbar">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={rules.length >= 20}
                                    onClick={() => {
                                        const preferred =
                                            ['nick', 'username', 'user.level', 'level']
                                                .map((path) => fields.find((field) => field.path === path))
                                                .find(Boolean) ?? fields[0];
                                        const type = fieldType(preferred);
                                        setRules([
                                            ...rules,
                                            {
                                                ...newRule(),
                                                field: preferred?.path ?? '',
                                                type,
                                                op: ['number', 'boolean', 'date', 'objectId'].includes(type) ? 'eq' : 'contains',
                                                value: type === 'boolean' ? 'true' : '',
                                            },
                                        ]);
                                    }}
                                >
                                    <Plus size={14} />
                                    Add filter
                                </Button>
                                {rules.length > 0 && <span className="muted">Match all {rules.length} filters</span>}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setSearch('');
                                        setSearchField('');
                                        setRules([]);
                                        const next = new URLSearchParams(params);
                                        next.delete('q');
                                        next.delete('searchField');
                                        next.delete('filters');
                                        next.delete('cursor');
                                        next.delete('cursors');
                                        setParams(next, { replace: true });
                                    }}
                                >
                                    Clear
                                </Button>
                            </div>
                        </div>
                    )}
                </form>
                {!active && catalog.error && (
                    <p role="status" className="field-error">
                        Fields unavailable. <button onClick={() => void catalog.refetch()}>Retry</button>
                    </p>
                )}
                <QueryState isPending={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
                    {data &&
                        (data.items.length ? (
                            <div className="table-wrap directory-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            {active ? (
                                                <>
                                                    <th>Account</th>
                                                    <th>Server / Party</th>
                                                    <th>Score</th>
                                                    <th>Ping</th>
                                                    <th>Connected</th>
                                                </>
                                            ) : mod ? (
                                                <>
                                                    <th>Role</th>
                                                    <th>Badges</th>
                                                    <th>Status</th>
                                                    <th>Last online</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th>Level</th>
                                                    <th>Clan</th>
                                                    <th>Gold</th>
                                                    <th>Subscription</th>
                                                </>
                                            )}
                                            <th>
                                                <span className="sr-only">View</span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.items.map((user) => {
                                            const name = nameOf(user, active);
                                            const id = String(active ? user.sid : user._id);
                                            const href = `/${mode}/${encodeURIComponent(id)}${signature ? `?${signature}` : ''}`;
                                            const clanId = typeof user.clan === 'string' ? user.clan : '';
                                            const subscription =
                                                (typeof user.subscription === 'number' && user.subscription > 100_000_000_000) ||
                                                (typeof user.subscription === 'string' && /^\d{11,}$/.test(user.subscription))
                                                    ? formatStoredDate(user.subscription)
                                                    : user.subscription
                                                      ? text(user.subscription)
                                                      : 'None';
                                            return (
                                                <tr key={id}>
                                                    <td>
                                                        <Link className="user-cell" to={href}>
                                                            <UserAvatar user={user} active={active} />
                                                            <span>
                                                                <strong>{name}</strong>
                                                                <small>
                                                                    {active ? (
                                                                        <>
                                                                            <span
                                                                                className={`status-dot ${user.isAlive ? 'is-playing' : ''}`}
                                                                            />
                                                                            {user.isAlive ? 'Playing' : 'Connected'}
                                                                        </>
                                                                    ) : mod ? (
                                                                        <>
                                                                            {text(user.role)}
                                                                            {user.email ? ` · ${String(user.email)}` : ''}
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            {text(user.email)}
                                                                            {user.nick && user.nick !== name
                                                                                ? ` · ${String(user.nick)}`
                                                                                : ''}
                                                                        </>
                                                                    )}
                                                                </small>
                                                            </span>
                                                        </Link>
                                                    </td>
                                                    {active ? (
                                                        <>
                                                            <td>{text(object(user.modUser).username)}</td>
                                                            <td>
                                                                <span>{text(user.server)}</span>
                                                                {user.tag ? (
                                                                    <small className="table-secondary">{String(user.tag)}</small>
                                                                ) : null}
                                                            </td>
                                                            <td className="numeric">{number(user.score)}</td>
                                                            <td className="numeric">{user.ping == null ? '—' : `${user.ping} ms`}</td>
                                                            <td>{formatStoredDate(user.connectedAt)}</td>
                                                        </>
                                                    ) : mod ? (
                                                        <>
                                                            <td>{text(user.role)}</td>
                                                            <td>
                                                                {Array.isArray(user.badges) && user.badges.length
                                                                    ? user.badges.map(String).join(', ')
                                                                    : '—'}
                                                            </td>
                                                            <td>{user.online == null ? '—' : user.online ? 'Online' : 'Offline'}</td>
                                                            <td>{formatStoredDate(user.lastOnline)}</td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td>
                                                                <LevelValue value={user.level} />
                                                            </td>
                                                            <td>
                                                                <ClanSummaryCell clan={clansById.get(clanId)} id={clanId} href={href} />
                                                            </td>
                                                            <td className="numeric">{user.gold == null ? '—' : number(user.gold)}</td>
                                                            <td>{subscription}</td>
                                                        </>
                                                    )}
                                                    <td>
                                                        <Link to={href} aria-label={`View ${name}`} className="row-arrow">
                                                            <ArrowRight size={16} />
                                                        </Link>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState title={active ? 'No active connections' : 'No users found'} />
                        ))}
                </QueryState>
                <div className="directory-pagination">
                    <span>
                        {!active ? 'Showing ' : ''}
                        {data?.items.length ? `${(pageNumber - 1) * limit + 1}–${(pageNumber - 1) * limit + data.items.length}` : '0'}
                        {!active
                            ? ` of ${number(data?.matched)} matching accounts · Page ${pageNumber} of ${totalPages}`
                            : ` · Page ${pageNumber} · ${data?.items.length ?? 0} entries`}
                        {active && data ? ` · ${data.matched} matching connections` : ''}
                    </span>
                    <div className="toolbar">
                        <select
                            className="native-select page-size-select"
                            aria-label="Entries per page"
                            value={limit}
                            onChange={(event) => pageSizeChanged(Number(event.target.value))}
                        >
                            {[10, 25, 50, 100].map((size) => (
                                <option key={size} value={size}>
                                    {size} per page
                                </option>
                            ))}
                        </select>
                        {!active && (
                            <Button variant="outline" size="sm" disabled={pageNumber <= 1 || query.isFetching} onClick={() => goToPage(1)}>
                                First
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={(active ? !stack.length : pageNumber <= 1) || query.isFetching}
                            onClick={() => page('previous')}
                        >
                            <ArrowLeft size={14} />
                            Previous
                        </Button>
                        <div className="page-number-list" aria-label={active ? 'Visited pages' : 'Pages'}>
                            {(active ? pageNumber > 5 : visiblePages[0] > 1) ? (
                                <Button variant="ghost" size="sm" onClick={() => goToPage(1)} disabled={query.isFetching}>
                                    1…
                                </Button>
                            ) : null}
                            {(active
                                ? Array.from({ length: Math.min(pageNumber, 5) }, (_, index) => Math.max(1, pageNumber - 4) + index)
                                : visiblePages
                            ).map((pageIndex) => (
                                <Button
                                    key={pageIndex}
                                    variant={pageIndex === pageNumber ? 'secondary' : 'ghost'}
                                    size="sm"
                                    aria-current={pageIndex === pageNumber ? 'page' : undefined}
                                    onClick={() => goToPage(pageIndex)}
                                    disabled={query.isFetching}
                                >
                                    {pageIndex}
                                </Button>
                            ))}
                            {!active && visiblePages.at(-1)! < totalPages && (
                                <Button variant="ghost" size="sm" onClick={() => goToPage(totalPages)} disabled={query.isFetching}>
                                    …{totalPages}
                                </Button>
                            )}
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            disabled={(active ? !data?.nextCursor : pageNumber >= totalPages) || query.isFetching}
                            onClick={() => page('next')}
                        >
                            Next
                            <ArrowRight size={14} />
                        </Button>
                        {!active && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={pageNumber >= totalPages || query.isFetching}
                                onClick={() => goToPage(totalPages)}
                            >
                                Last
                            </Button>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}

function dataSearch(value: unknown, path = ''): string {
    return value && typeof value === 'object'
        ? `${path} ` +
              Object.entries(value)
                  .map(([key, entry]) => dataSearch(entry, path ? `${path}.${key}` : key))
                  .join(' ')
        : `${path} ${String(value ?? 'null')}`.toLowerCase();
}
function isDateValue(field: string, value: unknown): boolean {
    const leaf = field.split('.').at(-1) ?? '';
    return (
        /(?:date|time|auth|online|created|updated|connected|pong|message)$/i.test(leaf) ||
        value instanceof Date ||
        (typeof value === 'number' && Math.abs(value) >= 100_000_000_000) ||
        (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))
    );
}
function ipValues(field: string, value: unknown): string[] {
    const leaf =
        field
            .split('.')
            .at(-1)
            ?.replace(/[^a-z]/gi, '')
            .toLowerCase() ?? '';
    if (!['ip', 'ipaddress', 'clientip', 'remoteip', 'forwardedfor', 'xforwardedfor'].includes(leaf) || typeof value !== 'string')
        return [];
    return [
        ...new Set(
            value
                .split(/[\s,;]+/)
                .map((ip) => ip.trim())
                .filter((ip) => ip.length > 0 && ip.length <= 45)
        ),
    ];
}

function countryFlag(location: User): string {
    const supplied = object(location.flag).emoji;
    if (typeof supplied === 'string' && supplied) return supplied;
    const code = String(location.country_code ?? location.country ?? '').toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((letter) => letter.codePointAt(0)! + 127397)) : '🌐';
}

function IpGeolocation({ ip }: { ip: string }) {
    const query = useQuery({
        queryKey: ['ip-geolocation', ip],
        staleTime: 24 * 60 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        queryFn: ({ signal }) =>
            api.get<{ ip: string; location: User | null; reason?: string }>(`/ip-geolocation?ip=${encodeURIComponent(ip)}`, signal),
    });
    const location = query.data?.location;
    if (query.isPending) return <span className="ip-geo-state">Looking up location…</span>;
    if (query.error) return <span className="ip-geo-state">Location lookup unavailable</span>;
    if (!location) return <span className="ip-geo-state">Private or reserved IP</span>;
    const cityRegion = [location.city, location.region]
        .filter((part): part is string => typeof part === 'string' && part.length > 0)
        .join(', ');
    return (
        <div className="ip-geo-result">
            <div className="ip-geo-heading">
                <span className="ip-geo-flag" role="img" aria-label={`${String(location.country ?? 'Unknown country')} flag`}>
                    {countryFlag(location)}
                </span>
                <strong>{String(location.country ?? location.country_name ?? location.country_code ?? 'Unknown country')}</strong>
                {cityRegion && <span>{cityRegion}</span>}
            </div>
            <details className="ip-geo-data" open>
                <summary>Geolocation data</summary>
                <DataTree value={location} path={`geolocation.${ip}`} lookupIps={false} expandAll />
            </details>
        </div>
    );
}

function DataTree({
    value,
    path = '',
    search = '',
    sigmallyProfile = false,
    lookupIps = true,
    expandAll = false,
}: {
    value: User;
    path?: string;
    search?: string;
    sigmallyProfile?: boolean;
    lookupIps?: boolean;
    expandAll?: boolean;
}) {
    return (
        <dl className="data-tree">
            {Object.entries(value)
                .filter(([key]) => !(sigmallyProfile && !path && (key === 'clan' || key === 'skins' || key === 'lastSkinUsed')))
                .filter(([key, value]) => !search || dataSearch(value, path ? `${path}.${key}` : key).includes(search.toLowerCase()))
                .map(([key, value]) => {
                    const field = path ? `${path}.${key}` : key;
                    return (
                        <div className="data-tree-row" key={key}>
                            <dt title={field}>{key}</dt>
                            <dd>
                                {value && typeof value === 'object' ? (
                                    <details open={expandAll || Boolean(search) || undefined}>
                                        <summary>
                                            <span className="type-badge">
                                                {Array.isArray(value) ? `${value.length} items` : `${Object.keys(value).length} fields`}
                                            </span>
                                        </summary>
                                        <DataTree
                                            value={value as User}
                                            path={field}
                                            search={search && !field.toLowerCase().includes(search.toLowerCase()) ? search : ''}
                                            lookupIps={lookupIps}
                                            expandAll={expandAll}
                                        />
                                    </details>
                                ) : (
                                    <span className={typeof value === 'number' ? 'numeric' : value === null ? 'muted' : ''}>
                                        {value === null ? (
                                            'null'
                                        ) : typeof value === 'boolean' ? (
                                            <span className={`value-badge ${value ? 'is-true' : ''}`}>{String(value)}</span>
                                        ) : isDateValue(field, value) ? (
                                            formatStoredDate(value)
                                        ) : (
                                            String(value ?? '—')
                                        )}
                                    </span>
                                )}
                                {lookupIps && ipValues(field, value).map((ip) => <IpGeolocation key={ip} ip={ip} />)}
                            </dd>
                        </div>
                    );
                })}
            {sigmallyProfile && !path && (
                <>
                    <div className="data-tree-row sigmally-profile-row" key="clan">
                        <dt>clan</dt>
                        <dd>
                            <SigmallyClanField user={value} />
                        </dd>
                    </div>
                    <div className="data-tree-row sigmally-profile-row" key="skins">
                        <dt>skins</dt>
                        <dd>
                            <SigmallySkinsField user={value} />
                        </dd>
                    </div>
                    <div className="data-tree-row sigmally-profile-row" key="lastSkinUsed">
                        <dt>lastSkinUsed</dt>
                        <dd>
                            <SigmallyLastSkinField user={value} />
                        </dd>
                    </div>
                </>
            )}
        </dl>
    );
}

export function UserDetail({ mode }: { mode: Mode }) {
    const { id = '' } = useParams();
    const [params] = useSearchParams();
    const active = mode === 'active-users';
    const [search, setSearch] = useState('');
    const [copied, setCopied] = useState('');
    const query = useQuery({
        queryKey: [mode, 'detail', id],
        queryFn: ({ signal }) => api.get<{ user: User; capturedAt?: string }>(`/${mode}/${encodeURIComponent(id)}`, signal),
        refetchInterval: active ? 10_000 : false,
        retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
    });
    const user = query.error && active ? undefined : query.data?.user;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(user, null, 2));
            setCopied('Copied');
        } catch {
            setCopied('Copy failed');
        }
    };
    return (
        <div className="page-stack">
            <Link to={`/${mode}${params.size ? `?${params}` : ''}`} className="back-link">
                <ArrowLeft size={14} />
                {active ? 'Active Users' : 'Sigmally Users'}
            </Link>
            <PageHeader
                title={user ? nameOf(user, active) : active ? 'Connection' : 'User'}
                actions={
                    <>
                        <Button variant="outline" disabled={!user} onClick={() => void copy()}>
                            <Copy size={14} />
                            {copied || 'Copy JSON'}
                        </Button>
                        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
                            <RefreshCw size={14} />
                            Refresh
                        </Button>
                    </>
                }
            />
            <QueryState isPending={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
                {user && (
                    <>
                        <div className="profile-strip">
                            <UserAvatar user={user} active={active} className="profile-avatar" />
                            <div>
                                <strong>{text(active ? user.sid : user._id)}</strong>
                                <span>
                                    {active ? (
                                        <span className="live-badge">
                                            <i />
                                            Connected
                                        </span>
                                    ) : (
                                        text(user.email)
                                    )}
                                </span>
                            </div>
                            <div className="profile-meta">
                                {active ? text(user.server) : `Level ${text(user.level)}`}
                                <small>
                                    {active ? text(user.clientVersion) : `Last authentication · ${formatStoredDate(user.lastAuth)}`}
                                </small>
                            </div>
                        </div>
                        <div className="search-input detail-search">
                            <Search size={16} />
                            <Input
                                aria-label="Search user data"
                                placeholder="Search fields and values…"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </div>
                        <section className="section">
                            <DataTree value={user} search={search} sigmallyProfile={mode === 'sigmally-users'} />
                            {search && mode !== 'sigmally-users' && !dataSearch(user).includes(search.toLowerCase()) && (
                                <EmptyState title="No matching fields" />
                            )}
                        </section>
                    </>
                )}
            </QueryState>
        </div>
    );
}
