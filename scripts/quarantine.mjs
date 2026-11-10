// 把上线不需要的资源移入 _archive/（只移动，不删除）。
//   node scripts/quarantine.mjs            隔离
//   node scripts/quarantine.mjs --restore 一键回滚
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE = path.join(ROOT, '_archive');
const MANIFEST = path.join(ARCHIVE, 'manifest.json');
const restore = process.argv.includes('--restore');

function sizeOf(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    total += sizeOf(path.join(p, e.name));
  }
  return total;
}

function move(from, to, entries) {
  const src = path.join(ROOT, from);
  const dst = path.join(ROOT, to);
  if (!fs.existsSync(src)) return;
  const size = sizeOf(src);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.renameSync(src, dst);
  entries.push({ from, to, bytes: size });
}

if (restore) {
  if (!fs.existsSync(MANIFEST)) {
    console.error('找不到 _archive/manifest.json，无法回滚');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let n = 0;
  for (const e of [...data.entries].reverse()) {
    const src = path.join(ROOT, e.to);
    const dst = path.join(ROOT, e.from);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(src, dst);
    n++;
  }
  fs.rmSync(MANIFEST, { force: true });
  console.log(`已回滚 ${n} 项到原位置`);
  process.exit(0);
}

const entries = [];

// 1. 原始导出模型与压缩前备份（本地冷备，不入库、不发布）
move('newTankmodel2', '_archive/newTankmodel2', entries);
move('model_bk', '_archive/model_bk', entries);

// 2. 依赖已归档源模型的预览工具页
move('newTankmodel2-preview.html', '_archive/tools/newTankmodel2-preview.html', entries);

// 3. 服务器日志
move('server.log', '_archive/logs/server.log', entries);

// 4. houseModel 根目录中未被运行时引用的建筑模型（保留 town kit）
const house = path.join(ROOT, 'houseModel');
const KEEP_HOUSE = new Set(['town_kit.glb']);
for (const f of fs.readdirSync(house, { withFileTypes: true })) {
  if (!f.isFile() || !f.name.endsWith('.glb') || KEEP_HOUSE.has(f.name)) continue;
  move(`houseModel/${f.name}`, `_archive/houseModel-unused/${f.name}`, entries);
}

// 5. scripts 下的历史截图 PNG（含子目录，验证脚本源码保留）
function collectPng(dir, rel) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = `${rel}/${f.name}`;
    if (f.isDirectory()) collectPng(path.join(dir, f.name), r);
    else if (f.name.toLowerCase().endsWith('.png')) move(r, `_archive/screenshots/${r}`, entries);
  }
}
collectPng(path.join(ROOT, 'scripts'), 'scripts');

// 合并已有清单：重复执行时保留先前条目，保证 --restore 能完整回滚
let previous = [];
if (fs.existsSync(MANIFEST)) {
  previous = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).entries || [];
}
const seen = new Set();
const all = [...previous, ...entries].filter((e) => {
  const key = `${e.from}>${e.to}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
const total = all.reduce((s, e) => s + e.bytes, 0);
fs.mkdirSync(ARCHIVE, { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify({
  createdAt: new Date().toISOString(),
  note: '仅移动未删除；执行 node scripts/quarantine.mjs --restore 可完整回滚',
  totalBytes: total,
  entries: all,
}, null, 2), 'utf8');

console.log(`本次新增 ${entries.length} 项；清单合计 ${all.length} 项 / ${(total / 1048576).toFixed(1)} MB`);
for (const e of entries.slice(0, 8)) console.log(`  ${e.from}  ->  ${e.to}`);
if (entries.length > 8) console.log(`  ... 其余 ${entries.length - 8} 项见 _archive/manifest.json`);
