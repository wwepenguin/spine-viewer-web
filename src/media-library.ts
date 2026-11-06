import { bitmapFontPages, type NumberFontAsset } from './bone-number-state';
import type { BoneImageState } from './bone-image-state';
import type { BoneNumberState } from './bone-number-state';

export const MAX_MEDIA_ASSETS = 256;
export interface MediaLibrary {
  images: File[];
  fonts: NumberFontAsset[];
}
export const emptyMediaLibrary = (): MediaLibrary => ({ images: [], fonts: [] });
const path = (file: File) => file.webkitRelativePath || file.name;
const normalize = (value: string) => {
  const parts: string[] = [];
  for (const part of value.replace(/\\/g, '/').split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/').toLowerCase();
};
export function resolveMediaPage(font: File, page: string, files: readonly File[]) {
  const directory = path(font).replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const full = normalize(directory + '/' + page);
  const exact = [...new Set(files.filter((file) => normalize(path(file)) === full))];
  if (exact.length === 1) return exact[0];
  const base = normalize(page).split('/').at(-1);
  const matches = [...new Set(files.filter((file) => file.name.toLowerCase() === base))];
  if (matches.length !== 1)
    throw Error(`${path(font)}: choose exactly one page image for ${page}.`);
  return matches[0];
}
export async function planMediaImport(
  files: readonly File[],
  current: MediaLibrary,
): Promise<MediaLibrary> {
  const supported = files.filter((file) => /\.(fnt|png|webp|jpe?g)$/i.test(file.name));
  if (!supported.length) throw Error('Choose images and/or .fnt files with their page images.');
  const fontFiles = supported.filter((file) => /\.fnt$/i.test(file.name));
  const candidates = [
    ...new Set([...supported, ...current.images, ...current.fonts.flatMap((font) => font.pages)]),
  ];
  const fonts = [...current.fonts],
    used = new Set<File>();
  for (const file of fontFiles) {
    if (file.size > 2 * 1024 * 1024) throw Error('Bitmap font files must be at most 2 MB.');
    const pages = bitmapFontPages(await file.text()).map((page) =>
      resolveMediaPage(file, page, candidates),
    );
    pages.forEach((page) => used.add(page));
    if (!fonts.some((font) => font.file === file)) fonts.push({ file, pages });
  }
  const images = [
    ...new Set([
      ...current.images,
      ...supported.filter((file) => /\.(png|webp|jpe?g)$/i.test(file.name) && !used.has(file)),
    ]),
  ];
  if (images.length + fonts.length > MAX_MEDIA_ASSETS)
    throw Error(`The media library supports up to ${MAX_MEDIA_ASSETS} assets.`);
  return { images, fonts };
}
/** Old projects acquire a reusable library from their already attached resources. */
export function collectMediaLibrary(
  library: MediaLibrary | undefined,
  actors: readonly { state: { boneImages?: BoneImageState[]; boneNumbers?: BoneNumberState[] } }[],
): MediaLibrary {
  const images = new Set(library?.images ?? []),
    fonts = [...(library?.fonts ?? [])];
  for (const actor of actors) {
    actor.state.boneImages?.forEach((image) => images.add(image.file));
    actor.state.boneNumbers?.forEach((number) => {
      if (
        number.font &&
        !fonts.some(
          (font) =>
            font.file === number.font!.file &&
            font.pages.length === number.font!.pages.length &&
            font.pages.every((page, i) => page === number.font!.pages[i]),
        )
      )
        fonts.push(number.font);
    });
  }
  return { images: [...images], fonts };
}
