import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreferences } from '../src/preferences';
test('preferences tolerate corrupt storage and clamp layout to usable bounds', () => {
  assert.equal(parsePreferences('{bad').fps, '30');
  assert.equal(parsePreferences('null').width, 310);
  const p = parsePreferences(
    JSON.stringify({
      width: 99999,
      height: -20,
      fps: 7,
      collapsed: ['sceneContent', 123],
      volume: 4,
      muted: true,
    }),
  );
  assert.equal(p.width, 480);
  assert.equal(p.height, 220);
  assert.equal(p.volume, 1);
  assert.equal(p.fps, '30');
  assert.deepEqual(p.collapsed, ['sceneContent']);
  assert.equal(p.muted, true);
});
