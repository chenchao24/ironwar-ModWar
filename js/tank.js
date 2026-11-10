// ═══ 坦克：GLB 部件拆分（炮塔/炮管/轮履）、行驶物理、装甲命中判定、损伤状态 ═══
import * as THREE from 'three';
import { ZONE_DAMAGE_MULT, FIRE_DOT_DPS, FIRE_DURATION, GAME, MODULE_RULES, SHELL_TYPES, buildShellLoadout, ERA_TYPES, APS_RULES, APS_TYPES, SENSOR_RULES, LWS_RULES } from './config.js';
import { applyCamo } from './camo.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

// 角度工具
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function approachAngle(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  return cur + THREE.MathUtils.clamp(d, -maxStep, maxStep);
}

export class Tank {
  /**
   * @param cfg      config.js 中 TANKS 条目
   * @param gltfScene 已加载的 gltf.scene
   * @param world    World 实例（地形高度/碰撞）
   */
  constructor(cfg, gltfScene, world) {
    this.cfg = cfg;
    this.world = world;

    // ── 层级：root(世界,米) → model(缩放) → 各部件组 ──
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.model.scale.setScalar(cfg.scale);
    this.model.add(gltfScene);
    this.root.add(this.model);

    // 模型朝向预烘焙：forwardAxis '+x' 的模型绕Y -90° 烘焙到 +Z 朝前（之后所有逻辑按 +Z）
    if (cfg.forwardAxis === '+x') {
      gltfScene.rotation.y = -Math.PI / 2;
      gltfScene.updateMatrixWorld(true);
      for (const child of gltfScene.children) {
        child.matrix.copy(child.matrixWorld);
        child.matrix.decompose(child.position, child.quaternion, child.scale);
      }
      gltfScene.rotation.y = 0;
      gltfScene.updateMatrixWorld(true);
    }
    // forwardAxis '+y'：模型 +Y 朝前、+Z 朝上 → 绕X -90° 再绕Y 180° 烘焙到 +Z 朝前、+Y 朝上
    if (cfg.forwardAxis === '+y') {
      gltfScene.rotation.set(-Math.PI / 2, Math.PI, 0, 'YXZ');
      gltfScene.updateMatrixWorld(true);
      for (const child of gltfScene.children) {
        child.matrix.copy(child.matrixWorld);
        child.matrix.decompose(child.position, child.quaternion, child.scale);
      }
      gltfScene.rotation.set(0, 0, 0);
      gltfScene.updateMatrixWorld(true);
    }
    // bakeY180：模型前后反 180°，绕 Y 轴烘焙到 +Z 朝前
    if (cfg.bakeY180) {
      gltfScene.rotation.y = Math.PI;
      gltfScene.updateMatrixWorld(true);
      for (const child of gltfScene.children) {
        child.matrix.copy(child.matrixWorld);
        child.matrix.decompose(child.position, child.quaternion, child.scale);
      }
      gltfScene.rotation.set(0, 0, 0);
      gltfScene.updateMatrixWorld(true);
    }
    // bakeX90：根节点 matrix 将 +Z→+Y、+Y→-Z，绕 X 轴 +90° 烘焙还原到 +Z 朝前 +Y 朝上
    if (cfg.bakeX90) {
      gltfScene.rotation.x = Math.PI / 2;
      gltfScene.updateMatrixWorld(true);
      for (const child of gltfScene.children) {
        child.matrix.copy(child.matrixWorld);
        child.matrix.decompose(child.position, child.quaternion, child.scale);
      }
      gltfScene.rotation.set(0, 0, 0);
      gltfScene.updateMatrixWorld(true);
    }

    // 模型 Y 偏移（履带底部抬高到地面）
    if (cfg.modelYOffset) {
      this.model.position.y = cfg.modelYOffset * cfg.scale;
    }

    // 材质独立化（便于烧毁变色/履带滚动）
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone()) : o.material.clone();
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    // 内部件染色：部分模型内衬贴图为白色，从舱口/炮塔缝穿帮 → 染成与车体接近的颜色（与贴图相乘）
    if (cfg.interiorTint) {
      this.model.traverse((o) => {
        if (!o.isMesh || !/interior|internal/i.test(o.name)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.color.set(cfg.interiorTint);
      });
    }

    // 程序化迷彩（素模车：cfg.camo 指定方案；履带网格名单不上迷彩）
    if (cfg.camo) applyCamo(this.model, cfg.camo, cfg.parts.track || []);

    this._splitParts(gltfScene);

    // ── 运动状态 ──
    this.pos = new THREE.Vector3();
    this.heading = 0;            // 车体朝向（绕 y，0 = +z）
    this.speed = 0;              // 带符号 m/s
    this.throttle = 0;
    this.steer = 0;
    this.pitch = 0;              // 地形姿态
    this.roll = 0;
    // ── 驾驶/悬挂状态 ──
    this.clutchT = 0;            // 离合器接合计时
    this.accelSm = 0;            // 平滑纵向加速度（悬挂俯仰用）
    this.time = 0;               // 累计行驶时间（颠簸相位）
    this.bumpPhase = Math.random() * 100;   // 每车随机固定颠簸相位
    this.susPitch = 0; this.susPitchV = 0;  // 悬挂附加姿态（相对地形）
    this.susRoll = 0; this.susRollV = 0;
    this.startK = 0;             // 起步浓烟工况 0~1（main 排气用）

    // ── 炮塔状态 ──
    this.turretYaw = 0;
    this.gunPitch = 0;           // 正 = 抬升
    this.recoil = 0;
    this.barrelBasePos = this.barrelGroup.position.clone();
    this.aimPoint = new THREE.Vector3();   // 世界瞄准点（伺服目标）
    this.aimOffset = 0;          // 炮线与瞄准点角差（供 AI/散布）

    // ── 火控 ──
    this.reload = 0;             // 剩余装填时间
    this.dispersion = cfg.dispersion * 4;  // 当前散布 rad（会收敛）

    // ── 战斗状态 ──
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.burning = 0;            // 剩余起火时间
    this.destroyed = false;
    this.ammoDetonated = false;
    this.turretFly = null;
    // ── 点亮状态（由 VisibilityManager 管理） ──
    this.spotted = false;        // 被点亮
    this.lostContact = false;    // 失联（显示最后已知位置）
    this.lastKnownPos = null;    // 最后已知位置
    this.lastKnownHeading = 0;   // 最后已知朝向
    // ── 烟雾弹 ──
    this.smokeAmmo = 3;          // 剩余烟雾弹发射次数（每次4发）
    this.smokeCooldown = 0;      // 发射冷却
    // ── 模块负面状态（剩余秒；0 = 正常）──
    this.mods = { tracks: 0, engine: 0, ring: 0, loader: 0 };
    this.reloadMult = 1;         // 装弹机受损装填倍率（1.4 → 封顶 1.8）
    this.dustTimer = 0;
    this.exhaustTimer = 0;
    // ── 物件音效状态 ──
    this._ramHit = null;       // 本帧撞击障碍物 { time, impact, type }（drive 记录，update 播声）
    this.ramCd = 0;            // 撞击碰撞音冷却
    this.rubbleCd = 0;        // 碾废墟音冷却
    // ── 坦克间碰撞（OBB 近似：车体旋转矩形，车长×车宽） ──
    this.colHalfW = (cfg.dims.width + 0.25) / 2;    // 半宽（含履带余量）
    this.colHalfL = (cfg.dims.length + 0.25) / 2;  // 半长
    // ── 特效状态（effects 在每帧 update 注入） ──
    this.effects = null;
    this.evacT = 0;            // 火药残烟延时（开炮 0.5s 后炮口喷烟）
    this.barrelSmokeT = 0;     // 炮管余烟窗口
    this._bsAcc = 0;
    this.holeSmoke = null;     // 击穿孔冒烟 { local: root 局部坐标, t }
    this._hsAcc = 0;
    this.jetFireT = 0;         // 殉爆座圈喷火剩余时间（不飞炮塔的分支）
    this.jetFireDir = null;
    this.jetFirePos = null;
    this._jetAcc = 0;
    this.mgAuto = false;          // 机枪自动射击
    this.mgTimer = 0;             // 机枪射击节流
    this.mgAmmo = (cfg.mg && cfg.mg.ammoMax) || 2000;
    this.mgAmmoMax = this.mgAmmo;
    // ── 弹种池：AP/HEAT/HE 各自携带量（切弹不共享弹药） ──
    this.shellPool = buildShellLoadout(cfg.shellAmmoMax || 30);
    this.shellType = 'ap';        // 当前装填弹种
    this.shellAmmoMax = cfg.shellAmmoMax || 30;
    this.mgYaw = 0;               // 机枪独立方位（相对炮塔局部）
    this.modelYaw = 0;            // 预烘焙已处理朝向，model 不再旋转
    // ── 消耗品：维修包 / 灭火器（每场各 1） ──
    this.consumables = { repair: 1, ext: 1 };
    // ── 防护体系：爆反 / APS / 观瞄（外露子系统，可被机枪·机炮扫伤；不打 HP） ──
    this.mgCaliber = cfg.mgCaliber || null;
    this.era = null;
    if (cfg.era) {
      this.era = { type: cfg.era.type, plates: { ...cfg.era.plates }, base: { ...cfg.era.base }, _acc: {} };
    }
    this.aps = null;
    if (cfg.aps) {
      const apsRules = APS_TYPES[cfg.aps.type] || APS_TYPES.trophy;
      this.aps = {
        model: cfg.aps.model, type: apsRules.name, rules: apsRules,
        charges: apsRules.charges, cooldown: 0,
        radarHp: apsRules.radarHp > 0 ? apsRules.radarHp : 0,   // 0 = 分布式传感（无雷达阵）
      };
    }
    // ── 激光压制系统（99A/T-90 系；压制器冷却+毁伤。suppressT 全车通用：被致盲剩余时间） ──
    this.suppressT = 0;
    this.lws = null;
    if (cfg.lws) {
      this.lws = { model: cfg.lws.model, cooldown: 0, emitterHp: LWS_RULES.emitterHp };
    }
    this.optics = { hp: SENSOR_RULES.opticsHp };   // 观瞄镜组（分级：完好 / 损伤 / 损毁）
    this.opticsMult = 1;                            // 观瞄散布倍率（损伤×2 / 损毁×8）
  }

