import test from 'node:test';
import assert from 'node:assert/strict';
import { placePopover } from '../src/lib/popover-position.ts';

test('menu aligns with its trigger when space is available', () => {
  const result = placePopover({ left: 100, top: 100, bottom: 142, width: 180 }, { width: 200, height: 160 }, { width: 1280, height: 800 });
  assert.equal(result.left, 100);
  assert.equal(result.top, 148);
  assert.equal(result.placement, 'bottom');
});
test('a menu near the bottom flips without leaving the viewport', () => {
  const result = placePopover({ left: 270, top: 540, bottom: 582, width: 90 }, { width: 240, height: 240 }, { width: 360, height: 640 });
  assert.equal(result.placement, 'top');
  assert.ok(result.left >= 8);
  assert.ok(result.left + result.width <= 352);
  assert.ok(result.top + result.height <= 632);
});
test('oversized content is bounded at 320px and short viewport heights', () => {
  const result = placePopover({ left: 16, top: 160, bottom: 202, width: 280 }, { width: 480, height: 600 }, { width: 320, height: 360 });
  assert.equal(result.width, 304);
  assert.ok(result.top >= 8);
  assert.ok(result.top + result.height <= 352);
});
