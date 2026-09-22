import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalog, matchAtlas, resolvePage } from '../src/catalog';
function file(path: string) {
  const result = new File(['test'], path.split('/').pop()!);
  Object.defineProperty(result, 'relativePath', { value: path });
  return result;
}
test('atlas resolves its relative texture before duplicate basenames', () => {
  const correct = file('hero/textures/page.webp');
  const data = catalog([
    file('hero/hero-pro.json'),
    file('hero/hero.atlas'),
    correct,
    file('other/page.webp'),
  ]);
  assert.equal(matchAtlas(data, data.skeletons[0])?.path, 'hero/hero.atlas');
  assert.equal(resolvePage(data, 'hero/hero.atlas', 'textures/page.webp'), correct);
});
test('ambiguous and missing texture names give actionable errors', () => {
  const data = catalog([file('a/page.webp'), file('b/page.webp')]);
  assert.throws(() => resolvePage(data, 'hero.atlas', 'page.webp'), /Duplicate/);
  assert.throws(() => resolvePage(data, 'hero.atlas', 'missing.webp'), /Missing texture/);
});
test('catalog supports binary, atlas.txt, Unicode and nested files', () => {
  const data = catalog([
    file('角色/test.skel.bytes'),
    file('角色/test.atlas.txt'),
    file('角色/頁.webp'),
  ]);
  assert.equal(data.skeletons.length, 1);
  assert.equal(data.atlases.length, 1);
  assert.equal(matchAtlas(data, data.skeletons[0]), data.atlases[0]);
  assert.equal(resolvePage(data, data.atlases[0].path, './頁.webp'), data.entries[2].file);
});
