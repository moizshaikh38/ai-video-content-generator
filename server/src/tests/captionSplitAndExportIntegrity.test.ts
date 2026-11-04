import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  partitionCaptionCues,
  sliceAndShiftCues,
  applyRippleCutToProject,
} from '../utils/editorRippleCut.js';
import { CaptionService } from '../services/captionService.js';
import {
  EditorProject,
  TimedCaptionCue,
  ClipRecord,
} from '../types/index.js';

describe('VireoClip Phase 2A — Caption Split and Export Integrity', () => {
  // Helper to generate sample word-level cues
  const createSampleCues = (): TimedCaptionCue[] => [
    {
      id: 'cue-1',
      start: 1.0,
      end: 4.0,
      text: 'WELCOME TO VIREOCLIP',
      words: [
        { word: 'WELCOME', text: 'WELCOME', start: 1.0, end: 1.8 },
        { word: 'TO', text: 'TO', start: 2.0, end: 2.5 },
        { word: 'VIREOCLIP', text: 'VIREOCLIP', start: 2.8, end: 4.0 },
      ],
      style: 'bold',
      position: 'bottom',
    },
    {
      id: 'cue-2',
      start: 8.0,
      end: 12.0,
      text: 'VIRAL HOOKS THAT POP',
      words: [
        { word: 'VIRAL', text: 'VIRAL', start: 8.0, end: 8.8 },
        { word: 'HOOKS', text: 'HOOKS', start: 9.0, end: 9.8 },
        { word: 'THAT', text: 'THAT', start: 10.2, end: 10.8 },
        { word: 'POP', text: 'POP', start: 11.0, end: 11.9 },
      ],
      style: 'karaoke',
      position: 'bottom',
      highlight_color: '#FFE600',
    },
    {
      id: 'cue-3',
      start: 14.0,
      end: 18.0,
      text: 'CREATE MORE SHORTS',
      words: [
        { word: 'CREATE', text: 'CREATE', start: 14.0, end: 15.0 },
        { word: 'MORE', text: 'MORE', start: 15.2, end: 16.0 },
        { word: 'SHORTS', text: 'SHORTS', start: 16.5, end: 18.0 },
      ],
      style: 'bold',
      position: 'bottom',
    },
  ];

  // Helper to build a sample EditorProject
  const buildSampleProject = (captionItems: any[]): EditorProject => ({
    id: 'proj-split-test',
    user_id: 'test-user',
    clip_id: 'test-clip-123',
    name: 'Caption Split Test Project',
    canvas: {
      width: 1080,
      height: 1920,
      fps: 30,
      aspect_ratio: '9:16',
      duration: 30,
    },
    tracks: [
      {
        id: 'track-v1',
        type: 'VIDEO',
        name: 'Primary Video',
        items: [
          {
            id: 'video-1',
            track_id: 'track-v1',
            type: 'VIDEO',
            name: 'Video 1',
            timeline_start: 0,
            timeline_end: 30,
            source_start: 0,
            source_end: 30,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            speed: { speed: 1, pitch_preserved: true },
            effects: [],
            keyframes: [],
            locked: false,
            muted: false,
            hidden: false,
            z_index: 1,
          },
        ],
        locked: false,
        hidden: false,
        muted: false,
        z_index: 1,
      },
      {
        id: 'track-c1',
        type: 'CAPTION',
        name: 'Captions',
        items: captionItems,
        locked: false,
        hidden: false,
        muted: false,
        z_index: 10,
      },
    ],
    settings: {
      snap_enabled: true,
      auto_ripple: true,
      safe_zone_indicator: true,
    },
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // ── TEST 1: Caption item split into two segments ───────────────────────────
  it('1. partitions cues correctly between left and right items when split between cues', () => {
    const cues = createSampleCues();
    // Split at 6.0s (between cue-1 [1-4s] and cue-2 [8-12s])
    const { leftCues, rightCues } = partitionCaptionCues(cues, 6.0, 0);

    assert.equal(leftCues.length, 1, 'Left item should contain exactly 1 cue');
    assert.equal(leftCues[0].id, 'cue-1');
    assert.equal(leftCues[0].text, 'WELCOME TO VIREOCLIP');

    assert.equal(rightCues.length, 2, 'Right item should contain exactly 2 cues');
    assert.equal(rightCues[0].id, 'cue-2');
    assert.equal(rightCues[1].id, 'cue-3');
    assert.equal(rightCues[0].text, 'VIRAL HOOKS THAT POP');
    assert.equal(rightCues[1].text, 'CREATE MORE SHORTS');
  });

  // ── TEST 2: Cues before, after, and across the split boundary ──────────────
  it('2. handles cues straddling the split boundary by partitioning word tokens and preserving metadata', () => {
    const cues = createSampleCues();
    // Split at 10.0s (splits cue-2: "VIRAL HOOKS" at 8-9.8s vs "THAT POP" at 10.2-11.9s)
    const { leftCues, rightCues } = partitionCaptionCues(cues, 10.0, 0);

    // Left cues: cue-1 + left slice of cue-2
    assert.equal(leftCues.length, 2, 'Left item should receive cue-1 and left slice of cue-2');
    assert.equal(leftCues[0].id, 'cue-1');
    assert.equal(leftCues[1].id, 'cue-2');
    assert.equal(leftCues[1].text, 'VIRAL HOOKS');
    assert.equal(leftCues[1].words?.length, 2);
    assert.equal(leftCues[1].style, 'karaoke', 'Preserves caption styling');
    assert.equal(leftCues[1].highlight_color, '#FFE600', 'Preserves highlight color metadata');
    assert.ok(leftCues[1].end <= 10.0, 'Left cue end must be clamped to split point');

    // Right cues: right slice of cue-2 + cue-3
    assert.equal(rightCues.length, 2, 'Right item should receive right slice of cue-2 and cue-3');
    assert.equal(rightCues[0].id, 'cue-2_split');
    assert.equal(rightCues[0].text, 'THAT POP');
    assert.equal(rightCues[0].words?.length, 2);
    assert.equal(rightCues[0].style, 'karaoke', 'Preserves caption styling on right split');
    assert.equal(rightCues[0].highlight_color, '#FFE600');
    assert.ok(rightCues[0].start >= 10.0, 'Right cue start must be at or after split point');
    assert.equal(rightCues[1].id, 'cue-3');
    assert.equal(rightCues[1].text, 'CREATE MORE SHORTS');
  });

  // ── TEST 3: Segment-relative cue timing translation ────────────────────────
  it('3. correctly translates cue timestamps when right item uses segment-relative timing', () => {
    const cues = createSampleCues();
    // Split at 10.0s with segmentRelativeRight: true
    const { rightCues } = partitionCaptionCues(cues, 10.0, 0, { segmentRelativeRight: true });

    assert.equal(rightCues.length, 2);
    // Original cue-2 right slice had start: 10.2s, end: 11.9s. In segment-relative, start becomes 0.2s, end becomes 1.9s
    assert.equal(rightCues[0].start, 0.2);
    assert.equal(rightCues[0].end, 1.9);
    assert.equal(rightCues[0].words?.[0].start, 0.2);

    // Original cue-3 had start: 14.0s, end: 18.0s. In segment-relative, start becomes 4.0s, end becomes 8.0s
    assert.equal(rightCues[1].start, 4.0);
    assert.equal(rightCues[1].end, 8.0);
  });

  // ── TEST 4: Export from multiple caption items with timeline offsets ───────
  it('4. aggregates cues from multiple caption items with non-zero timeline offsets', () => {
    const cues = createSampleCues();
    const { leftCues, rightCues } = partitionCaptionCues(cues, 10.0, 0, { segmentRelativeRight: true });

    // Item 1: 0 to 10s with leftCues (timeline-absolute [0-10])
    // Item 2: 10 to 30s with rightCues (segment-relative [0-20])
    const captionItems = [
      {
        id: 'cap-seg-1',
        track_id: 'track-c1',
        type: 'CAPTION',
        name: 'Caption Segment 1',
        timeline_start: 0,
        timeline_end: 10,
        caption: {
          style: 'karaoke',
          cues: leftCues,
        },
      },
      {
        id: 'cap-seg-2',
        track_id: 'track-c1',
        type: 'CAPTION',
        name: 'Caption Segment 2',
        timeline_start: 10,
        timeline_end: 30,
        caption: {
          style: 'karaoke',
          cues: rightCues,
        },
      },
    ];

    const project = buildSampleProject(captionItems);
    const extracted = CaptionService.extractEditorCuesFromProject(project);

    assert.ok(extracted, 'Should extract cues from project');
    assert.equal(extracted.cues.length, 4, 'Should aggregate 4 cues total (1 + 1 + 1 + 1)');
    assert.equal(extracted.cues[0].text, 'WELCOME TO VIREOCLIP');
    assert.equal(extracted.cues[1].text, 'VIRAL HOOKS');
    assert.equal(extracted.cues[2].text, 'THAT POP');
    assert.equal(extracted.cues[3].text, 'CREATE MORE SHORTS');

    // Verify translated absolute timestamps for segment 2 cues
    assert.equal(extracted.cues[2].start, 10.2, 'Segment 2 relative 0.2s translated to timeline 10.2s');
    assert.equal(extracted.cues[2].end, 11.9);
    assert.equal(extracted.cues[3].start, 14.0, 'Segment 2 relative 4.0s translated to timeline 14.0s');
    assert.equal(extracted.cues[3].end, 18.0);
  });

  // ── TEST 5: Ripple deletion preserving and shifting surviving cues ─────────
  it('5. preserves and shifts surviving cues and track items during ripple delete', () => {
    const cues = createSampleCues();
    const captionItem = {
      id: 'cap-item-full',
      track_id: 'track-c1',
      type: 'CAPTION',
      timeline_start: 0,
      timeline_end: 30,
      caption: {
        style: 'bold',
        cues,
      },
    };

    const project = buildSampleProject([captionItem]);

    // Ripple delete range 6.0s to 13.0s (cuts out cue-2 entirely, cutDuration = 7.0s)
    const cutStart = 6.0;
    const cutEnd = 13.0;
    const cutDuration = 7.0;

    const rippledProject = applyRippleCutToProject(project, cutStart, cutEnd);
    const rippledCues = sliceAndShiftCues(cues, cutStart, cutEnd, cutDuration);

    // Canvas duration should decrease by 7.0s
    assert.equal(rippledProject.canvas.duration, 23.0);

    // Caption item duration should decrease by 7.0s
    const capTrack = rippledProject.tracks.find((t) => t.type === 'CAPTION');
    assert.equal(capTrack?.items[0].timeline_end, 23.0);

    // Cue assertions
    assert.equal(rippledCues.length, 2, 'Cue 2 dropped; Cue 1 and Cue 3 survive');
    assert.equal(rippledCues[0].id, 'cue-1');
    assert.equal(rippledCues[0].start, 1.0, 'Cue 1 before cut remains at 1.0s');

    assert.equal(rippledCues[1].id, 'cue-3');
    assert.equal(rippledCues[1].start, 7.0, 'Cue 3 originally at 14.0s shifted left by 7.0s to 7.0s');
    assert.equal(rippledCues[1].end, 11.0, 'Cue 3 originally at 18.0s shifted left by 7.0s to 11.0s');
    assert.equal(rippledCues[1].words?.[0].start, 7.0, 'Nested words also shifted left by 7.0s');

    // Both project caption item cues and direct sliceAndShiftCues must match
    assert.deepEqual(capTrack?.items[0].caption?.cues, rippledCues);
  });

  // ── TEST 6: No duplicate or missing cues after split/delete/export ──────────
  it('6. prevents duplicate cues when adjacent items share boundaries or copy-pasted IDs', () => {
    const cues = createSampleCues();

    // Emulate old unpruned state where both split items received identical cues
    const captionItems = [
      {
        id: 'item-left',
        timeline_start: 0,
        timeline_end: 10,
        caption: {
          style: 'bold',
          cues: [cues[0], cues[1]], // cue-1 and cue-2
        },
      },
      {
        id: 'item-right',
        timeline_start: 10,
        timeline_end: 30,
        caption: {
          style: 'bold',
          cues: [cues[1], cues[2]], // duplicate cue-2 and cue-3
        },
      },
    ];

    const project = buildSampleProject(captionItems);
    const extracted = CaptionService.extractEditorCuesFromProject(project);

    assert.ok(extracted);
    // cue-2 has end: 12.0s, start: 8.0s.
    // In item-right (timeline_start 10s), cue-2 starts at 8.0s, but de-duplication drops the duplicate!
    const uniqueIds = new Set(extracted.cues.map((c) => c.id));
    assert.equal(uniqueIds.size, extracted.cues.length, 'Aggregated cues must contain zero duplicate IDs');
    assert.equal(extracted.cues.length, 3, 'Must contain exactly the 3 distinct cues without duplication');
  });

  // ── TEST 7: Backward compatibility with a single unsplit caption item ──────
  it('7. maintains 100% backward compatibility with a single unsplit caption item', () => {
    const cues = createSampleCues();
    const captionItem = {
      id: 'cap-single',
      track_id: 'track-c1',
      type: 'CAPTION',
      timeline_start: 0,
      timeline_end: 30,
      caption: {
        style: 'beasty',
        position: 'center',
        cues,
      },
    };

    const project = buildSampleProject([captionItem]);
    const extracted = CaptionService.extractEditorCuesFromProject(project);

    assert.ok(extracted);
    assert.equal(extracted.style, 'beasty');
    assert.equal(extracted.position, 'center');
    assert.equal(extracted.cues.length, 3);
    assert.deepEqual(extracted.cues, cues, 'Single item cues must be returned verbatim');
  });
});
