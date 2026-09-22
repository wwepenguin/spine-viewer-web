import { AnimationTracks } from './animation-tracks';
import {
  PIXI,
  createSpine,
  SpineDebugRenderer,
  type RuntimeSpine,
  type RuntimeSlot,
} from './runtime';
import {
  DEBUG_KEYS,
  type DebugFlags,
  type SkeletonAsset,
  type Bounds,
  type Highlight,
} from './types';
export class SkeletonViewer {
  app: PIXI.Application;
  world: PIXI.Container;
  axes: PIXI.Graphics;
  highlight: PIXI.Graphics;
  points: PIXI.Graphics;
  mount: HTMLElement;
  marker: HTMLElement;
  paused = false;
  speed = 1;
  timelineTime = 0;
  get loop() {
    return this.trackSettings[this.track]?.loop ?? true;
  }
  set loop(value: boolean) {
    this.animationTracks?.configure(this.track, { loop: value });
  }
  selectedSlot: string | null = null;
  track = 0;
  mix = 0.2;
  zoom = 1;
  // These are assigned atomically by setModel; all UI model actions follow successful loading.
  model!: RuntimeSpine;
  asset!: SkeletonAsset;
  animationTracks?: AnimationTracks;
  get trackSettings() {
    return this.animationTracks?.settings ?? [];
  }
  debugFlags: DebugFlags = {};
  fitScale = 1;
  fittedBounds?: Bounds & { width: number; height: number };
  lastHighlight?: Highlight;
  onChange?: () => void;
  onViewChange?: () => void;
  onTick?: () => void;
  constructor(mount: HTMLElement, marker: HTMLElement) {
    this.mount = mount;
    this.marker = marker;
    this.paused = false;
    this.speed = 1;
    this.selectedSlot = null;
    this.track = 0;
    this.mix = 0.2;
    this.zoom = 1;
    this.app = new PIXI.Application({
      width: mount.clientWidth,
      height: mount.clientHeight,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(devicePixelRatio || 1, 2),
      autoDensity: true,
      preserveDrawingBuffer: true,
    });
    mount.appendChild(this.app.view);
    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);
    this.axes = new PIXI.Graphics();
    this.highlight = new PIXI.Graphics();
    this.points = new PIXI.Graphics();
    this.world.addChild(this.axes);
    this.debugFlags = {};
    new ResizeObserver(() => {
      const w = mount.clientWidth,
        h = mount.clientHeight;
      if (w && h) {
        this.app.renderer.resize(w, h);
        if (this.model) this.fit();
      }
    }).observe(mount);
    this.app.ticker.add(() => this.tick(Math.min(this.app.ticker.deltaMS / 1000, 0.05)));
    this.attachGestures();
  }
  setModel(asset: SkeletonAsset) {
    const next = createSpine(asset.spineData);
    next.autoUpdate = false;
    const skin = asset.spineData.defaultSkin || asset.spineData.skins[0];
    if (skin) {
      next.skeleton.setSkin(skin);
      next.skeleton.setSlotsToSetupPose();
    }
    next.update(0);
    if (this.model) {
      this.model.destroy({ children: true, texture: false, baseTexture: false });
      this.asset.dispose();
    }
    this.asset = asset;
    this.model = next;
    this.track = 0;
    this.animationTracks = new AnimationTracks(next, asset.spineData.animations);
    this.selectedSlot = null;
    this.world.addChild(next);
    this.world.addChild(this.points);
    this.world.addChild(this.highlight);
    this.setDebug(this.debugFlags);
    const first =
      asset.spineData.animations.find((a) => a.name === 'walk') || asset.spineData.animations[0];
    if (first) this.play(first.name);
    else this.setup();
    this.fit();
    this.drawHighlight();
  }
  current() {
    return this.model?.state.getCurrent(this.track);
  }
  play(name: string, track = this.track) {
    if (!this.animationTracks) return;
    if (!Number.isInteger(track) || track < 0 || track > 5)
      throw Error('Track must be between 0 and 5.');
    if (!this.asset.spineData.animations.some((a) => a.name === name))
      throw Error(`Animation not found: ${name}`);
    // Timeline clips share an origin. Editing the composition starts a fresh preview.
    this.timelineTime = 0;
    this.animationTracks.restartAll();
    const entry = this.animationTracks.play(track, name, this.mix);
    this.track = track;
    this.paused = false;
    this.drawHighlight();
    this.onChange?.();
    return entry;
  }
  setSkin(name: string) {
    if (!this.model) return;
    this.model.skeleton.setSkinByName(name);
    this.model.skeleton.setSlotsToSetupPose();
    this.model.update(0);
    this.drawHighlight();
  }
  setTrack(track: number) {
    if (!Number.isInteger(track) || track < 0 || track > 5)
      throw Error('Track must be between 0 and 5.');
    this.track = track;
    this.onChange?.();
  }
  configureTrack(alpha: number, additive: boolean) {
    this.animationTracks?.configure(this.track, { alpha, additive });
    this.drawHighlight();
    this.onChange?.();
  }
  setTrackLoop(track: number, loop: boolean) {
    this.animationTracks?.configure(track, { loop });
    this.onChange?.();
  }
  setTrackSpeed(speed: number) {
    this.animationTracks?.configure(this.track, { speed });
    this.animationTracks?.seekAll(this.timelineTime);
    this.onChange?.();
  }
  clearTrack(track = this.track) {
    this.animationTracks?.clear(track);
    this.drawHighlight();
    this.onChange?.();
  }
  restartAllTracks() {
    this.timelineTime = 0;
    this.animationTracks?.restartAll();
    this.drawHighlight();
    this.onChange?.();
  }
  setDebug(flags: DebugFlags) {
    this.debugFlags = { ...flags };
    if (!this.model) return;
    const debug = new SpineDebugRenderer();
    for (const name of DEBUG_KEYS) debug[name] = !!flags[name];
    debug.drawDebug = Object.values(flags).some(Boolean);
    debug.lineWidth = 1;
    this.model.debug = debug.drawDebug ? debug : null;
    this.model.update(0);
  }
  setup() {
    if (!this.model) return;
    this.model.state.clearTracks();
    this.timelineTime = 0;
    this.model.skeleton.setToSetupPose();
    this.model.update(0);
    this.paused = true;
    this.onChange?.();
  }
  seek(time: number) {
    if (!this.current()) return;
    this.seekAll(time / (this.current()?.timeScale || 1));
  }
  seekAll(time: number) {
    this.animationTracks?.seekAll(time);
    this.timelineTime = time;
    this.drawHighlight();
    this.onChange?.();
  }
  selectSlot(name: string | null) {
    if (name !== null && !this.model?.skeleton.findSlot(name))
      throw Error(`Slot not found: ${name}`);
    this.selectedSlot = name;
    this.drawHighlight();
    this.onChange?.();
  }
  geometry(slot: RuntimeSlot) {
    const attachment = slot.getAttachment();
    const fallback = {
      vertices: [] as number[] | Float32Array,
      outline: [] as number[] | Float32Array,
      x: slot.bone.worldX,
      y: slot.bone.worldY,
      attachment,
      inactive: slot.bone.active === false,
    };
    if (!attachment || fallback.inactive) return fallback;
    let vertices: number[] | Float32Array = [],
      outline: number[] | Float32Array = [];
    if (attachment.type === 0) {
      vertices = new Float32Array(8);
      attachment.computeWorldVertices(
        this.asset.spineData.version.startsWith('4.') ? slot : slot.bone,
        vertices,
        0,
        2,
      );
      outline = vertices;
    } else if (attachment.worldVerticesLength) {
      vertices = new Float32Array(attachment.worldVerticesLength);
      attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2);
      if (attachment.type === 2) outline = vertices.slice(0, attachment.hullLength || 0);
      else if ([1, 6].includes(attachment.type)) outline = vertices;
    } else if (attachment.type === 5) {
      const p = attachment.computeWorldPosition(slot.bone, new PIXI.Point());
      fallback.x = p.x;
      fallback.y = p.y;
    }
    return { ...fallback, vertices, outline };
  }
  bounds(vertices: ArrayLike<number>, x = 0, y = 0) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < vertices.length; i += 2) {
      minX = Math.min(minX, vertices[i]);
      minY = Math.min(minY, vertices[i + 1]);
      maxX = Math.max(maxX, vertices[i]);
      maxY = Math.max(maxY, vertices[i + 1]);
    }
    return vertices.length ? { minX, minY, maxX, maxY } : { minX: x, minY: y, maxX: x, maxY: y };
  }
  fit() {
    if (!this.model) return;
    let vertices: number[] = [];
    for (const slot of this.model.skeleton.slots) {
      const a = slot.getAttachment();
      if (
        a &&
        [0, 2].includes(a.type) &&
        slot.bone.active !== false &&
        slot.color.a > 0 &&
        (a.color?.a ?? 1) > 0
      )
        vertices.push(...this.geometry(slot).vertices);
    }
    const b = this.bounds(vertices),
      w = Math.max(40, b.maxX - b.minX),
      h = Math.max(40, b.maxY - b.minY);
    this.fittedBounds = { ...b, width: w, height: h };
    this.fitScale = Math.min(
      Math.max(100, this.app.screen.width - 140) / w,
      Math.max(100, this.app.screen.height - 150) / h,
      3,
    );
    this.zoom = 1;
    this.world.scale.set(this.fitScale);
    this.world.position.set(
      this.app.screen.width / 2 - (b.minX + w / 2) * this.fitScale,
      this.app.screen.height / 2 + 12 - (b.minY + h / 2) * this.fitScale,
    );
    this.drawHighlight();
    this.onViewChange?.();
  }
  setZoom(zoom: number, point = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 }) {
    const next = Math.min(4, Math.max(0.1, zoom)),
      ratio = next / this.zoom;
    this.zoom = next;
    this.world.position.set(
      point.x - (point.x - this.world.x) * ratio,
      point.y - (point.y - this.world.y) * ratio,
    );
    this.world.scale.set((this.fitScale || 1) * next);
    this.drawHighlight();
    this.onViewChange?.();
  }
  flip(axis: string, on: boolean) {
    if (!this.model) return;
    this.model.skeleton[axis === 'x' ? 'scaleX' : 'scaleY'] = on ? -1 : 1;
    this.model.update(0);
    this.fit();
  }
  setTextureMode(pma: boolean, linear: boolean) {
    if (!this.asset) return;
    for (const t of this.asset.textures) {
      t.alphaMode = pma ? PIXI.ALPHA_MODES.PMA : PIXI.ALPHA_MODES.UNPACK;
      t.scaleMode = linear ? PIXI.SCALE_MODES.LINEAR : PIXI.SCALE_MODES.NEAREST;
      t.update();
    }
  }
  drawHighlight() {
    const g = this.highlight;
    g.clear();
    this.marker.hidden = true;
    const scale = this.world.scale.x || 1;
    this.axes
      .clear()
      .lineStyle(1 / scale, 0x58667a, 0.55)
      .moveTo(-10000, 0)
      .lineTo(10000, 0)
      .moveTo(0, -10000)
      .lineTo(0, 10000);
    this.points.clear();
    if (this.debugFlags.points && this.model) {
      this.points.lineStyle(1 / scale, 0x68e3c4);
      for (const slot of this.model.skeleton.slots) {
        if (slot.getAttachment()?.type === 5) {
          const p = this.geometry(slot);
          this.points
            .drawCircle(p.x, p.y, 5 / scale)
            .moveTo(p.x - 8 / scale, p.y)
            .lineTo(p.x + 8 / scale, p.y)
            .moveTo(p.x, p.y - 8 / scale)
            .lineTo(p.x, p.y + 8 / scale);
        }
      }
    }
    if (!this.selectedSlot || !this.model) return;
    const slot = this.model.skeleton.findSlot(this.selectedSlot);
    if (!slot) return;
    const geo = this.geometry(slot),
      b = this.bounds(geo.vertices, geo.x, geo.y),
      pad = 3 / scale,
      cx = (b.minX + b.maxX) / 2,
      cy = (b.minY + b.maxY) / 2;
    for (const pass of [
      { width: 4, color: 0x16191e },
      { width: 2, color: 0xffe17b },
    ]) {
      g.lineStyle(pass.width / scale, pass.color, 1);
      if (geo.vertices.length) {
        g.drawRect(
          b.minX - pad,
          b.minY - pad,
          b.maxX - b.minX + pad * 2,
          b.maxY - b.minY + pad * 2,
        );
        if (geo.outline.length >= 6) g.drawPolygon(Array.from(geo.outline));
      }
      g.moveTo(cx - 6 / scale, cy)
        .lineTo(cx + 6 / scale, cy)
        .moveTo(cx, cy - 6 / scale)
        .lineTo(cx, cy + 6 / scale);
    }
    this.marker.textContent =
      this.selectedSlot +
      (geo.inactive ? ' · Inactive bone' : !geo.attachment ? ' · No attachment' : '');
    this.marker.hidden = false;
    const x = this.world.x + b.maxX * scale + 10,
      y = this.world.y + b.minY * scale - 28;
    this.marker.style.left =
      Math.max(10, Math.min(x, this.app.screen.width - this.marker.offsetWidth - 10)) + 'px';
    this.marker.style.top = Math.max(60, Math.min(y, this.app.screen.height - 50)) + 'px';
    this.lastHighlight = { ...b, slot: this.selectedSlot, vertexCount: geo.vertices.length };
  }
  tick(dt: number) {
    if (!this.model) return;
    if (!this.paused && this.animationTracks && this.model.state.tracks.some(Boolean)) {
      const result = this.animationTracks.advance(this.timelineTime, dt * this.speed);
      this.timelineTime = result.time;
      if (result.complete) {
        this.paused = true;
        this.onChange?.();
      }
    }
    this.drawHighlight();
    this.onTick?.();
  }
  attachGestures() {
    let drag: { x: number; y: number } | null = null;
    const canvas = this.app.view;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag) {
        this.world.x += e.clientX - drag.x;
        this.world.y += e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
        this.drawHighlight();
      }
    });
    const finish = () => {
      drag = null;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    canvas.style.cursor = 'grab';
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.001), {
          x: e.clientX - r.left,
          y: e.clientY - r.top,
        });
      },
      { passive: false },
    );
  }
  snapshot() {
    const e = this.current();
    return {
      file: this.asset?.fileName || null,
      version: this.asset?.spineData.version || null,
      slots: this.model?.skeleton.slots.map((s) => s.data.name) || [],
      skins: this.asset?.spineData.skins.map((s) => s.name) || [],
      skin: this.model?.skeleton.skin?.name || 'default',
      animations:
        this.asset?.spineData.animations.map((a) => ({ name: a.name, duration: a.duration })) || [],
      selectedSlot: this.selectedSlot,
      animation: e?.animation.name || null,
      time: e?.trackTime || 0,
      timelineTime: this.timelineTime,
      paused: this.paused,
      track: this.track,
      tracks:
        this.model?.state.tracks.map((e) =>
          e
            ? {
                animation: e.animation.name,
                alpha: e.alpha,
                additive: e.mixBlend === 3,
                time: e.trackTime,
                loop: e.loop,
                speed: e.timeScale,
              }
            : null,
        ) || [],
      highlight: this.selectedSlot ? this.lastHighlight : null,
      zoom: this.zoom,
      debug: this.debugFlags,
      view: {
        width: this.app.screen.width,
        height: this.app.screen.height,
        scale: this.world.scale.x,
        x: this.world.x,
        y: this.world.y,
        fittedBounds: this.fittedBounds,
      },
    };
  }
}
