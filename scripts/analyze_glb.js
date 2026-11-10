// 分析 GLB 模型各部件的世界坐标范围（含根节点 matrix 变换）
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');

// 矩阵工具（列主序 4x4，跟 glTF 一致）
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
  // 简化：只处理 T 和 S，旋转用四元数→矩阵
  const [tx, ty, tz] = t || [0, 0, 0];
  const [sx, sy, sz] = s || [1, 1, 1];
  let m = matIdentity();
  // 旋转
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
  // 缩放
  m[0] *= sx; m[1] *= sx; m[2] *= sx;
  m[4] *= sy; m[5] *= sy; m[6] *= sy;
  m[8] *= sz; m[9] *= sz; m[10] *= sz;
  // 平移
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
  const io = new NodeIO();
  const doc = await io.read(path.join(__dirname, 'model', file));
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const meshes = root.listMeshes();
  const accessors = root.listAccessors();

  // 构建节点名→节点映射，计算世界矩阵
  const nodeMap = new Map();
  const worldMat = new Map();

  function computeWorld(node, parentWorld) {
    const localMat = matFromTRS(node.getTranslation(), node.getRotation(), node.getScale());
    const world = parentWorld ? matMul(parentWorld, localMat) : localMat;
    worldMat.set(node, world);
    for (const child of node.listChildren()) computeWorld(child, world);
  }

  // 找根节点（没有父节点的）
  const roots = nodes.filter(n => !n.getParentNode ? true : !n.getParentNode());
  // gltf-transform 中用 node.listChildren，根节点是 scene 的 children
  const scenes = root.listScenes();
  const sceneRoots = scenes.length > 0 ? scenes[0].listChildren() : roots;
  for (const rn of sceneRoots) computeWorld(rn, null);

  // 收集每个节点的 mesh 世界坐标范围
  const result = {};
  function collectBounds(node) {
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
      if (!result[name]) result[name] = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], nodes: [] };
      for (let k = 0; k < 3; k++) {
        result[name].min[k] = Math.min(result[name].min[k], min[k]);
        result[name].max[k] = Math.max(result[name].max[k], max[k]);
      }
      result[name].nodes.push({ name, min, max });
    }
    for (const child of node.listChildren()) collectBounds(child);
  }
  for (const rn of sceneRoots) collectBounds(rn);

  return result;
}

function printBounds(name, bounds) {
  console.log(`\n=== ${name} ===`);
  for (const [nodeName, info] of Object.entries(bounds)) {
    const cx = (info.min[0] + info.max[0]) / 2;
    const cy = (info.min[1] + info.max[1]) / 2;
    const cz = (info.min[2] + info.max[2]) / 2;
    const sx = info.max[0] - info.min[0];
    const sy = info.max[1] - info.min[1];
    const sz = info.max[2] - info.min[2];
    console.log(`  ${nodeName.padEnd(30)} X[${info.min[0].toFixed(2)},${info.max[0].toFixed(2)}] Y[${info.min[1].toFixed(2)},${info.max[1].toFixed(2)}] Z[${info.min[2].toFixed(2)},${info.max[2].toFixed(2)}]  center=(${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)}) size=(${sx.toFixed(2)},${sy.toFixed(2)},${sz.toFixed(2)})`);
  }
}

(async () => {
  for (const f of ['t-90m3.glb', 'abrams_x.glb', 't-14_armata.glb', 'ztz-99a.glb']) {
    try {
      const b = await analyze(f);
      printBounds(f, b);
    } catch (e) {
      console.error(`Error analyzing ${f}:`, e.message);
    }
  }
})();