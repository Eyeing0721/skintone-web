/**
 * skintone-web / js/api.js
 *
 * HTTP 契约客户端（契约 §2）。负责：
 *   1. 基地址解析：?api= > localStorage.skintone.apiBase > config.js 的 API_BASE
 *   2. X-API-Key 头（localStorage.skintone.apiKey）——除 GET /v1/health 外都带
 *   3. 统一错误归一化：把契约 §2.3 的错误码表逐条映射成中文可操作提示，
 *      并单独处理 413 / 429 / 401 / 网络不可达 / 超时。
 *
 * 提示文案本身在 js/copy.js 的 `errors`，本文件只做映射逻辑。
 */

import { API_BASE, STORAGE_KEYS, CLIENT_VERSION } from './config.js';
import { COPY } from './copy.js';

/** 请求超时（毫秒）。分析要跑 OpenCV，给足时间。 */
const TIMEOUTS = Object.freeze({
  health: 6000,
  json: 15000,
  analysis: 120000,
  upload: 120000,
});

/** 契约 §2.3 错误码表（用于自检/展示：确认每一条都有提示） */
export const CONTRACT_ERROR_CODES = Object.freeze([
  'BAD_IMAGE',
  'CARD_NOT_DETECTED',
  'CARD_PROFILE_NOT_FOUND',
  'ROI_TOO_SMALL',
  'FACE_NOT_FOUND',
  'ILLUMINANT_UNRELIABLE',
  'PAYLOAD_TOO_LARGE',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'INTERNAL',
]);

/** 错误码 → 中文提示（来自 copy.js） */
export const ERROR_HINTS = COPY.errors;

const CLIENT_ERROR_HINTS = COPY.errors;

/**
 * 归一化后的 API 错误。`code` 是契约错误码（或前端补充码），
 * `message` / `hint` 已是可操作文案。
 */
export class ApiError extends Error {
  constructor({ code, message, hint, status = 0, details = null, httpMessage = '' }) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.hint = hint || '';
    this.status = status;
    this.details = details;
    this.httpMessage = httpMessage;
  }

  get fullText() {
    return this.hint ? `${this.message} ${this.hint}` : this.message;
  }
}

function hintFor(code) {
  return ERROR_HINTS[code] || CLIENT_ERROR_HINTS[code] || null;
}

/** 由 HTTP 状态 + 响应体构造 ApiError */
function errorFromResponse(status, body, rawText) {
  const err = body && typeof body === 'object' ? body.error : null;
  let code = err && typeof err.code === 'string' ? err.code : '';
  // 401/403 分两种情形：本机压根没填密钥（要引导用户去索取），还是填了但不对。
  const keyPresent = Boolean(getApiKey());
  if (!code) {
    if (status === 401 || status === 403) code = keyPresent ? 'UNAUTHORIZED' : 'MISSING_API_KEY';
    else if (status === 413) code = 'PAYLOAD_TOO_LARGE';
    else if (status === 429) code = 'RATE_LIMITED';
    else if (status === 400 || status === 422) code = 'BAD_REQUEST';
    else if (status === 404) code = 'NOT_FOUND';
    else code = 'INTERNAL';
  }
  const mapped = hintFor(code);
  // 服务端回了 UNAUTHORIZED 但本机没填密钥时，仍然按"没有密钥"引导
  const effective = code === 'UNAUTHORIZED' && !keyPresent ? 'MISSING_API_KEY' : code;
  const mappedEffective = hintFor(effective) || mapped;
  // 服务端给了 message/hint 时优先用服务端的原文（它更贴近这次的具体原因）
  const serverMessage = (err && err.message) || '';
  const serverHint = (err && err.hint) || '';
  const fallbackText = rawText && rawText.length < 300 ? rawText : '';
  return new ApiError({
    code,
    message:
      serverMessage ||
      (mappedEffective && mappedEffective.message) ||
      fallbackText ||
      COPY.errors.httpFallback(status),
    hint: serverHint || (mappedEffective && mappedEffective.hint) || '',
    status,
    details: (err && err.details) || null,
    httpMessage: serverMessage,
  });
}

/* ------------------------------------------------------------------ */
/* 基地址与密钥                                                        */
/* ------------------------------------------------------------------ */

/** 去掉尾部斜杠 */
export function normalizeBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/** `?api=` 查询参数（最高优先级） */
export function apiFromQuery() {
  try {
    const v = new URLSearchParams(window.location.search).get('api');
    return v ? normalizeBase(v) : '';
  } catch {
    return '';
  }
}

/** localStorage 中的基地址 */
export function apiFromStorage() {
  try {
    return normalizeBase(window.localStorage.getItem(STORAGE_KEYS.apiBase) || '');
  } catch {
    return '';
  }
}

/** 当前生效的基地址（契约 §2 优先级） */
export function resolveApiBase() {
  const fromQuery = apiFromQuery();
  if (fromQuery) return fromQuery;
  const fromStorage = apiFromStorage();
  if (fromStorage) return fromStorage;
  return normalizeBase(API_BASE);
}

/** 持久化基地址；传空串则清除覆盖，回落 config.js 默认值。返回最终生效值。 */
export function setApiBase(url) {
  const v = normalizeBase(url);
  try {
    if (v) window.localStorage.setItem(STORAGE_KEYS.apiBase, v);
    else window.localStorage.removeItem(STORAGE_KEYS.apiBase);
  } catch {
    /* 隐私模式下 localStorage 可能不可用：本次会话仍按内存值工作 */
  }
  return v || normalizeBase(API_BASE);
}

