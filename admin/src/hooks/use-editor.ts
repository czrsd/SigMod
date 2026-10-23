import { useCallback, useEffect, useRef, useState } from 'react';
import { useDirtyRegistry } from '@/components/unsaved-changes';

export function useEditor<T extends object>(saved: T | undefined) {
    const [draft, setDraft] = useState<T | null>(saved ? structuredClone(saved) : null);
    const [baseline, setBaseline] = useState<T | null>(saved ? structuredClone(saved) : null);
    const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
    const latest = useRef(saved);
    latest.current = saved;
    const savedKey = JSON.stringify(saved);
    const register = useDirtyRegistry();
    const id = useRef(Symbol('editor'));
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    useEffect(() => {
        if (saved && !dirtyRef.current) {
            setDraft(structuredClone(saved));
            setBaseline(structuredClone(saved));
        }
    }, [savedKey]);
    const accept = useCallback(
        (value: T) => {
            dirtyRef.current = false;
            register(id.current, false);
            setBaseline(structuredClone(value));
            setDraft(structuredClone(value));
        },
        [register]
    );
    const reset = useCallback(() => {
        if (latest.current) accept(latest.current);
        else {
            setDraft(null);
            setBaseline(null);
        }
    }, [accept]);
    useEffect(() => {
        register(id.current, dirty);
        return () => register(id.current, null);
    }, [dirty, register]);
    return { draft, setDraft, dirty, reset, accept };
}
