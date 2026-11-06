import { boneImageSettings } from './bone-image-state';

export const MAX_BONE_NUMBERS = 64;
export interface NumberFontAsset {
  file: File;
  pages: File[];
}
export interface BoneNumberSettings {
  mount: 'bone' | 'slot';
  target: string;
  text: string;
  fontSize: number;
  color: string;
  letterSpacing: number;
  maxWidth: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  hidePlaceholder: boolean;
}
export interface BoneNumberState extends BoneNumberSettings {
  font?: NumberFontAsset;
}
export function boneNumberSettings(value: BoneNumberSettings): BoneNumberSettings {
  if (
    !value ||
    !['bone', 'slot'].includes(value.mount) ||
    typeof value.text !== 'string' ||
    (value.text.length > 0 && !value.text.trim().length) ||
    value.text.length > 128 ||
    /[\r\n\t]/.test(value.text) ||
    typeof value.color !== 'string' ||
    !/^#[\da-f]{6}$/i.test(value.color) ||
    typeof value.hidePlaceholder !== 'boolean'
  )
    throw Error('Invalid bone number settings.');
  const transform = boneImageSettings({ ...value, bone: value.target });
  const number = (n: number, min: number, max: number) => {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
      throw Error('Invalid number style.');
    return n;
  };
  const { bone: _bone, ...position } = transform;
  return {
    ...position,
    mount: value.mount,
    target: value.target,
    text: value.text,
    fontSize: number(value.fontSize, 1, 1000),
    color: value.color,
    letterSpacing: number(value.letterSpacing, -1000, 1000),
    maxWidth: number(value.maxWidth, 0, 1e7),
    hidePlaceholder: value.hidePlaceholder,
  };
}
/** BMFont XML or text descriptor page names; no network or filesystem paths are followed. */
export function bitmapFontPages(source: string): string[] {
  const tags = source.trimStart().startsWith('<')
    ? source.match(/<page\b[^>]*>/g)
    : source.match(/^page\s[^\r\n]+/gm);
  const pages = (tags ?? []).map((tag) => {
    const name = /\bfile\s*=\s*(["'])(.*?)\1/.exec(tag)?.[2];
    if (!name) throw Error('Bitmap font page has no file name.');
    return name
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  });
  if (!pages.length || pages.length > 16 || new Set(pages).size !== pages.length)
    throw Error('A bitmap font must have 1–16 unique pages.');
  return pages;
}
export function matchFontPage(name: string, files: readonly File[]): File {
  const basename = name.replace(/\\/g, '/').split('/').at(-1)!.toLowerCase();
  const matches = files.filter((file) => file.name.toLowerCase() === basename);
  if (matches.length !== 1) throw Error(`Choose exactly one image for bitmap font page: ${name}`);
  return matches[0];
}
