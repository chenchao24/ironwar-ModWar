// ═══ 主入口：渲染器 / 资源加载 / 游戏状态机 / 相机装备 / 玩家操控 / 战斗循环 ═══
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TANKS, GAME, CAMERA, SHELL_TYPES, ERA_TYPES, APS_RULES, SENSOR_RULES, LWS_RULES, mgFalloff } from './config.js';
import { World, terrainHeight } from './terrain.js';
import { MAPS } from './maps.js';
import { ParticleSystem } from './particles.js';
import { Effects } from './effects.js';
import { ShellManager } from './shell.js';
import { Tank, wrapAngle } from './tank.js';
import { TrackMarks } from './trackmarks.js';
import { TankAI } from './ai.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { audio } from './audio.js';
import { VisibilityManager } from './visibility.js';
import { SmokeManager } from './smoke.js';
import { ThermalSight } from './thermal.js';
import { Garage } from './garage.js';

// KHR_materials_pbrSpecularGlossiness → metalness/roughness 转换（旧 glb 兼容）
class GLTFPBRSpecGlossExt {
  constructor(parser) { this.parser = parser; this.name = 'KHR_materials_pbrSpecularGlossiness'; }
  getMaterialType() { return THREE.MeshStandardMaterial; }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const matDef = parser.json.materials[materialIndex];
    const ext = matDef && matDef.extensions && matDef.extensions[this.name];
    if (!ext) return Promise.resolve();
    const pending = [];
    const diffuse = ext.diffuseFactor !== undefined ? ext.diffuseFactor : [1, 1, 1, 1];
    materialParams.color = new THREE.Color(diffuse[0], diffuse[1], diffuse[2]);
    materialParams.opacity = diffuse[3];
    if (ext.diffuseTexture) pending.push(parser.assignTexture(materialParams, 'map', ext.diffuseTexture, THREE.SRGBColorSpace));
    const gloss = ext.glossinessFactor !== undefined ? ext.glossinessFactor : 1;
    materialParams.roughness = 1 - gloss;
    materialParams.metalness = 0;
    return Promise.all(pending);
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const damp = THREE.MathUtils.damp;
const clamp = THREE.MathUtils.clamp;

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ui = new UI();
    this.input = new Input(this.canvas);
    this.state = 'loading';     // loading → cover → menu → select → battle → result
    this.paused = false;

