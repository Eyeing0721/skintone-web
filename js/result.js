/**
 * skintone-web / js/result.js
 *
 * 结果可视化（契约 §2.3 响应 / §5 置信度 / §6 建议）。
 * 本模块只做一件事：把服务端返回的对象翻成可读的 DOM 片段。
 * 所有数值都按契约字段名读取；字段缺失时显示占位符，不猜、不补算。
 *
 * 措辞、中文类别名、门禁显示名一律来自 js/copy.js。
 */

import { GATE_META, SPEC_VERSION } from './config.js';
import { COPY } from './copy.js';
import { chroma, fmt, hexToLab, hexToRgb255, hueAngleDeg, labToHex, readableInk } from './color.js';

const R = COPY.result;
const F = R.cards.fields;
const EMPTY = COPY.common.emptyValue;

const nf = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? EMPTY : Number(v).toFixed(d));

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function depthLabel(value) {
  // 只回中文。之前把枚举值也拼在后面（"中等（intermediate）"），是给开发者看的，
  // 摆在用户面前只会显得不专业。
  return R.depthLabels[value] || value || EMPTY;
}

function depthRange(value) {
  const range = R.depthRanges[value];
  return range ? `ITA° ${range}` : '';
}

function undertoneLabel(value) {
  return R.undertoneLabels[value] || value || EMPTY;
}

/** 门禁实测值的显示格式（占比类按百分比显示） */
function gateValue(id, value) {
  if (value === null || value === undefined) return EMPTY;
  const meta = GATE_META[id];
  if (meta && meta.percent) return `${(Number(value) * 100).toFixed(2)}%`;
  if (id === 'roi_area') return `${Math.round(Number(value))} px`;
  return Number(value).toFixed(2);
}

