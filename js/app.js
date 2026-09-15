/**
 * skintone-web / js/app.js
 *
 * index.html 的编排层：四步流程 + 服务设置（基地址 / 访问密钥，可编辑并持久化）+ 上传。
 * 契约 §2 的基地址优先级与 §7 的同意机制都在这里落地。
 *
 * 所有用户可见文案来自 js/copy.js；HTML 里的静态文案由 copy-hydrate.js 填充。
 */

import {
  CLIENT_VERSION,
  DEFAULT_CARD_ID,
  ILLUMINANT_VALUES,
  ROI_REGIONS,
  SPEC_VERSION,
  STEPS,
  STORAGE_KEYS,
  UPLOAD,
} from './config.js';
import { COPY } from './copy.js';
import { hydrateCopy } from './copy-hydrate.js';
import {
  ApiError,
  ERROR_HINTS,
  analyze,
  apiFromQuery,
  deleteResult,
  getApiKey,
  getResult,
  normalizeBase,
  probe,
  resolveApiBase,
  setApiBase,
  setApiKey,
} from './api.js';
import {
  buildMeta,
  buildRois,
  cameraSupported,
  grabFrame,
  humanBytes,
  prepareCapture,
  startCamera,
  stopCamera,
} from './capture.js';
import { RoiEditor } from './roi.js';
import { renderError, renderResult } from './result.js';

const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

const T = {
  nav: COPY.nav,
  settings: COPY.settings,
  capture: COPY.captureStep,
  roi: COPY.roiStep,
  result: COPY.resultStep,
  mode: COPY.modeStep,
  consent: COPY.consent,
};

/** 应用状态 */
const state = {
  step: 'mode',
  mode: 'nocard',
  cameraStream: null,
  facingMode: 'user',
  /** @type {null|{blob: Blob, file: Blob, width: number, height: number, originalWidth: number, originalHeight: number, scaled: boolean, bytes: number, canvas: HTMLCanvasElement}} */
  capture: null,
  previewUrl: '',
  storeImage: COPY.consent.defaultStoreImage,
  acceptedAt: '',
  illuminantGuess: ILLUMINANT_VALUES[0],
  cardProfileId: '',
  editor: null,
  lastResult: null,
  busy: false,
};

/* ------------------------------------------------------------------ */
/* 通用 UI 小工具                                                      */
/* ------------------------------------------------------------------ */

function toast(message, tone = 'info', ms = 4200) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

function setStep(step) {
  if (state.step === 'capture' && step !== 'capture') stopLiveCamera();
  state.step = step;
  for (const el of $$('.step-panel')) el.hidden = el.dataset.step !== step;
  for (const el of $$('.step-dot')) {
    const i = STEPS.indexOf(el.dataset.step);
    const cur = STEPS.indexOf(step);
    el.dataset.state = i < cur ? 'done' : i === cur ? 'current' : 'todo';
  }
  $('#step-title').textContent = COPY.topbar.stepTitles[step] || '';
  const scroller = $('#content');
  if (scroller) scroller.scrollTop = 0;
  if (step === 'result') stopLiveCamera();
  updateNav();
}

function updateNav() {
  const back = $('#btn-back');
  const next = $('#btn-next');
  const i = STEPS.indexOf(state.step);
  back.disabled = i <= 0 || state.busy;
  next.textContent = T.nav.next[state.step] || '';
  if (state.step === 'mode') next.disabled = state.busy;
  else if (state.step === 'capture') next.disabled = state.busy || !state.capture;
  else if (state.step === 'roi') next.disabled = state.busy || !state.capture;
  else next.disabled = state.busy;
  next.hidden = false;
}

function setBusy(busy, label = '') {
  state.busy = busy;
  const veil = $('#busy');
  if (veil) {
    veil.hidden = !busy;
    const t = $('#busy-text');
    if (t) t.textContent = label || T.nav.busyWorking;
  }
  updateNav();
}

/* ------------------------------------------------------------------ */
/* 服务设置                                                            */
/* ------------------------------------------------------------------ */

