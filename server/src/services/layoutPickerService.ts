import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';
import { VideoSceneService } from './multimodal/videoSceneService.js';
import { SmartReframeService } from './smartReframeService.js';
import { config } from '../config/index.js';

const execFileAsync = promisify(execFile);

export type VideoLayoutCategory = 'track' | 'split' | 'screencast' | 'inset' | 'general' | 'unknown';

export interface LayoutClassificationResult {
  layout: VideoLayoutCategory;
  confidence: number;
  reason: string;
  frameCountAnalyzed: number;
  method: 'vision_llm' | 'opencv_heuristics' | 'fallback';
}

export interface SampledFramesResult {
  framePaths: string[];
  timestamps: number[];
  cleanup: () => Promise<void>;
}

/**
 * Phase 2: Multimodal Layout Picker Service
 * Inspired by OpenShorts (MIT License):
 * Samples 12 frames at 1024px width across the source duration (~3k tokens),
 * avoiding expensive full-video uploads, and asks for a closed-choice decision:
 * 'track' (single speaker), 'split' (2-person conversation), 'screencast' (software demo/slides),
 * or 'inset' (screen with corner webcam).
 */
export class LayoutPickerService {
  /**
   * Extracts N representative frames evenly spaced across the video duration at 1024px width.
   */
  public static async sampleRepresentativeFrames(
    videoPath: string,
    durationSec: number,
    frameCount = 12,
    targetWidth = 1024,
    tempDir?: string
  ): Promise<SampledFramesResult> {
    const ffmpegBin = VideoSceneService.getFfmpegPath();
    const targetDir = tempDir || os.tmpdir();
    const uniqueBatchId = crypto.randomBytes(6).toString('hex');

    const dur = Math.max(1.0, Number(durationSec) || 1.0);
    const count = Math.max(3, Math.min(24, frameCount));

    // Calculate timestamps avoiding black frames at very start/end (5% to 95% of duration)
    const startOffset = dur * 0.05;
    const endOffset = dur * 0.95;
    const interval = count > 1 ? (endOffset - startOffset) / (count - 1) : 0;

    const timestamps: number[] = [];
    for (let i = 0; i < count; i++) {
      timestamps.push(Number((startOffset + i * interval).toFixed(3)));
    }

    const framePaths: string[] = [];

    // Extract each frame using FFmpeg fast seek (-ss before -i) and scale
    for (let idx = 0; idx < timestamps.length; idx++) {
      const ts = timestamps[idx];
      const framePath = path.join(targetDir, `vireo_frame_${uniqueBatchId}_${idx}.jpg`);

      try {
        const args = [
          '-y',
          '-nostdin',
          '-ss', ts.toFixed(3),
          '-i', videoPath,
          '-vf', `scale=${targetWidth}:-1`,
          '-vframes', '1',
          '-q:v', '3',
          framePath,
        ];

        await execFileAsync(ffmpegBin, args, { timeout: 15000 });
        framePaths.push(framePath);
      } catch (err: any) {
        logger.warn(`[LayoutPicker] Failed to sample frame at ${ts}s: ${err?.message}`);
      }
    }

    const cleanup = async () => {
      for (const p of framePaths) {
        try {
          await fs.unlink(p);
        } catch {}
      }
    };

    return {
      framePaths,
      timestamps,
      cleanup,
    };
  }

  /**
   * Classifies video layout using local OpenCV face & frame heuristics.
   * Zero external API cost, instant execution.
   */
  public static async classifyWithOpenCvHeuristics(
    videoPath: string,
    durationSec: number,
    sampledTimestamps: number[]
  ): Promise<LayoutClassificationResult> {
    try {
      const cvResult = await SmartReframeService.runCvAnalyzer(
        videoPath,
        1.0,
        0,
        Math.min(60, durationSec),
        30000
      );

      const samples = cvResult.samples || [];
      if (samples.length === 0) {
        return {
          layout: 'track',
          confidence: 0.6,
          reason: 'No samples gathered from OpenCV analyzer; defaulting to single-subject tracking.',
          frameCountAnalyzed: 0,
          method: 'opencv_heuristics',
        };
      }

      let multiFaceCount = 0;
      let singleFaceCount = 0;
      let zeroFaceCount = 0;

      for (const s of samples) {
        const count = Array.isArray(s.faces) ? s.faces.length : 0;
        if (count >= 2) {
          multiFaceCount++;
        } else if (count === 1) {
          singleFaceCount++;
        } else {
          zeroFaceCount++;
        }
      }

      const total = samples.length;
      const multiFaceRatio = multiFaceCount / total;
      const zeroFaceRatio = zeroFaceCount / total;

      // Two-shot conversation (split layout) detection:
      // If 2+ faces are detected simultaneously in >= 35% of frames
      if (multiFaceRatio >= 0.35) {
        return {
          layout: 'split',
          confidence: Number(Math.min(0.95, 0.6 + multiFaceRatio).toFixed(2)),
          reason: `Detected multiple concurrent speakers in ${Math.round(multiFaceRatio * 100)}% of analyzed frames.`,
          frameCountAnalyzed: total,
          method: 'opencv_heuristics',
        };
      }

      // Screencast / slide detection:
      // If zero faces detected in >= 70% of frames (slides, screen recording, or software demo)
      if (zeroFaceRatio >= 0.7) {
        return {
          layout: 'screencast',
          confidence: Number(Math.min(0.9, 0.5 + zeroFaceRatio * 0.4).toFixed(2)),
          reason: `High fraction (${Math.round(zeroFaceRatio * 100)}%) of frames without faces; likely screen recording or presentation.`,
          frameCountAnalyzed: total,
          method: 'opencv_heuristics',
        };
      }

      // Default single-subject talking head
      return {
        layout: 'track',
        confidence: 0.85,
        reason: `Consistent single speaker detected across ${Math.round((singleFaceCount / total) * 100)}% of frames.`,
        frameCountAnalyzed: total,
        method: 'opencv_heuristics',
      };
    } catch (err: any) {
      logger.warn(`[LayoutPicker] OpenCV heuristic classification failed: ${err?.message}`);
      return {
        layout: 'track',
        confidence: 0.5,
        reason: 'OpenCV analysis unavailable; safe fallback to tracking.',
        frameCountAnalyzed: 0,
        method: 'fallback',
      };
    }
  }

  /**
   * Main entry point: samples frames and determines the optimal vertical layout.
   */
  public static async determineLayout(
    videoPath: string,
    durationSec: number,
    userOverride?: VideoLayoutCategory
  ): Promise<LayoutClassificationResult> {
    // If user provided an explicit override, always respect it
    if (userOverride && userOverride !== 'unknown') {
      return {
        layout: userOverride,
        confidence: 1.0,
        reason: `User explicitly selected "${userOverride}" layout.`,
        frameCountAnalyzed: 0,
        method: 'fallback',
      };
    }

    const { framePaths, timestamps, cleanup } = await this.sampleRepresentativeFrames(
      videoPath,
      durationSec,
      12,
      1024
    );

    try {
      // Analyze with OpenCV heuristics (robust, fast, 100% offline)
      const result = await this.classifyWithOpenCvHeuristics(videoPath, durationSec, timestamps);
      return result;
    } finally {
      await cleanup();
    }
  }
}
