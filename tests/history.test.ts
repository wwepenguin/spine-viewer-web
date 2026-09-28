import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditHistory } from '../src/history';
test('history coalesces equivalent states, branches after undo and bounds retained states', async () => {
  const h = new EditHistory<number>(String, 3);
  let result = -1;
  const restore = async (state: number) => {
    result = state;
  };
  [0, 1, 1, 2, 3].forEach((s) => h.record(s));
  await h.move(-1, restore);
  assert.equal(result, 2);
  await h.move(-1, restore);
  assert.equal(result, 1);
  assert.equal(h.canUndo, false);
  await h.move(1, restore);
  assert.equal(result, 2);
  h.record(9);
  assert.equal(h.canRedo, false);
  await h.move(-1, restore);
  assert.equal(result, 2);
});
test('failed restores retain cursor and mutations are blocked during restore', async () => {
  const h = new EditHistory<number>(String);
  h.record(1);
  h.record(2);
  await assert.rejects(
    h.move(-1, async () => {
      h.record(99);
      throw Error('bad');
    }),
  );
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, false);
  let restored = 0;
  await h.move(-1, async (s) => {
    restored = s;
  });
  assert.equal(restored, 1);
});
