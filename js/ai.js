// ═══ 敌方坦克 AI：难度分级 / 交战机动 / 弱点瞄准 / 弹种选择 / 消耗品 / 低血周旋 ═══
import * as THREE from 'three';
import { SHELL_TYPES, APS_RULES, SENSOR_RULES, AI_MG_RULES, mgFalloff, GAME } from './config.js';
import { wrapAngle } from './tank.js';

const _v = new THREE.Vector3();
const _vA = new THREE.Vector3();   // AI 机枪专用临时向量（aim）
const _vB = new THREE.Vector3();   // muzzle
const _vC = new THREE.Vector3();   // dir
const _vD = new THREE.Vector3();   // 命中球心 / point
const _vE = new THREE.Vector3();   // 投影临时

// ── 难度参数（机库页选择） ──
export const AI_DIFFICULTY = {
  novice: {
    label: '新手',
    aimErrMul: 2.4,               // 瞄准误差倍率
    hesitMin: 1.6, hesitMax: 3.4, // 开火犹豫 s
    weakAim: false,               // 按装甲弱点选瞄点高度
    switchShell: false,           // 按穿深切弹种
    useConsumables: false,
    engageRange: 400, preferRange: 280,
    fireRange: 850,
    evade: false,                  // 低血周旋撤退
    laserBlindMul: 0.6,            // 敌方激光压制对我致盲时长倍率
  },
  standard: {
    label: '标准',
    aimErrMul: 1.3,
    hesitMin: 0.9, hesitMax: 2.1,
    weakAim: false,
    switchShell: true,
    useConsumables: true,
    engageRange: 600, preferRange: 380,
    fireRange: 1150,
    evade: true,
    laserBlindMul: 1.0,
  },
  ace: {
    label: '王牌',
    aimErrMul: 0.65,
    hesitMin: 0.5, hesitMax: 1.2,
    weakAim: true,
    switchShell: true,
    useConsumables: true,
    engageRange: 680, preferRange: 420,
    fireRange: 1200,
    evade: true,
    laserBlindMul: 1.3,
    shortStop: true, stopSpread: 0.0024, stopMaxT: 2.5,   // M1 短停射击：停车收敛散布再开火
    avoidObstacles: true,                                  // M1 障碍绕行
    // M2 掩体系统
    coverUse: true, coverMin: 15, coverMax: 60, coverScoreMin: 1,
    tiltDuel: true,                                        // 斜对敌摆角游走（绝不横/尾对敌）
    smokeUse: true,                                        // 烟雾弹运用（撤离/无掩体掩护）
    peekMax: 12, coverChance: 0.6, coverChanceAfterHit: 0.85,
  },
};

export class TankAI {
  constructor(tank, difficulty = 'standard') {
    this.tank = tank;
    this.diff = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.standard;
    this.state = 'patrol';       // patrol / flank / advance / engage / evade
    this.aimError = new THREE.Vector3();
    this.errorTimer = 0;
    this.fireHesitation = this.diff.hesitMax;
    this.waypoint = null;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    // ── 弹种决策 ──
    this.shellTimer = 1.5;       // 评估间隔计时
    this._wantShell = 'ap';
    this._wantCount = 99;
    // ── 周旋 ──
    this.evadeTimer = 0;
    // ── 短停射击 / 开火后位移（M1）──
    this._stopT = 0;           // 停车收敛计时
    this._dashT = 0;           // 开火后位移剩余时间
    this._dashDir = 1;         // 位移方向（随机，反套路）
    // ── M2 掩体系统 ──
    this._strafeDir = Math.random() < 0.5 ? 1 : -1;   // 游走/摆角方向（显式初始化：undefined 相乘会产生 NaN 位置）
    this._tiltAng = 0.55;                             // 对敌摆角 rad（±31°，随机 23~46°）
    this.visibility = null;    // 由 main 注入（视线检测）
    this.coverState = null;    // null | 'moving' | 'holding' | 'peeking'
    this.coverPt = null;       // 当前掩体点 { x, z }
    this._peekOrigin = null;   // peek 起点位置
    this._lastBehavior = '';   // 概率决策去重（防套路）
    this._sameCount = 0;
    this._justHit = false;     // 刚被击中 → 提高找掩体概率
    this._lastHp = -1;
    this._shellSwitchCd = 0;   // 切弹冷却：防穿深边界震荡无限重置装填（AI 不开炮 bug）
    this._evadeCd = 0;         // 周旋冷却：刚完成一次战略撤退后短暂不重复触发
    this._evadeGoal = null;    // 撤退战略目标 { type: 'cover'|'los', x?, z? }
    // ── 消耗品反应延时 ──
    this.burnReactT = 0;
    this.trackReactT = 0;
    this.sensorReactT = 0;
    // ── 巡逻炮塔扫掠相位 ──
    this.scanPhase = Math.random() * Math.PI * 2;
    // ── 自动机枪：反应延时 / 连发计数 / 停射冷却 ──
    this.mgReactT = -1;        // -1 = 未启动（目标进入射程才计时）
    this.mgBurst = 0;
    this.mgPauseT = 0;
    this.onMGHit = null;       // 命中玩家子系统回调（main 接 hitLog/飘字）
    // ── 激光告警：炮塔锁定玩家期间置位（main 接 #laser-warning 提示框） ──
    this._lasing = false;
    this.onLase = null;
  }

