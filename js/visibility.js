// ═══ 点亮系统：视线检测 + 发现/失联状态管理 ═══

import { terrainHeight } from './terrain.js';   // 仅作缺省回退（World 未提供 groundY 时）

const SIGHT_RANGE = 1000;      // 观察距离 m（拟真：1000m 可见，移动观察者 +100）
const DETECT_INTERVAL = 0.3;   // 检测频率 s
const SPOT_HOLD = 3;           // 点亮保持 s（失去视线后）
const LOST_DURATION = 7;       // 失联持续 s
const DETECT_DELAY = 0.5;      // 发现延迟 s
const FIRE_EXPOSE_RANGE = 1400; // 开火暴露距离 m（>观察距离：炮口焰/声响视距）
const FIRE_EXPOSE_TIME = 3;    // 开火暴露持续 s
const MOVE_BONUS = 100;        // 移动被点亮距离加成 m
const TERRAIN_STEP = 4;        // 地形步进 m

const _v1 = new Float32Array(3);

class VisibilityManager {
  constructor(world) {
    this.world = world;
    this.obstacles = world.obstacles || [];
    this.smoke = null;             // SmokeManager 引用
    this.timer = 0;
    this.states = new Map();       // tank → state object
  }

  // 当前地图高度采样（含小镇废墟场）；无 world 时回退平原公式
  _gy(x, z) { return this.world && this.world.groundY ? this.world.groundY(x, z) : terrainHeight(x, z); }

  setSmokeManager(smoke) { this.smoke = smoke; }

  // 初始化/获取坦克状态
  _st(tank) {
    let s = this.states.get(tank);
    if (!s) {
      s = {
        spotted: false,
        spotTimer: 0,
        lostContact: false,
        lostTimer: 0,
        detectTimer: 0,
        detecting: false,
        exposedTimer: 0,
        lastKnownPos: null,
        lastKnownHeading: 0,
      };
      this.states.set(tank, s);
    }
    return s;
  }

  // ── 开火暴露：开火后所有 800m 内敌方点亮此坦克 3s ──
  onFire(tank, allTanks) {
    const s = this._st(tank);
    s.exposedTimer = FIRE_EXPOSE_TIME;
    // 检查是否有附近敌方能使本坦克暴露
    let exposed = false;
    for (const other of allTanks) {
      if (other === tank || other.destroyed) continue;
      const d = tank.pos.distanceTo(other.pos);
      if (d < FIRE_EXPOSE_RANGE) { exposed = true; break; }
    }
    if (exposed) {
      s.spotted = true;
      s.spotTimer = Math.max(s.spotTimer, FIRE_EXPOSE_TIME);
      s.lostContact = false;
      s.lastKnownPos = tank.pos.clone();
      s.lastKnownHeading = tank.heading;
    }
  }

  // ── 视线检测：a 能否看到 b ──
  canSee(a, b) {
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SIGHT_RANGE) return false;

