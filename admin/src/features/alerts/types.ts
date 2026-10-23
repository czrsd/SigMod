export type AlertRecord = {
    id: string;
    revision: number;
    enabled: boolean;
    title: string;
    description: string;
    link: string;
    buttonText: string;
    expiresAt: string | null;
};
export type NoticeRecord = {
    id: string;
    revision: number;
    enabled: boolean;
    latestClientVersion: string;
    downloadUrl: string;
    message: string;
};
export type AlertDraft = Omit<AlertRecord, 'id'>;
export type NoticeDraft = Omit<NoticeRecord, 'id'>;
