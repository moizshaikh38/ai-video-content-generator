/**
 * Deterministic preview-card placement: guards that every AI tool's card is positioned by the
 * same rules and stays inside the viewport. Imports the frontend pure module directly (same
 * cross-tree pattern as the other shared modules) and runs under the backend test runner.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePreviewPlacement } from '../../../src/lib/aiToolPreviewPlacement.js';

const CARD = { cardWidth: 248, cardHeight: 300 };
const VIEWPORT = { width: 1440, height: 900 };

/** The normal editor layout: inspector (and its tool rows) docked on the right. */
function rightDockedRow(top: number) {
  return { top, left: 1040, right: 1420, bottom: top + 44 };
}

describe('computePreviewPlacement', () => {
  it('opens to the LEFT of a right-docked row when there is room', () => {
    const p = computePreviewPlacement({ ...CARD, viewport: VIEWPORT, row: rightDockedRow(200) });
    assert.equal(p.side, 'left');
    // 1040 - 12 gap - 248 width = 780
    assert.equal(p.left, 780);
  });

  it('aligns the card top to the row top when it fits', () => {
    const p = computePreviewPlacement({ ...CARD, viewport: VIEWPORT, row: rightDockedRow(200) });
    assert.equal(p.top, 200);
  });

  it('flips to the RIGHT when the left has no room', () => {
    const row = { top: 150, left: 60, right: 320, bottom: 194 };
    const p = computePreviewPlacement({ ...CARD, viewport: VIEWPORT, row });
    assert.equal(p.side, 'right');
    assert.equal(p.left, 332); // 320 + 12
    assert.ok(p.left + CARD.cardWidth <= VIEWPORT.width - 8, 'card stays on screen');
  });

  it('never lets the card clip the bottom edge', () => {
    const p = computePreviewPlacement({ ...CARD, viewport: VIEWPORT, row: rightDockedRow(850) });
    const maxTop = VIEWPORT.height - CARD.cardHeight - 8; // 592
    assert.equal(p.top, maxTop);
    assert.ok(p.top + CARD.cardHeight <= VIEWPORT.height);
  });

  it('never lets the card clip the top edge', () => {
    const p = computePreviewPlacement({ ...CARD, viewport: VIEWPORT, row: rightDockedRow(-40) });
    assert.equal(p.top, 8); // clamped to margin
  });

  it('clamps a card taller than the viewport to the top margin', () => {
    const p = computePreviewPlacement({
      cardWidth: 248,
      cardHeight: 2000,
      viewport: VIEWPORT,
      row: rightDockedRow(400),
    });
    assert.equal(p.top, 8);
  });

  it('on a narrow viewport where neither side fits, keeps the card fully on-screen', () => {
    const narrow = { width: 360, height: 740 };
    const row = { top: 300, left: 150, right: 330, bottom: 344 };
    const p = computePreviewPlacement({ ...CARD, viewport: narrow, row });
    assert.ok(p.left >= 8, 'left within margin');
    assert.ok(p.left + CARD.cardWidth <= narrow.width - 8 + 0.001, 'right within margin');
  });

  it('is deterministic — same input yields same output', () => {
    const input = { ...CARD, viewport: VIEWPORT, row: rightDockedRow(200) };
    assert.deepEqual(computePreviewPlacement(input), computePreviewPlacement(input));
  });
});
