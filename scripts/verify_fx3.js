// 殉爆链验证：destroy(true) → 三段延爆 + 飞炮塔/座圈喷火 + 残骸黑烟
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
  await sleep(2000);

  // 把敌坦瞬移到玩家正前 40m 并强制殉爆（覆盖 destroy(true) 延爆链 + 喷火/飞头）
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies[0];
    const p = g.player.root.position, h = g.player.heading;
    e.place(p.x + Math.sin(h) * 40, p.z + Math.cos(h) * 40, 180);
    e.update(0.016, g.effects, null);   // 注入 effects
    e.destroy(true);
  });
  await sleep(150);
  await page.screenshot({ path: 'shot_kill1.png' });   // 起爆 4.4
  await sleep(600);
  await page.screenshot({ path: 'shot_kill2.png' });   // 延爆 2.6/1.8 + 喷火或飞头
  await sleep(2500);
  await page.screenshot({ path: 'shot_kill3.png' });   // 残骸燃烧黑烟柱
  const info = await page.evaluate(() => {
    const e = window.__game.enemies[0];
    return { turretFly: !!e.turretFly, jetFireT: e.jetFireT.toFixed(2), destroyed: e.destroyed };
  });
  console.log('INFO:', JSON.stringify(info));
  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
