/**
 * skintone-web / js/card.js
 *
 * 参考卡渲染（契约 §3 「skintone-a4-v1」）。
 *
 * 打印精度的关键：
 *   1. 画布用 mm 直接建模，`MM_TO_PX` 是唯一的比例常量。
 *   2. 画布元素的 CSS 尺寸写成 `210mm × 297mm`（由调用方设置），不是 px、
 *      更不是百分比 —— 这样打印时 1 mm 就是 1 mm，不依赖 DPI 推断。
 *   3. ArUco 位阵从 js/aruco.js 的原始字节推导，绝不手画方块。
 *   4. 页面用 `@page { size: A4; margin: 0 }`，用户只要关掉"适应页面"就 100% 精确。
 *
 * 规格来源：优先 GET /v1/card/{id}（避免两个仓库的色块值漂移）；
 * 后端未就绪或离线时用 js/config.js 的 CARD_FALLBACK，并在页面上标出用的是哪份。
 */

import { CARD_FALLBACK, DEFAULT_CARD_ID } from './config.js';
import { COPY } from './copy.js';
import { getCard } from './api.js';
import { drawMarkerMm } from './aruco.js';

/** 画布分辨率：每毫米多少个设备像素。12 px/mm ≈ 305 DPI，够打印锐利。 */
export const MM_TO_PX = 12;

/** 色块描边宽度（mm）：1 pt ≈ 0.35 mm，用细线帮用户对齐取样位置 */
const PATCH_STROKE_MM = 0.18;

/**
 * 卡面配色与字体全部来自 CSS 变量（默认值见 css/style.css 的 :root），
 * 换皮时改 CSS 即可，不用碰这个文件。
 */
const THEME_FALLBACK = Object.freeze({
  paper: '#ffffff',
  ink: '#111111',
  muted: '#555555',
  strokeLight: 'rgba(0,0,0,.35)',
  strokeDark: 'rgba(255,255,255,.45)',
  labelLight: 'rgba(0,0,0,.5)',
  labelDark: 'rgba(255,255,255,.62)',
  font: 'system-ui, "Noto Sans SC", "Microsoft YaHei", sans-serif',
  mono: 'ui-monospace, Consolas, monospace',
});

