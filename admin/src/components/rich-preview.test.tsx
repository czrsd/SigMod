import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichPreview, sanitizeArticle } from './rich-preview';
import { contentUrl } from '@/lib/content-url';

describe('untrusted article previews', () => {
    it('removes executable markup while keeping supported article formatting', () => {
        const clean = sanitizeArticle(
            '<p onclick="alert(1)">Text <strong>bold</strong></p><script>alert(1)</script><a href="javascript:alert(1)">link</a><img src=x onerror="alert(1)"><iframe src="https://example.com"></iframe>'
        );
        expect(clean).toContain('<strong>bold</strong>');
        expect(clean).not.toMatch(/onclick|script|javascript:|onerror|<img|<iframe/);
    });

    it('isolates the preview, escapes titles and rejects unsafe attachment URLs', () => {
        render(
            <RichPreview
                title={'<img src=x onerror="alert(1)">'}
                html="<p>Article</p>"
                images={['https://example.com/image.webp', 'javascript:alert(1)', 'https://name:password@example.com/private.webp']}
            />
        );
        const frame = screen.getByTitle('Article preview');
        expect(frame).toHaveAttribute('sandbox', '');
        expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
        const source = frame.getAttribute('srcdoc')!;
        expect(source).toContain("default-src 'none'");
        expect(source).toContain('&lt;img');
        expect(source).toContain('https://example.com/image.webp');
        expect(source).not.toContain('javascript:');
        expect(source).not.toContain('private.webp');
    });

    it('rejects credentials, executable schemes and external plaintext HTTP destinations', () => {
        expect(contentUrl('https://example.com/page')).toBe('https://example.com/page');
        for (const value of [
            'javascript:alert(1)',
            'data:text/html,test',
            'https://name:password@example.com',
            'http://example.com/image.webp',
            'invalid',
        ]) {
            expect(contentUrl(value)).toBeUndefined();
        }
    });
});
