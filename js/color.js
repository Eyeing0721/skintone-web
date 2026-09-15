/**
 * skintone-web / js/color.js
 *
 * 前端最小色彩换算：sRGB ↔ CIELAB。**仅用于 UI 预览**（把服务端返回的 hex / lab 画成色块、
 * 生成页面背景色），不是测量链路的一部分。
 *
 * 算法与契约 §4 完全一致：
 *   - 白点 D65，CIE 1931 2° 标准观察者（Xn=0.95047, Yn=1.0, Zn=1.08883）
 *   - sRGB 传递函数严格按 IEC 61966-2-1
 *   - 一切平均 / 矩阵运算在线性空间做（这里不做平均，只是逐点换算）
 */

/** D65 白点（契约 §4） */
export const D65 = Object.freeze({ Xn: 0.95047, Yn: 1.0, Zn: 1.08883 });

/** sRGB(线性) → XYZ(D65) 矩阵（IEC 61966-2-1 / sRGB 规范） */
const M_SRGB_TO_XYZ = Object.freeze([
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
]);

/** XYZ(D65) → sRGB(线性) 矩阵 */
const M_XYZ_TO_SRGB = Object.freeze([
  [3.2404542, -1.5371385, -0.4985314],
  [-0.9692660, 1.8760108, 0.0415560],
  [0.0556434, -0.2040259, 1.0572252],
]);

const LAB_EPS = 216 / 24389; // (6/29)^3
const LAB_KAPPA = 24389 / 27; // (29/3)^3

/** sRGB 通道值 0–1 → 线性 0–1（IEC 61966-2-1） */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 线性 0–1 → sRGB 通道值 0–1 */
export function linearToSrgb(l) {
  return l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}

/** 取模到 [0,360) */
export function mod360(deg) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** [r,g,b] 0–255 → 线性 sRGB 0–1 三元组 */
export function rgb255ToLinear(rgb) {
  return rgb.map((v) => srgbToLinear(v / 255));
}

/** 线性 sRGB 0–1 → [r,g,b] 0–255（四舍五入并夹紧） */
export function linearToRgb255(lin) {
  return lin.map((v) => Math.max(0, Math.min(255, Math.round(linearToSrgb(v) * 255))));
}

/** 线性 sRGB 0–1 → XYZ（D65） */
export function linearRgbToXyz(lin) {
  const [r, g, b] = lin;
  return M_SRGB_TO_XYZ.map((row) => row[0] * r + row[1] * g + row[2] * b);
}

/** XYZ（D65）→ 线性 sRGB 0–1（不做夹紧，可能超出 [0,1]） */
export function xyzToLinearRgb(xyz) {
  const [x, y, z] = xyz;
  return M_XYZ_TO_SRGB.map((row) => row[0] * x + row[1] * y + row[2] * z);
}

/** XYZ（D65）→ CIELAB（D65，2°） */
export function xyzToLab(xyz, white = D65) {
  const f = (t) => (t > LAB_EPS ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116);
  const fx = f(xyz[0] / white.Xn);
  const fy = f(xyz[1] / white.Yn);
  const fz = f(xyz[2] / white.Zn);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** CIELAB → XYZ（D65） */
export function labToXyz(lab, white = D65) {
  const fy = (lab.L + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  const finv = (t) => (t ** 3 > LAB_EPS ? t ** 3 : (116 * t - 16) / LAB_KAPPA);
  return { X: finv(fx) * white.Xn, Y: finv(fy) * white.Yn, Z: finv(fz) * white.Zn };
}

/** sRGB [0–255] → CIELAB(D65) */
export function rgb255ToLab(rgb) {
  return xyzToLab(linearRgbToXyz(rgb255ToLinear(rgb)));
}

/** 线性 sRGB 0–1 → CIELAB(D65) */
export function linearRgbToLab(lin) {
  return xyzToLab(linearRgbToXyz(lin));
}

/** CIELAB → sRGB [0–255]（越界时夹紧） */
export function labToRgb255(lab) {
  const xyz = labToXyz(lab);
  return linearToRgb255(xyzToLinearRgb([xyz.X, xyz.Y, xyz.Z]));
}

/** 色相角 h_ab（度，0 红 +a 方向 → 90 黄） */
export function hueAngleDeg(lab) {
  return mod360((Math.atan2(lab.b, lab.a) * 180) / Math.PI);
}

/** 彩度 C*_ab */
export function chroma(lab) {
  return Math.hypot(lab.a, lab.b);
}

/** CIELAB → `#rrggbb` */
export function labToHex(lab) {
  return rgbToHex(labToRgb255(lab));
}

/** `#rrggbb` 或 `#rgb` → CIELAB(D65)；非法返回 null */
export function hexToLab(hex) {
  const rgb = hexToRgb255(hex);
  return rgb ? rgb255ToLab(rgb) : null;
}

/** `#rrggbb` / `#rgb` → [r,g,b] 0–255；非法返回 null */
export function hexToRgb255(hex) {
  if (typeof hex !== 'string') return null;
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** [r,g,b] 0–255 → `#rrggbb`（夹紧 + 取整） */
export function rgbToHex(rgb) {
  return (
    '#' +
    rgb
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * 相对亮度（WCAG），用于决定色块上的文字用黑还是白。
 * @returns {number} 0–1
 */
export function relativeLuminance(rgb) {
  const [r, g, b] = rgb255ToLinear(rgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 在给定背景色上，返回对比度更高的前景色（#111 或 #fff） */
export function readableInk(hex) {
  const rgb = hexToRgb255(hex);
  if (!rgb) return '#111111';
  return relativeLuminance(rgb) > 0.38 ? '#151515' : '#ffffff';
}

/** 数字格式化（UI 统一用，避免各模块各写一份） */
export function fmt(value, digits = 1, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  if (typeof value !== 'number') return String(value);
  return value.toFixed(digits);
}
