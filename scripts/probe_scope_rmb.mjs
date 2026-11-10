// ═══ 炮长镜 2 档切换 + 羽化遮罩探针 ═══
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8080';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=default', '--enable-unsafe-webgpu', '--window-size=1600,900', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('loading') || document.getElementById('loading').classList.contains('hide'), { timeout: 120000 });
await sleep(1500);
await page.evaluate(() => document.getElementById('screen-cover').click());
await sleep(400);
await page.evaluate(() => document.getElementById('btn-war-mode').click());
await sleep(600);
// 默认坦克 t-90m3 → zoomSteps [4,12]
await page.evaluate(() => document.querySelector('#fh-map-row [data-map="town"]').click());
await sleep(300);
await page.evaluate(() => document.querySelector('#screen-hangar [data-action="start"]').click());
await sleep(2500);

// Shift 点击开镜（闩锁）
await page.keyboard.down('ShiftLeft');
await page.keyboard.up('ShiftLeft');
await sleep(900);
const inScope = await page.evaluate(() => ({ aiming: window.__game.rig.aiming, zoom: window.__game.rig.zoomTarget }));

// 镜内右键点击（Puppeteer 在 pointer lock 下：dispatch mousePressed）
await page.mouse.down({ button: 'right' });
await sleep(150);
await page.mouse.up({ button: 'right' });
await sleep(900);   // zoomMag 阻尼趋近
const z1 = await page.evaluate(() => ({ zoom: window.__game.rig.zoomTarget.toFixed(2), mag: window.__game.rig.zoomMag.toFixed(2), aiming: window.__game.rig.aiming }));

// 第二次右键 → 应切回低档（4）
await page.mouse.down({ button: 'right' });
await sleep(150);
await page.mouse.up({ button: 'right' });
await sleep(900);
const z2 = await page.evaluate(() => ({ zoom: window.__game.rig.zoomTarget.toFixed(2), mag: window.__game.rig.zoomMag.toFixed(2), aiming: window.__game.rig.aiming }));

// 羽化遮罩断言：无 stroke 硬边外环，渐变 stop 5 个
const mask = await page.evaluate(() => ({
  stops: document.querySelectorAll('#gs-vignette stop').length,
  hardStrokes: document.querySelectorAll('#gs-svg circle[stroke]:not(.gsr-bg):not(.gsr-fg)').length,
}));
await page.screenshot({ path: 'shot_scope_feathered.png' });
// Shift 再点一下 = 关镜（闩锁切换）
await page.keyboard.down('ShiftLeft');
await page.keyboard.up('ShiftLeft');
await sleep(600);
const closed = await page.evaluate(() => window.__game.rig.aiming);
// 补断言：镜外右键不再开镜
await page.mouse.down({ button: 'right' });
await sleep(120);
await page.mouse.up({ button: 'right' });
await sleep(500);
const rmbNoScope = await page.evaluate(() => window.__game.rig.aiming);

const steps = [4, 12];
const ok = inScope.aiming
  && Math.abs(parseFloat(z1.zoom) - steps[1]) < 0.01
  && Math.abs(parseFloat(z2.zoom) - steps[0]) < 0.01
  && z1.aiming && z2.aiming
  && mask.stops === 5 && mask.hardStrokes === 0
  && !closed && !rmbNoScope;
console.log(JSON.stringify({ inScope, z1, z2, mask, closed, rmbNoScope }, null, 2));
console.log(ok ? 'PASS Shift 闩锁开/关镜 + 右键 2 档循环（4↔12）+ 镜外右键不开镜 + 羽化遮罩' : 'FAIL');
console.log('ERRORS:', errors.length ? errors.slice(0, 6) : '(none)');
await browser.close();
process.exit(ok && errors.length === 0 ? 0 : 1);
