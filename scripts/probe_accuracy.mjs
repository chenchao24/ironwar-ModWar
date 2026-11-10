// ═══ 命中率探针：静对静 300/500/800m，每距离 20 发 AP（禁 APS，纯弹道+散布） ═══
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8080';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=default', '--enable-unsafe-webgpu', '--window-size=1600,900', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('loading') || document.getElementById('loading').classList.contains('hide'), { timeout: 120000 });
await sleep(1500);
await page.evaluate(() => document.getElementById('screen-cover').click());
await sleep(400);
await page.evaluate(() => document.getElementById('btn-war-mode').click());
await sleep(600);
await page.evaluate(() => document.querySelector('#fh-map-row [data-map="town"]').click());
await sleep(300);
await page.evaluate(() => document.querySelector('#screen-hangar [data-action="start"]').click());
await sleep(2500);

// 同步页内统计：玩家与敌坦挪到开阔 x 轴线上，逐发模拟
const result = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player, e = g.enemies[0];
  const save = { pp: p.pos.clone(), ep: e.pos.clone(), ehp: e.hp, aps: e.aps ? e.aps.charges : 0 };
  if (e.aps) e.aps.charges = 0;                      // 禁 APS：纯弹道统计
  p.shellType = 'ap'; p.shellPool.ap = 999;
  const H = (x, z) => g.world.groundY(x, z);
  const DT = 1 / 60;
  const out = {};
  for (const d of [300, 500, 800]) {
    // 摆位：x 轴开阔带（镇外），玩家 (500,·,0) → 敌 (500+d,·,0)
    p.pos.set(500, H(500, 0), 0); p._syncTransform(DT);
    e.pos.set(500 + d, H(500 + d, 0), 0); e._syncTransform(DT);
    g.scene.updateMatrixWorld(true);
    // 瞄敌炮塔中部并伺服收敛
    p.aimAt({ x: e.pos.x, y: e.pos.y + 1.7, z: e.pos.z });
    for (let i = 0; i < 120; i++) p.updateTurret(0.05);   // 6s 伺服收敛
    g.scene.updateMatrixWorld(true);
    let hits = 0;
    for (let s = 0; s < 20; s++) {
      p.reload = 0;
      p.dispersion = p.cfg.dispersion;                // 满缩圈（静对静理想条件）
      const data = p.fire();
      g.shells.fire(data);
      const before = e.hp;
      for (let k = 0; k < 400 && g.shells.shells.length; k++) g.shells.update(DT);
      if (e.hp < before) hits++;
      e.hp = e.maxHp; e.destroyed = false;
    }
    out[d] = { hits, rate: (hits / 20).toFixed(2), dispersion: p.cfg.dispersion };
  }
  // 复原
  p.pos.copy(save.pp); p._syncTransform(DT);
  e.pos.copy(save.ep); e._syncTransform(DT);
  e.hp = save.ehp; if (e.aps) e.aps.charges = save.aps;
  g.scene.updateMatrixWorld(true);
  return out;
});
console.log(JSON.stringify(result, null, 2));
const ok = result[300].rate >= 0.85 && result[500].rate >= 0.70 && result[800].rate >= 0.50;
console.log(ok ? 'PASS 远距命中率达标（300≥85% / 500≥70% / 800≥50%）' : 'FAIL 命中率未达标');
console.log('ERRORS:', errors.length ? errors.slice(0, 6) : '(none)');
await browser.close();
process.exit(ok && errors.length === 0 ? 0 : 1);
