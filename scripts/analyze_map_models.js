// 分析 houseModel 下 GLB 的节点树与世界包围盒（用于地图测试布景）
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');
const fs = require('fs');

function matIdentity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function matMul(a, b) {
  const r = new Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      r[i * 4 + j] = s;
    }
  return r;
}
function matFromTRS(t, r, s) {
  const [tx, ty, tz] = t || [0, 0, 0];
  const [sx, sy, sz] = s || [1, 1, 1];
  let m = matIdentity();
  if (r && (r[0] || r[1] || r[2] || r[3])) {
    const [qx, qy, qz, qw] = r;
    const xx = qx*qx, yy = qy*qy, zz = qz*qz;
    const xy = qx*qy, xz = qx*qz, yz = qy*qz;
    const wx = qw*qx, wy = qw*qy, wz = qw*qz;
    m = [
      1-2*(yy+zz), 2*(xy+wz), 2*(xz-wy), 0,
      2*(xy-wz), 1-2*(xx+zz), 2*(yz+wx), 0,
      2*(xz+wy), 2*(yz-wx), 1-2*(xx+yy), 0,
      0,0,0,1,
    ];
  }
  m[0]*=sx; m[1]*=sx; m[2]*=sx;
  m[4]*=sy; m[5]*=sy; m[6]*=sy;
  m[8]*=sz; m[9]*=sz; m[10]*=sz;
  m[12]=tx; m[13]=ty; m[14]=tz;
  return m;
}
function transformPoint(m, p) {
  const [x, y, z] = p;
  return [
    m[0]*x+m[4]*y+m[8]*z+m[12],
    m[1]*x+m[5]*y+m[9]*z+m[13],
    m[2]*x+m[6]*y+m[10]*z+m[14],
  ];
}

