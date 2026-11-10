// ═══ 倒树音量规则探针：玩家压倒降 40% / 敌坦压倒 50m 静音门 ═══
// A 阶段：主音量实测（玩家 8m/60m 全额；敌坦 20m/45m 线性衰减；敌坦 100m 静音）
// B 阶段：敌坦 30m 压倒 → 主音+吱嘎×2+落地全程有声（玩家原地不动）
// C 阶段：敌坦 120m 压倒 → 全程零发声
// 用法：node server.js 后 node scripts/probe_tree_vol.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=default', '--mute-audio'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('loading') || document.getElementById('loading').classList.contains('hide'), { timeout: 120000 });
await sleep(1000);
await page.evaluate(() => document.getElementById('screen-cover').click());
await sleep(400);
await page.evaluate(() => document.getElementById('btn-war-mode').click());
await sleep(600);
await page.evaluate(() => document.querySelector('#fh-map-row [data-map="town"]').click());
await sleep(300);
await page.evaluate(() => document.querySelector('#screen-hangar [data-action="start"]').click());
await sleep(2000);

// 拦截 playProp + 标记游标（segment 判定：只看每次压倒后新增的调用）
await page.evaluate(() => {
  window.__propCalls = [];
  const orig = window.__audio.playProp.bind(window.__audio);
  window.__audio.playProp = (name, vol) => { window.__propCalls.push(`${name}@${(vol ?? 0).toFixed(3)}`); return orig(name, vol); };
  window.__mark = () => window.__propCalls.length;
  window.__seg = (n) => window.__propCalls.slice(n);
});

// —— A 阶段：主音量（700ms 间隔避免叠树去重干扰）——
const vols = await page.evaluate(async () => {
  const g = window.__game, des = g.world.destructibles, p = g.player;
  const trees = des.list.filter(d => d.alive && d.type === 'leaf');
  const cases = [
    { dist: 8, byPlayer: true, expect: 0.54 * (1 - 0.8 * 8 / 800) },
    { dist: 20, byPlayer: false, expect: 0.54 * (1 - 20 / 50) * (1 - 0.8 * 20 / 800) },
    { dist: 45, byPlayer: false, expect: 0.54 * (1 - 45 / 50) * (1 - 0.8 * 45 / 800) },
    { dist: 100, byPlayer: false, expect: 0 },   // 50m 静音门
    { dist: 60, byPlayer: true, expect: 0.54 * (1 - 0.8 * 60 / 800) },
  ];
  const out = [];
  for (const c of cases) {
    const t = trees[out.length];
    if (!t) { out.push({ ...c, got: null }); continue; }
    p.place(t.x - c.dist, t.z, 0);                     // 玩家（听者）在树西侧 c.dist 米
    const m = window.__mark();
    des.fellTree(t, 1, 0, false, c.byPlayer);          // byPlayer：玩家/敌坦压倒
    await new Promise(r => setTimeout(r, 700));
    const seg = window.__seg(m).filter(s => s.startsWith('treeTopple@'));
    out.push({ dist: c.dist, byPlayer: c.byPlayer, expect: +c.expect.toFixed(3), got: seg.length ? +seg[0].split('@')[1] : 0 });
  }
  return { vols: out, used: Math.min(cases.length, trees.length) };
});

// —— B 阶段：敌坦 30m 压倒，玩家原地不动 → 主音+吱嘎×2+落地（页面内取真实 rec，勿跨边界传 rec）——
await page.evaluate(() => {
  const g = window.__game, des = g.world.destructibles, p = g.player;
  const t = des.list.find(d => d.alive && d.type === 'leaf');
  window.__bOk = !!t;
  window.__bMark = window.__mark();
  if (!t) return;
  p.place(t.x - 30, t.z, 0);                  // 玩家（听者）在树西侧 30m，之后原地不动
  des.fellTree(t, 1, 0, false, false);       // 敌坦压倒（真实 rec）
});
await sleep(1800);
const bSeg = await page.evaluate(() => window.__seg(window.__bMark));

// —— C 阶段：敌坦 ≥120m 压倒（玩家不动，取远处树）→ 全程零发声 ——
await page.evaluate(() => {
  const g = window.__game, des = g.world.destructibles, p = g.player;
  let t = null;
  for (const d of des.list) {
    if (!d.alive || d.type !== 'leaf') continue;
    if (Math.hypot(d.x - p.pos.x, d.z - p.pos.z) >= 120) { t = d; break; }
  }
  window.__cOk = !!t;
  window.__cMark = window.__mark();
  if (t) des.fellTree(t, 1, 0, false, false);   // 敌坦压倒（真实 rec）
});
await sleep(1800);
const cSeg = await page.evaluate(() => window.__seg(window.__cMark));

// —— 断言 ——
let fail = 0;
const expect = (cond, label) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) fail++; };
console.log(`A 阶段 主音量（共 ${vols.used} 棵）:`);
for (const v of vols.vols) {
  expect(Math.abs(v.got - v.expect) < 0.03,
    `${v.byPlayer ? '玩家' : '敌坦'}压倒 @${v.dist}m → 实测 ${v.got?.toFixed(3)} / 期望 ${v.expect}`);
}
console.log('B 阶段 敌坦 30m（玩家原地）：', bSeg.join(' | '));
expect(bSeg.some(s => s.startsWith('treeTopple@0.2')), '主音 treeTopple ≈0.21（30m 线性衰减）');
expect(bSeg.filter(s => s.startsWith('treeCreak@')).length >= 2, '吱嘎 treeCreak ≥2');
expect(bSeg.some(s => s.startsWith('crushWood@')), '落地 crushWood 有声');
console.log('C 阶段 敌坦 ≥120m：', cSeg.length ? cSeg.join(' | ') : '(全程静音)');
expect(!cSeg.some(s => s.startsWith('treeTopple@') || s.startsWith('treeCreak@') || s.startsWith('crushWood@')), '50m 外敌坦压倒的树全程零发声');
expect(errors.length === 0, `无页面错误 (${errors.length})`);
if (errors.length) console.log('ERRORS:', errors.slice(0, 6));
await browser.close();
process.exit(fail ? 1 : 0);
