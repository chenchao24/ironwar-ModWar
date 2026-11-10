const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--mute-audio'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.getElementById('loading-overlay').classList.contains('done'), { timeout: 60000 });
  await page.click('#screen-cover'); await page.click('#btn-war-mode'); await page.click('#btn-start-battle');
  // 采样 3 秒内的观瞄状态
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 500));
    const s = await page.evaluate(() => {
      const g = window.__game, p = g.player;
      return {
        aimYaw: +g.rig.aimYaw.toFixed(3), aimPitch: +g.rig.aimPitch.toFixed(3),
        aimTarget: g.rig.aimTarget.toArray().map(v => +v.toFixed(0)),
        turretYaw: +p.turretYaw.toFixed(3),
        aimDist: g.aimDist && +g.aimDist.toFixed(0),
        mouseDX: g.input.mouseDX, locked: g.input.locked,
      };
    });
    console.log(JSON.stringify(s));
  }
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
