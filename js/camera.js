// ═══ 相机装备：近距追尾 / 狙击瞄准镜（变倍）/ 观赏模式 / 后座推镜与抖动 ═══
import * as THREE from 'three';
import { CAMERA } from './config.js';

const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _turretPos = new THREE.Vector3();
const _fwd = new THREE.Vector3();

const damp = THREE.MathUtils.damp;
const clamp = THREE.MathUtils.clamp;

export class CameraRig {
  constructor(camera, groundY) {
    this.camera = camera;
    this.groundY = groundY;
    this.tank = null;

    this.aimYaw = 0;            // 观瞄方位（世界）
    this.aimPitch = -0.04;      // 观瞄俯仰（正 = 抬头）
    this.aimTarget = new THREE.Vector3();   // 准星世界目标点（测距后由 Game 更新）
    this.farPoint = new THREE.Vector3();

    this.aiming = false;        // 狙击镜
    this.orbiting = false;      // C 键观赏模式
    this.dist = CAMERA.chaseDist;
    this.zoomMag = 1;           // 镜内角放大倍率
    this.zoomTarget = 1;
    this.shake = 0;
    this.recoil = 0;            // 开炮后坐推镜
    this.fovCurrent = CAMERA.fov;
    this.pos = new THREE.Vector3();
    this._first = true;
  }

  attach(tank) {
    this.tank = tank;
    this.aimYaw = tank.heading;
    this.aimPitch = -0.04;
    this.aiming = false;
    this.orbiting = false;
    this.dist = CAMERA.chaseDist;
    this.zoomMag = this.zoomTarget = 1;
    tank.root.visible = true;
    this._first = true;
  }

  // 鼠标增量 → 观瞄方向（鼠标右移 = 向右转）
  addAim(dx, dy) {
    this.aimYaw -= dx;
    this.aimPitch = clamp(this.aimPitch - dy, -0.30, 0.42);
  }

  // 追尾距离缩放
  zoom(wheelDir) { this.dist = clamp(this.dist + wheelDir * 1.6, CAMERA.chaseMin, CAMERA.chaseMax); }

  // 瞄准镜变倍（滚轮，乘法步进）
  zoomAim(wheelDir) {
    this.zoomTarget = clamp(this.zoomTarget * (wheelDir < 0 ? 1.25 : 1 / 1.25), 1, CAMERA.aimZoomMax);
  }

  // 炮长镜物理 2 档循环（镜内右键）：3×→10×→3×；档位来自坦克 cfg.zoomSteps（真实瞄具参数）
  cycleZoomSteps() {
    const steps = this.tank && this.tank.cfg && this.tank.cfg.zoomSteps;
    if (!steps || steps.length < 2) return;
    // 找当前倍率最近档 → 切到下一档（保持滚轮自由变倍兼容）
    let nearest = 0, best = Infinity;
    for (let i = 0; i < steps.length; i++) {
      const dd = Math.abs(Math.log(this.zoomTarget / steps[i]));
      if (dd < best) { best = dd; nearest = i; }
    }
    const next = steps[(nearest + 1) % steps.length];
    this.zoomTarget = clamp(next, 1, CAMERA.aimZoomMax);
    return next;
  }

  // 当前镜内 FoV（度）
  aimFovEff() {
    const half = (CAMERA.aimFov * Math.PI / 180) / 2;
    return 2 * Math.atan(Math.tan(half) / this.zoomMag) * 180 / Math.PI;
  }

  setAimMode(on) {
    if (this.orbiting) on = false;
    if (this.aiming === on) return;
    this.aiming = on;
    // 镜内隐藏自车（WoT 式），避免炮塔占据画面
    if (this.tank) this.tank.root.visible = !on;
  }

  toggleOrbit() {
    this.orbiting = !this.orbiting;
    if (this.orbiting) {
      this.setAimMode(false);
      if (this.tank) this.tank.root.visible = true;
    } else {
      if (this.tank) this.aimYaw = this.tank.heading;
      this.aimPitch = -0.04;
      this._first = true;
    }
    return this.orbiting;
  }

  addRecoil(a) { this.recoil = Math.min(this.recoil + a, 1.4); }
  addShake(a) { this.shake = Math.min(this.shake + a, 1.2); }

  // 镜内开火瞬时上跳（直接叠加到观瞄俯仰目标）
  addAimKick(a) { this.aimPitch = clamp(this.aimPitch + a, -0.30, 0.42); }

  aimDirection(out = _fwd) {
    const cp = Math.cos(this.aimPitch);
    return out.set(Math.sin(this.aimYaw) * cp, Math.sin(this.aimPitch), Math.cos(this.aimYaw) * cp);
  }

