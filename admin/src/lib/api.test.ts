import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, setCsrfToken } from './api';

describe('admin API transport', () => {
    beforeEach(() => {
        setCsrfToken(null);
        vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        setCsrfToken(null);
    });

    it('uses same-origin credentials and sends CSRF only with writes', async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        await api.get('/health');
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
        expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('X-Admin-CSRF')).toBe(false);

        setCsrfToken('csrf-value');
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { saved: true } }), { status: 200 }));
        await expect(api.post('/settings', { enabled: true })).resolves.toEqual({ saved: true });
        expect(fetchMock.mock.calls[1][0]).toBe('/api/v5/admin/settings');
        expect(fetchMock.mock.calls[1][1]).toMatchObject({
            method: 'POST',
            credentials: 'same-origin',
            body: JSON.stringify({ enabled: true }),
        });
        expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('X-Admin-CSRF')).toBe('csrf-value');
    });

    it('rejects a write without a token before making a request and does not retry uncertain failures', async () => {
        const fetchMock = vi.mocked(fetch);
        await expect(api.put('/settings', {})).rejects.toMatchObject({ status: 401 });
        expect(fetchMock).not.toHaveBeenCalled();

        setCsrfToken('csrf-value');
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'database unavailable' }), { status: 503 }));
        await expect(api.put('/settings', { enabled: true })).rejects.toMatchObject({ status: 503, uncertain: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('dispatches one unauthorized event and preserves uncertain network-write failures', async () => {
        const fetchMock = vi.mocked(fetch);
        const denied = vi.fn();
        window.addEventListener('admin:unauthorized', denied);
        fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
        await expect(api.get('/auth/session')).rejects.toBeInstanceOf(ApiError);
        expect(denied).toHaveBeenCalledTimes(1);

        setCsrfToken('csrf-value');
        fetchMock.mockRejectedValueOnce(new TypeError('network down'));
        await expect(api.post('/settings', {})).rejects.toMatchObject({ status: 0, uncertain: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        window.removeEventListener('admin:unauthorized', denied);
    });

    it('turns an aborted read into AbortError', async () => {
        const fetchMock = vi.mocked(fetch).mockImplementation(
            (_input, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
                })
        );
        const controller = new AbortController();
        const pending = api.get('/settings', controller.signal);
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