async function refreshHealth({ silent = false } = {}) {
  const base = resolveApiBase();
  const dot = $('#health-dot');
  const text = $('#health-text');
  if (dot) dot.dataset.state = 'checking';
  if (text) text.textContent = T.settings.checking;
  const res = await probe(base);
  if (res.ok) {
    const h = res.health || {};
    if (dot) dot.dataset.state = 'ok';
    if (text) text.textContent = T.settings.connected(h);
    const keyField = $('#api-key-wrap');
    if (keyField) keyField.dataset.needed = h.authRequired ? 'true' : 'false';
    if (h.authRequired && !getApiKey()) {
      // 后端启用了访问密钥但本机还没填：先明确告诉用户去哪儿拿，别等 401
      if (text) text.textContent += T.settings.authRequiredNotice;
      toast(`${ERROR_HINTS.MISSING_API_KEY.message}（${ERROR_HINTS.MISSING_API_KEY.hint}）`, 'warn', 10000);
    }
    if (h.specVersion && h.specVersion !== SPEC_VERSION) {
      toast(T.settings.specMismatchToast(h.specVersion, SPEC_VERSION), 'warn', 8000);
    }
    return res;
  }
  if (dot) dot.dataset.state = 'bad';
  if (text) text.textContent = T.settings.unreachable(res.base);
  if (!silent) toast(`${res.error.message}${res.error.hint ? ` ${res.error.hint}` : ''}`, 'bad', 8000);
  return res;
}

function initSettings() {
  const input = $('#api-base');
  const keyInput = $('#api-key');
  const queried = apiFromQuery();
  if (input) input.value = resolveApiBase();
  if (keyInput) keyInput.value = getApiKey();

  $('#btn-save-api')?.addEventListener('click', async () => {
    const v = normalizeBase(input.value);
    if (v && !/^https?:\/\//i.test(v)) {
      toast(T.settings.needScheme, 'bad');
      return;
    }
    setApiBase(v);
    setApiKey(keyInput ? keyInput.value : '');
    if (input) input.value = resolveApiBase();
    toast(T.settings.savedToast(resolveApiBase()), 'ok');
    await refreshHealth({ silent: true });
  });
  $('#btn-test-api')?.addEventListener('click', () => refreshHealth());
  $('#btn-reset-api')?.addEventListener('click', async () => {
    setApiBase('');
    if (input) input.value = resolveApiBase();
    toast(T.settings.resetToast, 'ok');
    await refreshHealth({ silent: true });
  });
  keyInput?.addEventListener('change', () => {
    setApiKey(keyInput.value);
    toast(T.settings.keySavedToast, 'ok');
  });
  if (queried) toast(T.settings.savedToast(queried), 'info', 6000);
}

/* ------------------------------------------------------------------ */
/* 第 1 步：模式                                                       */
/* ------------------------------------------------------------------ */

function initModeStep() {
  $('#mode-nocard')?.addEventListener('click', () => selectMode('nocard'));
  $('#mode-card')?.addEventListener('click', () => selectMode('card'));

  const sel = $('#illuminant');
  if (sel) {
    sel.replaceChildren(
      ...ILLUMINANT_VALUES.map((value) => {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = COPY.illuminantLabels[value] || value;
        return o;
      }),
    );
    const saved = localStorage.getItem(STORAGE_KEYS.illuminantGuess);
    // 默认取列表第一项（config.js：屏幕光 + 室内灯）——自拍的现实场景
    sel.value = saved && ILLUMINANT_VALUES.includes(saved) ? saved : ILLUMINANT_VALUES[0];
    state.illuminantGuess = sel.value;
    sel.addEventListener('change', () => {
      state.illuminantGuess = sel.value;
      localStorage.setItem(STORAGE_KEYS.illuminantGuess, sel.value);
    });
  }
  const profile = $('#card-profile');
  if (profile) {
    profile.value = localStorage.getItem(STORAGE_KEYS.cardProfileId) || '';
    state.cardProfileId = profile.value;
    profile.addEventListener('change', () => {
      const v = profile.value.trim();
      state.cardProfileId = v;
      if (v) localStorage.setItem(STORAGE_KEYS.cardProfileId, v);
      else localStorage.removeItem(STORAGE_KEYS.cardProfileId);
    });
  }
  selectMode('nocard');
}

