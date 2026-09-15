/**
 * skintone-web / js/roi.js
 *
 * ROI 多边形标注（契约 §2.3 rois）：三个区域 = 下颌 / 颈部 / 可选色卡。
 * 交互：点选加点、撤销上一点、拖动顶点、清空、整块删除，也可以整体跳过让服务端自动识别。
 *
 * 坐标系：内部一律用"归一化后的图片像素坐标"（即 capture.prepareCapture 输出的
 * width/height 坐标系），上传前再由 capture.buildRois 映回原图坐标。
 *
 * 显示名与提示语在 js/copy.js（roiStep.regions）；描边颜色在 css/style.css
 * 的 --roi-jaw / --roi-neck / --roi-card，本模块运行时读取，改配色不用碰 JS。
 */

import { ROI_REGIONS } from './config.js';
import { COPY } from './copy.js';
import { toClockwise } from './capture.js';

/** 顶点手柄/命中半径（CSS px）等交互几何常量 */
const ROI_GEOMETRY = Object.freeze({
  activeFillAlpha: 0.22,
  vertexRadius: 5.5,
  hitRadius: 16,
  strokeWidthActive: 2.5,
  strokeWidthIdle: 1.5,
  dash: [6, 5],
  lastPointRingGap: 6,
});

/** 从 CSS 变量取区域描边色，取不到用兜底色 */
function regionColor(key, fallback) {
  if (typeof window === 'undefined' || !document.body) return fallback;
  const v = getComputedStyle(document.body).getPropertyValue(`--roi-${key}`).trim();
  return v || fallback;
}

const FALLBACK_COLORS = { jaw: '#ffb26b', neck: '#6bd3ff', 'gray-card': '#9ef07a' };

/**
 * 一个区域的可编辑多边形。
 */
class Region {
  constructor(def) {
    const text = (COPY.roiStep.regions && COPY.roiStep.regions[def.key]) || {};
    this.key = def.key;
    this.label = text.label || def.key;
    this.hint = text.hint || '';
    this.group = def.group;
    this.required = Boolean(def.required);
    this.color = regionColor(def.key, FALLBACK_COLORS[def.key] || '#ffb26b');
    /** @type {Array<[number,number]>} 归一化图片像素坐标 */
    this.points = [];
    this.selected = false;
  }

  get closed() {
    return this.points.length >= 3;
  }
}

/**
 * 画布上的多边形编辑器。
 */
/* ------------------------------------------------------------------ */
/* 取样几何                                                            */
/* ------------------------------------------------------------------ */

/**: 一次点击生成的默认取样半径（相对图片短边） */
const SAMPLE_RADIUS_RATIO = 0.09;
/**: 圆形取样区的顶点数。16 边形在屏幕上看已经是圆，导出也短——不要再堆几十个点。 */
const SAMPLE_SEGMENTS = 16;

/** 以 (cx, cy) 为心生成一个闭合的圆形多边形。 */
function circlePolygon(cx, cy, radius, segments) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return points;
}

/** 多边形顶点均值。 */
function centroid(points) {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  return [sx / points.length, sy / points.length];
}

/** 从圆形顶点还原圆心与半径（圆心 = 质心，半径 = 到质心的平均距离）。 */
function circleOf(points) {
  if (!points || points.length < 3) return null;
  const [cx, cy] = centroid(points);
  let total = 0;
  for (const [x, y] of points) total += Math.hypot(x - cx, y - cy);
  return { cx, cy, r: total / points.length };
}

/** 顶点是否均匀落在同一个圆上（我们生成的样本就是正圆，用于渲染成光滑圆弧）。 */
function isRound(points, tolerance = 0.06) {
  const circle = circleOf(points);
  if (!circle || circle.r <= 0) return false;
  return points.every(
    ([x, y]) => Math.abs(Math.hypot(x - circle.cx, y - circle.cy) - circle.r) <= circle.r * tolerance,
  );
}

