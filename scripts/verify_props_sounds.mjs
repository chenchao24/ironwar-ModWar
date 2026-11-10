// ═══ 物件音效（sound/props/）验证：解码 + 各触发场景实测 ═══
// 验证：10 个 MP3 解码成功（含时长登记）→ 进入小镇战斗 →
//   AP/HE 命中房屋 / 大小房屋倒塌 / 炮击毁树 / 树倒吱嘎+落地 / 压倒电线杆 / 碾木栅栏 / 撞房屋 / 碾废墟
// 用法：先 npx http-server -p 8080 或 node server.js，再 node scripts/verify_props_sounds.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:8080';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=default', '--window-size=1600,900', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('loading') || document.getElementById('loading').classList.contains('hide'), { timeout: 120000 });
await sleep(1500);

// —— 覆盖点击（触发 audio.init → loadPropSounds）——
await page.evaluate(() => document.getElementById('screen-cover').click());
await sleep(400);

// —— ① 10 个物件音效解码 + 时长登记 ——
const decode = await page.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now();
  const wait = setInterval(() => {
    const a = window.__audio;
    if (a && a.propSfx) {
      clearInterval(wait);
      const out = {};
      for (const [k, b] of Object.entries(a.propSfx)) out[k] = b ? +(b.duration.toFixed(2)) : null;
      resolve({ ok: Object.values(out).every(Boolean), sounds: out, ms: Math.round(performance.now() - t0) });
    } else if (performance.now() - t0 > 15000) {
      clearInterval(wait); resolve({ ok: false, sounds: null, ms: -1 });
    }
  }, 100);
}));
console.log('DECODE:', decode.ok ? 'ok' : 'FAIL', `(${decode.ms}ms)`);
if (decode.sounds) for (const [k, d] of Object.entries(decode.sounds)) console.log(`  ${k.padEnd(12)} ${d}s`);

// —— 拦截 playProp 记录调用（实例方法覆写，原逻辑保留）——
await page.evaluate(() => {
  window.__propCalls = [];
  const orig = window.__audio.playProp.bind(window.__audio);
  window.__audio.playProp = (name, vol) => { window.__propCalls.push(`${name}@${vol?.toFixed(2)}`); return orig(name, vol); };
});

// —— 战争模式 → 机库 → 选小镇 → 开战 ——
await page.evaluate(() => document.getElementById('btn-war-mode').click());
await sleep(600);
await page.evaluate(() => document.querySelector('#fh-map-row [data-map="town"]').click());
await sleep(300);
await page.evaluate(() => document.querySelector('#screen-hangar [data-action="start"]').click());
await sleep(2500);

