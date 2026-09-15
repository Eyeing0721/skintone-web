// skintone 结果卡：数据推导 + canvas 渲染 + 一键分享
//
// 设计取舍（重要）：
// 整张卡在前端算，不依赖后端的 advice 字段。后端在置信度不足时会把 advice 置为
// null，那是给"严格模式"留的硬门禁；但面向普通用户的入口必须永远给得出结论，
// 所以这里自带一套可解释的配色推导作为兜底。
//
// 文案集中在 CARD_COPY —— 语气待定稿，改这一处即可。

export const SITE_URL = 'https://eyeing0721.github.io/skintone-web/';
export const SITE_LABEL = 'skintone';

// ── 文案区（可改） ───────────────────────────────────────────────────
export const CARD_COPY = {
  kicker: 'SKINTONE / 肤色测定',
  shadeLabel: '本命色号',
  depthLabel: '深浅',
  toneLabel: '底色',
  paletteLabel: '适合你的颜色',
  avoidLabel: '避雷',
  scanLabel: '扫码自己测',
  headline: {
    'very-light': { main: '肤白貌美', sub: '浅色系几乎都能压得住' },
    'light': { main: '冷白皮本皮', sub: '低饱和的莫兰迪色最衬你' },
    'intermediate': { main: '标准中间调', sub: '大多数颜色都能穿，挑彩度别挑明度' },
    'tan': { main: '健康小麦色', sub: '暖调与牛仔蓝都是你的主场' },
    'brown': { main: '浓郁巧克力', sub: '高饱和的暖色会发光' },
    'dark': { main: '高级深邃黑', sub: '亮色做点缀，比全身亮色更有气势' },
  },
  percentile: (p) => `比 ${p}% 的人肤色更浅`,
  trust: {
    high: { cn: '可信度 高', note: '色卡标定通过全部检查' },
    medium: { cn: '可信度 中', note: '未用参考卡，底色判定仅供参考' },
    low: { cn: '可信度 低', note: '光照或取样不理想，仅作参考' },
    insufficient: { cn: '可信度 不足', note: '想要更准请用比色卡模式重测' },
  },
  disclaimer: '基于单张照片的相机响应估计，不能替代专业色彩顾问',
};

// ── 人群对比的参考曲线 ────────────────────────────────────────────────
// 锚点含义：[ITA°, 肤色比该值更浅的人所占比例]。
// 构造依据：ITA 分档边界（皮肤科标准）+ Monk Skin Tone Scale 公布的三档人群占比
// （浅 30% / 中 30% / 深 40%，来源 https://skintone.google/the-scale）。
// 说明：这是在这些公开锚点上做的单调插值，量级正确，但不是精密人群统计。
// 卡片上只显示算出来的数字，出处留在这里。
const LIGHTER_ANCHORS = [
  [70, 0.02], [55, 0.10], [41, 0.25], [28, 0.40], [10, 0.55], [-30, 0.75], [-60, 0.95],
];

/** 算出"比百分之多少的人更浅"。 */
export function percentileLighterThan(ita) {
  const a = LIGHTER_ANCHORS;
  if (ita >= a[0][0]) return Math.round((1 - a[0][1]) * 100);
  const last = a[a.length - 1];
  if (ita <= last[0]) return Math.round((1 - last[1]) * 100);
  for (let i = 0; i < a.length - 1; i += 1) {
    const [x0, p0] = a[i];
    const [x1, p1] = a[i + 1];
    if (ita <= x0 && ita >= x1) {
      const t = (x0 - ita) / (x0 - x1);
      return Math.round((1 - (p0 + t * (p1 - p0))) * 100);
    }
  }
  return 50;
}

