// ═══ 程序化音效系统（WebAudio，无外部音频资源） ═══
import { BGM } from './config.js';

// 持续接触类物件音：碾栅栏/碾物品/碾废墟/撞房屋（动作持续期间反复触发 → 整遍播完才允许下一遍）
const PROP_SUSTAINED = new Set(['crushWood', 'crushObj', 'crushRubble', 'ramHouse']);

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.ambientGain = null;
    this.engineNodes = null;
    this.started = false;
    this.settings = { master: 0.8, sfx: 0.9, ambient: 0.6, bgmOn: true, bgmVol: 50, bgmMode: 'normal' };
    this.ext = null;          // 外部音效缓冲 { engine, mg, fire, fireAim, seg, _key }
    this.extEngine = null;    // 外部引擎运行节点 { loopSrc, loopG, startSrc }
    this.extMGLoop = null;    // 外部机枪循环节点 { src, g }
    this.sfxExt = null;       // 通用被击中音效 { behit:[], behitOut:[], hitMis, exo:[], exoNear }
    this.propSfx = null;      // 物件音效（可破坏场景物）：{ collapseLg, collapseSm, houseHit, treeTopple, treeCreak, treeShot, crushObj, ramHouse, crushWood, crushRubble }
    this._propLast = {};      // 事件类物件音去重：同名音 120ms 内不重复触发（压毁+碰撞同帧双触发）
    this._propBusy = {};      // 持续接触类物件音：整遍播放完才允许下一遍（不重叠）
    // ── BGM 状态 ──
    this.bgmEl = null;        // 当前 Audio 元素
    this.bgmList = [];        // 战斗播放列表（已洗牌）
    this.bgmIdx = 0;
    this.bgmTimer = null;     // 循环间隔定时器
    this.bgmGen = 0;          // 代际令牌：换曲/停止后让旧的 onended 失效
  }

  // 必须在用户手势后调用
  init() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.connect(this.master);
    this.applySettings(this.settings);
    this.started = true;
    this._startWind();
    this.loadCommonSounds();
    this.loadPropSounds();
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    if (!this.started) return;
    this.master.gain.value = this.settings.master;
    this.sfxGain.gain.value = this.settings.sfx;
    this.ambientGain.gain.value = this.settings.ambient;
    this._applyBgmVolume();
  }

  // ═══════════ 背景音乐（HTMLAudio 元素，音量 = 主音量 × BGM 音量） ═══════════

  _applyBgmVolume() {
    if (!this.bgmEl) return;
    const on = this.settings.bgmOn !== false;
    const vol = on ? (this.settings.master || 0) * ((this.settings.bgmVol ?? 50) / 100) : 0;
    this.bgmEl.volume = Math.min(1, Math.max(0, vol));
  }

  // 停止当前曲目（清理定时器 + 代际令牌使旧 onended 失效）
  stopBGM() {
    this.bgmGen++;
    clearTimeout(this.bgmTimer);
    this.bgmTimer = null;
    if (this.bgmEl) { this.bgmEl.pause(); this.bgmEl.onended = null; this.bgmEl = null; }
  }

  _playBgmTrack(url, { loop = false, onEnded = null } = {}) {
    this.bgmGen++;
    clearTimeout(this.bgmTimer);
    if (this.bgmEl) { this.bgmEl.pause(); this.bgmEl.onended = null; }
    const el = new Audio(url);
    const gen = this.bgmGen;
    this.bgmEl = el;
    this._applyBgmVolume();
    el.loop = loop;
    if (onEnded) el.onended = () => { if (gen === this.bgmGen) onEnded(); };
    el.play().catch(() => {});   // 自动播放被拒时静默（后续手势后由再次切曲恢复）
    return el;
  }

  // 菜单 BGM（封面/菜单/车库/结算）：无缝循环
  startMenuBGM() {
    if (!this.started) return;
    this.bgmList = []; this.bgmIdx = 0;
    this._playBgmTrack(BGM.menu, { loop: true });
  }

  // 战斗 BGM：标准模式只播 battle；个性化模式 = 国别曲 + battle 洗牌轮播
  startBattleBGM(tankCfg) {
    if (!this.started) return;
    const personal = this.settings.bgmMode === 'personal';
    const nationTracks = (personal && tankCfg && BGM.nations[tankCfg.nation]) || [];
    this.bgmList = this._shuffle([...nationTracks, BGM.battle]);
    this.bgmIdx = 0;
    this._playBattleNext();
  }

  _playBattleNext() {
    if (this.bgmIdx >= this.bgmList.length) {   // 一轮播完 → 重新洗牌
      this.bgmList = this._shuffle(this.bgmList);
      this.bgmIdx = 0;
    }
    const url = this.bgmList[this.bgmIdx++];
    this._playBgmTrack(url, {
      onEnded: () => {   // 每遍之间静默间隔
        this.bgmTimer = setTimeout(() => {
          if (this.bgmEl) this._playBattleNext();
        }, BGM.gap * 1000);
      },
    });
  }

  pauseBGM() { if (this.bgmEl) this.bgmEl.pause(); }
  resumeBGM() { if (this.bgmEl) this.bgmEl.play().catch(() => {}); }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── 外部音效加载 ──
  async loadExtSounds(cfg) {
    if (!cfg.sound) { this.ext = null; return; }
    if (this.ext && this.ext._key === cfg.id) return;
    try {
      const [engine, mg, fire, fireAim] = await Promise.all([
        this._decodeMp3(cfg.sound.engine),
        this._decodeMp3(cfg.sound.mg),
        this._decodeMp3(cfg.sound.fire),
        this._decodeMp3(cfg.sound.fireAim),
      ]);
      this.ext = {
        _key: cfg.id,
        engine, mg, fire, fireAim,
        seg: cfg.sound.seg || { engineStart: 0.24, mgFire: 0.20 },
      };
    } catch (e) {
      console.warn('外部音效加载失败，回退程序化音效', e);
      this.ext = null;
    }
  }

  async _decodeMp3(url) {
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return await this.ctx.decodeAudioData(arr);
  }

  usingExt() { return !!this.ext; }

  // ── 通用被击中音效加载（所有坦克共用） ──
  async loadCommonSounds() {
    if (this.sfxExt) return;
    try {
      const [b1, b2, bo1, bo2, mis, e1, e2, e3, near] = await Promise.all([
        this._decodeMp3('sound/behit1.mp3'),
        this._decodeMp3('sound/behit2.mp3'),
        this._decodeMp3('sound/behitOut1.mp3'),
        this._decodeMp3('sound/behitOut2.mp3'),
        this._decodeMp3('sound/beHitMis.mp3'),
        this._decodeMp3('sound/exo-1.mp3'),
        this._decodeMp3('sound/exo-2.mp3'),
        this._decodeMp3('sound/exo-3.mp3'),
        this._decodeMp3('sound/exo-near.mp3'),
      ]);
      this.sfxExt = {
        behit: [b1, b2].filter(Boolean),
        behitOut: [bo1, bo2].filter(Boolean),
        hitMis: mis,
        exo: [e1, e2, e3].filter(Boolean),
        exoNear: near,
      };
    } catch (e) {
      console.warn('通用音效加载失败', e);
    }
  }

  _playBuffer(buf, vol = 1) {
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.sfxGain);
    src.start();
  }

  // ── 物件音效（sound/props/，可破坏场景物专用） ──
  async loadPropSounds() {
    if (this.propSfx) return;
    try {
      const [collapseLg, collapseSm, houseHit, treeTopple, treeCreak, treeShot, crushObj, ramHouse, crushWood, crushRubble] = await Promise.all([
        this._decodeMp3('sound/props/house_collapse_large.mp3'),
        this._decodeMp3('sound/props/house_collapse_small.mp3'),
        this._decodeMp3('sound/props/house_hit.mp3'),
        this._decodeMp3('sound/props/tree_topple.mp3'),
        this._decodeMp3('sound/props/tree_creak.mp3'),
        this._decodeMp3('sound/props/tree_shot_fall.mp3'),
        this._decodeMp3('sound/props/crush_object.mp3'),
        this._decodeMp3('sound/props/ram_house.mp3'),
        this._decodeMp3('sound/props/crush_wood.mp3'),
        this._decodeMp3('sound/props/crush_rubble.mp3'),
      ]);
      this.propSfx = { collapseLg, collapseSm, houseHit, treeTopple, treeCreak, treeShot, crushObj, ramHouse, crushWood, crushRubble };
      // 各物件音源电平对齐：原始文件录制电平不一（treeTopple 满刻度 0dB / 其余 -7~-11dB 峰值），
      // 按实测 volumedetect 结果归一到相近响度（-12dB ≈ ×0.25）
      this._propGain = { treeTopple: 0.25 };
    } catch (e) {
      console.warn('物件音效加载失败（相关场景将无专属音效）', e);
    }
  }

  // 持续接触类物件音（碾栅栏/碾物品/碾废墟/撞房屋——动作持续期间反复触发）：
  // 整遍播完才允许下一遍，不重叠；动作停止后最后一遍自然收尾。事件类（房屋中弹/倒塌/倒树）不受此限。
  playProp(name, vol = 1) {
    if (!this.started || !this.propSfx || !this.propSfx[name]) return false;
    const buf = this.propSfx[name];
    const now = performance.now();
    if (PROP_SUSTAINED.has(name)) {
      if (now < (this._propBusy[name] || 0)) return false;   // 上一遍未播完：跳过（不重叠）
      this._propBusy[name] = now + buf.duration * 1000;
    } else {
      if (now - (this._propLast[name] || 0) < 120) return false;   // 事件类：仅防同帧重复
      this._propLast[name] = now;
    }
    this._playBuffer(buf, Math.min(1.2, Math.max(0, vol)) * (this._propGain ? (this._propGain[name] || 1) : 1));
    return true;
  }

  _noiseBuffer(seconds = 2) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── 环境风声（持续） ──
  _startWind() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(4); src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
    const g = this.ctx.createGain(); g.gain.value = 0.06;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.035;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.ambientGain);
    src.start(); lfo.start();
  }

  // ── 发动机（柴油轰鸣，随转速变化） ──
  startEngine() {
    if (!this.started || this.engineNodes || this.extEngine) return;
    // 外部音效：启动段一次 + 行驶段循环
    if (this.ext && this.ext.engine) {
      const ctx = this.ctx;
      const seg = this.ext.seg.engineStart;
      const startSrc = ctx.createBufferSource();
      startSrc.buffer = this.ext.engine;
      const startG = ctx.createGain(); startG.gain.value = 0.7;
      startSrc.connect(startG); startG.connect(this.sfxGain);
      startSrc.start(0, 0, seg);
      const loopSrc = ctx.createBufferSource();
      loopSrc.buffer = this.ext.engine;
      loopSrc.loop = true;
      loopSrc.loopStart = seg;
      loopSrc.loopEnd = this.ext.seg.engineLoopEnd || this.ext.engine.duration;
      const loopG = ctx.createGain(); loopG.gain.value = 0;
      loopSrc.connect(loopG); loopG.connect(this.sfxGain);
      loopSrc.start();
      this.extEngine = { loopSrc, loopG, startSrc };
      return;
    }
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 38;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 19;
    const noise = ctx.createBufferSource(); noise.buffer = this._noiseBuffer(2); noise.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 240; nf.Q.value = 1.2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = ctx.createGain(); g.gain.value = 0;
    const ng = ctx.createGain(); ng.gain.value = 0.35;
    o1.connect(lp); o2.connect(lp); lp.connect(g);
    noise.connect(nf); nf.connect(ng); ng.connect(g);
    g.connect(this.sfxGain);
    o1.start(); o2.start(); noise.start();
    this.engineNodes = { o1, o2, nf, g };
  }

  setEngine(rpm01, load01) {
    if (this.extEngine) {
      const t = this.ctx.currentTime;
      const vol = 0.15 + rpm01 * 0.55 + load01 * 0.15;
      this.extEngine.loopG.gain.setTargetAtTime(vol, t, 0.15);
      return;
    }
    if (!this.engineNodes) return;
    const { o1, o2, nf, g } = this.engineNodes;
    const t = this.ctx.currentTime;
    o1.frequency.setTargetAtTime(38 + rpm01 * 62, t, 0.08);
    o2.frequency.setTargetAtTime(19 + rpm01 * 30, t, 0.08);
    nf.frequency.setTargetAtTime(240 + rpm01 * 700, t, 0.1);
    g.gain.setTargetAtTime(0.05 + rpm01 * 0.16 + load01 * 0.05, t, 0.12);
  }

  stopEngine() {
    if (this.extEngine) {
      const { loopSrc, loopG, startSrc } = this.extEngine;
      loopG.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      setTimeout(() => { try { loopSrc.stop(); } catch (e) {} }, 800);
      try { startSrc.stop(); } catch (e) {}
      this.extEngine = null;
      // 引擎消失段（engineLoopEnd ~ end）
      if (this.ext && this.ext.engine) {
        const ctx = this.ctx;
        const fadeStart = this.ext.seg.engineLoopEnd;
        if (fadeStart && this.ext.engine.duration > fadeStart) {
          const fadeSrc = ctx.createBufferSource();
          fadeSrc.buffer = this.ext.engine;
          const fadeG = ctx.createGain(); fadeG.gain.value = 0.7;
          fadeSrc.connect(fadeG); fadeG.connect(this.sfxGain);
          fadeSrc.start(0, fadeStart);
        }
      }
      return;
    }
    if (!this.engineNodes) return;
    const { o1, o2, g } = this.engineNodes;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) {} }, 800);
    this.engineNodes = null;
  }

  // ── 主炮射击（近距离自身开火） ──
  playFire(power = 1, aiming = false) {
    if (!this.started) return;
    if (this.ext) {
      const buf = (aiming && this.ext.fireAim) ? this.ext.fireAim : this.ext.fire;
      if (buf) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain(); g.gain.value = power;
        src.connect(g); g.connect(this.sfxGain);
        src.start();
        return;
      }
    }
    const ctx = this.ctx, t = ctx.currentTime;
    // 低频炮口冲击
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(60, t); sub.frequency.exponentialRampToValueAtTime(24, t + 0.35);
    const subG = ctx.createGain(); subG.gain.setValueAtTime(1.5 * power, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sub.connect(subG); subG.connect(this.sfxGain); sub.start(t); sub.stop(t + 0.55);
    // 爆音噪声
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(0.6);
    const bp = ctx.createBiquadFilter(); bp.type = 'lowpass';
    bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(1.1 * power, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    n.connect(bp); bp.connect(ng); ng.connect(this.sfxGain); n.start(t);
    // 金属尾音
    const ring = ctx.createOscillator(); ring.type = 'triangle'; ring.frequency.value = 840;
    const rg = ctx.createGain(); rg.gain.setValueAtTime(0.06 * power, t);
    rg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    ring.connect(rg); rg.connect(this.sfxGain); ring.start(t + 0.05); ring.stop(t + 1);
  }

  // ── 机枪点射（短脉冲带通噪声；vol：AI 远距离机枪按距离衰减） ──
  playMG(vol = 1) {
    if (!this.started) return;
    // 外部音效：循环模式由 startMGLoop/stopMGLoop 管理，单发不再播
    if (this.ext && this.ext.mg) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(0.08);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.22 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(bp); bp.connect(g); g.connect(this.sfxGain); n.start(t);
  }

  // ── 机枪循环（外部音效：自动射击时循环 mgLoopStart~mgLoopEnd 段） ──
  startMGLoop() {
    if (!this.started || this.extMGLoop) return;
    if (!this.ext || !this.ext.mg) return;
    const ctx = this.ctx;
    const loopStart = this.ext.seg.mgLoopStart || 0;
    const loopEnd = this.ext.seg.mgLoopEnd || this.ext.seg.mgFire || 0.20;
    const src = ctx.createBufferSource();
    src.buffer = this.ext.mg;
    src.loop = true;
    src.loopStart = loopStart;
    src.loopEnd = loopEnd;
    const g = ctx.createGain(); g.gain.value = 0.8;
    src.connect(g); g.connect(this.sfxGain);
    src.start();
    this.extMGLoop = { src, g };
  }

  // ── 停机枪循环 + 播回响段（mgLoopEnd ~ end） ──
  stopMGLoop() {
    if (!this.extMGLoop) return;
    const { src, g } = this.extMGLoop;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => { try { src.stop(); } catch (e) {} }, 120);
    this.extMGLoop = null;
    if (this.ext && this.ext.mg) {
      const ctx = this.ctx;
      const echoStart = this.ext.seg.mgLoopEnd || this.ext.seg.mgFire || 0.20;
      if (this.ext.mg.duration > echoStart) {
        const echoSrc = ctx.createBufferSource();
        echoSrc.buffer = this.ext.mg;
        const echoG = ctx.createGain(); echoG.gain.value = 0.6;
        echoSrc.connect(echoG); echoG.connect(this.sfxGain);
        echoSrc.start(0, echoStart);
      }
    }
  }

  // ── 远方炮声（敌方开火，随距离衰减在调用方控制） ──
  playDistantFire(vol = 0.4) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(1);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    n.connect(lp); lp.connect(g); g.connect(this.sfxGain); n.start(t);
  }

  // ── 爆炸（规模 0.5~3） ──
  playExplosion(scale = 1, dist01 = 0) {
    if (!this.started) return;
    // 外部音效：附近爆炸/击毁/殉爆
    if (this.sfxExt) {
      const vol = Math.max(0.2, 1 - dist01 * 0.8);
      let buf = null;
      if (scale <= 0.5 && this.sfxExt.exoNear) {
        buf = this.sfxExt.exoNear;
      } else if (scale >= 2.0 && this.sfxExt.exo.length >= 3) {
        buf = this.sfxExt.exo[2];   // exo-3 适合殉爆
      } else if (this.sfxExt.exo.length) {
        buf = this.sfxExt.exo[Math.floor(Math.random() * this.sfxExt.exo.length)];
      }
      if (buf) { this._playBuffer(buf, vol); return; }
    }
    const ctx = this.ctx, t = ctx.currentTime;
    const vol = scale * (1 - dist01 * 0.8);
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(90, t); sub.frequency.exponentialRampToValueAtTime(18, t + 0.8 * scale);
    const sg = ctx.createGain(); sg.gain.setValueAtTime(1.6 * vol, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.1 * scale);
    sub.connect(sg); sg.connect(this.sfxGain); sub.start(t); sub.stop(t + 1.2 * scale);
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(1.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400 - dist01 * 1800, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 1.2 * scale);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(1.2 * vol, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 1.4 * scale);
    n.connect(lp); lp.connect(ng); ng.connect(this.sfxGain); n.start(t);
    // 碎片噼啪
    for (let i = 0; i < 4; i++) {
      const d = 0.15 + Math.random() * 0.8;
      const c = ctx.createBufferSource(); c.buffer = this._noiseBuffer(0.05);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0.12 * vol * Math.random(), t + d);
      cg.gain.exponentialRampToValueAtTime(0.001, t + d + 0.08);
      c.connect(hp); hp.connect(cg); cg.connect(this.sfxGain); c.start(t + d);
    }
  }

  // ── 跳弹（金属擦响） ──
  playRicochet() {
    if (!this.started) return;
    if (this.sfxExt && this.sfxExt.hitMis) { this._playBuffer(this.sfxExt.hitMis, 0.8); return; }
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f0 = 2400 + Math.random() * 800;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.4, t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.6);
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(0.1);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    n.connect(hp); hp.connect(ng); ng.connect(this.sfxGain); n.start(t);
  }

  // ── 命中装甲（未击穿的闷响 / 击穿的撕裂声） ──
  playHitArmor(penetrated) {
    if (!this.started) return;
    if (this.sfxExt) {
      const arr = penetrated ? this.sfxExt.behit : this.sfxExt.behitOut;
      if (arr.length) { this._playBuffer(arr[Math.floor(Math.random() * arr.length)], 0.8); return; }
    }
    const ctx = this.ctx, t = ctx.currentTime;
    if (penetrated) {
      const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(0.5);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      n.connect(bp); bp.connect(g); g.connect(this.sfxGain); n.start(t);
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.3);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.3, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(og); og.connect(this.sfxGain); o.start(t); o.stop(t + 0.4);
    } else {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 320;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.3);
    }
  }

  // ── 装填完成提示 ──
  playReloaded() {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1200;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t);
    g.gain.setValueAtTime(0.08, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.15);
  }

  playUIClick() {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.1);
  }

  // ── 起火循环 ──
  startFire() {
    if (!this.started || this.fireNodes) return;
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(2); n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.14;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
    const lg = ctx.createGain(); lg.gain.value = 0.06;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(lp); lp.connect(g); g.connect(this.sfxGain);
    n.start(); lfo.start();
    this.fireNodes = { n, lfo, g };
  }
  stopFire() {
    if (!this.fireNodes) return;
    const { n, lfo, g } = this.fireNodes;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => { try { n.stop(); lfo.stop(); } catch (e) {} }, 1000);
    this.fireNodes = null;
  }

  // ── 烟雾弹音效 ──
  async loadSmokeSounds() {
    if (this.smokeSfx) return;
    try {
      const [launch, expand] = await Promise.all([
        this._decodeMp3('sound/smoke-sant.mp3'),
        this._decodeMp3('sound/smoke-pok.mp3'),
      ]);
      this.smokeSfx = { launch, expand };
    } catch (e) {
      console.warn('烟雾音效加载失败', e);
    }
  }

  playSmokeLaunch() {
    if (!this.started || !this.smokeSfx || !this.smokeSfx.launch) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.smokeSfx.launch;
    const g = ctx.createGain(); g.gain.value = 0.7;
    src.connect(g); g.connect(this.sfxGain);
    src.start();
    // 1.5s 后播放展开音
    setTimeout(() => this.playSmokeExpand(), 1500);
  }

  playSmokeExpand() {
    if (!this.started || !this.smokeSfx || !this.smokeSfx.expand) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.smokeSfx.expand;
    const g = ctx.createGain(); g.gain.value = 0.6;
    src.connect(g); g.connect(this.sfxGain);
    src.start();
  }
}

export const audio = new AudioManager();
if (typeof window !== 'undefined') window.__audio = audio;   // 调试/自动化验证钩子
