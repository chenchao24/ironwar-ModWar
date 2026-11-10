# 钢铁战线2 — 装甲前锋 · 项目技术文档

> **用途**：供后续 AI 或开发者接手维护时快速理解项目全貌、架构细节、调试经验与注意事项。
> **最后更新**：2026-09-08（阿琼 Mk.1A 同日加入）

***

## 一、项目概述

### 1.1 基本信息

- **项目名称**：钢铁战线2 — 装甲前锋（IRON WAR: TANK BATTLE）
- **类型**：3D 坦克对战网页游戏（单局 1v1 歼灭战）
- **技术栈**：Three.js 0.185.1 + WebGL2 + WebAudio API + ES Modules
- **运行方式**：Node.js 静态服务器 + 浏览器前端（无后端逻辑）
- **启动**：双击 `start.bat` 或 `node server.js`

### 1.2 游戏流程

```
加载资源 → 封面 → 主菜单 → 机库选车 → 战斗 → 结算 → 返回菜单
```

战斗中按 `ESC` 暂停（可返回游戏或退回首页）。

### 1.3 操作方式

- **WASD**：驾驶（W/S 油门/倒车，A/D 转向）
- **鼠标**：炮塔瞄准（左键开炮，右键狙击镜）
- **滚轮**：狙击镜变倍
- **1/2/3**：切换弹种（APFSDS / HEAT / HE）
- **R**：维修包（立刻修复断履带/座圈/动力/装弹机，每场 1 个）
- **T**：灭火器（瞬间灭火，每场 1 个）
- **C**：切换第三人称/自由视角
- **G**：发射烟雾弹（每次 4 发弹体，共 3 次）
- **N**：热像仪开关（装备车 + 开镜状态；穿透烟雾点亮目标）
- **M**（按住）：机枪自动射击开关（射击射程内最近点亮目标）
- **Shift**：开镜 / 关镜（闩锁式）
- **ESC**：暂停

***

## 二、目录结构

```
ironWar-Tank/
├── index.html              # 入口页面 + 全部 UI 层
├── server.js               # 静态服务器（gzip + 缓存头）
├── start.bat               # 一键启动脚本
├── package.json            # 依赖声明
├── css/
│   └── style.css           # 全局样式
├── flags/                  # 11国国旗 PNG（车库介绍面板；fr/il/jp/se/id/in 为程序化生成，uk 按 ISO 用 gb）
├── js/                     # 核心代码（22个模块）
│   ├── main.js             # 主入口：状态机/资源加载/主循环/玩家操控
│   ├── config.js           # 20辆坦克配置 + 弹药表 + 音效路径
│   ├── tank.js             # 坦克类：模型拆分/行驶/炮塔/命中判定
│   ├── tank-display.js     # 机库展示信息（历史/参数条）
│   ├── garage.js           # 厂房车库（机库选车场景）：全程序化生成，见 §3.7
│   ├── ai.js               # 敌方AI：移动/瞄准/开火决策
│   ├── shell.js            # 炮弹弹道/命中解析/跳弹
│   ├── effects.js          # 特效编排：炮口风暴/爆炸/机炮·命中共用火花/排气/扬尘/燃烧
│   ├── particles.js        # GPU粒子系统（Points + ShaderMaterial）
│   ├── terrain.js          # 地形/光照/天空/雾/地面纹理
│   ├── maps.js             # 地图装配（开阔平原 / 东欧小镇，按 mapId 重建）
│   ├── destructibles.js    # 可破坏物件（房屋/树木/栅栏/废墟）
│   ├── thermal.js          # 热像仪（材质热值注入 + 离屏双 pass）
│   ├── trackmarks.js       # 履带印（InstancedMesh 560实例）
│   ├── smoke.js            # 烟雾弹系统（Sprite粒子云）
│   ├── visibility.js       # 点亮/隐蔽系统（视线检测）
│   ├── camera.js           # 相机装备（第三人称/狙击/自由/震屏）
│   ├── input.js            # 输入系统（键盘/鼠标/指针锁定）
│   ├── reticles.js         # 狙击镜分划模板（十种风格：俄/美/中/英/德/试验车/法/以色列/日/KF51未来感）
│   ├── ui.js               # UI：屏幕切换/HUD/准星/狙击镜/小地图/弹药条
│   ├── minimap.js          # 小地图（30FPS节流/预渲染地形）
│   └── audio.js            # 音频引擎（WebAudio/程序化合成/MP3解码）
├── model/                  # 20个GLB坦克模型（DRACO压缩；leclerc_s2/merkava_mark_iv/type_10/kf51_panther 为 2026-09-06 新增，t-72b3/strv_122a/leopard_2ri/challenger_2 为 2026-09-07 新增，arjun_mk.ia 为 2026-09-08 新增）
├── sound/                  # 35个MP3音效（共2.8MB）+ props/ 子目录（10个物件音效：房屋/树木/栅栏/废墟）
├── bgm/                    # 9个背景音乐MP3（end=菜单 / start=战斗默认 / 国别曲 us·ge·en·rus）
├── docs/                   # 设计文档与迭代记录（含 iteration-summary 系列）
├── scripts/probe_new4.html # 新坦克接入探针（装配模拟+pivot/炮口/机枪标记可视化，2026-09-07）
├── mg-marker.html          # 机枪位置标注工具
├── exhaust-marker.html     # 排气位置标注工具
└── node_modules/           # 依赖
```

***

## 三、核心架构

### 3.1 状态机（main.js）

```
this.state: 'loading' → 'cover' → 'menu' → 'hangar' → 'battle' → 'result'
```

- `_load()`：并行加载15个GLB，DRACOLoader解码
- `_toCover()` → `_bindUI()` 绑定UI事件
- `_enterHangar()` / `_cycleHangar()`：机库选车
- `_startBattle()`：实例化玩家+敌方坦克，进入战斗
- `_finishBattle()` / `_endToMenu()`：结算/返回菜单
- `_pause()` / `_resume()`：ESC暂停/恢复

### 3.2 主循环（main.js `_frame()`）

```js
if (state === 'battle' && !paused) {
  玩家操控 → AI更新 → 坦克物理 → 点亮系统 → 烟雾弹 → 履带印
  → 相机装备 → 测距 → 扬尘排气 → 胜负判定 → HUD更新
}
if (!paused) { 弹丸更新 → 特效更新 → 粒子更新 }
渲染
```

- `dt` 限制最大 0.05s 防止大跳变
- 暂停时跳过所有更新但保持渲染（冻结画面）

### 3.3 坦克模型处理（tank.js）

#### 坐标系与 forwardAxis