function selectMode(mode) {
  state.mode = mode;
  for (const key of ['nocard', 'card']) {
    const btn = $(`#mode-${key}`);
    if (btn) btn.dataset.selected = key === mode ? 'true' : 'false';
  }
  for (const el of $$('.card-only')) el.hidden = mode !== 'card';
  const hint = $('#mode-hint');
  if (hint) hint.textContent = mode === 'card' ? T.mode.hintCard : T.mode.hintNoCard;
}

/* ------------------------------------------------------------------ */
/* 第 2 步：采集                                                       */
/* ------------------------------------------------------------------ */

function stopLiveCamera() {
  if (state.cameraStream) {
    stopCamera(state.cameraStream);
    state.cameraStream = null;
  }
  const v = $('#video');
  if (v) {
    v.srcObject = null;
    v.hidden = true;
  }
  const live = $('#live-controls');
  if (live) live.hidden = true;
}

async function openCamera() {
  if (!cameraSupported()) {
    toast(T.capture.cameraUnsupported, 'bad', 7000);
    return;
  }
  stopLiveCamera();
  try {
    const { stream, settings } = await startCamera({ facingMode: state.facingMode });
    state.cameraStream = stream;
    const v = $('#video');
    v.hidden = false;
    v.srcObject = stream;
    await v.play().catch(() => {});
    $('#live-controls').hidden = false;
    const info = $('#camera-info');
    if (info) info.textContent = T.capture.cameraInfo(settings.width, settings.height);
  } catch (e) {
    toast(e.message || T.capture.cameraUnsupported, 'bad', 8000);
  }
}

function onShutter() {
  const v = $('#video');
  try {
    const canvas = grabFrame(v);
    stopLiveCamera();
    setCaptureFromCanvas(canvas);
    toast(T.capture.capturedToast, 'ok');
  } catch (e) {
    toast(e.message, 'bad');
  }
}

async function setCaptureFromCanvas(canvas) {
  const prep = await prepareCapture(canvas, { filename: 'capture.jpg' });
  applyCapture(prep);
}

function applyCapture(prep) {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.capture = prep;
  state.previewUrl = URL.createObjectURL(prep.blob);
  const img = $('#preview');
  if (img) {
    img.src = state.previewUrl;
    img.hidden = false;
  }
  const empty = $('#capture-empty');
  if (empty) empty.hidden = true;
  const info = $('#capture-info');
  if (info) {
    info.textContent = T.capture.info({
      width: prep.width,
      height: prep.height,
      originalWidth: prep.originalWidth,
      originalHeight: prep.originalHeight,
      scaled: prep.scaled,
      quality: prep.quality,
      bytesText: humanBytes(prep.bytes),
    });
  }
  if (prep.bytes > UPLOAD.maxBytes) {
    toast(T.capture.tooLargeToast(humanBytes(prep.bytes), humanBytes(UPLOAD.maxBytes)), 'warn', 9000);
  }
  // 采集环节结束：把 ROI 编辑器接上新图
  if (state.editor) state.editor.setSource(prep.canvas, prep.width, prep.height);
  updateNav();
}

