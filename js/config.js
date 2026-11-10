// ═══ 游戏全局配置：坦克参数参考实车数据（适度游戏化） ═══

export const GAME = {
  mapSize: 2200,            // 战场边长 (m)
  shellGravity: 9.8,
  quality: 'high',
  timeLimit: 600,           // 战斗时限 s（超时按剩余血量百分比判定）
};

// 相机（参考 ironWar 手感）
export const CAMERA = {
  fov: 62,
  aimFov: 32,               // 狙击镜基础 FOV（调大=整档放大倍率下降，视野更宽）
  aimZoomMax: 12,           // 镜内变倍上限（容纳真实炮长镜高档位 10×/12×）
  chaseDist: 10, chaseMin: 5.5, chaseMax: 22,
  chaseHeight: 2.6,
  followLerp: 9,
  aimLerp: 14,
};

// 命中区域中文名（命中反馈用）
export const ZONE_NAMES = {
  hullFront: '车体正面', hullSide: '车体侧面', hullRear: '车体尾部', hullTop: '车体顶部',
  turretFront: '炮塔正面', turretSide: '炮塔侧面', turretRear: '炮塔尾部',
};

export const TANKS = {
  't-90m3': {
    id: 't-90m3',
    nation: 'ru',
    reticle: 'ru',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [4, 12],       // 炮长镜物理 2 档（1A40-4 瞄准具）
    name: 'T-90M「突破-3」',
    model: 'model/t-90m3.glb',
    scale: 0.0468,               // 模型单位 → 米（按车体长 6.86m 校准）
    forwardAxis: '+z',
    // —— 部件网格名（来自 model/t-90m3.md 标注）——
    parts: {
      turret: ['Mesh_0000_b63bbc8db9168ac9e99ce64a6886bf7b_0', 'Mesh_0043_b63bbc8db9168ac9e99ce64a6886bf7b_0',
               'Mesh_0023_b63bbc8db9168ac9e99ce64a6886bf7b_0', 'Mesh_0015_b63bbc8db9168ac9e99ce64a6886bf7b_0',
               'Mesh_0008_b63bbc8db9168ac9e99ce64a6886bf7b_0', 'Mesh_0026_b63bbc8db9168ac9e99ce64a6886bf7b_0'],
      mg: ['Mesh_0028_b63bbc8db9168ac9e99ce64a6886bf7b_0', 'Mesh_0030_b63bbc8db9168ac9e99ce64a6886bf7b_0'],
      barrel: ['Mesh_0000_b63bbc8db9168ac9e99ce64a6886bf7b_0', 'Mesh_0008_b63bbc8db9168ac9e99ce64a6886bf7b_0'],
      track: ['Mesh_0042_7ddde163cf81bfce9440d09ca3685a5b_0'],
      wheels: ['Mesh_0037_b63bbc8db9168ac9e99ce64a6886bf7b_0'],
    },
    // 旋转轴心（模型局部坐标，未缩放）
    turretPivot: [-0.6, 31.0, -6.4],
    barrelPivot: [-0.6, 33.5, 22.0],
    muzzleLocal: [-0.6, 33.9, 112.0],     // 炮口位置（模型局部）
    exhaustLocal: [[35.97, 22.68, -28.48], [35.95, 22.13, -29.09]],  // t-90m3
    trackLocal: [[-30, 2, 8], [30, 2, 8]],          // 履带扬尘点
    // —— 实车性能参数（游戏化微调）——
    mass: 48000,                 // kg
    engineHp: 1130,              // 马力 V-92S2F（展示数据）
    maxSpeedForward: 60 / 3.6,   // m/s（火控/音效参考；drive 用 maxSpeed）
    maxSpeedReverse: 15 / 3.6,
    accel: 8.5,                  // 旧指数逼近参数（drive 已不用，保留兼容）
    drag: 1.5,                   // 同上
    // —— 驾驶模型：离合器 + 功率曲线 ——
    maxSpeed: 16.7,              // 前进极速 m/s ≈60km/h
    revSpeed: 6,                 // 倒车极速 m/s
    enginePower: 5.2,            // 全油门功率 m/s²
    powerFalloff: 0.62,          // 高速功率衰减
    clutchDelay: 0.35,           // 离合器完全接合时间 s
    engineBrake: 1.6,            // 松油引擎制动 m/s²
    brakeDecel: 7.2,
    turnDrag: 0.42,              // 转向掉速系数
    slopePower: 0.55,            // 坡度阻力系数
    hullTraverse: 0.72,          // 车体转向 rad/s
    turretTraverse: 0.72,        // 炮塔转速 rad/s（实车约40°/s，加强手感）
    gunDepression: -6.0,         // 俯角 °
    gunElevation: 14.0,          // 仰角 °
    wheelsRotate: false,         // 负重轮为单一网格，不可旋转
    // —— 火力 ——
    gunCaliber: 125,
    shellName: '3BM60 铅-2 APFSDS',
    shellVelocity: 1700,         // m/s
    shellPen: 620,               // mm RHA @0m
    shellPenDrop: 0.055,         // 每千米穿深衰减比例
    shellDamage: 430,
    damageSpread: 0.15,
    reloadTime: 6.5,             // s 自动装弹机
    dispersion: 0.0016,          // 基础散布 rad
    aimTime: 2.0,                // 缩圈时间 s
    // —— 装甲（mm RHA 等效，含爆反）——
    hp: 1680,
    armor: {
      hullFront: 620, hullSide: 90,  hullRear: 55,  hullTop: 40,
      turretFront: 780, turretSide: 260, turretRear: 65,
    },
    // —— 防护体系：爆反 Relikt（板耗尽后 armor 回落 base 裸值）+ 机枪口径 ——
    mgCaliber: '12.7',
    era: {
      type: 'relikt',
      plates: { turretFront: 5, hullFront: 5, turretSide: 3, hullSide: 2 },
      base:   { turretFront: 720, hullFront: 570, turretSide: 230, hullSide: 70 },
    },
    // —— 激光压制系统：窗帘-1（炮塔两侧压制器，正面 ±110° 扇区，可被打坏）——
    lws: { model: 'Shtora-1' },
    ammoRackChance: 0.20,        // （已由 penInside 弹药架判定取代，保留作展示参考）
    fireChance: 0.22,            // 被击穿后起火概率
    mg: { rate: 9, dispersion: 0.014, range: 300, moduleChance: 0.035, muzzleUp: 1.4, muzzleFwd: 1.7 },
    // —— 内部模块布局（车体局部坐标，米；+z 车头，参考 modalTank）——
    internal: {
      ammoRacks: [{ x: -0.95, y: 0.75, z: -0.9, r: 0.55 },   // 弹药架（车体中后部两侧）
                  { x: 0.95,  y: 0.75, z: -0.9, r: 0.55 }],
      fuelTanks: [{ x: -0.9, y: 0.7, z: 2.3, r: 0.5 },       // 油箱（前部两侧）
                  { x: 0.9,  y: 0.7, z: 2.3, r: 0.5 }],
      engineBox: { zMin: -3.43, zMax: -2.1, yMax: 1.35 },    // 尾部动力舱区间
      ringY: 1.55,                   // 座圈高度（≈hullHeight）
      trackX: 1.1,                   // 履带 |x| 阈值
      trackY: 0.85,                  // 履带高度上界
    },
    // —— 视觉尺寸（用于命中区域判定，米）——
    dims: { length: 6.86, width: 3.78, hullHeight: 1.55, turretTop: 2.23 },
    trackWidth: 0.58,
    // —— 外部音效（mp3）——
    sound: {
      engine: 'sound/t90-eg.mp3',   // 0~0.24s 启动段，0.24s+ 循环行驶段
      mg: 'sound/t90-gun.mp3',      // 0.03~0.09s 循环开枪段，0.09s+ 回响段
      fire: 'sound/t90-fire.mp3',   // 火炮（整段播放一次）
      fireAim: 'sound/auto-inner.mp3',   // 瞄准镜模式开火专属音效
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  't-80u': {
    id: 't-80u',
    nation: 'ru',
    reticle: 'ru',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [4, 12],       // 炮长镜物理 2 档（1A43 瞄准具）
    name: 'T-80U',
    model: 'model/tank_t-80u.glb',
    engineType: 'turbine',
    scale: 1.0,
    forwardAxis: '+z',
    parts: {
      turret: ['Object_48', 'Object_44', 'Object_40', 'Object_42',
               'Object_38', 'Object_50', 'Object_52', 'Object_54', 'Object_46', 'Object_30'],
      mg: ['Object_34', 'Object_32'],
      barrel: ['Object_44'],
      track: [],
      // 左侧 5 对负重轮为独立节点（可旋转）
      wheels: ['Object_20', 'Object_22', 'Object_24', 'Object_26', 'Object_28'],
    },
    turretPivot: [0, 1.52, -0.342],
    barrelPivot: [0, 1.79, 1.1],
    muzzleLocal: [-0.08, 1.79, 6.7],
    exhaustLocal: [[0.21, 1.14, -3.65], [-0.30, 1.12, -3.66]],  // t-80u
    trackLocal: [[-1.6, 0.1, 0], [1.6, 0.1, 0]],
    mass: 46000,
    engineHp: 1250,              // GTD-1250 燃气轮机（展示数据）
    maxSpeedForward: 65 / 3.6,
    maxSpeedReverse: 11 / 3.6,
    accel: 9.2,
    drag: 1.5,
    // —— 驾驶模型（较玩家略肉）——
    maxSpeed: 65 / 3.6,          // ≈65km/h
    revSpeed: 6,
    enginePower: 4.6,
    powerFalloff: 0.62,
    clutchDelay: 0.4,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.55,
    hullTraverse: 0.78,
    turretTraverse: 0.68,
    gunDepression: -5.0,
    gunElevation: 14.0,
    wheelsRotate: true,          // 负重轮为独立节点，可旋转
    gunCaliber: 125,
    shellName: '3BM42M APFSDS',
    shellVelocity: 1700,
    shellPen: 570,
    shellPenDrop: 0.055,
    shellDamage: 410,
    damageSpread: 0.15,
    reloadTime: 7.1,
    dispersion: 0.0018,
    aimTime: 2.1,
    gunCaliberMM: 125,
    hp: 1470,
    armor: {
      hullFront: 560, hullSide: 85, hullRear: 45, hullTop: 35,
      turretFront: 680, turretSide: 210, turretRear: 55,
    },
    // —— 防护体系：爆反 Kontakt-5 + 机枪口径 ——
    mgCaliber: '12.7',
    era: {
      type: 'kontakt5',
      plates: { turretFront: 5, hullFront: 4, turretSide: 3, hullSide: 2 },
      base:   { turretFront: 640, hullFront: 520, turretSide: 180, hullSide: 65 },
    },
    ammoRackChance: 0.24,
    fireChance: 0.24,
    mg: { rate: 8, dispersion: 0.016, range: 300, moduleChance: 0.03, muzzleUp: 1.1, muzzleFwd: 1.4 },
    // —— 内部模块布局（车体局部坐标，米；+z 车头）——
    internal: {
      ammoRacks: [{ x: -0.9, y: 0.72, z: -0.8, r: 0.55 },
                  { x: 0.9,  y: 0.72, z: -0.8, r: 0.55 }],
      fuelTanks: [{ x: -0.85, y: 0.68, z: 2.35, r: 0.5 },
                  { x: 0.85,  y: 0.68, z: 2.35, r: 0.5 }],
      engineBox: { zMin: -3.5, zMax: -2.2, yMax: 1.3 },
      ringY: 1.5,
      trackX: 1.1,
      trackY: 0.85,
    },
    dims: { length: 7.0, width: 3.6, hullHeight: 1.5, turretTop: 2.2 },
    trackWidth: 0.58,
    sound: {
      engine: 'sound/t80-eg.mp3',     // 整段循环
      mg: 'sound/t90-gun.mp3',
      fire: 'sound/t80-fire.mp3',
      fireAim: 'sound/90inner-fire.mp3',   // 瞄准镜模式开火专属音效
      seg: { engineStart: 0, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  'leopard_2a7': {
    id: 'leopard_2a7',
    nation: 'de',
    reticle: 'de',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [2, 8],        // 炮长镜物理 2 档（PERI-R12A3 望远主镜）
    name: '豹 2A7+',
    model: 'model/leopard_2a7.glb',
    scale: 1.0,
    forwardAxis: '+z',
    parts: {
      turret: ['Object_3', 'Object_9', 'Object_23', 'Object_29', 'Object_33', 'Object_34',
               'Object_35', 'Object_36', 'Object_37', 'Object_38', 'Object_39', 'Object_40', 'Object_41'],
      mg: ['Object_2', 'Object_4', 'Object_5', 'Object_7', 'Object_11'],
      barrel: ['Object_10', 'Object_28'],
      track: ['Object_6', 'Object_8'],
      hidden: ['Object_32', 'Object_42'],   // md 标注隐藏件
      wheels: [],
    },
    // 旋转轴心（模型局部坐标）——2026-09-06 按 8-31 重导出新模型实测校准
    // （旧值 [0,0.184,-0.194]/[0,0.45,1.2]/[0,0.48,6.5] 来自旧版模型，炮弹出生点低于炮管 1.5m）
    turretPivot: [0, 1.70, -0.194],
    barrelPivot: [0, 1.97, 1.2],
    muzzleLocal: [0, 1.97, 7.03],
    exhaustLocal: [[-0.49, 1.42, -3.92], [0.55, 1.34, -3.92]],  // leopard_2a7
    trackLocal: [[-1.48, 0.1, 0], [1.48, 0.1, 0]],
    mass: 62300,
    engineHp: 1500,              // MTU MT883 柴油机
    maxSpeedForward: 72 / 3.6,
    maxSpeedReverse: 18 / 3.6,
    accel: 9.0,
    drag: 1.4,
    maxSpeed: 72 / 3.6,          // ≈72km/h
    revSpeed: 18 / 3.6,
    enginePower: 5.5,
    powerFalloff: 0.6,
    clutchDelay: 0.32,
    engineBrake: 1.8,
    brakeDecel: 7.5,
    turnDrag: 0.4,
    slopePower: 0.5,
    hullTraverse: 0.7,
    turretTraverse: 0.78,        // 电液驱动，转速快
    gunDepression: -9.0,         // 俯角好
    gunElevation: 20.0,
    wheelsRotate: false,
    gunCaliber: 120,
    shellName: 'DM63 APFSDS',
    shellVelocity: 1750,
    shellPen: 650,
    shellPenDrop: 0.05,
    shellDamage: 440,
    damageSpread: 0.15,
    reloadTime: 7.0,             // 人工装弹（4 人车组）
    dispersion: 0.0015,
    aimTime: 1.8,
    hp: 1750,
    armor: {
      hullFront: 650, hullSide: 100, hullRear: 60, hullTop: 45,
      turretFront: 850, turretSide: 280, turretRear: 70,
    },
    mgCaliber: '7.62',   // 纯被动复合装甲（无爆反/APS），同轴机枪口径
    ammoRackChance: 0.18,
    fireChance: 0.2,
    mg: { rate: 10, dispersion: 0.013, range: 300, moduleChance: 0.03, muzzleUp: 0.6, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -1.0, y: 0.8, z: -1.0, r: 0.55 },
                  { x: 1.0,  y: 0.8, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.5, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.5, r: 0.5 }],
      engineBox: { zMin: -3.7, zMax: -2.3, yMax: 1.4 },
      ringY: 1.6,
      trackX: 1.2,
      trackY: 0.9,
    },
    dims: { length: 7.7, width: 3.7, hullHeight: 1.6, turretTop: 2.48 },
    trackWidth: 0.635,
    sound: {
      engine: 'sound/lor2-eg.mp3',   // 0~1s 启动，1~14s 循环，14s+ 消失
      mg: 'sound/t90-gun.mp3',
      fire: 'sound/lor2-fire.mp3',
      fireAim: 'sound/inner-lor2.mp3',   // 瞄准镜模式开火专属音效
      seg: { engineStart: 1.0, engineLoopEnd: 14.0, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  'm1a1sa': {
    id: 'm1a1sa',
    nation: 'us',
    reticle: 'us',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [3, 10],       // 炮长镜物理 2 档（M1A1 Raytheon 瞄具）
    name: 'M1A1 SA',
    model: 'model/m1a1sa.glb',
    engineType: 'turbine',
    scale: 1.0,
    forwardAxis: '+x',
    parts: {
      turret: ['turret_m1a1-turret_1_0', 'm1a1sa_m1a1-sa_12_0', 'm1a2apu_m1a2_11_0',
               'gear303_us-vehicle-gear_9_0', 'tubeb_m1a1-skirts_5_0',
               'gear70_us-vehicle-gear_9_0', 'gear69_us-vehicle-gear_9_0', 'gear68_us-vehicle-gear_9_0', 'gear67_us-vehicle-gear_9_0',
               'gear66_m1a1-turret_1_0', 'antenna-optiona_m1a1-hull_0_0',
               'gear301_m1a1-wheels_3_0', 'tire18_m1a1-wheels_4_0',
               'gear205_m1a1-track_10_0', 'gear204_m1a1-track_10_0',
               'gear65_us-vehicle-gear_9_0', 'gear64_us-vehicle-gear_9_0', 'gear63_us-vehicle-gear_9_0', 'gear62_us-vehicle-gear_9_0', 'gear59_us-vehicle-gear_9_0',
               'gear305_m1a1-wheels_3_0', 'tire16_m1a1-wheels_4_0',
               'gear300_m1a1-wheels_3_0', 'tire17_m1a1-wheels_4_0',
               'gear302_m1a1-wheels_3_0', 'tire001_m1a1-wheels_4_0',
               'gear001_us-vehicle-gear_9_0', 'permanent-gear_us-vehicle-gear_9_0', 'gear01_us-vehicle-gear_9_0',
               'smoke2f-model_m1a1-turret_1_0', 'smokee-model_m1a1-turret_1_0', 'smoked-model_m1a1-turret_1_0',
               'smoke2d-model_m1a1-turret_1_0', 'smokef-model_m1a1-turret_1_0', 'smoke2e-model_m1a1-turret_1_0',
               'smoke2c-model_m1a1-turret_1_0', 'smokeb-model_m1a1-turret_1_0', 'smoke2-model_m1a1-turret_1_0',
               'smokec-model_m1a1-turret_1_0', 'smoke2b-model_m1a1-turret_1_0',
               'gear23_m1a1-turret_1_0', 'interior-turret_m1-interior_7_0',
               'gear21_us-vehicle-gear_9_0', 'gear20_us-vehicle-gear_9_0', 'gear07_us-vehicle-gear_9_0', 'gear06_us-vehicle-gear_9_0', 'gear02_us-vehicle-gear_9_0',
               'gear_m1a1-turret_1_0',
               'lens003_m1a1-turret_2_0', 'ammohatch02_m1a1-turret_1_0', 'mount4_m1a1-turret_1_0', 'lens002_m1a1-turret_2_0',
               'hatch_m1a1-turret_1_0', 'mount2_m1a1-turret_1_0', 'mount3_m1a1-turret_1_0',
               'mount_m1a1-turret_1_0', 'internal_m1-interior_7_0', 'weapon4_m1a1-turret_1_0',
               'hatch2_m1a1-turret_1_0', 'lens001_m1a1-turret_2_0', 'ammohatch_m1a1-turret_1_0'],
      mg: ['weapon2_tank-mg_8_0', 'weapon3_tank-mg_8_0'],
      barrel: ['weapon_m1a1-skirts_5_0', 'barrel_m1a1-skirts_6_0'],
      track: ['track1_m1a1-track_14_0', 'track2b_m1a1-track_10_0', 'track1b_m1a1-track_10_0', 'track2_m1a1-track_14_0'],
      fixedToHull: ['enginegrill_m1a1-turret_1_0'],   // 排气口固定车体，不随炮塔
      hidden: ['antenna-optionb_m1a1-hull_0_0'],       // 隐藏件
      wheels: ['wheel3_m1a1-wheels_3_0', 'wheel4_m1a1-wheels_3_0', 'wheel5_m1a1-wheels_3_0',
               'wheel6_m1a1-wheels_3_0', 'wheel7_m1a1-wheels_3_0', 'wheel8_m1a1-wheels_3_0',
               'wheel9_m1a1-wheels_3_0', 'wheel10_m1a1-wheels_3_0', 'wheel11_m1a1-wheels_3_0',
               'wheel12_m1a1-wheels_3_0', 'wheel13_m1a1-wheels_3_0', 'wheel14_m1a1-wheels_3_0',
               'wheel15_m1a1-wheels_3_0', 'wheel16_m1a1-wheels_3_0'],
    },
    turretPivot: [0, 1.2, 0],
    barrelPivot: [0, 1.4, 1.5],
    muzzleLocal: [0, 1.45, 7],
    exhaustLocal: [[-0.03, 1.06, -4.21], [-0.40, 1.06, -4.20]],  // m1a1sa（'+x' 烘焙：工具坐标 (x,y,z)→(-z,y,x)）
    trackLocal: [[-1.43, 0.1, 0], [1.43, 0.1, 0]],
    mass: 61300,
    engineHp: 1500,              // AGT-1500 燃气轮机
    maxSpeedForward: 67 / 3.6,
    maxSpeedReverse: 12 / 3.6,
    accel: 8.5,
    drag: 1.5,
    maxSpeed: 67 / 3.6,          // ≈67km/h
    revSpeed: 12 / 3.6,
    enginePower: 5.0,
    powerFalloff: 0.62,
    clutchDelay: 0.38,
    engineBrake: 1.7,
    brakeDecel: 7.0,
    turnDrag: 0.42,
    slopePower: 0.52,
    hullTraverse: 0.68,
    turretTraverse: 0.7,
    gunDepression: -10.0,        // 俯角佳
    gunElevation: 20.0,
    wheelsRotate: true,
    gunCaliber: 120,
    shellName: 'M829A3 APFSDS',
    shellVelocity: 1650,
    shellPen: 700,
    shellPenDrop: 0.05,
    shellDamage: 450,
    damageSpread: 0.15,
    reloadTime: 6.5,             // 人工装弹
    dispersion: 0.0016,
    aimTime: 2.0,
    hp: 1750,
    armor: {
      hullFront: 700, hullSide: 90, hullRear: 50, hullTop: 40,
      turretFront: 900, turretSide: 250, turretRear: 60,
    },
    mgCaliber: '12.7',   // 贫铀复合装甲（无爆反/APS），车长机枪口径
    ammoRackChance: 0.18,
    fireChance: 0.2,
    mg: { rate: 8, dispersion: 0.015, range: 300, moduleChance: 0.035, muzzleUp: 0.7, muzzleFwd: 1.1 },
    internal: {
      ammoRacks: [{ x: -1.0, y: 0.8, z: -0.9, r: 0.55 },
                  { x: 1.0,  y: 0.8, z: -0.9, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.4, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.4, r: 0.5 }],
      engineBox: { zMin: -3.8, zMax: -2.4, yMax: 1.4 },
      ringY: 1.55,
      trackX: 1.15,
      trackY: 0.88,
    },
    dims: { length: 7.92, width: 3.66, hullHeight: 1.6, turretTop: 2.44 },
    trackWidth: 0.635,
    sound: {
      engine: 'sound/m1-eg.mp3',
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/m1-fire.mp3',
      fireAim: 'sound/iner-fire.mp3',   // 瞄准镜模式开火专属音效
      seg: { engineStart: 0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },

  'm1a2_trophy': {
    id: 'm1a2_trophy',
    nation: 'us',
    reticle: 'us',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [3, 10],       // 炮长镜物理 2 档（M1A2 GPS 瞄具）
    name: 'M1A2 SEPv3',
    model: 'model/m1a2_trophy-hv.glb',
    engineType: 'turbine',
    scale: 1.0,
    forwardAxis: '+z',
    parts: {
      turret: ['Object_5', 'Object_6', 'Object_12', 'Object_13', 'Object_18', 'Object_19',
               'Object_20', 'Object_21', 'Object_22', 'Object_23', 'Object_24', 'Object_25',
               'Object_26', 'Object_27', 'Object_33', 'Object_46', 'Object_45', 'Object_44'],
      mg: ['Object_2', 'Object_4', 'Object_9', 'Object_10', 'Object_30', 'Object_31', 'Object_32'],
      barrel: ['Object_7', 'Object_15'],
      track: ['Object_3', 'Object_8'],
      fixedToHull: ['Object_40'],   // 排气口固定车体
      wheels: [],
    },
    turretPivot: [0, 1.2, 0],
    barrelPivot: [0, 1.4, 1.5],
    muzzleLocal: [0, 1.45, 7],
    exhaustLocal: [[-0.02, 1.14, -4.34], [-0.56, 1.07, -4.27]],  // m1a2_trophy
    trackLocal: [[-1.43, 0.1, 0], [1.43, 0.1, 0]],
    mass: 66800,                 // SEPv3 增重
    engineHp: 1500,              // AGT-1500 燃气轮机
    maxSpeedForward: 67 / 3.6,
    maxSpeedReverse: 12 / 3.6,
    accel: 8.3,
    drag: 1.5,
    maxSpeed: 67 / 3.6,          // ≈67km/h
    revSpeed: 12 / 3.6,
    enginePower: 4.8,
    powerFalloff: 0.62,
    clutchDelay: 0.4,
    engineBrake: 1.7,
    brakeDecel: 6.8,
    turnDrag: 0.44,
    slopePower: 0.52,
    hullTraverse: 0.66,
    turretTraverse: 0.72,
    gunDepression: -10.0,
    gunElevation: 20.0,
    wheelsRotate: false,
    gunCaliber: 120,
    shellName: 'M829A4 APFSDS',
    shellVelocity: 1700,
    shellPen: 750,               // M829A4 穿深提升
    shellPenDrop: 0.048,
    shellDamage: 460,
    damageSpread: 0.15,
    reloadTime: 6.3,             // 人工装弹（熟练车组）；平衡：DPM 4600→4381
    dispersion: 0.0014,          // CROWS 火控精度高
    aimTime: 1.7,
    hp: 1820,                    // 贫铀+Trophy 生存性强（2600→1820，全局 -30%）
    armor: {
      hullFront: 760, hullSide: 95, hullRear: 55, hullTop: 45,
      turretFront: 950, turretSide: 270, turretRear: 65,
    },
    // —— 防护体系：Trophy HV 主动防御 + 机枪口径 ——
    mgCaliber: '12.7',
    aps: { model: 'Trophy HV' },
    ammoRackChance: 0.16,
    fireChance: 0.18,
    mg: { rate: 11, dispersion: 0.012, range: 300, moduleChance: 0.035, muzzleUp: 0.7, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -1.0, y: 0.8, z: -0.9, r: 0.55 },
                  { x: 1.0,  y: 0.8, z: -0.9, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.4, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.4, r: 0.5 }],
      engineBox: { zMin: -3.8, zMax: -2.4, yMax: 1.4 },
      ringY: 1.55,
      trackX: 1.15,
      trackY: 0.88,
    },
    dims: { length: 7.92, width: 3.66, hullHeight: 1.6, turretTop: 2.44 },
    trackWidth: 0.635,
    sound: {
      engine: 'sound/m1-eg.mp3',
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/m1-fire.mp3',
      fireAim: 'sound/iner-fire.mp3',   // 瞄准镜模式开火专属音效
      seg: { engineStart: 0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },

  'challenger_3': {
    id: 'challenger_3',
    nation: 'uk',
    reticle: 'uk',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [3.5, 12],     // 炮长镜物理 2 档（升级色 | Sapphire 瞄具）
    name: '挑战者 3',
    model: 'model/challenger_3.glb',
    scale: 1.0,
    forwardAxis: '+x',
    parts: {
      turret: ['turret_challenger-3-turret_4_0',
               'smokej-model_challenger-3-turret_4_0', 'smokeh-model_challenger-3-turret_4_0',
               'smokei-model_challenger-3-turret_4_0', 'smokeg-model_challenger-3-turret_4_0',
               'smokef-model_challenger-3-turret_4_0', 'smoke-model_challenger-3-turret_4_0',
               'smokec-model_challenger-3-turret_4_0', 'smokeb-model_challenger-3-turret_4_0',
               'smoked-model_challenger-3-turret_4_0', 'smokee-model_challenger-3-turret_4_0',
               'trophy_challenger-3-trophy_6_0', 'stand_boxer-rws-30mm-cannon_5_0',
               'turret_interior_challenger-3-interior_1_0', 'basegranades_challenger-3-turret_4_0',
               'antenna_challenger-3-turret_4_0', 'periscopes_challenger-3-turret_4_0',
               'mount_challenger-3-turret_4_0', 'weapon3_challenger-3-turret_4_0',
               'sensorfront_challenger-3-turret_4_0', 'hatch2_challenger-3-turret_4_0',
               'sensorback_challenger-3-turret_4_0', 'antenna2_challenger-3-turret_4_0',
               'hatch_challenger-3-turret_4_0', 'antenna3_challenger-3-turret_4_0'],
      fixedToHull: ['back_len2_challenger-3-hull_0_0', 'toolbox_challenger-3-hull_0_0'],   // 车尾栏板/工具箱固定车体，不随炮塔
      mg: ['mount2_boxer-rws-30mm-cannon_5_0', 'weapon2_boxer-rws-30mm-cannon_5_0',
           'ammobox_boxer-rws-30mm-cannon_5_0', 'clip_boxer-rws-30mm-cannon_5_0'],
      barrel: ['weapon_challenger-3-turret_4_0'],
      track: ['track_challenger-3-tracks_3_0', 'track2_challenger-3-tracks_3_0'],
      wheels: ['wheel_challenger-3-wheels_2_0', 'wheel2_challenger-3-wheels_2_0',
               'wheel3_challenger-3-wheels_2_0', 'wheel4_challenger-3-wheels_2_0',
               'wheel5_challenger-3-wheels_2_0', 'wheel6_challenger-3-wheels_2_0',
               'wheel7_challenger-3-wheels_2_0', 'wheel8_challenger-3-wheels_2_0',
               'wheel9_challenger-3-wheels_2_0', 'wheel10_challenger-3-wheels_2_0',
               'wheel11_challenger-3-wheels_2_0', 'wheel12_challenger-3-wheels_2_0',
               'wheel13_challenger-3-wheels_2_0', 'wheel14_challenger-3-wheels_2_0',
               'wheel15_challenger-3-wheels_2_0', 'wheel16_challenger-3-wheels_2_0'],
    },
    turretPivot: [0, 1.2, 0],
    barrelPivot: [0, 1.4, 1.5],
    muzzleLocal: [0, 1.45, 7],
    exhaustLocal: [[-1.63, 1.79, -2.40], [1.61, 1.68, -2.18]],  // challenger_3（'+x' 烘焙：工具坐标 (x,y,z)→(-z,y,x)）
    trackLocal: [[-1.33, 0.1, 0], [1.33, 0.1, 0]],
    mass: 75000,                 // 挑战者3 重装
    engineHp: 1200,              // MTU V12 柴油机
    maxSpeedForward: 60 / 3.6,
    maxSpeedReverse: 15 / 3.6,
    accel: 7.5,
    drag: 1.6,
    maxSpeed: 60 / 3.6,          // ≈60km/h
    revSpeed: 15 / 3.6,
    enginePower: 4.2,
    powerFalloff: 0.62,
    clutchDelay: 0.42,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.46,
    slopePower: 0.55,
    hullTraverse: 0.6,
    turretTraverse: 0.7,
    gunDepression: -9.0,
    gunElevation: 18.0,
    wheelsRotate: true,
    gunCaliber: 120,
    shellName: 'CHARM 3 APFSDS',
    shellVelocity: 1680,
    shellPen: 720,
    shellPenDrop: 0.05,
    shellDamage: 450,
    damageSpread: 0.15,
    reloadTime: 6.5,             // 人工装弹
    dispersion: 0.0015,
    aimTime: 1.9,
    hp: 1785,
    armor: {
      hullFront: 720, hullSide: 100, hullRear: 55, hullTop: 45,
      turretFront: 880, turretSide: 270, turretRear: 65,
    },
    // —— 防护体系：Trophy 主动防御 + 机枪口径 ——
    mgCaliber: '7.62',
    aps: { model: 'Trophy' },
    ammoRackChance: 0.18,
    fireChance: 0.2,
    mg: { rate: 10, dispersion: 0.013, range: 300, moduleChance: 0.035, muzzleUp: 0.7, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -1.0, y: 0.8, z: -1.0, r: 0.55 },
                  { x: 1.0,  y: 0.8, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.5, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.5, r: 0.5 }],
      engineBox: { zMin: -3.8, zMax: -2.4, yMax: 1.4 },
      ringY: 1.6,
      trackX: 1.15,
      trackY: 0.9,
    },
    dims: { length: 7.8, width: 3.5, hullHeight: 1.6, turretTop: 2.5 },
    trackWidth: 0.74,
    sound: {
      engine: 'sound/cam-eg.mp3',
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/m1-fire.mp3',
      fireAim: 'sound/mk-inner.mp3',   // 瞄准镜模式开火专属音效
      seg: { engineStart: 0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },

  'leopard_2a4': {
    id: 'leopard_2a4',
    nation: 'de',
    reticle: 'de',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [2, 8],        // 炮长镜物理 2 档（EMES-15 瞄具）
    name: '豹 2A4',
    model: 'model/leopard_2a4.glb',
    scale: 1.0,
    forwardAxis: '+x',
    parts: {
      turret: ['turret_leopard-2a4-turret_2_0', 'mount2_leopard-2a4-turret_2_0',
               'smoke2h-model_leopard-2a4-turret_6_0', 'smokeh-model_leopard-2a4-turret_6_0',
               'smoke2g-model_leopard-2a4-turret_6_0', 'smokeg-model_leopard-2a4-turret_6_0',
               'smoke2f-model_leopard-2a4-turret_6_0', 'smokef-model_leopard-2a4-turret_6_0',
               'smoke2e-model_leopard-2a4-turret_6_0', 'smokee-model_leopard-2a4-turret_6_0',
               'smoke2d-model_leopard-2a4-turret_6_0', 'smoked-model_leopard-2a4-turret_6_0',
               'smoke2c-model_leopard-2a4-turret_6_0', 'smokec-model_leopard-2a4-turret_6_0',
               'smoke2b-model_leopard-2a4-turret_6_0', 'smokeb-model_leopard-2a4-turret_6_0',
               'smoke2-model_leopard-2a4-turret_6_0', 'smoke-model_leopard-2a4-turret_6_0',
               'antennas_leopard-2a4-turret_2_0', 'inteior_turret_leopard-2a4-interior_5_0',
               'hatch_leopard-2a4-turret_2_0', 'hatch2_leopard-2a4-turret_2_0',
               'turret_lens_leopard-2a4-turret_4_0', 'mount_leopard-2a4-maingun_3_0',
               'weapon3_leopard-2a4-maingun_3_0'],
      mg: ['weapon2_rheinmetall-mg3_7_0', 'clip2_rheinmetall-mg3-box_8_0'],
      barrel: ['weapon_leopard-2a4-maingun_3_0'],
      track: ['track2_leopard-2a4-tracks_1_0', 'track_leopard-2a4-tracks_1_0'],
      wheels: ['wheel_leopard-2a4-wheels_9_0', 'wheel2_leopard-2a4-wheels_9_0',
               'wheel3_leopard-2a4-wheels_9_0', 'wheel4_leopard-2a4-wheels_9_0',
               'wheel5_leopard-2a4-wheels_9_0', 'wheel6_leopard-2a4-wheels_9_0',
               'wheel7_leopard-2a4-wheels_9_0', 'wheel8_leopard-2a4-wheels_9_0',
               'wheel9_leopard-2a4-wheels_9_0', 'wheel10_leopard-2a4-wheels_9_0',
               'wheel11_leopard-2a4-wheels_9_0', 'wheel12_leopard-2a4-wheels_9_0',
               'wheel13_leopard-2a4-wheels_9_0', 'wheel14_leopard-2a4-wheels_9_0',
               'wheel15_leopard-2a4-wheels_9_0', 'wheel16_leopard-2a4-wheels_9_0',
               'wheel17_leopard-2a4-wheels_9_0', 'wheel18_leopard-2a4-wheels_9_0',
               'wheel19_leopard-2a4-wheels_9_0'],
    },
    turretPivot: [0, 1.2, 0],
    barrelPivot: [0, 1.4, 1.5],
    muzzleLocal: [0, 1.45, 7],
    exhaustLocal: [[1.00, 1.42, -3.96], [-0.41, 1.44, -3.96]],  // leopard_2a4（'+x' 烘焙：工具坐标 (x,y,z)→(-z,y,x)）
    trackLocal: [[-1.48, 0.1, 0], [1.48, 0.1, 0]],
    mass: 55000,
    engineHp: 1500,              // MTU MB 873 柴油机
    maxSpeedForward: 72 / 3.6,
    maxSpeedReverse: 18 / 3.6,
    accel: 9.0,
    drag: 1.4,
    maxSpeed: 72 / 3.6,          // ≈72km/h
    revSpeed: 18 / 3.6,
    enginePower: 5.6,
    powerFalloff: 0.6,
    clutchDelay: 0.32,
    engineBrake: 1.8,
    brakeDecel: 7.5,
    turnDrag: 0.4,
    slopePower: 0.5,
    hullTraverse: 0.72,
    turretTraverse: 0.78,
    gunDepression: -9.0,
    gunElevation: 20.0,
    wheelsRotate: true,
    gunCaliber: 120,
    shellName: 'DM33 APFSDS',
    shellVelocity: 1750,
    shellPen: 570,
    shellPenDrop: 0.05,
    shellDamage: 420,
    damageSpread: 0.15,
    reloadTime: 7.0,             // 人工装弹
    dispersion: 0.0016,
    aimTime: 2.0,
    hp: 1610,
    armor: {
      hullFront: 600, hullSide: 90, hullRear: 55, hullTop: 40,
      turretFront: 780, turretSide: 250, turretRear: 60,
    },
    mgCaliber: '7.62',   // 纯被动复合装甲（无爆反/APS），同轴机枪口径
    ammoRackChance: 0.2,
    fireChance: 0.22,
    mg: { rate: 10, dispersion: 0.013, range: 300, moduleChance: 0.03, muzzleUp: 0.6, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -1.0, y: 0.8, z: -1.0, r: 0.55 },
                  { x: 1.0,  y: 0.8, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.5, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.5, r: 0.5 }],
      engineBox: { zMin: -3.7, zMax: -2.3, yMax: 1.4 },
      ringY: 1.6,
      trackX: 1.2,
      trackY: 0.9,
    },
    dims: { length: 7.7, width: 3.7, hullHeight: 1.6, turretTop: 2.48 },
    trackWidth: 0.635,
    sound: {
      engine: 'sound/lor2-eg.mp3',   // 0~1s 启动，1~14s 循环，14s+ 消失
      mg: 'sound/t90-gun.mp3',
      fire: 'sound/lor2-fire.mp3',
      fireAim: 'sound/inner-lor2.mp3',   // 瞄准镜模式开火专属音效
      seg: { engineStart: 1.0, engineLoopEnd: 14.0, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  't-90sm': {
    id: 't-90sm',
    nation: 'ru',
    reticle: 'ru',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [4, 12],       // 炮长镜物理 2 档（Sosna-U 瞄具）
    name: 'T-90SM「塔吉尔」',
    model: 'model/t-90sm.glb',
    scale: 0.76,               // 模型单位 → 米（按车体长 6.86m 校准）
    forwardAxis: '+z',         // 根节点 matrix 已将坐标系转为 -Z 朝前 +Y 朝上
    bakeY180: true,            // 模型前后反 180°，绕 Y 轴烘焙到 +Z 朝前
    modelYOffset: 0.94,        // 履带底部在 Y=-0.94，抬高到地面
    // —— 部件网格名（来自 model/t-90sm.md 标注 + GLB 节点分析）——
    parts: {
      turret: ['Object_10', 'Object_8', 'Object_6'],
      mg: ['Object_7'],
      barrel: ['Object_5', 'Object_3'],
      track: ['Object_11', 'Object_12', 'Object_13', 'Object_14'],
      wheels: [],
    },
    // 旋转轴心（模型局部坐标，已烘焙到 +Z 朝前 +Y 朝上，未缩放）
    turretPivot: [0, 1.0, 0.2],
    barrelPivot: [0, 1.5, 1.0],
    muzzleLocal: [0, 1.6, 8.3],          // 炮口位置（模型局部）
    exhaustLocal: [[2.18, 0.80, -2.88], [2.48, 0.84, -2.68]],  // t-90sm（bakeY180 烘焙：工具坐标 (x,y,z)→(-x,y,-z)）
    trackLocal: [[-2.0, 0, 0], [2.0, 0, 0]],              // 履带扬尘点
    // —— 实车性能参数（T-90SM 出口型「Tagil」，略低于 T-90M3）——
    mass: 48000,
    engineHp: 1130,
    maxSpeedForward: 60 / 3.6,
    maxSpeedReverse: 15 / 3.6,
    accel: 8.5,
    drag: 1.5,
    // —— 驾驶模型 ——
    maxSpeed: 17.0,              // 前进极速 m/s ≈61km/h
    revSpeed: 6,
    enginePower: 5.4,
    powerFalloff: 0.62,
    clutchDelay: 0.35,
    engineBrake: 1.6,
    brakeDecel: 7.2,
    turnDrag: 0.42,
    slopePower: 0.55,
    hullTraverse: 0.72,
    turretTraverse: 0.72,
    gunDepression: -6.0,
    gunElevation: 14.0,
    wheelsRotate: false,
    // —— 火力（出口弹药穿深略降）——
    gunCaliber: 125,
    shellName: '3BM42M APFSDS',
    shellVelocity: 1700,
    shellPen: 590,               // mm RHA @0m（出口弹）
    shellPenDrop: 0.055,
    shellDamage: 420,
    damageSpread: 0.15,
    reloadTime: 6.8,             // s 自动装弹机
    dispersion: 0.0016,
    aimTime: 2.2,                // 缩圈时间 s
    // —— 装甲（出口型爆反略减）——
    hp: 1610,
    armor: {
      hullFront: 590, hullSide: 90,  hullRear: 55,  hullTop: 40,
      turretFront: 740, turretSide: 250, turretRear: 65,
    },
    // —— 防护体系：出口型 Relikt 爆反（略减）+ 机枪口径 ——
    mgCaliber: '12.7',
    era: {
      type: 'relikt',
      plates: { turretFront: 5, hullFront: 5, turretSide: 3, hullSide: 2 },
      base:   { turretFront: 690, hullFront: 545, turretSide: 220, hullSide: 70 },
    },
    // —— 激光压制系统：窗帘-1（同 T-90M3）——
    lws: { model: 'Shtora-1' },
    ammoRackChance: 0.20,
    fireChance: 0.22,
    mg: { rate: 9, dispersion: 0.014, range: 300, moduleChance: 0.035, muzzleUp: 1.4, muzzleFwd: 1.7 },
    // —— 内部模块布局（同 T-90M3 底盘）——
    internal: {
      ammoRacks: [{ x: -0.95, y: 0.75, z: -0.9, r: 0.55 },
                  { x: 0.95,  y: 0.75, z: -0.9, r: 0.55 }],
      fuelTanks: [{ x: -0.9, y: 0.7, z: 2.3, r: 0.5 },
                  { x: 0.9,  y: 0.7, z: 2.3, r: 0.5 }],
      engineBox: { zMin: -3.43, zMax: -2.1, yMax: 1.35 },
      ringY: 1.55,
      trackX: 1.1,
      trackY: 0.85,
    },
    // —— 视觉尺寸（同 T-90M3 底盘）——
    dims: { length: 6.86, width: 3.78, hullHeight: 1.55, turretTop: 2.23 },
    trackWidth: 0.58,
    // —— 外部音效（同 T-90M3）——
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'sound/t90-fire.mp3',
      fireAim: 'sound/auto-inner.mp3',
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  'abrams_x': {
    id: 'abrams_x',
    nation: 'us',
    reticle: 'x',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [3, 10],       // 炮长镜物理 2 档（概念车数字瞄具）
    name: 'abrams-X',
    model: 'model/abrams_x.glb',
    engineType: 'turbine',
    scale: 0.008,
    forwardAxis: '+z',
    modelYOffset: 12.78,
    parts: {
      turret: ['Bashnya', 'Stvol', 'Dekali', 'korpus', 'stvol', 'puli'],
      mg: ['korpus', 'stvol', 'puli'],
      barrel: ['Stvol'],
      track: ['Cube.001'],
      wheels: [],
    },
    turretPivot: [0, 210, 123],
    barrelPivot: [0, 257, 340],
    muzzleLocal: [0, 257, 980],
    exhaustLocal: [[40.65, 139.47, -389.44], [-69.98, 133.23, -397.38]],  // abrams_x
    trackLocal: [[-230, 80, 0], [230, 80, 0]],
    mass: 62000,
    engineHp: 1500,
    maxSpeedForward: 67 / 3.6,
    maxSpeedReverse: 15 / 3.6,   // 混动电驱：倒车无换挡迟滞（12→15）
    accel: 10.0,                 // 混动电驱瞬时扭矩（8.5→10）
    drag: 1.5,
    maxSpeed: 67 / 3.6,
    revSpeed: 15 / 3.6,
    enginePower: 5.0,
    powerFalloff: 0.62,
    clutchDelay: 0.38,
    engineBrake: 1.7,
    brakeDecel: 7.0,
    turnDrag: 0.42,
    slopePower: 0.52,
    hullTraverse: 0.75,          // 混动电驱转向（0.68→0.75）
    turretTraverse: 0.72,
    gunDepression: -10.0,
    gunElevation: 20.0,
    wheelsRotate: false,
    gunCaliber: 120,
    shellName: 'M829A3 APFSDS',
    shellVelocity: 1650,
    shellPen: 720,               // 新一代弹药（700→720）
    shellPenDrop: 0.05,
    shellDamage: 450,
    damageSpread: 0.15,
    reloadTime: 6.0,             // 自动装弹机（6.5→6.0，DPM 4154→4500）
    dispersion: 0.0013,          // 数字化火控（0.0015→0.0013，并列全场第一）
    aimTime: 1.7,                // 数字化火控（2.0→1.7）
    hp: 1750,
    armor: {
      hullFront: 700, hullSide: 90, hullRear: 50, hullTop: 40,
      turretFront: 880, turretSide: 250, turretRear: 60,
    },
    // —— 防护体系：Trophy II 主动防御 + 30mm M230 机炮（剥板/扫雷达主力；射程 400m）——
    mgCaliber: '30mm',
    aps: { model: 'Trophy II' },
    ammoRackChance: 0.18,
    fireChance: 0.20,
    mg: { rate: 8, dispersion: 0.013, range: 400, moduleChance: 0.03, muzzleUp: 0.6, muzzleFwd: 1.0, burstMin: 4, burstMax: 10, pauseMin: 1.0, pauseMax: 1.5, casingType: 'm230' },
    internal: {
      ammoRacks: [{ x: -1.0, y: 0.8, z: -1.5, r: 0.55 },
                  { x: 1.0,  y: 0.8, z: -1.5, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.0, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.0, r: 0.5 }],
      engineBox: { zMin: -4.0, zMax: -2.5, yMax: 1.4 },
      ringY: 1.2,
      trackX: 1.2,
      trackY: 0.9,
    },
    dims: { length: 7.98, width: 3.82, hullHeight: 1.89, turretTop: 2.76 },
    trackWidth: 0.635,
    sound: {
      engine: 'sound/m1-eg.mp3',
      mg: 'sound/230mlGun（002-014）.mp3',
      fire: 'sound/m1-fire.mp3',
      fireAim: 'sound/iner-fire.mp3',
      seg: { engineStart: 0.5, mgLoopStart: 0.02, mgLoopEnd: 0.17 },
    },
  },

  't-14_armata': {
    id: 't-14_armata',
    nation: 'ru',
    reticle: 'ru',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [4, 12],       // 炮长镜物理 2 档（无人炮塔多通道瞄具）
    name: 'T-14「阿玛塔」',
    model: 'model/t-14_armata.glb',
    engineType: 'turbine',
    scale: 0.09,
    forwardAxis: '+z',
    parts: {
      turret: ['PolySphere7_copy3', 'PolySphere7', 'PolySphere1', 'PolySphere2', 'PolySphere7_copy1', 'PolySphere7_copy2', 'PolySphere5', 'PolySphere4', 'PolySphere3'],
      mg: [],
      barrel: ['PolySphere4', 'PolySphere3'],
      track: ['PolySphere11', 'PolySphere9'],
      wheels: ['PolySphere30', 'PolySphere31', 'PolySphere32', 'PolySphere33', 'PolySphere34', 'PolySphere35', 'PolySphere36', 'PolySphere37',
               'PolySphere21', 'PolySphere22', 'PolySphere23', 'PolySphere24', 'PolySphere25', 'PolySphere26', 'PolySphere27', 'PolySphere28'],
    },
    turretPivot: [0, 16, -18],
    barrelPivot: [0, 21, 1],
    muzzleLocal: [0, 21, 57],
    mgMuzzleLocal: [-0.55, 31.82, -20.85],
    exhaustLocal: [[17.62, 15.32, -29.65], [17.62, 14.51, -29.76]],  // t-14_armata
    trackLocal: [[-14, 7, 0], [14, 7, 0]],
    mass: 48000,
    engineHp: 1500,
    maxSpeedForward: 80 / 3.6,
    maxSpeedReverse: 18 / 3.6,
    accel: 9.0,
    drag: 1.4,
    maxSpeed: 80 / 3.6,
    revSpeed: 18 / 3.6,
    enginePower: 5.8,
    powerFalloff: 0.60,
    clutchDelay: 0.32,
    engineBrake: 1.6,
    brakeDecel: 7.5,
    turnDrag: 0.40,
    slopePower: 0.50,
    hullTraverse: 0.80,
    turretTraverse: 0.90,
    gunDepression: -5.0,
    gunElevation: 15.0,
    wheelsRotate: false,
    gunCaliber: 125,
    shellName: '3UBM21 APFSDS',
    shellVelocity: 1800,
    shellPen: 700,
    shellPenDrop: 0.045,
    shellDamage: 450,
    damageSpread: 0.15,
    reloadTime: 6.0,
    dispersion: 0.0013,
    aimTime: 1.8,
    hp: 1680,                    // 乘员舱生存性（2200→1680，全局 -30%）
    armor: {
      hullFront: 750, hullSide: 120, hullRear: 60, hullTop: 50,
      turretFront: 700, turretSide: 200, turretRear: 70,   // 平衡加强：650→700（+Malachit 后等效 711）
    },
    // —— 防护体系：炮塔 Malachit 爆反（无人炮塔仅炮塔挂板）+ 机枪口径 ——
    mgCaliber: '12.7',
    era: {
      type: 'malachit',
      plates: { turretFront: 5, turretSide: 3 },
      base:   { turretFront: 640, turretSide: 170 },   // 板耗尽裸值：平衡加强 590→640
    },
    ammoRackChance: 0.15,
    fireChance: 0.18,
    mg: { rate: 10, dispersion: 0.013, range: 300, moduleChance: 0.03, muzzleUp: 0.8, muzzleFwd: 0.5 },
    internal: {
      ammoRacks: [{ x: -0.9, y: 0.8, z: -1.0, r: 0.55 },
                  { x: 0.9,  y: 0.8, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.85, y: 0.7, z: 2.5, r: 0.5 },
                  { x: 0.85,  y: 0.7, z: 2.5, r: 0.5 }],
      engineBox: { zMin: -3.8, zMax: -2.3, yMax: 1.4 },
      ringY: 1.7,
      trackX: 1.1,
      trackY: 0.9,
    },
    dims: { length: 8.06, width: 3.40, hullHeight: 1.78, turretTop: 3.26 },
    trackWidth: 0.55,
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'sound/t90-fire.mp3',
      fireAim: 'sound/auto-inner.mp3',
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  'ztz-99a': {
    id: 'ztz-99a',
    nation: 'cn',
    reticle: 'cn',            // 狙击镜分划风格（js/reticles.js）
    zoomSteps: [3, 10],       // 炮长镜物理 2 档（上反稳指挥仪瞄具）
    name: 'ZTZ-99A',
    model: 'model/ztz-99a.glb',
    scale: 1.0,
    forwardAxis: '+z',
    parts: {
      turret: ['Object_5', 'Object_4', 'Object_7', 'Object_8', 'Object_9', 'Object_12', 'Object_13', 'Object_15', 'Object_14', 'Object_16', 'Object_17', 'Object_18', 'Object_19', 'Object_20', 'Object_21', 'Object_22'],
      mg: ['Object_7', 'Object_8', 'Object_9', 'Object_13'],
      barrel: ['Object_5', 'Object_14', 'Object_15', 'Object_21'],
      track: ['Object_3', 'Object_6'],
      wheels: [],
    },
    turretPivot: [0, 1.2, 0],
    barrelPivot: [0, 1.8, 0],
    muzzleLocal: [0, 1.7, 6.3],
    exhaustLocal: [[-0.66, 1.22, -3.85], [0.49, 1.15, -3.88]],  // ztz-99a
    trackLocal: [[-1.5, 0.3, 0], [1.5, 0.3, 0]],
    mass: 54000,
    engineHp: 1500,
    maxSpeedForward: 70 / 3.6,
    maxSpeedReverse: 15 / 3.6,
    accel: 8.8,
    drag: 1.4,
    maxSpeed: 70 / 3.6,
    revSpeed: 15 / 3.6,
    enginePower: 5.6,
    powerFalloff: 0.60,
    clutchDelay: 0.34,
    engineBrake: 1.7,
    brakeDecel: 7.2,
    turnDrag: 0.40,
    slopePower: 0.50,
    hullTraverse: 0.75,
    turretTraverse: 0.78,
    gunDepression: -7.0,
    gunElevation: 16.0,
    wheelsRotate: false,
    gunCaliber: 125,
    shellName: 'DTW-125 APFSDS',
    shellVelocity: 1780,
    shellPen: 680,
    shellPenDrop: 0.048,
    shellDamage: 440,
    damageSpread: 0.15,
    reloadTime: 6.5,
    dispersion: 0.0014,
    aimTime: 1.9,
    hp: 1750,
    armor: {
      hullFront: 680, hullSide: 100, hullRear: 55, hullTop: 45,
      turretFront: 850, turretSide: 280, turretRear: 65,
    },
    // —— 防护体系：FY-4 爆反 + 机枪口径 ——
    mgCaliber: '12.7',
    era: {
      type: 'fy4',
      plates: { turretFront: 4, hullFront: 4, turretSide: 2, hullSide: 2 },
      base:   { turretFront: 790, hullFront: 600, turretSide: 250, hullSide: 80 },
    },
    // —— 激光压制系统：JD-3 激光压制观瞄系统（炮塔两侧压制器，正面 ±110° 扇区，可被打坏）——
    lws: { model: 'JD-3' },
    ammoRackChance: 0.18,
    fireChance: 0.20,
    mg: { rate: 8, dispersion: 0.015, range: 300, moduleChance: 0.035, muzzleUp: 0.8, muzzleFwd: 1.2 },
    internal: {
      ammoRacks: [{ x: -0.95, y: 0.8, z: -1.0, r: 0.55 },
                  { x: 0.95,  y: 0.8, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.9, y: 0.75, z: 2.3, r: 0.5 },
                  { x: 0.9,  y: 0.75, z: 2.3, r: 0.5 }],
      engineBox: { zMin: -3.6, zMax: -2.2, yMax: 1.4 },
      ringY: 1.5,
      trackX: 1.1,
      trackY: 0.85,
    },
    dims: { length: 7.78, width: 3.52, hullHeight: 1.71, turretTop: 3.32 },
    trackWidth: 0.58,
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/t90-fire.mp3',
      fireAim: 'sound/auto-inner.mp3',
      seg: { engineStart: 0.24, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },

  'leclerc_s2': {
    id: 'leclerc_s2',
    nation: 'fr',
    reticle: 'fr',            // 法系分划（js/reticles.js）
    zoomSteps: [3, 10],       // 炮长镜物理 2 档（SAGEM VS 580）
    name: '勒克莱尔 S2',
    model: 'model/leclerc_s2.glb',
    scale: 1.0,
    forwardAxis: '+z',
    // —— 部件网格名（来自 newTankmodel2/leclerc_s2.md 标注）——
    parts: {
      turret: ['Object_24', 'Object_15', 'Object_21', 'Object_4', 'Object_25',
               'Object_22', 'Object_5', 'Object_23', 'Object_16', 'Object_18'],
      mg: [],                     // 模型无车长机枪标注，用 mgMuzzleLocal 虚拟枪口
      barrel: ['Object_15', 'Object_21', 'Object_4'],
      track: ['Object_2', 'Object_3'],
      hidden: ['Object_18'],      // 炮塔尾部异常高板（导出产物，非真车部件）
      wheels: [],
    },
    // 旋转轴心（模型局部坐标，未缩放；md 轴 X/Z + 实测座圈高）
    turretPivot: [0, 1.65, -0.236],
    barrelPivot: [0, 1.91, 0.30],
    muzzleLocal: [0, 1.91, 6.48],         // 炮口实测 Z=6.48、炮轴 Y=1.91
    mgMuzzleLocal: [0.75, 2.7, -1.4],     // 虚拟车长机枪（车长塔顶右侧）
    exhaustLocal: [[-0.7, 1.35, -3.9], [0.7, 1.35, -3.9]],  // leclerc_s2 尾部双排气
    trackLocal: [[-1.5, 0.1, 0], [1.5, 0.1, 0]],
    // —— 程序化迷彩（js/camo.js；法系 CE 四色圆斑迷彩，实车阅兵样式）——
    camo: 'leclerc',
    // —— 实车性能参数（V8X-1500 超高压柴油机）——
    mass: 54500,
    engineHp: 1500,
    maxSpeedForward: 72 / 3.6,
    maxSpeedReverse: 24 / 3.6,
    accel: 9.0,
    drag: 1.4,
    // —— 驾驶模型 ——
    maxSpeed: 72 / 3.6,          // ≈72km/h
    revSpeed: 24 / 3.6,
    enginePower: 5.3,
    powerFalloff: 0.6,
    clutchDelay: 0.32,
    engineBrake: 1.7,
    brakeDecel: 7.2,
    turnDrag: 0.4,
    slopePower: 0.5,
    hullTraverse: 0.74,
    turretTraverse: 0.8,         // 电驱动炮塔，全游戏最快
    gunDepression: -8.0,
    gunElevation: 15.0,
    wheelsRotate: false,
    // —— 火力 ——
    gunCaliber: 120,
    shellName: 'OFL 120 F2 APFSDS',
    shellVelocity: 1790,
    shellPen: 640,               // mm RHA @0m（钨芯）
    shellPenDrop: 0.05,
    shellDamage: 440,
    damageSpread: 0.15,
    reloadTime: 6.0,             // 炮塔尾舱自动装弹机
    dispersion: 0.0016,
    aimTime: 1.9,
    // —— 装甲（mm RHA 等效）——
    hp: 1700,
    armor: {
      hullFront: 630, hullSide: 95,  hullRear: 55,  hullTop: 40,
      turretFront: 800, turretSide: 260, turretRear: 65,
    },
    mgCaliber: '12.7',           // 纯被动复合装甲（无爆反/APS），同轴机枪口径
    ammoRackChance: 0.18,
    fireChance: 0.2,
    mg: { rate: 10, dispersion: 0.013, range: 300, moduleChance: 0.03, muzzleUp: 0.7, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -0.8, y: 0.9, z: -1.0, r: 0.55 },
                  { x: 0.8,  y: 0.9, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.9, y: 0.75, z: 2.4, r: 0.5 },
                  { x: 0.9,  y: 0.75, z: 2.4, r: 0.5 }],
      engineBox: { zMin: -3.6, zMax: -2.3, yMax: 1.4 },
      ringY: 1.65,
      trackX: 1.15,
      trackY: 0.9,
    },
    dims: { length: 7.0, width: 3.5, hullHeight: 1.65, turretTop: 2.6 },
    trackWidth: 0.6,
    sound: {
      engine: 'sound/cam-eg.mp3',    // 英系（同挑战者3）
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/m1-fire.mp3',
      fireAim: 'sound/mk-inner.mp3',   // 镜内开炮音（英系）
      seg: { engineStart: 0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },

  'merkava_mk4': {
    id: 'merkava_mk4',
    nation: 'il',
    reticle: 'il',            // 以色列分划（js/reticles.js）
    zoomSteps: [4, 12],       // 炮长镜物理 2 档（El-Op BMS）
    name: '梅卡瓦 Mk4',
    model: 'model/merkava_mark_iv.glb',
    scale: 1.0,
    forwardAxis: '+x',        // 同挑战者3：Y-90° 烘焙到 +Z 朝前
    parts: {
      turret: ['turret_merkava-iv-turret_2_0', 'weapon_merkava-iv-turret_3_0',
               'mount_merkava-iv-turret_3_0', 'weapon2_merkava-iv-turret_3_0',
               'ammobelt_merkava-iv-turret_3_0', 'structure_merkava-iv-turret_3_0',
               'interiorturr__4_0', 'sensorone_merkava-iv-turret_3_0',
               'trophy_merkava-iv-trophy_7_0', 'earsensors_merkava-iv-turret_3_0',
               'rails_merkava-iv-turret_3_0', 'chainslatarmor_merkava-iv-alpha_5_0',
               'antenna5_merkava-iv-turret_3_0', 'antenna6_merkava-iv-turret_3_0',
               'sensortwo_merkava-iv-turret_3_0', 'periscopescomm_merkava-iv-turret_3_0',
               'hatch_merkava-iv-turret_3_0', 'backcage_merkava-iv-turret_3_0',
               'weapon4__8_0', 'structure2_merkava-iv-era_6_0',
               'era_merkava-iv-era_6_0', 'era02_merkava-iv-era_6_0', 'era03_merkava-iv-era_6_0',
               'era04_merkava-iv-era_6_0', 'era05_merkava-iv-era_6_0', 'era06_merkava-iv-era_6_0',
               'era07_merkava-iv-era_6_0', 'era08_merkava-iv-era_6_0', 'era09_merkava-iv-era_6_0',
               'era10_merkava-iv-era_6_0', 'antenna_merkava-iv-turret_3_0',
               'antenna7_merkava-iv-turret_3_0', 'antenna2_merkava-iv-turret_3_0',
               'antenna3_merkava-iv-turret_3_0', 'antenna4_merkava-iv-turret_3_0',
               'mount3_merkava-iv-turret_3_0', 'weapon3_merkava-iv-turret_3_0',
               'enginestuff_merkava-iv-turret_3_0', 'sideboxthing_merkava-iv-turret_3_0',
               'othersideboxthing_merkava-iv-turret_3_0'],
      mg: ['mount3_merkava-iv-turret_3_0', 'weapon3_merkava-iv-turret_3_0'],
      barrel: ['weapon_merkava-iv-turret_3_0', 'mount_merkava-iv-turret_3_0'],
      track: ['track_merkava-iv-tracks_10_0', 'track2_merkava-iv-tracks_10_0'],
      wheels: [],
    },
    // 旋转轴心（'+x' 烘焙后坐标；座圈顶点分布实测，炮塔明显偏后）
    turretPivot: [0, 1.6, -1.0],
    barrelPivot: [0, 2.05, 0.30],
    muzzleLocal: [0, 2.05, 4.11],         // 炮口实测（工具坐标 (x,y,z)→(-z,y,x) 后）
    exhaustLocal: [[-1.67, 1.4, 0.4], [-1.67, 1.4, 1.1]],   // 车体右前侧百叶窗（发动机前置）
    trackLocal: [[-1.55, 0.1, 0], [1.55, 0.1, 0]],
    // —— 实车性能参数（GD883 1200hp，发动机前置）——
    mass: 65000,
    engineHp: 1200,
    maxSpeedForward: 55 / 3.6,
    maxSpeedReverse: 20 / 3.6,
    accel: 7.8,
    drag: 1.6,
    // —— 驾驶模型 ——
    maxSpeed: 55 / 3.6,          // ≈55km/h
    revSpeed: 20 / 3.6,
    enginePower: 4.3,
    powerFalloff: 0.62,
    clutchDelay: 0.4,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.45,
    slopePower: 0.55,
    hullTraverse: 0.58,
    turretTraverse: 0.62,
    gunDepression: -8.5,
    gunElevation: 20.0,
    wheelsRotate: false,         // 轮节点为左右合并网格，不可旋转
    // —— 火力 ——
    gunCaliber: 120,
    shellName: 'CL-3254 APFSDS',
    shellVelocity: 1650,
    shellPen: 640,               // mm RHA @0m
    shellPenDrop: 0.05,
    shellDamage: 440,
    damageSpread: 0.15,
    reloadTime: 6.5,             // 人工装填（尾舱弹匣）
    dispersion: 0.0016,
    aimTime: 2.0,
    // —— 装甲（生存性标杆；发动机前置=额外正面屏障）——
    hp: 1780,
    armor: {
      hullFront: 700, hullSide: 90,  hullRear: 60,  hullTop: 45,
      turretFront: 820, turretSide: 270, turretRear: 70,
    },
    // —— 防护体系：Trophy 主动防御（模型自带发射器/雷达网格）+ 机枪口径 ——
    mgCaliber: '12.7',
    aps: { model: 'Trophy' },
    ammoRackChance: 0.14,        // 弹药架后置隔舱化，殉爆率最低
    fireChance: 0.18,
    mg: { rate: 9, dispersion: 0.014, range: 300, moduleChance: 0.03, muzzleUp: 0.7, muzzleFwd: 1.0 },
    // —— 内部模块布局（车体局部坐标，米；+z 车头。发动机在前！）——
    internal: {
      ammoRacks: [{ x: -0.8, y: 0.85, z: -2.4, r: 0.55 },   // 弹药架后置（隔舱）
                  { x: 0.8,  y: 0.85, z: -2.4, r: 0.55 }],
      fuelTanks: [{ x: -0.9, y: 0.75, z: 1.6, r: 0.5 },
                  { x: 0.9,  y: 0.75, z: 1.6, r: 0.5 }],
      engineBox: { zMin: 2.0, zMax: 3.3, yMax: 1.4 },        // 发动机舱在车首
      ringY: 1.65,
      trackX: 1.15,
      trackY: 0.85,
    },
    dims: { length: 7.5, width: 4.0, hullHeight: 1.7, turretTop: 2.75 },
    trackWidth: 0.62,
    sound: {
      engine: 'sound/m1-eg.mp3',     // 美系
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/m1-fire.mp3',
      fireAim: 'sound/iner-fire.mp3',   // 镜内开炮音（美系）
      seg: { engineStart: 0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },

  'type_10': {
    id: 'type_10',
    nation: 'jp',
    reticle: 'jp',            // 日系分划（js/reticles.js）
    zoomSteps: [4, 12],       // 炮长镜物理 2 档
    name: '10式',
    model: 'model/type_10.glb',
    scale: 1.0,
    forwardAxis: '+z',
    // —— 部件网格名（来自 newTankmodel2/type_10.md 标注）——
    parts: {
      turret: ['Object_32', 'Object_21', 'Object_4', 'Object_9', 'Object_31', 'Object_33',
               'Object_11', 'Object_30', 'Object_20', 'Object_3', 'Object_17',
               'Object_10', 'Object_36', 'Object_13'],
      mg: ['Object_10', 'Object_36', 'Object_13'],   // 车顶遥控武器站（枪口自动推导）
      barrel: ['Object_21', 'Object_4', 'Object_9'],
      track: ['Object_14', 'Object_19'],
      hidden: ['Object_30'],     // 炮塔尾部异常高板（导出产物，非真车部件）
      wheels: [],
    },
    // 旋转轴心（模型局部坐标，未缩放）
    turretPivot: [0, 1.6, 0.2],
    barrelPivot: [0, 1.84, 0.60],
    muzzleLocal: [0, 1.84, 5.53],         // 炮口实测 Z=5.53、炮轴 Y=1.84
    exhaustLocal: [[-1.62, 1.05, -3.1], [-1.62, 1.05, -2.8]],  // 左后侧排气盒实测
    trackLocal: [[-1.45, 0.1, 0], [1.45, 0.1, 0]],
    // —— 实车性能参数（1200hp V8 + 无级变速，25.0hp/t 全游戏功重比第一）——
    mass: 48000,
    engineHp: 1200,
    maxSpeedForward: 70 / 3.6,
    maxSpeedReverse: 22 / 3.6,
    accel: 9.2,
    drag: 1.4,
    // —— 驾驶模型 ——
    maxSpeed: 70 / 3.6,          // ≈70km/h
    revSpeed: 22 / 3.6,
    enginePower: 5.6,
    powerFalloff: 0.6,
    clutchDelay: 0.28,           // CVT 无级变速，起步最快
    engineBrake: 1.8,
    brakeDecel: 7.5,
    turnDrag: 0.38,
    slopePower: 0.5,
    hullTraverse: 0.8,
    turretTraverse: 0.78,
    gunDepression: -7.0,
    gunElevation: 15.0,
    wheelsRotate: false,
    // —— 火力 ——
    gunCaliber: 120,
    shellName: '10式穿甲弹 APFSDS',
    shellVelocity: 1750,
    shellPen: 630,               // mm RHA @0m
    shellPenDrop: 0.05,
    shellDamage: 430,
    damageSpread: 0.15,
    reloadTime: 6.0,             // 尾舱自动装弹机
    dispersion: 0.0014,
    aimTime: 1.8,
    // —— 装甲（模块化陶瓷，基础批次：轻防护换机动）——
    hp: 1600,
    armor: {
      hullFront: 600, hullSide: 85,  hullRear: 50,  hullTop: 40,
      turretFront: 700, turretSide: 240, turretRear: 60,
    },
    mgCaliber: '12.7',           // 纯被动复合装甲（无爆反/APS），车顶机枪口径
    ammoRackChance: 0.18,
    fireChance: 0.2,
    mg: { rate: 9, dispersion: 0.014, range: 300, moduleChance: 0.03, muzzleUp: 0.7, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -0.8, y: 0.8, z: -1.1, r: 0.55 },
                  { x: 0.8,  y: 0.8, z: -1.1, r: 0.55 }],
      fuelTanks: [{ x: -0.85, y: 0.7, z: 2.2, r: 0.5 },
                  { x: 0.85,  y: 0.7, z: 2.2, r: 0.5 }],
      engineBox: { zMin: -3.5, zMax: -2.2, yMax: 1.4 },
      ringY: 1.6,
      trackX: 1.05,
      trackY: 0.85,
    },
    dims: { length: 7.4, width: 3.35, hullHeight: 1.7, turretTop: 2.5 },
    trackWidth: 0.58,
    sound: {
      engine: 'sound/lor2-eg.mp3',   // 德系（同豹2）；0~1s 启动，1~14s 循环
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/lor2-fire.mp3',
      fireAim: 'sound/inner-lor2.mp3',   // 镜内开炮音（德系）
      seg: { engineStart: 1.0, engineLoopEnd: 14.0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },

  'kf51': {
    id: 'kf51',
    nation: 'de',
    reticle: 'nx',            // 未来感数字分划（KF51 专属，js/reticles.js）
    zoomSteps: [4, 12],       // 炮长镜物理 2 档
    name: 'KF51「黑豹」',
    model: 'model/kf51_panther.glb',
    scale: 1.0,
    forwardAxis: '+z',
    // —— 部件网格名（来自 newTankmodel2/kf51_panther.md 标注）——
    parts: {
      turret: ['Object_32', 'Object_21', 'Object_20', 'Object_22', 'Object_17',
               'Object_9', 'Object_29', 'Object_14', 'Object_31'],
      mg: [],                     // 车顶武器站与相邻设备同元件绑定、不可独立转动：用虚拟枪口
      barrel: ['Object_20', 'Object_21'],
      track: ['Object_16', 'Object_4'],
      hidden: ['Object_31'],      // 炮塔尾部异常高板（导出产物，非真车部件）
      wheels: [],
    },
    // 旋转轴心（模型局部坐标，未缩放；md 轴 X/Z + 实测座圈高）
    turretPivot: [0, 1.65, -0.236],
    barrelPivot: [0, 1.96, 1.0],
    muzzleLocal: [0, 1.96, 7.13],         // 炮口实测 Z=7.13、炮轴 Y=1.96
    mgMuzzleLocal: [0.2, 2.95, 0.1],      // 虚拟车顶机枪枪口（武器站前缘；mg-marker.html 可精调）
    exhaustLocal: [[-1.75, 1.35, -0.4], [1.75, 1.35, -0.4]],  // 车尾两侧排气盒（豹2系布局）
    trackLocal: [[-1.5, 0.1, 0], [1.5, 0.1, 0]],
    // —— 程序化迷彩（js/camo.js；三色角状碎裂迷彩，实车展示车样式）——
    camo: 'kf51',
    // —— 实车性能参数（EuroPowerPack MT883 1479hp，59t）——
    mass: 59000,
    engineHp: 1479,
    maxSpeedForward: 68 / 3.6,
    maxSpeedReverse: 31 / 3.6,
    accel: 9.0,
    drag: 1.4,
    // —— 驾驶模型 ——
    maxSpeed: 68 / 3.6,          // ≈68km/h
    revSpeed: 31 / 3.6,          // 倒车与豹2A7 并列全场第一
    enginePower: 5.4,
    powerFalloff: 0.6,
    clutchDelay: 0.30,
    engineBrake: 1.8,
    brakeDecel: 7.5,
    turnDrag: 0.4,
    slopePower: 0.5,
    hullTraverse: 0.76,
    turretTraverse: 0.82,        // 全电炮塔，新全场第一
    gunDepression: -9.0,
    gunElevation: 18.0,
    wheelsRotate: false,
    // —— 火力（130mm 新世代：全场最高穿深/伤害/DPM）——
    gunCaliber: 130,
    shellName: '130mm F51 APFSDS',
    shellVelocity: 1780,
    shellPen: 760,               // mm RHA @0m（130mm 新弹，全场第一）
    shellPenDrop: 0.045,
    shellDamage: 470,            // 全场第一（原第一 460）
    damageSpread: 0.15,
    reloadTime: 6.0,             // 尾舱自动装弹机（10 发备弹夹）
    dispersion: 0.0012,          // 数字化火控+AI 目标识别，全场第一
    aimTime: 1.6,                // 全场第一
    // —— 装甲（新一代复合装甲；无爆反）——
    hp: 1780,
    armor: {
      hullFront: 730, hullSide: 95,  hullRear: 55,  hullTop: 45,
      turretFront: 880, turretSide: 280, turretRear: 70,
    },
    // —— 防护体系：StrikeShield 硬杀伤主动防御（近距拦截窗/无雷达弱点）+ 12.7 同轴 ——
    mgCaliber: '12.7',
    aps: { model: 'StrikeShield', type: 'strikeshield' },
    ammoRackChance: 0.16,
    fireChance: 0.18,
    mg: { rate: 10, dispersion: 0.013, range: 300, moduleChance: 0.03, muzzleUp: 0.7, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -0.8, y: 0.9, z: -1.0, r: 0.55 },
                  { x: 0.8,  y: 0.9, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.4, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.4, r: 0.5 }],
      engineBox: { zMin: -3.6, zMax: -2.3, yMax: 1.4 },
      ringY: 1.65,
      trackX: 1.15,
      trackY: 0.9,
    },
    dims: { length: 7.5, width: 3.77, hullHeight: 1.7, turretTop: 2.9 },
    trackWidth: 0.62,
    // —— 外部音效（全德系）——
    sound: {
      engine: 'sound/lor2-eg.mp3',   // 0~1s 启动，1~14s 循环
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/lor2-fire.mp3',
      fireAim: 'sound/inner-lor2.mp3',   // 德系镜内开炮音
      seg: { engineStart: 1.0, engineLoopEnd: 14.0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },
  't-72b3': {
    id: 't-72b3',
    nation: 'ru',
    reticle: 'ru',            // 苏式分划（js/reticles.js）
    zoomSteps: [4, 12],       // 炮长镜物理 2 档（Sosna-U 瞄具）
    name: 'T-72B3',
    model: 'model/t-72b3.glb',
    scale: 1.0,
    forwardAxis: '+x',        // Y-90° 烘焙到 +Z 朝前（同挑战者3）
    interiorTint: '#57614a',  // 内部件（炮塔篮圈/车体内衬/炮体内）染车体同系橄榄绿，防舱口穿帮
    // —— 部件网格名（来自 newTankmodel2/t-72b3.md 标注）——
    parts: {
      turret: ['turret_t-72m-turret_8_0', 'sosna-u_t-72b3-extras2_15_0',
               'co-antenna2_t-72b3-extras2_15_0', 'co-antenna_t-72m1-k5extra_13_0',
               'antenna_t-72m1-k5extra_13_0', 'hatch2_t-72m-turret_8_0',
               'hatch4_t-72m-turret_8_0', 'hatch_t-72m-turret_8_0', 'mount2_t-72m-turret_8_0',
               'backet_t-72m1-gun_11_0', 'lens003_t-72m-turret_8_0', 'lens004_t-72m1-hull_1_0',
               'lens002_t-72m1-hull_1_0', 'internal001_t-72m1-interior_3_0', 'mesh03_t-72m1-hull_1_0',
               'box01_t-72m-turret_8_0', 'turet_extra_t-72b3-eras_14_0', 'object03_t-72b3-eras_14_0',
               'smoke-model_t-72b3-eras_14_0', 'smoke2-model_t-72b3-eras_14_0', 'smoke3-model_t-72b3-eras_14_0',
               'smoke4-model_t-72b3-eras_14_0', 'smoke5-model_t-72b3-eras_14_0', 'smoke6-model_t-72b3-eras_14_0',
               'smoke7-model_t-72b3-eras_14_0', 'smoke8-model_t-72b3-eras_14_0',
               'era_t-72b3-eras_14_0',
               'era 2_t-72b3-eras_14_0', 'era 3_t-72b3-eras_14_0', 'era 4_t-72b3-eras_14_0',
               'era 5_t-72b3-eras_14_0', 'era 6_t-72b3-eras_14_0', 'era 7_t-72b3-eras_14_0',
               'era 8_t-72b3-eras_14_0', 'era 9_t-72b3-eras_14_0', 'era 10_t-72b3-eras_14_0',
               'era 11_t-72b3-eras_14_0', 'era 12_t-72b3-eras_14_0', 'era 13_t-72b3-eras_14_0',
               'era 14_t-72b3-eras_14_0', 'era 15_t-72b3-eras_14_0', 'era 16_t-72b3-eras_14_0',
               'era 17_t-72b3-eras_14_0', 'era 18_t-72b3-eras_14_0', 'era 19_t-72b3-eras_14_0',
               'era 20_t-72b3-eras_14_0', 'era 21_t-72b3-eras_14_0', 'era 22_t-72b3-eras_14_0',
               'era 23_t-72b3-eras_14_0', 'era 24_t-72b3-eras_14_0', 'era 25_t-72b3-eras_14_0',
               'era 26_t-72b3-eras_14_0', 'era 27_t-72b3-eras_14_0', 'era 28_t-72b3-eras_14_0',
               'era 29_t-72b3-eras_14_0', 'era 31_t-72b3-eras_14_0'],
      mg: ['mount3_t-72m1-gun_11_0', 'weapon2_nsvt_10_0', 'mgbracket_t-72m1-gun_11_0', 'mgbox_nsvt_10_0'],
      // ↑ 车顶 NSVT：模型出厂朝后收纳（mgFlipY 翻转 180° 成战斗朝向），节点为单位 TRS 由兜底逻辑取枪架回转中心
      barrel: ['weapon_t-72m1-gun_11_0', 'internal_t-72m1-interior_3_0',
               'barrel_t-72m1-gun_12_0', 'mount_t-72m1-mantlet_9_0', 'weapon3_nsvt_10_0'],
      track: ['track2_t-72m1-track_6_0', 'track03_t-72m1-track_6_0'],
      wheels: ['wheel_t-72m1-wheel_4_0', 'wheel2_t-72m1-wheel_4_0', 'wheel3_t-72m1-wheel_4_0',
               'wheel4_t-72m1-wheel_4_0', 'wheel5_t-72m1-wheel_4_0', 'wheel6_t-72m1-wheel_4_0',
               'wheel7_t-72m1-wheel_4_0', 'wheel8_t-72m1-wheel_4_0', 'wheel9_t-72m1-wheel_4_0',
               'wheel10_t-72m1-wheel_4_0', 'wheel11_t-72m1-wheel_4_0', 'wheel12_t-72m1-wheel_4_0',
               'wheel13_t-72m1-wheel_4_0', 'wheel14_t-72m1-wheel_4_0', 'wheel15_t-72m1-wheel_4_0',
               'wheel16_t-72m1-wheel_4_0'],
    },
    // 旋转轴心（'+x' 烘焙后坐标：工具坐标 (x,y,z)→(-z,y,x)）
    turretPivot: [0, 1.48, -0.257],
    barrelPivot: [0, 1.76, 1.08],
    muzzleLocal: [0, 1.76, 5.63],         // 炮口实测 Z=5.63、炮轴 Y=1.76
    mgFlipY: true,                        // 车顶 NSVT 出厂朝后收纳，构建时绕枪架翻转 180°
    exhaustLocal: [[1.72, 1.33, -2.05], [1.72, 1.33, -1.70]],  // 左后侧翼子板排气盒
    trackLocal: [[-1.45, 0.1, 0], [1.45, 0.1, 0]],
    // —— 实车性能参数（V-84-1 840hp，功重比 18.3hp/t；倒挡慢是 T-72 家族特征）——
    mass: 46000,
    engineHp: 840,
    maxSpeedForward: 60 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    accel: 7.6,
    drag: 1.6,
    // —— 驾驶模型 ——
    maxSpeed: 60 / 3.6,          // ≈60km/h
    revSpeed: 2.2,               // ≈8km/h（T-72 侧变速箱倒挡慢，全场最慢倒车）
    enginePower: 4.4,
    powerFalloff: 0.62,
    clutchDelay: 0.4,
    engineBrake: 1.6,
    brakeDecel: 6.8,
    turnDrag: 0.44,
    slopePower: 0.55,
    hullTraverse: 0.64,
    turretTraverse: 0.58,        // 老式电液驱动，全场最慢炮塔
    gunDepression: -6.0,
    gunElevation: 14.0,
    wheelsRotate: true,          // 负重轮为独立节点，可旋转
    // —— 火力 ——
    gunCaliber: 125,
    shellName: '3BM42M APFSDS',
    shellVelocity: 1700,
    shellPen: 600,               // mm RHA @0m
    shellPenDrop: 0.055,
    shellDamage: 410,
    damageSpread: 0.15,
    reloadTime: 7.5,             // s 转盘自动装弹机（老型号，比 T-90M 慢）
    dispersion: 0.0018,
    aimTime: 2.2,
    // —— 装甲（mm RHA 等效，含爆反）——
    hp: 1560,
    armor: {
      hullFront: 550, hullSide: 80,  hullRear: 45,  hullTop: 35,
      turretFront: 700, turretSide: 210, turretRear: 55,
    },
    // —— 防护体系：爆反 Kontakt-5（车体首上 + 侧裙 + 炮塔）+ 机枪口径 ——
    mgCaliber: '12.7',
    era: {
      type: 'kontakt5',
      plates: { turretFront: 5, hullFront: 4, turretSide: 2, hullSide: 2 },
      base:   { turretFront: 640, hullFront: 520, turretSide: 180, hullSide: 62 },
    },
    ammoRackChance: 0.22,        // 转盘弹架置于炮塔篮圈内，殉爆率偏高
    fireChance: 0.24,            // 自动装弹机殉爆连带起火风险（T-72 家族特征）
    mg: { rate: 8, dispersion: 0.016, range: 300, moduleChance: 0.03, muzzleUp: 1.4, muzzleFwd: 1.0 },
    // —— 内部模块布局（车体局部坐标，米；+z 车头）——
    internal: {
      ammoRacks: [{ x: -0.5, y: 0.65, z: -0.5, r: 0.6 },    // 转盘弹架（车体中后部中央）
                  { x: 0.5,  y: 0.65, z: -0.5, r: 0.6 }],
      fuelTanks: [{ x: -0.9, y: 0.7, z: 2.3, r: 0.5 },      // 油箱（前部两侧）
                  { x: 0.9,  y: 0.7, z: 2.3, r: 0.5 }],
      engineBox: { zMin: -3.4, zMax: -2.1, yMax: 1.3 },     // 尾部动力舱区间
      ringY: 1.48,
      trackX: 1.15,
      trackY: 0.85,
    },
    // —— 视觉尺寸（用于命中区域判定，米）——
    dims: { length: 6.86, width: 3.75, hullHeight: 1.5, turretTop: 2.35 },
    trackWidth: 0.58,
    // —— 外部音效（俄系）——
    sound: {
      engine: 'sound/t90-eg.mp3',   // 0~0.24s 启动段，0.24s+ 循环行驶段
      mg: 'sound/t90-gun.mp3',
      fire: 'sound/t90-fire.mp3',
      fireAim: 'sound/auto-inner.mp3',   // 镜内开炮音（苏系）
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  'strv_122a': {
    id: 'strv_122a',
    nation: 'se',
    reticle: 'de',            // 北约德系分划（js/reticles.js）
    zoomSteps: [2, 8],        // 炮长镜物理 2 档（EMES-15 瞄具）
    name: 'Strv 122A',
    model: 'model/strv_122a.glb',
    scale: 1.0,
    forwardAxis: '+z',
    // —— 部件网格名（来自 newTankmodel2/strv_122a.md 标注）——
    parts: {
      turret: ['Object_24', 'Object_23', 'Object_22', 'Object_7', 'Object_25',
               'Object_20', 'Object_18', 'Object_21', 'Object_31'],
      mg: ['Object_10', 'Object_4', 'Object_8'],   // 车长塔机枪（枪口/支点自动推导）
      barrel: ['Object_33', 'Object_5'],
      track: ['Object_3', 'Object_2'],
      hidden: ['Object_31'],     // 炮塔尾部异常高板（导出产物，非真车部件，顶高 4.1m）
      wheels: [],
    },
    // 旋转轴心（模型局部坐标，未缩放；md 轴 X/Z + 实测座圈高）
    turretPivot: [0, 1.68, -0.131],
    barrelPivot: [0, 2.0, 0.5],
    muzzleLocal: [0, 2.0, 5.74],          // 炮口实测 Z=5.74、炮轴 Y=2.0
    exhaustLocal: [[-0.55, 1.4, -3.95], [0.55, 1.4, -3.95]],  // 车尾双排气（豹2系布局）
    trackLocal: [[-1.36, 0.1, 0], [1.36, 0.1, 0]],
    // —— 实车性能参数（MTU MB873 1500hp，62t）——
    mass: 62000,
    engineHp: 1500,
    maxSpeedForward: 68 / 3.6,
    maxSpeedReverse: 31 / 3.6,   // HSWL-354 液力传动，倒挡 31km/h（并列全场第一）
    accel: 8.6,
    drag: 1.5,
    // —— 驾驶模型 ——
    maxSpeed: 68 / 3.6,          // ≈68km/h
    revSpeed: 31 / 3.6,
    enginePower: 5.0,            // 功重比 24.2hp/t，仅次于 10式
    powerFalloff: 0.6,
    clutchDelay: 0.32,
    engineBrake: 1.8,
    brakeDecel: 7.5,
    turnDrag: 0.4,
    slopePower: 0.5,
    hullTraverse: 0.72,
    turretTraverse: 0.78,
    gunDepression: -9.0,         // 俯角好
    gunElevation: 20.0,
    wheelsRotate: false,         // 负重轮为左右合并网格，不可旋转
    // —— 火力 ——
    gunCaliber: 120,
    shellName: 'DM53 APFSDS',
    shellVelocity: 1750,
    shellPen: 660,               // mm RHA @0m（L/55 高压弹道）
    shellPenDrop: 0.05,
    shellDamage: 445,
    damageSpread: 0.15,
    reloadTime: 7.0,             // 人工装弹（4 人车组）
    dispersion: 0.0015,
    aimTime: 1.9,
    // —— 装甲（mm RHA 等效；-Leap 改进型附加装甲）——
    hp: 1720,
    armor: {
      hullFront: 640, hullSide: 100, hullRear: 60,  hullTop: 45,
      turretFront: 860, turretSide: 280, turretRear: 70,
    },
    mgCaliber: '7.62',   // 纯被动复合装甲（无爆反/APS），同轴机枪口径
    ammoRackChance: 0.16,
    fireChance: 0.2,
    mg: { rate: 10, dispersion: 0.013, range: 300, moduleChance: 0.03, muzzleUp: 0.6, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -1.0, y: 0.8, z: -1.0, r: 0.55 },
                  { x: 1.0,  y: 0.8, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.5, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.5, r: 0.5 }],
      engineBox: { zMin: -3.6, zMax: -2.3, yMax: 1.4 },
      ringY: 1.68,
      trackX: 1.2,
      trackY: 0.9,
    },
    dims: { length: 7.7, width: 3.72, hullHeight: 1.6, turretTop: 2.62 },
    trackWidth: 0.62,
    // —— 外部音效（德系）——
    sound: {
      engine: 'sound/lor2-eg.mp3',   // 0~1s 启动，1~14s 循环
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/lor2-fire.mp3',
      fireAim: 'sound/inner-lor2.mp3',   // 德系镜内开炮音
      seg: { engineStart: 1.0, engineLoopEnd: 14.0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },

  'leopard_2ri': {
    id: 'leopard_2ri',
    nation: 'id',
    reticle: 'de',            // 北约德系分划（js/reticles.js）
    zoomSteps: [2, 8],        // 炮长镜物理 2 档（升级 EMES-15 瞄具）
    name: '豹 2RI',
    model: 'model/leopard_2ri.glb',
    scale: 1.0,
    forwardAxis: '+z',
    // —— 部件网格名（来自 newTankmodel2/leopard_2ri.md 标注）——
    parts: {
      turret: ['Object_14', 'Object_15', 'Object_13', 'Object_6', 'Object_11',
               'Object_12', 'Object_10', 'Object_4', 'Object_17'],
      mg: ['Object_16', 'Object_20', 'Object_5'],  // 车顶机枪（枪口/支点自动推导）
      barrel: ['Object_9', 'Object_7', 'Object_8'],
      track: ['Object_3', 'Object_2'],
      hidden: ['Object_18'],     // md 标注隐藏件（炮塔尾篮导出产物）
      wheels: [],
    },
    // 旋转轴心（模型局部坐标，未缩放；座圈几何推算）
    turretPivot: [0, 1.66, 0.2],
    barrelPivot: [0, 2.0, 1.9],
    muzzleLocal: [0, 2.0, 5.63],          // 炮口实测 Z=5.63、炮轴 Y=2.0
    exhaustLocal: [[-0.6, 1.4, -3.95], [0.6, 1.4, -3.95]],    // 车尾双排气（豹2系布局）
    trackLocal: [[-1.36, 0.1, 0], [1.36, 0.1, 0]],
    // —— 实车性能参数（印尼陆军 2A4RI 升级型：MB873 1500hp + 装甲/火控升级）——
    mass: 56000,
    engineHp: 1500,
    maxSpeedForward: 68 / 3.6,
    maxSpeedReverse: 18 / 3.6,
    accel: 8.8,
    drag: 1.5,
    // —— 驾驶模型 ——
    maxSpeed: 68 / 3.6,          // ≈68km/h
    revSpeed: 18 / 3.6,
    enginePower: 5.3,            // 功重比 26.8hp/t，全场第一
    powerFalloff: 0.6,
    clutchDelay: 0.32,
    engineBrake: 1.8,
    brakeDecel: 7.5,
    turnDrag: 0.4,
    slopePower: 0.5,
    hullTraverse: 0.74,
    turretTraverse: 0.74,
    gunDepression: -9.0,
    gunElevation: 20.0,
    wheelsRotate: false,         // 负重轮为左右合并网格，不可旋转
    // —— 火力 ——
    gunCaliber: 120,
    shellName: 'DM33 APFSDS',
    shellVelocity: 1650,
    shellPen: 590,               // mm RHA @0m（L44 + 出口弹药）
    shellPenDrop: 0.05,
    shellDamage: 425,
    damageSpread: 0.15,
    reloadTime: 7.0,             // 人工装弹（4 人车组）
    dispersion: 0.0016,
    aimTime: 2.0,
    // —— 装甲（mm RHA 等效；RI 批次附加装甲包）——
    hp: 1640,
    armor: {
      hullFront: 620, hullSide: 95,  hullRear: 55,  hullTop: 40,
      turretFront: 800, turretSide: 260, turretRear: 60,
    },
    mgCaliber: '7.62',   // 纯被动复合装甲（无爆反/APS），同轴机枪口径
    ammoRackChance: 0.2,
    fireChance: 0.22,
    mg: { rate: 10, dispersion: 0.013, range: 300, moduleChance: 0.03, muzzleUp: 0.6, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -1.0, y: 0.8, z: -1.0, r: 0.55 },
                  { x: 1.0,  y: 0.8, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.5, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.5, r: 0.5 }],
      engineBox: { zMin: -3.8, zMax: -2.4, yMax: 1.4 },
      ringY: 1.66,
      trackX: 1.25,
      trackY: 0.9,
    },
    dims: { length: 7.9, width: 3.95, hullHeight: 1.6, turretTop: 2.5 },
    trackWidth: 0.62,
    // —— 外部音效（德系）——
    sound: {
      engine: 'sound/lor2-eg.mp3',   // 0~1s 启动，1~14s 循环
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/lor2-fire.mp3',
      fireAim: 'sound/inner-lor2.mp3',   // 德系镜内开炮音
      seg: { engineStart: 1.0, engineLoopEnd: 14.0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },

  'challenger_2': {
    id: 'challenger_2',
    nation: 'uk',
    reticle: 'uk',            // 英系分划（js/reticles.js）
    zoomSteps: [3, 10],       // 炮长镜物理 2 档（SAGEM VS 580-3 瞄具）
    name: '挑战者 2',
    model: 'model/challenger_2.glb',
    scale: 1.0,
    forwardAxis: '+x',        // 与挑战者3 方向一致：Y-90° 烘焙到 +Z 朝前
    // —— 部件网格名（来自 newTankmodel2/challenger_2.md 标注）——
    parts: {
      turret: ['turret_fv4030-turret_4_0', 'weapon3_fv4030-fueltank-maingun_1_0',
               'antenna_fv4030-turret_4_0', 'antenna2_fv4030-turret_4_0',
               'hatch2_fv4030-turret_4_0', 'hatch_fv4030-turret_4_0',
               'lens turret_fv4030-turret_4_0', 'turret_interior_fv4030-interior_3_0',
               'smoke-model_fv4030-turret_4_0', 'smokeb-model_fv4030-turret_4_0',
               'smokec-model_fv4030-turret_4_0', 'smoked-model_fv4030-turret_4_0',
               'smokee-model_fv4030-turret_4_0', 'smokef-model_fv4030-turret_4_0',
               'smokeg-model_fv4030-turret_4_0', 'smokeh-model_fv4030-turret_4_0',
               'smokei-model_fv4030-turret_4_0', 'smokej-model_fv4030-turret_4_0'],
      mg: ['mount2_fv4030-turret_4_0', 'weapon2_l7a2_5_0', 'bipod_l7a2_5_0',
           'clip2_l7a2-box-vehicle_6_0', 'mgbracket2_fv4030-turret_4_0'],   // 车长塔 L7 GPMG
      barrel: ['weapon_fv4030-fueltank-maingun_1_0', 'mount_fv4030-hull_0_0',
               'mountdoor_fv4030-hull_0_0'],
      track: ['track_fv4030-tracks_8_0', 'track2_fv4030-tracks_8_0'],
      wheels: ['wheel_fv4030-wheels_7_0', 'wheel2_fv4030-wheels_7_0', 'wheel3_fv4030-wheels_7_0',
               'wheel4_fv4030-wheels_7_0', 'wheel5_fv4030-wheels_7_0', 'wheel6_fv4030-wheels_7_0',
               'wheel7_fv4030-wheels_7_0', 'wheel8_fv4030-wheels_7_0', 'wheel9_fv4030-wheels_7_0',
               'wheel10_fv4030-wheels_7_0', 'wheel11_fv4030-wheels_7_0', 'wheel12_fv4030-wheels_7_0',
               'wheel13_fv4030-wheels_7_0', 'wheel14_fv4030-wheels_7_0', 'wheel15_fv4030-wheels_7_0',
               'wheel16_fv4030-wheels_7_0'],
    },
    // 旋转轴心（'+x' 烘焙后坐标：工具坐标 (x,y,z)→(-z,y,x)）
    turretPivot: [0, 1.65, 0.05],
    barrelPivot: [0, 1.85, 1.9],
    muzzleLocal: [0, 1.85, 6.95],         // 炮口实测 Z=6.95、炮轴 Y=1.85
    exhaustLocal: [[1.62, 1.67, -2.19], [-1.62, 1.67, -2.19]],  // 车尾两侧排气管口
    trackLocal: [[-1.37, 0.1, 0], [1.37, 0.1, 0]],
    // —— 实车性能参数（Perkins CV12 1200hp，62.5t；防务削减后公路限速 59km/h）——
    mass: 62500,
    engineHp: 1200,
    maxSpeedForward: 59 / 3.6,
    maxSpeedReverse: 14 / 3.6,
    accel: 7.8,
    drag: 1.6,
    // —— 驾驶模型 ——
    maxSpeed: 59 / 3.6,          // ≈59km/h
    revSpeed: 14 / 3.6,
    enginePower: 4.2,
    powerFalloff: 0.62,
    clutchDelay: 0.42,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.46,
    slopePower: 0.55,
    hullTraverse: 0.6,
    turretTraverse: 0.68,
    gunDepression: -10.0,        // 俯角佳
    gunElevation: 20.0,
    wheelsRotate: true,          // 负重轮为独立节点，可旋转
    // —— 火力 ——
    gunCaliber: 120,
    shellName: 'CHARM 3 APFSDS',
    shellVelocity: 1650,
    shellPen: 680,               // mm RHA @0m（L30A1 线膛炮发射）
    shellPenDrop: 0.05,
    shellDamage: 440,
    damageSpread: 0.15,
    reloadTime: 7.0,             // 人工装弹（发射药分装，略慢于挑战者3）
    dispersion: 0.0015,
    aimTime: 1.9,
    // —— 装甲（mm RHA 等效；多切斯特复合装甲，炮塔正面全场最硬）——
    hp: 1780,
    armor: {
      hullFront: 700, hullSide: 100, hullRear: 55,  hullTop: 45,
      turretFront: 900, turretSide: 260, turretRear: 60,
    },
    mgCaliber: '7.62',   // 纯被动复合装甲（无爆反/APS），同轴机枪口径
    ammoRackChance: 0.14,        // 发射药装于炮塔尾/车体防火隔舱，殉爆率低
    fireChance: 0.18,            // 低温慢燃发射药，起火率低
    mg: { rate: 10, dispersion: 0.013, range: 300, moduleChance: 0.035, muzzleUp: 0.7, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -1.0, y: 0.8, z: -1.0, r: 0.55 },
                  { x: 1.0,  y: 0.8, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.5, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.5, r: 0.5 }],
      engineBox: { zMin: -3.9, zMax: -2.5, yMax: 1.4 },
      ringY: 1.65,
      trackX: 1.2,
      trackY: 0.9,
    },
    dims: { length: 8.15, width: 3.9, hullHeight: 1.6, turretTop: 2.95 },
    trackWidth: 0.66,
    // —— 外部音效（英系，同挑战者3）——
    sound: {
      engine: 'sound/cam-eg.mp3',
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/m1-fire.mp3',
      fireAim: 'sound/mk-inner.mp3',   // 英系镜内开炮音
      seg: { engineStart: 0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },

  'arjun_mk1a': {
    id: 'arjun_mk1a',
    nation: 'in',
    reticle: 'de',            // 北约德系分划（js/reticles.js）
    zoomSteps: [3, 10],       // 炮长镜物理 2 档（热像瞄准具）
    name: '阿琼 Mk.1A',
    model: 'model/arjun_mk.ia.glb',
    scale: 1.0,
    forwardAxis: '+z',
    // —— 部件网格名（来自 newTankmodel2/arjun_mk.ia.md 标注）——
    parts: {
      turret: ['Object_19', 'Object_4', 'Object_29', 'Object_7', 'Object_30',
               'Object_13', 'Object_5', 'Object_28', 'Object_21'],
      mg: ['Object_16', 'Object_8'],   // 车长塔顶机枪（节点为单位 TRS，支点自动兜底）
      barrel: ['Object_12', 'Object_10', 'Object_2'],
      track: ['Object_3', 'Object_9'],
      hidden: ['Object_20'],           // md 标注隐藏件（抛壳窗导出产物，横跨炮塔的大薄板）
      wheels: [],
    },
    // 旋转轴心（模型局部坐标，未缩放；md 轴 X/Z + 实测座圈高）
    turretPivot: [0, 1.68, -0.236],
    barrelPivot: [0, 2.0, 1.6],
    muzzleLocal: [0, 2.0, 6.04],          // 炮口实测 Z=6.04、炮轴 Y=2.0
    exhaustLocal: [[-1.0, 1.3, -4.4], [1.0, 1.3, -4.4]],   // 车尾双排气
    trackLocal: [[-1.47, 0.1, 0], [1.47, 0.1, 0]],
    // —— 实车性能参数（MTU MB838 1400hp，68.6t，20.4hp/t）——
    mass: 68600,
    engineHp: 1400,
    maxSpeedForward: 58 / 3.6,
    maxSpeedReverse: 15 / 3.6,
    accel: 7.4,
    drag: 1.6,
    // —— 驾驶模型 ——
    maxSpeed: 58 / 3.6,          // ≈58km/h
    revSpeed: 15 / 3.6,
    enginePower: 4.2,
    powerFalloff: 0.62,
    clutchDelay: 0.4,
    engineBrake: 1.6,
    brakeDecel: 6.8,
    turnDrag: 0.44,
    slopePower: 0.55,
    hullTraverse: 0.62,
    turretTraverse: 0.7,
    gunDepression: -8.0,
    gunElevation: 20.0,
    wheelsRotate: false,         // 负重轮为左右合并网格，不可旋转
    // —— 火力 ——
    gunCaliber: 120,
    shellName: '印度 APFSDS',
    shellVelocity: 1650,
    shellPen: 600,               // mm RHA @0m（120mm 线膛炮）
    shellPenDrop: 0.05,
    shellDamage: 430,
    damageSpread: 0.15,
    reloadTime: 7.0,             // 人工装弹（4 人车组）
    dispersion: 0.0016,
    aimTime: 2.0,
    // —— 装甲（mm RHA 等效；Kanchan 复合装甲）——
    hp: 1650,
    armor: {
      hullFront: 620, hullSide: 95,  hullRear: 55,  hullTop: 40,
      turretFront: 780, turretSide: 260, turretRear: 65,
    },
    mgCaliber: '12.7',   // 纯被动复合装甲（无爆反/APS），车顶机枪口径
    ammoRackChance: 0.18,
    fireChance: 0.2,
    mg: { rate: 9, dispersion: 0.014, range: 300, moduleChance: 0.03, muzzleUp: 0.7, muzzleFwd: 1.0 },
    internal: {
      ammoRacks: [{ x: -1.0, y: 0.8, z: -1.0, r: 0.55 },
                  { x: 1.0,  y: 0.8, z: -1.0, r: 0.55 }],
      fuelTanks: [{ x: -0.95, y: 0.75, z: 2.4, r: 0.5 },
                  { x: 0.95,  y: 0.75, z: 2.4, r: 0.5 }],
      engineBox: { zMin: -4.2, zMax: -2.6, yMax: 1.5 },
      ringY: 1.68,
      trackX: 1.25,
      trackY: 0.9,
    },
    dims: { length: 8.5, width: 4.05, hullHeight: 1.65, turretTop: 2.95 },
    trackWidth: 0.6,
    // —— 外部音效（德系，MTU 动力包）——
    sound: {
      engine: 'sound/lor2-eg.mp3',   // 0~1s 启动，1~14s 循环
      mg: 'sound/gun-mk50.mp3',
      fire: 'sound/lor2-fire.mp3',
      fireAim: 'sound/inner-lor2.mp3',   // 德系镜内开炮音
      seg: { engineStart: 1.0, engineLoopEnd: 14.0, mgLoopStart: 0.02, mgLoopEnd: 0.16 },
    },
  },
};

// ── 备弹数（按真实世界参数） ──
const AMMO = {
  't-90m3':        { mg: 2000, shell: 30 },
  't-80u':         { mg: 2000, shell: 30 },
  'leopard_2a7':   { mg: 4750, shell: 42 },
  'm1a1sa':       { mg: 1200, shell: 40 },
  'm1a2_trophy':   { mg: 1200, shell: 40 },
  'challenger_3':  { mg: 2000, shell: 40 },
  'leopard_2a4':   { mg: 4750, shell: 35 },
  't-90sm':        { mg: 2000, shell: 30 },
  'abrams_x':      { mg: 300,  shell: 40 },
  't-14_armata':   { mg: 2000, shell: 32 },
  'ztz-99a':       { mg: 2000, shell: 30 },
  'leclerc_s2':    { mg: 2500, shell: 40 },
  'merkava_mk4':   { mg: 2500, shell: 44 },
  'type_10':       { mg: 2000, shell: 36 },
  'kf51':          { mg: 2500, shell: 28 },
  't-72b3':        { mg: 2000, shell: 40 },
  'strv_122a':     { mg: 4750, shell: 42 },
  'leopard_2ri':   { mg: 4750, shell: 37 },
  'challenger_2':  { mg: 3000, shell: 45 },
  'arjun_mk1a':    { mg: 2500, shell: 39 },
};
for (const id in AMMO) {
  if (TANKS[id]) {
    TANKS[id].shellAmmoMax = AMMO[id].shell;
    if (TANKS[id].mg) TANKS[id].mg.ammoMax = AMMO[id].mg;
  }
}

// ── 热成像瞄具装备车（炮长热像仪：开镜后 N 键切换 IR 视觉，穿透烟雾点亮） ──
// 西方现代车 + 99A + 阿玛塔 + 艾布拉姆斯X + 勒克莱尔S2/梅卡瓦Mk4/10式 有；
// 俄系现役（T-90 系/T-80U/T-72B3）、M1A1SA、豹 2A4 无 → 装备代差博弈
for (const id of ['leopard_2a7', 'm1a2_trophy', 'challenger_3', 'abrams_x', 't-14_armata', 'ztz-99a',
                  'leclerc_s2', 'merkava_mk4', 'type_10', 'kf51',
                  'strv_122a', 'leopard_2ri', 'challenger_2', 'arjun_mk1a']) {
  if (TANKS[id]) TANKS[id].thermal = true;
}

// ── 热像仪参数（js/thermal.js 消费） ──
export const THERMAL = {
  contrast: 1.55,        // 白热对比增强
  noise: 0.05,           // 传感器噪点强度
  scanline: 0.16,        // 水平扫描线深度
  vignette: 0.55,        // 镜缘渐晕
  rtScale: 0.5,          // 离屏 RT 分辨率比例（≤4× 变倍）
  rtScaleZoom: 0.75,     // 高倍变倍时 RT 分辨率（防颗粒）
  heat: {
    vehicle: 0.70,       // 坦克车体
    engine: 0.95,        // 动力舱/排气区（白亮）
    background: 0.26,    // 建筑/地形/植被
    smoke: 0.12,         // 烟粒子（冷，半遮热源）
    fire: 1.0,           // 火焰/炮口焰
  },
};

// 命中区域 → 伤害系数
export const ZONE_DAMAGE_MULT = {
  hullFront: 1.0, hullSide: 1.0, hullRear: 1.15, hullTop: 1.2,
  turretFront: 0.9, turretSide: 0.95, turretRear: 1.1,
};

export const RICOCHET_ANGLE = 71;   // 入射角超过则跳弹（°）
export const FIRE_DOT_DPS = 55;     // 起火每秒伤害
export const FIRE_DURATION = 7;     // 起火持续 s

// ── 弹种定义（所有坦克通用规则；数值基于坦克自身 AP 数据推导） ──
// ap  : 基准弹。穿深随距离衰减，跳弹角 71°。
// heat: 高穿深、无距离衰减，但对大入射角敏感（跳弹角 65°、角度等效更苛刻）、
//       弹速慢（提前量更大）、命中履带区效果差。
// he  : 低穿深、永不跳弹；未击穿也有溅射伤害，高概率断履带；用于刮痧/收头/破履带。
export const SHELL_TYPES = {
  ap: {
    key: 'ap', name: 'APFSDS', full: '穿甲弹', keyHint: '1',
    penMult: 1.0,               // 穿深 = cfg.shellPen × penMult
    penDropK: 1.0,              // 距离衰减系数（cfg.shellPenDrop × K）
    ricochetAngle: 71,          // 跳弹角 °
    cosFloor: 0.34,             // 角度等效装甲的 cos 下限（0.34 = 最多 3 倍）
    velMult: 1.0,               // 弹速 = cfg.shellVelocity × velMult
    dmgMult: 1.0,               // 伤害 = cfg.shellDamage × dmgMult
    trackZoneMult: 0.5,         // 履带区命中总伤害倍率
    splashFrac: 0,              // 未击穿溅射伤害比例
    trackBreakK: 1.0,           // 履带区断履带概率倍率
  },
  heat: {
    key: 'heat', name: 'HEAT', full: '破甲弹', keyHint: '2',
    penMult: 0.9,
    penDropK: 0,
    ricochetAngle: 65,
    cosFloor: 0.2,              // 角度等效最多 5 倍：摆角对 HEAT 惩罚更大
    velMult: 0.56,
    dmgMult: 1.05,
    trackZoneMult: 0.35,        // 破甲弹被履带/间隔提前引爆
    splashFrac: 0,
    trackBreakK: 0.5,
  },
  he: {
    key: 'he', name: 'HE', full: '榴弹', keyHint: '3',
    penMult: 0.13,              // 穿深压到 ~75-95mm
    penDropK: 0,
    ricochetAngle: 180,         // 永不跳弹
    cosFloor: 1.0,              // 无角度等效：按面装甲值直接比
    velMult: 0.5,
    dmgMult: 1.25,
    trackZoneMult: 0.5,
    splashFrac: 0.12,           // 未击穿仍造成 12% 溅射伤害
    trackBreakK: 0.7,           // 溅射断履带概率（独立判定 0.35）
  },
};

// 备弹拆分：AP / HEAT / HE 占总备弹比例（坦克携带三种弹）
export const AMMO_SPLIT = { ap: 0.6, heat: 0.25, he: 0.15 };

// 由总备弹推三种弹携带量：基础配比 60/25/15，AP +50%、HEAT/HE 各 +30%（总备弹相应增加，不减其他弹种）
export function buildShellLoadout(total) {
  const baseAp = Math.max(2, Math.round(total * AMMO_SPLIT.ap));
  const baseHeat = Math.max(2, Math.round(total * AMMO_SPLIT.heat));
  const baseHe = Math.max(2, Math.round(total * AMMO_SPLIT.he));
  const ap = Math.max(2, Math.round(baseAp * 1.5));
  const heat = Math.max(2, Math.round(baseHeat * 1.3));
  const he = Math.max(2, Math.round(baseHe * 1.3));
  return { ap, heat, he };
}

// 模块负面状态规则（弹芯车内传播 penInside 用）
export const MODULE_RULES = {
  trackRepair: 9,          // 断履带持续 s
  engineRepairMin: 6,      // 发动机受损持续 s（随机下限）
  engineRepairMax: 11,     // 发动机受损持续 s（随机上限）
  ringJam: 12,             // 座圈卡死持续 s
  ringChance: 0.5,         // 弹芯过座圈 → 卡死概率
  loaderMult: 1.4,         // 装弹机受损装填倍率（首次）
  loaderCap: 1.8,          // 装填倍率上限（重复命中 +0.4）
  trackChance: 0.5,        // 履带区被命中 → 断履带概率
  ammoDet: 0.30,           // 弹药架直击 → 殉爆概率（玩家被击 ×0.25）
  fuelFire: 0.36,          // 油箱直击 → 起火概率（玩家被击 ×0.5）
  engineFire: 0.22,        // 发动机直击 → 起火概率（玩家被击 ×0.5）
  burnDetPerSec: 0.045,    // 起火中每秒殉爆概率（玩家 ×0.25）
};

// ── 命中大烟尘规则（主炮弹命中坦克时概率扬起大团烟尘；击杀/殉爆已有大爆炸不叠加） ──
export const BIG_DUST_RULES = {
  penChance: 0.5,      // 击穿（未击杀）→ 触发概率
  bounceChance: 0.3,   // 未击穿 → 触发概率
  ricochetChance: 0,   // 跳弹 → 默认不触发（保持现有小火花，符合"跳弹无大烟尘"）
  penScale: 1.0,       // 击穿烟尘规模
  bounceScale: 0.75,   // 未击穿规模稍小
};

// ═══════════════ 防护体系：爆反 ERA / 主动防御 APS / 外露传感器 ═══════════════
// 设计原则：机枪/机炮永不伤害 HP（根除高射速磨血），只攻击外露子系统：
// 爆反板（可扫落）· APS 雷达阵（可扫瞎）· 观瞄镜组（可扫坏，散布永久扩大）

// ── 爆反类型：每块板的穿深削减（mm，按弹种；HE 直接命中额外剥 1 块板） ──
export const ERA_TYPES = {
  kontakt5: { name: 'Kontakt-5',  penCut: { ap: 8,  heat: 45, he: 10 }, plateHp: 20 },
  relikt:   { name: 'Relikt',     penCut: { ap: 12, heat: 60, he: 15 }, plateHp: 20 },
  fy4:      { name: 'FY-4',       penCut: { ap: 10, heat: 50, he: 12 }, plateHp: 20 },
  malachit: { name: 'Malachit',   penCut: { ap: 11, heat: 55, he: 13 }, plateHp: 20 },
};

// ── 主动防御（Trophy 类）：拦截窗内掷判定，空爆拦截来袭炮弹 ──
export const APS_RULES = {
  charges: 4,               // 拦截弹数/场
  cooldown: 12,             // 发射后冷却 s（连射第二发能穿）
  windowMin: 8,             // 拦截窗：距车中心最小距离 m
  windowMax: 25,            // 拦截窗最大距离 m
  minRange: 40,             // 最小作战距离：弹丸已飞行距离（贴脸直射不触发）
  fireChance: 0.5,          // 雷达完好时的发射率
  fireChanceDamaged: 0.3,   // 雷达损伤档（HP<50%）发射率
  effectiveChance: 0.7,     // 发射后实际摧毁弹丸的概率（30% 破片未摧毁，弹丸继续飞）
  radarHp: 60,              // 雷达阵毁伤 HP（机枪/机炮扫）
};

// ── APS 类型表（2026-09-06：Trophy 与 StrikeShield 双类型差异化博弈）──
// type 为空按 trophy 兼容旧配置；radarHp=0 表示分布式传感器（无雷达阵：机枪扫不伤、无损伤档）
export const APS_TYPES = {
  trophy: {
    name: 'Trophy',
    charges: 4, cooldown: 12,
    windowMin: 8, windowMax: 25, minRange: 40,
    fireChance: 0.5, fireChanceDamaged: 0.3,
    effective: { ap: 0.7, heat: 0.7, he: 0.7 },
    radarHp: 60,
  },
  strikeshield: {
    name: 'StrikeShield',
    charges: 6, cooldown: 12,
    windowMin: 5, windowMax: 15, minRange: 25,   // 近距拦截窗：能接 Trophy 接不了的贴脸弹
    fireChance: 0.6, fireChanceDamaged: 0.6,     // 分布式传感：无损伤档
    effective: { ap: 0.7, heat: 0.8, he: 0.7 },  // 定向对抗：对破甲弹金属射流拦截更优
    radarHp: 0,                                  // 无雷达弱点：机枪/机炮扫不动 APS
  },
};

// ── 外露传感器（机枪/机炮扫射积累毁伤；分级：完好 / 损伤 HP<50% / 损毁 HP≤0） ──
export const SENSOR_RULES = {
  opticsHp: 80,             // 观瞄镜组毁伤 HP
  caliber: {                // 每有效命中的毁伤点（era 剥板累积 / aps 雷达 / optics 观瞄 / laser 压制器）
    '7.62': { era: 0,  radar: 2,  optics: 2, laser: 2 },   // 7.62 无法伤爆反，仅雷达/观瞄/压制器骚扰
    '12.7': { era: 0.8, radar: 3,  optics: 3, laser: 3 },  // 12.7 剥板极慢（蹭），雷达/观瞄/压制器轻量
    '30mm': { era: 6, radar: 5, optics: 6, laser: 5, trackChance: 0.02 },  // 30mm 剥板主力；2% 概率扫断履带
  },
  // 距离衰减锚点（分段线性；hit=有效命中率掷骰，dmg=毁伤点数折扣）：
  // ≤50m 50%；100m 40%；300m 5%；400m 2%；≥500m 无。dmg：≤100m 全额；200m 一半；300m 一成后线性归零
  rangeFalloff: [
    { d: 50,  hit: 0.5,  dmg: 1.0 },
    { d: 100, hit: 0.4,  dmg: 1.0 },
    { d: 200, hit: 0.225, dmg: 0.5 },
    { d: 300, hit: 0.05, dmg: 0.1 },
    { d: 400, hit: 0.02, dmg: 0.05 },
    { d: 500, hit: 0,    dmg: 0 },
  ],
  opticsDmgSpread: 2,       // 观瞄损伤档散布倍率
  opticsDeadSpread: 8,      // 观瞄损毁档散布倍率（等效半盲）
};

// ── 激光告警/压制系统（LWS：俄「窗帘-1」Shtora-1 / 中 JD-3；99A 与 T-90 系装备）──
// 软杀伤主动防护：告警接收机发现被瞄准 → 激光压制器对射手方位发射强激光，
// 致盲其测距仪/炮长镜（传感器饱和）。压制器为炮塔外设备（正面 ±110° 扇区，
// 可被机枪/机炮扫损毁）；触发前提 = 受威胁方通过瞄准镜通道瞄准（未瞄准不致盲）。
export const LWS_RULES = {
  cooldown: 10,             // 压制发射冷却 s
  blindTime: 2.5,           // 致盲窗口 s（AI 停瞄准射击 / 玩家镜内白屏）
  sector: 1.92,             // 压制器覆盖半扇区 rad（±110°，绕到侧后失效）
  emitterHp: 60,            // 压制器毁伤 HP（机枪/机炮扫；损伤/损毁分级）
  fireChanceDamaged: 0.5,   // 损伤档（HP<50%）发射成功率（未发射不耗冷却）
};

// ── AI 自动机枪（比玩家保守：反应延时 + 连发/停射循环 + 命中/毁伤折扣） ──
export const AI_MG_RULES = {
  range: 400,                      // AI 自动枪炮交战距离 m（取 min(本值, 本车 mg.range)：机枪 300 / 30mm 机炮 400）
  reactMin: 1.4, reactMax: 2.8,    // 目标进入射程后的反应时间 s
  burstMin: 4, burstMax: 7,        // 连发数
  pauseMin: 2.0, pauseMax: 3.6,    // 连发间停射冷却 s
  aimErr: 0.02,                    // 额外瞄准扰动（弧度）
  hitMul: 0.5,                     // 命中率额外系数（叠乘距离衰减）
  dmgMul: 0.6,                     // 毁伤系数（叠乘距离衰减）
};

// 机枪/机炮距离衰减：返回 [命中率系数, 毁伤系数]
export function mgFalloff(dist) {
  const F = SENSOR_RULES.rangeFalloff;
  if (dist <= F[0].d) return [1, 1];
  for (let i = 1; i < F.length; i++) {
    if (dist <= F[i].d) {
      const t = (dist - F[i - 1].d) / (F[i].d - F[i - 1].d);
      return [
        F[i - 1].hit + (F[i].hit - F[i - 1].hit) * t,
        F[i - 1].dmg + (F[i].dmg - F[i - 1].dmg) * t,
      ];
    }
  }
  return [0, 0];   // >300m：无毁伤
}

// ── 背景音乐 ──
export const BGM = {
  menu: 'bgm/end.mp3',        // 封面 / 菜单 / 车库 / 结算（无缝循环）
  battle: 'bgm/start.mp3',    // 战斗默认曲目（个性化模式也加入列表）
  gap: 10,                    // 战斗曲目每遍之间的间隔 s
  nations: {                  // 国别战斗曲（个性化模式；未列出国别回退 battle）
    us: ['bgm/us1.mp3'],
    de: ['bgm/ge1.mp3'],
    uk: ['bgm/en1.mp3', 'bgm/en2.mp3'],
    ru: ['bgm/rus1.mp3', 'bgm/rus2.mp3', 'bgm/rus3.mp3'],
  },
};
