// ═══ 狙击镜分划模板（六国风格，viewBox 1000×1000，中心 500,500） ═══
// 双层描边机制（零 filter）：gs-out = 底衬（保证亮背景可见），gs-ink = 主线
// 风格类 gs-ret-xx 挂在 #gs-reticle 上，颜色由 css/style.css 覆盖
// 布局约束：中心 r≈60 是装填环+就绪文字（y592），各模板大元素避让该区；
//           所有图形须落在 r<465 内（外圈遮罩 r=470）

// 双层线（底衬宽 w+1.2）
const L = (x1, y1, x2, y2, w) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="gs-out" stroke-width="${(w + 1.2).toFixed(1)}"/>` +
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="gs-ink" stroke-width="${w}"/>`;

// 双层路径
const P = (d, w) =>
  `<path d="${d}" class="gs-out" stroke-width="${(w + 1.2).toFixed(1)}"/>` +
  `<path d="${d}" class="gs-ink" stroke-width="${w}"/>`;

// 强调色双层路径（底衬 + 各国 accent 色）
const PA = (d, w) =>
  `<path d="${d}" class="gs-out" stroke-width="${(w + 1.2).toFixed(1)}"/>` +
  `<path d="${d}" class="gs-acc" stroke-width="${w}"/>`;

// 分划数字（等宽）
const T = (x, y, t, anchor = 'start', size = 12) =>
  `<text x="${x}" y="${y}" class="gs-num" text-anchor="${anchor}" style="font-size:${size}px">${t}</text>`;

// 四角 L 形取景标（x,y 为角点坐标，臂朝向中心）
const CORNER = (x, y, arm, w) => {
  const dx = x < 500 ? 1 : -1, dy = y < 500 ? 1 : -1;
  return P(`M${x + dx * arm},${y} L${x},${y} L${x},${y + dy * arm}`, w);
};

