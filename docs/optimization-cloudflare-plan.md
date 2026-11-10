# 钢铁战线2 — 帧率 / 加载 / 在线访问优化方案

> 编制：2026-11-09　|　更新：2026-11-10（P0 目录整理与上线主体已落地）
> 目标：优化后 `git init` → 提交 → 发布到 Cloudflare Pages
> 本文所有体积/FPS 相关数据均来自本工作区实测（解析 GLB JSON chunk + sharp 实测压缩），非估算。

---

## 进度更新（2026-11-10）

本轮已完成**目录整理与上线主体准备**；P1 / P2 深度优化尚未开始。

| 项 | 落地情况 |
|---|---|
| 无用资源隔离 | 475.5MB / 38 项移入 `_archive/`（只移动未删除，`npm run restore` 一键回滚，清单 `_archive/manifest.json` 完整性 0 异常）；`.gitignore` 排除隔离区、`dist/`、IDE 缓存 |
| three 自托管 | `vendor/three/`（约 4MB：three.module.js + three.core.js + GLTF/DRACO loader + utils + OrbitControls + draco wasm/js + MIT LICENSE）；主程序与 4 个工具页全部改指本地 vendor，不再依赖 `node_modules` 或 CDN |
| 布景命名 | `【5】lowpoly_buildings.glb` → `houseModel/town_kit.glb`；`oject/` → `objects/`，同步 `js/main.js`、`map-test.html`、`scripts/analyze_map_models.js` |
| 上线主体 | `npm run build` → `dist/`：133 个文件 / 209.5MB，含 `_headers`、`BUILD_INFO.json`；`npm run preview` 本地预览 |
| 校验 | `node scripts/verify-release.mjs` 静态校验通过；`node scripts/verify-browser.mjs` 端到端通过（封面→菜单→机库→战斗，0 个 404 / 0 个页面异常），基线 `drawCalls=246 / triangles=240959 / textures=58 / geometries=372` |
| 基线提交 | `git init` + `6c60b16`（219 文件），原始 GLB 冷备 `_archive/model-original/`（170MB） |
| 性能基线 | `scripts/probe_perf.mjs`：town 17.5 FPS / 138 calls / 1.83M triangles；plains 12.5 FPS / 183 calls / 0.92M triangles（headless 软渲染，仅作相对对比，不代表真机帧率） |
| 待办 | **无损**纹理压缩、按需加载、帧率优化、Pages 发布（等账号信息） |

> **判断修正**：实测战斗态 `renderer.info.memory.textures=58`，说明 three 只在渲染时把纹理上传 GPU，此前「全量约 1GB 显存常驻」是理论上限而非常驻实测值；但 20 个 GLB 的 **172MB 下载量**与 CPU 侧解码/内存压力依然真实存在，仍是 P1 首要目标。

> **决策变更（2026-11-10，用户要求「无画质损失」）**：阶段 1 弃用 §3.1 的 WebP q80 有损方案（169.8→39.5MB 数据仅作参考）。改为 **PNG 无损重压缩 + JPEG 原样保留 + 同 GLB 重复贴图去重**：像素完全不变，不改 `mimeType`、不加 `EXT_texture_webp`、不碰几何与节点名，只替换 image bufferView 字节，风险最低。实测无损组合可把 GLB 总量从 169.8MB 降到约 **105~120MB（-30~38%）**；其中 264 张 PNG 共 111.5MB，无损 PNG 重压后合计 61.1MB，而无损 WebP 为 85.8MB（反而更大，故不引入）。跨 GLB 的 114 张重复贴图无法在单个 GLB 内共享，需后续纹理外部化才能利用，精确值以转换脚本输出为准。零损失下体积收益有限，因此**首屏优化主要靠阶段 2 按需加载**（172MB → 3~5MB）。

---

## 0. 结论速览

