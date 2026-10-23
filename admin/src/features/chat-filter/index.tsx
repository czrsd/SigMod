import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { useEditor } from '@/hooks/use-editor';
import { useConfirm } from '@/components/confirm-action';
import { Field, PageHeader, QueryState, SaveMessage } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type ChatFilter = { id: string; revision: number; enabled: boolean; names: string[]; messages: string[] };
type Draft = { revision: number; enabled: boolean; namesText: string; messagesText: string };
type TestResult = { matched: boolean; names: string[]; messages: string[] };

const lines = (value: string) =>
    value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
const normalized = (items: string[]) => items.map((item) => item.toLowerCase());
const analyze = (raw: string) => {
    const entries = lines(raw);
    const normalizedEntries = normalized(entries);
    const duplicates = [...new Set(normalizedEntries.filter((item, index) => normalizedEntries.indexOf(item) !== index))];
    const tooLong = entries.some((item) => item.length > 300);
    return { entries, duplicates, tooLong, valid: entries.length <= 500 && !tooLong };
};

export function ChatFilterPage() {
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: ['chat-filter'], queryFn: ({ signal }) => api.get<ChatFilter>('/chat-filter', signal) });
    return (
        <div className="page-stack">
            <PageHeader title="Chat filter" />
            <QueryState isPending={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
                {query.data && (
                    <ChatFilterEditor
                        key={query.data.id}
                        saved={query.data}
                        refetch={async () => {
                            const result = await query.refetch();
                            if (result.isError || !result.data) throw new Error('The latest filter could not be loaded.');
                            return result.data;
                        }}
                        invalidate={() => queryClient.invalidateQueries({ queryKey: ['chat-filter'] })}
                    />
                )}
            </QueryState>
        </div>
    );
}

