import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { ConfirmProvider } from '@/components/confirm-action';
import { SessionProvider } from '@/auth/session';
import { ChatFilterPage } from './index';

function Root() {
    return (
        <ConfirmProvider>
            <SessionProvider>
                <Outlet />
            </SessionProvider>
        </ConfirmProvider>
    );
}

const adminSession = (csrfToken: string) => ({ authenticated: true, admin: { id: 'owner', displayName: 'Owner' }, csrfToken });
const chatFilter = (revision: number, names: string[]) => ({
    success: true,
    data: { id: 'main', revision, enabled: false, names, messages: [] },
});

describe('chat filter session-loss retention', () => {
    let filterReads: number;
    let sessionReads: number;
    let writeCount: number;

    beforeEach(() => {
        filterReads = 0;
        sessionReads = 0;
        writeCount = 0;
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                if (url.endsWith('/auth/session')) {
                    sessionReads++;
                    return new Response(JSON.stringify(adminSession(sessionReads === 1 ? 'first-token' : 'resumed-token')), {
                        status: 200,
                    });
                }
                if (url.endsWith('/chat-filter') && init?.method === 'GET') {
                    filterReads++;
                    if (filterReads === 1) return new Response(JSON.stringify(chatFilter(3, ['original-name'])), { status: 200 });
                    if (filterReads === 2) return new Response(JSON.stringify({ error: 'session expired' }), { status: 401 });
                    return new Response(JSON.stringify(chatFilter(4, ['latest-server-name'])), { status: 200 });
                }
                if (url.endsWith('/chat-filter') && init?.method === 'PUT') {
                    writeCount++;
                    return new Response(JSON.stringify({ error: 'session expired' }), { status: 401 });
                }
                throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
            })
        );
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('keeps a dirty chat-filter draft across failed cached refetch and session resume with a newer revision', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity } } });
        const router = createMemoryRouter([{ element: <Root />, children: [{ path: '/', element: <ChatFilterPage /> }] }]);
        const view = render(
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        );

        const names = await screen.findByLabelText('Blocked names');
        expect(names).toHaveValue('original-name');
        fireEvent.change(names, { target: { value: 'unsaved-name' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await screen.findByRole('heading', { name: 'Session expired' });
        expect(writeCount).toBe(1);
        await act(async () => {
            await queryClient.refetchQueries({ queryKey: ['chat-filter'] });
        });
        await waitFor(() => expect(filterReads).toBe(2));
        await waitFor(() => expect(queryClient.getQueryState(['chat-filter'])?.status).toBe('error'));
        expect(view.container.querySelector('textarea')).toHaveValue('unsaved-name');

        fireEvent.click(screen.getByRole('button', { name: 'Resume after signing in' }));
        await waitFor(() => expect(sessionReads).toBe(2));
        await waitFor(() => expect(filterReads).toBe(3));
        expect(await screen.findByLabelText('Blocked names')).toHaveValue('unsaved-name');
        expect(queryClient.getQueryData<{ revision: number }>(['chat-filter'])?.revision).toBe(4);
    });
});
