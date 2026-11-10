// ═══ 厂房车库（选车场景）：全程序化坦克工厂车间 ═══
// 混凝土地面（油渍/安全线/粗糙度斑）+ 钢柱桁架屋顶 + 桥式天车吊装 + 射灯体积光
// 所有网格与贴图均由代码生成（CanvasTexture / 合并几何体），无外部资源。
// 用法：main.js 进入机库时 show()（隐藏战场 world），退出时 hide() 还原。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ── 确定性随机（贴图每次生成一致，刷新后油渍/锈迹位置不跳变） ──
function rng(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const FONT = '"Arial","Microsoft YaHei",sans-serif';

// ───────────────────────── 程序化贴图 ─────────────────────────

// 混凝土地面：基础噪点 + 大块水渍 + 伸缩缝 + 油渍 + 划痕 + 黄色安全标线 + 工位编号
// 同时产出配套 roughnessMap（油渍处更光滑 → 射灯下有反光湿感）
function makeFloorTextures() {
  const W = 2048, H = 1536;                     // 46×34m → 44.5px/m
  const rand = rng(20260905);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // 基底 + 逐像素噪点
  g.fillStyle = '#83817b'; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 22;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // 大块水渍色斑（明暗斑块交错）
  for (let i = 0; i < 46; i++) {
    const x = rand() * W, y = rand() * H, r = 120 + rand() * 380;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.5;
    gr.addColorStop(0, dark ? 'rgba(60,58,52,0.10)' : 'rgba(210,208,200,0.08)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // 伸缩缝（约 5.75m 网格：暗缝 + 下缘亮线）
  const px = x => (x + 23) / 46 * W, pz = z => (z + 17) / 34 * H;
  g.lineWidth = 3;
  for (let x = -17.25; x < 23; x += 5.75) {
    g.strokeStyle = 'rgba(30,28,25,0.55)'; g.beginPath(); g.moveTo(px(x), 0); g.lineTo(px(x), H); g.stroke();
    g.strokeStyle = 'rgba(235,232,225,0.20)'; g.beginPath(); g.moveTo(px(x) + 2.5, 0); g.lineTo(px(x) + 2.5, H); g.stroke();
  }
  for (let z = -12.75; z < 17; z += 4.25) {
    g.strokeStyle = 'rgba(30,28,25,0.5)'; g.beginPath(); g.moveTo(0, pz(z)); g.lineTo(W, pz(z)); g.stroke();
    g.strokeStyle = 'rgba(235,232,225,0.18)'; g.beginPath(); g.moveTo(0, pz(z) + 2.5); g.lineTo(W, pz(z) + 2.5); g.stroke();
  }
  // 保养划痕 / 履带拖痕（细长暗弧）
  for (let i = 0; i < 26; i++) {
    const x0 = rand() * W, y0 = rand() * H, len = 80 + rand() * 300, a = rand() * Math.PI * 2;
    g.strokeStyle = `rgba(48,45,40,${0.05 + rand() * 0.08})`;
    g.lineWidth = 2 + rand() * 5;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); g.stroke();
  }
  // 油渍（记录位置供粗糙度图复用；中心展示位附近避开）
  const stains = [];
  for (let i = 0; i < 16; i++) {
    let x = rand() * W, y = rand() * H;
    // 距展示位中心太近则往边缘推
    const cx = W / 2, cy = H / 2;
    if (Math.hypot((x - cx) / W, (y - cy) / H) < 0.16) { x = (x + W * 0.34) % W; y = (y + H * 0.34) % H; }
    stains.push({ x, y, r: 26 + rand() * 92, a: 0.35 + rand() * 0.3 });
  }
  for (const s of stains) {
    const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    gr.addColorStop(0, `rgba(22,18,12,${s.a})`);
    gr.addColorStop(0.55, `rgba(30,26,18,${s.a * 0.55})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
    if (rand() < 0.5) {   // 部分油渍带拖尾
      g.fillStyle = `rgba(24,20,14,${s.a * 0.4})`;
      g.beginPath(); g.ellipse(s.x + s.r * 0.4, s.y + s.r * 0.6, s.r * 0.9, s.r * 0.35, rand(), 0, 7); g.fill();
    }
  }
  // ── 黄色安全标线：中央 17×13m 检修展示位 ──
  const lx0 = px(-8.5), lx1 = px(8.5), lz0 = pz(-6.5), lz1 = pz(6.5);
  g.strokeStyle = 'rgba(216,178,58,0.82)'; g.lineWidth = 6;
  g.strokeRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
  // 四角斜纹警示块
  g.save(); g.strokeStyle = 'rgba(216,178,58,0.6)'; g.lineWidth = 5;
  const L = 34;
  for (const [cx, cy, dx, dy] of [[lx0, lz0, 1, 1], [lx1, lz0, -1, 1], [lx0, lz1, 1, -1], [lx1, lz1, -1, -1]]) {
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.moveTo(cx + dx * i * 11, cy); g.lineTo(cx + dx * i * 11 + dx * L, cy + dy * L); g.stroke();
    }
  }
  g.restore();
  // 人行通道线（展示位两侧通向 +z 大门）
  g.strokeStyle = 'rgba(216,178,58,0.55)'; g.lineWidth = 5;
  for (const x of [-6, 6]) { g.beginPath(); g.moveTo(px(x), lz1); g.lineTo(px(x), pz(16)); g.stroke(); }
  // 工位编号"03"模板字（褪色黄）
  g.save(); g.translate(px(5.2), pz(4.6)); g.globalAlpha = 0.42;
  g.fillStyle = '#d8b23a'; g.font = `bold 130px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('03', 0, 0);
  g.restore();
  // 粗糙度图（同位置油渍更光滑：值越小越亮）
  const rw = 1024, rh = 768;
  const rc = document.createElement('canvas'); rc.width = rw; rc.height = rh;
  const rg = rc.getContext('2d');
  rg.fillStyle = 'rgb(214,214,214)'; rg.fillRect(0, 0, rw, rh);
  const rimg = rg.getImageData(0, 0, rw, rh), rd = rimg.data;
  for (let i = 0; i < rd.length; i += 4) {
    const n = (rand() - 0.5) * 26;
    rd[i] = rd[i + 1] = rd[i + 2] = THREE.MathUtils.clamp(rd[i] + n, 0, 255);
  }
  rg.putImageData(rimg, 0, 0);
  for (const s of stains) {
    const sx = s.x / W * rw, sy = s.y / H * rh, sr = s.r / W * rw;
    const gr = rg.createRadialGradient(sx, sy, 0, sx, sy, sr);
    gr.addColorStop(0, 'rgba(70,70,70,0.95)');
    gr.addColorStop(0.7, 'rgba(120,120,120,0.5)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = gr; rg.beginPath(); rg.arc(sx, sy, sr, 0, 7); rg.fill();
  }
  // 展示位漆面略光滑
  rg.fillStyle = 'rgba(180,180,180,0.35)';
  rg.fillRect(lx0 / W * rw, lz0 / H * rh, (lx1 - lx0) / W * rw, (lz1 - lz0) / H * rh);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const roughnessMap = new THREE.CanvasTexture(rc);
  roughnessMap.anisotropy = 4;
  // 细颗粒凹凸（重复小图）
  const bc = document.createElement('canvas'); bc.width = bc.height = 256;
  const bg = bc.getContext('2d');
  const bimg = bg.createImageData(256, 256), bd = bimg.data;
  for (let i = 0; i < bd.length; i += 4) {
    const n = 118 + (rand() - 0.5) * 120;
    bd[i] = bd[i + 1] = bd[i + 2] = n; bd[i + 3] = 255;
  }
  bg.putImageData(bimg, 0, 0);
  const bumpMap = new THREE.CanvasTexture(bc);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping; bumpMap.repeat.set(10, 8);
  return { map, roughnessMap, bumpMap };
}

// 噪点画布（钢/混凝土颗粒通用）
function makeNoiseCanvas(size, low, high, seed) {
  const rand = rng(seed);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = low + rand() * (high - low);
    d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// 墙面压型钢板（瓦楞）：竖向肋 + 檩条暗带 + 下缘积灰 + 锈水流痕
function makeCorrugatedTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(778);
  g.fillStyle = '#69727c'; g.fillRect(0, 0, S, S);
  // 细噪点
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // 竖向瓦楞肋（高光/阴影成对，间距 16px；贴图横向重复 ≈3m/张 → 肋距 9.4cm）
  for (let x = 0; x < S; x += 16) {
    let gr = g.createLinearGradient(x, 0, x + 16, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.02)');
    gr.addColorStop(0.72, 'rgba(0,0,0,0.16)');
    gr.addColorStop(1, 'rgba(0,0,0,0.30)');
    g.fillStyle = gr; g.fillRect(x, 0, 16, S);
  }
  // 檩条水平暗带（对应墙高 3.5 / 5.2 / 8.8m；贴图覆盖 2.2~9.6m）
  for (const [t, dark] of [[0.175, 0.30], [0.405, 0.24], [0.892, 0.26]]) {
    const y = t * S;
    g.fillStyle = `rgba(20,24,28,${dark})`; g.fillRect(0, y, S, 7);
    g.fillStyle = 'rgba(230,235,240,0.14)'; g.fillRect(0, y + 7, S, 2);
  }
  // 锈水流痕（从檩条向下）
  for (let i = 0; i < 26; i++) {
    const x = rand() * S, y = [0.175, 0.405, 0.892][Math.floor(rand() * 3)] * S;
    const len = 20 + rand() * 90;
    g.fillStyle = `rgba(96,60,32,${0.05 + rand() * 0.10})`;
    g.fillRect(x, y + 8, 1.5 + rand() * 2.5, len);
  }
  // 下缘积灰 + 泥溅
  let gr = g.createLinearGradient(0, S * 0.8, 0, S);
  gr.addColorStop(0, 'rgba(30,28,24,0)');
  gr.addColorStop(1, 'rgba(30,28,24,0.5)');
  g.fillStyle = gr; g.fillRect(0, S * 0.8, S, S * 0.2);
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(40,36,30,${0.12 + rand() * 0.2})`;
    g.beginPath(); g.ellipse(rand() * S, S - rand() * 26, 4 + rand() * 16, 2 + rand() * 5, 0, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 混凝土墙裙：模板缝 + 对拉螺栓孔 + 下缘污渍
function makeConcreteTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(4242);
  g.fillStyle = '#7d7b74'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 18;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // 模板水平缝
  for (let y = 0; y < S; y += 128) {
    g.fillStyle = 'rgba(40,38,34,0.4)'; g.fillRect(0, y, S, 3);
    g.fillStyle = 'rgba(225,222,214,0.16)'; g.fillRect(0, y + 3, S, 2);
  }
  // 对拉螺栓孔
  g.fillStyle = 'rgba(35,33,30,0.55)';
  for (let y = 64; y < S; y += 128) for (let x = 64; x < S; x += 128) {
    g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  }
  // 污渍
  for (let i = 0; i < 14; i++) {
    const x = rand() * S, y = rand() * S, r = 30 + rand() * 80;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(56,52,44,${0.06 + rand() * 0.08})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 深色漆面钢（桁架/天车）：颗粒 + 划痕露底
function makeSteelTexture() {
  const S = 512;
  const c = makeNoiseCanvas(S, 58, 86, 991);
  const g = c.getContext('2d');
  const rand = rng(992);
  // 划痕
  for (let i = 0; i < 42; i++) {
    const x0 = rand() * S, y0 = rand() * S, a = rand() * Math.PI * 2, len = 12 + rand() * 60;
    g.strokeStyle = `rgba(196,200,204,${0.04 + rand() * 0.08})`;
    g.lineWidth = 1 + rand();
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); g.stroke();
  }
  // 边缘磨损露底（浅色斑）
  for (let i = 0; i < 20; i++) {
    const x = rand() * S, y = rand() * S;
    g.fillStyle = `rgba(150,118,80,${0.05 + rand() * 0.08})`;
    g.beginPath(); g.ellipse(x, y, 3 + rand() * 10, 2 + rand() * 5, rand(), 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 木弹药箱：横板条 + 木纹 + 角包铁 + 模板字
function makeCrateTexture(stencil) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(stencil.length * 77 + 13);
  g.fillStyle = '#8a6f4a'; g.fillRect(0, 0, S, S);
  // 横板条（6 排）
  for (let r = 0; r < 6; r++) {
    const y = r * 85.3;
    g.fillStyle = `rgb(${128 + rand() * 26 | 0},${100 + rand() * 20 | 0},${66 + rand() * 16 | 0})`;
    g.fillRect(0, y, S, 85.3);
    // 木纹
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(72,52,30,${0.08 + rand() * 0.12})`;
      g.lineWidth = 1 + rand() * 1.5;
      const yy = y + rand() * 85.3;
      g.beginPath(); g.moveTo(0, yy);
      g.bezierCurveTo(S * 0.3, yy + (rand() - 0.5) * 8, S * 0.6, yy + (rand() - 0.5) * 8, S, yy + (rand() - 0.5) * 6);
      g.stroke();
    }
    g.fillStyle = 'rgba(40,28,16,0.55)'; g.fillRect(0, y + 85.3 - 2.5, S, 2.5);
  }
  // 角包铁
  g.fillStyle = 'rgba(58,60,64,0.9)';
  for (const [x, y] of [[0, 0], [S - 52, 0], [0, S - 52], [S - 52, S - 52]]) g.fillRect(x, y, 52, 52);
  for (const [x, y] of [[26, 26], [S - 26, 26], [26, S - 26], [S - 26, S - 26]]) {
    g.fillStyle = 'rgba(150,152,156,0.8)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  }
  // 模板字
  g.save(); g.globalAlpha = 0.72; g.fillStyle = '#e8e2ce';
  g.font = `bold 50px ${FONT}`; g.textAlign = 'center';
  g.fillText(stencil, S / 2, S / 2 - 6);
  g.font = `bold 24px ${FONT}`; g.globalAlpha = 0.5;
  g.fillText('↑ THIS SIDE UP · KEEP DRY', S / 2, S / 2 + 38);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 油桶：箍筋 + 锈斑 + 模板字
function makeDrumTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  const rand = rng(5150);
  g.fillStyle = '#66684a'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 20;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // 两道滚箍
  for (const y of [170, 342]) {
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y, S, 5);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y + 5, S, 7);
  }
  // 锈斑
  for (let i = 0; i < 24; i++) {
    const x = rand() * S, y = rand() * S, r = 4 + rand() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(122,70,30,${0.25 + rand() * 0.4})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // 模板字 + 危险品菱形（UN 3 类易燃液体）
  g.fillStyle = 'rgba(232,226,206,0.8)';
  g.font = `bold 44px ${FONT}`; g.textAlign = 'center';
  g.fillText('DIESEL', S / 2, 150); g.fillText('FUEL', S / 2, 460);
  g.save(); g.translate(S / 2, 256); g.rotate(Math.PI / 4);
  g.fillStyle = 'rgba(200,120,30,0.85)'; g.fillRect(-30, -30, 60, 60);
  g.fillStyle = '#1a1a1a'; g.font = `bold 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('3', 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 工业窗（夹丝玻璃）：分格 + 磨砂噪声 + 铁丝网
function makeWindowTexture() {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = rng(3141);
  for (let p = 0; p < 4; p++) {
    const x0 = p * 128;
    const bright = 0.82 + rand() * 0.18;
    const gr = g.createLinearGradient(x0, 0, x0, H);
    gr.addColorStop(0, `rgba(${198 * bright | 0},${212 * bright | 0},${224 * bright | 0},1)`);
    gr.addColorStop(1, `rgba(${156 * bright | 0},${172 * bright | 0},${188 * bright | 0},1)`);
    g.fillStyle = gr; g.fillRect(x0, 0, 124, H);
    // 磨砂噪点
    for (let i = 0; i < 240; i++) {
      g.fillStyle = `rgba(255,255,255,${rand() * 0.10})`;
      g.fillRect(x0 + rand() * 124, rand() * H, 2 + rand() * 4, 1.5);
    }
    // 夹丝网（斜向网格线）
    g.strokeStyle = 'rgba(40,46,52,0.20)'; g.lineWidth = 1;
    for (let s = -H; s < 124 + H; s += 18) {
      g.beginPath(); g.moveTo(x0 + s, 0); g.lineTo(x0 + s + H, H); g.stroke();
      g.beginPath(); g.moveTo(x0 + s + H, 0); g.lineTo(x0 + s, H); g.stroke();
    }
    // 窗框分隔
    g.fillStyle = '#262b30'; g.fillRect(x0 + 124, 0, 4, H);
  }
  g.fillStyle = '#262b30'; g.fillRect(0, 0, W, 5); g.fillRect(0, H - 5, W, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 大门（端墙滑升门）：门板肋 + 中缝 + 下缘警示斜纹 + 小门 + 模板字 + 锈痕
function makeDoorTexture() {
  const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(8080);
  g.fillStyle = '#5d6871'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // 水平门板 + 肋线
  for (let y = 0; y < S; y += 128) {
    g.fillStyle = 'rgba(255,255,255,0.09)'; g.fillRect(0, y, S, 5);
    g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(0, y + 8, S, 9);
  }
  // 竖向分缝
  g.fillStyle = 'rgba(20,24,28,0.4)';
  for (let x = 128; x < S; x += 128) g.fillRect(x - 2, 0, 4, S);
  // 中缝（双开）
  g.fillStyle = 'rgba(12,14,16,0.75)'; g.fillRect(S / 2 - 5, 0, 10, S);
  // 下缘黑黄警示斜纹
  g.save(); g.beginPath(); g.rect(0, S - 88, S, 88); g.clip();
  for (let x = -100; x < S + 100; x += 64) {
    g.fillStyle = '#c9a227'; g.beginPath();
    g.moveTo(x, S); g.lineTo(x + 40, S); g.lineTo(x + 40 + 88, S - 88); g.lineTo(x + 88, S - 88); g.closePath(); g.fill();
  }
  g.fillStyle = '#181818'; g.fillRect(0, S - 88, S, 5);
  g.restore();
  // 小门（右扇）
  g.strokeStyle = 'rgba(20,22,26,0.7)'; g.lineWidth = 5;
  g.strokeRect(S - 250, S * 0.42, 170, 300);
  g.fillStyle = 'rgba(210,214,218,0.8)'; g.fillRect(S - 108, S * 0.55, 10, 34);
  g.fillStyle = 'rgba(210,214,218,0.8)'; g.fillRect(S - 240, S * 0.55, 8, 46); g.fillRect(S - 80, S * 0.55, 8, 46);
  // 模板字
  g.fillStyle = 'rgba(236,232,220,0.8)';
  g.font = `bold 92px ${FONT}`; g.textAlign = 'center';
  g.fillText('BAY 03', S / 2, 300);
  g.font = `bold 34px ${FONT}`; g.fillStyle = 'rgba(216,178,58,0.9)';
  g.fillText('OVERHEAD CRANE · MAX 20t · HEADROOM 4.5m', S / 2, 360);
  // 锈水流痕
  for (let i = 0; i < 34; i++) {
    const x = rand() * S, y = (Math.floor(rand() * 8)) * 128 + 17;
    g.fillStyle = `rgba(96,60,32,${0.06 + rand() * 0.12})`;
    g.fillRect(x, y, 2 + rand() * 3, 30 + rand() * 120);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// 工具柜：抽屉分格 + 拉手 + 红色顶带
function makeCabinetTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(616);
  g.fillStyle = '#4c5157'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 12;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // 顶部红带
  g.fillStyle = '#a5352a'; g.fillRect(0, 0, S, 64);
  g.fillStyle = 'rgba(240,236,226,0.92)'; g.font = `bold 36px ${FONT}`; g.textAlign = 'center';
  g.fillText('TOOLS', S / 2, 44);
  // 抽屉 6 格
  for (let r = 0; r < 6; r++) {
    const y = 78 + r * 71;
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(26, y, S - 52, 58);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 3; g.strokeRect(26, y, S - 52, 58);
    // 拉手 + 标签槽
    g.fillStyle = 'rgba(190,194,198,0.75)'; g.fillRect(S / 2 - 56, y + 22, 112, 12);
    g.fillStyle = 'rgba(230,226,214,0.5)'; g.fillRect(58, y + 18, 74, 22);
  }
  // 下缘阴影
  let gr = g.createLinearGradient(0, S - 60, 0, S);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.4)');
  g.fillStyle = gr; g.fillRect(0, S - 60, S, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 安全海报
function makePosterTexture(title, sub, accent) {
  const W = 256, H = 384;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = rng(title.length * 31 + 7);
  g.fillStyle = '#e6e2d8'; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = accent; g.fillRect(0, 0, W, 58);
  g.fillStyle = '#fff'; g.font = `bold 30px ${FONT}`; g.textAlign = 'center';
  g.fillText(title, W / 2, 40);
  // 警示图标（三角 + 感叹号）
  g.strokeStyle = accent; g.lineWidth = 10; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(W / 2, 88); g.lineTo(W / 2 + 62, 188); g.lineTo(W / 2 - 62, 188); g.closePath(); g.stroke();
  g.fillStyle = accent;
  g.fillRect(W / 2 - 7, 118, 14, 40); g.beginPath(); g.arc(W / 2, 172, 8, 0, 7); g.fill();
  // 文案
  g.fillStyle = '#33302a'; g.font = `bold 22px ${FONT}`;
  const lines = sub.split('\n');
  lines.forEach((ln, i) => g.fillText(ln, W / 2, 232 + i * 34));
  // 正文横条（假文）
  g.fillStyle = 'rgba(80,76,68,0.45)';
  for (let i = 0; i < 3; i++) g.fillRect(40, 236 + lines.length * 34 + i * 26, W - 80, 7);
  // 底边
  g.fillStyle = accent; g.fillRect(0, H - 14, W, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 车间横幅标牌（大门上方）
function makeSignTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = rng(11235);
  g.fillStyle = '#1e2a33'; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 10;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(216,178,58,0.8)'; g.lineWidth = 4; g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = '#eef0ec'; g.font = `bold 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('HEAVY ARMOR ASSEMBLY SHOP', W / 2, H / 2 - 26);
  g.fillStyle = 'rgba(216,178,58,0.95)'; g.font = `bold 30px ${FONT}`;
  g.fillText('BAY 03 · ARMORED VEHICLE DEPOT', W / 2, H - 42);
  // 铆钉
  g.fillStyle = 'rgba(160,166,170,0.6)';
  for (const [x, y] of [[28, 28], [W - 28, 28], [28, H - 28], [W - 28, H - 28]]) {
    g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 粒子软点 / 灯光光晕
function makeDotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,244,220,1)'); gr.addColorStop(0.18, 'rgba(255,236,196,0.55)');
  gr.addColorStop(0.45, 'rgba(255,226,170,0.16)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
// 交通锥（橙白横纹）
function makeConeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#d4601e'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e8e4da'; g.fillRect(0, 22, 64, 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────────────────── 场景本体 ─────────────────────────

const HX = 23, HZ = 17;        // 厂房半长（x）/半宽（z），内空 46×34m
const EAVE = 9.6, DECK = 12.6; // 檐口高 / 屋面板高

export class Garage {
  /**
   * @param scene    THREE.Scene
   * @param renderer THREE.WebGLRenderer（PMREM 环境贴图生成用）
   * @param quality  'high'|'medium'|'low'（射灯阴影分辨率）
   */
  constructor(scene, renderer, quality = 'high') {
    this.scene = scene;
    this.visible = false;
    this._t = 0;
    this._fans = [];
    this.root = new THREE.Group();
    this.root.name = 'garage';
    scene.add(this.root);

    // ── 贴图与材质（一次生成，全程共享） ──
    const floorTex = makeFloorTextures();
    const corrTex = makeCorrugatedTexture();
    const concTex = makeConcreteTexture();
    const steelTex = makeSteelTexture();
    const drumTex = makeDrumTexture();
    const winTex = makeWindowTexture();
    const doorTex = makeDoorTexture();
    const cabTex = makeCabinetTexture();
    const signTex = makeSignTexture();
    const coneTex = makeConeTexture();
    this._dotTex = makeDotTexture();
    this._glowTex = makeGlowTexture();

    const noiseBump = new THREE.CanvasTexture(makeNoiseCanvas(256, 90, 160, 555));
    noiseBump.wrapS = noiseBump.wrapT = THREE.RepeatWrapping;

    this.matFloor = new THREE.MeshStandardMaterial({
      map: floorTex.map, roughnessMap: floorTex.roughnessMap, bumpMap: floorTex.bumpMap,
      bumpScale: 0.35, roughness: 1, metalness: 0.05,
    });
    this.matSteel = new THREE.MeshStandardMaterial({ map: steelTex, color: 0xb8bcc2, roughness: 0.62, metalness: 0.75, bumpMap: noiseBump, bumpScale: 0.06 });
    this.matSteelDark = new THREE.MeshStandardMaterial({ map: steelTex, color: 0x6f747c, roughness: 0.7, metalness: 0.6, bumpMap: noiseBump, bumpScale: 0.06 });
    this.matDuct = new THREE.MeshStandardMaterial({ color: 0x8b939b, roughness: 0.42, metalness: 0.7 });
    this.matWood = new THREE.MeshStandardMaterial({ color: 0x9a7a50, roughness: 0.85, metalness: 0.02 });
    this.matCrateA = new THREE.MeshStandardMaterial({ map: makeCrateTexture('125MM APFSDS'), roughness: 0.88, metalness: 0.02 });
    this.matCrateB = new THREE.MeshStandardMaterial({ map: makeCrateTexture('SPARE PARTS'), roughness: 0.88, metalness: 0.02 });
    this.matDrum = new THREE.MeshStandardMaterial({ map: drumTex, roughness: 0.62, metalness: 0.45 });
    this.matConcrete = new THREE.MeshStandardMaterial({ map: concTex, color: 0xb6b3ac, roughness: 0.94, metalness: 0 });
    this.matCabinet = new THREE.MeshStandardMaterial({ map: cabTex, roughness: 0.6, metalness: 0.35 });
    this.matLens = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xfff2d2, emissiveIntensity: 5.5, roughness: 0.4 });
    this.matBeacon = new THREE.MeshStandardMaterial({ color: 0x300808, emissive: 0xff2211, emissiveIntensity: 1 });
    this.matLedG = new THREE.MeshStandardMaterial({ color: 0x0a2008, emissive: 0x22ff55, emissiveIntensity: 1.6 });

    this._buildFloor();
    this._buildWalls(corrTex, winTex, doorTex, signTex);
    this._buildRoof();
    this._buildCrane();
    this._buildProps(coneTex);
    this._buildLights(quality);
    this._buildAtmosphere();
    this._buildEnv(renderer);

    // 默认隐藏（等 show()）
    this.root.visible = false;
  }

  // 合并盒子工具：[{x,y,z,w,h,d,rx,ry}] → 单几何体（减少 draw call）
  _parts(list) {
    const geos = [];
    for (const p of list) {
      const g = new THREE.BoxGeometry(p.w, p.h, p.d);
      if (p.rx) g.rotateX(p.rx);
      if (p.ry) g.rotateY(p.ry);
      g.translate(p.x, p.y, p.z);
      geos.push(g);
    }
    return mergeGeometries(geos, false);
  }
  _addParts(parent, list, mat, cast = false, receive = true) {
    const m = new THREE.Mesh(this._parts(list), mat);
    m.castShadow = cast; m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  // ── 混凝土地面 ──
  _buildFloor() {
    const geo = new THREE.PlaneGeometry(HX * 2, HZ * 2);
    geo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(geo, this.matFloor);
    floor.receiveShadow = true;
    this.root.add(floor);
  }

  // ── 四面墙体：混凝土裙墙 + 压型钢板 + 工字钢柱 + 夹丝玻璃窗带 ──
  _buildWalls(corrTex, winTex, doorTex, signTex) {
    const sideLen = HX * 2, endLen = HZ * 2;
    const walls = [
      { len: sideLen, pos: [0, 0, -HZ], ry: 0 },            // -z 朝内 +z
      { len: sideLen, pos: [0, 0, HZ], ry: Math.PI },        // +z
      { len: endLen, pos: [-HX, 0, 0], ry: Math.PI / 2 },    // -x（大门墙）
      { len: endLen, pos: [HX, 0, 0], ry: -Math.PI / 2 },    // +x
    ];
    for (const w of walls) {
      const g = new THREE.Group();
      g.position.set(...w.pos); g.rotation.y = w.ry;
      this.root.add(g);
      // 压型钢板（2.2m 檐墙以上；贴图横向 ~3m/张）
      const ct = corrTex.clone();
      ct.repeat.set(Math.round(w.len / 3), 1);
      ct.needsUpdate = true;
      const corr = new THREE.Mesh(new THREE.PlaneGeometry(w.len, EAVE - 2.2),
        new THREE.MeshStandardMaterial({ map: ct, roughness: 0.72, metalness: 0.32 }));
      corr.position.y = 2.2 + (EAVE - 2.2) / 2;
      corr.receiveShadow = true;
      g.add(corr);
      // 混凝土裙墙（略凸入室内）
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(w.len + 0.6, 2.2, 0.35), this.matConcrete);
      plinth.position.y = 1.1;
      plinth.receiveShadow = true;
      g.add(plinth);
      // 工字钢柱（墙线上每 5.75m / 端墙每 4.25m）
      const step = w.len === sideLen ? 46 / 8 : 34 / 8;
      const cols = [];
      for (let x = -w.len / 2; x <= w.len / 2 + 0.01; x += step) {
        cols.push({ x, y: EAVE / 2, z: 0.2, w: 0.34, h: EAVE, d: 0.016 });              // 腹板
        cols.push({ x, y: EAVE / 2, z: 0.2 - 0.17, w: 0.34, h: EAVE, d: 0.02 });        // 前翼缘
        cols.push({ x, y: EAVE / 2, z: 0.2 + 0.17, w: 0.34, h: EAVE, d: 0.02 });        // 后翼缘
        cols.push({ x, y: 0.03, z: 0.2, w: 0.62, h: 0.06, d: 0.62 });                    // 柱脚板
      }
      this._addParts(g, cols, this.matSteel, true);
      // 侧墙（长边）窗带：夹丝玻璃 + 窗框中梃
      if (w.len === sideLen) {
        const wt = winTex.clone();
        wt.repeat.set(Math.round(w.len / 8), 1); wt.needsUpdate = true;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(w.len, 1.8),
          new THREE.MeshStandardMaterial({ color: 0x11161a, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: 1.35, roughness: 0.9 }));
        win.position.set(0, 6.8, 0.12);
        g.add(win);
        const mullions = [];
        for (let x = -w.len / 2; x <= w.len / 2 + 0.01; x += step) {
          mullions.push({ x, y: 6.8, z: 0.1, w: 0.1, h: 2.0, d: 0.1 });
        }
        mullions.push({ x: 0, y: 5.85, z: 0.1, w: w.len, h: 0.1, d: 0.1 }, { x: 0, y: 7.75, z: 0.1, w: w.len, h: 0.1, d: 0.1 });
        this._addParts(g, mullions, this.matSteelDark);
      }
    }

    // ── -x 端墙：滑升大门 + 车间标牌 ──
    const doorG = new THREE.Group();
    doorG.position.set(-HX, 0, 0); doorG.rotation.y = Math.PI / 2;
    this.root.add(doorG);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(10, 7.2),
      new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.66, metalness: 0.35 }));
    door.position.set(0, 3.6, 0.2); door.receiveShadow = true;
    doorG.add(door);
    // 门框
    this._addParts(doorG, [
      { x: -5.15, y: 3.6, z: 0.24, w: 0.3, h: 7.5, d: 0.3 }, { x: 5.15, y: 3.6, z: 0.24, w: 0.3, h: 7.5, d: 0.3 },
      { x: 0, y: 7.38, z: 0.24, w: 10.6, h: 0.3, d: 0.3 },
    ], this.matSteelDark, true);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, metalness: 0.2 }));
    sign.position.set(0, 8.35, 0.26);
    doorG.add(sign);

    // ── 墙面海报（四面错落） ──
    const posters = [
      ['SAFETY FIRST', 'THINK TWICE\nACT SAFELY', '#b3352a', -6.5, -HZ, 0, 2.6],
      ['CRANE ZONE', 'NO STANDING UNDER\nSWINGING LOADS', '#c07a1e', -5.1, -HZ, 0, 4.2],
      ['FIRE POINT', 'EMERGENCY USE ONLY\nKEEP CLEAR', '#b3352a', 16, HZ, Math.PI, 3.1],
      ['HIGH VOLTAGE', 'DISCONNECT POWER\nBEFORE SERVICE', '#c07a1e', HX, 10, -Math.PI / 2, 2.4],
      ['PPE REQUIRED', 'HARD HATS MUST\nBE WORN HERE', '#2e6da3', -HX, 3.2, Math.PI / 2, 5.2],
    ];
    for (const [title, sub, accent, x, z, ry, y] of posters) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.3),
        new THREE.MeshStandardMaterial({ map: makePosterTexture(title, sub, accent), roughness: 0.9 }));
      p.position.set(x, y, z); p.rotation.y = ry;
      if (ry === 0) p.position.z += 0.12;
      else if (Math.abs(ry) === Math.PI) p.position.z -= 0.12;
      else if (ry === Math.PI / 2) p.position.x += 0.12;
      else p.position.x -= 0.12;
      this.root.add(p);
    }

    // ── 墙面管线：电导管 + 阀门 + 消防软管卷盘 ──
    const pipeParts = [];
    for (let i = 0; i < 3; i++) {   // -z 墙三路电导管（桥架）
      pipeParts.push({ x: 0, y: 3.1 + i * 0.34, z: -HZ + 0.3, w: sideLen - 8, h: 0.14, d: 0.3 });
    }
    this._addParts(this.root, pipeParts, this.matDuct);
    // 压缩空气管（沿 -z 墙，带阀门轮）
    const airPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, sideLen - 10, 10), this.matDuct);
    airPipe.rotation.z = Math.PI / 2; airPipe.position.set(2, 4.6, -HZ + 0.25);
    this.root.add(airPipe);
    for (const vx of [-16, -4, 12]) {
      const valve = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 18), this.matSteelDark);
      valve.position.set(vx, 4.6, -HZ + 0.25 + 0.12); valve.rotation.x = Math.PI / 2;
      this.root.add(valve);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), this.matSteelDark);
      stem.rotation.x = Math.PI / 2; stem.position.set(vx, 4.6, -HZ + 0.25 + 0.06);
      this.root.add(stem);
    }
    // 软管卷盘
    const reel = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 10, 24), new THREE.MeshStandardMaterial({ color: 0xa32a20, roughness: 0.6 }));
    reel.position.set(-14.5, 1.5, -HZ + 0.35);
    this.root.add(reel);
  }

  // ── 屋顶：桁架 + 檩条 + 屋面板 + 采光带 ──
  _buildRoof() {
    // 屋面板（朝下可见）
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2),
      new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.9, metalness: 0.25 }));
    deck.rotation.x = Math.PI / 2;
    deck.position.y = DECK;
    this.root.add(deck);
    // 桁架（柱网上 9 榀，跨 z 向）：上下弦 + 竖杆 + 斜腹杆
    const parts = [];
    const Y0 = 9.75, Y1 = 11.35;
    for (let x = -HX; x <= HX + 0.01; x += 46 / 8) {
      parts.push({ x, y: Y0, z: 0, w: 0.26, h: 0.26, d: HZ * 2 + 0.3 });
      parts.push({ x, y: Y1, z: 0, w: 0.26, h: 0.26, d: HZ * 2 + 0.3 });
      const n = 12, seg = (HZ * 2) / n;
      for (let i = 0; i <= n; i++) {
        const z = -HZ + i * seg;
        parts.push({ x, y: (Y0 + Y1) / 2, z, w: 0.14, h: Y1 - Y0, d: 0.14 });   // 竖杆
      }
      for (let i = 0; i < n; i++) {                                             // 斜腹杆（之字形交替）
        const dz = (i % 2 === 0) ? 1 : -1;
        parts.push({
          x, y: (Y0 + Y1) / 2, z: -HZ + i * seg + seg / 2,
          w: 0.11, h: Math.hypot(Y1 - Y0, seg), d: 0.11,
          rx: Math.atan2(dz * seg, Y1 - Y0),
        });
      }
      // 柱顶支座加劲
      parts.push({ x, y: Y0 - 0.35, z: 0, w: 0.5, h: 0.5, d: 0.5 });
    }
    // 檩条（沿 x，9 道）
    for (let z = -HZ; z <= HZ + 0.01; z += 34 / 8) {
      parts.push({ x: 0, y: Y1 + 0.18, z, w: HX * 2 + 0.3, h: 0.18, d: 0.18 });
    }
    this._addParts(this.root, parts, this.matSteel, true);

    // 采光带（4 条，微亮磨砂）
    const skyMat = new THREE.MeshStandardMaterial({
      color: 0x10161c, emissive: 0xb8ccd8, emissiveIntensity: 1.35, roughness: 0.85,
    });
    for (const sx of [-13.5, -4.5, 4.5, 13.5]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 28), skyMat);
      strip.rotation.x = Math.PI / 2;
      strip.position.set(sx, DECK - 0.25, 0);
      this.root.add(strip);
      this._addParts(this.root, [
        { x: sx - 1.2, y: DECK - 0.28, z: 0, w: 0.14, h: 0.1, d: 28 },
        { x: sx + 1.2, y: DECK - 0.28, z: 0, w: 0.14, h: 0.1, d: 28 },
      ], this.matSteelDark);
    }

    // 日光灯管排（y=9.2，三列 × 四支）
    this._tubeMat = new THREE.MeshStandardMaterial({ color: 0x232629, emissive: 0xeef3f8, emissiveIntensity: 2.1, roughness: 0.5 });
    for (const z of [-10, 0, 10]) {
      for (const x of [-18, -6, 6, 18]) {
        const tube = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 0.13), this._tubeMat);
        tube.position.set(x, 9.2, z);
        this.root.add(tube);
        // 吊杆
        this._addParts(this.root, [{ x, y: 10.3, z, w: 0.05, h: 2.2, d: 0.05 }], this.matSteelDark);
      }
    }
    // 通风管道（两侧沿 x）
    const ducts = [];
    for (const z of [-15.6, 15.6]) {
      ducts.push({ x: -10, y: 9.0, z, w: 26, h: 0.62, d: 0.5 });
      for (let x = -20; x <= -2; x += 6) ducts.push({ x, y: 8.45, z, w: 0.55, h: 0.5, d: 0.55 });
    }
    this._addParts(this.root, ducts, this.matDuct);
  }

  // ── 桥式天车：轨道 + 端梁 + 主梁 + 小车 + 吊钩挂载（微摆动画） ──
  _buildCrane() {
    const railY = 9.45, RAIL_Z = 14.8;
    // 轨道 + 牛腿
    const parts = [];
    for (const z of [-RAIL_Z, RAIL_Z]) {
      parts.push({ x: 0, y: railY, z, w: HX * 2 - 2, h: 0.14, d: 0.14 });
      for (let x = -HX; x <= HX + 0.01; x += 46 / 8) {
        parts.push({ x, y: railY - 0.4, z, w: 0.22, h: 0.66, d: 1.0 });   // 牛腿托架
      }
    }
    this._addParts(this.root, parts, this.matSteelDark, true);
    // 桥架（x=-8 处）
    const bridge = new THREE.Group();
    bridge.position.set(-8, 0, 0);
    this.root.add(bridge);
    this._addParts(bridge, [
      { x: 0, y: railY + 0.55, z: -RAIL_Z, w: 2.0, h: 0.9, d: 1.4 },            // 端梁×2
      { x: 0, y: railY + 0.55, z: RAIL_Z, w: 2.0, h: 0.9, d: 1.4 },
      { x: 0, y: railY + 1.35, z: 0, w: 1.15, h: 0.85, d: RAIL_Z * 2 - 1.4 },   // 主梁箱体
      { x: 0, y: railY + 1.82, z: 0, w: 1.3, h: 0.12, d: RAIL_Z * 2 - 1.4 },    // 走台面板
    ], this.matSteel, true);
    // 主梁横隔加劲肋
    const ribs = [];
    for (let z = -RAIL_Z + 1; z <= RAIL_Z - 1; z += 2.4) {
      ribs.push({ x: 0, y: railY + 1.35, z, w: 1.2, h: 0.6, d: 0.06 });
    }
    this._addParts(bridge, ribs, this.matSteelDark);
    // 栏杆
    const rails = [];
    for (let z = -RAIL_Z + 1; z <= RAIL_Z - 1; z += 1.2) {
      rails.push({ x: 0.62, y: railY + 2.3, z, w: 0.05, h: 0.9, d: 0.05 });
    }
    rails.push({ x: 0.62, y: railY + 2.72, z: 0, w: 0.05, h: 0.05, d: RAIL_Z * 2 - 2 });
    this._addParts(bridge, rails, this.matSteelDark);
    // 司机室（+z 端梁旁）
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.5, 1.15),
      new THREE.MeshStandardMaterial({ color: 0x3f4a54, roughness: 0.55, metalness: 0.4 }));
    cab.position.set(0, railY + 0.2, RAIL_Z - 1.4);
    cab.castShadow = true;
    bridge.add(cab);
    const cabWin = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x0c1013, emissive: 0x9fc8b8, emissiveIntensity: 0.7, roughness: 0.3 }));
    cabWin.position.set(0, railY + 0.45, RAIL_Z - 0.83); cabWin.rotation.y = Math.PI;
    bridge.add(cabWin);
    // 小车（z=-6）
    const trolleyZ = -6;
    this._addParts(bridge, [
      { x: 0, y: railY + 1.95, z: trolleyZ, w: 1.5, h: 0.5, d: 2.1 },
      { x: 0, y: railY + 2.25, z: trolleyZ - 0.5, w: 0.7, h: 0.5, d: 0.7 },
    ], this.matSteelDark, true);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.0, 14), this.matSteel);
    drum.rotation.z = Math.PI / 2; drum.position.set(0, railY + 2.3, trolleyZ + 0.4);
    bridge.add(drum);
    // 吊钩组（挂载点为小车下方，整组微摆）
    const sway = new THREE.Group();
    sway.position.set(-8, railY + 1.9, trolleyZ);
    this.root.add(sway);
    this._sway = sway;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.3, 6), this.matSteelDark);
    chain.position.y = -1.65; sway.add(chain);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), this.matSteelDark);
    hook.position.y = -3.45; hook.castShadow = true; sway.add(hook);
    // 吊装木箱 + 吊索
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.0, 1.15), this.matCrateB);
    crate.position.y = -4.35; crate.castShadow = true; sway.add(crate);
    const slings = [];
    for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
      const len = Math.hypot(0.55, 0.85);
      slings.push({ x: dx * 0.5, y: -3.95, z: dz * 0.5, w: 0.05, h: len, d: 0.05, rx: Math.atan2(dz, 0.9), ry: Math.atan2(-dx, 0.9) });
    }
    this._addParts(sway, slings, this.matSteelDark);
  }

  // ── 工位细节：工具柜/工作台/油桶/弹药箱/托盘/电缆卷筒/风机/消火栓等 ──
  _buildProps(coneTex) {
    const R = this.root;
    // ── 工具柜一排（-z 墙左段） ──
    for (let i = 0; i < 3; i++) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.0, 0.62), this.matCabinet);
      cab.position.set(-19.6 + i * 1.35, 1.0, -HZ + 0.55);
      cab.castShadow = cab.receiveShadow = true;
      R.add(cab);
      this._addParts(R, [{ x: -19.6 + i * 1.35, y: 0.03, z: -HZ + 0.55, w: 1.3, h: 0.06, d: 0.66 }], this.matSteelDark);
    }
    // ── 长工作台（-z 墙中段）+ 台虎钳 + 挂板 ──
    this._addParts(R, [
      { x: -9.5, y: 0.82, z: -HZ + 0.9, w: 5.2, h: 0.1, d: 1.15 },                     // 台面
      { x: -9.5, y: 0.4, z: -HZ + 0.9, w: 5.2, h: 0.72, d: 0.08 },                     // 后挡板
      { x: -11.8, y: 0.4, z: -HZ + 0.9, w: 0.1, h: 0.8, d: 1.0 },                      // 腿
      { x: -7.2, y: 0.4, z: -HZ + 0.9, w: 0.1, h: 0.8, d: 1.0 },
      { x: -11.9, y: 0.4, z: -HZ + 0.5, w: 5.4, h: 0.1, d: 0.08 },
    ], this.matSteel, true);
    // 台下储物格
    this._addParts(R, [{ x: -9.5, y: 0.35, z: -HZ + 1.1, w: 3.2, h: 0.55, d: 0.65 }], this.matWood);
    const vise = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.22), this.matSteelDark);
    vise.position.set(-11.2, 0.98, -HZ + 0.8); vise.castShadow = true; R.add(vise);
    this._addParts(R, [
      { x: -9.5, y: 1.9, z: -HZ + 0.32, w: 4.6, h: 1.5, d: 0.06 },                    // 挂板
    ], new THREE.MeshStandardMaterial({ color: 0x4a5258, roughness: 0.7, metalness: 0.3 }));
    // 挂板工具轮廓（磁吸刀具剪影）
    const toolMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.6 });
    const tools = [];
    for (let i = 0; i < 7; i++) tools.push({ x: -11.3 + i * 0.6, y: 1.9, z: -HZ + 0.28, w: 0.08, h: 0.5 + (i % 3) * 0.18, d: 0.05 });
    this._addParts(R, tools, toolMat);
    // 台面小件
    this._addParts(R, [
      { x: -8.6, y: 0.95, z: -HZ + 0.7, w: 0.5, h: 0.16, d: 0.35 },                   // 零件盘
      { x: -9.8, y: 0.97, z: -HZ + 1.15, w: 0.3, h: 0.22, d: 0.3 },                   // 台钳座
    ], this.matSteelDark);
    // 工作灯（软管弯管 + 灯罩）
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, emissive: 0xffdf9e, emissiveIntensity: 2.4, roughness: 0.5 });
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 14, 1, true), lampMat);
    lamp.position.set(-10.4, 1.72, -HZ + 0.55); lamp.rotation.x = -0.7;
    R.add(lamp);
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-10.6, 1.0, -HZ + 0.5), new THREE.Vector3(-10.75, 1.5, -HZ + 0.55),
      new THREE.Vector3(-10.4, 1.78, -HZ + 0.55),
    ]);
    R.add(new THREE.Mesh(new THREE.TubeGeometry(armCurve, 12, 0.02, 6), this.matSteelDark));

    // ── 油桶群（-z 墙右段） ──
    const drumGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.92, 16);
    const drumPos = [[8.4, -15.6, 0], [9.4, -15.2, 0], [10.3, -15.7, 0], [8.9, -14.6, 0.4], [7.5, -14.9, 1.2], [10.8, -14.7, -0.5]];
    for (const [x, z, ry] of drumPos) {
      const d = new THREE.Mesh(drumGeo, this.matDrum);
      d.position.set(x, 0.46, z); d.rotation.y = ry; d.castShadow = d.receiveShadow = true;
      R.add(d);
    }
    // 两只躺倒
    for (const [x, z, ry] of [[12.2, -15.4, 0.7], [13.1, -14.8, -0.4]]) {
      const d = new THREE.Mesh(drumGeo, this.matDrum);
      d.position.set(x, 0.3, z); d.rotation.z = Math.PI / 2; d.rotation.y = ry;
      d.castShadow = true; R.add(d);
    }

    // ── 弹药箱堆垛（-z 墙右端 + +x 墙） ──
    const stacks = [
      [18.4, -13.6, 0], [18.4, -12.2, 0.4], [19.6, -13.0, 0.2],
      [20.8, -6.4, 0], [20.6, -4.8, 0.8], [21.4, 10.6, 0.3], [20.6, 12.0, -0.2],
      [-21.2, -13.8, 0.5], [-20.0, -14.6, 0.1],
    ];
    for (const [x, z, ry] of stacks) {
      const mat = (Math.abs(x) > 19 && Math.random() < 0.5) ? this.matCrateA : this.matCrateB;
      const s = 0.9 + ((x * 7 + z) % 3) * 0.12;
      const c = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.72, s), mat);
      c.position.set(x, s * 0.36, z); c.rotation.y = ry; c.castShadow = c.receiveShadow = true;
      R.add(c);
      // 二层
      if (((x * 3 + z) | 0) % 2 === 0) {
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(s * 0.85, s * 0.62, s * 0.85), this.matCrateA);
        c2.position.set(x + 0.08, s * 0.72 + s * 0.31, z - 0.06); c2.rotation.y = ry + 0.3;
        c2.castShadow = true; R.add(c2);
      }
    }

    // ── 托盘堆（+x 墙） ──
    const palletParts = [];
    for (const [px, pz] of [[21.6, -8.6], [21.7, 8.2], [-21.5, 6.8]]) {
      for (let row = 0; row < 3; row++) {
        const y = 0.07 + row * 0.16;
        for (let b = 0; b < 3; b++) palletParts.push({ x: px, y, z: pz + b * 0.42 - 0.42, w: 1.3, h: 0.05, d: 0.3 });
        palletParts.push({ x: px, y: y + 0.05, z: pz, w: 1.3, h: 0.03, d: 1.25 });
      }
    }
    this._addParts(R, palletParts, this.matWood, true);

    // ── 电缆卷筒（-x 墙角，木架支起） ──
    const drumFlange = new THREE.CylinderGeometry(0.85, 0.85, 0.07, 20);
    const drumCore = new THREE.CylinderGeometry(0.34, 0.34, 0.85, 14);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.95 });
    const cd = new THREE.Group();
    cd.position.set(-19.8, 0.9, 10.6);
    const f1 = new THREE.Mesh(drumFlange, this.matWood); f1.rotation.z = Math.PI / 2; f1.position.x = -0.46; f1.castShadow = true;
    const f2 = new THREE.Mesh(drumFlange, this.matWood); f2.rotation.z = Math.PI / 2; f2.position.x = 0.46; f2.castShadow = true;
    const core = new THREE.Mesh(drumCore, cableMat); core.rotation.z = Math.PI / 2; core.castShadow = true;
    // 缠绕电缆层
    const wound = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.82, 18), cableMat);
    wound.rotation.z = Math.PI / 2; wound.castShadow = true;
    cd.add(f1, f2, core, wound);
    this._addParts(cd, [
      { x: -0.6, y: -0.55, z: 0, w: 0.18, h: 1.0, d: 1.4, ry: 0.18 },
      { x: 0.6, y: -0.55, z: 0, w: 0.18, h: 1.0, d: 1.4, ry: -0.18 },
    ], this.matWood);
    R.add(cd);

    // ── 焊机 + 下垂电缆（-z 墙右端） ──
    const welder = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x9c5a20, roughness: 0.6, metalness: 0.3 }));
    welder.position.set(15.2, 0.48, -HZ + 0.65); welder.castShadow = true;
    R.add(welder);
    this._addParts(R, [
      { x: 15.2, y: 1.02, z: -HZ + 0.65, w: 0.5, h: 0.2, d: 0.35 },       // 控制面板
      { x: 15.2, y: 0.5, z: -HZ + 0.98, w: 0.55, h: 0.5, d: 0.1 },         // 散热格栅
    ], this.matSteelDark);
    // 电缆（桁架垂到焊机）
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(15.2, 9.2, -HZ + 1.2), new THREE.Vector3(15.4, 6.5, -HZ + 1.6),
      new THREE.Vector3(14.6, 3.4, -HZ + 1.4), new THREE.Vector3(15.2, 1.1, -HZ + 0.9),
    ]);
    R.add(new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 24, 0.045, 6), cableMat));

    // ── 灭火器（工作台旁柱上） ──
    const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: 0xa32a20, roughness: 0.45, metalness: 0.2 }));
    ext.position.set(-13.1, 1.15, -HZ + 0.5); ext.castShadow = true;
    R.add(ext);
    this._addParts(R, [{ x: -13.1, y: 1.42, z: -HZ + 0.5, w: 0.16, h: 0.06, d: 0.1 }], this.matSteelDark);

    // ── 控制柜（-x 墙，门侧）+ 警灯 + LED ──
    const ctrl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 0.95), this.matCabinet);
    ctrl.position.set(-HX + 0.45, 0.95, 3.6); ctrl.castShadow = ctrl.receiveShadow = true;
    R.add(ctrl);
    this._beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 12), this.matBeacon);
    this._beacon.position.set(-HX + 0.45, 1.98, 3.6);
    R.add(this._beacon);
    this._addParts(R, [{ x: -HX + 0.45, y: 1.55, z: 4.08, w: 0.3, h: 0.1, d: 0.04 }], this.matLedG);
    this._addParts(R, [{ x: -HX + 0.45, y: 0.03, z: 3.6, w: 0.8, h: 0.06, d: 1.15 }], this.matConcrete);

    // ── 排风扇 ×2（+z 墙） ──
    for (const [fx, fy, r] of [[-12, 6.2, 0.95], [-4.2, 6.4, 0.75]]) {
      const fan = new THREE.Group();
      fan.position.set(fx, fy, HZ - 0.15);
      const shroud = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.42, 22, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x565c63, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }));
      shroud.rotation.x = Math.PI / 2;
      fan.add(shroud);
      const blades = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(r * 0.85, r * 0.3, 0.03),
          new THREE.MeshStandardMaterial({ color: 0x7b838c, roughness: 0.5, metalness: 0.6 }));
        b.position.set(Math.cos(i / 5 * Math.PI * 2) * r * 0.48, Math.sin(i / 5 * Math.PI * 2) * r * 0.48, 0);
        b.rotation.z = i / 5 * Math.PI * 2;
        b.rotation.x = 0.5;
        blades.add(b);
      }
      fan.add(blades);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10), this.matSteelDark);
      hub.rotation.x = Math.PI / 2;
      fan.add(hub);
      // 防护格栅
      const grille = [];
      for (let i = -2; i <= 2; i++) grille.push({ x: fx, y: fy, z: HZ - 0.42, w: r * 1.9, h: 0.04, d: 0.04, ry: i * 0.32 });
      this._addParts(R, grille, this.matSteelDark);
      R.add(fan);
      this._fans.push({ group: blades, speed: 1.6 + r });
    }

    // ── 交通锥 ×2（+z 前景） ──
    const coneMat = new THREE.MeshStandardMaterial({ map: coneTex, roughness: 0.7 });
    for (const [x, z] of [[10.5, 12.2], [12.3, 13.6]]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.52, 12), coneMat);
      cone.position.set(x, 0.26, z); cone.castShadow = true;
      R.add(cone);
      this._addParts(R, [{ x, y: 0.02, z, w: 0.4, h: 0.04, d: 0.4 }], new THREE.MeshStandardMaterial({ color: 0xc25a1c, roughness: 0.75 }));
    }

    // ── 坦克轮挡（展示位四角） ──
    const chocks = [];
    for (const [cx, cz, ry] of [[-1.62, 3.15, 0.5], [1.62, 3.15, -0.5], [-1.62, -3.15, Math.PI - 0.5], [1.62, -3.15, Math.PI + 0.5]]) {
      chocks.push({ x: cx, y: 0.09, z: cz, w: 0.16, h: 0.18, d: 0.75, ry });
    }
    this._addParts(R, chocks, this.matWood, true);

    // ── A 字警示牌（吊装位旁） ──
    const signMat = new THREE.MeshStandardMaterial({ map: makePosterTexture('CRANE LIFT', 'KEEP CLEAR OF\nSWING LOAD', '#c07a1e'), roughness: 0.9 });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8), signMat);
      p.position.set(-8 + side * 0.13, 0.42, -4.2);
      p.rotation.y = 0; p.rotation.x = side * 0.16;
      R.add(p);
    }
  }

  // ── 射灯阵列：主光/轮廓光/补光/门墙洗光 + 灯具模型 + 体积光锥 ──
  _buildLights(quality) {
    const R = this.root;
    const shadowRes = quality === 'high' ? 1024 : quality === 'medium' ? 768 : 512;
    // 环境基光（减灯后的底亮度主承担者：半球/环境光不进逐光源片元循环，性价比最高）
    R.add(new THREE.HemisphereLight(0x46525e, 0x2c2418, 1.05));
    R.add(new THREE.AmbientLight(0x2e3338, 0.55));
    // 采光带冷色顶光：原 3 盏小范围合并为 1 盏大范围（能量并入，覆盖全车间）
    const p = new THREE.PointLight(0x9fb4c8, 130, 70, 2);
    p.position.set(0, 11.4, 0);
    R.add(p);
    // 窗带冷蓝补光：原两侧 2 盏合并为 1 盏（偏向默认相机可见的后窗带）
    const pw = new THREE.PointLight(0x8fa8c0, 85, 55, 2);
    pw.position.set(0, 7.2, -14.5);
    R.add(pw);

    const spots = [
      // 主光 A：暖白前右（相机默认侧；强度实测校准：沙色涂装爆白 <6%，暗绿涂装仍可读）
      { pos: [9, 10.6, 7.5], tgt: [0.3, 1.0, 0.2], color: 0xffe0b0, intensity: 1500, angle: 0.40, pen: 0.4, shadow: true, halo: 1.1, cone: 0.055 },
      // 轮廓光 B：冷蓝后左（把车体从暗背景里剥出来）
      { pos: [-9.5, 10.8, -8.5], tgt: [-0.3, 1.0, -0.2], color: 0xd6e4ff, intensity: 1300, angle: 0.38, pen: 0.42, shadow: true, halo: 1.0, cone: 0.05 },
      // 补光 C：高位广角冷（提亮暗部细节，防亮涂装爆白全靠它分担）
      { pos: [3, 11.4, -11], tgt: [1.5, 0.5, 1.5], color: 0xb9cfe6, intensity: 1600, angle: 0.72, pen: 0.85, shadow: false, halo: 0.7, cone: 0.032 },
      // （原 D 门墙洗光 / E 工作台洗光已删：能量并入半球基光与自发光，降低逐光源片元开销）
    ];
    for (const s of spots) {
      const spot = new THREE.SpotLight(s.color, s.intensity, 60, s.angle, s.pen, 2);
      spot.position.set(...s.pos);
      spot.target.position.set(...s.tgt);
      if (s.shadow) {
        spot.castShadow = true;
        spot.shadow.mapSize.set(shadowRes, shadowRes);
        spot.shadow.camera.near = 3; spot.shadow.camera.far = 40;
        spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.03;
      }
      R.add(spot, spot.target);
      this._addFixture(s.pos, s.tgt, s.halo, s.cone, s.angle);
    }
    // 日光灯闪烁点光（挂 6,9.2,10 灯管下）
    this._flickerLight = new THREE.PointLight(0xdfe8f0, 55, 26, 2);
    this._flickerLight.position.set(6, 8.9, 10);
    R.add(this._flickerLight);
  }

  // 单个射灯：吊杆 + 灯体外壳 + 镜片 + 光晕 + 体积光锥
  _addFixture(pos, tgt, haloScale, coneOpacity, angle) {
    const g = new THREE.Group();
    g.position.set(...pos);
    const dir = new THREE.Vector3().subVectors(new THREE.Vector3(...tgt), g.position).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    this.root.add(g);
    // 吊杆（到 11.45 檩条高度）
    const stemLen = 11.45 - pos[1];
    if (stemLen > 0.1) {
      this._addParts(this.root, [{ x: pos[0], y: (11.45 + pos[1]) / 2, z: pos[2], w: 0.07, h: stemLen, d: 0.07 }], this.matSteelDark);
    }
    // 灯体（沿 -Y）
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.52, 14), this.matSteelDark);
    housing.castShadow = false;
    g.add(housing);
    // 散热鳍片
    this._addParts(g, [
      { x: 0, y: 0.18, z: 0, w: 0.5, h: 0.035, d: 0.5 }, { x: 0, y: 0.28, z: 0, w: 0.46, h: 0.035, d: 0.46 },
    ], this.matSteelDark);
    // U 型支架
    this._addParts(g, [
      { x: 0.2, y: 0.1, z: 0, w: 0.05, h: 0.5, d: 0.05 }, { x: -0.2, y: 0.1, z: 0, w: 0.05, h: 0.5, d: 0.05 },
      { x: 0, y: 0.35, z: 0, w: 0.45, h: 0.05, d: 0.05 },
    ], this.matSteelDark);
    // 镜片
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 18), this.matLens);
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.27;
    g.add(lens);
    // 光晕
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTex, color: 0xfff0d0, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(haloScale, haloScale, 1);
    halo.position.y = -0.3;
    g.add(halo);
    // 体积光锥（顶点在灯口，张开到地面）
    const floorT = pos[1] / Math.max(0.2, -dir.y);
    const len = Math.min(floorT - 0.15, 34);
    const baseR = Math.tan(angle * 0.82) * len;
    const coneGeo = new THREE.CylinderGeometry(0.06, baseR, len, 20, 1, true);
    coneGeo.translate(0, -len / 2, 0);
    const coneMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xfff0d2) },
        uOpacity: { value: coneOpacity }, uH: { value: len },
      },
      vertexShader: `varying float vY; uniform float uH;
        void main(){ vY = clamp(position.y / uH, -1.0, 0.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vY; uniform vec3 uColor; uniform float uOpacity;
        void main(){ float a = pow(clamp(1.0 + vY, 0.0, 1.0), 1.7) * uOpacity;
        gl_FragColor = vec4(uColor, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    // 光锥归入特效组（与灯具同位姿；PMREM 生成环境贴图时整体隐藏防脏）
    if (!this._fxGroup) { this._fxGroup = new THREE.Group(); this.root.add(this._fxGroup); }
    const coneHolder = new THREE.Group();
    coneHolder.position.copy(g.position);
    coneHolder.quaternion.copy(g.quaternion);
    coneHolder.add(cone);
    this._fxGroup.add(coneHolder);
  }

  // ── 浮尘粒子（体积光里缓缓漂移） ──
  _buildAtmosphere() {
    if (!this._fxGroup) { this._fxGroup = new THREE.Group(); this.root.add(this._fxGroup); }
    const N = 300;
    const pos = new Float32Array(N * 3);
    this._dustVel = new Float32Array(N * 3);
    const rand = rng(8888);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rand() - 0.5) * 30;
      pos[i * 3 + 1] = 0.3 + rand() * 10;
      pos[i * 3 + 2] = (rand() - 0.5) * 22;
      this._dustVel[i * 3] = (rand() - 0.5) * 0.12;
      this._dustVel[i * 3 + 1] = -0.02 - rand() * 0.05;
      this._dustVel[i * 3 + 2] = (rand() - 0.5) * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._dustGeo = geo;
    const mat = new THREE.PointsMaterial({
      map: this._dotTex, color: 0xffe8c8, size: 0.085, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this._fxGroup.add(pts);
  }

  // ── 环境贴图：从厂房自身生成 PMREM（金属/漆面反射 + 微弱 IBL） ──
  _buildEnv(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const fxVisible = this._fxGroup ? this._fxGroup.visible : true;
    if (this._fxGroup) this._fxGroup.visible = false;
    // 相机在原点会被地面穿面 → 整体下移 2m 使采样点位于地面上方
    const parent = this.root.parent;
    const tmp = new THREE.Scene();
    parent.remove(this.root);
    tmp.add(this.root);
    this.root.position.y = -2;
    this.root.updateMatrixWorld(true);
    this._envRT = pmrem.fromScene(tmp, 0.04, 0.5, 120);
    this.root.position.y = 0;
    tmp.remove(this.root);
    parent.add(this.root);
    if (this._fxGroup) this._fxGroup.visible = fxVisible;
    pmrem.dispose();
  }

  // ───────────────────────── 对外接口 ─────────────────────────

  show() {
    this.visible = true;
    this.root.visible = true;
    this.scene.environment = this._envRT ? this._envRT.texture : null;
    this.scene.environmentIntensity = 0.3;
  }

  hide() {
    this.visible = false;
    this.root.visible = false;
    this.scene.environment = null;
    this.scene.environmentIntensity = 1;
  }

  update(dt) {
    if (!this.visible) return;
    this._t += dt;
    const t = this._t;
    // 排风扇
    for (const f of this._fans) f.group.rotation.z += f.speed * dt;
    // 吊物微摆
    if (this._sway) {
      this._sway.rotation.x = Math.sin(t * 0.55) * 0.02;
      this._sway.rotation.z = Math.cos(t * 0.42) * 0.026;
    }
    // 警灯呼吸
    if (this.matBeacon) this.matBeacon.emissiveIntensity = 0.25 + 1.5 * Math.max(0, Math.sin(t * 2.4));
    // 日光灯闪烁（随机掉闪）
    if (this._tubeMat) {
      this._flickerT = (this._flickerT || 0) - dt;
      if (this._flickerT <= 0) {
        this._flickerT = 0.08 + Math.random() * 0.4;
        this._flickerOn = Math.random() > 0.22;
      }
      const k = this._flickerOn ? 1 : 0.25;
      this._tubeMat.emissiveIntensity = 2.1 * k;
      if (this._flickerLight) this._flickerLight.intensity = 55 * k;
    }
    // 浮尘
    if (this._dustGeo) {
      const p = this._dustGeo.attributes.position;
      const a = p.array;
      for (let i = 0; i < a.length; i += 3) {
        a[i] += this._dustVel[i] * dt + Math.sin(t * 0.5 + i) * 0.0006;
        a[i + 1] += this._dustVel[i + 1] * dt;
        a[i + 2] += this._dustVel[i + 2] * dt;
        if (a[i + 1] < 0.2) { a[i + 1] = 9.5 + Math.random(); a[i] = (Math.random() - 0.5) * 30; a[i + 2] = (Math.random() - 0.5) * 22; }
        if (a[i] > 16) a[i] = -16; else if (a[i] < -16) a[i] = 16;
        if (a[i + 2] > 12) a[i + 2] = -12; else if (a[i + 2] < -12) a[i + 2] = 12;
      }
      p.needsUpdate = true;
    }
  }

  dispose() {
    this.hide();
    this.scene.remove(this.root);
    this.root.traverse((n) => {
      if (n.geometry) n.geometry.dispose();
      const mats = Array.isArray(n.material) ? n.material : (n.material ? [n.material] : []);
      for (const m of mats) {
        for (const key of ['map', 'roughnessMap', 'bumpMap', 'emissiveMap']) {
          if (m[key]) m[key].dispose();
        }
        m.dispose();
      }
    });
    if (this._envRT) this._envRT.dispose();
  }
}
