import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useEditor } from '@/hooks/use-editor';
import { useConfirm } from '@/components/confirm-action';
import { ImageField } from '@/components/image-field';
import { ContentDiff } from '@/components/content-diff';
import { PageHeader, QueryState, EmptyState, Field, SaveMessage } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CustomDateTimePicker } from '@/components/custom-date-picker';
import { blank, promotionListQuery, type Promotion, type Draft } from './types';
import { destination, localDate, safeHref, schedule, toDraft, validDate } from './utils';

export function PromotionEditorPage() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const editing = Boolean(id);
    const list = useQuery(promotionListQuery);
    const saved = editing ? list.data?.find((item) => item.id === id) : undefined;
    const missing = editing && !list.isPending && !list.error && !saved;
    const back = `/promotions${params.size ? `?${params}` : ''}`;
    if (editing && !saved)
        return (
            <div className="page-stack">
                <PageHeader
                    title="Edit promotion"
                    actions={
                        <Button variant="outline" onClick={() => navigate(back)}>
                            Back to promotions
                        </Button>
                    }
                />
                <QueryState isPending={list.isPending} error={list.error} onRetry={() => void list.refetch()}>
                    {missing ? (
                        <EmptyState title="Promotion not found" description="It may have been removed or the list is unavailable." />
                    ) : null}
                </QueryState>
            </div>
        );
    return (
        <PromotionForm
            key={id ?? 'new'}
            id={id}
            initial={saved}
            back={back}
            onDone={(item) => {
                qc.setQueryData<Promotion[]>(['promotions'], (old) =>
                    old
                        ? old.some((row) => row.id === item.id)
                            ? old.map((row) => (row.id === item.id ? item : row))
                            : [...old, item]
                        : [item]
                );
                void qc.invalidateQueries({ queryKey: ['promotions'] });
                navigate(back);
            }}
        />
    );
}
function PromotionForm({
    id,
    initial,
    back,
    onDone,
}: {
    id?: string;
    initial?: Promotion;
    back: string;
    onDone: (item: Promotion) => void;
}) {
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const baseline = useMemo<Draft | undefined>(() => (initial ? toDraft(initial) : id ? undefined : blank), [initial, id]);
    const editor = useEditor<Draft>(baseline);
    const { draft, setDraft, dirty, reset, accept } = editor;
    const [expectedRevision, setExpectedRevision] = useState(initial?.revision ?? 0);
    const [createId] = useState(() => crypto.randomUUID());
    const [uncertainCheck, setUncertainCheck] = useState<Promotion[] | null>(null);
    const [uncertainWrite, setUncertainWrite] = useState(false);
    const [error, setError] = useState<unknown>();
    const [saved, setSaved] = useState(false);
    const mutation = useMutation({
        mutationFn: (body: Record<string, unknown>) =>
            id ? api.patch<Promotion>(`/promotions/${encodeURIComponent(id)}`, body) : api.post<Promotion>('/promotions', body),
        onSuccess: (item) => {
            setUncertainWrite(false);
            accept(toDraft(item));
            setError(undefined);
            setSaved(true);
            onDone(item);
        },
        onError: (reason: unknown) => {
            setUncertainWrite(reason instanceof ApiError && reason.uncertain);
            setSaved(false);
            setError(reason);
            void queryClient.invalidateQueries({ queryKey: ['promotions'] });
        },
    });
    if (!draft) return null;
    const titleError = draft.title.trim() ? undefined : 'Title is required.';
    const href = safeHref(draft.link);
    const imageError = draft.imageUrl && !safeHref(draft.imageUrl) ? 'Enter a safe HTTPS image URL.' : undefined;
    const startDateError = draft.startsAt && !Number.isFinite(new Date(draft.startsAt).getTime()) ? 'Enter a valid start time.' : undefined;
    const expiryError = draft.expiresAt && !Number.isFinite(new Date(draft.expiresAt).getTime()) ? 'Enter a valid expiry time.' : undefined;
    const rangeError =
        draft.startsAt && draft.expiresAt && new Date(draft.startsAt) >= new Date(draft.expiresAt)
            ? 'Expiry must be later than the start time.'
            : undefined;
    const canSave =
        dirty &&
        !titleError &&
        Boolean(href) &&
        !imageError &&
        !startDateError &&
        !expiryError &&
        !rangeError &&
        draft.title.length <= 120 &&
        draft.description.length <= 500 &&
        draft.buttonText.length <= 80;
    const save = async (afterStateCheck = false) => {
        if (!canSave || (uncertainWrite && !afterStateCheck)) return;
        if (
            draft.enabled &&
            !initial?.enabled &&
            !(await confirm({
                title: 'Enable this promotion?',
                description: 'It will be eligible for menu-card display for users who allow promotions, within its schedule.',
                confirmLabel: 'Enable promotion',
            }))
        )
            return;
        if (
            initial?.enabled &&
            !draft.enabled &&
            !(await confirm({
                title: 'Disable this promotion?',
                description: 'The promotion will stop appearing in subsequent content updates.',
                confirmLabel: 'Disable promotion',
                destructive: true,
            }))
        )
            return;
        setError(undefined);
        setSaved(false);
        setUncertainCheck(null);
        mutation.mutate({
            ...(id ? {} : { id: createId }),
            expectedRevision,
            title: draft.title.trim(),
            description: draft.description,
            titleColor: draft.titleColor,
            descriptionColor: draft.descriptionColor,
            imageUrl: draft.imageUrl,
            link: draft.link,
            buttonText: draft.buttonText,
            html: draft.html,
            css: '',
            placement: 'menu-card',
            enabled: draft.enabled,
            startsAt: validDate(draft.startsAt),
            expiresAt: validDate(draft.expiresAt),
        });
    };
    const latest = (uncertainCheck ?? queryClient.getQueryData<Promotion[]>(['promotions']))?.find((item) => item.id === (id ?? createId));
    const conflict = error instanceof ApiError && error.status === 409;
    const uncertain = uncertainWrite;
    const checkCurrent = async () => {
        setUncertainCheck(null);
        try {
            const rows = await queryClient.fetchQuery(promotionListQuery);
            setUncertainCheck(rows);
        } catch (reason: unknown) {
            setError(reason);
        }
    };
    return (
        <div className="page-stack">
            <PageHeader
                title={id ? 'Edit promotion' : 'New promotion'}
                actions={
                    <Button variant="outline" onClick={() => navigate(back)}>
                        Back to promotions
                    </Button>
                }
            />
            <div className="editor-layout">
                <fieldset disabled={mutation.isPending} className="section promotion-form-section">
                    <h2 className="section-title">Promotion content</h2>
                    <p className="promotion-section-note">Add the information and destination users will see in the menu.</p>
                    <div className="promotion-content-fields">
                        <Field label="Title" error={dirty ? titleError : undefined}>
                            <Input
                                value={draft.title}
                                maxLength={120}
                                onChange={(e) => setDraft((v) => v && { ...v, title: e.target.value })}
                            />
                        </Field>
                        <Field label="Description">
                            <Textarea
                                rows={4}
                                maxLength={500}
                                value={draft.description}
                                onChange={(e) => setDraft((v) => v && { ...v, description: e.target.value })}
                            />
                        </Field>
                        <ImageField
                            label="Image"
                            value={draft.imageUrl}
                            onChange={(imageUrl) => setDraft((v) => v && { ...v, imageUrl })}
                        />
                        {imageError ? (
                            <p className="field-error" role="alert">
                                {imageError}
                            </p>
                        ) : null}
                        <Field label="Destination URL" error={draft.link && !href ? 'Enter a safe HTTPS URL.' : undefined}>
                            <Input type="url" value={draft.link} onChange={(e) => setDraft((v) => v && { ...v, link: e.target.value })} />
                        </Field>
                        <Field label="Button text">
                            <Input
                                maxLength={80}
                                value={draft.buttonText}
                                onChange={(e) => setDraft((v) => v && { ...v, buttonText: e.target.value })}
                            />
                        </Field>
                        <Field label="Title color" hint="Applies to headings in the card. Default: white.">
                            <Input
                                type="color"
                                className="promotion-color-input"
                                value={draft.titleColor}
                                onChange={(e) => setDraft((v) => v && { ...v, titleColor: e.target.value })}
                            />
                        </Field>
                        <Field label="Description color" hint="Applies to paragraph text. Default: muted gray.">
                            <Input
                                type="color"
                                className="promotion-color-input"
                                value={draft.descriptionColor}
                                onChange={(e) => setDraft((v) => v && { ...v, descriptionColor: e.target.value })}
                            />
                        </Field>
                    </div>
                    <details className="promotion-html-editor">
                        <summary>Customize panel HTML</summary>
                        <Field
                            label="Panel HTML"
                            hint="Template values: {{title}}, {{description}}, {{imageUrl}}, {{link}}, {{buttonText}}. SigMod supplies the panel styling."
                        >
                            <Textarea
                                rows={8}
                                maxLength={20000}
                                value={draft.html}
                                onChange={(e) => setDraft((v) => v && { ...v, html: e.target.value })}
                            />
                        </Field>
                    </details>
                    <div className="promotion-schedule-section">
                        <h3>Schedule</h3>
                        <p className="promotion-section-note">Leave either date empty to keep that boundary open.</p>
                        <div className="promotion-date-grid">
                            <CustomDateTimePicker
                                label="Starts at"
                                value={draft.startsAt}
                                onChange={(startsAt) => setDraft((v) => v && { ...v, startsAt })}
                                error={startDateError}
                            />
                            <CustomDateTimePicker
                                label="Expires at"
                                value={draft.expiresAt}
                                onChange={(expiresAt) => setDraft((v) => v && { ...v, expiresAt })}
                                error={expiryError || rangeError}
                            />
                        </div>
                        <p className="field-hint">
                            Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'} · Placement: menu-card
                        </p>
                    </div>
                    <Field label="Enabled">
                        <select
                            className="native-select"
                            aria-label="Enabled"
                            value={draft.enabled ? 'yes' : 'no'}
                            onChange={(e) => setDraft((v) => v && { ...v, enabled: e.target.value === 'yes' })}
                        >
                            <option value="no">Disabled</option>
                            <option value="yes">Enabled</option>
                        </select>
                    </Field>
                    <SaveMessage error={error} saved={saved} />
                    {conflict || uncertain ? (
                        <section className="section" aria-live="polite">
                            <h3 className="section-title">{uncertain ? 'Save result needs checking' : 'Revision conflict'}</h3>
                            <p>
                                {uncertain
                                    ? 'The server may have applied this save. Check the current promotion list before deciding what to do next.'
                                    : 'Your draft is unchanged. Refresh to compare with the latest list value, then choose how to reconcile.'}
                            </p>
                            {uncertain && !uncertainCheck ? (
                                <Button variant="outline" onClick={() => void checkCurrent()}>
                                    Check current server state
                                </Button>
                            ) : null}
                            {latest ? (
                                <>
                                    <ContentDiff latest={toDraft(latest)} draft={draft} />
                                    <dl className="data-row">
                                        <dt>Latest title</dt>
                                        <dd>{latest.title}</dd>
                                        <dt>Latest revision</dt>
                                        <dd>{latest.revision}</dd>
                                        <dt>Latest enabled</dt>
                                        <dd>{latest.enabled ? 'Enabled' : 'Disabled'}</dd>
                                        <dt>Latest destination</dt>
                                        <dd>{destination(latest.link)}</dd>
                                        <dt>Latest schedule</dt>
                                        <dd>{schedule(latest)}</dd>
                                    </dl>
                                    {!id ? (
                                        <div className="toolbar">
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    accept(toDraft(latest));
                                                    setUncertainWrite(false);
                                                    navigate(
                                                        `/promotions/${encodeURIComponent(latest.id)}${back.includes('?') ? back.slice(back.indexOf('?')) : ''}`
                                                    );
                                                }}
                                            >
                                                Open created promotion
                                            </Button>
                                        </div>
                                    ) : null}
                                    {id ? (
                                        <div className="toolbar">
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    accept(toDraft(latest));
                                                    setExpectedRevision(latest.revision);
                                                    setError(undefined);
                                                    setUncertainCheck(null);
                                                    setUncertainWrite(false);
                                                }}
                                            >
                                                Load latest version
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    const localDraft = structuredClone(draft);
                                                    accept(toDraft(latest));
                                                    setDraft(localDraft);
                                                    setExpectedRevision(latest.revision);
                                                    setError(undefined);
                                                    setUncertainCheck(null);
                                                    setUncertainWrite(false);
                                                }}
                                            >
                                                Keep my draft and use latest revision
                                            </Button>
                                        </div>
                                    ) : null}
                                </>
                            ) : uncertainCheck ? (
                                <>
                                    <p>No promotion with this ID is in the latest list. The draft and its ID are retained.</p>
                                    <Button
                                        variant="outline"
                                        disabled={mutation.isPending}
                                        onClick={() => {
                                            setError(undefined);
                                            setUncertainCheck(null);
                                            void save(true);
                                        }}
                                    >
                                        Retry after confirming no matching promotion exists
                                    </Button>
                                </>
                            ) : null}
                            {conflict && !latest ? (
                                <Button variant="outline" onClick={() => void checkCurrent()}>
                                    Refresh promotions list
                                </Button>
                            ) : null}
                            {uncertain && id && uncertainCheck && !latest ? (
                                <Button
                                    variant="outline"
                                    disabled={mutation.isPending}
                                    onClick={() => {
                                        setExpectedRevision(initial?.revision ?? 0);
                                        setError(undefined);
                                        setUncertainCheck(null);
                                        void save(true);
                                    }}
                                >
                                    Retry after confirming current state
                                </Button>
                            ) : null}
                        </section>
                    ) : null}
                    <div className="toolbar">
                        <Button onClick={() => void save()} disabled={!canSave || mutation.isPending || uncertain}>
                            {mutation.isPending ? 'Saving…' : draft.enabled ? 'Save and enable' : 'Save draft'}
                        </Button>
                        <Button variant="outline" disabled={!dirty || mutation.isPending} onClick={reset}>
                            Discard changes
                        </Button>
                    </div>
                </fieldset>
                <section className="section preview-panel">
                    <h2 className="section-title">Menu panel preview</h2>
                    <PromotionPreview draft={draft} />
                    <p className="muted">
                        {draft.enabled ? 'Enabled' : 'Disabled'} · Starts {localDate(draft.startsAt)} · Expires {localDate(draft.expiresAt)}
                    </p>
                </section>
            </div>
        </div>
    );
}

