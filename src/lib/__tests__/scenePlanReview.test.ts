import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScenePlanReview } from '../../components/editor/ScenePlanReview.js';
import { applyItemLayout } from '../itemLayout.js';
import { FRAMING_WINDOW_PREVIEW_PARITY } from '../../../server/src/shared/framingWindow.js';

const ID = { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 };
const item = (o: any = {}): any => ({ id: 'v1', track_id: 't', type: 'VIDEO', source_asset_id: 'a', source_path: 'p.mp4', timeline_start: 0, timeline_end: 10, source_start: 10, source_end: 20, transform: ID, keyframes: [], effects: [], speed: { speed: 1 }, ...o });
const project = (items: any[]): any => ({ canvas: { aspect_ratio: '9:16' }, tracks: [{ id: 't', type: 'VIDEO', name: 'V', items }] });
const ctx = { clipStartSec: 10, analyzedTrimStart: 0, currentTrimStart: 0, planVersion: 'v', sourceWidth: 854, sourceHeight: 480, sourcePath: 'p.mp4' };
const shots = [{ start: 2, end: 6, kind: 'solo' as const, windowW: 0.5, windowH: 0.6, keyframes: [{ time: 2, centerX: 0.4, centerY: 0.5 }] }];
const html = (p: any, o: any = {}) => renderToStaticMarkup(React.createElement(ScenePlanReview as any, { project: p, shots, ctx, previewReady: true, onApply: () => ({ ok: true }), ...o }));

test('preview integration is enabled, but callers can still disable Apply', () => {
  assert.equal(FRAMING_WINDOW_PREVIEW_PARITY, true);
  const h = html(project([item()]), { previewReady: false });
  assert.match(h, /scene-plan-preview-note/); assert.match(h, /disabled=""[^>]*>Apply to this scene/);
});
test('nothing renders without a stored plan or source size', () => {
  assert.equal(html(project([item()]), { shots: null }), ''); assert.equal(html(project([item()]), { ctx: null }), ''); assert.equal(html(project([item()]), { shots: [] }), '');
});
test('plain scene: Apply enabled (preview ready); no bulk/apply-all control exists', () => {
  const h = html(project([item()]));
  assert.match(h, /Apply to this scene/); assert.doesNotMatch(h, /disabled=""[^>]*>Apply to this scene/); assert.doesNotMatch(h, /Apply all|all scenes/i);
  assert.match(h, /does not check what is on screen/); assert.match(h, /shared across the whole clip/);
});
test('conflicting crop/panels/tracker show Replace this scene framing..., never a direct Apply', () => {
  for (const o of [{ crop: { mode: 'blur' } }, { panels: { layout: 'three' } }, { tracker: { enabled: true } }]) {
    const h = html(project([item(o)]));
    assert.match(h, /Replace this scene framing/); assert.doesNotMatch(h, />Apply to this scene</);
  }
});
test('blocked scenes show the reason: speed, stale trim, non-identity transform, unresolved', () => {
  assert.match(html(project([item({ speed: { speed: 2 } })])), /scene-plan-reason/);
  assert.match(html(project([item()]), { ctx: { ...ctx, currentTrimStart: 1 } }), /stale/);
  assert.match(html(project([item({ transform: { ...ID, scale: 2 } })])), /non-identity transform/);
  const h = html(project([item()]), { shots: [{ ...shots[0], contextStatus: 'unresolved-review-required' }] });
  assert.match(h, /unresolved/); assert.match(h, /disabled=""/);
});
test('malformed materialized field is not shown as a window set', () => {
  assert.doesNotMatch(html(project([item({ source_start: 12, source_end: 16, framing_window: { version: 1 } })])), /Window set/);
});
test('applyItemLayout removes framing_window (layout pick replaces it)', () => {
  const p = project([item({ framing_window: { version: 1 } })]);
  for (const l of ['fill', 'fit', 'blur', 'split', 'three'] as const) assert.equal((applyItemLayout(p, 'v1', l).tracks[0].items[0] as any).framing_window, undefined, l);
});
