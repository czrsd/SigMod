import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useEditor } from '@/hooks/use-editor';
import { useConfirm } from '@/components/confirm-action';
import { RichPreview } from '@/components/rich-preview';
import { ContentDiff } from '@/components/content-diff';
import { ImageField } from '@/components/image-field';
import { PageHeader, QueryState, EmptyState, Field, SaveMessage } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CustomDateTimePicker } from '@/components/custom-date-picker';
import { Attachments } from './components/attachments';
import { RichEditor } from './components/rich-editor';
import type { Announcement, Draft } from './types';

const blank: Draft = {
    date: new Date().toISOString(),
    status: 'draft',
    preview: { title: '', description: '', icon: 'https://czrsd.com/static/sigmod/announcements/default.svg', pinned: false },
    full: { title: '', description: '<p></p>', images: [] },
};
function key(item: Announcement): string {
    return item.id || item._id || '';
}
function iso(value: string): string {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}
function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Unknown date';
}

export function AnnouncementEditorPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const qc = useQueryClient();
    const back = `/announcements${params.size ? `?${params}` : ''}`;
    const detail = useQuery({
        queryKey: ['announcements', 'detail', id],
        queryFn: ({ signal }) => api.get<Announcement>(`/announcements/${encodeURIComponent(id!)}`, signal),
        enabled: Boolean(id),
    });
    if (id && !detail.data)
        return (
            <div className="page-stack">
                <PageHeader
                    title="Edit announcement"
                    actions={
                        <Button variant="outline" onClick={() => navigate(back)}>
                            Back to announcements
                        </Button>
                    }
                />
                <QueryState isPending={detail.isPending} error={detail.error} onRetry={() => void detail.refetch()}>
                    {!detail.isPending && !detail.error ? <EmptyState title="Announcement not found" /> : null}
                </QueryState>
            </div>
        );
    const initial = detail.data;
    return (
        <AnnouncementForm
            key={id ?? 'new'}
            id={id}
            initial={initial}
            onDone={(record) => {
                qc.setQueryData(['announcements', 'detail', key(record)], record);
                void qc.invalidateQueries({ queryKey: ['announcements'] });
                navigate(back);
            }}
            back={back}
        />
    );
}

