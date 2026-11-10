// ═══ 烟雾弹系统：可见弹体 + 向上飞行 + 大量烟雾遮蔽 + 视线遮挡 ═══

import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

// ── 烟雾弹实体参数 ──
const SHELL_SPEED = 28;            // 初速 m/s
const SHELL_MAX_DIST = 11;         // 目标飞行距离 m（10-12m 区间）
const SHELL_DIST_JITTER = 1;       // 距离随机 ±m
const SHELL_LIFETIME = 3.0;        // 飞行时间上限 s
const SHELL_RADIUS = 0.025;        // 圆柱半径 m（直径0.05m）
const SHELL_LENGTH = 0.15;         // 圆柱长度 m（15cm）
const BURST_COUNT = 4;             // 每次发射弹体数
const BURST_SPREAD = Math.PI / 7;  // 扇形散布角（±25°）
const PITCH_MIN = 30 * Math.PI / 180;  // 最小仰角 30°
const PITCH_MAX = 45 * Math.PI / 180;  // 最大仰角 45°

// ── 烟雾云参数 ──
const SMOKE_MAX_R = 28;            // 烟雾云最大半径 m
const SMOKE_EXPAND_MIN = 2;        // 展开时间下限 s
const SMOKE_EXPAND_MAX = 4;        // 展开时间上限 s
const SMOKE_SUSTAIN_TIME = 25;     // 持续时间 s
const SMOKE_DISSIPATE_TIME = 5;    // 消散时间 s
const PARTICLES_PER_CLOUD = 45;    // 每团粒子数
const MAX_CLOUDS = 16;             // 同时存在的烟雾云上限