  // 激光锁定状态沿触发（真值变化才回调，防每帧刷）
  _setLasing(v) {
    if (v === this._lasing) return;
    this._lasing = v;
    if (this.onLase) this.onLase(v);
  }

  update(dt, player, shells, effects, audio, smoke, visibility) {
    const t = this.tank;
    if (t.destroyed || player.destroyed) {
      this._setLasing(false);
      if (t.destroyed) t.drive(dt, 0, 0);
      return;
    }
    // ── 激光压制：被致盲窗口内不能瞄准/开火（观瞄被强光饱和；机动照常） ──
    const suppressed = t.suppressT > 0;
    this.visibility = visibility || this.visibility;
    this.smokeRef = smoke || this.smokeRef;

    // M2 受击侦测：HP 下降 → 中断 peek 缩回掩体 + 提高找掩体概率
    if (this._lastHp >= 0 && t.hp < this._lastHp) {
      this._justHit = true;
      if (this.coverState === 'peeking') this.coverState = 'moving';
      else if (!this.coverState && this.diff.coverUse) this._postFireDecision(player);   // 受击立即决策找掩体
    }
    this._lastHp = t.hp;
    if (this._evadeCd > 0) this._evadeCd -= dt;

    // ── 消耗品：起火即灭火（0.8s 反应）；交战中断履带/座圈卡死 -> 1.2s 后维修 ──
    if (this.diff.useConsumables) this._useConsumables(dt, player);

    // ── 未发现玩家：待命 + 炮塔缓慢扫掠；长时间无接触则向玩家方向搜索（防死锁） ──
    if (!player.spotted && !player.lostContact) {
      this.state = 'patrol';
      this.coverState = null;
      this._setLasing(false);
      this._patrolT = (this._patrolT || 0) + dt;
      if (this._patrolT > 15) {
        const yaw = Math.atan2(player.pos.x - t.pos.x, player.pos.z - t.pos.z);
        const { throttle, steer } = this._driveToward(yaw, dt, 0.6);
        t.drive(dt, throttle, steer);
      } else {
        t.drive(dt, 0, 0);
      }
      if (!suppressed) this._scanTurret(dt);   // 被激光压制：炮塔停摆
      t.updateFireControl(dt);
      return;
    }
    this._patrolT = 0;

    // 目标位置：点亮时实时位置，失联时最后已知位置
    const targetPos = player.spotted ? player.root.position : (player.lastKnownPos || player.root.position);
    const targetSpeed = player.spotted ? player.speed : 0;
    const targetHeading = player.spotted ? player.heading : (player.lastKnownHeading || 0);

    // ── 失联：包抄侧翼（不走直线，斜插最后已知位置侧翼再压上） ──
    if (!player.spotted) {
      this.state = 'flank';
      this.coverState = null;
      this._setLasing(false);
      this._flankMove(dt, targetPos);
      if (!suppressed) t.updateTurret(dt);   // 被激光压制：炮塔停跟
      t.updateFireControl(dt);
      return;
    }
    this.flankWp = null;

    const toPlayer = _v.copy(targetPos).sub(t.root.position);
    const dist = toPlayer.length();
    const dirYaw = Math.atan2(toPlayer.x, toPlayer.z);

    // ── 弹种选择（每 2.5s 评估，连续 2 次结论才切换，避免反复重置装填） ──
    this._selectShell(dt, player, dist);

    // ── 低血周旋：倒车拉距（烟雾遮蔽暂时禁用） ──
    if (this.diff.evade && this.evadeTimer <= 0 && this._evadeCd <= 0 &&
        t.hp / t.maxHp < 0.35 && dist < this.diff.engageRange * 1.2) {
      this.evadeTimer = 6 + Math.random() * 3;
      this._evadeFreq = 0.7 + Math.random() * 0.5;    // 摆动频率（随机，反套路）
      this._evadeAmp = 0.4 + Math.random() * 0.35;    // 摆动幅度 rad（斜倒折线）
      this._evadePhase = Math.random() * Math.PI * 2;
      // M3 撤离拉烟：掩护倒车路线（烟云同时遮断玩家视线 → 玩家 lostContact）
      if (this.diff.smokeUse && smoke && t.smokeAmmo > 0 && t.smokeCooldown <= 0 && Math.random() < 0.75) {
        if (smoke.fire(t)) { t.smokeAmmo--; t.smokeCooldown = 4; }
      }
      // M2.6 撤退战略：优先倒车入掩体（到位转藏身/伏击）；无掩体则倒出玩家视野
      const cvPt = (this.diff.coverUse && this.visibility) ? this._bestCoverPt(player) : null;
      this._evadeGoal = cvPt ? { type: 'cover', x: cvPt.x, z: cvPt.z } : { type: 'los' };
      // AI 烟雾弹暂时取消：后续按平衡需求再启用
      // if (smoke && t.smokeAmmo > 0 && t.smokeCooldown <= 0) {
      //   if (smoke.fire(t)) { t.smokeAmmo--; t.smokeCooldown = 4; }
      // }
    }

    // ── 机动决策 ──
    let throttle = 0, steer = 0;
    if (this.evadeTimer > 0) {
      // 周旋：保持车头对敌（正面装甲承弹），倒车拉距
      // 注意 drive() 倒车（speed<-0.2）时转向镜像：steer 必须按镜像取反，否则负反馈变正反馈 → 车尾对着玩家的失衡点
      this.evadeTimer -= dt;
      this.state = 'evade';
      throttle = -0.85;
      // 机动倒车：航向正弦摆动（斜倒折线，拉低预判命中率）
      this._evadePhase += dt * (this._evadeFreq || 0.9);
      const weave = Math.sin(this._evadePhase) * (this._evadeAmp || 0.5);
      const mir = t.speed < -0.2 ? -1 : 1;
      // 战略航向：掩体目标 → 倒向掩体（车头保持对敌）；无掩体 → 车头对敌斜摆
      let noseYaw = dirYaw + weave;
      if (this._evadeGoal && this._evadeGoal.type === 'cover') {
        const covYaw = Math.atan2(this._evadeGoal.x - t.pos.x, this._evadeGoal.z - t.pos.z);
        noseYaw = covYaw + Math.PI + weave * 0.5;
        if (Math.hypot(this._evadeGoal.x - t.pos.x, this._evadeGoal.z - t.pos.z) < 8) {
          // 已倒入掩体：转 M2 藏身/伏击，周旋进入冷却
          this.coverPt = this._evadeGoal;
          this.coverState = 'holding';
          this.evadeTimer = 0;
          this._evadeCd = 8 + Math.random() * 4;
        }
      }
      const dy = wrapAngle(noseYaw - t.heading);
      steer = THREE.MathUtils.clamp(mir * dy * 2.2, -1, 1);
      // 战略达成：无掩体目标时倒出玩家视野即收（视线对称判定）
      if (this._evadeGoal && this._evadeGoal.type === 'los' &&
          this.visibility && !this.visibility.canSee(player, t)) {
        this.evadeTimer = 0;
        this._evadeCd = 6 + Math.random() * 4;
      }
      if (dist > this.diff.fireRange) this.evadeTimer = 0;   // 拉出射界即停
    } else if (dist > this.diff.engageRange) {
      // 向玩家推进
      this.state = 'advance';
      ({ throttle, steer } = this._driveToward(dirYaw, dt, 1));
    } else {
      this.state = 'engage';
      // M1 短停射击：装填就绪 → 停车收敛散布；开火后强制随机位移（利用自身 3s 暴露窗口，方向/时长随机反套路）
      const wantStop = this.diff.shortStop && t.readyToFire() && dist < this.diff.fireRange;
      // ── M2 掩体/peek 状态机（优先于普通机动，与 M1 短停衔接） ──
      if (this.diff.coverUse && this.coverState === 'moving' && this.coverPt) {
        const yaw = Math.atan2(this.coverPt.x - t.pos.x, this.coverPt.z - t.pos.z);
        ({ throttle, steer } = this._driveToward(yaw, dt, 1));
        if (Math.hypot(this.coverPt.x - t.pos.x, this.coverPt.z - t.pos.z) < 5.5) {
          this.coverState = 'holding';
          this._coverStuckT = 0;
        } else {
          // 位移监控：1.5s 内挪动 <3m（顶墙/绕不出）→ 放弃该掩体点回退机动
          this._coverStuckT = (this._coverStuckT || 0) + dt;
          this._coverPosT = (this._coverPosT || 0) + dt;
          if (this._coverPosT > 1.5) {
            const moved = Math.hypot(t.pos.x - (this._coverLastX ?? t.pos.x), t.pos.z - (this._coverLastZ ?? t.pos.z));
            if (moved < 3) { this.coverState = null; this.coverPt = null; this._coverStuckT = 0; }
            this._coverLastX = t.pos.x; this._coverLastZ = t.pos.z; this._coverPosT = 0;
          }
        }
      } else if (this.diff.coverUse && this.coverState === 'holding') {
        throttle = 0; steer = 0;   // 藏身换弹：停车
        if (t.readyToFire()) {
          this.coverState = 'peeking';
          this._peekOrigin = { x: t.pos.x, z: t.pos.z };
        }
      } else if (this.diff.coverUse && this.coverState === 'peeking') {
        // 前探至炮塔通视（≤peekMax），到位后停车走 M1 收敛开火
        const gy = t.world.groundY(t.pos.x, t.pos.z);
        const seen = this.visibility &&
          this.visibility.canSeePoint(t.pos.x, t.pos.z, gy + t.cfg.dims.turretTop * 0.85, player);
        const advanced = Math.hypot(t.pos.x - this._peekOrigin.x, t.pos.z - this._peekOrigin.z);
        if (seen || advanced >= this.diff.peekMax) {
          this._stopT += dt;
          throttle = 0;
          // 车体原地缓慢摆回对敌斜角（伏击姿态；探头时以正面/斜角承弹）
          const tiltYaw = dirYaw + (this._strafeDir || 1) * 0.45;
          const dyaw = wrapAngle(tiltYaw - t.heading);
          steer = THREE.MathUtils.clamp(dyaw * 1.2 * (t.speed < -0.2 ? -1 : 1), -1, 1);
        } else {
          ({ throttle, steer } = this._driveToward(dirYaw, dt, 0.45));
        }
      } else if (this._dashT > 0) {
        this._dashT -= dt;
        ({ throttle, steer } = this._driveToward(dirYaw + Math.PI / 2 * this._dashDir, dt, 0.8));
      } else if (wantStop) {
        this._stopT += dt;
        throttle = 0; steer = 0;   // 停车：散布快速收敛
      } else {
        this._stopT = 0;
        if (dist > this.diff.preferRange * 1.25) {
          ({ throttle, steer } = this._driveToward(dirYaw, dt, 0.75));
        } else if (dist < this.diff.preferRange * 0.5) {
          // 太近则拉开一点 + 侧向游走
          ({ throttle, steer } = this._driveToward(dirYaw + Math.PI * 0.75, dt, 0.5));
        } else if (this.diff.tiltDuel && !this._needFlank) {
          // 王牌斜对敌游走：车头对敌 ±(23~46°) 摆角承弹，沿斜线小幅进退；绝不横对敌/尾对敌
          if (this._tiltAng == null) this._tiltAng = 0.55;
          const tiltYaw = dirYaw + this._strafeDir * this._tiltAng;
          let thr = 0.35;
          if (dist > this.diff.preferRange * 1.15) thr = 0.55;
          else if (dist < this.diff.preferRange * 0.8) thr = -0.45;
          const dd = this._driveToward(tiltYaw, dt, Math.abs(thr));
          const mir = t.speed < -0.2 ? -1 : 1;   // 倒车镜像适配（同 evade 修复）
          throttle = thr;
          steer = THREE.MathUtils.clamp(dd.steer * mir, -1, 1);
          // 偶尔换边 + 随机摆角（反套路）
          if (Math.random() < dt * 0.12) { this._strafeDir *= -1; this._tiltAng = 0.4 + Math.random() * 0.4; }
        } else {
          // 标准游走（新手/标准）：小半径绕圈
          const strafeYaw = dirYaw + Math.PI / 2 * (this._strafeDir || (this._strafeDir = Math.random() < 0.5 ? 1 : -1));
          ({ throttle, steer } = this._driveToward(strafeYaw, dt, this._needFlank ? 0.55 : 0.4));
          if (!this._needFlank && Math.random() < dt * 0.15) this._strafeDir *= -1;
        }
      }
    }
    // M1 障碍绕行：机动中路径前方有硬障碍 → 附加切向转向
    if (throttle !== 0) {
      const avoid = this._avoidSteer(dirYaw);
      if (avoid !== 0) steer = THREE.MathUtils.clamp(steer + avoid, -1, 1);
    }
    t.drive(dt, throttle, steer);

    // ── 卡住检测 ──
    if (Math.abs(t.speed) > 0.5 && t.root.position.distanceToSquared(this.lastPos) < dt * dt * 0.5) {
      this.stuckTimer += dt;
      if (this.stuckTimer > (this.coverState === 'moving' ? 2.5 : 1.6)) {
        this._strafeDir = (this._strafeDir || 1) * -1; this.stuckTimer = 0;
        if (this.coverState === 'moving') this.coverState = null;   // 掩体点不可达 → 回退普通机动
      }
    } else this.stuckTimer = 0;
    this.lastPos.copy(t.root.position);

    // ── 激光压制：被致盲 → 炮塔停跟、不开火、机枪停射（本帧到此为止；机动已照常执行） ──
    if (suppressed) {
      this._setLasing(false);
      t.updateFireControl(dt);
      return;
    }

    // ── 瞄准（王牌按弱点选瞄点高度：车体/炮塔中较弱者） ──
    this.errorTimer -= dt;
    if (this.errorTimer <= 0) {
      // 周期性刷新瞄准误差（距离越远误差越大）
      const err = (0.004 + dist * 0.000005) * this.diff.aimErrMul;   // 距离项 0.00001→0.000005：拟真射程下 AI 远距离仍有命中可能
      this.aimError.set(
        (Math.random() - 0.5) * err * 2,
        (Math.random() - 0.5) * err * 1.2,
        (Math.random() - 0.5) * err * 2
      );
      this.errorTimer = 0.8 + Math.random() * 0.8;
    }
    // 简单提前量：弹丸飞行时间 × 目标速度（按当前弹种弹速）
    const tof = dist / t.shellVelocityOf();
    const pv = _v.set(Math.sin(targetHeading), 0, Math.cos(targetHeading)).multiplyScalar(targetSpeed * tof * 0.85);
    const aimPoint = new THREE.Vector3().copy(targetPos).add(pv);
    const aimY = this.diff.weakAim ? this._weakAimY(player, dirYaw) : 1.1;
    aimPoint.y += aimY;
    aimPoint.addScaledVector(this.aimError, dist);

    // 炮塔伺服（含弹道补偿，闭环）
    t.aimAt(aimPoint);
    t.updateTurret(dt);
    t.updateFireControl(dt);
    const aligned = t.aimOffset < 0.014;

    // 激光告警：炮塔锁定玩家（对准且在射程内）→ 玩家侧「被激光测距定位」提示
    this._setLasing(aligned && dist < this.diff.fireRange);

    // ── 开火（散布未收敛不开火：模拟停车/缓行瞄准；观瞄受损门槛随散布倍率放宽） ──
    if (this.fireHesitation > 0) this.fireHesitation -= dt;
    // 短停态用更严的收敛门槛（停车 ≥0.5s 基本可达），机动态维持宽门槛
    const spreadOk = t.dispersion < (this._stopT > 0 ? (this.diff.stopSpread || 0.0024) : 0.012) * (t.opticsMult || 1);
    // 王牌：抓敌方 APS 冷却/雷达损毁窗口立刻开火（不等犹豫）；分布式传感 APS（无雷达）无雷达窗口
    const playerApsRadarBlind = player.aps && player.aps.rules.radarHp > 0 && player.aps.radarHp <= 0;
    const apsWindow = player.aps && player.aps.charges > 0 &&
      (player.aps.cooldown > 0 || playerApsRadarBlind) && this.diff.weakAim;
    // M3 弹道遮挡：炮口→目标的视线被掩体/地形挡住 → 仅 HE 低频开火拆掩体（ace），其余沉默省弹药
    let coverBlocked = false;
    if (this.visibility && player.spotted) {
      const gyT = t.world.groundY(t.pos.x, t.pos.z);
      coverBlocked = !this.visibility.canSeePoint(t.pos.x, t.pos.z, gyT + t.cfg.dims.turretTop * 0.85, player);
      if (coverBlocked && this.diff.switchShell && t.shellType !== 'he' && t.shellPool.he > 0 && Math.random() < 0.04) {
        t.switchShell('he');   // 拆掩体：切 HE（高爆是唯一能摧毁建筑结构的弹种）
      }
    }
    if (aligned && spreadOk && (this.fireHesitation <= 0 || apsWindow) && t.readyToFire() && dist < this.diff.fireRange) {
      if (coverBlocked && !(t.shellType === 'he' && Math.random() < 0.4)) {
        // 掩体遮挡：不开火（避免浪费弹药/替玩家拆自家掩体）；HE 弹 40% 概率拆掩体
      } else {
      const shot = t.fire();
      if (shot) {
        shells.fire(shot);
        effects.muzzleBlast(shot.pos, shot.dir);   // sideDir 缺省由 dir × up 计算
        // 炮弹抛壳：炮塔顶部靠后，延迟0.8-1.2秒
        {
          const _ev = new THREE.Vector3().copy(t.root.position);
          _ev.y += t.cfg.dims.turretTop + 0.3;
          _ev.addScaledVector(shot.dir, -1.0);
          const _ed = shot.dir.clone();
          const _es = new THREE.Vector3().crossVectors(shot.dir, new THREE.Vector3(0, 1, 0));
          if (_es.lengthSq() < 1e-6) _es.set(1, 0, 0);
          _es.normalize();
          setTimeout(() => { effects.ejectCasing(_ev, _ed, 'cannon', _es); }, 800 + Math.random() * 400);
        }
        const d01 = THREE.MathUtils.clamp(dist / 600, 0, 1);
        audio.playDistantFire(0.7 * (1 - d01 * 0.7));
        this.fireHesitation = this.diff.hesitMin + Math.random() * (this.diff.hesitMax - this.diff.hesitMin);
        // M2：仅从「计划态」（游走/peek/hold）开火才重排战术决策；转移（moving）中机会射击保持原计划
        // HE 拆掩体的开火（coverBlocked）不重排战术决策：拆墙期间保持当前计划
        const planned = (!this.diff.coverUse || !this.coverState || this.coverState === 'peeking') && !coverBlocked;
        if (planned) {
          this._postFireDecision(player);
        } else {
          this._stopT = 0;
        }
        if (this.onFire) this.onFire(t);
      }
      }
    }

    // ── 自动机枪：反应延时 → 连发/停射循环；命中 = 距离衰减 × AI 折扣 ──
    this._updateMG(dt, player, dist, effects, audio);
  }