/** 当前访问密钥 */
export function getApiKey() {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.apiKey) || '';
  } catch {
    return '';
  }
}

/** 保存访问密钥（空串即清除） */
export function setApiKey(key) {
  const v = String(key || '').trim();
  try {
    if (v) window.localStorage.setItem(STORAGE_KEYS.apiKey, v);
    else window.localStorage.removeItem(STORAGE_KEYS.apiKey);
  } catch {
    /* 同上 */
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* 底层请求                                                            */
/* ------------------------------------------------------------------ */

async function readBody(res) {
  const text = await res.text();
  if (!text) return { json: null, text: '' };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

/**
 * 发一个请求，返回解析后的 JSON 或抛 ApiError。
 * @param {string} path 以 / 开头的路径
 * @param {RequestInit & {timeout?: number, base?: string, noAuth?: boolean}} options
 */
async function request(path, options = {}) {
  const base = normalizeBase(options.base || resolveApiBase());
  const url = `${base}${path}`;
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  // 认证：除 GET /v1/health 外所有请求带 X-API-Key（契约 §2）。
  // health 是免认证接口，故意不带，避免把密钥送到任何探测点。
  const key = getApiKey();
  if (key && !options.noAuth) headers.set('X-API-Key', key);
  headers.set('X-Client-Version', CLIENT_VERSION);

  const controller = new AbortController();
  const timeout = options.timeout || TIMEOUTS.json;
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  let res;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    if (e && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
      throw new ApiError({ code: 'TIMEOUT', ...CLIENT_ERROR_HINTS.TIMEOUT });
    }
    throw new ApiError({
      code: 'NETWORK_UNREACHABLE',
      ...CLIENT_ERROR_HINTS.NETWORK_UNREACHABLE,
      details: { url, cause: String(e && e.message) },
    });
  }
  clearTimeout(timer);

  if (res.status === 204) return null;

  const { json, text } = await readBody(res);
  if (!res.ok) throw errorFromResponse(res.status, json, text);
  if (json === null) {
    throw new ApiError({
      code: 'INVALID_JSON',
      ...CLIENT_ERROR_HINTS.INVALID_JSON,
      status: res.status,
      details: { url },
    });
  }
  return json;
}

/* ------------------------------------------------------------------ */
/* 契约 §2.1 / §2.2 / §2.3 / §2.4 / §2.5 / §2.6                       */
/* ------------------------------------------------------------------ */

/** GET /v1/health（无需认证 —— 唯一不带 X-API-Key 的请求） */
export function health(base) {
  return request('/v1/health', { timeout: TIMEOUTS.health, base, noAuth: true });
}

/** GET /v1/card/{card_id} */
export function getCard(cardId, base) {
  return request(`/v1/card/${encodeURIComponent(cardId)}`, { base });
}

/**
 * POST /v1/analyze（契约 §2.3）
 * @param {Blob} imageBlob JPEG/PNG
 * @param {object} meta meta 对象
 * @param {object|null} rois rois 对象，null 表示让服务端自动识别
 */
export async function analyze(imageBlob, meta, rois, { base, onProgress } = {}) {
  const form = new FormData();
  const filename = imageBlob instanceof File && imageBlob.name ? imageBlob.name : 'capture.jpg';
  form.append('image', imageBlob, filename);
  form.append('meta', JSON.stringify(meta));
  if (rois) form.append('rois', JSON.stringify(rois));
  if (onProgress) onProgress('uploading');
  const out = await request('/v1/analyze', {
    method: 'POST',
    body: form,
    timeout: TIMEOUTS.analysis,
    base,
  });
  if (onProgress) onProgress('done');
  return out;
}

/**
 * POST /v1/card/{card_id}/calibrate（契约 §2.4）
 * @param {Blob} imageBlob
 * @param {object} meta 含 cardId、profileId、capture.illuminantGuess
 */
export function calibrate(cardId, imageBlob, meta, { base } = {}) {
  const form = new FormData();
  const filename = imageBlob instanceof File && imageBlob.name ? imageBlob.name : 'card.jpg';
  form.append('image', imageBlob, filename);
  form.append('meta', JSON.stringify(meta));
  return request(`/v1/card/${encodeURIComponent(cardId)}/calibrate`, {
    method: 'POST',
    body: form,
    timeout: TIMEOUTS.upload,
    base,
  });
}

/** GET /v1/result/{request_id}（契约 §2.5） */
export function getResult(requestId, base) {
  return request(`/v1/result/${encodeURIComponent(requestId)}`, { base });
}

/** DELETE /v1/result/{request_id}，成功返回 null（204） */
export function deleteResult(requestId, base) {
  return request(`/v1/result/${encodeURIComponent(requestId)}`, { method: 'DELETE', base });
}

/** GET /v1/stats（契约 §2.6），可选功能，失败不致命 */
export function stats(base) {
  return request('/v1/stats', { timeout: TIMEOUTS.health, base });
}

/* ------------------------------------------------------------------ */
/* 组合辅助                                                            */
/* ------------------------------------------------------------------ */

/**
 * 探测服务端；失败不抛，返回结构化状态供 UI 显示。
 * @returns {Promise<{ok: boolean, base: string, health?: object, error?: ApiError}>}
 */
export async function probe(base) {
  const used = normalizeBase(base || resolveApiBase());
  try {
    const h = await health(used);
    return { ok: true, base: used, health: h };
  } catch (e) {
    return { ok: false, base: used, error: e };
  }
}
