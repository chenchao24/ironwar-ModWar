// 战斗链路验证：开火 → 弹道 → 命中 → 伤害 → 击毁爆炸 → 胜负判定
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--window-size=1600,900', '--mute-audio'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading-overlay').classList.contains('done'), { timeout: 60000 });
  await page.click('#screen-cover');
  await page.click('#btn-war-mode');
  await page.click('#btn-start-battle');
  await new Promise(r => setTimeout(r, 1500));

  // ① 开火 + 炮口焰截图
  await page.evaluate(() => {
    const g = window.__game;
    g.input.locked = true;   // 无头模式绕过指针锁定
    g.input.firePressed = true;
  });
  await new Promise(r => setTimeout(r, 90));
  await page.screenshot({ path: 'shot_fire.png' });
  const shots = await page.evaluate(() => window.__game.playerShots);
  console.log('① 开火 shots:', shots);

  // ② 炮塔随观瞄方向转动
  const turret = await page.evaluate(async () => {
    const g = window.__game;
    g.rig.aimYaw += 1.2;
    const before = g.player.turretYaw;
    await new Promise(r => setTimeout(r, 900));
    return { before, after: g.player.turretYaw };
  });
  console.log('② 炮塔跟踪(应>0.4):', JSON.stringify(turret));

  // ③ 把敌坦拉到前方 60m，瞄准并击毁
  const combat = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player, e = g.enemies[0];
    g.ais = [];                       // 冻结 AI，固定靶
    g.rig.aimYaw = 0; g.rig.aimPitch = -0.04;   // 先回正，等相机稳定
    e.pos.set(p.pos.x, 0, p.pos.z + 60);
    e.drive(0.016, 0, 0, false);
    e.hp = 300;
    p.reload = 0;
    await new Promise(r => setTimeout(r, 1000));
    // 从相机位置精确计算观瞄方向（测距射线 = 相机中心射线）
    const cp = g.camera.position;
    const dist = Math.hypot(e.pos.x - cp.x, e.pos.z - cp.z);
    g.rig.aimYaw = Math.atan2(e.pos.x - cp.x, e.pos.z - cp.z);
    g.rig.aimPitch = Math.atan2((e.root.position.y + 0.6) - cp.y, dist);
    await new Promise(r => setTimeout(r, 1300));
    const before = e.hp;
    const aimDist = g.aimDist;
    const labels = [];
    // 炮塔正面可能跳弹（装甲机制正确行为），最多补射 3 发
    for (let s = 0; s < 3 && !e.destroyed; s++) {
      p.reload = 0;
      g.input.firePressed = true;
      await new Promise(r => setTimeout(r, 400));
      labels.push(document.getElementById('pen-marker').textContent);
      await new Promise(r => setTimeout(r, 400));
    }
    return { before, after: e.hp, destroyed: e.destroyed, playerShots: g.playerShots, hits: g.playerHits,
      aimDist, labels };
  });
  console.log('③ 命中击毁:', JSON.stringify(combat));
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: 'shot_kill.png' });

  // ④ 胜利结算
  await new Promise(r => setTimeout(r, 2500));
  const result = await page.evaluate(() => ({
    resultShown: document.getElementById('screen-result').classList.contains('active'),
    title: document.getElementById('result-title').textContent,
  }));
  console.log('④ 结算:', JSON.stringify(result));
  await page.screenshot({ path: 'shot_result.png' });

  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