/** 色块：背景取 hex，文字自动取黑/白 */
function swatch(hex, name, sub) {
  const safe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(hex || '')) ? hex : '#777777';
  const ink = readableInk(safe);
  return `<div class="swatch" style="background:${esc(safe)};color:${ink}">
      ${name ? `<span class="swatch-name">${esc(name)}</span>` : ''}
      <span class="swatch-hex">${esc(safe)}</span>
      ${sub ? `<span class="swatch-sub">${esc(sub)}</span>` : ''}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* 各区块                                                              */
/* ------------------------------------------------------------------ */

function heroCard(r) {
  const skin = r.skin || {};
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(skin.hex || '')) ? skin.hex : '#8a8a8a';
  const ink = readableInk(hex);
  return `<section class="card hero">
    <div class="hero-swatch" style="background:${esc(hex)};color:${ink}">
      <b>${esc(depthLabel(skin.depthClass))}</b>
      <span>${esc(R.undertoneLabel)} ${esc(undertoneLabel(skin.undertone && skin.undertone.label))}</span>
      <span class="hero-swatch-hex">${esc(hex)}</span>
    </div>
  </section>`;
}

function confidenceCard(r) {
  const c = r.confidence || {};
  const level = R.confidenceLevels[c.level] || { label: c.level || EMPTY, tone: 'warn' };
  const gates = Array.isArray(c.gates) ? c.gates : [];
  const rows = gates
    .map((g) => {
      const meta = GATE_META[g.id] || {};
      const label = R.gateLabels[g.id] || g.id;
      const dirText = meta.dir === 'gte' ? '≥' : '≤';
      return `<tr class="${g.passed ? 'pass' : 'fail'}">
        <td class="gate-name">${esc(label)}<span class="muted tiny">${esc(g.id)}</span></td>
        <td class="gate-verdict">${g.passed ? esc(COPY.result.cards.yesNo.yes) : esc(COPY.result.cards.yesNo.no)}</td>
        <td class="gate-num">${gateValue(g.id, g.value)}</td>
        <td class="gate-num muted">${dirText} ${gateValue(g.id, g.threshold)}</td>
      </tr>`;
    })
    .join('');
  const failed = gates.filter((g) => !g.passed);
  const scoreText =
    c.score === undefined || c.score === null ? '' : ` · ${(Number(c.score) * 100).toFixed(0)}%`;
  return `<section class="card">
    <header class="card-head">
      <h2>${esc(R.cards.confidence)}</h2>
      <span class="badge tone-${esc(level.tone)}">${esc(level.label)}${scoreText}</span>
    </header>
    ${
      failed.length
        ? `<ul class="gate-summary">${failed
            .map((g) => {
              const meta = GATE_META[g.id] || {};
              const label = R.gateLabels[g.id] || g.id;
              const dir = meta.dir === 'gte' ? '≥' : '≤';
              return `<li>${esc(
                R.cards.gateFailed(label, gateValue(g.id, g.value), dir, gateValue(g.id, g.threshold), g.message || ''),
              )}</li>`;
            })
            .join('')}</ul>`
        : `<p class="muted small">${esc(R.cards.allGatesPassed)}</p>`
    }
    <details class="gates" ${failed.length ? 'open' : ''}>
      <summary>${esc(R.cards.gatesSummary(gates.length))}</summary>
      <table class="gate-table">
        <thead><tr><th>${esc(R.cards.confidence)}</th><th></th><th>${esc(F.deltaE)}</th><th></th></tr></thead>        <tbody>${rows || `<tr><td colspan="4" class="muted">${esc(R.cards.noGates)}</td></tr>`}</tbody>
      </table>
    </details>
  </section>`;
}

function undertoneCard(r) {
  const u = (r.skin && r.skin.undertone) || {};
  const probs = u.probabilities || {};
  const bars = R.undertoneProbKeys
    .map(({ key, label }) => {
      const p = probs[key];
      const pct = p === null || p === undefined ? 0 : Math.max(0, Math.min(1, Number(p))) * 100;
      return `<div class="prob-row">
      <span class="prob-label">${esc(label)}</span>
      <span class="prob-track"><i style="width:${pct.toFixed(1)}%"></i></span>
      <span class="prob-value">${p === null || p === undefined ? EMPTY : `${pct.toFixed(1)}%`}</span>
    </div>`;
    })
    .join('');
  const axis = u.axis || {};
  return `<section class="card">
    <header class="card-head"><h2>${esc(R.cards.undertone)}</h2><span class="muted small">${esc(R.cards.undertoneSub)}</span></header>
    <div class="probs">${bars}</div>
    <div class="kv-grid">
      <div><span class="muted small">a*/b*</span><b>${nf(axis.aOverB, 3)}</b></div>
      <div><span class="muted small">h_ab</span><b>${nf(axis.hueAngleDeg, 1)}°</b></div>
      <div><span class="muted small">${esc(F.melanin)}</span><b>${nf(r.skin && r.skin.melaninIndex, 3)}</b></div>
      <div><span class="muted small">${esc(F.hemoglobin)}</span><b>${nf(r.skin && r.skin.hemoglobinIndex, 3)}</b></div>
    </div>
  </section>`;
}

function labCard(r) {
  const lab = (r.skin && r.skin.labD65) || {};
  const hex = (r.skin && r.skin.hex) || labToHex({ L: lab.L || 0, a: lab.a || 0, b: lab.b || 0 });
  const rgb = hexToRgb255(hex);
  const lin = r.skin && Array.isArray(r.skin.linearRgb) ? r.skin.linearRgb : null;
  const roi = (r.skin && r.skin.roi) || {};
  const regions = Array.isArray(roi.regions) ? roi.regions.join(' + ') : EMPTY;
  return `<section class="card">
    <header class="card-head"><h2>${esc(R.cards.lab)}</h2><span class="muted small">${esc(R.cards.labSub)}</span></header>
    <div class="lab-wrap">
      <div class="lab-swatch" style="background:${esc(hex)};color:${readableInk(hex)}">
        <span class="swatch-hex">${esc(hex)}</span>
        ${rgb ? `<span class="swatch-sub">sRGB ${rgb.join(', ')}</span>` : ''}
      </div>
      <div class="lab-axes">
        <div class="axis"><span class="axis-name">${esc(R.cards.labAxes.L)}</span><b>${nf(lab.L, 2)}</b></div>
        <div class="axis"><span class="axis-name">${esc(R.cards.labAxes.a)}</span><b>${nf(lab.a, 2)}</b></div>
        <div class="axis"><span class="axis-name">${esc(R.cards.labAxes.b)}</span><b>${nf(lab.b, 2)}</b></div>
      </div>
    </div>
    <div class="kv-grid">
      <div><span class="muted small">${esc(F.pixels)}</span><b>${
        roi.pixelCount === undefined || roi.pixelCount === null ? EMPTY : `${roi.pixelCount} px`
      }</b></div>
      <div><span class="muted small">${esc(F.regions)}</span><b>${esc(regions)}</b></div>
      ${
        lin
          ? `<div class="span2"><span class="muted small">${esc(F.linearRgb)}</span><b>${lin
              .map((v) => Number(v).toFixed(4))
              .join(', ')}</b></div>`
          : ''
      }
    </div>
    <p class="muted tiny">${esc(R.cards.labPreviewNote)}</p>
  </section>`;
}

function illuminantCard(r) {
  const il = r.illuminant;
  const cal = r.calibration;
  if (!il && !cal) return '';
  const rows = [];
  if (il) {
    rows.push(`<div><span class="muted small">${esc(F.method)}</span><b>${esc(il.method || EMPTY)}</b></div>`);
    rows.push(
      `<div><span class="muted small">${esc(F.cct)}</span><b>${
        il.cct === null || il.cct === undefined ? EMPTY : `${Math.round(il.cct)} K`
      }</b></div>`,
    );
    rows.push(`<div><span class="muted small">${esc(F.duv)}</span><b>${nf(il.duv, 4)}</b></div>`);
    rows.push(
      `<div><span class="muted small">${esc(F.xy)}</span><b>${
        Array.isArray(il.xy) ? il.xy.map((v) => Number(v).toFixed(4)).join(', ') : EMPTY
      }</b></div>`,
    );
    rows.push(`<div><span class="muted small">${esc(F.adaptation)}</span><b>${esc(il.adaptation || EMPTY)}</b></div>`);
    rows.push(
      `<div><span class="muted small">${esc(F.assumedD65)}</span><b>${
        il.assumedD65 ? esc(R.cards.yesNo.yes) : esc(R.cards.yesNo.no)
      }</b></div>`,
    );
  }
  let calHtml = '';
  if (cal) {
    const per = Array.isArray(cal.perPatch) ? cal.perPatch : [];
    calHtml = `<details class="gates"><summary>${esc(
      F.ccmSummary(cal.ccmKind || '3x3', nf(cal.deltaE00Mean, 2), nf(cal.deltaE00Max, 2)),
    )}</summary>
      <table class="gate-table">
        <thead><tr><th>${esc(F.patchId)}</th><th>${esc(F.deltaE)}</th></tr></thead>
        <tbody>${per
          .map(
            (p) =>
              `<tr class="${Number(p.deltaE00) > 5 ? 'fail' : ''}"><td>${esc(p.id)}</td><td class="gate-num">${nf(
                p.deltaE00,
                2,
              )}</td></tr>`,
          )
          .join('')}</tbody>
      </table>
      ${
        Array.isArray(cal.ccm)
          ? `<pre class="ccm">${esc(
              cal.ccm
                .map((row) => (Array.isArray(row) ? row.map((v) => Number(v).toFixed(3)).join('  ') : String(row)))
                .join('\n'),
            )}</pre>`
          : ''
      }
    </details>`;
  }
  return `<section class="card">
    <header class="card-head"><h2>${esc(R.cards.illuminant)}</h2></header>
    <div class="kv-grid">${rows.join('')}</div>
    ${calHtml}
  </section>`;
}

function adviceCard(r) {
  const a = r.advice;
  if (!a) return physicalTestCard(r);
  const palette = Array.isArray(a.palette) ? a.palette : [];
  const avoid = Array.isArray(a.avoid) ? a.avoid : [];
  return `<section class="card">
    <header class="card-head">
      <h2>${esc(R.cards.advice)}</h2>
      <span class="badge tone-ok">${esc(R.cards.contrastLevels[a.contrastLevel] || a.contrastLevel || EMPTY)}</span>
    </header>
    <h3 class="sub">${esc(R.cards.recommended)}</h3>
    <div class="swatches">${
      palette.length
        ? palette.map((p) => swatch(p.hex, p.name, '')).join('')
        : `<p class="muted small">${esc(R.cards.noPalette)}</p>`
    }</div>
    <h3 class="sub">${esc(R.cards.avoid)}</h3>
    <div class="swatches">${
      avoid.length
        ? avoid
            .map(
              (p) =>
                `<div class="avoid-item">${swatch(p.hex, p.name || '', '')}${
                  p.reason ? `<p class="reason">${esc(p.reason)}</p>` : ''
                }</div>`,
            )
            .join('')
        : `<p class="muted small">${esc(R.cards.noAvoid)}</p>`
    }</div>
  </section>`;
}

/**
 * 置信度不足时的物理试色引导。
 * 契约 §0 原则 2：宁可说「测不准」，也不给一个看起来很精确的数字。
 * 文案（含"怎么做"的步骤）在 js/copy.js 的 physicalTest，待项目所有者定稿。
 */
export function physicalTestCard(r, { compact = false } = {}) {
  const g = COPY.physicalTest;
  const warnings = Array.isArray(r && r.warnings) ? r.warnings.filter(Boolean) : [];
  const level = (r && r.confidence && r.confidence.level) || '';
  const levelLabel = (R.confidenceLevels[level] || {}).label || level || COPY.common.emptyValue;
  return `<section class="card physical${compact ? ' compact' : ''}">
    <header class="card-head">
      <h2>${esc(g.title)}</h2>
      <span class="badge tone-bad">level = ${esc(level || COPY.common.emptyValue)}</span>
    </header>
    <p class="physical-lead">${esc(g.lead(levelLabel))}</p>
    <ol class="physical-steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    ${
      warnings.length
        ? `<div class="warn-box"><b>${esc(g.serverNotesTitle)}</b><ul>${warnings
            .map((w) => `<li>${esc(w)}</li>`)
            .join('')}</ul></div>`
        : ''
    }
    <p class="muted small">${esc(g.footnote)}</p>
  </section>`;
}

function warningsCard(r) {
  const warnings = Array.isArray(r.warnings) ? r.warnings.filter(Boolean) : [];
  if (!warnings.length) return '';
  return `<section class="card">
    <header class="card-head"><h2>${esc(R.cards.warnings)}</h2></header>
    <ul class="warn-list">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
  </section>`;
}

function metaCard(r) {
  const created = r.createdAt ? new Date(r.createdAt) : null;
  const when = created && !Number.isNaN(created.getTime()) ? created.toLocaleString() : EMPTY;
  // 只保留"这次测量是什么时候"和删除入口——requestId / 版本号是给接口使用者的，
  // 不是给用户看的（契约 §0 的两套受众：界面给人话，API 给技术细节）。
  return `<section class="card meta">
    <header class="card-head">
      <h2>${esc(R.cards.meta)}</h2>
      ${when ? `<span class="muted small">${esc(when)}</span>` : ''}
    </header>
    <div class="row gap meta-actions">
      <button class="btn" data-action="delete-result" data-id="${esc(r.requestId || '')}">${esc(
        COPY.resultStep.deleteButton,
      )}</button>
      <span class="muted small">${esc(R.cards.deleteNote)}</span>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */

