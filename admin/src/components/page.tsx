import { Children, cloneElement, isValidElement, useId, type ReactNode, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
    return (
        <header className="page-header">
            <div>
                <h1>{title}</h1>
                {description && <p className="muted">{description}</p>}
            </div>
            {actions && <div className="toolbar">{actions}</div>}
        </header>
    );
}
export function QueryState({
    isPending,
    error,
    onRetry,
    children,
}: {
    isPending: boolean;
    error?: unknown;
    onRetry?: () => unknown;
    children?: ReactNode;
}) {
    if (isPending)
        return (
            <div className="section muted" role="status">
                Loading…
            </div>
        );
    if (error)
        return (
            <>
                <div className="section" role="alert">
                    <p>{error instanceof Error ? error.message : 'Unable to load this page.'}</p>
                    {onRetry && (
                        <Button variant="outline" onClick={() => void onRetry()}>
                            Try again
                        </Button>
                    )}
                </div>
                {children}
            </>
        );
    return <>{children}</>;
}
export function EmptyState({ title, description }: { title: string; description?: string }) {
    return (
        <div className="empty-state">
            <h2>{title}</h2>
            {description && <p className="muted">{description}</p>}
        </div>
    );
}
export function Field({
    label,
    htmlFor,
    hint,
    error,
    children,
}: {
    label: string;
    htmlFor?: string;
    hint?: string;
    error?: string;
    children: ReactNode;
}) {
    const generated = useId();
    const controls = Children.toArray(children);
    const first = controls.find(
        (child) =>
            isValidElement(child) &&
            (child.type === Input || child.type === Textarea || ['input', 'textarea', 'select'].includes(String(child.type)))
    ) as ReactElement<Record<string, unknown>> | undefined;
    const id = htmlFor ?? (typeof first?.props.id === 'string' ? first.props.id : generated);
    const description = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
    return (
        <div className="field" role={!first ? 'group' : undefined} aria-labelledby={!first ? `${id}-label` : undefined}>
            <Label id={`${id}-label`} htmlFor={first ? id : htmlFor}>
                {label}
            </Label>
            {controls.map((child) => (child === first ? cloneElement(first, { id, 'aria-describedby': description }) : child))}
            {hint && (
                <p id={`${id}-hint`} className="field-hint">
                    {hint}
                </p>
            )}
            {error && (
                <p id={`${id}-error`} className="field-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
export function SaveMessage({ error, saved }: { error?: unknown; saved?: boolean }) {
    if (error)
        return (
            <div className="save-error" role="alert">
                <p>{error instanceof Error ? error.message : 'Changes could not be saved.'}</p>
                {error instanceof ApiError && error.status === 409 && (
                    <p>
                        The server has a newer version. Your draft is retained. Load the latest version and reconcile your changes before
                        saving.
                    </p>
                )}
                {error instanceof ApiError && error.uncertain && (
                    <p>Do not repeat this save until you have checked whether it succeeded.</p>
                )}
            </div>
        );
    return saved ? (
        <p className="save-success" role="status">
            Saved.
        </p>
    ) : null;
}
