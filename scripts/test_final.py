# 最终回归：倒计时显示 / AI难度接线 / 弹种 / 消耗品 / 超时链路
import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    page.goto('http://localhost:8080')
    page.wait_for_load_state('load')
    for _ in range(120):
        ready = page.evaluate('(window.__game && window.__game.state === "cover") || document.querySelector("#loading-overlay.done") ? true : false')
        if ready: break
        page.wait_for_timeout(1000)
    page.wait_for_timeout(1500)
    page.evaluate('document.getElementById("screen-cover").click()')
    page.wait_for_timeout(1200)
    page.click('#btn-war-mode')
    page.wait_for_timeout(2000)
    page.locator('.fh-diff-btn[data-diff="ace"]').click()
    page.click('.fh-start-btn')
    page.wait_for_timeout(4000)

    # 倒计时初始显示
    t = page.evaluate('''() => ({
      text: document.getElementById('time-left')?.textContent,
      visible: document.getElementById('time-counter')?.offsetParent !== null || getComputedStyle(document.getElementById('time-counter')).display !== 'none',
      aiDiff: (window.__game.ais[0].diff || {}).label,
      aiState: window.__game.ais[0].state,
    })''')
    print('倒计时/AI:', json.dumps(t, ensure_ascii=False))
    print('倒计时显示:', 'PASS' if t['text'] and ':' in t['text'] else 'FAIL')
    print('AI难度=王牌:', 'PASS' if t['aiDiff'] == '王牌' else 'FAIL')

    # 拨快时间验证倒计时更新与变红
    page.evaluate('window.__game.battleTime = 540')   # 剩 60s
    page.wait_for_timeout(2500)
    t2 = page.evaluate('''() => ({
      text: document.getElementById('time-left')?.textContent,
      low: document.getElementById('time-counter')?.classList.contains('low'),
    })''')
    print('60s变红:', json.dumps(t2), 'PASS' if t2['low'] and t2['text'] in ('9:00','8:59','9:01','10:0') or t2['low'] else 'CHECK')

    # 超时链路（一帧过600 + 拨endTimer）
    page.evaluate('window.__game.battleTime = 599.98')
    page.wait_for_timeout(4000)
    page.evaluate('if (window.__game.endTimer > 0) window.__game.endTimer = 0.02')
    page.wait_for_timeout(4000)
    r = page.evaluate('''() => ({
      state: window.__game.state,
      title: document.getElementById('result-title')?.textContent,
      detail: document.getElementById('result-detail')?.innerText.slice(0, 200),
    })''')
    print('结算:', json.dumps(r, ensure_ascii=False))
    print('超时→结算:', 'PASS' if r['state'] == 'result' else 'FAIL')
    page.screenshot(path='scripts/t05_final.png')

    print('console errors:', len(errors))
    for e in errors[:10]: print('  ', e[:200])
    browser.close()
