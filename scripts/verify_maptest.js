// 地图测试页验证：加载无报错 / 进入战场 / 坦克可动 / 烟雾弹 / 狙击镜 / 截图
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

  await page.goto('http://localhost:8080/map-test.html', { waitUntil: 'networkidle2', timeout: 90000 });
  // 等待载入遮罩隐藏 → 进入遮罩出现
  await page.waitForFunction(() => document.getElementById('loading').classList.contains('hide'), { timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('enterMask').classList.contains('hide'), { timeout: 30000 });

  // 点击进入战场（用户手势 → 音频解锁）
  await page.click('#enterBtn');
  await new Promise(r => setTimeout(r, 1500));

  const readStatus = () => page.evaluate(() => document.getElementById('statusPanel').innerText);
  console.log('INIT:', JSON.stringify(await readStatus()));
  await page.screenshot({ path: 'shot_maptest_spawn.png' });

  // W 前进 3 秒（沿公路开向镇子）
  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, 3000));
  await page.keyboard.up('KeyW');
  console.log('DRIVE:', JSON.stringify(await readStatus()));
  await page.screenshot({ path: 'shot_maptest_drive.png' });

  // 继续前进 3 秒深入主街（两侧院落），核对房屋比例
  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, 3000));
  await page.keyboard.up('KeyW');
  console.log('STREET:', JSON.stringify(await readStatus()));
  await page.screenshot({ path: 'shot_maptest_street.png' });

  // 场景统计：draw call / 三角面 / 碰撞体
  const stats = await page.evaluate(() => window.__mapStats ? window.__mapStats() : null);
  console.log('STATS:', stats ? JSON.stringify(stats) : '(no hook)');

  // G 烟雾弹（烟雾弹计数应 3 → 2）
  await page.keyboard.press('KeyG');
  await new Promise(r => setTimeout(r, 1200));
  console.log('SMOKE:', JSON.stringify(await readStatus()));
  await page.screenshot({ path: 'shot_maptest_smoke.png' });

  // SHIFT 狙击镜（镜内散布虚线圈 + 变倍文本）
  await page.keyboard.down('ShiftLeft');
  await new Promise(r => setTimeout(r, 1200));
  const scope = await page.evaluate(() => ({
    overlay: document.getElementById('scopeOverlay').classList.contains('show'),
    zoom: document.getElementById('scopeZoom').textContent,
    gsDisp: document.getElementById('gsDisp').style.width,
    aim: document.getElementById('aimText').textContent,
  }));
  console.log('SCOPE:', JSON.stringify(scope));
  await page.screenshot({ path: 'shot_maptest_scope.png' });
  await page.keyboard.up('ShiftLeft');

  // C 观赏视角
  await page.keyboard.press('KeyC');
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'shot_maptest_orbit.png' });
  await page.keyboard.press('KeyC');

  // ── 摧毁机制：炮击主街房屋（78,24 北侧）→ 命中灰化着火 → 终击倒塌 → 废墟 ──
  const dmg1 = await page.evaluate(() => window.__mapStats().__damageNearest(78, 24, true));
  console.log('DMG1(house):', JSON.stringify(dmg1));
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'shot_maptest_collapsing.png' });   // 倒塌中：尘云遮蔽
  await new Promise(r => setTimeout(r, 2800));                        // 等倒塌完成（~2.6s）
  await page.screenshot({ path: 'shot_maptest_rubble.png' });        // 废墟 + 余烟
  const stats2 = await page.evaluate(() => {
    const s = window.__mapStats();
    return { destroyed: s.destroyed, rubbleFields: s.rubbleFields };
  });
  console.log('AFTER-COLLAPSE:', JSON.stringify(stats2));

  // ── 树倒伏：瞬移到最近树旁碾倒 → 树应倒下（非压扁） ──
  const crushTree = await page.evaluate(() => window.__mapStats().__crushNearestTree());
  console.log('CRUSH-TREE:', JSON.stringify(crushTree));
  await new Promise(r => setTimeout(r, 1200));

  // ── 围栏压毁：农舍前栏（细碎屑非砖块） ──
  const crush = await page.evaluate(() => window.__mapStats().__crushAt(415, 26));
  console.log('CRUSH-FENCE:', JSON.stringify(crush));
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'shot_maptest_crush.png' });

  // ── 围栏/电线杆穿弹：炮弹线段穿过 → 不可命中（hit=false，物件无损） ──
  const fencePass = await page.evaluate(() => window.__mapStats().__shellThroughNearest(415, 30));
  console.log('FENCE-PASS:', JSON.stringify(fencePass));
  const pylonPass = await page.evaluate(() => window.__mapStats().__shellThroughNearest(340, 13));
  console.log('PYLON-PASS:', JSON.stringify(pylonPass));

  // ── 电线杆压倒：瞬移到公路边电线杆 (340,13) → 绕根部倒下 ──
  const pylonFall = await page.evaluate(() => window.__mapStats().__crushAt(340, 13));
  console.log('PYLON-FALL:', JSON.stringify(pylonFall));
  await new Promise(r => setTimeout(r, 1300));   // 等倒伏动画（0.95s）完成
  await page.screenshot({ path: 'shot_maptest_pylon.png' });
  const stats3 = await page.evaluate(() => {
    const s = window.__mapStats();
    return { destroyed: s.destroyed, rubbleFields: s.rubbleFields };
  });
  console.log('FINAL:', JSON.stringify(stats3));

  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
