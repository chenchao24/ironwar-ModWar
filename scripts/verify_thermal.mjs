// ═══ 热成像瞄具全流程验证（Puppeteer 无头） ═══
// 验证：热像车（leopard_2a7）开镜 N 切 IR（视觉/指示灯/截图）· 关镜自动关 ·
//       穿烟豁免（canSee 单元断言：烟中无IR不可见/有IR可见）· 无热像车（t-90m3）N 无效
// 用法：先 npx http-server -p 8080（no-store），再 node scripts/verify_thermal.mjs
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
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message} @ ${e.stack?.split('\n')[1]?.trim() || ''}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

const results = [];
const check = (name, ok) => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) process.exitCode = 1; };

await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('loading') || document.getElementById('loading').classList.contains('hide'), { timeout: 120000 });
await sleep(1500);

// —— 覆盖 → 菜单 → 机库 ——
await page.evaluate(() => document.getElementById('screen-cover').click());
await sleep(400);
await page.evaluate(() => document.getElementById('btn-war-mode').click());
await sleep(600);

// —— 选热像车 leopard_2a7 + 小镇图（_cycleHangar(0) 刷新展示与面板） ——
await page.evaluate(() => {
  const g = window.__game;
  g.ui.selectedTank = 'leopard_2a7';
  g._cycleHangar(0);
});
await page.evaluate(() => document.querySelector('#fh-map-row [data-map="town"]').click());
await sleep(300);

// —— 开始战斗 ——
await page.evaluate(() => document.querySelector('#screen-hangar [data-action="start"]').click());
await sleep(2500);

// —— 穿烟豁免单元断言（canSee：stub isBlocked=true 模拟烟遮） ——
const smokeTest = await page.evaluate(() => {
  const g = window.__game;
  const enemy = g.enemies[0];
  const savePos = enemy.pos.clone();
  enemy.pos.set(g.player.pos.x, g.player.pos.y, g.player.pos.z - 500);   // 移近至 500m 通视
  const orig = g.smoke.isBlocked;
  g.smoke.isBlocked = () => true;   // 强制被烟遮挡
  g.player.thermalOn = false;
  const noIR = g.visibility.canSee(g.player, enemy);       // 无 IR：烟遮 → false
  g.player.thermalOn = true;        // leopard_2a7 cfg.thermal = true
  const withIR = g.visibility.canSee(g.player, enemy);     // IR：豁免 → true
  g.smoke.isBlocked = orig;
  enemy.pos.copy(savePos);
  g.player.thermalOn = false;
  return { noIR, withIR };
});
check('穿烟：无 IR 烟中不可见', smokeTest.noIR === false);
check('穿烟：IR 开启穿烟可见', smokeTest.withIR === true);

// —— 开镜（Shift 点击切换闩锁） → N 开 IR ——
await page.keyboard.down('Shift');
await page.keyboard.up('Shift');
await sleep(400);
await page.keyboard.press('KeyN');
await sleep(600);
const ir1 = await page.evaluate(() => ({
  irOn: window.__game.irOn === true,
  thermalOn: window.__game.player.thermalOn === true,
  lamp: document.getElementById('gs-ir').classList.contains('on'),
  scoped: document.getElementById('gunsight') && !document.getElementById('gunsight').classList.contains('hidden'),
}));
check('IR 开启：irOn 状态', ir1.irOn);
check('IR 开启：player.thermalOn 标记', ir1.thermalOn);
check('IR 开启：镜内指示灯亮', ir1.lamp);
check('IR 开启：狙击镜激活', ir1.scoped);
await page.screenshot({ path: 'shot_thermal_on.png' });

// —— 关镜自动关 IR（Shift 再点一下 = 闩锁关镜） ——
await page.keyboard.down('Shift');
await page.keyboard.up('Shift');
await sleep(400);
const ir2 = await page.evaluate(() => ({
  irOn: window.__game.irOn === false,
  thermalOn: window.__game.player.thermalOn === false,
}));
check('关镜自动关闭 IR', ir2.irOn && ir2.thermalOn);

// —— 再点 Shift 开镜 N 开 / N 关（双次切换稳定性） ——
await page.keyboard.down('Shift');
await page.keyboard.up('Shift');
await sleep(300);
await page.keyboard.press('KeyN');
await sleep(300);
const irOnAgain = await page.evaluate(() => window.__game.irOn);
await page.keyboard.press('KeyN');
await sleep(300);
const irOffAgain = await page.evaluate(() => window.__game.irOn);
check('N 键双次切换：开→关', irOnAgain === true && irOffAgain === false);
await page.keyboard.down('Shift');
await page.keyboard.up('Shift');
await sleep(200);

// —— 退回菜单 → 换无热像车 t-90m3 ——
await page.keyboard.press('Escape');
await sleep(400);
await page.evaluate(() => document.getElementById('btn-pause-menu') && document.getElementById('btn-pause-menu').click());
await sleep(800);
await page.evaluate(() => document.getElementById('btn-war-mode').click());
await sleep(600);
await page.evaluate(() => {
  const g = window.__game;
  g.ui.selectedTank = 't-90m3';
  g._cycleHangar(0);
});
await page.evaluate(() => document.querySelector('#screen-hangar [data-action="start"]').click());
await sleep(2500);

// —— 无热像车：开镜 N 无响应 ——
await page.keyboard.down('Shift');
await sleep(400);
await page.keyboard.press('KeyN');
await sleep(400);
const ir3 = await page.evaluate(() => ({ irOn: window.__game.irOn, lamp: document.getElementById('gs-ir').classList.contains('on') }));
check('无热像车：N 键无效（irOn 仍 false）', ir3.irOn === false);
check('无热像车：指示灯不亮', ir3.lamp === false);
await page.keyboard.up('Shift');
await sleep(200);

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors.slice(0, 10) : '(none)');
await browser.close();
process.exit(errors.length || process.exitCode ? 1 : 0);
