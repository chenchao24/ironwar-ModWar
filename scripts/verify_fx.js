// 特效验证：进战斗 → 行驶排烟 → 开炮（炮口焰/尘幕）→ 爆炸（火球/黑烟柱）截图
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
  await sleep(600);
  await page.click('#btn-war-mode');
  await sleep(500);
  await page.click('#btn-start-battle');
  await sleep(2000);

  // 1) 起步浓黑排烟：按住 W 起步途中截图
  await page.keyboard.down('KeyW');
  await sleep(1600);
  await page.screenshot({ path: 'shot_fx_exhaust.png' });
  await page.keyboard.up('KeyW');
  await sleep(600);

  // 2) 开炮：炮口焰瞬间 + 烟团/地面尘幕
  await page.evaluate(() => { window.__game.input.firePressed = true; });
  await sleep(90);
  await page.screenshot({ path: 'shot_fire.png' });
  await sleep(450);
  await page.screenshot({ path: 'shot_fire_smoke.png' });
  await sleep(1200);

  // 3) 车前 25m 大爆炸：火球瞬间 + 黑烟柱
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.player.root.position;
    const h = g.player.heading;
    g.effects.explosion({ x: p.x + Math.sin(h) * 25, y: p.y + 1.5, z: p.z + Math.cos(h) * 25 }, 2);
  });
  await sleep(120);
  await page.screenshot({ path: 'shot_explosion.png' });
  await sleep(1100);
  await page.screenshot({ path: 'shot_explosion_smoke.png' });

  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
