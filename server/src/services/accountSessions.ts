const pending = new Map<string, Promise<unknown>>();

export async function withAccountSession<T>(userId: string, action: () => Promise<T>): Promise<T> {
    const previous = pending.get(userId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    pending.set(userId, current);
    try {
        return await current;
    } finally {
        if (pending.get(userId) === current) pending.delete(userId);
    }
}