| 优先级 | 动作 | 实测/预期收益 |
|---|---|---|
| P0 | 修 three / DRACO 路径 + 建 git 仓库与 `.gitignore` + `_headers` | **不修则线上白屏**；仓库从约 760MB 降到约 80MB |
| P1-1 | 20 个 GLB 内嵌纹理整体转 WebP（保节点结构） | **169.8MB → 39.5MB（-77%）**，实测 513 张图 0 失败 |
| P1-2 | 首屏由「全量并行加载 20 辆车」改为按需分阶段加载 | **首屏 172MB → 3~5MB**；显存峰值 1GB → 100~200MB |
| P1-3 | JS 打包 + BGM 转码 | 22 个模块请求 → 1~2 个；BGM 29MB → 约 12MB |
| P2 | 自适应 DPR / 阴影分级 / draw call 合并 / 粒子局部上传 / HUD 节流 | 中低端机稳定 45~60 FPS，减少切车与开镜卡顿 |
| P3 | KTX2 GPU 压缩纹理 / Service Worker / 内容哈希 / 国内镜像 | 显存再降 4~8 倍，二次访问秒开 |

**一句话**：当前最大问题不是渲染算法，而是「一次性下载并解码 170MB 模型、约 1GB 纹理全部塞进显存」。先修加载模型，再谈帧率；同时 P0 的三个部署阻塞项必须先解决，否则 Pages 上线即白屏。

---

## 1. 现状体检（实测数据）

### 1.1 体积构成

| 目录 | 体积 | 运行时是否需要 | 处理建议 |
|---|---:|---|---|
| `model/` 20 个 GLB | 169.8 MB | 是（但仅需 2~3 辆） | 纹理压缩 + 按需加载 |
| `newTankmodel2/` 13 个源模型 | 231 MB | 否（原始导出件） | 不入库，留在本地或冷备 |
| `model_bk/` 备份 | 147 MB | 否 | 不入库 |
| `houseModel/` 18 个 GLB | 85 MB | **仅 6 个 / 2.6 MB** | 其余 12 个约 82MB 不入库 |
| `node_modules/` | 78 MB | 否（但当前代码依赖它的路径） | 不入库；改为 vendor 或打包 |
| `bgm/` 9 个 MP3 | 29 MB | 是（流式，不预载） | 转码降码率 |
| `scripts/`（含截图 PNG） | 18 MB | 否（验证工具） | 只保留 `.mjs/.js` 源码 |
| `sound/` 55 个 MP3（含 props） | 3.6 MB | 是（按需） | 保留 |
| `js/` 23 个模块 | 716 KB | 是 | 打包 |
| `.codegraph/` `.codeartsdoer/` `.zcode/` `server.log` | 约 13 MB | 否 | 不入库 |
| **工作区合计** | **约 760 MB** | 真正上线约 205 MB（优化后约 60~80 MB） | |

### 1.2 模型内部构成（20 个 GLB 合计）

| 指标 | 实测值 |
|---|---|
| GLB 总大小 | 169.8 MB |
| 内嵌纹理（PNG/JPEG） | **150.1 MB，占 88%**，共 513 张 |
| 几何 | 2,119,268 三角形 / 1,126 个 mesh，已做 DRACO 压缩 |
| 单文件最大 | `m1a2_trophy-hv.glb` 17.94 MB（低于 Pages 25 MiB 上限，但余量不大） |
| 纹理尺寸 | 主流 256²~1024²，单模型 12~64 张 |
| **全量解码后显存** | **约 0.97 GB（含 mipmap 约 1.29 GB）** |

### 1.3 加载与渲染现状

- `js/main.js:196` 用 `Promise.all` **一次性并行加载全部 20 辆坦克 + 6 个布景 GLB = 约 172 MB**，随后同时 DRACO 解码、上传约 1GB 纹理，才允许进入封面。这是首屏等待和切车卡顿的主因。
- `index.html` 通过 importmap 引入 23 个 ES module，存在请求瀑布；无 preload / modulepreload。
- 渲染配置：DPR high=1.5 / medium=1.25 / low=1，`PCFShadowMap`、太阳阴影 high=2048²、战斗中每帧刷新阴影、8000 粒子 CPU 遍历且每帧全缓冲 `needsUpdate = true`（`js/particles.js:264-266`）、HUD 每帧大量 DOM 写入、热像仪仅开镜 IR 时走离屏双 pass。
- 已有且应保留的优化：布景 `InstancedMesh` 合批、机库 LRU 缓存 + 分帧纹理预热、机库 DPR=1 + 静态阴影、距离剔除、小地图 30FPS 节流、`Tank.dispose()`（见 `PROJECT.md` §9.1）。

