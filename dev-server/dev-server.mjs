import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 8787;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const types = new Map([
  ['.js', 'text/javascript; charset=utf-8'],
  ['.user.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
]);

function contentType(file) {
  if (file.endsWith('.user.js')) return types.get('.user.js');
  return types.get(path.extname(file).toLowerCase()) || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const decoded = decodeURIComponent(url.pathname);
  const relative = decoded === '/' ? '/README.md' : decoded;
  const file = path.resolve(ROOT, `.${relative}`);

  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(file, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType(file),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('SigMod development server');
  console.log('-------------------------');
  console.log(`Userscript: http://localhost:${PORT}/SigMod.dev.user.js`);
  console.log(`CSS:        http://localhost:${PORT}/sigmod.css`);
  console.log('');
  console.log('Keep this window open while developing.');
  console.log('Press Ctrl+C to stop.');
  console.log('');
});