export const RETICLES = {

  // ─────────── 俄系：苏式炮队镜（原版精细化） ───────────
  // 垂直粗线（中心留空）+ 水平细线 + 人字准星 + 红点 + 密位环 + 三条测距抛物弧
  ru: () => {
    let s = '';
    // 主十字：垂直粗线上下段 + 水平细线左右段
    s += L(500, 44, 500, 252, 2.2) + L(500, 748, 500, 956, 2.2);
    s += L(44, 500, 248, 500, 1.6) + L(752, 500, 956, 500, 1.6);
    // 端帽箭头（上/下端，指示垂直基准）
    s += L(491, 57, 500, 44, 1.2) + L(509, 57, 500, 44, 1.2);
    s += L(491, 943, 500, 956, 1.2) + L(509, 943, 500, 956, 1.2);
    // 人字主准星（中心下张，苏式典型）+ 红中心点
    s += P('M500,500 L470,548 M500,500 L530,548 M500,500 L500,474', 1.2);
    s += '<circle cx="500" cy="500" r="3.2" class="gs-dot"/>';
    // 密位刻度：中心向四方各 9 格，长短交替（2/4/6/8/10 mil 长刻度带数）
    for (let i = 1; i <= 9; i++) {
      const off = 30 * i, big = i % 2 === 1;
      const hw = big ? 11 : 7, w = big ? 1.3 : 1.0;
      s += L(500 - hw, 500 - off, 500 + hw, 500 - off, w);   // 上
      s += L(500 - hw, 500 + off, 500 + hw, 500 + off, w);   // 下
      s += L(500 - off, 500 - hw, 500 - off, 500 + hw, w);   // 左
      s += L(500 + off, 500 - hw, 500 + off, 500 + hw, w);   // 右
      if (big) {
        const n = i + 1;
        s += T(500 + hw + 5, 500 - off + 4, n);
        s += T(500 - hw - 5, 500 + off + 4, n, 'end');
        s += T(500 - off, 500 - hw - 5, n, 'middle');
        s += T(500 + off, 500 - hw - 5, n, 'middle');
      }
    }
    // 三条下弧测距曲线 + 首弧端标线 + 弧线 mil 标注
    const arcs = ['M380,628 Q500,616 620,628', 'M400,656 Q500,646 600,656', 'M420,684 Q500,676 580,684'];
    arcs.forEach((d, i) => {
      s += `<path d="${d}" class="gs-out" stroke-width="2.6"/>`;
      s += `<path d="${d}" class="gs-ink" stroke-width="1.3"/>`;
      s += T(376 - i * 14, 632 + i * 28, (i + 1) * 2, 'end', 10);   // 弧首 mil 值（2/4/6）
    });
    s += L(380, 620, 380, 636, 1.3) + L(620, 620, 620, 636, 1.3);
    // 备用菱形瞄点 ×2 + 小圆点 ×2
    s += '<g class="gs-aux">'
      + '<path d="M440,538 L452,552 L440,566 L428,552 Z"/>'
      + '<path d="M560,538 L572,552 L560,566 L548,552 Z"/>'
      + '<circle cx="404" cy="582" r="3.5"/>'
      + '<circle cx="596" cy="582" r="3.5"/>'
      + '</g>';
    // 四角取景标（精细化新增）
    s += CORNER(217, 217, 26, 1.2) + CORNER(783, 217, 26, 1.2)
      + CORNER(217, 783, 26, 1.2) + CORNER(783, 783, 26, 1.2);
    return s;
  },

  // ─────────── 美系 M1：细十字 + 中心小十字 + 弹道距离阶梯 + 门括号 ───────────
  us: () => {
    let s = '';
    // 全幅细十字（中心让位装填环）
    s += L(500, 44, 500, 438, 1.4) + L(500, 562, 500, 956, 1.4);
    s += L(44, 500, 438, 500, 1.4) + L(562, 500, 956, 500, 1.4);
    // 中心小十字（M1 主瞄准标记，荧光绿强调）
    s += PA('M500,474 L500,526 M474,500 L526,500', 2.0);
    // 垂直下段：弹道距离阶梯（×100m，横杠宽度递减）+ 右侧数字
    const rng = [['12', 700, 36], ['16', 760, 30], ['20', 820, 24], ['24', 880, 18], ['28', 940, 12]];
    s += T(566, 668, 'RNG×100', 'start', 9);
    for (const [n, y, half] of rng) {
      s += L(500 - half, y, 500 + half, y, 1.6);
      s += T(522 + half, y + 4, n);
    }
    // 垂直上段：仰角刻度（短杠+小数字）
    for (let i = 1; i <= 3; i++) {
      const y = 500 - 120 * i - 20;
      s += L(488, y, 512, y, 1.2);
      s += T(516, y + 4, i * 4, 'start', 10);
    }
    // 水平密位刻度：±(150..390) 每 60，竖杠 + 数字（上下交替）
    for (let i = 1; i <= 4; i++) {
      const off = 60 * i + 90;                  // 150/210/270/330
      const h = i % 2 === 1 ? 12 : 8;
      s += L(500 - off, 500 - h, 500 - off, 500 + h, 1.2);
      s += L(500 + off, 500 - h, 500 + off, 500 + h, 1.2);
      const n = (i + 1) * 2;                    // 4/6/8/10 mil
      if (i % 2 === 1) {
        s += T(500 - off, 500 - h - 6, n, 'middle', 10);
        s += T(500 + off, 500 - h - 6, n, 'middle', 10);
      } else {
        s += T(500 - off, 500 + h + 12, n, 'middle', 10);
        s += T(500 + off, 500 + h + 12, n, 'middle', 10);
      }
    }
    // 提前量门括号（中心两侧 ±150，横线段+上下端竖刺）
    for (const dir of [-1, 1]) {
      const x = 500 + dir * 150;
      s += L(x, 486, x, 514, 1.6);
      s += L(x - dir * 8, 486, x, 486, 1.2) + L(x - dir * 8, 514, x, 514, 1.2);
    }
    return s;
  },

  // ─────────── 中式 99A：缺口瞄准圆环 + 十字外延 + km 阶梯 + 四角框定 ───────────
  cn: () => {
    let s = '';
    // 中心瞄准圆：r=100 四段弧（缺口正对四方，上反稳瞄观感）
    for (let k = 0; k < 4; k++) {
      const a0 = 90 * k + 14, a1 = 90 * (k + 1) - 14;   // 缺口 28°
      const rad = (a) => a * Math.PI / 180;
      const x0 = (500 + 100 * Math.cos(rad(a0))).toFixed(1), y0 = (500 + 100 * Math.sin(rad(a0))).toFixed(1);
      const x1 = (500 + 100 * Math.cos(rad(a1))).toFixed(1), y1 = (500 + 100 * Math.sin(rad(a1))).toFixed(1);
      s += `<path d="M${x0},${y0} A100,100 0 0 1 ${x1},${y1}" class="gs-out" stroke-width="2.6"/>`;
      s += `<path d="M${x0},${y0} A100,100 0 0 1 ${x1},${y1}" class="gs-ink" stroke-width="1.4"/>`;
    }
    // 十字细线（圆环外延至边缘）
    s += L(500, 44, 500, 392, 1.3) + L(500, 608, 500, 956, 1.3);
    s += L(44, 500, 392, 500, 1.3) + L(608, 500, 956, 500, 1.3);
    // 中心：小十字（红强调）+ 红点
    s += PA('M500,486 L500,514 M486,500 L514,500', 1.6);
    s += '<circle cx="500" cy="500" r="2.5" class="gs-dot"/>';
    // 圆环 45° 对角短刻度（缺口中点）
    for (let k = 0; k < 4; k++) {
      const a = (45 + 90 * k) * Math.PI / 180;
      const c = Math.cos(a), si = Math.sin(a);
      s += L((500 + 92 * c).toFixed(1), (500 + 92 * si).toFixed(1),
        (500 + 108 * c).toFixed(1), (500 + 108 * si).toFixed(1), 1.2);
    }
    // 下方距离阶梯（km）：横杠 + 红数字
    const km = [['1', 720], ['2', 790], ['3', 860], ['4', 930]];
    s += T(566, 688, 'RNG km', 'start', 9);
    for (const [n, y] of km) {
      s += L(500 - 15, y, 500 + 15, y, 1.5);
      s += `<text x="522" y="${y + 4}" class="gs-num gs-acc-t" text-anchor="start">${n}</text>`;
    }
    // 水平密位刻度：±(140..440) 每 75 短杠
    for (let i = 1; i <= 4; i++) {
      const off = 75 * i + 65;                   // 140/215/290/365
      const h = i % 2 === 1 ? 11 : 7;
      s += L(500 - off, 500 - h, 500 - off, 500 + h, 1.1);
      s += L(500 + off, 500 - h, 500 + off, 500 + h, 1.1);
      if (i % 2 === 1) {
        const n = (i + 1) * 2;
        s += T(500 - off, 500 - h - 6, n, 'middle', 10);
        s += T(500 + off, 500 - h - 6, n, 'middle', 10);
      }
    }
    // 四角目标框定括号
    s += CORNER(205, 205, 34, 2.0) + CORNER(795, 205, 34, 2.0)
      + CORNER(205, 795, 34, 2.0) + CORNER(795, 795, 34, 2.0);
    return s;
  },

  // ─────────── 英系挑战者：倒 T 主标记 + 水平密位 + 对向箭头测距 ───────────
  uk: () => {
    let s = '';
    // 水平主基准线（全幅）+ 中心下针（倒 T）
    s += L(44, 500, 956, 500, 1.8);
    s += L(500, 500, 500, 542, 2.4);
    // 中心菱形（琥珀强调，横线上的瞄准标记）
    s += PA('M500,488 L510,500 L500,512 L490,500 Z', 1.8);
    // 垂直细线（中心让位）
    s += L(500, 44, 500, 438, 1.3) + L(500, 562, 500, 956, 1.3);
    // 水平密位刻度：上下交替（±74..±444 每 74 ≈ 2mil 一格）
    for (let i = 1; i <= 6; i++) {
      const off = 74 * i;
      const h = i % 2 === 1 ? 10 : 6;
      const up = i % 2 === 1;                    // 奇数格刻度朝上，偶数朝下
      const y0 = up ? 500 - h : 500, y1 = up ? 500 : 500 + h;
      s += L(500 - off, y0, 500 - off, y1, 1.1);
      s += L(500 + off, y0, 500 + off, y1, 1.1);
      if (i % 2 === 0) {                          // 偶数格带数字（4/8/12/16/20/24 mil）
        const n = i * 4;
        s += T(500 - off, 500 + h + 12, n, 'middle', 10);
        s += T(500 + off, 500 + h + 12, n, 'middle', 10);
      }
    }
    // 下方 stadiametric 测距对向箭头（y=660 中心两侧）
    for (const dir of [-1, 1]) {
      const x0 = 500 + dir * 90, x1 = 500 + dir * 190;
      s += L(x0, 660, x1, 660, 1.4);
      s += L(x0, 660, x0 + dir * 12, 652, 1.2) + L(x0, 660, x0 + dir * 12, 668, 1.2);
    }
    s += T(500, 692, 'MIL STD', 'middle', 9);
    // 下方距离阶梯（×100m）
    const rng = [['12', 740], ['18', 800], ['24', 860], ['30', 920]];
    s += T(566, 708, 'RNG×100', 'start', 9);
    for (const [n, y] of rng) {
      s += L(488, y, 512, y, 1.5);
      s += T(518, y + 4, n);
    }
    // 上方仰角小刻度
    for (let i = 1; i <= 3; i++) {
      const y = 500 - 130 * i;
      s += L(492, y, 508, y, 1.1);
      s += T(514, y + 4, i * 4, 'start', 10);
    }
    return s;
  },

  // ─────────── 德系豹2：EMES-15 中心圆 + 提前量箭头 + 右下 Zeiss 测距弧 ───────────
  de: () => {
    let s = '';
    // 中心小圆 + 中心点
    s += '<circle cx="500" cy="500" r="16" class="gs-out" stroke-width="2.8"/>' +
      '<circle cx="500" cy="500" r="16" class="gs-ink" stroke-width="1.6"/>';
    s += '<circle cx="500" cy="500" r="2" class="gs-acc-f"/>';
    // 全幅十字（中心让位小圆）
    s += L(500, 44, 500, 438, 1.6) + L(500, 562, 500, 956, 1.6);
    s += L(44, 500, 438, 500, 1.6) + L(562, 500, 956, 500, 1.6);
    // 横向提前量箭头（向心 V，位于 ±180/±300）
    for (const dir of [-1, 1]) {
      for (const off of [180, 300]) {
        const x = 500 + dir * off;
        s += L(x, 488, x + dir * 16, 500, 1.8) + L(x, 512, x + dir * 16, 500, 1.8);
      }
    }
    // 垂直线距离刻度：下段右短杠 + 数字（×100m）
    const rng = [['8', 640], ['12', 710], ['16', 780], ['20', 850], ['24', 920]];
    s += T(566, 610, 'RNG×100', 'start', 9);
    for (const [n, y] of rng) {
      s += L(500, y, 518, y, 1.4);
      s += T(524, y + 4, n);
    }
    // 垂直上段左短杠（仰角对称）
    for (let i = 1; i <= 3; i++) {
      const y = 500 - 130 * i;
      s += L(482, y, 500, y, 1.2);
      s += T(476, y + 4, i * 4, 'end', 10);
    }
    // 水平密位短杠：±(130..430) 每 75
    for (let i = 1; i <= 4; i++) {
      const off = 75 * i + 55;
      const h = i % 2 === 1 ? 10 : 6;
      s += L(500 - off, 500 - h, 500 - off, 500 + h, 1.1);
      s += L(500 + off, 500 - h, 500 + off, 500 + h, 1.1);
    }
    // 右下 Zeiss 测距弧（三层同心弧，0°~45° 象限）
    for (const [r, w] of [[190, 1.3], [220, 1.1], [250, 0.9]]) {
      const x0 = 500 + r, y0 = 500;
      const x1 = 500 + r * Math.cos(Math.PI / 4), y1 = 500 + r * Math.sin(Math.PI / 4);
      const d = `M${x0.toFixed(1)},${y0} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
      s += `<path d="${d}" class="gs-out" stroke-width="${(w + 1.2).toFixed(1)}"/>`;
      s += `<path d="${d}" class="gs-ink" stroke-width="${w}"/>`;
    }
    // 测距弧端点刻度 + mil 标注
    s += L(690, 500, 690, 512, 1.2) + L(634, 556, 646, 568, 1.2);
    s += T(640, 620, '4', 'middle', 10) + T(676, 648, '8', 'middle', 10);
    return s;
  },

  // ─────────── 试验车 AbramsX：数字全息 HUD（青色） ───────────
  x: () => {
    let s = '';
    // 中心小四角括号 + 中心十字点
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = 500 + sx * 30, y = 500 + sy * 30;
      s += P(`M${x},${y + -sy * 22} L${x},${y} L${x + -sx * 22},${y}`, 2.0);
    }
    s += L(500, 488, 500, 512, 1.6) + L(488, 500, 512, 500, 1.6);
    s += '<circle cx="500" cy="500" r="2" class="gs-acc-f"/>';
    // 外围大四角括号（±360）
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = 500 + sx * 360, y = 500 + sy * 360;
      s += P(`M${x},${y + -sy * 60} L${x},${y} L${x + -sx * 60},${y}`, 3.0);
    }
    // 顶部中心弧刻度（半径 240，±24° 三段）
    for (const [a0, a1] of [[-24, -8], [-4, 4], [8, 24]]) {
      const r = 240;
      const p0 = [500 + r * Math.sin(a0 * Math.PI / 180), 500 - r * Math.cos(a0 * Math.PI / 180)];
      const p1 = [500 + r * Math.sin(a1 * Math.PI / 180), 500 - r * Math.cos(a1 * Math.PI / 180)];
      const d = `M${p0[0].toFixed(1)},${p0[1].toFixed(1)} A${r},${r} 0 0 1 ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
      s += `<path d="${d}" class="gs-out" stroke-width="3.2"/>`;
      s += `<path d="${d}" class="gs-ink" stroke-width="2.0"/>`;
    }
    // 水平密位方块列（±102..±438，每 67 一格）
    for (let i = 1; i <= 5; i++) {
      const off = 67 * i + 35;
      const sz = i % 2 === 1 ? 7 : 5;
      s += `<rect x="${500 - off - sz / 2}" y="${500 - sz / 2}" width="${sz}" height="${sz}" class="gs-out"/>`;
      s += `<rect x="${500 - off - sz / 2}" y="${500 - sz / 2}" width="${sz}" height="${sz}" class="gs-ink"/>`;
      s += `<rect x="${500 + off - sz / 2}" y="${500 - sz / 2}" width="${sz}" height="${sz}" class="gs-out"/>`;
      s += `<rect x="${500 + off - sz / 2}" y="${500 - sz / 2}" width="${sz}" height="${sz}" class="gs-ink"/>`;
    }
    // 垂直下段：数字距离阶梯（短杠+两位数字）
    const rng = [['06', 700], ['08', 770], ['10', 840], ['12', 910]];
    s += `<text x="566" y="668" class="gs-num gs-acc-t" text-anchor="start" style="font-size:9px">RNG×100</text>`;
    for (const [n, y] of rng) {
      s += L(500 - 16, y, 500 + 16, y, 2.0);
      s += `<text x="524" y="${y + 4}" class="gs-num gs-acc-t" text-anchor="start">${n}</text>`;
    }
    // 垂直上段短杠（仰角）
    for (let i = 1; i <= 3; i++) {
      const y = 500 - 130 * i;
      s += L(492, y, 508, y, 1.4);
    }
    // 左右数据标签框（全息装饰）
    s += L(230, 440, 320, 440, 1.2) + L(230, 440, 230, 462, 1.2) + L(320, 440, 320, 462, 1.2);
    s += T(236, 456, 'AX·FCS', 'start', 9);
    s += L(680, 538, 770, 538, 1.2) + L(680, 538, 680, 560, 1.2) + L(770, 538, 770, 560, 1.2);
    s += T(688, 554, 'HK·2M', 'start', 9);
    return s;
  },

  // ─────────── 法系勒克莱尔：SAGEM VS 580 细十字（三色点缀：蓝主调+红点） ───────────
  // 细全幅十字 + 中心上指人字 + 红心点 + 提前量门括号 + 左下数字测距阶 + 右下蓝弧
  fr: () => {
    let s = '';
    // 细全幅十字（中心留白）
    s += L(500, 44, 500, 452, 1.5) + L(500, 548, 500, 956, 1.5);
    s += L(44, 500, 452, 500, 1.5) + L(548, 500, 956, 500, 1.5);
    // 中心上指人字（法式 ^）+ 红心点
    s += P('M470,530 L500,498 L530,530', 1.8);
    s += '<circle cx="500" cy="500" r="2.6" class="gs-dot"/>';
    // 横向提前量门括号（±170 一对 + ±300 一对）
    for (const dir of [-1, 1]) {
      for (const off of [170, 300]) {
        const x = 500 + dir * off;
        s += L(x, 486, x, 514, 1.6);                            // 竖门杠
        s += L(x, 486, x - dir * 10, 486, 1.4) + L(x, 514, x - dir * 10, 514, 1.4);  // 门向内钩
      }
    }
    // 水平密位短杠（±120 起每 75）
    for (let i = 1; i <= 4; i++) {
      const off = 75 * i + 45;
      const h = i % 2 === 1 ? 9 : 5;
      s += L(500 - off, 500 - h, 500 - off, 500 + h, 1.0);
      s += L(500 + off, 500 - h, 500 + off, 500 + h, 1.0);
    }
    // 垂直下段测距阶梯（左侧数字，×100m）
    const rng = [['6', 630], ['10', 690], ['14', 750], ['18', 810], ['22', 870], ['26', 930]];
    for (const [n, y] of rng) {
      s += L(500, y, 520, y, 1.4);
      s += T(462, y + 4, n, 'end', 10);
    }
    // 右下蓝弧（测距弧 0°~40°）+ 弧端刻度
    for (const [r, w] of [[200, 1.2], [234, 0.9]]) {
      const x1 = 500 + r * Math.cos(40 * Math.PI / 180), y1 = 500 + r * Math.sin(40 * Math.PI / 180);
      const d = `M${500 + r},${500} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
      s += `<path d="${d}" class="gs-out" stroke-width="${(w + 1.2).toFixed(1)}"/>`;
      s += `<path d="${d}" class="gs-acc" stroke-width="${w}"/>`;
    }
    // 中心下方小三角标（红，法军标识位）
    s += `<path d="M500,600 L492,614 L508,614 Z" class="gs-dot"/>`;
    return s;
  },

  // ─────────── 以色列梅卡瓦：BMS 方括号瞄准（钴蓝强调 + 大卫之星标识） ───────────
  // 中心方括号框 + 细十字 + 下部漏斗测距 + 右侧数字列 + 顶部大卫之星轮廓
  il: () => {
    let s = '';
    // 中心方括号框（±36 四角）
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = 500 + sx * 36, y = 500 + sy * 36;
      s += P(`M${x},${y - sy * 16} L${x},${y} L${x - sx * 16},${y}`, 1.8);
    }
    s += '<circle cx="500" cy="500" r="2.2" class="gs-acc-f"/>';
    // 细全幅十字
    s += L(500, 44, 500, 448, 1.4) + L(500, 552, 500, 956, 1.4);
    s += L(44, 500, 448, 500, 1.4) + L(552, 500, 956, 500, 1.4);
    // 下部漏斗测距（±230 汇聚到中心下方，BMS 式测距漏斗）
    s += P('M270,760 L492,540 M730,760 L508,540', 1.4);
    // 漏斗横刻度（600/700/800/900m 档）
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const y = 760 - t * 220, half = 230 - t * 214;
      s += L(500 - half - 12, y, 500 - half, y, 1.2) + L(500 + half, y, 500 + half + 12, y, 1.2);
      s += T(500 - half - 18, y + 4, (4 + i) + '00', 'end', 9);
    }
    // 水平密位短杠
    for (let i = 1; i <= 5; i++) {
      const off = 70 * i + 50;
      const h = i % 2 === 1 ? 10 : 6;
      s += L(500 - off, 500 - h, 500 - off, 500 + h, 1.0);
      s += L(500 + off, 500 - h, 500 + off, 500 + h, 1.0);
    }
    // 顶部大卫之星轮廓（装饰标识，双三角）
    const star = (rot) => {
      const pts = [];
      for (let i = 0; i < 3; i++) {
        const a = rot + i * 2 * Math.PI / 3 - Math.PI / 2;
        pts.push(`M${(500 + 22 * Math.cos(a)).toFixed(1)},${(352 + 22 * Math.sin(a)).toFixed(1)}`);
        const b = rot + ((i + 1) % 3) * 2 * Math.PI / 3 - Math.PI / 2;
        pts[pts.length - 1] += ` L${(500 + 22 * Math.cos(b)).toFixed(1)},${(352 + 22 * Math.sin(b)).toFixed(1)}`;
      }
      return pts.join(' ');
    };
    s += `<path d="${star(0)}" class="gs-acc" stroke-width="1.1"/>`;
    s += `<path d="${star(Math.PI / 3)}" class="gs-acc" stroke-width="1.1"/>`;
    // 右侧数字距离列（备用精确测距，避开漏斗区）
    const rng = [['06', 640], ['09', 705], ['12', 770], ['15', 835]];
    s += T(612, 610, 'RNG×100', 'start', 9);
    for (const [n, y] of rng) {
      s += L(500 + 60, y, 500 + 88, y, 1.3);
      s += T(596, y + 4, n, 'end', 10);
    }
    return s;
  },

  // ─────────── 日系 10式：陆自极细十字（绯红强调 + 樱粉读数） ───────────
  // 极细全幅十字 + 中心菱形 + 交替密位 + 测距阶梯 + 四角浅框定括号
  jp: () => {
    let s = '';
    // 极细全幅十字（中心留白略大：菱形所在）
    s += L(500, 44, 500, 440, 1.2) + L(500, 560, 500, 956, 1.2);
    s += L(44, 500, 440, 500, 1.2) + L(560, 500, 956, 500, 1.2);
    // 中心菱形瞄准标（日式 ◇，绯红强调）+ 红心点
    s += PA('M500,478 L522,500 L500,522 L478,500 Z', 1.5);
    s += '<circle cx="500" cy="500" r="1.8" class="gs-acc-f"/>';
    // 水平密位（长短交替，自 ±110 起）
    for (let i = 1; i <= 5; i++) {
      const off = 70 * i + 40;
      const h = i % 2 === 1 ? 11 : 6;
      s += L(500 - off, 500 - h, 500 - off, 500 + h, 1.0);
      s += L(500 + off, 500 - h, 500 + off, 500 + h, 1.0);
      if (i <= 3) {
        s += T(500 - off, 536, String(i * 4), 'middle', 9);
        s += T(500 + off, 536, String(i * 4), 'middle', 9);
      }
    }
    // 垂直测距阶梯（下方，数字在右）
    const rng = [['7', 620], ['11', 680], ['15', 740], ['19', 800], ['23', 860], ['27', 920]];
    s += T(560, 596, 'RNG×100', 'start', 9);
    for (const [n, y] of rng) {
      s += L(500, y, 522, y, 1.3);
      s += T(530, y + 4, n, 'start', 10);
    }
    // 垂直上段仰角刻度（左短杠）
    for (let i = 1; i <= 3; i++) {
      const y = 500 - 120 * i;
      s += L(484, y, 500, y, 1.1);
    }
    // 四角框定括号（目标框定，枠；半径 <465 圆形遮罩内）
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = 500 + sx * 290, y = 500 + sy * 290;
      s += L(x, y, x - sx * 40, y, 1.0) + L(x, y, x, y - sy * 40, 1.0);
    }
    return s;
  },

  // ─────────── KF51 黑豹：NG-FCS 科技蓝分划（德系 EMES 骨架 + 大数据全息读数） ───────────
  // 德式细十字+中心点+提前量门括号+密位短杠；测距/倍率数据移至左右两侧放大显示，
  // 辅以航速/方位/俯仰/弹种数据行、条码组与数据引线，科技蓝电光配色
  nx: () => {
    let s = '';
    // ── 德式骨架：细全幅十字 + 中心点 + 提前量门括号 + 密位短杠 ──
    s += L(500, 44, 500, 452, 1.4) + L(500, 548, 500, 956, 1.4);
    s += L(44, 500, 452, 500, 1.4) + L(552, 500, 956, 500, 1.4);
    s += '<circle cx="500" cy="500" r="2.2" class="gs-acc-f"/>';
    for (const dir of [-1, 1]) {
      for (const off of [170, 300]) {
        const x = 500 + dir * off;
        s += L(x, 486, x, 514, 1.5);
        s += L(x, 486, x - dir * 10, 486, 1.3) + L(x, 514, x - dir * 10, 514, 1.3);
      }
    }
    for (let i = 1; i <= 4; i++) {
      const off = 75 * i + 45;
      const h = i % 2 === 1 ? 9 : 5;
      s += L(500 - off, 500 - h, 500 - off, 500 + h, 1.0);
      s += L(500 + off, 500 - h, 500 + off, 500 + h, 1.0);
    }
    // ── 左侧：测距大数据（RNG 放大显示 + 数据引线指向中心）——数值由 ui.updateHUD 实时回填 ──
    s += T(118, 322, 'RNG', 'start', 13);
    s += `<text id="gs-nx-rng" x="242" y="376" class="gs-num gs-acc-t" text-anchor="end" style="font-size:38px;letter-spacing:2px">----</text>`;
    s += T(250, 376, 'm', 'start', 13);
    s += `<line x1="300" y1="364" x2="428" y2="436" class="gs-acc" stroke-width="1.0" stroke-opacity="0.55" stroke-dasharray="3 4"/>`;
    s += `<line x1="428" y1="436" x2="468" y2="462" class="gs-acc" stroke-width="1.0" stroke-opacity="0.8"/>`;
    s += '<circle cx="470" cy="463" r="2" class="gs-acc-f" fill-opacity="0.8"/>';
    // ── 目标名称框（RNG 下方：暖红标识色；有瞄准目标时 ui 回填显示，无目标隐藏）──
    s += `<g id="gs-nx-tgt-g" style="display:none">`;
    s += `<rect x="116" y="398" width="216" height="36" fill="rgba(24,10,6,0.5)" stroke="#ff8a66" stroke-opacity="0.9" stroke-width="1.2"/>`;
    s += `<text id="gs-nx-tgt" x="128" y="422" text-anchor="start" style="font-size:15px;fill:#ff8a66;letter-spacing:1px">--</text>`;
    s += `</g>`;
    // ── 右上：倍率大数据（MAG 实时回填）+ 弹种 ──
    s += T(724, 296, 'MAG', 'start', 13);
    s += `<text id="gs-nx-mag" x="724" y="348" class="gs-num gs-acc-t" text-anchor="start" style="font-size:34px;letter-spacing:2px">×--</text>`;
    s += T(724, 384, '130·HVM', 'start', 10);
    s += T(724, 404, 'APFSDS', 'start', 9);
    // ── 左下：车体状态数据行（航速/方位/俯仰，数值实时回填）──
    s += T(118, 646, 'SPD', 'start', 11);
    s += `<text id="gs-nx-spd" x="205" y="646" class="gs-num" text-anchor="start" style="font-size:11px">0</text>`;
    s += T(252, 646, 'KM/H', 'start', 11);
    s += T(118, 678, 'AZ', 'start', 11);
    s += `<text id="gs-nx-az" x="205" y="678" class="gs-num" text-anchor="start" style="font-size:11px">000</text>`;
    s += T(118, 710, 'EL', 'start', 11);
    s += `<text id="gs-nx-el" x="205" y="710" class="gs-num" text-anchor="start" style="font-size:11px">+0.0</text>`;
    s += L(114, 622, 240, 622, 1.0) + L(114, 622, 114, 634, 1.0);
    // ── 右下：火控状态 + 条码组 ──
    s += T(700, 646, 'AMS·LOCK', 'start', 11);
    s += T(700, 678, 'SOLVER OK', 'start', 9);
    let bx = 700;
    for (let i = 0; i < 14; i++) {
      const w = i % 3 === 0 ? 2.4 : 1.0;
      s += `<line x1="${bx}" y1="700" x2="${bx}" y2="${700 + 22 + (i % 4) * 5}" class="gs-acc" stroke-width="${w}" stroke-opacity="${0.45 + (i % 3) * 0.2}"/>`;
      bx += 4 + (i % 3) * 2.2;
    }
    s += T(700, 756, 'ID·0x3F7A', 'start', 8);
    // ── 全息标签：左上系统名 + 视场四角框定 ──
    s += L(150, 244, 262, 244, 1.1) + L(150, 244, 150, 266, 1.1) + L(262, 244, 262, 266, 1.1);
    s += T(158, 260, 'KF51·NGFCS', 'start', 9);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = 500 + sx * 320, y = 500 + sy * 320;
      s += L(x, y, x - sx * 32, y, 1.1) + L(x, y, x, y - sy * 32, 1.1);
    }
    return s;
  },
};