---

## 2. P0：不修就无法发布（必做）

### 2.1 当前不是 git 仓库，且没有根 `.gitignore`

`git status` 返回 `fatal: not a git repository`；根目录无 `.gitignore`（只有两个 IDE 隐藏目录里的）。直接 `git add .` 会把 760MB（含 78MB `node_modules`、378MB 源模型/备份）全部提交。

建议根目录 `.gitignore`：

```gitignore
node_modules/
newTankmodel2/
model_bk/
houseModel/            # 例外放行见下
!houseModel/oject/
!houseModel/【5】lowpoly_buildings.glb
.codegraph/
.codeartsdoer/
.zcode/
server.log
*.pid
scripts/*.png
maps/                  # 空目录，确认无用后忽略
```

> `newTankmodel2/`、`model_bk/` 是本地冷备，确认已有其它备份后再决定是否永久排除。

### 2.2 three 与 DRACO 解码器指向 `node_modules`（线上必然 404）

| 位置 | 现状 | 问题 |
|---|---|---|
| `index.html:12-13` | `"three": "./node_modules/three/build/three.module.js"`、`"three/addons/": "./node_modules/three/examples/jsm/"` | Pages 上不会有 `node_modules` |
| `js/main.js:193` | `dracoLoader.setDecoderPath('./node_modules/three/examples/jsm/libs/draco/')` | DRACO 解码器 wasm 404，模型加载失败 |

两条路线，**推荐 B**：

- **A（改动最小）自托管 vendor**：把下列文件复制到 `vendor/` 并改 importmap 与 decoderPath。
  - `three/build/three.module.js`（650 KB）
  - `three/examples/jsm/loaders/GLTFLoader.js`、`DRACOLoader.js`
  - `three/examples/jsm/utils/BufferGeometryUtils.js`、`SkeletonUtils.js`（GLTFLoader 的依赖）
  - `three/examples/jsm/libs/draco/`：`draco_wasm_wrapper.js`、`draco_decoder.wasm`、`draco_decoder.js`（约 1.05 MB）
  - importmap 改为 `./vendor/three.module.js` / `./vendor/jsm/`；`setDecoderPath('/vendor/draco/')`。
- **B（推荐）esbuild 打包成 `dist/app.js`**：three r185 的 `package.json` 有 `"./addons/*": "./examples/jsm/*"` 映射，esbuild 可直接解析 `three/addons/...`；打包后 23 个模块合成 1 个文件、可 tree-shake、可加内容哈希。
  ```bash
  npm i -D esbuild
  npx esbuild js/main.js --bundle --format=esm --minify --target=es2022 \
       --outfile=dist/app.js
  ```
  **关键坑**：`DRACOLoader.js` 内部用 `new URL('../libs/draco/...', import.meta.url)` 定位解码器，bundle 后 `import.meta.url` 指向 `dist/app.js`，默认路径会失效。必须显式 `setDecoderPath('/vendor/draco/')`，并把 3 个 draco 文件复制到 `dist/vendor/draco/`。

两种路线都要保证：Pages 输出的 `.wasm` MIME 为 `application/wasm`（Pages 内置映射支持；必要时用 `_headers` 指定）。

### 2.3 Cloudflare Pages 不会执行 `server.js`

本地服务器的 gzip(level 5) 与 `Cache-Control` 在 Pages 上全部失效。Pages 自动对文本资源做 Brotli、走 HTTP/3，但 `model/gltf-binary` 不在自动压缩范围——所以 **GLB 的传输体积必须靠 WebP/KTX2 自己减下来**（见 P1）。缓存策略需改用根目录 `_headers`（放在构建输出目录）：

