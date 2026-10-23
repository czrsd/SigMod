import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, QueryState, EmptyState, Field } from '@/components/page';
import type { Announcement } from './types';

function key(item: Announcement): string {
    return item.id || item._id || '';
}
function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Unknown date';
}

export function AnnouncementsPage() {
    const [status, setStatus] = useState('all');
    const query = useQuery({ queryKey: ['announcements'], queryFn: ({ signal }) => api.get<Announcement[]>('/announcements', signal) });
    const rows = (query.data ?? []).filter((item) => status === 'all' || item.status === status);
    return (
        <div className="page-stack">
            <PageHeader title="Announcements" actions={<Link to="/announcements/new">New announcement</Link>} />
            <Field label="Filter by status">
                <select className="native-select" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                </select>
            </Field>
            <QueryState isPending={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
                {rows.length === 0 ? (
                    <EmptyState title="No announcements" />
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Date</th>
                                    <th>Pinned</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((item) => (
                                    <tr key={key(item)}>
                                        <td>{item.preview.title || key(item)}</td>
                                        <td>{formatDate(item.date)}</td>
                                        <td>{item.preview.pinned ? 'Yes' : 'No'}</td>
                                        <td>{item.status}</td>
                                        <td>
                                            <Link to={`/announcements/${encodeURIComponent(key(item))}`}>Edit</Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </QueryState>
        </div>
    );
}
