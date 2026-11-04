/**
 * VireoClip Viral Intelligence Service
 *
 * Implements Phase 6: Viral Pacing Intelligence & Reference Video Pacing Extraction.
 * Analyzes speech pacing curves, calculates Hook Velocity, identifies speech lulls and peaks,
 * and generates actionable video editing recommendations (punch-ins, cuts, B-roll).
 */

import { TranscriptWord } from '../types/index.js';

export interface PacingTimePoint {
  timeSec: number;
  wpm: number;
  energy: number; // 0.0 - 1.0
  wordCount: number;
}

export interface HookVelocityMetrics {
  hookDurationSec: number;
  hookWpm: number;
  averageWpm: number;
  velocityRatio: number;
  rating: 'explosive' | 'optimal' | 'moderate' | 'slow';
  recommendation?: string;
}

export interface PacingCurveAnalysis {
  durationSec: number;
  totalWords: number;
  averageWpm: number;
  hookVelocity: HookVelocityMetrics;
  pacingPoints: PacingTimePoint[];
  lullSegments: Array<{ startSec: number; endSec: number; durationSec: number }>;
  peakSegments: Array<{ startSec: number; endSec: number; peakWpm: number }>;
  retentionScore: number; // 0 - 100
  recommendations: Array<{
    type: 'PUNCH_IN' | 'BROLL' | 'HOOK_TIGHTEN' | 'SILENCE_CUT';
    startSec: number;
    endSec?: number;
    reason: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
}

export class ViralIntelligenceService {
  /**
   * Calculates sliding-window Words-Per-Minute (WPM) across transcript words.
   * Window size default: 4.0 seconds, step: 1.0 second.
   */
  public static calculatePacingCurve(
    words: TranscriptWord[],
    durationSec?: number,
    windowSizeSec = 4.0,
    stepSec = 1.0
  ): PacingTimePoint[] {
    if (!words || words.length === 0) return [];

    const sorted = [...words].sort((a, b) => a.start - b.start);
    const lastWordEnd = sorted[sorted.length - 1].end;
    const totalDuration = Math.max(durationSec ?? lastWordEnd, lastWordEnd, 1.0);

    const points: PacingTimePoint[] = [];

    for (let t = 0; t < totalDuration; t += stepSec) {
      const windowStart = t;
      const windowEnd = t + windowSizeSec;

      const wordsInWindow = sorted.filter(
        (w) => w.start < windowEnd && w.end > windowStart
      );

      const count = wordsInWindow.length;
      const wpm = (count / windowSizeSec) * 60;
      // Normalized energy: 0.0 to 1.0 (clamped at 220 WPM)
      const energy = Math.min(1.0, Math.max(0.05, Math.round((wpm / 200) * 100) / 100));

      points.push({
        timeSec: Math.round(t * 10) / 10,
        wpm: Math.round(wpm),
        energy,
        wordCount: count,
      });
    }

    return points;
  }

  /**
   * Evaluates the Hook Velocity (speech rate during the critical opening 3-5 seconds vs baseline).
   */
  public static evaluateHookVelocity(
    words: TranscriptWord[],
    hookWindowSec = 4.0
  ): HookVelocityMetrics {
    if (!words || words.length === 0) {
      return {
        hookDurationSec: hookWindowSec,
        hookWpm: 0,
        averageWpm: 0,
        velocityRatio: 0,
        rating: 'slow',
        recommendation: 'No speech detected in hook window.',
      };
    }

    const sorted = [...words].sort((a, b) => a.start - b.start);
    const totalDuration = Math.max(1.0, sorted[sorted.length - 1].end);
    const averageWpm = Math.round((sorted.length / (totalDuration / 60)));

    const hookWords = sorted.filter((w) => w.start < hookWindowSec);
    const hookWpm = Math.round((hookWords.length / (hookWindowSec / 60)));

    const velocityRatio = averageWpm > 0
      ? Math.round((hookWpm / averageWpm) * 100) / 100
      : 1.0;

    let rating: HookVelocityMetrics['rating'] = 'moderate';
    let recommendation: string | undefined;

    if (hookWpm >= 180) {
      rating = 'explosive';
      recommendation = 'Excellent high-urgency hook. Maintain snappy visual transitions.';
    } else if (hookWpm >= 150) {
      rating = 'optimal';
      recommendation = 'Strong hook velocity matching viral short-form retention standards.';
    } else if (hookWpm >= 120) {
      rating = 'moderate';
      recommendation = 'Consider trimming opening pauses or adding a fast punch-in.';
    } else {
      rating = 'slow';
      recommendation = 'Hook speech rate is below retention threshold (<120 WPM). Trim dead air or accelerate hook audio.';
    }

    return {
      hookDurationSec: hookWindowSec,
      hookWpm,
      averageWpm,
      velocityRatio,
      rating,
      recommendation,
    };
  }

