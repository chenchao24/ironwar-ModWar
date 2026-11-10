// ═══ 电线杆压倒探针：碾过后实例矩阵清零（合批抽出）、独立克隆挂 pivot 倒伏、无原地立杆 ═══
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--window-size=1600,900', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('loading') || document.getElementById('loading').classList.contains('hide'), { timeout: 120000 });
await sleep(1500);
await page.evaluate(() => document.getElementById('screen-cover').click());
await sleep(400);
await page.evaluate(() => document.getElementById('btn-war-mode').click());
await sleep(600);
await page.evaluate(() => document.querySelector('#fh-map-row [data-map="town"]').click());
await sleep(300);
await page.evaluate(() => document.querySelector('#screen-hangar [data-action="start"]').click());
await sleep(3000);

// 传送玩家到 (-13,-300) 朝 -z 直碾 4s——路线前方 (-13,-340)、(-13,-430) 有电线杆
await page.evaluate(() => {
  const g = window.__game, p = g.player;
  p.pos.set(-13, g.world.groundY(-13, -300), -300);
  p.heading = Math.PI;   // 车头朝 -z（heading 0 = +z）
  p.speed = 0; p._syncTransform(1 / 60);
  g.scene.updateMatrixWorld(true);
  g.input.keys.add('KeyW');
});
await sleep(9000);
const r = await page.evaluate(() => {
  const g = window.__game;
  g.input.keys.delete('KeyW');
  const des = g.world.destructibles;
  const pylons = des.list.filter(d => d.type === 'pylon01');
  const fell = pylons.filter(d => !d.alive);
  // 抽出验证：实例 refs 已清空（矩阵置零过）+ 克隆已挂场景（parent 链可达 root）
  const extracted = fell.filter(d => d.inst && d.inst.refs.length === 0 && d.group.parent);
  const inScene = extracted.filter(d => {
    let n = d.group;
    while (n) { if (n === des.root) return true; n = n.parent; }
    return false;
  });
  return {
    total: pylons.length, fell: fell.length, extracted: extracted.length, inScene: inScene.length,
    fallingNow: des.fallingPylons.length,
    pos: g.player.pos.toArray().map(v => v.toFixed(1)),
    nearest: pylons.slice(0, 3).map(d => [d.cx?.toFixed?.(0) ?? d.cx, d.cz?.toFixed?.(0) ?? d.cz, d.alive]),
  };
});
console.log(JSON.stringify(r));
const pass = r.fell >= 1 && r.extracted === r.fell && r.inScene === r.fell && (r.fallingNow >= 0);
console.log(pass ? 'PASS 电线杆压倒：合批实例清零 + 克隆倒伏挂载正确' : 'FAIL 有残留立杆或抽出失败');
console.log('ERRORS:', errors.length ? errors.slice(0, 5) : '(none)');
await browser.close();
process.exit(pass && errors.length === 0 ? 0 : 1);
