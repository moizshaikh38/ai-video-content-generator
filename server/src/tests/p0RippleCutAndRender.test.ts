import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  applyRippleCutToProject,
  applyBatchRippleCuts,
} from '../utils/editorRippleCut.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import { EditorProject, EditorTrackItem } from '../types/index.js';

describe('Phase P0: Ripple-Cut Algorithm & Render Pipeline Integrity', () => {
  function createTestProject(): EditorProject {
    const videoTrackId = crypto.randomUUID();
    const videoItemId = crypto.randomUUID();
    const captionTrackId = crypto.randomUUID();
    const captionItemId = crypto.randomUUID();
    const mockClipId = crypto.randomUUID();

    const videoItem: EditorTrackItem = {
      id: videoItemId,
      track_id: videoTrackId,
      type: 'VIDEO',
      source_asset_id: mockClipId,
      source_path: 'source/test.mp4',
      timeline_start: 0,
      timeline_end: 30.0,
      source_start: 0,
      source_end: 30.0,
      transform: {
        position_x: 0,
        position_y: 0,
        scale: 1.0,
        rotation: 0,
        opacity: 1.0,
      },
      crop: { mode: 'fill', focusX: 0.5, focusY: 0.5 },
      speed: { speed: 1.0, pitch_preserved: true },
      audio: {
        volume: 1.0,
        fade_in: 0,
        fade_out: 0,
        normalized: true,
        target_lufs: -16,
      },
      effects: [],
      keyframes: [],
      locked: false,
      muted: false,
      hidden: false,
      z_index: 0,
    };

    const captionItem: EditorTrackItem = {
      id: captionItemId,
      track_id: captionTrackId,
      type: 'CAPTION',
      source_asset_id: mockClipId,
      source_path: '',
      timeline_start: 0,
      timeline_end: 30.0,
      source_start: 0,
      source_end: 30.0,
      transform: {
        position_x: 0,
        position_y: 0,
        scale: 1.0,
        rotation: 0,
        opacity: 1.0,
      },
      crop: { mode: 'fill', focusX: 0.5, focusY: 0.5 },
      speed: { speed: 1.0, pitch_preserved: true },
      audio: { volume: 1.0, fade_in: 0, fade_out: 0, normalized: false },
      caption: {
        style: 'clean',
        position: 'bottom',
        highlight_color: '#FACC15',
        primary_color: '#FFFFFF',
        cues: [
          {
            id: 'cue_1',
            start: 1.0,
            end: 4.5,
            text: 'Welcome to the future of AI video',
            words: [
              { text: 'Welcome', word: 'Welcome', start: 1.0, end: 1.5 },
              { text: 'to', word: 'to', start: 1.6, end: 1.8 },
              { text: 'the', word: 'the', start: 1.9, end: 2.1 },
              { text: 'future', word: 'future', start: 2.2, end: 2.8 },
              { text: 'of', word: 'of', start: 2.9, end: 3.1 },
              { text: 'AI', word: 'AI', start: 3.2, end: 3.6 },
              { text: 'video', word: 'video', start: 3.7, end: 4.5 },
            ],
          },
          {
            id: 'cue_2_mistake',
            start: 5.0,
            end: 7.0,
            text: 'Um uh let me restart that sentence',
            words: [
              { text: 'Um', word: 'Um', start: 5.0, end: 5.3 },
              { text: 'uh', word: 'uh', start: 5.4, end: 5.7 },
              { text: 'let', word: 'let', start: 5.8, end: 6.0 },
              { text: 'me', word: 'me', start: 6.1, end: 6.2 },
              { text: 'restart', word: 'restart', start: 6.3, end: 6.7 },
              { text: 'that', word: 'that', start: 6.8, end: 7.0 },
            ],
          },
          {
            id: 'cue_3',
            start: 8.0,
            end: 12.0,
            text: 'VireoClip generates viral clips automatically',
            words: [
              { text: 'VireoClip', word: 'VireoClip', start: 8.0, end: 8.8 },
              { text: 'generates', word: 'generates', start: 8.9, end: 9.4 },
              { text: 'viral', word: 'viral', start: 9.5, end: 9.9 },
              { text: 'clips', word: 'clips', start: 10.0, end: 10.5 },
              { text: 'automatically', word: 'automatically', start: 10.6, end: 12.0 },
            ],
          },
        ],
      },
      effects: [],
      keyframes: [],
      locked: false,
      muted: false,
      hidden: false,
      z_index: 1,
    };

    return {
      id: crypto.randomUUID(),
      user_id: crypto.randomUUID(),
      project_id: crypto.randomUUID(),
      clip_id: mockClipId,
      version: 1,
      status: 'draft',
      title: 'P0 Ripple Cut Test Project',
      canvas: {
        width: 1080,
        height: 1920,
        aspect_ratio: '9:16',
        fps: 30,
        duration: 30.0,
        background_color: '#000000',
        background_mode: 'color',
      },
      tracks: [
        {
          id: videoTrackId,
          type: 'VIDEO',
          name: 'Main Video Track',
          locked: false,
          muted: false,
          hidden: false,
          items: [videoItem],
        },
        {
          id: captionTrackId,
          type: 'CAPTION',
          name: 'Subtitles',
          locked: false,
          muted: false,
          hidden: false,
          items: [captionItem],
        },
      ],
      playhead: 0,
      settings: {
        snapping: true,
        snap_tolerance_sec: 0.1,
        safe_guides: true,
        show_safe_zones: true,
      },
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  // --- Task P0.1 Tests: Media Slicing & Caption Synchronization ---

  it('P0.1.1: Slicing a continuous 0-30s video at 5.0-7.0s produces exactly 2 split items (0-5s and 5-28s) with source_start=7.0s', () => {
    const project = createTestProject();
    const result = applyRippleCutToProject(project, 5.0, 7.0);

    // Canvas duration should decrease by 2.0s
    assert.equal(result.canvas.duration, 28.0);

    const videoTrack = result.tracks.find((t) => t.type === 'VIDEO')!;
    assert.equal(videoTrack.items.length, 2, 'Video track must have exactly 2 items after slicing');

    const [leftItem, rightItem] = videoTrack.items;

    // First item: 0 to 5s
    assert.equal(leftItem.timeline_start, 0);
    assert.equal(leftItem.timeline_end, 5.0);
    assert.equal(leftItem.source_start, 0);
    assert.equal(leftItem.source_end, 5.0);

    // Second item: 5 to 28s with source starting at 7s
    assert.equal(rightItem.timeline_start, 5.0);
    assert.equal(rightItem.timeline_end, 28.0);
    assert.equal(rightItem.source_start, 7.0);
    assert.equal(rightItem.source_end, 30.0);
  });

  it('P0.1.2: Caption track drops the cut cue (5-7s) and shifts subsequent cue (8-12s) to (6-10s) with aligned word tokens', () => {
    const project = createTestProject();
    const result = applyRippleCutToProject(project, 5.0, 7.0);

    const captionTrack = result.tracks.find((t) => t.type === 'CAPTION')!;
    const cues = captionTrack.items[0].caption!.cues;

    assert.equal(cues.length, 2, 'Deleted cue must be dropped completely');

    // Cue 1 (before cut) must be untouched
    assert.equal(cues[0].id, 'cue_1');
    assert.equal(cues[0].start, 1.0);
    assert.equal(cues[0].end, 4.5);
    assert.equal(cues[0].words![0].start, 1.0);

    // Cue 3 (after cut) must be shifted left by 2.0s: 8.0s -> 6.0s, 12.0s -> 10.0s
    assert.equal(cues[1].id, 'cue_3');
    assert.equal(cues[1].start, 6.0);
    assert.equal(cues[1].end, 10.0);

    // All nested words in Cue 3 must be shifted by exactly 2.0s
    assert.equal(cues[1].words![0].text, 'VireoClip');
    assert.equal(cues[1].words![0].start, 6.0); // 8.0 - 2.0
    assert.equal(cues[1].words![0].end, 6.8);   // 8.8 - 2.0

    assert.equal(cues[1].words![4].text, 'automatically');
    assert.equal(cues[1].words![4].start, 8.6);  // 10.6 - 2.0
    assert.equal(cues[1].words![4].end, 10.0);  // 12.0 - 2.0
  });

  it('P0.1.3: Trimming left-overlapping and right-overlapping media items', () => {
    const project = createTestProject();
    // Pre-split the video track into two items: 0-10s and 10-30s
    const videoTrack = project.tracks.find((t) => t.type === 'VIDEO')!;
    videoTrack.items = [
      {
        ...videoTrack.items[0],
        timeline_start: 0,
        timeline_end: 10.0,
        source_start: 0,
        source_end: 10.0,
      },
      {
        ...videoTrack.items[0],
        id: crypto.randomUUID(),
        timeline_start: 10.0,
        timeline_end: 30.0,
        source_start: 10.0,
        source_end: 30.0,
      },
    ];

    // Cut a range that straddles the seam: 8.0s to 14.0s (duration = 6.0s)
    const result = applyRippleCutToProject(project, 8.0, 14.0);
    const updatedItems = result.tracks.find((t) => t.type === 'VIDEO')!.items;

    assert.equal(updatedItems.length, 2);
    // Left item: trimmed to 8.0s
    assert.equal(updatedItems[0].timeline_start, 0);
    assert.equal(updatedItems[0].timeline_end, 8.0);
    assert.equal(updatedItems[0].source_end, 8.0);

    // Right item: trimmed on left edge by 4s (from 10 to 14), shifted to start at 8.0s
    assert.equal(updatedItems[1].timeline_start, 8.0);
    assert.equal(updatedItems[1].timeline_end, 24.0); // 30 - 6
    assert.equal(updatedItems[1].source_start, 14.0);
    assert.equal(updatedItems[1].source_end, 30.0);
  });

  it('P0.1.4: Batch ripple cuts 3 pauses in reverse order without coordinate corruption', () => {
    const project = createTestProject();
    const pauses = [
      { startSec: 4.5, endSec: 5.0 }, // 0.5s pause
      { startSec: 7.0, endSec: 8.0 }, // 1.0s pause
      { startSec: 15.0, endSec: 16.5 }, // 1.5s pause
    ]; // Total cut duration = 3.0s

    const result = applyBatchRippleCuts(project, pauses);
    assert.equal(result.canvas.duration, 27.0);

    const videoTrack = result.tracks.find((t) => t.type === 'VIDEO')!;
    // 3 cuts across a single continuous video item creates 4 pieces
    assert.equal(videoTrack.items.length, 4);

    // Piece 1: 0 to 4.5s
    assert.equal(videoTrack.items[0].timeline_start, 0);
    assert.equal(videoTrack.items[0].timeline_end, 4.5);
    assert.equal(videoTrack.items[0].source_start, 0);
    assert.equal(videoTrack.items[0].source_end, 4.5);

    // Piece 2: 4.5s to 6.5s (original 5.0 to 7.0s)
    assert.equal(videoTrack.items[1].timeline_start, 4.5);
    assert.equal(videoTrack.items[1].timeline_end, 6.5);
    assert.equal(videoTrack.items[1].source_start, 5.0);
    assert.equal(videoTrack.items[1].source_end, 7.0);

    // Piece 3: 6.5s to 13.5s (original 8.0 to 15.0s)
    assert.equal(videoTrack.items[2].timeline_start, 6.5);
    assert.equal(videoTrack.items[2].timeline_end, 13.5);
    assert.equal(videoTrack.items[2].source_start, 8.0);
    assert.equal(videoTrack.items[2].source_end, 15.0);

    // Piece 4: 13.5s to 27.0s (original 16.5 to 30.0s)
    assert.equal(videoTrack.items[3].timeline_start, 13.5);
    assert.equal(videoTrack.items[3].timeline_end, 27.0);
    assert.equal(videoTrack.items[3].source_start, 16.5);
    assert.equal(videoTrack.items[3].source_end, 30.0);
  });

  // --- Task P0.2 Tests: Render Pipeline Detection ---

  it('P0.2.1: ClipRenderService.hasCustomProEdits returns TRUE when video track has multiple items (from cuts/splits)', () => {
    const project = createTestProject();
    const sliced = applyRippleCutToProject(project, 5.0, 7.0);

    const isCustom = ClipRenderService.hasCustomProEdits(sliced);
    assert.equal(isCustom, true, 'hasCustomProEdits must return true for sliced video tracks');
  });

  it('P0.2.2: ClipRenderService.hasCustomProEdits returns TRUE when video item has custom speed or volume', () => {
    const project = createTestProject();
    project.tracks[0].items[0].speed = { speed: 1.25, pitch_preserved: true };

    const isCustom = ClipRenderService.hasCustomProEdits(project);
    assert.equal(isCustom, true, 'hasCustomProEdits must return true for custom speed');
  });

  it('P0.2.3: ClipRenderService.hasCustomProEdits returns FALSE for an untouched, unedited single video track', () => {
    const project = createTestProject();
    // Default clip mock
    const clipMock = {
      start_seconds: 0,
      trim_start_offset: 0,
    };

    const isCustom = ClipRenderService.hasCustomProEdits(project, clipMock);
    assert.equal(isCustom, false, 'hasCustomProEdits must return false for pristine unedited clip');
  });
});