// ── 色号网格：明度档 × 底色字母 ──────────────────────────────────────
const DEPTH = {
  'very-light': { idx: 1, cn: '极浅' },
  light: { idx: 2, cn: '浅' },
  intermediate: { idx: 3, cn: '中间调' },
  tan: { idx: 4, cn: '小麦' },
  brown: { idx: 5, cn: '棕调' },
  dark: { idx: 6, cn: '深调' },
};
const TONE_LETTER = { cool: 'C', 'neutral-cool': 'C', neutral: 'N', 'neutral-warm': 'W', warm: 'W', olive: 'O' };
const TONE_CN = {
  cool: '冷调', 'neutral-cool': '中性偏冷', neutral: '中性',
  'neutral-warm': '中性偏暖', warm: '暖调', olive: '橄榄调',
};

// ── 色彩换算（D65 / 2°） ─────────────────────────────────────────────
const D65 = [0.95047, 1.0, 1.08883];
const srgbToLinear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const linearToSrgb = (l) => {
  const v = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};
const hexToRgb = (hex) => {
  const h = String(hex).replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const rgbToXyz = ([r, g, b]) => {
  const [R, G, B] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  return [
    0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
    0.2126729 * R + 0.7151522 * G + 0.0721750 * B,
    0.0193339 * R + 0.1191920 * G + 0.9503041 * B,
  ];
};
const xyzToLab = ([x, y, z]) => {
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x / D65[0]), f(y / D65[1]), f(z / D65[2])];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const labToXyz = ([L, a, b]) => {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const finv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  return [finv(fx) * D65[0], finv(fy) * D65[1], finv(fz) * D65[2]];
};
const xyzToRgb = ([x, y, z]) => [
  3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
  -0.9692660 * x + 1.8760108 * y + 0.0415560 * z,
  0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
].map(linearToSrgb);

export const hexToLab = (hex) => xyzToLab(rgbToXyz(hexToRgb(hex)));

/** Lab → hex，超出 sRGB 色域时按比例降彩度（简易 gamut mapping）。 */
export function labToHex(lab) {
  let [L, a, b] = lab;
  for (let i = 0; i < 20; i += 1) {
    const hex = rgbToHex(...xyzToRgb(labToXyz([L, a, b])));
    const back = hexToLab(hex);
    if (Math.hypot(back[1] - a, back[2] - b) < 2.5 || Math.hypot(a, b) < 0.5) return hex;
    a *= 0.88;
    b *= 0.88;
  }
  return rgbToHex(...xyzToRgb(labToXyz([L, a, b])));
}

const labToLch = ([L, a, b]) => [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
const lchToLab = ([L, C, h]) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];

const labToIta = ([L, , b]) => (Math.atan((L - 50) / b) * 180) / Math.PI;

// ── 兜底配色：可解释的固定色相 + 适配后的明度彩度 ────────────────────
// 不用任何外部色号数据库，规则写在明面上，因此可复现、可审计。
const GARMENT = [
  { name: '深雾蓝', h: 255, L: 34, C: 22 },
  { name: '苔绿', h: 118, L: 38, C: 20 },
  { name: '陶土棕', h: 45, L: 46, C: 26 },
  { name: '陈紫', h: 325, L: 40, C: 20 },
  { name: '暖驼', h: 72, L: 60, C: 24 },
];

function localPalette(lab) {
  const [L, C, h] = labToLch(lab);
  // 肤色越深，浅色点缀越有价值；越浅，深色越压得住。这里只做轻微调整。
  const lift = L < 45 ? 6 : L > 70 ? -4 : 0;
  return GARMENT.map((g) => ({
    name: g.name,
    hex: labToHex(lchToLab([Math.max(18, Math.min(78, g.L + lift)), g.C, g.h])),
  }));
}

function localAvoid(lab) {
  const [L, C, h] = labToLch(lab);
  return {
    hex: labToHex(lchToLab([Math.min(84, L + 12), Math.min(96, Math.max(38, C * 1.8)), h])),
    reason: '色相与肤色过近且彩度过高，容易显脏',
  };
}

