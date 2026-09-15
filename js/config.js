/**
 * skintone-web / js/config.js
 *
 * 纯技术常量：契约版本、服务地址默认值、上传限制、卡片兜底副本、枚举取值。
 * **用户可见文案一律不在这里** —— 全部在 js/copy.js。
 * 契约 §8 要求阈值与常量集中，不许散落在函数体里。
 */

/** 本前端对齐的契约版本（契约 §0） */
export const SPEC_VERSION = '1.0.0';

/** 本前端自身版本 */
export const CLIENT_VERSION = '0.1.0';

/** localStorage 键名 */
export const STORAGE_KEYS = Object.freeze({
  apiBase: 'skintone.apiBase',
  apiKey: 'skintone.apiKey',
  cardProfileId: 'skintone.cardProfileId',
  illuminantGuess: 'skintone.illuminantGuess',
  storeImage: 'skintone.consent.storeImage',
});

/**
 * 服务基地址默认值（优先级：?api= > localStorage > 这里，契约 §2）
 * 默认指向已部署的 cloudflared 命名隧道（HTTPS）。
 * 自己在本机跑后端时，在页面「服务设置」里改成 http://127.0.0.1:8000 即可（会存进 localStorage）。
 */
export const API_BASE = 'https://skintest.0721.luxe';

/** 上传前压缩上限（契约 §7「原图全传」：只做尺寸上限与有损编码，绝不裁剪） */
export const UPLOAD = Object.freeze({
  /** 长边最大像素 */
  maxLongEdge: 4096,
  /** JPEG 质量 */
  jpegQuality: 0.92,
  /** 与服务端 SKINTONE_MAX_UPLOAD_MB 默认值一致，仅用于前端提前提示 */
  maxBytes: 20 * 1024 * 1024,
});

/** 默认参考卡 id（契约 §3） */
export const DEFAULT_CARD_ID = 'skintone-a4-v1';

/** 默认色卡自标定 profile id */
export const DEFAULT_CARD_PROFILE_ID = 'my-card-001';

/** 光源先验取值（契约 §2.3 capture.illuminantGuess）；中文标签在 copy.js */
export const ILLUMINANT_VALUES = Object.freeze(['daylight', 'shade', 'tungsten', 'fluorescent', 'led', 'unknown']);

/**
 * ROI 区域定义（契约 §2.3 rois）。
 * `key` 直接作为上传时的 `label`；显示名与提示语在 copy.js 的 roiStep.regions。
 */
export const ROI_REGIONS = Object.freeze([
  { key: 'jaw', group: 'skin', required: true },
  { key: 'neck', group: 'skin', required: true },
  { key: 'gray-card', group: 'reference', required: false },
]);

/** 四步流程（契约 §1 index.html） */
export const STEPS = Object.freeze(['mode', 'capture', 'roi', 'result']);

/**
 * 参考卡兜底副本（契约 §3 的代码化）。
 * 后端 GET /v1/card/skintone-a4-v1 是首选来源；离线或后端未就绪时用这份。
 * 两边任何一处改动都必须同时提升 SPEC_VERSION。
 */
