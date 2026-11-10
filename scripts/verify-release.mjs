// 静态校验上线主体 dist/：模块相对引用、资源路径、importmap、解码器、命名规范
//   node scripts/verify-release.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = path.join(ROOT, 'dist');
const problems = [];
let checked = 0;

const has = (rel) => { checked++; return fs.existsSync(path.join(D, rel)); };
const read = (rel) => fs.readFileSync(path.join(D, rel), 'utf8');
const fail = (msg) => problems.push(msg);

function walk(dir, cb) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, cb);
    else cb(p, e.name);
  }
}

if (!has('index.html') || !has('BUILD_INFO.json')) fail('dist/ 未生成或不完整，请先 npm run build');

// 1. importmap 与 three 运行依赖
const html = read('index.html');
const im = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!im) fail('index.html 缺少 importmap');
else {
  const imports = JSON.parse(im[1]).imports;
  const core = imports.three;
  const addons = imports['three/addons/'];
  if (!core || !has(core.replace(/^\.\//, ''))) fail(`importmap three 路径不存在：${core}`);
  for (const f of ['loaders/GLTFLoader.js', 'loaders/DRACOLoader.js', 'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js', 'controls/OrbitControls.js']) {
    if (!has(addons.replace(/^\.\//, '') + f)) fail(`缺少 addon：${f}`);
  }
  for (const f of ['three.core.js', 'jsm/libs/draco/draco_wasm_wrapper.js', 'jsm/libs/draco/draco_decoder.wasm', 'jsm/libs/draco/draco_decoder.js']) {
    if (!has('vendor/three/' + f)) fail(`缺少 three/DRACO 依赖：${f}`);
  }
}

// 2. js 模块之间的相对 import
const jsFiles = [];
walk(path.join(D, 'js'), (p) => { if (p.endsWith('.js')) jsFiles.push(p); });
for (const file of jsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), m[1]);
    checked++;
    if (!fs.existsSync(target)) fail(`${path.relative(D, file)} 引用不存在的模块：${m[1]}`);
  }
}

// 3. 代码里写死的资源路径
const assetRe = /['"]((?:model|houseModel|sound|bgm|flags)\/[^'"\s]+\.(?:glb|mp3|png))['"]/g;
const assets = new Set();
for (const file of jsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(assetRe)) assets.add(m[1]);
}
for (const rel of assets) if (!has(rel)) fail(`资源不存在：${rel}`);

// 4. 发布目录不应出现的内容
const banned = [];
walk(D, (p, name) => {
  if (/[\u4e00-\u9fa5]/.test(name)) banned.push(`中文文件名：${path.relative(D, p)}`);
  const rel = path.relative(D, p);
  const isVendor = rel.startsWith('vendor' + path.sep);
  if (!isVendor && (name.endsWith('.md') || name.endsWith('.log'))) banned.push(`非发布文件：${rel}`);
  if (p.includes('node_modules') || p.includes('_archive')) banned.push(`混入开发目录：${path.relative(D, p)}`);
});
problems.push(...banned);

// 5. 汇总
const stat = (dir) => { let n = 0, b = 0; walk(dir, (p) => { n++; b += fs.statSync(p).size; }); return { n, b }; };
const s = stat(D);
console.log(`校验 dist/：${s.n} 个文件 / ${(s.b / 1048576).toFixed(1)} MB，检查 ${checked} 项路径`);
console.log(`  JS 模块 ${jsFiles.length} 个；硬编码资源引用 ${assets.size} 条`);
if (problems.length) {
  console.log(`发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 30)) console.log('  - ' + p);
  process.exit(1);
}
console.log('全部通过：模块引用、模型/音频路径、three/DRACO 自托管、命名与目录均符合发布要求');
