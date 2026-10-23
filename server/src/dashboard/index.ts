import express, { Request, Response, Router } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export const dashboardBuildDirectory = (): string => path.resolve(process.env.ADMIN_DASHBOARD_BUILD_DIR || path.resolve(__dirname, '../../../admin/dist'));

const isDevelopmentProxyEnabled = (): boolean => process.env.NODE_ENV !== 'production' && process.env.ADMIN_VITE_DEV === 'true';

const productionCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' https: blob: data:",
    "connect-src 'self'",
    "frame-src 'self' about:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

const developmentCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' http://127.0.0.1:5173 http://localhost:5173",
    "style-src 'self' 'unsafe-inline' http://127.0.0.1:5173 http://localhost:5173",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' https: blob: data:",
    "connect-src 'self' http://127.0.0.1:5173 http://localhost:5173 ws://127.0.0.1:5173 ws://localhost:5173",
    "frame-src 'self' about:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

const applyDashboardHeaders = (req: Request, res: Response, next: express.NextFunction): void => {
    res.setHeader('Content-Security-Policy', isDevelopmentProxyEnabled() ? developmentCsp : productionCsp);
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
};

const proxyHeaders = (headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders => {
    const forwarded: http.OutgoingHttpHeaders = {};
    const hopByHop = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host', 'cookie', 'authorization']);
    for (const [key, value] of Object.entries(headers)) {
        if (!hopByHop.has(key.toLowerCase()) && value !== undefined) forwarded[key] = value;
    }
    forwarded.host = '127.0.0.1:5173';
    return forwarded;
};

const proxyToVite = (req: Request, res: Response): void => {
    const upstream = http.request({
        hostname: '127.0.0.1',
        port: 5173,
        method: req.method,
        path: req.originalUrl,
        headers: proxyHeaders(req.headers),
    }, (upstreamResponse) => {
        res.status(upstreamResponse.statusCode || 502);
        for (const [name, value] of Object.entries(upstreamResponse.headers)) {
            if (value !== undefined && !['connection', 'keep-alive', 'transfer-encoding', 'upgrade'].includes(name.toLowerCase())) {
                res.setHeader(name, value);
            }
        }
        upstreamResponse.pipe(res);
    });
    upstream.on('error', () => {
        if (!res.headersSent) res.status(502).type('text/plain').send('Admin development server is unavailable.');
        else res.destroy();
    });
    upstream.setTimeout(15_000, () => upstream.destroy(new Error('Development server timed out.')));
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
};

const router: Router = express.Router();
router.use(applyDashboardHeaders);

router.use((req, res, next) => {
    if (req.originalUrl.split('?', 1)[0] === '/admin') return res.redirect(308, '/admin/');
    next();
});

router.use((req, res, next): void => {
    if (isDevelopmentProxyEnabled()) {
        if (req.method === 'GET' || req.method === 'HEAD') {
            proxyToVite(req, res);
            return;
        }
        res.sendStatus(405);
        return;
    }

    const buildDirectory = dashboardBuildDirectory();
    if (!fs.existsSync(path.join(buildDirectory, 'index.html'))) {
        res.status(503).type('text/plain').send('Admin dashboard is not built. Run the admin build before starting the production server.');
        return;
    }

    const staticFiles = express.static(buildDirectory, {
        dotfiles: 'deny',
        index: false,
        fallthrough: true,
        setHeaders(response, filename) {
            response.setHeader('Cache-Control', filename.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
        },
    });
    staticFiles(req, res, (error?: unknown) => {
        if (error) return next(error);
        const isNavigation = (req.method === 'GET' || req.method === 'HEAD') &&
            req.get('accept')?.includes('text/html') === true &&
            path.extname(req.path) === '';
        if (!isNavigation) {
            res.status(404).type('text/plain').send('Not found.');
            return;
        }
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(buildDirectory, 'index.html'));
    });
});

export default router;
