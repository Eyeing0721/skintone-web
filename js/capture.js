/**
 * skintone-web / js/capture.js
 *
 * 采集（契约 §7「原图全传」）：
 *   - 摄像头 getUserMedia 或文件选择
 *   - canvas 归一化：只做**长边 ≤ 4096 的尺寸上限**与 JPEG q=0.92 编码，**不裁剪**
 *   - 上传前的明确同意项由调用方（app.js）负责勾选，这里只负责把 consent 写进 meta
 */

import { UPLOAD } from './config.js';
import { COPY } from './copy.js';

const T = COPY.captureStep;

/** 是否支持摄像头 API（file:// 下大多数浏览器仍可用，但需要 HTTPS 或 localhost） */
export function cameraSupported() {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function',
  );
}

/**
 * 请求摄像头。
 * @param {{facingMode?: 'user'|'environment', deviceId?: string, width?: number, height?: number}} opts
 * @returns {Promise<{stream: MediaStream, track: MediaStreamTrack, settings: object}>}
 */
export async function startCamera({ facingMode = 'user', deviceId = '', width = 0, height = 0 } = {}) {
  if (!cameraSupported()) {
    const err = new Error(T.cameraUnsupported);
    err.code = 'CAMERA_UNSUPPORTED';
    throw err;
  }
  const video = {};
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = { ideal: facingMode };
  if (width || height) {
    video.width = width ? { ideal: width } : undefined;
    video.height = height ? { ideal: height } : undefined;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (e) {
    const err = new Error(reasonForCameraFailure(e));
    err.code = 'CAMERA_FAILED';
    err.cause = e;
    throw err;
  }
  const track = stream.getVideoTracks()[0];
  return { stream, track, settings: (track && track.getSettings && track.getSettings()) || {} };
}

/** 摄像头失败原因 → 可读说明（技术分支，不属产品文案，故留在模块内） */
function reasonForCameraFailure(e) {
  const name = e && e.name;
  if (name === 'NotAllowedError') return '摄像头权限被拒绝。请在浏览器的站点权限里重新允许，或改用手动选图。';
  if (name === 'NotFoundError') return '没找到可用的摄像头设备，请改用手动选图。';
  return `摄像头打不开：${(e && e.message) || e}`;
}

/** 停止摄像头，释放指示灯 */
export function stopCamera(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* 忽略 */
  }
}

/** 把 video 当前帧画进 canvas（按视频原始分辨率，不缩放） */
export function grabFrame(video) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error(T.shutterTooEarly);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  return canvas;
}

/** data URL / File / Blob → 已解码图像（应用 EXIF 方向） */
export async function loadImage(source) {
  if (typeof Image === 'undefined') throw new Error(T.canvasUnsupported);
  if (typeof createImageBitmap === 'function' && (source instanceof Blob || source instanceof File)) {
    // createImageBitmap 默认按 EXIF 方向解码
    try {
      const bmp = await createImageBitmap(source, { imageOrientation: 'from-image' });
      return { image: bmp, width: bmp.width, height: bmp.height, bitmap: true };
    } catch {
      /* 回落到 <img> */
    }
  }
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(T.decodeFailed));
      el.src = url;
    });
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, bitmap: false };
  } finally {
    if (typeof source !== 'string') {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b), type, quality);
    } else {
      // 极老环境兜底（file:// 下某些内嵌浏览器）
      const dataUrl = canvas.toDataURL(type, quality);
      const bin = atob(dataUrl.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type }));
    }
  });
}

/**
 * 归一化：按长边上限等比缩放，然后编码成 JPEG。
 * **不裁剪、不旋转、不动色彩**——只做尺寸上限与有损编码（契约 §7）。
 *
 * @param {HTMLCanvasElement|HTMLImageElement|ImageBitmap} src
 * @param {{maxLongEdge?: number, quality?: number, type?: string}} opts
 * @returns {Promise<{blob: Blob, width: number, height: number, originalWidth: number,
 *                    originalHeight: number, scaled: boolean, scale: number, quality: number,
 *                    type: string, bytes: number}>}
 */
