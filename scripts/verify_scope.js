// 狙击镜专项验证：开镜分划 / 开炮白闪 / 装填大光圈进度 / 变倍
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
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-start-battle');
  await new Promise(r => setTimeout(r, 2000));

  // 开镜（Shift 按住 = input.aiming）
  await page.keyboard.down('ShiftLeft');
  await new Promise(r => setTimeout(r, 1500));   // 等 FoV 收敛
  const scoped = await page.evaluate(() => ({
    aiming: window.__game.rig.aiming,
    visible: !document.getElementById('gunsight').classList.contains('hidden'),
    zoomText: document.getElementById('gs-zoom').textContent,
    ringText: document.getElementById('gs-reload-text').textContent,
    ringReady: document.querySelector('.gsr-fg').classList.contains('ready'),
    dispW: document.getElementById('gs-disp').style.width,
  }));
  console.log('SCOPED:', JSON.stringify(scoped));
  await page.screenshot({ path: 'shot_scope_reticle.png' });

  // 开火 → 白闪 + 大光圈进入装填
  await page.evaluate(() => { window.__game.input.firePressed = true; });
  await new Promise(r => setTimeout(r, 110));    // 白闪 0.5s 早期
  await page.screenshot({ path: 'shot_scope_flash.png' });

  // 装填中途（6.5s 装填，~3s 处）
  await new Promise(r => setTimeout(r, 2900));
  const mid = await page.evaluate(() => ({
    ringText: document.getElementById('gs-reload-text').textContent,
    offset: document.querySelector('.gsr-fg').style.strokeDashoffset,
  }));
  console.log('MIDRELOAD:', JSON.stringify(mid));
  await page.screenshot({ path: 'shot_scope_reload.png' });

  // 变倍 ×2.4 左右
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__game.rig.zoomAim(-1); });
  await new Promise(r => setTimeout(r, 1200));
  const zoomed = await page.evaluate(() => ({
    zoomMag: window.__game.rig.zoomMag.toFixed(2),
    zoomText: document.getElementById('gs-zoom').textContent,
    dispW: document.getElementById('gs-disp').style.width,
  }));
  console.log('ZOOMED:', JSON.stringify(zoomed));
  await page.screenshot({ path: 'shot_scope_zoom.png' });

  // 装填完成 → 就绪绿环
  await new Promise(r => setTimeout(r, 3500));
  const ready = await page.evaluate(() => ({
    ringText: document.getElementById('gs-reload-text').textContent,
    ringReady: document.querySelector('.gsr-fg').classList.contains('ready'),
  }));
  console.log('READY:', JSON.stringify(ready));
  await page.keyboard.up('ShiftLeft');

  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
