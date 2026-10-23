import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { CurrentSnapshot } from './current-snapshot';
import { HistorySection } from './history-section';
import type { StatsResponse } from './types';
import './stats.css';

export function StatsPage() {
    const query = useQuery({
        queryKey: ['stats'],
        queryFn: ({ signal }) => api.get<StatsResponse>('/stats', signal),
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
    });
    return (
        <div className="page-stack">
            <PageHeader
                title="Server stats"
                actions={
                    <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
                        Refresh
                    </Button>
                }
            />
            <details className="section stats-current-snapshot">
                <summary>Current server snapshot</summary>
                <CurrentSnapshot query={query} />
            </details>
            <HistorySection />
        </div>
    );
}