    // ── 渲染器 ──
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._applyQuality();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.3, 5000);

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    // ── 世界与特效（World 为容器：按 mapId 由 maps.js 装配；首世界在资产加载完后创建） ──
    this.mapId = this.ui.settings.map || 'plains';
    this._mapAssets = null;
    this.ps = new ParticleSystem(this.scene);
    this.effects = new Effects(this.scene, this.ps, audio, (x, z) => this.world ? this.world.groundY(x, z) : 0);
    this.world = null;
    this._afterAssets = [];   // 世界就绪后执行的初始化（shells/minimap/visibility/smoke）

    // ── 热成像瞄具（方案A：材质热值注入 + 离屏双 pass；N 键开镜内切换） ──
    this.thermal = new ThermalSight(this.renderer);
    this.irOn = false;

    // ── 点亮 & 烟雾弹（构造时即建，world 引用可后换） ──
    this.visibility = new VisibilityManager({ obstacles: [] });
    this.smoke = new SmokeManager(this.scene);
    this.visibility.setSmokeManager(this.smoke);

    // ── 厂房车库（机库选车场景；首次进入机库时程序化构建） ──
    this.garage = null;
    this._garageWorld = { groundY: () => 0 };   // 车库平地世界（坦克落 y=0 水泥地面）

    // ── 相机装备 ──
    this.rig = new CameraRig(this.camera, (x, z) => this.world ? this.world.groundY(x, z) : 0);
    this.raycaster = new THREE.Raycaster();
    this.rayDir = new THREE.Vector3();
    this.aimDist = null;
    this.aimTargetTank = null;

    // ── 战斗数据 ──
    this.player = null;
    this.enemies = [];
    this.ais = [];
    this.trackMarks = null;
    this.battleTime = 0;
    this.playerShots = 0;
    this.playerHits = 0;
    this.dmgDealt = 0;
    this.blocked = 0;
    this.moduleHits = 0;
    this.eraStrips = 0;
    this.subsysHits = 0;
    this.apsIntercepts = 0;
    this._laseWarn = false;    // 激光告警：AI 炮塔锁定玩家（ai.onLase 驱动）
    this.enemyName = '';
    this._endByTimeout = false;
    this.throttleSmooth = 0;
    this.steerSmooth = 0;
    this.endTimer = -1;
    this.ambientTimer = 2;
    this.prevReloading = false;

    // 菜单展示机位
    this.menuAngle = 0.6;

    // ── 机库展示车优化：缓存复用（LRU）+ 分帧纹理预热，消除进库/切车的渲染帧卡顿 ──
    this._hangarCache = new Map();    // id → Tank（车库平地世界，隐藏常驻）
    this._prewarmed = new Set();      // 纹理已上传 GPU 的展示车
    this._prewarmTex = new WeakSet(); // 已上传过的纹理对象（跨车去重）
    this._prewarming = false;
    this._prewarmList = [];
    this._prewarmKey = null;
    this._hangarBusy = false;

    this.assets = {};
    // ── 按需加载（阶段2）：资产任务表 / 全量回退开关 / 开战防重入 ──
    this._assetLoader = null;
    this._assetTasks = new Map();       // id → Promise（并发去重、失败可重试）
    this._prewarmSkip = new Set();      // 预取失败的战车，避免预热反复重试
    this._lazyLoad = !new URLSearchParams(location.search).has('eager');  // ?eager=1 回退全量预载
    this._firstScreenDone = false;
    this._startingBattle = false;
    this._bindUI();
    this._load();

    this.clock = new THREE.Timer();
    this.renderer.setAnimationLoop(() => { this.clock.update(); this._frame(); });
    window.__game = this;   // 调试/自动化验证钩子
    // 页面切后台提示：浏览器后台节流会冻结 rAF（游戏整体停摆），提示玩家切回前台
    document.addEventListener('visibilitychange', () => {
      let el = document.getElementById('bg-pause-tip');
      if (!el) {
        el = document.createElement('div');
        el.id = 'bg-pause-tip';
        el.style.cssText = ['position:fixed', 'top:46%', 'left:0', 'right:0', 'text-align:center',
          'font:bold 26px/1.4 sans-serif', 'color:#ffdf9e', 'text-shadow:0 2px 8px #000',
          'pointer-events:none', 'z-index:999', 'display:none',
        ].join(';');
        el.textContent = '⚠ 页面已切至后台，游戏暂停——切回本页面继续';
        document.body.appendChild(el);
      }
      el.style.display = (document.hidden && this.state === 'battle') ? 'block' : 'none';
    });
  }

  _applyQuality() {
    const q = this.ui.settings.quality;
    // 性能优化：high 档 dpr 2→1.5（1080p 下像素成本 -44%，肉眼几乎无差）
    const pr = q === 'high' ? Math.min(devicePixelRatio, 1.5) : q === 'medium' ? 1.25 : 1;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ── 世界构建：布景资产取 .scene（GLTF 包 → 场景）→ World 容器装配当前 mapId 地图（换图时整棵重建） ──
  _buildWorld() {
    const propScenes = {};
    for (const [k, g] of Object.entries(this._mapAssets)) {
      if (g && g.scene) propScenes[k] = g.scene;
    }
    const world = new World(this.scene, this.mapId, this.ui.settings.quality, propScenes, { ps: this.ps, effects: this.effects, audio });
    // 热成像：布景/地形注册背景热值（换图重建的新材质在此重新注入）
    this.thermal.registerObject(world.root);
    return world;
  }

  // ─────────── 资源加载 ───────────

  // 资源加载器：首屏与按需加载共用一个 GLTFLoader / DRACOLoader（解码器只初始化一次）
  _initAssetLoader() {
    if (this._assetLoader) return this._assetLoader;
    const manager = new THREE.LoadingManager();
    // 进度条只反映首屏；后续按需加载不再回写加载条
    manager.onProgress = (u, l, t) => {
      if (!this._firstScreenDone) this.ui.setLoadProgress(l / t);
    };
    const loader = new GLTFLoader(manager);
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./vendor/three/jsm/libs/draco/');
    loader.setDRACOLoader(dracoLoader);
    loader.register((parser) => new GLTFPBRSpecGlossExt(parser));
    this._assetLoader = loader;
    return loader;
  }

  // 惰性加载单台战车：并发去重 + 结果常驻缓存 + 失败后下次可重试
  // （只缓存已解析的 gltf.scene，不卸载；Tank 构造仍需各自 clone）
  ensureAsset(key) {
    if (this.assets[key]) return Promise.resolve(this.assets[key]);
    if (!TANKS[key]) return Promise.reject(new Error('未知战车: ' + key));
    const loader = this._initAssetLoader();
    let task = this._assetTasks.get(key);
    if (!task) {
      task = new Promise((res, rej) => {
        loader.load(TANKS[key].model, (g) => { this.assets[key] = g; res(g); }, undefined, rej);
      }).then(
        (g) => { this._assetTasks.delete(key); return g; },
        (e) => { this._assetTasks.delete(key); throw e; }
      );
      this._assetTasks.set(key, task);
    }
    return task;
  }

  ensureAssets(keys) {
    return Promise.all([...new Set(keys)].map((k) => this.ensureAsset(k)));
  }

  // 首屏：只等「6 件布景 + 默认展示车」，其余 19 辆按需加载（?eager=1 可回退全量预载）
  async _load() {
    const loader = this._initAssetLoader();
    // 布景资产：小镇套件 + 植被（两张地图共用；World 构建强依赖全部 6 件）
    this._mapAssets = {};
    const PROPS = { town_kit: 'houseModel/town_kit.glb', leaf_tree: 'houseModel/objects/leaf_tree.glb', pine_tree: 'houseModel/objects/pine_tree.glb', rock: 'houseModel/objects/rock.glb', rock2: 'houseModel/objects/rock2.glb', wood_log: 'houseModel/objects/wood_log.glb' };
    const propJobs = Object.entries(PROPS).map(([k, url]) =>
      new Promise((res) => loader.load(url, (g) => { this._mapAssets[k] = g; res(); }, undefined, res))
    );
    const defaultKey = (this.ui && this.ui.selectedTank) || 't-90m3';
    const tankJobs = this._lazyLoad
      ? [this.ensureAsset(defaultKey)]
      : Object.keys(TANKS).map((id) => this.ensureAsset(id));
    try {
      await Promise.all([...propJobs, ...tankJobs]);
    } catch (e) {
      console.error('模型加载失败', e);
      const el = document.querySelector('.load-text');
      if (el) el.textContent = '资源加载失败，请检查 model 目录';
      return;
    }
    this._firstScreenDone = true;
    // 世界就绪：装配首张地图 + 依赖世界的各系统
    this.world = this._buildWorld();
    this.shells = new ShellManager(this.scene, this.effects, audio, this.world);
    this.ui.initMinimap(this.world);
    this.visibility.world = this.world;
    this.visibility.obstacles = this.world.obstacles;
    this.smoke.world = this.world;
    this.ui.setLoadProgress(1);
    // 车库程序化构建（canvas 贴图 + PMREM 环境等一次性重活）在加载画面内完成，
    // 消除首次进入机库时的整段卡顿
    if (!this.garage) this.garage = new Garage(this.scene, this.renderer, this.ui.settings.quality);
    setTimeout(() => { this.ui.loadDone(); this._toCover(); }, 300);
    this._setupMenuShowcase();
  }

  // ─────────── 机库展示车（缓存复用 + 纹理预热，见 _startPrewarm） ───────────
  // 收起当前展示车：缓存车仅隐藏（保留显存资源供秒切），菜单车构建态销毁
  _parkShowcase() {
    if (!this.menuTank) return;
    if (this.menuTank._cachedShowcase) this.menuTank.root.visible = false;
    else { this.menuTank.dispose(); this.scene.remove(this.menuTank.root); }
    this.menuTank = null;
  }

  // 取/建缓存展示车（车库平地世界；LRU 上限 4 台，超出淘汰最久未用）
  _ensureHangarTank(key) {
    let t = this._hangarCache.get(key);
    if (t) {   // LRU touch
      this._hangarCache.delete(key);
      this._hangarCache.set(key, t);
      return t;
    }
    t = new Tank(TANKS[key], this.assets[key].scene.clone(true), this._garageWorld);
    t._cachedShowcase = true;
    t.place(0, 0, 0);
    t.root.visible = false;
    this.scene.add(t.root);
    this._hangarCache.set(key, t);
    while (this._hangarCache.size > 4) {
      let oldest = null;
      for (const [k, v] of this._hangarCache) {
        if (v !== this.menuTank) { oldest = [k, v]; break; }   // Map 迭代保插入序 = 最久未用
      }
      if (!oldest) break;
      this._hangarCache.delete(oldest[0]);
      this._prewarmed.delete(oldest[0]);
      oldest[1].dispose();
      this.scene.remove(oldest[1].root);
    }
    return t;
  }

  _setupMenuShowcase() {
    const key = (this.ui && this.ui.selectedTank) || 't-90m3';
    // 按需加载：资产未就绪时保留当前展示车，后台补齐后重建（_frame 对 menuTank 已判空）
    if (!this.assets[key]) {
      this.ensureAsset(key).then(() => {
        if (((this.ui && this.ui.selectedTank) || 't-90m3') === key) this._setupMenuShowcase();
      }).catch((e) => console.error('展示车加载失败', e));
      return;
    }
    this._parkShowcase();
    // 机库态优先复用缓存展示车（落在车库平地 y=0）；菜单态构建车落回战场地形
    if (this.garage && this.garage.visible) {
      const t = this._ensureHangarTank(key);
      t.root.visible = true;
      this.menuTank = t;
      // 静态阴影模式：换车后手动刷新一次阴影贴图
      this.renderer.shadowMap.needsUpdate = true;
    } else {
      this.menuTank = new Tank(TANKS[key], this.assets[key].scene.clone(true), this.world);
      this.menuTank.place(0, 0, 0);
      this.scene.add(this.menuTank.root);
    }
  }

  // 进机库：选中车可即时展示则直达；否则先立起机库屏幕，新车走分帧装载（全程不冻结）
  _enterHangarWithLoading() {
    const ready = this.garage && this._hangarCache.has(this.ui.selectedTank) &&
                  this._prewarmed.has(this.ui.selectedTank);
    if (ready) { this._enterHangar(); return; }
    this.ui.showHangarLoading(true, '载入机库…', 0);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.state = 'hangar';
      this.ui.show('hangar');
      if (!this.garage) this.garage = new Garage(this.scene, this.renderer, this.ui.settings.quality);
      this.garage.show();
      if (this.world) this.world.root.visible = false;      // 隐藏战场（含其全部光照）
      this.renderer.toneMappingExposure = 1.14;             // 车库室内曝光基调（减灯补亮后校准）
      this.renderer.setPixelRatio(1);                       // 机库态省 GPU：分辨率 1.0 + 静态阴影
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      this._initHangarControls();
      this.ui.refreshHangar(this.ui.selectedTank, TANKS[this.ui.selectedTank]);
      this.renderer.compile(this.scene, this.camera);       // 该车 shader 程序变体编译（多为缓存命中）
      this._loadTankThenShow(this.ui.selectedTank);
    }));
  }

  // ── 分帧装载展示车：构建+编译 → 每帧上传少量纹理（页面保持可动，浮标显示进度）──
  //    全部就绪后无缝换车（首帧即顺滑），替代旧的一次性 1-2s 冻结。
  // 按需加载：先确保该战车 GLB 就绪，再走原有分帧纹理预热（冷门车首切约 1s，浮标提示）
  async _loadTankThenShow(key) {
    if (!this.assets[key]) {
      this.ui.showHangarLoading(true, '载入坦克…', 0);
      try {
        await this.ensureAsset(key);
      } catch (e) {
        console.error('战车加载失败', e);
        this.ui.showHangarLoading(false);
        this._hangarBusy = false;
        return;
      }
      // 加载期间用户已切走或离开机库：放弃本次装载
      if (this.state !== 'hangar' || this.ui.selectedTank !== key) {
        this.ui.showHangarLoading(false);
        this._hangarBusy = false;
        return;
      }
    }
    this._prewarmSkip.delete(key);   // 该车已成功加载，恢复后台预热资格
    try {
      this._loadTankThenShowSync(key);
    } catch (e) {
      console.error('展示车构建失败', e);
      this.ui.showHangarLoading(false);
      this._hangarBusy = false;
    }
  }

  _loadTankThenShowSync(key) {
    const tank = this._ensureHangarTank(key);
    const list = this._collectTankTextures(tank);
    const total = Math.max(list.length, 1);
    const step = () => {
      if (this.state !== 'hangar' || this.menuTank === tank) {   // 离开机库/已在展示 → 终止
        this.ui.showHangarLoading(false);
        this._hangarBusy = false;
        return;
      }
      let n = 0;
      while (list.length && n < 4) {
        const tex = list.shift();
        this._prewarmTex.add(tex);
        this.renderer.initTexture(tex);
        n++;
      }
      if (list.length) {
        this.ui.showHangarLoading(true, '载入坦克…', 1 - list.length / total);
        requestAnimationFrame(step);
        return;
      }
      // 纹理就绪：无缝换车
      this._prewarmed.add(key);
      this._setupMenuShowcase();
      this.ui.refreshHangar(key, TANKS[key]);
      this.ui.showHangarLoading(false);
      this._hangarBusy = false;
      this._startPrewarm();
    };
    step();
  }

  // ── 展示车纹理预热：每帧上传少量纹理（initTexture），浏览机库期间后台完成，
  //    之后切到已预热车辆零卡顿。优先预建+预热当前车的左右邻（预测切换方向）。
  //    离开机库自动暂停，再次进入续跑；分帧装载期间让路。 ──
  _startPrewarm() {
    if (this._prewarming) return;
    this._prewarming = true;
    const step = () => {
      if (this.state !== 'hangar' || !this.garage || !this.garage.visible) { this._prewarming = false; return; }
      if (this._hangarBusy) { requestAnimationFrame(step); return; }   // 装载中让路
      // 候选：左右邻车（未缓存则预建）→ 其余缓存车
      const keys = Object.keys(TANKS);
      const cur = keys.indexOf(this.ui.selectedTank);
      const neighbors = [keys[(cur + 1) % keys.length], keys[(cur - 1 + keys.length) % keys.length]];
      let key = neighbors.find((k) => !this._prewarmed.has(k) && !this._prewarmSkip.has(k)) || null;
      if (!key) {
        for (const k of this._hangarCache.keys()) {
          if (!this._prewarmed.has(k) && !this._prewarmSkip.has(k)) { key = k; break; }
        }
      }
      if (!key) { this._prewarming = false; return; }
      // 按需加载：邻车 GLB 尚未下载时先静默预取，就绪后下一帧再预建/预热
      if (!this.assets[key]) {
        this.ensureAsset(key)
          .catch(() => this._prewarmSkip.add(key))
          .then(() => requestAnimationFrame(step));
        return;
      }
      if (!this._hangarCache.has(key)) this._ensureHangarTank(key);
      if (this._prewarmKey !== key) {
        this._prewarmKey = key;
        this._prewarmList = this._collectTankTextures(this._hangarCache.get(key));
      }
      let n = 0;
      while (this._prewarmList.length && n < 4) {
        const tex = this._prewarmList.shift();
        this._prewarmTex.add(tex);
        this.renderer.initTexture(tex);
        n++;
      }
      if (!this._prewarmList.length) this._prewarmed.add(key);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // 收集展示车用到的全部纹理（含履带 UV 滚动的克隆贴图）
  _collectTankTextures(tank) {
    const list = [];
    tank.model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'specularMap', 'alphaMap']) {
          const tex = m[k];
          if (tex && tex.isTexture && !this._prewarmTex.has(tex)) list.push(tex);
        }
      }
    });
    for (const tex of tank.trackMaterials || []) {
      if (!this._prewarmTex.has(tex)) list.push(tex);
    }
    return list;
  }

  // ─────────── 机库页（选车展示台：厂房车库场景） ───────────
  _enterHangar() {
    this.state = 'hangar';
    this.ui.show('hangar');
    // 程序化厂房车库（首帧构建 + PMREM 环境反射，之后常驻只切换可见性）
    if (!this.garage) this.garage = new Garage(this.scene, this.renderer, this.ui.settings.quality);
    this.garage.show();
    if (this.world) this.world.root.visible = false;      // 隐藏战场（含其全部光照）
    this.renderer.toneMappingExposure = 1.14;             // 车库室内曝光基调（减灯补亮后校准）
    // 机库态省 GPU：渲染分辨率降到 1.0（室内近景观感几乎无差）+ 静态阴影（展示车不动）
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this._setupMenuShowcase();
    this.ui.refreshHangar(this.ui.selectedTank, TANKS[this.ui.selectedTank]);
    this._initHangarControls();
    this._startPrewarm();
  }

  _cycleHangar(dir) {
    const keys = Object.keys(TANKS);
    let idx = keys.indexOf(this.ui.selectedTank);
    idx = (idx + dir + keys.length) % keys.length;
    this._selectHangarTank(keys[idx]);
  }

  // 直选坦克（下拉/翻页共用装载管线）：缓存+预热完成秒切，否则分帧装载
  _selectHangarTank(key) {
    if (this._hangarBusy || key === this.ui.selectedTank) return;   // 装载期间忽略连点
    if (!TANKS[key]) return;
    this.ui.selectedTank = key;
    if (this._hangarCache.has(key) && this._prewarmed.has(key)) {
      this._setupMenuShowcase();
      this.ui.refreshHangar(key, TANKS[key]);
      return;
    }
    this._hangarBusy = true;
    this.ui.showHangarLoading(true, '载入坦克…', 0);
    requestAnimationFrame(() => requestAnimationFrame(() => this._loadTankThenShow(key)));
  }

  _initHangarControls() {
    // 相机参数（首次初始化，后续保留用户调节值）
    if (this._camR === undefined) {
      this._camR = 8.20; this._camTheta = 0.730; this._camPhi = 0.350;
      this._camLookX = -0.40; this._camLookY = 2.50; this._camLookZ = 2.00; this._camYLift = 0.00;
    }
    this._drag = false; this._dragX = 0; this._dragY = 0;
    this._syncDebugPanel();
    if (this._hangarWired) return;
    this._hangarWired = true;
    const c = this.renderer.domElement;
    c.addEventListener('wheel', (e) => {
      if (this.state !== 'hangar') return;
      e.preventDefault();
      this._camR = THREE.MathUtils.clamp(this._camR + e.deltaY * 0.01, 3, 30);
      this._syncDebugPanel();
    }, { passive: false });
    c.addEventListener('mousedown', (e) => {
      if (this.state !== 'hangar') return;
      this._drag = true; this._dragX = e.clientX; this._dragY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this._drag || this.state !== 'hangar') return;
      this._camTheta -= (e.clientX - this._dragX) * 0.006;
      this._camPhi = THREE.MathUtils.clamp(this._camPhi + (e.clientY - this._dragY) * 0.005, -0.3, 1.2);
      this._dragX = e.clientX; this._dragY = e.clientY;
      this._syncDebugPanel();
    });
    window.addEventListener('mouseup', () => { this._drag = false; });
    // 调试面板滑块绑定
    const bind = (id, key, fmt) => {
      const el = document.getElementById(id);
      const val = document.getElementById(id + '-v');
      if (!el || !val) return;
      el.addEventListener('input', () => {
        this[key] = parseFloat(el.value);
        val.textContent = fmt(this[key]);
      });
    };
    bind('dbg-r', '_camR', v => v.toFixed(1));
    bind('dbg-theta', '_camTheta', v => v.toFixed(2));
    bind('dbg-phi', '_camPhi', v => v.toFixed(2));
    bind('dbg-lx', '_camLookX', v => v.toFixed(1));
    bind('dbg-ly', '_camLookY', v => v.toFixed(1));
    bind('dbg-lz', '_camLookZ', v => v.toFixed(1));
    bind('dbg-lift', '_camYLift', v => v.toFixed(1));
    const copyBtn = document.getElementById('dbg-copy');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const txt = `// 机库相机参数\n` +
        `_camR: ${this._camR.toFixed(2)}, _camTheta: ${this._camTheta.toFixed(3)}, _camPhi: ${this._camPhi.toFixed(3)},\n` +
        `_camLookX: ${this._camLookX.toFixed(2)}, _camLookY: ${this._camLookY.toFixed(2)}, _camLookZ: ${this._camLookZ.toFixed(2)}, _camYLift: ${this._camYLift.toFixed(2)}`;
      navigator.clipboard.writeText(txt).then(() => {
        copyBtn.textContent = '已复制!';
        setTimeout(() => copyBtn.textContent = '复制参数', 1200);
      }).catch(() => {
        console.log(txt); copyBtn.textContent = '见控制台';
        setTimeout(() => copyBtn.textContent = '复制参数', 1500);
      });
    });
  }

  _syncDebugPanel() {
    const sync = (id, key, fmt) => {
      const el = document.getElementById(id);
      const val = document.getElementById(id + '-v');
      if (el) el.value = this[key];
      if (val) val.textContent = fmt(this[key]);
    };
    sync('dbg-r', '_camR', v => v.toFixed(1));
    sync('dbg-theta', '_camTheta', v => v.toFixed(2));
    sync('dbg-phi', '_camPhi', v => v.toFixed(2));
    sync('dbg-lx', '_camLookX', v => v.toFixed(1));
    sync('dbg-ly', '_camLookY', v => v.toFixed(1));
    sync('dbg-lz', '_camLookZ', v => v.toFixed(1));
    sync('dbg-lift', '_camYLift', v => v.toFixed(1));
  }

  // ─────────── UI 绑定 / 状态机 ───────────
  _bindUI() {
    this.ui.bind({
      onCoverClick: () => { audio.init(); audio.playUIClick(); audio.applySettings(this._audioSettings()); audio.startMenuBGM(); this.state = 'menu'; this.ui.show('menu'); },
      onWarMode: () => { audio.playUIClick(); this._enterHangarWithLoading(); },
      onBackMenu: () => { audio.playUIClick(); this._endToMenu(); },
      onHangarPrev: () => { audio.playUIClick(); this._cycleHangar(-1); },
      onHangarNext: () => { audio.playUIClick(); this._cycleHangar(1); },
      onHangarSelect: (key) => { audio.playUIClick(); this._selectHangarTank(key); },
      onStartBattle: () => { audio.playUIClick(); this._startBattle().catch((e) => console.error('开战失败', e)); },
      onResultMenu: () => { audio.playUIClick(); this._endToMenu(); },
      onRetry: () => { audio.playUIClick(); this._startBattle().catch((e) => console.error('重试失败', e)); },
      onPauseResume: () => { audio.playUIClick(); this._resume(); },
      onPauseMenu: () => { audio.playUIClick(); this.paused = false; this._endToMenu(); },
      onSettingsChanged: (s) => {
        audio.applySettings(this._audioSettings());
        this._applyQuality();
      },
    });
    this.input.onKeyDown = (code) => {
      if (this.state === 'battle' && code === 'KeyC') this.rig.toggleOrbit();
      if (this.state === 'battle' && code === 'KeyG') this._firePlayerSmoke();
      if (this.state === 'battle' && code === 'Digit1') this._switchShellByCode('ap');
      if (this.state === 'battle' && code === 'Digit2') this._switchShellByCode('heat');
      if (this.state === 'battle' && code === 'Digit3') this._switchShellByCode('he');
      if (this.state === 'battle' && code === 'KeyR') this._useRepairKit();
      if (this.state === 'battle' && code === 'KeyT') this._useExtinguisher();
      if (this.state === 'battle' && code === 'KeyN') this._toggleThermal();
      if (this.state === 'battle' && code === 'Escape') {
        if (this.paused) this._resume(); else this._pause();
      }
    };
  }

  _toCover() {
    this.state = 'cover';
    this.ui.show('cover');
  }

  // UI 设置(0-100) → audio 设置
  _audioSettings() {
    const s = this.ui.settings;
    return { master: s.master / 100, sfx: s.sfx / 100, ambient: s.ambient / 100,
      bgmOn: s.bgmOn !== false, bgmVol: s.bgmVol ?? 50, bgmMode: s.bgmMode || 'normal' };
  }

  // ─────────── 战斗流程 ───────────
  // 按需加载：开战前先确保「玩家车 + 随机敌方车」两份 GLB 就绪（冷门车由浮标提示）
  async _startBattle() {
    if (this._startingBattle) return;
    this._startingBattle = true;
    const playerKey = this.ui.selectedTank || 't-90m3';
    const enemyKeys = Object.keys(TANKS).filter(k => k !== playerKey);
    const enemyKey = enemyKeys[Math.floor(Math.random() * enemyKeys.length)];
    const fromState = this.state;
    try {
      this.ui.showHangarLoading(true, '载入战场…', 0);
      await this.ensureAssets([playerKey, enemyKey]);
    } catch (e) {
      console.error('开战资源加载失败', e);
      this.ui.showHangarLoading(false);
      this._startingBattle = false;
      return;
    }
    // 等待期间用户已返回菜单/切到别的界面：放弃本次开战
    if (this.state !== fromState) {
      this.ui.showHangarLoading(false);
      this._startingBattle = false;
      return;
    }
    this._startingBattle = false;
    // 退出车库：还原战场可见性与光照（曝光稍后按地图基调设置）
    if (this.garage) this.garage.hide();
    if (this.world) this.world.root.visible = true;
    this._clearBattle();
    this.paused = false;
    this._hangarBusy = false;
    this.ui.showHangarLoading(false);   // 装载中途开战：撤除浮标（分帧装载循环会自行终止）
    this._parkShowcase();   // 缓存展示车仅隐藏（保留供下次秒切），菜单车销毁
    // 战场恢复动态阴影 + 画质档分辨率（机库态曾降为 1.0/静态）
    this.renderer.shadowMap.autoUpdate = true;
    this._applyQuality();

    // ── 换图重建世界（地图可切换：world.root 整棵移除重装配） ──
    let mapId = this.ui.settings.map || 'plains';
    if (!MAPS[mapId]) mapId = 'plains';   // 持久化选图残留兜底（如已移除的地图）
    if (mapId !== this.world.mapId) {
      this.world.dispose();
      this.mapId = mapId;
      this.world = this._buildWorld();
      this.shells.world = this.world;
      this.visibility.world = this.world;
      this.visibility.obstacles = this.world.obstacles;
      this.smoke.world = this.world;
      this.ui.minimap = null;
      this.ui.initMinimap(this.world);
    }
    // 地图曝光基调（小镇 1.12 午后 / 平原 1.28）
    this.renderer.toneMappingExposure = (this.world.map.exposure != null) ? this.world.map.exposure : 1.28;

    // 玩家 / 敌方 key 已在开战前确定（用于按需加载）
    this.enemyName = TANKS[enemyKey].name;

    // ── 随机出生方位（平原 1300m 对峙；超出 1000m 观察距离 → 开局互盲推进接触）──
    // 小镇图：沿十字公路南北对峙（±700m 公路走廊，1400m 对峙开局互盲）
    let pSpawn = [0, -650], eSpawn = [40, 650];
    if (this.world.mapId === 'town') {
      pSpawn = [0, -700]; eSpawn = [0, 700];
    } else {
      const ang = Math.random() * Math.PI * 2;
      const eAng = ang + Math.PI + (Math.random() - 0.5) * 0.25;
      pSpawn = [Math.sin(ang) * 650, Math.cos(ang) * 650];
      eSpawn = [Math.sin(eAng) * 650, Math.cos(eAng) * 650];
    }

    this.player = new Tank(TANKS[playerKey], this.assets[playerKey].scene.clone(true), this.world);
    this.player.isPlayer = true;
    this.player.place(pSpawn[0], pSpawn[1], THREE.MathUtils.radToDeg(Math.atan2(eSpawn[0] - pSpawn[0], eSpawn[1] - pSpawn[1])));
    this.scene.add(this.player.root);

    const enemy = new Tank(TANKS[enemyKey], this.assets[enemyKey].scene.clone(true), this.world);
    enemy.place(eSpawn[0], eSpawn[1], THREE.MathUtils.radToDeg(Math.atan2(pSpawn[0] - eSpawn[0], pSpawn[1] - eSpawn[1])));
    this.scene.add(enemy.root);
    this.enemies = [enemy];

    // 热成像：注册双方坦克热值（材质逐网格克隆，注入安全）；重置 IR 开关
    this.thermal.registerTank(this.player);
    this.thermal.registerTank(enemy);
    this.irOn = false;
    this.player.thermalOn = false;
    // AI 难度来自机库页选择
    this.ais = [new TankAI(enemy, this.ui.aiDifficulty)];
    this.ais[0].onFire = (t) => this.visibility.onFire(t, [this.player, ...this.enemies]);
    // AI 机枪命中我方外露子系统 → hitLog（红）/ 飘字（label 的"敌"换"我方"视角）
    this.ais[0].onMGHit = (label, point) => {
      const mine = label.replace('敌', '我方');
      this.ui.hitLog(mine, 'bad');
      this.ui.floatDamage(point, mine, 'mod-module');
    };
    // AI 激光锁定状态 → 玩家侧「被激光测距定位」告警框
    this.ais[0].onLase = (on) => { this._laseWarn = on; };
    this._laseWarn = false;

    // 爆反板满值（HUD 显示比例用）
    this._eraPlatesMax = this.player.era ? {
      front: (this.player.era.plates.turretFront || 0) + (this.player.era.plates.hullFront || 0),
      side: (this.player.era.plates.turretSide || 0) + (this.player.era.plates.hullSide || 0),
    } : null;

    // 履带印系统（每场战斗重建，清空旧印）
    this.trackMarks = new TrackMarks(this.scene, this.world);

    this.shells.tanks = [this.player, ...this.enemies];
    this.shells.onEnemyHit = (label, dmg, killed, worldPos, events, blockedDmg) => {
      this.playerHits++;
      this.ui.hitMarker(killed);
      this.ui.penMarker(label);
      if (dmg > 0 && worldPos) this.ui.floatDamage(worldPos, `-${dmg}`, killed ? 'kill' : '');
      // 战绩统计
      if (dmg > 0) this.dmgDealt += dmg;
      if (blockedDmg > 0) this.blocked += Math.round(blockedDmg);
      if (events) this.moduleHits += events.filter((ev) => ev.type === 'module' || ev.type === 'fire').length;
      // 模块事件飘字（敌车断履带/起火等对玩家有战术价值）
      if (events && worldPos) for (const ev of events) this._floatModuleEvent(worldPos, ev);
      // hitlog：我方战果（模块事件取 ev.label，如 履带断裂/油箱起火）
      const tgt = this._enemyNameAt(worldPos);
      if (label.startsWith('跳弹')) this.ui.hitLog('跳弹', 'good');
      else if (label.startsWith('未能击穿')) this.ui.hitLog('未击穿', 'good');
      else if (label.startsWith('炮弹被拦截')) this.ui.hitLog('被敌方拦截！', 'bad');
      else if (label.startsWith('拦截失败')) this.ui.hitLog('敌拦截失败·弹芯突防', 'good');
      else if (label === '弹药殉爆！') this.ui.hitLog('殉爆！', 'good');
      else if (killed) this.ui.hitLog(`击毁 ${tgt}`, 'good');
      else if (dmg > 0) this.ui.hitLog(`击穿 ${tgt} ${dmg}`, 'good');
      if (events) for (const ev of events) {
        if (ev.type === 'module' || ev.type === 'fire' || ev.type === 'era') this.ui.hitLog(ev.label, 'good');
        if (ev.type === 'era') this.eraStrips++;
      }
      if (killed) {
        this.ui.message(label === '弹药殉爆！' ? '弹药殉爆！目标歼灭' : '敌方坦克被摧毁！');
        audio.stopFire();
      }
    };
    this.shells.onPlayerHit = (type, dir, out, events) => {
      if (type === 'pen') {
        this.ui.damageFlash(0.9);
        this.rig.addShake(0.8);
        // 受击方向（相对观瞄方向）
        const shellYaw = Math.atan2(dir.x, dir.z);
        this.ui.damageFrom(this.rig.aimYaw - shellYaw + Math.PI);
        // 自身模块事件飘字（飘在炮塔上方）
        if (events) {
          _v1.copy(this.player.root.position); _v1.y += 2.6;
          for (const ev of events) this._floatModuleEvent(_v1, ev);
        }
        // hitlog：我方受创
        this.ui.hitLog(`被击穿 -${out.damage}`, 'bad');
        if (events) for (const ev of events) {
          if (ev.type === 'fire') this.ui.hitLog('起火！', 'bad');
          else if (ev.type === 'module') this.ui.hitLog(ev.label === '履带断裂' ? '被断履带' : `被${ev.label}`, 'bad');
          else if (ev.type === 'ammo_boom') this.ui.hitLog('殉爆！', 'bad');
        }
        if (this.player.destroyed) this._onDefeat();
      } else {
        this.ui.damageFlash(0.35);
        this.rig.addShake(0.25);
      }
    };
    // 玩家 APS 拦截结果（敌方炮弹进入拦截窗）
    this.shells.onAPSIntercept = (effective) => {
      if (effective) {
        this.apsIntercepts++;
        this.ui.hitLog('主动防御拦截成功！', 'good');
        this.ui.message('Trophy 拦截来袭炮弹');
      } else {
        this.ui.hitLog('主动防御拦截失败！', 'bad');
      }
    };

    this.battleTime = 0;
    this.playerShots = 0;
    this.playerHits = 0;
    this.dmgDealt = 0;
    this.blocked = 0;
    this.moduleHits = 0;
    this.eraStrips = 0;        // 我方剥落敌方爆反板数
    this.subsysHits = 0;       // 我方机枪毁伤敌方外露传感器次数
    this.apsIntercepts = 0;    // 我方 APS 成功拦截次数
    this._endByTimeout = false;
    this.throttleSmooth = 0;
    this.steerSmooth = 0;
    this.endTimer = -1;
    this._mgBurstTimer = 0;
    this._mgBurstCount = 0;
    this._mgCoolTimer = 0;

    this.rig.attach(this.player);

    // 可破坏系统接线：炮弹命中布景（shell.js 钩子）+ 音效距离衰减参考（玩家）
    this.world.onShellHitDestructible = (prev, pos, s) => this.world.destructibles.shellHit(prev, pos, s);
    this.world.destructibles.listener = this.player;

    // 重置点亮 & 烟雾系统
    this.visibility.dispose();
    this.smoke.dispose();

    this.state = 'battle';
    this.ui.show('hud');
    this.input.enabled = true;
    this.input.requestLock();
    // 战斗 BGM：标准模式立即播放；个性化模式等玩家首次按 W（开始机动）再播
    audio.stopBGM();
    if (this.ui.settings.bgmMode === 'personal') this._bgmPending = true;
    else { this._bgmPending = false; audio.startBattleBGM(this.player.cfg); }
    audio.loadExtSounds(this.player.cfg).then(() => audio.startEngine());
    audio.loadSmokeSounds();
    this.ui.buildAmmoPanel(this.player);
    this.ui.buildReticle(this.player.cfg.reticle);   // 按坦克生成本局狙击镜分划（六国风格）
    // 弹药面板交互：点击卡片切弹种 / 点击 AUTO 切机枪自动射击（与数字键/M 键同路径）
    this.ui.onShellSelect = (type) => this._switchShellByCode(type);
    this.ui.onMgAutoToggle = () => this._toggleMgAuto();
    this.ui.updateSmoke(this.player.smokeAmmo, 3);
    this.ui.updateConsumables(this.player);
    this.ui.message('歼灭所有敌方坦克');
  }

  _clearBattle() {
    this.irOn = false;
    for (const t of [this.player, ...this.enemies]) {
      if (t) { t.dispose(); this.scene.remove(t.root); }
    }
    this.player = null;
    this.enemies = [];
    this.ais = [];
    if (this.trackMarks) { this.trackMarks.dispose(); this.trackMarks = null; }
    if (this.shells) { this.shells.clear(); this.shells.tanks = []; }   // 防御：资产未就绪时提前退出战斗
    this.ui.clearMarkers();
    this.ui.setScope(false);
    audio.stopFire();
    this.visibility.dispose();
    this.smoke.dispose();
  }

  _onDefeat() {
    audio.stopEngine();
    audio.stopMGLoop();
    this._prevMgFire = false;
    this.rig.setAimMode(false);
    if (this.player) this.player.root.visible = true;
    this.endTimer = 2.2;
    this._pendingResult = false;
  }

  // 防护体系 HUD 数据：爆反板余量（前/侧合计）/ APS 拦截弹+雷达档 / 观瞄档（0完好 1损伤 2损毁）
  _protInfo(p) {
    const out = {};
    if (p.era) {
      out.era = {
        front: (p.era.plates.turretFront || 0) + (p.era.plates.hullFront || 0),
        side: (p.era.plates.turretSide || 0) + (p.era.plates.hullSide || 0),
        maxFront: (this._eraPlatesMax?.front ?? 0),
        maxSide: (this._eraPlatesMax?.side ?? 0),
      };
    }
    if (p.aps) {
      const R = p.aps.rules;
      out.aps = {
        charges: p.aps.charges,
        chargesMax: R.charges,
        cooldown: p.aps.cooldown,
        radar: R.radarHp > 0 ? (p.aps.radarHp <= 0 ? 2 : (p.aps.radarHp < R.radarHp * 0.5 ? 1 : 0)) : -1,   // -1 = 分布式传感无雷达
      };
    }
    if (p.lws) {
      out.lws = {
        cooldown: p.lws.cooldown,
        emitter: p.lws.emitterHp <= 0 ? 2 : (p.lws.emitterHp < LWS_RULES.emitterHp * 0.5 ? 1 : 0),
      };
    }
    out.optics = p.optics.hp <= 0 ? 2 : (p.optics.hp < SENSOR_RULES.opticsHp * 0.5 ? 1 : 0);
    return out;
  }

  // 模块事件飘字配色：履带断裂蓝 / 起火红 / 其他模块橙
  _floatModuleEvent(worldPos, ev) {
    if (ev.type !== 'module' && ev.type !== 'fire') return;
    const cls = ev.type === 'fire' ? 'mod-fire'
      : ev.label.includes('履带') ? 'mod-track' : 'mod-module';
    this.ui.floatDamage(worldPos, ev.label, cls);
  }

  // hitlog 用：按命中点找最近的敌车，取其型号名（onEnemyHit 回调不带目标引用）
  _enemyNameAt(worldPos) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      const d = worldPos ? e.root.position.distanceTo(worldPos) : 0;
      if (d < bd) { bd = d; best = e; }
    }
    return best ? best.cfg.name : '';
  }

  // ── 玩家发射烟雾弹（G 键，每次发射4发弹体） ──
  _firePlayerSmoke() {
    const p = this.player;
    if (!p || p.destroyed) return;
    if (p.smokeAmmo <= 0) { this.ui.message('烟雾弹已耗尽'); return; }
    if (p.smokeCooldown > 0) return;
    if (this.smoke.fire(p)) {
      p.smokeAmmo--;
      p.smokeCooldown = 2;
      this.ui.updateSmoke(p.smokeAmmo, 3);
      this.ui.message(`烟雾弹发射 (${p.smokeAmmo} 次剩余)`);
      audio.playSmokeLaunch();
    }
  }

  // ── 切换弹种（1/2/3 键：AP/HEAT/HE，重置装填） ──
  _switchShellByCode(type) {
    const p = this.player;
    if (!p || p.destroyed) return;
    const def = SHELL_TYPES[type];
    if (!def || p.shellType === type) return;
    if (p.shellPool[type] <= 0) { this.ui.message(`${def.full}已耗尽`); return; }
    if (p.switchShell(type)) {
      this.ui.message(`切换 ${def.full} ${def.name}`);
      this.ui.penMarker(`${def.name} 装填中…`);
    }
  }

  // 机枪自动射击开关（M 键 / 弹药面板 AUTO 点击共用）
  _toggleMgAuto() {
    const p = this.player;
    if (!p || p.destroyed) return;
    p.mgAuto = !p.mgAuto;
    this.ui.message(p.mgAuto ? '机枪自动射击' : '机枪关闭');
  }

  // ── 消耗品（R 维修包 / T 灭火器，每场各 1） ──
  _useRepairKit() {
    const p = this.player;
    if (!p || p.destroyed) return;
    if (p.consumables.repair <= 0) { this.ui.message('维修包已用完'); return; }
    if (p.useRepairKit()) {
      this.ui.message('维修包：模块已修复');
      this.ui.updateConsumables(p);
    } else this.ui.message('无受损模块');
  }
  _useExtinguisher() {
    const p = this.player;
    if (!p || p.destroyed) return;
    if (p.consumables.ext <= 0) { this.ui.message('灭火器已用完'); return; }
    if (p.useExtinguisher()) {
      this.ui.message('灭火器：火焰已扑灭');
      this.ui.updateConsumables(p);
    } else this.ui.message('未起火');
  }

  // ── 热像仪切换（N 键：仅热像装备车 + 开镜状态；关镜自动关闭） ──
  _toggleThermal() {
    const p = this.player;
    if (!p || p.destroyed) return;
    if (!p.cfg.thermal) { this.ui.message('本车未装备热成像瞄具'); return; }
    if (!this.rig.aiming) { this.ui.message('热像仪：需先进入瞄准镜'); return; }
    this.irOn = !this.irOn;
    p.thermalOn = this.irOn;   // visibility 穿烟豁免标记
    this.ui.message(this.irOn ? '热像仪开启 · 可穿透烟雾' : '热像仪关闭');
  }

  _onVictory() {
    this.endTimer = 2.0;
    this._pendingResult = true;
  }

  // ── 超时判定：按剩余血量百分比定胜负（相等为平局） ──
  _onTimeout() {
    const p = this.player;
    const enemy = this.enemies.find((e) => !e.destroyed);
    const myFrac = p.hp / p.maxHp;
    const enFrac = enemy ? enemy.hp / enemy.maxHp : 0;
    this._endByTimeout = true;
    if (myFrac > enFrac + 0.001) {
      this.ui.message('时限已到 · 你保存了更多战力');
      this._onVictory();
    } else if (myFrac < enFrac - 0.001) {
      this.ui.message('时限已到 · 敌方保存了更多战力');
      this._onDefeat();
    } else {
      this.ui.message('时限已到 · 势均力敌');
      this.endTimer = 2.0;
      this._pendingResult = null;   // null = 平局
    }
  }

  _finishBattle(victory) {
    this.state = 'result';
    this.input.enabled = false;
    this.input.releaseLock();
    this._bgmPending = false;
    audio.stopEngine();
    audio.stopMGLoop();
    audio.startMenuBGM();   // 结算回菜单曲
    this._prevMgFire = false;
    const acc = this.playerShots > 0 ? Math.round(this.playerHits / this.playerShots * 100) : 0;
    const timeUsed = this._endByTimeout ? GAME.timeLimit : this.battleTime;
    this.ui.result(victory, `
      战斗用时：${timeUsed.toFixed(0)} 秒${this._endByTimeout ? '（超时判定）' : ''}<br>
      射击 ${this.playerShots} 发 · 命中 ${this.playerHits} 发 · 命中率 ${acc}%<br>
      总伤害 ${this.dmgDealt} · 阻挡伤害 ${this.blocked} · 模块战果 ${this.moduleHits} 处<br>
      爆反剥落 ${this.eraStrips} 块 · 传感器毁伤 ${this.subsysHits} 处 · APS 拦截 ${this.apsIntercepts} 发<br>
      ${victory === null ? '势均力敌，握手言和。'
        : victory ? (this._endByTimeout ? '时限已到，你保存了更多战力，判定获胜。'
            : `敌方 ${this.enemyName || '坦克'} 已被歼灭，战场属于你。`)
        : `你的 ${this.player ? this.player.cfg.name : '坦克'} 被击毁了。`}
    `);
  }

  _endToMenu() {
    // 退出车库：还原战场（可见性 + 地图曝光基调 + 画质档分辨率/动态阴影），菜单展示车重新落回地形
    if (this.garage) this.garage.hide();
    this.renderer.shadowMap.autoUpdate = true;
    this._applyQuality();
    if (this.world) {
      this.world.root.visible = true;
      this.renderer.toneMappingExposure = (this.world.map.exposure != null) ? this.world.map.exposure : 1.28;
    }
    this._clearBattle();
    this._setupMenuShowcase();
    this.input.aiming = false;          // 复位开镜闩锁
    this.state = 'menu';
    this.ui.show('menu');
    audio.startMenuBGM();
  }

  _pause() {
    this.paused = true;
    this.input.aiming = false;          // 复位开镜闩锁（防暂停残留）
    this.input.releaseLock();
    audio.stopEngine();
    audio.stopMGLoop();
    audio.pauseBGM();
    this._prevMgFire = false;
    this.ui.show('pause');
  }

  _resume() {
    this.paused = false;
    audio.resumeBGM();
    this.ui.show('hud');
  }

  // ─────────── 玩家操控（WoT/WT 式手感） ───────────
  _playerControl(dt) {
    const p = this.player, input = this.input;
    if (!p) return;

    // ── 个性化 BGM：玩家首次按 W 开始机动时触发 ──
    if (this._bgmPending && (input.key('KeyW') || input.key('ArrowUp'))) {
      this._bgmPending = false;
      audio.startBattleBGM(p.cfg);
    }

    // ── 油门（压下行程平滑 + 惯性滑行） ──
    let throttle = 0, steer = 0;
    if (input.key('KeyW') || input.key('ArrowUp')) throttle += 1;
    if (input.key('KeyS') || input.key('ArrowDown')) throttle -= 1;
    // steer 正 = 左转（A 正 D 负）
    if (input.key('KeyA') || input.key('ArrowLeft')) steer += 1;
    if (input.key('KeyD') || input.key('ArrowRight')) steer -= 1;
    this.throttleSmooth = damp(this.throttleSmooth, throttle, 5, dt);
    if (Math.abs(this.throttleSmooth) < 0.02 && throttle === 0) this.throttleSmooth = 0;
    this.steerSmooth = damp(this.steerSmooth, steer, 5, dt);

    // ── 观瞄（鼠标）；镜内灵敏度随变倍降低 ──
    const sens = this.rig.aiming ? 0.00095 / this.rig.zoomMag : 0.0021;
    const { dx, dy, wheel } = input.consumeMouse();
    this.rig.addAim(dx * sens, dy * sens);
    if (wheel !== 0) {
      if (this.rig.aiming) this.rig.zoomAim(wheel);
      else this.rig.zoom(wheel);
    }
    // ── 开镜控制（闩锁式）：Shift 按一下开镜/再按关镜（左右 Shift 均可，按下沿触发）──
    // 右键：镜内点击 = 循环切炮长镜物理 2 档（3×→10×→3×），镜外无效；滚轮自由变倍不受档位影响
    if (input.consumeShiftToggle()) input.aiming = !input.aiming;
    if (input.consumeRmb() && this.rig.aiming) this.rig.cycleZoomSteps();
    this.rig.setAimMode(input.aiming);
    // 关镜自动关热像（IR 仅镜内有效）
    if (this.irOn && !this.rig.aiming) { this.irOn = false; p.thermalOn = false; }

    if (p.destroyed) { p.drive(dt, 0, 0, true); return; }

    p.drive(dt, clamp(this.throttleSmooth, -1, 1), clamp(this.steerSmooth, -1, 1), input.key('Space'));

    // 炮塔伺服追踪准星目标点（含弹道补偿）
    p.aimAt(this.rig.aimTarget);
    p.updateTurret(dt);

    // ── 机枪：M 切换自动射击（200m 内最近敌，车长塔独立伺服）；F 手动沿机枪朝向；无伤害 ──
    if (p.cfg.mg && p.mgGroup) {
      const mHeld = input.key('KeyM');
      if (mHeld && !this._mgLatch) this._toggleMgAuto();
      this._mgLatch = mHeld;
      p.mgTimer -= dt;
      let mgFire = false, mgAimPt = null, mgTgt = null;
      if (input.key('KeyF')) { mgFire = true; mgAimPt = null; }   // 手动：沿机枪当前朝向
      else if (p.mgAuto) {
        let tgt = null, bestD = Infinity;
        for (const e of this.enemies) {
          if (e.destroyed || !e.spotted) continue;   // 未点亮目标：自动机枪不索敌不开火
          const d = e.pos.distanceTo(p.pos);
          if (d < bestD && d <= p.cfg.mg.range) { bestD = d; tgt = e; }
        }
        mgTgt = tgt;
        if (tgt) {
          _v1.copy(tgt.pos); _v1.y += 1.5; mgAimPt = _v1;
          p.updateMgTurret(dt, mgAimPt);
          if (p.cfg.mg.burstMin) {
            // 按发数连射：3~5发 → 停 1~1.5s
            if (this._mgCoolTimer > 0) {
              this._mgCoolTimer -= dt;
            } else {
              if (this._mgBurstCount <= 0) {
                this._mgBurstCount = p.cfg.mg.burstMin + Math.floor(Math.random() * (p.cfg.mg.burstMax - p.cfg.mg.burstMin + 1));
              }
              mgFire = true;
            }
          } else {
            // 冷却循环：连射 2~3s → 停 1~2s
            if (this._mgCoolTimer > 0) {
              this._mgCoolTimer -= dt;
            } else {
              if (this._mgBurstTimer <= 0) this._mgBurstTimer = 2 + Math.random();
              this._mgBurstTimer -= dt;
              if (this._mgBurstTimer <= 0) this._mgCoolTimer = 1 + Math.random();
              else mgFire = true;
            }
          }
        }
      }
      // 外部机枪循环音效：射击起停
      if (mgFire && !this._prevMgFire) audio.startMGLoop();
      if (!mgFire && this._prevMgFire) audio.stopMGLoop();
      this._prevMgFire = mgFire;
      // 自动模式：目标不在视野内（地形/烟雾遮挡，含点亮保持期）→ 机枪暂停
      if (mgFire && p.mgAuto && mgTgt && !this.visibility.canSee(p, mgTgt)) mgFire = false;
      if (mgFire && p.mgTimer <= 0 && p.mgAmmo > 0) {
        p.mgTimer = 1 / p.cfg.mg.rate;
        p.mgAmmo--;
        if (p.cfg.mg.burstMin) {
          this._mgBurstCount--;
          if (this._mgBurstCount <= 0) {
            this._mgCoolTimer = p.cfg.mg.pauseMin + Math.random() * (p.cfg.mg.pauseMax - p.cfg.mg.pauseMin);
          }
        }
        p.getMgMuzzle(_v2, _v3, mgAimPt);
        const dd = p.cfg.mg.dispersion;
        _v3.x += (Math.random() * 2 - 1) * dd; _v3.y += (Math.random() * 2 - 1) * dd; _v3.z += (Math.random() * 2 - 1) * dd;
        _v3.normalize();
        this.effects.mgTracer(_v2, _v3, p.cfg.mg.range);
        this.effects.mgMuzzleFlash(_v2, _v3);
        audio.playMG();
        // 抛壳：机枪中后部，向上抬高0.2m
        _v1.copy(_v2).addScaledVector(_v3, -0.6);
        _v1.y += 0.2;
        this.effects.ejectCasing(_v1, _v3, p.cfg.mg.casingType || 'mg');
        // hitscan 命中检测：外露子系统毁伤（爆反/雷达/观瞄，永不伤 HP）
        for (const e of this.enemies) {
          if (e.destroyed) continue;
          const c = _v4.copy(e.root.position); c.y += e.cfg.dims.hullHeight * 0.7;
          const r = Math.max(e.cfg.dims.length, e.cfg.dims.width) * 0.42 + 0.6;
          _v5.copy(_v2).addScaledVector(_v3, p.cfg.mg.range).sub(_v2);
          const len = _v5.length(); _v5.divideScalar(len);
          _v1.copy(c).sub(_v2);
          const t = clamp(_v1.dot(_v5), 0, len);
          _v1.copy(_v2).addScaledVector(_v5, t);
          if (_v1.distanceToSquared(c) < r * r) {
            this.effects.gunImpact(_v1, _v3, p.mgCaliber);
            // 距离衰减：命中率系数（未过 = 打在无害部位）+ 毁伤系数
            const hitDist = _v2.distanceTo(_v1);
            const [hitK, dmgK] = mgFalloff(hitDist);
            if (hitK > 0 && Math.random() < hitK) {
              const mgh = e.resolveHitZone(_v1, _v3);   // 命中区（决定剥哪区爆反板）
              const evs = e.applyMGDamage(mgh.zone, dmgK, p.mgCaliber);
              for (const ev of evs) {
                this.ui.hitLog(ev.label, 'good');
                this.subsysHits++;
                this.ui.floatDamage(_v1, ev.label, 'mod-module');
              }
            }
            break;
          }
        }
      }
    }
    p.updateFireControl(dt);
    if (p.smokeCooldown > 0) p.smokeCooldown -= dt;

    // 开火
    if (input.consumeFire()) {
      if (p.readyToFire()) {
        const shot = p.fire();
        this.shells.fire(shot);
        // 炮口横向（制退器侧瓣/侧向云方向）
        _v2.crossVectors(shot.dir, _up);
        if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
        this.effects.muzzleBlast(shot.pos, shot.dir, _v2.normalize());
        this.visibility.onFire(this.player, [this.player, ...this.enemies]);   // 开火暴露对称：1400m 内敌方点亮玩家 3s
        this.rig.addShake(0.5);
        this.rig.addRecoil(1);
        if (this.rig.aiming) { this.rig.addAimKick(0.009); this.ui.scopeFlash(); }   // 狙击镜内开火上跳（现代火控防抖：0.022→0.009）+ 白闪
        audio.playFire(1, this.rig.aiming);
        this.playerShots++;
        this.visibility.onFire(this.player, [this.player, ...this.enemies]);
        // 炮弹抛壳：炮塔顶部靠后，延迟0.8-1.2秒
        {
          const ep = new THREE.Vector3().copy(p.root.position);
          ep.y += p.cfg.dims.turretTop + 0.3;
          ep.addScaledVector(shot.dir, -1.0);
          const ed = shot.dir.clone();
          const es = _v2.clone();
          setTimeout(() => { this.effects.ejectCasing(ep, ed, 'cannon', es); }, 800 + Math.random() * 400);
        }
      } else {
        this.ui.penMarker('装填中…');
      }
    }
    // 装填完成提示音
    const reloading = p.reload > 0;
    if (this.prevReloading && !reloading) audio.playReloaded();
    this.prevReloading = reloading;

    // 发动机音随转速
    const rpm = Math.min(Math.abs(p.speed) / p.cfg.maxSpeedForward + Math.abs(throttle) * 0.25, 1);
    audio.setEngine(rpm, Math.abs(throttle));
  }

  // ─────────── 测距：相机中心射线 → 敌坦 / 地形 ───────────
  _updateRanging() {
    this.aimDist = null;
    this.aimTargetTank = null;
    if (!this.player) return;
    const origin = this.camera.position;
    const dir = this.rig.aimDirection(this.rayDir);
    let best = 1600;
    // 敌坦求交（精确）
    this.raycaster.set(origin, dir);
    for (const e of this.enemies) {
      if (e.destroyed) continue;
      const hits = this.raycaster.intersectObject(e.root, true);
      if (hits.length && hits[0].distance < best) {
        best = hits[0].distance;
        this.aimTargetTank = e;
      }
    }
    // 地形步进（廉价，避免对高密度地面做三角形求交）
    for (let d = 12; d < best; d += 3) {
      _v1.copy(origin).addScaledVector(dir, d);
      if (_v1.y < this.world.groundY(_v1.x, _v1.z)) { best = d; break; }
    }
    if (best < 1600) {
      this.rig.aimTarget.copy(origin).addScaledVector(dir, best);
      this.aimDist = best;
    } else {
      this.rig.aimTarget.copy(this.rig.farPoint);
    }
  }

  // ─────────── 激光告警/压制（99A·JD-3 / T-90 系·Shtora-1） ───────────
  // 双向触发前提：玩家开镜瞄准 + 准星命中目标 + 视线通畅 + 目标处于射手炮塔正面 ±110° 扇区
  _updateLaser(dt) {
    const p = this.player;
    if (!p || p.destroyed) {
      this.ui.setLaseWarn(false);
      this.ui.setLaserSuppress(0);
      this.ui.setLaserBlind(0);
      return;
    }
    // ① 激光告警框：AI 炮塔锁定玩家期间显示（敌全灭时强制熄灭防残留）
    const warn = this._laseWarn && this.enemies.some((e) => !e.destroyed);
    this.ui.setLaseWarn(warn);
    // ② 压制触发：每 10s 一次（冷却在 tank.update 倒计时；目标被压制中不叠加）
    if (this.rig.aiming && this.aimTargetTank && !this.aimTargetTank.destroyed &&
        this.visibility.canSee(p, this.aimTargetTank)) {
      const e = this.aimTargetTank;
      // 敌方压制器反击 → 玩家镜内白屏（时长随 AI 难度）
      if (e.lws && this._laserCovered(e, p) &&
          e.tryLaserSuppress(p, LWS_RULES.blindTime * (this.ais[0] ? this.ais[0].diff.laserBlindMul : 1))) {
        this.ui.hitLog('被激光压制！观瞄致盲', 'bad');
      }
      // 我方压制器反击 → 敌 AI 停瞄准射击窗口
      if (p.lws && this._laserCovered(p, e) && p.tryLaserSuppress(e)) {
        this.ui.hitLog('激光压制：敌观瞄致盲', 'good');
      }
    }
    // ③ HUD：镜内白幕倒计时 + 「激光压制中」提示（取存活敌方的最大压制窗口）
    this.ui.setLaserBlind(p.suppressT);
    let suppT = 0;
    for (const e of this.enemies) if (!e.destroyed && e.suppressT > suppT) suppT = e.suppressT;
    this.ui.setLaserSuppress(suppT);
  }

  // 压制器扇区判定：目标方位与射手炮塔世界朝向夹角 ≤ ±110°（绕侧/绕后失效）
  _laserCovered(shooter, target) {
    const dirYaw = Math.atan2(target.pos.x - shooter.pos.x, target.pos.z - shooter.pos.z);
    const turretYaw = shooter.turretYaw + shooter.heading + (shooter.modelYaw || 0);
    return Math.abs(wrapAngle(dirYaw - turretYaw)) <= LWS_RULES.sector;
  }

  // ─────────── 菜单/机库展示机位 ───────────
  _menuCamera(dt) {
    if (this.state === 'hangar') {
      // 兜底：hangar 态渲染帧先于 _initHangarControls 时补默认机位（防 lookAt(undefined) 偶发竞态）
      if (this._camR === undefined) {
        this._camR = 8.20; this._camTheta = 0.730; this._camPhi = 0.350;
        this._camLookX = -0.40; this._camLookY = 2.50; this._camLookZ = 2.00; this._camYLift = 0.00;
      }
      // 机库页：球坐标机位（用户可拖拽旋转 + 滚轮缩放）
      const r = this._camR, t = this._camTheta, p = this._camPhi;
      this.camera.position.x = r * Math.cos(p) * Math.sin(t);
      this.camera.position.y = r * Math.sin(p) + this._camYLift;
      this.camera.position.z = r * Math.cos(p) * Math.cos(t);
      this.camera.lookAt(this._camLookX, this._camLookY, this._camLookZ);
    } else {
      // 主菜单：自动旋转 + 坦克偏右
      this.menuAngle += dt * 0.1;
      const cx = Math.sin(this.menuAngle) * 7, cz = Math.cos(this.menuAngle) * 7;
      this.camera.position.set(cx, 5.5 + Math.sin(this.menuAngle * 2.3) * 0.5, cz);
      const _f = new THREE.Vector3(0, 1.0, 0).sub(this.camera.position).normalize();
      const _r = new THREE.Vector3().crossVectors(_f, new THREE.Vector3(0, 1, 0)).normalize();
      this.camera.lookAt(_r.multiplyScalar(-2.8).add(new THREE.Vector3(0, 1.0, 0)));
    }
    if (Math.abs(this.camera.fov - CAMERA.fov) > 0.1) {
      this.camera.fov = CAMERA.fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.world) this.world.trackShadow(this.camera.position);
  }


  // ─────────── 帧数监控（右上角：黑底白字小字，0.5s 滚动均值） ───────────
  _fpsTick(dt) {
    this._fpsAcc = (this._fpsAcc || 0) + dt;
    this._fpsN = (this._fpsN || 0) + 1;
    if (this._fpsAcc >= 0.5) {
      if (!this._fpsEl) {
        const el = document.createElement('div');
        el.textContent = '-- FPS';
        el.style.cssText = [
          'position:fixed', 'top:10px', 'right:10px', 'z-index:9999',
          'background:#000', 'color:#fff', 'font:11px/1.4 Consolas,monospace',
          'padding:2px 8px', 'border-radius:3px', 'opacity:0.75',
          'pointer-events:none', 'white-space:nowrap',
        ].join(';');
        document.body.appendChild(el);
        this._fpsEl = el;
      }
      this._fpsEl.textContent = Math.round(this._fpsN / this._fpsAcc) + ' FPS';
      this._fpsAcc = 0; this._fpsN = 0;
    }
  }

  // ─────────── 主循环 ───────────
  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this._fpsTick(dt);

    if (this.state === 'battle' && this.player && !this.paused) {
      this.battleTime += dt;
      this._playerControl(dt);
      const allTanks = [this.player, ...this.enemies];
      this.thermal.update(dt, allTanks);   // 热值动态加成（车速 → 发动机热辐射）
      for (const ai of this.ais) ai.update(dt, this.player, this.shells, this.effects, audio, this.smoke, this.visibility);
      for (const t of allTanks) t.update(dt, this.effects, audio);
      // 可破坏系统：坦克移动后履带压毁判定（玩家带相机震动）+ 倒塌/倒伏/烟源动画驱动
      this.world.destructibles.crushCheck(this.player, this.rig);
      for (const e of this.enemies) this.world.destructibles.crushCheck(e, null);
      this.world.destructibles.update(dt);
      // 坦克间碰撞解析（OBB 分离 + 对冲掉速）
      for (let i = 0; i < allTanks.length; i++) {
        for (let j = i + 1; j < allTanks.length; j++) {
          const a = allTanks[i], b = allTanks[j];
          if (a.destroyed && b.destroyed) continue;  // 双残骸跳过（单侧残骸仍可被推开）
          const n = a.collideTank(b);
          if (n) {
            // 同步根节点位置 + 撞击反馈（音效/火花 0.5s 节流，避免贴蹭连响）
            a._syncTransform(0); b._syncTransform(0);
            const impact = Math.abs(a.speed) + Math.abs(b.speed);
            this._ramCd = Math.max(0, (this._ramCd || 0) - dt);
            if (impact > 2 && this._ramCd <= 0) {
              this._ramCd = 0.5;
              _v1.copy(a.pos).lerp(b.pos, 0.5); _v1.y += 1.2;
              this.effects.mgImpact(_v1);
              audio.playHitArmor(false);
            }
          }
        }
      }
      // 点亮系统更新
      this.visibility.update(dt, allTanks);
      // 烟雾弹系统更新（AI 发射已禁用——ai.js 低血周旋与此处判定两个入口均已停用）
      this.smoke.update(dt);
      // 履带印：逐车驱动左右履带里程计（玩家+AI 都留印）+ 老化渐隐
      if (this.trackMarks) {
        for (const t of [this.player, ...this.enemies]) this.trackMarks.trackTank(t, dt);
        this.trackMarks.update(dt);
      }
      this.rig.update(dt);
      // 爆炸震屏桥接到相机
      if (this.effects.shakeAmount > 0.01) this.rig.shake = Math.max(this.rig.shake, this.effects.shakeAmount * 0.8);
      this._updateRanging();
      this._updateLaser(dt);
      // 小镇天空云缓慢漂移
      if (this.world.skyMat) this.world.skyMat.uniforms.uTime.value += dt;

      // 行驶扬尘 + 排气
      this._driveEffects(this.player, dt);
      for (const e of this.enemies) this._driveEffects(e, dt);

      // 胜负判定（含超时：比剩余血量百分比）
      if (this.endTimer < 0) {
        if (this.enemies.every((e) => e.destroyed)) this._onVictory();
        else if (this.battleTime >= GAME.timeLimit) this._onTimeout();
      } else {
        this.endTimer -= dt;
        if (this.endTimer <= 0) {
          this._finishBattle(this._pendingResult);
          this.endTimer = -1;
        }
      }

      // HUD
      const p = this.player;
      const reloadFrac = 1 - Math.max(p.reload, 0) / p.cfg.reloadTime;
      const fovRad = this.camera.fov * Math.PI / 180;
      const dispPx = Math.tan(p.dispersion) / Math.tan(fovRad / 2) * (innerHeight / 2);
      const ringSize = clamp(30 + dispPx * 2, 30, 300);
      // 镜内散布虚线圈：用 aimFovEff（当前变倍下的镜内 FoV）换算散布角直径
      const aimFovRad = this.rig.aimFovEff() * Math.PI / 180;
      const gsDispSize = clamp(Math.tan(p.dispersion) / Math.tan(aimFovRad / 2) * innerHeight, 8, 700);
      const minD = p.cfg.dispersion;
      const aimFrac = clamp(1 - (p.dispersion - minD) / (minD * 4), 0, 1);
      const aimed = aimFrac >= 0.985 && !p.destroyed;
      this.ui.updateHUD(p, this.enemies.filter((e) => !e.destroyed).length, {
        reloadFrac, ringSize, aimFrac, aimed, gsDispSize,
        timeLeft: GAME.timeLimit - this.battleTime,
        prot: this._protInfo(p),
        range: this.aimDist,
        targetName: this.aimTargetTank ? this.aimTargetTank.cfg.name : '',
        scoped: this.rig.aiming,
        zoomText: `×${(CAMERA.fov / this.rig.aimFovEff()).toFixed(1)}`,
        ir: this.irOn,
      });
      this.ui.updateMarkers(this.enemies, p, this.camera);
      this.ui.minimap && this.ui.minimap.update(dt, p, this.enemies);
      this.ui.updateSmoke(p.smokeAmmo, 3);
      this.ui.updateConsumables(p);
      this.world.trackShadow(p.root.position);
      this.world.updateCulling(dt, this.camera.position);   // 性能优化 A4：布景距离剔除（0.5s 节流）
    } else {
      (this.state === 'menu' || this.state === 'hangar') && this._menuCamera(dt);
      if (this.menuTank) this.menuTank.update(dt, this.effects, audio);
      // 车库动态：排风扇 / 吊物微摆 / 浮尘 / 警灯 / 日光灯闪烁
      if (this.state === 'hangar' && this.garage) this.garage.update(dt);
    }

    // 远景战场氛围烟柱（仅战场场景；车库态不生成）
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0 && this.world && this.state !== 'hangar') {
      this.ambientTimer = 2.5 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2, r = 260 + Math.random() * 260;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const y = this.world.groundY(x, z);
      for (let i = 0; i < 6; i++) {
        this.ps.spawn('smoke', {
          x: x + (Math.random() - 0.5) * 8, y: y + Math.random() * 10, z: z + (Math.random() - 0.5) * 8,
          vx: 1 + Math.random(), vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5),
          life: 3 + Math.random() * 3, size0: 6, size1: 18, alpha: 0.16, drag: 0.3,
        });
      }
    }

    if (!this.paused && this.shells) {
      this.shells.update(dt);
      this.effects.update(dt);
      this.ps.update(dt);
    }
    // 粒子点大小随相机 FoV（狙击变倍时粒子保持世界尺寸）
    this.ps.setFov(this.camera.fov, innerHeight);
    // 渲染分支：热像仪（开镜 + IR 开）走离屏双 pass，其余直出
    if (this.state === 'battle' && this.rig.aiming && this.irOn) {
      this.thermal.render(this.scene, this.camera, this.rig.zoomMag, this.world.sky);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _driveEffects(t, dt) {
    if (t.destroyed) return;
    const sp = Math.abs(t.speed);
    // 履带扬尘（dustMul：负重轮不可转的车加强扬尘掩饰，如 KF51——数量与浓度同步增强）
    t.dustTimer -= dt;
    if (sp > 2 && t.dustTimer <= 0) {
      t.dustTimer = 0.05 - Math.min(sp / 40, 1) * 0.03;
      const mul = t.cfg.dustMul || 1;
      const reps = Math.floor(mul) + (Math.random() < mul % 1 ? 1 : 0);
      const inten = Math.min((sp / 18) * Math.sqrt(mul), 1);
      for (let r = 0; r < reps; r++) {
        for (const tl of t.cfg.trackLocal) {
          _v1.fromArray(tl);
          t.model.localToWorld(_v1);
          _v1.y = this.world.groundY(_v1.x, _v1.z) + 0.4;
          this.effects.trackDust(_v1, inten);
        }
      }
    }
    // 排气（起步工况：大油门低车速 → 浓黑烟，startK 快升慢降）
    t.exhaustTimer -= dt;
    const thr = Math.abs(t.throttle ?? 0);
    const spdN = Math.min(sp / t.cfg.maxSpeed, 1);
    const starting = thr > 0.3 && sp < 5;
    t.startK += ((starting ? 1 : 0) - t.startK) * Math.min(1, dt * (starting ? 6 : 0.8));
    const steerLoad = Math.abs(t.steer ?? 0);
    const dark = Math.min(1, 0.15 + thr * 0.3 * (1 - spdN * 0.6) + t.startK * 0.7 + steerLoad * 0.25);
    const load = Math.min(thr + sp / 30 + steerLoad * 0.35, 1);
    if (t.exhaustTimer <= 0 && (load > 0.15 || sp > 1)) {
      t.exhaustTimer = t.startK > 0.5 ? 0.06 : 0.09;
      const turbine = t.cfg.engineType === 'turbine';
      for (const el of t.cfg.exhaustLocal) {
        _v1.fromArray(el);
        t.model.localToWorld(_v1);
        this.effects.exhaustPuff(_v1, load, dark, turbine);
      }
    }
  }
}

window.__game = new Game();
window.__audio = audio;   // 调试/自动化验证钩子（模块级单例）