  // ── AI 自动机枪（外露子系统毁伤，永不伤 HP；参数 AI_MG_RULES） ──
  _updateMG(dt, player, dist, effects, audio) {
    const t = this.tank;
    const R = AI_MG_RULES;
    // 不可用条件：无机枪/未点亮/超射程/目标已毁 → 复位状态
    if (!t.cfg.mg || !t.mgGroup || player.destroyed || !player.spotted ||
        dist > Math.min(R.range, t.cfg.mg.range)) {
      this.mgReactT = -1; this.mgBurst = 0; this.mgPauseT = 0;
      return;
    }
    const aim = _vA.set(player.pos.x, player.pos.y + 1.5, player.pos.z);
    t.updateMgTurret(dt, aim);
    // 反应时间：-1 = 未启动；倒计时钳位到 0（防过冲成负数被误判为未启动 → 永不开火的死循环）
    if (this.mgReactT < 0) this.mgReactT = R.reactMin + Math.random() * (R.reactMax - R.reactMin);
    if (this.mgReactT > 0) {
      this.mgReactT = Math.max(0, this.mgReactT - dt);
      if (this.mgReactT > 0) return;
    }
    // 连发间停射冷却
    if (this.mgPauseT > 0) { this.mgPauseT -= dt; return; }
    if (this.mgBurst <= 0) this.mgBurst = R.burstMin + Math.floor(Math.random() * (R.burstMax - R.burstMin + 1));
    // 射速节流 + 弹药
    t.mgTimer -= dt;
    if (t.mgTimer > 0 || t.mgAmmo <= 0) return;
    // M2 修正：目标不在视野内（地形遮挡/烟雾，含点亮保持期）→ 机枪暂停射击（不耗弹不推进连发）
    if (!this.visibility || !this.visibility.canSee(t, player)) return;
    t.mgTimer = 1 / t.cfg.mg.rate;
    t.mgAmmo--;
    this.mgBurst--;
    if (this.mgBurst <= 0) this.mgPauseT = R.pauseMin + Math.random() * (R.pauseMax - R.pauseMin);
    // 弹道：枪口 → 瞄准点 + 散布/瞄准扰动（aim 在 _vA，勿覆盖）
    const muzzle = _vB, dir = _vC;
    t.getMgMuzzle(muzzle, dir, aim);
    const dd = (t.cfg.mg.dispersion || 0.008) + R.aimErr;
    dir.x += (Math.random() * 2 - 1) * dd;
    dir.y += (Math.random() * 2 - 1) * dd;
    dir.z += (Math.random() * 2 - 1) * dd;
    dir.normalize();
    effects.mgTracer(muzzle, dir, t.cfg.mg.range);
    effects.mgMuzzleFlash(muzzle, dir);
    const v01 = THREE.MathUtils.clamp(1 - dist / 400, 0, 1);
    audio.playMG(0.5 * (0.3 + v01 * 0.7));
    // hitscan：线段-包围球（与玩家机枪同判定），命中再掷 距离衰减 × AI 命中折扣
    const c = _vD.copy(player.root.position); c.y += player.cfg.dims.hullHeight * 0.7;
    const r = Math.max(player.cfg.dims.length, player.cfg.dims.width) * 0.42 + 0.6;
    const ac = _vE.copy(c).sub(muzzle);
    const tt = THREE.MathUtils.clamp(ac.dot(dir), 0, t.cfg.mg.range);
    const point = _vE.copy(muzzle).addScaledVector(dir, tt);
    if (point.distanceToSquared(c) >= r * r) return;
    effects.gunImpact(point, dir, t.mgCaliber);
    const hitDist = muzzle.distanceTo(point);
    const [hitK, dmgK] = mgFalloff(hitDist);
    if (hitK > 0 && Math.random() < hitK * R.hitMul) {
      const mgh = player.resolveHitZone(point, dir);
      const evs = player.applyMGDamage(mgh.zone, dmgK * R.dmgMul, t.mgCaliber);
      for (const ev of evs) {
        if (this.onMGHit) this.onMGHit(ev.label, point, ev.type);
      }
    }
  }

