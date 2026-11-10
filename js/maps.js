// 地图构建模块：buildMap 按 world.mapId 装配「东欧小镇 / 开阔平原」战场——天空/光照/雾/地面/公路/布景 + 可破坏系统（Destructibles）统一接线
import * as THREE from 'three';
import { Destructibles, PROP_RULES, INST_PROPS } from './destructibles.js';

// ── 地图注册表（main.js 读取 name/size/exposure 做选图、活动边界与曝光） ──
export const MAPS = {
  plains: { id: 'plains', name: '开阔平原', size: 2200 },
  town:   { id: 'town', name: '东欧小镇', size: 2000, exposure: 1.12 },
};

// ── 基础工具 ──
const clamp = THREE.MathUtils.clamp;
const sstep = THREE.MathUtils.smoothstep;
const UP = new THREE.Vector3(0, 1, 0);

// 确定性随机（与 map-test.html / terrain.js 相同实现；地图布局可复现）
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════ 小镇地形高度场（map-test.html 移植） ═══════════════════════
// 2000×2000 战场：城区（|x|,|z|<300）完全平整；十字公路走廊（±26m 内）削平；外围缓丘
// 废墟坡度（摧毁后 <1.5m 可通行的废墟场）由 Destructibles.rubbleHeightAt 提供，经 world.setGroundY 叠加
function townTerrainHeight(x, z) {
  let h = 0;
  h += Math.sin(x * 0.0085 + 1.3) * Math.cos(z * 0.0078 + 0.7) * 7.0;
  h += Math.sin(x * 0.021 + 4.2) * Math.cos(z * 0.018 + 2.1) * 2.6;
  h += Math.sin(x * 0.049 + 0.3) * Math.cos(z * 0.055 + 5.0) * 1.0;
  const dTown = Math.max(Math.abs(x), Math.abs(z));
  const fTown = sstep(dTown, 300, 470);
  const fCorr = Math.min(sstep(Math.abs(z), 26, 85), sstep(Math.abs(x), 26, 85));
  h *= Math.min(fTown, fCorr);
  return h;
}

// ═══════════════════════ 平原地形高度（terrain.js terrainHeight 原样内联） ═══════════════════════
function plainsHeight(x, z) {
  let h = 0;
  h += Math.sin(x * 0.011 + 1.7) * Math.cos(z * 0.013 + 0.4) * 3.4;
  h += Math.sin(x * 0.031 + 4.2) * Math.cos(z * 0.027 + 2.1) * 1.5;
  h += Math.sin(x * 0.083 + 0.3) * Math.cos(z * 0.071 + 5.0) * 0.45;
  // 中央交战区稍平缓
  const d = Math.sqrt(x * x + z * z);
  const flat = THREE.MathUtils.smoothstep(d, 40, 260);
  let f = 0.35 + 0.65 * flat;
  // 玩家出生点 (0,-300) 与敌方出生点 (-40,300) 局部平整（20m 内高度衰减至 ~4%）
  const dp = Math.sqrt(x * x + (z + 300) * (z + 300));
  const de = Math.sqrt((x + 40) * (x + 40) + (z - 300) * (z - 300));
  const fp = THREE.MathUtils.smoothstep(dp, 20, 60);
  const fe = THREE.MathUtils.smoothstep(de, 20, 60);
  f *= (0.2 + 0.8 * fp) * (0.2 + 0.8 * fe);
  return h * f;
}

// ═══════════════════════ 统一入口 ═══════════════════════
// ctx: { world, scene, quality, assets, ps, effects, audio }
//   world.mapId 已设（'plains'|'town'）；world.root 已加入 scene 的 Group（本模块产物全部挂其下）
//   world.setGroundY(fn) / world.addObstacle(o) / world.removeObstacle(o) 由 main.js 提供
//   assets.town_kit / leaf_tree / pine_tree / rock / rock2 / wood_log = 各 glb 的 .scene
// 返回 Destructibles 实例（同时挂到 ctx.destructibles 与 world.destructibles）
export function buildMap(ctx) {
  const { world } = ctx;
  const isTown = world.mapId === 'town';
  // Destructibles 的 groundY 用纯基础高度（不含废墟场，避免递归）；废墟坡度由 world.setGroundY 叠加
  const des = new Destructibles({
    root: world.root,
    ps: ctx.ps,
    effects: ctx.effects,
    audio: ctx.audio,
    groundY: isTown ? townTerrainHeight : plainsHeight,
    addObstacle: o => world.addObstacle(o),
    removeObstacle: o => world.removeObstacle(o),
  });
  ctx.destructibles = des;
  world.destructibles = des;
  // 路面渲染抬高（buildRibbon yOff：主路 0.07 / 路肩 0.035）——坦克地面采样叠加，履带贴上沥青面
  world.surfaceY = isTown
    ? ((x, z) => {
        const ax = Math.abs(x), az = Math.abs(z);
        if (ax < 6 || az < 6) return 0.07;
        if (ax < 10 || az < 10) return 0.035;
        return 0;
      })
    : () => 0;
  // 铺装路面判定（十字公路主路 6m 沥青 / 路肩 10m 碎石）：返回悬挂颠簸系数，土路 = 1
  world.isOnRoad = isTown
    ? ((x, z) => {
        const ax = Math.abs(x), az = Math.abs(z);
        if (ax < 6 || az < 6) return 0.2;      // 沥青主路：平稳
        if (ax < 10 || az < 10) return 0.5;    // 碎石路肩：半颠簸
        return 1;                              // 野地/土路
      })
    : () => 1;                                 // 平原图无铺装路
  if (isTown) buildTown(ctx, des);
  else buildPlains(ctx, des);
  return des;
}

// ═══════════════════════ 程序化贴图（canvas 程序化生成例外允许 document） ═══════════════════════