export async function normalizeForUpload(src, opts = {}) {
  const maxLongEdge = opts.maxLongEdge || UPLOAD.maxLongEdge;
  const quality = opts.quality === undefined ? UPLOAD.jpegQuality : opts.quality;
  const type = opts.type || 'image/jpeg';

  const sw = src.naturalWidth || src.videoWidth || src.width;
  const sh = src.naturalHeight || src.videoHeight || src.height;
  if (!sw || !sh) throw new Error(T.noSourceSize);

  const scale = Math.min(1, maxLongEdge / Math.max(sw, sh));
  const tw = Math.max(1, Math.round(sw * scale));
  const th = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (scale < 1) {
    // 逐步减半，避免一次性大幅下采样产生锯齿（会影响色块采样）
    let curW = sw;
    let curH = sh;
    let source = src;
    while (curW / 2 >= tw && curH / 2 >= th) {
      const half = document.createElement('canvas');
      half.width = Math.max(1, Math.floor(curW / 2));
      half.height = Math.max(1, Math.floor(curH / 2));
      const hctx = half.getContext('2d');
      hctx.imageSmoothingEnabled = true;
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(source, 0, 0, half.width, half.height);
      source = half;
      curW = half.width;
      curH = half.height;
    }
    ctx.drawImage(source, 0, 0, tw, th);
  } else {
    ctx.drawImage(src, 0, 0, tw, th);
  }

  const blob = await canvasToBlob(canvas, type, quality);
  if (!blob) throw new Error(T.encodingFailed);
  return {
    blob,
    width: tw,
    height: th,
    originalWidth: sw,
    originalHeight: sh,
    scaled: scale < 1,
    scale,
    quality,
    type,
    bytes: blob.size,
    canvas,
  };
}

/**
 * 从一个"已采集的 canvas"生成上传统一格式（含预览 data URL 与文件对象）。
 * @param {HTMLCanvasElement|HTMLImageElement} source
 * @param {object} opts
 */
export async function prepareCapture(source, opts = {}) {
  const normalized = await normalizeForUpload(source, opts);
  const file =
    typeof File === 'function'
      ? new File([normalized.blob], opts.filename || 'capture.jpg', { type: normalized.type })
      : normalized.blob;
  return { ...normalized, file };
}

/**
 * 读文件的字节数，提前判断是否超过服务端上限（契约 §2.3 SKINTONE_MAX_UPLOAD_MB 默认 20）。
 * 原始文件超限不算错——归一化后一般会小很多——只有归一化后仍超限才提示。
 */
export function exceedsServerLimit(bytes, maxBytes = UPLOAD.maxBytes) {
  return bytes > maxBytes;
}

/** 人类可读字节数 */
export function humanBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 组装契约 §2.3 的 meta 对象。
 * @param {{mode: string, cardId?: string, cardProfileId?: string|null, hairLStar?: number|null,
 *          illuminantGuess?: string, wbLocked?: boolean, raw?: boolean, flash?: boolean,
 *          actualWidth?: number, actualHeight?: number, storeImage: boolean, acceptedAt?: string}} p
 */
export function buildMeta(p) {
  return {
    mode: p.mode,
    cardId: p.mode === 'card' ? p.cardId || null : null,
    cardProfileId: p.cardProfileId || null,
    hairLStar: p.hairLStar === undefined ? null : p.hairLStar,
    capture: {
      wbLocked: Boolean(p.wbLocked),
      raw: Boolean(p.raw),
      flash: Boolean(p.flash),
      illuminantGuess: p.illuminantGuess || 'unknown',
      devicePixelRatio:
        (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    },
    consent: {
      storeImage: Boolean(p.storeImage),
      acceptedAt: p.acceptedAt || new Date().toISOString(),
    },
    clientVersion: p.clientVersion,
  };
}

/**
 * 组装契约 §2.3 的 rois 对象。
 * 坐标为**原图像素**、闭合多边形、顺时针。ROI 是在归一化后的图上点的，
 * 但服务端要的是原图坐标 —— 这里用归一化比例把点映回原图。
 *
 * @param {Array<{label: string, group: 'skin'|'reference', points: Array<[number,number]>}>} regions
 * @param {{width: number, height: number}} normalized 归一化后尺寸（点所在坐标系）
 * @param {{width: number, height: number}} original 原图尺寸
 * @returns {{skin: Array, reference: Array}|null} 没有任何点时返回 null（= 让服务端自动识别）
 */
export function buildRois(regions, normalized, original) {
  const sx = normalized.width ? original.width / normalized.width : 1;
  const sy = normalized.height ? original.height / normalized.height : 1;
  const skin = [];
  const reference = [];
  for (const region of regions || []) {
    if (!region || !Array.isArray(region.points) || region.points.length < 3) continue;
    const item = {
      label: region.label,
      points: region.points.map(([x, y]) => [
        Math.round(x * sx),
        Math.round(y * sy),
      ]),
    };
    if (region.group === 'reference') reference.push(item);
    else skin.push(item);
  }
  if (!skin.length && !reference.length) return null;
  return { skin, reference };
}

/** 算多边形的有向面积（>0 为逆时针）。用来保证 ROI 点序统一为顺时针（契约 §2.3）。 */
export function polygonSignedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** 返回顺时针点序（屏幕坐标系 y 向下，正面积即顺时针） */
export function toClockwise(points) {
  return polygonSignedArea(points) >= 0 ? points.slice() : points.slice().reverse();
}