  // ── 巡逻炮塔扫掠（±60° 往返，用车长塔伺服） ──
  _scanTurret(dt) {
    this.scanPhase += dt * 0.4;
    const yaw = Math.sin(this.scanPhase) * 1.05;
    const t = this.tank;
    _v.set(
      t.pos.x + Math.sin(t.heading + yaw) * 100,
      t.pos.y + 1.5,
      t.pos.z + Math.cos(t.heading + yaw) * 100,
    );
    t.aimAt(_v);
    t.updateTurret(dt);
  }

  // ── 失联包抄：先斜插最后已知位置侧翼 60m，再压向该位置 ──
  _flankMove(dt, lastPos) {
    const t = this.tank;
    if (!this.flankWp) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const yawToLast = Math.atan2(lastPos.x - t.pos.x, lastPos.z - t.pos.z);
      this.flankWp = new THREE.Vector3(
        lastPos.x + Math.sin(yawToLast + side * Math.PI * 0.5) * 60,
        0,
        lastPos.z + Math.cos(yawToLast + side * Math.PI * 0.5) * 60,
      );
    }
    const target = t.pos.distanceTo(this.flankWp) > 40 ? this.flankWp : lastPos;
    const yaw = Math.atan2(target.x - t.pos.x, target.z - t.pos.z);
    const { throttle, steer } = this._driveToward(yaw, dt, 0.9);
    t.drive(dt, throttle, steer);
  }

  // ── 估算命中分区与弱点瞄高（车体 1.1m / 炮塔 1.9m） ──
  // 视线方向转到玩家局部系：front / rear / side，取该分区车体与炮塔装甲较弱者
  _estZone(player, dirYaw) {
    const rel = wrapAngle(dirYaw - player.heading);
    const c = Math.cos(rel), s = Math.sin(rel);
    const a = player.cfg.armor;
    let hull, turret;
    if (Math.abs(c) >= Math.abs(s)) {
      if (c < 0) { hull = a.hullFront; turret = a.turretFront; }
      else { hull = a.hullRear; turret = a.turretRear; }
    } else {
      hull = a.hullSide; turret = a.turretSide;
    }
    return { armor: Math.min(hull, turret), aimY: hull <= turret ? 1.1 : 1.9 };
  }
  _weakAimY(player, dirYaw) { return this._estZone(player, dirYaw).aimY; }

  // ── 弹种选择 ──
  _selectShell(dt, player, dist) {
    const t = this.tank;
    if (!this.diff.switchShell) return;
    // 弹尽自动换弹：当前弹种打空 → 立即切到有备弹的弹种（不受冷却限制）
    if (t.shellPool[t.shellType] <= 0) {
      const alt = ['ap', 'heat', 'he'].find(k => t.shellPool[k] > 0);
      if (alt) { t.switchShell(alt); this._shellSwitchCd = 3; }
      return;
    }
    if (this._shellSwitchCd > 0) { this._shellSwitchCd -= dt; return; }   // 冷却中不评估（防边界摇摆反复重置装填）
    this.shellTimer -= dt;
    if (this.shellTimer > 0) return;
    this.shellTimer = 2.5;

    const zone = this._estZone(player, Math.atan2(player.pos.x - t.pos.x, player.pos.z - t.pos.z));
    const zoneArmor = zone.armor;
    const apPen = t.cfg.shellPen * (1 - t.cfg.shellPenDrop * dist / 1000);
    const heatPen = t.cfg.shellPen * SHELL_TYPES.heat.penMult;

    // 期望弹种：能穿用 AP；穿不了试 HEAT（更高穿深无衰减）；都穿不了 -> HE 刮痧
    let want = 'ap';
    let needFlank = false;
    if (apPen < zoneArmor * 1.05) {
      if (heatPen >= zoneArmor * 1.05 && t.shellPool.heat > 0) want = 'heat';
      else { want = 'he'; needFlank = true; }   // 正面无解：边刮痧边绕侧
    }
    this._needFlank = needFlank;
    // 收头：玩家残血且 HE 一定能溅射
    if (player.hp <= t.cfg.shellDamage * 1.2 && t.shellPool.he > 0) want = 'he';

    if (want !== this._wantShell) { this._wantShell = want; this._wantCount = 0; }
    this._wantCount++;
    if (want !== t.shellType && this._wantCount >= 2 && t.shellPool[want] > 0) {
      t.switchShell(want);
      this._shellSwitchCd = 9;   // 切弹后 ≥ 装填时间的冷却：保证至少打出一发再考虑换弹
    }
  }

  // ── 消耗品使用 ──
  _useConsumables(dt, player) {
    const t = this.tank;
    if (t.burning > 0) {
      this.burnReactT += dt;
      if (this.burnReactT > 0.8) { t.useExtinguisher(); this.burnReactT = 0; }
    } else this.burnReactT = 0;

    const urgent = t.mods.tracks > 0 || t.mods.ring > 0;
    if (urgent && (player.spotted || player.lostContact)) {
      this.trackReactT += dt;
      if (this.trackReactT > 1.2) { t.useRepairKit(); this.trackReactT = 0; }
    } else this.trackReactT = 0;

    // 观瞄损毁 / 雷达损毁（分布式传感 APS 无雷达，不在此列）/ 压制器损毁 → 反应性维修（与起火/断履带共用 1 个维修包）
    const sensorDead = t.optics.hp <= 0 || (t.aps && t.aps.rules.radarHp > 0 && t.aps.radarHp <= 0) || (t.lws && t.lws.emitterHp <= 0);
    if (sensorDead && (player.spotted || player.lostContact)) {
      this.sensorReactT += dt;
      if (this.sensorReactT > 2.5) { t.useRepairKit(); this.sensorReactT = 0; }
    } else this.sensorReactT = 0;
  }

  // ── M2 开火后战术决策：概率选择 找掩体 / 侧向位移 / 原地对射（反套路） ──
  _postFireDecision(player) {
    const t = this.tank;
    this._stopT = 0;
    const pt = (this.diff.coverUse && this.visibility) ? this._bestCoverPt(player) : null;
    const pCover = this._justHit ? (this.diff.coverChanceAfterHit || 0.85) : (this.diff.coverChance || 0.6);
    const r = Math.random();
    let choice;
    if (!pt) {
      // 无合格掩体：侧移 55% / 拉烟掩护 25%（有烟且未用尽）/ 原地对射 20%
      const canSmoke = this.diff.smokeUse && this.smokeRef && t.smokeAmmo > 0 && t.smokeCooldown <= 0;
      choice = r < 0.55 ? 'strafe' : (r < 0.8 && canSmoke ? 'smoke' : 'hold');
    } else {
      choice = r < pCover ? 'cover' : (r < pCover + 0.25 ? 'strafe' : 'hold');
    }
    // 防套路：连续两次同行为 → 强制切换
    if (choice === this._lastBehavior && choice !== 'hold') {
      this._sameCount++;
      if (this._sameCount >= 2) choice = choice === 'cover' ? 'strafe' : 'cover';
    } else this._sameCount = 0;
    this._lastBehavior = choice;
    this._justHit = false;
    if (choice === 'cover' && pt) {
      this.coverPt = pt;
      this.coverState = 'moving';
    } else if (choice === 'strafe' || choice === 'smoke') {
      this.coverState = null;
      this._dashT = 1.5 + Math.random() * 1.5;   // 拉烟/侧移：掩体缺失时转移
      this._dashDir = Math.random() < 0.5 ? 1 : -1;
      if (choice === 'smoke' && this.smokeRef && this.smokeRef.fire(t)) {
        t.smokeAmmo--; t.smokeCooldown = 4;      // 拉烟掩护转移（烟云遮断玩家视线）
      }
    } else {
      // hold：原地继续短停对射
      this.coverState = this.coverState === 'peeking' ? 'peeking' : null;
      this._peekOrigin = { x: this.tank.pos.x, z: this.tank.pos.z };
      this._dashT = 0;
    }
  }

  // ── M2 掩体评分：环带采样（24 点），返回 { x, z } 或 null ──
  _bestCoverPt(player) {
    const t = this.tank, vis = this.visibility;
    if (!vis || !t.world || !t.world.groundY) return null;
    const baseYaw = Math.atan2(player.pos.x - t.pos.x, player.pos.z - t.pos.z);
    const bound = GAME.mapSize / 2 - 25;
    let best = null, bestScore = this.diff.coverScoreMin || 4;
    const radii = [this.diff.coverMin, (this.diff.coverMin + this.diff.coverMax) / 2, this.diff.coverMax];
    for (const R of radii) {
      for (let i = 0; i < 8; i++) {
        // 采样偏向远离玩家的一侧（掩体通常在身后）
        const ang = baseYaw + Math.PI + (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const px = t.pos.x + Math.sin(ang) * R, pz = t.pos.z + Math.cos(ang) * R;
        if (Math.abs(px) > bound || Math.abs(pz) > bound) continue;
        const gy = t.world.groundY(px, pz);
        if (!vis.canSeePoint(px, pz, gy + t.cfg.dims.hullHeight * 0.5, player)) continue;   // 车体藏不住的点直接跳过
        const turretSees = vis.canSeePoint(px, pz, gy + t.cfg.dims.turretTop * 0.85, player);
        let score = turretSees ? 3 : 1;   // hull-down 3 / 纯藏身 1
        score -= Math.abs(Math.hypot(player.pos.x - px, player.pos.z - pz) - this.diff.preferRange) / 200;
        score -= Math.hypot(px - t.pos.x, pz - t.pos.z) / 150;
        let blocked = false, nearHard = 0;
        for (const o of (t.world.obstacles || [])) {
          if (this._segBlocked(px, pz, o)) { blocked = true; break; }   // 直线穿障：不可达，跳过
          if (o.r >= 2.5 && Math.hypot(px - o.x, pz - o.z) < o.r + 6) nearHard = 1;   // 贴近硬掩体
        }
        if (blocked) continue;
        score += nearHard;
        if (score > bestScore) { bestScore = score; best = { x: px, z: pz }; }
      }
    }
    return best;
  }

  // ── M2：AI 当前位置到候选点的线段是否穿过障碍圆（路径成本惩罚） ──
  _segBlocked(px, pz, o) {
    const t = this.tank;
    const ax = t.pos.x, az = t.pos.z;
    const dx = px - ax, dz = pz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return false;
    const tt = ((o.x - ax) * dx + (o.z - az) * dz) / len2;
    if (tt < 0 || tt > 1) return false;
    const cx = ax + dx * tt - o.x, cz = az + dz * tt - o.z;
    return cx * cx + cz * cz < (o.r + 1) * (o.r + 1);
  }

  // ── M1 障碍绕行：行进方向前方的硬障碍圆 → 附加切向转向（权重随接近程度增大） ──
  _avoidSteer(dirYaw) {
    const t = this.tank;
    const obs = t.world && t.world.obstacles;
    if (!this.diff.avoidObstacles || !obs || !obs.length) return 0;
    const sx = Math.sin(dirYaw), sz = Math.cos(dirYaw);
    let adj = 0;
    for (const o of obs) {
      const dx = o.x - t.pos.x, dz = o.z - t.pos.z;
      const fwd = dx * sx + dz * sz;                 // 沿行进方向的前向距离
      if (fwd < -o.r || fwd > 22 + o.r) continue;
      const side = dx * sz - dz * sx;                // 横向偏移
      const clear = o.r + 3.5;
      if (Math.abs(side) < clear) {
        adj += (side >= 0 ? -1 : 1) * (1 - Math.abs(side) / clear) * (1 - Math.max(fwd, 0) / (22 + o.r));
      }
    }
    return THREE.MathUtils.clamp(adj, -1, 1);
  }

  _driveToward(targetYaw, dt, throttleScale) {
    const t = this.tank;
    let dy = targetYaw - t.heading;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(dy * 2.2, -1, 1);
    // 大转角先减速转向
    const throttle = Math.abs(dy) > 1.1 ? 0.15 : throttleScale;
    return { throttle, steer };
  }
}