async function analyze(file) {
  const io = new NodeIO();
  const doc = await io.read(file);
  const root = doc.getRoot();
  const scenes = root.listScenes();
  const sceneRoots = scenes.length > 0 ? scenes[0].listChildren() : root.listNodes().filter(n => !n.getParentNode());

  const worldMat = new Map();
  function computeWorld(node, parentWorld) {
    const localMat = matFromTRS(node.getTranslation(), node.getRotation(), node.getScale());
    const world = parentWorld ? matMul(parentWorld, localMat) : localMat;
    worldMat.set(node, world);
    for (const child of node.listChildren()) computeWorld(child, world);
  }
  for (const rn of sceneRoots) computeWorld(rn, null);

  // 每个直接含 mesh 的节点（或顶层节点组）输出 bounds
  const lines = [];
  function walk(node, depth) {
    const mesh = node.getMesh();
    let info = '';
    if (mesh) {
      const world = worldMat.get(node) || matIdentity();
      let min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
      for (const prim of mesh.listPrimitives()) {
        const posAcc = prim.getAttribute('POSITION');
        if (!posAcc) continue;
        const arr = posAcc.getArray();
        for (let i = 0; i < posAcc.getCount(); i++) {
          const [wx, wy, wz] = transformPoint(world, [arr[i*3], arr[i*3+1], arr[i*3+2]]);
          min[0]=Math.min(min[0],wx); min[1]=Math.min(min[1],wy); min[2]=Math.min(min[2],wz);
          max[0]=Math.max(max[0],wx); max[1]=Math.max(max[1],wy); max[2]=Math.max(max[2],wz);
        }
      }
      const sx=(max[0]-min[0]).toFixed(1), sy=(max[1]-min[1]).toFixed(1), sz=(max[2]-min[2]).toFixed(1);
      const cy=((min[1]+max[1])/2).toFixed(2);
      info = `  size=(${sx},${sy},${sz}) Y[${min[1].toFixed(2)},${max[1].toFixed(2)}] cy=${cy}`;
    }
    const name = node.getName() || '(unnamed)';
    lines.push(`${'  '.repeat(depth)}${name}${mesh ? ' [MESH]' : ''}${info}`);
    for (const child of node.listChildren()) walk(child, depth + 1);
  }
  for (const rn of sceneRoots) walk(rn, 0);

  // 整体 bounds
  let gmin = [Infinity,Infinity,Infinity], gmax = [-Infinity,-Infinity,-Infinity];
  for (const [, world] of worldMat) {}
  function collect(node) {
    const mesh = node.getMesh();
    if (mesh) {
      const world = worldMat.get(node) || matIdentity();
      for (const prim of mesh.listPrimitives()) {
        const posAcc = prim.getAttribute('POSITION');
        if (!posAcc) continue;
        const arr = posAcc.getArray();
        for (let i = 0; i < posAcc.getCount(); i++) {
          const [wx, wy, wz] = transformPoint(world, [arr[i*3], arr[i*3+1], arr[i*3+2]]);
          gmin[0]=Math.min(gmin[0],wx); gmin[1]=Math.min(gmin[1],wy); gmin[2]=Math.min(gmin[2],wz);
          gmax[0]=Math.max(gmax[0],wx); gmax[1]=Math.max(gmax[1],wy); gmax[2]=Math.max(gmax[2],wz);
        }
      }
    }
    for (const c of node.listChildren()) collect(c);
  }
  for (const rn of sceneRoots) collect(rn);

  console.log(`\n════════ ${path.basename(file)} (${(fs.statSync(file).size/1024/1024).toFixed(2)}MB) ════════`);
  console.log(`GLOBAL: X[${gmin[0].toFixed(1)},${gmax[0].toFixed(1)}] Y[${gmin[1].toFixed(1)},${gmax[1].toFixed(1)}] Z[${gmin[2].toFixed(1)},${gmax[2].toFixed(1)}]  size=(${(gmax[0]-gmin[0]).toFixed(1)},${(gmax[1]-gmin[1]).toFixed(1)},${(gmax[2]-gmin[2]).toFixed(1)})`);

  // 顶层物件清单：RootNode 下的命名组，各自算 bounds（便于单独摆放）
  const fbx = sceneRoots[0] && sceneRoots[0].listChildren()[0];
  const rootNode = fbx ? (fbx.listChildren()[0] || fbx) : sceneRoots[0];
  const groups = rootNode ? rootNode.listChildren() : [];
  console.log(`-- 顶层物件 (${groups.length} 个) --`);
  for (const g of groups) {
    let min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
    (function collect2(n) {
      const mesh = n.getMesh();
      if (mesh) {
        const world = worldMat.get(n) || matIdentity();
        for (const prim of mesh.listPrimitives()) {
          const posAcc = prim.getAttribute('POSITION');
          if (!posAcc) continue;
          const arr = posAcc.getArray();
          for (let i = 0; i < posAcc.getCount(); i++) {
            const [wx, wy, wz] = transformPoint(world, [arr[i*3], arr[i*3+1], arr[i*3+2]]);
            min[0]=Math.min(min[0],wx); min[1]=Math.min(min[1],wy); min[2]=Math.min(min[2],wz);
            max[0]=Math.max(max[0],wx); max[1]=Math.max(max[1],wy); max[2]=Math.max(max[2],wz);
          }
        }
      }
      for (const c of n.listChildren()) collect2(c);
    })(g);
    if (min[0] === Infinity) { console.log(`  ${g.getName() || '(unnamed)'} [无网格]`); continue; }
    const w=(max[0]-min[0]).toFixed(1), h=(max[1]-min[1]).toFixed(1), d=(max[2]-min[2]).toFixed(1);
    const cx=((min[0]+max[0])/2).toFixed(1), cz=((min[2]+max[2])/2).toFixed(1);
    console.log(`  ${String(g.getName()).padEnd(16)} size=(${w},${h},${d}) cx=${cx} cz=${cz}`);
  }
}

(async () => {
  const dir = path.join(__dirname, '..', 'houseModel');
  const targets = [
    'town_kit.glb',
    'objects/leaf_tree.glb',
    'objects/pine_tree.glb',
    'objects/rock.glb',
    'objects/rock2.glb',
    'objects/wood_log.glb',
  ];
  for (const f of targets) {
    try { await analyze(path.join(dir, f)); }
    catch (e) { console.error(`Error ${f}: ${e.message}`); }
  }
})();
