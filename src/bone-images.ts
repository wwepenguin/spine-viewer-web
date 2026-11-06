import { PIXI, type RuntimeSpine } from './runtime';
import { ResourcePool } from './resource-pool';
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

/** Independent overlays above the skeleton's slots, inheriting the full animated bone matrix. */
export class BoneImageLayer {
  readonly images: (PreparedBoneImage & { root: PIXI.Container; sprite: PIXI.Sprite })[] = [];
  constructor(private readonly model: RuntimeSpine) {}
  attach(image: PreparedBoneImage) {
    if (this.images.length >= MAX_BONE_IMAGES)
      throw Error(`A skeleton supports up to ${MAX_BONE_IMAGES} bone images.`);
    if (!this.model.skeleton.findBone(image.state.bone))
      throw Error(`Bone not found: ${image.state.bone}`);
    const root = new PIXI.Container(),
      sprite = new PIXI.Sprite(image.texture);
    sprite.anchor.set(0.5);
    root.addChild(sprite);
    this.model.addChild(root);
    this.images.push({ ...image, root, sprite });
    this.sync();
  }
  update(index: number, patch: Partial<Omit<BoneImageState, 'file'>>) {
    const image = this.images[index];
    if (!image) return;
    const state = { ...boneImageSettings({ ...image.state, ...patch }), file: image.state.file };
    if (!this.model.skeleton.findBone(state.bone)) throw Error(`Bone not found: ${state.bone}`);
    image.state = state;
    this.sync();
  }
  remove(index: number) {
    if (index < 0 || index >= this.images.length) return;
    const [image] = this.images.splice(index, 1);
    image.root.destroy({ children: true, texture: false, baseTexture: false });
    image.release();
  }
  dispose() {
    while (this.images.length) this.remove(this.images.length - 1);
  }
  sync() {
    for (const image of this.images) {
      const bone = this.model.skeleton.findBone(image.state.bone);
      image.root.visible = !!bone && bone.active !== false;
      if (!bone) continue;
      image.root.transform.setFromMatrix(bone.matrix);
      image.sprite.position.set(image.state.x, image.state.y);
      image.sprite.scale.set(image.state.scale, -image.state.scale);
      image.sprite.rotation = (image.state.rotation * Math.PI) / 180;
    }
  }
  vertices() {
    return this.images.flatMap((image) => {
      const bone = this.model.skeleton.findBone(image.state.bone);
      return bone && bone.active !== false
        ? boneImageVertices(bone.matrix, image.texture.width, image.texture.height, image.state)
        : [];
    });
  }
}
