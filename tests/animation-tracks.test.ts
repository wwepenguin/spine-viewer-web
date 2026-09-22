import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SkeletonJson,
  Skeleton,
  AnimationState,
  AnimationStateData,
  type AttachmentLoader,
} from '@pixi-spine/runtime-3.8';
import { AnimationTracks } from '../src/animation-tracks';
import type { RuntimeState } from '../src/runtime';

function fixture() {
  // This fixture has no attachments: only real Spine timelines and bones.
  const loader = new Proxy({} as AttachmentLoader, {
    get: () => () => {
      throw Error('Unexpected attachment');
    },
  });
  const data = new SkeletonJson(loader).readSkeletonData({
    skeleton: { spine: '3.8.55' },
    bones: [{ name: 'root' }, { name: 'body', parent: 'root' }, { name: 'arm', parent: 'body' }],
    animations: {
      walk: {
        bones: {
          body: {
            translate: [
              { time: 0, x: 0 },
              { time: 1, x: 10 },
            ],
          },
        },
      },
      shoot: {
        bones: {
          arm: {
            rotate: [
              { time: 0, angle: 0 },
              { time: 1, angle: 90 },
            ],
          },
        },
      },
      lean: {
        bones: {
          body: {
            translate: [
              { time: 0, x: 20 },
              { time: 1, x: 30 },
            ],
          },
        },
      },
    },
  });
  const skeleton = new Skeleton(data),
    state = new AnimationState(new AnimationStateData(data));
  const model = {
    state: state as unknown as RuntimeState,
    skeleton,
    update(delta: number) {
      state.update(delta);
      state.apply(skeleton);
      skeleton.updateWorldTransform();
    },
  };
  return { tracks: new AnimationTracks(model, data.animations), state, skeleton, model };
}
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);
test('two tracks advance simultaneously and animate different bones', () => {
  const { tracks, state, skeleton, model } = fixture();
  tracks.play(0, 'walk', 0);
  tracks.play(1, 'shoot', 0);
  model.update(0.25);
  close(state.getCurrent(0).trackTime, 0.25);
  close(state.getCurrent(1).trackTime, 0.25);
  close(skeleton.findBone('body').x, 2.5);
  close(skeleton.findBone('arm').rotation, 22.5);
  tracks.play(1, 'shoot', 0);
  close(state.getCurrent(0).trackTime, 0.25);
});
test('loop, speed and alpha are independent for each layer', () => {
  const { tracks, state, model } = fixture();
  tracks.configure(0, { loop: false });
  tracks.configure(1, { speed: 2, alpha: 0.5 });
  tracks.play(0, 'walk', 0);
  tracks.play(1, 'shoot', 0);
  model.update(0.25);
  assert.equal(state.getCurrent(0).loop, false);
  assert.equal(state.getCurrent(1).loop, true);
  close(state.getCurrent(0).trackTime, 0.25);
  close(state.getCurrent(1).trackTime, 0.5);
  close(state.getCurrent(1).alpha, 0.5);
});
test('seek, changing additive and clearing one track preserve other tracks', () => {
  const { tracks, state, skeleton, model } = fixture();
  tracks.play(0, 'walk', 0);
  tracks.play(1, 'shoot', 0);
  model.update(0.25);
  tracks.seek(1, 0.6);
  close(state.getCurrent(0).trackTime, 0.25);
  close(state.getCurrent(1).trackTime, 0.6);
  tracks.configure(1, { additive: true });
  close(state.getCurrent(0).trackTime, 0.25);
  close(state.getCurrent(1).trackTime, 0.6);
  assert.equal(state.getCurrent(1).mixBlend, 3);
  tracks.clear(1);
  assert.equal(state.getCurrent(1), null);
  close(state.getCurrent(0).trackTime, 0.25);
  close(skeleton.findBone('body').x, 2.5);
  close(skeleton.findBone('arm').rotation, 0);
});
test('higher tracks override common properties and can blend by weight', () => {
  const { tracks, skeleton, model } = fixture();
  tracks.play(0, 'walk', 0);
  tracks.play(1, 'lean', 0);
  model.update(0.25);
  close(skeleton.findBone('body').x, 22.5);
  tracks.configure(1, { alpha: 0.5 });
  close(skeleton.findBone('body').x, 12.5);
});
test('restart all retains layer settings and invalid changes leave state intact', () => {
  const { tracks, state, model } = fixture();
  tracks.play(0, 'walk', 0);
  tracks.configure(1, { speed: 0.5, loop: false, alpha: 0.6 });
  tracks.play(1, 'shoot', 0);
  model.update(0.4);
  assert.throws(() => tracks.play(1, 'missing', 0));
  assert.throws(() => tracks.configure(1, { speed: -1 }));
  assert.equal(state.getCurrent(1).animation.name, 'shoot');
  tracks.restartAll();
  close(state.getCurrent(0).trackTime, 0);
  close(state.getCurrent(1).trackTime, 0);
  assert.equal(state.getCurrent(1).timeScale, 0.5);
  assert.equal(state.getCurrent(1).loop, false);
  close(state.getCurrent(1).alpha, 0.6);
});

