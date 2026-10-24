export function normalizePartySkin(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 512) return null;
    let name = value.trim();
    if (/^https?:\/\//i.test(name)) {
        try {
            const url = new URL(name);
            if (
                (url.hostname !== 'sigmally.com' && !url.hostname.endsWith('.sigmally.com')) ||
                url.username ||
                url.password ||
                url.port ||
                url.search ||
                url.hash ||
                !url.pathname.startsWith('/static/skins/')
            )
                return null;
            name = decodeURIComponent(url.pathname.slice('/static/skins/'.length));
        } catch {
            return null;
        }
    }
    name = name
        .replace(/^1%/, '')
        .replace(/\.png$/i, '')
        .trim();
    return name.length > 0 && name.length <= 100 && /^[\p{L}\p{N}_ -]+$/u.test(name) ? name : null;
}
