import { PIXI, TextureAtlas, parseSkeleton } from './runtime';
import type { AssetEntry, AssetCatalog, LocalFile, LoadOptions, SkeletonAsset } from './types';
/* Browser-local asset loading. No user file is sent over the network. */

import { catalog, resolvePage } from './catalog';
export { catalog, matchAtlas, resolvePage } from './catalog';
const base = (path: string) => path.replace(/\\/g, '/').split('/').pop() || '';
async function imageTexture(file: File, pma: boolean, linear: boolean, signal: AbortSignal) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(Error(`Unable to decode texture: ${file.name}`));
      image.src = url;
    });
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const texture = new PIXI.BaseTexture(image, {
      alphaMode: pma ? PIXI.ALPHA_MODES.PMA : PIXI.ALPHA_MODES.UNPACK,
      scaleMode: linear ? PIXI.SCALE_MODES.LINEAR : PIXI.SCALE_MODES.NEAREST,
    });
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function load(
  data: AssetCatalog,
  skeleton: AssetEntry | undefined,
  atlasFile: AssetEntry | null | undefined,
  { pma = false, linear = true, signal = new AbortController().signal }: LoadOptions = {},
): Promise<SkeletonAsset> {
  if (!skeleton) throw Error('Select a JSON or SKEL skeleton file.');
  if (!atlasFile) throw Error('Select the .atlas file matching this skeleton.');
  let atlas: TextureAtlas;
  const textures = new Set<PIXI.BaseTexture>();
  try {
    const [raw, atlasText] = await Promise.all([
      skeleton.file.arrayBuffer(),
      atlasFile.file.text(),
    ]);
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    atlas = await new Promise<TextureAtlas>((resolve, reject) => {
      try {
        new TextureAtlas(
          atlasText,
          (page, done) => {
            Promise.resolve()
              .then(() => resolvePage(data, atlasFile.path, page))
              .then((file) => imageTexture(file, pma, linear, signal))
              .then((texture) => {
                textures.add(texture);
                done(texture);
              })
              .catch((err) => {
                reject(err);
                (done as (texture: PIXI.BaseTexture | null) => void)(null);
              });
          },
          (value) =>
            value
              ? resolve(value)
              : reject(Error('Atlas loading failed. Check that all page textures are present.')),
        );
      } catch (err) {
        reject(err);
      }
    });
    // Respect the chosen mode even when the atlas declares pma.
    for (const texture of textures) {
      texture.alphaMode = pma ? PIXI.ALPHA_MODES.PMA : PIXI.ALPHA_MODES.UNPACK;
      texture.scaleMode = linear ? PIXI.SCALE_MODES.LINEAR : PIXI.SCALE_MODES.NEAREST;
      texture.update();
    }
    let parsed: unknown;
    const binary = !/\.json(\.(txt|bytes))?$/i.test(skeleton.path);
    if (/\.json(\.(txt|bytes))?$/i.test(skeleton.path)) {
      try {
        parsed = JSON.parse(new TextDecoder().decode(raw).replace(/^\uFEFF/, ''));
      } catch {
        throw Error('Invalid JSON. Check that this is skeleton data exported from Spine.');
      }
      const version = (parsed as { skeleton?: { spine?: string } })?.skeleton?.spine;
      if (!version || !/^3\.[78]\.|^4\.[01]\./.test(version))
        throw Error(
          `Skeleton version ${version || 'unknown'} is not supported by pixi-spine 3.1.2. Use Spine 3.8 assets.`,
        );
    } else {
      parsed = new Uint8Array(raw);
    }
    let spineData;
    try {
      spineData = parseSkeleton(atlas, parsed, binary);
    } catch (err) {
      throw Error(
        `Skeleton parsing failed: ${err instanceof Error ? err.message : String(err)}\nCheck that the skeleton version and atlas match. This viewer is primarily tested with Spine 3.8.`,
      );
    }
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return {
      spineData,
      atlas,
      textures,
      fileName: base(skeleton.path),
      dispose() {
        for (const texture of textures) texture.destroy();
      },
    };
  } catch (err) {
    for (const texture of textures) texture.destroy();
    throw err;
  }
}
export async function sample(): Promise<AssetCatalog> {
  const files = await Promise.all(
    ['spineboy.json', 'spineboy.atlas', 'spineboy.webp'].map(async (name) => {
      const response = await fetch(`${import.meta.env.BASE_URL}sample/${name}`);
      if (!response.ok) throw Error(`Sample loading failed: ${name} (${response.status})`);
      return new File([await response.blob()], name);
    }),
  );
  return catalog(files);
}
export async function droppedFiles(items: DataTransferItemList): Promise<LocalFile[]> {
  const results: LocalFile[] = [],
    sources = Array.from(items, (item) => ({
      entry: item.webkitGetAsEntry?.(),
      file: item.getAsFile(),
    }));
  const walk = async (entry: FileSystemEntry, path = ''): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej),
      );
      Object.defineProperty(file, 'relativePath', { value: path + file.name });
      results.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, path + entry.name + '/');
      } while (batch.length);
    }
  };
  for (const { entry, file } of sources) {
    if (entry) await walk(entry);
    else if (file) results.push(file);
  }
  return results;
}
