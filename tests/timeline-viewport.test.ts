import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimelineViewport } from '../src/timeline-viewport';

test('zoom preserves time under the pointer away from the zero boundary', () => {
  const view = new TimelineViewport();
  view.start = 10;
  const anchorTime = view.start + view.span * 0.7;
  view.zoom(0.2, 0.7);
  assert.equal(view.span, 1);
  assert.ok(Math.abs(view.start + view.span * 0.7 - anchorTime) < 1e-10);
  view.zoom(5, 0.7);
  assert.equal(view.span, 5);
  assert.ok(Math.abs(view.start - 10) < 1e-10);
});

test('pan is continuous and clamps at zero; zoom limits keep a usable scale', () => {
  const view = new TimelineViewport();
  view.pan(1.234);
  assert.equal(view.start, 1.234);
  view.pan(-5);
  assert.equal(view.start, 0);
  view.zoom(0.00001, 0);
  assert.equal(view.span, 0.1);
  view.zoom(1e9, 0);
  assert.equal(view.span, 300);
  view.zoom(NaN);
  view.pan(Infinity);
  assert.equal(view.span, 300);
  assert.equal(view.start, 0);
});

test('revealing the playhead preserves zoom', () => {
  const view = new TimelineViewport();
  view.zoom(0.4, 0);
  view.reveal(10);
  assert.equal(view.span, 2);
  assert.equal(view.start, 9.6);
  view.reveal(0);
  assert.equal(view.start, 0);
});
