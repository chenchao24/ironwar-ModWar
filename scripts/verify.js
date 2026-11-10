// 无头验证脚本：加载游戏 -> 截图各状态 -> 收集控制台错误
// duel2 迭代：额外验证弹种面板/切弹/消耗品/难度选择
const puppeteer = require('puppeteer-core');
const fs = require('fs');

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
  // 等待加载完成（封面出现）
  await page.waitForFunction(() => document.getElementById('loading-overlay').classList.contains('done'), { timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'shot_cover.png' });

  // 进入主菜单
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'shot_menu.png' });

  // 进入选车
  await page.click('#btn-war-mode');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'shot_select.png' });

  // 难度切换到王牌
  await page.click('.fh-diff-btn[data-diff="ace"]');
  await new Promise(r => setTimeout(r, 300));

  // 开始战斗（无头模式下 pointer lock 可能失败，不影响渲染验证）
  await page.click('.fh-start-btn');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'shot_battle1.png' });

  // 验证弹药面板：MG + AP/HEAT/HE 四列
  const ammoState = await page.evaluate(() => {
    const cols = document.querySelectorAll('#ammo-panel .ammo-col');
    return {
      colCount: cols.length,
      labels: [...cols].map(c => c.querySelector('.ammo-label').textContent),
      activeLabel: document.querySelector('#ammo-panel .ammo-label.active')?.textContent || '',
    };
  });
  console.log('AMMO PANEL:', JSON.stringify(ammoState));

  // 切换到 HEAT（数字键 2）
  await page.keyboard.press('Digit2');
  await new Promise(r => setTimeout(r, 400));
  const afterSwitch = await page.evaluate(() => ({
    activeLabel: document.querySelector('#ammo-panel .ammo-label.active')?.textContent || '',
    shellType: window.__game?.player?.shellType,
    reload: window.__game?.player?.reload > 0,
    message: document.getElementById('battle-message').textContent,
  }));
  console.log('AFTER SWITCH HEAT:', JSON.stringify(afterSwitch));

  // 消耗品：空放（无损伤时应提示"无受损模块"/"未起火"）
  await page.keyboard.press('KeyR');
  await new Promise(r => setTimeout(r, 300));
  await page.keyboard.press('KeyT');
  await new Promise(r => setTimeout(r, 300));
  const consState = await page.evaluate(() => ({
    repair: window.__game?.player?.consumables?.repair,
    ext: window.__game?.player?.consumables?.ext,
  }));
  console.log('CONSUMABLES (should stay 1/1 when no damage):', JSON.stringify(consState));

  // 开一炮验证弹种出膛（HEAT 弹速）
  await page.mouse.click(800, 450);   // 战斗内左键开炮（可能因未锁定指针而无效，尽力而为）
  await new Promise(r => setTimeout(r, 800));

  // 模拟前进
  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: 'shot_battle_drive.png' });
  await page.keyboard.up('KeyW');

  // 状态输出
  const state = await page.evaluate(() => {
    const g = window.__game;
    const hud = document.getElementById('hud').classList.contains('active');
    return {
      hud, hp: document.getElementById('hp-text').textContent,
      speed: document.getElementById('speed-val').textContent,
      shellType: g?.player?.shellType,
      pool: g?.player?.shellPool,
      aiDifficulty: g?.ui?.aiDifficulty,
      enemyDist: g?.player ? Math.round(g.player.pos.distanceTo(g.enemies[0].pos)) : -1,
    };
  });
  console.log('STATE:', JSON.stringify(state));
  console.log('ERRORS:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAIL:', e.message); process.exit(1); });
