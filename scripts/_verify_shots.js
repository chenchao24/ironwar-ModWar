// 用 three.js 复现 newTankmodel2-preview.html 的相机，把关键世界点投影到截图像素坐标，
// 再采样实际 PNG 像素验证（炮口方向 / 高板 / 车头方向 / 天线等）
const sharp = require('sharp');
const path = require('path');
const THREE = require('three');

const W = 1280, H = 720;

async function projectPoints(tankKey, glbFile, view, points, pngFile) {
  // 读取模型总包围盒（与 preview 一致：Box3().setFromObject(gltf.scene)）
  const { NodeIO } = require('@gltf-transform/core');
  const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path.resolve(glbFile));
  const root = doc.getRoot();
  // 根矩阵（列主序）: [1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1]
  const ROOT = [1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1];
  function tp(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
  const mn = [Infinity,Infinity,Infinity], mx = [-Infinity,-Infinity,-Infinity];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const arr = pos.getArray();
      for (let i = 0; i < pos.getCount(); i++) {
        const v = tp(ROOT, [arr[i*3], arr[i*3+1], arr[i*3+2]]);
        for (let k = 0; k < 3; k++) { mn[k]=Math.min(mn[k],v[k]); mx[k]=Math.max(mx[k],v[k]); }
      }
    }
  }
  const box = { min: mn, max: mx };
  const size = [mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]];
  const c = [(mn[0]+mx[0])/2, (mn[1]+mx[1])/2, (mn[2]+mx[2])/2];

  const camera = new THREE.PerspectiveCamera(40, W/H, 0.1, 500);
  const r = Math.max(size[0], size[2]) * 0.75 + 2;
  if (view === 'side') { camera.position.set(c[0] + r*1.2, c[1] + r*0.35, 0.01); camera.lookAt(c[0], c[1], c[2]); }
  if (view === 'top') { camera.position.set(c[0], c[1] + r*1.6, 0.01); camera.lookAt(c[0], 0, c[2]); }
  if (view === 'front') { camera.position.set(0.01, c[1] + r*0.35, c[2] + r*1.2); camera.lookAt(0.01, c[1], c[2]); }
  camera.updateMatrixWorld(true);

  // 采样 PNG
  const { data } = await sharp(pngFile).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (Math.round(y) * W + Math.round(x)) * 3;
    return [data[i], data[i+1], data[i+2]];
  };

  console.log(`\n=== ${tankKey} [${view}] 模型bbox X[${mn[0].toFixed(2)},${mx[0].toFixed(2)}] Y[${mn[1].toFixed(2)},${mx[1].toFixed(2)}] Z[${mn[2].toFixed(2)},${mx[2].toFixed(2)}] r=${r.toFixed(2)}`);
  for (const [label, wp] of points) {
    const v = new THREE.Vector3(wp[0], wp[1], wp[2]).project(camera);
    const sx = (v.x * 0.5 + 0.5) * W, sy = (1 - (v.y * 0.5 + 0.5)) * H;
    if (sx < 0 || sx > W || sy < 0 || sy > H) { console.log(`  ${label}: 屏幕外`); continue; }
    // 采样 5x5 邻域，找最亮(非背景)像素
    let best = null;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const p = px(sx+dx, sy+dy);
      const lum = 0.3*p[0] + 0.6*p[1] + 0.1*p[2];
      if (!best || lum > best.lum) best = { p, lum };
    }
    const p = best.p;
    const isTank = best.lum > 85 && Math.abs(p[2]-p[0]) < 40 && Math.abs(p[2]-p[1]) < 40;
    console.log(`  ${label}: 屏幕(${sx.toFixed(0)},${sy.toFixed(0)}) 像素RGB(${p[0]},${p[1]},${p[2]}) ${isTank ? '→ 是车体' : '→ 背景/网格'}`);
  }
}

