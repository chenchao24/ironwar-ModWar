// 履带印补充验证：原地转向后冻结相机，俯视截图检查印迹形态
const puppeteer = require('puppeteer-core');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await page.evaluate(() => { window.__game.ais = []; });

  // 低速原地转向 4s（≈165°）
  await page.keyboard.down('KeyA');
  await sleep(4000);
  await page.keyboard.up('KeyA');

  // 记录转向中心（原地转向时 pos 不变），随后驶离让印迹暴露出来
  const center = await page.evaluate(() => {
    const p = window.__game.player.pos;
    return { x: p.x, z: p.z };
  });
  await page.keyboard.down('KeyW');
  await sleep(2500);
  await page.keyboard.up('KeyW');
  await sleep(500);

  // 冻结跟随相机，俯视转向中心观察印迹全貌（隐藏准星避免遮挡）
  await page.evaluate((c) => {
    const g = window.__game;
    g.rig.update = () => {};
    document.getElementById('crosshair').style.display = 'none';
    const y = g.world.groundY(c.x, c.z);
    g.camera.position.set(c.x, y + 34, c.z + 13);
    g.camera.lookAt(c.x, y, c.z);
  }, center);
  await sleep(400);
  await page.screenshot({ path: 'shot_tracks_pivot_top.png' });

  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