- 所有GLB根节点有相同的 matrix：`(x,y,z) → (x, z, -y)`（绕X轴-90°）
- `forwardAxis: '+z'`：无预烘焙，pivot直接用模型世界坐标
- `forwardAxis: '+x'`：部分旧模型使用

#### 模型拆分（\_splitParts）

1. `turretGroup`：炮塔部件（随炮塔旋转）
2. `barrelGroup`：炮管（独立俯仰）
3. `mgGroup`：机枪（独立yaw伺服）
4. `wheelGroups`：负重轮（可旋转）
5. 履带材质克隆（UV滚动动画）

#### 材质独立化

每个mesh的material都clone，便于烧毁变色/履带滚动。
**注意**：`dispose()` 方法负责释放这些clone的材质和纹理，战斗结束必须调用。

#### findMeshes 搜索

- 用 `this.model.getObjectByName()` 搜索整个模型树（非gltfScene）
- 找到Group时直接返回Group（不traverse），避免子节点被掏空
- `flatten` 参数：track处理用 `flatten=true`

### 3.4 粒子系统（particles.js）

- **3种类型**：smoke(4000) / glow(2000) / fire(2000)，总容量8000
- **单次绘制**：每种类型1个THREE.Points对象
- **自定义着色器**：`gl_PointSize` 随相机距离衰减，片段支持旋转UV
- **环形缓冲**：`head` 指针分配，`active` 计数
- **frustumCulled = false**：始终渲染
- **4个PointLight池**：轮转用于闪光照明
- **DynamicDrawUsage**：缓冲区标记为动态更新

#### 粒子参数说明

| 参数            | 含义                   |
| ------------- | -------------------- |
| `x,y,z`       | 出生位置                 |
| `vx,vy,vz`    | 三轴初速度(m/s)           |
| `life`        | 存活时间(秒)              |
| `size0/size1` | 出生/死亡大小(米)，线性插值      |
| `alpha`       | 最大透明度(0\~1)          |
| `grav`        | 重力(m/s²)，正=向下，负=上浮   |
| `drag`        | 空气阻力系数               |
| `windK`       | 风力影响系数               |
| `c0/c1`       | 出生/死亡颜色\[R,G,B] 0\~1 |
| `fadeIn`      | 渐入时间占比(0\~1)         |
| `sizeEase`    | 大小变化曲线指数(1=线性)       |
| `rotSpeed`    | 自转速度(弧度/秒)           |

### 3.5 特效系统（effects.js）

| 方法               | 用途                         |
| ---------------- | -------------------------- |
| `muzzleBlast()`  | 炮口风暴（爆闪+火舌+侧瓣+前喷烟）         |
| `explosion()`    | 大爆炸（爆闪+三层火球+火花+铁花+烟柱+冲击环）  |
| `dirtHit()`      | 地面命中（火光+土块飞溅+黑烟+灰烟+土色烟+尘环） |
| `exhaustPuff()`  | 发动机排烟（燃气轮机=灰色/柴油=深色）       |
| `trackDust()`    | 履带扬尘（升速随车速）                |
| `burning()`      | 残骸燃烧（黑烟+火焰，持续每帧调用）         |
| `hitSpark()`     | 命中火花                       |
| `gunImpact()`    | 机枪/机炮命中统一入口（按口径分流）         |
| `cannonImpact()` | 30mm 机炮专属命中（爆闪+装甲火花+破片+硝烟）  |
| `impactSparks()` | 跳弹火花                       |
| `ejectCasing()`  | 抛壳（弹壳物理：反弹/滚动/淡出）          |

### 3.6 渲染管线

```
WebGLRenderer:
  - antialias: true
  - shadowMap: PCFShadowMap (high=2048², low=1024²)
  - toneMapping: ACESFilmic, exposure=1.28
  - pixelRatio: high=min(DPR,2), medium=1.5, low=1

光照:
  - HemisphereLight(1.7) + AmbientLight(0.55) + DirectionalLight(4.0, 阴影)
  - 4个动态PointLight（粒子闪光池）

雾: FogExp2(0xb0a488, 0.0011)
无后处理（直接渲染）
```

### 3.7 厂房车库（机库选车场景，2026-09-05 新增）

选车页不再以战场地图为背景，改为独立程序化厂房车库（`js/garage.js`，全部 CanvasTexture + 合并几何体，零外部资源）。

- **场景构成**：46×34×12.6m 车间——混凝土地面（油渍/伸缩缝/划痕 + 黄色安全标线 17×13m 检修位 + 工位编号"03"，配套 roughnessMap 让油渍反光）、混凝土裙墙 + 压型钢板墙 + 工字钢柱 + 夹丝玻璃窗带（自发光）、屋顶桁架/檩条 + 采光带、桥式天车（轨道/端梁/小车/吊钩吊装木箱微摆）、滑升大门 + 车间标牌、海报/管线/风机/工具柜/工作台/油桶/弹药箱/托盘/电缆卷筒/轮挡等工位细节。
- **光照**：5 盏射灯（暖主光 A + 冷轮廓光 B 双投影 + 广角补光 C + 门墙洗光 D + 工位洗光 E）+ 自发光灯具/光晕 + ShaderMaterial 体积光锥 + 300 粒浮尘 + 采光带冷顶光 + 日光灯随机闪烁 + 控制柜警灯呼吸 + 排风扇旋转；`PMREMGenerator.fromScene` 从厂房自身生成环境贴图（`scene.environment`，intensity 0.3，hide 时还原 null）提升金属/漆面反射。
- **接线（main.js）**：`_enterHangar()` 首次 `new Garage(scene, renderer, quality)`（同步构建约 2s）并 `show()`（隐藏 `world.root` 连同其全部光照，曝光 1.08）；`_setupMenuShowcase()` 在车库可见时给 menuTank 传 `_garageWorld = { groundY: () => 0 }`（展示车落 y=0 水泥地）；`_startBattle()`/`_endToMenu()` `hide()` 还原战场与地图曝光；机库态屏蔽远景氛围烟柱；`_frame()` 中 `garage.update(dt)` 驱动动画。车库常驻只切换 visible，二次进入 3ms。
- **曝光校准**：曝光/主光强度经页面内参数扫描定稿（A=1500/B=1300/C=1600，exposure 1.08）——沙色涂装（M1 系）爆白 <6%，暗绿涂装（T-90M）均值 68 可读；改灯光后建议双车复测。
- **性能**：~180 draw calls / 8.9 万三角形（远低于战斗场景），2 个 1024² 射灯阴影。
- 回滚点 `backup/pre-garage/`（garage.js 之前完整 js/ + index.html + style.css）。
- **快速选择下拉（2026-09-08）**：翻页按钮下方 30px 的玻璃拟态下拉框（`.fh-select`，旗帜+车名+国别，当前项高亮，细琥珀滚动条），点击项走与翻页共用的 `_selectHangarTank(key)` 装载管线（缓存秒切/未缓存分帧装载）；下拉显示与翻页选择双向同步（`ui.refreshHangar` 统一入口）。

