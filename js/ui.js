// ═══ UI：屏幕切换 / HUD / 缩圈准星 / 狙击镜 / 小地图 / 敌标 / 伤害飘字 ═══
import * as THREE from 'three';
import { Minimap } from './minimap.js';
import { getTankDisplay } from './tank-display.js';
import { SHELL_TYPES, APS_RULES, TANKS } from './config.js';
import { AI_DIFFICULTY } from './ai.js';
import { RETICLES } from './reticles.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

// 国旗资源（cfg.nation → flags/ 目录；英国 ISO 代码为 gb）
const FLAG_BY_NATION = { ru: 'flags/ru.png', de: 'flags/de.png', us: 'flags/us.png', uk: 'flags/gb.png', cn: 'flags/cn.png', fr: 'flags/fr.png', il: 'flags/il.png', jp: 'flags/jp.png', se: 'flags/se.png', id: 'flags/id.png', in: 'flags/in.png' };

export class UI {
  constructor() {
    this.screens = {
      cover: $('screen-cover'), menu: $('screen-menu'), hangar: $('screen-hangar'),
      hud: $('hud'), result: $('screen-result'), pause: $('screen-pause'),
    };
    this.hpFill = $('hp-fill'); this.hpText = $('hp-text'); this.hpLabel = $('hp-label');
    this.speedVal = $('speed-val'); this.speedFill = $('speed-fill'); this.gear = $('gear-val');
    this.crosshair = $('crosshair');
    this.reloadRing = $('reload-ring');
    this.reloadFg = document.querySelector('.rr-fg');
    this.reloadWarn = $('reload-warning');
    this.aimInfo = $('aim-info');
    this.aimRange = $('aim-range'); this.aimTarget = $('aim-target');
    this.aimProgress = $('aim-progress');
    this.hitMarkerEl = $('hit-marker');
    this.penMarkerEl = $('pen-marker');
    this.vignette = $('damage-vignette');
    this.dmgIndicator = $('damage-indicator');
    this.enemiesLeft = $('enemies-left');
    this.timeCounter = $('time-counter');
    this.timeLeft = $('time-left');
    this._timeKey = '';
    this.battleMsg = $('battle-message');
    this.statusTags = $('status-tags');
    this.modChips = $('mod-chips');
    this._chipKey = '';
    this.gunsight = $('gunsight');
    this.gsShell = $('gs-shell'); this.gsReload = $('gs-reload'); this.gsZoom = $('gs-zoom');
    this.gsRange = $('gs-range'); this.gsTarget = $('gs-target');
    this.gsIr = $('gs-ir');
    this.gsrFg = document.querySelector('.gsr-fg');
    this.gsReloadText = $('gs-reload-text');
    this.gsDisp = $('gs-disp');
    this.gsFlash = $('gs-flash');
    this.markersLayer = $('markers');
    this.markers = new Map();
    this.csTicks = $('csTicks');
    this.compassDeg = $('compassDeg');
    this.hitlogEl = $('hitlog');
    this.smokeCount = $('smoke-count');
    // 防护体系状态行（无该系统的车对应行隐藏）
    this.protEra = $('prot-era'); this.protEraVal = $('prot-era-val');
    this.protAps = $('prot-aps'); this.protApsVal = $('prot-aps-val');
    this.protOpt = $('prot-optics'); this.protOptVal = $('prot-optics-val');
    this.protLws = $('prot-lws'); this.protLwsVal = $('prot-lws-val');
    // 激光告警 / 压制提示（罗盘下方）+ 镜内致盲白幕
    this.laserWarn = $('laser-warning');
    this.laserSupp = $('laser-suppress'); this.laserSuppT = $('laser-suppress-t');
    this.gsBlind = $('gs-blind');
    // 机库/切车载入浮标（spinner + 进度条，不遮挡界面）
    this.hangarLoading = $('hangar-loading');
    this.hangarLoadingText = $('hangar-loading-text');
    this.hangarLoadingBar = document.querySelector('#hangar-loading .hl-bar');
    this.hangarLoadingFill = $('hangar-loading-fill');
    this.minimap = null;
    this._cam = null;
    this._scoped = false;
    this.settings = this._loadSettings();
    this.buildReticle('ru');
    this._buildCompassTicks();
    this.selectedTank = 't-90m3';
    this.aiDifficulty = 'standard';   // 敌方 AI 难度（机库页选择）

    // 弹药面板（战斗开始时按坦克备弹动态构建：AP/HEAT/HE/MG 数字卡）
    this._ammoItems = {};

    // 机库难度选择
    document.querySelectorAll('#fh-diff-row .fh-diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#fh-diff-row .fh-diff-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.aiDifficulty = btn.dataset.diff;
        this._refreshPreview();
      });
    });
    // 机库地图选择（settings.map 持久化；main.js 开战时按此重建世界）
    document.querySelectorAll('#fh-map-row .fh-diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#fh-map-row .fh-diff-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings.map = btn.dataset.map;
        this.saveSettings();
        this._refreshPreview();
      });
    });
    this._syncMapChoice();
  }

  // 恢复地图选择高亮（settings.map 缺省 plains）
  _syncMapChoice() {
    const cur = this.settings.map || 'plains';
    document.querySelectorAll('#fh-map-row .fh-diff-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.map === cur);
    });
  }

  initMinimap(world) {
    this.minimap = new Minimap($('minimap'), world);
    this.minimap.prerender();
  }

  // ─────────── 设置 ───────────
  _loadSettings() {
    try {
      return { master: 80, sfx: 90, ambient: 60, quality: 'high', bgmOn: true, bgmVol: 50, bgmMode: 'normal',
        ...JSON.parse(localStorage.getItem('ironwar_settings') || '{}') };
    } catch (e) { return { master: 80, sfx: 90, ambient: 60, quality: 'high', bgmOn: true, bgmVol: 50, bgmMode: 'normal' }; }
  }
  saveSettings() { localStorage.setItem('ironwar_settings', JSON.stringify(this.settings)); }

  show(name) {
    for (const k in this.screens) this.screens[k].classList.toggle('active', k === name);
    if (name === 'hud') this.screens.hud.classList.add('active');
  }

  bind(handlers) {
    $('screen-cover').addEventListener('click', () => handlers.onCoverClick());
    $('btn-war-mode').addEventListener('click', () => handlers.onWarMode());
    $('btn-settings').addEventListener('click', () => { this._syncSettingsUI(); $('modal-settings').classList.add('active'); });
    $('btn-settings-close').addEventListener('click', () => {
      $('modal-settings').classList.remove('active');
      this._readSettingsUI();
      this.saveSettings();
      handlers.onSettingsChanged(this.settings);
    });
    // 机库页交互（翻页/开始/返回）
    document.querySelectorAll('#screen-hangar [data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if (a === 'prev') { handlers.onHangarPrev && handlers.onHangarPrev(); }
        else if (a === 'next') { handlers.onHangarNext && handlers.onHangarNext(); }
        else if (a === 'start') { handlers.onStartBattle && handlers.onStartBattle(); }
        else if (a === 'back') { handlers.onBackMenu && handlers.onBackMenu(); }
      });
    });
    this._buildTankSelect(handlers);
    $('btn-result-menu').addEventListener('click', () => handlers.onResultMenu());
    $('btn-result-retry').addEventListener('click', () => handlers.onRetry());
    $('btn-pause-resume').addEventListener('click', () => handlers.onPauseResume && handlers.onPauseResume());
    $('btn-pause-menu').addEventListener('click', () => handlers.onPauseMenu && handlers.onPauseMenu());
  }

  // 机库页信息面板刷新（面板 DOM 只建一次，切换只刷新文字/条宽，避免整块重排闪烁）
  refreshHangar(tankId, cfg) {
    this.selectedTank = tankId;
    const d = getTankDisplay(tankId);
    const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
    set('fh-pager-name', cfg.name);
    this._syncTankSelect(tankId);
    // 国旗图标随国别切换（内容不变不重排）
    const flag = $('fh-ac-flag');
    if (flag) {
      const src = FLAG_BY_NATION[cfg.nation] || '';
      if (flag.getAttribute('src') !== src) flag.setAttribute('src', src);
      flag.style.display = src ? '' : 'none';
      flag.alt = d ? d.nation : cfg.name;
    }
    if (d) {
      set('fh-ac-name', cfg.name);
      set('fh-ac-sub', `${d.subtitle} · ${d.nation}`);
      set('fh-ac-history', d.history || '');
      this._refreshSpecRows(d, cfg);
      this._refreshGameBars(d);
    }
    this._refreshPreview();
  }

  // 机库快速选择下拉：列表只建一次；选中走 onHangarSelect（与翻页同一条装载管线）
  _buildTankSelect(handlers) {
    const box = $('fh-select');
    if (!box) return;
    const btn = $('fh-select-btn');
    const list = $('fh-select-list');
    list.innerHTML = '';
    for (const [id, cfg] of Object.entries(TANKS)) {
      const item = document.createElement('button');
      item.className = 'fh-select-item';
      item.dataset.tank = id;
      const img = document.createElement('img');
      const src = FLAG_BY_NATION[cfg.nation] || '';
      if (src) img.src = src;
      img.alt = '';
      const name = document.createElement('span');
      name.textContent = cfg.name;
      const sub = document.createElement('span');
      sub.className = 'fh-item-sub';
      const d = getTankDisplay(id);
      sub.textContent = d ? d.nation : '';
      item.append(img, name, sub);
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeTankSelect();
        handlers.onHangarSelect && handlers.onHangarSelect(id);
      });
      list.appendChild(item);
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      box.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!box.contains(e.target)) this._closeTankSelect();
    });
    this._tankSelectList = list;
  }

  _closeTankSelect() {
    const box = $('fh-select');
    if (box) box.classList.remove('open');
  }

  // 下拉框当前显示/高亮与翻页选中保持一致（refreshHangar 统一入口）
  _syncTankSelect(tankId) {
    const cfg = TANKS[tankId];
    if (!cfg) return;
    const img = $('fh-select-flag');
    const nameEl = $('fh-select-name');
    const src = FLAG_BY_NATION[cfg.nation] || '';
    if (img) {
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      img.style.display = src ? '' : 'none';
    }
    if (nameEl) nameEl.textContent = cfg.name;
    if (this._tankSelectList) {
      this._tankSelectList.querySelectorAll('.fh-select-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.tank === tankId);
      });
    }
  }

  // 性能参数：行池 8 行 = 6 行实车参数（各车 key 序列一致）+ 热成像 + 激光压制
  _refreshSpecRows(d, cfg) {
    const box = $('fh-real-spec');
    if (!box) return;
    if (!this._specRows) {
      box.innerHTML = '';
      this._specRows = [];
      for (let i = 0; i < 8; i++) {
        const row = document.createElement('div');
        row.className = 'fh-spec-row';
        const sk = document.createElement('span'); sk.className = 'fh-sk';
        const sv = document.createElement('span'); sv.className = 'fh-sv';
        row.append(sk, sv);
        box.appendChild(row);
        this._specRows.push(row);
      }
    }
    const rows = d.realSpec || [];
    for (let i = 0; i < 6; i++) {
      const row = this._specRows[i];
      if (i < rows.length) {
        row.style.display = '';
        if (row.children[0].textContent !== rows[i][0]) row.children[0].textContent = rows[i][0];
        if (row.children[1].textContent !== rows[i][1]) row.children[1].textContent = rows[i][1];
      } else row.style.display = 'none';
    }
    const fixed = [
      ['热成像', cfg.thermal ? '炮长热像仪 N' : '无'],
      ['激光压制', cfg.lws ? cfg.lws.model : '无'],
    ];
    for (let i = 0; i < 2; i++) {
      const row = this._specRows[6 + i];
      row.style.display = '';
      if (row.children[0].textContent !== fixed[i][0]) row.children[0].textContent = fixed[i][0];
      if (row.children[1].textContent !== fixed[i][1]) row.children[1].textContent = fixed[i][1];
    }
  }

  // 游戏属性条：结构只建一次，切换只刷新文字与条宽
  _refreshGameBars(d) {
    const box = $('fh-game-bars');
    if (!box || !d.gameBars) return;
    if (!this._barRows) {
      box.innerHTML = '';
      this._barRows = [];
      for (let i = 0; i < d.gameBars.length; i++) {
        const row = document.createElement('div');
        row.className = 'fh-bar-row';
        const label = document.createElement('span'); label.className = 'fh-bar-label';
        const track = document.createElement('div'); track.className = 'fh-bar-track';
        const fill = document.createElement('div'); fill.className = 'fh-bar-fill';
        track.appendChild(fill);
        row.append(label, track);
        box.appendChild(row);
        this._barRows.push({ label, fill });
      }
    }
    d.gameBars.forEach(([k, v], i) => {
      const bar = this._barRows[i];
      if (!bar) return;
      if (bar.label.textContent !== k) bar.label.textContent = k;
      const pct = `${(v / 5) * 100}%`;
      if (bar.fill.style.width !== pct) bar.fill.style.width = pct;
    });
  }

  // 机库右下预览文案（含当前地图与 AI 难度；内容不变不重排）
  _refreshPreview() {
    const preview = $('fh-preview-text');
    if (!preview) return;
    const diff = AI_DIFFICULTY[this.aiDifficulty] || AI_DIFFICULTY.standard;
    const mapName = this.settings.map === 'town' ? '东欧小镇' : '开阔平原';

    const html = `<div class="fh-pv-row"><span>模式</span><b>歼灭战 1v1</b></div>
      <div class="fh-pv-row"><span>地图</span><b>${mapName}</b></div>
      <div class="fh-pv-row"><span>对手</span><b>随机敌方坦克 · ${diff.label}</b></div>
      <div class="fh-pv-row"><span>时限</span><b>10 分钟（超时比剩余血量）</b></div>
      <div class="fh-pv-row"><span>弹药</span><b>AP / HEAT / HE 三弹种</b></div>
      <div class="fh-pv-row"><span>消耗品</span><b>维修包 R · 灭火器 T</b></div>`;
    if (html !== this._lastPreviewHtml) { this._lastPreviewHtml = html; preview.innerHTML = html; }
  }

  _syncSettingsUI() {
    $('set-master').value = this.settings.master; $('val-master').textContent = this.settings.master;
    $('set-sfx').value = this.settings.sfx; $('val-sfx').textContent = this.settings.sfx;
    $('set-ambient').value = this.settings.ambient; $('val-ambient').textContent = this.settings.ambient;
    $('set-quality').value = this.settings.quality;
    // BGM：开关 / 音量 / 模式
    const tog = $('set-bgm-toggle');
    tog.classList.toggle('on', this.settings.bgmOn !== false);
    tog.textContent = this.settings.bgmOn !== false ? '开' : '关';
    tog.onclick = () => {
      this.settings.bgmOn = this.settings.bgmOn === false;
      tog.classList.toggle('on', this.settings.bgmOn);
      tog.textContent = this.settings.bgmOn ? '开' : '关';
    };
    $('set-bgm').value = this.settings.bgmVol ?? 50; $('val-bgm').textContent = this.settings.bgmVol ?? 50;
    $('set-bgm-mode').value = this.settings.bgmMode || 'normal';
    for (const k of ['master', 'sfx', 'ambient', 'bgm']) {
      $(`set-${k}`).oninput = (e) => { $(`val-${k}`).textContent = e.target.value; };
    }
  }
  _readSettingsUI() {
    this.settings.master = +$('set-master').value;
    this.settings.sfx = +$('set-sfx').value;
    this.settings.ambient = +$('set-ambient').value;
    this.settings.quality = $('set-quality').value;
    this.settings.bgmVol = +$('set-bgm').value;          // 开关状态由按钮即时写入 settings
    this.settings.bgmMode = $('set-bgm-mode').value;
  }

  setLoadProgress(f) { $('load-fill').style.width = `${Math.round(f * 100)}%`; }
  loadDone() { $('loading-overlay').classList.add('done'); }

  // ─────────── 狙击镜分划（六国风格，按坦克 cfg.reticle 生成；style 不变跳过） ───────────
  // 模板见 js/reticles.js；#gs-reticle 承载全部分划图形（主十字/准星/刻度/测距弧），
  // 通用壳（圆形遮罩/外环/装填环/读数）留在 index.html
  buildReticle(style) {
    const key = RETICLES[style] ? style : 'ru';
    if (key === this._reticleKey) return;
    this._reticleKey = key;
    const grp = $('gs-reticle');
    if (!grp) return;
    grp.setAttribute('class', `gs-ret gs-ret-${key}`);
    grp.innerHTML = RETICLES[key]();
    // KF51 NG-FCS 分划：动态读数节点缓存（updateHUD 每帧回填实时值；其他分划为 null）
    this._nxDyn = key === 'nx' ? {
      rng: document.getElementById('gs-nx-rng'),
      mag: document.getElementById('gs-nx-mag'),
      spd: document.getElementById('gs-nx-spd'),
      az: document.getElementById('gs-nx-az'),
      el: document.getElementById('gs-nx-el'),
      tgtG: document.getElementById('gs-nx-tgt-g'),
      tgt: document.getElementById('gs-nx-tgt'),
    } : null;
  }

  // ─────────── 罗盘刻度带（静态生成一次） ───────────
  // 每 15° 一格、2px/°；-180°~540° 双圈循环（防 0/360 跳变）；
  // 45° 主刻度带方位字 N/NE/E/…，30° 副刻度带 3 位数字
  _buildCompassTicks() {
    const NAMES = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    const PX = 2;   // 每度像素
    const frag = document.createDocumentFragment();
    for (let d = -180; d <= 540; d += 15) {
      const dd = ((d % 360) + 360) % 360;
      const x = (d + 180) * PX;
      const major = d % 45 === 0;
      const tick = document.createElement('div');
      tick.className = 'cs-tick' + (major ? ' major' : '');
      tick.style.left = `${x}px`;
      frag.appendChild(tick);
      if (major || d % 30 === 0) {
        const lb = document.createElement('div');
        lb.className = 'cs-label' + (major ? '' : ' num');
        lb.style.left = `${x}px`;
        lb.textContent = major ? NAMES[dd] : String(dd).padStart(3, '0');
        frag.appendChild(lb);
      }
    }
    this.csTicks.appendChild(frag);
  }

  setScope(on) {
    if (this._scoped === on) return;
    this._scoped = on;
    this.gunsight.classList.toggle('hidden', !on);
    // 镜内隐藏普通准星组
    this.crosshair.style.display = on ? 'none' : '';
  }

  // ─────────── 弹药面板（战斗开始时构建：AP/HEAT/HE/MG 纵排数字卡） ───────────
  // 每项：分色标题(键位徽标+英文弹种) + 数字(低于20%淡红) + 右侧绿色余量百分比条
  // 交互：点击切弹种 / 悬停显示详细介绍；MG 卡下方 AUTO 开关（点击或 M 键切换自动射击）
  buildAmmoPanel(player) {
    const panel = document.getElementById('ammo-panel');
    if (!panel) return;
    panel.innerHTML = '';
    if (this._ammoTip) this._ammoTip.style.display = 'none';
    this._ammoItems = {};
    const tips = this._ammoTips(player);
    const mkItem = (key, head, cur, max) => {
      const item = document.createElement('div');
      item.className = 'ammo-item ' + key;
      item.innerHTML = `<div class="ammo-head">${head}</div><div class="ammo-num"></div><div class="ammo-bar"><i></i></div>`;
      panel.appendChild(item);
      this._ammoItems[key] = { root: item, num: item.querySelector('.ammo-num'), bar: item.querySelector('.ammo-bar i'), max };
      this._bindAmmoHover(item, tips[key]);
      item.addEventListener('click', () => this.onShellSelect && this.onShellSelect(key));
      this._setAmmo(key, cur);
    };
    for (const k of ['ap', 'heat', 'he']) {
      const def = SHELL_TYPES[k];
      mkItem(k, `<i class="ammo-key">${def.keyHint}</i>${def.name === 'APFSDS' ? 'AP' : def.name}`,
        player.shellPool[k], player.shellPool[k]);
    }
    mkItem('mg', 'MG', player.mgAmmo, player.mgAmmoMax);
    // MG 自动射击开关（替代原 HP 面板的 MG AUTO 状态标签）
    const auto = document.createElement('div');
    auto.className = 'ammo-auto';
    auto.innerHTML = '<span class="auto-label">AUTO</span><span class="auto-state"></span>';
    this._bindAmmoHover(auto, '<div class="tip-title">机枪自动射击</div>'
      + '<div class="tip-note">开启后机枪/机炮自动射击射程内最近的点亮目标（机枪 300m · 30mm 机炮 400m；只毁伤外露设备：剥爆反板、伤 APS 雷达、打观瞄，永不伤 HP）。'
      + 'M 键或点击此处切换。</div>');
    auto.addEventListener('click', () => this.onMgAutoToggle && this.onMgAutoToggle());
    panel.appendChild(auto);
    this._autoRoot = auto;
    this._autoStateEl = auto.querySelector('.auto-state');
    this._mgAutoKey = null;
    this._updateMgAuto(player.mgAuto);
  }

  // 弹种详细介绍（悬停提示，数值取自当前坦克 cfg + SHELL_TYPES 规则）
  _ammoTips(player) {
    const cfg = player.cfg;
    const pen = (k) => Math.round(cfg.shellPen * SHELL_TYPES[k].penMult);
    const vel = (k) => Math.round(cfg.shellVelocity * SHELL_TYPES[k].velMult);
    const dmg = (k) => Math.round(cfg.shellDamage * SHELL_TYPES[k].dmgMult);
    const drop = Math.round(cfg.shellPenDrop * 100);
    return {
      ap: `<div class="tip-title"><b>APFSDS</b> · 尾翼稳定脱壳穿甲弹</div>`
        + `<div class="tip-row"><span>穿深</span><b>${pen('ap')} mm @0m · 每千米 -${drop}%</b></div>`
        + `<div class="tip-row"><span>弹速</span><b>${vel('ap')} m/s · 弹道最低伸</b></div>`
        + `<div class="tip-row"><span>伤害</span><b>${dmg('ap')}</b></div>`
        + `<div class="tip-row"><span>跳弹角</span><b>71° · 大入射角易跳弹</b></div>`
        + `<div class="tip-row"><span>倾角等效</span><b>最多放大 3 倍</b></div>`
        + `<div class="tip-row"><span>履带区</span><b>伤害 ×0.5 · 断履带基准率</b></div>`
        + `<div class="tip-note">动能穿甲主力：穿深最高、弹速最快、远距离弹道低伸易命中。对倾角装甲与爆反较敏感，穿深随距离缓慢衰减。正面强穿与远程狙击首选。</div>`,
      heat: `<div class="tip-title"><b>HEAT</b> · 破甲弹（聚能射流）</div>`
        + `<div class="tip-row"><span>穿深</span><b>${pen('heat')} mm · 不随距离衰减</b></div>`
        + `<div class="tip-row"><span>弹速</span><b>${vel('heat')} m/s · 飞行时间长</b></div>`
        + `<div class="tip-row"><span>伤害</span><b>${dmg('heat')}</b></div>`
        + `<div class="tip-row"><span>跳弹角</span><b>65° · 比 AP 更易跳弹</b></div>`
        + `<div class="tip-row"><span>倾角等效</span><b>最多放大 5 倍 · 大倾角慎用</b></div>`
        + `<div class="tip-row"><span>履带区</span><b>伤害 ×0.35 · 被提前引爆</b></div>`
        + `<div class="tip-note">化学能破甲：穿深稳定不衰减，适合远距离精确射击平直装甲面。弹速慢需大提前量；对倾斜装甲惩罚最重，履带/间隔会提前引爆射流。</div>`,
      he: `<div class="tip-title"><b>HE</b> · 榴弹（高爆）</div>`
        + `<div class="tip-row"><span>穿深</span><b>${pen('he')} mm · 永不跳弹</b></div>`
        + `<div class="tip-row"><span>弹速</span><b>${vel('he')} m/s</b></div>`
        + `<div class="tip-row"><span>伤害</span><b>${dmg('he')} · 三弹种最高</b></div>`
        + `<div class="tip-row"><span>溅射</span><b>未击穿仍造成 12% 伤害</b></div>`
        + `<div class="tip-row"><span>断履带</span><b>独立溅射判定 · 断腿率最高</b></div>`
        + `<div class="tip-row"><span>剥板</span><b>直击额外剥 1 块爆反板</b></div>`
        + `<div class="tip-note">爆破榴弹：穿深极低但永不跳弹、无角度等效。对付轻装甲、残血目标，剥爆反板、打断履带的首选；命中主装甲未击穿也有溅射伤害。</div>`,
      mg: `<div class="tip-title"><b>MG</b> · ${cfg.mgCaliber}mm 机枪/机炮</div>`
        + `<div class="tip-row"><span>毁伤对象</span><b>爆反板 / APS 雷达 / 观瞄镜</b></div>`
        + `<div class="tip-row"><span>HP 伤害</span><b>无（只打外露子系统）</b></div>`
        + `<div class="tip-row"><span>距离衰减</span><b>&lt;100m 全额 · 300m ×0.1 · &gt;300m 无</b></div>`
        + `<div class="tip-row"><span>特殊</span><b>观瞄受损散布永久扩大</b></div>`
        + `<div class="tip-note">持续扫射可剥光爆反板、打瞎 APS 雷达、打坏观瞄，为主炮开路。开启 AUTO 自动压制 200m 内最近目标；残余弹药随 MG 数字实时显示。</div>`,
    };
  }

  // 悬停提示（共享一个 #ammo-tip，挂在 #hud 下随战斗界面隐藏）
  _bindAmmoHover(el, html) {
    el.addEventListener('mouseenter', () => {
      if (!html) return;
      if (!this._ammoTip) {
        this._ammoTip = document.createElement('div');
        this._ammoTip.id = 'ammo-tip';
        this.screens.hud.appendChild(this._ammoTip);
      }
      this._ammoTip.innerHTML = html;
      this._ammoTip.style.display = 'block';
      const r = el.getBoundingClientRect();
      const w = this._ammoTip.offsetWidth, h = this._ammoTip.offsetHeight;
      let left = r.right + 10;
      if (left + w > window.innerWidth - 8) left = r.left - w - 10;
      this._ammoTip.style.left = `${Math.max(8, left)}px`;
      this._ammoTip.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - h - 8))}px`;
    });
    el.addEventListener('mouseleave', () => {
      if (this._ammoTip) this._ammoTip.style.display = 'none';
    });
  }

  // MG 自动射击开关状态（M 键或点击切换，内容不变不重排）
  _updateMgAuto(on) {
    if (on === this._mgAutoKey || !this._autoStateEl) return;
    this._mgAutoKey = on;
    this._autoStateEl.textContent = on ? '开' : '关';
    this._autoRoot.classList.toggle('on', !!on);
  }

  // ─────────── HUD 每帧 ───────────
  // info: { range, targetName, aimFrac, aimed, ringSize, scoped, zoomText, shellName, reloadFrac, gsDispSize }
  updateHUD(player, enemiesLeft, info) {
    const hpFrac = player.hp / player.maxHp;
    if (this.hpLabel) this.hpLabel.textContent = player.cfg.name;
    this.hpFill.style.width = `${hpFrac * 100}%`;
    this.hpFill.className = hpFrac > 0.55 ? '' : hpFrac > 0.28 ? 'hurt' : 'critical';
    this.hpText.textContent = Math.ceil(player.hp);
    // 弹药面板更新（AP/HEAT/HE/MG 数字卡；当前弹种高亮）+ MG 自动射击开关
    for (const k of ['ap', 'heat', 'he']) {
      const it = this._ammoItems[k];
      if (!it) continue;
      this._setAmmo(k, player.shellPool[k]);
      it.root.classList.toggle('active', player.shellType === k);
    }
    this._setAmmo('mg', player.mgAmmo);
    this._updateMgAuto(player.mgAuto);
    const kmh = Math.abs(player.speed * 3.6);
    this.speedVal.textContent = Math.round(kmh);
    if (this.speedFill) this.speedFill.style.width = `${Math.min(kmh / (player.cfg.maxSpeed * 3.6) * 100, 100)}%`;
    this.gear.textContent = player.speed > 0.5 ? 'D' : player.speed < -0.5 ? 'R' : 'N';
    this.enemiesLeft.textContent = enemiesLeft;

    // 战斗时限倒计时（分钟:秒；<60s 变红闪烁；内容不变不重排）
    if (this.timeLeft && info.timeLeft != null) {
      const tl = Math.max(0, Math.ceil(info.timeLeft));
      const txt = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
      const low = tl <= 60;
      if (txt !== this._timeKey) { this._timeKey = txt; this.timeLeft.textContent = txt; }
      this.timeCounter.classList.toggle('low', low);
    }

    // 罗盘：航向 → 方位角。北(N/000°) = 世界 +Z = 玩家初始朝向（即初始敌方向）。
    // heading 绕 +Y 逆时针为正（0 = +Z），罗盘方位顺时针为正，故取负。
    const deg = ((THREE.MathUtils.radToDeg(-player.heading) % 360) + 360) % 360;
    this.csTicks.style.transform = `translateX(${170 - (deg + 180) * 2}px)`;
    this.compassDeg.textContent = `${String(Math.round(deg) % 360).padStart(3, '0')}°`;

    // KF51 NG-FCS 动态读数（测距/倍率/航速/方位/俯仰实时回填；内容不变不写 DOM）
    if (this._nxDyn) {
      const d = this._nxDyn;
      const rng = info.range;
      const rngTxt = (rng != null && isFinite(rng) && rng > 0) ? String(Math.round(rng)) : '----';
      if (d.rng.textContent !== rngTxt) d.rng.textContent = rngTxt;
      if (info.zoomText && d.mag.textContent !== info.zoomText) d.mag.textContent = info.zoomText;
      const spd = String(Math.round(Math.abs(player.speed * 3.6)));
      if (d.spd.textContent !== spd) d.spd.textContent = spd;
      const az = String(Math.round(deg) % 360).padStart(3, '0');
      if (d.az.textContent !== az) d.az.textContent = az;
      const el = `${player.gunPitch >= 0 ? '+' : ''}${THREE.MathUtils.radToDeg(player.gunPitch).toFixed(1)}`;
      if (d.el.textContent !== el) d.el.textContent = el;
      // 目标名称框：瞄到敌方坦克时显示名称，无目标隐藏
      const tgt = info.targetName || '';
      const disp = tgt ? '' : 'none';
      if (d.tgtG.style.display !== disp) d.tgtG.style.display = disp;
      if (tgt && d.tgt.textContent !== tgt) d.tgt.textContent = tgt;
    }
    let tags = '';
    if (player.burning > 0) tags += '<span class="status-tag fire">起火！FIRE</span>';
    this.statusTags.innerHTML = tags;

    // 模块状态条：断履带/动力受损/座圈卡死/装弹机受损/起火（无损伤时清空；内容不变不重排）
    const m = player.mods || {};
    const chips = [];
    if (m.tracks > 0) chips.push(`<span class="mod-chip track">断履带 ${Math.ceil(m.tracks)}s</span>`);
    if (m.engine > 0) chips.push(`<span class="mod-chip engine">动力受损 ${Math.ceil(m.engine)}s</span>`);
    if (m.ring > 0) chips.push(`<span class="mod-chip ring">座圈卡死 ${Math.ceil(m.ring)}s</span>`);
    if (m.loader > 0) chips.push('<span class="mod-chip loader">装弹机受损</span>');
    if (player.burning > 0) chips.push('<span class="mod-chip fire">起火</span>');
    const chipKey = chips.join('|');
    if (chipKey !== this._chipKey) { this._chipKey = chipKey; this.modChips.innerHTML = chips.join(''); }

    // 防护体系状态行（爆反板 / APS / 观瞄；无该系统的车隐藏对应行）
    this._updateProt(info.prot);

    const reloadFrac = info.reloadFrac;
    this.reloadFg.style.strokeDashoffset = `${163.3 * (1 - reloadFrac)}`;
    this.reloadWarn.classList.toggle('show', reloadFrac < 1 && !info.scoped);

    // 缩圈准星：尺寸 = 散布投影
    this.crosshair.style.width = `${info.ringSize}px`;
    this.crosshair.style.height = `${info.ringSize}px`;
    this.crosshair.classList.toggle('aimed', info.aimed);
    this.aimProgress.style.top = 'calc(100% + 8px)';
    this.aimInfo.style.top = 'calc(100% + 26px)';
    this.aimProgress.textContent = info.aimed ? '已瞄准' : `缩圈 ${Math.round(info.aimFrac * 100)}%`;
    this.aimProgress.classList.toggle('aimed', info.aimed);
    this.aimRange.textContent = info.range != null ? `${Math.round(info.range)} m` : '-- m';
    this.aimTarget.textContent = info.targetName || '';

    // 狙击镜读数
    this.setScope(info.scoped);
    if (info.scoped) {
      const def = player.shellDef();
      const shellName = def.key === 'ap' && player.cfg.shellName ? player.cfg.shellName : `${def.full} ${def.name}`;
      this.gsShell.textContent = `${shellName} ×${player.shellPool[def.key]}`;
      const rdy = reloadFrac >= 1;
      this.gsReload.textContent = rdy ? '就绪' : `装填 ${(player.reload).toFixed(1)}s`;
      this.gsReload.classList.toggle('ready', rdy);
      this.gsZoom.textContent = info.zoomText;
      this.gsRange.textContent = info.range != null ? `${Math.round(info.range)} m` : '-- m';
      this.gsTarget.textContent = info.targetName || '';
      // 热像仪指示灯（info.ir；未装备车常暗）
      if (this.gsIr) this.gsIr.classList.toggle('on', !!info.ir);
      // 装填大光圈：琥珀进度弧 / 就绪绿环 + 环下文字（周长 2π·58 ≈ 364.4）
      this.gsrFg.style.strokeDashoffset = `${364.4 * (1 - reloadFrac)}`;
      this.gsrFg.classList.toggle('ready', rdy);
      this.gsReloadText.textContent = rdy ? '主炮就绪' : `装填 ${player.reload.toFixed(1)}s`;
      this.gsReloadText.classList.toggle('ready', rdy);
      // 散布虚线圈：直径 = 散布角在当前镜内 FoV 下的投影
      const d = Math.max(info.gsDispSize || 0, 8);
      this.gsDisp.style.width = `${d}px`;
      this.gsDisp.style.height = `${d}px`;
    }
  }

  // 弹药数字卡更新：数值/余量条百分比/低于20%淡红（内容不变不重排）
  _setAmmo(key, cur) {
    const it = this._ammoItems && this._ammoItems[key];
    if (!it) return;
    const frac = it.max > 0 ? cur / it.max : 0;
    const txt = String(Math.max(0, Math.ceil(cur)));
    if (txt !== it._txt) { it._txt = txt; it.num.textContent = txt; }
    const pct = Math.round(frac * 100);
    if (pct !== it._pct) { it._pct = pct; it.bar.style.height = `${pct}%`; }
    it.root.classList.toggle('low', frac < 0.2);
  }

  // 镜内开炮白闪（0.5s ease-out）
  scopeFlash() {
    this.gsFlash.classList.remove('show');
    void this.gsFlash.offsetWidth;
    this.gsFlash.classList.add('show');
  }

  // ─────────── 敌标（屏幕投影：血条 + 距离 + ▼） ───────────
  // 仅显示点亮敌方（红色血条+距离）；失联显示灰色?标记于最后已知位置；未发现不显示
  updateMarkers(enemies, player, camera) {
    this._cam = camera;
    const w = window.innerWidth, h = window.innerHeight;
    for (const e of enemies) {
      let mk = this.markers.get(e);
      if (e.destroyed) { if (mk) { mk.remove(); this.markers.delete(e); } continue; }
      // 点亮状态判定
      const spotted = e.spotted === true;
      const lost = e.lostContact === true;
      if (!spotted && !lost) {
        // 未发现：隐藏已有标记
        if (mk) mk.style.display = 'none';
        continue;
      }
      // 位置：点亮用实时位置，失联用最后已知位置
      const srcPos = spotted ? e.root.position : (e.lastKnownPos || e.root.position);
      if (!mk) {
        mk = document.createElement('div');
        mk.className = 'enemy-marker';
        mk.innerHTML = `<div class="em-hp"><i></i></div><span class="em-dist"></span><span class="em-icon">▼</span>`;
        this.markersLayer.appendChild(mk);
        this.markers.set(e, mk);
      }
      // 失联标记样式切换
      mk.classList.toggle('lost', !spotted && lost);
      _v.copy(srcPos);
      _v.y += 3.4;
      _v.project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) { mk.style.display = 'none'; continue; }
      mk.style.display = '';
      mk.style.left = `${(_v.x * 0.5 + 0.5) * w}px`;
      mk.style.top = `${(-_v.y * 0.5 + 0.5) * h}px`;
      if (spotted) {
        mk.querySelector('.em-dist').textContent = `${Math.round(e.pos.distanceTo(player.pos))}m`;
        const f = mk.querySelector('.em-hp i');
        const frac = e.hp / e.maxHp;
        f.style.width = `${Math.round(frac * 100)}%`;
        f.className = frac > 0.5 ? 'ok' : frac > 0.25 ? 'mid' : 'low';
        mk.querySelector('.em-icon').textContent = '▼';
      } else {
        // 失联：灰色?，无血条/距离
        mk.querySelector('.em-dist').textContent = '';
        mk.querySelector('.em-hp i').style.width = '0%';
        mk.querySelector('.em-icon').textContent = '?';
      }
    }
  }
  clearMarkers() {
    for (const mk of this.markers.values()) mk.remove();
    this.markers.clear();
  }

  // ─────────── 烟雾弹计数 HUD ───────────
  updateSmoke(ammo, maxAmmo) {
    if (!this.smokeCount) return;
    this.smokeCount.textContent = `${ammo}/${maxAmmo}`;
    this.smokeCount.classList.toggle('empty', ammo <= 0);
  }

  // ─────────── 消耗品 HUD（维修包/灭火器，用掉置灰） ───────────
  updateConsumables(player) {
    const r = document.getElementById('cons-repair');
    const e = document.getElementById('cons-ext');
    if (r) r.classList.toggle('used', !player.consumables || player.consumables.repair <= 0);
    if (e) e.classList.toggle('used', !player.consumables || player.consumables.ext <= 0);
  }

  // 防护体系状态行（main._protInfo 提供；内容不变不重排）
  // prot: { era:{front,side,maxFront,maxSide}, aps:{charges,cooldown,radar 0/1/2}, optics:0/1/2 }
  _updateProt(prot) {
    if (!prot || !this.protEra) return;
    // 爆反板：前/侧剩余（无爆反的车隐藏）
    if (!prot.era) {
      this.protEra.style.display = 'none';
    } else {
      this.protEra.style.display = '';
      const key = `e${prot.era.front}.${prot.era.side}`;
      if (key !== this._pkEra) {
        this._pkEra = key;
        this.protEraVal.textContent = `前${prot.era.front}/${prot.era.maxFront} 侧${prot.era.side}/${prot.era.maxSide}`;
        const left = prot.era.front + prot.era.side, full = prot.era.maxFront + prot.era.maxSide;
        this.protEra.className = 'prot-row ' + (left === 0 ? 'dead' : left < full ? 'warn' : '');
      }
    }
    // APS：拦截弹余量（●）+ 冷却 + 雷达档（无 APS 的车隐藏）
    if (!prot.aps) {
      this.protAps.style.display = 'none';
    } else {
      this.protAps.style.display = '';
      const a = prot.aps;
      const maxCharges = a.chargesMax || APS_RULES.charges;
      const key = `a${a.charges}.${Math.ceil(a.cooldown)}${a.radar}`;
      if (key !== this._pkAps) {
        this._pkAps = key;
        const dots = '●'.repeat(a.charges) + '○'.repeat(Math.max(0, maxCharges - a.charges));
        let txt = a.cooldown > 0 ? `${dots} 冷却${Math.ceil(a.cooldown)}s` : dots;
        if (a.radar === -1) txt += ' 分布式';   // StrikeShield：无雷达阵，机枪扫不动
        else if (a.radar === 1) txt += ' 雷达受损';
        else if (a.radar === 2) txt += ' 雷达损毁';
        this.protApsVal.textContent = txt;
        this.protAps.className = 'prot-row ' + (a.radar === 2 ? 'dead' : a.radar === 1 ? 'warn' : '');
      }
    }
    // 观瞄：完好 / 受损 / 损毁
    const key = `o${prot.optics}`;
    if (key !== this._pkOpt) {
      this._pkOpt = key;
      this.protOptVal.textContent = ['完好', '受损', '损毁'][prot.optics];
      this.protOpt.className = 'prot-row ' + (prot.optics === 2 ? 'dead' : prot.optics === 1 ? 'warn' : '');
    }
    // 激光压制器（99A/T-90 系装备；无则隐藏）：就绪 / 冷却 / 受损 / 损毁
    if (!prot.lws) {
      this.protLws.style.display = 'none';
    } else {
      this.protLws.style.display = '';
      const l = prot.lws;
      const key = `l${l.emitter}${l.cooldown > 0 ? Math.ceil(l.cooldown) : 0}`;
      if (key !== this._pkLws) {
        this._pkLws = key;
        let txt = l.cooldown > 0 ? `冷却${Math.ceil(l.cooldown)}s` : '就绪';
        if (l.emitter === 1) txt += ' 压制器受损';
        else if (l.emitter === 2) txt += ' 压制器损毁';
        this.protLwsVal.textContent = txt;
        this.protLws.className = 'prot-row ' + (l.emitter === 2 ? 'dead' : l.emitter === 1 ? 'warn' : '');
      }
    }
  }

  // ─────────── 激光告警 / 压制 HUD（main._updateLaser 每帧驱动；内容不变不重排） ───────────
  // ① 红底白字告警框：AI 炮塔锁定玩家（被激光测距定位）
  setLaseWarn(on) {
    if (this._laseOn === on) return;
    this._laseOn = on;
    this.laserWarn.classList.toggle('show', on);
  }
  // ② 绿底提示：我方压制器致盲敌方 AI 中（剩余秒）
  setLaserSuppress(t) {
    const on = t > 0;
    if (this._suppOn !== on) {
      this._suppOn = on;
      this.laserSupp.classList.toggle('show', on);
    }
    if (on) {
      const s = (Math.ceil(t * 10) / 10).toFixed(1);
      if (s !== this._suppTxt) { this._suppTxt = s; this.laserSuppT.textContent = s; }
    }
  }
  // ③ 镜内白幕：被敌方压制器致盲（快亮慢灭）
  setLaserBlind(t) {
    const on = t > 0;
    if (this._blindOn === on) return;
    this._blindOn = on;
    this.gsBlind.classList.toggle('on', on);
  }

  // ─────────── 机库/切车载入浮标（小型指示，不遮挡界面；progress 0~1 可选） ───────────
  showHangarLoading(on, text, progress) {
    if (!this.hangarLoading) return;
    if (text && this.hangarLoadingText.textContent !== text) this.hangarLoadingText.textContent = text;
    this.hangarLoading.classList.toggle('show', on);
    if (this.hangarLoadingBar) {
      const showBar = on && progress != null;
      this.hangarLoadingBar.style.display = showBar ? '' : 'none';
      if (showBar) this.hangarLoadingFill.style.width = `${Math.round(progress * 100)}%`;
    }
  }

  // ─────────── 反馈 ───────────
  hitMarker(kill) {
    this.hitMarkerEl.classList.remove('show');
    void this.hitMarkerEl.offsetWidth;
    this.hitMarkerEl.style.color = kill ? '#ff2a10' : '#ff5030';
    this.hitMarkerEl.classList.add('show');
  }
  penMarker(text) {
    this.penMarkerEl.textContent = text;
    this.penMarkerEl.classList.remove('show');
    void this.penMarkerEl.offsetWidth;
    this.penMarkerEl.classList.add('show');
  }

  // 命中记录（右下）：good=我方战果 / bad=我方受创；最多 5 条，2.4s 渐隐、3s 移除
  hitLog(text, cls = '') {
    const div = document.createElement('div');
    div.className = `hitlog-item ${cls}`;
    div.textContent = text;
    this.hitlogEl.prepend(div);   // column-reverse：prepend 的新条目显示在最底部
    while (this.hitlogEl.children.length > 5) this.hitlogEl.lastChild.remove();
    setTimeout(() => div.classList.add('fadeout'), 2400);
    setTimeout(() => div.remove(), 3000);
  }

  // 命中点飘伤害数字（世界坐标 → 屏幕投影）
  floatDamage(worldPos, text, cls = '') {
    if (!this._cam) return;
    _v.copy(worldPos).project(this._cam);
    if (_v.z > 1) return;
    const div = document.createElement('div');
    div.className = `dmg-num ${cls}`;
    div.textContent = text;
    div.style.left = `${(_v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() * 36 - 18)}px`;
    div.style.top = `${(-_v.y * 0.5 + 0.5) * window.innerHeight - 8}px`;
    this.screens.hud.appendChild(div);
    setTimeout(() => div.remove(), 950);
  }

  damageFlash(strength = 0.85) {
    this.vignette.style.transition = 'none';
    this.vignette.style.opacity = strength;
    requestAnimationFrame(() => {
      this.vignette.style.transition = 'opacity 0.8s';
      this.vignette.style.opacity = 0;
    });
  }

  damageFrom(angleRad) {
    const arc = document.createElement('div');
    arc.className = 'dmg-arc show';
    arc.style.transform = `rotate(${angleRad}rad) translateY(-118px)`;
    this.dmgIndicator.appendChild(arc);
    setTimeout(() => arc.remove(), 1300);
  }

  message(text) {
    this.battleMsg.textContent = text;
    this.battleMsg.classList.remove('show');
    void this.battleMsg.offsetWidth;
    this.battleMsg.classList.add('show');
  }

  result(victory, detailHTML) {
    const t = $('result-title');
    t.textContent = victory === null ? '平 局' : victory ? '胜 利' : '战 毁';
    t.classList.toggle('defeat', victory === false);
    t.classList.toggle('draw', victory === null);
    $('result-detail').innerHTML = detailHTML;
    this.show('result');
  }
}
