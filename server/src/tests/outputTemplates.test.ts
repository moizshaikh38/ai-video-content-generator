/**
 * Output-template registry + apply function: one click owns aspect, framing,
 * captions, hook and transitions through the same data-model channels the
 * individual panels write.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTPUT_TEMPLATES,
  getOutputTemplate,
  applyOutputTemplateToProject,
} from '../shared/outputTemplates.js';
import { CAPTION_PRESETS } from '../shared/captionPresets.js';
import { TEXT_TEMPLATES } from '../shared/textTemplates.js';
import { TRANSITION_PRESETS } from '../shared/transitionPresets.js';

function makeProject(): any {
  return {
    id: 'p1',
    canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration: 12 },
    tracks: [
      {
        id: 'tv', type: 'VIDEO', name: 'Video 1', locked: false, muted: false, hidden: false,
        items: [
          {
            id: 'v1', track_id: 'tv', type: 'VIDEO', timeline_start: 0, timeline_end: 6,
            source_start: 0, source_end: 6, keyframes: [], effects: [],
            crop: { mode: 'fill', focusX: 0.4, focusY: 0.5, scale: 1 },
          },
          {
            id: 'v2', track_id: 'tv', type: 'VIDEO', timeline_start: 6, timeline_end: 12,
            source_start: 6, source_end: 12, keyframes: [], effects: [],
          },
        ],
      },
      {
        id: 'tc', type: 'CAPTION', name: 'Captions', locked: false, muted: false, hidden: false,
        items: [
          {
            id: 'c1', track_id: 'tc', type: 'CAPTION', timeline_start: 0, timeline_end: 12,
            keyframes: [],
            caption: { cues: [{ id: 'q1', start: 0, end: 2, text: 'hello world' }], position: 'bottom', style: 'clean' },
          },
        ],
      },
    ],
    playhead: 0,
    settings: { snapping: true, safe_guides: false, snap_tolerance_sec: 0.1, show_safe_zones: false },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

test('registry: every template references real caption presets, text templates and transitions', () => {
  assert.ok(OUTPUT_TEMPLATES.length >= 4);
  for (const t of OUTPUT_TEMPLATES) {
    assert.ok(CAPTION_PRESETS[t.captions.presetId], `caption preset ${t.captions.presetId}`);
    if (t.hook) assert.ok(TEXT_TEMPLATES.find((x) => x.id === t.hook!.textTemplateId), `hook ${t.hook.textTemplateId}`);
    if (t.transition) assert.ok(TRANSITION_PRESETS.find((x) => x.id === t.transition!.type), `transition ${t.transition!.type}`);
    assert.ok(getOutputTemplate(t.id) === t);
  }
});

test('apply: podcast_split sets 9:16 split layout, captions preset+position, no hook', () => {
  const p = applyOutputTemplateToProject(makeProject(), getOutputTemplate('podcast_split')!);
  assert.equal(p.canvas.aspect_ratio, '9:16');
  assert.equal(p.canvas.width, 1080);
  assert.equal(p.canvas.height, 1920);
  const vids = p.tracks.find((t: any) => t.type === 'VIDEO').items;
  for (const v of vids) {
    assert.equal(v.layout_mode, 'split');
    assert.equal(v.crop.mode, 'fill');
  }
  // User crop focus survives the template.
  assert.equal(vids[0].crop.focusX, 0.4);
  const cap = p.tracks.find((t: any) => t.type === 'CAPTION');
  assert.equal(cap.hidden, false);
  assert.equal(cap.items[0].caption.style, 'compact_creator');
  assert.equal(cap.items[0].caption.position, 'bottom');
  assert.equal(cap.items[0].caption.primary_color, CAPTION_PRESETS.compact_creator.colors.text);
  // Cue text preserved.
  assert.equal(cap.items[0].caption.cues[0].text, 'hello world');
  // No TEXT track created for a hook-less template.
  assert.ok(!p.tracks.some((t: any) => t.type === 'TEXT'));
});

test('apply: creator_vertical inserts exactly one hook and transitions join scenes', () => {
  const p = applyOutputTemplateToProject(makeProject(), getOutputTemplate('creator_vertical')!);
  const textTrack = p.tracks.find((t: any) => t.type === 'TEXT');
  assert.ok(textTrack, 'TEXT track created');
  assert.equal(textTrack.items.length, 1);
  const hook = textTrack.items[0];
  assert.equal(hook.timeline_start, 0);
  assert.equal(hook.timeline_end, 3);
  assert.equal(hook.text.text, 'BREAKING UPDATE');
  const vids = p.tracks.find((t: any) => t.type === 'VIDEO').items;
  assert.equal(vids[0].transition_in, undefined, 'first scene has no incoming transition');
  assert.deepEqual(vids[1].transition_in, { type: 'cross_dissolve', duration: 0.5 });
});

test('apply: re-applying never stacks a duplicate hook', () => {
  const once = applyOutputTemplateToProject(makeProject(), getOutputTemplate('creator_vertical')!);
  const twice = applyOutputTemplateToProject(once, getOutputTemplate('creator_vertical')!);
  const textTrack = twice.tracks.find((t: any) => t.type === 'TEXT');
  assert.equal(textTrack.items.length, 1);
});

test('apply: bold_shorts uses middle captions + zoom joins; clean_landscape is 16:9 fit', () => {
  const bold = applyOutputTemplateToProject(makeProject(), getOutputTemplate('bold_shorts')!);
  assert.equal(bold.tracks.find((t: any) => t.type === 'CAPTION').items[0].caption.position, 'center');
  assert.equal(bold.tracks.find((t: any) => t.type === 'VIDEO').items[1].transition_in.type, 'zoom_lite');
  const land = applyOutputTemplateToProject(makeProject(), getOutputTemplate('clean_landscape')!);
  assert.equal(land.canvas.aspect_ratio, '16:9');
  assert.equal(land.canvas.width, 1920);
  assert.equal(land.tracks.find((t: any) => t.type === 'VIDEO').items[0].crop.mode, 'fit');
});

test('apply: does not mutate the input project', () => {
  const src = makeProject();
  const before = JSON.stringify(src);
  applyOutputTemplateToProject(src, getOutputTemplate('podcast_split')!);
  assert.equal(JSON.stringify(src), before);
});
