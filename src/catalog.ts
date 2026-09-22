import type { AssetEntry, AssetCatalog, LocalFile } from './types';
const normalize = (path: string) => {
  const parts = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
};
const base = (p: string) => normalize(p).split('/').pop() || '';
const stem = (p: string) =>
  base(p)
    .replace(/\.(json|skel)(\.(txt|bytes))?$/i, '')
    .replace(/-(pro|ess)$/i, '');
export function catalog(files: Iterable<LocalFile> | ArrayLike<LocalFile>): AssetCatalog {
  const entries = Array.from(files, (f) => ({
    file: f,
    path: normalize(f.webkitRelativePath || f.relativePath || f.name),
  }));
  return {
    entries,
    skeletons: entries.filter((e) => /\.(json|skel)(\.(txt|bytes))?$/i.test(e.path)),
    atlases: entries.filter((e) => /\.atlas(\.txt)?$/i.test(e.path)),
  };
}
export function resolvePage(data: AssetCatalog, atlasPath: string, page: string) {
  const path = normalize(atlasPath.slice(0, atlasPath.lastIndexOf('/') + 1) + page);
  let matches = data.entries.filter((e) => e.path === path);
  if (!matches.length) matches = data.entries.filter((e) => base(e.path) === base(page));
  if (matches.length > 1) throw Error(`貼圖名稱重複：${page}。請用「開啟資料夾」保留目錄結構。`);
  if (!matches.length)
    throw Error(`缺少貼圖：${page}\n請一起選取 atlas 引用的所有 PNG／WebP 貼圖。`);
  return matches[0].file;
}
export function matchAtlas(data: AssetCatalog, skeleton: AssetEntry) {
  const dir = skeleton.path.slice(0, skeleton.path.lastIndexOf('/') + 1);
  return (
    data.atlases.find(
      (e) =>
        e.path.startsWith(dir) &&
        base(e.path).replace(/\.atlas(\.txt)?$/i, '') === stem(skeleton.path),
    ) || (data.atlases.length === 1 ? data.atlases[0] : null)
  );
}
