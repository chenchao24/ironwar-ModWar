// ═══ 行驶杂音诊断：静止 5s + 直线行驶 8s 期间物件音触发统计（小镇+平原） ═══
// 找出"正常行驶中持续杂音"的触发源：按音效名统计次数与音量分布
// 用法：node server.js 后 node scripts/probe_drive_noise.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=default', '--window-size=1600,900', '--mute-audio'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

async function runMap(map) {
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => !document.getElementById('loading') || document.getElementById('loading').classList.contains('hide'), { timeout: 120000 });
  await sleep(1200);
  await page.evaluate(() => document.getElementById('screen-cover').click());
  await sleep(400);
  await page.evaluate(() => document.getElementById('btn-war-mode').click());
  await sleep(600);
  await page.evaluate((m) => document.querySelector(`#fh-map-row [data-map="${m}"]`).click(), map);
  await sleep(300);
  await page.evaluate(() => document.querySelector('#screen-hangar [data-action="start"]').click());
  await sleep(2000);

  await page.evaluate(() => {
    window.__propCalls = [];
    const orig = window.__audio.playProp.bind(window.__audio);
    window.__audio.playProp = (name, vol) => { window.__propCalls.push(`${name}@${(vol ?? 0).toFixed(2)}`); return orig(name, vol); };
    window.__t0 = performance.now();
  });

  // —— 阶段1：原地静止 5s ——
  await sleep(5000);
  const still = await page.evaluate(() => window.__propCalls.splice(0));

  // —— 阶段2：直线前进 8s（出生点沿路向北）——
  await page.keyboard.down('KeyW');
  await sleep(8000);
  await page.keyboard.up('KeyW');
  await sleep(500);
  const drive = await page.evaluate(() => window.__propCalls.splice(0));

  const stat = (list) => {
    const agg = {};
    for (const c of list) {
      const [n, v] = c.split('@');
      (agg[n] = agg[n] || []).push(+v);
    }
    return Object.fromEntries(Object.entries(agg).map(([n, vs]) => [n, `${vs.length}× vol ${Math.min(...vs).toFixed(2)}~${Math.max(...vs).toFixed(2)}`]));
  };
  console.log(`【${map}】静止5s: ${still.length ? JSON.stringify(stat(still)) : '(无)'}`);
  console.log(`【${map}】直线行驶8s: ${drive.length ? JSON.stringify(stat(drive)) : '(无)'}`);
  if (drive.length <= 20) console.log(`  明细: ${drive.join(' | ')}`);
  return { still, drive, errors: errors.splice(0) };
}

await runMap('town');
await runMap('plains');
console.log('ERRORS:', errors.length ? errors : '(none)');
await browser.close();
