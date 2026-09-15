/**
 * skintone-web / js/aruco.js
 *
 * DICT_4X4_50 标记位阵（契约 §3：ArUco DICT_4X4_50，id 0/1/2/3，标记本体 20×20 mm）。
 *
 * 为什么不能"画个黑方块"：OpenCV 的 ArUco 检测器是先找四边形候选，再把它二值化成
 * 4×4 的位阵，然后跟字典里 50 条码做汉明距离比对（DICT_4X4_50 的 maxCorrectionBits = 1）。
 * 位阵错一格就匹配不上，透视矫正和色卡采样整条链路都起不来。
 *
 * 数据来源与验证：
 *   - OpenCV 4.x `modules/objdetect/src/aruco/predefined_dictionaries.hpp`
 *     中 `DICT_4X4_1000_BYTES` 的 DICT_4X4_50 前 4 项；
 *     每个标记存 8 字节 = 4 个旋转 × 2 字节（4×4 位阵按行主序、MSB 优先打包成 2 字节）。
 *   - 已用本机 opencv-python 4.11.0 实跑核对：
 *       d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
 *       d.bytesList[0].reshape(-1)  -> [181, 50, 235, 72, 76, 173, 18, 215]
 *       cv2.aruco.generateImageMarker(d, 0, 60) 最近邻降到 6×6 与下面 deriveBits 结果逐格一致。
 *
 * 本文件**不硬编码位阵**，而是从原始字节按位推导：位阵只可能从字节算出来，
 * 抄错一行的风险因此归零。
 */

/** 每个 id 的旋转 0 字节对 [b0, b1]（行主序、MSB 优先，共 16 位 = 4×4） */
const ROT0_BYTES = Object.freeze({
  0: [181, 50],
  1: [15, 154],
  2: [51, 45],
  3: [153, 70],
});

/**
 * 把 2 字节展开成 4×4 位阵。
 * @param {[number, number]} pair
 * @returns {number[][]} 4 行 × 4 列，1 = 白（marker 的亮格），0 = 黑
 */
export function deriveBits(pair) {
  const [b0, b1] = pair;
  const bits = [];
  for (let i = 7; i >= 0; i -= 1) bits.push((b0 >> i) & 1);
  for (let i = 7; i >= 0; i -= 1) bits.push((b1 >> i) & 1);
  const grid = [];
  for (let r = 0; r < 4; r += 1) grid.push(bits.slice(r * 4, r * 4 + 4));
  return grid;
}

/** id → 4×4 内层位阵（不含黑边） */
export const MARKER_BITS = Object.freeze(
  Object.fromEntries(Object.entries(ROT0_BYTES).map(([id, pair]) => [id, deriveBits(pair)])),
);

/** id → 6×6 完整格子（4×4 内层 + 1 格黑边，borderBits=1，与 generateImageMarker 一致） */
export function markerCellsWithBorder(id, borderBits = 1) {
  const inner = MARKER_BITS[id];
  if (!inner) throw new Error(`未知的 ArUco id: ${id}（本卡只用 0/1/2/3）`);
  const n = 4 + borderBits * 2;
  const cells = [];
  for (let r = 0; r < n; r += 1) {
    const row = new Array(n).fill(0);
    for (let c = 0; c < n; c += 1) {
      const ir = r - borderBits;
      const ic = c - borderBits;
      if (ir >= 0 && ir < 4 && ic >= 0 && ic < 4) row[c] = inner[ir][ic];
    }
    cells.push(row);
  }
  return cells;
}

/**
 * 把一个 ArUco 标记画到 canvas 上。
 *
 * 关键几何：`sizeMm` 与 `centersMm` 是**标记本体（含 borderBits 黑边）**的尺寸与中心，
 * 与 OpenCV `generateImageMarker(dict, id, sidePixels)` 的输出一一对应。不要再额外加白边，
 * 否则标记实际尺寸会超过规格，打印后中心位置会漂。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} id 标记 id（0/1/2/3）
 * @param {number} centerXMm 中心 x（mm，卡坐标系，原点左上）
 * @param {number} centerYMm 中心 y（mm）
 * @param {number} sizeMm 标记本体边长（mm）
 * @param {(mm: number) => number} mmToPx mm → 设备像素
 */
export function drawMarkerMm(ctx, id, centerXMm, centerYMm, sizeMm, mmToPx) {
  const cells = markerCellsWithBorder(id, 1);
  const n = cells.length; // 6
  const sidePx = mmToPx(sizeMm);
  const cellPx = sidePx / n;
  const x0 = mmToPx(centerXMm) - sidePx / 2;
  const y0 = mmToPx(centerYMm) - sidePx / 2;

  // 整个标记底为黑（borderBits 的黑边），再把白格填上。
  ctx.fillStyle = '#000000';
  // 用 ceil 消除浮点缝隙，保证边缘不留白线（白线会被检测器当成静区噪声）。
  ctx.fillRect(x0, y0, Math.ceil(sidePx), Math.ceil(sidePx));

  ctx.fillStyle = '#ffffff';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!cells[r][c]) continue;
      const px = x0 + c * cellPx;
      const py = y0 + r * cellPx;
      // 白格各自向上/向左取整，宁可多 0.5px 也不要缝隙。
      ctx.fillRect(
        Math.floor(px),
        Math.floor(py),
        Math.ceil(cellPx) + 1,
        Math.ceil(cellPx) + 1,
      );
    }
  }
}

/** 供调试/自测：把位阵打印成 ASCII（1=白，0=黑） */
export function markerAscii(id, withBorder = true) {
  const cells = withBorder ? markerCellsWithBorder(id, 1) : MARKER_BITS[id];
  return cells.map((row) => row.join('')).join('\n');
}
