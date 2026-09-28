import { MusicTransport, animationTime } from './music';
import { transformPoint, transformVertices } from './transform';
import { stepFrameTime } from './frame-step';
import { AnimationTracks, type AnimationClip } from './animation-tracks';
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
export interface SceneItem {
  locked: boolean;
  id: number;
  name: string;
  model: RuntimeSpine;
  asset: SkeletonAsset;
  animationTracks: AnimationTracks;
  paused: boolean;
  speed: number;
  timelineTime: number;
  track: number;
  mix: number;
  selectedSlot: string | null;
  startAt: number;
}
export class SkeletonViewer {
  transformMode: 'move' | 'rotate' | 'scale' = 'move';
  app: PIXI.Application;
  world: PIXI.Container;
  axes: PIXI.Graphics;
  highlight: PIXI.Graphics;
  points: PIXI.Graphics;
  mount: HTMLElement;
  marker: HTMLElement;
  music = new MusicTransport();
  items: SceneItem[] = [];
  active?: SceneItem;
  private nextId = 1;
  onSelectionChange?: () => void;
  get paused() {
    return this.music.loaded ? this.music.paused : (this.active?.paused ?? true);
  }
  set paused(value: boolean) {
    if (this.music.loaded) {
      if (value) this.music.pause();
      else void this.music.play();
    } else if (this.active) this.active.paused = value;
  }
  get speed() {
    return this.music.loaded ? this.music.rate : (this.active?.speed ?? 1);
  }
  set speed(value: number) {
    if (this.music.loaded) this.music.setRate(value);
    else if (this.active) this.active.speed = value;
  }
  get timelineTime() {
    return this.music.loaded ? this.music.time : (this.active?.timelineTime ?? 0);
  }
  set timelineTime(value: number) {
    if (this.music.loaded) this.music.seek(value);
    else if (this.active) this.active.timelineTime = value;
  }
  get loop() {
    return this.trackSettings[this.track]?.loop ?? true;
  }
  set loop(value: boolean) {
    this.animationTracks?.configure(this.track, { loop: value });
  }
  get selectedSlot() {
    return this.active?.selectedSlot ?? null;
  }
  set selectedSlot(value: string | null) {
    if (this.active) this.active.selectedSlot = value;
  }
  get track() {
    return this.active?.track ?? 0;
  }
  set track(value: number) {
    if (this.active) this.active.track = value;
  }
  get mix() {
    return this.active?.mix ?? 0.2;
  }
  set mix(value: number) {
    if (this.active) this.active.mix = value;
  }
  zoom = 1;
  get model() {
    return this.active?.model as RuntimeSpine;
  }
  get asset() {
    return this.active?.asset as SkeletonAsset;
  }
  get animationTracks() {
    return this.active?.animationTracks;
  }
  set animationTracks(value: AnimationTracks | undefined) {
    if (this.active && value) this.active.animationTracks = value;
  }
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
    this.music.onChange = () => {
      if (this.music.loaded) this.syncMusic(true);
      this.onChange?.();
    };
  }
  setModel(asset: SkeletonAsset) {
    this.setScene([{ asset, name: asset.fileName }]);
  }
  private createItem(asset: SkeletonAsset, name: string): SceneItem {
    const model = createSpine(asset.spineData);
    try {
      model.autoUpdate = false;
      const skin = asset.spineData.defaultSkin || asset.spineData.skins[0];
      if (skin) {
        model.skeleton.setSkin(skin);
        model.skeleton.setSlotsToSetupPose();
      }
      model.update(0);
      const animationTracks = new AnimationTracks(model, asset.spineData.animations);
      const first =
        asset.spineData.animations.find((a) => a.name === 'walk') || asset.spineData.animations[0];
      if (first) animationTracks.play(0, first.name, 0);
      return {
        locked: false,
        id: this.nextId++,
        name,
        model,
        asset,
        animationTracks,
        paused: !first,
        speed: 1,
        timelineTime: 0,
        track: 0,
        mix: 0.2,
        selectedSlot: null,
        startAt: 0,
      };
    } catch (error) {
      model.destroy({ children: true, texture: false, baseTexture: false });
      throw error;
    }
  }
  private disposeItem(item: SceneItem) {
    item.model.debug = null;
    item.model.destroy({ children: true, texture: false, baseTexture: false });
    item.asset.dispose();
  }
  setScene(
    assets: { asset: SkeletonAsset; name: string }[],
    prepare?: (items: SceneItem[]) => void,
  ) {
    const next: SceneItem[] = [];
    try {
      for (const { asset, name } of assets) next.push(this.createItem(asset, name));
      prepare?.(next);
    } catch (error) {
      for (const item of next)
        item.model.destroy({ children: true, texture: false, baseTexture: false });
      for (const { asset } of assets) asset.dispose();
      throw error;
    }
    for (const item of this.items) this.disposeItem(item);
    this.items = next;
    for (const item of next) this.world.addChild(item.model);
    this.world.addChild(this.points, this.highlight);
    this.active = undefined;
    this.selectItem(next[0]?.id);
    if (!prepare) this.arrange();
    else this.fit();
  }
  addModel(asset: SkeletonAsset, name = asset.fileName) {
    let item: SceneItem;
    try {
      item = this.createItem(asset, name);
    } catch (error) {
      asset.dispose();
      throw error;
    }
    const edge = this.items.length
      ? Math.max(...this.items.map((i) => this.itemBounds(i).maxX))
      : 0;
    this.items.push(item);
    this.world.addChild(item.model);
    this.world.addChild(this.points, this.highlight);
    const bounds = this.itemBounds(item);
    item.model.position.set(edge + (this.items.length > 1 ? 80 : 0) - bounds.minX, -bounds.maxY);
    this.selectItem(item.id);
    this.fit();
  }
  selectItem(id?: number) {
    const next = this.items.find((item) => item.id === id);
    if (this.active) this.active.model.debug = null;
    this.active = next;
    this.lastHighlight = undefined;
    this.setDebug(this.debugFlags);
    if (this.music.loaded) this.syncMusic(true);
    this.drawHighlight();
    this.onSelectionChange?.();
    this.onChange?.();
  }
  removeSelected() {
    const item = this.active;
    if (!item) return;
    const index = this.items.indexOf(item);
    this.items.splice(index, 1);
    this.active = undefined;
    this.disposeItem(item);
    this.selectItem(this.items[Math.min(index, this.items.length - 1)]?.id);
    if (this.items.length) this.fit();
  }
  moveSelected(x: number, y: number) {
    if (!this.active || this.active.locked || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.model.position.set(x, y);
    this.drawHighlight();
    this.onChange?.();
  }
  arrange() {
    let x = 0;
    for (const item of this.items) {
      if (item.locked) {
        x = Math.max(x, this.itemBounds(item).maxX + 80);
        continue;
      }
      item.model.position.set(0, 0);
      const b = this.itemBounds(item);
      item.model.position.set(x - b.minX, -b.maxY);
      x += Math.max(40, b.maxX - b.minX) + 80;
    }
    this.fit();
    this.onChange?.();
  }
  transformSelected(scale: number, degrees: number) {
    if (!this.active || this.active.locked || !Number.isFinite(scale) || !Number.isFinite(degrees))
      return;
    this.model.scale.set(Math.max(0.01, Math.min(100, scale)));
    this.model.rotation = (degrees * Math.PI) / 180;
    this.drawHighlight();
    this.onChange?.();
  }
  reorderSelected(direction: -1 | 1) {
    if (!this.active || this.active.locked) return;
    const index = this.items.indexOf(this.active),
      next = index + direction;
    if (next < 0 || next >= this.items.length) return;
    [this.items[index], this.items[next]] = [this.items[next], this.items[index]];
    this.items.forEach((item, i) => this.world.setChildIndex(item.model, i + 1));
    this.onSelectionChange?.();
    this.drawHighlight();
    this.onChange?.();
  }
  setAllPaused(paused: boolean) {
    if (this.music.loaded) {
      this.paused = paused;
      return;
    }
    for (const item of this.items) item.paused = paused;
    this.onChange?.();
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
    if (!this.music.loaded) this.timelineTime = 0;
    this.animationTracks.restartAll();
    const entry = this.animationTracks.play(track, name, this.mix);
    this.track = track;
    if (this.music.loaded) this.syncMusic(true);
    else this.paused = false;
    this.drawHighlight();
    this.onChange?.();
    return entry;
  }
  setSequence(clips: AnimationClip[], track = this.track) {
    this.animationTracks?.setSequence(track, clips);
    this.track = track;
    if (this.music.loaded) this.syncMusic(true);
    else this.timelineTime = 0;
    this.drawHighlight();
    this.onChange?.();
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
    if (this.music.loaded) this.syncMusic(true);
    this.drawHighlight();
    this.onChange?.();
  }
  setTrackLoop(track: number, loop: boolean) {
    this.animationTracks?.configure(track, { loop });
    if (this.music.loaded) this.syncMusic(true);
    this.onChange?.();
  }
  setTrackSpeed(speed: number) {
    this.animationTracks?.configure(this.track, { speed });
    if (this.music.loaded) this.syncMusic(true);
    else this.animationTracks?.seekAll(this.timelineTime);
    this.onChange?.();
  }
  setTrackStart(start: number, track = this.track) {
    this.animationTracks?.configure(track, { start });
    if (this.music.loaded) this.syncMusic(true);
    else this.animationTracks?.seekAll(this.timelineTime);
    this.drawHighlight();
    this.onChange?.();
  }
  clearTrack(track = this.track) {
    this.animationTracks?.clear(track);
    this.drawHighlight();
    this.onChange?.();
  }
  restartAllTracks() {
    if (this.music.loaded) {
      this.seekAll(0);
      return;
    }
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
    this.animationTracks = new AnimationTracks(this.model, this.asset.spineData.animations);
    this.model.state.clearTracks();
    if (!this.music.loaded) this.timelineTime = 0;
    this.model.skeleton.setToSetupPose();
    this.model.update(0);
    this.paused = true;
    this.onChange?.();
  }
  seek(time: number) {
    if (this.music.loaded) {
      this.seekAll(time);
      return;
    }
    if (!this.current()) return;
    this.seekAll(time / (this.current()?.timeScale || 1));
  }
  seekAll(time: number) {
    if (this.music.loaded) {
      this.music.seek(time);
      this.syncMusic(true);
      this.onChange?.();
      return;
    }
    this.animationTracks?.seekAll(time);
    this.timelineTime = time;
    this.drawHighlight();
    this.onChange?.();
  }
  stepFrame(direction: -1 | 1, fps = 30) {
    if (this.music.loaded) {
      this.paused = true;
      this.seekAll(stepFrameTime(this.timelineTime, direction, fps, this.music.duration));
      return;
    }
    if (!this.animationTracks || !this.animationTracks.sequences.some((clips) => clips.length))
      return;
    this.paused = true;
    this.seekAll(stepFrameTime(this.timelineTime, direction, fps, this.animationTracks.duration));
  }
  selectSlot(name: string | null) {
    if (name !== null && !this.model?.skeleton.findSlot(name))
      throw Error(`Slot not found: ${name}`);
    this.selectedSlot = name;
    this.drawHighlight();
    this.onChange?.();
  }
  geometry(slot: RuntimeSlot, asset = this.asset) {
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
        asset.spineData.version.startsWith('4.') ? slot : slot.bone,
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
  private itemBounds(item: SceneItem) {
    const vertices: number[] = [];
    for (const slot of item.model.skeleton.slots) {
      const a = slot.getAttachment();
      if (
        a &&
        [0, 2].includes(a.type) &&
        slot.bone.active !== false &&
        slot.color.a > 0 &&
        (a.color?.a ?? 1) > 0
      )
        vertices.push(...this.geometry(slot, item.asset).vertices);
    }
    return this.bounds(transformVertices(vertices, item.model), item.model.x, item.model.y);
  }
  fit() {
    if (!this.items.length) return;
    const all = this.items
      .filter((item) => item.model.visible)
      .map((item) => this.itemBounds(item));
    if (!all.length) {
      this.drawHighlight();
      return;
    }
    const b = {
        minX: Math.min(...all.map((b) => b.minX)),
        minY: Math.min(...all.map((b) => b.minY)),
        maxX: Math.max(...all.map((b) => b.maxX)),
        maxY: Math.max(...all.map((b) => b.maxY)),
      },
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
    if (!this.model || this.active?.locked) return;
    this.model.skeleton[axis === 'x' ? 'scaleX' : 'scaleY'] = on ? -1 : 1;
    this.model.update(0);
    this.fit();
  }
  setTextureMode(pma: boolean, linear: boolean) {
    if (!this.asset) return;
    for (const item of this.items) {
      item.asset.source.pma = pma;
      item.asset.source.linear = linear;
    }
    for (const t of new Set(this.items.flatMap((item) => [...item.asset.textures]))) {
      t.alphaMode = pma ? PIXI.ALPHA_MODES.PMA : PIXI.ALPHA_MODES.UNPACK;
      t.scaleMode = linear ? PIXI.SCALE_MODES.LINEAR : PIXI.SCALE_MODES.NEAREST;
      t.update();
    }
  }
  drawHighlight() {
    const g = this.highlight;
    g.clear();
    g.position.set(0, 0);
    this.points.position.copyFrom(g.position);
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
    if (this.debugFlags.points && this.model?.visible) {
      this.points.lineStyle(1 / scale, 0x68e3c4);
      for (const slot of this.model.skeleton.slots) {
        if (slot.getAttachment()?.type === 5) {
          const local = this.geometry(slot);
          const p = transformPoint(local.x, local.y, this.model);
          this.points
            .drawCircle(p.x, p.y, 5 / scale)
            .moveTo(p.x - 8 / scale, p.y)
            .lineTo(p.x + 8 / scale, p.y)
            .moveTo(p.x, p.y - 8 / scale)
            .lineTo(p.x, p.y + 8 / scale);
        }
      }
    }
    if (this.active && this.model.visible) {
      const b = this.itemBounds(this.active);
      g.lineStyle(1 / scale, 0x68e3c4, 0.7).drawRect(
        b.minX - 6 / scale,
        b.minY - 6 / scale,
        b.maxX - b.minX + 12 / scale,
        b.maxY - b.minY + 12 / scale,
      );
    }
    if (!this.selectedSlot || !this.model?.visible) return;
    const slot = this.model.skeleton.findSlot(this.selectedSlot);
    if (!slot) return;
    const local = this.geometry(slot);
    const geo = {
        ...local,
        ...transformPoint(local.x, local.y, this.model),
        vertices: transformVertices(local.vertices, this.model),
        outline: transformVertices(local.outline, this.model),
      },
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
  setStartAt(value: number) {
    if (!this.active || !Number.isFinite(value) || value < 0) return;
    this.active.startAt = value;
    if (this.music.loaded) this.syncMusic(true);
    this.onChange?.();
  }
  syncMusic(force = false) {
    const time = this.music.time;
    for (const item of this.items) {
      const tracks = item.animationTracks;
      const local = animationTime(time, item.startAt, tracks.duration, tracks.looping);
      tracks.sample(local, force);
      item.timelineTime = local;
    }
    this.drawHighlight();
  }
  removeMusic() {
    for (const item of this.items) item.paused = true;
    this.music.clear();
  }
  tick(dt: number) {
    if (this.music.loaded) {
      this.syncMusic();
      this.onTick?.();
      return;
    }
    let changed = false;
    for (const item of this.items) {
      if (!item.paused && item.animationTracks.sequences.some((clips) => clips.length)) {
        const result = item.animationTracks.advance(item.timelineTime, dt * item.speed);
        item.timelineTime = result.time;
        if (result.complete) {
          item.paused = true;
          changed = true;
        }
      }
    }
    if (changed) this.onChange?.();
    this.drawHighlight();
    this.onTick?.();
  }
  attachGestures() {
    const canvas = this.app.view;
    let gesture:
      | {
          x: number;
          y: number;
          item?: SceneItem;
          modelX: number;
          modelY: number;
          scale: number;
          rotation: number;
          angle: number;
          radius: number;
          worldX: number;
          worldY: number;
        }
      | undefined;
    const point = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - this.world.x) / this.world.scale.x,
        y: (e.clientY - rect.top - this.world.y) / this.world.scale.y,
      };
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      const p = point(e);
      const hit =
        e.button === 0 && !e.shiftKey
          ? [...this.items].reverse().find((item) => {
              if (!item.model.visible) return false;
              const b = this.itemBounds(item);
              return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
            })
          : undefined;
      if (hit) this.selectItem(hit.id);
      if (hit?.locked) return;
      gesture = {
        x: e.clientX,
        y: e.clientY,
        item: hit,
        modelX: hit?.model.x ?? 0,
        modelY: hit?.model.y ?? 0,
        scale: hit?.model.scale.x ?? 1,
        rotation: hit?.model.rotation ?? 0,
        angle: hit ? Math.atan2(p.y - hit.model.y, p.x - hit.model.x) : 0,
        radius: hit ? Math.max(1, Math.hypot(p.x - hit.model.x, p.y - hit.model.y)) : 1,
        worldX: this.world.x,
        worldY: this.world.y,
      };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!gesture) return;
      const g = gesture,
        item = g.item;
      if (item && this.items.includes(item)) {
        const p = point(e);
        if (this.transformMode === 'move')
          item.model.position.set(
            g.modelX + (e.clientX - g.x) / this.world.scale.x,
            g.modelY + (e.clientY - g.y) / this.world.scale.y,
          );
        else if (this.transformMode === 'rotate')
          item.model.rotation =
            g.rotation + Math.atan2(p.y - item.model.y, p.x - item.model.x) - g.angle;
        else
          item.model.scale.set(
            Math.max(
              0.01,
              Math.min(
                100,
                (g.scale * Math.hypot(p.x - item.model.x, p.y - item.model.y)) / g.radius,
              ),
            ),
          );
        this.onChange?.();
      } else {
        this.world.position.set(g.worldX + e.clientX - g.x, g.worldY + e.clientY - g.y);
      }
      this.drawHighlight();
    });
    const finish = () => {
      gesture = undefined;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('lostpointercapture', finish);
    canvas.addEventListener('pointercancel', () => {
      if (gesture?.item) {
        gesture.item.model.position.set(gesture.modelX, gesture.modelY);
        gesture.item.model.scale.set(gesture.scale);
        gesture.item.model.rotation = gesture.rotation;
        this.drawHighlight();
        this.onChange?.();
      }
      finish();
    });
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
      music: {
        name: this.music.name,
        duration: this.music.duration,
        time: this.music.time,
        paused: this.music.paused,
        rate: this.music.rate,
        loop: this.music.loop,
        volume: this.music.volume,
        muted: this.music.muted,
      },
      scene: this.items.map((item) => ({
        id: item.id,
        name: item.name,
        selected: item === this.active,
        x: item.model.x,
        y: item.model.y,
        paused: this.music.loaded ? this.music.paused : item.paused,
        startAt: item.startAt,
        time: item.timelineTime,
        animation: item.model.state.getCurrent(item.track)?.animation.name ?? null,
      })),
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
      sequences: this.animationTracks?.sequences ?? [],
      sequenceDuration: this.animationTracks?.duration ?? 0,
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
