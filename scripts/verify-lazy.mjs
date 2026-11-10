// 按需加载专项验证：冷门车首次切换、连点防重入、冷门车开战、返回菜单、?eager=1 回退
//   node scripts/verify-lazy.mjs
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
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(DIR, rel));
  if (!file.startsWith(DIR)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) fails.push(label);
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=default', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu',
    '--disable-dev-shm-usage', '--window-size=1600,900', '--mute-audio', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.setCacheEnabled(false);
const bad = [], pageErrors = [], consoleErrors = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 180)); });
const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);

try {
  console.log('\n=== A. 首屏只加载默认车 ===');
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state !== 'loading', { timeout: 180000, polling: 300 });
  const cover = await page.evaluate(() => ({
    state: window.__game.state,
    assets: Object.keys(window.__game.assets),
    props: Object.keys(window.__game._mapAssets || {}).length,
    lazy: window.__game._lazyLoad,
  }));
  ok(cover.state === 'cover' && cover.lazy === true, '封面就绪且处于按需加载模式');
  ok(cover.assets.length === 1 && cover.assets[0] === 't-90m3', '首屏仅加载默认车 t-90m3', JSON.stringify(cover.assets));
  ok(cover.props === 6, '6 件布景全部就绪');

  console.log('\n=== B. 冷门车首次切换（异步加载 + 浮标 + 展示车） ===');
  await click('#screen-cover');
  await page.waitForFunction(() => window.__game.state === 'menu', { timeout: 20000, polling: 200 });
  await click('#btn-war-mode');
  await page.waitForFunction(() => window.__game.state === 'hangar', { timeout: 120000, polling: 300 });
  const before = await page.evaluate(() => Object.keys(window.__game.assets).length);
  await page.evaluate(() => {
    document.querySelector('#fh-select-btn').click();
    document.querySelector('.fh-select-item[data-tank="m1a2_trophy"]').click();
  });
  await page.waitForFunction(() => {
    const g = window.__game;
    return g.assets['m1a2_trophy'] && !g._hangarBusy &&
           g.ui.selectedTank === 'm1a2_trophy' && !!g.menuTank;
  }, { timeout: 150000, polling: 300 });
  const after = await page.evaluate(() => ({
    assets: Object.keys(window.__game.assets).length,
    busy: window.__game._hangarBusy,
    menuTank: !!window.__game.menuTank,
    selected: window.__game.ui.selectedTank,
    prewarmed: window.__game._prewarmed.has('m1a2_trophy'),
  }));
  ok(after.selected === 'm1a2_trophy' && after.menuTank && !after.busy,
    '最大体积冷门车(18.8MB)异步切换完成、展示车就绪、浮标已收起',
    `assets ${before} → ${after.assets}`);
  ok(after.prewarmed, '切换后纹理预热完成');

  console.log('\n=== C. 装载期间连点防重入 ===');
  await page.evaluate(() => {
    document.querySelector('#fh-select-btn').click();
    document.querySelector('.fh-select-item[data-tank="kf51"]').click();
    document.querySelector('#fh-select-btn').click();
    document.querySelector('.fh-select-item[data-tank="type_10"]').click();
  });
  await sleep(4000);
  const reentry = await page.evaluate(() => ({
    state: window.__game.state, busy: window.__game._hangarBusy,
    menuTank: !!window.__game.menuTank, assets: Object.keys(window.__game.assets).length,
  }));
  ok(reentry.state === 'hangar' && reentry.menuTank, '连点后状态机未错乱', JSON.stringify(reentry));

  console.log('\n=== D. 用当前车开战（玩家/敌方资产按需补齐） ===');
  const picked = await page.evaluate(() => window.__game.ui.selectedTank);
  await click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 150000, polling: 300 });
  await sleep(1500);
  const battle = await page.evaluate(() => ({
    playerId: window.__game.player?.cfg?.id,
    enemy: window.__game.enemies?.[0]?.cfg?.id,
    assets: Object.keys(window.__game.assets).length,
    calls: window.__game.renderer.info.render.calls,
  }));
  ok(battle.playerId === picked, '玩家车与机库所选一致', `${picked} / ${battle.playerId}`);
  ok(battle.assets < 20, '开战后仍未全量加载 20 辆车', `已载 ${battle.assets} 辆`);

  console.log('\n=== E. 返回菜单后展示车恢复 ===');
  await page.evaluate(() => window.__game._endToMenu());
  await sleep(1200);
  const menu = await page.evaluate(() => ({ state: window.__game.state, menuTank: !!window.__game.menuTank }));
  ok(menu.state === 'menu' && menu.menuTank, '回主菜单后展示车正常');

  console.log('\n=== F. ?eager=1 全量预载回退可用 ===');
  await page.goto(BASE + '/index.html?eager=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state !== 'loading', { timeout: 240000, polling: 300 });
  const eager = await page.evaluate(() => ({ lazy: window.__game._lazyLoad, assets: Object.keys(window.__game.assets).length }));
  ok(eager.lazy === false && eager.assets === 20, '回退开关生效，首屏加载 20 辆车', JSON.stringify(eager));
} catch (e) {
  fails.push('验证流程中断: ' + e.message);
  console.log('  FAIL  验证流程中断: ' + e.message);
} finally {
  await browser.close();
  server.close();
}

console.log('\n=== 汇总 ===');
console.log(`404/请求失败 ${bad.length}，页面异常 ${pageErrors.length}，控制台错误 ${consoleErrors.length}，断言失败 ${fails.length}`);
for (const x of [...bad.slice(0, 6), ...pageErrors.slice(0, 6), ...consoleErrors.slice(0, 6), ...fails]) console.log('  - ' + x);
if (bad.length || pageErrors.length || fails.length) process.exitCode = 1;
