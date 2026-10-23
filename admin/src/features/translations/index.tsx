import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { useEditor } from '@/hooks/use-editor';
import { useConfirm } from '@/components/confirm-action';
import { Field, PageHeader, QueryState, SaveMessage } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type LocaleRow = { locale: string; revision: number };
type LocalePack = {
    locale: string;
    messages: Record<string, string>;
    revision: number;
    missingKeys: string[];
    baseMessages?: Record<string, string>;
    overrides?: Record<string, string>;
    sourceKeys?: string[];
};
type TranslationWriteResult = { id: string; revision: number; messages: Record<string, string>; missingKeys: string[] };
type Draft = { revision: number; overrides: Record<string, string> };
type Filter = 'all' | 'missing' | 'edited';

const placeholders = (value: string) => [...value.matchAll(/\{[^{}]+\}/g)].map((match) => match[0]).sort();
const placeholderCounts = (value: string) =>
    placeholders(value).reduce<Record<string, number>>((counts, token) => {
        counts[token] = (counts[token] ?? 0) + 1;
        return counts;
    }, {});
const sameCounts = (left: string, right: string) => JSON.stringify(placeholderCounts(left)) === JSON.stringify(placeholderCounts(right));
const isValidOverride = (key: string, value: string) => value.length <= 4000 && !/<\/?[a-z][^>]*>/i.test(value) && sameCounts(key, value);

