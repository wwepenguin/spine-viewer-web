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
      image.onerror = () => reject(Error(`無法解碼貼圖：${file.name}`));
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
  if (!skeleton) throw Error('請選取 JSON 或 SKEL 骨架檔。');
  if (!atlasFile) throw Error('請選取與此骨架對應的 .atlas 圖集檔。');
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
            value ? resolve(value) : reject(Error('圖集載入失敗。請檢查頁面貼圖是否齊全。')),
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
        throw Error('JSON 格式無法解析，請確認是 Spine 匯出的骨架資料。');
      }
      const version = (parsed as { skeleton?: { spine?: string } })?.skeleton?.spine;
      if (!version || !/^3\.[78]\.|^4\.[01]\./.test(version))
        throw Error(
          `此骨架版本 ${version || '不明'} 不在 pixi-spine 3.1.2 的支援範圍內。請使用 Spine 3.8 素材。`,
        );
    } else {
      parsed = new Uint8Array(raw);
    }
    let spineData;
    try {
      spineData = parseSkeleton(atlas, parsed, binary);
    } catch (err) {
      throw Error(
        `骨架解析失敗：${err instanceof Error ? err.message : String(err)}\n請確認骨架版本與圖集匹配（此工具主要驗證 Spine 3.8）。`,
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
      if (!response.ok) throw Error(`範例載入失敗：${name} (${response.status})`);
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
