/**
 * skintone-web / js/copy-hydrate.js
 *
 * 把 js/copy.js 里的文案填进 HTML。HTML 里只写「占位标记」，不写句子本身，
 * 这样句子只有一处定义（js/copy.js），改文案不用碰 HTML。
 *
 * 用法：
 *   <h1 data-copy="modeStep.title"></h1>                  → textContent
 *   <span data-copy-title="topbar.settingsSummaryTitle">  → title 属性
 *   <input data-copy-placeholder="settings.basePlaceholder">
 *   <li data-copy-list="captureStep.guideItems">           → 数组展开成多个 <li>
 *   <p data-copy="x" data-copy-vars='{"a":1}'>             → 函数文案，传入变量
 */

import { COPY } from './copy.js';

function get(path) {
  return path.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), COPY);
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {ParentNode} root
 */
export function hydrateCopy(root = document) {
  for (const el of root.querySelectorAll('[data-copy]')) {
    const value = get(el.dataset.copy);
    let out = value;
    if (typeof value === 'function') {
      const vars = el.dataset.copyVars ? JSON.parse(el.dataset.copyVars) : {};
      out = value(vars);
    }
    if (out === undefined) continue; // 没配就保持 HTML 里的原样，便于发现
    el.textContent = String(out);
  }
  for (const el of root.querySelectorAll('[data-copy-html]')) {
    const value = get(el.dataset.copyHtml);
    if (value !== undefined) el.innerHTML = String(value);
  }
  for (const el of root.querySelectorAll('[data-copy-placeholder]')) {
    const value = get(el.dataset.copyPlaceholder);
    if (value !== undefined) el.setAttribute('placeholder', String(value));
  }
  for (const el of root.querySelectorAll('[data-copy-title]')) {
    const value = get(el.dataset.copyTitle);
    if (value !== undefined) el.setAttribute('title', String(value));
  }
  for (const el of root.querySelectorAll('[data-copy-aria]')) {
    const value = get(el.dataset.copyAria);
    if (value !== undefined) el.setAttribute('aria-label', String(value));
  }
  for (const el of root.querySelectorAll('[data-copy-content]')) {
    const value = get(el.dataset.copyContent);
    if (value !== undefined) el.setAttribute('content', String(value));
  }
  for (const el of root.querySelectorAll('[data-copy-alt]')) {
    const value = get(el.dataset.copyAlt);
    if (value !== undefined) el.setAttribute('alt', String(value));
  }
  for (const el of root.querySelectorAll('[data-copy-list]')) {
    const value = get(el.dataset.copyList);
    if (!Array.isArray(value)) continue;
    const tag = el.dataset.copyListTag || 'li';
    el.replaceChildren(
      ...value.map((item) => {
        const child = document.createElement(tag);
        child.textContent = String(item);
        return child;
      }),
    );
  }
}

/** 文档标题 */
export function hydrateTitle(key = 'page.indexTitle') {
  const value = get(key);
  if (typeof value === 'string') document.title = value;
}

/** 给 select 填 option：key 指向 {value,label} 或 {value:{label}} 结构 */
export function fillOptions(select, items, { selected } = {}) {
  if (!select) return;
  const opts = (items || []).map(({ value, label }) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  });
  select.replaceChildren(...opts);
  if (selected !== undefined) select.value = selected;
}

export { COPY };
