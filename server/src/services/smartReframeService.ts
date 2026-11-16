import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
/**
 * Phase 13: Smart Auto-Reframe + Face Tracking Service
 * Detects faces, tracks dominant subject over time, smoothes camera movement,
 * and generates dynamic crop filters for FFmpeg 9:16 rendering.
 *
 * All computer vision is 100% local (OpenCV).
 * Zero external/paid AI calls. No biometric identity or cross-project profile storage.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { downloadObjectToFile } from './objectStorageService.js';
import { logger } from '../utils/logger.js';
import { applyWordEnergyFusion } from '../utils/wordEnergyFusion.js';
import { GenreIntelligenceService } from './genreIntelligenceService.js';

const execFileAsync = promisify(execFile);
import type {
  ClipAspectRatio,
  NormalizedFaceDetection,
  ReframeKeyframe,
  ReframeSample,
  ReframeTrackRecord,
  ReframeLayoutMode,
} from '../types/index.js';

export type {
  ClipAspectRatio,
  NormalizedFaceDetection,
  ReframeKeyframe,
  ReframeSample,
  ReframeTrackRecord,
  ReframeLayoutMode,
};

// In-memory set to prevent concurrent smart reframe analyses for the same clip
export const activeReframeAnalysisSet = new Set<string>();

export interface SmartReframeOptions {
  sampleFps?: number;
  deadZone?: number;
  maxVelocity?: number;
  smoothingAlpha?: number;
  timeoutMs?: number;
  sceneCuts?: number[];
  speechIntervals?: Array<{ start: number; end: number }>;
}

/**
 * Phase 3b: merge explicit reframe options with the project's genre profile.
 * Explicit per-call options always win; the genre profile's reframeConfig fills
 * the rest; the internal defaults inside smoothAndGenerateKeyframes apply last.
 * The genre's recommendedLayoutMode is returned as a layout preference that the
 * caller applies only when the user has not chosen a layout themselves.
 */
export function resolveGenreReframeOptions(
  options: SmartReframeOptions,
  genre?: string | null
): {
  deadZone?: number;
  maxVelocity?: number;
  smoothingAlpha?: number;
  preferredLayoutMode?: ReframeLayoutMode;
} {
  const profile = genre ? GenreIntelligenceService.getGenreProfile(genre) : null;
  const rc = profile?.reframeConfig;
  return {
    deadZone: options.deadZone ?? rc?.deadZone,
    maxVelocity: options.maxVelocity ?? rc?.maxVelocity,
    smoothingAlpha: options.smoothingAlpha ?? rc?.smoothingAlpha,
    preferredLayoutMode: profile?.recommendedLayoutMode as ReframeLayoutMode | undefined,
  };
}

export class SmartReframeService {
  /**
   * Validates a single face detection record from CV output.
   * Rejects NaN, Infinity, negative dimensions, or coordinates outside legal normalized bounds.
   * Preserves optional mouth_score (0.0 to 1.0).
   */
  public static validateDetection(raw: any): NormalizedFaceDetection | null {
    if (!raw || typeof raw !== 'object') return null;

    const x = Number(raw.x);
    const y = Number(raw.y);
    const width = Number(raw.width);
    const height = Number(raw.height);
    const centerX = Number(raw.center_x ?? raw.centerX ?? (x + width / 2));
    const centerY = Number(raw.center_y ?? raw.centerY ?? (y + height / 2));
    const confidence = Number(raw.confidence ?? 0.85);
    const mouthScore = raw.mouth_score !== undefined && raw.mouth_score !== null ? Number(raw.mouth_score) : undefined;

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(centerX) ||
      !Number.isFinite(centerY) ||
      !Number.isFinite(confidence)
    ) {
      return null;
    }

    if (width <= 0 || height <= 0 || width > 1.0 || height > 1.0) {
      return null;
    }

    if (x < 0 || x > 1.0 || y < 0 || y > 1.0) {
      return null;
    }

    const clampedCenterX = Math.min(1.0, Math.max(0.0, centerX));
    const clampedCenterY = Math.min(1.0, Math.max(0.0, centerY));

