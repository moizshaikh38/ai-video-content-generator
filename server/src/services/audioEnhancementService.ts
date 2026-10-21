import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '../utils/logger.js';
import {
  AppError,
  AudioCleanPreset,
  AudioEnhancementConfig,
  AUDIO_CLEAN_PRESETS,
  AudioAnalysisMetrics,
} from '../types/index.js';
import { AudioAnalysisService } from './audioAnalysisService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

/**
 * Phase 20: Speech Enhancement & Audio Cleanup Service
 * Provides studio-grade non-destructive audio cleanup pipelines:
 * - High-pass rumble filter (80–100Hz)
 * - 50Hz / 60Hz AC electrical hum notch filters
 * - FFT noise reduction (afftdn)
 * - Sibilance de-essing (6kHz band attenuation)
 * - Vocal dynamics leveling (acompressor)
 * - 3-band parametric EQ (Low, Mid, High)
 * - EBU R128 loudness normalization (loudnorm)
 * - Lookahead brickwall limiter (alimiter)
 */
export class AudioEnhancementService {
  /**
   * Compiles an ordered, deterministic array of FFmpeg audio filters
   * based on the provided enhancement configuration.
   */
  public static compileFilterGraph(config: AudioEnhancementConfig): string[] {
    const filters: string[] = [];

    if (config.preset === 'off') {
      return filters;
    }

    // 1. High-pass filter to eliminate sub-bass rumble, air conditioning, handling noise
    if (config.highpass_freq && config.highpass_freq > 20) {
      const freq = Math.min(200, Math.max(40, Math.round(config.highpass_freq)));
      filters.push(`highpass=f=${freq}`);
    }

    // 2. 50Hz / 60Hz hum notch filters
    if (config.hum_removal_enabled) {
      filters.push('equalizer=f=50:width_type=q:w=12:g=-24');
      filters.push('equalizer=f=60:width_type=q:w=12:g=-24');
    }

    // 3. FFT noise reduction (afftdn)
    if (config.denoise_enabled && config.denoise_amount > 0) {
      // Scale denoise amount 0-100 to nr parameter (3 to 35 dB reduction)
      const nrDb = Math.min(35, Math.max(3, Math.round((config.denoise_amount / 100) * 35)));
      filters.push(`afftdn=nr=${nrDb}:nf=-30`);
    }

    // 4. De-essing (mild sibilance attenuation around 6kHz)
    if (config.deess_enabled) {
      filters.push('equalizer=f=6000:width_type=o:w=1.5:g=-4.5');
    }

    // 5. Parametric EQ (Low, Mid, High)
    if (config.eq_low_db && Math.abs(config.eq_low_db) > 0.2) {
      const g = Math.min(12, Math.max(-12, config.eq_low_db));
      filters.push(`equalizer=f=180:width_type=q:w=1.2:g=${g.toFixed(1)}`);
    }
    if (config.eq_mid_db && Math.abs(config.eq_mid_db) > 0.2) {
      const g = Math.min(12, Math.max(-12, config.eq_mid_db));
      filters.push(`equalizer=f=2200:width_type=q:w=1.0:g=${g.toFixed(1)}`);
    }
    if (config.eq_high_db && Math.abs(config.eq_high_db) > 0.2) {
      const g = Math.min(12, Math.max(-12, config.eq_high_db));
      filters.push(`equalizer=f=8000:width_type=q:w=1.5:g=${g.toFixed(1)}`);
    }

    // 6. Voice dynamics compression (acompressor)
    if (config.compressor_enabled) {
      const thresh = Math.min(-6, Math.max(-36, config.compressor_threshold_db ?? -18));
      const ratio = Math.min(10, Math.max(1.5, config.compressor_ratio ?? 3.0));
      const attack = Math.min(100, Math.max(5, config.compressor_attack_ms ?? 20));
      const release = Math.min(800, Math.max(50, config.compressor_release_ms ?? 220));
      filters.push(`acompressor=threshold=${thresh}dB:ratio=${ratio}:attack=${attack}:release=${release}:makeup=1.5`);
    }

    // 7. EBU R128 loudness normalization (loudnorm)
    if (config.normalize_enabled) {
      const targetI = Math.min(-10, Math.max(-24, config.target_lufs || -16));
      filters.push(`loudnorm=I=${targetI}:TP=-1.5:LRA=11`);
    }

    // 8. Lookahead brickwall peak limiter to guarantee no clipping
    if (config.limiter_enabled) {
      const ceiling = Math.min(-0.2, Math.max(-3.0, config.limiter_ceiling_db || -1.0));
      filters.push(`alimiter=limit=${ceiling}dB:attack=5:release=50`);
    }

    return filters;
  }

  /**
   * Resolves preset configuration by name.
   */
  public static getPresetConfig(preset: AudioCleanPreset): AudioEnhancementConfig {
    return AUDIO_CLEAN_PRESETS[preset] || AUDIO_CLEAN_PRESETS.clean;
  }