(async () => {
  const S = 'scripts/_shots';
  const M = 'newTankmodel2';
  // 勒克莱尔
  await projectPoints('勒克莱尔 leclerc_s2', `${M}/leclerc_s2.glb`, 'side', [
    ['炮口尖端(+Z端)', [0, 1.91, 6.48]],
    ['炮管中段', [0, 1.91, 4.0]],
    ['炮塔顶', [0, 3.04, -0.4]],
    ['高板顶部', [0, 5.0, -1.56]],
    ['高板中部', [0, 3.9, -1.56]],
    ['炮塔尾部(无板处Z=-2.6)', [0, 2.9, -2.6]],
    ['车头首上(Z=3.3)', [0, 1.2, 3.3]],
    ['车尾(Z=-4.0)', [0, 1.5, -4.0]],
    ['车体侧面上部', [0.9, 1.5, 0]],
  ], `${S}/leclerc_side.png`);
  await projectPoints('勒克莱尔 leclerc_s2', `${M}/leclerc_s2.glb`, 'top', [
    ['炮口尖端(+Z端)', [0, 1.91, 6.48]],
    ['高板位置(Z=-1.94)', [0, 3.0, -1.56]],
    ['炮塔中心', [0, 2.0, -0.4]],
    ['车头首上(Z=3.3)', [0, 1.2, 3.3]],
    ['车尾(Z=-4.0)', [0, 1.0, -4.0]],
  ], `${S}/leclerc_top.png`);
  await projectPoints('勒克莱尔 leclerc_s2', `${M}/leclerc_s2.glb`, 'front', [
    ['炮口尖端(+Z端,朝向相机)', [0, 1.91, 6.48]],
    ['炮管中段', [0, 1.91, 4.0]],
    ['高板顶部', [0, 5.0, -1.56]],
    ['炮塔正面', [0, 2.2, 1.95]],
  ], `${S}/leclerc_front.png`);
  // 梅卡瓦
  await projectPoints('梅卡瓦 merkava_mark_iv', `${M}/merkava_mark_iv.glb`, 'side', [
    ['炮口尖端(+X端)', [2.59, 2.05, 4.11]],
    ['炮管中段', [2.59, 2.05, 2.0]],
    ['炮塔顶', [-1.3, 2.63, 0]],
    ['天线尖(最高4.6)', [-3.8, 4.55, -1.0]],
    ['炮塔尾部链条裙板(Z..X=-3.5)', [-3.5, 1.75, 0]],
    ['车头首上(X=2.8)', [2.8, 1.1, 0]],
    ['车尾(X=-4.4)', [-4.4, 1.0, 0]],
  ], `${S}/merkava_side.png`);
  await projectPoints('梅卡瓦 merkava_mark_iv', `${M}/merkava_mark_iv.glb`, 'top', [
    ['炮口尖端(+X端)', [2.59, 2.05, 4.11]],
    ['炮塔中心', [-1.3, 2.0, 0]],
    ['车头首上(X=2.8)', [2.8, 1.1, 0]],
    ['车尾(X=-4.4)', [-4.4, 1.0, 0]],
    ['右履带(Z=1.37)', [0, 0.6, 1.37]],
  ], `${S}/merkava_top.png`);
  // 10式
  await projectPoints('10式 type_10', `${M}/type_10.glb`, 'side', [
    ['炮口尖端(+Z端)', [0, 1.84, 5.53]],
    ['炮管中段', [0, 1.84, 3.5]],
    ['炮塔顶', [0, 2.87, 0.1]],
    ['高板顶部', [0, 4.2, -1.94]],
    ['高板中部', [0, 3.3, -1.94]],
    ['炮塔尾部(Z=-2.1)', [0, 2.6, -2.1]],
    ['车头首上(Z=3.0)', [0, 1.2, 3.0]],
    ['车尾(Z=-3.9)', [0, 1.0, -3.9]],
  ], `${S}/type10_side.png`);
  await projectPoints('10式 type_10', `${M}/type_10.glb`, 'top', [
    ['炮口尖端(+Z端)', [0, 1.84, 5.53]],
    ['高板位置(Z=-1.94)', [0, 3.0, -1.94]],
    ['炮塔中心', [0, 2.0, 0.1]],
    ['车头首上(Z=3.0)', [0, 1.2, 3.0]],
    ['车尾(Z=-3.9)', [0, 1.0, -3.9]],
  ], `${S}/type10_top.png`);
})();