test('shared timeline seeks all layers with independent speeds and repeatable poses', () => {
  const { tracks, state, skeleton } = fixture();
  tracks.play(0, 'walk', 0);
  tracks.configure(1, { speed: 0.5, loop: false });
  tracks.play(1, 'shoot', 0);
  tracks.seekAll(0.8);
  close(state.getCurrent(0).trackTime, 0.8);
  close(state.getCurrent(1).trackTime, 0.4);
  close(skeleton.findBone('body').x, 8);
  close(skeleton.findBone('arm').rotation, 36);
  tracks.seekAll(4);
  close(skeleton.findBone('arm').rotation, 90);
  tracks.seekAll(0.2);
  close(skeleton.findBone('body').x, 2);
  close(skeleton.findBone('arm').rotation, 9);
  tracks.configure(1, { speed: 0 });
  tracks.seekAll(2);
  close(state.getCurrent(1).trackTime, 0);
  assert.throws(() => tracks.seekAll(-1));
  assert.throws(() => tracks.seekAll(NaN));
});

test('looping preview wraps the shared clock and all layers at the longest clip', () => {
  const { tracks, state, skeleton } = fixture();
  tracks.play(0, 'walk', 0);
  tracks.configure(1, { speed: 0.5 });
  tracks.play(1, 'shoot', 0);
  tracks.seekAll(1.95);
  const result = tracks.advance(1.95, 0.1);
  close(result.time, 0.05);
  assert.equal(result.complete, false);
  close(state.getCurrent(0).trackTime, 0.05);
  close(state.getCurrent(1).trackTime, 0.025);
  close(skeleton.findBone('body').x, 0.5);
  close(skeleton.findBone('arm').rotation, 2.25);
});

test('non-looping preview stops at the end and frozen layers do not extend the cycle', () => {
  const { tracks, state, skeleton } = fixture();
  tracks.configure(0, { loop: false });
  tracks.play(0, 'walk', 0);
  tracks.configure(1, { speed: 0 });
  tracks.play(1, 'shoot', 0);
  const result = tracks.advance(0, 1.2);
  assert.equal(result.complete, true);
  close(result.time, 1);
  close(skeleton.findBone('body').x, 10);
  close(state.getCurrent(1).trackTime, 0);
  tracks.clear(0);
  assert.deepEqual(tracks.advance(0, 0.1), { time: 0, complete: true });
});

test('normal playback advances smoothly and exact loop boundaries return to zero', () => {
  const { tracks, state } = fixture();
  tracks.play(0, 'walk', 0);
  close(tracks.advance(0, 0.25).time, 0.25);
  close(state.getCurrent(0).trackTime, 0.25);
  assert.deepEqual(tracks.advance(0.25, 0.75), { time: 0, complete: false });
  close(state.getCurrent(0).trackTime, 0);
  close(tracks.advance(0, 3.2).time, 0.2);
});
