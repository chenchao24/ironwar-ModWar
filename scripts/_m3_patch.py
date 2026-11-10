import io

# ═══ 1. maps.js：surfaceY 并入 setGroundY（全消费者统一贴合路面） ═══
p = 'js/maps.js'
s = io.open(p, encoding='utf-8').read()
old = "  world.setGroundY((x, z) => townTerrainHeight(x, z) + des.rubbleHeightAt(x, z));"
new = """  world.setGroundY((x, z) => townTerrainHeight(x, z) + des.rubbleHeightAt(x, z) +
    (world.surfaceY ? world.surfaceY(x, z) : 0));"""
assert old in s; s = s.replace(old, new)
old = "  world.setGroundY(plainsHeight);"
new = "  world.setGroundY((x, z) => plainsHeight(x, z) + (world.surfaceY ? world.surfaceY(x, z) : 0));"
assert old in s; s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('maps.js surface merged into setGroundY')

# ═══ 2. tank.js：移除姿态采样里的二次叠加（setGroundY 已含路面高度） ═══
p = 'js/tank.js'
s = io.open(p, encoding='utf-8').read()
old = """    const surf = (x, z) => gh(x, z) + (this.world && this.world.surfaceY ? this.world.surfaceY(x, z) : 0);
    const sx = Math.sin(this.heading), cz = Math.cos(this.heading);"""
new = """    const sx = Math.sin(this.heading), cz = Math.cos(this.heading);"""
assert old in s; s = s.replace(old, new)
cnt = s.count('surf(this.pos')
assert cnt == 4, 'expect 4 surf calls, got ' + str(cnt)
s = s.replace('surf(this.pos', 'gh(this.pos')
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('tank.js double-count removed')

# ═══ 3. main.js：页面后台暂停提示 ═══
p = 'js/main.js'
s = io.open(p, encoding='utf-8').read()
old = """    window.__game = this;   // 调试/自动化验证钩子"""
new = """    window.__game = this;   // 调试/自动化验证钩子
    // 页面切后台提示：浏览器后台节流会冻结 rAF（游戏整体停摆），提示玩家切回前台
    document.addEventListener('visibilitychange', () => {
      let el = document.getElementById('bg-pause-tip');
      if (!el) {
        el = document.createElement('div');
        el.id = 'bg-pause-tip';
        el.style.cssText = ['position:fixed', 'top:46%', 'left:0', 'right:0', 'text-align:center',
          'font:bold 26px/1.4 sans-serif', 'color:#ffdf9e', 'text-shadow:0 2px 8px #000',
          'pointer-events:none', 'z-index:999', 'display:none',
        ].join(';');
        el.textContent = '⚠ 页面已切至后台，游戏暂停——切回本页面继续';
        document.body.appendChild(el);
      }
      el.style.display = (document.hidden && this.state === 'battle') ? 'block' : 'none';
    });"""
assert old in s; s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('main.js bg-pause tip done')

# ═══ 4. ai.js：烟雾运用 + 受击立即决策 + 主炮弹道遮挡门控/拆掩体 ═══
p = 'js/ai.js'
s = io.open(p, encoding='utf-8').read()

# 4a. ace 参数：smokeUse
old = """    tiltDuel: true,                                        // 斜对敌摆角游走（绝不横/尾对敌）"""
new = """    tiltDuel: true,                                        // 斜对敌摆角游走（绝不横/尾对敌）
    smokeUse: true,                                        // 烟雾弹运用（撤离/无掩体掩护）"""
assert old in s; s = s.replace(old, new)

# 4b. update 开头：smoke 引用存字段（供 _postFireDecision 使用）
old = """    this.visibility = visibility || this.visibility;"""
new = """    this.visibility = visibility || this.visibility;
    this.smokeRef = smoke || this.smokeRef;"""
assert old in s; s = s.replace(old, new)

# 4c. 受击侦测：立即决策（不等待下次开火）
old = """    if (this._lastHp >= 0 && t.hp < this._lastHp) {
      this._justHit = true;
      if (this.coverState === 'peeking') this.coverState = 'moving';
    }
    this._lastHp = t.hp;"""
new = """    if (this._lastHp >= 0 && t.hp < this._lastHp) {
      this._justHit = true;
      if (this.coverState === 'peeking') this.coverState = 'moving';
      else if (!this.coverState && this.diff.coverUse) this._postFireDecision(player);   // 受击立即决策找掩体
    }
    this._lastHp = t.hp;"""
assert old in s; s = s.replace(old, new)

# 4d. evade 触发：拉烟掩护（撤离前）
old = """      this._evadePhase = Math.random() * Math.PI * 2;
      // M2.6 撤退战略：优先倒车入掩体（到位转藏身/伏击）；无掩体则倒出玩家视野
      const cvPt = (this.diff.coverUse && this.visibility) ? this._bestCoverPt(player) : null;"""
new = """      this._evadePhase = Math.random() * Math.PI * 2;
      // M3 撤离拉烟：掩护倒车路线（烟云同时遮断玩家视线 → 玩家 lostContact）
      if (this.diff.smokeUse && smoke && t.smokeAmmo > 0 && t.smokeCooldown <= 0 && Math.random() < 0.75) {
        if (smoke.fire(t)) { t.smokeAmmo--; t.smokeCooldown = 4; }
      }
      // M2.6 撤退战略：优先倒车入掩体（到位转藏身/伏击）；无掩体则倒出玩家视野
      const cvPt = (this.diff.coverUse && this.visibility) ? this._bestCoverPt(player) : null;"""
