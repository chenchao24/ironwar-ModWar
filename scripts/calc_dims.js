// 计算三台新坦克模型实际尺寸（scale 后），对比 dims
const tanks = {
  abrams_x: {
    scale: 0.008, modelYOffset: 12.78,
    // 从 analyze_glb2.js 输出
    body: { x: [-238.89, 238.89], y: [45.34, 223.31], z: [-352.19, 645.42] }, // Korpus
    turret: { x: [-240.71, 240.71], y: [203.33, 331.89], z: [-215.40, 460.56] }, // Bashnya
    barrel: { x: [-45.09, 45.09], y: [209.23, 305.72], z: [338.48, 981.21] }, // Stvol
    track: { x: [-231.57, 231.57], y: [-12.78, 170.07], z: [-355.23, 605.06] }, // Cube.001
    dims: { length: 9.77, width: 3.66, hullHeight: 1.8, turretTop: 2.44 },
  },
  t14: {
    scale: 0.09, modelYOffset: 0,
    body: { x: [-18.22, 19.51], y: [4.18, 19.76], z: [-57.14, 32.47] }, // Armata_T14_copy4
    turret: { x: [-14.51, 14.99], y: [15.78, 36.23], z: [-39.48, 3.48] }, // PolySphere7_copy3
    barrel: { x: [-1.40, 1.64], y: [19.61, 22.65], z: [0.13, 57.14] }, // PolySphere4
    track: { x: [-16.98, 17.01], y: [0.07, 13.74], z: [-47.91, 30.46] }, // PolySphere11+9
    dims: { length: 10.8, width: 3.5, hullHeight: 1.8, turretTop: 3.3 },
  },
  ztz99a: {
    scale: 1.0, modelYOffset: 0,
    body: { x: [-1.75, 1.77], y: [0.10, 1.71], z: [-4.02, 3.76] }, // Object_31 (车体)
    turret: { x: [-1.65, 1.65], y: [1.12, 3.32], z: [-2.48, 1.71] }, // Object_19
    barrel: { x: [-0.30, 0.33], y: [1.48, 2.08], z: [-0.12, 6.30] }, // Object_14
    track: { x: [-1.69, 1.70], y: [-0.01, 1.23], z: [-3.51, 3.54] }, // Object_3+6
    dims: { length: 11.0, width: 3.5, hullHeight: 1.6, turretTop: 2.37 },
  },
};

for (const [name, t] of Object.entries(tanks)) {
  const s = t.scale;
  const yo = t.modelYOffset;
  const real = (range) => (range[1] - range[0]) * s;
  const realY = (range) => (range[1] + yo) * s; // 顶部 Y（含 offset）
  const realYmin = (range) => (range[0] + yo) * s;

  console.log(`\n=== ${name} (scale=${s}, modelYOffset=${yo}) ===`);
  console.log(`  模型实际尺寸 (scale 后):`);
  console.log(`    车体长: ${real(t.body.z).toFixed(2)}m  宽: ${real(t.body.x).toFixed(2)}m  高: ${real(t.body.y).toFixed(2)}m`);
  console.log(`    履带长: ${real(t.track.z).toFixed(2)}m  宽: ${real(t.track.x).toFixed(2)}m`);
  console.log(`    履带底Y: ${realYmin(t.track.y).toFixed(2)}m  履带顶Y: ${realY(t.track.y).toFixed(2)}m`);
  console.log(`    车体顶Y: ${realY(t.body.y).toFixed(2)}m`);
  console.log(`    炮塔顶Y: ${realY(t.turret.y).toFixed(2)}m`);
  console.log(`    炮管长: ${real(t.barrel.z).toFixed(2)}m  炮口Z: ${(t.barrel.z[1] * s).toFixed(2)}m`);
  console.log(`  config dims:`);
  console.log(`    length: ${t.dims.length}  width: ${t.dims.width}  hullHeight: ${t.dims.hullHeight}  turretTop: ${t.dims.turretTop}`);
  console.log(`  建议 dims (模型实际):`);
  console.log(`    length: ${real(t.track.z).toFixed(2)}  width: ${real(t.track.x).toFixed(2)}  hullHeight: ${realY(t.body.y).toFixed(2)}  turretTop: ${realY(t.turret.y).toFixed(2)}`);
}