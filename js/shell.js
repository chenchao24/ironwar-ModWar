// ═══ 炮弹：高速弹道 + 曳光 + 命中检测 + 穿甲/跳弹/殉爆结算 ═══
import * as THREE from 'three';
import { GAME, ZONE_NAMES, SHELL_TYPES, BIG_DUST_RULES } from './config.js';

const _v = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _dirN = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _center = new THREE.Vector3();

export class ShellManager {
  constructor(scene, effects, audio, world) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.world = world;
    this.shells = [];
    this.tanks = [];          // 战斗中的坦克（由 main 注入）
    this.onPlayerHit = null;  // 玩家被命中的回调（UI）
    this.onEnemyHit = null;   // 玩家命中敌人的回调（UI）
    this.onAPSIntercept = null;  // 玩家 APS 拦截结果回调（effective: bool）

    // 曳光弹体（共享几何体）
    this.tracerGeo = new THREE.CylinderGeometry(0.05, 0.05, 6, 5);
    this.tracerGeo.rotateX(Math.PI / 2);   // 长轴对齐 +z
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd890 });
  }

  fire(data) {
    const tracer = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    tracer.position.copy(data.pos);
    this.scene.add(tracer);
    // 炮口侧向风偏忽略，直线 + 重力
    this.shells.push({
      pos: data.pos.clone(),
      vel: data.dir.clone().multiplyScalar(data.velocity),
      pen: data.pen, penDrop: data.penDrop,
      damage: data.damage, spread: data.spread,
      owner: data.owner,
      shellType: data.shellType,   // 弹种（AP/HEAT/HE 规则差异；缺失曾导致全部按 AP 结算）
      dist: 0, tracer,
      life: 6,
    });
    // 尾迹烟
    this.effects.ps.spawn('glow', {
      x: data.pos.x, y: data.pos.y, z: data.pos.z,
      life: 0.08, size0: 1.6, size1: 0.6, alpha: 0.9,
    });
  }

  update(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      // 子步进避免隧穿（炮弹极快）
      const steps = Math.max(1, Math.ceil(s.vel.length() * dt / 3));
      let hit = false;
      for (let k = 0; k < steps && !hit; k++) {
        const sdt = dt / steps;
        const prev = _prev.copy(s.pos);
        s.vel.y -= GAME.shellGravity * sdt;
        s.pos.addScaledVector(s.vel, sdt);
        const stepLen = s.pos.distanceTo(prev);
        s.dist += stepLen;

        // 地面命中
        const gy = this.world.groundY(s.pos.x, s.pos.z);
        if (s.pos.y <= gy) {
          this.effects.dirtHit(s.pos);
          const dToPlayer = this._distToPlayer(s.pos);
          this.audio.playExplosion(0.35, THREE.MathUtils.clamp(dToPlayer / 400, 0, 1));
          hit = true;
          break;
        }

        // ── APS 拦截窗（规则按 APS 类型：Trophy 8~25m / StrikeShield 5~15m）──
        for (const t of this.tanks) {
          if (t === s.owner || t.destroyed || !t.aps) continue;
          if (t.aps.charges <= 0 || t.aps.cooldown > 0) continue;
          const AR = t.aps.rules;
          if (s.dist < AR.minRange) continue;
          const d = s.pos.distanceTo(t.root.position);
          if (d < AR.windowMin || d > AR.windowMax) continue;
          const res = t.tryAPSIntercept(s.shellType);
          if (!res.fired) continue;
          // 拦截空爆特效（无论是否摧毁弹丸，APS 都打了；沿弹道反向定向爆轰）
          _dirN.copy(s.vel).normalize();
          this.effects.apsIntercept(s.pos, res.effective, _dirN);
          this.audio.playExplosion(0.85, THREE.MathUtils.clamp(this._distToPlayer(s.pos) / 400, 0, 1));
          if (res.effective) {
            if (s.owner.isPlayer && this.onEnemyHit) {
              this.onEnemyHit('炮弹被拦截！', 0, false, s.pos.clone(), null, 0);
            }
            if (t.isPlayer && this.onAPSIntercept) this.onAPSIntercept(true);
            hit = true;
            break;
          }
          // 发射但无效（破片未摧毁弹芯）：炮弹继续飞
          if (s.owner.isPlayer && this.onEnemyHit) {
            this.onEnemyHit('拦截失败！破片未命中弹芯', 0, false, s.pos.clone(), null, 0);
          }
          if (t.isPlayer && this.onAPSIntercept) this.onAPSIntercept(false);
        }
        if (hit) break;

        // 坦克命中
        for (const t of this.tanks) {
          if (t === s.owner || t.destroyed) continue;
          if (this._segmentHitsTank(prev, s.pos, t)) {
            s.pos.copy(_closest);   // 命中点贴到线段最近点
            hit = this._resolveTankHit(s, t);   // 跳弹续飞时返回 false：炮弹不销毁
            break;
          }
        }

        // ── 可破坏地图物件（可选钩子：world 提供 onShellHitDestructible 时启用，正式地图不受影响） ──
        if (!hit && this.world.onShellHitDestructible &&
            this.world.onShellHitDestructible(prev, s.pos, s)) {
          hit = true;
          break;
        }
      }

      if (hit || s.life <= 0 ||
          Math.abs(s.pos.x) > GAME.mapSize || Math.abs(s.pos.z) > GAME.mapSize) {
        this.scene.remove(s.tracer);
        this.shells.splice(i, 1);
        continue;
      }
      // 曳光姿态
      s.tracer.position.copy(s.pos);
      s.tracer.lookAt(_v.copy(s.pos).add(s.vel));
      // 尾迹
      if (Math.random() < dt * 90) {
        this.effects.ps.spawn('smoke', {
          x: s.pos.x, y: s.pos.y, z: s.pos.z,
          life: 0.35, size0: 0.35, size1: 1.1, alpha: 0.18,
        });
      }
    }
  }

  _distToPlayer(p) {
    const pl = this.tanks.find((t) => t.isPlayer);
    return pl ? p.distanceTo(pl.root.position) : 999;
  }

  // 粗判：线段与坦克包围球相交（高速弹近似足够）
  _segmentHitsTank(a, b, tank) {
    const c = _center.copy(tank.root.position);
    c.y += tank.cfg.dims.hullHeight * 0.7;   // 近似质心
    const r = Math.max(tank.cfg.dims.length, tank.cfg.dims.width) * 0.42 + 0.6;
    const ab = _ab.copy(b).sub(a);
    const len = ab.length();
    if (len < 1e-6) return false;
    ab.divideScalar(len);
    const ac = _ac.copy(c).sub(a);
    const t = THREE.MathUtils.clamp(ac.dot(ab), 0, len);
    const closest = _closest.copy(a).addScaledVector(ab, t);
    return closest.distanceToSquared(c) < r * r;
  }

  // 返回 true = 炮弹销毁；false = 跳弹续飞
  _resolveTankHit(shell, tank) {
    // 跳弹后的乏弹：再命中只出火花无伤害
    if (shell.spent) {
      this.effects.impactSparks(shell.pos, null);
      this.audio.playHitArmor(false);
      return true;
    }
    const def = SHELL_TYPES[shell.shellType] || SHELL_TYPES.ap;
    const penAtRange = shell.pen * (1 - def.penDropK * shell.penDrop * shell.dist / 1000);
    const dir = shell.vel.clone().normalize();
    const hit = tank.resolveHitZone(shell.pos, dir);
    const result = tank.applyHit(hit, penAtRange, shell.shellType, shell.pos, dir);

    // ── 爆反击碎：板被消耗即爆闪 + 事件（击穿分支随 events 上报） ──
    if (hit.eraStripped) {
      this.effects.eraFlash(shell.pos, dir);
    }
    const isPlayerOwner = shell.owner.isPlayer;
    const isPlayerTarget = tank.isPlayer;

    if (result.type === 'ricochet') {
      // 跳弹续飞：速度改为反射方向 ×0.55、vy+3 继续飞；标记 spent
      const n = hit.normal;
      const v = shell.vel;
      const sp = v.length() * 0.55;
      _v.copy(v).normalize();
      _v.addScaledVector(n, -2 * _v.dot(n)).normalize();   // 反射方向
      if (Math.random() < BIG_DUST_RULES.ricochetChance) this.effects.bigDustBurst(shell.pos, BIG_DUST_RULES.bounceScale);
      this.effects.ricochetSpark(shell.pos, _v);
      v.copy(_v).multiplyScalar(sp);
      v.y += 3;
      shell.spent = true;
      this.audio.playRicochet();
      if (isPlayerOwner && this.onEnemyHit) this.onEnemyHit(hit.eraStripped ? '跳弹·爆反击碎！' : '跳弹！', 0, false, shell.pos, this._eraEvents(hit), shell.damage);
      if (isPlayerTarget && this.onPlayerHit) this.onPlayerHit('ricochet', dir);
      return false;
    }
    if (result.type === 'bounce') {
      if (Math.random() < BIG_DUST_RULES.bounceChance) this.effects.bigDustBurst(shell.pos, BIG_DUST_RULES.bounceScale);   // 概率大烟尘
      this.effects.impactSparks(shell.pos, null);
      this.audio.playHitArmor(false);
      if (def.splashFrac > 0) {
        // HE 未击穿：溅射保底伤害（履带区概率断履带）
        const splash = tank.applyHESplash(hit, shell.damage * def.splashFrac);
        const splashEvents = (splash.events || []).concat(this._eraEvents(hit));
        this._reportResult(tank, hit, { ...splash, events: splashEvents, blockedDmg: Math.max(0, shell.damage - (splash.damage || 0)) }, def, isPlayerOwner, isPlayerTarget, dir, '');
      } else {
        if (isPlayerOwner && this.onEnemyHit) {
          const lbl = `未能击穿${ZONE_NAMES[result.zone] || ''}！` + (hit.eraStripped ? '·爆反击碎' : '');
          this.onEnemyHit(lbl, 0, false, shell.pos, this._eraEvents(hit), shell.damage);
        }
        if (isPlayerTarget && this.onPlayerHit) this.onPlayerHit('bounce', dir);
      }
      return true;
    }
    if (result.type === 'dead') return true;

    // 击穿（入口定向锥火花）
    this.effects.penetrationBurst(shell.pos, dir);
    const events = (result.events || []).concat(this._eraEvents(hit));
    // 弹芯穿出车体另一侧 -> 出口喷射特效
    const exitEv = events.find((e) => e.type === 'exit');
    if (exitEv) this.effects.penExit(exitEv.pos, exitEv.dir);
    // 殉爆统一由 penInside 弹药架触发（events 携带）
    const ammoBoom = events.some((e) => e.type === 'ammo_boom');
    const sideRearHull = hit.zone === 'hullSide' || hit.zone === 'hullRear';
    const out = tank.applyDamage(shell.damage, result.mult, sideRearHull);

    if (ammoBoom) {
      // 殉爆：起爆 + 延爆链由 tank.destroy(true) 触发，这里只补音效与震屏
      this.audio.playExplosion(2.6, THREE.MathUtils.clamp(this._distToPlayer(tank.root.position) / 500, 0, 1));
      this.effects.addShake(1.4);
    } else if (out.killed) {
      this.effects.explosion(tank.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 1.6);
      this.audio.playExplosion(1.6, THREE.MathUtils.clamp(this._distToPlayer(tank.root.position) / 500, 0, 1));
      this.effects.addShake(0.9);
    } else {
      // 击穿未击杀：概率扬起大烟尘（击杀/殉爆已有大爆炸，不叠加）
      if (Math.random() < BIG_DUST_RULES.penChance) this.effects.bigDustBurst(shell.pos, BIG_DUST_RULES.penScale);
      this.audio.playHitArmor(true);
      if (out.special === 'fire' || events.some((e) => e.type === 'fire')) {
        this.audio.startFire();
      }
    }

    this._reportResult(tank, hit, { ...out, events, ammoBoom }, def, isPlayerOwner, isPlayerTarget, dir, `击穿${ZONE_NAMES[hit.zone] || ''}！`);
    return true;
  }

  // 爆反事件（板被消耗 → 逐块生成事件，供 hitLog/飘字）
  _eraEvents(hit) {
    if (!hit.eraStripped) return [];
    const out = [];
    for (let i = 0; i < hit.eraStripped; i++) out.push({ type: 'era', label: '击碎敌爆反' });
    return out;
  }

  // 击穿/HE 溅射共用的反馈上报（hitLog/飘字/UI 标记/受击方向）
  _reportResult(tank, hit, out, def, isPlayerOwner, isPlayerTarget, dir, penLabel) {
    if (isPlayerOwner && this.onEnemyHit) {
      const zoneName = ZONE_NAMES[hit.zone] || '';
      const label = out.ammoBoom ? '弹药殉爆！'
        : out.killed ? '目标摧毁！'
        : out.type === 'splash' ? `HE 溅射${zoneName}`
        : penLabel;
      const events = out.events || [];
      this.onEnemyHit(label, out.damage || 0, out.killed, hit.worldPos, events, out.blockedDmg || 0);
    }
    if (isPlayerTarget && this.onPlayerHit) {
      this.onPlayerHit(out.type === 'splash' ? 'bounce' : 'pen', dir, out, out.events);
    }
  }

  clear() {
    for (const s of this.shells) this.scene.remove(s.tracer);
    this.shells.length = 0;
  }
}
