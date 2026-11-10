// 深度审查三辆坦克：炮管朝向 / 首上装甲方向 / 高耸平板结构扫描 / 完整性 / 俯视轮廓
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const path = require('path');

function matIdentity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function matMul(a, b) {
  const r = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
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
      0,0,0,1];
  }
  m[0]*=sx; m[1]*=sx; m[2]*=sx;
  m[4]*=sy; m[5]*=sy; m[6]*=sy;
  m[8]*=sz; m[9]*=sz; m[10]*=sz;
  m[12]=tx; m[13]=ty; m[14]=tz;
  return m;
}
function tp(m, p) {
  return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
          m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
          m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
}

async function analyze(file) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const worldMat = new Map();
  function cw(node, pw) {
    const lm = matFromTRS(node.getTranslation(), node.getRotation(), node.getScale());
    const w = pw ? matMul(pw, lm) : lm;
    worldMat.set(node, w);
    for (const c of node.listChildren()) cw(c, w);
  }
  const scenes = root.listScenes();
  const roots = scenes.length > 0 ? scenes[0].listChildren() : nodes.filter(n => !n.getParentNode());
  for (const rn of roots) cw(rn, null);

  // 收集所有网格节点的世界空间顶点
  const meshes = [];
  function walk(node) {
    const mesh = node.getMesh();
    if (mesh) {
      const w = worldMat.get(node) || matIdentity();
      const verts = [];
      let tris = 0;
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const arr = pos.getArray();
        for (let i = 0; i < pos.getCount(); i++) verts.push(tp(w, [arr[i*3], arr[i*3+1], arr[i*3+2]]));
        const idx = prim.getIndices();
        tris += (idx ? idx.getCount() : pos.getCount()) / 3;
      }
      if (verts.length) {
        const mat = mesh.listPrimitives()[0]?.getMaterial();
        meshes.push({ name: node.getName(), verts, tris: Math.round(tris), material: mat ? mat.getName() : '' });
      }
    }
    for (const c of node.listChildren()) walk(c);
  }
  for (const rn of roots) walk(rn);

  const all = meshes.flatMap(m => m.verts);
  const bb = (vs) => {
    const mn = [Infinity,Infinity,Infinity], mx = [-Infinity,-Infinity,-Infinity];
    for (const v of vs) for (let k = 0; k < 3; k++) { mn[k]=Math.min(mn[k],v[k]); mx[k]=Math.max(mx[k],v[k]); }
    return { mn, mx };
  };
  const total = bb(all);
  console.log(`\n████ ${path.basename(file)} ████`);
  console.log(`总包围盒: X[${total.mn[0].toFixed(2)},${total.mx[0].toFixed(2)}] Y[${total.mn[1].toFixed(2)},${total.mx[1].toFixed(2)}] Z[${total.mn[2].toFixed(2)},${total.mx[2].toFixed(2)}]  网格数=${meshes.length} 总面数=${meshes.reduce((s,m)=>s+m.tris,0)}`);

  // 1) 炮管：找细长突出网格（水平细长，顶端到模型最远端）
  // 炮管特征：横截面小（min(dx,dy,dz横向) < 0.5），长度 > 2.5，且一端到达模型总包围盒的极值
  console.log(`\n-- 疑似炮管（细长 + 达到模型端部）--`);
  for (const m of meshes) {
    const b = bb(m.verts);
    const dx = b.mx[0]-b.mn[0], dy = b.mx[1]-b.mn[1], dz = b.mx[2]-b.mn[2];
    const long = Math.max(dx, dz), horiz = [dx, dz];
    const thinCross = Math.min(dy, Math.min(...horiz));
    const atExtreme = Math.abs(b.mx[2]-total.mx[2]) < 0.6 || Math.abs(b.mn[2]-total.mn[2]) < 0.6 ||
                      Math.abs(b.mx[0]-total.mx[0]) < 0.6 || Math.abs(b.mn[0]-total.mn[0]) < 0.6;
    if (long > 2.5 && thinCross < 0.6 && atExtreme && b.mn[1] > 1.0) {
      console.log(`  ${m.name}: X[${b.mn[0].toFixed(2)},${b.mx[0].toFixed(2)}] Y[${b.mn[1].toFixed(2)},${b.mx[1].toFixed(2)}] Z[${b.mn[2].toFixed(2)},${b.mx[2].toFixed(2)}] verts=${m.verts.length} tris=${m.tris} mat=${m.material}`);
    }
  }

  // 2) 炮塔顶高度（除炮管/天线外网格的 max Y）
  let turretRoof = 0;
  for (const m of meshes) {
    const b = bb(m.verts);
    const dx = b.mx[0]-b.mn[0], dy = b.mx[1]-b.mn[1], dz = b.mx[2]-b.mn[2];
    const thin = Math.min(dx, dz) < 0.25; // 天线：横截面 < 0.25
    const isBarrel = dy < 0.8 && Math.max(dx, dz) > 2.5; // 炮管
    if (!thin && !isBarrel) turretRoof = Math.max(turretRoof, b.mx[1]);
  }
  console.log(`\n炮塔顶估计高度(不含炮管/天线): Y=${turretRoof.toFixed(2)}`);

  // 3) 高耸结构扫描：top > 炮塔顶+0.3 的所有网格
  console.log(`\n-- 超过炮塔顶 +0.3m 的网格 --`);
  for (const m of meshes) {
    const b = bb(m.verts);
    if (b.mx[1] > turretRoof + 0.3) {
      const dx = b.mx[0]-b.mn[0], dy = b.mx[1]-b.mn[1], dz = b.mx[2]-b.mn[2];
      const plateLike = dy > 1.0 && Math.min(dx, dz) < 0.15 && Math.max(dx, dz) > 1.0;
      console.log(`  ${m.name}${plateLike ? ' ★平板状' : ''}: X[${b.mn[0].toFixed(2)},${b.mx[0].toFixed(2)}] Y[${b.mn[1].toFixed(2)},${b.mx[1].toFixed(2)}] Z[${b.mn[2].toFixed(2)},${b.mx[2].toFixed(2)}] dims=(${dx.toFixed(2)},${dy.toFixed(2)},${dz.toFixed(2)}) 顶高超出炮塔顶 ${(b.mx[1]-turretRoof).toFixed(2)}m verts=${m.verts.length} tris=${m.tris} mat=${m.material}`);
    }
  }

  // 4) 平板详情：Z 或 X 向厚度 < 0.1 且高 > 1.5 的网格（潜在异常板）
  console.log(`\n-- 薄板网格（水平厚度<0.1 且 高>1.5）--`);
  for (const m of meshes) {
    const b = bb(m.verts);
    const dx = b.mx[0]-b.mn[0], dy = b.mx[1]-b.mn[1], dz = b.mx[2]-b.mn[2];
    if ((dz < 0.1 || dx < 0.1) && dy > 1.5) {
      // 顶点是否共面（单面板）+ X/Y 分布
      console.log(`  ${m.name}: dims=(${dx.toFixed(3)},${dy.toFixed(3)},${dz.toFixed(3)}) c=(${(b.mn[0]+dx/2).toFixed(2)},${(b.mn[1]+dy/2).toFixed(2)},${(b.mn[2]+dz/2).toFixed(2)})`);
      // 高度方向顶点直方图（0.25m 一档）
      const hist = {};
      for (const v of m.verts) { const k = (v[1]*4|0)/4; hist[k]=(hist[k]||0)+1; }
      console.log(`     Y分布: ${Object.entries(hist).sort((a,b)=>a[0]-b[0]).map(([k,c])=>`${k}:${c}`).join(' ')}`);
    }
  }

  // 5) 首上装甲方向判定：车体（不含炮塔）沿长轴的顶部轮廓
  // 车体网格：Y < 炮塔底，跨度 > 车长一半
  const longAxis = (total.mx[2]-total.mn[2]) >= (total.mx[0]-total.mn[0]) ? 'Z' : 'X';
  console.log(`\n-- 长轴: ${longAxis} --`);
  const hullMeshes = meshes.filter(m => {
    const b = bb(m.verts);
    const len = longAxis === 'Z' ? b.mx[2]-b.mn[2] : b.mx[0]-b.mn[0];
    const totalLen = longAxis === 'Z' ? total.mx[2]-total.mn[2] : total.mx[0]-total.mn[0];
    return b.mx[1] < turretRoof && len > totalLen * 0.6 && b.mn[1] < 0.6;
  });
  const hullVerts = hullMeshes.flatMap(m => m.verts);
  if (hullVerts.length) {
    const hb = bb(hullVerts);
    console.log(`车体(含履带)包围盒: X[${hb.mn[0].toFixed(2)},${hb.mx[0].toFixed(2)}] Y[${hb.mn[1].toFixed(2)},${hb.mx[1].toFixed(2)}] Z[${hb.mn[2].toFixed(2)},${hb.mx[2].toFixed(2)}]`);
    // 沿长轴分10档，输出每档最高Y（顶部轮廓：首上装甲一侧顶部高度递减）
    const bins = 12;
    const key = longAxis === 'Z' ? (v) => v[2] : (v) => v[0];
    const lo = longAxis === 'Z' ? hb.mn[2] : hb.mn[0];
    const hi = longAxis === 'Z' ? hb.mx[2] : hb.mx[0];
    console.log(`车体顶部轮廓（${longAxis} 从 ${(lo).toFixed(1)} 到 ${(hi).toFixed(1)} 分${bins}档, 每档最大Y）:`);
    for (let i = 0; i < bins; i++) {
      const a = lo + (hi-lo)*i/bins, b2 = lo + (hi-lo)*(i+1)/bins;
      let top = -Infinity, cnt = 0;
      for (const v of hullVerts) { const k = key(v); if (k >= a && k < b2) { cnt++; top = Math.max(top, v[1]); } }
      console.log(`   ${longAxis}[${a.toFixed(1)},${b2.toFixed(1)}] topY=${cnt ? top.toFixed(2) : '-'} (n=${cnt})`);
    }
  }

  // 6) 履带/负重轮：两侧对称性
  const trackish = meshes.filter(m => /track|Object_2$|Object_3$|Object_14|Object_19/i.test(m.name));
  console.log(`\n-- 履带类网格 --`);
  for (const m of trackish) {
    const b = bb(m.verts);
    console.log(`  ${m.name}: X[${b.mn[0].toFixed(2)},${b.mx[0].toFixed(2)}] Y[${b.mn[1].toFixed(2)},${b.mx[1].toFixed(2)}] Z[${b.mn[2].toFixed(2)},${b.mx[2].toFixed(2)}] tris=${m.tris}`);
  }
}

(async () => {
  for (const f of process.argv.slice(2)) await analyze(path.resolve(f));
})();
