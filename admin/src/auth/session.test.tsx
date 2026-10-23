import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '@/components/confirm-action';
import { SessionProvider } from './session';

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get: getMock, post: postMock }, setCsrfToken: vi.fn() }));

function setup() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <ConfirmProvider>
                <SessionProvider>
                    <section data-testid="private-content">Private editor</section>
                </SessionProvider>
            </ConfirmProvider>
        </QueryClientProvider>
    );
}

describe('SessionProvider', () => {
    beforeEach(() => {
        getMock.mockReset();
        postMock.mockReset();
        window.history.replaceState({}, '', '/admin');
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('shows login after an unauthenticated bootstrap without exposing protected content', async () => {
        getMock.mockResolvedValue({ authenticated: false });
        setup();
        expect(await screen.findByRole('heading', { name: 'SigMod Admin' })).toBeInTheDocument();
        expect(screen.queryByTestId('private-content')).not.toBeInTheDocument();
    });

    it('retains the mounted editor behind the expired-session screen after an unauthorized event', async () => {
        getMock.mockResolvedValue({ authenticated: true, admin: { id: 'owner', displayName: 'Owner' }, csrfToken: 'token' });
        const view = setup();
        expect(await screen.findByTestId('private-content')).toBeInTheDocument();
        window.dispatchEvent(new Event('admin:unauthorized'));
        expect(await screen.findByRole('heading', { name: 'Session expired' })).toBeInTheDocument();
        expect(view.getByTestId('private-content')).toBeInTheDocument();
        expect(view.getByTestId('private-content').parentElement).toHaveAttribute('hidden');
        expect(
            screen.getAllByRole('link', { name: 'Continue with Discord' }).find((link) => link.getAttribute('target') === '_blank')
        ).toBeInTheDocument();
    });

    it('can resume the retained session after explicit reauthentication', async () => {
        getMock.mockResolvedValueOnce({ authenticated: true, admin: { id: 'owner', displayName: 'Owner' }, csrfToken: 'token' });
        getMock.mockResolvedValueOnce({ authenticated: true, admin: { id: 'owner', displayName: 'Owner' }, csrfToken: 'new-token' });
        const view = setup();
        await screen.findByTestId('private-content');
        window.dispatchEvent(new Event('admin:unauthorized'));
        await screen.findByRole('heading', { name: 'Session expired' });
        fireEvent.click(screen.getByRole('button', { name: 'Resume after signing in' }));
        await waitFor(() => expect(view.getByTestId('private-content').parentElement).not.toHaveAttribute('hidden'));
        expect(getMock).toHaveBeenCalledTimes(2);
    });
});
