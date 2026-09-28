import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformPoint, transformVertices } from '../src/transform';
test('slot geometry uses actor scale, rotation and translation in stage coordinates', () => {
  const t = { x: 100, y: 50, scale: { x: 2, y: 2 }, rotation: Math.PI / 2 };
  const p = transformPoint(10, 20, t);
  assert.ok(Math.abs(p.x - 60) < 1e-8);
  assert.ok(Math.abs(p.y - 70) < 1e-8);
  const points = transformVertices([0, 0, 10, 20], t);
  assert.deepEqual(points, [100, 50, p.x, p.y]);
});
