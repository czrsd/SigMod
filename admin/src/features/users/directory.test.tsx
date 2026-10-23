import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { UsersDirectory, UserDetail } from './directory';

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
const row = {
    sid: '00000000-0000-4000-8000-000000000001',
    nick: 'Orion',
    user: { sigma: { season: { level: 7 } } },
    score: 1200,
    isAlive: true,
};
function setup(path = '/active-users', mode: 'active-users' | 'sigmally-users' = 'active-users') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
        [
            { path: `/${mode}`, element: <UsersDirectory mode={mode} /> },
            { path: `/${mode}/:id`, element: <UserDetail mode={mode} /> },
        ],
        { initialEntries: [path] }
    );
    render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    );
    return { router, client };
}
function mockFetch() {
    const calls: string[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            calls.push(url);
            if (url.endsWith('/fields')) return Response.json({ fields: [{ path: 'gold', types: ['number'] }] });
            if (url.includes(row.sid)) return Response.json({ user: row });
            return Response.json({ items: [row], total: 1, matched: 1, fields: [{ path: 'score', types: ['number'] }, { path: 'user.sigma.season.level', types: ['number'] }], nextCursor: null });
        })
    );
    return calls;
}

describe('user directories', () => {
    it('applies a nested custom field with explicit type and preserves it in the URL', async () => {
        const calls = mockFetch();
        const { router } = setup();
        await screen.findByRole('link', { name: 'View Orion' });
        fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
        fireEvent.click(screen.getByRole('combobox', { name: 'Filter 1 field' }));
        fireEvent.change(screen.getByLabelText('Search available fields'), { target: { value: 'user.sigma.season.level' } });
        fireEvent.click(await screen.findByTitle('user.sigma.season.level'));
        fireEvent.change(screen.getByLabelText('Filter 1 type'), { target: { value: 'number' } });
        fireEvent.change(screen.getByLabelText('Filter 1 operator'), { target: { value: 'gte' } });
        fireEvent.change(screen.getByLabelText('Filter 1 value'), { target: { value: '7' } });
        await waitFor(() => expect(calls.some((url) => url.includes('filters='))).toBe(true));
        expect(JSON.parse(new URLSearchParams(router.state.location.search).get('filters')!)).toEqual([
            { field: 'user.sigma.season.level', type: 'number', op: 'gte', value: '7' },
        ]);
        expect((await screen.findByRole('link', { name: 'View Orion' })).getAttribute('href')).toContain('filters=');
    });

    it('searches Sigmally users in any chosen field and auto-selects known numeric types', async () => {
        const calls = mockFetch();
        setup('/sigmally-users', 'sigmally-users');
        await waitFor(() => expect(calls.some((url) => url.endsWith('/fields'))).toBe(true));
        fireEvent.change(screen.getByLabelText('Search users'), { target: { value: '100' } });
        fireEvent.click(screen.getByRole('combobox', { name: 'Search field' }));
        fireEvent.change(screen.getByLabelText('Search available fields'), { target: { value: 'gold' } });
        fireEvent.click(await screen.findByTitle('gold'));
        await waitFor(() => expect(calls.some((url) => url.includes('q=100') && url.includes('searchField=gold'))).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
        fireEvent.click(screen.getByRole('combobox', { name: 'Filter 1 field' }));
        fireEvent.change(screen.getByLabelText('Search available fields'), { target: { value: 'gold' } });
        fireEvent.click(await screen.findByTitle('gold'));
        expect(screen.getByLabelText('Filter 1 type')).toHaveValue('number');
    });

    it('finds a fully qualified nested path in user details', async () => {
        mockFetch();
        setup('/active-users/' + row.sid);
        const search = await screen.findByLabelText('Search user data');
        fireEvent.change(search, { target: { value: 'user.sigma.season.level' } });
        expect(screen.getByText('level')).toBeVisible();
        expect(screen.getByText('7')).toBeVisible();
        expect(screen.queryByText('No matching fields')).not.toBeInTheDocument();
    });

    it('removes cached live details after the connection ends', async () => {
        mockFetch();
        const { client } = setup('/active-users/' + row.sid);
        await screen.findByLabelText('Search user data');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Response.json({ error: 'Connection ended.' }, { status: 404 }))
        );
        await client.invalidateQueries({ queryKey: ['active-users', 'detail', row.sid] });
        await screen.findByText('Connection ended.');
        expect(screen.queryByLabelText('Search user data')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Orion' })).not.toBeInTheDocument();
    });
});
