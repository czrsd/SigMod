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
function setup(path = '/active-users', mode: 'active-users' | 'sigmally-users' | 'sigmod-users' = 'active-users') {
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


describe.each(['sigmally-users', 'sigmod-users'] as const)('%s numbered pages', (mode) => {
    it('navigates first, last, adjacent pages and resets pagination on search and page size changes', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input), 'http://localhost');
            if (url.pathname.endsWith('/fields')) return Response.json({ fields: [] });
            if (url.pathname.endsWith('/clans')) return Response.json([]);
            const matched = url.searchParams.get('q') ? 0 : 63;
            const limit = Number(url.searchParams.get('limit')) || 25;
            const totalPages = Math.max(1, Math.ceil(matched / limit));
            const page = Math.min(Number(url.searchParams.get('page')) || 1, totalPages);
            const size = Math.min(limit, Math.max(0, matched - (page - 1) * limit));
            return Response.json({ total: 80, matched, page, totalPages, items: Array.from({length: size}, (_, i) => ({
                _id: String(i), fullName: mode === 'sigmally-users' ? 'Misty Fix' : undefined,
                username: mode === 'sigmod-users' ? 'Misty' : undefined, nick: 'Unnamed', email: 'test@example.com',
            })) });
        }));
        const { router } = setup('/' + mode, mode);
        await screen.findByText(/Showing 1–25 of 63 matching accounts/);
        expect(screen.getByText('Total accounts').nextElementSibling).toHaveTextContent('80');
        expect(screen.getByText('Matching accounts').nextElementSibling).toHaveTextContent('63');
        expect(screen.getByRole('button', { name: 'First' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Last' }));
        await screen.findByText(/Showing 51–63.*Page 3 of 3/);
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
        await screen.findByText(/Showing 26–50.*Page 2 of 3/);
        fireEvent.click(screen.getByRole('button', { name: 'First' }));
        await screen.findByText(/Showing 1–25.*Page 1 of 3/);
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await screen.findByText(/Showing 26–50.*Page 2 of 3/);
        fireEvent.change(screen.getByLabelText('Entries per page'), {target: {value: '10'}});
        await screen.findByText(/Showing 1–10.*Page 1 of 7/);
        expect(router.state.location.search).not.toContain('page=');
        fireEvent.click(screen.getByRole('button', { name: 'Last' }));
        await screen.findByText(/Showing 61–63.*Page 7 of 7/);
        fireEvent.change(screen.getByLabelText('Search users'), {target: {value: 'none'}});
        await screen.findByText(/Showing 0 of 0 matching accounts.*Page 1 of 1/);
        expect(screen.getByText('Total accounts').nextElementSibling).toHaveTextContent('80');
        expect(router.state.location.search).not.toContain('page=');
    });
});

it('uses the full name in the list and profile and puts the nickname after the email', async () => {
    const user = {_id: '123', fullName: 'Misty Fix', givenName: 'Misty', nick: 'Unnamed', email: 'test@example.com', clan: 'clan1'};
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/fields')) return Response.json({fields: []});
        if (url.endsWith('/clans')) return Response.json([{_id: 'clan1', name: 'Clan', membersLength: 12}]);
        if (url.includes('/sigmally-users/123')) return Response.json({user});
        return Response.json({items: [user], total: 1, matched: 1, page: 1, totalPages: 1});
    }));
    setup('/sigmally-users', 'sigmally-users');
    const link = await screen.findByRole('link', {name: 'View Misty Fix'});
    expect(screen.getByText('test@example.com · Unnamed')).toBeVisible();
    const meter = await screen.findByLabelText('12 of 50 members');
    expect(meter.nextElementSibling).toHaveTextContent('12/50');
    expect(meter.parentElement).toHaveClass('clan-summary-progress');
    fireEvent.click(link);
    await screen.findByRole('heading', {name: 'Misty Fix'});
});
