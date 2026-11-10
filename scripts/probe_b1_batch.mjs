// ═══ B1 建筑合批专项探针（Puppeteer 无头） ═══
// 断言：合批落地（InstancedMesh 数量/实例矩阵）→ 真实受损路径（damageDestructible：HE 命中 → 抽出独立克隆 + 灰化 → 终击倒塌 → 废墟场）
// 用法：先 npx http-server -p 8080（no-store），再 node scripts/probe_b1_batch.mjs
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

// ── 1) 合批结构断言 ──
const batch = await page.evaluate(() => {
  const g = window.__game;
  const root = g.world.root;
  const insts = root.children.filter(c => c.isInstancedMesh);
  let batchInst = 0, instTotal = 0;
  for (const im of insts) { instTotal += im.count; if (im.userData.__batch) batchInst += im.count; }
  const des = g.world.destructibles;
  const houses = des.list.filter(d => d.kind === 'group' && d.inst && d.inst.refs.length);
  const info = g.renderer.info.render;
  return {
    instMeshes: insts.length,
    instTotal,
    groupRecs: des.list.filter(d => d.kind === 'group').length,
    batchedRecs: houses.length,
    drawCalls: info.calls, triangles: info.triangles,
  };
});
console.log('BATCH:', JSON.stringify(batch));
const okBatch = batch.batchedRecs > 100 && batch.drawCalls < 350;
console.log(okBatch ? 'PASS 合批结构（批量建筑数 ' + batch.batchedRecs + '，draw calls ' + batch.drawCalls + '）' : 'FAIL 合批结构');

// ── 2) 真实受损路径：HE 命中一栋 house03（hp=2，rubbleH=1.2<1.5 → 低废墟坡度场）→ 抽出+灰化；再 1 发 → 倒塌 ──
const dmg = await page.evaluate(() => {
  const g = window.__game;
  const des = g.world.destructibles;
  const d = des.list.find(r => r.kind === 'group' && r.type === 'house03' && r.inst && r.inst.refs.length);
  if (!d) return { fail: 'no house01' };
  const refsBefore = d.inst.refs.length;
  const hit = d.group.position.clone();   // 真 Vector3（内部要 .clone()）；命中点=楼体中心+2m
  hit.y = d.box.min.y + 2;
  des.damageDestructible(d, hit, 'he');   // 第 1 发（HE）
  const extracted = d.group.parent === des.root && d.inst.refs.length === 0;
  const grayed = !!d._mats && d._mats.length > 0;
  const hp1 = d.hp;
  des.damageDestructible(d, hit, 'he');   // 第 2 发 → 终击
  return {
    refsBefore, extracted, grayed, hp1,
    alive: d.alive, collapsing: des.collapsing.length,
    box: { cx: d.cx, cz: d.cz },
  };
});
console.log('DAMAGE:', JSON.stringify(dmg));
const okDmg = dmg.extracted && dmg.grayed && dmg.hp1 === 1 && !dmg.alive && dmg.collapsing > 0;
console.log(okDmg ? 'PASS 受损抽出+灰化+终击倒塌' : 'FAIL 受损路径');

// ── 3) 倒塌动画走完 → 废墟场 ──
await sleep(6000);
const rub = await page.evaluate(() => {
  const g = window.__game;
  const des = g.world.destructibles;
  return { collapsing: des.collapsing.length, rubble: des.rubbleFields.length, calls: g.renderer.info.render.calls };
});
console.log('RUBBLE:', JSON.stringify(rub));
const okRub = rub.collapsing === 0 && rub.rubble > 0;
console.log(okRub ? 'PASS 倒塌完成+废墟坡度场' : 'FAIL 倒塌收尾');

await page.screenshot({ path: 'shot_b1_collapse.png' });

// ── 4) 压毁路径（group 物件被履带碾）抽查一辆 truck —— 走 _ensureGroup 分支 ──
const crush = await page.evaluate(() => {
  const g = window.__game;
  const des = g.world.destructibles;
  const d = des.list.find(r => r.kind === 'group' && r.rule && r.rule.crushH !== undefined && r.inst && r.inst.refs.length);
  if (!d) return { skip: true };
  const before = d.inst.refs.length;
  des.crushCheck({ destroyed: false, speed: 2, root: { quaternion: { x: 0, y: 0, z: 0, w: 1 }, position: { x: d.cx, z: d.cz } }, cfg: { dims: { length: 7, width: 3.4 } } }, null);
  return { before, alive: d.alive, extracted: d.group.parent === des.root && d.inst.refs.length === 0, squashed: Math.abs(d.group.scale.y - d.baseScaleY) > 0.01 };
});
console.log('CRUSH:', JSON.stringify(crush));
const okCrush = crush.skip || (crush.extracted && crush.squashed && !crush.alive);
console.log(okCrush ? 'PASS 压毁抽出+压扁' : 'FAIL 压毁路径');

console.log('ERRORS:', errors.length ? errors.slice(0, 10) : '(none)');
await browser.close();
process.exit(okBatch && okDmg && okRub && okCrush && errors.length === 0 ? 0 : 1);
