import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { formatStoredDate } from '@/lib/format';
import './profile-extras.css';

type DataRecord = Record<string, unknown>;
type CatalogRow = DataRecord & { _id?: string; name?: string };
type CatalogResponse<T> = { status?: string; data?: T } | T;

function record(value: unknown): DataRecord | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as DataRecord) : null;
}

function dataOf<T>(value: CatalogResponse<T>): T {
    const wrapper = record(value);
    return wrapper && 'data' in wrapper ? (wrapper.data as T) : (value as T);
}

function rowsOf(value: unknown): CatalogRow[] {
    return Array.isArray(value) ? value.filter((entry): entry is CatalogRow => record(entry) !== null) : [];
}

function text(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

function display(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

function ownedSkinNames(value: unknown, catalog: CatalogRow[]): string[] {
    const entries = Array.isArray(value) ? value : value == null ? [] : [value];
    const normalizeName = (name: string) => name.toLowerCase().replace(/\.png$/i, '');
    const names = entries.flatMap((entry) => {
        const item = record(entry);
        const stringValue = typeof entry === 'string' ? entry : '';
        const keys = item
            ? [item._id, item.id, item.skinId, item.skin_id, item.skin, item.name, item.skinName].map(text).filter(Boolean)
            : [stringValue].filter(Boolean);
        const match = catalog.find((skin) => {
            const catalogId = text(skin._id ?? skin.id ?? skin.skinId ?? skin.skin_id);
            const catalogName = text(skin.name ?? skin.skinName ?? skin.skin);
            return keys.some((key) => key === catalogId || key === catalogName || normalizeName(key) === normalizeName(catalogName));
        });
        const resolvedName = text(match?.name ?? match?.skinName ?? match?.skin);
        return resolvedName ? [resolvedName] : [];
    });
    return [...new Set(names)].slice(0, 18);
}

function memberName(member: DataRecord): string {
    return text(member.name ?? member.givenName ?? member.username ?? member.nick ?? member.email) || 'Unnamed member';
}

function clanRoleRank(value: unknown): number {
    switch (text(value).trim().toLowerCase()) {
        case 'leader':
            return 0;
        case 'co-leader':
            return 1;
        case 'elder':
            return 2;
        case '':
        case 'member':
            return 3;
        default:
            return 4;
    }
}

function memberValue(value: unknown, field: string): unknown {
    if (value instanceof Date) return formatStoredDate(value);
    if (Array.isArray(value)) return value.map((entry) => memberValue(entry, field));
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, memberValue(entry, key)]));
    if (
        /(?:date|time|auth|online|created|updated|connected|pong|message)$/i.test(field) ||
        (typeof value === 'number' && Math.abs(value) >= 100_000_000_000) ||
        (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))
    )
        return formatStoredDate(value);
    return value;
}

function useClans() {
    return useQuery({
        queryKey: ['sigmally-catalog', 'clans'],
        staleTime: 30 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        queryFn: async ({ signal }) => rowsOf(dataOf(await api.get<CatalogResponse<unknown>>('/sigmally-catalog/clans', signal))),
    });
}