  _splitParts(sceneRoot) {
    const cfg = this.cfg;
    const findMeshes = (names, flatten = false) => {
      const out = [];
      for (const n of names) {
        const o = this.model.getObjectByName(n);
        if (o) {
          if (flatten && !o.isMesh) {
            o.traverse((c) => { if (c.isMesh) out.push(c); });
          } else {
            out.push(o);
          }
        }
      }
      return out;
    };

    // 固定到车体件（不随炮塔转，先脱离原父挂到 model）
    if (cfg.parts.fixedToHull) {
      this.model.updateMatrixWorld(true);
      for (const n of cfg.parts.fixedToHull) {
        const o = sceneRoot.getObjectByName(n);
        if (o) this.model.attach(o);
      }
    }

    // 炮塔组（枢轴在模型局部坐标）
    this.turretGroup = new THREE.Group();
    this.turretGroup.position.fromArray(cfg.turretPivot);
    this.model.add(this.turretGroup);
    const turretMeshes = findMeshes(cfg.parts.turret);
    for (const m of turretMeshes) this.turretGroup.attach(m);

    // 炮管组（挂在炮塔组内，随炮塔旋转 + 独立俯仰）
    this.barrelGroup = new THREE.Group();
    this.barrelGroup.position.fromArray(cfg.barrelPivot).sub(this.turretGroup.position);
    this.turretGroup.add(this.barrelGroup);
    for (const m of findMeshes(cfg.parts.barrel)) this.barrelGroup.attach(m);

    // 机枪组（车长塔高射机枪，挂炮塔组，独立 yaw 伺服）
    this.mgGroup = null;
    this.mgMuzzleLocal = null;
    this.mgFlip = 1;              // 机枪网格朝向：-1 = 模型出厂朝后收纳（T-72 NSVT）
    this.mgBaseYaw = 0;           // 伺服基础偏航（翻转件为 π）
    if (cfg.parts.mg && cfg.parts.mg.length) {
      const mgMeshes = findMeshes(cfg.parts.mg);
      if (mgMeshes.length) {
        this.mgGroup = new THREE.Group();
        this.turretGroup.add(this.mgGroup);
        this.model.updateMatrixWorld(true);
        mgMeshes[0].getWorldPosition(_v1);
        // 伺服支点兜底：合并网格导出（WT OBJ 类）的节点原点在模型原点（单位 TRS）。
        // 首件机枪网格约定为枪架/支座件：原点不在机枪包围盒内时，用首件包围盒底面中心
        // （= 枪架回转中心，而非整组包围盒中心——后者会落在枪管中段，旋转时整枪甩出炮塔）
        const _mgBox = new THREE.Box3();
        for (const m of mgMeshes) _mgBox.expandByObject(m);
        if (!_mgBox.containsPoint(_v1)) {
          const _mg0 = new THREE.Box3().setFromObject(mgMeshes[0]);
          _v1.set((_mg0.min.x + _mg0.max.x) / 2, _mg0.min.y, (_mg0.min.z + _mg0.max.z) / 2);
        }
        this.turretGroup.worldToLocal(_v1);
        this.mgGroup.position.copy(_v1);
        for (const m of mgMeshes) this.mgGroup.attach(m);
        // 自动推算枪口局部位置：机枪包围盒最前（+Z）+ 上部高度；翻转件枪口在 -Z
        if (cfg.mgFlipY) { this.mgFlip = -1; this.mgBaseYaw = Math.PI; }
        this.mgGroup.rotation.set(0, 0, 0);
        this.model.updateMatrixWorld(true);
        const _box = new THREE.Box3().setFromObject(this.mgGroup);
        const _mn = _box.min.clone(), _mx = _box.max.clone();
        this.mgGroup.worldToLocal(_mn);
        this.mgGroup.worldToLocal(_mx);
        this.mgMuzzleLocal = new THREE.Vector3(
          (_mn.x + _mx.x) * 0.5,
          _mn.y + (_mx.y - _mn.y) * 0.72,
          this.mgFlip > 0 ? _mx.z : _mn.z
        );
      }
    } else if (cfg.mgMuzzleLocal) {
      // 虚拟机枪：无单独 mesh 节点，用配置位置创建枪口点
      this.mgGroup = new THREE.Group();
      this.turretGroup.add(this.mgGroup);
      this.mgGroup.position.fromArray(cfg.mgMuzzleLocal).sub(this.turretGroup.position);
      this.mgMuzzleLocal = new THREE.Vector3(0, 0, 0);
    }

    // 隐藏件
    if (cfg.parts.hidden) {
      for (const n of cfg.parts.hidden) {
        const o = this.root.getObjectByName(n);
        if (o) o.visible = false;
      }
    }

    // 负重轮（独立网格才建枢轴旋转；单一整体网格不能转）
    this.wheelGroups = [];
    if (cfg.wheelsRotate !== false) {
      for (const m of findMeshes(cfg.parts.wheels)) {
        const box = new THREE.Box3().setFromObject(m);
        const center = box.getCenter(new THREE.Vector3());
        const g = new THREE.Group();
        g.position.copy(center);
        this.model.add(g);
        g.attach(m);
        this.wheelGroups.push({ group: g, radius: Math.max((box.max.y - box.min.y) / 2, 0.2) });
      }
    }

    // 履带：克隆贴图以便 UV 滚动
    this.trackMaterials = [];
    for (const m of findMeshes(cfg.parts.track, true)) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (mat.map) {
          mat.map = mat.map.clone();
          mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
          this.trackMaterials.push(mat.map);
        }
      }
    }
  }

  dispose() {
    this.model.traverse((o) => {
      if (o.isMesh) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    for (const tex of this.trackMaterials || []) tex.dispose();
  }

  place(x, z, headingDeg) {
    this.pos.set(x, 0, z);
    this.heading = THREE.MathUtils.degToRad(headingDeg);
    this._syncTransform(1);
  }

  // ─────────────── 坦克间碰撞（旋转矩形 OBB / SAT） ───────────────
  // 与另一辆坦克求解碰撞：重叠时沿最小穿透轴分离（质量加权）+ 对冲掉速。
  // 返回碰撞法线（this 受推方向）或 null。
  collideTank(other) {
    const dx = other.pos.x - this.pos.x;
    const dz = other.pos.z - this.pos.z;
    if (Math.abs(dx) > 14 || Math.abs(dz) > 14) return null;  // 粗剔除
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const oh = Math.sin(other.heading), oc = Math.cos(other.heading);
    // 车轴单位向量（车长方向 = 航向；车宽方向 = 右侧向）
    const axes = [
      [sh, ch], [-ch, sh],          // this 的长/宽轴
      [oh, oc], [-oc, oh],          // other 的长/宽轴
    ];
    let best = { pen: Infinity, nx: 0, nz: 0 };
    for (const [ax, az] of axes) {
      const rA = this.colHalfL * Math.abs(sh * ax + ch * az) + this.colHalfW * Math.abs(-ch * ax + sh * az);
      const rB = other.colHalfL * Math.abs(oh * ax + oc * az) + other.colHalfW * Math.abs(-oc * ax + oh * az);
      const dist = dx * ax + dz * az;
      const pen = rA + rB - Math.abs(dist);
      if (pen <= 0) return null;      // 分离轴找到 → 不碰撞
      if (pen < best.pen) {
        const s = dist >= 0 ? 1 : -1; // 分离方向：把 this 推离 other
        best = { pen, nx: ax * s, nz: az * s };
      }
    }
    // 质量加权分离（重的少动）
    const mA = this.cfg.mass, mB = other.cfg.mass;
    const wA = mB / (mA + mB), wB = mA / (mA + mB);
    this.pos.x -= best.nx * best.pen * wA;
    this.pos.z -= best.nz * best.pen * wA;
    other.pos.x += best.nx * best.pen * wB;
    other.pos.z += best.nz * best.pen * wB;
    // 对冲掉速：沿碰撞法线的速度分量清零（近似，撞后互弹小回弹）
    const relV = other.speed * (oc * best.nx + oh * best.nz) - this.speed * (ch * best.nx + sh * best.nz);
    if (relV < 0) {  // 正在接近
      const bounce = Math.min(0.35, -relV * 0.25);
      this.speed += (ch * best.nx + sh * best.nz) * bounce * -1 * wA * 2;
      other.speed += (oc * best.nx + oh * best.nz) * bounce * wB * 2;
    }
    return best;
  }

  // ─────────────── 行驶（离合器 + 功率曲线手感） ───────────────
  drive(dt, throttle, steer, brake) {
    const cfg = this.cfg;
    if (this.destroyed) { throttle = 0; steer = 0; brake = true; }
    this.throttle = throttle;
    this.steer = steer;
    this.time += dt;
    const prevSpeed = this.speed;

    // ── 纵向动力 ──
    if (brake) {
      // 刹车：线性减速，过零停死
      const dec = cfg.brakeDecel * dt;
      this.speed = Math.abs(this.speed) <= dec ? 0 : this.speed - Math.sign(this.speed) * dec;
      this.clutchT = 0;
    } else if (throttle !== 0 && Math.sign(throttle) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.5) {
      // 行驶中反向踩油门 = 反接制动
      const s = Math.sign(this.speed);
      this.speed -= s * cfg.brakeDecel * 0.7 * dt;
      if (Math.sign(this.speed) !== s) this.speed = 0;
      this.clutchT = 0;
    } else if (throttle !== 0) {
      // 离合器渐进接合（起步半联动肉感）+ 功率曲线（高速衰减）
      this.clutchT += dt;
      const clutch = Math.min(1, 0.35 + (this.clutchT / cfg.clutchDelay) * 0.65);
      const vRatio = Math.min(1, Math.abs(this.speed) / cfg.maxSpeed);
      const engK = this.mods.engine > 0 ? 0.5 : 1;      // 发动机受损：功率减半
      const power = cfg.enginePower * Math.abs(throttle) * clutch * engK *
                    (1 - Math.pow(vRatio, 0.9) * cfg.powerFalloff);
      const dir = throttle > 0 ? 1 : -1;
      this.speed += dir * power * dt;
      // 极速硬封顶（断履带：极速 ×0.3）
      const cap = (dir > 0 ? cfg.maxSpeed : cfg.revSpeed) * (this.mods.tracks > 0 ? 0.3 : 1);
      if (dir > 0 && this.speed > cap) this.speed = cap;
      if (dir < 0 && this.speed < -cap) this.speed = -cap;
    } else {
      // 引擎制动：松油后线性减速到 0
      const s = Math.sign(this.speed);
      const dec = cfg.engineBrake * dt;
      this.speed = Math.abs(this.speed) > dec ? this.speed - s * dec : 0;
      this.clutchT = 0;
    }

    // ── 坡度阻力：重力沿坡分量（上坡减速/下坡助滑；松油过陡则溜坡） ──
    // 约定：this.pitch < 0 = 上坡抬头 → slopeAcc < 0 向后拉
    const slopeAcc = Math.sin(this.pitch) * 9.8 * cfg.slopePower;
    this.speed += slopeAcc * dt;
    // 驻车：松油 + 低速 + 坡度可克服时停死
    if (Math.abs(throttle) < 0.05 && Math.abs(this.speed) < 0.25 && Math.abs(slopeAcc) < 3) this.speed = 0;

    // 转向：高速衰减 + 转向掉速 + 倒车镜像（断履带：转向 ×0.35）
    const speedFactor = 0.2 + 0.45 * Math.min(Math.abs(this.speed) / 6, 1);
    const yawRate = steer * cfg.hullTraverse * speedFactor * (this.mods.tracks > 0 ? 0.35 : 1);
    if (Math.abs(this.speed) > 0.1 || Math.abs(yawRate) > 0.01) {
      this.heading += yawRate * dt * (this.speed < -0.2 ? -1 : 1);
    }
    if (Math.abs(steer) > 0.15 && Math.abs(this.speed) > 1) {
      this.speed *= 1 - cfg.turnDrag * Math.abs(steer) * dt;
    }

    // 位移 + 障碍推挤（速度收敛到实际位移：擦碰滑行、正撞急停）
    _v1.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const px0 = this.pos.x, pz0 = this.pos.z;
    this.pos.addScaledVector(_v1, this.speed * dt);
    this.world.resolveCollision(this.pos, 2.2);
    const wantD = Math.abs(this.speed) * dt;
    if (wantD > 1e-6) {
      const gotD = Math.hypot(this.pos.x - px0, this.pos.z - pz0);
      // 撞上障碍物（推挤后实际位移明显缩水）：记下撞击强度与目标类型，update() 里播碰撞音
      const blockedOb = this.world.lastBlocked;
      if (blockedOb && wantD > 0.015 && gotD < wantD * 0.6 && Math.abs(this.speed) > 0.8) {
        this._ramHit = { time: this.time, impact: Math.abs(this.speed), type: blockedOb.d ? blockedOb.d.type : null };
      }
      if (gotD < wantD) this.speed = Math.sign(this.speed) * gotD / dt;
    }

    // 纵向加速度记录（平滑，供悬挂俯仰；起步瞬间冲量 ×1.4）
    const acc = (this.speed - prevSpeed) / Math.max(dt, 1e-4);
    if (Math.abs(this.speed) > 0 && Math.abs(prevSpeed) <= 0) {
      this.accelSm += (acc * 1.4 - this.accelSm) * Math.min(1, dt * 4.5);
    } else {
      this.accelSm += (acc - this.accelSm) * Math.min(1, dt * 4.5);
    }

    this._syncTransform(dt);
  }

  _syncTransform(dt) {
    // 防御：战斗切换/退出瞬间 world 可能已被 dispose（menuTank 展示路径），退化为平地
    const gh = this.world && this.world.groundY ? this.world.groundY : (() => 0);

    // 地形姿态：采样两侧履带前后接地点（对称平面拟合 = 四点最小二乘，扭转地形整体贴合）
    // 旧实现只采中线上前后/左右四点，无法表达横向扭转 → 单侧履带悬空；垂直基准单点 → 扭曲处偏沉
    const cfgD = this.cfg.dims;
    const f = cfgD.length * 0.27;                                   // 履带接地段半长
    const w = Math.max(1.2, cfgD.width / 2 - (this.cfg.trackWidth || 0.6) / 2);   // 履带中心半距
    const sx = Math.sin(this.heading), cz = Math.cos(this.heading);
    const px = Math.cos(this.heading), pz = -Math.sin(this.heading);   // 右向单位向量
    const hFL = gh(this.pos.x + sx * f - px * w, this.pos.z + cz * f - pz * w);   // 左前
    const hFR = gh(this.pos.x + sx * f + px * w, this.pos.z + cz * f + pz * w);   // 右前
    const hBL = gh(this.pos.x - sx * f - px * w, this.pos.z - cz * f - pz * w);   // 左后
    const hBR = gh(this.pos.x - sx * f + px * w, this.pos.z - cz * f + pz * w);   // 右后
    const frontAvg = (hFL + hFR) / 2, rearAvg = (hBL + hBR) / 2;
    const leftAvg = (hFL + hBL) / 2, rightAvg = (hFR + hBR) / 2;
    const targetPitch = Math.atan2(rearAvg - frontAvg, f * 2);
    const targetRoll = Math.atan2(leftAvg - rightAvg, w * 2);
    const k = dt >= 1 ? 1 : 1 - Math.exp(-8 * dt);
    this.pitch += (targetPitch - this.pitch) * k;
    this.roll += (targetRoll - this.roll) * k;

    const hC = (hFL + hFR + hBL + hBR) / 4;   // 四接地点均值 = 拟合平面中心高（含路面抬高）

    // ── 悬挂：弹簧-阻尼姿态（加速度俯仰 + 转向侧倾 + 分频颠簸 + 怠速抖动） ──
    const cfg = this.cfg;
    const spd = Math.abs(this.speed);
    let tPitch = -this.accelSm * 0.0068;                                  // 急加速抬头/刹车点头
    let tRoll = -this.steer * Math.min(spd / cfg.maxSpeed, 1) * 0.5 * 0.075; // 转向侧倾
    const roadK = (this.world && this.world.isOnRoad) ? this.world.isOnRoad(this.pos.x, this.pos.z) : 1;
    const bump = spd * 0.0012 * roadK;                                    // 行驶颠簸（铺装路 ×0.2 / 路肩 ×0.5 / 土路 ×1）
    const t = this.time;
    tPitch += (Math.sin(t * 11.3 + this.bumpPhase) + Math.sin(t * 6.1) * 0.6) * bump;
    tRoll += (Math.sin(t * 9.7 + this.bumpPhase * 2) + Math.sin(t * 14.3) * 0.5) * bump;
    const idle = 0.0014 + Math.abs(this.throttle) * 0.0038;               // 怠速抖动
    tPitch += Math.sin(t * 68) * idle * 0.5;
    tRoll += Math.sin(t * 61 + 2) * idle;

    const stiff = 58, damp = 8.6;
    this.susPitchV += (tPitch - this.susPitch) * stiff * dt;
    this.susPitchV *= Math.exp(-damp * dt);
    this.susPitch += this.susPitchV * dt;
    this.susRollV += (tRoll - this.susRoll) * stiff * dt;
    this.susRollV *= Math.exp(-damp * dt);
    this.susRoll += this.susRollV * dt;

    this.root.position.set(this.pos.x, hC, this.pos.z);
    this.root.rotation.set(0, this.heading, 0);
    // 车体姿态 = 地形姿态 + 悬挂附加姿态
    this.model.rotation.set(this.pitch + this.susPitch, this.modelYaw, this.roll + this.susRoll);
  }

  // ─────────────── 炮塔伺服（朝世界瞄准点，含弹道补偿） ───────────────
  aimAt(worldPoint) { this.aimPoint.copy(worldPoint); }

  updateTurret(dt) {
    const cfg = this.cfg;
    const traverse = cfg.turretTraverse * (this.mods.ring > 0 ? 0.18 : 1);   // 座圈卡死：转速 ×0.18

    _v2.copy(this.aimPoint).sub(this.root.position);
    const horiz = Math.hypot(_v2.x, _v2.z);
    const desiredLocalYaw = wrapAngle(Math.atan2(_v2.x, _v2.z) - this.heading - this.modelYaw);
    const turretPos = this.turretGroup.getWorldPosition(_v1);
    const dy = this.aimPoint.y - turretPos.y;
    let desiredElev = Math.atan2(dy, Math.max(horiz, 1));
    // 弹道补偿：解低弹道抛物线，让落点压在瞄准点上（按当前弹种弹速）
    const v = this.shellVelocityOf(), g = GAME.shellGravity;
    if (horiz > 2) {
      const disc = v * v * v * v - g * (g * horiz * horiz + 2 * dy * v * v);
      if (disc > 0) desiredElev = Math.atan((v * v - Math.sqrt(disc)) / (g * horiz));
    }
    const dep = THREE.MathUtils.degToRad(cfg.gunDepression);
    const elv = THREE.MathUtils.degToRad(cfg.gunElevation);
    desiredElev = THREE.MathUtils.clamp(desiredElev, dep, elv);

    this.turretYaw = approachAngle(this.turretYaw, desiredLocalYaw, traverse * dt);
    // 闭环俯仰：按炮管实际世界方向反馈补偿车体姿态（坡地瞄哪打哪）
    const curDir = this.getGunDirection(_v1);
    const curWorldElev = Math.asin(THREE.MathUtils.clamp(curDir.y, -1, 1));
    const desiredGunPitch = THREE.MathUtils.clamp(this.gunPitch + (desiredElev - curWorldElev), dep, elv);
    // 逼近（保留原符号语义：barrelGroup.rotation.x = -gunPitch）
    const dp = desiredGunPitch - this.gunPitch;
    this.gunPitch += THREE.MathUtils.clamp(dp, -traverse * 0.7 * dt, traverse * 0.7 * dt);

    this.turretGroup.rotation.y = this.turretYaw;
    this.barrelGroup.rotation.x = -this.gunPitch;

    // 瞄准误差（供 AI 开火判定与散布）
    this.aimOffset = Math.abs(wrapAngle(desiredLocalYaw - this.turretYaw)) +
                     Math.abs(desiredElev - curWorldElev) * 0.6;
  }

  // 炮管实际指向（世界）
  getGunDirection(out) {
    return out.set(0, 0, 1).applyQuaternion(this.barrelGroup.getWorldQuaternion(_q1)).normalize();
  }

  // 炮口世界坐标与指向
  getMuzzle(outPos, outDir) {
    _v1.fromArray(this.cfg.muzzleLocal).sub(_v2.fromArray(this.cfg.barrelPivot));
    outPos.copy(_v1);
    this.barrelGroup.localToWorld(outPos);
    this.getGunDirection(outDir);
    return outPos;
  }

  // 烟雾发射器世界坐标：找炮塔上名字含 'smoke' 的元件，返回其世界位置数组
  getSmokeLaunchers(out) {
    out.length = 0;
    this.turretGroup.traverse((obj) => {
      if (obj.isMesh && obj.name && obj.name.toLowerCase().startsWith('smoke')) {
        obj.getWorldPosition(_v1);
        out.push(_v1.clone());
      }
    });
    if (out.length === 0) {
      // 无发射器元件：用炮塔顶部作为后备
      this.turretGroup.getWorldPosition(_v1);
      out.push(_v1.clone());
    }
    return out;
  }

  // 机枪独立伺服：瞄准世界点（车长塔独立于炮塔方位）
  updateMgTurret(dt, aimPoint) {
    if (!this.mgGroup || !aimPoint) return;
    this.mgGroup.getWorldPosition(_v1);
    const desiredWorldYaw = Math.atan2(aimPoint.x - _v1.x, aimPoint.z - _v1.z);
    const turretWorldYaw = this.turretYaw + this.heading + this.modelYaw;
    let desiredLocal = desiredWorldYaw - turretWorldYaw;
    desiredLocal = Math.atan2(Math.sin(desiredLocal), Math.cos(desiredLocal));
    this.mgYaw = approachAngle(this.mgYaw, desiredLocal, 4.5 * dt);
    this.mgGroup.rotation.y = this.mgYaw + this.mgBaseYaw;
  }

  // 机枪口世界坐标 + 指向（车长塔机枪；aimPoint 给定则朝目标，否则沿机枪当前朝向）
  getMgMuzzle(outPos, outDir, aimPoint = null) {
    if (!this.mgGroup) { outPos.set(0, 0, 0); outDir.set(0, 0, 1); return outPos; }
    if (this.mgMuzzleLocal) outPos.copy(this.mgMuzzleLocal);
    else outPos.set(0, this.cfg.mg.muzzleUp, this.cfg.mg.muzzleFwd);
    this.mgGroup.localToWorld(outPos);
    if (aimPoint) outDir.copy(aimPoint).sub(outPos).normalize();
    else outDir.set(0, 0, this.mgFlip).applyQuaternion(this.mgGroup.getWorldQuaternion(_q1)).normalize();
    return outPos;
  }

  // ── 弹种 ──
  shellDef(type = this.shellType) { return SHELL_TYPES[type] || SHELL_TYPES.ap; }
  shellVelocityOf(type = this.shellType) { return this.cfg.shellVelocity * this.shellDef(type).velMult; }

  // 切换弹种（1/2/3 键）：重置装填（换弹出膛流程）
  switchShell(type) {
    if (!SHELL_TYPES[type] || type === this.shellType) return false;
    if (this.destroyed || this.shellPool[type] <= 0) return false;
    this.shellType = type;
    this.reload = this.cfg.reloadTime * (this.mods.loader > 0 ? this.reloadMult : 1);
    this.dispersion = Math.max(this.dispersion, this.cfg.dispersion * 2);   // 换弹轻微扩圈
    return true;
  }

  readyToFire() { return this.reload <= 0 && !this.destroyed && this.shellPool[this.shellType] > 0; }

  // 开火：返回炮弹出膛数据；调用方生成炮弹与特效
  fire() {
    if (!this.readyToFire()) return null;
    this.shellPool[this.shellType]--;
    this.reload = this.cfg.reloadTime * (this.mods.loader > 0 ? this.reloadMult : 1);   // 装弹机受损装填变慢
    this.recoil = 1;
    this.evacT = 0.5;          // 火药残烟延时
    this.barrelSmokeT = 3;     // 炮管余烟 3s
    // 开炮车体经悬挂后仰-回弹振荡（rotation.x 负值=抬头，后座为抬头）
    this.susPitchV -= 0.6;
    // 开火扩圈（3×：连射惩罚保留但第二发不至于完全打飞）
    this.dispersion = Math.max(this.dispersion, this.cfg.dispersion * 3);
    const pos = new THREE.Vector3(), dir = new THREE.Vector3();
    this.getMuzzle(pos, dir);
    // 散布锥
    const d = this.dispersion;
    dir.x += (Math.random() * 2 - 1) * d;
    dir.y += (Math.random() * 2 - 1) * d;
    dir.z += (Math.random() * 2 - 1) * d;
    dir.normalize();
    const def = this.shellDef();
    return {
      pos, dir,
      velocity: this.cfg.shellVelocity * def.velMult,
      pen: this.cfg.shellPen * def.penMult,
      penDrop: this.cfg.shellPenDrop * def.penDropK,
      damage: this.cfg.shellDamage * def.dmgMult,
      spread: this.cfg.damageSpread,
      owner: this,
      shellType: this.shellType,
    };
  }

  // 散布更新：移动/转向/转炮塔扩圈，静止缩圈（观瞄受损 → 目标散布×倍率，永久生效）
  updateFireControl(dt) {
    const cfg = this.cfg;
    const moveFactor = Math.abs(this.speed) / cfg.maxSpeedForward;
    const target = cfg.dispersion * (1 + moveFactor * 3.5 + this.aimOffset * 6) * this.opticsMult;
    const rate = this.dispersion > target ? 3.5 : 1 / cfg.aimTime;   // 扩快缩慢
    this.dispersion = THREE.MathUtils.damp(this.dispersion, target, rate, dt);
  }

  // ─────────────── 命中判定 ───────────────
  // 返回 { zone, armor, impactAngleDeg, localPoint, worldPos }
  resolveHitZone(worldPoint, shellDir) {
    const cfg = this.cfg;
    const lp = this.root.worldToLocal(worldPoint.clone());  // 米
    const ld = shellDir.clone();
    // 方向转到车体局部（仅 yaw；忽略小角度俯仰）
    _q1.setFromAxisAngle(_v1.set(0, 1, 0), -this.heading);
    ld.applyQuaternion(_q1);

    const isTurret = lp.y > cfg.dims.hullHeight;
    let zone, normal;
    if (Math.abs(ld.z) >= Math.abs(ld.x)) {
      if (ld.z < 0) { zone = isTurret ? 'turretFront' : 'hullFront'; normal = _v2.set(0, 0, 1).clone(); }
      else { zone = isTurret ? 'turretRear' : 'hullRear'; normal = _v2.set(0, 0, -1).clone(); }
    } else {
      zone = isTurret ? 'turretSide' : 'hullSide';
      normal = _v2.set(-Math.sign(ld.x), 0, 0).clone();   // 命中面的外法线（与前后分支同取 -sign 约定）
    }
    // 入射角 = -shellDir 与装甲法线夹角
    const cosA = THREE.MathUtils.clamp(-ld.dot(normal), 0, 1);
    const impactAngleDeg = THREE.MathUtils.radToDeg(Math.acos(cosA));
    // 装甲值：满板取现值；爆反板耗尽回落 base 裸值（无爆反区不变）
    let armor = cfg.armor[zone];
    if (this.era && this.era.base[zone] != null && !(this.era.plates[zone] > 0)) armor = this.era.base[zone];
    // 世界法线（局部法线随车体 yaw 旋转；跳弹反射用）
    const worldNormal = normal.clone().applyAxisAngle(_v1.set(0, 1, 0), this.heading);
    return { zone, armor, impactAngleDeg, cosA, localPoint: lp, worldPos: worldPoint.clone(), isTurret, normal: worldNormal };
  }

  // 应用伤害结算。penetration: 炮弹当前穿深；shellType: 弹种规则；
  // hitWorld/dirWorld 世界坐标（弹芯车内传播用，可空）
  applyHit(hit, penetration, shellType = 'ap', hitWorld = null, dirWorld = null) {
    if (this.destroyed) return { type: 'dead' };
    const def = SHELL_TYPES[shellType] || SHELL_TYPES.ap;

    // ── 爆反：先于跳弹/等效判定消耗板并削减穿深（板在即引爆，跳弹也吃削减）──
    // HE 直接命中额外再剥 1 块（HE 是剥板工具）
    let pen = penetration;
    if (this.era && this.era.plates[hit.zone] > 0) {
      const ets = ERA_TYPES[this.era.type] || ERA_TYPES.kontakt5;
      const cut = ets.penCut[shellType] != null ? ets.penCut[shellType] : ets.penCut.ap;
      pen = Math.max(0, penetration - cut);
      this.era.plates[hit.zone]--;
      hit.eraStripped = 1;
      if (shellType === 'he' && this.era.plates[hit.zone] > 0) {
        this.era.plates[hit.zone]--;
        hit.eraStripped++;
      }
      hit.eraCut = cut;
    }

    // 跳弹（按弹种跳弹角；HE 永不跳弹）
    if (hit.impactAngleDeg > def.ricochetAngle) {
      return { type: 'ricochet', zone: hit.zone, eraStripped: hit.eraStripped, eraCut: hit.eraCut };
    }
    // 等效装甲（角度效应；AP 封顶 3 倍 / HEAT 5 倍 / HE 不吃角度）
    const effective = hit.armor / Math.max(hit.cosA, def.cosFloor);
    if (pen < effective) {
      return { type: 'bounce', zone: hit.zone, effective, def, eraStripped: hit.eraStripped, eraCut: hit.eraCut };
    }
    // 击穿（实际伤害数值由 ShellManager 结算）；记录击穿孔冒烟点（root 局部坐标）
    this.holeSmoke = { local: hit.localPoint.clone(), t: 3 };
    this._hsAcc = 0;
    const events = [];
    let mult = ZONE_DAMAGE_MULT[hit.zone] || 1;
    // 履带区命中（车体侧面 |x|>trackX 且 y<trackY）：伤害按弹种减免，概率断履带（HEAT 减半）
    const I = this.cfg.internal;
    const lp = hit.localPoint;
    if (I && !hit.isTurret && Math.abs(lp.x) > I.trackX && lp.y < I.trackY) {
      mult *= def.trackZoneMult;
      if (Math.random() < MODULE_RULES.trackChance * def.trackBreakK) {
        this.mods.tracks = Math.max(this.mods.tracks, MODULE_RULES.trackRepair);
        events.push({ type: 'module', label: '履带断裂' });
      }
    }
    // 弹芯车内传播：模块损伤判定（殉爆统一在此触发）
    if (hitWorld && dirWorld) events.push(...this.penInside(hitWorld, dirWorld));
    return { type: 'pen', zone: hit.zone, mult, events };
  }

  // HE 未击穿溅射：少量保底伤害 + 概率断履带（履带区）
  applyHESplash(hit, splashDamage) {
    if (this.destroyed) return { type: 'dead' };
    const events = [];
    const I = this.cfg.internal;
    const lp = hit.localPoint;
    let mult = 1;
    if (I && !hit.isTurret && Math.abs(lp.x) > I.trackX && lp.y < I.trackY) {
      if (Math.random() < 0.35) {
        this.mods.tracks = Math.max(this.mods.tracks, MODULE_RULES.trackRepair);
        events.push({ type: 'module', label: '履带断裂' });
      }
      mult = 0.7;
    }
    const out = this.applyDamage(Math.round(splashDamage), mult, false);
    return { type: 'splash', damage: out.damage, events, killed: out.killed };
  }

  // ── 消耗品 ──
  useRepairKit() {
    if (this.destroyed || this.consumables.repair <= 0) return false;
    const m = this.mods;
    // 需要有可修目标：机械模块 / 观瞄损伤 / 雷达损伤 / 压制器损伤（爆反板是物理消耗，不可修）
    const opticsHurt = this.optics.hp < SENSOR_RULES.opticsHp;
    const radarHurt = this.aps && this.aps.rules.radarHp > 0 && this.aps.radarHp < this.aps.rules.radarHp;
    const laserHurt = this.lws && this.lws.emitterHp < LWS_RULES.emitterHp;
    if (m.tracks <= 0 && m.engine <= 0 && m.ring <= 0 && m.loader <= 0 && !opticsHurt && !radarHurt && !laserHurt) return false;
    m.tracks = 0; m.engine = 0; m.ring = 0; m.loader = 0;
    this.reloadMult = 1;
    if (opticsHurt) { this.optics.hp = SENSOR_RULES.opticsHp; this.opticsMult = 1; }
    if (radarHurt) this.aps.radarHp = this.aps.rules.radarHp;
    if (laserHurt) this.lws.emitterHp = LWS_RULES.emitterHp;
    this.consumables.repair--;
    return true;
  }
  useExtinguisher() {
    if (this.destroyed || this.consumables.ext <= 0 || this.burning <= 0) return false;
    this.burning = 0;
    this.consumables.ext--;
    return true;
  }

  // ── 机枪/机炮扫射毁伤（外露子系统；永不伤害 HP）──
  // zone：resolveHitZone 得到的命中区；k：距离毁伤系数；caliber：射击方口径
  // 返回事件数组（era 剥板 / radar 分级 / optics 分级 / 30mm 断履带）
  applyMGDamage(zone, k, caliber) {
    const def = SENSOR_RULES.caliber[caliber];
    const out = [];
    if (!def || k <= 0 || this.destroyed) return out;
    // 爆反剥板：块耐久累积（plateHp/块）
    if (this.era && this.era.plates[zone] > 0) {
      const ets = ERA_TYPES[this.era.type] || ERA_TYPES.kontakt5;
      this.era._acc[zone] = (this.era._acc[zone] || 0) + def.era * k;
      while (this.era._acc[zone] >= ets.plateHp && this.era.plates[zone] > 0) {
        this.era._acc[zone] -= ets.plateHp;
        this.era.plates[zone]--;
        out.push({ type: 'era', label: '敌爆反剥落' });
      }
    }
    // APS 雷达阵：分级（完好 → 损伤 → 损毁）。分布式传感 APS（radarHp=0）无雷达可打
    if (this.aps && this.aps.rules.radarHp > 0 && this.aps.radarHp > 0) {
      const half = this.aps.rules.radarHp * 0.5;
      const was = this.aps.radarHp;
      this.aps.radarHp = Math.max(0, this.aps.radarHp - def.radar * k);
      if (was > half && this.aps.radarHp <= half) out.push({ type: 'radar', label: '敌拦截雷达受损' });
      if (was > 0 && this.aps.radarHp <= 0) out.push({ type: 'radar', label: '敌拦截雷达损毁' });
    }
    // 激光压制器：分级（损伤 → 发射成功率减半；损毁 → 系统离线）
    if (this.lws && this.lws.emitterHp > 0) {
      const half = LWS_RULES.emitterHp * 0.5;
      const was = this.lws.emitterHp;
      this.lws.emitterHp = Math.max(0, this.lws.emitterHp - def.laser * k);
      if (was > half && this.lws.emitterHp <= half) out.push({ type: 'laser', label: '敌激光压制器受损' });
      if (was > 0 && this.lws.emitterHp <= 0) out.push({ type: 'laser', label: '敌激光压制器损毁' });
    }
    // 观瞄镜组：分级（损伤 → 散布×2；损毁 → 散布×8 等效半盲）
    if (this.optics.hp > 0) {
      const half = SENSOR_RULES.opticsHp * 0.5;
      const was = this.optics.hp;
      this.optics.hp = Math.max(0, this.optics.hp - def.optics * k);
      if (was > half && this.optics.hp <= half) {
        this.opticsMult = SENSOR_RULES.opticsDmgSpread;
        out.push({ type: 'optics', label: '敌观瞄受损' });
      }
      if (was > 0 && this.optics.hp <= 0) {
        this.opticsMult = SENSOR_RULES.opticsDeadSpread;
        out.push({ type: 'optics', label: '敌观瞄损毁' });
      }
    }
    // 30mm 机炮小概率扫断履带
    if (def.trackChance && Math.random() < def.trackChance) {
      this.mods.tracks = Math.max(this.mods.tracks, MODULE_RULES.trackRepair);
      out.push({ type: 'module', label: '履带断裂' });
    }
    return out;
  }

  // ── APS 拦截判定（由 ShellManager 在拦截窗内调用）──
  // shellType：来袭弹种（StrikeShield 对 HEAT 拦截率更高）
  // 返回 { fired, effective }：fired=发射（耗弹+冷却）；effective=弹丸被摧毁
  tryAPSIntercept(shellType) {
    const a = this.aps;
    if (!a || a.charges <= 0 || a.cooldown > 0) return { fired: false, effective: false };
    const R = a.rules;
    // 有雷达阵的 APS：雷达损毁无法发射 / 损伤档降低；分布式传感（radarHp=0）始终全额
    let fire;
    if (R.radarHp > 0) fire = a.radarHp <= 0 ? 0 : (a.radarHp < R.radarHp * 0.5 ? R.fireChanceDamaged : R.fireChance);
    else fire = R.fireChance;
    if (Math.random() > fire) return { fired: false, effective: false };
    a.charges--;
    a.cooldown = R.cooldown;
    const eff = (R.effective && R.effective[shellType]) ?? R.effective?.ap ?? APS_RULES.effectiveChance;
    return { fired: true, effective: Math.random() < eff };
  }

  // ── 激光压制：对目标发动致盲照射（扇区/视线/瞄准前提由调用方保证）──
  // 返回 true=成功发射（进入冷却）；压制器损伤档按概率发射（未发射不耗冷却）
  tryLaserSuppress(target, blindTime = LWS_RULES.blindTime) {
    const L = this.lws, R = LWS_RULES;
    if (!L || L.emitterHp <= 0 || L.cooldown > 0 || this.destroyed) return false;
    if (!target || target.destroyed || target.suppressT > 0) return false;   // 目标已在致盲中不叠加
    if (L.emitterHp < R.emitterHp * 0.5 && Math.random() >= R.fireChanceDamaged) return false;
    L.cooldown = R.cooldown;
    target.suppressT = blindTime;
    return true;
  }

  // ─────────────── 弹芯车内传播（击穿后模块判定，参考 modalTank penInside） ───────────────
  // 弹芯从命中点沿 dir 步进，沿途判定弹药架/油箱/发动机/座圈/履带；返回 events 数组
  penInside(hitWorld, dirWorld) {
    const cfg = this.cfg, I = cfg.internal, R = MODULE_RULES;
    const events = [];
    // 命中点/方向转车体局部（仅 yaw，与 resolveHitZone 一致）
    const lp = this.root.worldToLocal(hitWorld.clone());
    const ld = dirWorld.clone();
    _q1.setFromAxisAngle(_v1.set(0, 1, 0), -this.heading);
    ld.applyQuaternion(_q1).normalize();

    const detK = this.isPlayer ? 0.25 : 1;   // PvE 保护：玩家被殉爆概率 ×0.25
    const fireK = this.isPlayer ? 0.5 : 1;   // 玩家被点燃概率 ×0.5（沿用既有机制）
    const hit = new Set();                   // 每类部件只触发一次
    let energy = 1;
    const p = new THREE.Vector3();
    const xLim = cfg.dims.width / 2 + 0.2;
    const zLim = cfg.dims.length / 2 + 0.2;
    const yTop = cfg.dims.turretTop + 0.15;

    for (let t = 0.12; t <= 7.2 && energy > 0.08; t += 0.12) {
      p.copy(lp).addScaledVector(ld, t);
      if (p.y < -0.2) break;   // 钻入车底
      // 步进出车体边界 → 穿出事件（特效由调用方触发）
      if (Math.abs(p.x) > xLim || p.z > zLim || p.z < -zLim || p.y > yTop) {
        events.push({ type: 'exit', pos: this.root.localToWorld(p.clone()), dir: dirWorld.clone() });
        break;
      }

      // 弹药架：直击 → 概率殉爆；未爆 → 装弹机受损（装填变慢）
      for (let i = 0; i < I.ammoRacks.length; i++) {
        if (hit.has('ammo' + i)) continue;
        const a = I.ammoRacks[i];
        if (p.distanceTo(_v2.set(a.x, a.y, a.z)) < a.r) {
          hit.add('ammo' + i);
          if (Math.random() < R.ammoDet * detK) {
            events.push({ type: 'ammo_boom', label: '弹药殉爆' });
            this.destroy(true);
            return events;
          }
          this.reloadMult = Math.min(R.loaderCap, this.reloadMult + 0.4);
          this.mods.loader = 12;
          if (this.reload > 0) this.reload *= R.loaderMult;   // 当前装填一并被拖延
          events.push({ type: 'module', label: '装弹机受损' });
          energy -= 0.3;
        }
      }

      // 油箱：概率起火
      for (let i = 0; i < I.fuelTanks.length; i++) {
        if (hit.has('fuel' + i)) continue;
        const f = I.fuelTanks[i];
        if (p.distanceTo(_v2.set(f.x, f.y, f.z)) < f.r) {
          hit.add('fuel' + i);
          if (Math.random() < R.fuelFire * fireK) {
            this.ignite();
            events.push({ type: 'fire', label: '油箱起火' });
          }
          energy -= 0.15;
        }
      }

      // 发动机舱区间：受损 6~11s + 概率起火
      if (!hit.has('engine') && p.z > I.engineBox.zMin && p.z < I.engineBox.zMax && p.y < I.engineBox.yMax) {
        hit.add('engine');
        this.mods.engine = Math.max(this.mods.engine,
          R.engineRepairMin + Math.random() * (R.engineRepairMax - R.engineRepairMin));
        events.push({ type: 'module', label: '发动机受损' });
        if (Math.random() < R.engineFire * fireK) {
          this.ignite();
          events.push({ type: 'fire', label: '发动机起火' });
        }
        energy -= 0.3;
      }

      // 座圈（步进点 y 接近 ringY 且水平半径 <1.6）：概率卡死
      if (!hit.has('ring') && Math.abs(p.y - I.ringY) < 0.4 && Math.hypot(p.x, p.z) < 1.6) {
        hit.add('ring');
        if (Math.random() < R.ringChance) {
          this.mods.ring = Math.max(this.mods.ring, R.ringJam);
          events.push({ type: 'module', label: '座圈卡死' });
        }
        energy -= 0.2;
      }

      // 履带内侧：打断
      if (!hit.has('track') && Math.abs(p.x) > I.trackX && p.y < I.trackY) {
        hit.add('track');
        this.mods.tracks = Math.max(this.mods.tracks, R.trackRepair);
        events.push({ type: 'module', label: '履带断裂' });
        energy -= 0.25;
      }
    }
    return events;
  }

  // 击穿后的实际伤害与特种判定（由 ShellManager 调用）
  // isSideOrRearHull 参数保留兼容（殉爆抽奖已移除，殉爆统一由 penInside 弹药架触发）
  applyDamage(baseDamage, mult, isSideOrRearHull) {
    const cfg = this.cfg;
    const dmg = Math.round(baseDamage * mult * (1 + (Math.random() * 2 - 1) * cfg.damageSpread));
    this.hp = Math.max(0, this.hp - dmg);

    let special = null;
    if (this.hp > 0 && Math.random() < cfg.fireChance * (this.isPlayer ? 0.5 : 1)) {
      special = 'fire';
      this.ignite();
    } else if (this.hp <= 0) {
      this.destroy(false);
    }
    return { damage: dmg, special, killed: this.destroyed };
  }

  ignite() {
    if (this.destroyed) return;
    this.burning = FIRE_DURATION;
  }

  destroy(violent) {
    if (this.destroyed) return;
    this.destroyed = true;
    this.hp = 0;
    this.burning = 0;
    // 烧毁外观：全部材质熏黑 + 炮管微垂
    this.model.traverse((o) => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.color && m.color.multiplyScalar(0.22); m.roughness = 1; }
      }
    });
    this.gunPitch = Math.max(this.gunPitch, 0.06);
    if (violent) {
      this.ammoDetonated = true;
      const fx = this.effects;
      const pos = this.root.position.clone();
      // 殉爆三段延爆（guard：重生/离场后不残留延爆）
      if (fx) {
        fx.explosion(pos.clone().setY(pos.y + 1.6), 4.4);
        setTimeout(() => {
          if (this.destroyed && this.root.parent) fx.explosion(pos.clone().setY(pos.y + 1.2), 2.6);
        }, 280);
        setTimeout(() => {
          if (this.destroyed && this.root.parent) fx.explosion(pos.clone().setY(pos.y + 2), 1.8);
        }, 700);
      }
      if (Math.random() < 0.5) {
        // 50%：炮塔抛飞
        this.root.updateMatrixWorld(true);
        const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
        this.turretGroup.matrixWorld.decompose(wp, wq, ws);
        // 把炮塔组挂到场景根部（root 的父级）
        const sceneRoot = this.root.parent;
        if (sceneRoot) {
          sceneRoot.attach(this.turretGroup);
          this.turretFly = {
            vel: new THREE.Vector3((Math.random() - 0.5) * 4, 11 + Math.random() * 4, (Math.random() - 0.5) * 4),
            rot: new THREE.Vector3(Math.random() * 3 - 1.5, Math.random() * 3, Math.random() * 3 - 1.5),
            landed: false,
          };
        }
      } else {
        // 另 50%：不飞炮塔，座圈向上 + 随机侧向持续喷火（残骸 update 驱动）
        const a = Math.random() * Math.PI * 2;
        this.jetFireDir = new THREE.Vector3(Math.sin(a) * 0.45, 1, Math.cos(a) * 0.45).normalize();
        this.jetFirePos = pos.clone().setY(pos.y + 1.55);
        this.jetFireT = 4.5 + Math.random() * 3;
        this._jetAcc = 0;
      }
    }
  }

  // ─────────────── 帧更新 ───────────────
  update(dt, effects, audio) {
    const cfg = this.cfg;
    if (effects) this.effects = effects;

    // 装填
    if (this.reload > 0) this.reload -= dt;

    // 模块损伤计时衰减（loader 归零时恢复装填倍率）
    const mods = this.mods;
    for (const k in mods) if (mods[k] > 0) mods[k] = Math.max(0, mods[k] - dt);
    if (mods.loader <= 0) this.reloadMult = 1;

    // APS 拦截冷却
    if (this.aps && this.aps.cooldown > 0) this.aps.cooldown = Math.max(0, this.aps.cooldown - dt);

    // 激光压制：被致盲窗口 / 压制器冷却倒计时
    if (this.suppressT > 0) this.suppressT = Math.max(0, this.suppressT - dt);
    if (this.lws && this.lws.cooldown > 0) this.lws.cooldown = Math.max(0, this.lws.cooldown - dt);

    // ── 物件音效：撞障碍物（房屋类 → 撞房屋音；岩石等 → 非植物物品音）+ 行驶碾压废墟 ──
    if (audio && audio.playProp) {
      this.ramCd = Math.max(0, this.ramCd - dt);
      this.rubbleCd -= dt;
      if (this._ramHit) {
        if (this._ramHit.time === this.time && this.ramCd <= 0) {
          this.ramCd = 0.5;
          const t = this._ramHit.type;
          const isHouse = !t || t.startsWith('house') || t.startsWith('barn') || t.startsWith('barrack');
          audio.playProp(isHouse ? 'ramHouse' : 'crushObj', Math.min(1, 0.35 + this._ramHit.impact / 12));
        }
        this._ramHit = null;   // 撞击事件只消费一次（冷却期内丢弃，防贴蹭连响）
      }
      const des = this.world && this.world.destructibles;
      if (!this.destroyed && des && Math.abs(this.speed) > 1.2
          && des.rubbleHeightAt(this.pos.x, this.pos.z) > 0.12 && this.rubbleCd <= 0) {
        this.rubbleCd = 1.1 + Math.random() * 0.7;
        audio.playProp('crushRubble', Math.min(0.9, 0.35 + Math.abs(this.speed) / 14));
      }
    }

    // 火药残烟：开炮 0.5s 后从炮口当前位置喷出膨胀白烟团
    if (this.evacT > 0) {
      this.evacT -= dt;
      if (this.evacT <= 0 && this.effects) {
        this.root.updateMatrixWorld(true);
        this.getMuzzle(_v3, _v4);
        this.effects.boreEvac(_v3, _v4);
      }
    }

    // 炮管余烟：开火后 3s 内每 0.09s 在炮口后 0.4m 处 1 粒烟
    if (this.barrelSmokeT > 0 && this.effects) {
      this.barrelSmokeT -= dt;
      this._bsAcc += dt;
      if (this._bsAcc > 0.09) {
        this._bsAcc = 0;
        this.root.updateMatrixWorld(true);
        this.getMuzzle(_v3, _v4);
        _v3.addScaledVector(_v4, -0.4);
        this.effects.ps.spawn('smoke', {
          x: _v3.x, y: _v3.y, z: _v3.z,
          vy: 0.8 + Math.random(), life: 1.4, size0: 0.3, size1: 1.6, alpha: 0.3, windK: 1,
          c0: [0.7, 0.68, 0.64], c1: [0.4, 0.39, 0.38], fadeIn: 0.2,
        });
      }
    }

    // 击穿孔冒烟：每 0.07s 在击穿孔（随车体局部点变换回世界）1 粒烟
    if (this.holeSmoke && this.holeSmoke.t > 0 && this.effects) {
      this.holeSmoke.t -= dt;
      this._hsAcc += dt;
      if (this._hsAcc > 0.07) {
        this._hsAcc = 0;
        _v3.copy(this.holeSmoke.local);
        this.root.localToWorld(_v3);
        this.effects.ps.spawn('smoke', {
          x: _v3.x, y: _v3.y, z: _v3.z,
          vy: 1.4, life: 1.6, size0: 0.25, size1: 1.3, alpha: 0.42, windK: 0.8,
          c0: [0.3, 0.28, 0.26], c1: [0.15, 0.15, 0.14], fadeIn: 0.15,
        });
      }
    }

    // 后座回位
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 3.2);
      const back = this.recoil * this.recoil * 0.38 / cfg.scale; // 0.38m 换算模型单位
      this.barrelGroup.position.copy(this.barrelBasePos);
      this.barrelGroup.position.z -= back;
    }

    // 履带 UV 滚动 + 轮子旋转
    const roll = this.speed * dt;
    for (const t of this.trackMaterials) t.offset.y -= roll * 0.5;
    for (const w of this.wheelGroups) w.group.rotation.x += roll / w.radius;

    // 起火 DoT（燃烧中每秒 burnDetPerSec 概率殉爆；玩家 ×0.25 保护）
    if (this.burning > 0 && !this.destroyed) {
      this.burning -= dt;
      this.hp = Math.max(1, this.hp - FIRE_DOT_DPS * dt);
      const detC = MODULE_RULES.burnDetPerSec * (this.isPlayer ? 0.25 : 1);
      if (Math.random() < detC * dt) this.destroy(true);
      // 起火点：炮塔上方
      const firePos = this.turretGroup.getWorldPosition(_v2);
      effects.burning(firePos, dt, 1, false);   // 起火小火苗
    }

    // 殉爆炮塔飞行
    if (this.turretFly && !this.turretFly.landed) {
      const tf = this.turretFly;
      tf.vel.y -= 22 * dt;
      this.turretGroup.position.addScaledVector(tf.vel, dt);
      this.turretGroup.rotation.x += tf.rot.x * dt;
      this.turretGroup.rotation.y += tf.rot.y * dt;
      this.turretGroup.rotation.z += tf.rot.z * dt;
      const gy = this.world.groundY(this.turretGroup.position.x, this.turretGroup.position.z) + 0.8;
      if (this.turretGroup.position.y < gy) {
        this.turretGroup.position.y = gy;
        tf.landed = true;
        effects.explosion(this.turretGroup.position, 0.8);
      }
    }

    // 殉爆座圈喷火（高频连续火柱，越烧越稀）
    if (this.jetFireT > 0 && this.effects) {
      this.jetFireT -= dt;
      this._jetAcc += dt;
      const k = Math.min(1, this.jetFireT / 1.5);   // 衰减系数
      if (this._jetAcc > 0.05 * (2 - k)) {
        this._jetAcc = 0;
        this.effects.jetFire(this.jetFirePos, this.jetFireDir);
      }
    }

    // 被摧毁后余火
    if (this.destroyed && effects) {
      const p = this.root.position;
      _v2.set(p.x, p.y + cfg.dims.hullHeight + 0.5, p.z);
      effects.burning(_v2, dt, this.ammoDetonated ? 0.7 : 1.1, true);   // 残骸大火
    }
  }
}
