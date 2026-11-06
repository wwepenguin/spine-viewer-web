import { PIXI, type RuntimeSpine } from './runtime';
import { boneImageVertices } from './bone-image-state';
import { boneNumberSettings, MAX_BONE_NUMBERS, type BoneNumberState } from './bone-number-state';
import { acquireNumberFont, checkNumberGlyphs, type NumberFontResource } from './number-font';

export interface PreparedBoneNumber {
  state: BoneNumberState;
  font?: NumberFontResource;
  release(): void;
}
export async function prepareBoneNumber(state: BoneNumberState): Promise<PreparedBoneNumber> {
  const settings = boneNumberSettings(state);
  const lease = state.font ? await acquireNumberFont(state.font) : undefined;
  try {
    checkNumberGlyphs(settings.text, lease?.value.name);
    return {
      state: {
        ...settings,
        ...(state.font ? { font: { file: state.font.file, pages: lease!.value.files } } : {}),
      },
      font: lease?.value,
      release: () => lease?.release(),
    };
  } catch (error) {
    lease?.release();
    throw error;
  }
}
type NumberEntry = PreparedBoneNumber & {
  root: PIXI.Container;
  display: PIXI.Text | PIXI.BitmapText;
  width: number;
  height: number;
  fit: number;
};
export class BoneNumberLayer {
  readonly numbers: NumberEntry[] = [];
  private hidden = new Map<PIXI.DisplayObject, boolean>();
  constructor(private readonly model: RuntimeSpine) {}
  private mount(state: BoneNumberState) {
    if (state.mount === 'bone') {
      if (!this.model.skeleton.findBone(state.target))
        throw Error(`Bone not found: ${state.target}`);
      return this.model;
    }
    const index = this.model.skeleton.findSlotIndex(state.target);
    if (index < 0) throw Error(`Slot not found: ${state.target}`);
    return this.model.slotContainers[index];
  }
  private create(prepared: PreparedBoneNumber): NumberEntry {
    const parent = this.mount(prepared.state),
      root = new PIXI.Container();
    checkNumberGlyphs(prepared.state.text, prepared.font?.name);
    const display = prepared.font
      ? new PIXI.BitmapText(prepared.state.text, {
          fontName: prepared.font.name,
          fontSize: prepared.state.fontSize,
          align: 'center',
        })
      : new PIXI.Text(prepared.state.text, {
          fontFamily: 'Arial',
          fontSize: prepared.state.fontSize,
          fill: prepared.state.color,
        });
    root.addChild(display);
    const entry = { ...prepared, root, display, width: 0, height: 0, fit: 1 };
    try {
      this.style(entry);
    } catch (error) {
      if (display instanceof PIXI.Text) display.destroy({ texture: true, baseTexture: true });
      else display.destroy({ children: true, texture: false, baseTexture: false });
      root.destroy();
      throw error;
    }
    parent.addChild(root);
    return entry;
  }
  private style(entry: NumberEntry) {
    const { state, display } = entry;
    display.text = state.text;
    if (display instanceof PIXI.BitmapText) {
      display.fontSize = state.fontSize;
      display.tint = Number.parseInt(state.color.slice(1), 16);
      display.letterSpacing = state.letterSpacing;
    } else {
      display.style.fontSize = state.fontSize;
      display.style.fill = state.color;
      display.style.letterSpacing = state.letterSpacing;
    }
    display.pivot.set(0);
    display.scale.set(1);
    display.rotation = 0;
    const bounds = display.getLocalBounds(new PIXI.Rectangle());
    entry.width = bounds.width;
    entry.height = bounds.height;
    entry.fit =
      state.maxWidth > 0 && bounds.width > state.maxWidth ? state.maxWidth / bounds.width : 1;
    display.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    display.position.set(state.x, state.y);
    display.scale.set(state.scale * entry.fit, -state.scale * entry.fit);
    display.rotation = (state.rotation * Math.PI) / 180;
  }
  attach(prepared: PreparedBoneNumber) {
    if (this.numbers.length >= MAX_BONE_NUMBERS)
      throw Error(`A skeleton supports up to ${MAX_BONE_NUMBERS} numbers.`);
    this.numbers.push(this.create(prepared));
    this.sync();
  }
  replace(index: number, prepared: PreparedBoneNumber) {
    if (!this.numbers[index]) throw Error('Number no longer exists.');
    const replacement = this.create(prepared);
    this.remove(index);
    this.numbers.splice(index, 0, replacement);
    this.sync();
  }
  update(index: number, patch: Partial<Omit<BoneNumberState, 'font'>>) {
    const entry = this.numbers[index];
    if (!entry) return;
    const state = {
      ...boneNumberSettings({ ...entry.state, ...patch }),
      ...(entry.state.font ? { font: entry.state.font } : {}),
    };
    const parent = this.mount(state);
    checkNumberGlyphs(state.text, entry.font?.name);
    entry.state = state;
    if (entry.root.parent !== parent) parent.addChild(entry.root);
    this.style(entry);
    this.sync();
  }
  remove(index: number) {
    if (index < 0 || index >= this.numbers.length) return;
    const [entry] = this.numbers.splice(index, 1);
    if (entry.display instanceof PIXI.Text)
      entry.display.destroy({ texture: true, baseTexture: true });
    else entry.display.destroy({ children: true, texture: false, baseTexture: false });
    entry.root.destroy();
    entry.release();
    this.sync();
  }
  dispose() {
    while (this.numbers.length) this.remove(this.numbers.length - 1);
  }
  isSlotHidden(name: string) {
    return this.numbers.some(
      (entry) =>
        entry.state.mount === 'slot' && entry.state.target === name && entry.state.hidePlaceholder,
    );
  }
  sync() {
    const hidden = new Set<PIXI.DisplayObject>();
    for (const entry of this.numbers) {
      const bone =
        entry.state.mount === 'bone'
          ? this.model.skeleton.findBone(entry.state.target)
          : this.model.skeleton.findSlot(entry.state.target)?.bone;
      entry.root.visible = !!bone && bone.active !== false;
      if (bone && entry.state.mount === 'bone') entry.root.transform.setFromMatrix(bone.matrix);
      else entry.root.transform.setFromMatrix(PIXI.Matrix.IDENTITY);
      // Animation or skin changes may append a new sprite inside the same slot.
      if (entry.state.mount === 'slot' && entry.root.parent) {
        const parent = entry.root.parent;
        parent.setChildIndex(entry.root, parent.children.length - 1);
      }
      if (entry.state.mount === 'slot' && entry.state.hidePlaceholder) {
        const slot = this.model.skeleton.findSlot(entry.state.target);
        for (const display of [slot?.currentSprite, slot?.currentMesh])
          if (display) hidden.add(display);
      }
    }
    for (const [display, renderable] of this.hidden)
      if (!hidden.has(display)) {
        display.renderable = renderable;
        this.hidden.delete(display);
      }
    for (const display of hidden) {
      if (!this.hidden.has(display)) this.hidden.set(display, display.renderable);
      display.renderable = false;
    }
  }
  vertices() {
    return this.numbers.flatMap((entry) => {
      const slot =
        entry.state.mount === 'slot' ? this.model.skeleton.findSlot(entry.state.target) : null;
      const bone = slot?.bone ?? this.model.skeleton.findBone(entry.state.target);
      if (!bone || bone.active === false || (slot && (!slot.getAttachment() || slot.color.a <= 0)))
        return [];
      return boneImageVertices(bone.matrix, entry.width, entry.height, {
        ...entry.state,
        bone: bone.data.name,
        scale: entry.state.scale * entry.fit,
      });
    });
  }
}
