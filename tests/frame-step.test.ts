import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepFrameTime } from '../src/frame-step';

test('forward and backward steps stay on the frame grid without drift', () => {
  for (const fps of [24, 30, 60]) {
    let time = 0;
    for (let i = 0; i < 1000; i++) time = stepFrameTime(time, 1, fps, 100);
    assert.equal(time, 1000 / fps);
    for (let i = 0; i < 1000; i++) time = stepFrameTime(time, -1, fps, 100);
    assert.equal(time, 0);
  }
});

test('steps from scrubbed times use the nearest boundary in the requested direction', () => {
  assert.equal(stepFrameTime(0.05, 1, 30, 1), 2 / 30);
  assert.equal(stepFrameTime(0.05, -1, 30, 1), 1 / 30);
  assert.equal(stepFrameTime(0, -1, 30, 1), 0);
  assert.equal(stepFrameTime(0.86, 1, 30, 0.8667), 26 / 30);
  assert.equal(stepFrameTime(26 / 30, 1, 30, 0.8667), 0.8667);
  assert.equal(stepFrameTime(0.8667, -1, 30, 0.8667), 26 / 30);
  assert.equal(stepFrameTime(1, 1, 30, 0), 0);
});