***

## 四、坦克配置详解（config.js）

### 4.1 坦克列表

| key           | 名称          | 模型                  | scale  | forwardAxis | engineType | 备弹(AP/MG) |
| ------------- | ----------- | ------------------- | ------ | ----------- | ---------- | --------- |
| t-90m3        | T-90M「突破-3」 | t-90m3.glb          | 0.0468 | +z          | diesel     | 30/2000   |
| t-80u         | T-80U       | tank\_t-80u.glb     | 1.0    | +z          | turbine    | 30/2000   |
| leopard\_2a7  | 豹 2A7+      | leopard\_2a7.glb    | 1.0    | +z          | diesel     | 42/4750   |
| m1a1sa        | M1A1 SA     | m1a1sa.glb          | 1.0    | +x          | turbine    | 40/1200   |
| m1a2\_trophy  | M1A2 SEPv3  | m1a2\_trophy-hv.glb | 1.0    | +z          | turbine    | 40/1200   |
| challenger\_3 | 挑战者 3       | challenger\_3.glb   | 1.0    | +x          | diesel     | 40/2000   |
| leopard\_2a4  | 豹 2A4       | leopard\_2a4.glb    | 1.0    | +x          | diesel     | 35/4750   |
| t-90sm        | T-90SM「塔吉尔」 | t-90sm.glb          | 0.76   | +z          | diesel     | 30/2000   |
| abrams\_x     | abrams-X    | abrams\_x.glb       | 0.008  | +z          | turbine    | 40/300    |
| t-14\_armata  | T-14「阿玛塔」   | t-14\_armata.glb    | 0.09   | +z          | turbine    | 32/2000   |
| ztz-99a       | ZTZ-99A     | ztz-99a.glb         | 1.0    | +z          | diesel     | 30/2000   |
| leclerc\_s2   | 勒克莱尔 S2    | leclerc\_s2.glb     | 1.0    | +z          | diesel     | 40/2500   |
| merkava\_mk4  | 梅卡瓦 Mk4    | merkava\_mark\_iv.glb | 1.0  | +x          | diesel     | 44/2500   |
| type\_10      | 10式         | type\_10.glb        | 1.0    | +z          | diesel     | 36/2000   |
| kf51          | KF51「黑豹」  | kf51\_panther.glb   | 1.0    | +z          | diesel     | 28/2500   |
| t-72b3        | T-72B3       | t-72b3.glb          | 1.0    | +x          | diesel     | 40/2000   |
| strv\_122a    | Strv 122A    | strv\_122a.glb      | 1.0    | +z          | diesel     | 42/4750   |
| leopard\_2ri  | 豹 2RI       | leopard\_2ri.glb    | 1.0    | +z          | diesel     | 37/4750   |
| challenger\_2 | 挑战者 2     | challenger\_2.glb   | 1.0    | +x          | diesel     | 45/3000   |
| arjun\_mk1a   | 阿琼 Mk.1A   | arjun\_mk.ia.glb    | 1.0    | +z          | diesel     | 39/2500   |

> 2026-09-07 新增四车（来源 `newTankmodel2/`，接入方案与实测坐标见 `docs/new-tanks-t72b3-strv122a-leo2ri-challenger2.md`）：
> - **T-72B3**（俄系音效/`ru` 分划，无热像——与 T-90 系同代差设计）：Sosna-U 猎歼火控 + Kontakt-5（车体首上/侧裙/炮塔）；**倒挡全场最慢（2.2m/s ≈8km/h，T-72 侧变速箱特征）**、炮塔转速 0.58 全场最慢；车顶 NSVT 出厂朝后收纳（mgFlipY: true）：构建时绕枪架翻转 180° 成战斗朝向，伺服 rotation.y = mgYaw + π；内衬件白色贴图穿帮 → interiorTint 染车体系橄榄绿；负重轮为独立节点可旋转。
> - **Strv 122A**（瑞典 `se`/德系音效/`de` 分划）：豹2A5 深改型，L/55 + DM53 穿深 660；**倒挡 31km/h 并列全场第一**、功重比 24.2 仅次于 10式/2RI；Object_31 为导出产物高板（顶高 4.1m）已隐藏；瑞典国旗 `flags/se.png` 程序化生成。
> - **豹 2RI**（印尼 `id`/德系音效/`de` 分划）：2A4RI 升级型，功重比 26.8 **全场第一**；模型 4 辆中最宽（3.95m，含侧裙附加装甲）；Object_18 按 md 标注隐藏；印尼国旗 `flags/id.png`。
> - **挑战者 2**（英系音效=挑战者3 同套/`uk` 分划）：**炮塔正面 900mm 全场最硬**（多切斯特装甲身份）+ HP 1780；120mm 线膛炮 CHARM 3（680/440，低于挑战者3 的滑膛 720）；发射药隔舱化 ammoRackChance 0.14、低温慢燃发射药 fireChance 0.18；与挑战者 3 方向一致（`+x` 烘焙）。
> - **两辆豹式（strv/2ri）与挑战者 2 车顶机枪节点均为单位 TRS**（WT OBJ 合并网格导出）——`tank.js` 机枪伺服支点新增兜底：节点原点不在机枪包围盒内时，用首件机枪网格（config 约定列为枪架件）的包围盒底面中心作枪架回转中心（不能用整组包围盒中心——会落在枪管中段，旋转时整枪甩出炮塔）；type_10 同样受益。
> - **材质兼容**：strv/2ri 源文件为 `KHR_materials_pbrSpecularGlossiness`（three 0.185 GLTFLoader 已移除支持，渲染白模），已用 `gltf-transform metalrough` 转换为标准 metallicRoughness 后再 DRACO 压缩（37/38 张贴图保留，自带迷彩，无需程序化迷彩）。
> - 四车均约 1:1 米制（scale 1.0）、履带底贴地（无 modelYOffset）；`se`/`id` 无国别 BGM（个性化模式回退 start.mp3）。