function cssVar(name) {
  if (typeof window === 'undefined' || !document.body) return '';
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function cardTheme() {
  const t = THEME_FALLBACK;
  return {
    paper: cssVar('--card-paper') || t.paper,
    ink: cssVar('--card-ink') || t.ink,
    muted: cssVar('--card-muted') || t.muted,
    line: cssVar('--card-line') || t.line,
    strokeLight: cssVar('--card-stroke-light') || t.strokeLight,
    strokeDark: cssVar('--card-stroke-dark') || t.strokeDark,
    labelLight: cssVar('--card-label-light') || t.labelLight,
    labelDark: cssVar('--card-label-dark') || t.labelDark,
    font: cssVar('--card-canvas-font') || t.font,
    mono: cssVar('--card-canvas-mono') || t.mono,
  };
}

/** 色块几何常量（mm）——与 config.js 的 CARD_GEOMETRY 对应 */
const LAYOUT = Object.freeze({
  titleY: 45,
  subtitleY: 50.5,
  warningY: 56,
  footerStartY: 236,
  footerGap: 6.5,
  footerPadX: 25,
  calibrateNoteX: 42,
  calibrateNoteY: 212,
  calibrateNoteW: 78,
  calibrateNoteGap: 5.5,
});

/** mm → 设备像素 */
export const mmToPx = (mm) => mm * MM_TO_PX;

/** #rrggbb → [r,g,b] */
function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** [r,g,b] → #rrggbb（nominalSrgb 就是 sRGB 编码值，直接当 CSS 颜色用，不是 Lab） */
export function rgbToHex(rgb) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** 该色块用什么颜色描边：浅色块用深线，深色块用浅线，保证边界可见 */
function strokeFor(rgb, theme) {
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum > 0.5 ? theme.strokeLight : theme.strokeDark;
}

/** 取后端规格；失败则回落到 config.js 的兜底副本 */
export async function loadCardSpec({ cardId = DEFAULT_CARD_ID, base } = {}) {
  try {
    const spec = await getCard(cardId, base);
    if (!spec || !Array.isArray(spec.patches) || !spec.markers) throw new Error('规格不完整');
    return { spec, source: 'server' };
  } catch (error) {
    return { spec: CARD_FALLBACK, source: 'fallback', error };
  }
}

/** 校验规格自洽性，返回问题列表（空数组 = 通过） */
export function validateSpec(spec) {
  const problems = [];
  if (!spec || typeof spec !== 'object') return ['规格不是对象'];
  const paper = spec.paper || {};
  if (!paper.widthMm || !paper.heightMm) problems.push('缺少 paper 尺寸');
  const markers = spec.markers || {};
  if (!Array.isArray(markers.centersMm) || !Array.isArray(markers.ids)) problems.push('缺少 markers 定义');
  else if (markers.ids.length !== markers.centersMm.length) problems.push('markers.ids 与 centersMm 数量不一致');
  else {
    markers.centersMm.forEach(([x, y], i) => {
      const half = (markers.sizeMm || 0) / 2;
      if (x - half < 0 || y - half < 0 || x + half > paper.widthMm || y + half > paper.heightMm) {
        problems.push(`标记 ${markers.ids[i]} 超出纸面`);
      }
    });
  }
  for (const p of spec.patches || []) {
    const [x, y] = p.centerMm || [];
    const half = (p.sizeMm || 0) / 2;
    if (x === undefined || y === undefined) problems.push(`色块 ${p.id} 缺少 centerMm`);
    else if (x - half < 0 || y - half < 0 || x + half > paper.widthMm || y + half > paper.heightMm) {
      problems.push(`色块 ${p.id} 超出纸面`);
    }
    if (!Array.isArray(p.nominalSrgb) || p.nominalSrgb.length !== 3) problems.push(`色块 ${p.id} 的 nominalSrgb 不合法`);
    if (!['gray', 'color', 'skin', 'olive'].includes(p.kind)) problems.push(`色块 ${p.id} 的 kind=${p.kind} 不在契约枚举内`);
  }
  return problems;
}

/** 在画布上按 mm 宽度折行绘制文本，返回占用高度（mm） */
function wrapText(
  ctx,
  text,
  xMm,
  yMm,
  maxWMm,
  lineHMm,
  { theme, fontMm = 2.6, weight = '', align = 'left', color = '' } = {},
) {
  const t = theme || THEME_FALLBACK;
  ctx.save();
  ctx.fillStyle = color || t.ink;
  ctx.font = `${weight} ${mmToPx(fontMm)}px ${t.font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const maxPx = mmToPx(maxWMm);
  const chars = String(text).split('');
  const lines = [];
  let line = '';
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxPx && line) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => {
    ctx.fillText(l, mmToPx(xMm), mmToPx(yMm + i * lineHMm));
  });
  ctx.restore();
  return lines.length * lineHMm;
}

/**
 * 把一份规格画到 canvas 上。
 * @param {HTMLCanvasElement} canvas
 * @param {object} spec 契约 §2.2 的响应（或 CARD_FALLBACK）
 * @returns {{canvas: HTMLCanvasElement, widthMm: number, heightMm: number}}
 */
export function renderCard(canvas, spec) {
  const theme = cardTheme();
  const paper = spec.paper || CARD_FALLBACK.paper;
  const widthMm = paper.widthMm || 210;
  const heightMm = paper.heightMm || 297;
  canvas.width = Math.round(mmToPx(widthMm));
  canvas.height = Math.round(mmToPx(heightMm));
  canvas.style.width = `${widthMm}mm`;
  canvas.style.height = `${heightMm}mm`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // 纸底：必须显式填白，否则打印机可能按透明处理
  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ── 顶部标识（在标记之间的空档，y < 65） ──
  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${mmToPx(5.4)}px ${theme.font}`;
  ctx.fillText(COPY.cardCanvas.title, mmToPx(widthMm / 2), mmToPx(45));
  ctx.font = `${mmToPx(2.9)}px ${theme.mono}`;
  ctx.fillStyle = theme.muted;
  ctx.fillText(`${spec.cardId || DEFAULT_CARD_ID} · spec ${spec.specVersion || '?'}`, mmToPx(widthMm / 2), mmToPx(50.5));
  ctx.font = `${mmToPx(2.6)}px ${theme.font}`;
  ctx.fillText(COPY.cardCanvas.scaleWarning, mmToPx(widthMm / 2), mmToPx(56));

  // ── ArUco 标记（契约 §3：DICT_4X4_50，本体 20×20 mm，中心见规格） ──
  const m = spec.markers || CARD_FALLBACK.markers;
  m.centersMm.forEach(([cx, cy], i) => {
    drawMarkerMm(ctx, m.ids[i], cx, cy, m.sizeMm, mmToPx);
  });

  // ── 色块 ──
  for (const p of spec.patches || []) {
    const [cx, cy] = p.centerMm;
    const size = p.sizeMm;
    const x = mmToPx(cx - size / 2);
    const y = mmToPx(cy - size / 2);
    const w = mmToPx(size);
    const h = mmToPx(size);
    const rgb = p.nominalSrgb;
    ctx.fillStyle = rgbToHex(rgb);
    ctx.fillRect(x, y, w, h);
    const sw = Math.max(1, mmToPx(PATCH_STROKE_MM));
    const stroke = strokeFor(rgb, theme);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = sw;
    ctx.strokeRect(x + sw / 2, y + sw / 2, w - sw, h - sw);
    // 色块 id 印在色块中心，小字、跟随对比色，不遮挡取样区（服务端只取中心 60%）
    ctx.fillStyle = stroke === theme.strokeLight ? theme.labelLight : theme.labelDark;
    ctx.font = `${mmToPx(2.3)}px ${theme.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.id), mmToPx(cx), mmToPx(cy));
  }

  // ── 底部说明 ──
  const C = COPY.cardCanvas;
  let y = 236;
  const instructions = Array.isArray(spec.instructions) ? spec.instructions : CARD_FALLBACK.instructions;
  wrapText(ctx, C.footerTitle, 25, y, widthMm - 50, 4.2, { theme, fontMm: 3.2, weight: '600' });
  y += 6.5;
  instructions.forEach((line, i) => {
    const used = wrapText(ctx, `${i + 1}. ${line}`, 25, y, widthMm - 50, 3.9, {
      theme,
      fontMm: 2.6,
      color: theme.muted,
    });
    y += used + 0.6;
  });

  // ── 校准提示（放在左下深色块旁边） ──
  wrapText(ctx, C.measureNote, 42, 212, 78, 3.6, { theme, fontMm: 2.4, color: theme.muted });
  wrapText(ctx, C.geometryNote, 42, 217.5, 78, 3.6, { theme, fontMm: 2.4, color: theme.muted });

  return { canvas, widthMm, heightMm };
}

/**
 * 把画布导出成可下载的 PNG（给「没有打印对话框」的场景兜底）。
 * @returns {Promise<Blob>}
 */
export function toPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出 PNG 失败'))), 'image/png');
  });
}

/** 规格摘要，供页面显示（不打印） */
export function specSummary(spec) {
  const patches = spec.patches || [];
  const byKind = {};
  for (const p of patches) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  return {
    cardId: spec.cardId || DEFAULT_CARD_ID,
    specVersion: spec.specVersion || '?',
    patchCount: patches.length,
    byKind,
    markerIds: (spec.markers && spec.markers.ids) || [],
  };
}