function PromotionPreview({ draft }: { draft: Draft }) {
    const panel = useRef<HTMLAnchorElement>(null);
    const values: Record<string, string> = {
        title: draft.title || 'Promotion title',
        description: draft.description || 'Promotion description',
        imageUrl: safeHref(draft.imageUrl) || '',
        link: safeHref(draft.link) || '#',
        buttonText: draft.buttonText,
    };
    const html = draft.html.replace(/\{\{(title|description|imageUrl|link|buttonText)\}\}/g, (_match, key: string) =>
        escapeHtml(values[key])
    );
    useEffect(() => {
        if (!panel.current) return;
        const template = document.createElement('template');
        template.innerHTML = html;
        sanitizePromotionPreview(template.content);
        panel.current.replaceChildren(template.content.cloneNode(true));
        panel.current.style.setProperty('--promotion-title-color', draft.titleColor);
        panel.current.style.setProperty('--promotion-description-color', draft.descriptionColor);
    }, [html, draft.titleColor, draft.descriptionColor]);
    return (
        <div className="promotion-preview-shell">
            <a
                className="promotion-card promotion-editor-preview"
                href="#preview"
                ref={panel}
                onClick={(event) => event.preventDefault()}
            />
            <span className="promotion-preview-close" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
            </span>
        </div>
    );
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function sanitizePromotionPreview(root: DocumentFragment): void {
    const allowed = new Set([
        'ARTICLE',
        'DIV',
        'SPAN',
        'P',
        'BR',
        'STRONG',
        'B',
        'EM',
        'I',
        'U',
        'UL',
        'OL',
        'LI',
        'BLOCKQUOTE',
        'H1',
        'H2',
        'H3',
        'H4',
        'IMG',
    ]);
    const discard = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'LINK', 'META', 'BASE']);
    const visit = (parent: ParentNode) => {
        for (const node of [...parent.childNodes]) {
            if (node.nodeType === Node.TEXT_NODE) continue;
            if (!(node instanceof HTMLElement) || discard.has(node.tagName)) {
                node.remove();
                continue;
            }
            visit(node);
            if (!allowed.has(node.tagName)) {
                node.replaceWith(...node.childNodes);
                continue;
            }
            const urlAttr = node.tagName === 'IMG' ? 'src' : null;
            const url = urlAttr ? safeHref(node.getAttribute(urlAttr) ?? '') : null;
            const alt = node.tagName === 'IMG' ? node.getAttribute('alt') : null;
            for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name);
            if (url && urlAttr) node.setAttribute(urlAttr, url);
            if (alt !== null && node.tagName === 'IMG') node.setAttribute('alt', alt.slice(0, 300));
        }
    };
    visit(root);
}
