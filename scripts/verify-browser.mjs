// 端到端验证上线主体：自建静态服务 + 无头 Chrome 走完 封面 → 菜单 → 机库 → 战斗
//   node scripts/verify-browser.mjs
// 检查 404 / 请求失败 / 页面异常 / WebGL 渲染统计；不依赖外部服务。
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
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file).pipe(res);
    }
  });
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${server.address().port}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bad = [], pageErrors = [], consoleErrors = [];

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--use-angle=default', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu',
      '--disable-dev-shm-usage', '--window-size=1600,900', '--mute-audio', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => bad.push(`FAILED ${r.url()} ${r.failure()?.errorText || ''}`));
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 180)); });

  console.log('打开', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state !== 'loading',
    { timeout: 180000, polling: 500 });
  const cover = await page.evaluate(() => ({
    state: window.__game.state,
    tanks: Object.keys(window.__game.assets || {}).length,
    props: Object.keys(window.__game._mapAssets || {}).length,
  }));
  console.log('封面就绪:', JSON.stringify(cover));

  const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
  await click('#screen-cover');
  await page.waitForFunction(() => window.__game.state === 'menu', { timeout: 20000, polling: 200 });
  console.log('主菜单: ok');

  await click('#btn-war-mode');
  await page.waitForFunction(() => window.__game.state === 'hangar', { timeout: 60000, polling: 300 });
  console.log('机库就绪: ok');

  await click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 90000, polling: 300 });
  await sleep(2500);
  const battle = await page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.state,
      player: g.player?.cfg?.name || null,
      enemy: g.enemies?.[0]?.cfg?.name || null,
      drawCalls: g.renderer.info.render.calls,
      triangles: g.renderer.info.render.triangles,
      textures: g.renderer.info.memory.textures,
      geometries: g.renderer.info.memory.geometries,
    };
  });
  console.log('战斗就绪:', JSON.stringify(battle));
} catch (e) {
  pageErrors.push('验证流程中断: ' + e.message);
} finally {
  if (browser) await browser.close();
  server.close();
}

console.log('\n=== 检查结果 ===');
console.log(`404/请求失败 ${bad.length} 条，页面异常 ${pageErrors.length} 条，控制台错误 ${consoleErrors.length} 条`);
for (const x of [...bad.slice(0, 10), ...pageErrors.slice(0, 10), ...consoleErrors.slice(0, 10)]) console.log('  - ' + x);
if (bad.length || pageErrors.length) process.exitCode = 1;