function initCaptureStep() {
  $('#btn-camera')?.addEventListener('click', openCamera);
  $('#btn-shutter')?.addEventListener('click', onShutter);
  $('#btn-cancel-camera')?.addEventListener('click', () => {
    stopLiveCamera();
    toast(T.capture.closedCameraToast);
  });
  $('#btn-flip')?.addEventListener('click', async () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    await openCamera();
  });
  $('#file-input')?.addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
      toast(T.capture.badFileToast, 'bad');
      return;
    }
    try {
      const { loadImage } = await import('./capture.js');
      const { image } = await loadImage(file);
      await setCaptureFromCanvas(imageToCanvas(image));
      toast(T.capture.fileReadToast, 'ok');
    } catch (e) {
      toast(e.message || T.capture.decodeFailed, 'bad', 7000);
    } finally {
      ev.target.value = '';
    }
  });

  const consent = $('#consent-store');
  const saved = localStorage.getItem(STORAGE_KEYS.storeImage);
  // 默认值来自 copy.js 的 consent.defaultStoreImage（措辞与默认值由项目所有者定稿）
  state.storeImage = saved === null ? T.consent.defaultStoreImage : saved === 'true';
  if (consent) {
    consent.checked = state.storeImage;
    const sync = () => {
      state.storeImage = consent.checked;
      localStorage.setItem(STORAGE_KEYS.storeImage, String(consent.checked));
      const line = $('#consent-line');
      if (line) line.textContent = consent.checked ? T.consent.onStore : T.consent.offMemoryOnly;
    };
    consent.addEventListener('change', sync);
    sync();
  }
}

function imageToCanvas(image) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(image, 0, 0, w, h);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* 第 3 步：ROI                                                        */
/* ------------------------------------------------------------------ */

function initRoiStep() {
  const canvas = $('#roi-canvas');
  if (!canvas) return;
  state.editor = new RoiEditor(canvas, { onChange: () => renderRoiSummary() });
  if (state.capture) state.editor.setSource(state.capture.canvas, state.capture.width, state.capture.height);

  const regionBar = $('#roi-regions');
  if (regionBar) {
    regionBar.replaceChildren(
      ...ROI_REGIONS.map((r) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip';
        btn.dataset.region = r.key;
        const text = document.createTextNode((T.roi.regions[r.key] || {}).label || r.key);
        const count = document.createElement('i');
        count.className = 'count';
        count.dataset.count = r.key;
        count.textContent = '0';
        btn.append(text, count);
        return btn;
      }),
    );
    regionBar.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-region]');
      if (!btn) return;
      state.editor.selectRegion(btn.dataset.region);
    });
  }
  $('#btn-undo')?.addEventListener('click', () => {
    if (!state.editor.undo()) toast(T.roi.nothingToUndo);
  });
  $('#btn-clear-region')?.addEventListener('click', () => {
    if (!state.editor.clearActive()) toast(T.roi.nothingToClear);
  });
  $('#btn-clear-all')?.addEventListener('click', () => {
    state.editor.clearAll();
    toast(T.roi.clearedToast);
  });
  $('#btn-skip-roi')?.addEventListener('click', () => {
    state.editor.clearAll();
    toast(T.roi.skipToast, 'info', 6000);
    runAnalysis();
  });
  renderRoiSummary();
}

function renderRoiSummary() {
  if (!state.editor) return;
  for (const s of state.editor.summary()) {
    const badge = $(`[data-count="${s.key}"]`);
    if (badge) {
      badge.textContent = String(s.count);
      badge.dataset.closed = s.closed ? 'true' : 'false';
    }
  }
  const active = state.editor.active;
  const hint = $('#roi-hint');
  if (hint && active) {
    hint.textContent = T.roi.regionHint(active.label, active.hint, active.points.length, active.closed);
  }
  const btnRegion = $('#btn-clear-region');
  if (btnRegion && active) btnRegion.textContent = T.roi.clearRegion(active.label);
  const status = $('#roi-status');
  if (status) {
    const complete = state.editor.isComplete();
    status.textContent = complete ? T.roi.statusComplete : T.roi.statusTodo;
    status.dataset.state = complete ? 'ok' : 'todo';
  }
}

/* ------------------------------------------------------------------ */
/* 第 4 步：分析                                                       */
/* ------------------------------------------------------------------ */

