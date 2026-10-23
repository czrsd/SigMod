import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setCsrfToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm-action';
interface Identity {
    id: string;
    displayName: string;
}
interface Session {
    authenticated: boolean;
    admin?: Identity;
    csrfToken?: string;
}
interface State {
    identity: Identity | null;
    logout: () => Promise<void>;
    checking: boolean;
}
const Context = createContext<State>({ identity: null, logout: async () => {}, checking: true });
export function SessionProvider({ children }: { children: ReactNode }) {
    const queries = useQueryClient();
    const [identity, setIdentity] = useState<Identity | null>(null);
    const [checking, setChecking] = useState(true);
    const [expired, setExpired] = useState(false);
    const [error, setError] = useState('');
    const [generation, setGeneration] = useState(0);
    const confirm = useConfirm();
    const check = useCallback(async () => {
        setChecking(true);
        setError('');
        try {
            const session = await api.get<Session>('/auth/session');
            if (session.authenticated && session.admin && session.csrfToken) {
                setCsrfToken(session.csrfToken);
                setIdentity(session.admin);
                setExpired(false);
                void queries.invalidateQueries();
            } else {
                setCsrfToken(null);
                if (identity) setExpired(true);
            }
        } catch (failure) {
            if (!(failure instanceof ApiError && failure.status === 401))
                setError(failure instanceof Error ? failure.message : 'Sign in could not be checked.');
        } finally {
            setChecking(false);
        }
    }, [identity, queries]);
    useEffect(() => {
        void check();
    }, []);
    useEffect(() => {
        const denied = () => {
            setCsrfToken(null);
            if (identity) setExpired(true);
        };
        window.addEventListener('admin:unauthorized', denied);
        return () => window.removeEventListener('admin:unauthorized', denied);
    }, [identity]);
    const logout = useCallback(async () => {
        if (!(await confirm({ title: 'Sign out?', description: 'Any unsaved changes will be discarded.', confirmLabel: 'Sign out' })))
            return;
        try {
            await api.post('/auth/logout', {});
            setCsrfToken(null);
            setIdentity(null);
            setExpired(false);
            queries.clear();
            setGeneration((value) => value + 1);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to sign out.');
        }
    }, [confirm, queries]);
    const denied = new URLSearchParams(window.location.search).get('adminAuth') === 'error';
    return (
        <Context.Provider value={{ identity, logout, checking }}>
            {identity && (
                <div hidden={expired} key={generation}>
                    {children}
                </div>
            )}
            {(!identity || expired) && (
                <main className="login-page">
                    <section className="login-panel">
                        <h1>{expired ? 'Session expired' : 'SigMod Admin'}</h1>
                        {checking && !identity ? (
                            <p role="status">Checking session…</p>
                        ) : (
                            <div className="login-actions">
                                <Button asChild>
                                    <a
                                        className="!text-white hover:!no-underline"
                                        href="/api/v5/admin/auth/discord"
                                        {...(expired ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                    >
                                        Continue with Discord
                                    </a>
                                </Button>
                                {expired && (
                                    <Button variant="outline" onClick={() => void check()} disabled={checking}>
                                        {checking ? 'Checking…' : 'Resume after signing in'}
                                    </Button>
                                )}
                            </div>
                        )}
                        {denied && (
                            <p role="alert" className="field-error">
                                Discord sign-in was denied or could not be completed. Use the authorized account and try again.
                            </p>
                        )}
                        {error && (
                            <p role="alert" className="field-error">
                                {error}
                            </p>
                        )}
                    </section>
                </main>
            )}
            {identity && !expired && error && (
                <div className="session-error" role="alert">
                    {error}
                    <Button variant="ghost" size="sm" onClick={() => setError('')}>
                        Dismiss
                    </Button>
                </div>
            )}
        </Context.Provider>
    );
}
export const useSession = () => useContext(Context);
