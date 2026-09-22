/** Missing cross-version members in pixi-spine 3.1.2's public declarations.
 * Keep compatibility assertions at this boundary; application code uses these contracts.
 */
import * as PIXI from 'pixi.js';
import {
  Spine,
  SpineParser,
  type IAttachment,
  type IBone,
  type ISlot,
  type ISkin,
  type ISkeleton,
  type IAnimationState,
  type ITrackEntry,
  type ISkeletonData,
  type TextureAtlas,
} from 'pixi-spine';
export { PIXI };
export { TextureAtlas, SpineDebugRenderer } from 'pixi-spine';
export interface RuntimeAttachment extends IAttachment {
  color?: { a: number };
  triangles?: number[];
  worldVerticesLength?: number;
  hullLength?: number;
  computeWorldVertices(
    ...args:
      | [unknown, Float32Array, number, number]
      | [unknown, number, number, Float32Array, number, number]
  ): void;
  computeWorldPosition(bone: IBone, point: PIXI.Point): PIXI.Point;
}
export interface RuntimeSlot extends Omit<ISlot, 'getAttachment'> {
  bone: IBone & { worldX: number; worldY: number };
  getAttachment(): RuntimeAttachment | null;
}
export interface RuntimeSkeleton extends Omit<ISkeleton, 'slots' | 'findSlot'> {
  slots: RuntimeSlot[];
  color: { a: number };
  scaleX: number;
  scaleY: number;
  setSkin(skin: ISkin): void;
  findSlot(name: string): RuntimeSlot | null;
}
export interface RuntimeTrack extends ITrackEntry {
  mixBlend: number;
  animation: { name: string; duration: number };
}
export interface RuntimeState extends Omit<IAnimationState, 'tracks' | 'setAnimation'> {
  tracks: Array<RuntimeTrack | null>;
  getCurrent(track: number): RuntimeTrack | null;
  setAnimation(track: number, name: string, loop: boolean): RuntimeTrack;
}
export type RuntimeSpine = PIXI.Container &
  Omit<Spine, 'skeleton' | 'state' | 'debug'> & {
    skeleton: RuntimeSkeleton;
    state: RuntimeState;
    debug: Spine['debug'] | null;
  };
export function createSpine(data: ISkeletonData): RuntimeSpine {
  return new Spine(data) as unknown as RuntimeSpine;
}
interface CompatibleParser {
  readSkeletonData(atlas: TextureAtlas, data: unknown): ISkeletonData;
}
export function parseSkeleton(atlas: TextureAtlas, data: unknown, binary: boolean): ISkeletonData {
  const factory = new SpineParser();
  const parser = (binary
    ? factory.createBinaryParser()
    : factory.createJsonParser()) as unknown as CompatibleParser;
  return parser.readSkeletonData(atlas, data);
}
