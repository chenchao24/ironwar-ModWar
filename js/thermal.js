// ═══ 热成像瞄准镜（方案A）：材质热值注入 + 离屏双 pass + 热像仪后处理 ═══
// 原理：MeshStandardMaterial 经 onBeforeCompile 注入 uThermalOn/uHeat —— IR 开启时
// 跳过光照/雾，直接输出灰度热值（注入点在 colorspace_fragment 前，覆盖含雾的最终色）。
// 渲染：scene → 半分辨率 RenderTarget → 全屏 quad（白热调色/噪点/扫描线/渐晕）→ 屏幕。
// 仅供玩家开镜（N 键切换）；天空 mesh 隐藏 + clearColor 黑 = IR 冷背景。
import * as THREE from 'three';
import { THERMAL } from './config.js';

// ── 全局共享 uniforms：所有已注入材质引用同一对象，切换即时生效（不触发重编译） ──
export const THERMAL_SHARED = {
  uThermalOn: { value: 0 },
  uHeatBoost: { value: 0 },      // 车辆行驶动态热加成 0~0.08
};

const PATCHED = new WeakSet();   // 已注入材质（防重复注册）
const _wp = new THREE.Vector3();

// 注入标准材质（MeshStandardMaterial 等，走 three 内建 shader 链路）
function patchStandard(mat, heat) {
  if (!mat || PATCHED.has(mat)) return;
  if (!mat.isMeshStandardMaterial && !mat.isMeshBasicMaterial && !mat.isMeshLambertMaterial) return;
  PATCHED.add(mat);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uThermalOn = THERMAL_SHARED.uThermalOn;
    shader.uniforms.uHeatBoost = THERMAL_SHARED.uHeatBoost;
    shader.uniforms.uHeat = { value: heat };
    shader.fragmentShader = 'uniform float uThermalOn;\nuniform float uHeat;\nuniform float uHeatBoost;\n' +
      shader.fragmentShader.replace(
        '#include <colorspace_fragment>',
        `if (uThermalOn > 0.5) {
  gl_FragColor.rgb = vec3(clamp(uHeat + uHeatBoost * step(0.4, uHeat), 0.0, 1.0));
  gl_FragColor.a = 1.0;
}
#include <colorspace_fragment>`);
  };
  // 不同热值 = 不同 shader 程序（避免程序缓存串色）
  mat.customProgramCacheKey = () => `thermal_${heat}`;
}

export class ThermalSight {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = false;          // IR 视觉激活（主循环每帧判定：开镜 + N 键开）
    this.rt = null;
    this.rtScale = THERMAL.rtScale;
    this._rtW = 0; this._rtH = 0;
    this.time = 0;
    this._prevClearColor = new THREE.Color();

    // ── 全屏后处理 quad（正交相机 + 2×2 平面） ──
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uContrast: { value: THERMAL.contrast },
        uNoise: { value: THERMAL.noise },
        uScan: { value: THERMAL.scanline },
        uVignette: { value: THERMAL.vignette },
      },
      depthTest: false, depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime, uContrast, uNoise, uScan, uVignette;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float g = clamp(dot(c, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
          // 对比增强（背景压暗、热源提亮）
          g = clamp((g - 0.5) * uContrast + 0.5, 0.0, 1.0);
          // 时变噪点（传感器噪声）
          float n = fract(sin(dot(vUv * vec2(1234.5, 5678.9) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
          g += (n - 0.5) * uNoise;
          // 水平扫描线
          g *= 1.0 - uScan * (0.5 + 0.5 * sin(vUv.y * 720.0));
          // 白热调色（微暖绿白，老式热像管质感）
          vec3 col = vec3(g, g * 0.985, g * 0.93);
          // 圆形渐晕（配合 DOM 圆镜遮罩，镜缘压暗）
          float d = length(vUv - 0.5) * 2.0;
          col *= 1.0 - smoothstep(0.72, 1.0, d) * uVignette;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat));
  }

  // ── 注册布景/地形（统一背景热值） ──
  registerObject(root, heat = THERMAL.heat.background) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (Array.isArray(o.material)) o.material.forEach((m) => patchStandard(m, heat));
      else patchStandard(o.material, heat);
    });
  }

  // ── 注册坦克：动力舱网格（model 局部 z ∈ engineBox）高热，其余车体中热 ──
  registerTank(tank) {
    const box = tank.cfg.internal && tank.cfg.internal.engineBox;
    tank.model.traverse((o) => {
      if (!o.isMesh) return;
      let heat = THERMAL.heat.vehicle;
      if (box) {
        o.getWorldPosition(_wp);
        tank.model.worldToLocal(_wp);       // model 局部（米；model.scale 已换算单位）
        if (_wp.z >= box.zMin && _wp.z <= box.zMax) heat = THERMAL.heat.engine;
      }
      if (Array.isArray(o.material)) o.material.forEach((m) => patchStandard(m, heat));
      else patchStandard(o.material, heat);
    });
  }

  // ── 每帧：热值动态加成（战场所有车中最高车速 → 发动机热辐射增强） ──
  update(dt, tanks) {
    this.time += dt;
    THERMAL_SHARED.uHeatBoost.value = 0;
    for (const t of tanks) {
      if (t.destroyed) continue;
      const spdN = Math.min(Math.abs(t.speed) / (t.cfg.maxSpeed || 16), 1);
      if (spdN > THERMAL_SHARED.uHeatBoost.value) THERMAL_SHARED.uHeatBoost.value = spdN;
    }
    THERMAL_SHARED.uHeatBoost.value *= 0.08;
    this.quadMat.uniforms.uTime.value = this.time;
  }

  // ── IR 渲染：scene → RT → 后处理 quad → 屏幕（高倍变倍时 RT 提分辨率防颗粒） ──
  // sky：两图的天空 dome（IR 时隐藏，露出黑背景）
  render(scene, camera, zoomMag, sky) {
    const r = this.renderer;
    const db = r.getDrawingBufferSize(new THREE.Vector2());
    const scale = zoomMag > 4 ? THERMAL.rtScaleZoom : THERMAL.rtScale;
    const w = Math.max(2, Math.floor(db.x * scale));
    const h = Math.max(2, Math.floor(db.y * scale));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
    }

    // IR 期间隐藏天空 + 黑色清屏（冷背景）。阴影不关：B2 节流后 shadow.needsUpdate 本就
    // 只在坦克移动时为 true，IR 帧不会多画阴影（与性能优化协同）
    const skyWas = sky ? sky.visible : null;
    if (sky) sky.visible = false;
    this._prevClearColor.copy(r.getClearColor(new THREE.Color()));
    const alphaWas = r.getClearAlpha();

    THERMAL_SHARED.uThermalOn.value = 1;
    r.setClearColor(0x000000, 1);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);

    // 后处理直出屏幕
    THERMAL_SHARED.uThermalOn.value = 0;   // quad 材质未注入，不受影响；复位供下帧普通渲染
    this.quadMat.uniforms.tDiffuse.value = this.rt.texture;
    r.setRenderTarget(null);
    r.setClearColor(this._prevClearColor, alphaWas);
    r.render(this.quadScene, this.quadCam);

    if (sky) sky.visible = skyWas;
  }

  dispose() {
    if (this.rt) { this.rt.dispose(); this.rt = null; }
    this.quadMat.dispose();
    this.quadScene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
