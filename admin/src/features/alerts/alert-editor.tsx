import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { useEditor } from '@/hooks/use-editor';
import { useConfirm } from '@/components/confirm-action';
import { Field, QueryState, SaveMessage } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CustomDateTimePicker } from '@/components/custom-date-picker';
import type { AlertDraft, AlertRecord } from './types';
import { isHttpsUrl, LatestPanel, toUtcExpiry } from './helpers';

export function AlertEditor() {
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: ['alerts', 'alert'], queryFn: ({ signal }) => api.get<AlertRecord>('/alert', signal) });
    const initial: AlertDraft | undefined = query.data
        ? {
              revision: query.data.revision,
              enabled: query.data.enabled,
              title: query.data.title,
              description: query.data.description,
              link: query.data.link,
              buttonText: query.data.buttonText,
              expiresAt: query.data.expiresAt,
          }
        : undefined;
    return (
        <QueryState isPending={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
            {initial && (
                <AlertEditorForm
                    initial={initial}
                    refetch={async () => {
                        const result = await query.refetch();
                        if (result.isError || !result.data) throw new Error('Latest alert could not be loaded.');
                        const value = result.data;
                        return {
                            revision: value.revision,
                            enabled: value.enabled,
                            title: value.title,
                            description: value.description,
                            link: value.link,
                            buttonText: value.buttonText,
                            expiresAt: value.expiresAt,
                        };
                    }}
                    invalidate={() => queryClient.invalidateQueries({ queryKey: ['alerts', 'alert'] })}
                />
            )}
        </QueryState>
    );
}

