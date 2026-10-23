export class ApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly uncertain = false
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null) => {
    csrfToken = token;
};
const root = '/api/v5/admin';

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal, timeoutMs = 20_000): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path');
    const writing = !['GET', 'HEAD'].includes(method);
    if (writing && !csrfToken) throw new ApiError('Sign in again before saving.', 401);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
        const form = body instanceof FormData;
        const response = await fetch(`${root}${path}`, {
            method,
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                ...(writing ? { 'X-Admin-CSRF': csrfToken! } : {}),
                ...(writing && !form ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(writing ? { body: form ? body : JSON.stringify(body ?? {}) } : {}),
        });
        if (response.status === 204) return undefined as T;
        const payload: unknown = await response.json().catch(() => null);
        if (response.status === 401) window.dispatchEvent(new Event('admin:unauthorized'));
        if (!response.ok) {
            const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
            const message =
                typeof record.error === 'string'
                    ? record.error
                    : typeof record.message === 'string'
                      ? record.message
                      : `Request failed (${response.status}).`;
            throw new ApiError(message, response.status, writing && response.status >= 500);
        }
        if (payload === null) throw new ApiError('The server returned an invalid response.', response.status, writing);
        if (typeof payload === 'object' && 'success' in payload && payload.success === true && 'data' in payload) return payload.data as T;
        return payload as T;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
        throw new ApiError(
            timedOut
                ? path === '/assets/images'
                    ? 'The upload took too long. Check whether it finished before uploading the file again.'
                    : 'The request took too long. Try again.'
                : writing
                  ? 'The save could not be confirmed. Check the current server state before trying again.'
                  : 'Unable to reach the server. Try again.',
            0,
            writing
        );
    } finally {
        window.clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
    }
}

export const api = {
    get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
    post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string, body: unknown) => request<T>('DELETE', path, body),
    async upload(file: File): Promise<{ url: string; bytes: number }> {
        if (file.size > 12 * 1024 * 1024) throw new ApiError('Images must be 12 MiB or smaller.', 400);
        const supportedType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
        const supportedExtension = /\.(?:png|jpe?g|webp)$/i.test(file.name);
        if (!supportedType && !supportedExtension) throw new ApiError('Choose a PNG, JPEG or WebP image.', 400);
        const body = new FormData();
        body.append('image', file);
        return request('POST', '/assets/images', body, undefined, 90_000);
    },
};