    return {
      x: Math.round(x * 10000) / 10000,
      y: Math.round(y * 10000) / 10000,
      width: Math.round(width * 10000) / 10000,
      height: Math.round(height * 10000) / 10000,
      center_x: Math.round(clampedCenterX * 10000) / 10000,
      center_y: Math.round(clampedCenterY * 10000) / 10000,
      confidence: Math.round(Math.min(1.0, Math.max(0.0, confidence)) * 100) / 100,
      track_id: raw.track_id ? String(raw.track_id) : undefined,
      area: Math.round(width * height * 10000) / 10000,
      mouth_score: mouthScore !== undefined && Number.isFinite(mouthScore) ? Math.min(1.0, Math.max(0.0, Math.round(mouthScore * 1000) / 1000)) : undefined,
    };
  }

  /**
   * Associates detections across frames into continuous face tracks deterministically.
   * Fixes track fragmentation via linear velocity prediction, greedy cost-matrix assignment,
   * 2.2s dropout survival, and transient noise track filtering.
   */
  public static associateTracks(
    samples: ReframeSample[],
    maxDistanceThreshold = 0.35
  ): { tracks: Map<string, NormalizedFaceDetection[]>; faceCount: number } {
    const tracks = new Map<string, NormalizedFaceDetection[]>();
    let nextTrackId = 1;

    // Map of trackId -> { lastDetection, lastTime, vx, vy }
    const activeTracks = new Map<string, {
      lastDetection: NormalizedFaceDetection;
      lastTime: number;
      vx: number;
      vy: number;
    }>();

    for (const sample of samples) {
      const { time, faces } = sample;
      const validFaces: NormalizedFaceDetection[] = [];

      for (const raw of faces) {
        const validated = this.validateDetection(raw);
        if (validated) validFaces.push(validated);
      }

      // Collect all candidate (trackId, faceIdx) match pairs
      interface MatchCandidate {
        trackId: string;
        faceIdx: number;
        cost: number;
      }
      const candidates: MatchCandidate[] = [];

      for (const [trackId, info] of activeTracks.entries()) {
        const dt = time - info.lastTime;
        // Increased short-dropout survival from 1.5s to 2.2s
        if (dt > 2.2) continue;

        const safeDt = Math.max(0.01, dt);
        // Position prediction based on linear velocity
        const predX = Math.min(1.0, Math.max(0.0, info.lastDetection.center_x + (info.vx || 0) * safeDt));
        const predY = Math.min(1.0, Math.max(0.0, info.lastDetection.center_y + (info.vy || 0) * safeDt));

        for (let i = 0; i < validFaces.length; i++) {
          const face = validFaces[i];
          const dx = face.center_x - predX;
          const dy = face.center_y - predY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          const currentArea = face.width * face.height;
          const lastArea = info.lastDetection.width * info.lastDetection.height;
          const areaRatio = currentArea > 0 && lastArea > 0 ? Math.max(currentArea / lastArea, lastArea / currentArea) : 1;

          // Area guard: reject matches whose size jump implies a different
          // person. Limit raised 2.5 -> 4.0: a subject walking TOWARD the
          // camera grows fast (observed 3.3x in 0.75s on pacing footage) and
          // was being fragmented into a new track, which then lost dominance
          // and let the camera drift while the person kept being detected.
          if (dist < maxDistanceThreshold && areaRatio < 4.0) {
            // Combined cost: distance from velocity-predicted position + area ratio penalty
            const cost = dist + 0.1 * (areaRatio - 1.0);
            candidates.push({ trackId, faceIdx: i, cost });
          }
        }
      }

      // Sort candidate pairs greedily from best match to worst match
      candidates.sort((a, b) => a.cost - b.cost);

      const assignedFaces = new Set<number>();
      const assignedTracks = new Set<string>();

      for (const cand of candidates) {
        if (assignedTracks.has(cand.trackId) || assignedFaces.has(cand.faceIdx)) {
          continue;
        }

        const matchedFace = validFaces[cand.faceIdx];
        matchedFace.track_id = cand.trackId;
        assignedFaces.add(cand.faceIdx);
        assignedTracks.add(cand.trackId);

        const info = activeTracks.get(cand.trackId)!;
        const dt = Math.max(0.01, time - info.lastTime);
        const vx = (matchedFace.center_x - info.lastDetection.center_x) / dt;
        const vy = (matchedFace.center_y - info.lastDetection.center_y) / dt;

        activeTracks.set(cand.trackId, {
          lastDetection: matchedFace,
          lastTime: time,
          vx: Math.max(-1.5, Math.min(1.5, vx)),
          vy: Math.max(-1.5, Math.min(1.5, vy)),
        });

        const trackList = tracks.get(cand.trackId) || [];
        trackList.push(matchedFace);
        tracks.set(cand.trackId, trackList);
      }

      // New faces not matched get new track IDs
      for (let i = 0; i < validFaces.length; i++) {
        if (!assignedFaces.has(i)) {
          const newTrackId = `subject_${nextTrackId++}`;
          const face = validFaces[i];
          face.track_id = newTrackId;
          activeTracks.set(newTrackId, {
            lastDetection: face,
            lastTime: time,
            vx: 0,
            vy: 0,
          });
          tracks.set(newTrackId, [face]);
        }
      }

      sample.faces = validFaces;
    }

    // Filter out transient noise tracks (appearing in < max(2, totalSamples * 0.04))
    const minSamples = samples.length <= 3 ? 1 : Math.max(2, Math.floor(samples.length * 0.04));
    let stableCount = 0;
    for (const [, dets] of tracks.entries()) {
      if (dets.length >= minSamples) stableCount++;
    }
    const faceCount = stableCount > 0 ? stableCount : tracks.size;

    return { tracks, faceCount };
  }

  /**
   * Deterministically selects the dominant subject track based on:
   * When mouth_score is present: Presence (30%), Active Speaker Score (35%), Face Area (20%), Confidence & Centrality (15%).
   * Legacy fallback: Presence (40%), Face Area (30%), Confidence (20%), Centrality (10%).
   */
  public static selectDominantTrack(
    tracks: Map<string, NormalizedFaceDetection[]>,
    totalSampleCount: number,
    options?: { speechIntervals?: Array<{ start: number; end: number }> }
  ): {
    dominantTrackId: string | null;
    score: number;
  } {
    if (tracks.size === 0 || totalSampleCount <= 0) {
      return { dominantTrackId: null, score: 0 };
    }

    // Filter out transient false-positive noise tracks
    const minSamples = totalSampleCount <= 3 ? 1 : Math.max(2, Math.floor(totalSampleCount * 0.04));
    // A face filling >=10% of the frame is a high-precision detection: false
    // positives at that scale are rare, so even a single sighting makes the
    // track dominance-eligible. This keeps a large real subject that the
    // detector catches only briefly (profile turns, occlusions, jump cuts)
    // from losing to a small but stable background face.
    const LARGE_FACE_MIN_AREA = 0.10;
    const eligibleTracks = new Map<string, NormalizedFaceDetection[]>();
    for (const [id, dets] of tracks.entries()) {
      if (dets.length >= minSamples) {
        eligibleTracks.set(id, dets);
        continue;
      }
      if (dets.length > 0) {
        const avgArea = dets.reduce((sum, d) => sum + d.width * d.height, 0) / dets.length;
        if (avgArea >= LARGE_FACE_MIN_AREA) {
          eligibleTracks.set(id, dets);
        }
      }
    }
    const candidateTracks = eligibleTracks.size > 0 ? eligibleTracks : tracks;

    // Check if any candidate has mouth_score
    let hasMouthScores = false;
    for (const [, dets] of candidateTracks.entries()) {
      if (dets.some((d) => d.mouth_score !== undefined && d.mouth_score > 0)) {
        hasMouthScores = true;
        break;
      }
    }

    let bestTrackId: string | null = null;
    let bestScore = -1;

    for (const [trackId, detections] of candidateTracks.entries()) {
      if (detections.length === 0) continue;

      // A track whose average face fills >=10% of the frame is a high-precision
      // sighting (same principle as LARGE_FACE_MIN_AREA eligibility above). When
      // the detector catches such a subject only briefly - a close-up lost to a
      // head turn right after a cut - raw presence understates it, and a small
      // stable background fragment can edge it out on the 30% presence term by a
      // fraction of a point. Floor presence at 0.5 for large-face tracks so the
      // area term can actually decide, while small glimpses stay un-floored.
      const quickAvgArea = detections.reduce((sum, d) => sum + d.width * d.height, 0) / detections.length;
      let presenceRatio = Math.min(1.0, detections.length / totalSampleCount);
      if (quickAvgArea >= LARGE_FACE_MIN_AREA) {
        presenceRatio = Math.max(presenceRatio, 0.5);
      }

      let totalArea = 0;
      let totalConfidence = 0;
      let totalCentrality = 0;
      let activeSpeakerScoreSum = 0;
      let activeSpeakerWeightSum = 0;

      for (const d of detections) {
        totalArea += (d.width * d.height);
        totalConfidence += d.confidence;
        const distFromCenter = Math.abs(d.center_x - 0.5);
        totalCentrality += Math.max(0, 1 - distFromCenter * 2);

        if (hasMouthScores) {
          const rawMouth = d.mouth_score ?? 0;
          let weight = 1.0;
          if (options?.speechIntervals && options.speechIntervals.length > 0) {
            // Check if detection falls within any speech interval
            // Detections don't carry sample time directly, but if speech intervals exist, give weight
            weight = 1.2;
          }
          activeSpeakerScoreSum += rawMouth * weight;
          activeSpeakerWeightSum += weight;
        }
      }

      const avgArea = totalArea / detections.length;
      const areaScore = Math.min(1.0, avgArea / 0.15);
      const avgConfidence = totalConfidence / detections.length;
      const avgCentrality = totalCentrality / detections.length;
      const avgActiveSpeaker = activeSpeakerWeightSum > 0 ? Math.min(1.0, activeSpeakerScoreSum / activeSpeakerWeightSum) : 0;

      let score: number;
      if (hasMouthScores) {
        // Presence (30%), ActiveSpeakerScore (35%), Area (20%), Confidence & Centrality (15%)
        const confCentrality = 0.5 * avgConfidence + 0.5 * avgCentrality;
        score =
          0.30 * presenceRatio +
          0.35 * avgActiveSpeaker +
          0.20 * areaScore +
          0.15 * confCentrality;
      } else {
        // Legacy formula: 40% presence, 30% area, 20% confidence, 10% centrality
        score =
          0.4 * presenceRatio +
          0.3 * areaScore +
          0.2 * avgConfidence +
          0.1 * avgCentrality;
      }

      if (score > bestScore) {
        bestScore = score;
        bestTrackId = trackId;
      }
    }

    // Glimpse-vs-established margin: a track seen in under ~10% of samples (a
    // one-glimpse fragment) may anchor the crop only when it is CLEARLY better
    // than every established track - a large real face the detector catches
    // once (the d271a47 case) wins on quality, but a phantom fragment that
    // merely edges out a good persistent track must not, or the whole crop
    // anchors to one sighting and stops following anyone.
    if (bestTrackId !== null) {
      let bestPresentScore = -1;
      let bestPresentTrackId: string | null = null;
      for (const [trackId, detections] of candidateTracks.entries()) {
        if (detections.length === 0) continue;
        const quickAvgArea = detections.reduce((sum, d) => sum + d.width * d.height, 0) / detections.length;
        let presenceRatio = Math.min(1.0, detections.length / totalSampleCount);
        if (quickAvgArea >= LARGE_FACE_MIN_AREA) {
          presenceRatio = Math.max(presenceRatio, 0.5);
        }
        if (presenceRatio < 0.10) continue;
        let totalArea = 0;
        let totalConfidence = 0;
        let totalCentrality = 0;
        let activeSpeakerScoreSum = 0;
        let activeSpeakerWeightSum = 0;
        for (const d of detections) {
          totalArea += d.width * d.height;
          totalConfidence += d.confidence;
          totalCentrality += Math.max(0, 1 - Math.abs(d.center_x - 0.5) * 2);
          if (hasMouthScores) {
            activeSpeakerScoreSum += d.mouth_score ?? 0;
            activeSpeakerWeightSum += 1;
          }
        }
        const avgArea = totalArea / detections.length;
        const areaScore = Math.min(1.0, avgArea / 0.15);
        const avgConfidence = totalConfidence / detections.length;
        const avgCentrality = totalCentrality / detections.length;
        const avgActiveSpeaker = activeSpeakerWeightSum > 0 ? Math.min(1.0, activeSpeakerScoreSum / activeSpeakerWeightSum) : 0;
        const s = hasMouthScores
          ? 0.30 * presenceRatio + 0.35 * avgActiveSpeaker + 0.20 * areaScore + 0.15 * (0.5 * avgConfidence + 0.5 * avgCentrality)
          : 0.4 * presenceRatio + 0.3 * areaScore + 0.2 * avgConfidence + 0.1 * avgCentrality;
        if (s > bestPresentScore) {
          bestPresentScore = s;
          bestPresentTrackId = trackId;
        }
      }
      if (bestPresentTrackId !== null && bestPresentTrackId !== bestTrackId) {
        const winnerPresence = Math.min(1.0, (candidateTracks.get(bestTrackId)?.length ?? 0) / totalSampleCount);
        if (winnerPresence < 0.10 && bestScore < bestPresentScore * 1.25) {
          bestTrackId = bestPresentTrackId;
          bestScore = bestPresentScore;
        }
      }
    }

    return {
      dominantTrackId: bestTrackId,
      score: Math.round(bestScore * 1000) / 1000,
    };
  }

  /**
   * Temporal smoothing, dead-zone application, maximum velocity clamping,
   * shot-aware partitioning, audio-visual active speaker selection,
   * and true instantaneous hard cuts across scene boundaries.
   */
  public static smoothAndGenerateKeyframes(params: {
    samples: ReframeSample[];
    dominantTrackId: string | null;
    duration: number;
    deadZone?: number;
    maxVelocity?: number;
    smoothingAlpha?: number;
    aspectRatio?: ClipAspectRatio;
    sourceWidth?: number;
    sourceHeight?: number;
    sceneCuts?: number[];
    speechIntervals?: Array<{ start: number; end: number }>;
  }): ReframeKeyframe[] {
    const {
      samples,
      dominantTrackId,
      duration,
      deadZone = 0.035, // Ignore movements smaller than 3.5%
      maxVelocity = 0.45, // Max horizontal movement per second (normalized 0-1)
      smoothingAlpha = 0.25, // Exponential moving average weight
      sceneCuts = [],
      speechIntervals = [],
      aspectRatio = '9:16',
      sourceWidth = 1920,
      sourceHeight = 1080,
    } = params;

    // Subject-retention window: half-size of the crop window in normalized
    // source coordinates. Smoothing may never leave a known subject's
    // bounding box outside this window; retention overrides steadiness.
    const parseAspect = (ar: string): number => {
      const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ar);
      if (!m) return 9 / 16;
      const w = Number(m[1]);
      const h = Number(m[2]);
      return w > 0 && h > 0 ? w / h : 9 / 16;
    };
    const cropAspect = parseAspect(aspectRatio);
    const cropWinHalfW = Math.min(1, (sourceHeight * cropAspect) / Math.max(1, sourceWidth)) / 2;
    const cropWinHalfH = Math.min(1, sourceWidth / cropAspect / Math.max(1, sourceHeight)) / 2;
    const clampCenterForRetention = (c: number, boxStart: number, boxSize: number, half: number): number => {
      if (2 * half >= 1) return c; // window covers the whole axis: every box is trivially inside
      if (boxSize >= 2 * half) return boxStart + boxSize / 2; // subject larger than window: center on it
      const lo = boxStart + boxSize - half; // min center keeping the box's far edge inside
      const hi = boxStart + half; // max center keeping the box's near edge inside
      return Math.min(hi, Math.max(lo, c));
    };

    const safeDuration = Math.max(0.1, duration);

    // Fallback: If no samples, return center crop keyframe
    if (samples.length === 0) {
      return [{ time: 0, centerX: 0.5, centerY: 0.5 }];
    }

    // 1. Sanitize and sort scene cut boundaries within (0.25s, duration - 0.25s)
    const validCuts: number[] = [];
    if (Array.isArray(sceneCuts)) {
      for (const c of sceneCuts) {
        const cutTime = Number(c);
        if (Number.isFinite(cutTime) && cutTime > 0.25 && cutTime < safeDuration - 0.25) {
          if (!validCuts.some((existing) => Math.abs(existing - cutTime) < 0.4)) {
            validCuts.push(Math.round(cutTime * 1000) / 1000);
          }
        }
      }
      validCuts.sort((a, b) => a - b);
    }

    // 2. Partition clip timeline into discrete shots
    interface ShotWindow {
      start: number;
      end: number;
    }
    const shots: ShotWindow[] = [];
    let curStart = 0;
    for (const cut of validCuts) {
      shots.push({ start: curStart, end: cut });
      curStart = cut;
    }
    shots.push({ start: curStart, end: safeDuration });

    // 3. Process each shot independently (zero cross-cut smoothing carryover)
    interface ShotTrajectoryPoint {
      time: number;
      x: number;
      y: number;
      box?: { x: number; y: number; w: number; h: number };
    }
    const shotTrajectories: ShotTrajectoryPoint[][] = [];

    for (let sIdx = 0; sIdx < shots.length; sIdx++) {
      const shot = shots[sIdx];
      const isLastShot = sIdx === shots.length - 1;
      const shotSamples = samples.filter((s) => s.time >= shot.start && (isLastShot ? s.time <= shot.end : s.time < shot.end));

      if (shotSamples.length === 0) {
        shotTrajectories.push([{ time: shot.start, x: 0.5, y: 0.5 }]);
        continue;
      }

      // Collect all candidate tracks in this shot
      const shotTracks = new Map<string, NormalizedFaceDetection[]>();
      for (const s of shotSamples) {
        for (const f of s.faces) {
          if (f.track_id) {
            const list = shotTracks.get(f.track_id) || [];
            list.push(f);
            shotTracks.set(f.track_id, list);
          }
        }
      }

      // Audio-Visual Active Speaker Selection for this shot
      let shotDominantTrackId = dominantTrackId;
      let midpointPair: [string, string] | null = null;

      if (shotTracks.size > 1) {
        // Filter speech intervals intersecting this shot
        const shotSpeech = speechIntervals.filter((sp) => sp.end >= shot.start && sp.start <= shot.end);
        const { dominantTrackId: shotBestId, score: shotBestScore } = this.selectDominantTrack(
          shotTracks,
          shotSamples.length,
          { speechIntervals: shotSpeech }
        );

        if (shotBestId && shotBestId !== dominantTrackId) {
          // Hysteresis: require >= 18% score advantage to switch away from global dominant
          let currentDominantScore = 0;
          if (dominantTrackId && shotTracks.has(dominantTrackId)) {
            const singleMap = new Map([[dominantTrackId, shotTracks.get(dominantTrackId)!]]);
            currentDominantScore = this.selectDominantTrack(singleMap, shotSamples.length, { speechIntervals: shotSpeech }).score;
          }
          if (shotBestScore >= currentDominantScore * 1.18) {
            shotDominantTrackId = shotBestId;
          }
        }

        // Two-shot tight framing check: if two prominent speakers are close (|x1 - x2| <= 0.32), frame midpoint.
        // Both tracks must be sustained through the shot: a walking single person leaves
        // sparse track fragments that otherwise impersonate a second seated speaker, and
        // the midpoint + union-box then frames a false pair, cutting the real subject.
        // A large close-up face (>=10% of frame) outranks pair framing: when one
        // exists in the shot, two small sustained tracks are typically stable
        // background false positives (a lamp ghost and a shelf object in the ToS
        // scene-3 case, both 100%-present), and their midpoint frames empty set
        // dressing while the real subject sits outside the crop. Without a large
        // face, the pair is usually the actual content (podcast two-shot), so the
        // midpoint check runs as before.
        const PAIR_LARGE_FACE_MIN_AREA = 0.10;
        const shotHasLargeFace = Array.from(shotTracks.values()).some(
          (dets) => dets.reduce((sum, d) => sum + d.width * d.height, 0) / dets.length >= PAIR_LARGE_FACE_MIN_AREA
        );
        const sortedTracks = Array.from(shotTracks.entries()).sort((a, b) => b[1].length - a[1].length);
        const minPairPresence = Math.max(3, Math.ceil(shotSamples.length * 0.35));
        if (!shotHasLargeFace && sortedTracks.length >= 2 && sortedTracks[0][1].length >= minPairPresence && sortedTracks[1][1].length >= minPairPresence) {
          const avgX1 = sortedTracks[0][1].reduce((sum, d) => sum + d.center_x, 0) / sortedTracks[0][1].length;
          const avgX2 = sortedTracks[1][1].reduce((sum, d) => sum + d.center_x, 0) / sortedTracks[1][1].length;
          if (Math.abs(avgX1 - avgX2) <= 0.32) {
            // Midpoint framing to avoid whip-panning between tight two-shot conversationalists
            shotDominantTrackId = '__midpoint__';
            midpointPair = [sortedTracks[0][0], sortedTracks[1][0]];
          }
        }
      } else if (shotTracks.size === 1) {
        const onlyTrackId = Array.from(shotTracks.keys())[0];
        // EXPERIMENTAL (SMART_REFRAME_SHOT_TRACK_GATE=1): a single-track shot
        // adopts that track only if it clears the same minimum-presence bar
        // selectDominantTrack applies to multi-track shots. A lone one-frame
        // detection (e.g. a small low-confidence edge false positive) no
        // longer anchors the whole shot far off-center; the shot eases toward
        // center instead. Default (flag unset): pre-gate behavior unchanged.
        if (process.env.SMART_REFRAME_SHOT_TRACK_GATE === '1') {
          // Presence bar: at least 2 detections AND >= 25% of the shot's
          // samples. A lone first-frame detection (small, low-confidence edge
          // false positive in the Sintel case) cannot anchor the whole shot.
          const minDets = Math.max(2, Math.ceil(shotSamples.length * 0.25));
          const dets = shotTracks.get(onlyTrackId)!;
          shotDominantTrackId = dets.length >= minDets ? onlyTrackId : dominantTrackId;
        } else {
          shotDominantTrackId = onlyTrackId;
        }
      }

      if (process.env.SMART_REFRAME_DEBUG_SHOTS === '1') {
        const dbg = Array.from(shotTracks.entries()).map(([id, dets]) => `${id}:n=${dets.length},cx=${(dets.reduce((s, d) => s + d.center_x, 0) / dets.length).toFixed(3)},area=${(dets.reduce((s, d) => s + d.width * d.height, 0) / dets.length).toFixed(4)}`);
        console.log(`[DBGSHOT] shot ${shot.start}-${shot.end} samples=${shotSamples.length} dominant=${shotDominantTrackId} global=${dominantTrackId} tracks: ${dbg.join(' | ')}`);
      }

      if (process.env.SMART_REFRAME_DEBUG_SHOTS === '1') {
        const dbg = Array.from(shotTracks.entries()).map(([id, dets]) => `${id}:n=${dets.length},cx=${(dets.reduce((s, d) => s + d.center_x, 0) / dets.length).toFixed(3)},area=${(dets.reduce((s, d) => s + d.width * d.height, 0) / dets.length).toFixed(4)}`);
        console.log(`[DBGSHOT] shot ${shot.start}-${shot.end} samples=${shotSamples.length} dominant=${shotDominantTrackId} global=${dominantTrackId} tracks: ${dbg.join(' | ')}`);
      }

      // Build raw trajectory for this shot
      const rawShotTraj: ShotTrajectoryPoint[] = [];
      let lastSeenFace: NormalizedFaceDetection | null = null;
      let lastSeenTime = -1;
      let lastDominantSeenTime = -1;

      // Re-acquisition: a confident face that is not a known other person - its
      // track never shared a sample with the track we are currently following
      // (a seated second person co-occurs with the tracked speaker; the same
      // mover re-detected under a new id after fast motion does not). Used when
      // the near guard has no candidate and during the short-occlusion hold, so
      // a fast-relocating subject (ToS t=4.25-5.0: conf 0.78-0.83 faces at cx
      // 0.64-0.84, areas 0.006-0.008) is picked up instead of the crop drifting
      // on the stale position. Small areas are allowed here because confidence,
      // not size, separates a real distant face from a speck; the near branch
      // keeps the stricter area bar.
      const REACQUIRE_MIN_CONF = 0.75;
      const REACQUIRE_MIN_AREA = 0.005;
      const findReacquisition = (sample: ReframeSample, time: number): NormalizedFaceDetection | null => {
        const cooccurring = new Set<string>();
        if (lastSeenFace?.track_id) {
          const followedId = lastSeenFace.track_id;
          for (const s of shotSamples) {
            if (s.time >= time) break;
            if (s.faces.some((f) => f.track_id === followedId)) {
              for (const f of s.faces) {
                if (f.track_id && f.track_id !== followedId) cooccurring.add(f.track_id);
              }
            }
          }
        }
        // Lookahead confirmation: a real mover persists in position; a one-frame
        // false positive (the ToS t=8.75 ghost lamp, conf 0.80) does not. Require
        // a face near the candidate in the NEXT sample of this shot. At the
        // shot's final sample there is no lookahead, so no re-acquisition - the
        // hold/center-ease stands, which also keeps a cut-boundary sample from
        // anchoring on a pre-cut glimpse of the next scene.
        const nextIdx = shotSamples.findIndex((s) => s.time > time);
        const nextSample = nextIdx >= 0 ? shotSamples[nextIdx] : null;
        if (!nextSample) return null;
        let farAlt: NormalizedFaceDetection | null = null;
        for (const f of sample.faces) {
          if (f.track_id === shotDominantTrackId) continue;
          const conf = Number(f.confidence ?? 0);
          const area = f.width * f.height;
          if (
            conf >= REACQUIRE_MIN_CONF &&
            area >= REACQUIRE_MIN_AREA &&
            f.track_id &&
            !cooccurring.has(f.track_id) &&
            nextSample.faces.some(
              (g) => Math.abs(g.center_x - f.center_x) <= 0.25 && Number(g.confidence ?? 0) >= 0.7
            )
          ) {
            if (!farAlt || conf > Number(farAlt.confidence ?? 0)) farAlt = f;
          }
        }
        return farAlt;
      };

      const weightedCentering = process.env.SMART_REFRAME_WEIGHTED_CENTERING === '1';
      for (const sample of shotSamples) {
        const { time } = sample;
        let targetX: number | null = null;
        let targetY: number | null = null;

        let subjectBox: { x: number; y: number; w: number; h: number } | null = null;

        if (shotDominantTrackId === '__midpoint__') {
          // Only the sustained pair steers the midpoint and its retention box:
          // a stray third detection (false positive or passerby) must not widen
          // the union box and push the real speakers toward the frame edge.
          const pairFaces = midpointPair
            ? sample.faces.filter((f) => f.track_id === midpointPair![0] || f.track_id === midpointPair![1])
            : sample.faces;
          // EXPERIMENTAL (SMART_REFRAME_WEIGHTED_CENTERING=1): weak detections
          // pull the midpoint only weakly away from center. Default: unweighted.
          const weighted = pairFaces.map((f) => {
            const conf = Number(f.confidence ?? 0.5);
            const w = weightedCentering ? Math.min(1, Math.max(0, (conf - 0.68) / 0.2)) : 1;
            return { x: 0.5 + (f.center_x - 0.5) * w, y: 0.38 + (f.center_y - 0.38) * w };
          });
          const validFaceXs = weighted.map((f) => f.x);
          const validFaceYs = weighted.map((f) => f.y);
          if (validFaceXs.length >= 2) {
            targetX = (validFaceXs[0] + validFaceXs[1]) / 2.0;
            targetY = (validFaceYs[0] + validFaceYs[1]) / 2.0;
          } else if (validFaceXs.length === 1) {
            targetX = validFaceXs[0];
            targetY = validFaceYs[0];
          }
          if (pairFaces.length > 0) {
            const minX = Math.min(...pairFaces.map((f) => f.x));
            const minY = Math.min(...pairFaces.map((f) => f.y));
            const maxX = Math.max(...pairFaces.map((f) => f.x + f.width));
            const maxY = Math.max(...pairFaces.map((f) => f.y + f.height));
            subjectBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
          }
        } else if (shotDominantTrackId) {
          const match = sample.faces.find((f) => f.track_id === shotDominantTrackId);
          if (match) {
            // EXPERIMENTAL (SMART_REFRAME_WEIGHTED_CENTERING=1): confidence-weighted
            // centering - low-confidence detections (Haar false positives on
            // non-face content cluster at ~0.65-0.80) pull the crop only weakly
            // away from frame center; confident detections (~0.88+) steer fully.
            // Weight 0 at 0.68, 1 at 0.88. Default (flag unset): pre-experiment
            // behavior, the detection steers fully and always pins retention.
            const conf = Number(match.confidence ?? 0.5);
            const confWeight = weightedCentering ? Math.min(1, Math.max(0, (conf - 0.68) / 0.2)) : 1;
            targetX = 0.5 + (match.center_x - 0.5) * confWeight;
            targetY = 0.38 + (match.center_y - 0.38) * confWeight;
            lastSeenFace = match;
            lastSeenTime = time;
            lastDominantSeenTime = time;
            subjectBox = confWeight >= 0.5 ? { x: match.x, y: match.y, w: match.width, h: match.height } : null;
          } else if (lastDominantSeenTime === -1 || time - lastDominantSeenTime > 1.0) {
            // Dominant dark > 1s after being seen - OR never seen yet in this
            // shot: follow the strongest other visible face. The never-seen
            // case is a glimpse-dominant (a strong 1-detection fragment late
            // in the shot wins dominance); without this, the crop center-holds
            // while a plainly visible speaker moves (ToS talking-head scene 1).
            // Original rule: follow the strongest other
            // visible face instead of easing to center. Face detectors fragment
            // one person into several track ids when appearance changes fast
            // (walking toward camera, profile turns); the shot-level hysteresis
            // then stays locked on the stale id while the person is plainly
            // visible under another id, and the retention clamp never sees the
            // box. A dark-for-1s dominant yields to a large confident face.
            // Identity guard: the stand-in must be spatially continuous with
            // the last tracked position (same mover re-detected under a new
            // id). A different seated person sits at their own x and must NOT
            // steal the camera when the tracked speaker is briefly occluded.
            const FALLBACK_MAX_JUMP = 0.25;
            let alt: NormalizedFaceDetection | null = null;
            for (const f of sample.faces) {
              if (f.track_id === shotDominantTrackId) continue;
              if (Number(f.confidence ?? 0) < 0.7) continue;
              if (f.width * f.height < 0.02) continue;
              if (lastSeenFace && Math.abs(f.center_x - lastSeenFace.center_x) > FALLBACK_MAX_JUMP) continue;
              if (!alt || f.width * f.height > alt.width * alt.height) alt = f;
            }
            if (!alt) alt = findReacquisition(sample, time);
            if (alt) {
              targetX = alt.center_x;
              targetY = alt.center_y;
              lastSeenFace = alt;
              lastSeenTime = time;
              subjectBox = { x: alt.x, y: alt.y, w: alt.width, h: alt.height };
            }
          }
        }

        const fallbackY = lastSeenFace ? lastSeenFace.center_y : 0.38;

        if (targetX !== null) {
          rawShotTraj.push({ time, x: targetX, y: targetY ?? fallbackY, box: subjectBox ?? undefined });
        } else if (lastSeenFace !== null && (time - lastSeenTime) <= 1.0) {
          // Short occlusion (<= 1.0s) within this shot: hold last known position
          // unless a confident non-co-occurring face says the subject relocated
          // (fast stand/move) rather than being occluded.
          const reacq = findReacquisition(sample, time);
          if (reacq) {
            rawShotTraj.push({
              time,
              x: reacq.center_x,
              y: reacq.center_y,
              box: { x: reacq.x, y: reacq.y, w: reacq.width, h: reacq.height },
            });
            lastSeenFace = reacq;
            lastSeenTime = time;
          } else {
            rawShotTraj.push({
              time,
              x: lastSeenFace.center_x,
              y: lastSeenFace.center_y,
              box: { x: lastSeenFace.x, y: lastSeenFace.y, w: lastSeenFace.width, h: lastSeenFace.height },
            });
          }
        } else {
          // Longer occlusion or no face: ease toward center (0.5 for X, 0.38 for eye-level headroom Y)
          const prevX = lastSeenFace ? lastSeenFace.center_x : 0.5;
          const easeFactor = lastSeenTime >= 0 ? Math.min(1.0, (time - lastSeenTime - 1.0) / 1.5) : 1.0;
          const interpolatedX = prevX + (0.5 - prevX) * easeFactor;
          const interpolatedY = fallbackY + (0.38 - fallbackY) * easeFactor;
          rawShotTraj.push({ time, x: interpolatedX, y: interpolatedY });
        }
      }

      if (rawShotTraj.length === 0) {
        shotTrajectories.push([{ time: shot.start, x: 0.5, y: 0.38 }]);
        continue;
      }

      // Smooth trajectory within this shot: Reset EMA state and velocity clamping at cut!
      const smoothedShotTraj: ShotTrajectoryPoint[] = [];
      let currentX = rawShotTraj[0].x;
      let currentY = rawShotTraj[0].y;

      for (let i = 0; i < rawShotTraj.length; i++) {
        const pt = rawShotTraj[i];
        const prevTime = i > 0 ? rawShotTraj[i - 1].time : pt.time;
        const dt = Math.max(0.01, pt.time - prevTime);

        const targetX = pt.x;
        const deltaX = targetX - currentX;

        if (Math.abs(deltaX) > deadZone) {
          const candidateX = currentX + smoothingAlpha * deltaX;
          const maxStep = maxVelocity * dt;
          const clampedDelta = Math.max(-maxStep, Math.min(maxStep, candidateX - currentX));
          currentX = currentX + clampedDelta;
        }

        const targetY = pt.y;
        const deltaY = targetY - currentY;
        if (Math.abs(deltaY) > deadZone) {
          const candidateY = currentY + smoothingAlpha * deltaY;
          const maxStepY = maxVelocity * dt;
          const clampedDeltaY = Math.max(-maxStepY, Math.min(maxStepY, candidateY - currentY));
          currentY = currentY + clampedDeltaY;
        }

        currentX = Math.min(1.0, Math.max(0.0, currentX));
        currentY = Math.min(1.0, Math.max(0.0, currentY));

        // Subject retention: a known subject's bounding box must stay inside
        // the crop window even when genre tuning prefers a steadier camera.
        if (pt.box) {
          currentX = clampCenterForRetention(currentX, pt.box.x, pt.box.w, cropWinHalfW);
          currentY = clampCenterForRetention(currentY, pt.box.y, pt.box.h, cropWinHalfH);
        }

        smoothedShotTraj.push({
          time: pt.time,
          x: Math.round(currentX * 10000) / 10000,
          y: Math.round(currentY * 10000) / 10000,
        });
      }

      shotTrajectories.push(smoothedShotTraj);
    }

    // 4. Assemble keyframes across shots with true instantaneous hard cuts
    const keyframes: ReframeKeyframe[] = [];
    let prevShotLastX: number | null = null;
    let prevShotLastY: number | null = null;

    for (let sIdx = 0; sIdx < shotTrajectories.length; sIdx++) {
      const shotTraj = shotTrajectories[sIdx];
      const shot = shots[sIdx];
      if (shotTraj.length === 0) continue;

      const firstShotX = shotTraj[0].x;
      const firstShotY = shotTraj[0].y;

      if (prevShotLastX !== null && sIdx > 0) {
        const cutTime = shot.start;
        const jumpDelta = Math.abs(firstShotX - prevShotLastX);

        if (jumpDelta > 0.04) {
          // Emit hard-cut keyframe pair to switch camera position instantaneously on cut
          keyframes.push({
            time: Number(Math.max(0, cutTime - 0.001).toFixed(3)),
            centerX: prevShotLastX,
            centerY: prevShotLastY ?? 0.38,
          });
          keyframes.push({
            time: Number(cutTime.toFixed(3)),
            centerX: firstShotX,
            centerY: firstShotY,
          });
        } else {
          keyframes.push({
            time: Number(cutTime.toFixed(3)),
            centerX: firstShotX,
            centerY: firstShotY,
          });
        }
      } else if (keyframes.length === 0) {
        keyframes.push({
          time: 0,
          centerX: firstShotX,
          centerY: firstShotY,
        });
      }

      let lastKept = keyframes[keyframes.length - 1];

      for (let i = 1; i < shotTraj.length; i++) {
        const pt = shotTraj[i];
        const deltaX = Math.abs(pt.x - lastKept.centerX);
        const deltaY = Math.abs(pt.y - (lastKept.centerY ?? 0.38));
        const dt = pt.time - lastKept.time;

        if (deltaX >= 0.02 || deltaY >= 0.03 || dt >= 1.0) {
          const kf: ReframeKeyframe = {
            time: pt.time,
            centerX: pt.x,
            centerY: pt.y,
          };
          keyframes.push(kf);
          lastKept = kf;
        }
      }

      prevShotLastX = shotTraj[shotTraj.length - 1].x;
      prevShotLastY = shotTraj[shotTraj.length - 1].y;
    }

    // Ensure last keyframe reaches duration
    if (keyframes.length === 0) {
      keyframes.push({ time: 0, centerX: 0.5, centerY: 0.38 });
    }
    if (keyframes[keyframes.length - 1].time < safeDuration) {
      const finalX = prevShotLastX ?? keyframes[keyframes.length - 1].centerX;
      const finalY = prevShotLastY ?? keyframes[keyframes.length - 1].centerY ?? 0.38;
      keyframes.push({
        time: Math.round(safeDuration * 1000) / 1000,
        centerX: finalX,
        centerY: finalY,
      });
    }

    return keyframes;
  }

  /**
   * Generates a safe server-controlled FFmpeg dynamic crop filter expression.
   * Features:
   * 1. Collinear keyframe pruning (|x - interpolatedX| < 0.005) while strictly preserving hard cuts.
   * 2. Keyframe count capping (<= 45) to prevent FFmpeg libavutil expression stack overflow.
   * 3. Piecewise linear interpolation between keyframes without shell injection risk.
   */
  public static buildSmartCropFilter(
    keyframes: ReframeKeyframe[],
    aspectRatio: ClipAspectRatio = '9:16',
    sourceWidth = 1920,
    sourceHeight = 1080,
    duration = 30.0
  ): string {
    if (!keyframes || keyframes.length === 0) {
      return this.buildStaticScaleCrop(aspectRatio, 0.5, 0.5);
    }

    // Filter and sanitize numeric keyframes
    const validKfs = keyframes
      .filter((k) => Number.isFinite(k.time) && Number.isFinite(k.centerX))
      .map((k) => ({
        time: Math.max(0, Number(k.time.toFixed(3))),
        centerX: Math.min(1.0, Math.max(0.0, Number(k.centerX.toFixed(4)))),
        centerY: Math.min(1.0, Math.max(0.0, Number((k.centerY ?? 0.38).toFixed(4)))),
      }))
      .sort((a, b) => a.time - b.time);

    if (validKfs.length === 0) {
      return this.buildStaticScaleCrop(aspectRatio, 0.5, 0.38);
    }

    // If all keyframes are virtually identical (< 0.015), use static crop
    const firstX = validKfs[0].centerX;
    const firstY = validKfs[0].centerY;
    const isStatic = validKfs.every((k) => Math.abs(k.centerX - firstX) < 0.015 && Math.abs(k.centerY - firstY) < 0.02);
    if (isStatic || validKfs.length === 1) {
      return this.buildStaticScaleCrop(aspectRatio, firstX, firstY);
    }

    // 1. Collinear keyframe pruning: remove redundant points on flat/linear segments
    const pruned: Array<{ time: number; centerX: number; centerY: number }> = [];
    for (let i = 0; i < validKfs.length; i++) {
      if (i === 0 || i === validKfs.length - 1) {
        pruned.push(validKfs[i]);
        continue;
      }
      const prev = pruned[pruned.length - 1];
      const curr = validKfs[i];
      const next = validKfs[i + 1];
      const dtPrev = curr.time - prev.time;
      const dtNext = next.time - curr.time;

      // Strictly preserve hard cuts (dt <= 0.02)
      if (dtPrev <= 0.02 || dtNext <= 0.02) {
        pruned.push(curr);
        continue;
      }

      // Check collinearity
      const totalDt = next.time - prev.time;
      if (totalDt > 0.001) {
        const expectedX = prev.centerX + (next.centerX - prev.centerX) * ((curr.time - prev.time) / totalDt);
        const expectedY = prev.centerY + (next.centerY - prev.centerY) * ((curr.time - prev.time) / totalDt);
        if (Math.abs(curr.centerX - expectedX) < 0.005 && Math.abs(curr.centerY - expectedY) < 0.008) {
          // Collinear point, prune
          continue;
        }
      }
      pruned.push(curr);
    }

    // 2. Safe FFmpeg Expression Cap: limit to <= 45 keyframes to avoid expression stack limits
    let finalKfs = pruned;
    if (finalKfs.length > 45) {
      const capped: Array<{ time: number; centerX: number; centerY: number }> = [];
      const step = Math.ceil(finalKfs.length / 40);
      for (let i = 0; i < finalKfs.length; i++) {
        const isCut = (i > 0 && Math.abs(finalKfs[i].time - finalKfs[i - 1].time) <= 0.02) ||
                      (i < finalKfs.length - 1 && Math.abs(finalKfs[i + 1].time - finalKfs[i].time) <= 0.02);
        if (i === 0 || i === finalKfs.length - 1 || isCut || i % step === 0) {
          capped.push(finalKfs[i]);
        }
      }
      finalKfs = capped;
    }

    // Build piecewise linear interpolation expression for X:
    // if(lte(t, t1), x0 + (x1-x0)*(t-t0)/(t1-t0), if(lte(t, t2), ... , x_last))
    let expr = finalKfs[finalKfs.length - 1].centerX.toFixed(4);

    for (let i = finalKfs.length - 2; i >= 0; i--) {
      const k0 = finalKfs[i];
      const k1 = finalKfs[i + 1];
      const dt = Math.max(0.001, k1.time - k0.time);
      const dx = k1.centerX - k0.centerX;
      const t0 = k0.time.toFixed(3);
      const t1 = k1.time.toFixed(3);
      const segment = `${k0.centerX.toFixed(4)}+(${dx.toFixed(4)})*(t-${t0})/${dt.toFixed(3)}`;
      expr = `if(lte(t\\,${t1})\\,${segment}\\,${expr})`;
    }

    // Build vertical expression for Y (targeting ~0.38 eye headroom)
    let yExpr = finalKfs[finalKfs.length - 1].centerY.toFixed(4);
    const isYStatic = finalKfs.every((k) => Math.abs(k.centerY - firstY) < 0.02);
    if (!isYStatic) {
      for (let i = finalKfs.length - 2; i >= 0; i--) {
        const k0 = finalKfs[i];
        const k1 = finalKfs[i + 1];
        const dt = Math.max(0.001, k1.time - k0.time);
        const dy = k1.centerY - k0.centerY;
        const t0 = k0.time.toFixed(3);
        const t1 = k1.time.toFixed(3);
        const segment = `${k0.centerY.toFixed(4)}+(${dy.toFixed(4)})*(t-${t0})/${dt.toFixed(3)}`;
        yExpr = `if(lte(t\\,${t1})\\,${segment}\\,${yExpr})`;
      }
    }

    const clampedExpr = `min(max(${expr}\\,0)\\,1)`;
    const centeredCropExpr = `min(max(in_w*${clampedExpr}-out_w/2\\,0)\\,in_w-out_w)`;
    const clampedYExpr = `min(max(${yExpr}\\,0)\\,1)`;
    const verticalCropExpr = `(in_h-out_h)*${clampedYExpr}`;

    switch (aspectRatio) {
      case '9:16':
        return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:'${centeredCropExpr}':${verticalCropExpr}`;
      case '1:1':
        return `scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080:'${centeredCropExpr}':${verticalCropExpr}`;
      case '16:9':
        return `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:'${centeredCropExpr}':${verticalCropExpr}`;
      default:
        return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:'${centeredCropExpr}':${verticalCropExpr}`;
    }
  }

  private static buildStaticScaleCrop(aspectRatio: ClipAspectRatio, fx: number, fy: number): string {
    const clampedFx = Math.min(1.0, Math.max(0.0, fx));
    const clampedFy = Math.min(1.0, Math.max(0.0, fy));

    if (clampedFx === 0.5 && clampedFy === 0.5) {
      switch (aspectRatio) {
        case '9:16':
          return 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';
        case '1:1':
          return 'scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080';
        case '16:9':
          return 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080';
        default:
          return 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';
      }
    }

    switch (aspectRatio) {
      case '9:16':
        return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*${clampedFx}:(in_h-out_h)*${clampedFy}`;
      case '1:1':
        return `scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080:(in_w-out_w)*${clampedFx}:(in_h-out_h)*${clampedFy}`;
      case '16:9':
        return `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:(in_w-out_w)*${clampedFx}:(in_h-out_h)*${clampedFy}`;
      default:
        return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*${clampedFx}:(in_h-out_h)*${clampedFy}`;
    }
  }

  /**
   * Finds a persistent, spatially static face track - the geometric signature of a
   * burned-in facecam - and returns its median box in normalized coords, or null.
   * Geometry only: callers decide layout; this never implies content intent.
   */
  public static findStaticFacecamBox(
    samples: ReframeSample[],
    minPresence = 0.25,
    maxStddev = 0.03,
  ): { x: number; y: number; w: number; h: number } | null {
    return this.findStaticFacecamTrack(samples, minPresence, maxStddev)?.box ?? null;
  }

  /**
   * Resolves the effective facecam box for a screencast render. The user's
   * explicit choice always wins over the analysis-time static-geometry
   * suggestion: a present box is used as-is; an explicit null is an opt-out
   * (no fallback, legacy center-crop inset); only an absent key falls back
   * to the suggestion. Undefined suggestion = no box.
   */
  public static resolveFacecamBox(
    screencastConfig: { facecamBox?: { x: number; y: number; w: number; h: number } | null } | undefined | null,
    trackMetadata: Record<string, any> | undefined | null,
  ): { x: number; y: number; w: number; h: number } | undefined {
    if (screencastConfig && Object.prototype.hasOwnProperty.call(screencastConfig, 'facecamBox')) {
      return screencastConfig.facecamBox ?? undefined; // object -> use; null -> explicit opt-out
    }
    const suggestion = trackMetadata?.facecam_box;
    if (
      suggestion &&
      typeof suggestion.x === 'number' && typeof suggestion.y === 'number' &&
      typeof suggestion.w === 'number' && typeof suggestion.h === 'number'
    ) {
      return suggestion;
    }
    return undefined;
  }

  /**
   * Same static-geometry scan, but also returns the matching track_id so the
   * analysis path can exclude that track from dominant-subject selection and
   * persist the box as a user-correctable suggestion. The box is a geometric
   * suggestion only - persistence and stillness do not prove facecam intent.
   */
  public static findStaticFacecamTrack(
    samples: ReframeSample[],
    minPresence = 0.25,
    maxStddev = 0.03,
  ): { trackId: string; box: { x: number; y: number; w: number; h: number } } | null {
    const byTrack = new Map<string, Array<{ x: number; y: number; w: number; h: number }>>();
    for (const s of samples) {
      for (const f of s.faces || []) {
        if (!f.track_id) continue;
        const arr = byTrack.get(f.track_id) || [];
        arr.push({ x: Number(f.x), y: Number(f.y), w: Number(f.width), h: Number(f.height) });
        byTrack.set(f.track_id, arr);
      }
    }
    let bestTrackId: string | null = null;
    let best: { x: number; y: number; w: number; h: number } | null = null;
    let bestStd = Infinity;
    for (const [trackId, boxes] of byTrack.entries()) {
      if (boxes.length < Math.max(3, samples.length * minPresence)) continue;
      const cx = boxes.map((b) => b.x + b.w / 2);
      const cy = boxes.map((b) => b.y + b.h / 2);
      const mean = (a: number[]) => a.reduce((p, c) => p + c, 0) / a.length;
      const std = (a: number[]) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
      const s = Math.max(std(cx), std(cy));
      if (s < maxStddev && s < bestStd) {
        const sorted = (a: number[]) => [...a].sort((p, c) => p - c)[Math.floor(a.length / 2)];
        bestStd = s;
        bestTrackId = trackId;
        best = { x: sorted(boxes.map((b) => b.x)), y: sorted(boxes.map((b) => b.y)), w: sorted(boxes.map((b) => b.w)), h: sorted(boxes.map((b) => b.h)) };
      }
    }
    return bestTrackId && best ? { trackId: bestTrackId, box: best } : null;
  }

  /**
   * Generates FFmpeg filter complex expressions for Screencast & Camera Inset layouts:
   * 1. 'split_stacked': Screen on top (e.g. 60%), speaker camera on bottom (40%)
   * 2. 'circular_inset': Full screen with circular speaker bubble in a safe corner
   * 3. 'rounded_card_inset': Full screen with camera in a rounded rectangle card
   */
  public static buildScreencastFilter(options: {
    mode: 'split_stacked' | 'circular_inset' | 'rounded_card_inset';
    insetPosition?: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';
    insetDiameter?: number;
    borderWidth?: number;
    borderColor?: string;
    screenRatio?: number;
    canvasWidth?: number;
    canvasHeight?: number;
    /**
     * Main-content background: 'black' keeps the legacy letterbox pad;
     * 'blur' fills the canvas with a blurred cover of the source and fits the
     * source over it, removing empty black regions on landscape content.
     * Omit = 'black' (legacy, byte-identical output).
     */
    background?: 'black' | 'blur';
    /**
     * Optional facecam region in normalized source coords (0-1). For single-input
     * recordings with the camera BURNED INTO the frame (typical gameplay captures),
     * the inset/card branch crops this region instead of center-cropping the full
     * frame. Geometry only - the layout choice itself stays user-correctable via
     * CropConfig; omitting it preserves the legacy full-frame inset behavior.
     */
    facecamBox?: { x: number; y: number; w: number; h: number };
    /** Chain-safe embedding: see buildSplitPodcastFilter. */
    tag?: string;
  }): string {
    const {
      mode,
      insetPosition = 'bottom_right',
      insetDiameter = 360,
      screenRatio = 0.60,
      canvasWidth = 1080,
      canvasHeight = 1920,
      background = 'black',
      facecamBox,
      tag,
    } = options;
    // Chain-safe mode: no [0:v] prefix, no [out] suffix, tag-unique labels.
    const L = (l: string): string => (tag ? `${tag}${l}` : l);
    const inPad = tag ? '' : '[0:v]';
    const outPad = (l: string): string => (tag ? '' : `[${l}]`);

    // Main-content stage: legacy letterbox (black pad) or blurred cover fill.
    const mainStage = (mainLabel: string, outLabel: string): string => {
      if (background === 'blur') {
        return `[${L(mainLabel)}]split=2[${L('bgs')}][${L('fgs')}];` +
          `[${L('bgs')}]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight},gblur=sigma=40[${L('bgb')}];` +
          `[${L('fgs')}]scale=${canvasWidth}:-2:force_original_aspect_ratio=decrease[${L('fgf')}];` +
          `[${L('bgb')}][${L('fgf')}]overlay=(W-w)/2:(H-h)/2[${L(outLabel)}]`;
      }
      return `[${L(mainLabel)}]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=decrease,pad=${canvasWidth}:${canvasHeight}:(ow-iw)/2:(oh-ih)/2:color=black[${L(outLabel)}]`;
    };

    // Inset source branch: crop the burned-in facecam region when provided,
    // else keep the legacy center-crop of the whole frame.
    const camSrc = (targetW: number, targetH: number): string => {
      if (facecamBox) {
        const fx = Math.min(0.98, Math.max(0, facecamBox.x));
        const fy = Math.min(0.98, Math.max(0, facecamBox.y));
        const fw = Math.min(1 - fx, Math.max(0.01, facecamBox.w));
        const fh = Math.min(1 - fy, Math.max(0.01, facecamBox.h));
        // Asymmetric headroom around the detected face box: more above the
        // forehead, less at the sides/chin, so the inset stays tight on the
        // face instead of filling with gameplay/background edges.
        const padX = 0.12;
        const padTop = 0.16;
        const padBottom = 0.12;
        const left = Math.max(0, fx - fw * padX);
        const right = Math.min(1, fx + fw * (1 + padX));
        const top = Math.max(0, fy - fh * padTop);
        const bottom = Math.min(1, fy + fh * (1 + padBottom));
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        let pw = right - left;
        let ph = bottom - top;
        const targetAspect = targetW / targetH;
        if (pw / ph > targetAspect) { ph = pw / targetAspect; } else { pw = ph * targetAspect; }
        pw = Math.min(1, pw); ph = Math.min(1, ph);
        const px = Math.min(1 - pw, Math.max(0, cx - pw / 2));
        const py = Math.min(1 - ph, Math.max(0, cy - ph / 2));
        return `crop=w='in_w*${pw.toFixed(4)}':h='in_h*${ph.toFixed(4)}':x='in_w*${px.toFixed(4)}':y='in_h*${py.toFixed(4)}',scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`;
      }
      return `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`;
    };

    if (mode === 'split_stacked') {
      const topHeight = Math.round(canvasHeight * Math.max(0.3, Math.min(0.8, screenRatio)));
      const bottomHeight = canvasHeight - topHeight;
      return `${inPad}split=2[${L('scr')}][${L('spk')}];[${L('scr')}]scale=${canvasWidth}:${topHeight}:force_original_aspect_ratio=decrease,pad=${canvasWidth}:${topHeight}:(ow-iw)/2:(oh-ih)/2:color=black[${L('v_top')}];[${L('spk')}]scale=${canvasWidth}:${bottomHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${bottomHeight}[${L('v_bot')}];[${L('v_top')}][${L('v_bot')}]vstack${outPad('out')}`;
    }

    // Circular or card inset position calculations
    const marginX = 40;
    const marginY = 180; // Safe zone above TikTok/Reels bottom action buttons
    let posX = canvasWidth - insetDiameter - marginX;
    let posY = canvasHeight - insetDiameter - marginY;

    if (insetPosition === 'bottom_left') {
      posX = marginX;
      posY = canvasHeight - insetDiameter - marginY;
    } else if (insetPosition === 'top_right') {
      posX = canvasWidth - insetDiameter - marginX;
      posY = marginY;
    } else if (insetPosition === 'top_left') {
      posX = marginX;
      posY = marginY;
    }

    if (mode === 'circular_inset') {
      const radius = Math.round(insetDiameter / 2);
      return `${inPad}split=2[${L('main')}][${L('cam')}];${mainStage('main', 'bg')};[${L('cam')}]${camSrc(insetDiameter, insetDiameter)},format=yuva420p,geq=lum='p(X,Y)':a='if(lte((X-${radius})*(X-${radius})+(Y-${radius})*(Y-${radius}),${radius}*${radius}),255,0)'[${L('cam_circle')}];[${L('bg')}][${L('cam_circle')}]overlay=x=${posX}:y=${posY}${outPad('out')}`;
    }

    // rounded_card_inset
    const cardWidth = Math.round(insetDiameter * 1.15);
    const cardHeight = Math.round(insetDiameter * 0.85);
    return `${inPad}split=2[${L('main')}][${L('cam')}];${mainStage('main', 'bg')};[${L('cam')}]${camSrc(cardWidth, cardHeight)}[${L('card')}];[${L('bg')}][${L('card')}]overlay=x=${posX}:y=${posY}${outPad('out')}`;
  }

  /**
   * Per-speaker framing geometry for the dual-speaker split layout, derived
   * from the reframe track's raw per-face samples. Returns null when fewer
   * than two usable subjects exist - callers then use the legacy anchor-only
   * split behavior unchanged.
   *
   * Rule (qualified visually against manual filter renders, Nov 2026): each
   * panel crops a window as wide as the distance between the two subject
   * centers (clamped to 20%-50% of source width), centered on the speaker's
   * measured face position. The legacy rule kept the full source height in
   * every panel, leaving both speakers visible in each half.
   */
  public static computeSplitSpeakerGeometry(options: {
    rawSamples?: Array<{ faces?: Array<{ center_x?: number; center_y?: number; track_id?: string }> }> | null;
    sourceWidth: number;
    sourceHeight: number;
    speaker1X?: number;
    speaker2X?: number;
  }): {
    speaker1: { x: number; y: number; windowW: number };
    speaker2: { x: number; y: number; windowW: number };
  } | null {
    const { rawSamples, sourceWidth, sourceHeight, speaker1X, speaker2X } = options;
    if (!Array.isArray(rawSamples) || rawSamples.length === 0) return null;
    if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 || !Number.isFinite(sourceHeight) || sourceHeight <= 0) return null;

    const byTrack = new Map<string, { sx: number; sy: number; n: number }>();
    for (const sample of rawSamples) {
      for (const face of sample?.faces || []) {
        const tid = face?.track_id;
        if (!tid || !Number.isFinite(face?.center_x) || !Number.isFinite(face?.center_y)) continue;
        const acc = byTrack.get(tid) || { sx: 0, sy: 0, n: 0 };
        acc.sx += Number(face.center_x);
        acc.sy += Number(face.center_y);
        acc.n += 1;
        byTrack.set(tid, acc);
      }
    }
    // A subject needs enough detections to trust its mean position.
    const subjects = [...byTrack.values()]
      .filter((a) => a.n >= 3)
      .sort((a, b) => b.n - a.n)
      .slice(0, 2)
      .map((a) => ({ cx: a.sx / a.n, cy: a.sy / a.n }));
    if (subjects.length < 2) return null;

    const clamp01 = (v: number) => Math.min(0.9, Math.max(0.1, v));
    const anchor1 = Number.isFinite(speaker1X) ? clamp01(Number(speaker1X)) : 0.25;
    const first =
      Math.abs(subjects[0].cx - anchor1) <= Math.abs(subjects[1].cx - anchor1) ? subjects[0] : subjects[1];
    const second = first === subjects[0] ? subjects[1] : subjects[0];

    // Window ~1.7x the subject separation: wide enough that each speaker sits
    // in frame with visible breathing room (user feedback: separation-width
    // windows looked over-zoomed), still narrow enough that the other
    // speaker's face stays out of the crop. Clamped so near-overlapping faces
    // do not over-zoom and distant faces still get a tighter frame than the
    // legacy full-height window.
    const minDistPx = Math.abs(first.cx - second.cx) * sourceWidth;
    const windowW = Math.min(0.62, Math.max(0.28, (minDistPx / sourceWidth) * 1.7));

    const userX = (v: number | undefined, measured: number) =>
      Number.isFinite(v) ? clamp01(Number(v)) : clamp01(measured);
    return {
      speaker1: { x: userX(speaker1X, first.cx), y: clamp01(first.cy), windowW },
      speaker2: { x: userX(speaker2X, second.cx), y: clamp01(second.cy), windowW },
    };
  }

  /**
   * Group framing for single-view: when a clip has several people on screen
   * together, tight single-subject tracking cuts people at the edges (user
   * feedback). This derives ONE window that covers the whole group: per
   * sample, the midpoint and span of every detected face; the window width
   * covers the widest arrangement with margin, while the center keyframes
   * follow the group midpoint over time. Returns null without usable faces
   * so callers keep the existing tight-track behavior.
   */
  /** Tight-track confidence floor: below this dominant-track score a tight
   * track is confidently wrong more often than right; both render paths and
   * the preview degrade to the blurred layout instead. Conservative, based on
   * observed clips (bad: 0.241; good: 0.452, 0.582). */
  public static readonly TRACK_CONFIDENCE_FLOOR = 0.3;

  public static isLowConfidenceTrack(track: { metadata?: any } | null | undefined): boolean {
    const score = Number(track?.metadata?.dominant_score);
    return Number.isFinite(score) && score < SmartReframeService.TRACK_CONFIDENCE_FLOOR;
  }

  public static computeGroupFrameGeometry(options: {
    rawSamples?: Array<{ time?: number; faces?: Array<{ center_x?: number; center_y?: number; width?: number; height?: number }> }> | null;
    sourceWidth: number;
    sourceHeight: number;
  }): {
    keyframes: Array<{ time: number; centerX: number; centerY: number }>;
    windowW: number;
    /** Fraction of source height; present only when face size data exists. */
    windowH?: number;
  } | null {
    const { rawSamples, sourceWidth, sourceHeight } = options;
    if (!Array.isArray(rawSamples) || rawSamples.length === 0) return null;
    if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 || !Number.isFinite(sourceHeight) || sourceHeight <= 0) return null;

    const clamp01 = (v: number) => Math.min(0.95, Math.max(0.05, v));
    const groups: Array<{ time: number; cx: number; cy: number; span: number; spanY: number; top: number; bottom: number; faceW: number; faceH: number }> = [];
    rawSamples.forEach((sample, idx) => {
      const allFaces = (sample?.faces || []).filter(
        (f) => Number.isFinite(f?.center_x) && Number.isFinite(f?.center_y)
      );
      if (allFaces.length === 0) return;
      // Person-scale faces only: small stable false positives (lamps, hands,
      // decor) must not turn a single-speaker shot into a "group" that
      // zooms out to cover artifacts. A group member is at least a quarter
      // of the median face area in the same sample (real two-shots have
      // comparable face sizes; detectors' ghosts are far smaller). The
      // median - not the max - is the reference: a person-scale outlier
      // (e.g. a gesturing hand closeup much larger than the heads) would
      // otherwise inflate the reference and get the real heads filtered
      // out; the vertical-extent guard below handles those outliers.
      const areaOf = (f: any) => Math.max(0, Number(f?.width) || 0) * Math.max(0, Number(f?.height) || 0);
      const sortedAreas = allFaces.map(areaOf).filter((a) => a > 0).sort((a, b) => a - b);
      const refArea = sortedAreas.length ? sortedAreas[Math.floor(sortedAreas.length / 2)] : 0;
      const faces = refArea > 0
        ? allFaces.filter((f) => areaOf(f) >= refArea * 0.25)
        : allFaces;
      if (faces.length === 0) return;
      // Vertical-extent guard: a person-scale detection well below/above the
      // group (e.g. a gesturing hand closeup) is not a head - keep it out of
      // the head band so the window is not stretched to the waist. Reference
      // is the MEDIAN center_y: an area-weighted centroid would itself be
      // dragged by the outlier's large area and filter out the real heads.
      const medY = (() => {
        const ys = faces.map((f) => Number(f.center_y)).sort((a, b) => a - b);
        return ys[Math.floor(ys.length / 2)];
      })();
      const medH = (() => {
        const hs = faces.map((f) => Number(f.height) || 0).filter((h) => h > 0).sort((a, b) => a - b);
        return hs.length ? hs[Math.floor(hs.length / 2)] : 0;
      })();
      const heads = medH > 0
        ? faces.filter((f) => Math.abs(Number(f.center_y) - medY) <= 2.5 * medH)
        : faces;
      const use = heads.length > 0 ? heads : faces;
      const xs = use.map((f) => Number(f.center_x));
      const ys = use.map((f) => Number(f.center_y));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const sortedW = use.map((f) => Number(f.width) || 0).filter((w) => w > 0).sort((a, b) => a - b);
      const sortedH = use.map((f) => Number(f.height) || 0).filter((h) => h > 0).sort((a, b) => a - b);
      groups.push({
        time: Number.isFinite(sample?.time) ? Number(sample.time) : idx * 0.5,
        cx: (minX + maxX) / 2,
        cy: (Math.min(...ys) + Math.max(...ys)) / 2,
        span: maxX - minX,
        spanY: Math.max(...ys) - Math.min(...ys),
        top: Math.min(...use.map((f) => Number(f.center_y) - (Number(f.height) || 0) / 2)),
        bottom: Math.max(...use.map((f) => Number(f.center_y) + (Number(f.height) || 0) / 2)),
        faceW: sortedW.length ? sortedW[Math.floor(sortedW.length / 2)] : 0,
        faceH: sortedH.length ? sortedH[Math.floor(sortedH.length / 2)] : 0,
      });
    });
    if (groups.length < 3) return null;

    // Single-person clips keep the existing tight tracking: only engage when
    // a real group is on screen for a meaningful share of samples.
    const multiFaceSamples = groups.filter((g) => g.span > 0.02).length;
    if (multiFaceSamples < Math.max(3, groups.length * 0.25)) return null;

    // Window covers the widest group arrangement plus margin; never wider
    // than the source, never so narrow that it defeats the purpose.
    const maxSpan = Math.max(...groups.map((g) => g.span));
    const maxSpanY = Math.max(...groups.map((g) => g.spanY));
    const med = (vals: number[]) => {
      const v = [...vals].sort((a, b) => a - b);
      return v.length ? v[Math.floor(v.length / 2)] : 0;
    };
    const faceWMed = med(groups.map((g) => g.faceW).filter((w) => w > 0));
    const faceHMed = med(groups.map((g) => g.faceH).filter((h) => h > 0));
    const hasSize = faceWMed > 0 && faceHMed > 0;
    let windowW: number;
    let windowH: number | undefined;
    if (hasSize) {
      // Composition policy (judgment, not fixed aspect): width = face span +
      // margins scaled to face size; height = head extent + headroom/body
      // margin, clamped so the rendered band stays between ~34% and ~48% of
      // the 9:16 canvas. Bigger faces, both people still in frame.
      const xCover = maxSpan + Math.max(0.1, 2.2 * faceWMed);
      windowW = Math.min(0.92, Math.max(0.35, xCover));
      const winWPx = windowW * sourceWidth;
      const extentY = Math.max(...groups.map((g) => g.bottom - g.top));
      const desiredHPx = (extentY + 2.6 * faceHMed) * sourceHeight;
      // Floor raised 0.6 -> 0.72: seated/side-by-side subjects have small
      // head extents, and the low floor left the strip at ~34% of canvas
      // (blur-majority). 0.72 keeps such shots near ~40% band presence;
      // the 0.85 cap still bounds the band under ~48%.
      const winHPx = Math.min(sourceHeight, Math.min(Math.max(desiredHPx, winWPx * 0.72), winWPx * 0.85));
      windowH = winHPx / sourceHeight;
    } else {
      // No face size data: legacy fixed 4:3 window behavior, unchanged.
      const xCover = maxSpan * 1.9 + 0.1;
      const yCover = ((maxSpanY * 1.6 + 0.15) * sourceHeight) / (0.75 * sourceWidth);
      windowW = Math.min(0.92, Math.max(0.4, xCover, yCover));
    }

    // Smooth the group midpoint with a 3-sample moving average so the camera
    // drifts instead of jittering; clamp away from edges. With face sizes the
    // window is headroom-biased: its top sits ~0.9 face-heights above the
    // highest head (eyes land in the band's upper third), so centerY is the
    // resulting window center, not the raw face midpoint.
    const keyframes = groups.map((g, i) => {
      const lo = Math.max(0, i - 1);
      const hi = Math.min(groups.length - 1, i + 1);
      let sx = 0;
      let sy = 0;
      for (let j = lo; j <= hi; j++) {
        const gj = groups[j];
        sx += gj.cx;
        if (windowH !== undefined && gj.faceH > 0) {
          const top = gj.top - 0.9 * gj.faceH;
          sy += Math.min(1 - windowH / 2, Math.max(windowH / 2, top + windowH / 2));
        } else {
          sy += gj.cy;
        }
      }
      const n = hi - lo + 1;
      return { time: g.time, centerX: clamp01(sx / n), centerY: clamp01(sy / n) };
    });

    return { keyframes, windowW, windowH };
  }

  /**
   * Blurred-backdrop group fit filter for single-view multi-person clips:
   * the full group stays visible inside a window cropped from the source and
   * scaled to the canvas width, over a blurred fill of the same footage
   * (CapCut-style fit). The crop window follows the group midpoint via the
   * same piecewise keyframe expressions the tight tracker uses.
   */
  public static buildGroupFitFilter(options: {
    keyframes: Array<{ time: number; centerX: number; centerY: number }>;
    windowW: number;
    /** Composition window height as a fraction of source height (from
     * computeGroupFrameGeometry when face sizes are known). Omit for the
     * legacy 4:3 window. */
    windowH?: number;
    sourceWidth: number;
    sourceHeight: number;
    canvasWidth?: number;
    canvasHeight?: number;
    /** Vertical placement of the foreground strip: 0 = top, 1 = bottom. */
    focusY?: number;
    /** Chain-safe embedding: see buildSplitPodcastFilter. */
    tag?: string;
  }): string {
    const {
      keyframes,
      windowW,
      windowH,
      sourceWidth,
      sourceHeight,
      canvasWidth = 1080,
      canvasHeight = 1920,
      focusY = 0.42,
      tag,
    } = options;

    // Composition window: 4:3, not the source's own wide aspect. A
    // source-aspect window on wide footage yields a thin strip users reject;
    // the 4:3 crop-with-fill is the pattern competitor tools ship for
    // both-people-visible single view (Opus "Fit"), and it covers upper
    // bodies instead of just faces.
    const winW = Math.round(windowW * sourceWidth);
    const winH = windowH !== undefined
      ? Math.min(sourceHeight, Math.max(1, Math.round(windowH * sourceHeight)))
      : Math.min(sourceHeight, Math.round(winW * 0.75));

    const kfs = [...keyframes]
      .filter((k) => Number.isFinite(k.time) && Number.isFinite(k.centerX))
      .sort((a, b) => a.time - b.time)
      .slice(0, 40);
    const piecewise = (vals: Array<{ time: number; v: number }>, last: number): string => {
      let expr = last.toFixed(4);
      for (let i = vals.length - 2; i >= 0; i--) {
        const k0 = vals[i];
        const k1 = vals[i + 1];
        const dt = Math.max(0.001, k1.time - k0.time);
        const dv = k1.v - k0.v;
        expr = `if(lte(t\\,${k1.time.toFixed(3)})\\,${k0.v.toFixed(4)}+(${dv.toFixed(4)})*(t-${k0.time.toFixed(3)})/${dt.toFixed(3)}\\,${expr})`;
      }
      return expr;
    };

    let cropX: string;
    let cropY: string;
    if (kfs.length === 0) {
      cropX = '(in_w-out_w)/2';
      cropY = '(in_h-out_h)/2';
    } else {
      const xExpr = piecewise(kfs.map((k) => ({ time: k.time, v: k.centerX })), kfs[kfs.length - 1].centerX);
      const yExpr = piecewise(kfs.map((k) => ({ time: k.time, v: k.centerY })), kfs[kfs.length - 1].centerY);
      cropX = `min(max(in_w*min(max(${xExpr}\\,0)\\,1)-out_w/2\\,0)\\,in_w-out_w)`;
      cropY = `min(max(in_h*min(max(${yExpr}\\,0)\\,1)-out_h/2\\,0)\\,in_h-out_h)`;
    }

    const L = (s: string) => (tag ? `${tag}_${s}_` : s);
    const inner =
      `split=2[${L('gbg')}][${L('gfg')}];` +
      `[${L('gbg')}]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight},boxblur=25:5,eq=brightness=-0.15:contrast=0.95[${L('gb')}];` +
      `[${L('gfg')}]crop=${winW}:${winH}:'${cropX}':${cropY},scale=${canvasWidth}:-2[${L('gf')}];` +
      `[${L('gb')}][${L('gf')}]overlay=(W-w)/2:(H-h)*${focusY}`;

    if (tag) return inner;
    return `[0:v]${inner}[out]`;
  }

  /**
   * Generates FFmpeg filter expression for Dual-Speaker Podcast Split Layout (OpenShorts / Opus Clip style):
   * Stacks Speaker 1 on top (1080x960) and Speaker 2 on bottom (1080x960) into a 1080x1920 (9:16) frame,
   * with clean dividing line between speakers where captions rest.
   *
   * When per-speaker geometry (from computeSplitSpeakerGeometry) is supplied,
   * each panel zooms to the geometry's crop window around the measured face
   * position (x and y anchors); without it the legacy anchor-only behavior is
   * preserved byte-for-byte.
   */
  public static buildSplitPodcastFilter(options: {
    speaker1X?: number;
    speaker2X?: number;
    canvasWidth?: number;
    canvasHeight?: number;
    sourceWidth?: number;
    sourceHeight?: number;
    speaker1Geometry?: { x: number; y: number; windowW: number };
    speaker2Geometry?: { x: number; y: number; windowW: number };
    /** Chain-safe embedding (Pro editor graph): consumes the incoming stream
     * (no [0:v] prefix), ends UNLABELED so callers can keep appending filters,
     * and prefixes every link label with the tag. Must be unique per graph. */
    tag?: string;
  } = {}): string {
    const {
      speaker1X = 0.25,
      speaker2X = 0.75,
      canvasWidth = 1080,
      canvasHeight = 1920,
      sourceWidth = 1920,
      sourceHeight = 1080,
      speaker1Geometry,
      speaker2Geometry,
      tag,
    } = options;

    const halfHeight = Math.round(canvasHeight / 2);
    const spk1XClamped = Math.min(0.9, Math.max(0.1, speaker1X));
    const spk2XClamped = Math.min(0.9, Math.max(0.1, speaker2X));

    const cropXExpr = (spkX: number) => `min(max(in_w*${spkX}-out_w/2\\,0)\\,in_w-out_w)`;
    const cropYExpr = (spkY: number) => `min(max(in_h*${spkY}-out_h/2\\,0)\\,in_h-out_h)`;
    // Scale so the geometry's window (fraction of source width) maps to the
    // panel width. Even height keeps yuv420p-compatible dimensions downstream.
    const scaledHeightFor = (windowW: number) => {
      const h = Math.round((sourceHeight * canvasWidth) / (Math.min(0.95, Math.max(0.05, windowW)) * sourceWidth));
      return Math.max(halfHeight, h % 2 === 0 ? h : h + 1);
    };

    const panelChain = (
      inputLabel: string,
      outputLabel: string | null,
      spkXClamped: number,
      geometry?: { x: number; y: number; windowW: number }
    ): string => {
      if (geometry) {
        const gx = Math.min(0.9, Math.max(0.1, geometry.x));
        const gy = Math.min(0.9, Math.max(0.1, geometry.y));
        return (
          `[${inputLabel}]scale=-1:${scaledHeightFor(geometry.windowW)}:force_original_aspect_ratio=increase,` +
          `crop=${canvasWidth}:${halfHeight}:'${cropXExpr(gx)}':'${cropYExpr(gy)}'` +
          (outputLabel ? `[${outputLabel}]` : '')
        );
      }
      return (
        `[${inputLabel}]scale=-1:${halfHeight}:force_original_aspect_ratio=increase,` +
        `crop=${canvasWidth}:${halfHeight}:'${cropXExpr(spkXClamped)}':(in_h-out_h)/2` +
        (outputLabel ? `[${outputLabel}]` : '')
      );
    };

    if (tag) {
      return `split=2[${tag}s1][${tag}s2];` +
        panelChain(`${tag}s1`, `${tag}top`, spk1XClamped, speaker1Geometry) + ';' +
        panelChain(`${tag}s2`, `${tag}bot`, spk2XClamped, speaker2Geometry) + ';' +
        `[${tag}top][${tag}bot]vstack`;
    }

    return `[0:v]split=2[spk1][spk2];` +
      panelChain('spk1', 'v_top', spk1XClamped, speaker1Geometry) + ';' +
      panelChain('spk2', 'v_bot', spk2XClamped, speaker2Geometry) + ';' +
      `[v_top][v_bot]vstack[out]`;
  }

  /**
   * Generates FFmpeg filter expression for 9:16 Blurred Background (General / B-roll mode):
   * Used when no face is detected or for screen recordings / nature / animations.
   * Blurs and darkens the 9:16 background, and overlays the crisp 16:9 source centered.
   */
  public static buildBlurBackgroundFilter(options: {
    canvasWidth?: number;
    canvasHeight?: number;
    blurRadius?: number;
    brightness?: number;
    /** Chain-safe embedding: see buildSplitPodcastFilter. */
    tag?: string;
  } = {}): string {
    const {
      canvasWidth = 1080,
      canvasHeight = 1920,
      blurRadius = 25,
      brightness = -0.15,
      tag,
    } = options;

    if (tag) {
      return `split=2[${tag}bg][${tag}fg];` +
        `[${tag}bg]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight},boxblur=${blurRadius}:5,eq=brightness=${brightness}:contrast=0.95[${tag}b];` +
        `[${tag}fg]scale=${canvasWidth}:-1:force_original_aspect_ratio=decrease[${tag}f];` +
        `[${tag}b][${tag}f]overlay=(W-w)/2:(H-h)/2`;
    }

    return `[0:v]split=2[bg][fg];` +
      `[bg]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight},boxblur=${blurRadius}:5,eq=brightness=${brightness}:contrast=0.95[v_blur];` +
      `[fg]scale=${canvasWidth}:-1:force_original_aspect_ratio=decrease[v_fg];` +
      `[v_blur][v_fg]overlay=(W-w)/2:(H-h)/2[out]`;
  }

  /**
   * Analyzes face tracking samples and selects the optimal layout mode:
   * - 'blur': If >= 70% of frames have no faces (B-roll, landscape, animation, graphic)
   * - 'split': If two distinct persistent speakers on left (x <= 0.45) and right (x >= 0.55)
   * - 'screencast': If explicitly requested or screencast detected
   * - 'track': Default active speaker tracking
   */
  public static determineOptimalLayoutMode(
    samples: ReframeSample[],
    options: { isScreencastHint?: boolean; preferredMode?: ReframeLayoutMode; fallbackMode?: ReframeLayoutMode } = {}
  ): { layoutMode: ReframeLayoutMode; speaker1X?: number; speaker2X?: number } {
    if (options.preferredMode) {
      return { layoutMode: options.preferredMode };
    }
    if (options.isScreencastHint) {
      return { layoutMode: 'screencast' };
    }

    // Measurement unavailable: use the caller's fallback hint (e.g. a genre
    // recommendation) when provided, else the historical 'blur' default.
    if (!Array.isArray(samples) || samples.length === 0) {
      return { layoutMode: options.fallbackMode ?? 'blur' };
    }

    let noFaceFrames = 0;
    let twoSpeakerFrames = 0;
    const leftFaceXs: number[] = [];
    const rightFaceXs: number[] = [];

    for (const sample of samples) {
      const faces = sample.faces || [];
      if (faces.length === 0) {
        noFaceFrames++;
      } else if (faces.length >= 2) {
        const sorted = [...faces].sort((a, b) => a.center_x - b.center_x);
        const leftFace = sorted[0];
        const rightFace = sorted[sorted.length - 1];

        if (leftFace.center_x <= 0.45 && rightFace.center_x >= 0.55 && (rightFace.center_x - leftFace.center_x) >= 0.30) {
          twoSpeakerFrames++;
          leftFaceXs.push(leftFace.center_x);
          rightFaceXs.push(rightFace.center_x);
        }
      }
    }

    if (noFaceFrames / samples.length >= 0.70) {
      return { layoutMode: 'blur' };
    }

    if (twoSpeakerFrames / samples.length >= 0.20 && leftFaceXs.length >= 2) {
      const avgLeft = leftFaceXs.reduce((a, b) => a + b, 0) / leftFaceXs.length;
      const avgRight = rightFaceXs.reduce((a, b) => a + b, 0) / rightFaceXs.length;
      return {
        layoutMode: 'split',
        speaker1X: Math.round(avgLeft * 100) / 100,
        speaker2X: Math.round(avgRight * 100) / 100,
      };
    }

    // Anchorability check: 'track' tight-crops around the dominant face. A
    // clip should only commit to that crop when an anchorable subject (a face
    // occupying at least TRACK_ANCHOR_MIN_FACE_AREA of the frame) is present
    // in at least half the samples. Measured 15 Nov 2026 on the NASA Moon
    // Base window: only 25% of samples had any face >= 2% of frame (distant
    // people in wide shots), and the resulting tight crop clipped source
    // title text at both edges; fitting the full frame is the right call
    // there. A global median was rejected: it hides mixed-shot clips where a
    // close subject is present for most of the runtime. Two-shot split above
    // is position-based and intentionally unaffected.
    let anchorableSamples = 0;
    for (const sample of samples) {
      const hasAnchor = (sample.faces || []).some((f) => {
        const a = f.width * f.height;
        return Number.isFinite(a) && a >= SmartReframeService.TRACK_ANCHOR_MIN_FACE_AREA;
      });
      if (hasAnchor) anchorableSamples++;
    }
    if (anchorableSamples / samples.length < SmartReframeService.TRACK_ANCHOR_MIN_SAMPLE_RATIO) {
      return { layoutMode: 'blur' };
    }

    return { layoutMode: 'track' };
  }

  /**
   * Estimates credible two-speaker anchor positions from CV samples for the
   * split layout's speaker-centered crop windows. Deliberately looser than
   * the split LAYOUT decision: that decision gates an AUTOMATIC layout change
   * (20% prevalence, left <= 0.45 / right >= 0.55 / separation >= 0.30), while
   * anchors are a starting point for a layout the user explicitly picked and
   * can adjust with the panel sliders - they only need a persistent
   * left-of-center vs right-of-center pair (separation >= 0.15, comfortably
   * above the caption-zone 0.08 distinguishability floor). Measured 16 Nov
   * 2026 on the TOS two-shot fixture: speakers at 0.31/0.59 (separation
   * 0.28) miss the decision rule but are exactly the anchors a manual Split
   * pick needs. Requires >= 2 qualifying samples so a single stray detection
   * cannot fabricate anchors. Returns null when no credible two-speaker
   * geometry exists (single-subject, same-side pairs, faceless clips), in
   * which case callers keep the symmetric defaults.
   */
  public static estimateSpeakerAnchors(
    samples: ReframeSample[]
  ): { speaker1X: number; speaker2X: number } | null {
    if (!Array.isArray(samples) || samples.length === 0) return null;
    const leftFaceXs: number[] = [];
    const rightFaceXs: number[] = [];
    for (const sample of samples) {
      const faces = sample.faces || [];
      if (faces.length < 2) continue;
      const sorted = [...faces].sort((a, b) => a.center_x - b.center_x);
      const leftFace = sorted[0];
      const rightFace = sorted[sorted.length - 1];
      if (leftFace.center_x < 0.5 && rightFace.center_x > 0.5 && (rightFace.center_x - leftFace.center_x) >= 0.15) {
        leftFaceXs.push(leftFace.center_x);
        rightFaceXs.push(rightFace.center_x);
      }
    }
    if (leftFaceXs.length < 2) return null;
    const avgLeft = leftFaceXs.reduce((a, b) => a + b, 0) / leftFaceXs.length;
    const avgRight = rightFaceXs.reduce((a, b) => a + b, 0) / rightFaceXs.length;
    return {
      speaker1X: Math.round(avgLeft * 100) / 100,
      speaker2X: Math.round(avgRight * 100) / 100,
    };
  }

  /**
   * Minimum face area (fraction of frame) that qualifies a detection as a
   * crop-anchorable subject. 0.02 = 2% of frame. PROVISIONAL heuristic
   * (15 Nov 2026): chosen from the NASA Moon Base window (75th percentile
   * sample-max area 2.05% for wide documentary shots), not from a measured
   * talking-head distribution; revisit with broader evidence.
   */
  private static readonly TRACK_ANCHOR_MIN_FACE_AREA = 0.02;
  /**
   * Minimum fraction of samples that must contain an anchorable subject
   * before 'track' commits the whole clip to a tight crop.
   */
  private static readonly TRACK_ANCHOR_MIN_SAMPLE_RATIO = 0.5;

  /**
   * Provenance-aware layout resolution (see CropConfig.layout_mode_source):
   * - user-chosen and legacy/unknown-provenance crop layouts stay authoritative.
   * - a genre-recommended layout (auto-stamped at analysis time, or the project
   *   genre profile's recommendedLayoutMode) is only a hint: measured
   *   content-aware detection decides when samples exist. Exception: 'screencast'
   *   engages when the hint exists AND analysis found a static facecam track (the
   *   geometric screen-with-facecam signal) AND measurement did not find a
   *   two-shot conversation. Faceless sources (documentary, B-roll, pure
   *   gameplay) no longer inherit split_stacked duplication from a genre label.
   */
  public static resolveLayoutWithProvenance(args: {
    cropLayoutMode?: ReframeLayoutMode;
    cropLayoutSource?: 'genre_recommendation' | 'user' | 'legacy_unknown';
    genrePreferredLayoutMode?: ReframeLayoutMode;
    samples: ReframeSample[];
    facecamSuggestionPresent: boolean;
  }): { layoutMode: ReframeLayoutMode; speaker1X?: number; speaker2X?: number } {
    const { cropLayoutMode, cropLayoutSource, genrePreferredLayoutMode, samples, facecamSuggestionPresent } = args;
    const cropAuthoritative = !!cropLayoutMode && cropLayoutSource !== 'genre_recommendation';
    if (cropAuthoritative) {
      return this.determineOptimalLayoutMode(samples, {
        preferredMode: cropLayoutMode,
        fallbackMode: genrePreferredLayoutMode,
      });
    }
    const genreHint = cropLayoutMode ?? genrePreferredLayoutMode;
    const measured = this.determineOptimalLayoutMode(samples, { fallbackMode: genreHint });
    // A static facecam track is the screen-with-facecam signal; when it is
    // present the genre hint engages for any measured single-subject outcome.
    // 'track' covers the large-facecam case; 'blur' covers the SMALL static
    // facecam (verified 15 Nov 2026 with a synthetic fixture: a 0.55%-of-frame
    // static face over animated content measures 'blur' under the anchor rule,
    // which is exactly the typical gameplay capture). Only a measured two-shot
    // conversation ('split') overrides the hint. Documentary/B-roll footage is
    // unaffected because findStaticFacecamTrack returns null there (verified
    // on the NASA Moon Base window).
    if (
      genreHint === 'screencast' &&
      Array.isArray(samples) &&
      samples.length > 0 &&
      facecamSuggestionPresent &&
      measured.layoutMode !== 'split'
    ) {
      return { layoutMode: 'screencast' };
    }
    return measured;
  }

  /**
   * Unified dispatcher for smart reframe layout filters.
   */
  public static buildLayoutCropFilter(options: {
    layoutMode?: ReframeLayoutMode;
    aspectRatio: ClipAspectRatio;
    keyframes?: ReframeKeyframe[];
    sourceWidth: number;
    sourceHeight: number;
    duration: number;
    speaker1X?: number;
    speaker2X?: number;
    /** Per-speaker zoom/anchor geometry for the split layout, from
     * computeSplitSpeakerGeometry. Omitted keeps the legacy split framing. */
    splitGeometry?: {
      speaker1: { x: number; y: number; windowW: number };
      speaker2: { x: number; y: number; windowW: number };
    } | null;
    /** Group framing for single-view multi-person clips, from
     * computeGroupFrameGeometry. When present for the track layout in 9:16,
     * the whole group stays visible (blur-fill fit) instead of tight
     * single-subject tracking that cuts people at the edges. */
    groupFrame?: {
      keyframes: Array<{ time: number; centerX: number; centerY: number }>;
      windowW: number;
      windowH?: number;
    } | null;
    screencastMode?: 'split_stacked' | 'circular_inset' | 'rounded_card_inset';
    screencastInsetPosition?: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';
    screencastInsetDiameter?: number;
    screencastScreenRatio?: number;
    screencastBackground?: 'black' | 'blur';
    screencastFacecamBox?: { x: number; y: number; w: number; h: number };
    /** Chain-safe embedding (Pro editor graph): see buildSplitPodcastFilter. */
    tag?: string;
  }): string {
    const {
      layoutMode = 'track',
      aspectRatio,
      keyframes = [],
      sourceWidth,
      sourceHeight,
      duration,
      speaker1X,
      speaker2X,
      splitGeometry,
      screencastMode = 'split_stacked',
      screencastInsetPosition,
      screencastInsetDiameter,
      screencastScreenRatio,
      screencastBackground,
      screencastFacecamBox,
      groupFrame,
      tag,
    } = options;

    if (aspectRatio === '9:16' && (layoutMode === 'track' || !layoutMode) && groupFrame && groupFrame.keyframes.length > 0) {
      return this.buildGroupFitFilter({
        keyframes: groupFrame.keyframes,
        windowW: groupFrame.windowW,
        windowH: groupFrame.windowH,
        sourceWidth,
        sourceHeight,
        canvasWidth: 1080,
        canvasHeight: 1920,
        tag,
      });
    }

    if (aspectRatio === '9:16') {
      if (layoutMode === 'split') {
        return this.buildSplitPodcastFilter({
          speaker1X,
          speaker2X,
          canvasWidth: 1080,
          canvasHeight: 1920,
          sourceWidth,
          sourceHeight,
          speaker1Geometry: splitGeometry?.speaker1,
          speaker2Geometry: splitGeometry?.speaker2,
          tag,
        });
      }

      if (layoutMode === 'blur') {
        return this.buildBlurBackgroundFilter({
          canvasWidth: 1080,
          canvasHeight: 1920,
          tag,
        });
      }

      if (layoutMode === 'screencast') {
        return this.buildScreencastFilter({
          mode: screencastMode,
          insetPosition: screencastInsetPosition,
          insetDiameter: screencastInsetDiameter,
          screenRatio: screencastScreenRatio,
          background: screencastBackground,
          facecamBox: screencastFacecamBox,
          canvasWidth: 1080,
          canvasHeight: 1920,
          tag,
        });
      }
    }

    // Default 'track' mode uses smoothed keyframe camera pan
    return this.buildSmartCropFilter(keyframes, aspectRatio, sourceWidth, sourceHeight, duration);
  }

  /**
   * Finds the Python executable to invoke for local CV analysis.
   */
  public static getPythonPath(): string {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
      return process.env.PYTHON_PATH;
    }
    // Check project venvs and embedded python distributions (Windows and POSIX)
    const candidates = [
      path.resolve(process.cwd(), 'python_embed/python.exe'),
      path.resolve(process.cwd(), 'server/python_embed/python.exe'),
      path.resolve(process.cwd(), '../server/python_embed/python.exe'),
      path.resolve(process.cwd(), 'server/python/.venv/Scripts/python.exe'),
      path.resolve(process.cwd(), 'python/.venv/Scripts/python.exe'),
      path.resolve(process.cwd(), 'server/python/.venv/bin/python'),
      path.resolve(process.cwd(), 'python/.venv/bin/python'),
      path.resolve(process.cwd(), '../server/python/.venv/bin/python'),
      'python3',
      'python',
    ];

    for (const c of candidates) {
      if ((c.includes('/') || c.includes('\\')) && fs.existsSync(c)) {
        return c;
      }
    }
    return 'python3';
  }

  /**
   * One-time, cached capability check: can this host actually run the OpenCV
   * reframe analysis? A missing python/OpenCV runtime silently degraded every
   * render to center-crop before (audit M-6); the result is now cached, logged
   * once, and surfaced as an advisory degradation on /ready.
   */
  public static async checkReframeRuntime(force = false): Promise<{
    available: boolean;
    pythonPath: string;
    detail?: string;
  }> {
    if (this.reframeRuntimeCheck && !force) return this.reframeRuntimeCheck;

    this.reframeRuntimeCheck = (async () => {
      const pythonPath = this.getPythonPath();
      try {
        await execFileAsync(
          pythonPath,
          ['-c', 'import cv2, numpy'],
          { timeout: 20000 }
        );
        logger.info(`[SmartReframe] OpenCV runtime available via '${pythonPath}'.`);
        return { available: true, pythonPath };
      } catch (err: any) {
        logger.warn(
          `[SmartReframe] OpenCV runtime unavailable via '${pythonPath}' (${err.message}). Smart reframing will degrade to center crop until a Python environment with opencv-python is provided.`
        );
        return { available: false, pythonPath, detail: err.message };
      }
    })();

    return this.reframeRuntimeCheck;
  }
  private static reframeRuntimeCheck: Promise<{
    available: boolean;
    pythonPath: string;
    detail?: string;
  }> | null = null;

  /**
   * Invokes Python face detection script via execFile with strict timeout and input isolation.
   */
  public static async runCvAnalyzer(
    videoPath: string,
    sampleFps = 4.0,
    startSec = 0.0,
    durationSec = 0.0,
    timeoutMs = 120000,
    maxSamples = 600
  ): Promise<{
    source_width: number;
    source_height: number;
    source_fps: number;
    duration: number;
    sample_fps: number;
    sample_count: number;
    scene_cuts?: number[];
    samples: ReframeSample[];
  }> {
    if (!fs.existsSync(videoPath)) {
      const err = new Error(`Video file not found for smart reframe: ${videoPath}`);
      (err as any).code = 'FILE_NOT_FOUND';
      throw err;
    }

    const scriptCandidates = [
      path.resolve(process.cwd(), 'server/python/smart_reframe.py'),
      path.resolve(process.cwd(), 'python/smart_reframe.py'),
      path.resolve(process.cwd(), '../server/python/smart_reframe.py'),
    ];

    const scriptPath = scriptCandidates.find((s) => fs.existsSync(s));

    if (!scriptPath) {
      const err = new Error(`Smart reframe Python script not found at candidate locations: ${scriptCandidates.join(', ')}`);
      (err as any).code = 'SCRIPT_NOT_FOUND';
      throw err;
    }

    const pythonBin = this.getPythonPath();
    const inputPayload = JSON.stringify({
      videoPath,
      sampleFps,
      startSec,
      durationSec,
      maxSamples,
    });

    return new Promise((resolve, reject) => {
      let isSettled = false;
      let child: ChildProcess | null = null;

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          if (child) {
            try {
              child.kill('SIGKILL');
            } catch {}
          }
          const err = new Error(`Smart reframe analysis timed out after ${timeoutMs / 1000}s`);
          (err as any).code = 'REFRAME_ANALYSIS_TIMEOUT';
          reject(err);
        }
      }, timeoutMs);

      try {
        child = execFile(
          pythonBin,
          [scriptPath],
          { maxBuffer: 10 * 1024 * 1024 },
          (err, stdout, stderr) => {
            clearTimeout(timer);
            if (isSettled) return;
            isSettled = true;

            if (err) {
              logger.error('[SmartReframe] Python CV analyzer failed', { error: err.message, stderr });
              const wrappedErr = new Error(`Computer vision analyzer failed: ${err.message}`);
              (wrappedErr as any).code = 'CV_ANALYZER_FAILED';
              return reject(wrappedErr);
            }

            try {
              const res = JSON.parse(stdout.trim());
              if (res.status !== 'ok') {
                const appErr = new Error(res.error_message || 'CV Analyzer returned error status');
                (appErr as any).code = res.error_code || 'CV_ANALYZER_ERROR';
                return reject(appErr);
              }
              resolve(res);
            } catch (pErr: any) {
              const parseErr = new Error(`Failed to parse CV analyzer output: ${pErr.message}`);
              (parseErr as any).code = 'MALFORMED_CV_OUTPUT';
              reject(parseErr);
            }
          }
        );

        if (child.stdin) {
          child.stdin.write(inputPayload);
          child.stdin.end();
        }
      } catch (launchErr: any) {
        clearTimeout(timer);
        if (!isSettled) {
          isSettled = true;
          reject(launchErr);
        }
      }
    });
  }

  /**
   * Main entry point to perform smart reframe analysis for a clip.
   * Acquires clip lock, downloads source, runs CV, extracts keyframes, and persists to DB.
   */
  public static async analyzeClipFraming(
    clipId: string,
    userId: string,
    options: SmartReframeOptions & { localSourcePath?: string } = {}
  ): Promise<ReframeTrackRecord> {
    if (!isMongoConfigured) {
      const err = new Error('Database service is not configured.');
      (err as any).code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    // 1. Lock check: prevent concurrent analyses for same clip
    if (activeReframeAnalysisSet.has(clipId)) {
      const err = new Error('Smart reframe analysis is already active for this clip.');
      (err as any).code = 'REFRAME_ANALYSIS_ACTIVE';
      throw err;
    }

    activeReframeAnalysisSet.add(clipId);

    const tempTag = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const tempDir = path.join(os.tmpdir(), `vireo-reframe-${clipId}-${tempTag}`);

    try {
      // 2. Fetch clip and verify ownership
      const { data: clip, error: clipErr } = await dataRepository
        .from('clips')
        .select('*')
        .eq('id', clipId)
        .maybeSingle();

      if (clipErr || !clip) {
        const err = new Error('Clip not found.');
        (err as any).code = 'CLIP_NOT_FOUND';
        throw err;
      }

      if (clip.user_id !== userId) {
        const err = new Error('Access denied: You do not own this clip.');
        (err as any).code = 'ACCESS_DENIED';
        throw err;
      }

      if (!clip.source_storage_path) {
        const err = new Error('Clip does not have an associated source video.');
        (err as any).code = 'SOURCE_VIDEO_NOT_FOUND';
        throw err;
      }

      // Phase 3b: resolve the project's genre profile so reframe tuning (dead
      // zone, velocity cap, smoothing) and layout preference follow the content
      // type. Explicit per-call options and the user's own layout choice win.
      let genreReframe: ReturnType<typeof resolveGenreReframeOptions> = {};
      try {
        if (clip.project_id) {
          const { data: proj } = await dataRepository
            .from('projects')
            .select('clip_preferences')
            .eq('id', clip.project_id)
            .maybeSingle();
          const genre = (proj as any)?.clip_preferences?.genre ?? null;
          genreReframe = resolveGenreReframeOptions(options, genre);
        }
      } catch (genreErr: any) {
        logger.warn(`[SmartReframe] Genre profile resolution skipped: ${genreErr.message}`);
      }

      fs.mkdirSync(tempDir, { recursive: true });
      // Reuse the render's already-downloaded source when provided (avoids a
      // second full-source download during render-time auto-generation).
      const localSourcePath = options.localSourcePath ?? path.join(tempDir, 'source.mp4');

      // 3. Download source video to temp location
      logger.info(`[SmartReframe] Downloading source video from Storage for clip ${clipId}: ${clip.source_storage_path}`);
      if (!options.localSourcePath || !fs.existsSync(options.localSourcePath)) {
        await downloadObjectToFile('source', clip.source_storage_path, localSourcePath);
      }

      // 4. Determine effective clip boundaries
      const trimStart = Number(clip.trim_start_offset || 0);
      const trimEnd = Number(clip.trim_end_offset || 0);
      const startSec = Number(clip.start_seconds) + trimStart;
      const originalDuration = Number(clip.duration_seconds || (clip.end_seconds - clip.start_seconds));
      const durationSec = Math.max(0.1, Number((originalDuration - trimStart - trimEnd).toFixed(3)));

      const sampleFps = options.sampleFps || 4.0;
      const timeoutMs = options.timeoutMs || 120000;

      // 5. Run local Computer Vision analysis
      logger.info(`[SmartReframe] Starting CV face analysis for clip ${clipId}: start=${startSec}s, dur=${durationSec}s`);
      const cvResult = await this.runCvAnalyzer(localSourcePath, sampleFps, startSec, durationSec, timeoutMs);

      // 6. Gather scene cuts and speech intervals for audio-visual shot-aware reframe
      let clipSceneCuts = options.sceneCuts ? [...options.sceneCuts] : [];
      let speechIntervals = options.speechIntervals;
      let wordTimings: Array<{ start: number; end: number; word?: string }> = [];

      try {
        if (clipSceneCuts.length === 0) {
          const { data: analysisRec } = await dataRepository
            .from('video_analyses')
            .select('timeline')
            .eq('project_id', clip.project_id)
            .maybeSingle();

          const rawCuts = (analysisRec as any)?.timeline?.scene_cuts;
          if (Array.isArray(rawCuts)) {
            clipSceneCuts = rawCuts
              .map(Number)
              .filter((c: number) => c > startSec + 0.25 && c < startSec + durationSec - 0.25)
              .map((c: number) => Number((c - startSec).toFixed(3)));
          }
        }

        if (cvResult.scene_cuts && Array.isArray(cvResult.scene_cuts)) {
          for (const c of cvResult.scene_cuts) {
            const relCut = Number(c);
            if (relCut > 0.25 && relCut < durationSec - 0.25 && !clipSceneCuts.some((x) => Math.abs(x - relCut) < 0.4)) {
              clipSceneCuts.push(relCut);
            }
          }
          clipSceneCuts.sort((a, b) => a - b);
        }

        if (!speechIntervals) {
          const { data: transcriptRec } = await dataRepository
            .from('transcripts')
            .select('words')
            .eq('project_id', clip.project_id)
            .maybeSingle();

          const words = (transcriptRec as any)?.words;
          if (Array.isArray(words)) {
            wordTimings = words
              .filter((w: any) => Number(w.end) >= startSec && Number(w.start) <= startSec + durationSec)
              .map((w: any) => ({
                start: Math.max(0, Number((Number(w.start) - startSec).toFixed(3))),
                end: Math.min(durationSec, Number((Number(w.end) - startSec).toFixed(3))),
                word: typeof w.word === 'string' ? w.word : undefined,
              }));
            speechIntervals = wordTimings.map((w: any) => ({ start: w.start, end: w.end }));
          }
        }
      } catch (ctxErr: any) {
        logger.warn(`[SmartReframe] Optional timeline/transcript enrichment skipped: ${ctxErr.message}`);
      }

      // 7. Associate tracks and select dominant subject. A persistent static
      // track (geometric facecam signature) is a user-correctable suggestion:
      // exclude it from dominant-subject selection for screencast layouts so
      // the tracked path follows content, and persist its box in metadata.
      const { tracks, faceCount } = this.associateTracks(cvResult.samples);
      const facecamSuggestion = this.findStaticFacecamTrack(cvResult.samples);
      const wantsScreencast =
        (clip.crop_config?.layout_mode ?? genreReframe.preferredLayoutMode) === 'screencast';
      let selectionTracks = tracks;
      if (wantsScreencast && facecamSuggestion && tracks.has(facecamSuggestion.trackId)) {
        selectionTracks = new Map(tracks);
        selectionTracks.delete(facecamSuggestion.trackId);
        if (selectionTracks.size === 0) selectionTracks = tracks; // never drop the only subject
      }
      const { dominantTrackId, score } = this.selectDominantTrack(selectionTracks, cvResult.samples.length, { speechIntervals });
      const { layoutMode, speaker1X, speaker2X } = this.resolveLayoutWithProvenance({
        cropLayoutMode: clip.crop_config?.layout_mode,
        cropLayoutSource: (clip.crop_config as any)?.layout_mode_source,
        genrePreferredLayoutMode: genreReframe.preferredLayoutMode,
        samples: cvResult.samples,
        facecamSuggestionPresent: !!facecamSuggestion,
      });

      logger.info(
        `[SmartReframe] Analysis complete for clip ${clipId}: detected ${faceCount} tracks, dominant: ${dominantTrackId} (score: ${score}), layout: ${layoutMode}`
      );

      // 8. Smooth trajectory with shot-aware partitioning, AV speaker tracking & hard cuts
      const smoothedKeyframes = this.smoothAndGenerateKeyframes({
        samples: cvResult.samples,
        dominantTrackId,
        duration: durationSec,
        deadZone: genreReframe.deadZone,
        maxVelocity: genreReframe.maxVelocity,
        smoothingAlpha: genreReframe.smoothingAlpha,
        aspectRatio: clip.aspect_ratio as ClipAspectRatio,
        sourceWidth: cvResult.source_width,
        sourceHeight: cvResult.source_height,
        sceneCuts: clipSceneCuts,
        speechIntervals,
      });

      // 8b. Word-energy diarization fusion: speaker switches only at word
      // boundaries — never mid-word. No-op without word timings.
      const fusedKeyframes = applyWordEnergyFusion(smoothedKeyframes, wordTimings);

      // 9. Persist to public.reframe_tracks table
      const trackPayload: Partial<ReframeTrackRecord> = {
        clip_id: clipId,
        project_id: clip.project_id,
        user_id: userId,
        status: 'ready',
        analysis_version: Number(clip.render_version || 1),
        sample_interval_ms: Math.round(1000 / sampleFps),
        source_width: cvResult.source_width,
        source_height: cvResult.source_height,
        detected_face_count: faceCount,
        dominant_track_id: dominantTrackId,
        layout_mode: layoutMode,
        raw_samples: cvResult.samples,
        smoothed_keyframes: fusedKeyframes,
        metadata: {
          dominant_score: score,
          layout_mode: layoutMode,
          // Decision-provided Xs win; otherwise persist estimated anchors so a
          // later MANUAL Split pick can frame measured speakers instead of the
          // symmetric defaults. Null when no credible two-speaker geometry.
          speaker1X: speaker1X ?? SmartReframeService.estimateSpeakerAnchors(cvResult.samples)?.speaker1X ?? null,
          speaker2X: speaker2X ?? SmartReframeService.estimateSpeakerAnchors(cvResult.samples)?.speaker2X ?? null,
          cv_duration: cvResult.duration,
          sample_fps: cvResult.sample_fps,
          total_samples: cvResult.samples.length,
          keyframe_count: fusedKeyframes.length, word_energy_fused: wordTimings.length > 0,
          // User-correctable suggestion only (static geometry, not intent proof)
          facecam_box: facecamSuggestion?.box ?? null,
          facecam_track_id: facecamSuggestion?.trackId ?? null,
        },
        analyzed_trim_start: trimStart,
        analyzed_trim_end: trimEnd,
        analyzed_aspect_ratio: clip.aspect_ratio || '9:16',
        updated_at: new Date().toISOString(),
      };

      const { data: savedRecord, error: upsertErr } = await dataRepository
        .from('reframe_tracks')
        .upsert(trackPayload, { onConflict: 'clip_id, analysis_version' })
        .select()
        .single();

      if (upsertErr) {
        logger.error(`[SmartReframe] Failed to save reframe track for clip ${clipId}: ${upsertErr.message}`);
        // Return constructed record even if DB upsert had issue so client isn't blocked
        return {
          id: crypto.randomUUID(),
          ...trackPayload,
          created_at: new Date().toISOString(),
        } as ReframeTrackRecord;
      }

      return savedRecord as ReframeTrackRecord;
    } finally {
      // Always cleanup temp files and release lock
      activeReframeAnalysisSet.delete(clipId);
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (rmErr: any) {
        logger.warn(`[SmartReframe] Failed to clean tempDir ${tempDir}: ${rmErr.message}`);
      }
    }
  }

  /**
   * Retrieves the reframe tracking record for a clip, checking ownership and staleness.
   */
  public static async getReframeTrack(
    clipId: string,
    userId: string
  ): Promise<(ReframeTrackRecord & { isStale?: boolean }) | null> {
    if (!isMongoConfigured) return null;

    // Fetch clip to verify ownership and current trim/aspect ratio
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('id, user_id, trim_start_offset, trim_end_offset, aspect_ratio')
      .eq('id', clipId)
      .maybeSingle();

    if (clipErr || !clip || clip.user_id !== userId) {
      return null;
    }

    const { data: track, error: trackErr } = await dataRepository
      .from('reframe_tracks')
      .select('*')
      .eq('clip_id', clipId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (trackErr || !track) {
      return null;
    }

    const trimStart = Number(clip.trim_start_offset || 0);
    const trimEnd = Number(clip.trim_end_offset || 0);
    const isStale =
      Math.abs(Number(track.analyzed_trim_start) - trimStart) > 0.05 ||
      Math.abs(Number(track.analyzed_trim_end) - trimEnd) > 0.05 ||
      track.analyzed_aspect_ratio !== (clip.aspect_ratio || '9:16');

    return {
      ...track,
      isStale,
    };
  }
}
