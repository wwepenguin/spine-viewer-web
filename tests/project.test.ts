import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeProject, decodeProject, type ProjectSnapshot } from '../src/project';
import { zipSync, strToU8, strFromU8, unzipSync } from 'fflate';
import type { BoneNumberState } from '../src/bone-number-state';
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
  locked: true,
  selectedSlot: 'head',
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
    music: {
      time: 3,
      rate: 1,
      volume: 0.5,
      muted: true,
      loop: false,
      bpm: 125,
      beatOffset: 0.1,
      markers: [{ time: 2.5, label: 'Beat' }],
      range: { start: 2, end: 4, enabled: true },
    },
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
test('rejects missing asset payloads and out-of-range animation timing', async () => {
  const snapshot: ProjectSnapshot = {
    actors: [{ source, state }],
    selected: 0,
    music: { time: 0, rate: 1, loop: false, volume: 0.8, muted: true },
  };
  const files = unzipSync(await encodeProject(snapshot));
  const manifest = JSON.parse(strFromU8(files['project.json']));
  manifest.actors[0].state.settings[0].start = -1;
  assert.throws(
    () => decodeProject(zipSync({ ...files, 'project.json': strToU8(JSON.stringify(manifest)) })),
    /invalid number/,
  );
  delete files['assets/0'];
  assert.throws(() => decodeProject(zipSync(files)), /Missing project asset/);
});
test('rejects incompatible and incomplete project archives', () => {
  assert.throws(() => decodeProject(zipSync({ 'other.json': strToU8('{}') })), /not a Spine/);
  assert.throws(
    () => decodeProject(zipSync({ 'project.json': strToU8('{"version":99}') })),
    /Unsupported/,
  );
});

test('project archives preserve custom clip durations and retain Auto on legacy clips', async () => {
  const snapshot: ProjectSnapshot = {
    actors: [
      {
        source,
        state: {
          ...state,
          sequences: [
            [
              { name: 'walk', mixIn: 0, duration: 0.5 },
              { name: 'run', mixIn: 0.2, duration: 2 },
            ],
            [{ name: 'walk', mixIn: 0 }],
            [],
            [],
            [],
            [],
          ],
        },
      },
    ],
    selected: 0,
    music: { time: 0, rate: 1, loop: false, volume: 0.8, muted: true },
  };
  const files = unzipSync(await encodeProject(snapshot));
  const restored = decodeProject(zipSync(files));
  assert.deepEqual(restored.actors[0].state.sequences, snapshot.actors[0].state.sequences);
  const manifest = JSON.parse(strFromU8(files['project.json']));
  for (const duration of [-1, 7201, '0.5', null]) {
    manifest.actors[0].state.sequences[0][0].duration = duration;
    assert.throws(
      () => decodeProject(zipSync({ ...files, 'project.json': strToU8(JSON.stringify(manifest)) })),
      /invalid number/,
    );
  }
});

test('bone image files round-trip with transforms and deduplicate across actors', async () => {
  const image = new File(['image-payload'], 'badge.webp', { type: 'image/webp' });
  const boneImages = [{ file: image, bone: 'track-bone', x: 12, y: -3, scale: 0.5, rotation: 35 }];
  const snapshot: ProjectSnapshot = {
    actors: [
      { source, state: { ...state, boneImages } },
      { source, state: { ...state, boneImages } },
    ],
    selected: 0,
    music: { time: 0, rate: 1, loop: false, volume: 0.8, muted: false },
  };
  const files = unzipSync(await encodeProject(snapshot));
  assert.equal(Object.keys(files).length, 4);
  const restored = decodeProject(zipSync(files));
  const first = restored.actors[0].state.boneImages![0];
  assert.equal(await first.file.text(), 'image-payload');
  assert.equal(first.file, restored.actors[1].state.boneImages![0].file);
  assert.deepEqual({ ...first, file: null }, { ...boneImages[0], file: null });
  const manifest = JSON.parse(strFromU8(files['project.json']));
  manifest.actors[0].state.boneImages[0].scale = 0;
  assert.throws(
    () => decodeProject(zipSync({ ...files, 'project.json': strToU8(JSON.stringify(manifest)) })),
    /bone image transform/,
  );
  manifest.actors[0].state.boneImages[0].scale = 1;
  manifest.actors[0].state.boneImages[0].file.id = 'assets/missing';
  assert.throws(
    () => decodeProject(zipSync({ ...files, 'project.json': strToU8(JSON.stringify(manifest)) })),
    /Missing project asset/,
  );
});

test('number content, slot mounts and bitmap-font files survive project round trips', async () => {
  const font = {
    file: new File(['<font/>'], 'digits.fnt'),
    pages: [new File(['page'], 'digits.png')],
  };
  const number: BoneNumberState = {
    mount: 'slot',
    target: 'track_mul',
    text: 'x100',
    fontSize: 188,
    color: '#ffffff',
    letterSpacing: -2,
    maxWidth: 270,
    x: 4,
    y: 6,
    scale: 0.5,
    rotation: 12,
    hidePlaceholder: true,
    font,
  };
  const snapshot: ProjectSnapshot = {
    actors: [
      { source, state: { ...state, boneNumbers: [number] } },
      { source, state: { ...state, boneNumbers: [{ ...number, text: 'x20' }] } },
    ],
    selected: 1,
    music: { time: 0, rate: 1, loop: false, volume: 0.8, muted: false },
  };
  const files = unzipSync(await encodeProject(snapshot));
  assert.equal(Object.keys(files).length, 5);
  const restored = decodeProject(zipSync(files));
  const first = restored.actors[0].state.boneNumbers![0],
    second = restored.actors[1].state.boneNumbers![0];
  assert.deepEqual({ ...first, font: null }, { ...number, font: null });
  assert.equal(first.font!.file, second.font!.file);
  assert.equal(first.font!.pages[0], second.font!.pages[0]);
  assert.equal(await first.font!.pages[0].text(), 'page');
  assert.equal(second.text, 'x20');
  const manifest = JSON.parse(strFromU8(files['project.json']));
  manifest.actors[0].state.boneNumbers[0].fontSize = 0;
  assert.throws(
    () => decodeProject(zipSync({ ...files, 'project.json': strToU8(JSON.stringify(manifest)) })),
    /number style/,
  );
  manifest.actors[0].state.boneNumbers[0].fontSize = 188;
  manifest.actors[0].state.boneNumbers[0].font.pages[0].id = 'assets/missing';
  assert.throws(
    () => decodeProject(zipSync({ ...files, 'project.json': strToU8(JSON.stringify(manifest)) })),
    /Missing project asset/,
  );
});
