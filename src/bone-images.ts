import { PIXI, type RuntimeSpine } from './runtime';
import { ResourcePool } from './resource-pool';
import { syncSlotPlaceholders, syncSlotTransform } from './slot-overlays';
import {
  boneImageSettings,
  boneImageVertices,
  MAX_BONE_IMAGES,
  type BoneImageState,
} from './bone-image-state';

const textures = new ResourcePool<File, PIXI.Texture>((texture) => texture.destroy(true));
export interface PreparedBoneImage {
  state: BoneImageState;
  texture: PIXI.Texture;
  release(): void;
}
export async function prepareBoneImage(state: BoneImageState): Promise<PreparedBoneImage> {
  const settings = boneImageSettings(state);
  const file = state.file;
  if (!file || !/\.(png|webp|jpe?g)$/i.test(file.name) || file.size > 32 * 1024 * 1024)
    throw Error('Choose a PNG, WebP or JPEG image up to 32 MB.');
  const lease = await textures.acquire(file, async () => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(Error(`Unable to decode image: ${file.name}`));
        image.src = url;
      });
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        Math.max(image.naturalWidth, image.naturalHeight) > 8192
      )
        throw Error('Image dimensions must be between 1 and 8192 pixels.');
      return new PIXI.Texture(
        new PIXI.BaseTexture(image, {
          alphaMode: PIXI.ALPHA_MODES.UNPACK,
          scaleMode: PIXI.SCALE_MODES.LINEAR,
        }),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  return { state: { ...settings, file }, texture: lease.value, release: lease.release };
}

/** Custom images follow either a bone above the skeleton, or a slot in its draw order. */
export class BoneImageLayer {
  readonly images: (PreparedBoneImage & { root: PIXI.Container; sprite: PIXI.Sprite })[] = [];
  constructor(private readonly model: RuntimeSpine) {}
  private mount(state: BoneImageState) {
    if (state.slot) {
      const index = this.model.skeleton.findSlotIndex(state.slot);
      if (index < 0) throw Error(`Slot not found: ${state.slot}`);
      return this.model.slotContainers[index];
    }
    if (!this.model.skeleton.findBone(state.bone)) throw Error(`Bone not found: ${state.bone}`);
    return this.model;
  }
  private create(image: PreparedBoneImage) {
    const parent = this.mount(image.state);
    if (!parent) throw Error(`Bone not found: ${image.state.bone}`);
    const root = new PIXI.Container(),
      sprite = new PIXI.Sprite(image.texture);
    sprite.anchor.set(0.5);
    root.addChild(sprite);
    parent.addChild(root);
    return { ...image, root, sprite };
  }
  attach(image: PreparedBoneImage) {
    if (this.images.length >= MAX_BONE_IMAGES)
      throw Error(`A skeleton supports up to ${MAX_BONE_IMAGES} bone images.`);
    this.images.push(this.create(image));
    this.sync();
  }
  replace(index: number, image: PreparedBoneImage) {
    if (!this.images[index]) throw Error('Image no longer exists.');
    const replacement = this.create(image);
    this.remove(index);
    this.images.splice(index, 0, replacement);
    this.sync();
  }
  update(index: number, patch: Partial<Omit<BoneImageState, 'file'>>) {
    const image = this.images[index];
    if (!image) return;
    const state = { ...boneImageSettings({ ...image.state, ...patch }), file: image.state.file };
    const parent = this.mount(state);
    image.state = state;
    if (image.root.parent !== parent) parent.addChild(image.root);
    this.sync();
  }
  remove(index: number) {
    if (index < 0 || index >= this.images.length) return;
    const [image] = this.images.splice(index, 1);
    image.root.destroy({ children: true, texture: false, baseTexture: false });
    image.release();
    this.sync();
  }
  dispose() {
    while (this.images.length) this.remove(this.images.length - 1);
  }
  sync() {
    const hidden = new Set<string>();
    for (const image of this.images) {
      const bone = image.state.slot
        ? this.model.skeleton.findSlot(image.state.slot)?.bone
        : this.model.skeleton.findBone(image.state.bone);
      image.root.visible = !!bone && bone.active !== false;
      if (!bone) continue;
      if (image.state.slot) {
        syncSlotTransform(this.model, image.root, image.state.slot);
        if (image.state.hidePlaceholder !== false) hidden.add(image.state.slot);
      } else image.root.transform.setFromMatrix(bone.matrix);
      image.sprite.position.set(image.state.x, image.state.y);
      image.sprite.scale.set(image.state.scale, -image.state.scale);
      image.sprite.rotation = (image.state.rotation * Math.PI) / 180;
    }
    syncSlotPlaceholders(this.model, this, hidden);
  }
  isSlotHidden(name: string) {
    return this.images.some(
      (image) => image.state.slot === name && image.state.hidePlaceholder !== false,
    );
  }
  vertices() {
    return this.images.flatMap((image) => {
      const slot = image.state.slot ? this.model.skeleton.findSlot(image.state.slot) : null;
      const bone = slot?.bone ?? this.model.skeleton.findBone(image.state.bone);
      return bone && bone.active !== false && (!slot || (slot.getAttachment() && slot.color.a > 0))
        ? boneImageVertices(bone.matrix, image.texture.width, image.texture.height, image.state)
        : [];
    });
  }
}
