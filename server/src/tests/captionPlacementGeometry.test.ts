import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorCaptionToPresetOverrides, resolveEditorCaptionStyle } from '../../../src/lib/captionPresets';

// Geometry contract: caption placement must match between the studio preview and
// the FFmpeg/ASS export (ASS \an2 + marginV / \pos anchor the block's BOTTOM edge;
// track transforms are pixel offsets from the canvas center on a 1080x1920 canvas).

test('transform pixel offsets map to center-origin fractions (proEditorService shape)', () => {
  // Fresh studio clips store transform {x: 0, y: 500} = centered, 500px below canvas center.
  const o = editorCaptionToPresetOverrides({ cues: [] } as any, { position_x: 0, position_y: 500 });
  assert.ok(Math.abs((o.positionY ?? 0) - (0.5 + 500 / 1920)) < 1e-9, `positionY ${o.positionY}`);
  assert.ok(Math.abs((o.positionX ?? 0) - 0.5) < 1e-9, `positionX ${o.positionX}`);
});

test('transform zero stays centered, not clamped to the frame edge', () => {
  const o = editorCaptionToPresetOverrides({ cues: [] } as any, { position_x: 0, position_y: 0 });
  assert.equal(o.positionX, 0.5);
  assert.equal(o.positionY, 0.5);
});

test('explicit caption.position_y passes through unchanged (intentional saved position)', () => {
  const o = editorCaptionToPresetOverrides(
    { cues: [], position_y: 0.7, position_x: 0.4 } as any,
    { position_x: 0, position_y: 500 }
  );
  assert.equal(o.positionY, 0.7);
  assert.equal(o.positionX, 0.4);
});

test('resolved preset marginV anchors the bottom edge at positionY (export parity)', () => {
  const style = resolveEditorCaptionStyle(
    { cues: [], style: 'karaoke' } as any,
    '9:16',
    { position_x: 0, position_y: 500 }
  );
  assert.ok(style, 'style resolves');
  // sanitizePresetOverrides rounds positionY to 3 decimals (0.760) before marginV is derived.
  const expectedMarginV = Math.round(style!.playResY * (1 - 0.76));
  assert.equal(style!.marginV, expectedMarginV);
  assert.equal(style!.alignment, 2); // bottom-center: block bottom edge sits at playResY - marginV
});
