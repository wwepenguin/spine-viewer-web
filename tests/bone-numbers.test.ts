import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIXI, type RuntimeSpine } from '../src/runtime';
import { BoneNumberLayer } from '../src/bone-numbers';
import {
  boneNumberSettings,
  bitmapFontPages,
  matchFontPage,
  type BoneNumberState,
} from '../src/bone-number-state';

const state: BoneNumberState = {
  mount: 'slot',
  target: 'track_mul',
  text: 'x100',
  fontSize: 40,
  color: '#ffffff',
  letterSpacing: 0,
  maxWidth: 50,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  hidePlaceholder: true,
};

test('bitmap numbers center visible glyphs, follow slots, replace placeholders and restore them', (t) => {
  // Exercise real Pixi glyph meshes without requesting a browser/WebGL context.
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => null }) },
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const data = new PIXI.BitmapFontData();
  data.info.push({ face: 'number_test', size: 40 });
  data.common.push({ lineHeight: 40 });
  data.page.push({ id: 0, file: 'digits.png' });
  [...'x0123456789'].forEach((c, i) =>
    data.char.push({
      id: c.codePointAt(0)!,
      page: 0,
      x: i * 20,
      y: 0,
      width: 15,
      height: 30,
      xoffset: 0,
      yoffset: -12,
      xadvance: 20,
    }),
  );
  const texture = new PIXI.Texture(new PIXI.BaseTexture(null, { width: 256, height: 64 }));
  PIXI.BitmapFont.install(data, [texture], false);
  const model = new PIXI.Container() as RuntimeSpine;
  const bone = {
    data: { name: 'track-bone' },
    active: true,
    matrix: new PIXI.Matrix(1, 0, 0, -1, 100, 40),
  };
  const placeholder = new PIXI.Sprite(texture);
  const slot = {
    bone,
    data: { name: 'track_mul' },
    color: { a: 1 },
    getAttachment: () => ({}),
    currentSprite: placeholder,
  };
  const slotContainer = new PIXI.Container();
  slotContainer.transform.setFromMatrix(bone.matrix);
  slotContainer.addChild(placeholder);
  model.addChild(slotContainer);
  model.slotContainers = [slotContainer];
  model.skeleton = {
    findBone: (name: string) => (name === 'track-bone' ? bone : null),
    findSlot: (name: string) => (name === 'track_mul' ? slot : null),
    findSlotIndex: (name: string) => (name === 'track_mul' ? 0 : -1),
  } as unknown as RuntimeSpine['skeleton'];
  const layer = new BoneNumberLayer(model);
  let released = 0;
  layer.attach({
    state,
    font: { name: 'number_test', pages: [], files: [] },
    release: () => released++,
  });
  const entry = layer.numbers[0];
  assert.equal(entry.root.parent, slotContainer);
  assert.equal(placeholder.renderable, false);
  const bounds = entry.display.getBounds();
  assert.ok(Math.abs(bounds.width - 50) < 1e-6);
  assert.ok(Math.abs(bounds.x + bounds.width / 2 - 100) < 1e-6);
  assert.ok(Math.abs(bounds.y + bounds.height / 2 - 40) < 1e-6);
  assert.throws(() => layer.update(0, { text: '?' }), /missing characters/);
  assert.equal(entry.state.text, 'x100');
  assert.throws(() => layer.update(0, { target: 'missing' }), /Slot not found/);
  layer.update(0, { mount: 'bone', target: 'track-bone', rotation: 35, x: 12, y: 4 });
  assert.equal(entry.root.parent, model);
  assert.equal(placeholder.renderable, true);
  assert.equal(layer.vertices().length, 8);
  bone.active = false;
  layer.sync();
  assert.equal(entry.root.visible, false);
  assert.deepEqual(layer.vertices(), []);
  bone.active = true;
  layer.update(0, { mount: 'slot', target: 'track_mul' });
  assert.equal(placeholder.renderable, false);
  layer.attach({
    state,
    font: { name: 'number_test', pages: [], files: [] },
    release: () => released++,
  });
  layer.remove(0);
  assert.equal(placeholder.renderable, false);
  layer.dispose();
  layer.dispose();
  assert.equal(released, 2);
  assert.equal(placeholder.renderable, true);
  assert.equal(texture.baseTexture.valid, true);
  model.destroy({ children: true, texture: false, baseTexture: false });
  PIXI.BitmapFont.uninstall('number_test');
  texture.destroy(true);
});

test('BMFont pages support game XML, text, nested names and reject ambiguity', () => {
  assert.deepEqual(
    bitmapFontPages('<font><pages><page id="0" file="bmpfont10.png"/></pages></font>'),
    ['bmpfont10.png'],
  );
  assert.deepEqual(
    bitmapFontPages('info face="digits" size=40\npage id=0 file="pages/a&amp;b.png"\n'),
    ['pages/a&b.png'],
  );
  const page = new File(['image'], 'a&b.png');
  assert.equal(matchFontPage('pages/a&b.png', [page]), page);
  assert.throws(() => matchFontPage('missing.png', [page]), /exactly one/);
  assert.throws(() => matchFontPage('a&b.png', [page, page]), /exactly one/);
  assert.throws(() => bitmapFontPages('<font/>'), /unique pages/);
  for (const patch of [
    { text: '' },
    { text: ' ' },
    { text: '123\n45' },
    { color: 'red' },
    { fontSize: 0 },
    { maxWidth: -1 },
  ])
    assert.throws(() => boneNumberSettings({ ...state, ...patch }), /Invalid/);
});
