import { Button } from '@/components/ui/button';
import type { AlertDraft, NoticeDraft } from './types';

export const toUtcExpiry = (value: string) => (value ? new Date(value).toISOString() : null);
export const isHttpsUrl = (value: string) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
        return false;
    }
};
export const isSemver = (value: string) =>
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);

type ComparableDraft = AlertDraft | NoticeDraft;
export function LatestPanel<T extends ComparableDraft>({
    latest,
    retained,
    fields,
    onRetry,
    onLoad,
    onKeep,
}: {
    latest: T | null;
    retained: T;
    fields: (keyof T)[];
    onRetry: () => void;
    onLoad: () => void;
    onKeep: () => void;
}) {
    return (
        <div className="section" role="status">
            <h3 className="section-title">Compare before reconciling</h3>
            {latest ? (
                <>
                    <p>Your draft is retained. Review the latest saved values before choosing how to continue.</p>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th scope="col">Field</th>
                                    <th scope="col">Latest server value</th>
                                    <th scope="col">Retained draft</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fields.map((field) => (
                                    <tr key={String(field)}>
                                        <th scope="row">{String(field)}</th>
                                        <td>{String(latest[field] ?? '(empty)')}</td>
                                        <td>{String(retained[field] ?? '(empty)')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="toolbar">
                        <Button variant="outline" onClick={onLoad}>
                            Load latest
                        </Button>
                        <Button onClick={onKeep}>Keep draft against latest revision</Button>
                    </div>
                </>
            ) : (
                <>
                    <p>The latest server state could not be fetched. Saving remains blocked until you check it.</p>
                    <Button variant="outline" onClick={onRetry}>
                        Check latest version
                    </Button>
                </>
            )}
        </div>
    );
}
