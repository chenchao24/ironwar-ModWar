// ═══ 开镜帧数探针：正常视角 vs 狙击镜（含粒子场景） ═══
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
await page.evaluate(() => document.querySelector('#fh-map-row [data-map="town"]').click());
await sleep(300);
await page.evaluate(() => document.querySelector('#screen-hangar [data-action="start"]').click());
await sleep(2500);

// 页内 FPS 计（rAF 计数）
const measure = (ms) => page.evaluate((dur) => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < dur) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(tick);
}), ms);

// 行驶制造烟尘（扬尘+排气），先跑 3 秒
await page.keyboard.down('KeyW');
await sleep(3000);

const fpsDrive = await measure(4000);                    // 正常视角行驶
await page.keyboard.down('ShiftLeft');
await sleep(800);
const fpsAim = await measure(4000);                      // 开镜行驶（尘粒在镜内放大）
// 变焦到最大
await page.mouse.move(800, 450);
await page.mouse.wheel({ deltaY: -300 });
await sleep(600);
const fpsAimZoom = await measure(4000);                  // 开镜+最大变倍
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
const fpsIdle = await measure(3000);                     // 停车静止

// 粒子压力测试：炮击一栋建筑制造大量烟尘，开镜测
await page.keyboard.press('Digit3');
await sleep(200);
await page.mouse.click(800, 450);
await sleep(1500);
await page.keyboard.down('ShiftLeft');
await sleep(500);
const fpsAimSmoke = await measure(4000);                 // 开镜 + 建筑烟尘
await page.keyboard.up('ShiftLeft');

console.log(JSON.stringify({ fpsIdle, fpsDrive, fpsAim, fpsAimZoom, fpsAimSmoke }, null, 2));
console.log('ERRORS:', errors.length ? errors.slice(0, 6) : '(none)');
await browser.close();
process.exit(errors.length ? 1 : 0);
