import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeProject, decodeProject, type ProjectSnapshot } from '../src/project';
import { zipSync, strToU8, unzipSync } from 'fflate';
const skeleton = new File(['{}'], 'hero.json');
const atlas = new File(['page.webp'], 'hero.atlas');
const source = {
  entries: [
    { path: 'nested/hero.json', file: skeleton },
    { path: 'nested/hero.atlas', file: atlas },
  ],
  skeleton: 'nested/hero.json',
  atlas: 'nested/hero.atlas',
  pma: false,
  linear: true,
};
const state = {
  name: 'Hero',
  x: 12,
  y: -4,
  scale: 1,
  rotation: 0,
  visible: true,
  flipX: 1,
  flipY: 1,
  skin: '',
  startAt: 2,
  speed: 1,
  mix: 0.2,
  track: 0,
  time: 0,
  sequences: Array.from({ length: 6 }, () => [{ name: 'walk', mixIn: 0 }]),
  settings: Array.from({ length: 6 }, () => ({ alpha: 1, additive: false, loop: true, speed: 1 })),
};
test('portable archive round-trips nested sources, independent actors and audio with deduplication', async () => {
  const snapshot: ProjectSnapshot = {
    actors: [
      { source, state },
      { source, state: { ...state, name: 'Copy', x: 40 } },
    ],
    selected: 1,
    audio: new File(['audio'], 'song.wav'),
    music: { time: 3, rate: 1, volume: 0.5, muted: true, loop: false },
  };
  const bytes = await encodeProject(snapshot);
  assert.equal(Object.keys(unzipSync(bytes)).length, 4);
  const restored = decodeProject(bytes);
  assert.deepEqual(
    restored.actors.map((a) => a.state),
    snapshot.actors.map((a) => a.state),
  );
  assert.equal(
    restored.actors[0].source.entries[0].file,
    restored.actors[1].source.entries[0].file,
  );
  assert.equal(await restored.audio!.text(), 'audio');
  assert.equal(restored.selected, 1);
  assert.deepEqual(restored.music, snapshot.music);
});
test('rejects incompatible and incomplete project archives', () => {
  assert.throws(() => decodeProject(zipSync({ 'other.json': strToU8('{}') })), /not a Spine/);
  assert.throws(
    () => decodeProject(zipSync({ 'project.json': strToU8('{"version":99}') })),
    /Unsupported/,
  );
});
