// 极简静态服务器：node server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const port = Number(process.argv[2]) || 8080;
const root = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
};

const GZIP_TYPES = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.glb']);

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('404 Not Found'); return; }
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
    };
    // 缓存：开发期代码文件一律不缓存（每次重新拉取），模型/贴图等资源缓存 1 小时
    const NO_CACHE = new Set(['.html', '.js', '.mjs', '.css']);
    headers['Cache-Control'] = NO_CACHE.has(ext) ? 'no-store' : 'public, max-age=3600';
    // gzip 压缩
    const acceptGzip = (req.headers['accept-encoding'] || '').includes('gzip');
    if (acceptGzip && GZIP_TYPES.has(ext) && data.length > 1024) {
      zlib.gzip(data, { level: 5 }, (err, buf) => {
        if (err) { res.writeHead(200, headers); res.end(data); return; }
        headers['Content-Encoding'] = 'gzip';
        headers['Content-Length'] = buf.length;
        res.writeHead(200, headers);
        res.end(buf);
      });
    } else {
      res.writeHead(200, headers);
      res.end(data);
    }
  });
}).listen(port, () => console.log(`IronWar Tank server: http://localhost:${port}`));