```text
/index.html
  Cache-Control: no-cache

/js/*
  Cache-Control: public, max-age=86400

/model/*
  Cache-Control: public, max-age=604800

/sound/*
  Cache-Control: public, max-age=604800

/bgm/*
  Cache-Control: public, max-age=604800
```

> 只有带内容哈希的文件名才可写 `immutable`；当前 GLB 文件名固定，**不要**给 `/model/*` 设长 immutable，否则以后换模型用户仍拿旧文件。

### 2.4 其它部署细节

| 项 | 说明 |
|---|---|
| 单文件上限 | Pages 单资源 **25 MiB**（官方 Limits）；当前最大 17.94MB 勉强过关，WebP 后最大约 6MB 安全 |
| 文件数上限 | 免费版 20,000 个；当前远低于限额 |
| 中文文件名 | `houseModel/【5】lowpoly_buildings.glb` 建议改 ASCII（如 `town_kit.glb`），同步改 `js/main.js:201` 的 PROPS 表，避免 Git/Pages/URL 编码差异 |
| 大小写 | Pages 文件系统区分大小写，Windows 不区分；发布前统一核对所有 `model/`、`sound/` 路径大小写 |
| 国内访问 | `*.pages.dev` 在中国大陆访问不稳定，建议绑定自定义域名；如需国内速度可复用已有的 EdgeOne Pages 做双平台镜像 |

---

## 3. P1：加载与体积（收益最大）

### 3.1 WebP 纹理压缩：实测 169.8MB → 39.5MB

用项目本地 `sharp@0.35.3` 对 20 个 GLB 的 513 张内嵌 PNG/JPEG 逐张转 WebP（quality 80 / effort 4）的实测结果：

| 指标 | 优化前 | 优化后 | 变化 |
|---|---:|---:|---|
| 内嵌纹理 | 150.1 MB | 19.7 MB | **-87%** |
| GLB 总量 | 169.8 MB | 39.5 MB | **-77%** |
| 转换失败 | — | 0 / 513 张 | 全部成功 |

兼容性已核实：three r185 的 `GLTFLoader` 内置注册 `GLTFTextureWebPExtension`，支持 `EXT_texture_webp`，用普通 `TextureLoader` / `ImageBitmapLoader` 加载，浏览器原生解码，**无需额外 loader、无需改业务代码**。

**实施要求（重要）**：

1. 写一个本地脚本（`scripts/optimize-textures.mjs`），做 **GLB 二进制级 image bufferView 替换**：解析 JSON chunk / BIN chunk → 用本地 `sharp` 把每个 image bufferView 转 WebP → 重建 BIN 与 4 字节对齐 → 更新 `images[].mimeType = "image/webp"`、`bufferViews[].byteOffset/byteLength` → 加 `extensionsUsed/Required: ["EXT_texture_webp"]` → 为每个 `textures[]` 写 `extensions.EXT_texture_webp.source = imageIndex`。
2. **绝对不要碰几何与节点**：`js/tank.js` 靠 `getObjectByName()` 按名字拆炮塔/炮管/机枪/负重轮，任何 `flatten` / `join` / `palette` / `simplify` / `optimize` 都会破坏装配、导致模型散架。
3. **本机实测踩坑**：全局 `gltf-transform@4.4.2` 的 `webp` 命令在这台机器上报 `colourspace: parameter space not set`（其内置 sharp/libvips 兼容问题），且日志出现 `Decoded KHR_draco_mesh_compression. Further compression will be lossy`——它会先解压 DRACO 几何再重压。**不要用全局 CLI 直接处理这些模型**；用项目自带的 `sharp` 写脚本最稳。
4. 法线 / ORM / 金属度等数据贴图：用 `--lossless` 等价的无损 WebP 或保留原 PNG，避免有损压缩引入光照伪影；**机库双车 A/B 复测**（沙色 M1 系看爆白、暗绿 T-90M 看暗部，沿用 `PROJECT.md` §3.7 的校准方法）。全部数据贴图走无损时，总量保守估计 **45~60MB**，仍比现状小 3 倍。
5. 先在 1 辆车（建议 `t-90m3.glb`，1.1MB）上验证：节点名数量、mesh 数、DRACO 扩展、炮口/机枪位置、机库渲染，通过后再批量处理；原文件先复制到 `model_bk/` 之外的一份临时备份。
6. WebP 只减**传输体积**，解码后仍是 RGBA，不减显存——显存问题靠 3.2 的按需加载解决（进阶靠 P3 的 KTX2）。

