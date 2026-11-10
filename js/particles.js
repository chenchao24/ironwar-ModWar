// ═══ GPU 粒子系统：单个 Points 绘制调用，CPU 模拟 + 自定义着色器 ═══
// 每粒子可选扩展：c0/c1 颜色起止、fadeIn 渐入、windK 风力系数、sizeEase 尺寸插值指数；
// 贴地反弹全局开启；gl_PointSize 用 uScale（随相机 FoV 每帧更新，变倍时粒子保持世界尺寸）
import * as THREE from 'three';
import { THERMAL } from './config.js';
import { THERMAL_SHARED } from './thermal.js';

const MAX = 4000;
// 全局风（m/s² 级加速度，乘 windK 作用于粒子水平速度）
const WIND = { x: 0.9, z: 0.35 };

// 程序化粒子贴图
function makeTextures() {
  function canvas(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  // 烟雾：径向渐变底 + 噪声团块 + 超大低频团块（放大后呈絮状云雾而非均匀球）
  const smoke = canvas(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    const base = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    base.addColorStop(0, 'rgba(255,255,255,1)');
    base.addColorStop(0.35, 'rgba(255,255,255,.55)');
    base.addColorStop(0.7, 'rgba(255,255,255,.16)');
    base.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    // 噪声团块，打破规则渐变
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * s * 0.34;
      const x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r;
      const rr = 4 + Math.random() * 13;
      const g2 = g.createRadialGradient(x, y, 0, x, y, rr);
      g2.addColorStop(0, `rgba(255,255,255,${0.05 + Math.random() * 0.08})`);
      g2.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = g2;
      g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
    }
    // 超大低频团块
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * s * 0.18;
      const x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r;
      const rr = s * (0.24 + Math.random() * 0.1);
      const g3 = g.createRadialGradient(x, y, 0, x, y, rr);
      g3.addColorStop(0, 'rgba(255,255,255,0.07)');
      g3.addColorStop(0.6, 'rgba(255,255,255,0.03)');
      g3.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = g3;
      g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
    }
  });
  // 星芒爆闪：6 瓣星芒 + 亮心（火球核心/爆闪/火花用）
  const flash = canvas(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.translate(s / 2, s / 2);
    const star = (r0, r1, alpha) => {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + 0.35;
        g.save(); g.rotate(a);
        const lg = g.createLinearGradient(0, 0, r1, 0);
        lg.addColorStop(0, `rgba(255,255,255,${alpha})`);
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = lg;
        g.beginPath(); g.moveTo(r0 * .3, -3); g.lineTo(r1, 0); g.lineTo(r0 * .3, 3); g.closePath(); g.fill();
        g.restore();
      }
    };
    star(s * 0.1, s * 0.48, 0.5);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.34);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.25, 'rgba(255,255,255,.95)');
    rg.addColorStop(0.55, 'rgba(255,255,255,.32)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, s * 0.34, 0, 7); g.fill();
  });
  // 火球：带核心
  const fire = canvas(128, (g, s) => {
    const gr = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    gr.addColorStop(0, 'rgba(255,255,240,1)');
    gr.addColorStop(0.3, 'rgba(255,220,140,0.9)');
    gr.addColorStop(0.65, 'rgba(255,120,30,0.45)');
    gr.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  return { smoke, glow: flash, fire };
}

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.textures = makeTextures();
    this.pools = {};
    for (const kind of ['smoke', 'glow', 'fire']) {
      this.pools[kind] = this._makePool(kind, kind === 'smoke' ? MAX : Math.floor(MAX / 2));
    }
    this.lightPool = [];
    this.lightIdx = 0;
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 60, 1.8);
      scene.add(l);
      this.lightPool.push(l);
    }
  }

  _makePool(kind, count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const data = new Float32Array(count * 4);   // size, alpha, rot, seed
    const color = new Float32Array(count * 3);  // 当前帧颜色（c0→c1 插值）
    color.fill(1);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pdata', new THREE.BufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      // 热成像：IR 开启时按粒子类别输出固定热值（烟=冷灰遮热 / 火光=白热）
      uniforms: {
        map: { value: this.textures[kind] }, uScale: { value: 320 }, uMaxPx: { value: 512 },
        uThermalOn: THERMAL_SHARED.uThermalOn,
        uThermalHeat: { value: kind === 'smoke' ? THERMAL.heat.smoke : THERMAL.heat.fire },
      },
      vertexShader: `
        attribute vec4 pdata;
        attribute vec3 aColor;
        varying float vAlpha; varying float vRot; varying float vSeed; varying vec3 vColor;
        uniform float uScale, uMaxPx;
        void main() {
          vAlpha = pdata.y; vRot = pdata.z; vSeed = pdata.w; vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // 开镜高倍变焦防 overdraw：点精灵钳制最大屏幕尺寸（单粒子覆盖上限），烟雾团仍由多粒子叠成
          gl_PointSize = clamp(pdata.x * uScale / max(1.0, -mv.z), 1.0, uMaxPx);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform float uThermalOn, uThermalHeat;
        varying float vAlpha; varying float vRot; varying float vSeed; varying vec3 vColor;
        void main() {
          float c = cos(vRot), s = sin(vRot);
          vec2 uv = gl_PointCoord - 0.5;
          uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
          vec4 tex = texture2D(map, uv);
          gl_FragColor = vec4(tex.rgb * vColor, tex.a * vAlpha);
          if (gl_FragColor.a < 0.003) discard;
          if (uThermalOn > 0.5) gl_FragColor.rgb = vec3(uThermalHeat);
        }`,
      transparent: true,
      depthWrite: false,
      blending: kind === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    return {
      kind, geo, points, count, mat,
      // 每粒子状态
      px: pos, pd: data, pc: color,
      vx: new Float32Array(count), vy: new Float32Array(count), vz: new Float32Array(count),
      life: new Float32Array(count), maxLife: new Float32Array(count),
      size0: new Float32Array(count), size1: new Float32Array(count),
      alpha0: new Float32Array(count),
      grav: new Float32Array(count), drag: new Float32Array(count),
      rotV: new Float32Array(count),
      c0r: new Float32Array(count), c0g: new Float32Array(count), c0b: new Float32Array(count),
      c1r: new Float32Array(count), c1g: new Float32Array(count), c1b: new Float32Array(count),
      windK: new Float32Array(count), fadeIn: new Float32Array(count),
      sizeEase: new Float32Array(count),
      grow: new Uint8Array(count),
      head: 0, active: 0,
    };
  }

  spawn(kind, o) {
    const p = this.pools[kind];
    const i = p.head;
    p.head = (p.head + 1) % p.count;
    p.px[i * 3] = o.x; p.px[i * 3 + 1] = o.y; p.px[i * 3 + 2] = o.z;
    p.vx[i] = o.vx || 0; p.vy[i] = o.vy || 0; p.vz[i] = o.vz || 0;
    p.life[i] = 0;
    p.maxLife[i] = o.life || 1;
    p.size0[i] = o.size0 ?? 1; p.size1[i] = o.size1 ?? o.size0 ?? 1;
    p.alpha0[i] = o.alpha ?? 1;
    p.grav[i] = o.grav ?? 0;
    p.drag[i] = o.drag ?? 0;
    p.rotV[i] = (Math.random() - 0.5) * (o.rotSpeed ?? 1);
    p.grow[i] = o.grow === false ? 0 : 1;
    // 颜色起止（缺省纯白 = 纹理原色）
    const c0 = o.c0 || null, c1 = o.c1 || c0;
    p.c0r[i] = c0 ? c0[0] : 1; p.c0g[i] = c0 ? c0[1] : 1; p.c0b[i] = c0 ? c0[2] : 1;
    p.c1r[i] = c1 ? c1[0] : 1; p.c1g[i] = c1 ? c1[1] : 1; p.c1b[i] = c1 ? c1[2] : 1;
    p.windK[i] = o.windK ?? 0;
    p.fadeIn[i] = o.fadeIn ?? 0;          // 0 = 沿用快入（min(t*8,1)）
    p.sizeEase[i] = o.sizeEase ?? 1;
    p.pd[i * 4 + 1] = p.alpha0[i];
    p.pd[i * 4 + 2] = Math.random() * Math.PI * 2;
    p.pd[i * 4 + 3] = Math.random();
    p.pc[i * 3] = p.c0r[i]; p.pc[i * 3 + 1] = p.c0g[i]; p.pc[i * 3 + 2] = p.c0b[i];
  }

  flash(pos, color, intensity, decay = 6) {
    const l = this.lightPool[this.lightIdx];
    this.lightIdx = (this.lightIdx + 1) % this.lightPool.length;
    l.position.copy(pos);
    l.color.set(color);
    l.intensity = intensity;
    l.userData.decay = decay;
  }

  // 每帧调用：按相机 FoV（度）与视口高更新点大小系数，变倍时粒子保持世界尺寸
  // uMaxPx：单粒子屏幕尺寸上限（0.45×视口高）——开镜高倍变焦时防止整屏巨粒 overdraw 掉帧
  setFov(fovDeg, viewportH) {
    const s = viewportH * 0.5 / Math.tan(fovDeg * Math.PI / 360);
    const cap = viewportH * 0.45;
    for (const kind in this.pools) {
      this.pools[kind].mat.uniforms.uScale.value = s;
      this.pools[kind].mat.uniforms.uMaxPx.value = cap;
    }
  }

  update(dt) {
    for (const l of this.lightPool) {
      if (l.intensity > 0.01) l.intensity *= Math.exp(-(l.userData.decay || 6) * dt);
      else l.intensity = 0;
    }
    for (const kind in this.pools) {
      const p = this.pools[kind];
      let any = false;
      for (let i = 0; i < p.count; i++) {
        if (p.life[i] >= p.maxLife[i]) { if (p.pd[i * 4 + 1] !== 0) { p.pd[i * 4 + 1] = 0; any = true; } continue; }
        any = true;
        p.life[i] += dt;
        const t = Math.min(p.life[i] / p.maxLife[i], 1);
        const dragF = p.drag[i] > 0 ? Math.exp(-p.drag[i] * dt) : 1;
        p.vx[i] *= dragF; p.vz[i] *= dragF;
        p.vy[i] = p.vy[i] * dragF - p.grav[i] * dt;
        // 风（仅水平）
        const wk = p.windK[i];
        if (wk > 0) { p.vx[i] += WIND.x * wk * dt; p.vz[i] += WIND.z * wk * dt; }
        p.px[i * 3] += p.vx[i] * dt;
        p.px[i * 3 + 1] += p.vy[i] * dt;
        p.px[i * 3 + 2] += p.vz[i] * dt;
        // 贴地反弹（全局开）
        if (p.px[i * 3 + 1] < 0.03 && p.vy[i] < 0) {
          p.px[i * 3 + 1] = 0.03;
          p.vy[i] *= -0.2; p.vx[i] *= 0.8; p.vz[i] *= 0.8;
        }
        p.pd[i * 4] = p.size0[i] + (p.size1[i] - p.size0[i]) * Math.pow(t, p.sizeEase[i]);
        // 透明度：fadeIn>0 时线性渐入再线性渐出，否则快入慢出
        const fi = p.fadeIn[i];
        let a;
        if (fi > 0) a = t < fi ? t / fi : 1 - (t - fi) / (1 - fi);
        else a = Math.min(t * 8, 1) * (1 - t);
        p.pd[i * 4 + 1] = p.alpha0[i] * a;
        p.pd[i * 4 + 2] += p.rotV[i] * dt;
        // 颜色 c0→c1
        p.pc[i * 3] = p.c0r[i] + (p.c1r[i] - p.c0r[i]) * t;
        p.pc[i * 3 + 1] = p.c0g[i] + (p.c1g[i] - p.c0g[i]) * t;
        p.pc[i * 3 + 2] = p.c0b[i] + (p.c1b[i] - p.c0b[i]) * t;
      }
      if (any) {
        p.geo.attributes.position.needsUpdate = true;
        p.geo.attributes.pdata.needsUpdate = true;
        p.geo.attributes.aColor.needsUpdate = true;
      }
    }
  }
}
