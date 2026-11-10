// HUD 验证：罗盘卡尺（初始读数 / 转向平移）+ hitlog（排版/配色/渐隐）
const puppeteer = require('puppeteer-core');

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
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 600));
  await page.click('#btn-war-mode');
  await new Promise(r => setTimeout(r, 600));
  await page.click('#btn-start-battle');
  await new Promise(r => setTimeout(r, 2000));

  // 1) 初始航向（place 朝向 +Z = N，应读 000°）
  const s0 = await page.evaluate(() => ({
    deg: document.getElementById('compassDeg').textContent,
    heading: window.__game.player.heading,
    ticks: document.getElementById('csTicks').children.length,
  }));
  console.log('INIT:', JSON.stringify(s0));
  await page.screenshot({ path: 'shot_hud_compass_init.png' });

  // 2) W+A 前进左转 2s：heading 增大 → 方位角应减小（偏向 NW/315 方向），刻度带平移
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyA');
  await new Promise(r => setTimeout(r, 2000));
  const s1 = await page.evaluate(() => ({
    deg: document.getElementById('compassDeg').textContent,
    heading: window.__game.player.heading,
    transform: document.getElementById('csTicks').style.transform,
  }));
  console.log('TURN:', JSON.stringify(s1));
  await page.screenshot({ path: 'shot_hud_compass_turn.png' });
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');

  // 3) hitlog：插入 6 条（超 5 条上限，验证截断）各类条目 → 立即截图
  await page.evaluate(() => {
    const ui = window.__game.ui;
    ui.hitLog('击穿 T-80U 412', 'good');
    ui.hitLog('跳弹', 'good');
    ui.hitLog('未击穿', 'good');
    ui.hitLog('履带断裂', 'good');
    ui.hitLog('被击穿 -389', 'bad');
    ui.hitLog('被断履带', 'bad');   // 第 6 条：最早一条应被截掉
  });
  await new Promise(r => setTimeout(r, 300));
  const h1 = await page.evaluate(() =>
    [...document.getElementById('hitlog').children].map((c) => `${c.className}:${c.textContent}`));
  console.log('HITLOG:', JSON.stringify(h1));
  await page.screenshot({ path: 'shot_hud_hitlog.png' });

  // 4) 渐隐中（2.6s 后条目带 .fadeout）
  await new Promise(r => setTimeout(r, 2300));
  await page.screenshot({ path: 'shot_hud_hitlog_fade.png' });

  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
