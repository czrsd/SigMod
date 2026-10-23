import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { EmptyState, Field, PageHeader, QueryState } from '@/components/page';
import settingsUsageSchema from '../../../../server/src/config/settingsUsageSchema.json';

type UsageSummary = {
    denominator: 'installations';
    totalInstallations: number;
    byClientVersion: Array<{ _id: string; installations: number; latestSyncAt: string }>;
    syncAge: Array<{ _id: string; installations: number }>;
};
type UsageField = {
    field: string;
    denominator: 'installations';
    totalInstallations: number;
    defaultInstallations: number;
    customizedInstallations: number;
    missingInstallations: number;
    values: Array<{ value: unknown; installations: number }>;
};
type ContractField = { type: string; default: unknown };
type KeybindAnalytics = {
    days: number;
    reportingInstallationDays: number;
    uses: Array<{ action: string; input: string; binding: string; count: number; installations: number }>;
    changes: Array<{ action: string; from: unknown; to: unknown; count: number; installations: number }>;
    daily: Array<{ date: string; uses: number; changes: number; installations: number }>;
};

const schemaFields = settingsUsageSchema.fields as Record<string, ContractField>;
const categories: Record<string, string> = {
    localization: 'Localization',
    macros: 'Macros',
    game: 'Game display',
    themes: 'Themes',
    settings: 'Settings',
    chat: 'Chat',
    modAccount: 'Mod account',
};

