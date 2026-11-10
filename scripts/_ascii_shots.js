// 把截图转成 ASCII 掩码图：. 背景  g 网格  # 车体亮像素  o 车体暗像素(迷彩)  L 标签
const sharp = require('sharp');
const path = require('path');
const THREE = require('three');

const W = 1280, H = 720;
const CW = 8, CH = 16; // 每 ASCII 格 8x16 像素 → 160x45

async function asciiView(pngFile, labelWorldPts) {
  const { data } = await sharp(pngFile).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * W + x) * 3; return [data[i], data[i+1], data[i+2]]; };

  const rows = Math.floor(H / CH), cols = Math.floor(W / CW);
  const grid = [];
  for (let r = 0; r < rows; r++) { grid.push(new Array(cols).fill('.')); }

  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let tank = 0, dark = 0, gridc = 0;
    for (let dy = 0; dy < CH; dy += 2) for (let dx = 0; dx < CW; dx += 2) {
      const [R, G, B] = px(c*CW + dx, r*CH + dy);
      const d = Math.abs(R-51) + Math.abs(G-56) + Math.abs(B-64);
      if (d < 18) continue;
      if (B - R > 15 && G - R > -5) { gridc++; continue; } // 网格/蓝色标签
      const lum = 0.3*R + 0.6*G + 0.1*B;
      if (lum > 100) tank++; else dark++;
    }
    const n = (CH/2) * (CW/2); // 32 采样
    if (tank >= 3) grid[r][c] = '#';
    else if (dark >= 4 && tank + dark >= 6) grid[r][c] = 'o';
    else if (gridc >= 4) grid[r][c] = 'g';
    else if (tank + dark >= 2) grid[r][c] = tank >= dark ? '+' : ',';
  }
  // 投影标签位置（用调用方给的投影函数结果直接传屏幕坐标）
  if (labelWorldPts) for (const [ch, sx, sy] of labelWorldPts) {
    const c = Math.floor(sx / CW), r = Math.floor(sy / CH);
    if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = ch;
  }
  console.log('\n' + pngFile);
  // 顶部坐标尺
  let ruler = '     ';
  for (let c = 0; c < cols; c++) ruler += (c % 10 === 0) ? '|' : ' ';
  console.log(ruler);
  for (let r = 0; r < rows; r++) {
    console.log(String(r * CH).padStart(4) + ' ' + grid[r].join(''));
  }
}

(async () => {
  const S = 'scripts/_shots';
  await asciiView(`${S}/leclerc_side.png`);
  await asciiView(`${S}/type10_side.png`);
  await asciiView(`${S}/merkava_side.png`);
})();
