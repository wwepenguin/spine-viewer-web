import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMediaImport, emptyMediaLibrary, collectMediaLibrary } from '../src/media-library';
const file = (path: string, text = 'image') => {
  const result = new File([text], path.split('/').at(-1)!);
  Object.defineProperty(result, 'webkitRelativePath', { value: path });
  return result;
};
test('batch import resolves each font relative to its folder even with duplicate page basenames', async () => {
  const first = file('bundle/a/font.fnt', 'page id=0 file="page.png"'),
    second = file('bundle/b/font.fnt', 'page id=0 file="page.png"'),
    a = file('bundle/a/page.png'),
    b = file('bundle/b/page.png'),
    badge = file('bundle/badge.webp');
  const library = await planMediaImport([first, second, a, b, badge], emptyMediaLibrary());
  assert.deepEqual(library.images, [badge]);
  assert.deepEqual(library.fonts, [
    { file: first, pages: [a] },
    { file: second, pages: [b] },
  ]);
});
test('fonts can reuse existing library images and invalid batches leave the library untouched', async () => {
  const page = file('page.png'),
    font = file('font.fnt', 'page id=0 file="page.png"');
  const before = { images: [page], fonts: [] };
  const result = await planMediaImport([font], before);
  assert.equal(result.fonts[0].pages[0], page);
  const bad = file('bad.fnt', 'page id=0 file="missing.png"');
  await assert.rejects(() => planMediaImport([font, bad], before), /exactly one/);
  assert.deepEqual(before, { images: [page], fonts: [] });
  await assert.rejects(() => planMediaImport([file('a.svg')], before), /Choose images/);
});
test('ambiguous font pages and oversized libraries fail before changing assets', async () => {
  const font = file('font.fnt', 'page id=0 file="page.png"');
  await assert.rejects(
    () => planMediaImport([font, file('x/page.png'), file('y/page.png')], emptyMediaLibrary()),
    /exactly one/,
  );
  await assert.rejects(
    () =>
      planMediaImport(
        Array.from({ length: 257 }, (_, i) => file(`${i}.png`)),
        emptyMediaLibrary(),
      ),
    /256/,
  );
});
test('legacy image resources become reusable without duplicating shared file references', () => {
  const image = file('badge.png');
  const state = { file: image, bone: 'head', x: 0, y: 0, scale: 1, rotation: 0 };
  assert.deepEqual(collectMediaLibrary(undefined, [{ state: { boneImages: [state, state] } }]), {
    images: [image],
    fonts: [],
  });
});
