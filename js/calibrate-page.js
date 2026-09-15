/**
 * skintone-web / js/calibrate-page.js
 *
 * calibrate.html 的控制器：契约 §2.4 POST /v1/card/{card_id}/calibrate。
 * 文案来自 js/copy.js 的 calibratePage。
 */

import { DEFAULT_CARD_ID, DEFAULT_CARD_PROFILE_ID, ILLUMINANT_VALUES, STORAGE_KEYS } from './config.js';
import { COPY } from './copy.js';
import { hydrateCopy } from './copy-hydrate.js';
import { ApiError, calibrate, getApiKey, resolveApiBase } from './api.js';
import { cameraSupported, grabFrame, humanBytes, prepareCapture, startCamera, stopCamera } from './capture.js';

const $ = (sel) => document.querySelector(sel);
const T = COPY.calibratePage;

const state = { stream: null, capture: null, previewUrl: '' };

function toast(message, tone = 'info', ms = 5000) {
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

const esc = (s) =>
  String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);

function initFields() {
  const sel = $('#illuminant');
  sel.replaceChildren(
    ...ILLUMINANT_VALUES.map((value) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = COPY.illuminantLabels[value] || value;
      return o;
    }),
  );
  const savedIll = localStorage.getItem(STORAGE_KEYS.illuminantGuess) || 'daylight';
  sel.value = ILLUMINANT_VALUES.includes(savedIll) ? savedIll : 'daylight';

  $('#card-id').value = DEFAULT_CARD_ID;

  const profile = $('#profile-id');
  profile.value = localStorage.getItem(STORAGE_KEYS.cardProfileId) || DEFAULT_CARD_PROFILE_ID;
  profile.addEventListener('change', () => {
    const v = profile.value.trim();
    if (v) localStorage.setItem(STORAGE_KEYS.cardProfileId, v);
  });
}

async function openCamera() {
  if (!cameraSupported()) {
    toast(COPY.captureStep.cameraUnsupported, 'bad', 7000);
    return;
  }
  closeCamera();
  try {
    const { stream } = await startCamera({ facingMode: 'environment' });
    state.stream = stream;
    const v = $('#video');
    v.hidden = false;
    v.srcObject = stream;
    await v.play().catch(() => {});
    $('#btn-shutter').hidden = false;
    $('#btn-close-camera').hidden = false;
  } catch (e) {
    toast(e.message, 'bad', 8000);
  }
}

function closeCamera() {
  if (state.stream) {
    stopCamera(state.stream);
    state.stream = null;
  }
  const v = $('#video');
  if (v) {
    v.srcObject = null;
    v.hidden = true;
  }
  $('#btn-shutter').hidden = true;
  $('#btn-close-camera').hidden = true;
}

async function applyCapture(source) {
  const prep = await prepareCapture(source, { filename: 'card.jpg' });
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.capture = prep;
  state.previewUrl = URL.createObjectURL(prep.blob);
  const img = $('#preview');
  img.src = state.previewUrl;
  img.hidden = false;
  $('#capture-empty').hidden = true;
  $('#capture-info').textContent = COPY.captureStep.info({
    width: prep.width,
    height: prep.height,
    originalWidth: prep.originalWidth,
    originalHeight: prep.originalHeight,
    scaled: prep.scaled,
    quality: prep.quality,
    bytesText: humanBytes(prep.bytes),
  });
  $('#btn-calibrate').disabled = false;
}

