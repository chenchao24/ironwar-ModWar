// 模块飘字视觉验证：在敌车位置触发模块事件飘字并截图
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
  await new Promise(r => setTimeout(r, 800));
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-war-mode');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#btn-start-battle');
  await new Promise(r => setTimeout(r, 2000));

  // 相机朝向敌车，触发三种模块飘字
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies[0];
    const p = e.root.position.clone(); p.y += 2.2;
    g._floatModuleEvent(p, { type: 'module', label: '履带断裂' });
    g._floatModuleEvent(p, { type: 'fire', label: '油箱起火' });
    g._floatModuleEvent(p, { type: 'module', label: '装弹机受损' });
  });
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: 'shot_mod_float.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
