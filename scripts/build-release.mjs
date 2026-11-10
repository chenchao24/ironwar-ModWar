// 生成 Cloudflare Pages 上线主体 dist/：白名单复制，不含任何开发/冷备资源。
//   npm run build
// 重新构建会清空并重建 dist/（仅当 dist 内存在本脚本生成的 BUILD_INFO.json 才允许覆盖）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const MARKER = 'BUILD_INFO.json';

if (fs.existsSync(OUT)) {
  if (!fs.existsSync(path.join(OUT, MARKER))) {
    console.error('拒绝覆盖：dist/ 已存在但不是本脚本生成的目录');
    process.exit(1);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });

let copied = 0;

function copy(rel, target = rel) {
  const src = path.join(ROOT, rel);
  const dst = path.join(OUT, target);
  if (!fs.existsSync(src)) throw new Error(`缺少必需资源：${rel}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  copied++;
}

function copyFiles(dirRel, predicate) {
  const base = path.join(ROOT, dirRel);
  if (!fs.existsSync(base)) throw new Error(`缺少目录：${dirRel}`);
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    if (e.isFile() && predicate(e.name)) copy(`${dirRel}/${e.name}`);
  }
}

// ── 白名单：只放运行时真正会被请求的文件 ──
copy('index.html');
copy('css/style.css');
copy('js');                                  // 23 个游戏模块
copy('vendor');                              // three + GLTF/DRACO + 解码器（自托管，无 CDN）
copy('flags');
copyFiles('model', (n) => n.endsWith('.glb'));   // 20 辆坦克 GLB，排除 .md 标注
copy('houseModel/town_kit.glb');
copy('houseModel/objects');                 // 5 个植被/岩石 GLB
copy('sound');                              // 含 props/ 子目录
copy('bgm');

// ── Cloudflare Pages 自定义响应头（Pages 不运行 server.js） ──
const HEADERS = `
/index.html
  Cache-Control: no-cache

/js/*
  Cache-Control: public, max-age=86400

/vendor/*
  Cache-Control: public, max-age=604800

/model/*
  Cache-Control: public, max-age=604800

/houseModel/*
  Cache-Control: public, max-age=604800

/sound/*
  Cache-Control: public, max-age=604800

/bgm/*
  Cache-Control: public, max-age=604800

/flags/*
  Cache-Control: public, max-age=604800
`;
fs.writeFileSync(path.join(OUT, '_headers'), HEADERS.trimStart(), 'utf8');

function statTree(dir) {
  let files = 0, bytes = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const s = statTree(p);
      files += s.files; bytes += s.bytes;
    } else { files++; bytes += fs.statSync(p).size; }
  }
  return { files, bytes };
}

const total = statTree(OUT);
fs.writeFileSync(path.join(OUT, MARKER), JSON.stringify({
  generatedAt: new Date().toISOString(),
  generator: 'scripts/build-release.mjs',
  note: 'Cloudflare Pages 部署此目录；重新运行 npm run build 会重建，勿手工编辑',
  copiedEntries: copied,
  files: total.files,
  bytes: total.bytes,
}, null, 2), 'utf8');

console.log(`dist/ 已生成：${total.files} 个文件，${(total.bytes / 1048576).toFixed(1)} MB`);
for (const e of fs.readdirSync(OUT, { withFileTypes: true })) {
  const p = path.join(OUT, e.name);
  const s = e.isDirectory() ? statTree(p) : { bytes: fs.statSync(p).size };
  console.log(`  ${e.name.padEnd(18)} ${(s.bytes / 1048576).toFixed(2).padStart(8)} MB`);
}
