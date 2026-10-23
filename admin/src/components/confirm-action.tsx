import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
interface Options {
    title: string;
    description: string;
    confirmLabel?: string;
    destructive?: boolean;
}
const Context = createContext<(options: Options) => Promise<boolean>>(() => Promise.resolve(false));
export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [options, setOptions] = useState<Options | null>(null);
    const pending = useRef<((value: boolean) => void) | null>(null);
    const finish = useCallback((value: boolean) => {
        pending.current?.(value);
        pending.current = null;
        setOptions(null);
    }, []);
    const confirm = useCallback(
        (value: Options) =>
            new Promise<boolean>((resolve) => {
                pending.current?.(false);
                pending.current = resolve;
                setOptions(value);
            }),
        []
    );
    useEffect(
        () => () => {
            pending.current?.(false);
        },
        []
    );
    return (
        <Context.Provider value={confirm}>
            {children}
            <Dialog
                open={!!options}
                onOpenChange={(open) => {
                    if (!open) finish(false);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{options?.title}</DialogTitle>
                        <DialogDescription>{options?.description}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => finish(false)}>
                            Cancel
                        </Button>
                        <Button variant={options?.destructive ? 'destructive' : 'default'} onClick={() => finish(true)}>
                            {options?.confirmLabel ?? 'Confirm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Context.Provider>
    );
}
export const useConfirm = () => useContext(Context);
