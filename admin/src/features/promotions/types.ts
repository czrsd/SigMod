import { api } from '@/lib/api';

export type Promotion = {
    id: string;
    revision: number;
    title: string;
    description: string;
    titleColor: string;
    descriptionColor: string;
    imageUrl: string;
    link: string;
    buttonText: string;
    html: string;
    css: string;
    placement: 'menu-card';
    enabled: boolean;
    startsAt: string | null;
    expiresAt: string | null;
};
export type Draft = Omit<Promotion, 'id' | 'revision'>;
export const blank: Draft = {
    title: '',
    description: '',
    titleColor: '#ffffff',
    descriptionColor: '#a0a0a0',
    imageUrl: '',
    link: '',
    buttonText: '',
    html: '<article><img src="{{imageUrl}}" alt=""><div><h2>{{title}}</h2><p>{{description}}</p></div></article>',
    css: '',
    placement: 'menu-card',
    enabled: false,
    startsAt: null,
    expiresAt: null,
};
export const promotionListQuery = {
    queryKey: ['promotions'] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => api.get<Promotion[]>('/promotions', signal),
    staleTime: 0,
};
