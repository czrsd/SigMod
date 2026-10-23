export function directoryPagePlan(requested: number, limit: number, matched: number) {
    const totalPages = Math.max(1, Math.ceil(matched / limit));
    const page = Math.min(requested, totalPages);
    const offset = (page - 1) * limit;
    const size = Math.min(limit, matched - offset);
    const fromEnd = matched - offset - size;
    const descending = fromEnd < offset;
    return { page, totalPages, size, descending, skip: descending ? fromEnd : offset };
}
