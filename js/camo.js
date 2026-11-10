// ═══ 程序化迷彩生成器：为素模（无贴图白模）坦克生成可平铺迷彩 CanvasTexture ═══
// KF51：三色数码像素迷彩（参照实车展示照片：灰绿底 + 浅黄绿大连片 + 深蓝灰小碎块，
// 方格阶梯硬边、无描边，含 5~10% 孤立单格噪声，展车级轻度做旧）
// 技术要点：模型 UV 为 U[0,1]×V[-1,0] 平铺（部分件 U×4）→ 噪声场用包裹格采样，天然无缝平铺。

import * as THREE from 'three';

// ── 迷彩方案表 ──
const SCHEMES = {
  kf51: {
    style: 'pixel',                        // 数码像素迷彩
    // 色板依据实车照片（ Eurosatory 展车）：浅暖灰底 + 青柠黄绿 + 炭黑藏青，单噪声场三带切分
    // 使深色块与黄绿块天然相邻咬合（参考图规律：深色极少孤立于底色中央）
    singleField: true,                     // 单噪声场三带：顶带=黄绿 / 底带=深色 / 中带=底色
    base: '#8b8a7c',                       // 浅暖灰（降饱和适配室外画风）
    layers: [
      { color: '#9ba656', coverage: 0.27, band: 'top', cluster: 8, clusterY: 4 },     // 黄绿（降饱和，晴天下不跳）
      { color: '#2c3038', coverage: 0.25, band: 'bottom', cluster: 11, clusterY: 5.5 }, // 炭黑藏青
    ],
    cell: 20,                              // 像素格 ≈20cm（1~4 格合并成矩形条块）
    specks: 0,
    octave2: 0.45,                         // 高频比重加大：边界咬合更碎，避免水平分层感
    cellJitter: 6,                         // 逐格明度微抖（漆面喷涂不均）
    panelLine: 'rgba(50,50,44,0.12)',      // 面板缝线
    grime: 'rgba(84,80,66,0.22)',          // 蒙尘（加强真实感）
    grimeStreaks: 34,
    noiseDots: 3000,
    dirtVeil: 110,                         // 泥点喷溅罩数量
    envMapIntensity: 0.5,
    roughness: 0.88,
    plain: ['Object_20'],                  // 炮管身管：素色浅暖灰，无迷彩
    plainColor: '#9c9a8d',
    matte: ['Object_17', 'Object_14'],     // 遥控武器站 + 巡飞弹发射器：深炭灰素色
    matteColor: '#2a2c2e',
    lowerBody: ['Object_10', 'Object_5', 'Object_24', 'Object_25', 'Object_26', 'Object_27', 'Object_28'],
    // ↑ 行动装置+裙板合并网格：负重轮素色浅暖灰（实车轮组无迷彩，静止轮不穿帮）
    lowerColor: '#9a9789',
    seed: 51051,
  },
  leclerc: {
    style: 'blob',                         // 北约三色圆缘迷彩（大块圆润连片斑块）
    // 色板按参考模型 amx-56_leclrec_main_battle_tank.glb 的渲染观感对齐（同灯光并排比对采样）：
    // 绿=黄橄榄（比 NATO 指引色标更暖）、棕=棕褐（收掉橙相）、黑=暖调近黑；
    // 参考模型图集烘焙极暗（中位亮度 22/255）不能直接平铺使用，只取其色彩关系与斑块尺度
    base: '#57683e',                       // 黄橄榄绿
    layers: [
      { color: '#7d5c40', coverage: 0.22 }, // 棕褐
      { color: '#383730', coverage: 0.21 }, // 暖调近黑
    ],
    specks: 0,
    fieldCellX: 260,                       // 主噪声格跨度：≈4 格横贯 1024 → 斑块 ≈2~3m（避免整面一色）
    fieldCellY: 235,
    fieldOct2: 0.34,                       // 二倍频：边界波浪/凹湾
    fieldOct3: 0.10,                       // 三倍频：少量小碎湾（权重小 → 小岛稀少）
    dirtVeil: 90,                          // 泥点喷溅罩数量
    envMapIntensity: 0.5,
    roughness: 0.88,
    panelLine: 'rgba(40,44,40,0.12)',      // 面板缝线
    grime: 'rgba(78,72,58,0.20)',          // 蒙尘
    noiseDots: 2600,
    plain: ['Object_6', 'Object_8'],       // 车底/下前下甲板：阴影区深灰绿素色
    plainColor: '#4a4e48',
    matte: ['Object_5', 'Object_7', 'Object_9'],  // 同轴机枪 + 裙板内侧壁（艏艉履带口可见）：哑光深炭灰
    matteColor: '#2a2c2e',
    rubberSplit: ['Object_26', 'Object_27'], // 侧裙整体网格 = 刚性裙板+橡胶遮尘片合体：按高度拆分
    rubberSplitZ: 0.74,                      // 编著空间(Z-up)分割高度：以下为遮尘片
    rubberColor: '#2b2a26',                  // 遮尘片：深灰黑橡胶，无迷彩
    rubberDust: true,                        // 遮尘片近地面：叠土色蒙尘/泥点/尘痕
    uvMeters: 10.2,                          // 盒式投影世界尺寸：1px≈1cm，全车图案连续
    clearNormal: true,                       // 清除素模法线贴图：铆钉/格栅/舱盖浮雕在迷彩下呈结构性纹路
    // 迷彩覆盖其余网格：车体 11/12/13/14、侧裙 26/27、前挡泥板条 17/19、动力舱顶 20、
    // 翼子板储物箱 10、炮塔 22/23/24/25、尾篮 16、炮管/炮闩/炮口 15/21/4（参考图炮管带绿/深灰大段迷彩）；
    // 履带+负重轮（2/3）由 tank.js trackNames 走深色橡胶处理
    seed: 20260907,
  },
};