export function SigmallyClanField({ user }: { user: DataRecord }) {
    const clansQuery = useClans();
    const clanValue = text(user.clan);
    const [showMembers, setShowMembers] = useState(false);
    const clan = useMemo(() => {
        if (!clanValue) return undefined;
        return clansQuery.data?.find((item) => item._id === clanValue || item.name === clanValue || item.id === clanValue);
    }, [clanValue, clansQuery.data]);
    const clanId = text(clan?._id ?? clan?.id);
    const clanDetailQuery = useQuery({
        queryKey: ['sigmally-catalog', 'clan', clanId],
        enabled: Boolean(clanId) && showMembers,
        queryFn: async ({ signal }) =>
            dataOf(await api.get<CatalogResponse<unknown>>(`/sigmally-catalog/clans/${encodeURIComponent(clanId)}`, signal)),
    });
    const clanDetail = record(clanDetailQuery.data);
    const members = rowsOf(clanDetail?.members);
    const sortedMembers = [...members].sort((first, second) => clanRoleRank(first.role) - clanRoleRank(second.role));
    const reportedCount = Number(clanDetail?.membersLength ?? clan?.membersLength ?? members.length);
    const memberCount = Number.isFinite(reportedCount) ? Math.max(0, reportedCount) : members.length;

    if (clansQuery.isPending) return <span className="sigmally-extra-muted">Loading clan…</span>;
    if (clansQuery.error) return <span className="sigmally-extra-error">Could not load clan.</span>;
    if (!clanValue) return <span className="sigmally-extra-muted">No clan</span>;
    if (!clan) return <span className="sigmally-extra-muted">Unknown clan · <code>{clanValue}</code></span>;

    return (
        <div className="sigmally-clan-field">
            <div className="sigmally-clan-summary">
                <button
                    className="sigmally-clan-toggle"
                    type="button"
                    aria-expanded={showMembers}
                    onClick={() => setShowMembers((visible) => !visible)}
                >
                    {showMembers ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
                    <strong>{text(clan.name) || text(clanDetail?.name) || 'Clan'}</strong>
                </button>
                <span className="sigmally-clan-count">{Math.min(memberCount, 50)} / 50 members</span>
                <span className="sigmally-member-meter" role="meter" aria-label="Clan size" aria-valuemin={0} aria-valuemax={50} aria-valuenow={Math.min(memberCount, 50)}>
                    <i style={{ width: `${Math.min(memberCount, 50) * 2}%` }} />
                </span>
            </div>
            <code className="sigmally-clan-id">{clanValue}</code>
            {showMembers && (
                <div className="sigmally-clan-members">
                    {clanDetailQuery.isPending ? (
                        <span className="sigmally-extra-muted">Loading members…</span>
                    ) : clanDetailQuery.error ? (
                        <span className="sigmally-extra-error">Could not load clan members.</span>
                    ) : members.length ? (
                        <div className="sigmally-member-table-scroll">
                            <table className="sigmally-member-table">
                                <thead>
                                    <tr>
                                        <th>Image</th>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Level</th>
                                        <th>Role</th>
                                        <th>Subscription</th>
                                        <th>ID</th>
                                        <th>Data</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedMembers.map((member, index) => {
                                        const memberId = text(member._id ?? member.id ?? member.userId);
                                        return (
                                            <tr key={memberId || `${member.email ?? 'member'}-${index}`}>
                                                <td>
                                                    {text(member.imageURL) ? (
                                                        <img className="sigmally-member-avatar" src={text(member.imageURL)} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                                    ) : <span className="sigmally-member-avatar sigmally-member-avatar-fallback" aria-hidden="true">{memberName(member).slice(0, 1).toUpperCase()}</span>}
                                                </td>
                                                <td>{memberName(member)}</td>
                                                <td>{text(member.email) || '—'}</td>
                                                <td><span className="sigmally-member-level"><Star size={12} fill="currentColor" aria-hidden="true" />{text(member.level) || '—'}</span></td>
                                                <td>{text(member.role) || 'Member'}</td>
                                                <td>{text(memberValue(member.subscription, 'subscription')) || '—'}</td>
                                                <td><code>{memberId || '—'}</code></td>
                                                <td>
                                                    <details className="sigmally-member-extra">
                                                        <summary>All data</summary>
                                                        <pre>{display(memberValue(member, ''))}</pre>
                                                    </details>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : <span className="sigmally-extra-muted">No members returned.</span>}
                </div>
            )}
        </div>
    );
}

export function SigmallySkinsField({ user }: { user: DataRecord }) {
    return <SkinCatalogField value={user.skins} emptyLabel="No owned skins" />;
}

export function SigmallyLastSkinField({ user }: { user: DataRecord }) {
    return <SkinCatalogField value={user.lastSkinUsed} emptyLabel="No skin used" />;
}

function SkinCatalogField({ value, emptyLabel }: { value: unknown; emptyLabel: string }) {
    const skinsQuery = useQuery({
        queryKey: ['sigmally-catalog', 'skins'],
        staleTime: 30 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchInterval: 30 * 60 * 1000,
        queryFn: async ({ signal }) => rowsOf(dataOf(await api.get<CatalogResponse<unknown>>('/sigmally-catalog/skins', signal))),
    });
    const skins = ownedSkinNames(value, skinsQuery.data ?? []);

    if (skinsQuery.isPending) return <span className="sigmally-extra-muted">Loading skins…</span>;
    if (skinsQuery.error) return <span className="sigmally-extra-error">Could not load skins.</span>;

    return (
        <div className="sigmally-skins-field">
            {skins.length ? (
                <ul className="sigmally-skin-list">
                    {skins.map((name) => (
                        <SkinEntry key={name} name={name} />
                    ))}
                </ul>
            ) : <span className="sigmally-extra-muted">{emptyLabel}</span>}
            {value != null && (
                <details className="sigmally-skin-source">
                    <summary>Raw data</summary>
                    <pre>{display(value)}</pre>
                </details>
            )}
        </div>
    );
}

function SkinEntry({ name }: { name: string }) {
    const [imageFailed, setImageFailed] = useState(false);
    return (
        <li title={name}>
            {imageFailed ? (
                <span className="sigmally-skin-image-fallback" aria-label={`Image unavailable for ${name}`}>×</span>
            ) : (
                <img
                    src={`/api/v5/admin/sigmally-catalog/skin-images/${encodeURIComponent(name)}`}
                    alt=""
                    loading="eager"
                    onError={() => setImageFailed(true)}
                />
            )}
            <span>{name.replace(/\.png$/i, '')}</span>
        </li>
    );
}