  update(dt) {
    if (!this.tank) return;
    const tank = this.tank;
    tank.root.updateWorldMatrix(true, true);

    // ── 观赏模式：绕车自由视角 ──
    if (this.orbiting) {
      const cp = Math.cos(this.aimPitch), sp = Math.sin(this.aimPitch);
      _desired.set(
        tank.root.position.x - Math.sin(this.aimYaw) * cp * this.dist,
        tank.root.position.y + 1.6 + sp * this.dist,
        tank.root.position.z - Math.cos(this.aimYaw) * cp * this.dist,
      );
      const gy = this.groundY(_desired.x, _desired.z) + 0.5;
      if (_desired.y < gy) _desired.y = gy;
      this.pos.x = damp(this.pos.x, _desired.x, CAMERA.followLerp, dt);
      this.pos.y = damp(this.pos.y, _desired.y, CAMERA.followLerp, dt);
      this.pos.z = damp(this.pos.z, _desired.z, CAMERA.followLerp, dt);
      this.camera.position.copy(this.pos);
      _look.copy(tank.root.position); _look.y += 1.8;
      this.camera.lookAt(_look);
      this._fovTo(CAMERA.fov, dt);
      return;
    }

    tank.turretGroup.getWorldPosition(_turretPos);
    const aimDir = this.aimDirection(_fwd);

    // 准星远点（1600m），Game 测距后用 aimTarget 覆盖
    this.farPoint.copy(_turretPos).addScaledVector(aimDir, 1600);

    // ── 目标位置 ──
    if (this.aiming) {
      // 狙击镜：炮手瞄具位——炮塔顶上方、略靠前
      _desired.copy(_turretPos).addScaledVector(aimDir, 0.9);
      _desired.y = _turretPos.y + 1.15;
    } else {
      _desired.copy(_turretPos).addScaledVector(aimDir, -this.dist);
      _desired.y += CAMERA.chaseHeight * (this.dist / CAMERA.chaseDist);
    }
    const gy2 = this.groundY(_desired.x, _desired.z) + 0.55;
    if (_desired.y < gy2) _desired.y = gy2;

    // ── 平滑 ──
    const lerpRate = this.aiming ? CAMERA.aimLerp : CAMERA.followLerp;
    if (this._first) { this.pos.copy(_desired); this._first = false; }
    this.pos.x = damp(this.pos.x, _desired.x, lerpRate, dt);
    this.pos.y = damp(this.pos.y, _desired.y, lerpRate, dt);
    this.pos.z = damp(this.pos.z, _desired.z, lerpRate, dt);

    // ── 抖动 ──
    let sx = 0, sy = 0, sz = 0;
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.35;
      sx = (Math.random() - 0.5) * s; sy = (Math.random() - 0.5) * s; sz = (Math.random() - 0.5) * s;
      this.shake = damp(this.shake, 0, 6, dt);
    }

    // ── 开炮后坐：相机短暂后拉 + FoV 微冲 ──
    if (this.recoil > 0.001) this.recoil = damp(this.recoil, 0, 9, dt);
    const rb = this.recoil * 0.32;   // 现代火控防抖：镜内后坐后拉下调
    this.camera.position.set(
      this.pos.x + sx - aimDir.x * rb,
      this.pos.y + sy - aimDir.y * rb,
      this.pos.z + sz - aimDir.z * rb,
    );

    // ── 注视：永远看向观瞄方向远处（保证屏幕中心射线方向 == aimDir） ──
    if (this.aiming) {
      _look.copy(this.camera.position).addScaledVector(aimDir, 60);
    } else {
      _look.copy(this.camera.position).addScaledVector(aimDir, 40);
    }
    this.camera.lookAt(_look);

    // ── 镜内稳定器微幅残余（~1Hz）：姿态由 aimDir 决定，悬挂高频本就不传导；
    //    仅保留发动机/车速驱动的微幅摆动，模拟稳定器残差 ──
    if (this.aiming) {
      this._wobT = (this._wobT || 0) + dt;
      const thr = Math.abs(tank.throttle || 0);
      const spdN = Math.min(Math.abs(tank.speed) / (tank.cfg.maxSpeed || 16), 1);
      const eng = 0.00005 + thr * 0.0009 + spdN * 0.0014;   // 电子稳定器：静止近零（无呼吸感），机动保留残差
      this.camera.rotateX(Math.sin(this._wobT * 7.3) * eng);
      this.camera.rotateZ(Math.sin(this._wobT * 5.1 + 1.7) * eng * 0.8);
    }

    // ── FoV（镜内按变倍收敛） ──
    if (Math.abs(this.zoomMag - this.zoomTarget) > 1e-3) this.zoomMag = damp(this.zoomMag, this.zoomTarget, 12, dt);
    else this.zoomMag = this.zoomTarget;
    this._fovTo((this.aiming ? this.aimFovEff() : CAMERA.fov) + this.recoil * 1.1, dt);
  }

  _fovTo(target, dt) {
    this.fovCurrent = damp(this.fovCurrent, target, 12, dt);
    if (Math.abs(this.fovCurrent - this.camera.fov) > 0.01) {
      this.camera.fov = this.fovCurrent;
      this.camera.updateProjectionMatrix();
    }
  }
}
