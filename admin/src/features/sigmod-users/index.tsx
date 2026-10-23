import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useEditor } from '@/hooks/use-editor';
import { useConfirm } from '@/components/confirm-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader, QueryState, Field, SaveMessage } from '@/components/page';
import { formatStoredDate, displayValue } from '@/lib/format';
import { UsersDirectory } from '@/features/users/directory';

type ModRole = 'Owner' | 'Moderator' | 'Vip' | 'Member';
type ModUser = {
    _id: string;
    username?: string;
    imageURL?: string;
    role?: ModRole;
    bio?: string;
    badges?: string[];
    online?: boolean;
    lastOnline?: string | Date;
    visible?: boolean;
    create_time?: string | Date;
    discord_id?: string;
};
type ModDraft = { username: string; bio: string; role: ModRole };
const roles: ModRole[] = ['Owner', 'Moderator', 'Vip', 'Member'];
const defaultAvatarUrl = 'https://czrsd.com/static/sigmod/SigMod25-rounded.png';

function isUsernameConflict(error: unknown): boolean {
    return error instanceof ApiError && error.status === 409 && error.message.toLowerCase().includes('username');
}

export const SigmodUsersPage = () => <UsersDirectory mode="sigmod-users" />;

export function SigmodUserPage() {
    const { id = '' } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const returnHref = `/sigmod-users${params.size ? `?${params.toString()}` : ''}`;
    const detail = useQuery({
        queryKey: ['sigmod-user', id],
        queryFn: ({ signal }) => api.get<ModUser>(`/sigmod-users/${encodeURIComponent(id)}`, signal),
        enabled: Boolean(id),
        staleTime: 0,
        refetchOnMount: 'always',
    });
    const [readyId, setReadyId] = useState('');
    useEffect(() => {
        if (detail.isSuccess && !detail.isFetching) setReadyId(id);
    }, [id, detail.isSuccess, detail.isFetching]);
    const ready = readyId === id;
    return (
        <div className="page-stack">
            <PageHeader
                title="SigMod user"
                actions={
                    <Button variant="outline" onClick={() => navigate(returnHref)}>
                        Back to users
                    </Button>
                }
            />
            <QueryState
                isPending={detail.isPending || (!ready && detail.isFetching)}
                error={detail.error}
                onRetry={() => void detail.refetch()}
            >
                {detail.data && ready ? (
                    <ModUserEditor
                        key={detail.data._id}
                        user={detail.data}
                        onSaved={(updated) => {
                            queryClient.setQueryData(['sigmod-user', id], updated);
                            void queryClient.invalidateQueries({ queryKey: ['sigmod-users'] });
                        }}
                        confirm={confirm}
                    />
                ) : null}
            </QueryState>
        </div>
    );
}