function humanize(path: string): string {
    if (path === 'themes.showPromotions') return 'Themes · Show promotions';
    return path
        .split('.')
        .map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase()))
        .join(' · ');
}
function defaultLabel(value: unknown): string {
    if (value === null) return 'None';
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    if (Array.isArray(value)) return `${value.length} default entries`;
    return String(value);
}
function Bar({ label, count, total }: { label: string; count: number; total: number }) {
    const percent = total ? (count / total) * 100 : 0;
    return (
        <div
            className="data-row"
            style={{ display: 'grid', gridTemplateColumns: 'minmax(9rem, 1fr) minmax(5rem, 3fr) auto', gap: '1rem', alignItems: 'center' }}
        >
            <span>{label}</span>
            <span aria-hidden="true" style={{ height: 8, background: 'var(--border, #303030)', borderRadius: 4, overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${percent}%`, height: '100%', background: 'var(--accent, #c5a46d)' }} />
            </span>
            <strong>
                {formatNumber(count)} ({percent.toFixed(1)}%)
            </strong>
        </div>
    );
}

export function SettingsUsagePage() {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(Object.keys(schemaFields)[0] ?? '');
    const [freshness, setFreshness] = useState('all');
    const [version, setVersion] = useState('all');
    const [keybindDays, setKeybindDays] = useState('30');
    const params = new URLSearchParams();
    if (freshness !== 'all') params.set('activeSince', new Date(Date.now() - Number(freshness) * 24 * 60 * 60 * 1000).toISOString());
    if (version !== 'all') params.set('clientVersion', version);
    const suffix = params.size ? `?${params.toString()}` : '';

    const summary = useQuery({
        queryKey: ['settings-usage', freshness, version],
        queryFn: ({ signal }) => api.get<UsageSummary>(`/settings-usage${suffix}`, signal),
        refetchInterval: 15_000,
    });
    const field = useQuery({
        queryKey: ['settings-usage-field', selected, freshness, version],
        enabled: Boolean(selected),
        queryFn: ({ signal }) => api.get<UsageField>(`/settings-usage/fields/${encodeURIComponent(selected)}${suffix}`, signal),
        refetchInterval: 15_000,
    });
    const keybinds = useQuery({
        queryKey: ['settings-usage-keybinds', keybindDays],
        queryFn: ({ signal }) => api.get<KeybindAnalytics>(`/settings-usage/keybinds?days=${keybindDays}`, signal),
        refetchInterval: 15_000,
    });
    const listed = useMemo(
        () =>
            Object.keys(schemaFields).filter(
                (path) =>
                    path.toLowerCase().includes(search.trim().toLowerCase()) ||
                    humanize(path).toLowerCase().includes(search.trim().toLowerCase())
            ),
        [search]
    );
    const grouped = useMemo(() => {
        const groups = new Map<string, string[]>();
        listed.forEach((path) => {
            const key = path.split('.')[0] ?? 'Other';
            groups.set(key, [...(groups.get(key) ?? []), path]);
        });
        return [...groups.entries()];
    }, [listed]);
    const current = schemaFields[selected];
    const data = field.data;
    const distribution =
        current?.type !== 'bindings' && current?.type !== 'strings'
            ? (data?.values ?? []).filter((item) => item.value === null || typeof item.value !== 'object')
            : [];

    return (
        <div className="page-stack">
            <PageHeader title="Settings usage" description={`Data source: ${window.location.host}. Refreshes every 15 seconds.`} />
            {['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) && (
                <p className="muted">Use the DEV userscript to report to this local server. The release userscript reports to mod.czrsd.com.</p>
            )}
            <section className="section" aria-label="Filters">
                <div className="form-grid">
                    <Field label="Snapshot freshness" htmlFor="usage-freshness">
                        <select
                            id="usage-freshness"
                            className="native-select"
                            value={freshness}
                            onChange={(event) => setFreshness(event.target.value)}
                        >
                            <option value="1">Synced within 24 hours</option>
                            <option value="7">Synced within 7 days</option>
                            <option value="30">Synced within 30 days</option>
                            <option value="all">All records</option>
                        </select>
                    </Field>
                    <Field label="Client version" htmlFor="usage-version">
                        <select
                            id="usage-version"
                            className="native-select"
                            value={version}
                            onChange={(event) => setVersion(event.target.value)}
                        >
                            <option value="all">All versions</option>
                            {(summary.data?.byClientVersion ?? []).map((entry) => (
                                <option key={entry._id} value={entry._id}>
                                    {entry._id}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
            </section>
            <QueryState isPending={summary.isPending} error={summary.error} onRetry={() => void summary.refetch()}>
                {summary.data && <p className="muted">{formatNumber(summary.data.totalInstallations)} matching installations</p>}
            </QueryState>
            <section className="section">
                <div className="form-grid">
                    <div>
                        <h2 className="section-title">Keybind use and changes</h2>
                        <p className="muted">Key presses are counted locally and sent in batches. Counts are reported installation activity, not verified players.</p>
                    </div>
                    <Field label="Period" htmlFor="keybind-days">
                        <select id="keybind-days" className="native-select" value={keybindDays} onChange={(event) => setKeybindDays(event.target.value)}>
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="90">Last 90 days</option>
                            <option value="180">Last 180 days</option>
                        </select>
                    </Field>
                </div>
                <QueryState isPending={keybinds.isPending} error={keybinds.error} onRetry={() => void keybinds.refetch()}>
                    {keybinds.data && <>
                        <p className="muted">{formatNumber(keybinds.data.reportingInstallationDays)} installation-days reported</p>
                        <h3 className="section-title">Activations by action and binding</h3>
                        <div style={{ overflowX: 'auto' }}>
                        <div className="data-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(12rem, 2fr) minmax(10rem, 1fr) auto auto', gap: '.75rem', minWidth: 620 }}><strong>Action</strong><strong>Input / binding</strong><strong>Activations</strong><strong>Installations</strong></div>
                        {keybinds.data.uses.map((item) => <div className="data-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(12rem, 2fr) minmax(10rem, 1fr) auto auto', gap: '.75rem', minWidth: 620 }} key={`${item.action}:${item.input}:${item.binding}`}>
                            <span>{humanize(item.action.replace(/^macros\.keys\./, ''))}</span>
                            <span>{item.input} · {item.binding || 'unbound'}</span>
                            <strong>{formatNumber(item.count)}</strong>
                            <span>{formatNumber(item.installations)}</span>
                        </div>)}
                        </div>
                        {!keybinds.data.uses.length && <p className="muted">No keybind activations have been reported for this period.</p>}
                        <h3 className="section-title">Keybind changes</h3>
                        <div style={{ overflowX: 'auto' }}>
                        <div className="data-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(12rem, 2fr) minmax(8rem, 1fr) minmax(8rem, 1fr) auto', gap: '.75rem', minWidth: 620 }}><strong>Action</strong><strong>From</strong><strong>To</strong><strong>Changes</strong></div>
                        {keybinds.data.changes.map((item, index) => <div className="data-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(12rem, 2fr) minmax(8rem, 1fr) minmax(8rem, 1fr) auto', gap: '.75rem', minWidth: 620 }} key={`${item.action}:${index}`}>
                            <span>{humanize(item.action.replace(/^macros\.keys\./, ''))}</span>
                            <span>{JSON.stringify(item.from) ?? '—'}</span>
                            <span>{JSON.stringify(item.to) ?? '—'}</span>
                            <strong>{formatNumber(item.count)} · {formatNumber(item.installations)} installations</strong>
                        </div>)}
                        </div>
                        {!keybinds.data.changes.length && <p className="muted">No keybind changes have been reported for this period.</p>}
                    </>}
                </QueryState>
            </section>
            <div className="settings-layout">
                <section className="section" aria-labelledby="settings-list-heading">
                    <h2 id="settings-list-heading" className="section-title">
                        Settings
                    </h2>
                    <Field label="Search settings" htmlFor="settings-search">
                        <input
                            id="settings-search"
                            className="native-select"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search by name or path"
                        />
                    </Field>
                    <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                        {grouped.map(([category, paths]) => (
                            <div key={category}>
                                <h3 className="section-title">{categories[category] ?? humanize(category)}</h3>
                                {paths.map((path) => (
                                    <button
                                        key={path}
                                        type="button"
                                        aria-pressed={selected === path}
                                        onClick={() => setSelected(path)}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '.55rem .65rem',
                                            border: 0,
                                            borderRadius: 4,
                                            background: selected === path ? 'var(--muted, #222222)' : 'transparent',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <span>{humanize(path)}</span>
                                        <small className="muted" style={{ display: 'block' }}>
                                            {path}
                                        </small>
                                    </button>
                                ))}
                            </div>
                        ))}
                        {!listed.length && <p className="muted">No settings match this search.</p>}
                    </div>
                </section>
                <section className="section" aria-live="polite" aria-labelledby="field-heading">
                    {current && (
                        <>
                            <h2 id="field-heading" className="section-title">
                                {humanize(selected)}
                            </h2>
                            <p className="muted">
                                {selected} · {current.type}
                            </p>
                            <div className="detail-grid">
                                <div className="data-row">
                                    <span>Default</span>
                                    <strong>{defaultLabel(current.default)}</strong>
                                </div>
                                <div className="data-row">
                                    <span>Matching installations</span>
                                    <strong>{data ? formatNumber(data.totalInstallations) : '—'}</strong>
                                </div>
                            </div>
                            <QueryState isPending={field.isPending} error={field.error} onRetry={() => void field.refetch()}>
                                {data && (
                                    <>
                                        <h3 className="section-title">Installation state</h3>
                                        <Bar label="Default" count={data.defaultInstallations} total={data.totalInstallations} />
                                        <Bar label="Customized" count={data.customizedInstallations} total={data.totalInstallations} />
                                        <Bar label="Missing" count={data.missingInstallations} total={data.totalInstallations} />
                                        {distribution.length > 0 && (
                                            <>
                                                <h3 className="section-title">Observed values</h3>
                                                {distribution.map((item, index) => (
                                                    <Bar
                                                        key={`${String(item.value)}-${index}`}
                                                        label={item.value === null ? (selected.startsWith('macros.keys.') ? 'Unbound' : 'None') : String(item.value)}
                                                        count={item.installations}
                                                        total={data.totalInstallations}
                                                    />
                                                ))}
                                            </>
                                        )}
                                        {data.totalInstallations === 0 && (
                                            <EmptyState
                                                title="No collected installations"
                                                description="No snapshots match the selected filters."
                                            />
                                        )}
                                    </>
                                )}
                            </QueryState>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
