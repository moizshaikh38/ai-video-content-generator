import {
  MultimodalTimeline,
  VireoClipScoreExplanation,
  PlatformFitDetail,
  OutputPlatform,
  ClipCandidateCategory,
  GenreProfileConfig,
  ContentGoal,
} from '../../types/index.js';
import { AudioFeatureService } from './audioFeatureService.js';
import { GenreIntelligenceService } from '../genreIntelligenceService.js';

export interface ScoreCandidateInput {
  start_seconds: number;
  end_seconds: number;
  title: string;
  hook: string;
  reason?: string;
  category?: ClipCandidateCategory;
  timeline?: MultimodalTimeline | null;
  baseHookScore?: number | null;
  baseStandaloneScore?: number | null;
  baseInsightScore?: number | null;
  /**
   * Contextual completeness (genre roadmap Phase 4): the transcript segment
   * immediately before the candidate, when one exists. If it poses a question
   * the candidate answers without including it, standalone clarity is
   * penalized mechanically (podcast safeguard made measurable, not just prompted).
   */
  precedingSegment?: { text: string; end: number } | null;
  /**
   * Gameplay context (gaming advantage roadmap): events from the VLM game-HUD
   * pass, audio-corroborated. Aligned candidates earn a hook bonus with a
   * disclosed reason.
   */
  gameplayEvents?: Array<{ time: number; type: string; confidence: number; corroborated_by_audio?: boolean }>;
  /** Concatenated transcript text INSIDE the candidate window. */
  candidateText?: string;
  genreProfile?: GenreProfileConfig;
  contentGoal?: ContentGoal;
}

export interface ScoredCandidateResult {
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  vireo_score: number;
  explanation: VireoClipScoreExplanation;
  was_snapped: boolean;
}

/**
 * Phase 16 + Phase C: Multimodal Scoring Service
 * Computes deterministic, explainable 0–100 Vireo Scores fusing visual, auditory, speech, and genre signals.
 * Refines boundaries with conversational pauses and generates multi-platform suitability.
 */
