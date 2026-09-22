import { PIXI } from './runtime';
import type { SkeletonViewer } from './viewer';
import { $ } from './dom';
/* Measures actual ticker cadence, independent of animation speed and delta caps. */
export class SkeletonPerformance {
  viewer: SkeletonViewer;
  doc: Document;
  enabled = true;
  history: Array<{ time: number; fps: number }> = [];
  $ = $;
  previous: number | null = null;
  frameStart: number | null = null;
  elapsed = 0;
  intervals: number[] = [];
  cpu: number[] = [];
  drawCounts: number[] = [];
  drawCalls = 0;
  asset?: SkeletonViewer['asset'];
  gl?: WebGLRenderingContext | WebGL2RenderingContext;
  constructor(viewer: SkeletonViewer, doc: Document) {
    this.viewer = viewer;
    this.doc = doc;
    this.enabled = true;
    this.history = [];
    this.reset();
    // Pixi's Application renders at LOW (-25). Bracket update and render submission.
    viewer.app.ticker.add(this.begin, this, PIXI.UPDATE_PRIORITY.HIGH);
    viewer.app.ticker.add(this.end, this, PIXI.UPDATE_PRIORITY.UTILITY);
    this.$('performanceToggle').onclick = () => this.setEnabled(!this.enabled);
    this.$('perfReset').onclick = () => this.reset();
    doc.addEventListener('visibilitychange', () => this.reset());
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.$('performancePanel').hidden = !enabled;
    this.$('performanceToggle').setAttribute('aria-expanded', String(enabled));
    this.reset();
  }
  reset() {
    this.previous = null;
    this.frameStart = null;
    this.elapsed = 0;
    this.intervals = [];
    this.cpu = [];
    this.drawCounts = [];
    this.history = [];
    this.asset = this.viewer.asset;
    for (const id of [
      'perfFrame',
      'perfP95',
      'perfCpu',
      'perfDrawCalls',
      'perfModel',
      'perfGeometry',
      'perfTextures',
      'perfTextureBytes',
      'perfResolution',
    ])
      this.$(id).textContent = '—';
    this.$('perfFps').textContent = '— FPS';
    this.$('perfHeap').textContent = '—';
    this.$('perfGraph').setAttribute('points', '');
    this.$('perfGraphScale').textContent = '0–60';
    this.$('perfStatus').textContent = this.doc.hidden ? '背景頁籤 · 暫停採樣' : '採樣中…';
  }
  begin() {
    if (!this.enabled || this.doc.hidden) return;
    if (this.asset !== this.viewer.asset) this.reset();
    this.hookDrawCalls();
    this.drawCalls = 0;
    const now = performance.now();
    this.frameStart = now;
    if (this.previous !== null) {
      const interval = now - this.previous;
      if (interval > 0) {
        this.intervals.push(interval);
        this.elapsed += interval;
      }
    }
    this.previous = now;
  }
  hookDrawCalls() {
    const gl = (this.viewer.app.renderer as PIXI.Renderer).gl;
    if (this.gl === gl || !gl) return;
    this.gl = gl;
    const monitor = this;
    // Count native draw submissions, including Pixi batches, meshes and debug graphics.
    // Re-hook if Pixi replaces its context after context restoration.
    const calls = gl as unknown as Partial<
      Record<
        'drawElements' | 'drawArrays' | 'drawElementsInstanced' | 'drawArraysInstanced',
        (...args: number[]) => void
      >
    >;
    for (const name of [
      'drawElements',
      'drawArrays',
      'drawElementsInstanced',
      'drawArraysInstanced',
    ] as const) {
      const original = calls[name];
      if (!original) continue;
      calls[name] = function (this: WebGLRenderingContext, ...args: number[]) {
        if (monitor.enabled && monitor.frameStart !== null) monitor.drawCalls++;
        return original.apply(this, args);
      };
    }
  }

  end() {
    if (!this.enabled || this.doc.hidden || this.frameStart === null) return;
    this.cpu.push(performance.now() - this.frameStart);
    this.drawCounts.push(this.drawCalls);
    this.frameStart = null;
    if (this.elapsed < 500) return;
    const fps = (this.intervals.length * 1000) / this.elapsed;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    this.$('perfFps').textContent = fps.toFixed(1) + ' FPS';
    this.$('perfFrame').textContent = (this.elapsed / this.intervals.length).toFixed(2) + ' ms';
    this.$('perfP95').textContent = sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2) + ' ms';
    this.$('perfCpu').textContent =
      (this.cpu.reduce((sum, n) => sum + n, 0) / this.cpu.length).toFixed(2) + ' ms';
    this.$('perfDrawCalls').textContent =
      (this.drawCounts.reduce((sum, n) => sum + n, 0) / this.drawCounts.length).toFixed(1) +
      ' / ' +
      Math.max(...this.drawCounts);
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
      ?.usedJSHeapSize;
    this.$('perfHeap').textContent =
      typeof heap === 'number' && Number.isFinite(heap) ? this.mib(heap) : '此瀏覽器不支援';
    const now = performance.now();
    this.history.push({ time: now, fps });
    this.history = this.history.filter((p) => now - p.time <= 30000);
    const max = Math.max(60, Math.ceil(Math.max(...this.history.map((p) => p.fps)) / 30) * 30);
    this.$('perfGraphScale').textContent = '0–' + max;
    this.$('perfGraph').setAttribute(
      'points',
      this.history
        .map(
          (p) =>
            `${(216 - ((now - p.time) / 30000) * 216).toFixed(1)},${(42 - (p.fps / max) * 40).toFixed(1)}`,
        )
        .join(' '),
    );
    this.updateModel();
    this.$('perfStatus').textContent = this.viewer.paused ? '動畫暫停 · 持續渲染' : '即時採樣';
    this.elapsed = 0;
    this.intervals = [];
    this.cpu = [];
    this.drawCounts = [];
  }
  mib(bytes: number) {
    return (bytes / 1048576).toFixed(1) + ' MiB';
  }
  updateModel() {
    const model = this.viewer.model,
      asset = this.viewer.asset;
    this.$('perfModel').textContent = model
      ? `${model.skeleton.bones.length} / ${model.skeleton.slots.length}`
      : '—';
    let attachments = 0,
      triangles = 0;
    if (model)
      for (const slot of model.skeleton.slots) {
        const a = slot.getAttachment();
        if (
          !a ||
          slot.bone.active === false ||
          slot.color.a <= 0 ||
          model.skeleton.color.a <= 0 ||
          (a.color?.a ?? 1) <= 0
        )
          continue;
        if (a.type === 0) {
          attachments++;
          triangles += 2;
        } else if (a.type === 2) {
          attachments++;
          triangles += (a.triangles?.length || 0) / 3;
        }
      }
    this.$('perfGeometry').textContent = `${attachments} / ${triangles.toLocaleString()}`;
    let bytes = 0;
    for (const texture of asset?.textures || [])
      bytes += texture.realWidth * texture.realHeight * 4;
    this.$('perfTextures').textContent = String(asset?.textures.size || 0);
    this.$('perfTextureBytes').textContent = this.mib(bytes);
    const canvas = this.viewer.app.view;
    this.$('perfResolution').textContent = `${canvas.width} × ${canvas.height}`;
  }
}
