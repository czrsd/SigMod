import DOMPurify from 'dompurify';
import { contentUrl } from '@/lib/content-url';
const tags = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'a'];
export function sanitizeArticle(html: string) {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: tags, ALLOWED_ATTR: ['href', 'title', 'rel', 'target'], ALLOW_DATA_ATTR: false });
}
function escape(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
export function RichPreview({ html, title, images = [] }: { html: string; title?: string; images?: string[] }) {
    const safeImages = images.flatMap((value) => {
        const url = contentUrl(value);
        return url ? [url] : [];
    });
    const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{margin:0;padding:24px;background:#111111;color:#ededed;font:14px/1.65 system-ui;overflow-wrap:anywhere}h1{font-size:22px;margin-top:0}h2{font-size:19px}h3{font-size:17px}a{color:#c5a46d}img{max-width:100%;height:auto;border-radius:6px;margin-top:12px}blockquote{border-left:2px solid #555555;margin-left:0;padding-left:14px;color:#b0b0b0}</style></head><body>${title ? `<h1>${escape(title)}</h1>` : ''}${sanitizeArticle(html)}${safeImages.map((url) => `<img src="${escape(url)}" alt="Article attachment" loading="lazy">`).join('')}</body></html>`;
    return <iframe title="Article preview" className="article-preview" sandbox="" referrerPolicy="no-referrer" srcDoc={source} />;
}
