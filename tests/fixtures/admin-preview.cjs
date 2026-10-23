// Local-only synthetic preview. Never mounted by the application server.
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
process.chdir(path.join(root, 'server'));
const express = require(path.join(root, 'server/node_modules/express'));
const { fieldCatalog, matchesUser, parseUserQuery } = require(path.join(root, 'server/dist/admin/data/user-query'));
const app = express();
const names = ['Orion', 'Nova', 'Atlas', 'Luna', 'Echo', 'Sable', 'Vega', 'Guest'];
const accounts = names.map((nick, i) => ({
    _id: `0123456789abcdef${String(i).padStart(8, '0')}`,
    nick,
    level: 12 + i * 9,
    clan: ['NOVA', null, 'ARC'][i % 3],
    gold: i * 1270,
    email: `${nick.toLowerCase()}@example.test`,
    givenName: nick,
    lastAuth: Date.now() - i * 120000,
    hourlyTime: i * 300,
    cards: { rare: i + 1 },
    sigma: { season: { level: i, rewards: { 0: true, 1: false } } },
}));
const active = accounts.map((user, i) => ({
    sid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    nick: user.nick,
    server: ['EU FFA #1', 'EU FFA #2', 'NA FFA #1'][i % 3],
    tag: user.clan,
    score: [28410, 15320, 8720, 4190, 2260, 1670, 0, 0][i],
    ping: 23 + i * 6,
    isAlive: i < 6,
    isWsAlive: true,
    connectedAt: new Date(Date.now() - (i + 1) * 400000).toISOString(),
    lastPongAt: new Date().toISOString(),
    clientVersion: '5.0.0',
    position: { x: i * 123.4, y: i * 85.2 },
    connection: { path: '/ws/v5', ip: `192.0.2.${i + 1}`, userAgent: 'Synthetic preview browser' },
    user: i < 7 ? user : null,
    storedUser: i < 7 ? user : null,
    modUser: i < 4 ? { username: user.nick, role: 'Member' } : null,
    storedModUser: null,
    settings: null,
}));
app.get('/api/v5/admin/auth/session', (_req, res) =>
    res.json({ authenticated: true, admin: { id: 'preview', displayName: 'Local preview' }, csrfToken: 'synthetic-preview' })
);
for (const [mode, rows] of [
    ['active-users', active],
    ['sigmally-users', accounts],
]) {
    app.get(`/api/v5/admin/${mode}/fields`, (_req, res) => res.json({ fields: fieldCatalog(rows) }));
    app.get(`/api/v5/admin/${mode}`, (req, res) => {
        const items = rows.filter((row) => matchesUser(row, parseUserQuery(req.query)));
        res.json({
            items,
            nextCursor: null,
            fields: fieldCatalog(rows),
            total: rows.length,
            matched: items.length,
            capturedAt: new Date(),
        });
    });
    app.get(`/api/v5/admin/${mode}/:id`, (req, res) => {
        const user = rows.find((row) => (row.sid ?? row._id) === req.params.id);
        if (!user) return res.status(404).json({ error: 'Connection ended.' });
        res.json({ user, capturedAt: new Date() });
    });
}
app.get('/api/v5/admin/promotions', (_req, res) => res.json([]));
app.get('/preview-desktop', (_req, res) =>
    res.send(
        '<!doctype html><html><head><title>Desktop dashboard preview</title></head><body style="margin:0;background:#11131f"><iframe title="Desktop dashboard" src="/admin/active-users" style="width:1440px;height:1080px;border:0;display:block"></iframe></body></html>'
    )
);
app.use('/admin', express.static(path.join(root, 'admin/dist')));
app.get('/admin/*', (_req, res) => res.sendFile(path.join(root, 'admin/dist/index.html')));
app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }));
app.listen(4174, '127.0.0.1', () => console.log('Synthetic preview: http://127.0.0.1:4174/admin/active-users'));