// ── 卡面数据 ─────────────────────────────────────────────────────────
export function buildCardData(result) {
  const skin = (result && result.skin) || {};
  const labObj = skin.labD65 || { L: 62, a: 12, b: 19 };
  const lab = [labObj.L, labObj.a, labObj.b];
  const ita = typeof skin.itaDeg === 'number' ? skin.itaDeg : labToIta(lab);
  const depthKey = DEPTH[skin.depthClass] ? skin.depthClass : 'intermediate';
  const depth = DEPTH[depthKey];
  const toneKey = TONE_LETTER[(skin.undertone || {}).label] ? skin.undertone.label : 'neutral';
  const advice = (result && result.advice) || {};
  const level = ((result && result.confidence) || {}).level || 'medium';

  return {
    hex: skin.hex || labToHex(lab),
    lab,
    ita,
    depthKey,
    depthCn: depth.cn,
    shade: `${TONE_LETTER[toneKey]}${depth.idx}`,
    toneCn: TONE_CN[toneKey] || '中性',
    percentile: percentileLighterThan(ita),
    headline: CARD_COPY.headline[depthKey] || CARD_COPY.headline.intermediate,
    palette: advice.palette && advice.palette.length
      ? advice.palette.slice(0, 5).map((p) => ({ hex: p.hex, name: p.name || '' }))
      : localPalette(lab),
    avoid: advice.avoid && advice.avoid.length
      ? { hex: advice.avoid[0].hex, reason: advice.avoid[0].reason || '' }
      : localAvoid(lab),
    trust: CARD_COPY.trust[level] || CARD_COPY.trust.medium,
    date: new Date().toLocaleDateString('zh-CN'),
  };
}

// ── canvas 渲染 ──────────────────────────────────────────────────────
const W = 1080;
const H = 1440;
const PAD = 72;
const PAPER = '#fbf9f5';
const INK = '#16181a';
const MUTED = '#6d6a64';
const HAIR = 'rgba(22,24,26,.14)';
const SERIF = '"Iowan Old Style", Baskerville, Georgia, "Songti SC", "Noto Serif SC", serif';
const SANS = 'Aptos, "Segoe UI Variable Text", "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = '"Cascadia Mono", Consolas, "SFMono-Regular", monospace';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 亮度决定叠在色块上的文字用黑还是白。 */
function readableOn(hex) {
  const [r, g, b] = hexToRgb(hex);
  const y = 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
  return y > 0.42 ? '#16181a' : '#fbf9f5';
}

