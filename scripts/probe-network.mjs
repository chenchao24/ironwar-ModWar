// 分阶段网络流量实测：量化「按需加载」相对「全量预载」的传输收益
//   node scripts/probe-network.mjs
// 数据源：CDP Network.loadingFinished.encodedDataLength（真实传输字节，禁用缓存）
// 阶段：cover 首屏 → menu 主菜单 → hangar 机库(含邻车预热) → battle 开战
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'dist');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(DIR, rel));
  if (!file.startsWith(DIR)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('404'); return; }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (b) => (b / 1048576).toFixed(2) + ' MB';

function classify(url) {
  try {
    const p = new URL(url).pathname;
    const m = /\.(glb|mp3|js|mjs|wasm|css|png|jpe?g|svg|json|html)$/i.exec(p);
    return m ? m[1].toLowerCase() : 'other';
  } catch { return 'other'; }
}

async function run(label, query) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--use-angle=default', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu',
      '--disable-dev-shm-usage', '--window-size=1600,900', '--mute-audio', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.setCacheEnabled(false);
  const client = await page.createCDPSession();
  await client.send('Network.enable');

  const meta = new Map(), done = new Set();
  const total = { bytes: 0, count: 0, byType: {} };
  client.on('Network.requestWillBeSent', (e) => meta.set(e.requestId, e.request.url));
  client.on('Network.loadingFinished', (e) => {
    if (done.has(e.requestId)) return;
    done.add(e.requestId);
    const b = e.encodedDataLength || 0;
    total.bytes += b; total.count++;
    const t = classify(meta.get(e.requestId) || BASE);
    total.byType[t] = (total.byType[t] || 0) + b;
  });

  const stages = [];
  const mark = async (name, settleMs) => {
    await sleep(settleMs);
    const assets = await page.evaluate(() => Object.keys(window.__game?.assets || {}).length).catch(() => 0);
    stages.push({ name, bytes: total.bytes, count: total.count, byType: { ...total.byType }, assets });
  };
  const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);

  try {
    await page.goto(BASE + '/index.html' + query, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__game && window.__game.state !== 'loading',
      { timeout: 240000, polling: 300 });
    await mark('cover', 1500);
    await click('#screen-cover');
    await page.waitForFunction(() => window.__game.state === 'menu', { timeout: 20000, polling: 200 });
    await mark('menu', 1200);
    await click('#btn-war-mode');
    await page.waitForFunction(() => window.__game.state === 'hangar', { timeout: 120000, polling: 300 });
    await mark('hangar', 2500);
    await click('#screen-hangar [data-action="start"]');
    await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 150000, polling: 300 });
    await mark('battle', 2500);
  } catch (e) {
    console.log(`  [${label}] 流程中断: ${e.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\n=== ${label}  (${query || '默认'}) ===`);
  console.log('阶段        累计传输      阶段增量    车辆GLB/累计   已载车辆   主要增量构成');
  let prev = { bytes: 0, byType: {} };
  for (const s of stages) {
    const d = s.bytes - prev.bytes;
    const delta = {};
    for (const [k, v] of Object.entries(s.byType)) {
      const x = v - (prev.byType[k] || 0);
      if (x > 10240) delta[k] = x;
    }
    const parts = Object.entries(delta).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${mb(v)}`).join(', ') || '—';
    console.log(`${s.name.padEnd(10)} ${mb(s.bytes).padStart(11)} ${mb(d).padStart(12)}  ${String(s.assets).padStart(6)} 辆     ${parts}`);
    prev = s;
  }
  return stages;
}

try {
  const lazy = await run('按需加载', '');
  const eager = await run('全量预载', '?eager=1');
  const a = lazy.find((s) => s.name === 'cover')?.bytes || 0;
  const b = eager.find((s) => s.name === 'cover')?.bytes || 0;
  if (a && b) {
    console.log(`\n=== 首屏对比 ===`);
    console.log(`全量预载 ${mb(b)}  →  按需加载 ${mb(a)}   下降 ${((1 - a / b) * 100).toFixed(1)}%（省 ${mb(b - a)}）`);
  }
} finally {
  server.close();
}
