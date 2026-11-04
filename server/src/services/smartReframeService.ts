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

          if (dist < maxDistanceThreshold && areaRatio < 2.5) {
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
    const eligibleTracks = new Map<string, NormalizedFaceDetection[]>();
    for (const [id, dets] of tracks.entries()) {
      if (dets.length >= minSamples) {
        eligibleTracks.set(id, dets);
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

      const presenceRatio = Math.min(1.0, detections.length / totalSampleCount);

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
    } = params;

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

        // Two-shot tight framing check: if two prominent speakers are close (|x1 - x2| <= 0.32), frame midpoint
        const sortedTracks = Array.from(shotTracks.entries()).sort((a, b) => b[1].length - a[1].length);
        if (sortedTracks.length >= 2 && sortedTracks[0][1].length > 2 && sortedTracks[1][1].length > 2) {
          const avgX1 = sortedTracks[0][1].reduce((sum, d) => sum + d.center_x, 0) / sortedTracks[0][1].length;
          const avgX2 = sortedTracks[1][1].reduce((sum, d) => sum + d.center_x, 0) / sortedTracks[1][1].length;
          if (Math.abs(avgX1 - avgX2) <= 0.32) {
            // Midpoint framing to avoid whip-panning between tight two-shot conversationalists
            shotDominantTrackId = '__midpoint__';
          }
        }
      } else if (shotTracks.size === 1) {
        shotDominantTrackId = Array.from(shotTracks.keys())[0];
      }

      // Build raw trajectory for this shot
      const rawShotTraj: { time: number; x: number; y: number }[] = [];
      let lastSeenFace: NormalizedFaceDetection | null = null;
      let lastSeenTime = -1;

      for (const sample of shotSamples) {
        const { time } = sample;
        let targetX: number | null = null;
        let targetY: number | null = null;

        if (shotDominantTrackId === '__midpoint__') {
          const validFaceXs = sample.faces.map((f) => f.center_x);
          const validFaceYs = sample.faces.map((f) => f.center_y);
          if (validFaceXs.length >= 2) {
            targetX = (validFaceXs[0] + validFaceXs[1]) / 2.0;
            targetY = (validFaceYs[0] + validFaceYs[1]) / 2.0;
          } else if (validFaceXs.length === 1) {
            targetX = validFaceXs[0];
            targetY = validFaceYs[0];
          }
        } else if (shotDominantTrackId) {
          const match = sample.faces.find((f) => f.track_id === shotDominantTrackId);
          if (match) {
            targetX = match.center_x;
            targetY = match.center_y;
            lastSeenFace = match;
            lastSeenTime = time;
          }
        }

        const fallbackY = lastSeenFace ? lastSeenFace.center_y : 0.38;

        if (targetX !== null) {
          rawShotTraj.push({ time, x: targetX, y: targetY ?? fallbackY });
        } else if (lastSeenFace !== null && (time - lastSeenTime) <= 1.0) {
          // Short occlusion (<= 1.0s) within this shot: hold last known position
          rawShotTraj.push({ time, x: lastSeenFace.center_x, y: lastSeenFace.center_y });
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
  }): string {
    const {
      mode,
      insetPosition = 'bottom_right',
      insetDiameter = 360,
      screenRatio = 0.60,
      canvasWidth = 1080,
      canvasHeight = 1920,
    } = options;

    if (mode === 'split_stacked') {
      const topHeight = Math.round(canvasHeight * Math.max(0.3, Math.min(0.8, screenRatio)));
      const bottomHeight = canvasHeight - topHeight;
      return `[0:v]split=2[scr][spk];[scr]scale=${canvasWidth}:${topHeight}:force_original_aspect_ratio=decrease,pad=${canvasWidth}:${topHeight}:(ow-iw)/2:(oh-ih)/2:color=black[v_top];[spk]scale=${canvasWidth}:${bottomHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${bottomHeight}[v_bot];[v_top][v_bot]vstack[out]`;
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
      return `[0:v]split=2[main][cam];[main]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=decrease,pad=${canvasWidth}:${canvasHeight}:(ow-iw)/2:(oh-ih)/2:color=black[bg];[cam]scale=${insetDiameter}:${insetDiameter}:force_original_aspect_ratio=increase,crop=${insetDiameter}:${insetDiameter},format=yuva420p,geq=lum='p(X,Y)':a='if(lte((X-${radius})*(X-${radius})+(Y-${radius})*(Y-${radius}),${radius}*${radius}),255,0)'[cam_circle];[bg][cam_circle]overlay=x=${posX}:y=${posY}[out]`;
    }

    // rounded_card_inset
    const cardWidth = Math.round(insetDiameter * 1.15);
    const cardHeight = Math.round(insetDiameter * 0.85);
    return `[0:v]split=2[main][cam];[main]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=decrease,pad=${canvasWidth}:${canvasHeight}:(ow-iw)/2:(oh-ih)/2:color=black[bg];[cam]scale=${cardWidth}:${cardHeight}:force_original_aspect_ratio=increase,crop=${cardWidth}:${cardHeight}[card];[bg][card]overlay=x=${posX}:y=${posY}[out]`;
  }

  /**
   * Generates FFmpeg filter expression for Dual-Speaker Podcast Split Layout (OpenShorts / Opus Clip style):
   * Stacks Speaker 1 on top (1080x960) and Speaker 2 on bottom (1080x960) into a 1080x1920 (9:16) frame,
   * with clean dividing line between speakers where captions rest.
   */
  public static buildSplitPodcastFilter(options: {
    speaker1X?: number;
    speaker2X?: number;
    canvasWidth?: number;
    canvasHeight?: number;
  } = {}): string {
    const {
      speaker1X = 0.25,
      speaker2X = 0.75,
      canvasWidth = 1080,
      canvasHeight = 1920,
    } = options;

    const halfHeight = Math.round(canvasHeight / 2);
    const spk1XClamped = Math.min(0.9, Math.max(0.1, speaker1X));
    const spk2XClamped = Math.min(0.9, Math.max(0.1, speaker2X));

    const crop1Expr = `min(max(in_w*${spk1XClamped}-out_w/2\\,0)\\,in_w-out_w)`;
    const crop2Expr = `min(max(in_w*${spk2XClamped}-out_w/2\\,0)\\,in_w-out_w)`;

    return `[0:v]split=2[spk1][spk2];` +
      `[spk1]scale=-1:${halfHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${halfHeight}:'${crop1Expr}':(in_h-out_h)/2[v_top];` +
      `[spk2]scale=-1:${halfHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${halfHeight}:'${crop2Expr}':(in_h-out_h)/2[v_bot];` +
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
  } = {}): string {
    const {
      canvasWidth = 1080,
      canvasHeight = 1920,
      blurRadius = 25,
      brightness = -0.15,
    } = options;

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
    options: { isScreencastHint?: boolean; preferredMode?: ReframeLayoutMode } = {}
  ): { layoutMode: ReframeLayoutMode; speaker1X?: number; speaker2X?: number } {
    if (options.preferredMode) {
      return { layoutMode: options.preferredMode };
    }
    if (options.isScreencastHint) {
      return { layoutMode: 'screencast' };
    }

    if (!Array.isArray(samples) || samples.length === 0) {
      return { layoutMode: 'blur' };
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

    return { layoutMode: 'track' };
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
    screencastMode?: 'split_stacked' | 'circular_inset' | 'rounded_card_inset';
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
      screencastMode = 'split_stacked',
    } = options;

    if (aspectRatio === '9:16') {
      if (layoutMode === 'split') {
        return this.buildSplitPodcastFilter({
          speaker1X,
          speaker2X,
          canvasWidth: 1080,
          canvasHeight: 1920,
        });
      }

      if (layoutMode === 'blur') {
        return this.buildBlurBackgroundFilter({
          canvasWidth: 1080,
          canvasHeight: 1920,
        });
      }

      if (layoutMode === 'screencast') {
        return this.buildScreencastFilter({
          mode: screencastMode,
          canvasWidth: 1080,
          canvasHeight: 1920,
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
    timeoutMs = 120000
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

      // 7. Associate tracks and select dominant subject
      const { tracks, faceCount } = this.associateTracks(cvResult.samples);
      const { dominantTrackId, score } = this.selectDominantTrack(tracks, cvResult.samples.length, { speechIntervals });
      const { layoutMode, speaker1X, speaker2X } = this.determineOptimalLayoutMode(cvResult.samples, {
        preferredMode: clip.crop_config?.layout_mode,
      });

      logger.info(
        `[SmartReframe] Analysis complete for clip ${clipId}: detected ${faceCount} tracks, dominant: ${dominantTrackId} (score: ${score}), layout: ${layoutMode}`
      );

      // 8. Smooth trajectory with shot-aware partitioning, AV speaker tracking & hard cuts
      const smoothedKeyframes = this.smoothAndGenerateKeyframes({
        samples: cvResult.samples,
        dominantTrackId,
        duration: durationSec,
        deadZone: options.deadZone,
        maxVelocity: options.maxVelocity,
        smoothingAlpha: options.smoothingAlpha,
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
          speaker1X,
          speaker2X,
          cv_duration: cvResult.duration,
          sample_fps: cvResult.sample_fps,
          total_samples: cvResult.samples.length,
          keyframe_count: fusedKeyframes.length, word_energy_fused: wordTimings.length > 0,
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
