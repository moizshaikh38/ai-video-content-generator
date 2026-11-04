import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { extractAudioFromVideo } from '../services/audioExtractionService.js';
import { AudioDuckingService } from '../services/audioDuckingService.js';
import { AudioAnalysisService } from '../services/audioAnalysisService.js';
import { AudioEnhancementService } from '../services/audioEnhancementService.js';
import { AUDIO_CLEAN_PRESETS, AUDIO_DUCKING_PRESETS, AudioAnalysisMetrics } from '../types/index.js';

const REAL_VIDEO_ASSET = path.resolve(
  process.cwd(),
  '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'
);

describe('Phase Audio Pipeline Upgrades — Non-destructive Extraction, Ducking & Studio Intelligence', () => {
  describe('1. Audio Extraction Service (Caller File Safety & Bitrate Intelligence)', () => {
    it('does not delete the caller video file when passed a string file path', async () => {
      assert.ok(fs.existsSync(REAL_VIDEO_ASSET), `Test asset must exist at ${REAL_VIDEO_ASSET}`);

      // Create a temporary copy to simulate user/caller video file
      const tmpCallerDir = path.join(os.tmpdir(), `vireo-test-caller-${crypto.randomUUID()}`);
      fs.mkdirSync(tmpCallerDir, { recursive: true });
      const callerVideoCopy = path.join(tmpCallerDir, 'user-source-video.mp4');
      fs.copyFileSync(REAL_VIDEO_ASSET, callerVideoCopy);

      assert.ok(fs.existsSync(callerVideoCopy), 'Caller copy should exist prior to extraction');

      try {
        const result = await extractAudioFromVideo(callerVideoCopy);

        assert.ok(result.audioBuffer, 'Extraction must return an audio buffer');
        assert.ok(result.audioBuffer.length > 0, 'Extracted buffer must have non-zero size');
        assert.equal(result.format, 'mp3');

        // Cleanup temporary extracted audio
        result.cleanup();

        // CRITICAL: The caller video file MUST NOT have been unlinked
        assert.ok(
          fs.existsSync(callerVideoCopy),
          'Caller source video path must NOT be deleted after extractAudioFromVideo'
        );
      } finally {
        fs.rmSync(tmpCallerDir, { recursive: true, force: true });
      }
    });

    it('extracts audio from Buffer and cleans up internal temp files safely', async () => {
      assert.ok(fs.existsSync(REAL_VIDEO_ASSET));
      const videoBuffer = fs.readFileSync(REAL_VIDEO_ASSET);

      const result = await extractAudioFromVideo(videoBuffer);
      assert.ok(Buffer.isBuffer(result.audioBuffer));
      assert.ok(result.audioBuffer.length > 0);
      result.cleanup();
    });
  });

  describe('2. Audio Ducking Service (amix Normalization Fix)', () => {
    it('appends :normalize=0 to amix in compileDuckedMix to preserve dialogue volume', () => {
      const subtleFilter = AudioDuckingService.compileDuckedMix(
        '[dialogue]',
        '[music]',
        '[mixed]',
        AUDIO_DUCKING_PRESETS.subtle as any
      );
      assert.ok(
        subtleFilter[subtleFilter.length - 1].includes(':normalize=0[mixed]'),
        'amix must specify normalize=0 to prevent 50% volume drop on dialogue'
      );

      const balancedFilter = AudioDuckingService.compileDuckedMix(
        '[dialogue]',
        '[music]',
        '[mixed]',
        AUDIO_DUCKING_PRESETS.balanced as any
      );
      assert.ok(
        balancedFilter[balancedFilter.length - 1].includes(':normalize=0[mixed]'),
        'balanced ducking amix must specify normalize=0'
      );

      const strongFilter = AudioDuckingService.compileDuckedMix(
        '[dialogue]',
        '[music]',
        '[mixed]',
        AUDIO_DUCKING_PRESETS.strong as any
      );
      assert.ok(
        strongFilter[strongFilter.length - 1].includes(':normalize=0[mixed]'),
        'strong ducking amix must specify normalize=0'
      );
    });
  });

  describe('3. Audio Analysis Service (Robust Probing, Histograms & Bounded Cache)', () => {
    it('probes real media asset and returns valid acoustic stream metadata', async () => {
      assert.ok(fs.existsSync(REAL_VIDEO_ASSET));
      const probe = await AudioAnalysisService.probeAudioStream(REAL_VIDEO_ASSET);

      assert.ok(probe.duration_sec > 0);
      assert.ok(probe.channels >= 1);
      assert.ok(probe.sample_rate >= 16000);
      assert.ok(typeof probe.codec === 'string' && probe.codec.length > 0);
    });

    it('bounds analysis cache to maximum 200 items using FIFO eviction', async () => {
      AudioAnalysisService.clearCache();

      // Access private cache via reflection for test verification
      const cacheMap = (AudioAnalysisService as any).cache as Map<string, any>;

      // Populate 200 mock entries
      for (let i = 0; i < 200; i++) {
        cacheMap.set(`/mock/path/audio-${i}.mp3`, {
          mtimeMs: 1000 + i,
          metrics: {
            integrated_lufs: -16,
            loudness_range_lu: 5,
            true_peak_db: -1,
            rms_db: -20,
            mean_volume_db: -20,
            max_volume_db: -1,
            silence_ratio: 0.1,
            speech_ratio: 0.9,
            is_clipping: false,
            clipping_count: 0,
            channels: 2,
            sample_rate: 44100,
            duration_sec: 10,
          },
        });
      }

      assert.equal(cacheMap.size, 200);
      assert.ok(cacheMap.has('/mock/path/audio-0.mp3'));

      // Analyzing a real asset should evict the oldest entry (/mock/path/audio-0.mp3)
      await AudioAnalysisService.analyzeAudio(REAL_VIDEO_ASSET);

      assert.equal(cacheMap.size, 200, 'Cache size must remain capped at 200');
      assert.equal(
        cacheMap.has('/mock/path/audio-0.mp3'),
        false,
        'Oldest cache entry must have been evicted'
      );
      assert.ok(cacheMap.has(REAL_VIDEO_ASSET), 'Newly analyzed asset must be cached');
    });
  });

  describe('4. Audio Enhancement Service (Studio Sound Intelligence & Windowed Preview)', () => {
    it('recommends adaptive config with tighter compression when loudness range > 9 LU', () => {
      const highDynamicMetrics: AudioAnalysisMetrics = {
        integrated_lufs: -16,
        loudness_range_lu: 12.4, // Wild dynamic range (whisper to yell)
        true_peak_db: -2.0,
        rms_db: -20,
        mean_volume_db: -22,
        max_volume_db: -2,
        silence_ratio: 0.2,
        speech_ratio: 0.8,
        is_clipping: false,
        clipping_count: 0,
        channels: 2,
        sample_rate: 48000,
        duration_sec: 30,
        noise_floor_estimate_db: -55,
      };

      const adapted = AudioEnhancementService.recommendAdaptiveConfig(
        highDynamicMetrics,
        'podcast'
      );

      assert.equal(adapted.compressor_enabled, true);
      assert.ok(
        (adapted.compressor_threshold_db ?? 0) <= -20,
        'Compressor threshold must be clamped down for dynamic speech'
      );
      assert.ok(
        (adapted.compressor_ratio ?? 0) >= 4.0,
        'Compressor ratio must be at least 4.0 for high LRA'
      );
    });

    it('recommends lower limiter ceiling when digital clipping is detected', () => {
      const clippingMetrics: AudioAnalysisMetrics = {
        integrated_lufs: -12,
        loudness_range_lu: 6.0,
        true_peak_db: 0.8, // Exceeds 0 dBFS ceiling
        rms_db: -14,
        mean_volume_db: -15,
        max_volume_db: 0.0,
        silence_ratio: 0.1,
        speech_ratio: 0.9,
        is_clipping: true,
        clipping_count: 42,
        channels: 2,
        sample_rate: 44100,
        duration_sec: 15,
        noise_floor_estimate_db: -50,
      };

      const adapted = AudioEnhancementService.recommendAdaptiveConfig(
        clippingMetrics,
        'clean'
      );

      assert.equal(adapted.limiter_enabled, true);
      assert.equal(
        adapted.limiter_ceiling_db,
        -1.5,
        'Limiter ceiling must back off to -1.5 dBFS to prevent clipping'
      );
    });

    it('adapts denoise amount based on noise floor estimate', () => {
      // 1. High ambient noise
      const noisyMetrics: AudioAnalysisMetrics = {
        integrated_lufs: -18,
        loudness_range_lu: 6.0,
        true_peak_db: -1.5,
        rms_db: -22,
        mean_volume_db: -22,
        max_volume_db: -1.5,
        silence_ratio: 0.3,
        speech_ratio: 0.7,
        is_clipping: false,
        clipping_count: 0,
        channels: 1,
        sample_rate: 44100,
        duration_sec: 20,
        noise_floor_estimate_db: -38, // High noise floor
      };

      const adaptedNoisy = AudioEnhancementService.recommendAdaptiveConfig(noisyMetrics, 'natural');
      assert.equal(adaptedNoisy.denoise_enabled, true);
      assert.ok(adaptedNoisy.denoise_amount >= 45, 'Denoise amount must increase for noisy audio');

      // 2. Pristine studio recording
      const pristineMetrics: AudioAnalysisMetrics = {
        ...noisyMetrics,
        noise_floor_estimate_db: -68,
      };

      const adaptedPristine = AudioEnhancementService.recommendAdaptiveConfig(
        pristineMetrics,
        'clean'
      );
      assert.ok(
        adaptedPristine.denoise_amount <= 15,
        'Denoise amount must remain gentle for pristine audio'
      );
    });

    it('generates non-destructive preview snippet with windowed before/after metrics and prunes stale previews', async () => {
      assert.ok(fs.existsSync(REAL_VIDEO_ASSET));

      const preview = await AudioEnhancementService.generatePreviewSnippet(
        REAL_VIDEO_ASSET,
        AUDIO_CLEAN_PRESETS.clean,
        0.5,
        2.0
      );

      assert.ok(preview.preview_audio_path);
      assert.ok(fs.existsSync(preview.preview_audio_path));
      assert.ok(preview.before_metrics);
      assert.ok(preview.after_metrics);
      assert.ok(Number.isFinite(preview.before_metrics.integrated_lufs));
      assert.ok(Number.isFinite(preview.after_metrics.integrated_lufs));

      // Cleanup preview file
      fs.rmSync(preview.preview_audio_path, { force: true });
    });
  });
});
