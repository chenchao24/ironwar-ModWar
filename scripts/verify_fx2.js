// 炮口焰特写验证：静止 → 开火 → 峰值爆闪 / 火舌 / 炮烟 三连截
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--use-angle=default', '--enable-unsafe-webgpu', '--window-size=1600,900', '--mute-audio'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading-overlay').classList.contains('done'), { timeout: 60000 });
  await sleep(800);
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-war-mode');
  await sleep(400);
  await page.click('#btn-start-battle');
  await sleep(2500);   // 静止

  // 直接调用 muzzleBlast 保证时序可控（与开火路径同一函数）
  await page.evaluate(() => {
    const g = window.__game;
    const pos = new (g.player.pos.constructor)();
    const dir = new (g.player.pos.constructor)();
    g.player.getMuzzle(pos, dir);
    g.effects.muzzleBlast(pos, dir);
  });
  await sleep(35);
  await page.screenshot({ path: 'shot_fire.png' });
  await sleep(250);
  await page.screenshot({ path: 'shot_fire_smoke.png' });
  await sleep(700);
  await page.screenshot({ path: 'shot_fire_dust.png' });

  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