// 确定性随机（mulberry32）
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 包裹式值噪声场（n×n 格；cluster/clusterY 为横/纵簇尺度（格），支持各向异性；取模 → 平铺无缝）
function noiseField(n, cluster, rand, clusterY) {
  const cy = clusterY || cluster;
  const Lx = Math.max(2, Math.round(n / cluster));
  const Ly = Math.max(2, Math.round(n / cy));
  const lat = new Float32Array(Lx * Ly);
  for (let i = 0; i < Lx * Ly; i++) lat[i] = rand();
  const at = (i, j) => lat[(((j % Ly) + Ly) % Ly) * Lx + (((i % Lx) + Lx) % Lx)];
  const field = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const fy = j / cy, y0 = Math.floor(fy), ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let i = 0; i < n; i++) {
      const fx = i / cluster, x0 = Math.floor(fx), tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      field[j * n + i] =
        (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) +
        (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
    }
  }
  return field;
}

// ── 数码像素迷彩 ──
function paintPixelCamo(ctx, S, sc, rand) {
  const cell = sc.cell || 14;
  const n = Math.ceil(S / cell);

  const assign = new Int8Array(n * n);   // 0=底色 1..=层
  const mixField = (cluster, clusterY) => {
    const f1 = noiseField(n, cluster || 6, rand, clusterY);
    const o2 = sc.octave2 ?? 0;
    if (o2 <= 0) return f1;
    const f2 = noiseField(n, Math.max(2, cluster * 0.3), rand, Math.max(2, (clusterY || cluster) * 0.3));
    const field = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) field[k] = f1[k] * (1 - o2) + f2[k] * o2;
    return field;
  };

  if (sc.singleField) {
    // 单噪声场三带切分：顶带=层1（黄绿）、底带=层2（深色）、中带=底色。
    // 同一场的两端阈值 → 黄绿与深色天然沿等值线相邻咬合（参考图棋盘规律）
    const field = mixField(sc.layers[0].cluster || 9, sc.layers[0].clusterY);
    const sorted = Float32Array.from(field).sort();
    const gThr = sorted[Math.min(sorted.length - 1, Math.floor((1 - sc.layers[0].coverage) * sorted.length))];
    const dThr = sorted[Math.min(sorted.length - 1, Math.floor(sc.layers[1].coverage * sorted.length))];
    for (let k = 0; k < n * n; k++) {
      if (field[k] >= gThr) assign[k] = 1;
      else if (field[k] <= dThr) assign[k] = 2;
    }
  } else {
    sc.layers.forEach((ly, li) => {
      const field = mixField(ly.cluster || 6);
      const sorted = Float32Array.from(field).sort();
      const thr = sorted[Math.min(sorted.length - 1, Math.floor((1 - ly.coverage) * sorted.length))];
      for (let k = 0; k < n * n; k++) if (assign[k] === 0 && field[k] >= thr) assign[k] = li + 1;
    });
    // 孤立单格噪声（可选）
    const specks = sc.specks ?? 0;
    if (specks > 0) {
      for (let k = 0; k < n * n; k++) {
        if (assign[k] === 0 && rand() < specks) assign[k] = 1 + Math.floor(rand() * sc.layers.length);
      }
    }
  }

  // 绘制（硬边方格 + 逐格明度抖动模拟喷涂不均）
  const jit = sc.cellJitter ?? 0;
  ctx.fillStyle = sc.base;
  ctx.fillRect(0, 0, S, S);
  const baseC = parseInt(sc.base.slice(1), 16);
  const cols = sc.layers.map(ly => {
    const c = parseInt(ly.color.slice(1), 16);
    return { r: c >> 16, g: (c >> 8) & 255, b: c & 255 };
  });
  const bC = { r: baseC >> 16, g: (baseC >> 8) & 255, b: baseC & 255 };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = assign[j * n + i];
      const c = a === 0 ? bC : cols[a - 1];
      const jv = jit > 0 ? Math.round((rand() - 0.5) * 2 * jit) : 0;
      if (a !== 0 || jit > 0) {
        ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, c.r + jv))},${Math.max(0, Math.min(255, c.g + jv))},${Math.max(0, Math.min(255, c.b + jv))})`;
        ctx.fillRect(i * cell, j * cell, cell, cell);
      }
    }
  }

  // 泥点喷溅罩（行军/作战痕迹：半透明土色碎斑弱化整体鲜度）
  ctx.fillStyle = 'rgba(76,72,56,0.15)';
  for (let i = 0; i < (sc.dirtVeil || 70); i++) {
    drawWrapped(ctx, S, () => {
      patchPath(ctx, rand() * S, rand() * S, rand, 10 + rand() * 34);
      ctx.fill();
    });
  }
}

// 颜色微抖动（明度 ±amt）
function jitterColor(hex, rand, amt = 14) {
  const n = parseInt(hex.slice(1), 16);
  const j = () => Math.round((rand() - 0.5) * 2 * amt);
  const r = Math.max(0, Math.min(255, (n >> 16) + j()));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + j()));
  const b = Math.max(0, Math.min(255, (n & 255) + j()));
  return `rgb(${r},${g},${b})`;
}

// 角状碎裂斑块路径（随机行走折线多边形）—— 供 splinter 风格备用
function patchPath(ctx, x, y, rand, size) {
  const n = 5 + Math.floor(rand() * 4);
  let ang = rand() * Math.PI * 2;
  const pts = [[x, y]];
  let cx = x, cy = y;
  for (let i = 1; i < n; i++) {
    ang += (rand() - 0.5) * 2.4;
    const step = size * (0.5 + rand() * 0.8);
    cx += Math.cos(ang) * step;
    cy += Math.sin(ang) * step * 0.7;
    pts.push([cx, cy]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// 周期化绘制：3×3 偏移重画，保证跨边缘无缝平铺
function drawWrapped(ctx, size, drawFn) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      ctx.save();
      ctx.translate(ox * size, oy * size);
      drawFn();
      ctx.restore();
    }
  }
}

// ── 北约圆缘迷彩（形态参照豹2A4 烘焙贴图：色块特大、连片咬合、大波浪圆缘）──
// 生成原理：多倍频包裹值噪声场按分位数切成「深灰/绿底/棕」三带——
// 三色来自同一连续场的低/中/高三段，天然大块连片、互不覆盖、边界为平滑等值线（无破碎感）。
// 场参数（方案可配）：fieldCellX/Y 为主倍频格跨度(px，斑块基准尺度)，fieldOct2/Oct3 为细节倍频权重。
function paintBlobCamo(ctx, S, sc, rand) {
  const n = S;
  const cellX = sc.fieldCellX ?? 340;        // 主格跨度：≈3 格横贯贴图 → 斑块 2.5~4m
  const cellY = sc.fieldCellY ?? 300;
  const o2 = sc.fieldOct2 ?? 0.34;           // 二倍频：凹湾/波浪细节
  const o3 = sc.fieldOct3 ?? 0.12;           // 三倍频：少量局部碎湾（权重小→小岛稀少）
  const w1 = 1 - o2 - o3;
  const f1 = noiseField(n, cellX, rand, cellY);
  const f2 = noiseField(n, cellX / 2.3, rand, cellY / 2.3);
  const f3 = noiseField(n, cellX / 5, rand, cellY / 5);
  const field = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) field[k] = f1[k] * w1 + f2[k] * o2 + f3[k] * o3;

  // 分位数阈值：低带=层2（深灰）、高带=层1（棕）、中带=底色绿
  const sorted = Float32Array.from(field).sort();
  const quantile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const covB = sc.layers[0].coverage ?? 0.27;
  const covD = sc.layers[1].coverage ?? 0.24;
  const thrHi = quantile(1 - covB);
  const thrLo = quantile(covD);
  const parse = (hex) => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const cBase = parse(sc.base), cB = parse(sc.layers[0].color), cD = parse(sc.layers[1].color);

  // 逐像素填色（ImageData 直写；±4 明度微抖模拟漆面喷涂不均）
  // 抖动用滚动 xorshift32 白噪声——乘法哈希取模会留下 ~12px 周期的斜向锯齿波纹（贴近看呈鳞片状）
  const img = ctx.createImageData(n, n);
  const d = img.data;
  let k = 0;
  let h = (sc.seed ^ 0x9e3779b9) >>> 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++, k++) {
      const v = field[k];
      const c = v >= thrHi ? cB : (v <= thrLo ? cD : cBase);
      h ^= h << 13; h >>>= 0;
      h ^= h >>> 17;
      h ^= h << 5; h >>>= 0;
      const j = (h >>> 27) % 9 - 4;
      d[k * 4] = Math.max(0, Math.min(255, c[0] + j));
      d[k * 4 + 1] = Math.max(0, Math.min(255, c[1] + j));
      d[k * 4 + 2] = Math.max(0, Math.min(255, c[2] + j));
      d[k * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // 泥点喷溅罩（半透明土色碎斑弱化整体鲜度）
  ctx.fillStyle = 'rgba(76,72,56,0.15)';
  for (let i = 0; i < (sc.dirtVeil || 70); i++) {
    drawWrapped(ctx, S, () => {
      patchPath(ctx, rand() * S, rand() * S, rand, 10 + rand() * 34);
      ctx.fill();
    });
  }
}

// ── 角状碎裂迷彩（splinter 风格，备用路径）──
function paintSplinterCamo(ctx, S, sc, rand) {
  ctx.fillStyle = sc.base;
  ctx.fillRect(0, 0, S, S);
  const scale = sc.patchScale || 1;
  for (const p of sc.patches) {
    for (let i = 0; i < p.count; i++) {
      const x = rand() * S, y = rand() * S;
      const size = (i % 3 === 0 ? 150 + rand() * 140 : 50 + rand() * 90) * scale;
      const col = jitterColor(p.color, rand, 8);
      drawWrapped(ctx, S, () => {
        patchPath(ctx, x, y, rand, size);
        ctx.fillStyle = col;
        ctx.fill();
        const n = parseInt(p.color.slice(1), 16);
        ctx.strokeStyle = `rgba(${(n >> 16) * 0.55 | 0},${((n >> 8) & 255) * 0.55 | 0},${(n & 255) * 0.55 | 0},0.55)`;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  }
  // 面板缝线 + 流挂
  ctx.strokeStyle = sc.panelLine || 'rgba(30,30,26,0.2)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 12; i++) {
    const x = rand() * S;
    drawWrapped(ctx, S, () => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rand() - 0.5) * 40, S); ctx.stroke(); });
  }
  for (let i = 0; i < 8; i++) {
    const y = rand() * S;
    drawWrapped(ctx, S, () => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + (rand() - 0.5) * 40); ctx.stroke(); });
  }
  ctx.fillStyle = sc.grime || 'rgba(70,60,40,0.15)';
  for (let i = 0; i < 50; i++) {
    drawWrapped(ctx, S, () => ctx.fillRect(rand() * S, rand() * S * 0.8, 3 + rand() * 12, 60 + rand() * 240));
  }
}

// ── 迷彩贴图生成（一次生成，缓存复用）──
const _cache = new Map();
export function getCamoTexture(schemeKey) {
  if (_cache.has(schemeKey)) return _cache.get(schemeKey);
  const sc = SCHEMES[schemeKey];
  if (!sc) return null;
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(sc.seed);

  if (sc.style === 'pixel') paintPixelCamo(ctx, S, sc, rand);
  else if (sc.style === 'blob') paintBlobCamo(ctx, S, sc, rand);
  else paintSplinterCamo(ctx, S, sc, rand);

  // 缝线（极淡）+ 细颗粒（低强度做旧）
  if (sc.panelLine) {
    ctx.strokeStyle = sc.panelLine;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      const x = rand() * S;
      drawWrapped(ctx, S, () => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rand() - 0.5) * 30, S); ctx.stroke(); });
    }
    for (let i = 0; i < 6; i++) {
      const y = rand() * S;
      drawWrapped(ctx, S, () => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + (rand() - 0.5) * 30); ctx.stroke(); });
    }
  }
  if (sc.grime) {
    ctx.fillStyle = sc.grime;
    for (let i = 0; i < 26; i++) {
      drawWrapped(ctx, S, () => ctx.fillRect(rand() * S, rand() * S * 0.7, 3 + rand() * 10, 50 + rand() * 200));
    }
  }
  const noiseN = sc.noiseDots || 1800;
  for (let i = 0; i < noiseN; i++) {
    const a = 0.03 + rand() * 0.04;
    ctx.fillStyle = rand() > 0.5 ? `rgba(20,20,14,${a})` : `rgba(240,240,225,${a})`;
    ctx.fillRect(rand() * S, rand() * S, 1.6, 1.6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  _cache.set(schemeKey, tex);
  return tex;
}

// ── 素色蒙尘贴图（行动装置/裙板：负重轮区域无迷彩图案，浅暖灰+轻路面灰）──
const _dustCache = new Map();
export function getDustTexture(schemeKey) {
  if (_dustCache.has(schemeKey)) return _dustCache.get(schemeKey);
  const sc = SCHEMES[schemeKey];
  if (!sc) return null;
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32((sc.seed || 1) ^ 0x9e37);

  const base = sc.lowerColor || '#9a9789';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  // 轻路面灰土斑（浅暖灰家族，参考：展车仅下缘轻尘）
  const dust = ['#a8a494', '#8f8c7e', '#b0ac9c'];
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = dust[Math.floor(rand() * dust.length)];
    ctx.globalAlpha = 0.08 + rand() * 0.16;
    const w = 8 + rand() * 60, h = 8 + rand() * 60;
    drawWrapped(ctx, S, () => ctx.fillRect(rand() * S, rand() * S, w, h));
  }
  ctx.globalAlpha = 1;
  // 竖向尘痕（负重轮旋转的动态模糊暗示：条痕略重略长）
  ctx.fillStyle = 'rgba(104,102,88,0.22)';
  for (let i = 0; i < 70; i++) {
    drawWrapped(ctx, S, () => ctx.fillRect(rand() * S, rand() * S * 0.5, 2 + rand() * 7, 60 + rand() * 240));
  }
  // 细颗粒
  for (let i = 0; i < 2600; i++) {
    const a = 0.04 + rand() * 0.07;
    ctx.fillStyle = rand() > 0.5 ? `rgba(60,58,48,${a})` : `rgba(190,188,170,${a})`;
    ctx.fillRect(rand() * S, rand() * S, 1.6, 1.6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  _dustCache.set(schemeKey, tex);
  return tex;
}

// ── 三向盒式 UV 重映射：让迷彩跨部件连续（实车图案从车体侧流上炮塔侧，不受部件 UV 影响）──
// 每个三角形按法线主轴选投影面（X 面→(y,z) / Y 面→(x,z) / Z 面→(x,y)），以编著空间世界坐标
// 除以 uvMeters（贴图对应的世界米数，1px≈1cm → 10.2m）生成 UV；贴图无缝平铺 → 全车同一连续图案场。
// 炮塔/火炮旋转时图案粘在自身表面上（UV 烘在顶点里），仅在座圈处断开（视线不可见）。
function boxProjectUVs(mesh, uvMeters) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index;
  if (!pos || !nor) return;
  const inv = 1 / uvMeters;
  const triCount = (idx ? idx.count : pos.count) / 3;
  const uv = new Float32Array(pos.count * 2);
  for (let t = 0; t < triCount; t++) {
    const vi = [
      idx ? idx.getX(t * 3) : t * 3,
      idx ? idx.getX(t * 3 + 1) : t * 3 + 1,
      idx ? idx.getX(t * 3 + 2) : t * 3 + 2,
    ];
    const ax = Math.abs(nor.getX(vi[0])) + Math.abs(nor.getX(vi[1])) + Math.abs(nor.getX(vi[2]));
    const ay = Math.abs(nor.getY(vi[0])) + Math.abs(nor.getY(vi[1])) + Math.abs(nor.getY(vi[2]));
    const az = Math.abs(nor.getZ(vi[0])) + Math.abs(nor.getZ(vi[1])) + Math.abs(nor.getZ(vi[2]));
    for (const v of vi) {
      if (ax >= ay && ax >= az) {
        uv[v * 2] = pos.getY(v) * inv; uv[v * 2 + 1] = pos.getZ(v) * inv;
      } else if (ay >= az) {
        uv[v * 2] = pos.getX(v) * inv; uv[v * 2 + 1] = pos.getZ(v) * inv;
      } else {
        uv[v * 2] = pos.getX(v) * inv; uv[v * 2 + 1] = pos.getY(v) * inv;
      }
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ── 橡胶遮尘片蒙尘贴图（深灰黑胶底 + 近地面土色蒙尘/泥点/竖向尘痕）──
const _rubberCache = new Map();
export function getRubberDustTexture(sc) {
  const key = sc.seed || 1;
  if (_rubberCache.has(key)) return _rubberCache.get(key);
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32((sc.seed || 1) ^ 0x51ce);
  ctx.fillStyle = sc.rubberColor || '#2b2a26';
  ctx.fillRect(0, 0, S, S);
  // 土色蒙尘斑（近地部件：土黄/土棕/浮尘）
  const dust = ['#6e6350', '#7a6d55', '#5c5342', '#84765c'];
  for (let i = 0; i < 150; i++) {
    ctx.fillStyle = dust[Math.floor(rand() * dust.length)];
    ctx.globalAlpha = 0.08 + rand() * 0.22;
    drawWrapped(ctx, S, () => ctx.fillRect(rand() * S, rand() * S, 6 + rand() * 46, 6 + rand() * 46));
  }
  // 泥点喷溅
  ctx.fillStyle = 'rgba(96,82,60,0.32)';
  for (let i = 0; i < 60; i++) {
    drawWrapped(ctx, S, () => {
      patchPath(ctx, rand() * S, rand() * S, rand, 3 + rand() * 14);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  // 竖向尘痕（行驶扬尘下挂）
  ctx.fillStyle = 'rgba(96,86,66,0.20)';
  for (let i = 0; i < 46; i++) {
    drawWrapped(ctx, S, () => ctx.fillRect(rand() * S, rand() * S * 0.4, 2 + rand() * 6, 50 + rand() * 180));
  }
  // 细颗粒
  for (let i = 0; i < 2200; i++) {
    const a = 0.05 + rand() * 0.09;
    ctx.fillStyle = rand() > 0.5 ? `rgba(12,12,10,${a})` : `rgba(150,140,116,${a})`;
    ctx.fillRect(rand() * S, rand() * S, 1.6, 1.6);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  _rubberCache.set(key, tex);
  return tex;
}

// ── 给坦克模型贴装迷彩（tank.js 构建时调用；材质已按网格独立克隆）──
// trackNames：履带（深色橡胶）；方案可带 plain:[]（纯底色件）、matte:[]（哑光黑总成）、
// lowerBody:[]（行动装置/侧裙：蒙尘纯色无迷彩图案，负重轮不转故不给图案）
export function applyCamo(model, schemeKey, trackNames = []) {
  const sc = SCHEMES[schemeKey];
  const tex = getCamoTexture(schemeKey);
  if (!tex || !sc) return;
  const skip = new Set(trackNames || []);
  const plain = new Set(sc.plain || []);
  const matte = new Set(sc.matte || []);
  const lower = new Set(sc.lowerBody || []);
  const dustTex = lower.size ? getDustTexture(schemeKey) : null;
  const splitSet = new Set(sc.rubberSplit || []);
  const splitTargets = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat) return;
    if (skip.has(o.name)) {
      // 履带：深钢色带锈棕调（实车 #2E2A26~#4A3A30），无贴图
      mat.color.set(sc.trackColor || '#2e2d29');
      mat.metalness = 0.35;
      mat.roughness = 0.85;
    } else if (lower.has(o.name) && dustTex) {
      // 行动装置/裙板：素色浅暖灰+轻尘，无迷彩图案（负重轮素色，实车如此）
      mat.map = dustTex;
      mat.color.set('#ffffff');
      mat.metalness = 0.12;
      mat.roughness = 0.9;
      mat.envMapIntensity = 0.5;
    } else if (plain.has(o.name)) {
      // 纯底色件（炮管身管等）：实车炮管无迷彩
      mat.color.set(sc.plainColor || sc.base);
      mat.metalness = 0.15;
      mat.roughness = 0.88;
      mat.envMapIntensity = 0.5;
    } else if (matte.has(o.name)) {
      // 深炭灰总成（车顶遥控武器站/巡飞弹发射器，实车素色不参与迷彩）
      mat.color.set(sc.matteColor || '#2a2c2e');
      mat.metalness = 0.25;
      mat.roughness = 0.95;
    } else {
      if (sc.uvMeters) boxProjectUVs(o, sc.uvMeters);   // 盒式投影：全车图案连续（跨车体/炮塔边界）
      if (sc.clearNormal) {
        // 素模烘焙的法线贴图带铆钉/格栅/舱盖等结构浮雕，灯光下会透出结构性纹路；
        // 纯迷彩需求（leclerc）下清除全部二级贴图
        mat.normalMap = null;
        mat.aoMap = null;
        mat.lightMap = null;
        mat.bumpMap = null;
        mat.emissiveMap = null;
        if (mat.normalScale) mat.normalScale.set(1, 1);
      }
      mat.map = tex;                 // 共享缓存贴图；Material.dispose 不释放 texture，安全
      mat.color.set('#ffffff');
      mat.metalness = 0.15;          // 漆面钢装甲
      mat.roughness = sc.roughness ?? 0.9;
      mat.envMapIntensity = sc.envMapIntensity ?? 0.6;   // 车库强环境光是迷彩洗白主因，压低
      if (splitSet.has(o.name)) splitTargets.push(o);    // 上半照常迷彩，traverse 后拆出遮尘片
    }
    mat.needsUpdate = true;
  });
  for (const mesh of splitTargets) splitRubberPart(mesh, sc);
}

// 拆分合并网格下半部为橡胶遮尘片（leclerc 侧裙 = 刚性板+遮尘片合体导出）。
// 按编著空间 Z-up 高度（rubberSplitZ，分割线取面板接缝）把质心低于阈值的三角形
// 重建为新网格挂到同父节点，材质为深灰黑橡胶无贴图；上半保留原迷彩。
function splitRubberPart(mesh, sc) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, idx = geo.index;
  if (!idx || !uv || !nor) return;
  const thr = sc.rubberSplitZ ?? 0.74;
  const triCount = idx.count / 3;
  const loPos = [], loNor = [], loUv = [];
  for (let t = 0; t < triCount; t++) {
    const a = idx.getX(t * 3), b = idx.getX(t * 3 + 1), c = idx.getX(t * 3 + 2);
    const zc = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    if (zc >= thr) continue;
    for (const vi of [a, b, c]) {
      loPos.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
      loNor.push(nor.getX(vi), nor.getY(vi), nor.getZ(vi));
      loUv.push(uv.getX(vi), uv.getY(vi));
    }
  }
  if (!loPos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(loPos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(loNor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(loUv, 2));
  const mat = new THREE.MeshStandardMaterial();
  if (sc.rubberDust !== false) {
    mat.map = getRubberDustTexture(sc);        // 近地面：土色蒙尘+泥点+尘痕
    mat.color.set('#ffffff');
  } else {
    mat.color.set(sc.rubberColor || '#2b2a26');
  }
  mat.roughness = 0.95;
  mat.metalness = 0.05;
  mat.envMapIntensity = 0.4;
  const m = new THREE.Mesh(g, mat);
  m.position.copy(mesh.position);
  m.quaternion.copy(mesh.quaternion);
  m.scale.copy(mesh.scale);
  m.name = mesh.name + '_rubber';
  m.castShadow = mesh.castShadow;
  m.receiveShadow = mesh.receiveShadow;
  mesh.parent.add(m);
}
