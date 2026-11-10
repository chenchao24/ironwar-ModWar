// 履带印专项验证：直行/转向/原地转向 截图 + 八方向印章朝向点积实测
const puppeteer = require('puppeteer-core');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await sleep(800);
  await page.click('#screen-cover');
  await sleep(600);
  await page.click('#btn-war-mode');
  await sleep(500);
  await page.click('#btn-start-battle');
  await sleep(2000);

  // 关掉 AI（敌车不开火不机动，保证截图干净；履带印代码路径玩家/AI 相同）
  await page.evaluate(() => { window.__game.ais = []; });

  // ── 场景 1：W 直行 4.5s → 应见两条平行履带印 ──
  await page.keyboard.down('KeyW');
  await sleep(4500);
  await page.screenshot({ path: 'shot_tracks_straight.png' });
  await page.keyboard.up('KeyW');
  await sleep(800);

  // ── 场景 2：W+A 转向行驶 4s → 印迹应顺弧线贴合 ──
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyA');
  await sleep(4000);
  await page.screenshot({ path: 'shot_tracks_turn.png' });
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');
  await sleep(1200);   // 滑行停车

  // ── 场景 3：低速原地转向 3s → 不得出现锯齿宽带 ──
  await page.keyboard.down('KeyA');
  await sleep(3000);
  await page.screenshot({ path: 'shot_tracks_pivot.png' });
  await page.keyboard.up('KeyA');

  // ── 朝向实测：八方向各 stamp 一枚，读回实例矩阵长轴与前进方向点积 ──
  const orient = await page.evaluate(() => {
    const tm = window.__game.trackMarks;
    const arr = tm.mesh.instanceMatrix.array;
    const out = [];
    for (let k = 0; k < 8; k++) {
      const yaw = k * Math.PI / 4;
      const i = tm.head;
      tm.stamp(0, 0, yaw, 1);
      // 实例矩阵第 2 列 = 局部 +Y（长轴）的世界方向
      const x = arr[i * 16 + 4], y = arr[i * 16 + 5], z = arr[i * 16 + 6];
      const l = Math.hypot(x, y, z);
      // 坦克实际前进方向（tank.js drive 位移公式）：(sinψ, 0, cosψ)
      const dot = (x * Math.sin(yaw) + z * Math.cos(yaw)) / l;
      out.push({ deg: k * 45, dot: Number(dot.toFixed(4)) });
    }
    // 顺带统计：当前存活印章数（应 >0，证明行驶中真的落了印）
    const alive = tm._items.filter(Boolean).length;
    return { dots: out, alive };
  });

  console.log('ORIENT_DOTS:', JSON.stringify(orient.dots));
  console.log('ALIVE_STAMPS:', orient.alive);
  const pass = orient.dots.every((d) => Math.abs(d.dot) > 0.98);
  console.log('ORIENT_PASS:', pass);
  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  process.exit(pass ? 0 : 2);
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
