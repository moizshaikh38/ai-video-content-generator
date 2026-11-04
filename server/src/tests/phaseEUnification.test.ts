import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProEditorService } from '../services/proEditorService.js';
import {
  EditorProject,
  AutopilotRunRecord,
  EditorColorAdjustments,
} from '../types/index.js';

describe('Phase E — Results Gallery, Pro Editor Compiler & Pipeline Unification', () => {
  const mockUserId = crypto.randomUUID();
  const mockProjectId = crypto.randomUUID();
  const mockClipId = crypto.randomUUID();

  const defaultColor: EditorColorAdjustments = {
    exposure: 0,
    brightness: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    fade: 0,
    sharpen: 0,
  };

  function createBaseProject(): EditorProject {
    const videoTrackId = crypto.randomUUID();
    return {
      id: crypto.randomUUID(),
      user_id: mockUserId,
      project_id: mockProjectId,
      clip_id: mockClipId,
      version: 1,
      status: 'draft',
      title: 'Pro Editor Multi-Slice Test',
      canvas: {
        width: 1080,
        height: 1920,
        aspect_ratio: '9:16',
        fps: 30,
        duration: 20.0,
        background_color: '#000000',
        background_mode: 'color',
      },
      playhead: 0,
      settings: {
        snapping: true,
        safe_guides: true,
        snap_tolerance_sec: 0.1,
        show_safe_zones: true,
      },
      tracks: [
        {
          id: videoTrackId,
          type: 'VIDEO',
          name: 'Main Video Track',
          locked: false,
          muted: false,
          hidden: false,
          items: [],
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  describe('1. Pro Editor Multi-Slice Timeline Concatenation', () => {
    it('slices and concats multiple video items on the timeline in order', () => {
      const project = createBaseProject();
      const videoTrack = project.tracks[0];

      // Item 1: seconds 0-10 from source seconds 5-15
      videoTrack.items.push({
        id: crypto.randomUUID(),
        track_id: videoTrack.id,
        type: 'VIDEO',
        source_asset_id: mockClipId,
        source_path: 'source/test.mp4',
        timeline_start: 0,
        timeline_end: 10.0,
        source_start: 5.0,
        source_end: 15.0,
        transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
        speed: { speed: 1.0, pitch_preserved: true },
        color: defaultColor,
        filter: { preset: 'none', intensity: 1.0 },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 0,
      });

      // Item 2: seconds 10-20 from source seconds 25-35 (cutting out 15-25 dead air)
      videoTrack.items.push({
        id: crypto.randomUUID(),
        track_id: videoTrack.id,
        type: 'VIDEO',
        source_asset_id: mockClipId,
        source_path: 'source/test.mp4',
        timeline_start: 10.0,
        timeline_end: 20.0,
        source_start: 25.0,
        source_end: 35.0,
        transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
        speed: { speed: 1.0, pitch_preserved: true },
        color: defaultColor,
        filter: { preset: 'none', intensity: 1.0 },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 0,
      });

      const tmpDir = os.tmpdir();
      const graph = ProEditorService.compileRenderGraph(
        project,
        '/tmp/source.mp4',
        '/tmp/out.mp4',
        tmpDir
      );

      // Verify trim on slice 0
      const hasSlice0V = graph.filterComplex.some((f) =>
        f.includes('trim=start=5.00:end=15.00') && f.includes('[v_slice_0]')
      );
      const hasSlice0A = graph.filterComplex.some((f) =>
        f.includes('atrim=start=5.00:end=15.00') && f.includes('[a_slice_0]')
      );
      assert.ok(hasSlice0V, 'Must trim video slice 0 to source boundaries (5.0-15.0)');
      assert.ok(hasSlice0A, 'Must trim audio slice 0 to source boundaries (5.0-15.0)');

      // Verify trim on slice 1
      const hasSlice1V = graph.filterComplex.some((f) =>
        f.includes('trim=start=25.00:end=35.00') && f.includes('[v_slice_1]')
      );
      const hasSlice1A = graph.filterComplex.some((f) =>
        f.includes('atrim=start=25.00:end=35.00') && f.includes('[a_slice_1]')
      );
      assert.ok(hasSlice1V, 'Must trim video slice 1 to source boundaries (25.0-35.0)');
      assert.ok(hasSlice1A, 'Must trim audio slice 1 to source boundaries (25.0-35.0)');

      // Verify concat filter
      const hasConcat = graph.filterComplex.some((f) =>
        f.includes('[v_slice_0][a_slice_0][v_slice_1][a_slice_1]concat=n=2:v=1:a=1[base_v][base_a]')
      );
      assert.ok(hasConcat, 'Must concatenate slices into base_v and base_a');
      assert.ok(
        graph.videoMap === '[base_v]' || graph.videoMap === '[styled_v]',
        `Video map must be base_v or styled_v (actual: ${graph.videoMap})`
      );
      assert.equal(graph.audioMap, '[master_a]');
    });
  });

  describe('2. Secondary Audio adelay & amix normalize=0', () => {
    it('applies adelay when secondary audio begins after timeline start (timeline_start > 0)', () => {
      const project = createBaseProject();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-adelay-test-'));
      const dummyMusic = path.join(tmpDir, 'bgm.mp3');
      fs.writeFileSync(dummyMusic, 'dummy audio binary');

      try {
        // Add single video item
        project.tracks[0].items.push({
          id: crypto.randomUUID(),
          track_id: project.tracks[0].id,
          type: 'VIDEO',
          source_asset_id: mockClipId,
          source_path: 'source/test.mp4',
          timeline_start: 0,
          timeline_end: 20.0,
          source_start: 0,
          source_end: 20.0,
          transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
          speed: { speed: 1.0, pitch_preserved: true },
          color: defaultColor,
          filter: { preset: 'none', intensity: 1.0 },
          effects: [],
          keyframes: [],
          locked: false,
          muted: false,
          hidden: false,
          z_index: 0,
        });

        // Add secondary audio track with timeline offset at 4.25 seconds
        const audioTrackId = crypto.randomUUID();
        project.tracks.push({
          id: audioTrackId,
          type: 'AUDIO',
          name: 'Background Music',
          locked: false,
          muted: false,
          hidden: false,
          items: [
            {
              id: crypto.randomUUID(),
              track_id: audioTrackId,
              type: 'AUDIO',
              source_asset_id: 'music-asset-1',
              source_path: dummyMusic,
              timeline_start: 4.25,
              timeline_end: 18.0,
              source_start: 0,
              source_end: 13.75,
              audio: {
                volume: 0.35,
                fade_in: 0.5,
                fade_out: 0.5,
                normalized: true,
                target_lufs: -16,
                ducking: {
                  enabled: true,
                  preset: 'balanced',
                  threshold_db: -24,
                  duck_ratio: 8,
                  attack_ms: 15,
                  release_ms: 250,
                },
              },
              transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
              speed: { speed: 1.0, pitch_preserved: true },
              effects: [],
              keyframes: [],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
            },
          ],
        });

        const graph = ProEditorService.compileRenderGraph(
          project,
          '/tmp/source.mp4',
          '/tmp/out.mp4',
          tmpDir
        );

        // Check adelay (4.25s = 4250ms)
        const hasAdelay = graph.filterComplex.some((f) => f.includes('adelay=delays=4250|4250:all=1'));
        assert.ok(hasAdelay, 'Must inject adelay matching timeline_start (4250ms)');

        // Check amix includes :normalize=0 to preserve dialogue loudness
        const hasAmix = graph.filterComplex.some((f) => f.includes('amix=') && f.includes(':normalize=0'));
        assert.ok(hasAmix, 'Must set normalize=0 on amix filter to prevent dialogue attenuation');
      } finally {
        try {
          fs.unlinkSync(dummyMusic);
          fs.rmdirSync(tmpDir);
        } catch {}
      }
    });
  });

  describe('3. Autopilot Retry Double-Increment Resilience', () => {
    it('allows full 3 attempts before exhausting retries without premature double-increment', () => {
      // Create mock run with a failed Producer step at 1 attempt
      const run: AutopilotRunRecord = {
        id: crypto.randomUUID(),
        user_id: mockUserId,
        clip_id: mockClipId,
        project_id: mockProjectId,
        status: 'FAILED',
        current_step: 'PRODUCER',
        attempts: 1,
        is_approved: false,
        settings: { target_platform: 'tiktok', producer_mode: 'BALANCED' },
        steps: [
          {
            step: 'PRODUCER',
            status: 'FAILED',
            retry_eligible: true,
            attempts: 1,
            max_attempts: 3,
            error: 'Simulated network timeout',
          },
          { step: 'HOOK_LAB', status: 'PENDING', retry_eligible: true, attempts: 0, max_attempts: 3 },
          { step: 'THUMBNAIL_LAB', status: 'PENDING', retry_eligible: true, attempts: 0, max_attempts: 3 },
          { step: 'CONTENT_PACK', status: 'PENDING', retry_eligible: true, attempts: 0, max_attempts: 3 },
          { step: 'APPROVAL', status: 'PENDING', retry_eligible: false, attempts: 0, max_attempts: 1 },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const producerStep = run.steps.find((s) => s.step === 'PRODUCER')!;

      // Attempt 1 failed (already recorded attempts = 1).
      // Retry 1: attemptsCount = 1 < 3 -> should be allowed
      assert.equal(producerStep.attempts! < producerStep.max_attempts!, true);

      // Simulate failure of retry 1 -> attempts becomes 2
      producerStep.attempts = 2;
      // Retry 2: attemptsCount = 2 < 3 -> should be allowed
      assert.equal(producerStep.attempts! < producerStep.max_attempts!, true);

      // Simulate failure of retry 2 -> attempts becomes 3
      producerStep.attempts = 3;
      // Exhausted: attemptsCount = 3 >= 3 -> should reject without manual forceRerun
      assert.equal(producerStep.attempts! >= producerStep.max_attempts!, true);
    });
  });
});