// —— ② 场景实测（直接驱动 destructibles / tank，绕开输入物理；place() 保证朝向同步）——
const result = await page.evaluate(() => {
  const g = window.__game, des = g.world.destructibles;
  const out = {};
  const house = des.list.find(d => d.alive && d.type === 'house01');
  const smallHouse = des.list.find(d => d.alive && d.type === 'house03');
  const tree = des.list.find(d => d.alive && d.type === 'leaf');
  const fence = des.list.find(d => d.alive && d.type && d.type.startsWith('fence'));
  const pylon = des.list.find(d => d.alive && d.type === 'pylon01');
  out.objects = { house: !!house, smallHouse: !!smallHouse, tree: !!tree, fence: !!fence, pylon: !!pylon };

  const mkHit = (d, dy = 2) => g.player.pos.clone().set(d.cx ?? d.x, (d.y ?? 0) + dy, d.cz ?? d.z);

  // AP 命中房屋（无结构伤）→ houseHit
  if (house) des.damageDestructible(house, mkHit(house), 'ap');
  // HE 命中（扣血）→ houseHit；终击 → houseHit + collapseLg（house01≈82㎡ ≥ 80 阈值）
  if (house) { des.damageDestructible(house, mkHit(house), 'he'); des.damageDestructible(house, mkHit(house), 'he'); }
  // 小房屋倒塌（house03 hp=2）→ houseHit ×2 + collapseSm
  if (smallHouse) { while (smallHouse.alive) des.damageDestructible(smallHouse, mkHit(smallHouse), 'he'); }
  // 炮击毁树 → treeShot（+ 过程 treeCreak ×2 + 落地 crushWood，由主循环驱动）
  if (tree) des.damageDestructible(tree, mkHit(tree));
  // 压倒电线杆 → crushObj（+ 落地 crushObj）
  if (pylon) des.fellPylon(pylon, 1, 0);
  // 碾木栅栏：玩家放到栅栏位置上 → crushWood
  if (fence) { g.player.place(fence.x, fence.z, 0); g.player.speed = 5; des.crushCheck(g.player, null); }
  // 撞房屋：贴着房屋障碍物朝向冲撞 → ramHouse
  const ob = g.world.obstacles.find(o => o.d && o.d.type && o.d.type.startsWith('house')) || g.world.obstacles.find(o => o.kind === 'building');
  if (ob) {
    const p = g.player;
    p.place(ob.x - ob.r - 2.0, ob.z, 0);            // 房屋正西 2m，朝北前进会斜擦；改朝向房屋
    p.heading = Math.atan2(ob.x - p.pos.x, ob.z - p.pos.z);   // 朝向障碍
    p.speed = 8;
    p.drive(0.05, 1, 0, false);
    p.update(0.05, g.effects, window.__audio);
  }
  out.rammed = !!g.player._ramHit || null;
  // 碾废墟：坡度场 + 行驶 → crushRubble
  {
    const p = g.player;
    des.rubbleFields.push({ x: p.pos.x + 2, z: p.pos.z, r: 12, h: 1.2 });
    p.speed = 6;
    for (let i = 0; i < 3; i++) p.update(0.33, g.effects, window.__audio);
  }
  out.obstacle = !!ob;
  return out;
});
console.log('SCENE-OBJECTS:', JSON.stringify(result));

// —— ③ 等倒树/倒杆动画走完（落地音），无头渲染帧率低给足 4s ——
await sleep(4000);
const calls = await page.evaluate(() => window.__propCalls.slice(0, 80));
console.log('CALLS(' + calls.length + '):', calls.join(' | '));

// —— 断言（按触发计数）——
let fail = 0;
const expect = (cond, label) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) fail++; };
const n = (p) => calls.filter(c => c.startsWith(p + '@')).length;
console.log('ASSERT:');
fail += expect(decode.ok, '10 个物件音效全部解码');
fail += expect(n('houseHit') >= 4, `AP/HE 命中房屋 → houseHit ×${n('houseHit')}(≥4)`);
fail += expect(n('collapseLg') >= 1, `大房屋(house01)终击倒塌 → collapseLg ×${n('collapseLg')}`);
fail += expect(n('collapseSm') >= 1, `小房屋(house03)终击倒塌 → collapseSm ×${n('collapseSm')}`);
fail += expect(n('treeShot') >= 1, `炮击毁树 → treeShot ×${n('treeShot')}`);
fail += expect(n('treeCreak') >= 2, `倒树过程吱嘎 → treeCreak ×${n('treeCreak')}(≥2)`);
fail += expect(n('crushWood') >= 2, `碾栅栏+树落地 → crushWood ×${n('crushWood')}(≥2)`);
fail += expect(n('crushObj') >= 2, `压倒电线杆+落地 → crushObj ×${n('crushObj')}(≥2)`);
fail += expect(n('ramHouse') >= 1, `撞房屋 → ramHouse ×${n('ramHouse')}`);
fail += expect(n('crushRubble') >= 1, `碾废墟 → crushRubble ×${n('crushRubble')}`);
fail += expect(errors.length === 0, `无页面错误 (${errors.length})`);

if (errors.length) console.log('ERRORS:', errors.slice(0, 8));
await page.screenshot({ path: 'shot_props_sounds.png' });
await browser.close();
process.exit(fail ? 1 : 0);
