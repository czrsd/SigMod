import { contentEvents, getPublicContentSnapshot } from '../admin/content/public';

export type ClientContentSnapshot = Awaited<ReturnType<typeof getPublicContentSnapshot>>;
let current: ClientContentSnapshot = {
    alert: { id: 'alert', revision: 0, enabled: false, title: '', description: '', link: '', buttonText: '', expiresAt: null },
    updateNotice: { id: 'updateNotice', revision: 0, enabled: false, latestClientVersion: '', downloadUrl: '', message: '' },
    promotions: [],
};

export const getCachedClientContent = (): ClientContentSnapshot => {
    const now = Date.now();
    return {
        ...current,
        alert: {
            ...current.alert,
            enabled: current.alert.enabled && (!current.alert.expiresAt || Date.parse(current.alert.expiresAt) > now),
        },
        promotions: current.promotions.filter(
            (item: { enabled: boolean; startsAt?: string | null; expiresAt?: string | null }) =>
                item.enabled &&
                (!item.startsAt || Date.parse(item.startsAt) <= now) &&
                (!item.expiresAt || Date.parse(item.expiresAt) > now)
        ),
    };
};

export const startClientContentPublisher = async (publish: (type: string, content: unknown) => void): Promise<() => void> => {
    let stopped = false;
    let refreshing = false;
    let pending = false;
    let last = '';
    const refresh = async (): Promise<void> => {
        if (stopped) return;
        if (refreshing) {
            pending = true;
            return;
        }
        refreshing = true;
        try {
            do {
                pending = false;
                try {
                    current = await getPublicContentSnapshot();
                } catch {
                    // Preserve the last good configuration; local expiry still applies during a database interruption.
                }
                if (stopped) return;
                const snapshot = getCachedClientContent();
                const fingerprint = JSON.stringify(snapshot);
                if (fingerprint !== last) {
                    last = fingerprint;
                    publish('client-content', snapshot);
                    publish('alert', snapshot.alert);
                }
            } while (pending && !stopped);
        } finally {
            refreshing = false;
        }
    };
    const changed = (key: string) => {
        if (key === 'chatFilter') publish('chat-filter-updated', {});
        if (key.startsWith('translation:')) publish('locale-updated', { locale: key.slice('translation:'.length) });
        void refresh();
    };
    const announcement = () => publish('announcements-updated', {});
    contentEvents.on('changed', changed);
    contentEvents.on('announcement', announcement);
    await refresh();
    const timer = setInterval(() => {
        void refresh();
    }, 15_000);
    timer.unref();
    return () => {
        stopped = true;
        clearInterval(timer);
        contentEvents.off('changed', changed);
        contentEvents.off('announcement', announcement);
    };
};
