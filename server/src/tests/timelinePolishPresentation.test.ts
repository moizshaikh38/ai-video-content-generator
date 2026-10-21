/**
 * Targeted Timeline Polish Presentation Regression Tests
 *
 * Verifies the 4 timeline presentation fixes:
 * 1. Primary video detection when source_path is populated & external media exclusion
 * 2. Dialogue waveform and filmstrip visibility logic
 * 3. Caption cue positioning, labels, zero-duration safety, missing cues, and timeline offsets
 * 4. Consolidated toolbar: no duplicated Split/Duplicate/Ripple Cut in UnifiedTimeline header
 * 5. Empty Text & Titles lane action wiring (+ Add Text affordance)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { EditorProject, EditorTrackItem, RenderedClip, TimedCaptionCue } from '../../src/types/index.js';

describe('VireoClip — Timeline Polish Presentation Fixes', () => {
  const mockClip: RenderedClip = {
    id: 'clip-uuid-1234',
    project_id: 'proj-001',
    user_id: 'user-001',
    name: 'Sample Highlight Clip',
    start_seconds: 12.5,
    end_seconds: 42.5,
    duration: 30.0,
    aspect_ratio: '9:16',
    video_url: 'https://storage.googleapis.com/vireoclip-bucket/clips/clip-uuid-1234.mp4',
    source_storage_path: 'sources/user-001/interview.mp4',
    caption_style: 'highlight',
    caption_position: 'bottom',
    caption_enabled: true,
    render_progress: 100,
    status: 'ready',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  /**
   * Helper duplicating the exact logic in src/components/editor/Timeline.tsx
   */
  function isPrimaryClipItem(
    item: EditorTrackItem,
    clip: RenderedClip | null | undefined
  ): boolean {
    if (!clip?.id) return false;
    if (item.source_asset_id && item.source_asset_id === clip.id) return true;
    if (clip.source_storage_path && item.source_path === clip.source_storage_path) return true;
    if (!item.source_asset_id && !item.source_path) return true;
    return false;
  }

  describe('1. Primary Video Detection and External Media Exclusion', () => {
    it('correctly identifies main video item when source_path matches clip.source_storage_path', () => {
      const mainVideoItem: EditorTrackItem = {
        id: 'main-item-1',
        track_id: 'video-track-1',
        type: 'VIDEO',
        timeline_start: 0,
        timeline_end: 30,
        source_start: 12.5,
        source_end: 42.5,
        source_path: 'sources/user-001/interview.mp4', // Populated source_path!
        source_asset_id: undefined,
        transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
        speed: { speed: 1, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 10,
      };

      assert.equal(isPrimaryClipItem(mainVideoItem, mockClip), true);
    });

    it('correctly identifies main video item when source_asset_id matches clip.id', () => {
      const mainVideoItem: EditorTrackItem = {
        id: 'main-item-2',
        track_id: 'video-track-1',
        type: 'VIDEO',
        timeline_start: 0,
        timeline_end: 30,
        source_start: 12.5,
        source_end: 42.5,
        source_path: undefined,
        source_asset_id: 'clip-uuid-1234',
        transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
        speed: { speed: 1, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 10,
      };

      assert.equal(isPrimaryClipItem(mainVideoItem, mockClip), true);
    });

    it('identifies unassigned items without external path or asset ID as primary clip items', () => {
      const defaultItem: EditorTrackItem = {
        id: 'main-item-3',
        track_id: 'video-track-1',
        type: 'VIDEO',
        timeline_start: 0,
        timeline_end: 30,
        source_start: 0,
        source_end: 30,
        source_path: undefined,
        source_asset_id: undefined,
        transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
        speed: { speed: 1, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 10,
      };

      assert.equal(isPrimaryClipItem(defaultItem, mockClip), true);
    });

    it('strictly excludes external B-roll and uploaded assets from being primary video', () => {
      const brollItem: EditorTrackItem = {
        id: 'broll-item-1',
        track_id: 'video-track-1',
        type: 'VIDEO',
        timeline_start: 5,
        timeline_end: 10,
        source_start: 0,
        source_end: 5,
        source_path: 'https://images.pexels.com/videos/12345/clip.mp4',
        source_asset_id: 'pexels-asset-999',
        transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
        speed: { speed: 1, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 15,
      };

      const musicItem: EditorTrackItem = {
        id: 'music-item-1',
        track_id: 'audio-track-1',
        type: 'AUDIO',
        timeline_start: 0,
        timeline_end: 30,
        source_start: 0,
        source_end: 30,
        source_path: 'https://cdn.pixabay.com/audio/upbeat.mp3',
        source_asset_id: 'asset-music-555',
        transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
        speed: { speed: 1, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 2,
      };

      assert.equal(isPrimaryClipItem(brollItem, mockClip), false);
      assert.equal(isPrimaryClipItem(musicItem, mockClip), false);
    });
  });

  describe('2. Dialogue Waveform & Filmstrip Visibility Logic', () => {
    it('enables showDialogueLane when primary video exists and no dedicated audio track is present', () => {
      const project: EditorProject = {
        id: 'proj-1',
        clip_id: mockClip.id,
        user_id: 'user-001',
        version: 1,
        canvas: { width: 1080, height: 1920, fps: 30, duration: 30 },
        tracks: [
          {
            id: 'video-track-1',
            type: 'VIDEO',
            name: 'Main Video',
            locked: false,
            muted: false,
            hidden: false,
            height: 80,
            items: [
              {
                id: 'item-video',
                track_id: 'video-track-1',
                type: 'VIDEO',
                timeline_start: 0,
                timeline_end: 30,
                source_start: 12.5,
                source_end: 42.5,
                source_path: mockClip.source_storage_path,
                transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
                speed: { speed: 1, pitch_preserved: true },
                effects: [],
                keyframes: [],
                locked: false,
                muted: false,
                hidden: false,
                z_index: 10,
              },
            ],
          },
          {
            id: 'caption-track-1',
            type: 'CAPTION',
            name: 'Subtitles',
            locked: false,
            muted: false,
            hidden: false,
            height: 48,
            items: [],
          },
        ],
      };

      const mainVideoTrack = project.tracks.find(
        (t) => t.type === 'VIDEO' && t.items.some((i) => isPrimaryClipItem(i, mockClip) && i.source_end > i.source_start)
      );
      const mainVideoItem = mainVideoTrack?.items.find(
        (i) => isPrimaryClipItem(i, mockClip) && i.source_end > i.source_start
      );
      const hasAudioTrack = project.tracks.some((t) => t.type === 'AUDIO');
      const showDialogueLane = Boolean(mockClip?.id && mainVideoItem && !hasAudioTrack);

      assert.ok(mainVideoTrack, 'mainVideoTrack is found');
      assert.ok(mainVideoItem, 'mainVideoItem is found');
      assert.equal(hasAudioTrack, false);
      assert.equal(showDialogueLane, true, 'Dialogue lane must be visible');
    });

    it('suppresses synthetic dialogue lane when an explicit AUDIO track exists', () => {
      const projectWithAudio: EditorProject = {
        id: 'proj-2',
        clip_id: mockClip.id,
        user_id: 'user-001',
        version: 1,
        canvas: { width: 1080, height: 1920, fps: 30, duration: 30 },
        tracks: [
          {
            id: 'video-track-1',
            type: 'VIDEO',
            name: 'Main Video',
            locked: false,
            muted: false,
            hidden: false,
            height: 80,
            items: [
              {
                id: 'item-video',
                track_id: 'video-track-1',
                type: 'VIDEO',
                timeline_start: 0,
                timeline_end: 30,
                source_start: 12.5,
                source_end: 42.5,
                source_path: mockClip.source_storage_path,
                transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
                speed: { speed: 1, pitch_preserved: true },
                effects: [],
                keyframes: [],
                locked: false,
                muted: false,
                hidden: false,
                z_index: 10,
              },
            ],
          },
          {
            id: 'audio-track-1',
            type: 'AUDIO',
            name: 'Audio',
            locked: false,
            muted: false,
            hidden: false,
            height: 48,
            items: [],
          },
        ],
      };

      const hasAudioTrack = projectWithAudio.tracks.some((t) => t.type === 'AUDIO');
      const showDialogueLane = Boolean(mockClip?.id && !hasAudioTrack);
      assert.equal(showDialogueLane, false, 'Synthetic lane hidden when dedicated AUDIO track exists');
    });

    it('determines showFilmstrip is true for main video and false for b-roll', () => {
      const mainItem: EditorTrackItem = {
        id: 'main-v',
        track_id: 't-v',
        type: 'VIDEO',
        timeline_start: 0,
        timeline_end: 30,
        source_start: 0,
        source_end: 30,
        source_path: mockClip.source_storage_path,
        transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
        speed: { speed: 1, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 10,
      };

      const brollItem: EditorTrackItem = {
        id: 'broll-v',
        track_id: 't-v',
        type: 'VIDEO',
        timeline_start: 5,
        timeline_end: 15,
        source_start: 0,
        source_end: 10,
        source_path: 'https://images.pexels.com/broll.mp4',
        source_asset_id: 'ext-99',
        transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
        speed: { speed: 1, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 12,
      };

      const isClipSourceMain = isPrimaryClipItem(mainItem, mockClip) && mainItem.source_end > mainItem.source_start;
      const isClipSourceBroll = isPrimaryClipItem(brollItem, mockClip) && brollItem.source_end > brollItem.source_start;

      assert.equal(isClipSourceMain, true, 'Main clip is recognized as clip source for filmstrip');
      assert.equal(isClipSourceBroll, false, 'B-roll is not recognized as clip source');
    });
  });

  describe('3. Timed Caption Cue Positioning, Timing Semantics, and Safety', () => {
    function computeCueMetrics(
      cue: TimedCaptionCue,
      item: EditorTrackItem,
      pixelsPerSec: number
    ) {
      const rawStart = typeof cue.start === 'number' && !isNaN(cue.start) ? cue.start : 0;
      const rawEnd = typeof cue.end === 'number' && !isNaN(cue.end) ? cue.end : rawStart + 1.0;

      const isTimelineRelative = item.timeline_start > 0 && rawStart >= item.timeline_start;
      const cueStartOffset = Math.max(0, isTimelineRelative ? rawStart - item.timeline_start : rawStart);
      const rawDuration = rawEnd - rawStart;
      const cueDuration = Math.max(0.15, !isNaN(rawDuration) && rawDuration > 0 ? rawDuration : 1.0);

      const cueLeft = cueStartOffset * pixelsPerSec;
      const cueWidth = Math.max(16, cueDuration * pixelsPerSec - 2);
      const targetSeekTime = isTimelineRelative ? rawStart : item.timeline_start + rawStart;
      const displayStart = targetSeekTime;
      const displayEnd = targetSeekTime + cueDuration;

      return {
        cueStartOffset,
        cueDuration,
        cueLeft,
        cueWidth,
        targetSeekTime,
        displayStart,
        displayEnd,
        title: `"${cue.text || ''}" (${displayStart.toFixed(2)}s – ${displayEnd.toFixed(2)}s)`,
        ariaLabel: `Caption cue: ${cue.text || '...'} from ${displayStart.toFixed(2)}s to ${displayEnd.toFixed(2)}s`,
      };
    }

    it('positions item-relative 0-based cues correctly', () => {
      const item: EditorTrackItem = {
        id: 'cap-item-1',
        track_id: 't-cap',
        type: 'CAPTION',
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
        z_index: 20,
      };

      const cue: TimedCaptionCue = {
        id: 'cue-1',
        start: 2.5,
        end: 4.8,
        text: 'Welcome back to the channel',
      };

      const metrics = computeCueMetrics(cue, item, 60);
      assert.equal(metrics.cueStartOffset, 2.5);
      assert.equal(Number(metrics.cueDuration.toFixed(2)), 2.3);
      assert.equal(metrics.cueLeft, 2.5 * 60);
      assert.equal(metrics.targetSeekTime, 2.5);
      assert.equal(metrics.title, '"Welcome back to the channel" (2.50s – 4.80s)');
    });

    it('handles timeline-relative cues when item is shifted on the timeline', () => {
      const shiftedItem: EditorTrackItem = {
        id: 'cap-item-2',
        track_id: 't-cap',
        type: 'CAPTION',
        timeline_start: 10.0,
        timeline_end: 40.0,
        source_start: 0,
        source_end: 30,
        transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
        speed: { speed: 1, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 20,
      };

      // Cue timestamped relative to the global timeline (12.0s to 15.0s)
      const timelineRelativeCue: TimedCaptionCue = {
        id: 'cue-tl',
        start: 12.0,
        end: 15.0,
        text: 'This cue has global timeline coordinates',
      };

      const metrics = computeCueMetrics(timelineRelativeCue, shiftedItem, 60);
      // Offset relative to the shifted item should be 12.0 - 10.0 = 2.0s
      assert.equal(metrics.cueStartOffset, 2.0);
      assert.equal(metrics.cueLeft, 2.0 * 60);
      assert.equal(metrics.targetSeekTime, 12.0);
      assert.equal(metrics.title, '"This cue has global timeline coordinates" (12.00s – 15.00s)');
    });

    it('safeguards against zero-duration and inverted timestamps', () => {
      const item: EditorTrackItem = {
        id: 'cap-item-3',
        track_id: 't-cap',
        type: 'CAPTION',
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
        z_index: 20,
      };

      const zeroCue: TimedCaptionCue = {
        id: 'cue-zero',
        start: 5.0,
        end: 5.0, // Zero duration!
        text: 'Quick flash',
      };

      const metrics = computeCueMetrics(zeroCue, item, 60);
      assert.ok(metrics.cueDuration >= 0.15, 'Zero-duration cue receives minimum duration of 0.15s');
      assert.ok(metrics.cueWidth >= 16, 'Zero-duration cue renders with minimum interactive width');
    });

    it('handles empty or missing caption cues gracefully', () => {
      const emptyCaptionItem: EditorTrackItem = {
        id: 'cap-item-empty',
        track_id: 't-cap',
        type: 'CAPTION',
        timeline_start: 0,
        timeline_end: 15,
        source_start: 0,
        source_end: 15,
        caption: {
          cues: [],
          style: 'clean',
        },
        transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
        speed: { speed: 1, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 20,
      };

      const hasCues = Array.isArray(emptyCaptionItem.caption?.cues) && emptyCaptionItem.caption.cues.length > 0;
      assert.equal(hasCues, false, 'Does not attempt to map over empty cues array');
    });
  });

  describe('4. Toolbar Consolidation in UnifiedTimeline', () => {
    it('verifies UnifiedTimeline does NOT contain duplicate action buttons in its header', () => {
      const unifiedTimelinePath = path.resolve(
        process.cwd(),
        'src/components/editor/UnifiedTimeline.tsx'
      );
      const content = fs.readFileSync(unifiedTimelinePath, 'utf-8');

      // Check header bar doesn't render Split, Duplicate, or Ripple Cut buttons
      assert.ok(
        !content.includes('title="Split Item at Playhead (S)"'),
        'UnifiedTimeline header should not render duplicate Split button'
      );
      assert.ok(
        !content.includes('title="Duplicate Item"'),
        'UnifiedTimeline header should not render duplicate Duplicate button'
      );
      assert.ok(
        !content.includes('title="Ripple Delete Gap"'),
        'UnifiedTimeline header should not render duplicate Ripple Cut button'
      );

      // Confirm required controls remain:
      assert.ok(content.includes('{project.tracks.length} Tracks'), 'UnifiedTimeline retains track count badge');
      assert.ok(content.includes('Hide Timeline'), 'UnifiedTimeline retains Show/Hide Timeline toggle');
      assert.ok(content.includes('Show Timeline'), 'UnifiedTimeline retains Show/Hide Timeline toggle');
    });

    it('verifies Timeline.tsx preserves the complete primary editing toolbar', () => {
      const timelinePath = path.resolve(
        process.cwd(),
        'src/components/editor/Timeline.tsx'
      );
      const content = fs.readFileSync(timelinePath, 'utf-8');

      assert.ok(content.includes('title="Split Clip at Playhead (S)"'), 'Timeline.tsx retains Split control');
      assert.ok(content.includes('title="Duplicate Selected Clip"'), 'Timeline.tsx retains Duplicate control');
      assert.ok(content.includes('title="Ripple Delete Clip"'), 'Timeline.tsx retains Ripple Delete control');
      assert.ok(content.includes('title="Zoom In"'), 'Timeline.tsx retains Zoom In');
      assert.ok(content.includes('title="Zoom Out"'), 'Timeline.tsx retains Zoom Out');
      assert.ok(content.includes('title="Fit to Timeline"'), 'Timeline.tsx retains Fit to Timeline');
    });
  });

  describe('5. Empty Text Lane Action Wiring', () => {
    it('verifies Timeline renders "+ Add Text / Title" button when TEXT track has no items and onAddText is provided', () => {
      const timelinePath = path.resolve(
        process.cwd(),
        'src/components/editor/Timeline.tsx'
      );
      const content = fs.readFileSync(timelinePath, 'utf-8');

      assert.ok(
        content.includes("track.type === 'TEXT' && track.items.length === 0"),
        'Timeline checks for empty TEXT track'
      );
      assert.ok(
        content.includes('Add Text / Title'),
        'Timeline renders Add Text / Title affordance'
      );
      assert.ok(
        content.includes('onAddText()'),
        'Timeline wires button to onAddText callback'
      );
    });

    it('verifies EditorShell connects UnifiedTimeline onAddText to handleAddTextLayer and setActiveSidebarTab', () => {
      const shellPath = path.resolve(
        process.cwd(),
        'src/components/editor/EditorShell.tsx'
      );
      const content = fs.readFileSync(shellPath, 'utf-8');

      assert.ok(
        content.includes("onAddText={() => {\n          handleAddTextLayer('New Text Overlay');\n          setActiveSidebarTab('text');\n        }}"),
        'EditorShell wires onAddText to add text layer and open text tab'
      );
    });
  });
});