  /**
   * Performs comprehensive viral pacing analysis on transcript words.
   */
  public static analyzePacing(
    words: TranscriptWord[],
    clipDurationSec?: number
  ): PacingCurveAnalysis {
    if (!words || words.length === 0) {
      return {
        durationSec: clipDurationSec ?? 0,
        totalWords: 0,
        averageWpm: 0,
        hookVelocity: {
          hookDurationSec: 4.0,
          hookWpm: 0,
          averageWpm: 0,
          velocityRatio: 0,
          rating: 'slow',
        },
        pacingPoints: [],
        lullSegments: [],
        peakSegments: [],
        retentionScore: 30,
        recommendations: [],
      };
    }

    const sorted = [...words].sort((a, b) => a.start - b.start);
    const duration = Math.max(clipDurationSec ?? sorted[sorted.length - 1].end, 1.0);
    const averageWpm = Math.round((sorted.length / (duration / 60)));
    const hookVelocity = this.evaluateHookVelocity(sorted, 4.0);
    const pacingPoints = this.calculatePacingCurve(sorted, duration, 4.0, 1.0);

    // 1. Detect speech pauses/lulls (> 0.75s gap between words)
    const lullSegments: Array<{ startSec: number; endSec: number; durationSec: number }> = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].start - sorted[i].end;
      if (gap >= 0.75) {
        lullSegments.push({
          startSec: Math.round(sorted[i].end * 100) / 100,
          endSec: Math.round(sorted[i + 1].start * 100) / 100,
          durationSec: Math.round(gap * 100) / 100,
        });
      }
    }

    // 2. Detect peak urgency segments (WPM >= 180)
    const peakSegments: Array<{ startSec: number; endSec: number; peakWpm: number }> = [];
    for (const point of pacingPoints) {
      if (point.wpm >= 180) {
        peakSegments.push({
          startSec: point.timeSec,
          endSec: Math.min(duration, point.timeSec + 4.0),
          peakWpm: point.wpm,
        });
      }
    }

    // 3. Generate actionable editing recommendations
    const recommendations: PacingCurveAnalysis['recommendations'] = [];

    // Hook recommendation
    if (hookVelocity.rating === 'slow') {
      recommendations.push({
        type: 'HOOK_TIGHTEN',
        startSec: 0,
        endSec: hookVelocity.hookDurationSec,
        reason: `Opening speech rate (${hookVelocity.hookWpm} WPM) is sluggish. Trim introductory hesitation or accelerate hook speech.`,
        priority: 'HIGH',
      });
    }

    // Lull cut recommendations
    for (const lull of lullSegments) {
      if (lull.durationSec >= 1.2) {
        recommendations.push({
          type: 'SILENCE_CUT',
          startSec: lull.startSec,
          endSec: lull.endSec,
          reason: `Noticeable speech lull (${lull.durationSec}s). Tighten silence to maintain engagement.`,
          priority: 'HIGH',
        });
      } else {
        recommendations.push({
          type: 'BROLL',
          startSec: lull.startSec,
          endSec: lull.endSec,
          reason: `Speech pause (${lull.durationSec}s). Good visual opportunity for contextual B-roll cutaway.`,
          priority: 'MEDIUM',
        });
      }
    }

    // Peak punch-in recommendations (limit to 3 per clip)
    let punchInCount = 0;
    for (const peak of peakSegments) {
      if (punchInCount >= 3) break;
      recommendations.push({
        type: 'PUNCH_IN',
        startSec: peak.startSec,
        endSec: peak.startSec + 2.0,
        reason: `High speech urgency (${peak.peakWpm} WPM). Punch in 1.15x to amplify emphasis.`,
        priority: 'MEDIUM',
      });
      punchInCount++;
    }

    // 4. Compute composite retention score (0 - 100)
    let score = 70; // baseline

    // Hook speed contribution
    if (hookVelocity.hookWpm >= 160) score += 15;
    else if (hookVelocity.hookWpm < 120) score -= 15;

    // Average WPM contribution (sweet spot is 140 - 180)
    if (averageWpm >= 140 && averageWpm <= 185) score += 10;
    else if (averageWpm < 110) score -= 10;

    // Excessive lull penalty
    if (lullSegments.length > 3) score -= 10;

    const retentionScore = Math.max(10, Math.min(98, score));

    return {
      durationSec: Math.round(duration * 100) / 100,
      totalWords: sorted.length,
      averageWpm,
      hookVelocity,
      pacingPoints,
      lullSegments,
      peakSegments,
      retentionScore,
      recommendations,
    };
  }

  /**
   * Evaluates clip metrics against empirical viral retention benchmarks
   */
  public static evaluateViralBenchmark(analysis: PacingCurveAnalysis): {
    meetsBenchmark: boolean;
    hookScore: number;
    pacingScore: number;
    retentionScore: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let hookScore = 50;
    let pacingScore = 50;

    if (analysis.hookVelocity.hookWpm >= 160) {
      hookScore = 95;
      feedback.push('Hook meets empirical viral velocity floor (>=160 WPM).');
    } else if (analysis.hookVelocity.hookWpm >= 135) {
      hookScore = 75;
      feedback.push('Hook has solid conversational pacing.');
    } else {
      hookScore = 40;
      feedback.push('Hook velocity is slow; 3-second drop-off risk elevated.');
    }

    if (analysis.averageWpm >= 140 && analysis.averageWpm <= 185) {
      pacingScore = 90;
      feedback.push('Overall pacing is in the viral retention sweet spot (140-185 WPM).');
    } else if (analysis.averageWpm < 120) {
      pacingScore = 45;
      feedback.push('Overall pacing is slow; consider jump cuts or ripple tightening.');
    } else {
      pacingScore = 70;
    }

    const meetsBenchmark = hookScore >= 70 && pacingScore >= 70;

    return {
      meetsBenchmark,
      hookScore,
      pacingScore,
      retentionScore: analysis.retentionScore,
      feedback,
    };
  }
}
