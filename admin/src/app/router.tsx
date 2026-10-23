import { createBrowserRouter, Outlet, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConfirmProvider } from '@/components/confirm-action';
import { UnsavedChangesProvider } from '@/components/unsaved-changes';
import { SessionProvider } from '@/auth/session';
import { AppLayout } from './layout';
import { Button } from '@/components/ui/button';
import { ThemeProvider } from '@/theme/theme-provider';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false, staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false },
        mutations: { retry: false },
    },
});
function Root() {
    return (
        <ThemeProvider>
            <QueryClientProvider client={queryClient}>
                <TooltipProvider>
                    <ConfirmProvider>
                        <UnsavedChangesProvider>
                            <SessionProvider>
                                <Outlet />
                            </SessionProvider>
                        </UnsavedChangesProvider>
                    </ConfirmProvider>
                </TooltipProvider>
            </QueryClientProvider>
        </ThemeProvider>
    );
}
function NotFound() {
    return (
        <div className="empty-state">
            <h1>Page not found</h1>
            <Button asChild variant="outline">
                <Link to="/">Go to server stats</Link>
            </Button>
        </div>
    );
}
function RouteError() {
    return (
        <div className="empty-state">
            <h1>This page could not be displayed</h1>
            <p>Reload to try again. Unsaved changes may be lost.</p>
            <Button onClick={() => window.location.reload()}>Reload page</Button>
        </div>
    );
}
export const router = createBrowserRouter(
    [
        {
            element: <Root />,
            errorElement: <RouteError />,
            children: [
                {
                    element: <AppLayout />,
                    children: [
                        { index: true, lazy: async () => ({ Component: (await import('@/features/stats')).StatsPage }) },
                        {
                            path: 'sigmally-users',
                            lazy: async () => ({ Component: (await import('@/features/sigmally-users')).SigmallyUsersPage }),
                        },
                        {
                            path: 'sigmally-users/:id',
                            lazy: async () => ({ Component: (await import('@/features/sigmally-users')).SigmallyUserPage }),
                        },
                        {
                            path: 'sigmod-users',
                            lazy: async () => ({ Component: (await import('@/features/sigmod-users')).SigmodUsersPage }),
                        },
                        {
                            path: 'active-users',
                            lazy: async () => ({ Component: (await import('@/features/active-users')).ActiveUsersPage }),
                        },
                        {
                            path: 'active-users/:id',
                            lazy: async () => ({ Component: (await import('@/features/active-users')).ActiveUserPage }),
                        },
                        {
                            path: 'sigmod-users/:id',
                            lazy: async () => ({ Component: (await import('@/features/sigmod-users')).SigmodUserPage }),
                        },
                        {
                            path: 'settings-usage',
                            lazy: async () => ({ Component: (await import('@/features/settings-usage')).SettingsUsagePage }),
                        },
                        {
                            path: 'parties',
                            lazy: async () => ({ Component: (await import('@/features/parties')).PartiesPage }),
                        },
                        {
                            path: 'announcements',
                            lazy: async () => ({ Component: (await import('@/features/announcements/list-page')).AnnouncementsPage }),
                        },
                        {
                            path: 'announcements/new',
                            lazy: async () => ({
                                Component: (await import('@/features/announcements/editor-page')).AnnouncementEditorPage,
                            }),
                        },
                        {
                            path: 'announcements/:id',
                            lazy: async () => ({
                                Component: (await import('@/features/announcements/editor-page')).AnnouncementEditorPage,
                            }),
                        },
                        { path: 'alerts', lazy: async () => ({ Component: (await import('@/features/alerts')).AlertsPage }) },
                        { path: 'chat-filter', lazy: async () => ({ Component: (await import('@/features/chat-filter')).ChatFilterPage }) },
                        {
                            path: 'translations',
                            lazy: async () => ({ Component: (await import('@/features/translations')).TranslationsPage }),
                        },
                        {
                            path: 'promotions',
                            lazy: async () => ({ Component: (await import('@/features/promotions/list-page')).PromotionsPage }),
                        },
                        {
                            path: 'promotions/new',
                            lazy: async () => ({ Component: (await import('@/features/promotions/editor-page')).PromotionEditorPage }),
                        },
                        {
                            path: 'promotions/:id',
                            lazy: async () => ({ Component: (await import('@/features/promotions/editor-page')).PromotionEditorPage }),
                        },
                        { path: '*', element: <NotFound /> },
                    ],
                },
            ],
        },
    ],
    { basename: '/admin' }
);
