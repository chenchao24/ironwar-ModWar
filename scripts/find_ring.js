// 通过炮塔底部顶点分布定位座圈圆心：炮塔mesh在座圈高度附近的顶点形成圆环
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');

(async () => {
  const [file, nodeName] = process.argv.slice(2);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(require('path').resolve(file));
  const node = doc.getRoot().listNodes().find(n => n.getName() === nodeName);
  if (!node || !node.getMesh()) { console.log('未找到节点'); return; }
  // 世界变换（含根矩阵）
  function matMul(a, b) {
    const r = new Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      r[i * 4 + j] = s;
    } return r;
  }
  function fromTRS(n) {
    const t = n.getTranslation() || [0, 0, 0], s = n.getScale() || [1, 1, 1], r = n.getRotation();
    let m = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    if (r && (r[0] || r[1] || r[2] || r[3])) {
      const [qx, qy, qz, qw] = r;
      const xx = qx*qx, yy = qy*qy, zz = qz*qz, xy = qx*qy, xz = qx*qz, yz = qy*qz, wx = qw*qx, wy = qw*qy, wz = qw*qz;
      m = [1-2*(yy+zz), 2*(xy+wz), 2*(xz-wy), 0, 2*(xy-wz), 1-2*(xx+zz), 2*(yz+wx), 0, 2*(xz+wy), 2*(yz-wx), 1-2*(xx+yy), 0, 0,0,0,1];
    }
    m[0]*=s[0]; m[1]*=s[0]; m[2]*=s[0]; m[4]*=s[1]; m[5]*=s[1]; m[6]*=s[1]; m[8]*=s[2]; m[9]*=s[2]; m[10]*=s[2];
    m[12]=t[0]; m[13]=t[1]; m[14]=t[2];
    return m;
  }
  const world = new Map();
  function walk(n, pm) {
    const w = pm ? matMul(pm, fromTRS(n)) : fromTRS(n);
    world.set(n, w);
    for (const c of n.listChildren()) walk(c, w);
  }
  const scene = doc.getRoot().listScenes()[0];
  for (const rn of scene.listChildren()) walk(rn, null);
  const M = world.get(node);
  const pts = [];
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const arr = pos.getArray();
    for (let i = 0; i < pos.getCount(); i++) {
      const x = arr[i*3], y = arr[i*3+1], z = arr[i*3+2];
      pts.push([
        M[0]*x + M[4]*y + M[8]*z + M[12],
        M[1]*x + M[5]*y + M[9]*z + M[13],
        M[2]*x + M[6]*y + M[10]*z + M[14],
      ]);
    }
  }
  // 长轴=L（模型X或Z），宽轴=W
  const yMin = Math.min(...pts.map(p => p[1])), yMax = Math.max(...pts.map(p => p[1]));
  console.log(`${nodeName}: verts=${pts.length} Y[${yMin.toFixed(2)},${yMax.toFixed(2)}]`);
  // 底部 20% 高度内的顶点：长轴 X 直方图（0.25m 精度）
  const low = pts.filter(p => p[1] < yMin + (yMax - yMin) * 0.2);
  const hist = {};
  for (const p of low) {
    const key = (Math.round(p[0] * 4) / 4).toFixed(2);
    hist[key] = (hist[key] || 0) + 1;
  }
  const keys = Object.keys(hist).sort((a, b) => +a - +b);
  console.log('底部顶点 X 分布:');
  for (const k of keys) console.log(`  X=${k}: ${'#'.repeat(Math.min(60, hist[k]))} ${hist[k]}`);
})();
