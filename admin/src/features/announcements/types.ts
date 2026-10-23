export type Announcement = {
    id: string;
    _id?: string;
    revision: number;
    date: string;
    status: 'draft' | 'published' | 'archived';
    preview: { title: string; description: string; icon: string; pinned: boolean };
    full: { title: string; description: string; images: string[] };
};
export type Draft = Omit<Announcement, 'id' | '_id' | 'revision'>;