function ModUserEditor({
    user,
    onSaved,
    confirm,
}: {
    user: ModUser;
    onSaved: (user: ModUser) => void;
    confirm: ReturnType<typeof useConfirm>;
}) {
    const initial: ModDraft = { username: user.username ?? '', bio: user.bio ?? '', role: user.role ?? 'Member' };
    const { draft, setDraft, dirty, reset, accept } = useEditor<ModDraft>(initial);
    const [baseline, setBaseline] = useState<ModDraft>(initial);
    const [error, setError] = useState<unknown>();
    const [saved, setSaved] = useState(false);
    const [checkedUser, setCheckedUser] = useState<ModUser | null>(null);
    const [checking, setChecking] = useState(false);
    const [checkError, setCheckError] = useState<unknown>();
    const [uncertainOperation, setUncertainOperation] = useState<'profile' | 'avatar' | null>(null);
    const mutation = useMutation({
        mutationFn: (changes: Partial<ModDraft>) => api.patch<ModUser>(`/sigmod-users/${encodeURIComponent(user._id)}`, changes),
        onSuccess: (updated) => {
            const next = { username: updated.username ?? '', bio: updated.bio ?? '', role: updated.role ?? 'Member' };
            accept(next);
            setBaseline(next);
            setError(undefined);
            setCheckedUser(null);
            setSaved(true);
            onSaved(updated);
        },
        onError: (reason: unknown) => {
            setSaved(false);
            setError(reason);
            setCheckedUser(null);
            setUncertainOperation(reason instanceof ApiError && reason.uncertain ? 'profile' : null);
        },
    });
    const avatarMutation = useMutation({
        mutationFn: () => api.patch<ModUser>(`/sigmod-users/${encodeURIComponent(user._id)}`, { avatarOperation: 'reset' }),
        onSuccess: (updated) => {
            onSaved(updated);
            setSaved(true);
        },
        onError: (reason: unknown) => {
            setError(reason);
            setUncertainOperation(reason instanceof ApiError && reason.uncertain ? 'avatar' : null);
        },
    });
    if (!draft) return null;
    const changes: Partial<ModDraft> = {};
    if (draft.username !== baseline.username) changes.username = draft.username.trim();
    if (draft.bio !== baseline.bio) changes.bio = draft.bio;
    if (draft.role !== baseline.role) changes.role = draft.role;
    const validUsername = /^[a-zA-Z0-9_-]{4,40}$/.test(draft.username.trim());
    const writePending = mutation.isPending || avatarMutation.isPending;
    const uncertain = error instanceof ApiError && error.uncertain;
    const canSave = dirty && validUsername && draft.bio.length <= 250 && Object.keys(changes).length > 0 && !writePending && !uncertain;
    const save = async () => {
        setError(undefined);
        setSaved(false);
        setCheckedUser(null);
        setCheckError(undefined);
        setUncertainOperation(null);
        if (
            'role' in changes &&
            !(await confirm({
                title: 'Change account role?',
                description:
                    'Mod account roles do not grant dashboard access. Dashboard access is controlled by the configured Discord owner ID.',
                confirmLabel: 'Change role',
            }))
        )
            return;
        mutation.mutate(changes);
    };
    const resetAvatar = async () => {
        if (
            !(await confirm({
                title: 'Reset avatar?',
                description: 'This replaces the current avatar with the default SigMod avatar.',
                confirmLabel: 'Reset avatar',
                destructive: true,
            }))
        )
            return;
        setError(undefined);
        setSaved(false);
        setCheckedUser(null);
        setCheckError(undefined);
        setUncertainOperation(null);
        avatarMutation.mutate();
    };
    const checkUncertainWrite = async () => {
        setChecking(true);
        try {
            const current = await api.get<ModUser>(`/sigmod-users/${encodeURIComponent(user._id)}`);
            setCheckedUser(current);
            setCheckError(undefined);
            onSaved(current);
        } catch (reason: unknown) {
            setCheckError(reason);
        } finally {
            setChecking(false);
        }
    };
    const adoptChecked = () => {
        if (!checkedUser) return;
        const current = { username: checkedUser.username ?? '', bio: checkedUser.bio ?? '', role: checkedUser.role ?? 'Member' };
        accept(current);
        setBaseline(current);
        setError(undefined);
        setCheckedUser(null);
        onSaved(checkedUser);
    };
    const continueWithDraft = () => {
        if (!checkedUser || !draft) return;
        const local = { ...draft };
        const current = { username: checkedUser.username ?? '', bio: checkedUser.bio ?? '', role: checkedUser.role ?? 'Member' };
        accept(current);
        setBaseline(current);
        setDraft(local);
        setError(undefined);
        setCheckedUser(null);
    };
    const sameAsDraft =
        checkedUser !== null &&
        (uncertainOperation === 'avatar'
            ? checkedUser.imageURL === defaultAvatarUrl
            : (checkedUser.username ?? '') === draft.username.trim() &&
              (checkedUser.bio ?? '') === draft.bio &&
              (checkedUser.role ?? 'Member') === draft.role);
    return (
        <>
            <div className="detail-grid">
                <section className="section">
                    <h2 className="section-title">Account information</h2>
                    <div className="mod-profile-identity">
                        <span>{(user.username ?? '').slice(0, 2).toUpperCase()}</span>
                        {user.imageURL && /^https:\/\//i.test(user.imageURL) ? (
                            <img src={user.imageURL} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => (event.currentTarget.hidden = true)} />
                        ) : null}
                        <strong>{user.username ?? 'Unnamed'}</strong>
                    </div>
                    <dl className="data-row">
                        <dt>Record ID</dt>
                        <dd>{displayValue(user._id)}</dd>
                        <dt>Discord ID</dt>
                        <dd>{displayValue(user.discord_id)}</dd>
                        <dt>Created</dt>
                        <dd>{formatStoredDate(user.create_time)}</dd>
                        <dt>Online state</dt>
                        <dd>{user.online === undefined ? 'Missing' : user.online ? 'Reported online' : 'Reported offline'}</dd>
                        <dt>Last online</dt>
                        <dd>{formatStoredDate(user.lastOnline)}</dd>
                        <dt>Profile visibility</dt>
                        <dd>{user.visible === undefined ? 'Missing' : user.visible ? 'Visible' : 'Hidden'}</dd>
                    </dl>

                    <Field label="Avatar URL">
                        <Input value={user.imageURL ?? ''} readOnly />
                        <p className="field-hint">{displayValue(user.imageURL)}</p>
                    </Field>
                    <Button variant="outline" onClick={() => void resetAvatar()} disabled={writePending || dirty || uncertain}>
                        Reset avatar
                    </Button>
                </section>
                <section className="section">
                    <h2 className="section-title">Profile and role</h2>

                    <fieldset disabled={writePending} className="contents">
                        <Field
                            label="Username"
                            htmlFor="mod-username"
                            error={isUsernameConflict(error) ? 'That username is already in use.' : undefined}
                        >
                            <Input
                                id="mod-username"
                                value={draft.username}
                                maxLength={40}
                                onChange={(event) =>
                                    setDraft((current) => (current ? { ...current, username: event.target.value } : current))
                                }
                            />
                        </Field>
                        <Field
                            label="Bio"
                            htmlFor="mod-bio"
                            hint={`${draft.bio.length}/250 characters`}
                            error={draft.bio.length > 250 ? 'Bio must be 250 characters or fewer.' : undefined}
                        >
                            <Textarea
                                id="mod-bio"
                                value={draft.bio}
                                maxLength={300}
                                rows={4}
                                onChange={(event) => setDraft((current) => (current ? { ...current, bio: event.target.value } : current))}
                            />
                        </Field>
                        <Field label="Account role" htmlFor="mod-role">
                            <select
                                className="native-select"
                                id="mod-role"
                                value={draft.role}
                                onChange={(event) =>
                                    setDraft((current) => (current ? { ...current, role: event.target.value as ModRole } : current))
                                }
                            >
                                {roles.map((role) => (
                                    <option key={role} value={role}>
                                        {role}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </fieldset>
                    <SaveMessage error={error instanceof ApiError && error.status === 409 ? error.message : error} saved={saved} />
                    {uncertain ? (
                        <div className="section" role="status">
                            <p>
                                Server outcome is uncertain. Check the current account before deciding whether to continue; no automatic
                                retry will occur.
                            </p>
                            <Button variant="outline" onClick={() => void checkUncertainWrite()} disabled={checking || writePending}>
                                {checking ? 'Checking…' : 'Check current account'}
                            </Button>
                            {checkError ? <SaveMessage error={checkError} /> : null}
                            {checkedUser ? (
                                <div>
                                    <p>
                                        Current server values: username {displayValue(checkedUser.username)}, bio{' '}
                                        {displayValue(checkedUser.bio)}, role {displayValue(checkedUser.role)}, avatar{' '}
                                        {displayValue(checkedUser.imageURL)}.{' '}
                                        {sameAsDraft
                                            ? 'The requested change appears to have applied.'
                                            : 'The requested change does not appear to have applied.'}
                                    </p>
                                    <div className="toolbar">
                                        <Button variant="outline" onClick={adoptChecked}>
                                            Use server values
                                        </Button>
                                        {!sameAsDraft ? (
                                            uncertainOperation === 'avatar' ? (
                                                <Button
                                                    onClick={() => {
                                                        setError(undefined);
                                                        setUncertainOperation(null);
                                                        avatarMutation.mutate();
                                                    }}
                                                >
                                                    Continue avatar reset
                                                </Button>
                                            ) : (
                                                <Button onClick={continueWithDraft}>Continue with my draft</Button>
                                            )
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="toolbar">
                        <Button onClick={() => void save()} disabled={!canSave}>
                            {mutation.isPending ? 'Saving…' : 'Save changes'}
                        </Button>
                        <Button variant="outline" onClick={reset} disabled={!dirty || writePending}>
                            Discard changes
                        </Button>
                    </div>
                </section>
            </div>
        </>
    );
}
