import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const rootDir = normalize(join(process.cwd()));
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function resolvePath(urlPath) {
  const pathname = urlPath === '/' ? '/publish/drukkit.html' : urlPath;
  const decoded = decodeURIComponent(pathname.split('?')[0]);
  const fullPath = normalize(join(rootDir, decoded));
  if (!fullPath.startsWith(rootDir)) return null;
  return fullPath;
}

const server = createServer(async (req, res) => {
  const fullPath = resolvePath(req.url || '/');
  if (!fullPath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const file = await readFile(fullPath);
    const type = mimeTypes[extname(fullPath)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Drukkit test server listening on http://127.0.0.1:${port}`);
});
