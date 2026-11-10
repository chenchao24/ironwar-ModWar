// 模块负面状态专项验证：mod-chips 显示 / 断履带限速 / penInside+applyHit 事件路径
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
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-war-mode');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-start-battle');
  await new Promise(r => setTimeout(r, 2500));

  // ── ① 玩家模块状态 → #mod-chips 显示 + 截图 ──
  await page.evaluate(() => {
    const p = window.__game.player;
    p.mods.tracks = 9; p.mods.engine = 8; p.mods.ring = 12; p.mods.loader = 12;
    p.ignite();
  });
  await new Promise(r => setTimeout(r, 600));
  const chips = await page.evaluate(() => document.getElementById('mod-chips').innerText.replace(/\n/g, ' | '));
  await (await page.$('#hud-bottom-left')).screenshot({ path: 'shot_mod_chips.png' });
  // 清起火回满血（避免 burnDet 殉爆干扰后续测试），保留 mods.tracks 测限速
  await page.evaluate(() => {
    const p = window.__game.player;
    p.burning = 0; p.hp = p.maxHp;
    p.mods.engine = 0; p.mods.ring = 0; p.mods.loader = 0;
  });

  // ── ② 断履带限速：W 3s 读速度，再恢复正常对比 ──
  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, 3000));
  const speedLimited = await page.evaluate(() => +document.getElementById('speed-val').textContent);
  await page.evaluate(() => { window.__game.player.mods.tracks = 0; });
  await new Promise(r => setTimeout(r, 3500));
  const speedNormal = await page.evaluate(() => +document.getElementById('speed-val').textContent);
  await page.keyboard.up('KeyW');

  // ── ③ 敌车 penInside / applyHit：事件返回与概率路径 ──
  const modRes = await page.evaluate(() => {
    const g = window.__game, e = g.enemies[0];
    const out = { penInsideRuns: [], applyHitRuns: [], fireRuns: [] };
    const up = e.root.position.clone().set(0, 1, 0);
    const dirW = e.root.position.clone().set(-1, 0, -0.6).normalize().applyAxisAngle(up, e.heading);
    const dirF = e.root.position.clone().set(-1, 0, -0.15).normalize().applyAxisAngle(up, e.heading);
    // 1) 前部弹道：油箱（起火概率路径；不经弹药架，不会殉爆）
    for (let i = 0; i < 12 && !e.destroyed; i++) {
      e.burning = 0;   // 清理上一次起火，独立观察每次命中
      const hw = e.root.localToWorld(e.root.position.clone().set(1.5, 0.7, 2.4));
      const evs = e.penInside(hw, dirF);
      out.fireRuns.push(evs.map(ev => ev.type + (ev.label ? ':' + ev.label : '')).join(',') || '(none)');
    }
    e.burning = 0;
    // 2) applyHit 全路径（pen 999 必穿；不扣 HP——扣 HP 在 applyDamage）
    for (let i = 0; i < 15 && !e.destroyed; i++) {
      const hw = e.root.localToWorld(e.root.position.clone().set(1.7, 0.75, 1.0));
      const zh = e.resolveHitZone(hw, dirW);
      const r = e.applyHit(zh, 999, hw, dirW);
      out.applyHitRuns.push(r.type + '[' + (r.events || []).map(ev => ev.type).join(',') + '] mult=' + (r.mult ?? ''));
    }
    // 3) 侧面斜穿弹道：履带内侧 → 弹药架 → 出界（可能殉爆，放最后）
    for (let i = 0; i < 15 && !e.destroyed; i++) {
      const hw = e.root.localToWorld(e.root.position.clone().set(1.7, 0.75, 1.0));
      const evs = e.penInside(hw, dirW);
      out.penInsideRuns.push(evs.map(ev => ev.type + (ev.label ? ':' + ev.label : '')).join(',') || '(none)');
    }
    out.destroyed = e.destroyed;
    out.ammoDetonated = e.ammoDetonated;
    out.enemyMods = { ...e.mods };
    return out;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'shot_mod_battle.png' });

  console.log('CHIPS:', chips);
  console.log('SPEED limited(normal restored later):', speedLimited, '→', speedNormal);
  console.log('MODRES:', JSON.stringify(modRes, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