// 软边缘圆形纹理（canvas 生成，复用）
let _smokeTex = null;
function getSmokeTexture() {
  if (_smokeTex) return _smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(210,210,205,0.85)');
  g.addColorStop(0.3, 'rgba(195,195,190,0.6)');
  g.addColorStop(0.7, 'rgba(180,180,175,0.25)');
  g.addColorStop(1, 'rgba(170,170,165,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _smokeTex = new THREE.CanvasTexture(c);
  return _smokeTex;
}

// 共享弹体几何 & 材质（圆柱形：直径0.05m，长0.15m）
let _shellGeo = null;
let _shellMat = null;
const _cylAxis = new THREE.Vector3(0, 1, 0);
function getShellGeo() {
  if (!_shellGeo) _shellGeo = new THREE.CylinderGeometry(SHELL_RADIUS, SHELL_RADIUS, SHELL_LENGTH, 8);
  return _shellGeo;
}
function getShellMat() {
  if (!_shellMat) _shellMat = new THREE.MeshStandardMaterial({ color: 0x4a4a45, roughness: 0.9 });
  return _shellMat;
}

const _launcherPositions = [];

class SmokeManager {
  constructor(scene) {
    this.scene = scene;
    this.world = null;  // main.js 注入：按地图取高度（小镇含废墟场）
    this.shells = [];   // 飞行中的烟雾弹（含可见 Mesh）
    this.clouds = [];   // 已成形的烟雾云
  }

  // ── 发射烟雾弹（从烟雾发射器位置向上飞） ──
  fire(tank) {
    if (!tank || tank.destroyed) return false;
    if (this.clouds.length >= MAX_CLOUDS) return false;

    // 获取烟雾发射器世界位置
    tank.getSmokeLaunchers(_launcherPositions);
    const launchers = _launcherPositions;

    // 炮塔世界朝向（用于扇形散布方向）
    const turretYaw = tank.turretYaw + tank.heading + (tank.modelYaw || 0);

    for (let i = 0; i < BURST_COUNT; i++) {
      // 从发射器中选一个（轮转）
      const launcher = launchers[i % launchers.length] || launchers[0];

      // 扇形内均匀散布 + 微随机（水平方向偏移）
      const frac = BURST_COUNT === 1 ? 0 : (i / (BURST_COUNT - 1) - 0.5) * 2;
      const spread = frac * BURST_SPREAD + (Math.random() - 0.5) * 0.1;
      const yaw = turretYaw + spread;

      // 仰角 20-30°（斜向：向上 + 向前）
      const pitch = PITCH_MIN + Math.random() * (PITCH_MAX - PITCH_MIN);
      const speed = SHELL_SPEED * (0.9 + Math.random() * 0.2);
      const vh = speed * Math.cos(pitch);   // 水平分量
      const vy = speed * Math.sin(pitch);   // 垂直分量
      const maxDist = SHELL_MAX_DIST + (Math.random() - 0.5) * SHELL_DIST_JITTER * 2;

      const pos = new THREE.Vector3(launcher.x, launcher.y, launcher.z);
      const vel = new THREE.Vector3(Math.sin(yaw) * vh, vy, Math.cos(yaw) * vh);

      // 可见弹体 Mesh（圆柱朝向速度方向）
      const mesh = new THREE.Mesh(getShellGeo(), getShellMat());
      mesh.position.copy(pos);
      mesh.quaternion.setFromUnitVectors(_cylAxis, vel.clone().normalize());
      this.scene.add(mesh);

      this.shells.push({
        pos, vel, age: 0,
        mesh,
        launchX: launcher.x, launchZ: launcher.z,
        maxDist,
      });
    }
    return true;
  }

  // ── 每帧更新 ──
  update(dt) {
    // 更新飞行中的烟雾弹
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.age += dt;

      // 物理：重力 + 轻微空气阻力
      s.vel.y -= 9.8 * dt;
      s.vel.multiplyScalar(1 - 0.08 * dt);
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      // 圆柱体朝向速度方向
      s.mesh.quaternion.setFromUnitVectors(_cylAxis, s.vel.clone().normalize());

      // 生成烟雾条件：水平距离达到目标 / 落地 / 超时
      const horizDist = Math.hypot(s.pos.x - s.launchX, s.pos.z - s.launchZ);
      const gy = this.world ? this.world.groundY(s.pos.x, s.pos.z) : terrainHeight(s.pos.x, s.pos.z);
      if (horizDist >= s.maxDist || s.pos.y <= gy + 0.2 || s.age >= SHELL_LIFETIME) {
        s.pos.y = Math.max(s.pos.y, gy + 0.3);
        this._spawnCloud(s.pos);
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
      }
    }

    // 更新烟雾云
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.age += dt;

      if (c.age >= c.lifetime) {
        this.scene.remove(c.group);
        this.clouds.splice(i, 1);
        continue;
      }

      // 更新半径和透明度
      if (c.age < c.expandTime) {
        const t = c.age / c.expandTime;
        c.r = SMOKE_MAX_R * t;
        c.opacity = 0.65 * t;
      } else if (c.age < c.expandTime + SMOKE_SUSTAIN_TIME) {
        c.r = SMOKE_MAX_R;
        c.opacity = 0.65;
      } else {
        const t = (c.age - c.expandTime - SMOKE_SUSTAIN_TIME) / SMOKE_DISSIPATE_TIME;
        c.r = SMOKE_MAX_R * (1 - t * 0.3);
        c.opacity = 0.65 * (1 - t);
      }

      // 更新粒子位置 & 透明度（烟雾略微下沉）
      for (const p of c.particles) {
        p.sprite.position.set(
          c.pos.x + p.ox + p.driftX * c.age,
          c.pos.y + p.oy + p.sink * c.age,
          c.pos.z + p.oz + p.driftZ * c.age,
        );
        p.sprite.material.opacity = c.opacity * p.alpha;
        const sc = c.r * 0.22 * (1 + p.growth * c.age);
        p.sprite.scale.set(sc, sc, 1);
      }
    }
  }

  // ── 生成烟雾云（大量粒子，0.5-10m 高度区间，深浅灰层次感） ──
  _spawnCloud(pos) {
    const group = new THREE.Group();
    const tex = getSmokeTexture();
    const particles = [];
    const groundY = this.world ? this.world.groundY(pos.x, pos.z) : terrainHeight(pos.x, pos.z);

    for (let i = 0; i < PARTICLES_PER_CLOUD; i++) {
      // 层次感：前30%浅灰，中间40%中灰，后30%深灰
      let grayBase, grayRange;
      const layer = i / PARTICLES_PER_CLOUD;
      if (layer < 0.3) { grayBase = 0.82; grayRange = 0.1; }
      else if (layer < 0.7) { grayBase = 0.68; grayRange = 0.1; }
      else { grayBase = 0.52; grayRange = 0.1; }

      const gray = grayBase + Math.random() * grayRange;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        color: new THREE.Color(gray, gray, gray * 0.96),
      });
      const sprite = new THREE.Sprite(mat);

      // 粒子在水平圆内随机分布
      const theta = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.6) * SMOKE_MAX_R * 0.7;
      const ox = r * Math.cos(theta);
      const oz = r * Math.sin(theta);
      // 高度：1.8-18m 区间内随机（底部密集）
      const heightFrac = Math.pow(Math.random(), 1.5);  // 偏底部
      const oy = 1.8 + heightFrac * 16.2;  // 1.8 ~ 18m

      particles.push({
        sprite, ox, oy, oz,
        sink: -(0.15 + Math.random() * 0.35),     // 负值 → 烟雾下沉向地面
        driftX: (Math.random() - 0.5) * 0.5,
        driftZ: (Math.random() - 0.5) * 0.5,
        growth: 0.015 + Math.random() * 0.025,
        alpha: 0.55 + Math.random() * 0.45,
      });
      group.add(sprite);
    }

    // 烟雾云中心放在地面高度；每团随机展开时间 2-4s
    const cloudPos = new THREE.Vector3(pos.x, groundY, pos.z);
    const expandTime = SMOKE_EXPAND_MIN + Math.random() * (SMOKE_EXPAND_MAX - SMOKE_EXPAND_MIN);
    const lifetime = expandTime + SMOKE_SUSTAIN_TIME + SMOKE_DISSIPATE_TIME;
    this.scene.add(group);
    this.clouds.push({ pos: cloudPos, r: 0, opacity: 0, age: 0, group, particles, expandTime, lifetime });
  }

  // ── 视线是否被烟雾遮挡 ──
  isBlocked(a, b) {
    if (this.clouds.length === 0) return false;
    for (const c of this.clouds) {
      if (c.r < 3) continue;
      if (c.age > c.expandTime + SMOKE_SUSTAIN_TIME) {
        const t = (c.age - c.expandTime - SMOKE_SUSTAIN_TIME) / SMOKE_DISSIPATE_TIME;
        if (Math.random() < t) continue;
      }
      if (this._segSphereHit(a.x, a.z, b.x, b.z, c.pos.x, c.pos.z, c.r)) return true;
    }
    return false;
  }

  _segSphereHit(ax, az, bx, bz, cx, cz, r) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return false;
    const t = ((cx - ax) * dx + (cz - az) * dz) / len2;
    if (t < 0 || t > 1) return false;
    const px = ax + dx * t, pz = az + dz * t;
    return (px - cx) * (px - cx) + (pz - cz) * (pz - cz) < r * r;
  }

  // ── AI 判定：是否应该发射烟雾弹 ──
  shouldAIUse(tank) {
    if (!tank || tank.destroyed) return false;
    if (tank.hp / tank.maxHp > 0.4) return false;
    if (!tank.spotted) return false;
    return Math.random() < 0.15;
  }

  dispose() {
    for (const c of this.clouds) this.scene.remove(c.group);
    for (const s of this.shells) this.scene.remove(s.mesh);
    this.clouds.length = 0;
    this.shells.length = 0;
  }
}

export { SmokeManager };