> 2026-09-08 新增阿琼 Mk.1A（`arjun_mk1a` · 印度/德系音效/`de` 分划，来源 `newTankmodel2/arjun_mk.ia.glb`，标注 `arjun_mk.ia.md`）：
> - 实车参数：MTU MB838 1400hp + 68.6t（20.4hp/t）· 极速 58km/h · 120mm 线膛炮 600 穿/430 伤 · 人工装填 7.0s · Kanchan 复合装甲（620/780）· 热像 ✓。
> - WT 导出同源处理：`gltf-transform metalrough`（spec-gloss→metalRough）+ DRACO（28.7→18.6MB）；md 标注隐藏件 Object_20（横跨炮塔的导出产物薄板）；Object_21 为真实炮塔尾储物篮（保留）。
> - 车顶机枪节点单位 TRS → 支点兜底（首件 Object_16 枪架件包围盒底面中心），枪管朝前无需 mgFlipY；无国别 BGM（回退 start.mp3）。
>
> 2026-09-06 新增三车（来源 `newTankmodel2/`，接入方案见 `docs/new-tanks-leclerc-merkava-type10-design.md`）：
> - **勒克莱尔 S2**（法/英系音效/`de` 分划）：尾舱自动装弹机 6.0s、炮塔转速 0.80 全场最快；模型无车长机枪网格，用 `mgMuzzleLocal` 虚拟枪口；`parts.hidden` 隐藏导出产物 Object_18（炮塔尾异常高板）。
> - **梅卡瓦 Mk4**（以色列/美系音效/`us` 分划）：**发动机前置**（internal.engineBox 在车首 z[+2.0,+3.3]）、弹药架后置隔舱（ammoRackChance 0.14 最低）、Trophy 主动防御；负重轮为左右合并网格，`wheelsRotate: false`；车体裙板 ERA（era12+）留在车体、炮塔顶 ERA（era02-10）随炮塔。
> - **10式**（日本/德系音效/`de` 分划）：功重比 25hp/t 全场第一、CVT（clutchDelay 0.28）、散布 0.0014 并列第二；车顶 RWS 实体机枪（Object_10/36/13）；`parts.hidden` 隐藏 Object_30。
> - 三车均约 1:1 米制（scale 1.0）、履带底贴地（无 modelYOffset）、fireAim 用苏系 `auto-inner.mp3`；fr/il/jp 无专属狙击镜分划与国别 BGM（复用 de/us 分划、回退 start.mp3）。
> - 豹 2A7 pivot/muzzle 已按 8-31 重导出模型实测校准（旧值炮弹出生点低于炮管 1.5m）。

### 4.2 关键配置字段

```js
{
  id, name, model, scale, forwardAxis,
  engineType: 'turbine' | undefined,  // 燃气轮机=灰色排气
  parts: { turret, mg, barrel, track, wheels, fixedToHull, hidden },
  turretPivot, barrelPivot,           // 旋转轴心（模型局部坐标）
  muzzleLocal,                        // 炮口位置
  mgMuzzleLocal,                      // 机枪枪口（T-14用虚拟位置）
  exhaustLocal: [[x,y,z],[x,y,z]],   // 2个排气点
  trackLocal,                         // 履带扬尘点
  mass, engineHp, maxSpeedForward, maxSpeedReverse,
  shellName, dispersion, armor: { ... },
  mg: { rate, dispersion, range, ... },
  sound: { engine, mg, fire, fireAim, seg: { ... } },
}
```

### 4.3 弹药系统

- `AMMO` 表在 config.js 末尾，批量注入 `shellAmmoMax` 和 `mg.ammoMax`
- **三弹种**（`SHELL_TYPES`）：AP（基准，穿深随距离衰减，跳弹角71°）/ HEAT（0.9倍穿深、无衰减、跳弹角65°、角度等效最多5倍、弹速0.56倍）/ HE（0.13倍穿深、永不跳弹、未击穿12%溅射、高断履带率）
- 备弹按 `AMMO_SPLIT`（60/25/15%）拆分为 `shellPool {ap, heat, he}`（各项至少2发）
- `tank.js switchShell(type)` 切换弹种；`main.js` 数字键 1/2/3 触发
- `main.js` 机枪开火消耗 `mgAmmo`，耗尽不能开火
- UI 左侧纵排弹药数字卡（AP/HEAT/HE/MG，50×60 卡片：带色标题 + 白色数字 + 右侧余量百分比条），当前弹种高亮，低于 20% 数字变淡红

### 4.4 对局规则（duel2 迭代）

- **战斗时限**：600s（`GAME.timeLimit`），HUD 左上倒计时（<60s 变红闪烁），超时按剩余血量百分比判定胜负（相等平局）
- **随机出生**：平原约 600m 对峙（12次尝试挑选车长塔初始通视的方位，失败回退固定南北）；小镇南北 1400m 公路对峙（超出 1000m 观察距离，开局互盲）。观察距离 1000m（移动观察者 +100m），开火暴露 1400m/3s（玩家与 AI 对称）
- **结算统计**：用时/射击数/命中率/总伤害/阻挡伤害/模块战果

### 4.5 AI 难度（机库页选择）

