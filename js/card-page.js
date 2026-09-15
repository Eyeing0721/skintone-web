/**
 * skintone-web / js/card-page.js
 *
 * card.html 的控制器：取规格（后端优先，离线兜底）→ 画到 A4 画布 → 显示 specVersion 与来源。
 * 文案来自 js/copy.js 的 cardPage。
 */

import { loadCardSpec, renderCard, specSummary, toPngBlob, validateSpec, MM_TO_PX } from './card.js';
import { COPY } from './copy.js';
import { hydrateCopy } from './copy-hydrate.js';
import { apiFromQuery, normalizeBase, resolveApiBase } from './api.js';

const $ = (sel) => document.querySelector(sel);
const T = COPY.cardPage;

function setStatus(text, state) {
  const el = $('#card-status');
  if (!el) return;
  el.textContent = text;
  if (state) el.dataset.state = state;
}

function renderSpecList(spec, source, error) {
  const list = $('#spec-list');
  if (!list) return;
  const s = specSummary(spec);
  const F = T.specFields;
  const base = normalizeBase(apiFromQuery() || resolveApiBase());
  const byKind = Object.entries(s.byKind)
    .map(([k, v]) => `${k}×${v}`)
    .join('，');
  const rows = [
    [F.cardId, s.cardId],
    [F.specVersion, s.specVersion],
    [
      T.sourceLabel,
      source === 'server' ? T.sourceServer(base, s.cardId) : T.sourceFallback,
    ],
    [F.paper, F.paperValue(spec.paper)],
    [
      F.resolution,
      F.resolutionValue(
        Math.round(spec.paper.widthMm * MM_TO_PX),
        Math.round(spec.paper.heightMm * MM_TO_PX),
        MM_TO_PX,
      ),
    ],
    [F.aruco, F.arucoValue(spec.markers)],
    [F.markerCenters, spec.markers.centersMm.map(([x, y]) => `(${x},${y})`).join('  ')],
    [F.patches, F.patchValue(s.patchCount, byKind)],
  ];
  list.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${String(v)}</dd>`).join('');

  const problems = validateSpec(spec);
  if (problems.length) {
    const note = $('#card-fallback-note');
    if (note) {
      note.hidden = false;
      note.textContent = T.specProblem(problems);
    }
  } else if (error) {
    setStatus(T.fromFallback(error.message), 'fallback');
  } else {
    setStatus(T.fromServer(s.specVersion), 'server');
  }
}

/**
 * 屏幕预览缩放：按容器尺寸算一个 zoom 值，让 A4 尽量占满且不产生页面滚动。
 * 只影响屏幕（css/card.css 的 @media screen 才用 --paper-zoom）；打印时强制 zoom:1，
 * 毫米几何因此不受这里影响。
 */
function fitPaperZoom() {
  const wrap = document.querySelector('.paper-wrap');
  const paper = document.querySelector('.paper');
  if (!wrap || !paper) return;
  const availH = wrap.clientHeight - 10;
  const availW = wrap.clientWidth - 10;
  if (availH <= 0 || availW <= 0) return;
  // A4 毫米尺寸换算成 CSS px（96 dpi 基准：1 mm = 96/25.4 px）
  const pxPerMm = 96 / 25.4;
  const zoom = Math.min(availH / (297 * pxPerMm), availW / (210 * pxPerMm), 1);
  paper.style.setProperty('--paper-zoom', String(Math.max(0.2, zoom)));
}

async function boot() {
  hydrateCopy(document);
  document.title = COPY.page.cardTitle;
  const canvas = $('#card-canvas');
  setStatus(T.loading);
  const { spec, source, error } = await loadCardSpec();
  try {
    renderCard(canvas, spec);
  } catch (e) {
    const note = $('#card-fallback-note');
    if (note) {
      note.hidden = false;
      note.textContent = T.renderFailed(e.message);
    }
  }
  renderSpecList(spec, source, error);
  fitPaperZoom();

  $('#btn-print')?.addEventListener('click', () => window.print());
  $('#btn-download')?.addEventListener('click', async () => {
    try {
      const blob = await toPngBlob(canvas);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${spec.cardId || 'skintone-a4-v1'}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      setStatus(T.downloadFailed(e.message), 'fallback');
    }
  });

  window.addEventListener('resize', fitPaperZoom);
  window.addEventListener('beforeprint', () => {
    document.querySelector('.paper')?.style.setProperty('--paper-zoom', '1');
  });
  window.addEventListener('afterprint', fitPaperZoom);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