export class RoiEditor {
  /**
   * @param {HTMLCanvasElement} canvas 承载显示与交互的 canvas
   * @param {{onChange?: (regions: Region[], activeKey: string) => void}} opts
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = opts.onChange || (() => {});
    this.regions = ROI_REGIONS.map((d) => new Region(d));
    this.activeKey = ROI_REGIONS[0].key;
    this.regions[0].selected = true;
    /** 底图：{width, height, drawable} */
    this.source = null;
    /** 视口映射：图片坐标 → CSS 坐标 */
    this.view = { x: 0, y: 0, scale: 1, cssW: 0, cssH: 0 };
    this.drag = null;
    this.dirty = true;
    this._bindPointer();
    this._bindResize();
  }

  /* ---------------- 状态 ---------------- */

  /** 设置底图（已归一化的 canvas / image） */
  setSource(drawable, width, height) {
    this.source = { drawable, width, height };
    this.clearAll(false);
    this.resize();
    this.draw();
    this._emit();
  }

  /** 当前选中的区域 */
  get active() {
    return this.regions.find((r) => r.key === this.activeKey) || this.regions[0];
  }

  /** 选中某个区域（之后点选都加到它上面） */
  selectRegion(key) {
    this.activeKey = key;
    for (const r of this.regions) r.selected = r.key === key;
    this.draw();
    this._emit();
  }

  /**
   * 在图片坐标处放一块**圆形取样区**（自动闭合）。
   *
   * 为什么不是"画多边形"：原流程要求先点「颈部」那个小框选中区域，再画满
   * 3 个点、还要闭合——实测用户觉得反直觉。改成一次点击就得到一块可直接使用
   * 的圆形 ROI：圆天然闭合，不需要点数，也不需要先选区域。
   * 再点一次同一个地方 = 移动这块样本；点到另一处 = 放到空的那个区域上。
   */
  placeSample(ix, iy) {
    if (!this.source) return null;
    const region = this._regionForTap(ix, iy);
    const base = SAMPLE_RADIUS_RATIO * Math.min(this.source.width, this.source.height);
    // 贴着画面边缘点击时收窄半径，避免样本大半落在图片外
    const room = Math.min(ix, iy, this.source.width - ix, this.source.height - iy);
    const radius = Math.max(8, Math.min(base, room));
    region.points = circlePolygon(ix, iy, radius, SAMPLE_SEGMENTS);
    this.activeKey = region.key;
    for (const r of this.regions) r.selected = r.key === region.key;
    this.draw();
    this._emit();
    return region;
  }

  /** 这一击该落进哪个区域：优先空着的皮肤区域，否则离点击最近的那个。 */
  _regionForTap(ix, iy) {
    const empty = this.regions.find((r) => r.group === 'skin' && !r.points.length);
    if (empty) return empty;
    let best = this.active;
    let bestDistance = Infinity;
    for (const r of this.regions) {
      if (r.group !== 'skin' || !r.points.length) continue;
      const [cx, cy] = centroid(r.points);
      const distance = Math.hypot(cx - ix, cy - iy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = r;
      }
    }
    return best;
  }

  /** 半径手柄的位置：圆的 3 点钟方向（屏幕坐标）。 */
  _knobPoint(region) {
    const circle = circleOf(region.points);
    if (!circle) return null;
    return this.toScreen([circle.cx + circle.r, circle.cy]);
  }

  /** 这一击是否抓住了半径手柄。 */
  _hitRadiusKnob([sx, sy]) {
    const reach = ROI_GEOMETRY.hitRadius + 8;
    const order = [this.active, ...this.regions.filter((r) => r !== this.active)];
    for (const region of order) {
      if (region.group !== 'skin' || !region.closed) continue;
      const knob = this._knobPoint(region);
      if (knob && Math.hypot(knob[0] - sx, knob[1] - sy) <= reach) return { region };
    }
    return null;
  }

  /** 这一击落在哪一块已有样本里（用于整块搬走）。 */
  _regionAt([sx, sy]) {
    const [ix, iy] = this.toImage([sx, sy]);
    for (const region of this.regions) {
      if (region.group !== 'skin') continue;
      const circle = circleOf(region.points);
      if (circle && Math.hypot(ix - circle.cx, iy - circle.cy) <= circle.r) return region;
    }
    return null;
  }

  /**
   * 只改半径，圆心不动——拖半径手柄时用。
   * 结果仍是一块正圆，所以导出给服务端的多边形始终是闭合且规则的。
   */
  setRadius(region, radius) {
    if (!this.source) return;
    const circle = circleOf(region.points);
    if (!circle) return;
    const base = SAMPLE_RADIUS_RATIO * Math.min(this.source.width, this.source.height);
    // 上限：不超过默认半径的 4 倍，也不越过画面边缘
    const room = Math.min(circle.cx, circle.cy, this.source.width - circle.cx, this.source.height - circle.cy);
    const upper = Math.max(12, Math.min(room, base * 4));
    const clamped = Math.max(8, Math.min(radius, upper));
    region.points = circlePolygon(circle.cx, circle.cy, clamped, SAMPLE_SEGMENTS);
    this.draw();
  }

  /** 撤销当前区域的上一个点 */
  undo() {
    const r = this.active;
    if (!r.points.length) return false;
    r.points.pop();
    this.draw();
    this._emit();
    return true;
  }

  /** 清空当前区域 */
  clearActive() {
    const r = this.active;
    if (!r.points.length) return false;
    r.points = [];
    this.draw();
    this._emit();
    return true;
  }

  /** 清空全部区域 */
  clearAll(emit = true) {
    for (const r of this.regions) r.points = [];
    this.draw();
    if (emit) this._emit();
  }

  /** 导出给上传用的区域数据（只含有 ≥3 个点的区域） */
  exportRegions() {
    return this.regions
      .filter((r) => r.closed)
      .map((r) => ({
        label: r.key,
        group: r.group,
        points: toClockwise(r.points.map(([x, y]) => [x, y])),
      }));
  }

  /**
   * 是否已经够用。
   * 只需要**一块**皮肤样本——服务端是按多边形取中位数，一块就够；两块更稳，
   * 但不是必需。原来要求下颌与颈部都闭合，对用户是多余的门槛。
   */
  isComplete() {
    return this.regions.some((r) => r.group === 'skin' && r.closed);
  }

  /** 每个区域的点数，供 UI 显示 */
  summary() {
    return this.regions.map((r) => ({
      key: r.key,
      label: r.label,
      count: r.points.length,
      closed: r.closed,
      required: r.required,
      selected: r.key === this.activeKey,
    }));
  }

  /* ---------------- 渲染 ---------------- */

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || this.canvas.clientWidth || 320);
    const cssH = Math.max(1, rect.height || this.canvas.clientHeight || 320);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view.cssW = cssW;
    this.view.cssH = cssH;
    const sw = this.source ? this.source.width : 1;
    const sh = this.source ? this.source.height : 1;
    const scale = Math.min(cssW / sw, cssH / sh);
    this.view.scale = scale;
    this.view.x = (cssW - sw * scale) / 2;
    this.view.y = (cssH - sh * scale) / 2;
    this.dirty = true;
  }

  /** 图片坐标 → CSS 坐标 */
  toScreen([x, y]) {
    return [this.view.x + x * this.view.scale, this.view.y + y * this.view.scale];
  }

  /** CSS 坐标 → 图片坐标 */
  toImage([sx, sy]) {
    return [(sx - this.view.x) / this.view.scale, (sy - this.view.y) / this.view.scale];
  }

  draw() {
    const ctx = this.ctx;
    const g = ROI_GEOMETRY;
    const { cssW, cssH } = this.view;
    ctx.clearRect(0, 0, cssW, cssH);
    if (!this.source) return;
    const sw = this.source.width * this.view.scale;
    const sh = this.source.height * this.view.scale;
    ctx.drawImage(this.source.drawable, this.view.x, this.view.y, sw, sh);
    ctx.save();
    ctx.strokeStyle = regionColor('frame', 'rgba(255,255,255,.25)');
    ctx.lineWidth = 1;
    ctx.strokeRect(this.view.x + 0.5, this.view.y + 0.5, sw - 1, sh - 1);
    ctx.restore();

    for (const region of this.regions) {
      if (!region.points.length) continue;
      const pts = region.points.map((p) => this.toScreen(p));
      // 我们生成的样本是正圆：直接画圆弧，并且**不铺一地点**。
      // 一堆顶点会让人以为要逐个去调，画面也很吵。
      const circle = circleOf(region.points);
      const round = Boolean(circle) && isRound(region.points);
      const tracePath = () => {
        if (round) {
          const [kx, ky] = this.toScreen([circle.cx, circle.cy]);
          ctx.arc(kx, ky, circle.r * this.view.scale, 0, Math.PI * 2);
          return;
        }
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
        if (region.closed) ctx.closePath();
      };

      ctx.save();
      if (region.closed) {
        ctx.beginPath();
        tracePath();
        ctx.fillStyle = withAlpha(region.color, g.activeFillAlpha);
        ctx.fill();
      }
      ctx.beginPath();
      tracePath();
      ctx.strokeStyle = region.color;
      ctx.lineWidth = region.selected ? g.strokeWidthActive : g.strokeWidthIdle;
      ctx.setLineDash(region.selected ? [] : g.dash);
      ctx.stroke();
      ctx.setLineDash([]);

      // 只有"非圆"（被手动微调过的）才画顶点，方便逐个调；正圆只画轮廓
      if (!round) {
        for (const [px, py] of pts) {
          ctx.beginPath();
          ctx.arc(px, py, region.selected ? g.vertexRadius : g.vertexRadius - 1.5, 0, Math.PI * 2);
          ctx.fillStyle = regionColor('vertex-ink', '#101418');
          ctx.fill();
          ctx.strokeStyle = region.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (region.selected && pts.length) {
          const [lx, ly] = pts[pts.length - 1];
          ctx.beginPath();
          ctx.arc(lx, ly, g.vertexRadius + g.lastPointRingGap, 0, Math.PI * 2);
          ctx.strokeStyle = withAlpha(region.color, 0.55);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      // 圆形样本只留一个"白点"：拖它调半径。位置本身就是提示，不必另加滑杆。
      if (region.selected && region.group === 'skin' && region.closed) {
        const knob = this._knobPoint(region);
        if (knob) {
          ctx.beginPath();
          ctx.arc(knob[0], knob[1], 9, 0, Math.PI * 2);
          ctx.fillStyle = regionColor('vertex-ink', '#101418');
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  /* ---------------- 交互 ---------------- */

  _bindPointer() {
    const c = this.canvas;
    const opts = { passive: false };
    this._onDown = (ev) => {
      if (!this.source) return;
      ev.preventDefault();
      const pt = this._eventPoint(ev);

      // 1) 抓住半径手柄 → 只改半径，圆心不动
      const knob = this._hitRadiusKnob(pt);
      if (knob) {
        this.radiusDrag = knob;
        c.setPointerCapture?.(ev.pointerId);
        return;
      }
      // 2) 抓住某个顶点 → 微调形状
      const hit = this._hitVertex(pt);
      if (hit) {
        this.drag = { region: hit.region, index: hit.index, moved: false };
        c.setPointerCapture?.(ev.pointerId);
        return;
      }
      // 3) 点在已有样本内部 → 整块搬走
      const inside = this._regionAt(pt);
      if (inside) {
        this.moveDrag = {
          region: inside,
          from: this.toImage(pt),
          origin: inside.points.map((p) => [p[0], p[1]]),
          moved: false,
        };
        c.setPointerCapture?.(ev.pointerId);
        return;
      }
      // 4) 否则：**第一下点击 = 定圆心**，先给一个默认半径，随后拖白点挑半径
      const [ix, iy] = this.toImage(pt);
      // 图片外的点直接丢弃：服务端按原图像素解读，越界点是无效 ROI
      if (ix < 0 || iy < 0 || ix > this.source.width || iy > this.source.height) return;
      this.placeSample(ix, iy);
    };
    this._onMove = (ev) => {
      if (!this.source) return;
      const pt = this._eventPoint(ev);

      if (this.radiusDrag) {
        ev.preventDefault();
        const [ix, iy] = this.toImage(pt);
        const circle = circleOf(this.radiusDrag.region.points);
        if (circle) this.setRadius(this.radiusDrag.region, Math.hypot(ix - circle.cx, iy - circle.cy));
        return;
      }
      if (this.moveDrag) {
        ev.preventDefault();
        const [ix, iy] = this.toImage(pt);
        const dx = ix - this.moveDrag.from[0];
        const dy = iy - this.moveDrag.from[1];
        this.moveDrag.region.points = this.moveDrag.origin.map(([x, y]) => [
          Math.max(0, Math.min(this.source.width, x + dx)),
          Math.max(0, Math.min(this.source.height, y + dy)),
        ]);
        this.moveDrag.moved = true;
        this.draw();
        return;
      }
      if (!this.drag) return;
      ev.preventDefault();
      const [ix, iy] = this.toImage(pt);
      this.drag.region.points[this.drag.index] = [
        Math.max(0, Math.min(this.source.width, ix)),
        Math.max(0, Math.min(this.source.height, iy)),
      ];
      this.drag.moved = true;
      this.draw();
    };
    this._onUp = (ev) => {
      if (!this.drag && !this.radiusDrag && !this.moveDrag) return;
      const moved = Boolean(
        (this.drag && this.drag.moved) ||
          this.radiusDrag ||
          (this.moveDrag && this.moveDrag.moved),
      );
      this.drag = null;
      this.radiusDrag = null;
      this.moveDrag = null;
      c.releasePointerCapture?.(ev.pointerId);
      if (moved) this._emit();
    };
    c.addEventListener('pointerdown', this._onDown, opts);
    c.addEventListener('pointermove', this._onMove, opts);
    c.addEventListener('pointerup', this._onUp);
    c.addEventListener('pointercancel', this._onUp);
    // 触屏上禁止默认手势，避免拖动顶点时页面跟着动
    this._onTouch = (ev) => ev.preventDefault();
    c.addEventListener('touchstart', this._onTouch, opts);
  }

  _eventPoint(ev) {
    const rect = this.canvas.getBoundingClientRect();
    return [ev.clientX - rect.left, ev.clientY - rect.top];
  }

  _hitVertex([sx, sy]) {
    // 选中的区域优先命中；再从最后一个点往回找（后加的点在上层）
    const radius = ROI_GEOMETRY.hitRadius;
    const order = [this.active, ...this.regions.filter((r) => r !== this.active)];
    for (const region of order) {
      for (let i = region.points.length - 1; i >= 0; i -= 1) {
        const [px, py] = this.toScreen(region.points[i]);
        if (Math.hypot(px - sx, py - sy) <= radius) {
          if (region !== this.active) this.selectRegion(region.key);
          return { region, index: i };
        }
      }
    }
    return null;
  }

  _bindResize() {
    this._onResize = () => {
      this.resize();
      this.draw();
    };
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(this.canvas);
    }
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    if (this._ro) this._ro.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._onDown);
    c.removeEventListener('pointermove', this._onMove);
    c.removeEventListener('pointerup', this._onUp);
    c.removeEventListener('pointercancel', this._onUp);
    c.removeEventListener('touchstart', this._onTouch);
  }

  _emit() {
    if (typeof window !== 'undefined') window.__skintoneRoi = this;
    this.onChange(this.regions, this.activeKey);
  }
}

/** 给颜色加 alpha：支持 #rrggbb 与 rgb()/rgba() 两种输入（颜色可能来自 CSS 变量） */
function withAlpha(color, alpha) {
  const c = String(color).trim();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  const rgb = c.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((v) => v.trim());
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
  }
  return c;
}