export const CARD_FALLBACK = Object.freeze({
  cardId: 'skintone-a4-v1',
  specVersion: SPEC_VERSION,
  paper: { name: 'A4', widthMm: 210, heightMm: 297, dpi: 300 },
  markers: {
    dictionary: 'DICT_4X4_50',
    sizeMm: 20,
    ids: [0, 1, 2, 3],
    centersMm: [[25, 25], [185, 25], [25, 272], [185, 272]],
  },
  patches: [
    // 灰阶条（契约 §3）
    { id: 'G90', kind: 'gray', centerMm: [45, 65], sizeMm: 26, nominalSrgb: [245, 245, 245] },
    { id: 'G70', kind: 'gray', centerMm: [77, 65], sizeMm: 26, nominalSrgb: [200, 200, 200] },
    { id: 'G50', kind: 'gray', centerMm: [109, 65], sizeMm: 26, nominalSrgb: [160, 160, 160] },
    { id: 'G30', kind: 'gray', centerMm: [141, 65], sizeMm: 26, nominalSrgb: [120, 120, 120] },
    { id: 'G10', kind: 'gray', centerMm: [173, 65], sizeMm: 26, nominalSrgb: [75, 75, 75] },
    { id: 'K05', kind: 'gray', centerMm: [25, 215], sizeMm: 26, nominalSrgb: [40, 40, 40] },
    // 24 个色彩块，行优先，列中心 x = 31,61,91,121,151,181；行中心 y = 101,131,161,191
    { id: 'R', kind: 'color', centerMm: [31, 101], sizeMm: 22, nominalSrgb: [192, 57, 43] },
    { id: 'G', kind: 'color', centerMm: [61, 101], sizeMm: 22, nominalSrgb: [39, 174, 96] },
    { id: 'B', kind: 'color', centerMm: [91, 101], sizeMm: 22, nominalSrgb: [46, 134, 193] },
    { id: 'C', kind: 'color', centerMm: [121, 101], sizeMm: 22, nominalSrgb: [23, 162, 184] },
    { id: 'M', kind: 'color', centerMm: [151, 101], sizeMm: 22, nominalSrgb: [142, 68, 173] },
    { id: 'Y', kind: 'color', centerMm: [181, 101], sizeMm: 22, nominalSrgb: [241, 196, 15] },
    { id: 'SK1', kind: 'skin', centerMm: [31, 131], sizeMm: 22, nominalSrgb: [243, 213, 192] },
    { id: 'SK2', kind: 'skin', centerMm: [61, 131], sizeMm: 22, nominalSrgb: [232, 185, 143] },
    { id: 'SK3', kind: 'skin', centerMm: [91, 131], sizeMm: 22, nominalSrgb: [198, 134, 66] },
    { id: 'SK4', kind: 'skin', centerMm: [121, 131], sizeMm: 22, nominalSrgb: [141, 85, 36] },
    { id: 'SK5', kind: 'skin', centerMm: [151, 131], sizeMm: 22, nominalSrgb: [245, 208, 197] },
    { id: 'SK6', kind: 'skin', centerMm: [181, 131], sizeMm: 22, nominalSrgb: [217, 166, 160] },
    { id: 'SK7', kind: 'skin', centerMm: [31, 161], sizeMm: 22, nominalSrgb: [161, 102, 94] },
    { id: 'SK8', kind: 'skin', centerMm: [61, 161], sizeMm: 22, nominalSrgb: [107, 74, 58] },
    { id: 'OL1', kind: 'olive', centerMm: [91, 161], sizeMm: 22, nominalSrgb: [181, 166, 66] },
    { id: 'OL2', kind: 'olive', centerMm: [121, 161], sizeMm: 22, nominalSrgb: [125, 140, 74] },
    { id: 'OR1', kind: 'color', centerMm: [151, 161], sizeMm: 22, nominalSrgb: [211, 84, 0] },
    { id: 'BR1', kind: 'color', centerMm: [181, 161], sizeMm: 22, nominalSrgb: [110, 75, 42] },
    { id: 'W', kind: 'gray', centerMm: [31, 191], sizeMm: 22, nominalSrgb: [255, 255, 255] },
    { id: 'K', kind: 'gray', centerMm: [61, 191], sizeMm: 22, nominalSrgb: [0, 0, 0] },
    { id: 'G90b', kind: 'gray', centerMm: [91, 191], sizeMm: 22, nominalSrgb: [245, 245, 245] },
    { id: 'G50b', kind: 'gray', centerMm: [121, 191], sizeMm: 22, nominalSrgb: [160, 160, 160] },
    { id: 'P1', kind: 'color', centerMm: [151, 191], sizeMm: 22, nominalSrgb: [232, 160, 180] },
    { id: 'T1', kind: 'color', centerMm: [181, 191], sizeMm: 22, nominalSrgb: [47, 79, 111] },
  ],
  /**
   * 卡面上的印刷说明。它会被**画进参考卡本身**（属于卡片内容，不是网页 UI），
   * 因此与 js/copy.js 的网页文案分开：改这里会改变打印结果与 CCM 无关，但会让卡面文字变。
   */
  instructions: [
    '用哑光纸打印，不要缩放（打印对话框里把「适应页面 / 缩放」设为「无 / 100%」）。',
    '打印后用尺子量一下：左右两个 ArUco 标记外沿间距应为 180 mm，中心间距 160 mm。',
    '标定前先确认分辨率：300 DPI 下整张卡是 2480×3508 px。',
    '拍摄时把卡平放在脸旁同一光照下，四个黑色方框完整入镜、不反光、不卷边。',
  ],
});

/** 灰阶条 / 色彩块几何（契约 §3），卡片渲染与自检共用 */
export const CARD_GEOMETRY = Object.freeze({
  grayRowCenterY: 65,
  graySizeMm: 26,
  colorColCentersX: [31, 61, 91, 121, 151, 181],
  colorRowCentersY: [101, 131, 161, 191],
  colorSizeMm: 22,
});

/** 门禁比较方向与单位（契约 §5）；显示名在 copy.js 的 result.gateLabels */
export const GATE_META = Object.freeze({
  ccm_delta_e: { unit: 'ΔE00', dir: 'lte' },
  clipping: { unit: '', dir: 'lte', percent: true },
  specular: { unit: '', dir: 'lte', percent: true },
  roi_area: { unit: 'px', dir: 'gte' },
  roi_dispersion: { unit: 'ΔE00', dir: 'lte' },
});
