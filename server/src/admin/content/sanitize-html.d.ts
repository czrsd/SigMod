declare module 'sanitize-html' {
    const sanitizeHtml: (dirty: string, options?: Record<string, unknown>) => string;
    export default sanitizeHtml;
}