function AlertEditorForm({
    initial,
    refetch,
    invalidate,
}: {
    initial: AlertDraft;
    refetch: () => Promise<AlertDraft>;
    invalidate: () => unknown;
}) {
    const confirm = useConfirm();
    const { draft, setDraft, dirty, accept } = useEditor<AlertDraft>(initial);
    const [saveError, setSaveError] = useState<unknown>();
    const [saved, setSaved] = useState(false);
    const [showLatest, setShowLatest] = useState(false);
    const [latest, setLatest] = useState<AlertDraft | null>(null);
    const [reconcileRequired, setReconcileRequired] = useState(false);
    const mutation = useMutation({
        mutationFn: (value: AlertDraft) =>
            api.put<AlertRecord>('/alert', {
                expectedRevision: value.revision,
                enabled: value.enabled,
                title: value.title.trim(),
                description: value.description.trim(),
                link: value.link.trim(),
                buttonText: value.buttonText.trim(),
                expiresAt: toUtcExpiry(value.expiresAt ?? ''),
            }),
        onSuccess: (result) => {
            const next = {
                revision: result.revision,
                enabled: result.enabled,
                title: result.title,
                description: result.description,
                link: result.link,
                buttonText: result.buttonText,
                expiresAt: result.expiresAt,
            };
            accept(next);
            setSaveError(undefined);
            setSaved(true);
            setShowLatest(false);
            void invalidate();
        },
        onError: (error: unknown) => {
            setSaveError(error);
            setSaved(false);
            if (error instanceof ApiError && (error.status === 409 || error.uncertain)) {
                setReconcileRequired(true);
                void refetch()
                    .then((value) => {
                        setLatest(value);
                        setShowLatest(true);
                    })
                    .catch(() => {
                        setLatest(null);
                        setShowLatest(true);
                    });
            }
        },
    });
    if (!draft) return null;
    const hasLinkPair = Boolean(draft.link.trim()) === Boolean(draft.buttonText.trim());
    const enabledValid = Boolean(
        draft.title.trim() && draft.description.trim() && hasLinkPair && (!draft.link.trim() || isHttpsUrl(draft.link.trim()))
    );
    const fieldsValid =
        draft.title.length <= 160 &&
        draft.description.length <= 1000 &&
        draft.buttonText.length <= 80 &&
        hasLinkPair &&
        (!draft.link.trim() || isHttpsUrl(draft.link.trim())) &&
        (!draft.expiresAt || !Number.isNaN(Date.parse(draft.expiresAt)));
    const validFor = (enabled: boolean) => fieldsValid && (!enabled || enabledValid);
    const changedFromInitial = dirty;
    const save = async (enabled: boolean) => {
        if (reconcileRequired || !validFor(enabled) || mutation.isPending) return;
        if (enabled !== draft.enabled) {
            const confirmed = await confirm({
                title: enabled ? 'Save and enable alert?' : 'Disable alert?',
                description: enabled
                    ? 'This alert will appear for clients on their next content update.'
                    : 'This discards any unsaved edits and disables the currently saved alert.',
                confirmLabel: enabled ? 'Save and enable' : 'Disable alert',
                destructive: !enabled,
            });
            if (!confirmed) return;
        }
        setSaved(false);
        setSaveError(undefined);
        mutation.mutate(enabled ? { ...draft, enabled } : { ...initial, enabled: false });
    };
    const update = (patch: Partial<AlertDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
    return (
        <>
            <div className="editor-layout">
                <fieldset disabled={mutation.isPending} className="section" aria-labelledby="alert-form-title">
                    <h2 id="alert-form-title" className="section-title">
                        Alert settings
                    </h2>
                    <Field label="Title" htmlFor="alert-title" hint={`${draft.title.length}/160 characters`}>
                        <Input
                            id="alert-title"
                            value={draft.title}
                            maxLength={160}
                            onChange={(event) => update({ title: event.target.value })}
                        />
                    </Field>
                    <Field label="Description" htmlFor="alert-description" hint={`${draft.description.length}/1000 characters`}>
                        <Textarea
                            id="alert-description"
                            value={draft.description}
                            maxLength={1000}
                            rows={4}
                            onChange={(event) => update({ description: event.target.value })}
                        />
                    </Field>
                    <Field label="Button text (optional)" htmlFor="alert-button">
                        <Input
                            id="alert-button"
                            value={draft.buttonText}
                            maxLength={80}
                            onChange={(event) => update({ buttonText: event.target.value })}
                        />
                    </Field>
                    <Field label="Link (optional)" htmlFor="alert-link">
                        <Input id="alert-link" type="url" value={draft.link} onChange={(event) => update({ link: event.target.value })} />
                    </Field>
                    <CustomDateTimePicker
                        label="Expiry (optional)"
                        value={draft.expiresAt}
                        onChange={(expiresAt) => update({ expiresAt })}
                    />
                    {!hasLinkPair && (
                        <p className="field-error" role="alert">
                            Button text and link must be provided together.
                        </p>
                    )}
                    {draft.link && !isHttpsUrl(draft.link.trim()) && (
                        <p className="field-error" role="alert">
                            Enter a valid HTTPS link.
                        </p>
                    )}
                    <div className="toolbar">
                        <Button
                            onClick={() => void save(draft.enabled)}
                            disabled={!changedFromInitial || !validFor(draft.enabled) || mutation.isPending || reconcileRequired}
                        >
                            Save
                        </Button>
                        <Button
                            onClick={() => void save(true)}
                            disabled={draft.enabled || !validFor(true) || mutation.isPending || reconcileRequired}
                        >
                            Save and enable
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void save(false)}
                            disabled={!draft.enabled || mutation.isPending || reconcileRequired}
                        >
                            Disable
                        </Button>
                    </div>
                    <SaveMessage error={saveError} saved={saved} />
                    {showLatest && (
                        <LatestPanel
                            latest={latest}
                            retained={draft}
                            fields={['title', 'description', 'link', 'buttonText', 'expiresAt', 'enabled']}
                            onRetry={() => {
                                void refetch()
                                    .then(setLatest)
                                    .catch(() => setLatest(null));
                            }}
                            onLoad={() => {
                                if (latest) {
                                    accept(latest);
                                    setReconcileRequired(false);
                                    setShowLatest(false);
                                    setSaveError(undefined);
                                }
                            }}
                            onKeep={() => {
                                if (latest) {
                                    setDraft((current) => (current ? { ...current, revision: latest.revision } : current));
                                    setReconcileRequired(false);
                                    setShowLatest(false);
                                    setSaveError(undefined);
                                }
                            }}
                        />
                    )}
                </fieldset>
                <section className="preview-panel" aria-label="Alert preview">
                    <h2 className="section-title">Preview</h2>
                    <div className="section">
                        <strong>{draft.title.trim() || 'Alert title'}</strong>
                        <p>{draft.description.trim() || 'Alert description'}</p>
                        {draft.link.trim() && draft.buttonText.trim() && <span className="button-like">{draft.buttonText}</span>}
                        {draft.expiresAt && <p className="muted">Expires {new Date(draft.expiresAt).toLocaleString()}</p>}
                    </div>
                </section>
            </div>
        </>
    );
}
