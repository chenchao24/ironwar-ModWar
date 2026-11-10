// ═══ 履带印：InstancedMesh 环形缓冲印章，贴地形俯仰，缓慢渐隐 ═══
// 与 modalTank 实现的差异（规避其已知缺陷）：
//   1. 朝向：Euler 'YXZ'，y=航向 + x=-π/2+地形俯仰 + z=π → 长轴精确对准行进方向
//      （modalTank 用 XYZ(-π/2,0,-yaw)，45° 时长轴 z 分量镜像横躺 90°）
//   2. 融合：单印 alpha 峰值 0.55、印距 0.45m、印长 1.4m（~3 倍重叠）+ 两端 20% 羽化
//      （modalTank 0.95 alpha × 8.6 倍重叠 → NormalBlending 饱和成纯黑硬边条带）
//   3. 贴地：每枚印章采样航向前后 ±0.7m 两点高差算俯仰写入实例旋转
import * as THREE from 'three';

const N = 560;                 // 环形缓冲容量（印章总数）
const STAMP_W = 0.64;          // 印章宽 (m)
const STAMP_L = 1.4;           // 印章长 (m)
const Y_OFF = 0.045;           // 浮起高度（配合 polygonOffset 防 z-fight）

// 程序化履带印纹理 64×128：横向渐变 + 横齿 + 两端羽化
function makeTrackTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 64, 128);
  // 横向渐变：边缘透明 → 中心 alpha 峰值 0.55
  const g = c.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(58,52,40,0)');
  g.addColorStop(0.14, 'rgba(58,52,40,0.24)');
  g.addColorStop(0.3, 'rgba(48,42,32,0.32)');
  g.addColorStop(0.5, 'rgba(54,48,36,0.18)');
  g.addColorStop(0.7, 'rgba(48,42,32,0.32)');
  g.addColorStop(0.86, 'rgba(58,52,40,0.24)');
  g.addColorStop(1, 'rgba(58,52,40,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 128);
  // 横齿（浅化 + 降透明度）
  c.fillStyle = 'rgba(42,36,26,0.26)';
  for (let y = 0; y < 128; y += 14) c.fillRect(4, y, 56, 6);
  // 两端 20% 长度羽化（印章衔接处平滑过渡）
  const fade = c.createLinearGradient(0, 0, 0, 128);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.2, 'rgba(0,0,0,0)');
  fade.addColorStop(0.8, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = fade;
  c.fillRect(0, 0, 64, 128);
  c.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class TrackMarks {
  /**
   * @param scene 场景
   * @param world World 实例（提供 groundY(x,z) 高度采样）
   */
  constructor(scene, world) {
    this.world = world;

    const geo = new THREE.PlaneGeometry(STAMP_W, STAMP_L);
    // vertexColors 需要几何体自带 color 属性（缺省时 WebGL 读到 0 → 全透明）
    const ones = new Float32Array(geo.attributes.position.count * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(ones, 3));

    const mat = new THREE.MeshBasicMaterial({
      map: makeTrackTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexColors: true,
    });
    // instanceColor.r 当透明度：老化渐隐
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.a *= vColor.r;');
    };

    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    this.mesh = mesh;

    this._dummy = new THREE.Object3D();
    // 关键：YXZ 顺序 —— 先绕 y 转航向，再绕 x 放平（含地形俯仰）
    this._dummy.rotation.order = 'YXZ';
    this._col = new THREE.Color();
    this._items = new Array(N).fill(null);   // { t, dur } | null
    this._states = new Map();                // tank → { trL, trR, prevHeading }
    this.head = 0;

    // 全部实例初始隐藏
    const d = this._dummy;
    d.position.set(0, -10, 0);
    d.scale.set(0, 0, 0);
    d.updateMatrix();
    for (let i = 0; i < N; i++) {
      mesh.setMatrixAt(i, d.matrix);
      mesh.setColorAt(i, this._col.setRGB(0, 0, 0));
    }
  }

  /**
   * 落一枚印章：长轴对准 yaw（坦克前进方向 (sinψ,0,cosψ)），俯仰贴合地形
   * @param len  长度倍率（转向时缩短，减少铰接错位）
   * @param width 单条履带印宽度 (m)，默认 STAMP_W
   */
  stamp(x, z, yaw, len = 1, width = STAMP_W) {
    const gy = this.world.groundY;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    // 航向前后 ±0.7m 两点高差 → 俯仰（pitch<0 = 前端抬升，与 tank.js 同约定）
    const hF = gy(x + dx * 0.7, z + dz * 0.7);
    const hB = gy(x - dx * 0.7, z - dz * 0.7);
    const pitch = Math.atan2(hB - hF, 1.4);

    const i = this.head;
    this.head = (this.head + 1) % N;
    const d = this._dummy;
    d.position.set(x, gy(x, z) + Y_OFF, z);
    // YXZ(x=-π/2+pitch, y=yaw, z=π)：z=π 使长轴与行进方向同号（+forward），法线朝上
    d.rotation.set(-Math.PI / 2 + pitch, yaw, Math.PI);
    d.scale.set(width / STAMP_W, len, 1);
    d.updateMatrix();
    this.mesh.setMatrixAt(i, d.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this._items[i] = { t: 0, dur: 30 + Math.random() * 14 };   // 30~44s 寿命
    this.mesh.setColorAt(i, this._col.setRGB(1, 1, 1));
    this.mesh.instanceColor.needsUpdate = true;
  }

  // 左右履带独立里程计：每帧在 tank.drive 之后调用
  trackTank(tank, dt) {
    let st = this._states.get(tank);
    if (!st) {
      st = { trL: 0, trR: 0, prevHeading: tank.heading };
      this._states.set(tank, st);
      return;
    }
    if (dt <= 0) return;
    // 本帧实际航向变化率（含倒车镜像，角度 wrap）
    const yawRate = wrapAngle(tank.heading - st.prevHeading) / dt;
    st.prevHeading = tank.heading;

    // 履带横向半距：cfg.trackLocal 两点横向距离一半 × 模型缩放
    const tl = tank.cfg.trackLocal;
    const halfW = Math.abs(tl[1][0] - tl[0][0]) * 0.5 * tank.cfg.scale;
    // 单条履带印宽度（cfg.trackWidth 优先，否则按车宽估算）
    const trackW = tank.cfg.trackWidth || (tank.cfg.dims ? tank.cfg.dims.width * 0.17 : STAMP_W);

    const speed = tank.speed;
    const vL = speed - yawRate * halfW;
    const vR = speed + yawRate * halfW;
    const turnK = Math.min(1, Math.abs(yawRate) * 1.6);
    const gap = 0.45 - turnK * 0.15;    // 印距 0.45 → 0.30
    const len = 1 - turnK * 0.3;        // 印长最短 0.7

    const sx = Math.sin(tank.heading), cz = Math.cos(tank.heading);
    st.trL += Math.abs(vL) * dt;
    if (st.trL >= gap) {
      st.trL -= gap;
      // 左履带 = 车体局部 -x
      this.stamp(tank.pos.x - cz * halfW, tank.pos.z + sx * halfW,
                 vL < 0 ? tank.heading + Math.PI : tank.heading, len, trackW);
    }
    st.trR += Math.abs(vR) * dt;
    if (st.trR >= gap) {
      st.trR -= gap;
      // 右履带 = 车体局部 +x
      this.stamp(tank.pos.x + cz * halfW, tank.pos.z - sx * halfW,
                 vR < 0 ? tank.heading + Math.PI : tank.heading, len, trackW);
    }
  }

  // 老化 + 透明度写回（a = (1 - t/dur)^0.65）
  update(dt) {
    const mesh = this.mesh, col = this._col, d = this._dummy;
    let dirty = false, hideDirty = false;
    for (let i = 0; i < N; i++) {
      const it = this._items[i];
      if (!it) continue;
      it.t += dt;
      const k = 1 - it.t / it.dur;
      if (k <= 0) {
        this._items[i] = null;
        d.position.set(0, -10, 0);
        d.rotation.set(0, 0, 0);
        d.scale.set(0, 0, 0);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        hideDirty = true;
        continue;
      }
      const a = 0.32 * Math.pow(k, 0.65);
      mesh.setColorAt(i, col.setRGB(a, a, a));
      dirty = true;
    }
    if (dirty) mesh.instanceColor.needsUpdate = true;
    if (hideDirty) mesh.instanceMatrix.needsUpdate = true;
  }

  // 战斗结束清理（几何/材质/纹理/实例缓冲）
  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.map.dispose();
    this.mesh.material.dispose();
    this._states.clear();
  }
}