async function runAnalysis() {
  if (!state.capture) {
    toast(T.result.needImageToast, 'bad');
    return;
  }
  const regions = state.editor ? state.editor.exportRegions() : [];
  const rois = buildRois(
    regions,
    { width: state.capture.width, height: state.capture.height },
    { width: state.capture.originalWidth, height: state.capture.originalHeight },
  );
  const consent = $('#consent-store');
  state.storeImage = consent ? consent.checked : state.storeImage;
  if (!state.acceptedAt) state.acceptedAt = new Date().toISOString();
  const meta = buildMeta({
    mode: state.mode,
    cardId: DEFAULT_CARD_ID,
    cardProfileId: state.mode === 'card' ? state.cardProfileId || null : null,
    hairLStar: null,
    illuminantGuess: state.illuminantGuess,
    wbLocked: false,
    raw: false,
    flash: false,
    storeImage: state.storeImage,
    acceptedAt: state.acceptedAt,
    clientVersion: CLIENT_VERSION,
  });

  setStep('result');
  setBusy(true, T.nav.busyAnalyzing);
  const host = $('#result-root');
  host.innerHTML = `<div class="result-view"><section class="card"><p class="muted">${T.nav.analyzePending}</p></section></div>`;
  try {
    const out = await analyze(state.capture.file, meta, rois);
    state.lastResult = out;
    // 渲染单独兜一层：渲染器出 bug 时不能让页面白屏
    try {
      renderResult(host, out);
    } catch (renderErr) {
      console.error('结果渲染失败', renderErr);
      host.innerHTML = '';
      renderError(host, {
        title: T.result.renderFailedTitle,
        message: T.result.renderFailedMessage(renderErr && renderErr.message),
        hint: T.result.renderFailedHint,
        code: 'RENDER_FAILED',
      });
    }
    if (out.confidence && out.confidence.level === 'insufficient') {
      toast(T.result.insufficientToast, 'warn', 9000);
    }
  } catch (e) {
    const err =
      e instanceof ApiError ? e : new ApiError({ code: 'INTERNAL', message: String(e && e.message), hint: '' });
    renderError(host, { title: T.result.errorTitle, message: err.message, hint: err.hint, code: err.code });
    toast(`${err.message}${err.hint ? ` ${err.hint}` : ''}`, 'bad', 9000);
  } finally {
    setBusy(false);
  }
}

function initResultStep() {
  $('#result-root')?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action="delete-result"]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (!window.confirm(T.result.deleteConfirm)) return;
    btn.disabled = true;
    try {
      await deleteResult(id);
      toast(T.result.deletedToast, 'ok');
      btn.textContent = T.result.deletedLabel;
    } catch (e) {
      btn.disabled = false;
      toast(`${e.message}${e.hint ? ` ${e.hint}` : ''}`, 'bad', 7000);
    }
  });
  $('#btn-load-result')?.addEventListener('click', async () => {
    const id = ($('#result-id')?.value || '').trim();
    if (!id) {
      toast(T.result.needIdToast, 'bad');
      return;
    }
    try {
      const out = await getResult(id);
      renderResult($('#result-root'), out);
      toast(T.result.loadOkToast, 'ok');
    } catch (e) {
      toast(`${e.message}${e.hint ? ` ${e.hint}` : ''}`, 'bad', 7000);
    }
  });
}

/* ------------------------------------------------------------------ */
/* 导航                                                                */
/* ------------------------------------------------------------------ */

function initNav() {
  $('#btn-next')?.addEventListener('click', () => {
    if (state.step === 'mode') setStep('capture');
    else if (state.step === 'capture') {
      if (!state.capture) {
        toast(T.result.needImageToast, 'bad');
        return;
      }
      setStep('roi');
      state.editor?.resize();
      state.editor?.draw();
    } else if (state.step === 'roi') runAnalysis();
    else setStep('capture');
  });
  $('#btn-back')?.addEventListener('click', () => {
    const i = STEPS.indexOf(state.step);
    if (i > 0) setStep(STEPS[i - 1]);
  });
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  hydrateCopy(document);
  document.title = COPY.page.indexTitle;
  initSettings();
  initModeStep();
  initCaptureStep();
  initRoiStep();
  initResultStep();
  initNav();
  setStep('mode');
  refreshHealth({ silent: true });
  const spec = $('#spec-version');
  if (spec) spec.textContent = SPEC_VERSION;
  const cli = $('#client-version');
  if (cli) cli.textContent = CLIENT_VERSION;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