function ChatFilterEditor({
    saved,
    refetch,
    invalidate,
}: {
    saved: ChatFilter;
    refetch: () => Promise<ChatFilter>;
    invalidate: () => unknown;
}) {
    const confirm = useConfirm();
    const initial: Draft = {
        revision: saved.revision,
        enabled: saved.enabled,
        namesText: saved.names.join('\n'),
        messagesText: saved.messages.join('\n'),
    };
    const { draft, setDraft, dirty, accept } = useEditor<Draft>(initial);
    const [sampleName, setSampleName] = useState('');
    const [sampleMessage, setSampleMessage] = useState('');
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [testError, setTestError] = useState<unknown>();
    const [saveError, setSaveError] = useState<unknown>();
    const [savedMessage, setSavedMessage] = useState(false);
    const [conflict, setConflict] = useState(false);
    const [latest, setLatest] = useState<ChatFilter | null>(null);
    const [checkError, setCheckError] = useState<unknown>();
    const checkLatest = async () => {
        setLatest(null);
        setCheckError(undefined);
        try {
            setLatest(await refetch());
        } catch (error) {
            setCheckError(error);
        }
    };
    const mutationTest = useMutation({
        mutationFn: (body: { name: string; message: string; names: string[]; messages: string[] }) =>
            api.post<TestResult>('/chat-filter/test', body),
        onSuccess: setTestResult,
        onError: setTestError,
    });
    const mutation = useMutation({
        mutationFn: (value: Draft) =>
            api.put<ChatFilter>('/chat-filter', {
                expectedRevision: value.revision,
                enabled: value.enabled,
                names: analyze(value.namesText).entries.map((item) => item.toLowerCase()),
                messages: analyze(value.messagesText).entries.map((item) => item.toLowerCase()),
            }),
        onSuccess: (result) => {
            accept({
                revision: result.revision,
                enabled: result.enabled,
                namesText: result.names.join('\n'),
                messagesText: result.messages.join('\n'),
            });
            setSaveError(undefined);
            setSavedMessage(true);
            setConflict(false);
            void invalidate();
        },
        onError: (error: unknown) => {
            setSaveError(error);
            setSavedMessage(false);
            if (error instanceof ApiError && (error.status === 409 || error.uncertain)) {
                setConflict(true);
                void checkLatest();
            }
        },
    });
    if (!draft) return null;
    const nameInfo = analyze(draft.namesText),
        messageInfo = analyze(draft.messagesText);
    const valid = nameInfo.valid && messageInfo.valid;
    const update = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
    const runTest = () => {
        setTestError(undefined);
        mutationTest.mutate({
            name: sampleName,
            message: sampleMessage,
            names: nameInfo.entries.map((item) => item.toLowerCase()),
            messages: messageInfo.entries.map((item) => item.toLowerCase()),
        });
    };
    const save = async () => {
        if (!valid || !dirty || mutation.isPending || conflict) return;
        if (draft.enabled !== saved.enabled) {
            const enabled = draft.enabled;
            if (
                !(await confirm({
                    title: enabled ? 'Save and enable chat filter?' : 'Disable chat filter?',
                    description: enabled
                        ? 'The updated client display filter will be delivered to connected clients.'
                        : 'The client display filter will be disabled for connected clients.',
                    confirmLabel: enabled ? 'Save and enable' : 'Disable filter',
                    destructive: !enabled,
                }))
            )
                return;
        }
        setSavedMessage(false);
        setSaveError(undefined);
        mutation.mutate(draft);
    };
    const discard = () => {
        accept(initial);
        setSavedMessage(false);
        setSaveError(undefined);
        setConflict(false);
    };
    return (
        <>
            <div className="editor-layout">
                <fieldset disabled={mutation.isPending} className="section" aria-labelledby="chat-filter-settings">
                    <h2 id="chat-filter-settings" className="section-title">
                        Filter rules
                    </h2>
                    <label className="data-row" htmlFor="chat-filter-enabled">
                        <input
                            id="chat-filter-enabled"
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={(event) => update({ enabled: event.target.checked })}
                        />{' '}
                        Enabled
                    </label>
                    <Field label="Blocked names" htmlFor="chat-filter-names" hint={`${nameInfo.entries.length}/500 entries`}>
                        <Textarea
                            id="chat-filter-names"
                            rows={9}
                            value={draft.namesText}
                            onChange={(event) => {
                                update({ namesText: event.target.value });
                                setTestResult(null);
                            }}
                        />
                    </Field>
                    <ListStatus info={nameInfo} />
                    <Field
                        label="Blocked messages"
                        htmlFor="chat-filter-messages"
                        hint={`${messageInfo.entries.length}/500 entries`}
                    >
                        <Textarea
                            id="chat-filter-messages"
                            rows={9}
                            value={draft.messagesText}
                            onChange={(event) => {
                                update({ messagesText: event.target.value });
                                setTestResult(null);
                            }}
                        />
                    </Field>
                    <ListStatus info={messageInfo} />
                    <div className="toolbar">
                        <Button onClick={() => void save()} disabled={!dirty || !valid || mutation.isPending || conflict}>
                            Save
                        </Button>
                        <Button variant="outline" onClick={discard} disabled={!dirty || mutation.isPending}>
                            Discard changes
                        </Button>
                    </div>
                    <SaveMessage error={saveError} saved={savedMessage} />
                    {conflict && !latest && (
                        <div role="alert">
                            <p>{checkError instanceof Error ? checkError.message : 'Checking the current server version…'}</p>
                            <Button variant="outline" onClick={() => void checkLatest()}>
                                Check again
                            </Button>
                        </div>
                    )}
                    {conflict && latest && (
                        <div className="section" role="alert">
                            <h3 className="section-title">This filter changed on the server</h3>
                            <p>
                                Your draft is retained. Review the latest saved rules below, then deliberately load its revision before
                                retrying.
                            </p>
                            <p>
                                <strong>
                                    Latest revision {latest.revision} · {latest.enabled ? 'Enabled' : 'Disabled'}
                                </strong>
                            </p>
                            <CompareList label="Names" latest={latest.names} local={nameInfo.entries} />
                            <CompareList label="Messages" latest={latest.messages} local={messageInfo.entries} />
                            <Button
                                variant="outline"
                                onClick={() => {
                                    update({ revision: latest.revision });
                                    setConflict(false);
                                    setSaveError(undefined);
                                }}
                            >
                                Use latest revision with my draft
                            </Button>
                        </div>
                    )}
                </fieldset>
                <section className="section" aria-labelledby="chat-filter-test">
                    <h2 id="chat-filter-test" className="section-title">
                        Test unsaved rules
                    </h2>
                    <Field label="Sample nickname" htmlFor="chat-filter-sample-name">
                        <Input
                            id="chat-filter-sample-name"
                            value={sampleName}
                            onChange={(event) => setSampleName(event.target.value)}
                            maxLength={1000}
                        />
                    </Field>
                    <Field label="Sample message" htmlFor="chat-filter-sample-message">
                        <Textarea
                            id="chat-filter-sample-message"
                            rows={4}
                            value={sampleMessage}
                            onChange={(event) => setSampleMessage(event.target.value)}
                            maxLength={1000}
                        />
                    </Field>
                    <Button onClick={runTest} disabled={!valid || mutationTest.isPending}>
                        Test
                    </Button>
                    <SaveMessage error={testError} />
                    {testResult && (
                        <div role="status">
                            <p>{testResult.matched ? 'At least one fragment matched.' : 'No fragments matched.'}</p>
                            <p>
                                <strong>Name fragments matched:</strong> {testResult.names.length ? testResult.names.join(', ') : 'None'}
                            </p>
                            <p>
                                <strong>Message fragments matched:</strong>{' '}
                                {testResult.messages.length ? testResult.messages.join(', ') : 'None'}
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </>
    );
}

function ListStatus({ info }: { info: ReturnType<typeof analyze> }) {
    return (
        <div aria-live="polite" className="muted">
            {info.duplicates.length > 0 && <p>Duplicates: {info.duplicates.join(', ')}</p>}
            {info.entries.length > 500 && (
                <p className="field-error" role="alert">
                    Use no more than 500 entries.
                </p>
            )}
            {info.tooLong && (
                <p className="field-error" role="alert">
                    Each fragment must be 300 characters or fewer.
                </p>
            )}
        </div>
    );
}

function CompareList({ label, latest, local }: { label: string; latest: string[]; local: string[] }) {
    return (
        <p>
            <strong>{label}:</strong> latest [{latest.join(' · ') || 'empty'}] | your draft [{local.join(' · ') || 'empty'}]
        </p>
    );
}
