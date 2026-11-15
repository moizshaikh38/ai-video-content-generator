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

test('resolved preset marginV anchors the bottom edge at positionY (export parity)', async () => {
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

  // ASS export must request bold for Arial Black so fontconfig resolves a heavy face
  // (matches the browser CSS font-weight:900 fallback); see shared/captionPresets.
  const { buildPresetAssStyleLine } = await import("../shared/captionPresets.js");
  const line = buildPresetAssStyleLine(style!);
  assert.equal(line.split(",")[7], "1");
});

test('auto-headline mapping: untouched omits overlayConfig, deleted sets enabled:false, edited sends text', async () => {
  const { buildClipEditorUpdatePayload } = await import('../../../src/lib/editorSavePayload.js');
  const mkProject = (textItems: any[]) => ({
    canvas: { aspect_ratio: '9:16' },
    tracks: [
      { type: 'VIDEO', items: [{ id: 'v1', hidden: false, source_start: 0, source_end: 10, timeline_start: 0, timeline_end: 10 }] },
      { type: 'TEXT', items: textItems },
    ],
  });
  const clip = { title: 'The Crewed Lunar Vehicle: A New Frontier', end_seconds: 10 } as any;
  const capped = 'The Crewed Lunar Vehicle: A New Frontier';
  // Untouched auto-headline item -> no overlayConfig in payload (legacy auto-headline keeps firing)
  const untouched = buildClipEditorUpdatePayload(mkProject([
    { id: 't1', hidden: false, text: { text: capped, auto_headline: true } },
  ]) as any, clip);
  assert.equal(untouched.overlayConfig, undefined);
  // Deleted (no text items at all) -> enabled:false persisted so export suppresses the headline
  const deleted = buildClipEditorUpdatePayload(mkProject([]) as any, clip);
  assert.deepEqual(deleted.overlayConfig, { enabled: false, text: '' });
  // Edited headline text -> enabled:true with the new text
  const edited = buildClipEditorUpdatePayload(mkProject([
    { id: 't1', hidden: false, text: { text: 'A Better Title', auto_headline: true } },
  ]) as any, clip);
  assert.deepEqual(edited.overlayConfig, { enabled: true, text: 'A Better Title' });
  // User-added text item with the auto item removed keeps the suppression (no resurrection)
  const replaced = buildClipEditorUpdatePayload(mkProject([
    { id: 't2', hidden: false, text: { text: 'Custom overlay' } },
  ]) as any, clip);
  assert.equal(replaced.overlayConfig, undefined, 'custom item present: leave overlay state alone');
});