function renderCalibration(r) {
  const F = T.fields;
  const measured = r.measuredSrgb || {};
  const rows = Object.entries(measured)
    .map(([id, rgb]) => {
      const hex = `#${rgb
        .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
        .join('')}`;
      return `<tr>
        <td>${esc(id)}</td>
        <td><span class="mini-swatch" style="background:${hex}"></span></td>
        <td class="gate-num">${rgb.join(', ')}</td>
        <td class="gate-num mono">${hex}</td>
      </tr>`;
    })
    .join('');
  const g = r.grayNeutrality || {};
  const q = r.quality || {};
  const tone = g.passed ? 'ok' : 'bad';
  const qualityText =
    q.deltaE00MeanAfter === undefined || q.deltaE00MeanAfter === null
      ? String(q.level || COPY.common.emptyValue)
      : `${q.level || ''} · ΔE00 ${Number(q.deltaE00MeanAfter).toFixed(2)}`;
  $('#calib-result').innerHTML = `
    <section class="card">
      <header class="card-head">
        <h2>${esc(T.resultTitle)}</h2>
        <span class="badge tone-${tone}">${esc(g.passed ? T.grayPassed : T.grayFailed)}</span>
      </header>
      <div class="kv-grid">
        <div><span class="muted small">${esc(F.profileId)}</span><b class="mono">${esc(r.profileId || COPY.common.emptyValue)}</b></div>
        <div><span class="muted small">${esc(F.cardId)}</span><b>${esc(r.cardId || COPY.common.emptyValue)}</b></div>
        <div><span class="muted small">${esc(F.quality)}</span><b>${esc(qualityText)}</b></div>
        <div><span class="muted small">${esc(F.maxChroma)}</span><b>${
          g.maxAbsChroma === undefined || g.maxAbsChroma === null ? COPY.common.emptyValue : Number(g.maxAbsChroma).toFixed(2)
        }</b></div>
      </div>
      <table class="gate-table table-gap">
        <thead><tr><th>${esc(F.patchId)}</th><th></th><th>${esc(F.measured)}</th><th>${esc(F.hex)}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">${esc(F.noMeasured)}</td></tr>`}</tbody>
      </table>
      ${r.note ? `<p class="muted small note-gap">${esc(r.note)}</p>` : ''}
      <p class="muted tiny">${esc(T.afterNote(r.profileId || ''))}</p>
    </section>`;
}

async function runCalibration() {
  if (!state.capture) {
    toast(T.needImageToast, 'bad');
    return;
  }
  const cardId = ($('#card-id').value || DEFAULT_CARD_ID).trim();
  const profileId = ($('#profile-id').value || '').trim();
  if (!profileId) {
    toast(T.needProfileToast, 'bad');
    return;
  }
  localStorage.setItem(STORAGE_KEYS.cardProfileId, profileId);
  const illuminantGuess = $('#illuminant').value;
  localStorage.setItem(STORAGE_KEYS.illuminantGuess, illuminantGuess);

  const meta = {
    cardId,
    profileId,
    capture: {
      illuminantGuess,
      wbLocked: false,
      raw: false,
      flash: false,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
    clientVersion: '0.1.0',
  };

  const btn = $('#btn-calibrate');
  btn.disabled = true;
  btn.textContent = T.calibrating;
  $('#calib-result').innerHTML = `<section class="card"><p class="muted">${esc(T.pending)}</p></section>`;
  try {
    const out = await calibrate(cardId, state.capture.file, meta);
    renderCalibration(out);
  } catch (e) {
    const err =
      e instanceof ApiError ? e : new ApiError({ code: 'INTERNAL', message: String(e && e.message), hint: '' });
    $('#calib-result').innerHTML = `<section class="card error-card">
      <header class="card-head"><h2>${esc(T.errorTitle)}</h2><span class="badge tone-bad">${esc(err.code)}</span></header>
      <p>${esc(err.message)}</p>
      ${err.hint ? `<p class="hint">${esc(err.hint)}</p>` : ''}
      <p class="muted tiny">${esc(T.targetLabel(resolveApiBase(), Boolean(getApiKey())))}</p>
    </section>`;
  } finally {
    btn.disabled = false;
    btn.textContent = T.calibrateButton;
  }
}

function boot() {
  hydrateCopy(document);
  document.title = COPY.page.calibrateTitle;
  initFields();
  $('#btn-camera')?.addEventListener('click', openCamera);
  $('#btn-close-camera')?.addEventListener('click', closeCamera);
  $('#btn-shutter')?.addEventListener('click', async () => {
    try {
      const canvas = grabFrame($('#video'));
      closeCamera();
      await applyCapture(canvas);
      toast(T.capturedToast, 'ok');
    } catch (e) {
      toast(e.message, 'bad');
    }
  });
  $('#file-input')?.addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const { loadImage } = await import('./capture.js');
      const { image } = await loadImage(file);
      const w = image.naturalWidth || image.width;
      const h = image.naturalHeight || image.height;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(image, 0, 0, w, h);
      await applyCapture(canvas);
      toast(COPY.captureStep.fileReadCalibrateToast, 'ok');
    } catch (e) {
      toast(e.message || COPY.captureStep.decodeFailed, 'bad', 7000);
    }
  });
  $('#btn-calibrate')?.addEventListener('click', runCalibration);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