- `AI_DIFFICULTY`：新手/标准/王牌，影响瞄准误差、开火犹豫、交战距离、弹种切换、弱点瞄准、低血周旋
- **M1 行为（仅王牌）**：短停射击（装填就绪即停车收敛散布 <0.0024 再开火，单步模拟命中率 20~35%→45~60%）+ 开火后随机位移 1.5~3s（利用自身开火暴露窗口，方向随机反套路）+ 障碍绕行（路径前方 22m 障碍圆切向转向）
- **M3 AI 战术补完**：①烟雾运用（王牌 `smokeUse`）——低血撤离前 75% 拉烟掩护倒车路线、无合格掩体时 25% 决策「拉烟+转移」（`smoke.fire` 扇形发射，烟云遮断玩家视线触发 lostContact）；②受击立即决策——被命中（HP 下降）即中断 peek/立即 `_postFireDecision`（找掩体概率 85%），不再等待下次开火；③主炮弹道遮挡门控——炮口→目标视线被掩体/地形挡住时不开火（省弹药、不误拆自家掩体），王牌切 HE 低频「拆掩体」（HE 是唯一能摧毁建筑结构的弹种，40% 开火率拆墙后恢复 AP）；拆掩体开火不重排战术决策
- **平原地图扩充（M2.8）**：①平原出生距离 600m → **1300m**（随机方位 ±650m，开局互盲推进接触；小镇保持 1400m）；②新增 **5 处零散村落**（每村 2~3 户东欧小镇民居套件院落——主屋/谷仓 + 围栏院落 + 柴堆树，复用提取出的共用摆放引擎 `createKitPlacer(groundY, rand)`（小镇/平原共用同一套 household/placeKit 资源与合批管线，V 形双坡屋顶等原版模型），注册碰撞障碍 = 掩体/阻挡坦克/挡视线，避开出生环带 ±130m 与中央 190m）；③新增 **16 座程序化巨石掩体**（Icosahedron(1,2) 同位焊接径向位移 + 程序化岩石贴图：地层色带/颗粒/裂缝/地衣，材质 `color 0x968f80 + flatShading` 防强光过曝，沉底 16%、5 发炮毁可压扁，注册障碍 r≈s×0.95 阻挡坦克与视线）；平面/村落/巨石均避开中央与出生环带
- **履带地形贴合（M2.7）**：坦克姿态采样从中线四点改为**两侧履带前后接地点四点采样**（沿车头 ±`length×0.27`、横向 ±`width/2−trackWidth/2`），前后均值算俯仰、左右均值算侧倾、四点均值作垂直基准——等价于四点最小二乘平面拟合，扭转地形不再单侧履带悬空；新增 `world.surfaceY(x,z)` 路面抬高钩子（小镇沥青主路 +0.07 / 路肩 +0.035，与 buildRibbon 渲染 yOff 一致），并**并入 `world.setGroundY` 全局高度**——履带印、炮弹爆炸、特效、视线全部自动贴合沥青路面（修复公路上履带陷入 7cm）
- **弹药与低血撤退战略（M2.6）**：主炮备弹三弹种全量增加（`buildShellLoadout`：基础配比 60/25/15 之上 AP +50%、HEAT/HE 各 +30%，不削减其他弹种；总备弹约 +40~50%）；AI 当前弹种打空自动切到有备弹弹种（绕过切弹冷却）；低血周旋升级为**战略撤退**——触发时选目标：优先倒车**入掩体**（到位转 M2 藏身/探头伏击，周旋冷却 8~12s 防立刻重复触发），无掩体则倒到**脱离玩家视野**即收（`!canSee(player,t)` 判定）；倒车全程保持反击 + 正弦摆动规避
- **M2.5 对峙姿态与伏击（仅王牌 `tiltDuel`）**：游走改为「斜对敌摆角」——车头对敌 ±(23~46°) 随机摆角承弹，沿斜线小幅进退保持距离带（倒车镜像适配），**绝不横对/尾对玩家**（实测横对占比 0%）；正面穿不透（`_needFlank`）时仍保留绕侧找侧面的绕圈。peek 探头停车后车体原地缓慢摆回对敌斜角再开火（伏击姿态）。原 90° 横向绕行游走仅保留给新手/标准难度（更大被弹面 = 更好打）
- **M2 掩体系统（仅王牌）**：开火后概率化战术决策（找掩体 60% / 侧移 25% / 原地对射 15%；刚被击穿找掩体概率升至 85%，连续两次同行为强制切换防套路）→ `cover` 奔向评分最高掩体点（15~60m 环带 24 点采样：车体眼高被挡+炮塔眼高通视=hull-down 3 分/纯藏身 1 分 + 贴近硬掩体加分 − 距离/路径惩罚，直线穿障点直接跳过）→ `holding` 藏身换弹 → `peek` 前探 ≤12m 至炮塔通视 → M1 短停开火 → 再决策；转移中（moving/holding）不开炮保证闭环；卡死 2.5s 自动放弃掩体回退普通机动。机枪/机炮扫射修正：玩家自动机枪目标必须已点亮（`e.spotted`）且 `canSee` 通视才开火，AI 机枪同样加 `canSee` 门控（地形遮挡/烟雾/失联保持期内停射不耗弹）
- **驾驶/镜内手感**：小镇铺装路（主路 6m/路肩 10m，`world.isOnRoad` 系数 0.2/0.5/1）悬挂颠簸分层衰减；镜内静止时稳定器残差近零（`camera.js eng` 公式 0.00005 + 油门/车速项），镜内开火上跳 0.022→0.009 rad、相机后拉与 FoV 冲击同步下调（现代火控防抖）
- 失联包抄（flank 状态斜插侧翼）、低血周旋（evade 倒车拉距+烟雾）、起火/断履带反应性使用消耗品
- `TankAI(tank, difficulty)`，难度来自 `ui.aiDifficulty`

### 4.6 消耗品

- `tank.js`：`consumables {repair:1, ext:1}`，`useRepairKit()`（修全部模块+装填倍率还原+观瞄/雷达复位）、`useExtinguisher()`
- 爆反板是物理消耗，维修包**不可**修复
- 玩家 R/T 键（`main.js`），AI 按 `burnReactT/trackReactT` 反应时间使用
- HUD 左下消耗品图标，用掉置灰划线

### 4.7 防护体系（爆反 / APS / 观瞄）+ 机枪扫射毁伤

配置常量在 `config.js`：`ERA_TYPES` / `APS_RULES` / `SENSOR_RULES` / `mgFalloff()`。

**爆反装甲（ERA）**：按区分板（炮塔前/车体前/炮塔侧/车体侧），坦克配置 `era: { type, plates, base }`。

- 炮弹命中带板区：先扣板再结算，按弹种削穿深（Kontakt-5：AP -8 / HEAT -45 / HE -10；Relikt/FY-4/Malachit 依次更强）
- HE 直击额外多剥 1 块（HE 是剥板工具）
- 板耗尽后该区装甲回落到 `base` 裸值
- 机枪/机炮扫射剥板：按口径累积毁伤点，满 `plateHp`（20）剥 1 块

**主动防御（APS）**：拦截窗内掷判定空爆拦截来袭炮弹（`shell.js`）。

- 4 发拦截弹/场，发射后冷却 12s（连射第二发能穿）
- 拦截窗 8–25m，弹丸飞行 <40m 不触发（贴脸直射免疫）
- 雷达完好发射率 50%，雷达损伤档（HP<50%）降至 30%；发射后 70% 实际摧毁弹丸（30% 破片未摧毁，弹丸继续飞）
- 雷达 HP 60，可被机枪/机炮扫伤

**观瞄系统**：HP 80，分级完好/损伤（<50%）/损毁；损伤档散布×2，损毁档散布×8（等效半盲）。

**机枪/机炮扫射毁伤**（`tank.applyMGDamage`，hitscan 在 `main.js` 机枪段）：

- **永不伤害 HP** —— 只打外露子系统（剥爆反板 / 伤 APS 雷达 / 伤观瞄），避免高射速磨死坦克
- **按口径分级**（每有效命中毁伤点）：
  | 口径   | 爆反 | 雷达 | 观瞄 | 附加        |
  | ---- | -- | -- | -- | --------- |
  | 7.62 | 0（无法伤爆反） | 2  | 2  | —         |
  | 12.7 | 0.8 | 3  | 3  | —         |
  | 30mm | 6  | 5  | 6  | 2% 概率扫断履带 |
