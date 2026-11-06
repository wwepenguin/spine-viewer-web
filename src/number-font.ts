import { PIXI } from './runtime';
import { ResourcePool } from './resource-pool';
import { prepareBoneImage, type PreparedBoneImage } from './bone-images';
import { bitmapFontPages, matchFontPage, type NumberFontAsset } from './bone-number-state';

export interface NumberFontResource {
  name: string;
  pages: PreparedBoneImage[];
  files: File[];
}
const ids = new WeakMap<File, number>();
let nextId = 0,
  nextFont = 0;
const id = (file: File) => {
  if (!ids.has(file)) ids.set(file, nextId++);
  return ids.get(file)!;
};
const fonts = new ResourcePool<string, NumberFontResource>((font) => {
  PIXI.BitmapFont.uninstall(font.name);
  font.pages.forEach((page) => page.release());
});
export async function acquireNumberFont(asset: NumberFontAsset) {
  if (
    !asset ||
    !asset.file ||
    !/\.fnt$/i.test(asset.file.name) ||
    asset.file.size > 2 * 1024 * 1024 ||
    !Array.isArray(asset.pages) ||
    asset.pages.length > 16
  )
    throw Error('Choose one .fnt and all its page images.');
  const source = await asset.file.text(),
    names = bitmapFontPages(source);
  const files = names.map((name) => matchFontPage(name, asset.pages));
  return fonts.acquire([id(asset.file), ...files.map(id)].join(':'), async () => {
    const pages: PreparedBoneImage[] = [],
      textures: Record<string, PIXI.Texture> = {};
    const name = `viewer_number_font_${nextFont++}`;
    try {
      for (let i = 0; i < files.length; i++) {
        const page = await prepareBoneImage({
          file: files[i],
          bone: 'font-page',
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
        });
        pages.push(page);
        textures[names[i]] = page.texture;
      }
      if (!/\bface\s*=\s*(["']).*?\1/.test(source)) throw Error('Invalid bitmap font face.');
      const renamed = source.replace(/\bface\s*=\s*(["']).*?\1/, `face="${name}"`);
      const font = PIXI.BitmapFont.install(renamed, textures, false);
      if (!Number.isFinite(font.size) || font.size <= 0 || !Object.keys(font.chars).length)
        throw Error('Bitmap font has no usable glyphs.');
      return { name, pages, files };
    } catch (error) {
      if (PIXI.BitmapFont.available[name]) PIXI.BitmapFont.uninstall(name);
      pages.forEach((page) => page.release());
      throw error;
    }
  });
}
/** Keep Unicode code points supported by the selected font; spaces retain BMFont spacing. */
export function filterNumberGlyphs(text: string, fontName?: string) {
  if (!fontName) return { text, removed: [] as string[] };
  const font = PIXI.BitmapFont.available[fontName];
  if (!font) throw Error('Bitmap font is no longer available.');
  const supported = (c: string) => c === ' ' || !!font.chars[c.codePointAt(0)!];
  const kept = [...text].filter(supported).join('');
  return {
    text: kept.trim() ? kept : '',
    removed: [...new Set([...text].filter((c) => !supported(c)))],
  };
}
export function checkNumberGlyphs(text: string, fontName?: string) {
  const { removed } = filterNumberGlyphs(text, fontName);
  if (removed.length) throw Error(`Bitmap font is missing characters: ${removed.join(' ')}`);
}
