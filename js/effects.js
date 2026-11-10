// ═══ 特效编排：炮口风暴 / 爆炸 / 殉爆喷火 / 机炮·命中共用火花 / 地面尘幕 / 扬尘 / 排气 / 残骸燃烧 ═══
// 配方移植自 modalTank 实测参数；注意本项目粒子 grav 符号约定：正值 = 向下（modalTank 负值 = 向下，已换算）
import * as THREE from 'three';

const V = () => new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3();
const _NEG_Z = new THREE.Vector3(0, 0, -1);

export class Effects {
  constructor(scene, particles, audio, terrainHeightFn) {
    this.scene = scene;
    this.ps = particles;
    this.audio = audio;
    this.groundY = terrainHeightFn;
    this.shakeAmount = 0;
    // 冲击波环（池化）
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.PlaneGeometry(32, 32);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uRingR: { value: 0 }, uWidth: { value: 0.8 }, uAlpha: { value: 0 },
          uColor: { value: new THREE.Color(0xd8c8a0) },
        },
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uRingR,uWidth,uAlpha; uniform vec3 uColor; varying vec2 vP;
          void main(){ float r = length(vP); float d = (r - uRingR) / uWidth; float a = exp(-d*d*0.6) * uAlpha; if (a < 0.006) discard; gl_FragColor = vec4(uColor, a); }`,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.rings.push({ mesh, t: 1, dur: 1, size: 1, alpha: 0.5 });
    }
    // 碎片（池化）：默认小方块（砖石）；wood=true 换长条形木片几何；shard=true 换不规则斜劈铁片
    this.debris = [];
    this.debrisGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.woodGeo = new THREE.BoxGeometry(0.55, 0.035, 0.12);   // 长条薄木片
    this.leafGeo = new THREE.BoxGeometry(0.075, 0.008, 0.045);   // 叶片 7.5cm×4.5cm
    // 斜劈破片：四面体 + 各顶点随机径向拉伸（焊接同位顶点保证面不撕裂）→ 歪斜铁片感
    this.shardGeo = (() => {
      const g = new THREE.TetrahedronGeometry(0.16, 0);
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      const seen = new Map();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const key = v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3);
        if (!seen.has(key)) seen.set(key, 0.6 + Math.random() * 0.8);
        v.multiplyScalar(seen.get(key));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    })();
    const dGeo = this.debrisGeo;
    const dMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9 });
    for (let i = 0; i < 200; i++) {
      const m = new THREE.Mesh(dGeo, dMat);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.debris.push({ mesh: m, vel: V(), rot: V(), life: 0, grav: 22, drag: 0 });
    }
    // 机枪曳光弹飞行体（拉长圆柱体，池化）
    const MG = 48;
    this.mgBullets = [];
    this.mgPool = [];
    this.mgGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6);
    this.mgGeo.rotateX(Math.PI / 2);
    {
      const p = this.mgGeo.attributes.position;
      const half = 0.6, amp = 0.05;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i);
        const u = (z / half + 1) * 0.5;
        p.setY(i, p.getY(i) + Math.sin(u * Math.PI) * amp);
      }
      p.needsUpdate = true;
      this.mgGeo.computeVertexNormals();
    }
    this.mgMat = new THREE.MeshBasicMaterial({ color: 0xffd35a, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < MG; i++) {
      const m = new THREE.Mesh(this.mgGeo, this.mgMat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.mgPool.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1 });
    }

    // ── 弹壳抛壳系统（池化） ──
    this.casings = [];
    this.casingPool = [];
    // 三种弹壳几何体：机枪小弹壳 / M230机炮弹壳 / 炮弹大弹壳
    const geoMg = new THREE.CylinderGeometry(0.0075, 0.0075, 0.12, 6);
    const geoM230 = new THREE.CylinderGeometry(0.0175, 0.0175, 0.20, 6);
    const geoCannon = new THREE.CylinderGeometry(0.07, 0.07, 0.40, 8);
    this.casingGeos = { mg: geoMg, m230: geoM230, cannon: geoCannon };
    this.casingMats = {
      brass: new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.35, metalness: 0.8 }),
      olive: new THREE.MeshStandardMaterial({ color: 0x4b5320, roughness: 0.55, metalness: 0.5 }),
    };
    const CASING_POOL = 80;
    for (let i = 0; i < CASING_POOL; i++) {
      const m = new THREE.Mesh(geoMg, this.casingMats.brass);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.casingPool.push({ mesh: m, vel: new THREE.Vector3(), angVel: new THREE.Vector3(), life: 0, max: 1, settled: false });
    }
  }

  addShake(a) { this.shakeAmount = Math.min(this.shakeAmount + a, 1.6); }

  // ── 炮口风暴：核心爆闪 + 制退器侧瓣 + 前向火舌 + 冲击环 + 前喷炮烟 + 侧向云 ──
  // sideDir = 炮口横向（世界）；缺省时由 dir × up 计算
  muzzleBlast(pos, dir, sideDir = null) {
    if (sideDir) _side.copy(sideDir);
    else _side.crossVectors(dir, _up);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    _side.normalize();
    // 核心爆闪
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.12, size0: 7, size1: 19, alpha: 1,
      c0: [1, 0.97, 0.82], c1: [1, 0.55, 0.18], fadeIn: 0.22, rotSpeed: 0,
    });
    // 制退器侧瓣 ×2
    for (const side of [1, -1]) {
      this.ps.spawn('glow', {
        x: pos.x + _side.x * side * 1.1, y: pos.y + _side.y * side * 1.1, z: pos.z + _side.z * side * 1.1,
        life: 0.09, size0: 3.6, size1: 8.5, alpha: 0.95,
        c0: [1, 0.82, 0.45], c1: [1, 0.42, 0.1], fadeIn: 0.3, rotSpeed: 0,
      });
    }
    // 前向火舌
    for (let i = 0; i < 8; i++) {
      const sp = 28 + Math.random() * 26;
      const j2 = () => (Math.random() - 0.5) * 2.2;
      this.ps.spawn('fire', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + j2(), vy: dir.y * sp + 1 + j2(), vz: dir.z * sp + j2(),
        life: 0.11 + Math.random() * 0.08, size0: 2, size1: 5, alpha: 0.95, drag: 3,
        c0: [1, 0.9, 0.6], c1: [1, 0.45, 0.12], fadeIn: 0.4,
      });
    }
    // 冲击环
    this._ring(pos, 13, 0.26, 0.85);
    // 前喷炮烟：瞬间云团（出生即大，快速膨胀）
    for (let i = 0; i < 42; i++) {
      const sp = 14 + Math.random() * 16;
      const j = () => (Math.random() - 0.5) * 4.5;
      this.ps.spawn('smoke', {
        x: pos.x + dir.x * 0.6, y: pos.y + dir.y * 0.6, z: pos.z + dir.z * 0.6,
        vx: dir.x * sp + j(), vy: dir.y * sp + Math.abs(j()) * 0.5, vz: dir.z * sp + j(),
        life: 0.9 + Math.random() * 0.8, size0: 2, size1: 6.5 + Math.random() * 2.5,
        alpha: 0.38, drag: 3.2, grav: -0.55, windK: 0.7,
        c0: [0.93, 0.91, 0.87], c1: [0.55, 0.53, 0.5], fadeIn: 0.06, sizeEase: 1.9,
      });
    }
    // 制退器侧向云
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const sp = 7 + Math.random() * 8;
      this.ps.spawn('smoke', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: _side.x * side * sp + (Math.random() - .5) * 2, vy: 0.7 + Math.random() * 0.8,
        vz: _side.z * side * sp + (Math.random() - .5) * 2,
        life: 1 + Math.random() * 0.7, size0: 1.6, size1: 5 + Math.random() * 2,
        alpha: 0.3, drag: 2.4, grav: -0.45, windK: 0.6,
        c0: [0.88, 0.85, 0.8], c1: [0.5, 0.48, 0.46], fadeIn: 0.06, sizeEase: 1.8,
      });
    }
    this.ps.flash(pos, 0xffa550, 62, 23);   // ≈0.2s
    // 炮口近地：爆风震起地面浮尘
    const gy = this.groundY(pos.x, pos.z);
    if (pos.y - gy < 12) {
      const k = Math.max(0.4, Math.min(1.2, 1.15 - (pos.y - gy) * 0.08));
      this.groundShock({ x: pos.x, y: gy, z: pos.z }, k);
    }
  }

  // ── 地面浮尘幕：以 pos（y=地面高）为中心一圈震起浮尘（开炮/爆炸用） ──
  groundShock(pos, strength = 1) {
    const R = 2.4 + strength * 1.8;   // 浮尘环半径
    const gy = pos.y;
    // 外圈烟幕：超大·淡而可见·快速外扩飘散
    const n1 = 10 + Math.round(strength * 5);
    for (let i = 0; i < n1; i++) {
      const a = (i / n1) * Math.PI * 2 + Math.random() * 0.6;
      const sp = (2.6 + Math.random() * 3.6) * strength;
      this.ps.spawn('smoke', {
        x: pos.x + Math.cos(a) * R, y: gy + 0.22 + Math.random() * 0.3, z: pos.z + Math.sin(a) * R,
        vx: Math.cos(a) * sp, vy: 0.9 + Math.random() * 1.2, vz: Math.sin(a) * sp,
        life: 1.5 + Math.random() * 1.1, size0: 2, size1: 9 + Math.random() * 5,
        alpha: 0.24 + Math.random() * 0.06, drag: 1.15, grav: 0.12, windK: 1.7,
        c0: [0.67, 0.58, 0.43], c1: [0.58, 0.5, 0.39], fadeIn: 0.14, sizeEase: 1.3,
      });
    }
    // 内圈核心：稍浓但同样虚化
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.ps.spawn('smoke', {
        x: pos.x + Math.cos(a) * 0.8, y: gy + 0.2, z: pos.z + Math.sin(a) * 0.8,
        vx: Math.cos(a) * 3.4 * strength, vy: 1.3 + Math.random() * 1.4, vz: Math.sin(a) * 3.4 * strength,
        life: 1.2 + Math.random() * 0.8, size0: 1.4, size1: 6,
        alpha: 0.32, drag: 1.5, grav: 0.1, windK: 1.4,
        c0: [0.61, 0.52, 0.39], c1: [0.54, 0.47, 0.37], fadeIn: 0.1, sizeEase: 1.35,
      });
    }
    // 地面尘环（淡白尘环快速掠过）
    this._ring(pos, 10 * strength, 0.5, 0.18);
  }

  // ── 火药残烟：开炮 0.5s 后炮口喷出白烟团（tank.js 倒计时驱动） ──
  boreEvac(pos, dir) {
    for (let i = 0; i < 22; i++) {
      const sp = 2.5 + Math.random() * 3.5;
      const j = () => (Math.random() - 0.5) * 1.6;
      this.ps.spawn('smoke', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + j(), vy: dir.y * sp + 0.9 + Math.random() * 0.7, vz: dir.z * sp + j(),
        life: 1 + Math.random() * 0.35, size0: 1.5, size1: 3.3,
        alpha: 0.5, drag: 1.4, grav: -0.3, windK: 0.9,
        c0: [0.9, 0.89, 0.87], c1: [0.72, 0.71, 0.7], fadeIn: 0.1, sizeEase: 1.7,
      });
    }
  }

  // ── 装甲命中火花（跳弹/未击穿/击穿入口统一；dir 可空 = 半球四溅） ──
  hitSpark(pos, dir) {
    const n = dir ? 22 : 18;
    for (let i = 0; i < n; i++) {
      const sp = 9 + Math.random() * 16;
      if (dir) {
        // 定向：沿弹道方向喷入装甲（击穿入口锥）
        const j = () => (Math.random() - .5) * 6.5;
        this.ps.spawn('glow', {
          x: pos.x, y: pos.y, z: pos.z,
          vx: dir.x * sp + j(), vy: dir.y * sp + 1.6 + j() * 0.3, vz: dir.z * sp + j(),
          life: 0.3 + Math.random() * 0.28, size0: 0.44, size1: 0.05, alpha: 1, grav: 19, drag: 0.45,
          c0: [1, 0.93, 0.65], c1: [1, 0.5, 0.15], fadeIn: 0.1,
        });
      } else {
        const a = Math.random() * Math.PI * 2, e = Math.random() * 2;
        this.ps.spawn('glow', {
          x: pos.x, y: pos.y, z: pos.z,
          vx: Math.cos(a) * sp * Math.sin(e), vy: Math.abs(Math.cos(e)) * sp, vz: Math.sin(a) * sp * Math.sin(e),
          life: 0.32 + Math.random() * 0.26, size0: 0.4, size1: 0.05, alpha: 1, grav: 20, drag: 0.4,
          c0: [1, 0.9, 0.6], c1: [1, 0.5, 0.15], fadeIn: 0.12,
        });
      }
    }
    // 入口炽白闪
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.13, size0: 2.4, size1: 5.5, alpha: 1,
      c0: [1, 0.95, 0.8], c1: [1, 0.6, 0.2], fadeIn: 0.3, rotSpeed: 0,
    });
    // 命中硝烟：浅/中/深灰三档多团向上飘散
    const grays = [
      { c0: [0.62, 0.6, 0.57], c1: [0.5, 0.48, 0.45], a: 0.5 },
      { c0: [0.42, 0.4, 0.37], c1: [0.3, 0.29, 0.27], a: 0.55 },
      { c0: [0.26, 0.25, 0.23], c1: [0.15, 0.14, 0.13], a: 0.6 },
    ];
    for (let i = 0; i < 9; i++) {
      const g = grays[i % 3];
      this.ps.spawn('smoke', {
        x: pos.x + (Math.random() - .5) * 1.2, y: pos.y + Math.random() * 0.5, z: pos.z + (Math.random() - .5) * 1.2,
        vx: (Math.random() - .5) * 2.2, vy: 2.2 + Math.random() * 2.2, vz: (Math.random() - .5) * 2.2,
        life: 1.8 + Math.random() * 1.4, size0: 1.2 + Math.random(), size1: 4.5 + Math.random() * 3,
        alpha: g.a, windK: 0.9, drag: 0.5, sizeEase: 1.7,
        c0: g.c0, c1: g.c1, fadeIn: 0.2,
      });
    }
    this.ps.flash(pos, 0xffd080, 26, 38);   // ≈0.12s
  }

  // ── 命中大烟尘：整车扬尘（①车身震动涌尘 ②四周地面随机散布浮尘，非环形不径向外扩）
  // 重质尘配方：低升速 + 微沉降贴地悬停随风漫散（类似树木压倒的扬尘），非热烟上蹿 ──
  bigDustBurst(pos, scale = 1) {
    // ① 车身震动尘：命中点及周边涌出的多层灰尘团，缓慢涌起后悬在车体周围
    const grays = [
      { c0: [0.58, 0.56, 0.53], c1: [0.44, 0.42, 0.4], a: 0.55 },
      { c0: [0.4, 0.38, 0.35], c1: [0.28, 0.27, 0.25], a: 0.6 },
      { c0: [0.25, 0.24, 0.22], c1: [0.14, 0.13, 0.12], a: 0.65 },
    ];
    for (let i = 0; i < 20; i++) {
      const g = grays[i % 3];
      const j = () => (Math.random() - .5) * 2.6;
      this.ps.spawn('smoke', {
        x: pos.x + j(), y: pos.y + Math.random() * 0.8, z: pos.z + j(),
        vx: j() * 1.6, vy: 0.3 + Math.random() * 0.6, vz: j() * 1.6,
        life: 2.4 + Math.random() * 2.2, size0: 1.8 + Math.random() * 1.6,
        size1: (10 + Math.random() * 4) * scale,
        alpha: g.a, windK: 1.3, drag: 1.6, grav: 0.08, sizeEase: 1.5,
        c0: g.c0, c1: g.c1, fadeIn: 0.1 + Math.random() * 0.1,
      });
    }
    // ② 地面浮尘：命中点地面投影周围逐点独立随机散布，缓慢漫起悬停
    const gy = this.groundY(pos.x, pos.z);
    const earths = [
      { c0: [0.55, 0.46, 0.34], c1: [0.38, 0.32, 0.24] },   // 土色
      { c0: [0.46, 0.42, 0.37], c1: [0.3, 0.27, 0.23] },    // 灰土
    ];
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * 4;
      const e = earths[i % 2];
      this.ps.spawn('smoke', {
        x: pos.x + Math.sin(a) * r, y: gy + 0.15 + Math.random() * 0.4, z: pos.z + Math.cos(a) * r,
        vx: (Math.random() - .5) * 1.8, vy: 0.15 + Math.random() * 0.5, vz: (Math.random() - .5) * 1.8,
        life: 2.2 + Math.random() * 1.8, size0: 1.6 + Math.random() * 1.2,
        size1: (7 + Math.random() * 4) * scale,
        alpha: 0.5 + Math.random() * 0.12, drag: 1.2, grav: 0.1, windK: 1.5,
        c0: e.c0, c1: e.c1, fadeIn: 0.12 + Math.random() * 0.15, sizeEase: 1.4,
      });
    }
  }

  // ── 机枪曳光弹（拉长圆柱体飞行体，从枪口沿 dir 飞行淡出） ──
  mgTracer(pos, dir, len = 200) {
    const b = this.mgPool.pop();
    if (!b) return;
    b.mesh.visible = true;
    b.mesh.position.copy(pos);
    b.mesh.quaternion.setFromUnitVectors(_NEG_Z, dir);
    b.mesh.scale.setScalar(1);
    b.vel.copy(dir).multiplyScalar(300);
    const dist = Math.min(len, 400);
    b.life = b.max = dist / 300;
    this.mgBullets.push(b);
  }

  // ── 机枪枪口：短火光 + 微烟（参考 darkWil 玩家小闪光） ──
  mgMuzzleFlash(pos, dir) {
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.04, size0: 0.45, size1: 1.0, alpha: 1,
      c0: [1, 0.95, 0.7], c1: [1, 0.5, 0.15], fadeIn: 0.4, rotSpeed: 0,
    });
    for (let i = 0; i < 2; i++) {
      const sp = 3 + Math.random() * 3;
      const j = () => (Math.random() - 0.5) * 1.4;
      this.ps.spawn('smoke', {
        x: pos.x + dir.x * 0.2, y: pos.y + dir.y * 0.2, z: pos.z + dir.z * 0.2,
        vx: dir.x * sp + j(), vy: dir.y * sp + 0.4 + Math.abs(j()) * 0.2, vz: dir.z * sp + j(),
        life: 0.4 + Math.random() * 0.3, size0: 0.3, size1: 1.0, alpha: 0.22, drag: 3, grav: -0.4, windK: 0.8,
        c0: [0.9, 0.88, 0.84], c1: [0.5, 0.48, 0.45], fadeIn: 0.08,
      });
    }
  }

  // ── 机枪命中：铁花四溅 + 微烟 ──
  mgImpact(pos) {
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.5;
      const sp = 6 + Math.random() * 11;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp * Math.sin(e), vy: Math.abs(Math.cos(e)) * sp, vz: Math.sin(a) * sp * Math.sin(e),
        life: 0.25 + Math.random() * 0.22, size0: 0.32, size1: 0.05, alpha: 1, grav: 24, drag: 0.4,
        c0: [1, 0.9, 0.6], c1: [1, 0.5, 0.15], fadeIn: 0.08,
      });
    }
    this.ps.spawn('smoke', {
      x: pos.x, y: pos.y, z: pos.z, vy: 1.6, life: 0.6, size0: 0.3, size1: 1.3, alpha: 0.3,
      c0: [0.5, 0.48, 0.45], c1: [0.3, 0.29, 0.27], fadeIn: 0.1,
    });
  }

  // ── 机枪/机炮命中统一入口：按口径分流（≥20mm 走机炮榴弹配方，其余机枪小火花） ──
  gunImpact(pos, dir, caliber) {
    if (caliber === '30mm') this.cannonImpact(pos, dir);
    else this.mgImpact(pos);
  }

  // ── 30mm 机炮命中：榴弹爆闪 + 大量装甲火花 + 炽热破片 + 硝烟尘雾（dir = 弹道方向，可空） ──
  cannonImpact(pos, dir = null) {
    // 反弹喷溅基准：弹道反向（近似跳飞方向）
    const bx = dir ? -dir.x : 0, by = dir ? Math.abs(-dir.y) * 0.4 : 0, bz = dir ? -dir.z : 0;
    // 1) 爆炸闪光：星芒核心爆闪 + 橙红火球残焰 + 动态光
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.16, size0: 1.5, size1: 4.5, alpha: 1,
      c0: [1, 0.98, 0.88], c1: [1, 0.5, 0.12], fadeIn: 0.22, rotSpeed: 0,
    });
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, sp = 2 + Math.random() * 3;
      this.ps.spawn('fire', {
        x: pos.x, y: pos.y + 0.1, z: pos.z,
        vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + 1.5, vz: Math.sin(a) * sp * Math.cos(e),
        life: 0.3 + Math.random() * 0.18, size0: 0.6, size1: 2.2, alpha: 0.9, drag: 2,
        c0: [1, 0.8, 0.4], c1: [0.75, 0.2, 0.03], fadeIn: 0.3,
      });
    }
    this.ps.flash(pos, 0xffb060, 20, 38);   // ≈0.12s
    // 2) 大量装甲火花：黄白细火花沿反弹锥四溅（密）+ 炽红铁花慢速落弧
    for (let i = 0; i < 26; i++) {
      const sp = 9 + Math.random() * 16;
      const j = () => (Math.random() - .5) * 7.5;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: bx * sp * 0.6 + j(),
        vy: by * sp * 0.6 + 2.2 + Math.random() * 3.5 + j() * 0.3,
        vz: bz * sp * 0.6 + j(),
        life: 0.28 + Math.random() * 0.3, size0: 0.36, size1: 0.05, alpha: 1, grav: 20, drag: 0.4,
        c0: [1, 0.95, 0.7], c1: [1, 0.5, 0.14], fadeIn: 0.08,
      });
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.3 + Math.random() * 1.0, sp = 4 + Math.random() * 7;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y + 0.1, z: pos.z,
        vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + 2, vz: Math.sin(a) * sp * Math.cos(e),
        life: 0.55 + Math.random() * 0.4, size0: 0.3, size1: 0.1, alpha: 1, grav: 22, drag: 0.15,
        c0: [1, 0.5, 0.16], c1: [0.55, 0.12, 0.03], fadeIn: 0.05,
      });
    }
    // 3) 炽热破片：白热高速曳光破片全球飞散（弱重力长射程）+ 铁质小块翻滚落地
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI;
      const sp = 16 + Math.random() * 14;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp * Math.sin(e), vy: Math.abs(Math.cos(e)) * sp * 0.8, vz: Math.sin(a) * sp * Math.sin(e),
        life: 0.18 + Math.random() * 0.14, size0: 0.5, size1: 0.06, alpha: 1, grav: 12, drag: 0.5,
        c0: [1, 1, 0.92], c1: [1, 0.62, 0.25], fadeIn: 0.03,
      });
    }
    this._debrisBurst(pos, 3, 9, { shard: true, size: 0.32, life: 0.9, grav: 26 });
    // 4) 硝烟尘雾：灰白+深灰多团向上翻滚膨胀（机炮榴弹烟柱感）
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2;
      this.ps.spawn('smoke', {
        x: pos.x + (Math.random() - .5) * 0.7, y: pos.y + Math.random() * 0.4, z: pos.z + (Math.random() - .5) * 0.7,
        vx: Math.cos(a) * sp, vy: 2 + Math.random() * 2, vz: Math.sin(a) * sp,
        life: 1.3 + Math.random() * 1.1, size0: 0.8 + Math.random() * 0.6, size1: 3.6 + Math.random() * 2.4,
        alpha: 0.45, windK: 0.8, drag: 1.2, sizeEase: 1.7, fadeIn: 0.12,
        c0: [0.58, 0.56, 0.53], c1: [0.3, 0.29, 0.27],
      });
    }
  }

  // ── 爆反击碎：命中点小尺度橙色爆闪（板被消耗即触发） ──
  eraFlash(pos, dir) {
    this.ps.flash(pos, 0xffb060, 24, 26);   // ≈0.15s 爆闪
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.6;
      const sp = 8 + Math.random() * 16;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp * Math.sin(e), vy: Math.abs(Math.cos(e)) * sp * 0.8, vz: Math.sin(a) * sp * Math.sin(e),
        life: 0.3 + Math.random() * 0.25, size0: 0.5, size1: 0.08, alpha: 1, grav: 20, drag: 0.5,
        c0: [1, 0.85, 0.5], c1: [1, 0.4, 0.1], fadeIn: 0.05,
      });
    }
    this.ps.spawn('smoke', {
      x: pos.x, y: pos.y + 0.3, z: pos.z, vy: 2.2,
      life: 0.9, size0: 0.5, size1: 2.2, alpha: 0.4,
      c0: [0.55, 0.5, 0.45], c1: [0.3, 0.29, 0.27], fadeIn: 0.1,
    });
  }

  // ── APS 拦截空爆：弹道半途定向爆炸（effective=摧毁弹丸时更猛） ──
  apsIntercept(pos, effective, dir = null) {
    const k = effective ? 1 : 0.6;   // 强度系数
    // 强爆闪（白色偏青，双层）
    this.ps.flash(pos, 0xffffff, 90 * k, 26);
    this.ps.flash(pos, 0xffd090, 50 * k, 14);
    // 定向爆轰火球：沿来袭弹道反方向锥形喷射（无 dir 时球面）
    const bx = dir ? -dir.x : 0, by = dir ? -dir.y : 0.3, bz = dir ? -dir.z : 0;
    for (let i = 0; i < Math.round(14 * k + 8); i++) {
      const sp = 7 + Math.random() * 13;
      // 锥形散布：主方向 + 随机偏移
      const jx = (Math.random() - 0.5) * 1.5, jy = (Math.random() - 0.5) * 1.2, jz = (Math.random() - 0.5) * 1.5;
      this.ps.spawn('fire', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: (bx + jx) * sp, vy: (by + jy) * sp + 3, vz: (bz + jz) * sp,
        life: 0.3 + Math.random() * 0.3, size0: 1.6 * k + 0.4, size1: 3.8 * k + 0.8, alpha: 0.95, drag: 1.6,
        c0: [1, 0.9, 0.6], c1: [0.85, 0.25, 0.05], fadeIn: 0.25,
      });
    }
    // 致密破片流（白色曳光，速度高、拖尾感）
    for (let i = 0; i < Math.round(34 * k + 10); i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI;
      const sp = 18 + Math.random() * 30;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp * Math.sin(e), vy: Math.cos(e) * sp, vz: Math.sin(a) * sp * Math.sin(e),
        life: 0.3 + Math.random() * 0.25, size0: 0.55, size1: 0.06, alpha: 1, grav: 18, drag: 0.4,
        c0: [1, 1, 0.9], c1: [1, 0.6, 0.25], fadeIn: 0.03,
      });
    }
    // 烟云（拦截药柱的灰白烟，快速膨胀）
    for (let i = 0; i < Math.round(10 * k + 4); i++) {
      const sp = 1.5 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2;
      this.ps.spawn('smoke', {
        x: pos.x + (Math.random() - 0.5), y: pos.y + (Math.random() - 0.5), z: pos.z + (Math.random() - 0.5),
        vx: Math.cos(a) * sp, vy: 1.8 + Math.random() * 1.5, vz: Math.sin(a) * sp,
        life: 1.2 + Math.random() * 0.8, size0: 1.2, size1: 4.5, alpha: 0.5, windK: 0.7, drag: 1.2,
        c0: [0.72, 0.7, 0.66], c1: [0.38, 0.37, 0.35], fadeIn: 0.1, sizeEase: 1.6,
      });
    }
    // 冲击环（小型空爆环）
    this._ring(pos, 6 * k + 3, 0.22, 0.55);
    // 震屏（玩家车被拦截时）
    this.addShake(effective ? 0.5 : 0.25);
  }

  // ── 抛壳（机枪/机炮/炮弹弹壳，物理下落 + 触地反弹） ──
  // type: 'mg'(机枪≤20mm) | 'm230'(30mm机炮) | 'cannon'(炮弹)
  // pos: 抛出位置（世界坐标）  dir: 射击方向  sideDir: 侧向（垂直于dir，用于确定抛壳方向）
  ejectCasing(pos, dir, type, sideDir = null) {
    if (this.casingPool.length === 0) {
      // 池空：回收最老的
      const old = this.casings.shift();
      if (old) { old.mesh.visible = false; this.casingPool.push(old); }
    }
    const c = this.casingPool.pop();
    if (!c) return;

    // 选择几何体和材质
    const geo = this.casingGeos[type] || this.casingGeos.mg;
    const mat = type === 'cannon' ? this.casingMats.olive : this.casingMats.brass;
    c.mesh.geometry = geo;
    c.mesh.material = mat;

    // 侧向方向
    if (!sideDir) {
      sideDir = _side.crossVectors(dir, _up);
      if (sideDir.lengthSq() < 1e-6) sideDir.set(1, 0, 0);
      sideDir.normalize();
    }
    // 随机左右抛
    const sideSign = Math.random() < 0.5 ? 1 : -1;
    sideDir = sideDir.clone().multiplyScalar(sideSign);

    // 抛出速度：侧向 + 向上 + 随机后向
    const speed = type === 'cannon' ? (2.5 + Math.random() * 1.5) : (3 + Math.random() * 2);
    c.vel.set(
      sideDir.x * speed + (Math.random() - 0.5) * 1.0 - dir.x * 0.5,
      1.5 + Math.random() * 1.2,
      sideDir.z * speed + (Math.random() - 0.5) * 1.0 - dir.z * 0.5,
    );
    // 角速度（随机翻滚）
    c.angVel.set(
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
    );

    c.mesh.position.copy(pos);
    // 初始旋转：弹壳水平 + 随机
    c.mesh.rotation.set(Math.PI / 2 + Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
    c.mesh.visible = true;
    c.settled = false;
    c.life = type === 'cannon' ? 6 + Math.random() * 2 : 3.5 + Math.random() * 1.5;
    c.max = c.life;
    c.type = type;
    this.casings.push(c);

    // 炮弹/M230弹壳冒烟
    if (type === 'cannon' || type === 'm230') {
      const smokeCount = type === 'cannon' ? 3 : 2;
      for (let i = 0; i < smokeCount; i++) {
        this.ps.spawn('smoke', {
          x: pos.x + (Math.random() - 0.5) * 0.3, y: pos.y + 0.1, z: pos.z + (Math.random() - 0.5) * 0.3,
          vx: sideDir.x * 0.5 + (Math.random() - 0.5) * 0.3, vy: 0.5 + Math.random() * 0.3, vz: sideDir.z * 0.5 + (Math.random() - 0.5) * 0.3,
          life: 0.8 + Math.random() * 0.4, size0: 0.08, size1: 0.35, alpha: 0.25, drag: 2, grav: -0.3, windK: 0.5,
          c0: [0.7, 0.68, 0.64], c1: [0.4, 0.38, 0.35], fadeIn: 0.1,
        });
      }
    }
  }

  // ── 跳弹：沿反弹方向的长条火花 + 刮擦白闪 ──
  ricochetSpark(pos, dir) {
    for (let i = 0; i < 14; i++) {
      const sp = 13 + Math.random() * 22;
      const j = () => (Math.random() - .5) * 6.5;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + j(), vy: dir.y * sp + 1.8 + j() * 0.35, vz: dir.z * sp + j(),
        life: 0.3 + Math.random() * 0.3, size0: 0.5, size1: 0.06, alpha: 1, grav: 17, drag: 0.45,
        c0: [1, 0.95, 0.75], c1: [1, 0.55, 0.2], fadeIn: 0.1,
      });
    }
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.1, size0: 1.6, size1: 3.8, alpha: 1,
      c0: [1, 0.98, 0.9], c1: [1, 0.75, 0.4], fadeIn: 0.3, rotSpeed: 0,
    });
    this.ps.spawn('smoke', {
      x: pos.x, y: pos.y, z: pos.z, vy: 1.6, life: 1, size0: 0.4, size1: 1.8,
      alpha: 0.35, windK: 0.9, c0: [0.4, 0.38, 0.34], c1: [0.22, 0.21, 0.2], fadeIn: 0.18,
    });
    this.ps.flash(pos, 0xffd080, 13, 51);   // ≈0.09s
  }

  // ── 击穿出口喷射（弹芯穿透车体另一侧） ──
  // TODO: 伤害模型支持穿透后由 shell.js 触发（当前阶段仅实现并导出，未被调用）
  penExit(pos, dir) {
    for (let i = 0; i < 10; i++) {
      const sp = 9 + Math.random() * 15;
      const j = () => (Math.random() - .5) * 5.5;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + j(), vy: dir.y * sp + Math.abs(j()) * 0.35 + 1, vz: dir.z * sp + j(),
        life: 0.18 + Math.random() * 0.28, size0: 0.42, size1: 0.05, alpha: 1, grav: 14, drag: 0.6,
        c0: [1, 0.9, 0.55], c1: [1, 0.45, 0.1], fadeIn: 0.12,
      });
    }
    // 出口炽流
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.12, size0: 1.1, size1: 2.6, alpha: 0.95,
      c0: [1, 0.95, 0.8], c1: [1, 0.6, 0.2], fadeIn: 0.3, rotSpeed: 0,
    });
    this.ps.spawn('smoke', {
      x: pos.x, y: pos.y, z: pos.z,
      vx: dir.x * 2.6, vy: dir.y * 2.6 + 0.9, vz: dir.z * 2.6,
      life: 1.2, size0: 0.4, size1: 2.0, alpha: 0.42, windK: 0.8,
      c0: [0.42, 0.38, 0.34], c1: [0.2, 0.19, 0.17], fadeIn: 0.12, sizeEase: 1.4,
    });
    this.ps.flash(pos, 0xffa050, 10, 51);   // ≈0.09s
  }

  // ── 弹着点（未击穿/跳弹） ──
  impactSparks(pos, normal) { this.hitSpark(pos, normal); }

  // ── 击穿：内部喷火 + 浓烟（统一走 hitSpark 定向锥） ──
  penetrationBurst(pos, dir = null) { this.hitSpark(pos, dir); }

  // ── 地面命中：土柱 ──
  dirtHit(pos) {
    const gy = this.groundY(pos.x, pos.z);
    const p = V().set(pos.x, gy, pos.z);
    // 中心爆炸火光（小而短）
    this.ps.spawn('glow', {
      x: p.x, y: gy + 0.5, z: p.z, life: 0.25, size0: 1.6, size1: 4, alpha: 0.6,
      c0: [1, 0.9, 0.6], c1: [1, 0.3, 0.05], fadeIn: 0.15,
    });
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      this.ps.spawn('fire', {
        x: p.x, y: gy + 0.4, z: p.z,
        vx: Math.sin(a) * sp, vy: 1 + Math.random() * 3, vz: Math.cos(a) * sp,
        life: 0.25 + Math.random() * 0.2, size0: 0.6, size1: 2, alpha: 0.5, drag: 1.5,
        c0: [1, 0.7, 0.2], c1: [0.5, 0.1, 0.02], fadeIn: 0.2,
      });
    }
    // 四散土块（大块飞溅 + 重力下落）
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 5 + Math.random() * 12;
      this.ps.spawn('smoke', {
        x: p.x, y: gy + 0.3, z: p.z,
        vx: Math.sin(a) * sp, vy: 5 + Math.random() * 12, vz: Math.cos(a) * sp,
        life: 1 + Math.random() * 1.5, size0: 1.2, size1: 3.5, alpha: 0.85, grav: 16, drag: 0.5,
        c0: [0.48, 0.38, 0.26], c1: [0.3, 0.22, 0.14],
      });
    }
    // 黑烟（深色浓烟，贴地扩散）
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5;
      this.ps.spawn('smoke', {
        x: p.x + Math.sin(a) * r, y: gy + 0.3, z: p.z + Math.cos(a) * r,
        vx: Math.sin(a) * (1 + Math.random() * 3), vy: 1 + Math.random() * 2.5, vz: Math.cos(a) * (1 + Math.random() * 3),
        life: 2 + Math.random() * 2, size0: 3, size1: 10, alpha: 0.55, grav: -0.4, drag: 0.7, windK: 1.3,
        c0: [0.16, 0.14, 0.12], c1: [0.08, 0.07, 0.06], fadeIn: 0.15, sizeEase: 2,
      });
    }
    // 灰烟（中等色调，扩散更广）
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.5;
      this.ps.spawn('smoke', {
        x: p.x + Math.sin(a) * r, y: gy + 0.3, z: p.z + Math.cos(a) * r,
        vx: Math.sin(a) * (2 + Math.random() * 4), vy: 1 + Math.random() * 3, vz: Math.cos(a) * (2 + Math.random() * 4),
        life: 1.5 + Math.random() * 1.5, size0: 2.5, size1: 8, alpha: 0.45, grav: -0.5, drag: 0.9, windK: 1.2,
        c0: [0.4, 0.36, 0.32], c1: [0.25, 0.22, 0.2], fadeIn: 0.15, sizeEase: 2,
      });
    }
    // 土色烟（棕色尘土）
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2;
      this.ps.spawn('smoke', {
        x: p.x + Math.sin(a) * r, y: gy + 0.25, z: p.z + Math.cos(a) * r,
        vx: Math.sin(a) * (2 + Math.random() * 5), vy: 1 + Math.random() * 3, vz: Math.cos(a) * (2 + Math.random() * 5),
        life: 1.5 + Math.random() * 1.5, size0: 2, size1: 7, alpha: 0.5, grav: -0.6, drag: 1, windK: 1.1,
        c0: [0.5, 0.4, 0.28], c1: [0.32, 0.24, 0.16], fadeIn: 0.15, sizeEase: 1.8,
      });
    }
    // 地面尘环
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.ps.spawn('smoke', {
        x: p.x, y: gy + 0.15, z: p.z,
        vx: Math.sin(a) * 10, vy: 0.5 + Math.random(), vz: Math.cos(a) * 10,
        life: 1.2 + Math.random() * 0.8, size0: 2, size1: 6, alpha: 0.4, grav: -1, drag: 1.5,
        c0: [0.55, 0.46, 0.34], c1: [0.38, 0.32, 0.24], sizeEase: 1.8,
      });
    }
    this.ps.flash(p, 0xffa030, 24, 10);
  }

  // ── 大爆炸：爆闪 + 三层火球 + 火花 + 铁花 + 浓烟火柱 + 冲击环 + 近地尘幕 ──
  explosion(pos, scale = 1) {
    // 核心爆闪
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.18, size0: 8 * scale, size1: 19 * scale, alpha: 1,
      c0: [1, 0.98, 0.9], c1: [1, 0.5, 0.12], fadeIn: 0.3, rotSpeed: 0,
    });
    // 火球（球面分布 + 上偏）
    for (let i = 0; i < 16; i++) {
      const sp = 4.5 + Math.random() * 6.5;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      this.ps.spawn('fire', {
        x: pos.x, y: pos.y + 0.3, z: pos.z,
        vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + 3.5, vz: Math.sin(a) * sp * Math.cos(e),
        life: 0.4 + Math.random() * 0.35, size0: 2.4 * scale, size1: 6.5 * scale, alpha: 0.95, drag: 1.4,
        c0: [1, 0.78, 0.35], c1: [0.7, 0.16, 0.04], fadeIn: 0.32,
      });
    }
    // 火花四溅（亮黄长条，强重力）
    for (let i = 0; i < 38; i++) {
      const sp = 12 + Math.random() * 22;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.4;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + 4.5, vz: Math.sin(a) * sp * Math.cos(e),
        life: 0.45 + Math.random() * 0.4, size0: 0.36, size1: 0.06, alpha: 1, grav: 22, drag: 0.3,
        c0: [1, 0.85, 0.5], c1: [1, 0.4, 0.1], fadeIn: 0.06,
      });
    }
    // 铁花四溅（炽热暗红碎块，高抛物线落地）
    for (let i = 0; i < 18; i++) {
      const sp = 8 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2;
      const e = 0.5 + Math.random() * 1.1;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y + 0.4, z: pos.z,
        vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + 5.5, vz: Math.sin(a) * sp * Math.cos(e),
        life: 0.8 + Math.random() * 0.7, size0: 0.26, size1: 0.1, alpha: 1, grav: 19, drag: 0.12,
        c0: [1, 0.45, 0.16], c1: [0.45, 0.1, 0.03], fadeIn: 0.04,
      });
    }
    // 浓烟火柱（出生大团·快速膨胀·低升速不腾高；真黑烟走 smoke 池）
    for (let i = 0; i < 22; i++) {
      const sp = 1.2 + Math.random() * 2.2;
      const a = Math.random() * Math.PI * 2;
      this.ps.spawn('smoke', {
        x: pos.x + (Math.random() - .5), y: pos.y + 0.5, z: pos.z + (Math.random() - .5),
        vx: Math.cos(a) * sp, vy: 1.2 + Math.random() * 1.6, vz: Math.sin(a) * sp,
        life: 2.6 + Math.random() * 2.8, size0: 3.4 * scale, size1: 9.5 * scale, alpha: 0.7,
        drag: 1.1, grav: -0.35, windK: 1,
        c0: [0.32, 0.29, 0.26], c1: [0.14, 0.13, 0.12], fadeIn: 0.14, sizeEase: 1.9,
      });
    }
    // 冲击环
    this._ring(pos, 13 * scale, 0.3, 0.75);
    // 碎片
    this._debrisBurst(pos, Math.min(14 * scale | 0, 30), 16 * scale);
    // 地面焦土尘
    const gy = this.groundY(pos.x, pos.z);
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 8 + Math.random() * 14 * scale;
      this.ps.spawn('smoke', {
        x: pos.x, y: gy + 0.4, z: pos.z,
        vx: Math.sin(a) * sp, vy: 2 + Math.random() * 4, vz: Math.cos(a) * sp,
        life: 1.2 + Math.random(), size0: 3, size1: 9, alpha: 0.4, drag: 2,
        c0: [0.6, 0.54, 0.44], c1: [0.42, 0.38, 0.32],
      });
    }
    // 近地面追加浮尘幕
    if (pos.y - gy < 3) this.groundShock({ x: pos.x, y: gy, z: pos.z }, 1.3);
    this.ps.flash(pos, 0xffa050, 85 * scale, 14);   // ≈0.32s
  }

  // ── 殉爆座圈喷火（高频调用形成连续火柱 + 大量火花；tank.js 残骸 update 驱动） ──
  jetFire(pos, dir) {
    // 外层橙红火舌
    for (let i = 0; i < 11; i++) {
      const sp = 9 + Math.random() * 10;
      const j = () => (Math.random() - .5) * 3.2;
      this.ps.spawn('fire', {
        x: pos.x + (Math.random() - .5) * 1.6, y: pos.y, z: pos.z + (Math.random() - .5) * 1.6,
        vx: dir.x * sp + j(), vy: dir.y * sp * 0.55 + 1.2 + Math.random() * 1.4, vz: dir.z * sp + j(),
        life: 0.7 + Math.random() * 0.3, size0: 1.8, size1: 4.5, alpha: 1, drag: 0.8, grav: -0.9, sizeEase: 1.3,
        c0: [1, 0.62, 0.2], c1: [0.72, 0.15, 0.03], fadeIn: 0.12,
      });
    }
    // 内层亮黄火心
    for (let i = 0; i < 7; i++) {
      const sp = 7 + Math.random() * 7;
      const j = () => (Math.random() - .5) * 2;
      this.ps.spawn('fire', {
        x: pos.x + (Math.random() - .5) * 1, y: pos.y + 0.1, z: pos.z + (Math.random() - .5) * 1,
        vx: dir.x * sp + j(), vy: dir.y * sp * 0.5 + 1 + Math.random() * 1.2, vz: dir.z * sp + j(),
        life: 0.5 + Math.random() * 0.25, size0: 1.1, size1: 2.4, alpha: 1, drag: 0.85, grav: -1.1,
        c0: [1, 0.9, 0.5], c1: [1, 0.55, 0.12], fadeIn: 0.1,
      });
    }
    // 炽热碎屑四射（强重力回落）
    for (let i = 0; i < 22; i++) {
      const sp = 8 + Math.random() * 15;
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.3;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y + 0.2, z: pos.z,
        vx: dir.x * sp * 0.6 + Math.cos(a) * sp * 0.7 * Math.cos(e),
        vy: Math.sin(e) * sp * 0.7 + 3,
        vz: dir.z * sp * 0.6 + Math.sin(a) * sp * 0.7 * Math.cos(e),
        life: 0.5 + Math.random() * 0.45, size0: 0.3, size1: 0.05, alpha: 1, grav: 20, drag: 0.3,
        c0: [1, 0.85, 0.45], c1: [1, 0.4, 0.08], fadeIn: 0.06,
      });
    }
    // 夹带大团黑烟
    if (Math.random() < 0.6) this.ps.spawn('smoke', {
      x: pos.x, y: pos.y + 0.5, z: pos.z,
      vx: dir.x * 2.5, vy: 1.8, vz: dir.z * 2.5,
      life: 2.4, size0: 2, size1: 5.5, alpha: 0.5, grav: -0.3, drag: 0.7, windK: 1.2, sizeEase: 1.8,
      c0: [0.2, 0.17, 0.15], c1: [0.08, 0.08, 0.08], fadeIn: 0.2,
    });
    this.ps.flash(pos, 0xff8830, 40, 26);   // ≈0.18s
  }

  _ring(pos, size, dur, alpha = 0.5) {
    for (const r of this.rings) {
      if (!r.mesh.visible) {
        r.mesh.visible = true;
        r.mesh.position.set(pos.x, this.groundY(pos.x, pos.z) + 0.6, pos.z);
        r.t = 0; r.dur = dur; r.size = size; r.alpha = alpha;
        return;
      }
    }
  }

  // opts.mats：材质数组（随机取用；缺省用深色默认）；opts.size：整体尺寸系数；opts.wood：长条木片几何+随机朝向
  _debrisBurst(pos, count, speed, opts = {}) {
    let n = 0;
    const mats = opts.mats || null, sizeK = opts.size || 1, wood = !!opts.wood;
    for (const d of this.debris) {
      if (d.life <= 0) {
        d.life = opts.life ? opts.life * (0.75 + Math.random() * 0.5) : 1.6 + Math.random() * 1.6;
        d.mesh.visible = true;
        d.mesh.position.copy(pos);
        d.vel.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
        d.rot.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
        if (wood) {
          d.mesh.geometry = this.woodGeo;
          d.mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
          // 木片长度随机变化（长条感）
          const k = (0.5 + Math.random() * 1.6) * sizeK;
          d.mesh.scale.set(k * (0.7 + Math.random() * 0.9), k * (0.6 + Math.random() * 0.6), k);
        } else if (opts.leaf) {
          d.mesh.geometry = this.leafGeo;
          d.mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
          d.mesh.scale.setScalar((0.75 + Math.random() * 0.5) * (opts.leafScale || 1));   // 叶片尺寸微差 × 全局倍率
        } else if (opts.shard) {
          // 斜劈铁片：非均匀拉伸（扁平长条）+ 随机初始姿态，避免正方体规整感
          d.mesh.geometry = this.shardGeo;
          d.mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
          d.mesh.scale.set(
            (0.5 + Math.random() * 1.1) * sizeK,
            (0.22 + Math.random() * 0.4) * sizeK,
            (0.9 + Math.random() * 1.7) * sizeK,
          );
        } else {
          d.mesh.geometry = this.debrisGeo;
          d.mesh.scale.setScalar((0.5 + Math.random() * 1.6) * sizeK);
        }
        if (mats) d.mesh.material = mats[(Math.random() * mats.length) | 0];
        d.grav = opts.grav ?? 22;          // 落叶等轻质碎片用低重力缓慢飘落
        d.drag = opts.drag ?? 0;           // 空气阻力（每秒速度衰减率）
        if (++n >= count) break;
      }
    }
  }

  // ── 行驶扬尘 ──
  trackDust(pos, intensity) {
    this.ps.spawn('smoke', {
      x: pos.x + (Math.random() - 0.5) * 1.2, y: pos.y, z: pos.z + (Math.random() - 0.5) * 1.2,
      vx: (Math.random() - 0.5) * 2, vy: 0.4 + intensity * 1.5 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 2,
      life: 1.1 + Math.random() * 1.2, size0: 1.2, size1: 4.5 + intensity * 3,
      alpha: 0.10 + intensity * 0.13, drag: 1.4, rotSpeed: 0.7, windK: 1.2,
      c0: [0.62, 0.55, 0.44], c1: [0.5, 0.45, 0.38],
    });
  }

  // ── 发动机排烟（intensity 可选 0~1：浓度提升，起步浓黑烟；turbine=燃气轮机灰色烟） ──
  exhaustPuff(pos, load, intensity = null, turbine = false) {
    const k = intensity === null ? 0 : Math.min(Math.max(intensity, 0), 1);
    const dark = 0.16 + (1 - Math.min(load + k, 1)) * 0.3;   // 负荷/起步越重烟越黑
    let c0, c1;
    if (turbine) {
      const g = 0.42 + (1 - Math.min(load + k, 1)) * 0.18;
      c0 = [g, g, g + 0.02], c1 = [g * 0.68, g * 0.68, g * 0.7];
    } else {
      c0 = [dark + 0.1, dark + 0.09, dark + 0.085], c1 = [dark * 0.6, dark * 0.6, dark * 0.64];
    }
    this.ps.spawn('smoke', {
      x: pos.x, y: pos.y, z: pos.z,
      vx: (Math.random() - 0.5) * 2.5, vy: 0.3 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 2.5,
      life: 0.8 + Math.random() * 0.8 + k * 0.6,
      size0: 0.5 + k * 0.5, size1: 2.8 + load * 1.5 + k * 2.4,
      alpha: 0.18 + load * 0.22 + k * 0.4, drag: 0.7, windK: 1.8, grav: -0.15,
      c0, c1, fadeIn: 0.2, sizeEase: 1.8,
    });
  }

  // ── 残骸燃烧 / 起火（持续，每帧调用；0.025s 节流高频重叠生成，烟火各自节流） ──
  burning(pos, dt, intensity = 1, big = false) {
    // --- 真黑烟柱：出生即大团，升速低（贴车），膨胀率大 ---
    this._burnS = (this._burnS || 0) + dt * intensity;
    if (this._burnS > 0.025) {
      this._burnS = 0;
      for (let i = 0; i < 2; i++) {
        const src = Math.random() < 0.6 ? 0.4 : 0.9;   // 动力舱 + 炮塔两个源
        this.ps.spawn('smoke', {
          x: pos.x + (Math.random() - .5) * 1.3, y: pos.y + src, z: pos.z + (Math.random() - .5) * 1.3,
          vx: (Math.random() - .5) * 0.5, vy: 0.6 + Math.random() * 0.4, vz: (Math.random() - .5) * 0.5,
          life: 3.5 + Math.random() * 2, size0: 1.8, size1: 6, alpha: 0.32,
          grav: -0.35, drag: 0.3, windK: 1.4,
          c0: [0.13, 0.11, 0.1], c1: [0.05, 0.05, 0.05], fadeIn: 0.3, sizeEase: 2.2,
        });
      }
    }
    // --- 火焰：起火小火苗（big=false）/ 残骸大火（big=true） ---
    this._burnF = (this._burnF || 0) + dt * intensity;
    if (this._burnF > 0.025) {
      this._burnF = 0;
      if (big) {
        for (let i = 0; i < 2; i++) {
          this.ps.spawn('fire', {
            x: pos.x + (Math.random() - .5) * 5, y: pos.y + 0.5, z: pos.z + (Math.random() - .5) * 5,
            vy: 1.4 + Math.random() * 1, life: 0.5, size0: 1.4, size1: 4.2, alpha: 0.85, sizeEase: 1.4,
            c0: [1, 0.55, 0.18], c1: [0.75, 0.16, 0.03], fadeIn: 0.24,
          });
        }
        this.ps.spawn('fire', {
          x: pos.x + (Math.random() - .5) * 2.7, y: pos.y + 0.4, z: pos.z + (Math.random() - .5) * 2.7,
          vy: 1.2 + Math.random() * 0.8, life: 0.34, size0: 0.7, size1: 2.4, alpha: 0.9,
          c0: [1, 0.85, 0.4], c1: [1, 0.5, 0.1], fadeIn: 0.2,
        });
        this.ps.spawn('fire', {
          x: pos.x + (Math.random() - .5) * 5.8, y: pos.y + 0.25, z: pos.z + (Math.random() - .5) * 5.8,
          vy: 0.8 + Math.random() * 0.6, life: 0.5, size0: 1.6, size1: 3.8, alpha: 0.8, sizeEase: 1.5,
          c0: [1, 0.5, 0.14], c1: [0.66, 0.13, 0.03], fadeIn: 0.2,
        });
      } else {
        // 起火：低矮小火苗 + 偶发黄心
        this.ps.spawn('fire', {
          x: pos.x + (Math.random() - .5) * 1.6, y: pos.y + 0.4, z: pos.z + (Math.random() - .5) * 1.6,
          vy: 1.1 + Math.random() * 0.7, life: 0.4, size0: 0.6, size1: 1.8, alpha: 0.7, sizeEase: 1.4,
          c0: [1, 0.7, 0.25], c1: [0.8, 0.22, 0.05], fadeIn: 0.2,
        });
        if (Math.random() < 0.5) this.ps.spawn('fire', {
          x: pos.x + (Math.random() - .5) * 1.0, y: pos.y + 0.35, z: pos.z + (Math.random() - .5) * 1.0,
          vy: 1.0 + Math.random() * 0.5, life: 0.3, size0: 0.4, size1: 1.2, alpha: 0.8,
          c0: [1, 0.85, 0.4], c1: [1, 0.5, 0.1], fadeIn: 0.18,
        });
      }
      // 残火灯光（闪烁）
      if (Math.random() < (big ? 0.6 : 0.25)) {
        _side.set(pos.x, pos.y + 1, pos.z);
        this.ps.flash(_side, 0xff7722, big ? 22 : 10, big ? 15 : 8);
      }
    }
  }

  update(dt) {
    this.shakeAmount *= Math.exp(-3.2 * dt);
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const t = r.t / r.dur;
      if (t >= 1) { r.mesh.visible = false; r.mesh.material.uniforms.uAlpha.value = 0; continue; }
      const ringR = 0.6 + r.size * t;
      const u = r.mesh.material.uniforms;
      u.uRingR.value = ringR;
      u.uWidth.value = 1.4 + ringR * 0.09;
      u.uAlpha.value = r.alpha * (1 - t) * 0.5;
    }
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      if (d.drag > 0) {   // 空气阻力：轻质碎片（落叶）水平/垂直速度衰减
        const dr = Math.exp(-d.drag * dt);
        d.vel.x *= dr; d.vel.z *= dr; d.vel.y *= dr;
      }
      d.vel.y -= (d.grav || 22) * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      const gy = this.groundY(d.mesh.position.x, d.mesh.position.z) + 0.12;
      if (d.mesh.position.y < gy) {
        d.mesh.position.y = gy;
        d.vel.y *= -0.35; d.vel.x *= 0.6; d.vel.z *= 0.6;
      }
      d.mesh.rotation.x += d.rot.x * dt;
      d.mesh.rotation.y += d.rot.y * dt;
      d.mesh.rotation.z += d.rot.z * dt;
    }
    // 机枪曳光弹飞行体
    for (let i = this.mgBullets.length - 1; i >= 0; i--) {
      const b = this.mgBullets[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.life <= 0) {
        b.mesh.visible = false;
        this.mgBullets.splice(i, 1);
        this.mgPool.push(b);
        continue;
      }
      const f = b.life / b.max;
      if (f < 0.35) b.mesh.scale.setScalar(f / 0.35);
    }
    // 弹壳物理更新
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) {
        c.mesh.visible = false;
        this.casings.splice(i, 1);
        this.casingPool.push(c);
        continue;
      }
      if (!c.settled) {
        // 重力
        c.vel.y -= 22 * dt;
        // 速度积分
        c.mesh.position.addScaledVector(c.vel, dt);
        // 触地检测
        const gy = this.groundY(c.mesh.position.x, c.mesh.position.z) + 0.02;
        if (c.mesh.position.y < gy) {
          c.mesh.position.y = gy;
          c.vel.y *= -0.3;
          c.vel.x *= 0.5; c.vel.z *= 0.5;
          c.angVel.multiplyScalar(0.4);
          // 速度足够小则停止
          if (c.vel.lengthSq() < 0.5 && Math.abs(c.vel.y) < 0.5) {
            c.settled = true;
            c.vel.set(0, 0, 0);
            c.angVel.set(0, 0, 0);
          }
        }
        // 旋转
        c.mesh.rotation.x += c.angVel.x * dt;
        c.mesh.rotation.y += c.angVel.y * dt;
        c.mesh.rotation.z += c.angVel.z * dt;
      }
      // 淡出（最后 0.8 秒）
      const fade = Math.min(c.life / 0.8, 1);
      c.mesh.material.opacity = fade;
      c.mesh.material.transparent = fade < 1;
    }
  }
}