- **距离衰减**（分段线性 `mgFalloff`）：命中率 ≤50m 50% → 100m 40% → 300m 5% → 400m 2% → **≥500m 无**；毁伤 ≤100m 全额 → 200m ×0.5 → 300m ×0.1 → 500m 归零。未通过命中率判定的命中 = 打在无害部位（只有弹着特效）
- 玩家机枪扫射敌方；**AI 也会自动扫玩家**（`ai.js _updateMG`，参数 `AI_MG_RULES`）：目标进入 min(400m, 本车射程) 且被点亮（机枪 300m / 30mm 机炮 400m） → 反应延时 1.4~2.8s → 连发 4~7 发 → 停射冷却 2~3.6s 循环；命中率 = 距离衰减 × 0.5，毁伤 = 距离衰减 × 0.6，附加瞄准扰动，同样永不伤 HP。受击反馈走 `onMGHit` 回调（hitLog 红 + 飘字）。倒计时一律钳位到 0（哨兵 -1 专表"未启动"，防过冲负值引发"计时器反复重置、永不开火"死循环）

**AI 适配**（`ai.js`）：王牌难度抓玩家 APS 冷却/雷达损毁窗口立即开火（跳过开火犹豫）；自身观瞄/雷达损毁 2.5s 反应用维修包修复。

**HUD**：左下单行 `#prot-panel`（烟雾弹行上方，扁平化分段色块 `#2a4a6a`，warn 金黄 / dead 红）—— ERA 前侧板数、APS 拦截弹（●）+冷却+雷达档、OPT 完好/受损/损毁、LWS 压制器冷却/档位；无该系统的车隐藏对应项。

### 4.8 激光告警/压制（LWS，2026-09-06 新增）

配置常量：`config.js LWS_RULES`；装备车：ZTZ-99A（`lws:{model:'JD-3'}`）、T-90M/T-90SM（Shtora-1）。文档见 `docs/laser-suppression-design.md`。

- **触发四前提**（双向一致）：玩家开镜瞄准 + 准星射线命中目标 + 视线通畅（地形/掩体/烟雾可断）+ 目标处于射手炮塔正面 ±110° 扇区（`LWS_RULES.sector`）
- **激光告警**：AI 炮塔锁定玩家（对准 + 射程内）→ 罗盘下方红底白字「⚠ 被激光测距定位」告警框（`ai.js _setLasing` 沿触发 → `main._updateLaser`）
- **压制（10s 冷却，目标压制中不叠加）**：我方压制敌 AI → 敌 2.5s 停瞄准射击（炮塔停跟/不开火/机枪停射，机动照常），HUD 绿底「激光压制中」倒计时；敌方压制玩家 → 镜内白幕 2.5s×难度系数（`AI_DIFFICULTY.laserBlindMul` 0.6/1.0/1.3），关镜即免疫，白幕期间 AI 照常开火
- **压制器**（炮塔外设备）：HP 60，机枪按口径扫伤（`SENSOR_RULES.caliber.laser`：7.62→2 / 12.7→3 / 30mm→5），损伤档（<50%）发射成功率 50%（未发射不耗冷却），损毁离线；维修包可修，AI 会反应性抢修
- 激光告警接收机为全车标配（纯 UX，无装备差异）；压制器仅上述三车装备，形成选车差异

***

## 五、资源加载与优化

### 5.1 GLB 模型

- **DRACO 压缩**：原始 144.8MB → 压缩后 80.4MB（降44.5%）；2026-09-06 新增三车 18.7MB（leclerc_s2 10.1 / merkava 4.1 / type_10 4.6）；2026-09-07 新增四车 49.2MB（strv_122a 17.6 / leopard_2ri 12.7 / challenger_2 6.0 / t-72b3 7.9）
- **并行加载**：`Promise.all` 同时加载 `TANKS` 全部模型（按配置驱动，新增坦克自动纳入）
- **DRACOLoader**：CDN解码器 `three@0.185.1/examples/jsm/libs/draco/`
- **SpecGloss 兼容**：main.js 注册 `GLTFPBRSpecGlossExt` 插件兼容旧 spec-gloss 材质；2026-09-07 的 strv/2ri 已直接转换为标准 metallicRoughness（`gltf-transform metalrough`），两条路径均可用
- **原始备份**：`model_bk/` 目录保存未压缩 `.glb.bak`（2026-09-07 四车为 `.glb.orig`）

### 5.2 服务器（server.js）

- **gzip 压缩**：level 5，对 html/js/css/json/svg/glb 启用
- **缓存**：开发期代码文件（html/js/mjs/css）一律 `no-store`（每次重新拉取，避免改代码后浏览器用旧缓存导致"改了没生效"）；模型/贴图等大资源 `max-age=3600`
- **MIME**：支持 .glb/.wasm/.mp3 等类型

### 5.3 音频（audio.js）

- 35个MP3，按需加载（非预加载）
- WebAudio API + `decodeAudioData` 解码
- 分层加载：通用音效（用户手势后）+ 坦克专属音效（战斗开始时）
- 大量程序化合成回退（发动机/机枪/爆炸等）
- **物件音效（2026-09-03 新增）**：`sound/props/` 10 个 MP3（房屋倒塌大/小、房屋中弹、树木压倒/吱嘎/炮轰倒、非植物物品撞毁、撞房屋、碾木栅栏、碾废墟），`audio.loadPropSounds()` 手势后加载，`audio.playProp(name, vol)` 播放（同名 120ms 去重）；可破坏系统程序合成音已全部替换。文件↔场景对照与调参入口见 `docs/物品音效对照表.md`

### 5.4 背景音乐（audio.js BGM 管理器 + `bgm/` 目录）

- **实现**：HTMLAudio 元素（`new Audio()`，不挂 DOM），音量 = 主音量 × BGM 音量（设置存 0-100）；代际令牌 `bgmGen` 防止换曲/停止后旧 `onended` 再触发
- **曲目**（`config.js BGM` 表 + 坦克 `nation` 字段）：
  - `bgm/end.mp3`：封面/菜单/车库/结算，无缝循环
  - `bgm/start.mp3`：战斗默认曲目，循环间静默 10s（`BGM.gap`）
  - 国别曲（个性化模式）：us1 / ge1 / en1+en2 / rus1+rus2+rus3，与 start.mp3 组成列表洗牌轮播（一轮播完重新洗牌）；未配置国别（如中国 ZTZ-99A）回退 start.mp3
- **两种模式**（设置面板二选一，默认标准）：
  - **标准模式**：进入战斗立即播放 start.mp3
  - **个性化模式**：进入战斗后等待玩家**首次按 W**（开始机动）才播放国别列表
- **设置**：背景音乐开关（默认开）+ 音量滑杆（默认 50）+ 战斗音乐模式下拉；localStorage 持久化（`ironwar_settings`）
- **挂钩点**（main.js）：封面点击（audio.init 后启动菜单 BGM）/ `_startBattle`（先 `stopBGM` 再按模式分流）/ `_playerControl`（`_bgmPending` 检测 KeyW）/ `_finishBattle`（回菜单曲）/ `_endToMenu` / `_pause`+`_resume`（暂停/恢复 BGM）
- **注意**：模式切换在下一次开战斗时生效；`new Audio` 的资源加载在 performance 面板只显示首块大小（流式），非异常