export function TranslationsPage() {
    const queryClient = useQueryClient();
    const locales = useQuery({ queryKey: ['translations'], queryFn: ({ signal }) => api.get<LocaleRow[]>('/translations', signal) });
    const [locale, setLocale] = useState('');
    const selected = locale || locales.data?.[0]?.locale || '';
    const pack = useQuery({
        queryKey: ['translations', selected],
        enabled: !!selected,
        queryFn: ({ signal }) => api.get<LocalePack>(`/translations/${encodeURIComponent(selected)}`, signal),
    });
    const english = useQuery({
        queryKey: ['translations', 'en', 'source'],
        enabled: !!selected && selected !== 'en',
        queryFn: ({ signal }) => api.get<LocalePack>('/translations/en', signal),
    });
    const confirm = useConfirm();
    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [saveError, setSaveError] = useState<unknown>();
    const [savedMessage, setSavedMessage] = useState(false);
    const [showLatest, setShowLatest] = useState(false);
    const [latest, setLatest] = useState<LocalePack>();
    const [reconciliationRequired, setReconciliationRequired] = useState(false);
    const [checkError, setCheckError] = useState<unknown>();
    const initial: Draft | undefined = pack.data?.overrides ? { revision: pack.data.revision, overrides: pack.data.overrides } : undefined;
    const editor = useEditor<Draft>(initial);
    const draft = editor.draft;
    const keys = pack.data?.sourceKeys;
    const supported = !!pack.data?.baseMessages && !!pack.data?.overrides && Array.isArray(keys);
    const invalidOverrides = Object.entries(draft?.overrides ?? {}).filter(([key, value]) => !isValidOverride(key, value));

    const mutation = useMutation({
        mutationFn: (value: Draft) =>
            api.put<TranslationWriteResult>(`/translations/${encodeURIComponent(selected)}`, {
                expectedRevision: value.revision,
                messages: value.overrides,
            }),
        onSuccess: (result) => {
            editor.accept({ revision: result.revision, overrides: result.messages });
            setSaveError(undefined);
            setSavedMessage(true);
            setShowLatest(false);
            setLatest(undefined);
            setReconciliationRequired(false);
            setCheckError(undefined);
            void queryClient.invalidateQueries({ queryKey: ['translations'] });
            void queryClient.invalidateQueries({ queryKey: ['translations', selected] });
        },
        onError: async (error: unknown) => {
            setSaveError(error);
            setSavedMessage(false);
            if (error instanceof ApiError && (error.status === 409 || error.uncertain)) {
                setReconciliationRequired(true);
                setCheckError(undefined);
                try {
                    const current = await queryClient.fetchQuery({
                        queryKey: ['translations', selected],
                        queryFn: () => api.get<LocalePack>(`/translations/${encodeURIComponent(selected)}`),
                        staleTime: 0,
                    });
                    setLatest(current);
                    setShowLatest(true);
                } catch (readError) {
                    setCheckError(readError);
                    setLatest(undefined);
                    setShowLatest(false);
                }
            }
        },
    });

    const baseMessages = pack.data?.baseMessages ?? {};
    const sourceMessages = selected === 'en' ? baseMessages : (english.data?.messages ?? {});
    const rows = useMemo(
        () =>
            (keys ?? []).filter((key) => {
                const query = search.trim().toLowerCase();
                const isEdited = Object.hasOwn(draft?.overrides ?? {}, key);
                const missing = selected !== 'en' && !isEdited && (pack.data?.missingKeys.includes(key) ?? false);
                return (
                    (!query || key.toLowerCase().includes(query) || (sourceMessages[key] ?? '').toLowerCase().includes(query)) &&
                    (filter === 'all' || (filter === 'edited' ? isEdited : missing))
                );
            }),
        [keys, search, filter, draft, baseMessages, sourceMessages, selected, pack.data?.missingKeys]
    );
    const pageSize = 50;
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const visibleRows = rows.slice(Math.min(page, pageCount - 1) * pageSize, (Math.min(page, pageCount - 1) + 1) * pageSize);

    const update = (key: string, value: string) =>
        editor.setDraft((current) => (current ? { ...current, overrides: { ...current.overrides, [key]: value } } : current));
    const reset = (key: string) =>
        editor.setDraft((current) => {
            if (!current) return current;
            const overrides = { ...current.overrides };
            delete overrides[key];
            return { ...current, overrides };
        });
    const changeLocale = async (next: string) => {
        if (next === selected || mutation.isPending) return;
        if (
            editor.dirty &&
            !(await confirm({
                title: 'Discard unsaved translation changes?',
                description: 'Switching locales will discard this locale’s unsaved draft.',
                confirmLabel: 'Discard changes',
                destructive: true,
            }))
        )
            return;
        editor.accept({ revision: 0, overrides: {} });
        setSavedMessage(false);
        setSaveError(undefined);
        setShowLatest(false);
        setLatest(undefined);
        setPage(0);
        setLocale(next);
    };
    const reconcile = (keepDraft: boolean) => {
        if (!latest?.overrides) return;
        if (keepDraft) editor.setDraft((current) => (current ? { revision: latest.revision, overrides: current.overrides } : current));
        else editor.accept({ revision: latest.revision, overrides: latest.overrides });
        setShowLatest(false);
        setSaveError(undefined);
        setReconciliationRequired(false);
        setCheckError(undefined);
    };
    const checkLatest = async () => {
        setCheckError(undefined);
        try {
            const current = await queryClient.fetchQuery({
                queryKey: ['translations', selected],
                queryFn: () => api.get<LocalePack>(`/translations/${encodeURIComponent(selected)}`),
                staleTime: 0,
            });
            setLatest(current);
            setShowLatest(true);
        } catch (error) {
            setCheckError(error);
        }
    };
    const save = () => {
        if (draft && supported && !invalidOverrides.length && !reconciliationRequired && editor.dirty && !mutation.isPending) {
            setSavedMessage(false);
            setSaveError(undefined);
            mutation.mutate(draft);
        }
    };

    return (
        <div className="page-stack">
            <PageHeader
                title="Translations"
                actions={
                    <Button
                        onClick={save}
                        disabled={
                            !supported || !editor.dirty || invalidOverrides.length > 0 || reconciliationRequired || mutation.isPending
                        }
                    >
                        Save translations
                    </Button>
                }
            />
            <QueryState isPending={locales.isPending} error={locales.error} onRetry={() => void locales.refetch()}>
                {locales.data && (
                    <>
                        {!locales.data.length ? (
                            <div className="section">No supported locales are available.</div>
                        ) : (
                            <>
                                <Field label="Locale" htmlFor="translation-locale">
                                    <select
                                        id="translation-locale"
                                        className="native-select"
                                        value={selected}
                                        disabled={mutation.isPending}
                                        onChange={(event) => void changeLocale(event.target.value)}
                                    >
                                        {locales.data.map((item) => (
                                            <option key={item.locale} value={item.locale}>
                                                {item.locale} · revision {item.revision}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <QueryState
                                    isPending={pack.isPending || (selected !== 'en' && english.isPending)}
                                    error={pack.error || english.error}
                                    onRetry={() => {
                                        void pack.refetch();
                                        void english.refetch();
                                    }}
                                >
                                    {pack.data && (
                                        <>
                                            {!supported && (
                                                <div className="section" role="alert">
                                                    <p>
                                                        This server response is missing baseMessages, overrides, or sourceKeys. The merged
                                                        locale pack cannot safely distinguish shipped strings from overrides, so editing is
                                                        unavailable.
                                                    </p>
                                                </div>
                                            )}
                                            {supported && (
                                                <>
                                                    <div className="toolbar">
                                                        <Field label="Search source key or English text" htmlFor="translation-search">
                                                            <Input
                                                                id="translation-search"
                                                                value={search}
                                                                onChange={(event) => {
                                                                    setSearch(event.target.value);
                                                                    setPage(0);
                                                                }}
                                                            />
                                                        </Field>
                                                        <Field label="Show" htmlFor="translation-filter">
                                                            <select
                                                                id="translation-filter"
                                                                className="native-select"
                                                                value={filter}
                                                                onChange={(event) => {
                                                                    setFilter(event.target.value as Filter);
                                                                    setPage(0);
                                                                }}
                                                            >
                                                                <option value="all">All</option>
                                                                <option value="missing">Missing</option>
                                                                <option value="edited">Edited</option>
                                                            </select>
                                                        </Field>
                                                    </div>
                                                    {reconciliationRequired && (
                                                        <section className="section" role="alert">
                                                            <h2 className="section-title">Check the current server version</h2>
                                                            <p>
                                                                Your draft is retained and saving is blocked until a fresh read succeeds and
                                                                you choose how to reconcile. No write will be retried automatically.
                                                            </p>
                                                            {checkError !== undefined && (
                                                                <>
                                                                    <p>
                                                                        {checkError instanceof Error
                                                                            ? checkError.message
                                                                            : 'The latest version could not be loaded.'}
                                                                    </p>
                                                                    <Button variant="outline" onClick={() => void checkLatest()}>
                                                                        Try checking again
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </section>
                                                    )}
                                                    {showLatest && latest && (
                                                        <section className="section" role="alert">
                                                            <h2 className="section-title">Compare before reconciling</h2>
                                                            <p>
                                                                Your draft is retained. Review the latest version before choosing how to
                                                                reconcile it.
                                                            </p>
                                                            <p>Latest revision: {latest.revision}</p>
                                                            {latest.overrides && (
                                                                <div className="table-wrap">
                                                                    <table>
                                                                        <thead>
                                                                            <tr>
                                                                                <th scope="col">Key</th>
                                                                                <th scope="col">Latest override</th>
                                                                                <th scope="col">Your draft override</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {(keys ?? []).map((key) => (
                                                                                <tr key={key}>
                                                                                    <th scope="row">{key}</th>
                                                                                    <td>
                                                                                        {latest.overrides?.[key] ?? '(shipped fallback)'}
                                                                                    </td>
                                                                                    <td>{draft?.overrides[key] ?? '(shipped fallback)'}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                            {!latest.overrides && (
                                                                <p role="alert">
                                                                    The latest response does not include overrides, so it cannot be
                                                                    reconciled safely.
                                                                </p>
                                                            )}
                                                            {latest.overrides && (
                                                                <div className="toolbar">
                                                                    <Button variant="outline" onClick={() => reconcile(false)}>
                                                                        Load latest version
                                                                    </Button>
                                                                    <Button variant="outline" onClick={() => reconcile(true)}>
                                                                        Keep my draft and use latest revision
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </section>
                                                    )}
                                                    <QueryState isPending={false} error={undefined}>
                                                        {rows.length === 0 ? (
                                                            <p className="muted">No rows match this filter.</p>
                                                        ) : (
                                                            <>
                                                                <div className="table-wrap">
                                                                    <table>
                                                                        <thead>
                                                                            <tr>
                                                                                <th scope="col">Source text</th>
                                                                                <th scope="col">Translation</th>
                                                                                <th scope="col">State</th>
                                                                                <th scope="col">Action</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {visibleRows.map((key) => {
                                                                                const source = sourceMessages[key] ?? key;
                                                                                const hasOverride = Object.hasOwn(
                                                                                    draft?.overrides ?? {},
                                                                                    key
                                                                                );
                                                                                const value =
                                                                                    draft?.overrides[key] ?? baseMessages[key] ?? source;
                                                                                const valid = isValidOverride(key, value);
                                                                                return (
                                                                                    <tr key={key}>
                                                                                        <th scope="row">
                                                                                            {source}
                                                                                            {source !== key && (
                                                                                                <small className="muted">{key}</small>
                                                                                            )}
                                                                                        </th>
                                                                                        <td>
                                                                                            <Textarea
                                                                                                disabled={mutation.isPending}
                                                                                                aria-label={`Translation for ${key}`}
                                                                                                rows={2}
                                                                                                maxLength={4000}
                                                                                                value={value}
                                                                                                onChange={(event) =>
                                                                                                    update(key, event.target.value)
                                                                                                }
                                                                                            />
                                                                                        </td>
                                                                                        <td>
                                                                                            {hasOverride
                                                                                                ? 'Custom override'
                                                                                                : 'Shipped fallback'}
                                                                                            {!valid && (
                                                                                                <p className="field-error">
                                                                                                    Use plain text up to 4,000 characters
                                                                                                    and preserve placeholder counts from the
                                                                                                    source key.
                                                                                                </p>
                                                                                            )}
                                                                                        </td>
                                                                                        <td>
                                                                                            <Button
                                                                                                variant="outline"
                                                                                                size="sm"
                                                                                                onClick={() => reset(key)}
                                                                                                disabled={
                                                                                                    !hasOverride || mutation.isPending
                                                                                                }
                                                                                            >
                                                                                                Reset
                                                                                            </Button>
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                                <div className="toolbar" aria-label="Translation pages">
                                                                    <span className="muted">
                                                                        {rows.length
                                                                            ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, rows.length)} of ${rows.length}`
                                                                            : '0 rows'}
                                                                    </span>
                                                                    <Button
                                                                        variant="outline"
                                                                        onClick={() => setPage((current) => Math.max(0, current - 1))}
                                                                        disabled={page <= 0}
                                                                    >
                                                                        Previous
                                                                    </Button>
                                                                    <Button
                                                                        variant="outline"
                                                                        onClick={() =>
                                                                            setPage((current) => Math.min(pageCount - 1, current + 1))
                                                                        }
                                                                        disabled={page >= pageCount - 1}
                                                                    >
                                                                        Next
                                                                    </Button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </QueryState>
                                                    {invalidOverrides.length > 0 && (
                                                        <p className="field-error" role="alert">
                                                            {invalidOverrides.length} saved override
                                                            {invalidOverrides.length === 1 ? '' : 's'} need correction before saving. This
                                                            includes rows outside the current filter.
                                                        </p>
                                                    )}
                                                    <div className="toolbar">
                                                        <Button
                                                            onClick={save}
                                                            disabled={
                                                                !editor.dirty ||
                                                                invalidOverrides.length > 0 ||
                                                                reconciliationRequired ||
                                                                mutation.isPending
                                                            }
                                                        >
                                                            Save translations
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => {
                                                                editor.reset();
                                                                setSavedMessage(false);
                                                                setSaveError(undefined);
                                                            }}
                                                            disabled={!editor.dirty || mutation.isPending}
                                                        >
                                                            Discard changes
                                                        </Button>
                                                    </div>
                                                    <SaveMessage error={saveError} saved={savedMessage} />
                                                </>
                                            )}
                                        </>
                                    )}
                                </QueryState>
                            </>
                        )}
                    </>
                )}
            </QueryState>
        </div>
    );
}
