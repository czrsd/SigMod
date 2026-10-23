import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from './confirm-action';
const Context = createContext<(id: symbol, dirty: boolean | null) => void>(() => {});
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
    const entries = useRef(new Map<symbol, boolean>());
    const update = useCallback((id: symbol, value: boolean | null) => {
        if (value === null) entries.current.delete(id);
        else entries.current.set(id, value);
    }, []);
    const confirm = useConfirm();
    const shouldBlock = useCallback(() => [...entries.current.values()].some(Boolean), []);
    const blocker = useBlocker(shouldBlock);
    const latest = useRef(blocker);
    latest.current = blocker;
    const asking = useRef(false);
    useEffect(() => {
        if (blocker.state !== 'blocked' || asking.current) return;
        asking.current = true;
        void confirm({
            title: 'Discard unsaved changes?',
            description: 'Your changes have not been saved.',
            confirmLabel: 'Discard changes',
            destructive: true,
        }).then((yes) => {
            asking.current = false;
            if (latest.current.state === 'blocked') {
                if (yes) latest.current.proceed();
                else latest.current.reset();
            }
        });
    }, [blocker, confirm]);
    useEffect(() => {
        const handler = (event: BeforeUnloadEvent) => {
            if ([...entries.current.values()].some(Boolean)) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);
    return <Context.Provider value={update}>{children}</Context.Provider>;
}
export const useDirtyRegistry = () => useContext(Context);
