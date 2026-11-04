import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { ClipRenderService, QuickClipAudioGraph } from '../services/clipRenderService.js';
import { AudioDuckingService } from '../services/audioDuckingService.js';
import { ProEditorService } from '../services/proEditorService.js';
import { QuickClipMusicConfig, AudioDuckingConfig } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

describe('Phase 3 — Optional Background Music & Audio Ducking in Quick Clips', () => {
  let tempDir: string;
  let dummyMusicFile: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase3-ducking-tests-'));
    dummyMusicFile = path.join(tempDir, 'ambient_music.mp3');
    fs.writeFileSync(dummyMusicFile, 'ID3-dummy-audio-content');
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // ==========================================================================
  // SUITE 1: LEGACY RENDERING WITHOUT BACKGROUND MUSIC
  // ==========================================================================
  describe('1. Legacy Rendering Without Background Music', () => {
    it('returns hasBackgroundMusic: false when backgroundMusic is undefined', () => {
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 15.0,
        clipVolume: 1.0,
        backgroundMusic: undefined,
        resolvedMusicPath: null,
      });

      assert.equal(graph.hasBackgroundMusic, false);
      assert.equal(graph.inputArgs.length, 0);
      assert.equal(graph.filterComplex.length, 0);
      assert.equal(graph.audioMap, '0:a');
    });

    it('returns hasBackgroundMusic: false when backgroundMusic is explicitly disabled', () => {
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 20.0,
        clipVolume: 1.0,
        backgroundMusic: {
          enabled: false,
          source_path: dummyMusicFile,
        },
        resolvedMusicPath: dummyMusicFile,
      });

      assert.equal(graph.hasBackgroundMusic, false);
      assert.equal(graph.inputArgs.length, 0);
      assert.equal(graph.filterComplex.length, 0);
      assert.equal(graph.audioMap, '0:a');
    });
  });

  // ==========================================================================
  // SUITE 2: MISSING OR INACCESSIBLE MUSIC FILES (SAFE FALLBACK)
  // ==========================================================================
  describe('2. Missing or Inaccessible Music Files', () => {
    it('safely falls back to dialogue-only if resolvedMusicPath is null', () => {
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 10.0,
        clipVolume: 1.0,
        backgroundMusic: {
          enabled: true,
          track_id: 'non-existent-track',
        },
        resolvedMusicPath: null,
      });

      assert.equal(graph.hasBackgroundMusic, false);
      assert.equal(graph.inputArgs.length, 0);
      assert.equal(graph.filterComplex.length, 0);
      assert.equal(graph.audioMap, '0:a');
    });

    it('safely falls back to dialogue-only if file does not exist on disk', () => {
      const nonExistentPath = path.join(tempDir, 'missing_file.mp3');
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 10.0,
        clipVolume: 1.0,
        backgroundMusic: {
          enabled: true,
          source_path: nonExistentPath,
        },
        resolvedMusicPath: nonExistentPath,
      });

      assert.equal(graph.hasBackgroundMusic, false);
      assert.equal(graph.inputArgs.length, 0);
      assert.equal(graph.filterComplex.length, 0);
      assert.equal(graph.audioMap, '0:a');
    });

    it('resolveBackgroundMusicPath returns null for missing files or disabled config', async () => {
      const missingPath = path.join(tempDir, 'ghost.mp3');
      const resMissing = await ClipRenderService.resolveBackgroundMusicPath({
        enabled: true,
        source_path: missingPath,
      });
      assert.equal(resMissing, null);

      const resDisabled = await ClipRenderService.resolveBackgroundMusicPath({
        enabled: false,
        source_path: dummyMusicFile,
      });
      assert.equal(resDisabled, null);

      const resValid = await ClipRenderService.resolveBackgroundMusicPath({
        enabled: true,
        source_path: dummyMusicFile,
      });
      assert.equal(resValid, dummyMusicFile);
    });
  });

  // ==========================================================================
  // SUITE 3: DUCKING ENABLED & SIDECHAIN SIGNAL ROUTING
  // ==========================================================================
  describe('3. Explicit Music Configuration with Ducking Enabled', () => {
    it('splits dialogue signal using asplit=2 to prevent filter pad exhaustion', () => {
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 12.0,
        clipVolume: 1.0,
        backgroundMusic: {
          enabled: true,
          volume: 0.3,
          ducking_enabled: true,
          ducking_preset: 'balanced',
        },
        resolvedMusicPath: dummyMusicFile,
      });

      assert.equal(graph.hasBackgroundMusic, true);
      assert.ok(graph.filterComplex.some((f) => f.includes('asplit=2[a_dialogue_mix][a_dialogue_sc]')));
    });

    it('routes sidechaincompress with music as main input and dialogue as sidechain trigger', () => {
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 12.0,
        clipVolume: 1.0,
        backgroundMusic: {
          enabled: true,
          volume: 0.25,
          ducking_enabled: true,
          ducking_preset: 'balanced',
        },
        resolvedMusicPath: dummyMusicFile,
      });

      const scFilter = graph.filterComplex.find((f) => f.includes('sidechaincompress='));
      assert.ok(scFilter, 'Must include sidechaincompress filter');
      // Format: [main_signal][sidechain_trigger]sidechaincompress=...[output]
      assert.ok(
        scFilter.startsWith('[a_music_prep][a_dialogue_sc]sidechaincompress='),
        'Music must be compressed under dialogue control signal'
      );
      assert.ok(scFilter.endsWith('[a_music_ducked]'), 'Must terminate with ducked music pad');
      assert.ok(scFilter.includes('ratio=8'), 'Balanced preset must specify ratio 8');
      assert.ok(scFilter.includes('attack=30'), 'Balanced preset must specify 30ms attack');
      assert.ok(scFilter.includes('release=350'), 'Balanced preset must specify 350ms release');
    });

    it('mixes dialogue and ducked music together using amix and alimiter master limiter', () => {
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 15.0,
        clipVolume: 1.0,
        backgroundMusic: {
          enabled: true,
          volume: 0.2,
          ducking_enabled: true,
        },
        resolvedMusicPath: dummyMusicFile,
      });

      const mixFilter = graph.filterComplex[graph.filterComplex.length - 1];
      assert.ok(mixFilter.includes('[a_dialogue_mix][a_music_ducked]amix=inputs=2:duration=first:dropout_transition=2'));
      assert.ok(mixFilter.includes('alimiter=limit=-1.0dB:attack=5:release=50[out_a]'));
      assert.equal(graph.audioMap, '[out_a]');
    });
  });

  // ==========================================================================
  // SUITE 4: DUCKING DISABLED BEHAVIOR
  // ==========================================================================
  describe('4. Music Configuration with Ducking Disabled', () => {
    it('bypasses sidechain compression and uses anull when ducking_enabled is false', () => {
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 15.0,
        clipVolume: 0.8,
        backgroundMusic: {
          enabled: true,
          volume: 0.2,
          ducking_enabled: false,
        },
        resolvedMusicPath: dummyMusicFile,
      });

      assert.equal(graph.hasBackgroundMusic, true);
      // Dialogue does not need to be split when there is no sidechain trigger
      assert.ok(graph.filterComplex.some((f) => f.includes('[0:a]volume=0.80[a_dialogue_mix]')));
      assert.ok(!graph.filterComplex.some((f) => f.includes('asplit=2')));

      // Music passes through un-ducked with anull
      assert.ok(graph.filterComplex.some((f) => f.includes('[a_music_prep]anull[a_music_ducked]')));
      assert.ok(!graph.filterComplex.some((f) => f.includes('sidechaincompress=')));

      // Mix still combines dialogue and music
      const mixFilter = graph.filterComplex[graph.filterComplex.length - 1];
      assert.ok(mixFilter.includes('[a_dialogue_mix][a_music_ducked]amix=inputs=2'));
    });
  });

  // ==========================================================================
  // SUITE 5: DURATION, TRIMMING, LOOPING, AND FADING
  // ==========================================================================
  describe('5. Music Duration, Trimming, Looping, and Fading', () => {
    it('trims music to the exact duration of the clip and sets PTS', () => {
      const durationSec = 17.45;
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec,
        clipVolume: 1.0,
        backgroundMusic: {
          enabled: true,
          volume: 0.25,
        },
        resolvedMusicPath: dummyMusicFile,
      });

      const musicFilter = graph.filterComplex.find((f) => f.includes('atrim='));
      assert.ok(musicFilter, 'Must include atrim filter');
      assert.ok(musicFilter.includes(`atrim=0:${durationSec.toFixed(3)}`));
      assert.ok(musicFilter.includes('asetpts=PTS-STARTPTS'));
    });

    it('includes aloop filter by default or when loop: true', () => {
      const graphDefault = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 30.0,
        backgroundMusic: { enabled: true },
        resolvedMusicPath: dummyMusicFile,
      });
      assert.deepEqual(graphDefault.inputArgs, ['-i', dummyMusicFile]);
      assert.ok(graphDefault.filterComplex.some((f) => f.includes('aloop=loop=-1:size=2e+09')));

      const graphExplicitLoop = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 30.0,
        backgroundMusic: { enabled: true, loop: true },
        resolvedMusicPath: dummyMusicFile,
      });
      assert.deepEqual(graphExplicitLoop.inputArgs, ['-i', dummyMusicFile]);
      assert.ok(graphExplicitLoop.filterComplex.some((f) => f.includes('aloop=loop=-1:size=2e+09')));
    });

    it('omits aloop filter when loop: false is explicitly configured', () => {
      const graphNoLoop = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 30.0,
        backgroundMusic: { enabled: true, loop: false },
        resolvedMusicPath: dummyMusicFile,
      });
      assert.deepEqual(graphNoLoop.inputArgs, ['-i', dummyMusicFile]);
      assert.ok(!graphNoLoop.filterComplex.some((f) => f.includes('aloop=')));
    });

    it('calculates fade-out start time correctly and clamps for short clips', () => {
      // 10s clip with 0.5s fade-out => fade starts at 9.5s
      const graph10s = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 10.0,
        backgroundMusic: { enabled: true, fade_in: 0.2, fade_out: 0.5 },
        resolvedMusicPath: dummyMusicFile,
      });
      const filter10s = graph10s.filterComplex.find((f) => f.includes('afade=t=out'));
      assert.ok(filter10s?.includes('st=9.50:d=0.50'));

      // Very short clip (0.3s) with 0.5s fade-out => fade start clamped to 0.00
      const graphShort = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 0.3,
        backgroundMusic: { enabled: true, fade_out: 0.5 },
        resolvedMusicPath: dummyMusicFile,
      });
      const filterShort = graphShort.filterComplex.find((f) => f.includes('afade=t=out'));
      assert.ok(filterShort?.includes('st=0.00:d=0.50'));
    });
  });

  // ==========================================================================
  // SUITE 6: DUCKING PRESETS & CUSTOM CONFIGURATION
  // ==========================================================================
  describe('6. Ducking Presets & Custom Configuration', () => {
    it('applies subtle ducking preset parameters (ratio=4, -28dB)', () => {
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 10.0,
        backgroundMusic: { enabled: true, ducking_preset: 'subtle' },
        resolvedMusicPath: dummyMusicFile,
      });
      const sc = graph.filterComplex.find((f) => f.includes('sidechaincompress='))!;
      assert.ok(sc.includes('ratio=4'));
      assert.ok(sc.includes('attack=40'));
      assert.ok(sc.includes('release=300'));
    });

    it('applies strong ducking preset parameters (ratio=16, -32dB)', () => {
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 10.0,
        backgroundMusic: { enabled: true, ducking_preset: 'strong' },
        resolvedMusicPath: dummyMusicFile,
      });
      const sc = graph.filterComplex.find((f) => f.includes('sidechaincompress='))!;
      assert.ok(sc.includes('ratio=16'));
      assert.ok(sc.includes('attack=20'));
      assert.ok(sc.includes('release=450'));
    });

    it('clamps custom ducking configuration within safe numerical bounds', () => {
      const graph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 10.0,
        backgroundMusic: {
          enabled: true,
          ducking_config: {
            enabled: true,
            preset: 'custom',
            threshold_db: -100, // Below -50dB limit -> clamped to -50
            duck_ratio: 50, // Above 20 limit -> clamped to 20
            attack_ms: 1000, // Above 200ms limit -> clamped to 200
            release_ms: 2, // Below 50ms limit -> clamped to 50
          },
        },
        resolvedMusicPath: dummyMusicFile,
      });

      const sc = graph.filterComplex.find((f) => f.includes('sidechaincompress='))!;
      assert.ok(sc.includes('ratio=20'), 'Ratio clamped to 20');
      assert.ok(sc.includes('attack=200'), 'Attack clamped to 200ms');
      assert.ok(sc.includes('release=50'), 'Release clamped to 50ms');
    });
  });

  // ==========================================================================
  // SUITE 7: PRO EDITOR BACKWARD COMPATIBILITY
  // ==========================================================================
  describe('7. Pro Editor Backward Compatibility', () => {
    it('preserves existing ProEditorService multi-track ducking compilation unchanged', () => {
      const project: any = {
        id: 'mock-proj',
        canvas: { width: 1080, height: 1920, duration: 10.0 },
        tracks: [
          {
            id: 'v1',
            type: 'VIDEO',
            name: 'Main Video',
            muted: false,
            hidden: false,
            items: [
              {
                id: 'item1',
                type: 'VIDEO',
                source_path: dummyMusicFile,
                timeline_start: 0,
                timeline_end: 10,
                source_start: 0,
                source_end: 10,
                effects: [],
                keyframes: [],
              },
            ],
          },
          {
            id: 'a1',
            type: 'AUDIO',
            name: 'B-Roll Music',
            muted: false,
            hidden: false,
            items: [
              {
                id: 'item2',
                type: 'AUDIO',
                source_path: dummyMusicFile,
                timeline_start: 0,
                timeline_end: 10,
                source_start: 0,
                source_end: 10,
                audio: {
                  volume: 0.3,
                  ducking: {
                    enabled: true,
                    preset: 'balanced',
                    threshold_db: -30,
                    duck_ratio: 8,
                    attack_ms: 30,
                    release_ms: 350,
                  },
                },
              },
            ],
          },
        ],
      };

      const compiled = ProEditorService.compileRenderGraph(project, dummyMusicFile);
      assert.ok(compiled.filterComplex.length > 0);
      assert.ok(compiled.filterComplex.some((f: string) => f.includes('sidechaincompress=')));
      assert.ok(compiled.audioMap.length > 0);
    });
  });

  // ==========================================================================
  // SUITE 8: FFMPEG AUDIO DUCKING SMOKE TEST (SYNTHETIC FIXTURES)
  // ==========================================================================
  describe('8. FFmpeg Audio Ducking Smoke Test', () => {
    it('renders a dual-stream ducked video and verifies playable output stream', async () => {
      const dialogueVid = path.join(tempDir, 'smoke_dialogue.mp4');
      const musicAudio = path.join(tempDir, 'smoke_music.mp3');
      const outputVid = path.join(tempDir, 'smoke_ducked_out.mp4');

      // 1. Create a 2-second dialogue video with a 1000Hz speech tone from 0.5s to 1.5s
      const makeDialogueArgs = [
        '-nostdin',
        '-y',
        '-f', 'lavfi', '-i', 'color=c=black:s=360x640:r=25:d=2.0',
        '-f', 'lavfi', '-i', 'sine=f=1000:d=1.0',
        '-filter_complex', '[1:a]adelay=500|500,apad=whole_dur=2[a_delayed]',
        '-map', '0:v',
        '-map', '[a_delayed]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-t', '2.0',
        dialogueVid,
      ];
      await execFileAsync(ffmpegBin, makeDialogueArgs);
      assert.ok(fs.existsSync(dialogueVid));

      // 2. Create a 1-second 300Hz background music file
      const makeMusicArgs = [
        '-nostdin',
        '-y',
        '-f', 'lavfi', '-i', 'sine=f=300:d=1.0',
        '-c:a', 'mp3',
        '-t', '1.0',
        musicAudio,
      ];
      await execFileAsync(ffmpegBin, makeMusicArgs);
      assert.ok(fs.existsSync(musicAudio));

      // 3. Compile audio graph using ClipRenderService
      const audioGraph = ClipRenderService.compileQuickClipAudioGraph({
        durationSec: 2.0,
        clipVolume: 1.0,
        backgroundMusic: {
          enabled: true,
          volume: 0.25,
          ducking_enabled: true,
          ducking_preset: 'balanced',
          fade_in: 0.1,
          fade_out: 0.2,
        },
        resolvedMusicPath: musicAudio,
      });

      assert.equal(audioGraph.hasBackgroundMusic, true);

      // 4. Execute render command
      const fullFilterComplex = [
        '[0:v]null[out_v]',
        ...audioGraph.filterComplex,
      ];

      const renderArgs = [
        '-nostdin',
        '-y',
        '-ss', '0.000',
        '-t', '2.000',
        '-i', dialogueVid,
        ...audioGraph.inputArgs,
        '-filter_complex', fullFilterComplex.join(';'),
        '-map', '[out_v]',
        '-map', audioGraph.audioMap,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-t', '2.000',
        outputVid,
      ];

      await execFileAsync(ffmpegBin, renderArgs);

      // 5. Verify output file exists and has size
      assert.ok(fs.existsSync(outputVid));
      const stat = fs.statSync(outputVid);
      assert.ok(stat.size > 1000, `Output file must have valid size (got ${stat.size} bytes)`);

      // 6. Probe output streams with ffprobe
      const probeArgs = [
        '-v', 'error',
        '-show_entries', 'stream=codec_type,codec_name,duration',
        '-of', 'json',
        outputVid,
      ];
      const { stdout: probeStdout } = await execFileAsync('ffprobe', probeArgs);
      const probeData = JSON.parse(probeStdout);
      const videoStream = probeData.streams.find((s: any) => s.codec_type === 'video');
      const audioStream = probeData.streams.find((s: any) => s.codec_type === 'audio');

      assert.ok(videoStream, 'Rendered file must have video stream');
      assert.equal(videoStream.codec_name, 'h264');

      assert.ok(audioStream, 'Rendered file must have mixed audio stream');
      assert.equal(audioStream.codec_name, 'aac');
      const dur = parseFloat(audioStream.duration);
      assert.ok(Math.abs(dur - 2.0) <= 0.15, `Duration must match ~2.0s (got ${dur})`);
    });
  });
});