### 3.2 按需分阶段加载：首屏 172MB → 3~5MB

| 阶段 | 加载内容 | 体积（WebP 后） |
|---|---|---:|
| Stage 0 封面/菜单 | `index.html` + CSS + `app.js` + three + 默认展示车 `t-90m3.glb` + draco 解码器 | 约 3~4 MB |
| Stage 1 机库 | 当前选中车 + 相邻 1~2 辆预取（复用已有 LRU / 分帧预热） | 约 2~4 MB |
| Stage 2 开战 | 玩家车 + 敌方随机车 + 6 个布景 GLB（也可提前到 Stage 1 空闲时） | 约 5~8 MB |
| 其余 17 辆 | 切车时按需加载，或 `requestIdleCallback` 后台低优先级预取 | 不计入首屏 |

**改动点清单**（`this.assets` 只有 4 处同步引用）：

| 位置 | 用途 | 改法 |
|---|---|---|
| `main.js:196-205` | `_load()` 全量 `Promise.all` | 改为 `ensureAsset(id)` 异步取/缓存 + 分阶段任务；`LoadingManager.onProgress` 改为按当前阶段计数 |
| `main.js:242` | `_ensureHangarTank()` | `await ensureAsset(key)`；保留 LRU 与预热 |
| `main.js:273` | `_setupMenuShowcase()` | 同上 |
| `main.js:609 / 614` | `_startBattle()` 建玩家 / 敌方车 | 开战前先确定 `enemyKey`，`Promise.all([ensureAsset(playerKey), ensureAsset(enemyKey)])` 后再实例化，按钮显示「装载中」 |

注意：`_buildWorld()` 依赖 `_mapAssets` 6 个布景，若延后加载需保证世界构建时序；机库/菜单态不构建战场世界即可进一步提前首屏。

### 3.3 音频与 JS 请求

- `bgm/` 9 首共 29MB（单曲 2~4.9MB），当前用 `new Audio()` 流式播放、不预载，对首屏无影响但吃流量。转码为 AAC/Opus 64~96kbps 可降到约 10~12MB；`audio.js` 的 `_decodeMp3` 走 `fetch + decodeAudioData`，若换格式需同步改扩展名与 MIME 判断。
- `sound/` 3.6MB 保持按需加载，不要改成预加载。
- 22 个 ES module 用 esbuild 合成 `dist/app.js`；`index.html` 加 `<link rel="modulepreload" href="/app.js">`、`<link rel="preload" as="fetch" href="/model/t-90m3.glb" crossorigin>`（默认展示车），减少首屏关键路径往返。
- Pages 自动 Brotli + HTTP/3，JS/CSS 传输无需额外处理；`flags/` 15KB 可忽略。

---

## 4. P2：帧率优化

