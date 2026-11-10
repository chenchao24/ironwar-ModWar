// ═══ 物件音效探针：①静止5s+净路直线行驶8s 零触发 ②持续音整遍播完才允许下一遍（不重叠） ③事件音 120ms 去重 ═══
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

const result = await page.evaluate(async () => {
  const g = window.__game;
  const a = window.__audio;
  await a.loadPropSounds();
  await new Promise(r => setTimeout(r, 600));
  if (!a.propSfx || !a.propSfx.crushRubble) return { fail: 'propSfx 未加载' };

  // ── 仪器化：统计 playProp 的实际播放（_playBuffer）与跳过 ──
  const stats = { played: {}, skipped: {} };
  const origPlay = a._playBuffer.bind(a);
  a._playBuffer = (buf, vol) => { stats.n = (stats.n || 0) + 1; return origPlay(buf, vol); };

  // ① 静止 5s + 净路直线行驶 8s：物件音零触发（真实时间驱动，走游戏自身 rAF 循环）
  const p = g.player;
  const log = [];
  const aPlay = a.playProp.bind(a);
  a.playProp = (name, vol) => { log.push(name); return aPlay(name, vol); };
  // 静止 5s
  g.input.keys.delete('KeyW');
  await new Promise(r => setTimeout(r, 5000));
  const staticLog = log.length;
  // 直线行驶 8s（净路：传送到 z 轴公路走廊 (0,-240) 朝 +z 直驶——公路上无物件）
  p.pos.set(0, g.world.groundY(0, -240), -240);
  p.root.rotation.set(0, Math.PI, 0);
  p.speed = 0;
  p._syncTransform(1 / 60);
  g.scene.updateMatrixWorld(true);
  const p0 = p.pos.clone();
  g.input.keys.add('KeyW');
  await new Promise(r => setTimeout(r, 8000));
  g.input.keys.delete('KeyW');
  const driveLog = log.slice(staticLog);
  const moved = p.pos.distanceTo(p0);

  // ② 持续音门控：以 100ms 间隔连发 40 次 crushRubble（模拟碾连排栅栏）
  let played = 0, skipped = 0;
  const dur = a.propSfx.crushRubble.duration;
  for (let i = 0; i < 40; i++) {
    const ok = aPlay('crushRubble', 0.5);
    ok ? played++ : skipped++;
    await new Promise(r => setTimeout(r, 100));
  }
  // ③ 事件音去重：同帧双发 houseHit 只应播 1 次
  const h1 = aPlay('houseHit', 0.8);
  const h2 = aPlay('houseHit', 0.8);

  a.playProp = aPlay;
  a._playBuffer = origPlay;
  return {
    staticTriggers: staticLog, driveTriggers: driveLog.length, driveLog: driveLog.slice(0, 6),
    moved: moved.toFixed(1), rubbleDur: dur.toFixed(2),
    sustained: { played, skipped }, evtDedup: { first: h1, second: h2 },
  };
});

console.log(JSON.stringify(result, null, 2));
const r = result;
const pass =
  r.staticTriggers === 0 &&
  r.driveTriggers === 0 && r.moved > 30 &&
  r.sustained.played >= 1 && r.sustained.played <= 5 &&   // 4s 窗口内 100ms 连发最多播 4~5 遍
  r.sustained.skipped >= 35 &&
  r.evtDedup.first === true && r.evtDedup.second === false;
console.log(pass ? 'PASS 物件音效三项行为全部符合' : 'FAIL 有不符合项');
console.log('ERRORS:', errors.length ? errors.slice(0, 5) : '(none)');
await browser.close();
process.exit(pass && errors.length === 0 ? 0 : 1);