  /**
   * Intelligently adapts an audio cleanup configuration based on acoustic analysis metrics.
   * Fine-tunes noise reduction, dynamics compression, loudness normalization, and brickwall limiting.
   */
  public static recommendAdaptiveConfig(
    metrics: AudioAnalysisMetrics,
    basePreset: AudioCleanPreset = 'podcast'
  ): AudioEnhancementConfig {
    const base = { ...this.getPresetConfig(basePreset) };

    // 1. Adaptive Denoise from noise floor & silence ratio
    const noiseFloor = metrics.noise_floor_estimate_db ?? (metrics.mean_volume_db - 18.0);
    if (noiseFloor > -42) {
      // High background noise / hum
      base.denoise_enabled = true;
      base.denoise_amount = Math.min(65, Math.max(base.denoise_amount, 45));
    } else if (noiseFloor > -50) {
      // Moderate ambient noise
      base.denoise_enabled = true;
      base.denoise_amount = Math.min(45, Math.max(base.denoise_amount, 30));
    } else if (noiseFloor <= -60) {
      // Very clean recording environment: avoid over-processing
      base.denoise_amount = Math.min(base.denoise_amount, 15);
    }

    // 2. Adaptive Compressor from Loudness Range (LRA)
    // LRA > 9 LU implies wild volume swings (whispering vs shouting) needing tighter control
    if (metrics.loudness_range_lu > 9.0) {
      base.compressor_enabled = true;
      base.compressor_threshold_db = Math.min(base.compressor_threshold_db ?? -16, -20);
      base.compressor_ratio = Math.max(base.compressor_ratio ?? 3.0, 4.0);
      base.compressor_attack_ms = Math.min(base.compressor_attack_ms ?? 20, 15);
      base.compressor_release_ms = Math.max(base.compressor_release_ms ?? 180, 220);
    } else if (metrics.loudness_range_lu < 4.0) {
      // Already heavily compressed or uniform
      if (base.compressor_ratio && base.compressor_ratio > 2.5) {
        base.compressor_ratio = 2.5;
      }
    }

    // 3. Adaptive Brickwall Limiter for clipping prevention
    if (metrics.is_clipping || metrics.true_peak_db >= -0.5 || metrics.clipping_count > 0) {
      base.limiter_enabled = true;
      // Pull back ceiling to -1.5 dBFS to prevent DAC inter-sample peaks
      base.limiter_ceiling_db = -1.5;
    }

    // 4. Adaptive Loudness Normalization
    if (Math.abs(metrics.integrated_lufs - base.target_lufs) > 1.5) {
      base.normalize_enabled = true;
    }

    return base;
  }

  /**
   * Generates a fast, non-destructive A/B preview snippet (e.g., 5 seconds)
   * returning metrics before and after enhancement.
   */
  public static async generatePreviewSnippet(
    sourcePath: string,
    config: AudioEnhancementConfig,
    startTimeSec = 0,
    durationSec = 5.0
  ): Promise<{
    preview_audio_path: string;
    before_metrics: AudioAnalysisMetrics;
    after_metrics: AudioAnalysisMetrics;
    before: AudioAnalysisMetrics;
    after: AudioAnalysisMetrics;
  }> {
    if (!fs.existsSync(sourcePath)) {
      throw new AppError(`Source audio file not found: ${sourcePath}`, 404, 'FILE_NOT_FOUND');
    }

    const tmpDir = path.join(os.tmpdir(), 'vireo-audio-previews');
    fs.mkdirSync(tmpDir, { recursive: true });

    // Prune stale previews older than 30 minutes
    try {
      const files = fs.readdirSync(tmpDir);
      const now = Date.now();
      const thirtyMinutesMs = 30 * 60 * 1000;
      for (const file of files) {
        const fullPath = path.join(tmpDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > thirtyMinutesMs) {
            fs.unlinkSync(fullPath);
          }
        } catch {
          // ignore individual file deletion error
        }
      }
    } catch {
      // ignore readdir error
    }

    const previewId = crypto.randomUUID();
    const outputPath = path.join(tmpDir, `preview-${previewId}.m4a`);

    const filters = this.compileFilterGraph(config);
    const filterArg = filters.length > 0 ? filters.join(',') : 'anull';

    const args = [
      '-nostdin',
      '-hide_banner',
      '-ss', startTimeSec.toFixed(2),
      '-t', durationSec.toFixed(2),
      '-i', sourcePath,
      '-vn',
      '-af', filterArg,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      outputPath,
    ];

    try {
      await execFileAsync(ffmpegBin, args, { timeout: 30000 });
    } catch (err: any) {
      logger.error(`[AudioEnhancementService] Preview render failed: ${err.message}`);
      throw new AppError(`Failed to render audio preview: ${err.message}`, 500, 'RENDER_FAILED');
    }

    // Window-accurate before_metrics computation
    let beforeMetrics: AudioAnalysisMetrics;
    const rawSnippetPath = path.join(tmpDir, `raw-before-${previewId}.m4a`);
    try {
      const probe = await AudioAnalysisService.probeAudioStream(sourcePath);
      const isLongSource = probe.duration_sec > durationSec * 1.5;

      if (startTimeSec > 0 || isLongSource) {
        const rawArgs = [
          '-nostdin',
          '-hide_banner',
          '-ss', startTimeSec.toFixed(2),
          '-t', durationSec.toFixed(2),
          '-i', sourcePath,
          '-vn',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-y',
          rawSnippetPath,
        ];
        await execFileAsync(ffmpegBin, rawArgs, { timeout: 30000 });
        beforeMetrics = await AudioAnalysisService.analyzeAudio(rawSnippetPath);
      } else {
        beforeMetrics = await AudioAnalysisService.analyzeAudio(sourcePath);
      }
    } catch (rawErr: any) {
      logger.warn(`[AudioEnhancementService] Windowed before metrics fallback to full source analysis: ${rawErr.message}`);
      beforeMetrics = await AudioAnalysisService.analyzeAudio(sourcePath);
    } finally {
      if (fs.existsSync(rawSnippetPath)) {
        try {
          fs.unlinkSync(rawSnippetPath);
        } catch {
          // ignore cleanup error
        }
      }
    }

    const afterMetrics = await AudioAnalysisService.analyzeAudio(outputPath);

    return {
      preview_audio_path: outputPath,
      before_metrics: beforeMetrics,
      after_metrics: afterMetrics,
      before: beforeMetrics,
      after: afterMetrics,
    };
  }
}
