// ═══ 小地图：600m 战场态势（玩家居中、车头朝上旋转） ═══
const SIZE = 208;          // CSS 逻辑像素
const RANGE = 800;         // 显示半径（米）

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

export class Minimap {
  /**
   * @param canvas  <canvas id="minimap">
   * @param world   World 实例（groundY + obstacles）
   */
  constructor(canvas, world) {
    this.cv = canvas;
    this.world = world;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * this.dpr;
    canvas.height = SIZE * this.dpr;
    this.ctx = canvas.getContext('2d');
    this.range = RANGE;
    this._acc = 0;
    this._t = 0;
    this._terrain = null;
  }

  // 预渲染地形底图（高度带 + 坡度明暗 + 树石）；同一战场只渲染一次
  prerender() {
    if (this._terrain) return;
    const world = this.world;
    const N = 176, P = world.mapSize / 2;
    const off = document.createElement('canvas');
    off.width = off.height = N;
    const c2 = off.getContext('2d');
    const img = c2.createImageData(N, N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1) * 2 - 1) * P;
        const z = (j / (N - 1) * 2 - 1) * P;
        const h = world.groundY(x, z);
        // 高度分带（低地暗橄榄 → 高地沙褐 → 山脊灰岩）
        let r, g, b;
        if (h < -1.5) { r = 34; g = 42; b = 28; }
        else if (h < 0.5) { r = 48; g = 56; b = 36; }
        else if (h < 2.5) { r = 70; g = 70; b = 50; }
        else { r = 92; g = 88; b = 72; }
        // 坡度压暗，勾出沟壑
        const s = Math.abs(world.groundY(x + 14, z) - h) + Math.abs(world.groundY(x, z + 14) - h);
        const sh = clamp(1 - s * 0.10, 0.55, 1.1);
        const o = (j * N + i) * 4;
        img.data[o] = r * sh; img.data[o + 1] = g * sh; img.data[o + 2] = b * sh; img.data[o + 3] = 255;
      }
    }
    c2.putImageData(img, 0, 0);
    // 树 / 岩石 / 废墟
    const k = N / (2 * P);
    for (const c of world.obstacles) {
      if (c.dead) continue;   // 已摧毁的布景障碍不再绘制
      c2.fillStyle = c.kind === 'tree' ? 'rgba(16,32,14,0.9)'
                   : c.kind === 'rock' ? 'rgba(122,116,100,0.85)'
                   : c.kind === 'building' ? 'rgba(148,132,102,0.92)'   // 建筑：土褐亮块（小镇图主要素）
                   : 'rgba(70,66,58,0.9)';
      c2.beginPath();
      c2.arc((c.x + P) * k, (c.z + P) * k, Math.max(1, c.r * k), 0, Math.PI * 2);
      c2.fill();
    }
    this._terrain = off;
  }

  update(dt, player, enemies) {
    this._acc += dt; this._t += dt;
    if (this._acc < 1 / 30) return;
    this._acc = 0;
    if (!this._terrain) this.prerender();

    const ctx = this.ctx, c = SIZE / 2;
    const s = c / this.range;                        // px / m
    const th = player.heading - Math.PI;             // 旋转：车头朝上
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    // 圆形视域裁剪
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, Math.PI * 2);
    ctx.clip();
    // 地图外暗色底（避免方形空白）
    ctx.fillStyle = 'rgba(12,14,12,0.95)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // 地形底图
    ctx.translate(c, c);
    ctx.rotate(th);
    ctx.translate(-player.pos.x * s, -player.pos.z * s);
    const P = this.world.mapSize / 2;
    ctx.drawImage(this._terrain, -P * s, -P * s, 2 * P * s, 2 * P * s);
    // 地图边缘标识（琥珀边框，随旋转）
    ctx.strokeStyle = 'rgba(232,163,61,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-P * s, -P * s, 2 * P * s, 2 * P * s);
    ctx.restore();

    // 距离环（300 / 600m）
    ctx.save();
    ctx.strokeStyle = 'rgba(216,220,200,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c, c, c * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(216,220,200,0.22)';
    ctx.beginPath(); ctx.arc(c, c, c - 1.5, 0, Math.PI * 2); ctx.stroke();

    // 敌人：点亮实时位置（红），失联最后已知位置（灰?），未发现不显示
    const cos = Math.cos(th), sin = Math.sin(th);
    for (const e of enemies) {
      if (e.destroyed) continue;
      // 点亮状态：spotted=实时红三角，lostContact=灰?最后位置，未发现=跳过
      const spotted = e.spotted === true;
      const lost = e.lostContact === true;
      if (!spotted && !lost) continue;
      // 位置：点亮用实时，失联用 lastKnownPos
      const src = spotted ? e.pos : (e.lastKnownPos || e.pos);
      const dx = src.x - player.pos.x;
      const dz = src.z - player.pos.z;
      let rx = dx * cos - dz * sin;
      let ry = dx * sin + dz * cos;
      const dist = Math.hypot(dx, dz);
      const beyond = dist > this.range - 14;
      if (beyond) {
        const k = (c - 11) / (Math.hypot(rx, ry) || 1);
        rx *= k; ry *= k;
      }
      const px = c + rx * (beyond ? 1 : s);
      const py = c + ry * (beyond ? 1 : s);
      ctx.save();
      ctx.translate(px, py);
      if (beyond) ctx.globalAlpha = 0.45 + 0.35 * Math.sin(this._t * 5);
      if (spotted) {
        // 朝向三角（按车体航向）
        ctx.rotate(Math.atan2(Math.sin(e.heading - th), -Math.cos(e.heading - th)));
        ctx.fillStyle = '#e04a30';
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -5.5); ctx.lineTo(4, 4.5); ctx.lineTo(-4, 4.5); ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else {
        // 失联：灰色圆 + ? 问号，呼吸闪烁
        const pulse = 0.55 + 0.25 * Math.sin(this._t * 3);
        ctx.globalAlpha *= pulse;
        ctx.fillStyle = 'rgba(150,150,150,0.85)';
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(40,40,40,0.95)';
        ctx.font = '700 8px "Segoe UI", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 0.5);
      }
      ctx.restore();
    }

    // 玩家（车头朝上）
    ctx.save();
    ctx.translate(c, c);
    ctx.fillStyle = '#e8e2b8';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3.2); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // 北方标记（世界 -Z 为北……取 +Z 反方向）
    const nx = -Math.sin(player.heading), ny = Math.cos(player.heading);
    ctx.save();
    ctx.translate(c + nx * (c - 12), c + ny * (c - 12));
    ctx.fillStyle = 'rgba(232,226,184,0.75)';
    ctx.font = '700 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, 0);
    ctx.restore();
  }
}
