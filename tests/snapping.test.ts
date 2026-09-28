import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapTime } from '../src/snapping';
test('snaps to frame, playhead or beat within tolerance and supports bypass', () => {
  assert.equal(snapTime(0.332, 30, [], 0.01), 10 / 30);
  assert.equal(snapTime(0.514, 30, [0.515], 0.02), 0.515);
  assert.equal(snapTime(0.514, 30, [0.515], 0.02, false), 0.514);
  assert.equal(snapTime(0.514, 30, [], 0.001), 0.514);
  assert.equal(snapTime(-2, 30, [], 0.02), 0);
});