| 措施 | 现状 | 建议 | 风险 |
|---|---|---|---|
| 显存压力（最大收益） | 20 车纹理全驻留，约 0.97~1.29GB | 按需只保留 2~3 辆，约 100~200MB | 低；由 P1-2 直接带来 |
| 自适应画质 | `_fpsTick()` 已有 0.5s FPS 统计，但只显示 | 连续 ~3s <45FPS 自动降 DPR（1.5→1.25→1）/ 阴影档 / 粒子量；恢复加滞后避免来回抖动，设置面板给「自动」档 | 低 |
| 阴影 | high 2048²、战斗每帧刷新（`maps.js:757/1062`） | 分级：high 2048² / medium 1024² / low 关闭布景 `castShadow`；或 `shadowMap.autoUpdate=false` + 每 2 帧 `needsUpdate=true` 降到 30Hz | 中：动态坦克阴影可能略抖，需 A/B |
| 坦克 draw call | 每车 12~160 个 mesh，且 `tank.js` 给每个 mesh clone 材质 | 按材质合并**车体静态件**（严格保留炮塔/炮管/机枪/负重轮节点名），目标每车 ≤25 draw call | 中：必须保证 `findMeshes` 仍能按名找到部件 |
| 粒子上传 | 8000 粒子 CPU 遍历，3 个池 × 3 个 attribute 每帧全量 `needsUpdate=true` | 用 `BufferAttribute.addUpdateRange()` + `clearUpdateRanges()`（three r185 的 `three.core.js` 已确认存在）只上传活跃区间；按活跃数收缩 `setDrawRange` | 低 |
| HUD 主线程 | `ui.updateHUD` 每帧写 `textContent` / `style.width`（约 30+ 次） | 数值类节流到 20~30Hz；准星、散布圈、瞄准进度保留每帧 | 低 |
| 纹理上传 | PNG/JPEG → RGBA 全量上传 | WebP 缩短解码与传输；KTX2 见 P3 | — |
| 机库 / 热像仪 | 已有静态阴影、LRU、离屏双 pass 仅开镜 IR | 保持，不重复改动 | — |

验收基准：复用 `scripts/probe_perf.mjs`（项目已装 `puppeteer-core`，脚本会采样 FPS 与 `renderer.info` 的 drawcalls / triangles / programs），两地图各测一次「行驶 + 开镜」重负载场景，记录优化前后 draw call、三角形、FPS、显存（Chrome 任务管理器）。

---

## 5. P3：进阶（发布稳定后再做）

1. **KTX2 / Basis GPU 压缩纹理**：CLI 的 `etc1s` / `uastc` 或 `optimize --texture-compress ktx2`；three 侧用 `KTX2Loader` + `loader.setKTX2Loader()` + `setTranscoderPath('/vendor/basis/')`（把 `three/examples/jsm/libs/basis/` 一并 vendor）。显存可降 4~8 倍，但需 KTX-Software/toktx 工具链且对法线/ORM 贴图要调参，成本高。
2. **Service Worker 预缓存**：按版本缓存 GLB / 音频，二次访问秒开；必须做版本化清理，避免「改了模型用户还是旧的」。
3. **内容哈希文件名 + `Cache-Control: immutable`**：把 `model/*.glb` 改成 `t90m3.<hash>.glb`，`config.js` 的 `model` 字段由构建脚本注入；这样 `_headers` 才能安全设长期缓存。
4. **国内访问**：绑定自定义域名；如需国内速度，复用你已有的 GitHub Pages / EdgeOne Pages 双平台部署经验做镜像。

---

## 6. 部署方案（等你提供账号信息后执行）

### 6.1 建议输出目录

```text
dist/                     # Pages 的 Build output directory
├── index.html            # importmap 去掉或指向打包产物
├── app.js                # esbuild 产物
├── css/style.css
├── _headers
├── vendor/draco/         # 3 个解码器文件
├── model/                # 20 个 WebP 版 GLB（约 40MB）
├── houseModel/           # 仅 6 个运行时 GLB（2.6MB），ASCII 命名
├── sound/  bgm/  flags/
├── *.html                # 标注工具 / 探针页，可选
└── docs/                 # 可选，不发布也可
```

构建命令 `npm run build`（复制静态资源 + esbuild），输出目录 `dist`，Pages 无需框架、无 `npm install` 也可用 Wrangler 直接上传。

### 6.2 两种发布方式

- **Git 集成（推荐）**：GitHub 仓库 → Pages 绑定 → Build command `npm run build`、Output directory `dist`；每次 push 自动部署，有预览环境。
- **Wrangler 直传**：`npx wrangler pages deploy dist --project-name=<项目名>`，适合先跑通再接 Git。

### 6.3 需要你后续提供

| 信息 | 用途 |
|---|---|
| Cloudflare Account ID | Wrangler / API 调用 |
| Cloudflare API Token（权限至少 `Account:Cloudflare Pages:Edit`） | 部署鉴权 |
| Pages 项目名（或要新建） | `wrangler pages deploy --project-name` |
| GitHub 仓库地址（若走 Git 集成） | 绑定自动部署 |