### 5.5 纹理

- 全部程序化生成 `CanvasTexture`（无外部纹理文件）
- 粒子：3个 128×128
- 地面：1个 512×512（anisotropy 8）
- 履带印：1个 64×128

***

## 六、UI 系统

### 6.1 屏幕切换（ui.js `show(name)`）

```
screens: cover / menu / hangar / hud / result / pause
```

切换时 toggle `active` class。HUD显示时额外加 `active`。

### 6.2 HUD 元素

- 左上：HP条 + 坦克名
- 左中：弹药数字卡（AP/HEAT/HE/MG 纵排，`ui.js buildAmmoPanel` 动态生成：50×60 卡片，标题带琥珀底色 + 数字 + 右侧 4px 余量百分比条；当前弹种高亮，<20% 淡红）
- 左下：烟雾弹计数 → 消耗品（维修/灭火）→ 防护体系状态（`#prot-panel`：ERA/APS/OPT 三行，ui.js `_updateProt`）
- 底部：速度表 + 档位 + 敌方剩余
- 中心：准星 + 装填环 + 散布圈
- 右上：测距 + 目标名 + 瞄准进度
- 右下：小地图

### 6.3 字体

- 主标题/结算/暂停：`Oswald`（Google Font，现代硬直风格）
- 正文：`Microsoft YaHei` / `Segoe UI`
- 旧书法字体 `STKaiti/KaiTi` 已全部替换

### 6.4 狙击镜分划（六国风格，2026-09-01 重构）

**架构**：`index.html` 的 `#gs-svg` 只保留通用壳（圆形遮罩/外环/装填大光圈/读数），全部分划图形由 `js/reticles.js` 的模板生成到 `<g id="gs-reticle">`。

- 坦克配置 `cfg.reticle` 指定风格；`main.js _startBattle()` 调 `ui.buildReticle(cfg.reticle)`（style 不变跳过重建）
- 绘制机制：双层描边（`gs-out` 底衬白 + `gs-ink` 主线，零 filter 保证任何背景可见）；强调色类 `gs-acc`（线）/ `gs-acc-f`（实心）/ `gs-acc-t`（文字）/ `gs-dot`（红点）
- 各国配色由 CSS 风格类覆盖（`gs-ret-ru/us/cn/uk/de/x/fr/il/jp/nx` 只改颜色，结构在模板里）

| 风格 | 坦克 | 分划特征 | 强调色 |
| --- | --- | --- | --- |
| `ru` | T-90M / T-80U / T-90SM / T-14 | 苏式炮队镜：垂直粗线+人字准星+密位环+测距抛物弧+四角取景标 | 琥珀 |
| `us` | M1A1 SA / M1A2 SEPv3 / 梅卡瓦 Mk4 | M1 式细十字+中心小十字+弹道距离阶梯（×100m）+提前量门括号 | 橄榄绿主线+荧光绿 |
| `cn` | ZTZ-99A | 缺口瞄准圆环+十字外延+km 阶梯+四角目标框定括号 | 红 |
| `uk` | 挑战者 3 / 挑战者 2 | 倒 T 水平基准+密位上下交替+对向箭头 stadiametric 测距 | 琥珀黄 |
| `de` | 豹 2A7 / 豹 2A4 / 勒克莱尔 S2 / 10式 / Strv 122A / 豹 2RI | EMES-15 中心圆+横向提前量箭头+右下 Zeiss 测距弧 | 冷蓝白 |
| `x` | AbramsX | 数字全息 HUD：双层四角括号+密位方块列+数据标签框 | 青 #7de8ff |
| `fr` | 勒克莱尔 S2 | SAGEM 细十字+上指人字+提前量门括号+右下测距弧 | 法国蓝+红点缀 |
| `il` | 梅卡瓦 Mk4 | BMS 方括号框+下部漏斗测距+大卫之星标识 | 钴蓝 |
| `jp` | 10式 | 陆自极细十字+中心菱形+交替密位+四角框定 | 绯红+樱粉读数 |
| `nx` | KF51「黑豹」 | 未来感全息：双环锁定圈+锁定爪+倒V漏斗+数据弧条 | 荧光黄绿 #c8ff4d |

**模板布局约束**（新增分划时遵守）：

- 坐标系 = viewBox 1000×1000，中心 (500,500)；主瞄准点必须在正中心
- 中心 r≈60 内避让装填大光圈与就绪文字（y≈592）；大元素从 r>90 起
- 所有图形落在 r<465 内（圆形遮罩 r=470，`preserveAspectRatio="slice"`，视口下 SVG 单位 ≈ 屏幕像素×视口宽/1000 的缩放）
- 装填环/读数行/散布虚线圈为通用游戏性指示，不分国别

***

## 七、标注工具

### 7.1 mg-marker.html

- 用途：标注机枪枪口位置
- 操作：加载模型 → 左键点击表面 → 导出 `mgMuzzleLocal`
- 支持：T-14、abrams\_x、ztz-99a

### 7.2 exhaust-marker.html

- 用途：标注2个排气点位置
- 操作：加载模型 → 切换选点1/2 → 左键点击 → 导出 `exhaustLocal`
- 支持：全部11款坦克
- 加载时自动显示当前config中的排气位置

### 7.3 scripts/probe_new4.html（2026-09-07 新增）

- 用途：新坦克接入验证——按 `tank.js` 同款装配逻辑（烘焙/拆分/机枪支点兜底）加载模型，
  可视化炮塔轴（绿）/耳轴（蓝）/炮口（红+30m射线）/排气（橙）/扬尘（白）/机枪枪口（粉）
- 操作：选车 → 视角切换 → 「旋转炮塔/俯仰/机枪伺服」动画开关，检查转轴/枪口/隐藏件
- 4 辆新车的候选坐标写死在页内 `CFG` 表，定稿后同步进 `config.js`；后续新车可照此复用

***

## 八、调试经验与注意事项

### 8.1 模型坐标系

- **所有GLB根节点有相同matrix**：`(x,y,z) → (x, z, -y)`（绕X轴-90°）
- 新坦克应使用 `forwardAxis: '+z'`（无预烘焙），pivot直接用模型世界坐标
- **不要用烘焙代码**：`gltfScene.updateMatrixWorld(true)` 会把parent的scale也烘焙进子节点，导致 scale² 问题

### 8.2 findMeshes 搜索范围

- 原来用 `sceneRoot.getObjectByName()` 搜索，但turret attach后部件脱离gltfScene
- **必须用** **`this.model.getObjectByName()`** 搜索整个模型树
- 找到Group时直接返回Group（不traverse），避免子节点被掏空

