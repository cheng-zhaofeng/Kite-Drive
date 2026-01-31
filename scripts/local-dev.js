const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const apiReserve = require('../api/reserve');

const publicDir = path.join(__dirname, '..', 'public');
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, 'Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = contentTypes[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/api/reserve') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', async () => {
      try {
        req.body = raw || '{}';
        await apiReserve(req, res);
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      }
    });
    return;
  }

  serveStatic(req, res, parsed.pathname);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Local demo running at http://localhost:${port}`);
});
