import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseSubtitleOcrTsv, type SubtitleOcrFrame } from '../shared/subtitleOcrEvidence.js';
const execFileAsync = promisify(execFile);

export interface BurnedSubtitleAnalysisResult {
  /** Suspected lower-band source text, not semantic subtitle verification. Never auto-remove captions. */
  hasBurnedSubtitles: boolean;
  status: 'suspected-source-text' | 'not-observed' | 'unavailable';
  sampledFrames: number;
  analyzedFrames: number;
  bandHeightRatio: number; // e.g., 0.12 (12% of frame height)
  confidence: number;      // 0.0 to 1.0
  recommendedCropFilter?: string; // e.g. "crop=iw:ih*(1-0.12):0:0"
  reason: string;
}

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SafeZoneProfile {
  topInsetPercent: number;    // default 12%
  bottomInsetPercent: number; // default 20%
  rightInsetPercent: number;  // default 15%
  leftInsetPercent: number;   // default 4%
}

export const DEFAULT_MOBILE_SAFE_ZONE: SafeZoneProfile = {
  topInsetPercent: 0.12,
  bottomInsetPercent: 0.20,
  rightInsetPercent: 0.15,
  leftInsetPercent: 0.04,
};

/**
 * Phase 3: Burned-in Subtitle & Safe Placement Service
 * Inspired by OpenShorts (MIT License):
 * Detects hardcoded source subtitles in the bottom band to avoid double-text collisions,
 * positions captions along the seam in split layouts, and dynamically places hook text
 * where it obscures the least face area.
 */
export class BurnedSubtitleService {
  /** Bounded local OCR, with explicit unknown when unavailable. Geometry only:
   * logos and lower thirds may resemble subtitles. No destructive crop advice.
   * Does not alter caption settings or introduce a provider call. */
  public static async detectBurnedSubtitles(
    framePaths: string[],
    probe: (path: string) => Promise<SubtitleOcrFrame | null> = async (path) => {
      const { stdout } = await execFileAsync('tesseract', [path, 'stdout', '--psm', '11', 'tsv'], {
        timeout: 2500, maxBuffer: 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: '1' },
      });
      return parseSubtitleOcrTsv(stdout);
    },
  ): Promise<BurnedSubtitleAnalysisResult> {
    // Evenly bound caller input; never launch concurrent OCR jobs.
    const paths = Array.isArray(framePaths) ? [...new Set(framePaths.filter(p => typeof p === 'string' && p))].slice(0, 5) : [];
    let analyzedFrames = 0, candidateFrames = 0, minTop = 1;
    for (const path of paths) {
      try {
        const stat = await fs.stat(path);
        if (!stat.isFile() || stat.size < 24 || stat.size > 12 * 1024 * 1024) continue;
        const frame = await probe(path);
        if (!frame) continue;
        analyzedFrames++;
        if (frame.candidateTop !== null) { candidateFrames++; minTop = Math.min(minTop, frame.candidateTop); }
      } catch { /* Missing OCR binary, timeout and unreadable input remain unknown. */ }
    }
    const supported = analyzedFrames >= 2;
    const hasBurned = supported && candidateFrames >= Math.max(2, Math.ceil(analyzedFrames * 0.4));
    return {
      hasBurnedSubtitles: hasBurned,
      status: !supported ? 'unavailable' : hasBurned ? 'suspected-source-text' : 'not-observed',
      sampledFrames: paths.length, analyzedFrames,
      bandHeightRatio: hasBurned ? Number((1 - minTop).toFixed(4)) : 0,
      // This is sample support, not probability that the text is a subtitle.
      confidence: supported ? candidateFrames / analyzedFrames : 0,
      reason: !supported ? 'Insufficient local OCR evidence; source subtitle presence is unknown.'
        : hasBurned ? 'Repeated lower-band source text observed. Review duplicate captions; text may be a logo or lower third. No automatic crop or caption removal.'
        : 'No repeated lower-band source text observed in these samples. This does not establish that subtitles are absent.',
    };
  }

  /**
   * Computes the vertical hook text coordinate (as a fraction of canvas height 0.0–1.0)
   * that covers the minimum face area while respecting platform safe zones.
   */
  public static computeFaceAwareHookPosition(
    faceBoxes: FaceBoundingBox[],
    candidateYPositions = [0.18, 0.25, 0.50, 0.72],
    safeZone: SafeZoneProfile = DEFAULT_MOBILE_SAFE_ZONE
  ): { yPercent: number; reason: string } {
    const minY = safeZone.topInsetPercent;
    const maxY = 1.0 - safeZone.bottomInsetPercent;

    // Filter candidate positions strictly within mobile safe zones
    const validCandidates = candidateYPositions.filter((y) => y >= minY && y <= maxY);
    if (validCandidates.length === 0) {
      return { yPercent: 0.2, reason: 'Default safe position (no candidates inside safe zone).' };
    }

    if (!Array.isArray(faceBoxes) || faceBoxes.length === 0) {
      // Default to upper third when no face is present
      return { yPercent: validCandidates[0], reason: 'No faces detected; positioned in upper safe third.' };
    }

    // Evaluate collision penalty for each candidate position
    // Hook text occupies roughly 8% of canvas height centered at candidate Y
    const hookHeight = 0.08;

    let bestY = validCandidates[0];
    let minCollisionScore = Infinity;

    for (const candidateY of validCandidates) {
      const hookTop = candidateY - hookHeight / 2;
      const hookBottom = candidateY + hookHeight / 2;

      let collisionScore = 0;

      for (const face of faceBoxes) {
        const faceTop = face.y;
        const faceBottom = face.y + face.height;

        // Calculate vertical overlap between hook text and face
        const overlapTop = Math.max(hookTop, faceTop);
        const overlapBottom = Math.min(hookBottom, faceBottom);
        const overlap = Math.max(0, overlapBottom - overlapTop);

        if (overlap > 0) {
          // Weight collision by face area
          collisionScore += overlap * face.width;
        }
      }

      if (collisionScore < minCollisionScore) {
        minCollisionScore = collisionScore;
        bestY = candidateY;
      }
    }

    const reason = minCollisionScore === 0
      ? `Positioned at ${Math.round(bestY * 100)}% height with zero face obstruction.`
      : `Positioned at ${Math.round(bestY * 100)}% height minimizing face collision (score: ${minCollisionScore.toFixed(3)}).`;

    return { yPercent: Number(bestY.toFixed(3)), reason };
  }

  /**
   * Computes the caption position for stacked two-speaker layouts (SPLIT).
   * Places subtitles directly on the horizontal dividing seam using ASS {\an5} middle alignment.
   */
  public static computeSplitSeamCaptionPosition(
    canvasWidth = 1080,
    canvasHeight = 1920,
    seamRatio = 0.5
  ): { posX: number; posY: number; assAlignmentTag: string } {
    const posX = Math.round(canvasWidth / 2);
    const posY = Math.round(canvasHeight * seamRatio);

    return {
      posX,
      posY,
      assAlignmentTag: `{\\an5\\pos(${posX},${posY})}`,
    };
  }
}