assert old in s; s = s.replace(old, new)

# 4e. _postFireDecision：无掩体时概率拉烟 + 侧移
old = """    if (!pt) choice = r < 0.7 ? 'strafe' : 'hold';
    else choice = r < pCover ? 'cover' : (r < pCover + 0.25 ? 'strafe' : 'hold');"""
new = """    if (!pt) {
      // 无合格掩体：侧移 55% / 拉烟掩护 25%（有烟且未用尽）/ 原地对射 20%
      const canSmoke = this.diff.smokeUse && this.smokeRef && t.smokeAmmo > 0 && t.smokeCooldown <= 0;
      choice = r < 0.55 ? 'strafe' : (r < 0.8 && canSmoke ? 'smoke' : 'hold');
    } else {
      choice = r < pCover ? 'cover' : (r < pCover + 0.25 ? 'strafe' : 'hold');
    }"""
assert old in s; s = s.replace(old, new)

old = """    } else if (choice === 'strafe') {
      this.coverState = null;
      this._dashT = 1.5 + Math.random() * 1.5;
      this._dashDir = Math.random() < 0.5 ? 1 : -1;
    } else {"""
new = """    } else if (choice === 'strafe' || choice === 'smoke') {
      this.coverState = null;
      this._dashT = 1.5 + Math.random() * 1.5;   // 拉烟/侧移：掩体缺失时转移
      this._dashDir = Math.random() < 0.5 ? 1 : -1;
      if (choice === 'smoke' && this.smokeRef && this.smokeRef.fire(t)) {
        t.smokeAmmo--; t.smokeCooldown = 4;      // 拉烟掩护转移（烟云遮断玩家视线）
      }
    } else {"""
assert old in s; s = s.replace(old, new)

# 4f. 主炮弹道遮挡门控 + HE 拆掩体（ace）
old = """    // ── 开火（散布未收敛不开火：模拟停车/缓行瞄准；观瞄受损门槛随散布倍率放宽） ──
    if (this.fireHesitation > 0) this.fireHesitation -= dt;
    // 短停态用更严的收敛门槛（停车 ≥0.5s 基本可达），机动态维持宽门槛
    const spreadOk = t.dispersion < (this._stopT > 0 ? (this.diff.stopSpread || 0.0024) : 0.012) * (t.opticsMult || 1);"""
new = """    // ── 开火（散布未收敛不开火：模拟停车/缓行瞄准；观瞄受损门槛随散布倍率放宽） ──
    if (this.fireHesitation > 0) this.fireHesitation -= dt;
    // 短停态用更严的收敛门槛（停车 ≥0.5s 基本可达），机动态维持宽门槛
    const spreadOk = t.dispersion < (this._stopT > 0 ? (this.diff.stopSpread || 0.0024) : 0.012) * (t.opticsMult || 1);
    // M3 弹道遮挡：炮口→目标的视线被掩体/地形挡住 → 仅 HE 低频开火拆掩体（ace），其余沉默省弹药
    let coverBlocked = false;
    if (this.visibility && p.spotted) {
      const gyT = t.world.groundY(t.pos.x, t.pos.z);
      coverBlocked = !this.visibility.canSeePoint(t.pos.x, t.pos.z, gyT + t.cfg.dims.turretTop * 0.85, p);
      if (coverBlocked && this.diff.switchShell && t.shellType !== 'he' && t.shellPool.he > 0 && Math.random() < 0.04) {
        t.switchShell('he');   // 拆掩体：切 HE（高爆是唯一能摧毁建筑结构的弹种）
      }
    }"""
assert old in s; s = s.replace(old, new)

old = """    if (aligned && spreadOk && (this.fireHesitation <= 0 || apsWindow) && t.readyToFire() && dist < this.diff.fireRange) {
      const shot = t.fire();"""
new = """    if (aligned && spreadOk && (this.fireHesitation <= 0 || apsWindow) && t.readyToFire() && dist < this.diff.fireRange) {
      if (coverBlocked && !(t.shellType === 'he' && Math.random() < 0.4)) {
        // 掩体遮挡：不开火（避免浪费弹药/替玩家拆自家掩体）；HE 弹 40% 概率拆掩体
      } else {
      const shot = t.fire();"""
assert old in s; s = s.replace(old, new)

# 4g. 开火体闭合（原 if 体末尾补一层括号）
old = """        this.fireHesitation = this.diff.hesitMin + Math.random() * (this.diff.hesitMax - this.diff.hesitMin);
        this._postFireDecision(player);   // M2：概率化战术决策（找掩体/侧移/原地对射，反套路）
        if (this.onFire) this.onFire(t);
      }"""
new = """        this.fireHesitation = this.diff.hesitMin + Math.random() * (this.diff.hesitMax - this.diff.hesitMin);
        this._postFireDecision(player);   // M2：概率化战术决策（找掩体/侧移/原地对射，反套路）
        if (this.onFire) this.onFire(t);
      }
      }"""
assert old in s; s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ai.js M3 done')
