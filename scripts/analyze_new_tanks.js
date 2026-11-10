// 分析 newTankmodel2 三个新坦克 + 参考模型（豹2A7 '+z' / 挑战者3 '+x'）的节点结构与世界包围盒
// 用途：确认朝向、校准 scale、提取炮塔轴心/炮口/排气/履带等配置坐标
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const path = require('path');

function matIdentity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function matMul(a, b) {
  const r = new Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      r[i * 4 + j] = s;
    }
  }
  return r;
}
function matFromTRS(t, r, s) {
  const [tx, ty, tz] = t || [0, 0, 0];
  const [sx, sy, sz] = s || [1, 1, 1];
  let m = matIdentity();
  if (r && (r[0] || r[1] || r[2] || r[3])) {
    const [qx, qy, qz, qw] = r;
    const xx = qx * qx, yy = qy * qy, zz = qz * qz;
    const xy = qx * qy, xz = qx * qz, yz = qy * qz;
    const wx = qw * qx, wy = qw * qy, wz = qw * qz;
    m = [
      1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
      2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
      2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
      0, 0, 0, 1,
    ];
  }
  m[0] *= sx; m[1] *= sx; m[2] *= sx;
  m[4] *= sy; m[5] *= sy; m[6] *= sy;
  m[8] *= sz; m[9] *= sz; m[10] *= sz;
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}
function transformPoint(m, p) {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

async function analyze(file) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const root = doc.getRoot();
  const nodes = root.listNodes();

  const worldMat = new Map();
  function computeWorld(node, parentWorld) {
    const localMat = matFromTRS(node.getTranslation(), node.getRotation(), node.getScale());
    const world = parentWorld ? matMul(parentWorld, localMat) : localMat;
    worldMat.set(node, world);
    for (const child of node.listChildren()) computeWorld(child, world);
  }
  const scenes = root.listScenes();
  const sceneRoots = scenes.length > 0 ? scenes[0].listChildren() : nodes.filter(n => !n.getParentNode());
  for (const rn of sceneRoots) computeWorld(rn, null);

  // 每个网格节点（含父链名）的世界包围盒 + 全模型包围盒
  const result = {};
  const total = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  function collectBounds(node, chain) {
    const mesh = node.getMesh();
    if (mesh) {
      const world = worldMat.get(node) || matIdentity();
      let min = [Infinity, Infinity, Infinity];
      let max = [-Infinity, -Infinity, -Infinity];
      for (const prim of mesh.listPrimitives()) {
        const posAcc = prim.getAttribute('POSITION');
        if (!posAcc) continue;
        const arr = posAcc.getArray();
        const count = posAcc.getCount();
        for (let i = 0; i < count; i++) {
          const px = arr[i * 3], py = arr[i * 3 + 1], pz = arr[i * 3 + 2];
          const [wx, wy, wz] = transformPoint(world, [px, py, pz]);
          min[0] = Math.min(min[0], wx); min[1] = Math.min(min[1], wy); min[2] = Math.min(min[2], wz);
          max[0] = Math.max(max[0], wx); max[1] = Math.max(max[1], wy); max[2] = Math.max(max[2], wz);
        }
      }
      const name = node.getName() || '(unnamed)';
      const key = chain ? `${chain}/${name}` : name;
      if (!result[key]) result[key] = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (let k = 0; k < 3; k++) {
        result[key].min[k] = Math.min(result[key].min[k], min[k]);
        result[key].max[k] = Math.max(result[key].max[k], max[k]);
        total.min[k] = Math.min(total.min[k], min[k]);
        total.max[k] = Math.max(total.max[k], max[k]);
      }
    }
    const myName = node.getName() || '';
    for (const child of node.listChildren()) collectBounds(child, chain ? `${chain}/${myName}` : myName);
  }
  for (const rn of sceneRoots) collectBounds(rn, '');

  // 根节点 matrix（three.js 加载后 gltfScene 的旋转）
  const rootMats = sceneRoots.map(n => {
    const w = worldMat.get(n);
    return w ? w.map(v => v.toFixed(3)).join(',') : 'identity';
  });

  return { result, total, rootMats };
}

const files = process.argv.slice(2);
(async () => {
  for (const f of files) {
    try {
      const { result, total, rootMats } = await analyze(path.resolve(f));
      console.log(`\n████ ${path.basename(f)} ████`);
      console.log(`根节点世界矩阵: ${rootMats.join(' | ')}`);
      const sx = total.max[0] - total.min[0], sy = total.max[1] - total.min[1], sz = total.max[2] - total.min[2];
      console.log(`全模型 bounds: X[${total.min[0].toFixed(2)}, ${total.max[0].toFixed(2)}] Y[${total.min[1].toFixed(2)}, ${total.max[1].toFixed(2)}] Z[${total.min[2].toFixed(2)}, ${total.max[2].toFixed(2)}]  size=(${sx.toFixed(2)}, ${sy.toFixed(2)}, ${sz.toFixed(2)})`);
      const entries = Object.entries(result).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [nodeName, info] of entries) {
        const cx = (info.min[0] + info.max[0]) / 2;
        const cy = (info.min[1] + info.max[1]) / 2;
        const cz = (info.min[2] + info.max[2]) / 2;
        const ex = info.max[0] - info.min[0], ey = info.max[1] - info.min[1], ez = info.max[2] - info.min[2];
        console.log(`  ${nodeName.padEnd(70)} X[${info.min[0].toFixed(2)},${info.max[0].toFixed(2)}] Y[${info.min[1].toFixed(2)},${info.max[1].toFixed(2)}] Z[${info.min[2].toFixed(2)},${info.max[2].toFixed(2)}]  c=(${cx.toFixed(1)},${cy.toFixed(1)},${cz.toFixed(1)}) s=(${ex.toFixed(1)},${ey.toFixed(1)},${ez.toFixed(1)})`);
      }
    } catch (e) {
      console.error(`Error analyzing ${f}:`, e.message);
    }
  }
})();
