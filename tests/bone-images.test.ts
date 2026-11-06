import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIXI, type RuntimeSpine } from '../src/runtime';
import { BoneImageLayer, prepareBoneImage } from '../src/bone-images';
import { boneImageSettings, boneImageVertices } from '../src/bone-image-state';
import { transformVertices } from '../src/transform';
import { syncSlotPlaceholders } from '../src/slot-overlays';

const settings = { bone: 'track-bone', x: 0, y: 0, scale: 1, rotation: 0 };
test('slot images follow region and mesh transforms and coordinate placeholder ownership with numbers', () => {
  const texture = new PIXI.Texture(new PIXI.BaseTexture(null, { width: 20, height: 10 }));
  const model = new PIXI.Container() as RuntimeSpine,
    container = new PIXI.Container();
  const bone = { active: true, matrix: new PIXI.Matrix(1, 0.3, 0.4, -1, 100, 50) };
  const placeholder = new PIXI.Sprite(texture),
    slot = { bone, color: { a: 1 }, currentSprite: placeholder, getAttachment: () => ({}) };
  container.addChild(placeholder);
  model.addChild(container);
  model.slotContainers = [container];
  model.skeleton = {
    findBone: () => bone,
    findSlot: () => slot,
    findSlotIndex: () => 0,
  } as unknown as RuntimeSpine['skeleton'];
  const layer = new BoneImageLayer(model),
    numberOwner = {};
  layer.attach({
    state: { ...settings, slot: 'slot', file: new File(['image'], 'badge.png') },
    texture,
    release() {},
  });
  assert.equal(placeholder.renderable, false);
  for (const matrix of [new PIXI.Matrix(), bone.matrix]) {
    container.transform.setFromMatrix(matrix);
    layer.sync();
    const center = layer.images[0].sprite.toGlobal(new PIXI.Point(0, 0));
    assert.ok(Math.abs(center.x - 100) < 1e-6 && Math.abs(center.y - 50) < 1e-6);
  }
  syncSlotPlaceholders(model, numberOwner, new Set(['slot']));
  layer.dispose();
  assert.equal(placeholder.renderable, false);
  syncSlotPlaceholders(model, numberOwner, new Set());
  assert.equal(placeholder.renderable, true);
  placeholder.renderable = false;
  syncSlotPlaceholders(model, numberOwner, new Set(['slot']));
  syncSlotPlaceholders(model, numberOwner, new Set());
  assert.equal(placeholder.renderable, false);
  model.destroy({ children: true, texture: false, baseTexture: false });
  texture.destroy(true);
});
test('bone images match rendered Pixi corners through shear, reflection and actor transforms', () => {
  const bone = { active: true, matrix: new PIXI.Matrix(1, 0, 0, -1, 100, 50) };
  const model = new PIXI.Container() as RuntimeSpine;
  model.skeleton = {
    findBone: (name: string) => (name === 'track-bone' ? bone : null),
  } as unknown as RuntimeSpine['skeleton'];
  const texture = new PIXI.Texture(new PIXI.BaseTexture(null, { width: 20, height: 10 }));
  const layer = new BoneImageLayer(model);
  let released = 0;
  layer.attach({
    state: { ...settings, file: new File(['image'], 'badge.png') },
    texture,
    release: () => released++,
  });
  assert.deepEqual(layer.vertices(), [90, 45, 110, 45, 110, 55, 90, 55]);
  model.position.set(20, -30);
  model.scale.set(1.7);
  model.rotation = 0.7;
  for (const matrix of [
    [1, 0, 0, -1, 100, 50],
    [-1, 0.3, 0.6, -2, 20, -10],
    [0, 2, 1, 0.5, -30, 80],
  ]) {
    bone.matrix.set(...(matrix as [number, number, number, number, number, number]));
    layer.update(0, { x: 4, y: -6, scale: 0.8, rotation: 35 });
    const expected = transformVertices(layer.vertices(), model);
    for (let i = 0; i < 8; i += 2) {
      const point = layer.images[0].sprite.toGlobal(
        new PIXI.Point([-10, 10, 10, -10][i / 2], [-5, -5, 5, 5][i / 2]),
      );
      assert.ok(Math.abs(point.x - expected[i]) < 1e-6);
      assert.ok(Math.abs(point.y - expected[i + 1]) < 1e-6);
    }
  }
  bone.active = false;
  layer.sync();
  assert.equal(layer.images[0].root.visible, false);
  assert.deepEqual(layer.vertices(), []);
  assert.throws(() => layer.update(0, { bone: 'missing' }), /Bone not found/);
  assert.equal(layer.images[0].state.bone, 'track-bone');
  layer.remove(0);
  layer.dispose();
  assert.equal(released, 1);
  assert.equal(texture.baseTexture.valid, true);
  texture.destroy(true);
  model.destroy({ children: true });
});

test('bone image settings reject invalid transforms and unsupported files', async () => {
  for (const patch of [
    { bone: '' },
    { x: NaN },
    { scale: 0 },
    { scale: Infinity },
    { rotation: 36001 },
  ])
    assert.throws(() => boneImageSettings({ ...settings, ...patch }), /Invalid/);
  await assert.rejects(
    () => prepareBoneImage({ ...settings, file: new File(['svg'], 'badge.svg') }),
    /PNG, WebP or JPEG/,
  );
  assert.deepEqual(
    boneImageVertices({ a: 1, b: 0, c: 0, d: -1, tx: 0, ty: 0 }, 4, 2, settings),
    [-2, -1, 2, -1, 2, 1, -2, 1],
  );
});
