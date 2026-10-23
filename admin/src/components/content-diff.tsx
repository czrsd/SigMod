import { displayValue } from '@/lib/format';
function flatten(value: object, prefix = ''): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value).flatMap(([key, item]) => {
            const path = prefix ? `${prefix}.${key}` : key;
            return item && typeof item === 'object' && !Array.isArray(item) ? Object.entries(flatten(item, path)) : [[path, item]];
        })
    );
}
export function ContentDiff({ latest, draft }: { latest: object; draft: object }) {
    const server = flatten(latest),
        local = flatten(draft);
    const keys = [...new Set([...Object.keys(server), ...Object.keys(local)])].filter(
        (key) => JSON.stringify(server[key]) !== JSON.stringify(local[key])
    );
    return (
        <details>
            <summary>Compare changed fields ({keys.length})</summary>
            {keys.length ? (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Field</th>
                                <th>Server</th>
                                <th>Your draft</th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map((key) => (
                                <tr key={key}>
                                    <th scope="row">{key}</th>
                                    <td>
                                        <pre className="diff-value">{displayValue(server[key])}</pre>
                                    </td>
                                    <td>
                                        <pre className="diff-value">{displayValue(local[key])}</pre>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="muted">The content matches the server.</p>
            )}
        </details>
    );
}
