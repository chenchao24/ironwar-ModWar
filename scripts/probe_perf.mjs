// 性能实测：进入两地图战斗，采样 FPS + renderer.info（drawcalls/triangles/programs）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=default', '--enable-unsafe-webgpu', '--window-size=1600,900', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => window.__game && window.__game.state !== 'loading', { timeout: 180000 });
await sleep(1000);
await page.evaluate(() => document.getElementById('screen-cover').click());
await sleep(300);
await page.evaluate(() => document.getElementById('btn-war-mode').click());
await sleep(500);

async function measureBattle(mapId) {
  await page.evaluate((m) => {
    const g = window.__game;
    g.ui.selectedTank = 'leopard_2a7';
    g._cycleHangar(0);
    document.querySelector(`#fh-map-row [data-map="${m}"]`).click();
  }, mapId);
  await sleep(300);
  await page.evaluate(() => document.querySelector('#screen-hangar [data-action="start"]').click());
  await sleep(2500);
  // 前进视角 + 开镜（重负载场景）
  await page.keyboard.down('KeyW');
  await sleep(2000);
  const fps = await page.evaluate(async () => {
    const t0 = performance.now();
    let n = 0;
    await new Promise((res) => {
      const loop = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(loop); else res(); };
      requestAnimationFrame(loop);
    });
    return { fps: n / 4, raw: performance.now() - t0 };
  });
  await page.keyboard.up('KeyW');
  const info = await page.evaluate(() => {
    const g = window.__game;
    const r = g.renderer.info;
    const shadow = r.shadowMap || {};
    const dpr = g.renderer.getPixelRatio();
    const sz = { x: innerWidth * dpr, y: innerHeight * dpr };
    return {
      calls: r.render.calls, triangles: r.render.triangles, points: r.render.points,
      geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs.length,
      dpr, w: sz.x, h: sz.y,
      particleCount: (() => { let c = 0; for (const p of Object.values(g.ps.pools)) { for (let i = 0; i < p.count; i++) if (p.pd[i * 4 + 1] > 0) c++; } return c; })(),
      obstacleCount: g.world.obstacles.length,
      shadowEnabled: g.renderer.shadowMap.enabled,
      toneMappingExposure: g.renderer.toneMappingExposure,
      quality: g.ui.settings.quality,
    };
  });
  console.log(`=== ${mapId} ===`);
  console.log('FPS:', fps.fps.toFixed(1));
  console.log(JSON.stringify(info, null, 1));
  // 退出
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.evaluate(() => document.getElementById('btn-pause-menu') && document.getElementById('btn-pause-menu').click());
  await sleep(600);
  await page.evaluate(() => document.getElementById('btn-war-mode').click());
  await sleep(500);
}

await measureBattle('town');
await measureBattle('plains');
console.log('ERRORS:', errors.length ? errors.slice(0, 5) : '(none)');
await browser.close();