**安全约定**：Token / Account ID 只通过环境变量 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 传入，**绝不写进仓库、`_headers`、`package.json`、日志或文档**。

### 6.4 验收清单

1. 本地：`node server.js` 与另起静态服务指向 `dist/` 两种都能进封面、进机库、开一局完整战斗（控制台无 404 / 无 WebGL 报错）。
2. 模型 A/B：节点名数量、mesh 数、炮塔/炮管/机枪转轴、机库双车涂装观感与优化前一致。
3. Network：首屏传输 <5MB、开战增量 <8MB；GLB 请求数 20 → 2~3；`Content-Encoding: br` 出现在 JS/CSS。
4. 线上 `curl -I`：确认 `_headers` 的 Cache-Control、`.wasm` 的 MIME、HTTP/3。
5. 性能：`scripts/probe_perf.mjs` 跑两地图重负载，记录 FPS / draw calls / triangles；对比优化前基线（建议先跑一次基线存档）。
6. 页面在国内 / 移动网络下的首屏体感（可用 Lighthouse 或 WebPageTest 做参考）。

---

## 7. 风险与回滚

| 风险 | 触发点 | 对策 |
|---|---|---|
| 模型散架（炮塔/炮管找不到） | 用 gltf-transform 的 `optimize`/`join`/`flatten` | 只做纹理级替换；先在 1 辆车验证节点名与装配 |
| DRACO 几何二次有损 / 解码失败 | 全局 CLI 的 `webp` 命令 | 不使用；用本地 sharp 脚本，不碰几何 bufferView |
| 全局 CLI `colourspace` 报错 | 本机 gltf-transform 4.4.2 内置 sharp | 已在实测中复现，方案已绕开 |
| 法线贴图伪影、暗部过曝 | WebP 有损压缩 | 数据贴图用无损/保留 PNG；机库双车复测 |
| 旧浏览器不支持 WebP | Safari 14 以前 | 目标浏览器为现代 Chrome/Edge/Firefox/Safari；必要时保留 PNG 分支 |
| 切车等待变长 | 按需加载 | 复用机库 LRU + 邻车预热 + 加载浮标；必要时后台 idle 预取 |
| 更新模型后用户拿到旧文件 | 长缓存 / Service Worker | 未加哈希前用 7 天缓存 + ETag；加哈希或 SW 版本号后再上 immutable |
| 提交体积过大 / 误传密钥 | 无 `.gitignore` | 先按 §2.1 配置，`git status` 复核后再 commit |

**回滚**：所有资源改动都在 `model/` 输出新文件，原件保留在 `model_bk/` 与本地冷备；代码改动集中在 `main.js` 的资源加载段、`index.html` 的 importmap、`config.js` 的少量路径，逐项可 `git revert`。

---

## 8. 建议执行顺序

1. **先跑基线**：`node scripts/probe_perf.mjs` 记录当前 FPS / draw calls / 首屏流量，存档对比。
2. **P0**：`git init` + `.gitignore` → vendor/打包 three + 修 DRACO 路径 → ASCII 化布景文件名 → `_headers` → 本地用纯静态服务验证 `dist/`。
3. **P1-1**：写 `scripts/optimize-textures.mjs`，单车验证通过后批量生成 WebP 版 GLB（备份原件）。
4. **P1-2**：`main.js` 按需加载改造（4 处引用点 + 加载时序）。
5. **P1-3**：esbuild 打包 + preload + BGM 转码。
6. **验收**：本地双通道测试 + 性能基线对比。
7. **P2**：按表中低风险项逐条做（自适应画质 → HUD 节流 → 粒子局部上传 → 阴影分级 → draw call 合并），每条都单独复测。
8. **提交 git → 发布 Cloudflare Pages**（等你给 Account ID / Token / 项目名）。
9. **P3**：线上稳定后再上 KTX2、Service Worker、内容哈希与国内镜像。
