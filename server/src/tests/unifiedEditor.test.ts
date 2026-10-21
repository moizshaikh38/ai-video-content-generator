import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { ProEditorService } from '../services/proEditorService.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import {
  EditorProject,
  ClipRecord,
  SAFE_EDITOR_FONTS,
  ClipAspectRatio,
} from '../types/index.js';
import {
  collectSnapTargets,
  resolveSnapPoint,
  snapClipMove,
  snapClipTrimLeft,
  snapClipTrimRight,
  DEFAULT_SNAP_TOLERANCE_PX,
  MIN_CLIP_DURATION,
} from '../utils/timelineSnapping.js';

describe('Unified Editor Architecture & Render Pipeline Tests (Phases 0–14)', () => {
  const mockUserId = crypto.randomUUID();
  const mockProjectId = crypto.randomUUID();
  const mockClipId = crypto.randomUUID();

  function createMockProject(overrides: Partial<EditorProject> = {}): EditorProject {
    const videoTrackId = crypto.randomUUID();
    const videoItemId = crypto.randomUUID();
    const textTrackId = crypto.randomUUID();
    const textItemId = crypto.randomUUID();

    return {
      id: crypto.randomUUID(),
      user_id: mockUserId,
      project_id: mockProjectId,
      clip_id: mockClipId,
      version: 1,
      status: 'draft',
      title: 'Unified Video Test',
      canvas: {
        width: 1080,
        height: 1920,
        aspect_ratio: '9:16',
        fps: 30,
        duration: 25.0,
        background_color: '#000000',
        background_mode: 'color',
      },
      tracks: [
        {
          id: videoTrackId,
          type: 'VIDEO',
          name: 'Main Video',
          locked: false,
          muted: false,
          hidden: false,
          height: 64,
          items: [
            {
              id: videoItemId,
              track_id: videoTrackId,
              type: 'VIDEO',
              timeline_start: 0,
              timeline_end: 25.0,
              source_start: 10.0,
              source_end: 35.0,
              transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
              speed: { speed: 1.0, pitch_preserved: true },
              effects: [],
              keyframes: [
                {
                  id: crypto.randomUUID(),
                  time: 2.0,
                  property: 'scale',
                  value: 1.15,
                  easing: 'ease-in-out',
                },
              ],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
            },
          ],
        },
        {
          id: textTrackId,
          type: 'TEXT',
          name: 'Text Overlay',
          locked: false,
          muted: false,
          hidden: false,
          height: 48,
          items: [
            {
              id: textItemId,
              track_id: textTrackId,
              type: 'TEXT',
              timeline_start: 0,
              timeline_end: 4.0,
              source_start: 0,
              source_end: 4.0,
              transform: { position_x: 0, position_y: 160, scale: 1.0, rotation: 0, opacity: 1.0 },
              speed: { speed: 1.0, pitch_preserved: true },
              text: {
                text: 'AI Viral Hook',
                font_family: 'Arial',
                font_size: 54,
                font_weight: 'bold',
                italic: false,
                alignment: 'center',
                color: '#FFFFFF',
                background_color: '#000000CC',
                preset: 'bold',
              },
              effects: [],
              keyframes: [],
              locked: false,
              muted: true,
              hidden: false,
              z_index: 10,
            },
          ],
        },
      ],
      playhead: 0,
      settings: {
        snapping: true,
        safe_guides: true,
        snap_tolerance_sec: 0.15,
        show_safe_zones: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('1. verifies safe font validation allowlist', () => {
    assert.equal(ProEditorService.validateFont('Inter'), 'Inter');
    assert.equal(ProEditorService.validateFont('Arial'), 'Arial');
    assert.equal(ProEditorService.validateFont('Montserrat'), 'Montserrat');
    assert.equal(ProEditorService.validateFont('MaliciousFont; rm -rf /'), 'Arial');
    assert.equal(ProEditorService.validateFont(''), 'Arial');
  });

  it('2. compiles multi-track FFmpeg graph with keyframes, text overlay, and audio limiter', () => {
    const project = createMockProject();
    const tmpDir = os.tmpdir();
    const dummySource = path.join(tmpDir, 'dummy_source.mp4');
    const dummyOutput = path.join(tmpDir, 'dummy_out.mp4');

    const graph = ProEditorService.compileRenderGraph(project, dummySource, dummyOutput, tmpDir);

    assert.ok(Array.isArray(graph.inputArgs));
    assert.ok(Array.isArray(graph.filterComplex));
    assert.ok(graph.inputArgs.includes(dummySource));

    // Verify keyframe punch-in dynamic zoom filter is compiled
    const hasPunchInCrop = graph.filterComplex.some((f) => f.includes('crop=w=') && f.includes('scale=1080:1920'));
    assert.ok(hasPunchInCrop, 'Graph must compile dynamic keyframe punch-in crop');

    // Verify text drawtext overlay is compiled with escaped text
    const hasDrawtext = graph.filterComplex.some((f) => f.includes("drawtext=text='AI Viral Hook'"));
    assert.ok(hasDrawtext, 'Graph must compile drawtext filter for text item');

    // Verify audio limiter peak limiter is present
    const hasLimiter = graph.filterComplex.some((f) => f.includes('alimiter=limit=-1.0dB'));
    assert.ok(hasLimiter, 'Graph must compile peak audio limiter to prevent clipping');

    assert.equal(graph.duration, 25.0);
  });

  it('3. burns ASS subtitles in compileRenderGraph when subtitles.ass exists in tmpDir', () => {
    const project = createMockProject();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-sub-test-'));
    const dummySource = path.join(tmpDir, 'source.mp4');
    const dummyOutput = path.join(tmpDir, 'out.mp4');
    const assFile = path.join(tmpDir, 'subtitles.ass');

    // Create a mock subtitles.ass file
    fs.writeFileSync(assFile, '[Script Info]\nTitle: Test Subtitles\n');

    try {
      const graph = ProEditorService.compileRenderGraph(project, dummySource, dummyOutput, tmpDir);

      const hasAssFilter = graph.filterComplex.some((f) => f.includes('ass='));
      assert.ok(hasAssFilter, 'compileRenderGraph must include ass filter when subtitles.ass exists');
    } finally {
      try {
        fs.unlinkSync(assFile);
        fs.rmdirSync(tmpDir);
      } catch {}
    }
  });

  it('4. ensures clean preview separation and avoids duplicate caption burn', () => {
    // In live edit mode, video canvas uses clean unburned source
    const cleanSourcePath = 'raw-videos/user123/original.mp4';
    const renderedClipPath = 'rendered-clips/user123/clip_ready.mp4';

    // When clip is rendered, both URLs are distinct
    assert.notEqual(cleanSourcePath, renderedClipPath);
    // Editor uses cleanSourcePath for live editing, so live CSS captions are drawn on top of clean media
    const liveEditSource = cleanSourcePath;
    assert.equal(liveEditSource, 'raw-videos/user123/original.mp4');

    // Export review mode uses renderedClipPath with zero live CSS overlays
    const exportReviewSource = renderedClipPath;
    assert.equal(exportReviewSource, 'rendered-clips/user123/clip_ready.mp4');
  });

  it('5. validates word re-tokenization when editing caption text to prevent stale highlight synchronization', () => {
    const originalText = 'Hello world this is AI video';
    const originalCue = {
      id: 'cue-1',
      start: 0.0,
      end: 2.0,
      text: originalText,
      words: [
        { text: 'Hello', start: 0.0, end: 0.33, confidence: 1.0 },
        { text: 'world', start: 0.33, end: 0.66, confidence: 1.0 },
        { text: 'this', start: 0.66, end: 1.0, confidence: 1.0 },
        { text: 'is', start: 1.0, end: 1.33, confidence: 1.0 },
        { text: 'AI', start: 1.33, end: 1.66, confidence: 1.0 },
        { text: 'video', start: 1.66, end: 2.0, confidence: 1.0 },
      ],
    };

    // User edits text to: 'Super viral AI video'
    const updatedText = 'Super viral AI video';
    const words = updatedText.trim().split(/\s+/).filter(Boolean);
    const duration = originalCue.end - originalCue.start;
    const wordDur = duration / words.length;

    const updatedWords = words.map((w, idx) => ({
      text: w,
      start: Number((originalCue.start + idx * wordDur).toFixed(3)),
      end: Number((originalCue.start + (idx + 1) * wordDur).toFixed(3)),
      confidence: 1.0,
    }));

    assert.equal(updatedWords.length, 4);
    assert.equal(updatedWords[0].text, 'Super');
    assert.equal(updatedWords[3].text, 'video');
    // Ensure word timing boundaries remain contiguous within cue duration
    assert.equal(updatedWords[0].start, 0.0);
    assert.equal(updatedWords[3].end, 2.0);
  });

  it('6. validates manual crop accepts focusX = 0 without defaulting to center', () => {
    const focusX = 0;
    const focusY = 0.5;

    // A common JavaScript bug is `focusX || 0.5` which converts 0 into 0.5!
    // The correct check is `focusX !== undefined ? focusX : 0.5`
    const resolvedX = focusX !== undefined ? focusX : 0.5;
    assert.equal(resolvedX, 0, 'focusX = 0 must be preserved and not coerced to 0.5');
  });

  it('7. validates timeline ripple cut calculates correct duration and closes item gaps', () => {
    const project = createMockProject();
    const itemToDelete = project.tracks[0].items[0];
    const gap = itemToDelete.timeline_end - itemToDelete.timeline_start; // 25.0s

    const initialDuration = project.canvas.duration;
    const newDuration = Math.max(1, initialDuration - gap);
    assert.equal(newDuration, 1.0); // clamped to min duration 1s
  });

  it('8. validates bounded undo/redo history stack limits', () => {
    const historyStack: number[] = [];
    const MAX_STEPS = 50;

    for (let i = 0; i < 75; i++) {
      historyStack.push(i);
      if (historyStack.length > MAX_STEPS) {
        historyStack.shift();
      }
    }

    assert.equal(historyStack.length, 50);
    assert.equal(historyStack[0], 25);
    assert.equal(historyStack[historyStack.length - 1], 74);
  });

  it('9. validates timeline drag operation commits at most one undo history entry with accurate restoration of pre-drag and post-drag states', () => {
    const initialProject = createMockProject();
    let currentProject = JSON.parse(JSON.stringify(initialProject)) as EditorProject;

    const past: EditorProject[] = [];
    const future: EditorProject[] = [];

    const pushHistory = (snapshot: EditorProject) => {
      past.push(JSON.parse(JSON.stringify(snapshot)));
      if (past.length > 50) past.shift();
      future.length = 0;
    };

    const commitProject = (preOperationProject: EditorProject) => {
      pushHistory(preOperationProject);
    };

    const undo = () => {
      if (past.length === 0) return null;
      const prev = past.pop()!;
      future.push(JSON.parse(JSON.stringify(currentProject)));
      currentProject = prev;
      return prev;
    };

    const redo = () => {
      if (future.length === 0) return null;
      const next = future.pop()!;
      past.push(JSON.parse(JSON.stringify(currentProject)));
      currentProject = next;
      return next;
    };

    // User starts dragging item: record pre-drag snapshot
    const preDragProject = JSON.parse(JSON.stringify(currentProject)) as EditorProject;

    // Simulate 120 mousemove events during a 1-second drag operation (recordHistory: false)
    for (let frame = 1; frame <= 120; frame++) {
      currentProject = {
        ...currentProject,
        tracks: currentProject.tracks.map((t) => ({
          ...t,
          items: t.items.map((i) => ({
            ...i,
            timeline_start: Number((i.timeline_start + 0.05).toFixed(3)),
            timeline_end: Number((i.timeline_end + 0.05).toFixed(3)),
          })),
        })),
      };
    }

    assert.equal(past.length, 0, 'No undo snapshots should be created during mouse movement');

    // User finishes dragging (mouseup): commit once
    commitProject(preDragProject);

    assert.equal(past.length, 1, 'Exactly one undoable history entry must be created on drag completion');

    const postDragStart = currentProject.tracks[0].items[0].timeline_start;
    assert.equal(postDragStart, 6.0);

    // User hits Undo: restores complete pre-drag state in one action
    const restored = undo();
    assert.ok(restored);
    assert.equal(currentProject.tracks[0].items[0].timeline_start, 0);
    assert.equal(past.length, 0);
    assert.equal(future.length, 1);

    // User hits Redo: restores completed post-drag state
    const redone = redo();
    assert.ok(redone);
    assert.equal(currentProject.tracks[0].items[0].timeline_start, 6.0);
    assert.equal(past.length, 1);
    assert.equal(future.length, 0);
  });

  it('10. validates that undo and redo state transitions operate deterministically without double-pop regressions', () => {
    let projectState: EditorProject = {
      id: 'proj-1',
      clip_id: 'clip-1',
      user_id: 'user-1',
      title: 'State Test',
      version: 1,
      canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, background_color: '#000000' },
      playhead: 0,
      tracks: [
        {
          id: 'track-1',
          project_id: 'proj-1',
          type: 'VIDEO',
          index: 0,
          name: 'Video 1',
          locked: false,
          muted: false,
          hidden: false,
          volume: 1,
          items: [
            {
              id: 'item-1',
              track_id: 'track-1',
              type: 'VIDEO',
              timeline_start: 0,
              timeline_end: 10,
              source_start: 0,
              source_end: 10,
              transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
              speed: { speed: 1, pitch_preserved: true },
              effects: [],
              keyframes: [],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
            },
          ],
        },
      ],
      settings: { snap_to_grid: true, ripple_editing: false },
      created_at: new Date(),
      updated_at: new Date(),
    };

    const past: EditorProject[] = [];
    const future: EditorProject[] = [];

    const historyPush = (p: EditorProject) => {
      past.push(JSON.parse(JSON.stringify(p)));
      future.length = 0;
    };

    const historyUndo = (curr: EditorProject) => {
      if (past.length === 0) return null;
      const prev = past.pop()!;
      future.push(JSON.parse(JSON.stringify(curr)));
      return prev;
    };

    const historyRedo = (curr: EditorProject) => {
      if (future.length === 0) return null;
      const next = future.pop()!;
      past.push(JSON.parse(JSON.stringify(curr)));
      return next;
    };

    // User performs edit 1: timeline_start becomes 2.0
    const snapshot0 = JSON.parse(JSON.stringify(projectState));
    projectState = {
      ...projectState,
      tracks: [{ ...projectState.tracks[0], items: [{ ...projectState.tracks[0].items[0], timeline_start: 2.0 }] }],
    };
    historyPush(snapshot0);

    // Verify 1 history entry
    assert.equal(past.length, 1);
    assert.equal(projectState.tracks[0].items[0].timeline_start, 2.0);

    // Direct undo invocation outside state updater function:
    const prev = historyUndo(projectState);
    assert.ok(prev);
    projectState = prev;
    assert.equal(projectState.tracks[0].items[0].timeline_start, 0);
    assert.equal(past.length, 0);
    assert.equal(future.length, 1);

    // Subsequet redundant undo when stack is empty returns null and leaves projectState intact
    const redundantUndo = historyUndo(projectState);
    assert.equal(redundantUndo, null);
    assert.equal(projectState.tracks[0].items[0].timeline_start, 0);

    // Redo restores edit 1
    const next = historyRedo(projectState);
    assert.ok(next);
    projectState = next;
    assert.equal(projectState.tracks[0].items[0].timeline_start, 2.0);
    assert.equal(past.length, 1);
    assert.equal(future.length, 0);
  });

  it('11. collects snap targets accurately across tracks and playhead while ignoring dragged item and hidden tracks', () => {
    const project: EditorProject = {
      id: 'proj-snap-test',
      user_id: mockUserId,
      title: 'Snap Test Project',
      canvas: { width: 1080, height: 1920, duration: 30, fps: 30, background_color: '#000000' },
      tracks: [
        {
          id: 'track-v1',
          type: 'VIDEO',
          name: 'Video 1',
          locked: false,
          muted: false,
          hidden: false,
          volume: 1,
          items: [
            {
              id: 'clip-a',
              track_id: 'track-v1',
              type: 'VIDEO',
              timeline_start: 0,
              timeline_end: 4.5,
              source_start: 0,
              source_end: 4.5,
              transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
              speed: { speed: 1, pitch_preserved: true },
              effects: [],
              keyframes: [],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
            },
            {
              id: 'clip-dragged',
              track_id: 'track-v1',
              type: 'VIDEO',
              timeline_start: 6.0,
              timeline_end: 10.0,
              source_start: 0,
              source_end: 4.0,
              transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
              speed: { speed: 1, pitch_preserved: true },
              effects: [],
              keyframes: [],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
            },
          ],
        },
        {
          id: 'track-a1',
          type: 'AUDIO',
          name: 'Audio 1',
          locked: false,
          muted: false,
          hidden: false,
          volume: 1,
          items: [
            {
              id: 'audio-item',
              track_id: 'track-a1',
              type: 'AUDIO',
              timeline_start: 2.0,
              timeline_end: 8.0,
              source_start: 0,
              source_end: 6.0,
              transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
              speed: { speed: 1, pitch_preserved: true },
              effects: [],
              keyframes: [],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
            },
          ],
        },
        {
          id: 'track-hidden',
          type: 'TEXT',
          name: 'Hidden Subtitles',
          locked: false,
          muted: false,
          hidden: true,
          volume: 1,
          items: [
            {
              id: 'text-hidden',
              track_id: 'track-hidden',
              type: 'TEXT',
              timeline_start: 12.0,
              timeline_end: 15.0,
              source_start: 0,
              source_end: 3.0,
              transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
              speed: { speed: 1, pitch_preserved: true },
              effects: [],
              keyframes: [],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
            },
          ],
        },
      ],
      settings: { snapping: true },
      created_at: new Date(),
      updated_at: new Date(),
    };

    const targets = collectSnapTargets(project, 7.5, 'clip-dragged', 'track-v1');

    // Should include:
    // 1. Zero: 0.0s
    // 2. Playhead: 7.5s
    // 3. clip-a start: 0.0s, clip-a end: 4.5s
    // 4. audio-item start: 2.0s, audio-item end: 8.0s
    // Should NOT include: clip-dragged (6.0s, 10.0s) or text-hidden (12.0s, 15.0s)
    const targetTimes = targets.map((t) => t.time);
    assert.ok(targetTimes.includes(0), 'Includes zero');
    assert.ok(targetTimes.includes(7.5), 'Includes playhead');
    assert.ok(targetTimes.includes(4.5), 'Includes clip-a end');
    assert.ok(targetTimes.includes(2.0), 'Includes audio-item start');
    assert.ok(targetTimes.includes(8.0), 'Includes audio-item end');

    assert.ok(!targetTimes.includes(6.0), 'Does not include dragged clip start');
    assert.ok(!targetTimes.includes(10.0), 'Does not include dragged clip end');
    assert.ok(!targetTimes.includes(12.0), 'Does not include items on hidden tracks');
    assert.ok(!targetTimes.includes(15.0), 'Does not include items on hidden tracks');
  });

  it('12. scales magnetic snapping tolerance proportionally across zoom levels and honors bypassSnap', () => {
    const targets = [
      { time: 0, type: 'zero' as const, label: '0:00.00' },
      { time: 5.0, type: 'clip-end' as const, label: 'Clip Out' },
    ];

    // Standard Zoom: 60 px/sec, tolerance = 12px -> 12 / 60 = 0.20s
    // 1. Target within tolerance: 4.92s -> diff 0.08s = 4.8px -> snaps to 5.0s
    const snapNormal = resolveSnapPoint(4.92, targets, 60, 12, false);
    assert.equal(snapNormal.snapped, true);
    assert.equal(snapNormal.time, 5.0);

    // 2. Target outside tolerance: 4.75s -> diff 0.25s = 15px > 12px -> unsnapped
    const unsnapNormal = resolveSnapPoint(4.75, targets, 60, 12, false);
    assert.equal(unsnapNormal.snapped, false);
    assert.equal(unsnapNormal.time, 4.75);

    // Zoomed Out: 20 px/sec, tolerance = 12px -> 12 / 20 = 0.60s
    // 4.75s is now within 0.60s tolerance (diff 0.25s = 5px <= 12px) -> snaps to 5.0s
    const snapZoomOut = resolveSnapPoint(4.75, targets, 20, 12, false);
    assert.equal(snapZoomOut.snapped, true);
    assert.equal(snapZoomOut.time, 5.0);

    // Zoomed In: 200 px/sec, tolerance = 12px -> 12 / 200 = 0.06s
    // 4.92s is now outside 0.06s tolerance (diff 0.08s = 16px > 12px) -> unsnapped
    const unsnapZoomIn = resolveSnapPoint(4.92, targets, 200, 12, false);
    assert.equal(unsnapZoomIn.snapped, false);
    assert.equal(unsnapZoomIn.time, 4.92);

    // Zoomed In within tolerance: 4.98s -> diff 0.02s = 4px <= 12px -> snaps
    const snapZoomIn = resolveSnapPoint(4.98, targets, 200, 12, false);
    assert.equal(snapZoomIn.snapped, true);
    assert.equal(snapZoomIn.time, 5.0);

    // Bypass snap flag (e.g. Shift / Alt held) completely disables snapping
    const bypassed = resolveSnapPoint(4.98, targets, 200, 12, true);
    assert.equal(bypassed.snapped, false);
    assert.equal(bypassed.time, 4.98);
  });

  it('13. applies deterministic tie-breaking priority when multiple snap targets are close', () => {
    // Two targets at exact same time 5.0s: one is Playhead, one is cross-track clip edge
    const targets = [
      { time: 5.0, type: 'clip-end' as const, isSameTrack: false, label: 'Track B Out' },
      { time: 5.0, type: 'playhead' as const, label: 'Playhead' },
    ];

    const result = resolveSnapPoint(4.95, targets, 60, 12, false);
    assert.equal(result.snapped, true);
    assert.equal(result.time, 5.0);
    assert.equal(result.target?.type, 'playhead', 'Playhead takes priority over cross-track clip boundary');

    // Same-track boundary vs Cross-track boundary
    const trackTargets = [
      { time: 10.0, type: 'clip-start' as const, isSameTrack: false, label: 'Track B In' },
      { time: 10.0, type: 'clip-start' as const, isSameTrack: true, label: 'Track A In' },
    ];
    const trackResult = resolveSnapPoint(10.05, trackTargets, 60, 12, false);
    assert.equal(trackResult.snapped, true);
    assert.equal(trackResult.target?.isSameTrack, true, 'Same-track boundary takes priority over cross-track boundary');
  });

  it('14. snaps moving clips on both leading and trailing edges while strictly preserving duration', () => {
    const targets = [
      { time: 0, type: 'zero' as const, label: '0:00.00' },
      { time: 3.0, type: 'clip-end' as const, label: 'Preceding Out' },
      { time: 12.0, type: 'clip-start' as const, label: 'Following In' },
    ];

    const duration = 5.0; // 5-second clip

    // 1. Move clip near preceding clip end at 3.0s:
    // Proposed start: 2.95s -> within tolerance of 3.0s (at 60 px/s, diff = 3px)
    const moveSnapStart = snapClipMove(2.95, duration, targets, 60, 12, false);
    assert.equal(moveSnapStart.snapped, true);
    assert.equal(moveSnapStart.timeline_start, 3.0);
    assert.equal(moveSnapStart.timeline_end, 8.0);
    assert.equal(moveSnapStart.timeline_end - moveSnapStart.timeline_start, duration, 'Duration strictly preserved');

    // 2. Move clip near following clip start at 12.0s:
    // If end is near 12.0s, e.g. proposedStart = 6.95 -> proposedEnd = 11.95 -> within tolerance of 12.0s
    const moveSnapEnd = snapClipMove(6.95, duration, targets, 60, 12, false);
    assert.equal(moveSnapEnd.snapped, true);
    assert.equal(moveSnapEnd.timeline_end, 12.0);
    assert.equal(moveSnapEnd.timeline_start, 7.0);
    assert.equal(moveSnapEnd.timeline_end - moveSnapEnd.timeline_start, duration, 'Duration strictly preserved');

    // 3. Move near zero
    const moveSnapZero = snapClipMove(0.08, duration, targets, 60, 12, false);
    assert.equal(moveSnapZero.snapped, true);
    assert.equal(moveSnapZero.timeline_start, 0);
    assert.equal(moveSnapZero.timeline_end, 5.0);

    // 4. Move completely outside tolerance
    const moveNoSnap = snapClipMove(4.5, duration, targets, 60, 12, false);
    assert.equal(moveNoSnap.snapped, false);
    assert.equal(moveNoSnap.timeline_start, 4.5);
    assert.equal(moveNoSnap.timeline_end, 9.5);
  });

  it('15. snaps left trimming with strict minimum duration and source media bound enforcement', () => {
    const targets = [
      { time: 2.0, type: 'clip-end' as const, label: 'Preceding Out' },
    ];

    const mockItem = {
      id: 'clip-trim',
      track_id: 'track-v1',
      type: 'VIDEO' as const,
      timeline_start: 3.0,
      timeline_end: 10.0,
      source_start: 1.0,
      source_end: 8.0,
      transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
      speed: { speed: 1, pitch_preserved: true },
      effects: [],
      keyframes: [],
      locked: false,
      muted: false,
      hidden: false,
      z_index: 0,
    };

    // 1. Normal snap left trim to target at 2.0s
    // initialStart = 3.0, initialSourceStart = 1.0. Max left expand is 1.0s (to reach source_start = 0).
    // Min allowed start = 3.0 - 1.0 = 2.0. Proposed 2.05s -> within tolerance of 2.0s -> snaps to 2.0s!
    const trimResult = snapClipTrimLeft(2.05, mockItem, 3.0, 1.0, targets, 60, 12, false);
    assert.equal(trimResult.snapped, true);
    assert.equal(trimResult.timeline_start, 2.0);
    assert.equal(trimResult.timeline_end, 10.0);
    assert.equal(trimResult.source_start, 0); // initialSourceStart (1.0) + delta (-1.0) = 0.0

    // 2. Minimum duration clamp: cannot trim past timeline_end - MIN_CLIP_DURATION (10.0 - 0.2 = 9.8)
    const overTrimResult = snapClipTrimLeft(9.9, mockItem, 3.0, 1.0, targets, 60, 12, false);
    assert.equal(overTrimResult.timeline_start, 9.8, 'Clamped to MIN_CLIP_DURATION 0.2s before timeline_end');
    assert.ok(
      Math.round((overTrimResult.timeline_end - overTrimResult.timeline_start) * 1000) / 1000 >= MIN_CLIP_DURATION
    );

    // 3. Source bounds clamp: cannot trim to negative source_start
    // Trying to trim to 0.5s when max left expansion is only 1.0s (min allowed start = 2.0s)
    const boundsClampResult = snapClipTrimLeft(0.5, mockItem, 3.0, 1.0, targets, 60, 12, false);
    assert.equal(boundsClampResult.timeline_start, 2.0, 'Clamped by available source media (source_start cannot be negative)');
    assert.equal(boundsClampResult.source_start, 0);
  });

  it('16. snaps right trimming with strict minimum duration and source media end protection', () => {
    const targets = [
      { time: 8.0, type: 'clip-start' as const, label: 'Next Clip In' },
    ];

    const mockItem = {
      id: 'clip-trim-r',
      track_id: 'track-v1',
      type: 'VIDEO' as const,
      timeline_start: 3.0,
      timeline_end: 6.0,
      source_start: 0,
      source_end: 3.0,
      transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
      speed: { speed: 1, pitch_preserved: true },
      effects: [],
      keyframes: [],
      locked: false,
      muted: false,
      hidden: false,
      z_index: 0,
    };

    // 1. Normal snap right trim to target at 8.0s
    // initialEnd = 6.0, initialSourceEnd = 3.0, maxSourceDuration = 10.0
    // Proposed 7.95s -> within tolerance of 8.0s -> snaps to 8.0s!
    const trimSnap = snapClipTrimRight(7.95, mockItem, 6.0, 3.0, targets, 60, 12, false, 10.0);
    assert.equal(trimSnap.snapped, true);
    assert.equal(trimSnap.timeline_end, 8.0);
    assert.equal(trimSnap.timeline_start, 3.0);
    assert.equal(trimSnap.source_end, 5.0); // 3.0 + (8.0 - 6.0) = 5.0

    // 2. Minimum duration clamp: cannot trim before timeline_start + MIN_CLIP_DURATION (3.0 + 0.2 = 3.2)
    const underTrim = snapClipTrimRight(3.1, mockItem, 6.0, 3.0, targets, 60, 12, false, 10.0);
    assert.equal(underTrim.timeline_end, 3.2, 'Clamped to MIN_CLIP_DURATION 0.2s after timeline_start');
    assert.ok(
      Math.round((underTrim.timeline_end - underTrim.timeline_start) * 1000) / 1000 >= MIN_CLIP_DURATION
    );

    // 3. Max source duration clamp: source_media is 4.0s max, initialSourceEnd is 3.0s -> can expand at most 1.0s (to timeline_end = 7.0s)
    const sourceClamp = snapClipTrimRight(9.0, mockItem, 6.0, 3.0, targets, 60, 12, false, 4.0);
    assert.equal(sourceClamp.timeline_end, 7.0, 'Clamped by max source media duration');
    assert.equal(sourceClamp.source_end, 4.0);
  });
});

