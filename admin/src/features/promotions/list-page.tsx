import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '@/components/confirm-action';
import { PageHeader, QueryState, EmptyState, SaveMessage } from '@/components/page';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { promotionListQuery, type Promotion } from './types';
import { destination, schedule } from './utils';

export function PromotionsPage() {
    const [params] = useSearchParams();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [deleteError, setDeleteError] = useState<unknown>();
    const list = useQuery(promotionListQuery);
    const deleteMutation = useMutation({
        mutationFn: (item: Promotion) =>
            api.delete<void>(`/promotions/${encodeURIComponent(item.id)}`, { expectedRevision: item.revision }),
        onSuccess: (_result, item) => {
            queryClient.setQueryData<Promotion[]>(['promotions'], (current) => current?.filter((promotion) => promotion.id !== item.id));
            setDeleteError(undefined);
            void queryClient.invalidateQueries({ queryKey: ['promotions'] });
        },
        onError: (error: unknown) => {
            setDeleteError(error);
            void queryClient.invalidateQueries({ queryKey: ['promotions'] });
        },
    });
    const remove = async (item: Promotion) => {
        if (deleteMutation.isPending) return;
        const confirmed = await confirm({
            title: 'Delete this promotion?',
            description: `“${item.title || item.id}” will be permanently deleted. This cannot be undone.`,
            confirmLabel: 'Delete promotion',
            destructive: true,
        });
        if (confirmed) deleteMutation.mutate(item);
    };
    return (
        <div className="page-stack">
            <PageHeader title="Promotions" actions={<Link to={`/promotions/new${params.size ? `?${params}` : ''}`}>New promotion</Link>} />

            {deleteError ? (
                <SaveMessage
                    error={
                        deleteError instanceof ApiError && deleteError.status === 409
                            ? 'This promotion changed since the list loaded. The list has been refreshed; review it and try again.'
                            : deleteError
                    }
                />
            ) : null}
            <QueryState isPending={list.isPending} error={list.error} onRetry={() => void list.refetch()}>
                {list.data?.length === 0 ? <EmptyState title="No promotions" /> : null}
                {list.data && list.data.length > 0 ? (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Destination</th>
                                    <th>Enabled</th>
                                    <th>Schedule</th>
                                    <th className="promotion-actions-heading">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.data.map((item) => (
                                    <tr key={item.id}>
                                        <td>{item.title || item.id}</td>
                                        <td>{destination(item.link)}</td>
                                        <td>{item.enabled ? 'Enabled' : 'Disabled'}</td>
                                        <td>{schedule(item)}</td>
                                        <td className="promotion-actions-cell">
                                            <div className="promotion-row-actions">
                                                <Link to={`/promotions/${encodeURIComponent(item.id)}${params.size ? `?${params}` : ''}`}>
                                                    Edit
                                                </Link>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="promotion-delete-button"
                                                    disabled={deleteMutation.isPending}
                                                    onClick={() => void remove(item)}
                                                    aria-label={`Delete ${item.title || item.id}`}
                                                    title={`Delete ${item.title || item.id}`}
                                                >
                                                    <Trash2 aria-hidden="true" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </QueryState>
        </div>
    );
}
