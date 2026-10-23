import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { useEditor } from '@/hooks/use-editor';
import { useConfirm } from '@/components/confirm-action';
import { Field, QueryState, SaveMessage } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { NoticeDraft, NoticeRecord } from './types';
import { isHttpsUrl, isSemver, LatestPanel } from './helpers';

export function NoticeEditor() {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ['alerts', 'update-notice'],
        queryFn: ({ signal }) => api.get<NoticeRecord>('/update-notice', signal),
    });
    const initial: NoticeDraft | undefined = query.data
        ? {
              revision: query.data.revision,
              enabled: query.data.enabled,
              latestClientVersion: query.data.latestClientVersion,
              downloadUrl: query.data.downloadUrl,
              message: query.data.message,
          }
        : undefined;
    return (
        <QueryState isPending={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
            {initial && (
                <NoticeEditorForm
                    initial={initial}
                    refetch={async () => {
                        const result = await query.refetch();
                        if (result.isError || !result.data) throw new Error('Latest update notice could not be loaded.');
                        const value = result.data;
                        return {
                            revision: value.revision,
                            enabled: value.enabled,
                            latestClientVersion: value.latestClientVersion,
                            downloadUrl: value.downloadUrl,
                            message: value.message,
                        };
                    }}
                    invalidate={() => queryClient.invalidateQueries({ queryKey: ['alerts', 'update-notice'] })}
                />
            )}
        </QueryState>
    );
}

function NoticeEditorForm({
    initial,
    refetch,
    invalidate,
}: {
    initial: NoticeDraft;
    refetch: () => Promise<NoticeDraft>;
    invalidate: () => unknown;
}) {
    const confirm = useConfirm();
    const { draft, setDraft, dirty, accept } = useEditor<NoticeDraft>(initial);
    const [saveError, setSaveError] = useState<unknown>();
    const [saved, setSaved] = useState(false);
    const [showLatest, setShowLatest] = useState(false);
    const [latest, setLatest] = useState<NoticeDraft | null>(null);
    const [reconcileRequired, setReconcileRequired] = useState(false);
    const mutation = useMutation({
        mutationFn: (value: NoticeDraft) =>
            api.put<NoticeRecord>('/update-notice', {
                expectedRevision: value.revision,
                enabled: value.enabled,
                latestClientVersion: value.latestClientVersion.trim(),
                downloadUrl: value.downloadUrl.trim(),
                message: value.message.trim(),
            }),
        onSuccess: (result) => {
            accept({
                revision: result.revision,
                enabled: result.enabled,
                latestClientVersion: result.latestClientVersion,
                downloadUrl: result.downloadUrl,
                message: result.message,
            });
            setSaveError(undefined);
            setSaved(true);
            setShowLatest(false);
            setReconcileRequired(false);
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
    const validFor = (enabled: boolean) =>
        draft.latestClientVersion.length <= 80 &&
        draft.message.length <= 1000 &&
        (draft.latestClientVersion.trim() ? isSemver(draft.latestClientVersion.trim()) : !enabled) &&
        (draft.downloadUrl.trim() ? isHttpsUrl(draft.downloadUrl.trim()) : !enabled) &&
        (!enabled || Boolean(draft.message.trim()));
    const save = async (enabled: boolean) => {
        if (reconcileRequired || !validFor(enabled) || mutation.isPending) return;
        if (
            enabled !== draft.enabled &&
            !(await confirm({
                title: enabled ? 'Save and enable update notice?' : 'Disable update notice?',
                description: enabled
                    ? 'This optional release notice will be shown to eligible clients on their next content update.'
                    : 'This discards any unsaved edits and disables the currently saved notice.',
                confirmLabel: enabled ? 'Save and enable' : 'Disable notice',
                destructive: !enabled,
            }))
        )
            return;
        setSaveError(undefined);
        setSaved(false);
        mutation.mutate(enabled ? { ...draft, enabled } : { ...initial, enabled: false });
    };
    const update = (patch: Partial<NoticeDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
    return (
        <>
            <div className="editor-layout">
                <fieldset disabled={mutation.isPending} className="section">
                    <h2 className="section-title">Update notice settings</h2>
                    <Field label="Latest client version" htmlFor="notice-version">
                        <Input
                            id="notice-version"
                            value={draft.latestClientVersion}
                            maxLength={80}
                            onChange={(event) => update({ latestClientVersion: event.target.value })}
                        />
                    </Field>
                    {(draft.latestClientVersion.trim() || draft.enabled) && !isSemver(draft.latestClientVersion.trim()) && (
                        <p className="field-error" role="alert">
                            Enter a valid semantic version.
                        </p>
                    )}
                    <Field label="Download URL" htmlFor="notice-url">
                        <Input
                            id="notice-url"
                            type="url"
                            value={draft.downloadUrl}
                            onChange={(event) => update({ downloadUrl: event.target.value })}
                        />
                    </Field>
                    <Field label="Message" htmlFor="notice-message" hint={`${draft.message.length}/1000 characters`}>
                        <Textarea
                            id="notice-message"
                            rows={4}
                            maxLength={1000}
                            value={draft.message}
                            onChange={(event) => update({ message: event.target.value })}
                        />
                    </Field>
                    <div className="toolbar">
                        <Button
                            onClick={() => void save(draft.enabled)}
                            disabled={!dirty || !validFor(draft.enabled) || mutation.isPending || reconcileRequired}
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
                            fields={['latestClientVersion', 'downloadUrl', 'message', 'enabled', 'revision']}
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
                <section className="preview-panel">
                    <h2 className="section-title">Preview</h2>
                    <div className="section">
                        <strong>Update available: {draft.latestClientVersion || 'version'}</strong>
                        <p>{draft.message || 'Update message'}</p>
                        {draft.downloadUrl && isHttpsUrl(draft.downloadUrl) && <span className="button-like">Download</span>}
                    </div>
                </section>
            </div>
        </>
    );
}
