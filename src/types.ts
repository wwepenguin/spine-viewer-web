import type { BaseTexture } from 'pixi.js';
import type { ISkeletonData, TextureAtlas } from 'pixi-spine';
export type LocalFile = File & { readonly relativePath?: string };
export interface AssetEntry {
  file: LocalFile;
  path: string;
}
export interface AssetCatalog {
  entries: AssetEntry[];
  skeletons: AssetEntry[];
  atlases: AssetEntry[];
}
export interface LoadOptions {
  pma?: boolean;
  linear?: boolean;
  signal?: AbortSignal;
}
export interface SkeletonAsset {
  spineData: ISkeletonData;
  atlas: TextureAtlas;
  textures: Set<BaseTexture>;
  fileName: string;
  dispose(): void;
}
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface Highlight extends Bounds {
  slot: string;
  vertexCount: number;
}
export const DEBUG_KEYS = [
  'drawBones',
  'drawRegionAttachments',
  'drawBoundingBoxes',
  'drawMeshHull',
  'drawMeshTriangles',
  'drawPaths',
  'drawClipping',
] as const;
export type DebugFlags = Partial<Record<(typeof DEBUG_KEYS)[number] | 'points', boolean>>;
export interface WebTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: object;
  execute(input: Record<string, unknown>): unknown;
}
