/**
 * skintone-web / js/fingerprint.js
 *
 * 浏览器指纹，**只用于服务端的每日额度计数**。
 *
 * 三条设计约束：
 *  1. 这不是身份凭证。它随请求头明文发出，服务端哈希后存储——所以这里无需保密，
 *     也没有必要做"防伪造"（伪造了也只是绕过自己的额度）。
 *  2. **每天轮换**。服务端本来就按天计数，所以按天换一个新指纹不会改变配额行为，
 *     却能避免它退化成一个长期追踪标识。轮换边界用 UTC+8，与服务端换日一致。
 *  3. localStorage 不可用（隐私模式）时降级为本次会话的内存值，功能不中断。
 */

import { STORAGE_KEYS } from './config.js';

/** 与服务端 LOCAL_TZ 对齐的"今天"（UTC+8） */
export function serverDay() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function canvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 110, 22);
    ctx.fillStyle = '#069';
    ctx.fillText('skintone-fp', 2, 4);
    ctx.fillStyle = 'rgba(102,204,0,.7)';
    ctx.fillText('skintone-fp', 4, 12);
    return canvas.toDataURL().slice(-96);
  } catch {
    return 'no-canvas';
  }
}

function webglFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${vendor}|${renderer}|${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`;
  } catch {
    return 'no-webgl';
  }
}

/** 稳定的环境特征：版本升级会改变它，这正是我们想要的粒度。 */
function entropySources() {
  return [
    navigator.userAgent,
    `${navigator.language}|${(navigator.languages || []).join(',')}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio}`,
    `${navigator.hardwareConcurrency || 0}/${navigator.deviceMemory || 0}/${navigator.maxTouchPoints || 0}`,
    canvasFingerprint(),
    webglFingerprint(),
  ];
}

/** FNV-1a 双通道，输出 16 位十六进制。加密强度无关紧要，只需碰撞率足够低。 */
function hash64(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ code, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** 只计算、不存储。 */
export function computeClientId() {
  const parts = [];
  for (const source of entropySources()) {
    try {
      parts.push(String(source));
    } catch {
      parts.push('err');
    }
  }
  return `f${hash64(parts.join('\u241f'))}`;
}

let memoryFallback = null;

/**
 * 取本次会话应使用的指纹。当天首次调用时生成，跨天后自动换新。
 * @returns {string}
 */
export function getClientId() {
  const day = serverDay();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.clientId);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.day === day && typeof saved.id === 'string' && saved.id) {
        return saved.id;
      }
    }
    const fresh = computeClientId();
    window.localStorage.setItem(STORAGE_KEYS.clientId, JSON.stringify({ day, id: fresh }));
    return fresh;
  } catch {
    // 隐私模式下 localStorage 会抛异常：退化成会话内存值
    if (!memoryFallback || memoryFallback.day !== day) {
      memoryFallback = { day, id: computeClientId() };
    }
    return memoryFallback.id;
  }
}