    // 车长塔眼高（车体高 + 0.5m）
    const ay = this._gy(a.pos.x, a.pos.z) + a.cfg.dims.hullHeight + 0.5;
    const by = this._gy(b.pos.x, b.pos.z) + b.cfg.dims.hullHeight + 0.5;
    return this._los(a.pos.x, a.pos.z, ay, b.pos.x, b.pos.z, by, !!(a.thermalOn && a.cfg.thermal));
  }

  // ── M2：从任意点（指定眼高）能否看到目标坦克（掩体评分用；无距离上限，调用方自控） ──
  canSeePoint(x, z, eyeH, target) {
    const by = this._gy(target.pos.x, target.pos.z) + target.cfg.dims.hullHeight + 0.5;
    return this._los(x, z, eyeH, target.pos.x, target.pos.z, by, false);
  }

  // ── 视线核心：地形步进 + 障碍圆 + 烟雾（smokeIgnore = 观察者热像穿烟豁免） ──
  _los(ax, az, ay, bx, bz, by, smokeIgnore) {
    // 地形步进遮挡检测
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist / TERRAIN_STEP);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = ay + (by - ay) * t;
      if (this._gy(x, z) > y) return false;
    }

    // 障碍物遮挡检测（仅检查线段附近的）
    for (const obs of this.obstacles) {
      if (this._segCircleHit(ax, az, bx, bz, obs.x, obs.z, obs.r + 1))
        return false;
    }

    // 烟雾云遮挡检测
    if (this.smoke && !smokeIgnore && this.smoke.isBlocked({ x: ax, z: az }, { x: bx, z: bz })) return false;

    return true;
  }

  // 线段与圆相交判定（2D）
  _segCircleHit(ax, az, bx, bz, cx, cz, r) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return false;
    const t = ((cx - ax) * dx + (cz - az) * dz) / len2;
    if (t < 0 || t > 1) return false;
    const px = ax + dx * t, pz = az + dz * t;
    return (px - cx) * (px - cx) + (pz - cz) * (pz - cz) < r * r;
  }

  // ── 每帧更新 ──
  update(dt, tanks) {
    this.timer += dt;

    // 衰减暴露计时器
    for (const [tank, s] of this.states) {
      if (s.exposedTimer > 0) s.exposedTimer -= dt;
    }

    // 低频视线检测
    if (this.timer >= DETECT_INTERVAL) {
      this.timer = 0;
      this._detect(tanks);
    }

    // 每帧更新状态衰减
    for (const [tank, s] of this.states) {
      if (tank.destroyed) continue;

      // 点亮保持衰减（每帧递减，_detect 负责状态转换）
      if (s.spotTimer > 0) s.spotTimer -= dt;

      // 失联衰减
      if (s.lostTimer > 0) {
        s.lostTimer -= dt;
        if (s.lostTimer <= 0) s.lostContact = false;
      }

      // 同步到 tank 上的简化字段
      tank.spotted = s.spotted;
      tank.lostContact = s.lostContact;
      if (s.spotted) {
        s.lastKnownPos = tank.pos.clone();
        s.lastKnownHeading = tank.heading;
      }
      tank.lastKnownPos = s.lastKnownPos;
      tank.lastKnownHeading = s.lastKnownHeading;
    }
  }

  // ── 视线检测核心（每 0.3s 调用） ──
  _detect(tanks) {
    const alive = tanks.filter(t => !t.destroyed);

    for (const a of alive) {
      for (const b of alive) {
        if (a === b) continue;
        const sb = this._st(b);

        // a 观察距离加成（移动 +100m）
        const sightBonus = Math.abs(a.speed) > 1 ? MOVE_BONUS : 0;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > SIGHT_RANGE + sightBonus) continue;

        // 视线检测
        const canSee = this.canSee(a, b);

        if (canSee) {
          if (sb.detecting) {
            // 发现延迟中，继续计时
            sb.detectTimer -= DETECT_INTERVAL;
            if (sb.detectTimer <= 0) {
              // 延迟结束，正式点亮
              sb.spotted = true;
              sb.spotTimer = SPOT_HOLD;
              sb.lostContact = false;
              sb.detecting = false;
            }
          } else if (!sb.spotted) {
            // 首次发现，开始延迟
            sb.detecting = true;
            sb.detectTimer = DETECT_DELAY;
          } else {
            // 已点亮，刷新保持时间
            sb.spotTimer = SPOT_HOLD;
          }
        } else {
          // 看不到
          if (sb.detecting) sb.detecting = false;
          // 点亮保持结束 → 进入失联
          if (sb.spotted && sb.spotTimer <= 0) {
            sb.spotted = false;
            sb.lostContact = true;
            sb.lostTimer = LOST_DURATION;
          }
        }
      }
    }
  }

  // ── 查询某坦克是否被点亮（供 AI/minimap/ui 使用） ──
  isSpotted(tank) {
    const s = this.states.get(tank);
    return s ? (s.spotted || s.exposedTimer > 0) : false;
  }

  isLostContact(tank) {
    const s = this.states.get(tank);
    return s ? s.lostContact : false;
  }

  getLastKnown(tank) {
    const s = this.states.get(tank);
    if (!s || !s.lastKnownPos) return null;
    return { pos: s.lastKnownPos, heading: s.lastKnownHeading };
  }

  dispose() {
    this.states.clear();
  }
}

export { VisibilityManager };