function AnnouncementForm({
    id,
    initial,
    onDone,
    back,
}: {
    id?: string;
    initial?: Announcement;
    onDone: (record: Announcement) => void;
    back: string;
}) {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const baseline = useMemo(
        () => (initial ? toDraft(initial) : id ? undefined : { ...structuredClone(blank), date: new Date().toISOString() }),
        [initial, id]
    );
    const { draft, setDraft, dirty, reset, accept } = useEditor<Draft>(baseline);
    const [error, setError] = useState<unknown>();
    const [saved, setSaved] = useState(false);
    const [latest, setLatest] = useState<Announcement>();
    const [expectedRevision, setExpectedRevision] = useState(initial?.revision ?? 0);
    const [mode, setMode] = useState<'card' | 'article'>('card');
    const mutation = useMutation({
        mutationFn: (body: unknown) =>
            id ? api.patch<Announcement>(`/announcements/${encodeURIComponent(id)}`, body) : api.post<Announcement>('/announcements', body),
        onSuccess: (record) => {
            accept(toDraft(record));
            setExpectedRevision(record.revision);
            setError(undefined);
            setLatest(undefined);
            setSaved(true);
            onDone(record);
        },
        onError: (reason: unknown) => {
            setError(reason);
            setSaved(false);
            if (id && reason instanceof ApiError && reason.status === 409)
                void qc
                    .fetchQuery({
                        queryKey: ['announcements', 'detail', id],
                        queryFn: () => api.get<Announcement>(`/announcements/${encodeURIComponent(id)}`),
                        staleTime: 0,
                    })
                    .then(setLatest)
                    .catch(() => undefined);
        },
    });
    if (!draft) return null;
    const conflict = error instanceof ApiError && error.status === 409;
    const createUncertain = !id && error instanceof ApiError && error.uncertain;
    const valid =
        draft.preview.title.trim() &&
        draft.preview.description.trim() &&
        draft.full.title.trim() &&
        draft.full.description.trim() &&
        draft.preview.title.length <= 160 &&
        draft.preview.description.length <= 500 &&
        draft.full.title.length <= 160 &&
        draft.full.description.length <= 12000 &&
        draft.full.images.length <= 12;
    const uncertainWrite = error instanceof ApiError && error.uncertain;
    const canSave = (status: Draft['status']) =>
        Boolean(valid && (dirty || !id || status !== initial?.status) && !mutation.isPending && !uncertainWrite);
    const refreshLatest = async () => {
        if (!id) return;
        try {
            const value = await qc.fetchQuery({
                queryKey: ['announcements', 'detail', id],
                queryFn: () => api.get<Announcement>(`/announcements/${encodeURIComponent(id)}`),
                staleTime: 0,
            });
            setLatest(value);
        } catch (reason) {
            setError(reason);
        }
    };
    const save = async (status: Draft['status'] = draft.status) => {
        if (!canSave(status)) return;
        if (
            status === 'draft' &&
            initial?.status === 'published' &&
            !(await confirm({
                title: 'Unpublish announcement?',
                description: 'This changes the published announcement to a draft and removes it from public listings.',
                confirmLabel: 'Unpublish',
                destructive: true,
            }))
        )
            return;
        if (
            status === 'published' &&
            !(await confirm({
                title: 'Publish announcement?',
                description: 'This announcement will be sent to connected clients.',
                confirmLabel: 'Publish',
            }))
        )
            return;
        if (
            status === 'archived' &&
            !(await confirm({
                title: 'Archive announcement?',
                description: 'You can restore it later by changing its status.',
                confirmLabel: 'Archive',
                destructive: true,
            }))
        )
            return;
        setError(undefined);
        setSaved(false);
        const next = { ...draft, status, date: iso(draft.date) };
        mutation.mutate(id ? { expectedRevision, ...next } : next);
    };
    const update = (fn: (value: Draft) => Draft) => setDraft((value) => value && fn(value));
    const conflictDraft = latest && draft ? structuredClone(draft) : undefined;
    return (
        <div className="page-stack">
            <PageHeader title={id ? 'Edit announcement' : 'New announcement'} actions={<Link to={back}>Back to announcements</Link>} />
            <div className="editor-layout">
                <fieldset disabled={mutation.isPending} className="section">
                    <h2 className="section-title">Announcement details</h2>
                    <Field label="Card title">
                        <Input
                            maxLength={160}
                            value={draft.preview.title}
                            onChange={(e) => update((v) => ({ ...v, preview: { ...v.preview, title: e.target.value } }))}
                        />
                    </Field>
                    <Field label="Card summary">
                        <Textarea
                            rows={3}
                            maxLength={500}
                            value={draft.preview.description}
                            onChange={(e) => update((v) => ({ ...v, preview: { ...v.preview, description: e.target.value } }))}
                        />
                    </Field>
                    <ImageField
                        label="Card icon"
                        value={draft.preview.icon}
                        onChange={(icon) => update((v) => ({ ...v, preview: { ...v.preview, icon } }))}
                    />
                    <label>
                        <input
                            type="checkbox"
                            checked={draft.preview.pinned}
                            onChange={(e) => update((v) => ({ ...v, preview: { ...v.preview, pinned: e.target.checked } }))}
                        />{' '}
                        Pinned
                    </label>
                    <Field label="Article title">
                        <Input
                            maxLength={160}
                            value={draft.full.title}
                            onChange={(e) => update((v) => ({ ...v, full: { ...v.full, title: e.target.value } }))}
                        />
                    </Field>
                    <Field
                        label="Article body"
                        hint={`${draft.full.description.length}/12,000 characters`}
                        error={draft.full.description.length > 12000 ? 'Article body exceeds 12,000 characters.' : undefined}
                    >
                        <RichEditor
                            value={draft.full.description}
                            onChange={(description) => update((v) => ({ ...v, full: { ...v.full, description } }))}
                        />
                    </Field>
                    <CustomDateTimePicker
                        label="Publication date"
                        value={draft.date}
                        clearable={false}
                        onChange={(date) => date && update((v) => ({ ...v, date }))}
                    />
                    <Field label="Status">
                        <select
                            className="native-select"
                            value={draft.status}
                            onChange={(e) => update((v) => ({ ...v, status: e.target.value as Draft['status'] }))}
                        >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="archived">Archived</option>
                        </select>
                    </Field>
                    <Attachments images={draft.full.images} onChange={(images) => update((v) => ({ ...v, full: { ...v.full, images } }))} />
                    <SaveMessage error={error} saved={saved} />
                    {(conflict || uncertainWrite) && conflictDraft ? (
                        <section className="section">
                            <h3 className="section-title">{uncertainWrite ? 'Save status is uncertain' : 'Revision conflict'}</h3>
                            <p>
                                {uncertainWrite
                                    ? 'The update may have succeeded. Refresh the record and compare before choosing whether to retry.'
                                    : 'Your local draft is retained. Compare it with the latest server version before reconciling.'}
                            </p>
                            {latest && <ContentDiff latest={toDraft(latest)} draft={draft} />}{' '}
                            {latest && (
                                <dl className="detail-grid">
                                    <dt>Latest title</dt>
                                    <dd>{latest.preview.title}</dd>
                                    <dt>Latest status</dt>
                                    <dd>{latest.status}</dd>
                                    <dt>Latest revision</dt>
                                    <dd>{latest.revision}</dd>
                                    <dt>Your title</dt>
                                    <dd>{conflictDraft.preview.title}</dd>
                                    <dt>Your status</dt>
                                    <dd>{conflictDraft.status}</dd>
                                </dl>
                            )}
                            <div className="toolbar">
                                <Button variant="outline" onClick={() => void refreshLatest()}>
                                    Refresh latest
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={!latest}
                                    onClick={() => {
                                        if (latest) {
                                            accept(toDraft(latest));
                                            setExpectedRevision(latest.revision);
                                            setError(undefined);
                                        }
                                    }}
                                >
                                    Load latest
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={!latest}
                                    onClick={() => {
                                        if (latest) {
                                            accept(toDraft(latest));
                                            setDraft(conflictDraft);
                                            setExpectedRevision(latest.revision);
                                            setError(undefined);
                                        }
                                    }}
                                >
                                    Keep my draft on latest revision
                                </Button>
                            </div>
                        </section>
                    ) : null}
                    {createUncertain && (
                        <p role="alert">
                            Creation may have succeeded. Refresh the announcements list and locate the record before creating another.
                        </p>
                    )}
                    <div className="toolbar">
                        <Button disabled={!canSave('draft')} onClick={() => void save(draft.status)}>
                            {mutation.isPending ? 'Saving…' : draft.status === 'draft' ? 'Save draft' : 'Save changes'}
                        </Button>
                        <Button disabled={!canSave('published')} onClick={() => void save('published')}>
                            Publish
                        </Button>
                        {id && (
                            <Button variant="outline" disabled={!canSave('archived')} onClick={() => void save('archived')}>
                                Archive
                            </Button>
                        )}
                        <Button variant="outline" disabled={!dirty || mutation.isPending} onClick={reset}>
                            Discard changes
                        </Button>
                    </div>
                </fieldset>
                <section className="section preview-panel">
                    <div className="toolbar">
                        <Button variant={mode === 'card' ? 'default' : 'outline'} onClick={() => setMode('card')}>
                            Home card
                        </Button>
                        <Button variant={mode === 'article' ? 'default' : 'outline'} onClick={() => setMode('article')}>
                            Full article
                        </Button>
                    </div>
                    {mode === 'card' ? (
                        <div className="announcement-card">
                            <img src={draft.preview.icon} alt="" />
                            <h2>{draft.preview.title || 'Announcement title'}</h2>
                            <p>{draft.preview.description || 'Announcement summary'}</p>
                            <p className="muted">
                                {formatDate(draft.date)} · {draft.status}
                                {draft.preview.pinned ? ' · Pinned' : ''}
                            </p>
                        </div>
                    ) : (
                        <div className="announcement-article">
                            <RichPreview
                                title={draft.full.title || 'Article title'}
                                html={draft.full.description}
                                images={draft.full.images}
                            />
                            <p className="muted">{formatDate(draft.date)}</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

function toDraft(item: Announcement): Draft {
    return { date: item.date, status: item.status, preview: structuredClone(item.preview), full: structuredClone(item.full) };
}
