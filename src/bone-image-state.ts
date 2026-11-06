export const MAX_BONE_IMAGES = 32;
export interface BoneImageSettings {
  bone: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}
export interface BoneImageState extends BoneImageSettings {
  file: File;
}
export function boneImageSettings(value: BoneImageSettings): BoneImageSettings {
  if (!value || typeof value.bone !== 'string' || !value.bone || value.bone.length > 10000)
    throw Error('Invalid image bone.');
  const number = (value: number, min: number, max: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      throw Error('Invalid bone image transform.');
    return value;
  };
  return {
    bone: value.bone,
    x: number(value.x, -1e7, 1e7),
    y: number(value.y, -1e7, 1e7),
    scale: number(value.scale, 0.001, 1000),
    rotation: number(value.rotation, -36000, 36000),
  };
}
/** Centered image corners in skeleton space; image Y is flipped to match Spine region sprites. */
export function boneImageVertices(
  matrix: { a: number; b: number; c: number; d: number; tx: number; ty: number },
  width: number,
  height: number,
  image: BoneImageSettings,
) {
  const angle = (image.rotation * Math.PI) / 180;
  const cos = Math.cos(angle) * image.scale,
    sin = Math.sin(angle) * image.scale;
  const points = [
    -width / 2,
    -height / 2,
    width / 2,
    -height / 2,
    width / 2,
    height / 2,
    -width / 2,
    height / 2,
  ];
  const result: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i],
      y = points[i + 1];
    const localX = image.x + x * cos + y * sin;
    const localY = image.y + x * sin - y * cos;
    result.push(
      matrix.a * localX + matrix.c * localY + matrix.tx,
      matrix.b * localX + matrix.d * localY + matrix.ty,
    );
  }
  return result;
}