// ── 巨石材质：地层色带 + 颗粒噪点 + 裂缝 + 地衣晒斑（草原转石风格） ──
function makeRockTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#6e685c'; g.fillRect(0, 0, s, s);   // 暗灰褐底（与平原旧岩石同色域，防强光过曝）
  for (let i = 0; i < 9; i++) {   // 地层色带
    g.fillStyle = `rgba(${72 + Math.random() * 34 | 0},${68 + Math.random() * 26 | 0},${56 + Math.random() * 22 | 0},${0.16 + Math.random() * 0.2})`;
    g.fillRect(0, Math.random() * s, s, 6 + Math.random() * 26);
  }
  for (let i = 0; i < 2600; i++) {   // 颗粒
    g.fillStyle = Math.random() < 0.6
      ? `rgba(38,34,28,${0.06 + Math.random() * 0.14})`
      : `rgba(150,142,122,${0.05 + Math.random() * 0.1})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.strokeStyle = 'rgba(40,36,30,0.5)';
  for (let i = 0; i < 10; i++) {   // 裂缝折线
    g.lineWidth = 0.6 + Math.random() * 1.2;
    let x = Math.random() * s, y = Math.random() * s;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 46; y += (Math.random() - 0.2) * 34; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 26; i++) {   // 地衣晒斑（压暗）
    g.fillStyle = `rgba(${88 + Math.random() * 36 | 0},${92 + Math.random() * 30 | 0},${56 + Math.random() * 22 | 0},${0.06 + Math.random() * 0.12})`;
    g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 4 + Math.random() * 16, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}


// rand 注入：小镇用确定性 rand（与 map-test 相同的流顺序），平原用 Math.random（terrain.js 原样）
function makeGroundTexture(rand) {
  const s = 512, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#5d5a3c';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    const x = rand() * s, y = rand() * s, r = 20 + rand() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const cols = ['107,100,64', '88,90,58', '122,108,70', '74,78,50', '96,86,58'];
    const col = cols[(rand() * cols.length) | 0];
    gr.addColorStop(0, `rgba(${col},0.55)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }
  for (let i = 0; i < 9000; i++) {
    const v = rand();
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(200,190,140,0.08)';
    g.fillRect(rand() * s, rand() * s, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(90, 90);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeAsphaltTexture(rand) {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3d3f';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    const v = rand();
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(160,160,155,0.10)';
    g.fillRect(rand() * s, rand() * s, 1.4, 1.4);
  }
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(28,29,30,${0.25 + rand() * 0.3})`;
    g.beginPath();
    g.ellipse(rand() * s, rand() * s, 12 + rand() * 26, 8 + rand() * 18, rand() * 3.14, 0, 6.29);
    g.fill();
  }
  g.strokeStyle = 'rgba(15,15,15,0.55)';
  for (let i = 0; i < 7; i++) {
    g.lineWidth = 0.6 + rand();
    g.beginPath();
    let x = rand() * s, y = rand() * s;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(210,205,190,0.55)';
  for (let y = 8; y < s; y += 64) g.fillRect(s / 2 - 4, y, 8, 36);
  g.fillStyle = 'rgba(200,196,182,0.28)';
  g.fillRect(6, 0, 4, s); g.fillRect(s - 10, 0, 4, s);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeGravelTexture(rand) {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#6b6353';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2200; i++) {
    const v = rand();
    g.fillStyle = v < 0.4 ? 'rgba(40,36,28,0.4)' : v < 0.75 ? 'rgba(130,120,100,0.35)' : 'rgba(90,84,66,0.4)';
    const r = 0.8 + rand() * 2.2;
    g.fillRect(rand() * s, rand() * s, r, r);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 平原天空穹（terrain.js makeSkyDome 原样平移：战场尘霾氛围）
function makeSkyDome() {
  const geo = new THREE.SphereGeometry(3800, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3a5a7a) },
      midColor: { value: new THREE.Color(0x9aa48e) },
      botColor: { value: new THREE.Color(0xc4a678) },
      sunDir: { value: new THREE.Vector3(0.5, 0.85, 0.6).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, botColor, sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(botColor, midColor, smoothstep(0.0, 0.18, h));
        col = mix(col, topColor, smoothstep(0.12, 0.65, h));
        float sun = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.75, 0.45) * pow(sun, 220.0) * 2.2;   // 日盘
        col += vec3(1.0, 0.62, 0.3) * pow(sun, 8.0) * 0.22;     // 日晕
        // 战场的尘霾
        col = mix(col, vec3(0.62, 0.56, 0.44), (1.0 - smoothstep(0.0, 0.3, h)) * 0.5);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// ═══════════════════════ 布景模板工具 ═══════════════════════
// 植被/柴堆模板烘焙：双面 + alphaTest 裁切 + 带贴图的深度材质（阴影不出黑边）
function prepFlora(scene) {
  scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.side = THREE.DoubleSide;
        if (m.map) {
          m.alphaTest = 0.45;
          if (!o.customDepthMaterial) {
            o.customDepthMaterial = new THREE.MeshDepthMaterial({
              depthPacking: THREE.RGBADepthPacking, map: m.map, alphaTest: 0.45,
            });
          }
        }
      }
    }
  });
  return scene;
}

// 建筑套件拆分（map-test 同款）：找 RootNode → 克隆子件并烘焙世界变换 → 按 glb 节点名入表
function splitTownKit(kitScene, templates) {
  const rootScene = new THREE.Group();
  rootScene.add(kitScene);
  rootScene.updateMatrixWorld(true);
  let rootNode = null;
  kitScene.traverse(o => { if (!rootNode && o.name === 'RootNode') rootNode = o; });
  if (!rootNode) {
    kitScene.traverse(o => { if (!rootNode || o.children.length > rootNode.children.length) rootNode = o; });
  }
  for (const child of [...rootNode.children]) {
    const t = child.clone(true);
    child.matrixWorld.decompose(t.position, t.quaternion, t.scale);
    t.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    templates.set(child.name, t);
  }
}

// ── inst 物件收集器：布局阶段记录摆放数据（含岩石 yOff），buildInstancedProps 统一构建 + 注册 ──
function makeInstCollector(groundY) {
  const instData = {};
  for (const k of Object.keys(INST_PROPS)) instData[k] = [];
  const collectInst = (type, x, z, rotDeg, scale, yOff = 0) => {
    const rec = {
      type, x, z,
      y: groundY(x, z) + yOff,
      rot: rotDeg * Math.PI / 180, s: scale || 1,
      obstacle: null,
    };
    instData[type].push(rec);
    return rec;
  };
  return { instData, collectInst };
}

// ── Instanced 物件构建：每类一个 InstancedMesh（draw call 极低）；逐实例 registerInst 注册可破坏 ──
// 求交数据齐全：旋转包围盒 minx..maxz / miny..maxy、树干圆柱 cyl+cr、岩石 yOff 已在收集时写入 y
function buildInstancedProps(des, instData, templates, flora, root) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  for (const type of Object.keys(instData)) {
    const list = instData[type];
    if (!list.length) continue;
    const src = (type === 'leaf' || type === 'pine' || type === 'rock' || type === 'rock2') ? flora[type] : templates.get(type);
    if (!src) continue;
    // 克隆模板并归零根坐标，烘焙 mesh 世界变换进几何体（与 placeKit 摆放一致）
    const tmp = src.clone(true);
    tmp.position.set(0, 0, 0);
    tmp.updateMatrixWorld(true);
    let geo = null, mat = null, depth = null;
    tmp.traverse(o => {
      if (!geo && o.isMesh) {
        geo = o.geometry.clone();
        geo.applyMatrix4(o.matrixWorld);
        mat = Array.isArray(o.material) ? o.material[0] : o.material;
        if (o.customDepthMaterial) depth = o.customDepthMaterial;
      }
    });
    if (!geo) continue;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const gw = bb.max.x - bb.min.x, gh = bb.max.y - bb.min.y, gd = bb.max.z - bb.min.z;

    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = im.receiveShadow = true;
    im.raycast = () => {};   // 不参与测距射线
    if (depth) im.customDepthMaterial = depth;
    list.forEach((p, i) => {
      q.setFromAxisAngle(UP, p.rot);
      pos.set(p.x, p.y, p.z);
      scl.setScalar(p.s);
      m4.compose(pos, q, scl);
      im.setMatrixAt(i, m4);
      // 实例求交数据：旋转包围盒（AABB 近似，围栏/横条类判定稍宽松可接受）
      const w = gw * p.s, h = gh * p.s, d = gd * p.s;
      const c = Math.abs(Math.cos(p.rot)), sn = Math.abs(Math.sin(p.rot));
      const ex = (w * c + d * sn) / 2, ez = (w * sn + d * c) / 2;
      const isTree = type === 'leaf' || type === 'pine';
      des.registerInst({
        type, mesh: im, index: i,
        x: p.x, z: p.z, y: p.y, rot: p.rot, s: p.s,
        r: Math.max(ex, ez), height: h,
        minx: p.x - ex, maxx: p.x + ex,
        minz: p.z - ez, maxz: p.z + ez,
        miny: p.y, maxy: p.y + h,
        obstacle: p.obstacle,
        cyl: isTree, cr: isTree ? 1.5 * p.s : 0,   // 树：求交用树干圆柱（枝叶可穿，树干 r≈1.5m 缩放）
      });
    });
    root.add(im);
  }
}

// ═══════════════════════ 建筑套件摆放引擎（东欧小镇 / 平原村落共用） ═══════════════════════
// opts: { groundY: 高度函数, rand: 随机源 }；返回 { templates, flora, instData, collectInst,
//        placeKit, finalizeBatch, placeTree, fenceRun, household, greenGap, SIDES }
function createKitPlacer(ctx, des, opts) {
  const { world, assets } = ctx;
  const root = world.root;
  const groundY = opts.groundY;
  const rand = opts.rand;

  // ── 布景模板（建筑套件拆分 + 植被烘焙） ──
  const templates = new Map();
  const flora = {};
  splitTownKit(assets.town_kit, templates);
  flora.leaf = prepFlora(assets.leaf_tree);
  flora.pine = prepFlora(assets.pine_tree);
  flora.rock = prepFlora(assets.rock);
  flora.rock2 = prepFlora(assets.rock2);
  prepFlora(assets.wood_log);                 // 柴堆模板（alpha 贴图 + 深度材质）
  templates.set('wood_log', assets.wood_log);

  // ── inst 收集器（布局阶段收集，构建阶段统一建 InstancedMesh） ──
  const { instData, collectInst } = makeInstCollector(groundY);

  // ═══ 布景摆放（map-test 移植；注册可破坏/碰撞改走 destructibles API） ═══
  const KITS = {
    house01: ['house01', 'house01_roof', 'house01_add'],
    house03: ['house03', 'house03_add', 'house03_roof'],
    barn01: ['barn01', 'barn01_add'],
  };

  // 院落式小镇布局：建筑整体校准比例（对比坦克高 2.2-3.3m）
  const KIT_SCALE = { house01: 1.2, house02: 1.05, house03: 1.3, barn01: 1.15, barn03: 1.15 };

  // 院落朝向：u = 沿街方向，v = 背路方向；rot = 主屋长轴沿街的摆放角
  const SIDES = {
    N: { ux: 1, uz: 0, vx: 0, vz: 1, rot: 90 },   // X 公路北侧，院落向 +z 展开
    S: { ux: 1, uz: 0, vx: 0, vz: -1, rot: 90 },  // X 公路南侧
    E: { ux: 0, uz: 1, vx: 1, vz: 0, rot: 0 },    // Z 公路东侧
    W: { ux: 0, uz: 1, vx: -1, vz: 0, rot: 0 },   // Z 公路西侧
  };

  // ── B1 建筑合批：group 物件不再逐栋挂场景，克隆仅作数据源（求 box/注册/受损抽出用），
  //    网格按（几何体×材质）收集进流；布局结束后 finalizeBatch 落地为少量 InstancedMesh。
  //    首次受损时 destructibles._ensureGroup 把该栋实例矩阵置零并挂回独立克隆 → 走原灰化/倒塌管线 ──
  const batchStreams = new Map();   // key(geoUuid|matUuids) → { geometry, material, castShadow, receiveShadow, items:[{matrix, rec}] }

  // 摆放一套件/单件：KIT 多件按相对偏移组合；inst 物件（围栏/柴堆/树）走收集器
  // 注册可破坏物件 + 碰撞体（obstacle kind 'building'，r×0.82，solid 规则由 registerGroup 判定）
  function placeKit(nameOrKit, x, z, rotDeg, opts = {}) {
    const names = KITS[nameOrKit] || [nameOrKit];
    // inst 物件（围栏/柴堆）走收集器
    if (!KITS[nameOrKit] && INST_PROPS[names[0]]) {
      collectInst(names[0], x, z, rotDeg, opts.scale || 1);
      return null;
    }
    if (!templates.has(names[0])) { console.warn('缺少模板', names[0]); return null; }
    const rot = rotDeg * Math.PI / 180;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, rot);
    const g = new THREE.Group();
    const y = opts.y !== undefined ? opts.y : groundY(x, z);
    g.position.set(x, y, z);
    if (opts.scale) g.scale.setScalar(opts.scale);   // 整套件（含子件偏移）统一缩放
    const base = templates.get(names[0]);
    for (const n of names) {
      const t = templates.get(n);
      if (!t) continue;
      const c = t.clone(true);
      if (n === names[0]) {
        c.position.set(0, 0, 0);
        c.quaternion.premultiply(q);
      } else {
        c.position.sub(base.position).applyQuaternion(q);
        c.quaternion.premultiply(q);
      }
      g.add(c);
    }
    // ── 注册可破坏物件 + 碰撞体（destructibles API：box/半径/碰撞判定与原逻辑一致） ──
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const w = box.max.x - box.min.x, d = box.max.z - box.min.z;
    const rule = PROP_RULES[names[0]];
    if (rule) {
      // B1：g 不挂 root（布局后由 InstancedMesh 渲染）；受损时 _ensureGroup 挂回
      const rec = des.registerGroup({
        type: names[0], group: g,
        cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2,
        r: Math.max(w, d) / 2, height: box.max.y - box.min.y,
        w, dp: d, y0: box.min.y,
        rule, collide: opts.collide,
        inst: { refs: [] },
      });
      // 网格收进合批流（同几何体+同材质 → 同一 InstancedMesh；材质数组按序拼接 key）
      g.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const key = o.geometry.uuid + '|' + mats.map(m => m.uuid).join(',');
        let st = batchStreams.get(key);
        if (!st) {
          st = { geometry: o.geometry, material: o.material, castShadow: o.castShadow, receiveShadow: o.receiveShadow, items: [] };
          batchStreams.set(key, st);
        }
        st.items.push({ matrix: o.matrixWorld.clone(), rec });
      });
    } else {
      root.add(g);
      if (opts.collide !== false) {
        // 无规则物件兜底：仍保留碰撞体
        world.addObstacle({
          x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2,
          r: Math.max(w, d) / 2 * 0.82, kind: 'building',
        });
      }
    }
    return g;
  }

  // ── B1 合批落地：每（几何体×材质）流一个 InstancedMesh；实例 ≥12 时按象限切分
  //    保留视锥剔除收益（背后象限整块不画）。抽出机制见 destructibles._ensureGroup ──
  function finalizeBatch() {
    for (const st of batchStreams.values()) {
      let groups = [st.items];
      if (st.items.length >= 12) {
        const quads = [[], [], [], []];
        for (const it of st.items) {
          const e = it.matrix.elements;
          quads[(e[12] >= 0 ? 1 : 0) + (e[14] >= 0 ? 2 : 0)].push(it);
        }
        groups = quads;
      }
      for (const items of groups) {
        if (!items.length) continue;
        const im = new THREE.InstancedMesh(st.geometry, st.material, items.length);
        im.castShadow = !!st.castShadow;
        im.receiveShadow = !!st.receiveShadow;
        items.forEach((it, i) => {
          im.setMatrixAt(i, it.matrix);
          it.rec.inst.refs.push({ mesh: im, index: i });
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.computeBoundingSphere) im.computeBoundingSphere();   // 实例感知包围球（视锥剔除用）
        root.add(im);
      }
    }
    batchStreams.clear();
  }

  function placeTree(type, x, z, scale, collide = true) {
    // 树无坦克碰撞（可碾过压毁）；×0.8 整体缩小与坦克比例协调（leaf 冠幅 5-13m / pine 4-7m）
    const s = clamp((scale || 1) * (0.85 + rand() * 0.3) * 0.8, type === 'pine' ? 0.45 : 0.32, 0.8);
    collectInst(type, x, z, rand() * 360, s);
  }

  // 一户人家：临街主屋（门朝公路）+ 围栏院落（前栏留大门）+ 棚屋/柴堆/配电箱 + 院内树 + 临街行道树
  function household(cx, cz, side, opt = {}) {
    const s = SIDES[side];
    const halfW = opt.halfW ?? 15, depth = opt.depth ?? 38;
    const pw = (a, b) => [cx + a * s.ux + b * s.vx, cz + a * s.uz + b * s.vz];

    // —— 主屋 ——
    const r = rand();
    const house = opt.house || (r < 0.4 ? 'house01' : r < 0.68 ? 'house03' : r < 0.86 ? 'house02' : 'barn01');
    const hb = house === 'barn01' ? 16 : 13;   // 谷仓进深大，更靠后
    const [hx, hz] = pw(-3, hb);
    placeKit(house, hx, hz, s.rot + (rand() < 0.5 ? 0 : 180), { scale: KIT_SCALE[house] || 1 });

    // —— 围栏（前栏留 10m 门洞，正对主屋门） ——
    const edges = [
      [-halfW, 0, -5, 0], [5, 0, halfW, 0],    // 前栏两段（门洞 a∈[-5,5]）
      [halfW, 0, halfW, depth],                // 右侧栏
      [halfW, depth, -halfW, depth],           // 后栏
      [-halfW, depth, -halfW, 0],              // 左侧栏
    ];
    for (const [a1, b1, a2, b2] of edges) {
      const [x1, z1] = pw(a1, b1), [x2, z2] = pw(a2, b2);
      fenceRun(x1, z1, x2, z2);
    }

    // —— 院内设施（一家一况，确定性变化） ——
    if (opt.barn || rand() < 0.38) {
      const sh = opt.barn || (rand() < 0.5 ? 'barrack01' : 'barrack03');
      const [px, pz] = pw(halfW - 5.5, depth - 7);
      placeKit(sh, px, pz, s.rot + 90, { scale: 1.1 });
    }
    if (rand() < 0.6) {
      const [px, pz] = pw(-halfW + 4.5, depth - 4);
      placeKit('wood_log', px, pz, rand() * 360, { collide: false, merge: true });
    }
    if (rand() < 0.7) {
      const box = ['utilitybox01', 'utilitybox02', 'utilitybox03'][Math.floor(rand() * 3)];
      const [px, pz] = pw(-halfW + 3, 11);
      placeKit(box, px, pz, s.rot, { collide: false });
    }
    if (rand() < 0.22) {
      const [px, pz] = pw(8, 4.5);
      placeKit('bench01', px, pz, s.rot + 90, { collide: false });
    }
    if (rand() < 0.12) {
      const [px, pz] = pw(-halfW + 7, depth - 11);
      placeKit(rand() < 0.5 ? 'trailer01' : 'trailer02', px, pz, s.rot, { scale: 1.0 });
    }

    // —— 绿化：院内点缀 1 棵（40%）+ 临街行道树（镇内少而精） ——
    const t1 = pw(-halfW + 3, depth - 3);
    if (rand() < 0.4) placeTree(rand() < 0.7 ? 'leaf' : 'pine', t1[0], t1[1], 0.55 + rand() * 0.15);
    if (rand() < 0.3) {
      const t2 = pw(halfW - 3.5, 24);
      placeTree('leaf', t2[0], t2[1], 0.55 + rand() * 0.15);
    }
    const t3 = pw(halfW + 6, 3);
    placeTree(rand() < 0.65 ? 'leaf' : 'pine', t3[0], t3[1], 0.6 + rand() * 0.2);
  }

  // 临街绿地（不盖房，留出呼吸空间）：2 棵点缀
  function greenGap(cx, cz, side) {
    const s = SIDES[side];
    const pw = (a, b) => [cx + a * s.ux + b * s.vx, cz + a * s.uz + b * s.vz];
    let p = pw(-7, 16); placeTree('leaf', p[0], p[1], 0.8 + rand() * 0.15);
    p = pw(6, 27); placeTree(rand() < 0.5 ? 'pine' : 'leaf', p[0], p[1], 0.7 + rand() * 0.2);
    if (rand() < 0.6) { p = pw(-2, 7); placeKit('bench01', p[0], p[1], s.rot + 90, { collide: false }); }
  }


  // 围栏沿两点连线分段铺设（交替 fence01/02 + 末端立柱）
  function fenceRun(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(len / 4.3));
    const rot = Math.atan2(-dz, dx) * 180 / Math.PI;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      collectInst(i % 2 === 0 ? 'fence01' : 'fence02', x1 + dx * t, z1 + dz * t, rot, 1);
    }
    collectInst('fence_pole01', x2, z2, rot, 1);
  }


  return { templates, flora, instData, collectInst, placeKit, finalizeBatch, placeTree, fenceRun, household, greenGap, SIDES };
}

// ═══════════════════════ 东欧小镇（map-test.html 移植） ═══════════════════════
function buildTown(ctx, des) {
  const { world, scene, quality, assets } = ctx;
  const root = world.root;
  // 与 map-test.html 相同种子；贴图（地面→沥青→砾石）→布局→散布按相同顺序消费，布局逐点一致
  const rand = mulberry32(20260901);

  // ── 天空：fbm 噪声云（三层云 + 天顶 3D 噪声 + 柏林关参数） ──
  const sunDir = new THREE.Vector3(0.5, 0.85, 0.6).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3a6ab8) },    // 晴天深蓝
      midColor: { value: new THREE.Color(0x9cc4e4) },    // 过渡浅蓝
      botColor: { value: new THREE.Color(0xd8e6ee) },    // 地平线亮白蓝
      sunDir: { value: sunDir.clone() },
      fogColor: { value: new THREE.Color(0xc8d8e4) },    // 与场景雾同色：地平线以下融合
      uTime: { value: 0 },                               // 秒；shader 内乘慢速漂移系数
    },
    vertexShader: `
      varying vec3 vDir;
      varying vec2 vUv;
      void main() {
        vDir = normalize(position);
        vUv = uv;                          // 球体自带 UV：经线接缝处由纹理环绕无缝处理
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, botColor, sunDir, fogColor;
      uniform float uTime;
      varying vec3 vDir;
      // ── fbm 噪声云（技法移植自 darkWil environment.js 柏林关配置：三层云 + 天顶 3D 噪声） ──
      float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0; float a = 0.5;
        mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);  // 旋转 36.87°，打破网格对齐（去方格感）
        for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = rot * p * 2.0; a *= 0.5; }
        return v;
      }
      // 3D 噪声（天顶云：dir 单位向量球面连续，无方位角接缝、无极点汇聚拉抻）
      float hash13(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float vnoise3(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        float n000 = hash13(i);
        float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
        return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
                   mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
      }
      float fbm3(vec3 p) {
        float v = 0.0; float a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * vnoise3(p); p *= 2.02; a *= 0.5; }
        return v;
      }
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 dir = normalize(vDir);
        vec3 col = mix(botColor, midColor, smoothstep(0.0, 0.22, h));
        col = mix(col, topColor, smoothstep(0.15, 0.7, h));
        float sd = max(dot(dir, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.96, 0.86) * pow(sd, 260.0) * 2.6;   // 晴天亮白日轮
        col += vec3(1.0, 0.85, 0.55) * pow(sd, 8.0) * 0.16;    // 薄雾光晕

        // ── 三层 fbm 云（柏林关参数：coverage 0.55 / farDarken 1.0 / zenithBoost 0.5） ──
        float lit = smoothstep(0.10, 0.80, sd);
        vec3 cloudCol = vec3(0.957, 0.965, 0.973);     // 柏林关 0xf4f6f8 亮白
        vec3 cloudHi  = vec3(0.973, 0.957, 0.910);     // 柏林关 0xf8f4e8 暖白高光
        vec3 cloudShade = cloudCol * 0.88;             // 云底微灰（受光混色用）

        // 1. 远景层云带（地平线附近，水平拉伸；farDarken=1.0 不暗化）
        if (dir.y < 0.35) {
          float stretch = mix(3.5, 1.0, smoothstep(0.0, 0.25, dir.y));
          vec2 cuv = dir.xz * stretch * 0.8;
          cuv += vec2(uTime * 0.005, uTime * 0.0015);   // 柏林关 drift 0.005
          float n = fbm(cuv);
          float cloud = smoothstep(1.0 - 0.55 * 1.15, 1.0 - 0.55 * 0.25, n);  // coverage 0.55
          float band = smoothstep(0.32, 0.08, dir.y) * smoothstep(-0.08, 0.04, dir.y);
          cloud *= band;
          vec3 farCol = mix(cloudCol, cloudHi * 0.85, lit);
          col = mix(col, farCol, cloud * 0.85);
        }
        // 2. 中空层积云（主要云层，中等密度）
        if (dir.y > 0.06 && dir.y < 0.75) {
          vec2 cuv2 = dir.xz * 1.0 + vec2(uTime * 0.0035, uTime * 0.0010);
          float n2 = fbm(cuv2 + vec2(7.3, 2.1));       // 偏移避免与层云重复
          float cloud2 = smoothstep(1.0 - 0.55 * 0.9, 1.0 - 0.55 * 0.3, n2);
          float band2 = smoothstep(0.06, 0.25, dir.y) * smoothstep(0.75, 0.40, dir.y);
          cloud2 *= band2 * 0.80;
          vec3 midCol = mix(cloudShade, cloudHi, lit);
          col = mix(col, midCol, cloud2);
        }
        // 3. 高空天顶卷云（zenithBoost 0.5：加密 + band 上界推高 + 3D 噪声采样——天顶无拉抻无接缝）
        if (dir.y > 0.25) {
          vec3 c3 = dir * 3.0 + vec3(uTime * 0.002, 0.0, 0.0) + vec3(15.7, 8.2, 3.1);
          float n3 = fbm3(c3);
          float thrLow = mix(0.45, 0.28, 0.5);          // zenithBoost=0.5 → 阈值 0.365
          float cloud3 = smoothstep(thrLow, thrLow + 0.20, n3);
          float band3 = smoothstep(0.25, 0.45, dir.y) * smoothstep(1.50, 0.60, dir.y);  // 上界 1.50：天顶不衰减
          cloud3 *= band3 * mix(0.50, 0.85, 0.5);       // 密度 0.675
          vec3 highCol = mix(cloudCol * 1.15, cloudHi * 1.08, lit);
          col = mix(col, highCol, cloud3);
        }

        col = mix(col, vec3(0.82, 0.87, 0.9), (1.0 - smoothstep(0.0, 0.14, h)) * 0.35);
        // 地平线以下 → 雾色：地图边缘外的穹底与远处雾化地面无缝融合
        col = mix(fogColor, col, smoothstep(-0.09, 0.015, vDir.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(3800, 32, 16), skyMat);
  root.add(skyMesh);
  world.sky = skyMesh;
  world.skyMat = skyMat;   // 接线：主循环每帧 world.skyMat.uniforms.uTime.value += dt（云层缓慢漂移）

  // 线性距离雾：80m 起雾，1300m 完全雾化（性能优化：与距离剔除阈值同步收近，视野边缘仍被雾包住无突兀）
  scene.fog = new THREE.Fog(0xc8d8e4, 80, 1300);

  // 光照整体减弱：午后斜阳氛围（非正午顶光），阴面更实、层次更明显
  root.add(new THREE.HemisphereLight(0xbccfe6, 0x7e8a6a, 1.45));
  root.add(new THREE.AmbientLight(0x9a9a94, 0.5));
  const sun = new THREE.DirectionalLight(0xffe8c2, 3.4);
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = 90;
  sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0006;
  root.add(sun);
  root.add(sun.target);
  world.sun = sun;
  world.sunDir = sunDir;

  // ── 程序化贴图（与 map-test 相同的 rand 消费顺序：地面 → 沥青 → 砾石） ──
  const groundTex = makeGroundTexture(rand);
  const asphaltTex = makeAsphaltTexture(rand);
  const gravelTex = makeGravelTexture(rand);

  // ── 地面（5000×5000：游戏区外延伸至雾中，地平线无边界） ──
  // 性能优化：480→200 分段（低频缓丘 25m/格足够，三角形 -38万/帧）
  {
    const seg = 200;
    const geo = new THREE.PlaneGeometry(5000, 5000, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const posA = geo.attributes.position;
    for (let i = 0; i < posA.count; i++) posA.setY(i, townTerrainHeight(posA.getX(i), posA.getZ(i)));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0.0, color: 0xbdb49a });
    mat.map.repeat.set(225, 225);   // 5000m 地面保持 22.2m/格纹理密度
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    root.add(ground);
  }

  // ── 十字公路（沿地形起伏的带状网格；主路/路肩 yOff 分层规避 Z-fighting） ──
  const ROAD_HALF = 6, SHOULDER = 10;
  function buildRibbon(alongX, half, yOff, texture, vRepeatLen) {
    const positions = [], uvs = [], indices = [];
    const step = 4;
    let vi = 0, prevIn = false;
    for (let s = -1000; s <= 1000; s += step) {
      const e1 = alongX ? [s, -half] : [-half, s];
      const e2 = alongX ? [s, half] : [half, s];
      const y1 = townTerrainHeight(e1[0], e1[1]) + yOff;
      const y2 = townTerrainHeight(e2[0], e2[1]) + yOff;
      positions.push(e1[0], y1, e1[1], e2[0], y2, e2[1]);
      const v = (s + 1000) / vRepeatLen;
      uvs.push(0, v, 1, v);
      if (prevIn) indices.push(vi - 2, vi - 1, vi, vi - 1, vi + 1, vi);
      vi += 2;
      prevIn = true;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.94, metalness: 0, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }
  root.add(buildRibbon(true, ROAD_HALF, 0.07, asphaltTex, 14));
  root.add(buildRibbon(false, ROAD_HALF, 0.075, asphaltTex, 14));
  root.add(buildRibbon(true, SHOULDER, 0.035, gravelTex, 10));
  root.add(buildRibbon(false, SHOULDER, 0.05, gravelTex, 10));

  // ── 布景模板 + 摆放引擎（与平原村落共用 createKitPlacer；参数化高度函数与随机源） ──
  const tb = createKitPlacer(ctx, des, { groundY: townTerrainHeight, rand });
  const { templates, flora, instData, collectInst, placeKit, finalizeBatch, placeTree, fenceRun, household, greenGap, SIDES } = tb;

  // 十字主街：两侧院落沿公路整齐排布（约七成住户集中于镇区）
  function mainStreet() {
    const slots = [78, 126, 174, 222, 270];
    for (const off of slots) {
      for (const [x, z, side] of [
        [off, 24, 'N'], [-off, 24, 'N'], [off, -24, 'S'], [-off, -24, 'S'],
        [24, off, 'E'], [24, -off, 'E'], [-24, off, 'W'], [-24, -off, 'W'],
      ]) {
        const r = rand();
        if (r < 0.7) household(x, z, side);
        else if (r < 0.85) greenGap(x, z, side);
        else household(x, z, side, { house: rand() < 0.5 ? 'barn01' : 'house03', barn: 'barrack02' });
      }
    }
  }

  // 路口小品
  function crossroad() {
    placeKit('sign01', 13, 13, 210, { collide: false });
    placeKit('sign02', -13, 13, 130, { collide: false });
    placeKit('sign03', 13, -13, -35, { collide: false });
    placeKit('sign04', -13, -13, 55, { collide: false });
    placeKit('bench01', 20, 14, 180, { collide: false });
    placeKit('bench01', -20, -14, 0, { collide: false });
    placeTree('leaf', 34, 20, 0.65);
    placeTree('leaf', -34, -20, 0.65);
  }

  // 西南老城：小巷密集院落（小地块小屋）
  function oldTown() {
    const plots = [
      [-170, -170], [-206, -170], [-242, -170],
      [-170, -206], [-206, -206], [-242, -206],
      [-170, -242], [-206, -242],
    ];
    for (const [x, z] of plots) {
      household(x, z, 'N', { halfW: 11, depth: 26, house: rand() < 0.6 ? 'house03' : 'house01' });
    }
    placeTree('leaf', -224, -224, 0.8);
    placeTree('leaf', -188, -188, 0.75);
  }

  // 东北庄园：大宅 + 花园围墙
  function manor() {
    placeKit('house02', 220, 218, 135, { scale: 1.1 });
    fenceRun(172, 172, 272, 172);
    fenceRun(272, 172, 272, 272);
    fenceRun(272, 272, 172, 272);
    fenceRun(172, 272, 172, 232);
    fenceRun(172, 208, 172, 172);       // 西侧留大门（朝镇中心）
    placeTree('leaf', 195, 195, 0.95);
    placeTree('leaf', 245, 250, 0.9);
    placeTree('pine', 250, 190, 0.9);
    placeTree('leaf', 190, 250, 0.85);
    placeKit('bench01', 185, 220, 90, { collide: false });
    placeKit('utilitybox01', 265, 185, 0, { collide: false });
    placeTree('pine', 284, 210, 0.85);
    placeTree('leaf', 210, 284, 0.8);
  }

  // 西北集体农庄：谷仓群 + 青储塔 + 拖车
  function farm() {
    fenceRun(-160, 160, -272, 160);
    fenceRun(-272, 160, -272, 272);
    fenceRun(-272, 272, -160, 272);
    fenceRun(-160, 272, -160, 208);
    fenceRun(-160, 168, -160, 160);    // 东侧留门
    placeKit('barn01', -238, 182, 90, { scale: 1.15 });
    placeKit('barn03', -184, 186, 0, { scale: 1.15 });
    placeKit('barn03', -240, 240, 90, { scale: 1.15 });
    placeKit('watertank01', -170, 250, 0, { scale: 1.1 });   // 青储塔
    placeKit('trailer01', -254, 216, 0, { scale: 1.0 });
    placeKit('trailer02', -256, 232, 15, { scale: 1.0 });
    placeKit('truck01', -176, 170, -90, { scale: 1.0 });
    placeKit('wood_log', -208, 166, 25, { collide: false, merge: true });
    placeKit('wood_log', -213, 168, -10, { collide: false, merge: true });
    placeKit('wood_log', -203, 169, 50, { collide: false, merge: true });
    placeTree('pine', -262, 190, 0.85);
    placeTree('leaf', -262, 250, 0.8);
    placeTree('leaf', -226, 262, 0.75);
  }

  // 东南工业堆场：办公室 + 集装箱 + 发电机（围墙围起，西侧留门）
  function industry() {
    fenceRun(160, -160, 272, -160);
    fenceRun(272, -160, 272, -272);
    fenceRun(272, -272, 160, -272);
    fenceRun(160, -272, 160, -224);
    fenceRun(160, -200, 160, -160);
    placeKit('barrack04', 178, -180, 0, { scale: 1.05 });
    placeKit('barrack02', 258, -172, 90, { scale: 1.05 });
    placeKit('container02', 228, -236, 0, { scale: 1.0 });
    placeKit('container02', 237, -236, 0, { scale: 1.0 });
    placeKit('container03', 232, -226, 90, { scale: 1.0 });
    placeKit('container01', 248, -216, 12, { collide: false, scale: 1.0 });
    placeKit('container01', 252, -212, -18, { collide: false, scale: 1.0 });
    placeKit('generator01', 202, -252, 0, { scale: 1.0 });
    placeKit('cable_reel01', 214, -260, 20, { collide: false });
    placeKit('cable_reel01', 220, -256, -30, { collide: false });
    placeKit('metalplate01', 250, -200, 10, { collide: false });
    placeKit('metalplate02', 254, -196, -20, { collide: false });
    placeKit('metalplate03', 258, -202, 35, { collide: false });
    placeKit('truck01', 168, -212, 90, { scale: 1.0 });
    placeTree('pine', 264, -264, 0.8);
  }

  // 外围零散农舍（沿公路四臂分布，约占三成）
  function outskirts() {
    const FARMS = [
      ['N', 430, 'house01'], ['N', 560, 'house03'], ['N', 690, 'barn01'],
      ['S', 450, 'house01'], ['S', 640, 'house03'],
      ['E', 460, 'house01'], ['E', 630, 'barn01'],
      ['W', 445, 'house03'], ['W', 610, 'house01'],
    ];
    for (const [side, off, house] of FARMS) {
      let x, z;
      if (side === 'N') { x = off; z = 26; }
      else if (side === 'S') { x = off; z = -26; }
      else if (side === 'E') { x = 26; z = off; }
      else { x = -26; z = off; }
      household(x, z, side, { halfW: 20, depth: 44, house, barn: rand() < 0.6 ? 'barn03' : 'barrack02' });
      const s = SIDES[side];
      placeTree('leaf', x + s.vx * 52 + s.ux * 16, z + s.vz * 52 + s.uz * 16, 0.85);
      placeTree('pine', x + s.vx * 56 - s.ux * 14, z + s.vz * 56 - s.uz * 14, 0.8);
    }
  }

  // 小镇布局总装（调用顺序与 map-test 一致，保证 rand 流一致）
  function layoutTown() {
    crossroad();
    mainStreet();   // 十字主街院落（集中）
    oldTown();      // 西南老城小巷
    manor();        // 东北庄园
    farm();         // 西北集体农庄
    industry();     // 东南工业堆场
    outskirts();    // 外围零散农舍
  }

  // 电线杆阵（沿公路四臂）：只能压倒、不可炮击
  function buildPylons() {
    const spots = [];
    for (let x = 340; x <= 880; x += 90) { spots.push([x, 13]); spots.push([-x, -13]); }
    for (let z = 340; z <= 880; z += 90) { spots.push([13, z]); spots.push([-13, -z]); }
    for (const [x, z] of spots) placeKit('pylon01', x, z, 0);
  }

  // 外围小片树林（林簇）中心：镇外比镇内密，16 簇
  const GROVES = [
    [430, 270], [-400, 320], [540, -190], [-470, -260],
    [310, 500], [-250, 540], [-320, -520], [380, -480],
    [640, 390], [-640, 330], [610, -430], [-580, -400],
    [760, 120], [-730, -140], [180, -700], [-160, 700],
  ];

  function scatterNature() {
    // 公路两侧行道树
    for (let d = 330; d <= 950; d += 55) {
      const j = () => (rand() - 0.5) * 8;
      placeTree('pine', d + j(), 19 + j(), 0.8 + rand() * 0.3);
      placeTree('pine', -d + j(), -19 + j(), 0.8 + rand() * 0.3);
      placeTree('pine', 19 + j(), d + j(), 0.8 + rand() * 0.3);
      placeTree('pine', -19 + j(), -d + j(), 0.8 + rand() * 0.3);
    }
    // 小片树林：每簇 11-17 棵，半径 28-46m（镇外小片林）
    for (const [gx, gz] of GROVES) {
      const n = 11 + Math.floor(rand() * 7);
      const R = 28 + rand() * 18;
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * R;
        const x = gx + Math.cos(a) * rr, z = gz + Math.sin(a) * rr;
        if (Math.abs(x) < 32 || Math.abs(z) < 32) continue;   // 避开公路走廊
        placeTree(rand() < 0.6 ? 'pine' : 'leaf', x, z, 0.75 + rand() * 0.5);
      }
    }
    // 周界林带
    for (let i = 0; i < 170; i++) {
      const a = (i / 170) * Math.PI * 2 + rand() * 0.02;
      const deg = a * 180 / Math.PI;
      const m = Math.abs(((deg % 90) + 90) % 90);
      if (m < 8 || m > 82) continue;
      const r = 930 + rand() * 55;
      placeTree(rand() < 0.75 ? 'pine' : 'leaf', Math.cos(a) * r, Math.sin(a) * r, 1.0 + rand() * 0.5, false);
    }
    // 零散岩石（instanced，可炮毁成碎石堆；大石保留碰撞）
    let rocks = 0, tries = 0;
    while (rocks < 48 && tries < 600) {
      tries++;
      const x = (rand() - 0.5) * 1880, z = (rand() - 0.5) * 1880;
      if (Math.max(Math.abs(x), Math.abs(z)) < 320) continue;
      if (Math.abs(z) < 24 || Math.abs(x) < 24) continue;
      const h = Math.abs(townTerrainHeight(x, z));
      if (h < 3 && rand() < 0.6) continue;
      const type = rand() < 0.5 ? 'rock' : 'rock2';
      const s = 0.7 + rand() * 2.1;
      const rec = collectInst(type, x, z, rand() * 360, s, type === 'rock' ? 1.0 * s : 0);
      if (s > 1.2) {
        const o = { x, z, r: 1.2 * s };
        world.addObstacle(o);
        rec.obstacle = o;   // 大石碰撞体随实例注册（压毁/炮毁后由系统摘除）
      }
      rocks++;
    }
    // 野外零散木堆
    for (let i = 0; i < 6; i++) {
      const x = (rand() - 0.5) * 1500, z = (rand() - 0.5) * 1500;
      if (Math.max(Math.abs(x), Math.abs(z)) < 330 || Math.abs(z) < 24 || Math.abs(x) < 24) continue;
      collectInst('wood_log', x, z, rand() * 360, 1);
    }
  }

  // ── 布局构建（顺序与 map-test 完全一致） ──
  layoutTown();
  buildPylons();
  scatterNature();
  buildInstancedProps(des, instData, templates, flora, root);
  finalizeBatch();   // B1：建筑合批落地（所有 placeKit 完成后）

  // ── 高度采样：基础地形 + 废墟坡度场（<1.5m 废墟可通行，坦克骑上去有起伏） ──
  world.setGroundY((x, z) => townTerrainHeight(x, z) + des.rubbleHeightAt(x, z) +
    (world.surfaceY ? world.surfaceY(x, z) : 0));
}