/**
 * 渲染完整结果。
 * @param {HTMLElement} root
 * @param {object} r POST /v1/analyze 的响应
 */
export function renderResult(root, r) {
  if (!root) return;
  const level = r && r.confidence && r.confidence.level;
  const noAdvice = !r || !r.advice;
  const blocks = [];

  // 二次保险：单个区块渲染失败时不要连累整页，把它降级成一行提示
  const safe = (name, fn) => {
    try {
      return fn();
    } catch (e) {
      console.error(`结果区块「${name}」渲染失败`, e);
      return `<section class="card">${esc(COPY.resultStep.renderFailedMessage(e && e.message))}</section>`;
    }
  };

  /*
    只渲染面向用户的内容。
    契约 §0 划了两套受众：**界面给人话与结论，技术细节留给 API 和仓库**。
    置信度门禁表、CIELAB 三轴、光源色温、概率条与黑色素/血红素指数都不上屏——
    它们各自是可靠的工程信号，但摆在用户面前只会让产品显得不专业。
    后端的 warnings 同理：里面混着"光源估计使用的候选来源：background"这类
    工程信息，只留在接口响应里；用户该看到的"这次没测准、去专柜试三条"由
    confidence.level 驱动下面那张卡片来表达。
    下面几个 *Card 函数暂时保留但不再调用，属待清理的死代码。
  */
  blocks.push(safe('hero', () => heroCard(r)));
  if (level === 'insufficient' || noAdvice) {
    // 契约：insufficient 时 advice 为 null → 物理试色引导就是最终结论
    blocks.push(safe('physical', () => physicalTestCard(r)));
  } else {
    blocks.push(safe('advice', () => adviceCard(r)));
  }
  blocks.push(safe('meta', () => metaCard(r)));

  root.innerHTML = `<div class="result-view">${blocks.filter(Boolean).join('')}
    <p class="disclaimer">${esc(r.disclaimer || R.disclaimerFallback)}</p>
  </div>`;
}

/** 后端未就绪 / 请求失败时的占位渲染 */
export function renderError(root, { title, message, hint, code }) {
  if (!root) return;
  root.innerHTML = `<div class="result-view">
    <section class="card error-card">
      <header class="card-head"><h2>${esc(title || COPY.resultStep.errorTitle)}</h2>${
        code ? `<span class="badge tone-bad">${esc(code)}</span>` : ''
      }</header>
      <p>${esc(message || '')}</p>
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
    </section>
  </div>`;
}