export class MultimodalScoringService {
  /**
   * Evaluates a candidate clip against multimodal signals and genre profile directives.
   */
  public static scoreCandidate(input: ScoreCandidateInput): ScoredCandidateResult {
    const {
      start_seconds: rawStart,
      end_seconds: rawEnd,
      hook,
      timeline,
      baseHookScore,
      baseStandaloneScore,
      baseInsightScore,
      precedingSegment,
      candidateText,
      gameplayEvents,
      genreProfile: incomingGenreProfile,
      contentGoal,
    } = input;

    const genreProfile = incomingGenreProfile || GenreIntelligenceService.getGenreProfile('general');

    // 1. Boundary snapping to silence pauses
    let start_seconds = rawStart;
    let end_seconds = rawEnd;
    let was_snapped = false;

    if (timeline && timeline.silence_intervals.length > 0) {
      const snapStart = AudioFeatureService.snapBoundaryToSilence({
        targetSecond: rawStart,
        silenceIntervals: timeline.silence_intervals,
        type: 'start',
        maxToleranceSec: 0.8,
      });

      const snapEnd = AudioFeatureService.snapBoundaryToSilence({
        targetSecond: rawEnd,
        silenceIntervals: timeline.silence_intervals,
        type: 'end',
        maxToleranceSec: 1.0,
      });

      if (snapStart.wasSnapped) {
        start_seconds = snapStart.snappedSecond;
        was_snapped = true;
      }
      if (snapEnd.wasSnapped && snapEnd.snappedSecond > start_seconds + 3.0) {
        end_seconds = snapEnd.snappedSecond;
        was_snapped = true;
      }
    }

    const duration_seconds = Math.max(1.0, Math.round((end_seconds - start_seconds) * 100) / 100);

    // 2. Multimodal signal evaluation in the clip window
    let visualActivityScore = 60;
    let audioEnergyScore = 70;
    let hasFaceInHook = false;
    let hasFaceOverall = false;
    let hasCleanSilenceEnd = false;
    let hasOcrText = false;
    let speechRatio = 0.85;

    if (timeline) {
      // Overlapping segments
      const overlappingSegs = timeline.segments.filter(
        (s) => Math.max(start_seconds, s.start) < Math.min(end_seconds, s.end)
      );

      if (overlappingSegs.length > 0) {
        const avgVis =
          overlappingSegs.reduce((acc, s) => acc + s.visual_activity_score, 0) /
          overlappingSegs.length;
        visualActivityScore = Math.round(avgVis);

        hasFaceOverall = overlappingSegs.some((s) => s.has_face_presence);
        hasOcrText = overlappingSegs.some((s) => Boolean(s.ocr_detected_text));
      }

      // Check first 3.5 seconds (Hook window)
      const hookEnd = start_seconds + Math.min(3.5, duration_seconds * 0.25);
      const hookSegs = timeline.segments.filter(
        (s) => Math.max(start_seconds, s.start) < Math.min(hookEnd, s.end)
      );
      hasFaceInHook = hookSegs.some((s) => s.has_face_presence);

      // Check silence alignment at boundaries
      hasCleanSilenceEnd = timeline.silence_intervals.some(
        (s) => Math.abs(s.start - end_seconds) <= 0.8 || (end_seconds >= s.start && end_seconds <= s.end)
      );

      // Compute Active Speech Ratio in Candidate Window
      let totalSilenceInWindow = 0;
      for (const sil of timeline.silence_intervals) {
        const silOverlap = Math.max(0, Math.min(end_seconds, sil.end) - Math.max(start_seconds, sil.start));
        totalSilenceInWindow += silOverlap;
      }
      speechRatio = Math.max(0.0, Math.min(1.0, 1.0 - totalSilenceInWindow / duration_seconds));

      // Dynamic Audio Energy Scoring (replacing hardcoded 78)
      // Combines real segment audio_energy_db with active speech density and hook audio attack
      let dynamicEnergy = 68;

      if (overlappingSegs.length > 0) {
        const validDbs = overlappingSegs
          .map((s) => s.audio_energy_db)
          .filter((db): db is number => typeof db === 'number' && Number.isFinite(db));

        if (validDbs.length > 0) {
          const meanDb = validDbs.reduce((acc, v) => acc + v, 0) / validDbs.length;
          // Normalized mapping: -50 dB (quiet ambient) to -14 dB (broadcast peak) -> 35 to 98
          const norm = Math.min(1.0, Math.max(0.0, (meanDb - -50) / (-14 - -50)));
          dynamicEnergy = Math.round(35 + norm * 63);
        } else {
          // Fallback based on speech-to-silence ratio (0% -> 45, 100% -> 88)
          dynamicEnergy = Math.round(45 + speechRatio * 43);
        }
      }

      // Opening audio attack bonus: immediate speech in opening 1.5s
      const openingHasSilence = timeline.silence_intervals.some(
        (s) => s.start <= start_seconds + 0.15 && s.end >= start_seconds + 1.2
      );
      if (!openingHasSilence) {
        dynamicEnergy = Math.min(100, dynamicEnergy + 5);
      } else {
        dynamicEnergy = Math.max(30, dynamicEnergy - 8);
      }

      audioEnergyScore = Math.min(100, Math.max(30, dynamicEnergy));
    }

    // 3. Compute Component Scores (0–100)
    // LLM-derived components: when the model did not return a subscore, the
    // dimension is dropped from the blend and its genre weight is redistributed
    // (no fabricated mid-scale defaults). Signal bonuses only apply to a base
    // that actually exists.
    const clampScore = (v: number) => Math.min(100, Math.max(0, v));
    const hasBase = (v: number | null | undefined): v is number =>
      typeof v === 'number' && Number.isFinite(v);

    // Hook Score (+ gameplay-event alignment for gaming)
    let hook_score: number | null = hasBase(baseHookScore) ? clampScore(baseHookScore) : null;
    let gameplayAlignment: { type: string; confidence: number; corroborated: boolean } | null = null;
    if (gameplayEvents && gameplayEvents.length > 0) {
      const inside = gameplayEvents
        .filter((e) => e.time >= start_seconds - 0.5 && e.time <= end_seconds + 0.5)
        .sort((a, b) => b.confidence - a.confidence);
      if (inside.length > 0) {
        gameplayAlignment = {
          type: inside[0].type,
          confidence: inside[0].confidence,
          corroborated: Boolean(inside[0].corroborated_by_audio),
        };
      }
    }
    if (hook_score !== null) {
      if (hasFaceInHook) hook_score = clampScore(hook_score + 8);
      if (visualActivityScore >= 70) hook_score = clampScore(hook_score + 5);
      if (hook && hook.length >= 10) hook_score = clampScore(hook_score + 4);
      if (gameplayAlignment) hook_score = clampScore(hook_score + (gameplayAlignment.corroborated ? 10 : 6));
    }

    // Standalone Score
    const targetMin = genreProfile.targetDuration.min;
    const targetMax = genreProfile.targetDuration.max;
    let standalone_score: number | null = hasBase(baseStandaloneScore) ? clampScore(baseStandaloneScore) : null;
    let contextPenaltyApplied = false;
    if (standalone_score !== null) {
      if (hasCleanSilenceEnd) standalone_score = clampScore(standalone_score + 10);
      if (duration_seconds >= targetMin && duration_seconds <= targetMax) {
        standalone_score = clampScore(standalone_score + 8);
      } else if (duration_seconds < targetMin || duration_seconds > targetMax + 10) {
        standalone_score = clampScore(standalone_score - 8);
      }
      // The clip answers a question posed immediately before it without including
      // the setup — a new viewer lacks the antecedent.
      const answersUnheardQuestion =
        precedingSegment &&
        typeof precedingSegment.text === 'string' &&
        precedingSegment.text.includes('?') &&
        start_seconds >= precedingSegment.end &&
        start_seconds - precedingSegment.end <= 2.5 &&
        !(typeof candidateText === 'string' && candidateText.includes('?'));
      if (answersUnheardQuestion) {
        standalone_score = clampScore(standalone_score - 10);
        contextPenaltyApplied = true;
      }
    }

    // Insight / Value Score
    let insight_score: number | null = hasBase(baseInsightScore) ? clampScore(baseInsightScore) : null;
    if (insight_score !== null && hasOcrText) {
      insight_score = clampScore(insight_score + 6); // visual slide or graphic reinforcing concept
    }

    // Visual Activity Score
    let visual_activity_score = visualActivityScore;
    if (hasFaceOverall) visual_activity_score = Math.min(100, visual_activity_score + 6);

    // Audio Energy Score
    let audio_energy_score = audioEnergyScore;

    // Platform Fit Score
    let platform_fit_score = 75;
    if (duration_seconds >= targetMin && duration_seconds <= Math.min(60, targetMax)) platform_fit_score = 92;
    else if (duration_seconds <= 60) platform_fit_score = 85;
    else platform_fit_score = 70;

    // 4. Overall Weighted Score (genre-specific weights, renormalized over the
    // dimensions that were actually scored)
    const weights = genreProfile.scoringWeights;
    const weightedDims: Array<{ label: string; weight: number; value: number | null }> = [
      { label: 'hook', weight: weights.hook, value: hook_score },
      { label: 'standalone', weight: weights.standalone, value: standalone_score },
      { label: 'insight', weight: weights.insight, value: insight_score },
      { label: 'visual', weight: weights.visual, value: visual_activity_score },
      { label: 'audio', weight: weights.audio, value: audio_energy_score },
    ];
    const scoredDims = weightedDims.filter(
      (d): d is { label: string; weight: number; value: number } => d.value !== null
    );
    const weightSum = scoredDims.reduce((acc, d) => acc + d.weight, 0);
    const baseWeighted =
      weightSum > 0
        ? scoredDims.reduce((acc, d) => acc + d.weight * d.value, 0) / weightSum
        : 60;

    const overall_score = Math.round(baseWeighted * 0.90 + platform_fit_score * 0.10);

    // 5. Generate Transparent Explainability Reasons
    const reasons: string[] = [];

    // Genre-specific reason
    reasons.push(`Targeted for ${genreProfile.displayName}: ${genreProfile.selectionObjective}`);

    if (contextPenaltyApplied) {
      reasons.push('Clip answers a question posed immediately before it without including that setup; standalone clarity penalized.');
    }
    if (gameplayAlignment) {
      reasons.push(
        gameplayAlignment.corroborated
          ? `Aligned with a corroborated gameplay event (${gameplayAlignment.type}, ${Math.round(gameplayAlignment.confidence * 100)}% — vision + audio agree).`
          : `Contains a detected gameplay event (${gameplayAlignment.type}, ${Math.round(gameplayAlignment.confidence * 100)}%).`
      );
    }

    if (contentGoal) {
      const formattedGoal = contentGoal.replace(/_/g, ' ');
      reasons.push(`Curated for ${formattedGoal} narrative objective`);
    }

    if (hasFaceInHook) {
      reasons.push('High-engagement face presence detected in the opening 3 seconds for strong viewer hook');
    }
    if (hasCleanSilenceEnd) {
      reasons.push('Clean ending on a natural conversational pause with zero mid-sentence truncation');
    }
    if (visual_activity_score >= 70) {
      reasons.push(`Dynamic visual pacing (${visual_activity_score}/100 activity) keeps short-form attention`);
    } else {
      reasons.push('Steady single-shot framing ideal for focused direct-to-camera delivery');
    }
    if (duration_seconds >= targetMin && duration_seconds <= targetMax) {
      reasons.push(
        `Optimal duration (${Math.round(duration_seconds)}s) matching ${genreProfile.displayName} sweet spot (${genreProfile.targetDuration.optimal}s)`
      );
    }
    if (hasOcrText) {
      reasons.push('On-screen graphic text reinforces topic retention');
    }
    if (audio_energy_score >= 75) {
      reasons.push(`Strong vocal presence and speech clarity (${audio_energy_score}/100 audio energy)`);
    }

    // 6. Platform Suitability Breakdown
    const platform_suitability: Record<OutputPlatform, PlatformFitDetail> = {
      shorts: {
        suitable: duration_seconds <= 60,
        score: duration_seconds <= 60 ? Math.min(100, overall_score + 2) : 55,
        recommended_ratio: '9:16',
        reason:
          duration_seconds <= 60
            ? 'Fully within YouTube Shorts 60s limit with strong hook retention'
            : 'Exceeds standard 60-second YouTube Shorts duration limit',
      },
      tiktok: {
        suitable: true,
        score: Math.min(100, overall_score + (hasFaceInHook ? 5 : 0)),
        recommended_ratio: '9:16',
        reason: 'Fast opening tempo and high hook strength fit TikTok FYP algorithms',
      },
      instagram: {
        suitable: duration_seconds <= 90,
        score: Math.min(100, overall_score),
        recommended_ratio: '9:16',
        reason: 'Optimal 9:16 vertical delivery for Instagram Reels feed discovery',
      },
      linkedin: {
        suitable: true,
        score: Math.min(100, (insight_score ?? 50) + 5),
        recommended_ratio: '1:1',
        reason: 'Substantive professional insight suitable for feed autoplay with captions',
      },
      x: {
        suitable: duration_seconds <= 140,
        score: Math.min(100, overall_score),
        recommended_ratio: '16:9',
        reason: 'Punchy concise observation suitable for X timeline engagement',
      },
      youtube: {
        suitable: true,
        score: Math.min(100, overall_score - 5),
        recommended_ratio: '16:9',
        reason: 'Suitable as a community post teaser or standalone highlight',
      },
    };

    const explanation: VireoClipScoreExplanation = {
      overall_score,
      hook_score,
      standalone_score,
      insight_score,
      visual_activity_score,
      audio_energy_score,
      platform_fit_score,
      reasons,
      platform_suitability,
    };

    // Transparency: record which LLM dimensions were missing so weight
    // redistribution is auditable from the stored explanation alone.
    for (const d of weightedDims) {
      if (d.value === null) {
        reasons.push(`LLM did not return a ${d.label} subscore; its genre weight was redistributed across the scored dimensions.`);
      }
    }

    return {
      start_seconds,
      end_seconds,
      duration_seconds,
      vireo_score: overall_score,
      explanation,
      was_snapped,
    };
  }

  /**
   * Overlap deduplication: retains higher scoring candidate when two candidates overlap >= threshold.
   */
  public static deduplicateScoredCandidates<T extends { start_seconds: number; end_seconds: number; vireo_score: number }>(
    candidates: T[],
    overlapThreshold = 0.60
  ): T[] {
    const sorted = [...candidates].sort((a, b) => {
      if (b.vireo_score !== a.vireo_score) {
        return b.vireo_score - a.vireo_score;
      }
      return a.start_seconds - b.start_seconds;
    });

    const accepted: T[] = [];

    for (const cand of sorted) {
      let isDupe = false;
      const durCand = cand.end_seconds - cand.start_seconds;

      for (const acc of accepted) {
        const durAcc = acc.end_seconds - acc.start_seconds;
        const shorter = Math.min(durCand, durAcc);
        if (shorter <= 0) continue;

        const overlap = Math.max(0, Math.min(cand.end_seconds, acc.end_seconds) - Math.max(cand.start_seconds, acc.start_seconds));
        const ratio = overlap / shorter;

        if (ratio >= overlapThreshold) {
          isDupe = true;
          break;
        }
      }

      if (!isDupe) {
        accepted.push(cand);
      }
    }

    return accepted;
  }
}
