// 软件光栅化 GLB 剪影，与实际截图掩码对比验证相机与几何理解
const sharp = require('sharp');
const path = require('path');
const THREE = require('three');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');

const W = 1280, H = 720;
const ROOT = [1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1];
function tp(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}

async function loadTris(glb) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path.resolve(glb));
  const root = doc.getRoot();
  const tris = []; // 每项 [v0,v1,v2] 世界坐标
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const arr = pos.getArray();
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const world = [];
      for (let i = 0; i < pos.getCount(); i++) world.push(tp(ROOT, [arr[i*3], arr[i*3+1], arr[i*3+2]]));
      if (idx) {
        const ia = idx.getArray();
        for (let i = 0; i < n; i += 3) tris.push([world[ia[i]], world[ia[i+1]], world[ia[i+2]]]);
      } else {
        for (let i = 0; i < n; i += 3) tris.push([world[i], world[i+1], world[i+2]]);
      }
    }
  }
  return tris;
}

function makeCamera(size, c, view) {
  const camera = new THREE.PerspectiveCamera(40, W/H, 0.1, 500);
  const r = Math.max(size[0], size[2]) * 0.75 + 2;
  if (view === 'side') { camera.position.set(c[0] + r*1.2, c[1] + r*0.35, 0.01); camera.lookAt(c[0], c[1], c[2]); }
  if (view === 'top') { camera.position.set(c[0], c[1] + r*1.6, 0.01); camera.lookAt(c[0], 0, c[2]); }
  if (view === 'front') { camera.position.set(0.01, c[1] + r*0.35, c[2] + r*1.2); camera.lookAt(0.01, c[1], c[2]); }
  camera.updateMatrixWorld(true);
  const m = camera.matrixWorldInverse.clone();
  const proj = camera.projectionMatrix.clone();
  return { m, proj, full: new THREE.Matrix4().multiplyMatrices(proj, m) };
}

function rasterize(tris, cam, skipPred) {
  const mask = new Uint8Array(W * H);
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (const t of tris) {
    if (skipPred && skipPred(t)) continue;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const pts = [];
    for (let k = 0; k < 3; k++) {
      v[k].set(t[k][0], t[k][1], t[k][2]).applyMatrix4(cam.full);
      // applyMatrix4 已做透视除法，v.x/v.y 即 NDC
      const sx = (v[k].x * 0.5 + 0.5) * W, sy = (1 - (v[k].y * 0.5 + 0.5)) * H;
      pts.push([sx, sy, v[k].z]);
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
    }
    if (maxX < 0 || minX > W || maxY < 0 || minY > H) continue;
    const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(W-1, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H-1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      // 重心坐标
      const d = (pts[1][0]-pts[0][0])*(pts[2][1]-pts[0][1]) - (pts[2][0]-pts[0][0])*(pts[1][1]-pts[0][1]);
      if (Math.abs(d) < 1e-9) continue;
      const w0 = ((pts[1][0]-x)*(pts[2][1]-y) - (pts[2][0]-x)*(pts[1][1]-y)) / d;
      const w1 = ((pts[2][0]-x)*(pts[0][1]-y) - (pts[0][0]-x)*(pts[2][1]-y)) / d;
      const w2 = 1 - w0 - w1;
      if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) mask[y*W + x] = 1;
    }
  }
  return mask;
}

// 标签 sprite 栅格化（世界位置 + scale 1.6x0.8，始终面向相机）
function rasterLabels(cam) {
  const labels = [
    { pos: [0,4,6], size: [1.6,0.8] }, { pos: [0,4,-6], size: [1.6,0.8] },
    { pos: [8,4,0], size: [1.6,0.8] }, { pos: [-8,4,0], size: [1.6,0.8] },
  ];
  const mask = new Uint8Array(W * H);
  for (const L of labels) {
    // sprite 面向相机: 在相机坐标系构造四角
    const c = new THREE.Vector3(...L.pos).applyMatrix4(cam.m);
    const hw = L.size[0]/2, hh = L.size[1]/2;
    const quads = [[-hw,hh],[hw,hh],[hw,-hh],[-hw,-hh]];
    const pts = quads.map(([x,y]) => { const p = new THREE.Vector3(x, y, c.z).applyMatrix4(cam.proj); return [(p.x/p.w*0.5+0.5)*W, (1-(p.y/p.w*0.5+0.5))*H]; });
    const minX = Math.max(0, Math.floor(Math.min(...pts.map(p=>p[0])))), maxX = Math.min(W-1, Math.ceil(Math.max(...pts.map(p=>p[0]))));
    const minY = Math.max(0, Math.floor(Math.min(...pts.map(p=>p[1])))), maxY = Math.min(H-1, Math.ceil(Math.max(...pts.map(p=>p[1]))));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) mask[y*W+x] = 1;
  }
  return mask;
}

async function analyze(tankName, glb, view, png, skipPred, note) {
  const tris = await loadTris(glb);
  const mn=[Infinity,Infinity,Infinity], mx=[-Infinity,-Infinity,-Infinity];
  for (const t of tris) for (const p of t) for (let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}
  const size=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]];
  const c=[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2];
  const cam = makeCamera(size, c, view);
  const maskA = rasterize(tris, cam, skipPred);
  const labelMask = rasterLabels(cam);
  // 截图掩码
  const { data } = await sharp(png).raw().toBuffer({resolveWithObject:true});
  let hit = 0, missA = 0, extraB = 0;
  for (let y = 60; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y*W+x)*3;
    const isTank = (Math.abs(data[i]-51)+Math.abs(data[i+1]-56)+Math.abs(data[i+2]-64)) > 20;
    const inLabel = labelMask[y*W+x] === 1;
    const a = maskA[y*W+x] === 1;
    if (a && (isTank || inLabel)) hit++;
    else if (a && !isTank && !inLabel) missA++;
    else if (!a && isTank && !inLabel) extraB++;
  }
  const totalA = hit + missA;
  console.log(`${tankName} [${view}]${note||''}: 栅格化剪影像素=${totalA}, 其中截图也有内容=${hit} (${(hit/totalA*100).toFixed(1)}%), 截图有但剪影没有=${extraB}`);
  return { maskA, labelMask, data };
}

(async () => {
  await analyze('勒克莱尔', 'newTankmodel2/leclerc_s2.glb', 'side', 'scripts/_shots/leclerc_side.png');
  await analyze('梅卡瓦', 'newTankmodel2/merkava_mark_iv.glb', 'side', 'scripts/_shots/merkava_side.png');
  await analyze('10式', 'newTankmodel2/type_10.glb', 'side', 'scripts/_shots/type10_side.png');
  await analyze('勒克莱尔', 'newTankmodel2/leclerc_s2.glb', 'top', 'scripts/_shots/leclerc_top.png');
  await analyze('梅卡瓦', 'newTankmodel2/merkava_mark_iv.glb', 'top', 'scripts/_shots/merkava_top.png');
  await analyze('10式', 'newTankmodel2/type_10.glb', 'top', 'scripts/_shots/type10_top.png');
  await analyze('勒克莱尔', 'newTankmodel2/leclerc_s2.glb', 'front', 'scripts/_shots/leclerc_front.png');
})();
