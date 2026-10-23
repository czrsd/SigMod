export function contentUrl(value: string): string | undefined {
    try {
        const url = new URL(value);
        const local = ['localhost', '127.0.0.1', '[::1]'];
        const localDevelopment = local.includes(window.location.hostname) && local.includes(url.hostname);
        if (url.username || url.password || !(url.protocol === 'https:' || (localDevelopment && url.protocol === 'http:')))
            return undefined;
        return url.href;
    } catch {
        return undefined;
    }
}
