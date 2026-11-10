// ═══ 瞄准镜视觉探针：开镜截图 + FoV/放大倍率断言 ═══
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

// 驶向小镇一段后开镜
await page.keyboard.down('KeyW');
await sleep(2500);
await page.keyboard.up('KeyW');
await page.keyboard.down('ShiftLeft');
await sleep(1000);

const info = await page.evaluate(() => {
  const g = window.__game;
  const cam = g.rig;
  return {
    aiming: cam.aiming,
    baseFovEff: cam.aimFovEff().toFixed(1),
    zoomText: document.getElementById('gs-zoom').textContent,
    vignetteStops: document.querySelectorAll('#gs-vignette stop').length,
    maskPath: !!document.querySelector('#gs-svg path'),
  };
});
console.log('SCOPE:', JSON.stringify(info));
await page.screenshot({ path: 'shot_scope_softedge_1x.png' });

// 拉最大变倍
await page.mouse.move(800, 450);
for (let i = 0; i < 8; i++) await page.mouse.wheel({ deltaY: -120 });
await sleep(800);
const zoomMax = await page.evaluate(() => ({
  zoomMag: window.__game.rig.zoomMag.toFixed(2),
  zoomText: document.getElementById('gs-zoom').textContent,
}));
console.log('ZOOM-MAX:', JSON.stringify(zoomMax));
await page.screenshot({ path: 'shot_scope_softedge_max.png' });
await page.keyboard.up('ShiftLeft');

const ok = info.aiming && info.vignetteStops === 4 && zoomMax.zoomMag <= 6.0;
console.log(ok ? 'PASS 镜视觉（暗角渐变 + 倍率上限 6）' : 'FAIL 镜视觉');
console.log('ERRORS:', errors.length ? errors.slice(0, 6) : '(none)');
await browser.close();
process.exit(ok && errors.length === 0 ? 0 : 1);