// ═══════════════════════ 开阔平原（terrain.js World 平移 + 模型树升级） ═══════════════════════
function buildPlains(ctx, des) {
  const { world, scene, quality, assets } = ctx;
  const root = world.root;
  const size = MAPS.plains.size;
  const rand = mulberry32(20260825);   // 与 terrain.js _scatter 相同种子（岩石→树→废墟顺序消费）

  // ── 光照：午后斜阳（terrain.js 原参数：抬高日盘 + 提亮环境 + AmbientLight 散阴影） ──
  const sunDir = new THREE.Vector3(0.5, 0.85, 0.6).normalize();
  root.add(new THREE.HemisphereLight(0xc8d4e0, 0x9a8e6a, 1.7));
  root.add(new THREE.AmbientLight(0x9a9488, 0.55));
  const sun = new THREE.DirectionalLight(0xffe0b0, 4.0);
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  const sc = 90;
  sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0006;
  root.add(sun);
  root.add(sun.target);
  world.sun = sun;
  world.sunDir = sunDir;

  // ── 天空 + 雾（战场尘霾氛围不变） ──
  world.sky = makeSkyDome();
  world.sky.material.uniforms.sunDir.value.copy(sunDir);
  root.add(world.sky);
  // 性能优化：雾密度 0.0011→0.0015（~1100m 即近全雾，与距离剔除阈值衔接）
  scene.fog = new THREE.FogExp2(0xb0a488, 0.0015);

  // ── 地面（性能优化：440→200 分段） ──
  const seg = 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const posA = geo.attributes.position;
  for (let i = 0; i < posA.count; i++) posA.setY(i, plainsHeight(posA.getX(i), posA.getZ(i)));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: makeGroundTexture(Math.random), roughness: 0.96, metalness: 0.0, color: 0xbdb49a,
  }));
  ground.receiveShadow = true;
  root.add(ground);

  // ── 模型树模板（leaf/pine glb：双面 + alphaTest + 深度材质烘焙） ──
  const flora = { leaf: prepFlora(assets.leaf_tree), pine: prepFlora(assets.pine_tree) };
  const { instData, collectInst } = makeInstCollector(plainsHeight);

  // ── 岩石：DodecahedronGeometry（terrain.js 原做法）+ registerGroup ──
  // 规则 {hp:1, rubbleH:0.3}：可炮毁压扁成碎石堆；无 crushH → 不可被履带压毁
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e6a5e, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const x = (rand() - 0.5) * size * 0.8;
    const z = (rand() - 0.5) * size * 0.8;
    if (Math.hypot(x, z) < 70) continue;   // 中央留空
    const r = 1.6 + rand() * 3.4;
    const m = new THREE.Mesh(rockGeo, rockMat);
    m.position.set(x, plainsHeight(x, z) + r * 0.25, z);
    m.scale.set(r, r * (0.55 + rand() * 0.5), r * (0.7 + rand() * 0.6));
    m.rotation.set(rand() * 3, rand() * 6, rand() * 3);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    des.registerGroup({
      type: 'rock', group: m, cx: x, cz: z, r,
      w: bb.max.x - bb.min.x, dp: bb.max.z - bb.min.z,
      height: bb.max.y - bb.min.y, y0: bb.min.y,
      rule: { hp: 1, rubbleH: 0.3 },
    });
  }

  // ── 树木：枯树升级为模型树（InstancedMesh，leaf 60 / pine 30；避开中央 60m 交战区） ──
  // INST_PROPS.leaf/pine 规则：可炮毁倒伏 / 可压倒（drag 0.45）；无坦克碰撞（不挂障碍体）
  const placeTreeScatter = (type) => {
    const x = (rand() - 0.5) * size * 0.86;
    const z = (rand() - 0.5) * size * 0.86;
    if (Math.hypot(x, z) < 60) return;   // 中央交战区留空
    const s = clamp(0.5 + rand() * 0.3, type === 'pine' ? 0.45 : 0.32, 0.8);
    collectInst(type, x, z, rand() * 360, s);
  };
  for (let i = 0; i < 60; i++) placeTreeScatter('leaf');
  for (let i = 0; i < 30; i++) placeTreeScatter('pine');

  // ── 残破建筑废墟（terrain.js 原做法）：仅作 solid 障碍，不注册可破坏 ──
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x625d50, roughness: 0.98 });
  for (let i = 0; i < 8; i++) {
    const x = (rand() - 0.5) * size * 0.6;
    const z = (rand() - 0.5) * size * 0.6;
    if (Math.hypot(x, z) < 90) continue;
    const y = plainsHeight(x, z);
    const grp = new THREE.Group();
    const w = 5 + rand() * 6;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, 2.5 + rand() * 3, 0.6), ruinMat);
    box.position.y = box.geometry.parameters.height / 2;
    box.rotation.y = rand() * 3;
    box.castShadow = box.receiveShadow = true;
    grp.add(box);
    const box2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2 + rand() * 2, 4 + rand() * 4), ruinMat);
    box2.position.set(w * 0.3, box2.geometry.parameters.height / 2, 1.5);
    box2.rotation.y = box.rotation.y;
    box2.castShadow = box2.receiveShadow = true;
    grp.add(box2);
    grp.position.set(x, y, z);
    root.add(grp);
    world.addObstacle({ x, z, r: Math.max(w, 4) * 0.62, kind: 'ruin' });
  }

  // ── M2.8 巨石掩体：位移几何 + 程序化岩石贴图（可作坦克掩体，可炮毁、阻挡坦克与视线） ──
  const bigRockTex = makeRockTexture();
  const bigRockMat = new THREE.MeshStandardMaterial({
    map: bigRockTex, color: 0x968f80, roughness: 0.95, flatShading: true,   // color 压暗 + 平面着色：块石质感且防强光过曝
  });
  const bigRockGeos = [];
  for (let v = 0; v < 3; v++) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const posA = geo.attributes.position;
    const seen = new Map();
    for (let i = 0; i < posA.count; i++) {   // 同位顶点焊接后统一径向位移（面不撕裂）
      const key = posA.getX(i).toFixed(3) + ',' + posA.getY(i).toFixed(3) + ',' + posA.getZ(i).toFixed(3);
      if (!seen.has(key)) seen.set(key, 0.78 + Math.random() * 0.5);
      const k = seen.get(key);
      posA.setXYZ(i, posA.getX(i) * k, posA.getY(i) * k, posA.getZ(i) * k);
    }
    geo.computeVertexNormals();
    bigRockGeos.push(geo);
  }
  const onSpawnRing = (x, z, margin) => Math.abs(Math.hypot(x, z) - 650) < margin;
  for (let i = 0; i < 16; i++) {
    const x = (Math.random() - 0.5) * 1750, z = (Math.random() - 0.5) * 1750;
    if (Math.hypot(x, z) < 130 || onSpawnRing(x, z, 90)) continue;   // 中央留空 + 避开出生环带
    const s2 = 3.5 + Math.random() * 3.5;
    const m = new THREE.Mesh(bigRockGeos[i % 3], bigRockMat);
    m.position.set(x, plainsHeight(x, z) + s2 * 0.16, z);
    m.scale.set(s2, s2 * (0.7 + Math.random() * 0.5), s2 * (0.75 + Math.random() * 0.5));
    m.rotation.set(Math.random() * 0.6 - 0.3, Math.random() * 6, Math.random() * 0.6 - 0.3);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    des.registerGroup({
      type: 'boulder', group: m, cx: x, cz: z, r: s2,
      w: bb.max.x - bb.min.x, dp: bb.max.z - bb.min.z,
      height: bb.max.y - bb.min.y, y0: bb.min.y,
      rule: { hp: 5, rubbleH: 0.6 },   // 巨石：5 发炮毁，掩体价值高
    });
    world.addObstacle({ x, z, r: s2 * 0.95, kind: 'rock' });   // 阻挡坦克 + 视线 + AI 掩体
  }

  // ── M2.8 零散村落：小镇民居套件（household 院落 = 主屋/谷仓 + 围栏院落 + 棚屋柴堆） ──
  const tb = createKitPlacer(ctx, des, { groundY: plainsHeight, rand: Math.random });
  const villageSides = ['N', 'S', 'E', 'W'];
  const villageCs = [];
  for (let tries = 0; tries < 80 && villageCs.length < 5; tries++) {
    const x = (Math.random() - 0.5) * 1750, z = (Math.random() - 0.5) * 1750;
    if (Math.hypot(x, z) < 190 || onSpawnRing(x, z, 130)) continue;   // 中央留空 + 避开出生环带
    if (villageCs.some(c => Math.hypot(c.x - x, c.z - z) < 330)) continue;
    villageCs.push({ x, z });
  }
  for (const c of villageCs) {
    const n = 2 + Math.floor(Math.random() * 2);   // 每村 2~3 户
    for (let i = 0; i < n; i++) {
      const ox = (i - (n - 1) / 2) * 58 + (Math.random() - 0.5) * 16;
      const oz = (Math.random() - 0.5) * 44;
      tb.household(c.x + ox, c.z + oz, villageSides[Math.floor(Math.random() * 4)],
        { halfW: 12, depth: 30, house: Math.random() < 0.5 ? 'house01' : 'house03' });
    }
  }
  buildInstancedProps(des, tb.instData, tb.templates, tb.flora, root);
  tb.finalizeBatch();

  // ── 树 InstancedMesh 构建 + 逐实例注册（含树干圆柱求交数据） ──

  // ── 高度采样：平原无废墟场 ──
  world.setGroundY((x, z) => plainsHeight(x, z) + (world.surfaceY ? world.surfaceY(x, z) : 0));
}