### 8.3 内存管理

- `Tank.dispose()` 必须在战斗结束时调用，释放clone的材质和纹理
- **不要dispose几何体**：它们与原始GLB资产共享引用
- `_clearBattle()` 和 menuTank 切换都调用了 `dispose()`

### 8.4 排气系统

- 燃气轮机（`engineType: 'turbine'`）：灰色/灰白色烟
- 柴油机（无 engineType）：深色烟
- 起步工况：`sp < 5` 时 `startK` 快升慢降，排气间隔从0.09s缩到0.06s
- 排气升速低（0.3\~0.8 m/s），贴地扩散，不飞高

### 8.5 弹壳抛出

- 机枪弹壳：枪口向后0.6m，向上0.2m
- 炮弹弹壳：炮塔顶部靠后1m，延迟0.8-1.2秒
- 弹壳池80个，自动回收，物理：重力/触地反弹/滚动/淡出

### 8.6 服务器启动

- `start.bat` 双击启动
- 或 WMI 后台启动：`([wmiclass]"Win32_Process").Create("node server.js", workdir)`
- 端口 8080，通过 `browser` 工具打开 `http://localhost:8080` 验证

### 8.7 语法检查

- JS 文件多为类定义，不能作为独立模块用 `node --check` 检查
- 可用 `Copy-Item js/xxx.js tmp_test.mjs; node --check tmp_test.mjs` 但类方法会报错
- 最可靠的方式：浏览器加载 + 控制台查看错误

### 8.8 GLB 压缩

- 工具：`gltf-transform draco <input> <output>`（全局安装 `@gltf-transform/cli`）
- 压缩前务必备份原文件到 `model_bk/`
- 压缩后客户端必须配置 DRACOLoader

***

## 九、性能优化记录

### 9.1 已完成优化

| 优化项         | 原值       | 新值             | 效果        |
| ----------- | -------- | -------------- | --------- |
| GLB DRACO压缩 | 144.8MB  | 80.4MB         | -44.5%    |
| 服务器gzip     | 无        | level 5        | 再减30-50%  |
| 静态缓存        | 代码 no-store / 资源 max-age=3600 | 改码即生效 + 二次加载快 |
| 阴影贴图(high)  | 4096²    | 2048²          | 渲染开销降75%  |
| 阴影贴图(low)   | 2048²    | 1024²          | 渲染开销降75%  |
| 粒子池总量       | 12000    | 8000           | 内存/迭代减33% |
| 材质dispose   | 无        | Tank.dispose() | 修复内存泄漏    |
| 车库减灯+能量补偿 | 13盏实时灯 | 8盏（半球/自发光补亮） | 逐光源片元 −38%，亮度探针校准亮度不变 |
| 机库态分辨率    | 1.5       | 1.0（战场仍1.5） | 像素量 ÷2.25 |
| 机库静态阴影    | 每帧更新   | 进库刷新一次     | 省 2 次 shadow pass |
| 机库展示车缓存+分帧预热 | 每次切车重建+重传纹理 | LRU×4 常驻 + 邻车预测预热 | 预热车 0 帧秒切，首切不冻结 |

### 9.2 性能瓶颈分析

- **主要瓶颈**：GLB内嵌纹理（未压缩），14个模型约 99MB
- **阴影开销**：2048² PCFShadowMap，单帧成本中等
- **粒子更新**：8000粒子CPU遍历，死粒子快速跳过
- **无LOD**：远距离全精度渲染（但战斗仅2辆，影响有限）
- **无后处理**：直接渲染，性能友好

***

## 十、后续可扩展方向

1. **KTX2纹理压缩**：进一步减小GLB内嵌纹理体积
2. **LOD系统**：为机库展示模型添加低精度版本
3. **后处理**：添加 bloom / SSAO / motion blur
4. **多人对战**：WebSocket 服务端
5. **更多游戏模式**：生存模式（见 docs/survival-mode-design.md）
6. **移动端支持**：触摸操控 + 适配
7. **WebGL2特性**：instanced rendering 优化重复几何体
8. **传感器/主动防御/反应装甲体系 + 机枪重做**：✅ 已实现（见 §4.7）—— 爆反/APS/观瞄三系统 + 机枪扫射外露子系统毁伤（分级/5%断履带/距离衰减/AI不扫玩家）。
9. **AI 战术智能 + 地图/手感大迭代**：✅ 已实现（M1~M3 + M2.5~M2.8）——王牌短停射击/开火后随机位移/障碍绕行/斜对敌摆角游走（绝不横尾对敌）/掩体评分与 cover-peek 伏击循环/切弹冷却防震荡/弹尽自动换弹/烟雾运用/受击立即决策/主炮弹道遮挡门控与 HE 拆掩体/低血战略撤退（倒向掩体或倒出视线）；平原出生 1300m + 零散村落（小镇民居套件，V 形屋顶）+ 程序化巨石掩体；全局 HP ×0.7、三弹种全量增加（AP+50%/HEAT+30%/HE+30%）、四履带接地点平面拟合贴合地形、路面高度并入全局采样、镜内电子稳定器与后坐防抖。（回滚点 backup/ 目录已随 2026-09-06 备份清理删除，改动内容见 docs/ 迭代记录。）
10. **激光告警/压制 + 机库体验 + 车库帧率 + 国旗面板（2026-09-06）**：✅ 已实现 —— LWS 激光告警/压制系统（99A/T-90 系，见 §4.8）；机库展示车缓存+LRU+分帧纹理预热+邻车预测预热（预热车 0 帧秒切）+ 面板只刷文字 + 载入浮标；车库减灯 13→8（半球/自发光补能量，亮度探针校准亮度不变）+ 机库态分辨率 1.0 + 静态阴影；车库介绍面板国旗（flags/）。详见 `docs/iteration-summary-2026-09-06.md`。

***

## 十一、快速上手

### 启动

```bash
# 方式1：双击
start.bat

# 方式2：命令行
node server.js
# 浏览器打开 http://localhost:8080
```

### 修改坦克配置

1. 编辑 `js/config.js` 中对应坦克的配置块
2. 排气位置可用 `exhaust-marker.html` 标注工具辅助
3. 机枪位置可用 `mg-marker.html` 标注工具辅助

### 添加新坦克

1. 将 GLB 模型放入 `model/` 目录
2. 用 `gltf-transform draco` 压缩
3. 在 `config.js` 的 `TANKS` 对象中添加配置
4. 在 `AMMO` 表中添加备弹数
5. 如有专属音效，在 `SOUND` 表中添加路径

### 调试特效

- 粒子参数见 `effects.js`，参考第三章节粒子参数说明
- 修改后刷新浏览器即可查看（无需重启服务器）
- 服务器仅修改 `server.js` 后需重启