export function renderCard(canvas, data, qrImage) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // 顶部小标
  ctx.fillStyle = MUTED;
  ctx.font = `600 22px ${MONO}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(CARD_COPY.kicker, PAD, PAD + 22);
  ctx.textAlign = 'right';
  ctx.fillText(data.date, W - PAD, PAD + 22);
  ctx.textAlign = 'left';
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, PAD + 44);
  ctx.lineTo(W - PAD, PAD + 44);
  ctx.stroke();

  // 肤色大色块
  const swY = PAD + 76;
  const swH = 268;
  ctx.save();
  roundRect(ctx, PAD, swY, W - PAD * 2, swH, 6);
  ctx.clip();
  ctx.fillStyle = data.hex;
  ctx.fillRect(PAD, swY, W - PAD * 2, swH);
  ctx.restore();
  ctx.fillStyle = readableOn(data.hex);
  ctx.font = `700 34px ${MONO}`;
  ctx.fillText(data.hex.toUpperCase(), PAD + 30, swY + swH - 30);
  ctx.textAlign = 'right';
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText(
    `L* ${data.lab[0].toFixed(1)}  a* ${data.lab[1].toFixed(1)}  b* ${data.lab[2].toFixed(1)}`,
    W - PAD - 30, swY + swH - 30,
  );
  ctx.textAlign = 'left';

  // 主称号
  let y = swY + swH + 108;
  ctx.fillStyle = INK;
  ctx.font = `700 100px ${SERIF}`;
  ctx.fillText(data.headline.main, PAD, y);
  y += 52;
  ctx.fillStyle = MUTED;
  ctx.font = `400 30px ${SANS}`;
  ctx.fillText(data.headline.sub, PAD, y);

  // 数据 chip 行
  y += 68;
  const chips = [
    `${CARD_COPY.shadeLabel} ${data.shade}`,
    `${CARD_COPY.depthLabel} ${data.depthCn}`,
    `${CARD_COPY.toneLabel} ${data.toneCn}`,
    `ITA ${data.ita.toFixed(1)}°`,
  ];
  let cx = PAD;
  ctx.font = `600 26px ${MONO}`;
  chips.forEach((text) => {
    const w = ctx.measureText(text).width + 40;
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 2;
    roundRect(ctx, cx, y - 30, w, 50, 4);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(text, cx + 20, y + 4);
    cx += w + 14;
  });

  // 人群对比条
  y += 98;
  const barW = W - PAD * 2;
  ctx.fillStyle = 'rgba(22,24,26,.08)';
  roundRect(ctx, PAD, y, barW, 10, 5);
  ctx.fill();
  ctx.fillStyle = data.hex;
  roundRect(ctx, PAD, y, Math.max(10, (barW * data.percentile) / 100), 10, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(PAD + (barW * data.percentile) / 100, y + 5, 13, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText(CARD_COPY.percentile(data.percentile), PAD, y + 62);

  // 配色
  y += 132;
  ctx.fillStyle = MUTED;
  ctx.font = `600 22px ${MONO}`;
  ctx.fillText(CARD_COPY.paletteLabel, PAD, y);
  y += 34;
  const r = 40;
  const gap = 26;
  data.palette.forEach((p, i) => {
    const x = PAD + r + i * (r * 2 + gap);
    ctx.beginPath();
    ctx.arc(x, y + r, r, 0, Math.PI * 2);
    ctx.fillStyle = p.hex;
    ctx.fill();
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  // 避雷色
  const ax = PAD + r + data.palette.length * (r * 2 + gap) + 18;
  ctx.beginPath();
  ctx.arc(ax, y + r, r, 0, Math.PI * 2);
  ctx.fillStyle = data.avoid.hex;
  ctx.fill();
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(ax - r * 0.7, y + r + r * 0.7);
  ctx.lineTo(ax + r * 0.7, y + r - r * 0.7);
  ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = `600 20px ${MONO}`;
  ctx.fillText(CARD_COPY.avoidLabel, ax - 24, y + r * 2 + 30);

  // 底部：二维码 + 站点 + 可信度 + 免责
  const qrSize = 150;
  const qx = W - PAD - qrSize;
  const qy = H - PAD - qrSize;
  if (qrImage && qrImage.complete !== false) {
    ctx.drawImage(qrImage, qx, qy, qrSize, qrSize);
  } else {
    ctx.strokeStyle = HAIR;
    ctx.strokeRect(qx, qy, qrSize, qrSize);
  }
  ctx.fillStyle = MUTED;
  ctx.font = `500 20px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText(CARD_COPY.scanLabel, qx + qrSize, qy - 14);
  ctx.textAlign = 'left';

  ctx.fillStyle = INK;
  ctx.font = `700 30px ${MONO}`;
  ctx.fillText(SITE_LABEL, PAD, H - PAD - 96);
  ctx.fillStyle = MUTED;
  ctx.font = `500 22px ${MONO}`;
  ctx.fillText(SITE_URL.replace(/^https?:\/\//, ''), PAD, H - PAD - 62);
  ctx.font = `600 24px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText(data.trust.cn, PAD, H - PAD - 24);
  ctx.font = `400 20px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(CARD_COPY.disclaimer, PAD, H - PAD + 4);

  return canvas;
}

// ── 导出与分享 ───────────────────────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

/**
 * 一键分享：走系统分享面板（手机能直接发微信/小红书）。
 * 浏览器不支持文件分享时回退到下载。
 * @returns {'shared'|'downloaded'|'cancelled'}
 */
export async function shareCard(canvas, data) {
  const blob = await toBlob(canvas);
  const filename = `skintone-${data.shade}.png`;
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: '我的肤色测定',
        text: `${data.headline.main}｜${CARD_COPY.shadeLabel} ${data.shade}`,
      });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export async function downloadCard(canvas, data) {
  const blob = await toBlob(canvas);
  downloadBlob(blob, `skintone-${data.shade}.png`);
  return 'downloaded';
}
