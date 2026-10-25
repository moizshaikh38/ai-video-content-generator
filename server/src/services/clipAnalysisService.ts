import { replaceSuggestedCandidates } from '../db/repositories/clipCandidateRepository.js';
import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { defaultAiProvider, AIProviderClient } from './aiProviderClient.js';
import { ClipPromptService } from './clipPromptService.js';
import {
  ClipCandidate,
  ClipCandidateCategory,
  ClipCandidateStatus,
  ColdOpenConfig,
  AIClipCandidate,
  AIClipAnalysisResponse,
  TranscriptSegment,
  TranscriptWord,
  CreatorProfileData,
  ClipPreferences,
  ContentGenre,
  ContentGoal,
  GenreProfileConfig,
} from '../types/index.js';
import { GenreIntelligenceService } from './genreIntelligenceService.js';
import {
  snapClipToWordBoundaries,
  calculateAdaptiveClipCount,
  deduplicateCandidatesByOverlap,
} from '../utils/wordSnappingUtils.js';
import { selectDiverseCandidates } from '../utils/diverseSelection.js';
import { deduplicateSemantically } from '../utils/semanticDedup.js';
import { tryIncludeQuestion, isQaCriticalGenre } from '../utils/questionInclusion.js';

// In-memory set to prevent multiple simultaneous analysis runs for the same project
export const activeClipAnalysisSet = new Set<string>();

export interface AnalyzeClipsOptions {
  projectId: string;
  userId: string;
  customNotes?: string;
  preferences?: Partial<ClipPreferences>;
  clipPreferences?: Partial<ClipPreferences>;
}

export interface RefineWordBoundariesParams {
  start_seconds: number;
  end_seconds: number;
  words?: TranscriptWord[] | null;
  maxAdjustmentMs?: number;
  sourceDuration?: number | null;
  minDurationLimit?: number;
  maxDurationLimit?: number;
  preRollMs?: number;
  postRollMs?: number;
}

export interface RefineWordBoundariesResult {
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  was_snapped: boolean;
  snapped_start: boolean;
  snapped_end: boolean;
  matched_start_word?: string;
  matched_end_word?: string;
}

export class ClipAnalysisService {
  private aiProvider: AIProviderClient;

  constructor(aiProvider: AIProviderClient = defaultAiProvider) {
    this.aiProvider = aiProvider;
  }

  /**
   * Calculates duration score component (0–100) based on short-form sweet spots:
   * 20s–60s: 100 (Optimal short-form length)
   * 15s–20s: 80 (Slightly rushed)
   * 60s–75s: 80 (Slightly long)
   * 75s–90s: 60 (Pushes upper limit of short-form attention)
   */
  public static calculateDurationScore(durationSeconds: number): number {
    if (durationSeconds >= 20 && durationSeconds <= 60) {
      return 100;
    }
    if (durationSeconds >= 15 && durationSeconds < 20) {
      return 80;
    }
    if (durationSeconds > 60 && durationSeconds <= 75) {
      return 80;
    }
    if (durationSeconds > 75 && durationSeconds <= 90) {
      return 60;
    }
    return 40;
  }

  /**
   * Phase 1 & 4: Word-Boundary Refinement & Acoustic Edge Smoothing
   * Snaps candidate clip start and end timestamps to spoken-word boundaries
   * using millisecond-accurate Whisper word timestamps.
   *
   * Core Rules:
   * 1. Preserves complete words: Never moves start forward past word start if start lands inside a word.
   * 2. Preserves complete words: Never moves end backward past word end if end lands inside a word.
   * 3. For boundaries in pause/silence gaps, applies a maximum adjustment of maxAdjustmentMs (default 150ms).
   * 4. Acoustic Pre-Roll & Post-Roll Padding: Adds natural decay padding (default 70ms pre-roll, 150ms post-roll)
   *    without ever crossing into adjacent words or source video bounds.
   * 5. Sentence-Terminal Refinement: If clip ends mid-clause, looks ahead up to +1.5s for terminal punctuation (. ! ?).
   * 6. Minor Duration Overflow Recovery: Steps back end boundary by words instead of discarding word snaps.
   * 7. Safe against missing, empty, malformed, out-of-order, or invalid timestamps.
   */
  public static refineWordBoundaries(
    params: RefineWordBoundariesParams
  ): RefineWordBoundariesResult {
    const {
      start_seconds,
      end_seconds,
      words,
      maxAdjustmentMs = 150,
      sourceDuration,
      minDurationLimit,
      maxDurationLimit,
      preRollMs = 70,
      postRollMs = 150,
    } = params;

    const fallbackDuration = Number(Math.max(0, end_seconds - start_seconds).toFixed(3));
    const fallbackResult: RefineWordBoundariesResult = {
      start_seconds: Number(start_seconds.toFixed(3)),
      end_seconds: Number(end_seconds.toFixed(3)),
      duration_seconds: fallbackDuration,
      was_snapped: false,
      snapped_start: false,
      snapped_end: false,
    };

    if (
      !Number.isFinite(start_seconds) ||
      !Number.isFinite(end_seconds) ||
      start_seconds < 0 ||
      start_seconds >= end_seconds
    ) {
      return fallbackResult;
    }

    if (!Array.isArray(words) || words.length === 0) {
      return fallbackResult;
    }

    // Filter, validate, and sort words ascending
    const validWords: TranscriptWord[] = words
      .filter(
        (w) =>
          Boolean(w) &&
          typeof (w.word ?? (w as any).text) === 'string' &&
          String(w.word ?? (w as any).text).trim().length > 0 &&
          typeof w.start === 'number' &&
          typeof w.end === 'number' &&
          Number.isFinite(w.start) &&
          Number.isFinite(w.end) &&
          w.start >= 0
      )
      .map((w) => {
        const start = Number(w.start);
        const rawEnd = Number(w.end);
        const end = rawEnd >= start ? rawEnd : start;
        return {
          word: String(w.word ?? (w as any).text).trim(),
          start,
          end,
        };
      })
      .sort((a, b) => a.start - b.start);

    if (validWords.length === 0) {
      return fallbackResult;
    }

    const maxAdjustmentSec = Math.max(0, maxAdjustmentMs) / 1000;
    let refinedStart = start_seconds;
    let refinedEnd = end_seconds;
    let snapped_start = false;
    let snapped_end = false;
    let matched_start_word: string | undefined;
    let matched_end_word: string | undefined;

    // ── Refine Start Boundary ───────────────────────────────────────
    // Check if start_seconds falls INSIDE a word (W.start < start < W.end)
    const insideStartWord = validWords.find(
      (w) => start_seconds > w.start && start_seconds < w.end
    );

    let startWord: TranscriptWord | undefined;
    if (insideStartWord) {
      // Rule: Never truncate the beginning of a word. Whole word takes priority over 150ms limit.
      startWord = insideStartWord;
      snapped_start = true;
      matched_start_word = insideStartWord.word.trim();
    } else {
      // Boundary is in silence or at an exact boundary.
      // Find the upcoming word that starts after (or at) start_seconds
      const nextWord = validWords.find((w) => w.start >= start_seconds);
      if (nextWord) {
        const dist = nextWord.start - start_seconds;
        if (dist > 0 && dist <= maxAdjustmentSec) {
          startWord = nextWord;
          snapped_start = true;
          matched_start_word = nextWord.word.trim();
        }
      }
    }

    if (startWord) {
      const targetStart = startWord.start;
      // Natural Acoustic Pre-Roll Padding: add up to preRollMs ensuring it never crosses into previous word's end
      const preRollSec = Math.max(0, preRollMs) / 1000;
      if (preRollSec > 0) {
        const prevWord = [...validWords].reverse().find((w) => w.end <= startWord!.start);
        const prevWordEnd = prevWord ? prevWord.end : 0;
        refinedStart = Math.max(0, prevWordEnd, targetStart - preRollSec);
      } else {
        refinedStart = Math.max(0, targetStart);
      }
    }

    // ── Refine End Boundary ─────────────────────────────────────────
    // Check if end_seconds falls INSIDE a word (W.start < end < W.end)
    const insideEndWord = validWords.find(
      (w) => end_seconds > w.start && end_seconds < w.end
    );

    let endWord: TranscriptWord | undefined;
    if (insideEndWord) {
      // Rule: Never truncate the end of a word. Whole word takes priority over 150ms limit.
      endWord = insideEndWord;
      snapped_end = true;
      matched_end_word = insideEndWord.word.trim();
    } else {
      // Boundary is in silence or at an exact boundary.
      // Find the preceding word that ended before (or at) end_seconds
      const prevWord = [...validWords].reverse().find((w) => w.end <= end_seconds);
      if (prevWord) {
        const dist = end_seconds - prevWord.end;
        if (dist > 0 && dist <= maxAdjustmentSec) {
          endWord = prevWord;
          snapped_end = true;
          matched_end_word = prevWord.word.trim();
        }
      }
    }

    if (endWord) {
      let targetEnd = endWord.end;

      // Sentence-Terminal Punctuation Refinement:
      // If matched end word does not end with terminal punctuation (. ! ?), look ahead up to +1.5s
      // within maxDurationLimit for a nearby sentence-ending word
      if (matched_end_word && !/[.!?]["']?$/.test(matched_end_word)) {
        const maxLimit = maxDurationLimit ?? 90.0;
        const sentenceEnder = validWords.find(
          (w) =>
            w.start >= targetEnd &&
            w.start <= targetEnd + 1.5 &&
            (w.end - refinedStart) <= maxLimit &&
            /[.!?]["']?$/.test(w.word.trim())
        );
        if (sentenceEnder) {
          endWord = sentenceEnder;
          matched_end_word = sentenceEnder.word.trim();
          targetEnd = sentenceEnder.end;
        }
      }

      // Natural Acoustic Post-Roll Padding: add up to postRollMs ensuring it never crosses into next word's start
      const postRollSec = Math.max(0, postRollMs) / 1000;
      if (postRollSec > 0) {
        const nextWord = validWords.find((w) => w.start >= targetEnd);
        const nextWordStart = nextWord
          ? nextWord.start
          : (typeof sourceDuration === 'number' && sourceDuration > 0 ? sourceDuration : Infinity);
        refinedEnd = Math.min(
          typeof sourceDuration === 'number' && sourceDuration > 0 ? sourceDuration : Infinity,
          nextWordStart,
          targetEnd + postRollSec
        );
      } else {
        refinedEnd = targetEnd;
      }
    }

    // Clamp to source video bounds if available
    refinedStart = Math.max(0, refinedStart);
    if (typeof sourceDuration === 'number' && sourceDuration > 0) {
      refinedEnd = Math.min(sourceDuration, refinedEnd);
      refinedStart = Math.min(sourceDuration, refinedStart);
    }

    // Safety: ensure start < end
    if (refinedStart >= refinedEnd) {
      return fallbackResult;
    }

    let duration = Number((refinedEnd - refinedStart).toFixed(3));

    // Prevent refineWordBoundaries from discarding valid word snaps on minor duration overflow:
    // If duration > maxDurationLimit, step the end boundary back by 1–2 words to stay under maxDurationLimit
    if (maxDurationLimit !== undefined && duration > maxDurationLimit) {
      const postRollSec = Math.max(0, postRollMs) / 1000;
      const effectiveMinDur = minDurationLimit ?? 15.0;
      const candidateEndWords = validWords.filter(
        (w) =>
          w.end <= refinedStart + maxDurationLimit &&
          w.end >= refinedStart + effectiveMinDur &&
          (end_seconds - w.end) <= 5.0
      );

      if (candidateEndWords.length > 0) {
        const steppedWord = candidateEndWords[candidateEndWords.length - 1];
        const nextW = validWords.find((w) => w.start >= steppedWord.end);
        const nextWStart = nextW ? nextW.start : refinedStart + maxDurationLimit;
        refinedEnd = Math.min(refinedStart + maxDurationLimit, nextWStart, steppedWord.end + postRollSec);
        matched_end_word = steppedWord.word.trim();
        snapped_end = true;
        duration = Number((refinedEnd - refinedStart).toFixed(3));
      } else {
        return fallbackResult;
      }
    }

    // Enforce minDurationLimit
    if (minDurationLimit !== undefined && duration < minDurationLimit) {
      return fallbackResult;
    }

    const was_snapped = snapped_start || snapped_end;

    return {
      start_seconds: Number(refinedStart.toFixed(3)),
      end_seconds: Number(refinedEnd.toFixed(3)),
      duration_seconds: duration,
      was_snapped,
      snapped_start,
      snapped_end,
      matched_start_word,
      matched_end_word,
    };
  }

  /**
   * LEGACY / TEST-ONLY scoring helper. This is NOT the live ranking score:
   * production candidates are ranked by the genre-weighted `vireo_score`
   * computed in MultimodalScoringService.scoreCandidate. Kept because existing
   * test suites pin its behavior; do not wire it into new product paths.
   */
  public static computeHybridScore(ai: AIClipCandidate, durationSeconds: number): number {
    const clamp = (val: number) => Math.min(100, Math.max(0, Number(val) || 0));

    const hook = clamp(ai.hook_score ?? 0);
    const standalone = clamp(ai.standalone_score ?? 0);
    const insight = clamp(ai.insight_score ?? 0);
    const emotion = clamp(ai.emotion_score ?? 0);
    const platform = clamp(ai.platform_score ?? 0);
    const duration = this.calculateDurationScore(durationSeconds);

    const weighted =
      hook * 0.25 +
      standalone * 0.20 +
      insight * 0.20 +
      emotion * 0.15 +
      platform * 0.10 +
      duration * 0.10;

    return Math.min(100, Math.max(0, Math.round(weighted)));
  }

  /**
   * Calculates overlap ratio between two time intervals relative to the shorter duration.
   * Returns a value between 0.0 and 1.0.
   */
  public static calculateOverlapRatio(
    startA: number,
    endA: number,
    startB: number,
    endB: number
  ): number {
    const durA = endA - startA;
    const durB = endB - startB;
    const shorter = Math.min(durA, durB);

    if (shorter <= 0) return 0;

    const overlap = Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
    return overlap / shorter;
  }

  /**
   * Dynamically calculates target candidate clip counts based on source video length (from OpenShorts).
   * Prevents sparse 1-clip outputs on 2-hour podcasts or hallucinated 20-clip outputs on 5-minute videos.
   */
  public static calculateDynamicClipTargets(durationSeconds: number): { minClips: number; targetClips: number; maxClips: number } {
    const durationMinutes = Math.max(0.5, (Number(durationSeconds) || 0) / 60);

    if (durationMinutes <= 5) {
      return { minClips: 1, targetClips: 2, maxClips: 3 };
    } else if (durationMinutes <= 15) {
      return { minClips: 2, targetClips: 4, maxClips: 6 };
    } else if (durationMinutes <= 30) {
      return { minClips: 3, targetClips: 6, maxClips: 8 };
    } else if (durationMinutes <= 60) {
      return { minClips: 4, targetClips: 8, maxClips: 12 };
    } else {
      // 1+ hour long videos (podcasts, streams, conferences)
      const target = Math.min(16, Math.max(6, Math.round(durationMinutes / 7)));
      return {
        minClips: Math.max(4, target - 3),
        targetClips: target,
        maxClips: Math.min(20, target + 4),
      };
    }
  }

  /**
   * Deduplicates candidates by removing lower-scoring candidates that overlap (>= 25%)
   * with a higher-scoring candidate (OpenShorts golden threshold).
   */
  public static deduplicateCandidates<T extends { start_seconds: number; end_seconds: number; engagement_score: number }>(
    candidates: T[],
    overlapThreshold = 0.25
  ): T[] {
    // Sort descending by score; if tied, sort earlier start time first
    const sorted = [...candidates].sort((a, b) => {
      if (b.engagement_score !== a.engagement_score) {
        return b.engagement_score - a.engagement_score;
      }
      return a.start_seconds - b.start_seconds;
    });

    const accepted: T[] = [];

    for (const cand of sorted) {
      let isDuplicate = false;
      for (const acc of accepted) {
        const ratio = this.calculateOverlapRatio(
          cand.start_seconds,
          cand.end_seconds,
          acc.start_seconds,
          acc.end_seconds
        );
        if (ratio >= overlapThreshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        accepted.push(cand);
      }
    }

    return accepted;
  }

  /**
   * Auto-Relaxation Filter (AutoClip zero-clip mitigation pattern):
   * If filtering by minimum viral score threshold produces fewer clips than minExpected,
   * gracefully relaxes the threshold in steps so the user is never left with an empty project error.
   */
  public static filterWithAutoRelaxation<T extends { engagement_score: number }>(
    candidates: T[],
    initialThreshold = 75,
    minExpected = 2
  ): { filtered: T[]; effectiveThreshold: number; wasRelaxed: boolean } {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { filtered: [], effectiveThreshold: initialThreshold, wasRelaxed: false };
    }

    const steps = [initialThreshold, 65, 55, 45, 0];

    for (let i = 0; i < steps.length; i++) {
      const thresh = steps[i];
      const passing = candidates.filter((c) => (c.engagement_score || 0) >= thresh);
      if (passing.length >= minExpected || thresh === 0) {
        return {
          filtered: passing.length > 0 ? passing : candidates.slice(0, minExpected),
          effectiveThreshold: thresh,
          wasRelaxed: thresh < initialThreshold,
        };
      }
    }

    return { filtered: candidates, effectiveThreshold: 0, wasRelaxed: true };
  }

  /**
   * Parses and validates raw JSON or parsed object from LLM response
   */
  public static parseAIResponse(rawTextOrObj: string | any): AIClipCandidate[] {
    if (!rawTextOrObj) {
      throw new Error('AI returned an empty response.');
    }

    let parsed: any;
    if (typeof rawTextOrObj === 'string') {
      let cleaned = rawTextOrObj.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      }
      try {
        parsed = JSON.parse(cleaned);
      } catch (err: any) {
        throw new Error(`Failed to parse AI clip analysis JSON: ${err.message}`);
      }
    } else {
      parsed = rawTextOrObj;
    }

    const clipsArray = Array.isArray(parsed) ? parsed : parsed?.clips;
    if (!Array.isArray(clipsArray)) {
      throw new Error('AI response does not contain a "clips" array.');
    }

    const validCategories: Set<ClipCandidateCategory> = new Set([
      'educational',
      'story',
      'controversial',
      'insight',
      'emotional',
      'entertaining',
      'tutorial',
      'general',
    ]);

    const candidates: AIClipCandidate[] = [];

    for (const item of clipsArray) {
      if (typeof item !== 'object' || item === null) continue;

      const startIndex = Number(item.start_segment_index);
      const endIndex = Number(item.end_segment_index);

      if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) continue;
      if (startIndex < 0 || endIndex < startIndex) continue;

      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const hook = typeof item.hook === 'string' ? item.hook.trim() : '';
      const reason = typeof item.reason === 'string' ? item.reason.trim() : '';

      if (!title || !hook) continue;

      const rawCat = typeof item.category === 'string' ? item.category.toLowerCase().trim() : 'general';
      const category: ClipCandidateCategory = validCategories.has(rawCat as any)
        ? (rawCat as ClipCandidateCategory)
        : 'general';

      const rawColdOpen = item.cold_open_segment_index !== undefined && item.cold_open_segment_index !== null
        ? Number(item.cold_open_segment_index)
        : null;
      const cold_open_segment_index = Number.isInteger(rawColdOpen) && (rawColdOpen as number) >= 0 ? rawColdOpen : null;

      const parseSubscore = (v: unknown): number | undefined => {
        const n = typeof v === 'string' ? Number(v) : v;
        return typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined;
      };

      candidates.push({
        start_segment_index: startIndex,
        end_segment_index: endIndex,
        cold_open_segment_index,
        title,
        hook,
        reason,
        category,
        hook_score: parseSubscore(item.hook_score),
        standalone_score: parseSubscore(item.standalone_score),
        insight_score: parseSubscore(item.insight_score),
        emotion_score: parseSubscore(item.emotion_score),
        platform_score: parseSubscore(item.platform_score),
      });
    }

    return candidates;
  }

  /**
   * Main pipeline method: analyzes transcript, derives timestamps, dedupes, and persists clip candidates
   */
  public async analyzeAndPersistClips(options: AnalyzeClipsOptions): Promise<ClipCandidate[]> {
    const { projectId, userId, customNotes } = options;

    if (activeClipAnalysisSet.has(projectId)) {
      const err: any = new Error('Clip analysis is already in progress for this project.');
      err.code = 'CLIP_ANALYSIS_ACTIVE';
      throw err;
    }

    activeClipAnalysisSet.add(projectId);

    return await ownerContext.run(userId, async () => {
      try {
        // 1. Verify project exists and belongs to user
      const { data: project, error: projErr } = await dataRepository
        .from('projects')
        .select('id, user_id, title, notes, clip_preferences')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (projErr) {
        throw new Error(`Failed to load project: ${projErr.message}`);
      }
      if (!project) {
        const notFound: any = new Error('Project not found or access denied.');
        notFound.code = 'PROJECT_NOT_FOUND';
        throw notFound;
      }

      // 2. Fetch transcript and ensure timestamped segments exist
      const { data: transcript, error: transErr } = await dataRepository
        .from('transcripts')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (transErr) {
        throw new Error(`Failed to load transcript: ${transErr.message}`);
      }
      if (!transcript || !transcript.transcript_text) {
        const transNotFound: any = new Error('Transcript not found for this project.');
        transNotFound.code = 'TRANSCRIPT_NOT_FOUND';
        throw transNotFound;
      }

      const rawSegments = transcript.segments;
      if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
        const noSegments: any = new Error('Transcript contains no timestamped segments. Cannot find clips without segment boundaries.');
        noSegments.code = 'CLIP_SEGMENTS_UNAVAILABLE';
        throw noSegments;
      }

      const segments: TranscriptSegment[] = rawSegments.map((s: any) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: String(s.text || ''),
      }));

      // Extract word timestamps if available (from transcript.words or nested in segments)
      const rawWords: TranscriptWord[] =
        Array.isArray(transcript.words) && transcript.words.length > 0
          ? transcript.words
          : Array.isArray(rawSegments)
          ? rawSegments.flatMap((s: any) => (Array.isArray(s?.words) ? s.words : []))
          : [];

      // 3. Fetch optional creator profile for persona guidance and optional multimodal timeline
      let creatorProfile: CreatorProfileData | null = null;
      try {
        const { data: cpData } = await dataRepository
          .from('creator_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (cpData) {
          creatorProfile = cpData as CreatorProfileData;
        }
      } catch (cpErr: any) {
        logger.warn(`Could not load creator profile for clip analysis: ${cpErr.message}`);
      }

      let multimodalTimeline: any = null;
      try {
        const { MultimodalTimelineService } = await import('./multimodal/multimodalTimelineService.js');
        const mmAnalysis = await MultimodalTimelineService.getAnalysis(projectId, userId);
        if (mmAnalysis?.timeline) {
          multimodalTimeline = mmAnalysis.timeline;
        }
      } catch (mmErr: any) {
        logger.info(`No prior multimodal timeline for project ${projectId}: ${mmErr.message}`);
      }

      // Gaming advantage: VLM game events (HUD reads + audio-corroborated
      // reaction spikes) when stored; absent events change nothing.
      let gameplayEvents: Array<{ time: number; type: string; confidence: number; corroborated_by_audio?: boolean }> = [];
      try {
        const { GameEventService } = await import('./gameEventService.js');
        const gameAnalysis = await GameEventService.getEvents(projectId);
        if (gameAnalysis?.events?.length) {
          gameplayEvents = gameAnalysis.events;
        }
      } catch {
        // Optional enrichment — never blocks analysis.
      }

      // 4. Resolve Genre Intelligence & Clip Preferences
      const fullTranscriptText = transcript.transcript_text || segments.map((s) => s.text).join(' ');
      const totalWords = fullTranscriptText.split(/\s+/).filter(Boolean).length;
      const durationMinutes = Math.max(
        0.1,
        (transcript.duration_seconds || (segments[segments.length - 1].end - segments[0].start)) / 60
      );
      const wpm = totalWords / durationMinutes;

      let ocrDensityPerMin = 0;
      let faceCount = 1;
      let sceneCutRatePerMin = 3.5;
      let silenceRatio = 0.12;
      // Real audio/visual signals for the local genre classifier (genre audit F4).
      // Laughter and screen-share detectors do not exist yet — those classifier
      // inputs stay unset rather than fabricated.
      let audioPeakEnergyDb: number | undefined = undefined;
      let visualMotionScore: number | undefined = undefined;

      if (multimodalTimeline) {
        if (Array.isArray(multimodalTimeline.keyframes)) {
          const ocrKeyframes = multimodalTimeline.keyframes.filter(
            (k: any) => typeof k.ocr_text === 'string' && k.ocr_text.trim().length > 0
          );
          ocrDensityPerMin = ocrKeyframes.length / durationMinutes;
        }
        if (Array.isArray(multimodalTimeline.scene_cuts)) {
          sceneCutRatePerMin = multimodalTimeline.scene_cuts.length / durationMinutes;
        }
        if (Array.isArray(multimodalTimeline.silence_intervals)) {
          const totalSilenceSec = multimodalTimeline.silence_intervals.reduce(
            (acc: number, s: any) => acc + (s.end - s.start),
            0
          );
          silenceRatio = totalSilenceSec / (durationMinutes * 60);
        }
        if (typeof multimodalTimeline.summary_metadata?.detected_face_count === 'number') {
          faceCount = multimodalTimeline.summary_metadata.detected_face_count;
        }
        if (Array.isArray(multimodalTimeline.segments)) {
          const dbValues = multimodalTimeline.segments
            .map((s: any) => s.audio_energy_db)
            .filter((db: any) => typeof db === 'number' && Number.isFinite(db));
          if (dbValues.length > 0) {
            audioPeakEnergyDb = Math.max(...dbValues);
          }
        }
        if (typeof multimodalTimeline.summary_metadata?.average_visual_activity === 'number') {
          visualMotionScore = Math.round(multimodalTimeline.summary_metadata.average_visual_activity);
        }
      }

      const questionCount = (fullTranscriptText.match(/\?/g) || []).length;
      const questionDensityPerMin = questionCount / durationMinutes;

      const localSuggestion = GenreIntelligenceService.classifyVideoGenreLocally({
        wpm,
        ocrDensityPerMin,
        faceCount,
        sceneCutRatePerMin,
        silenceRatio,
        transcriptText: fullTranscriptText,
        questionDensityPerMin,
        durationSeconds: transcript.duration_seconds || durationMinutes * 60,
        audioPeakEnergyDb,
        visualMotionScore,
      });

      const rawIncomingPrefs = options.preferences || project.clip_preferences;
      const normalizedPrefs = GenreIntelligenceService.normalizePreferences(
        rawIncomingPrefs || undefined,
        customNotes || project.notes
      );

      if (normalizedPrefs.genreSelectionMode === 'auto' || normalizedPrefs.genreSelectionMode === 'suggested') {
        if (!rawIncomingPrefs?.genre || normalizedPrefs.genre === 'general') {
          normalizedPrefs.genre = localSuggestion.genre;
        }
        normalizedPrefs.suggestedGenre = localSuggestion.genre;
        normalizedPrefs.genreConfidence = localSuggestion.confidence;
      }

      const effectiveConfig = GenreIntelligenceService.resolveEffectiveConfig({
        userPreferences: normalizedPrefs,
        creatorProfile,
      });

      const genreProfile = effectiveConfig.genreProfile;
      const contentGoal = effectiveConfig.contentGoal;

      // 5. Construct prompt and call LLM (using sliding-window chunks for long transcripts)
      const isLongTranscript =
        segments.length > 350 ||
        (typeof transcript.duration_seconds === 'number' && transcript.duration_seconds > 1500);

      let aiCandidates: AIClipCandidate[] = [];

      if (isLongTranscript) {
        logger.info(
          `Transcript for project ${projectId} is long (${segments.length} segments, ~${Math.round(transcript.duration_seconds || 0)}s). Running sliding-window chunked analysis...`
        );

        // Build 20-minute windows (1200s) with 3-minute overlap (180s)
        const TARGET_WINDOW_SEC = 1200;
        const OVERLAP_SEC = 180;

        const chunks: Array<{
          startIndex: number;
          endIndex: number;
          segments: TranscriptSegment[];
          durationSeconds: number;
        }> = [];

        let currentStart = 0;
        while (currentStart < segments.length) {
          const startTime = segments[currentStart].start;
          let currentEnd = currentStart;

          while (
            currentEnd < segments.length - 1 &&
            segments[currentEnd].end - startTime < TARGET_WINDOW_SEC
          ) {
            currentEnd++;
          }

          const chunkSegs = segments.slice(currentStart, currentEnd + 1);
          const chunkDur = chunkSegs[chunkSegs.length - 1].end - chunkSegs[0].start;

          chunks.push({
            startIndex: currentStart,
            endIndex: currentEnd,
            segments: chunkSegs,
            durationSeconds: chunkDur,
          });

          if (currentEnd >= segments.length - 1) {
            break;
          }

          // Advance currentStart so next window starts ~OVERLAP_SEC before currentEnd
          const endTime = segments[currentEnd].end;
          let nextStart = currentEnd;
          while (
            nextStart > currentStart &&
            endTime - segments[nextStart].start < OVERLAP_SEC
          ) {
            nextStart--;
          }

          if (nextStart <= currentStart) {
            nextStart = currentStart + Math.max(1, Math.floor(chunkSegs.length * 0.7));
          }
          currentStart = nextStart;
        }

        logger.info(
          `Divided project ${projectId} into ${chunks.length} sliding windows. Running LLM analysis with bounded concurrency of 2...`
        );

        const concurrency = config.analysisConcurrency;
        const systemPrompt = ClipPromptService.getSystemPrompt(genreProfile);

        for (let i = 0; i < chunks.length; i += concurrency) {
          const batch = chunks.slice(i, i + concurrency);
          const batchResults = await Promise.all(
            batch.map(async (chunk, batchIdx) => {
              const chunkNum = i + batchIdx + 1;
              logger.info(
                `Analyzing chunk ${chunkNum}/${chunks.length} (segments [${chunk.startIndex}..${chunk.endIndex}], duration ~${Math.round(chunk.durationSeconds)}s)...`
              );
              const userPrompt = ClipPromptService.buildClipAnalysisPrompt({
                segments: chunk.segments,
                durationSeconds: chunk.durationSeconds,
                creatorProfile,
                customNotes: customNotes || project.notes,
                multimodalTimeline,
                startIndexOffset: chunk.startIndex,
                genreProfile,
                contentGoal,
                customInstructions: normalizedPrefs.customInstructions,
                topicKeywords: normalizedPrefs.topicKeywords,
              });

              try {
                const aiResponse = await this.aiProvider.generateJsonCompletion<AIClipAnalysisResponse>({
                  systemPrompt,
                  userPrompt,
                  temperature: 0.4,
                  maxTokens: 3000,
                  responseFormat: 'json_object',
                });
                const parsed = ClipAnalysisService.parseAIResponse(aiResponse);

                // Map any relative indices to global indices
                return parsed.map((cand) => {
                  let sIdx = cand.start_segment_index;
                  let eIdx = cand.end_segment_index;
                  if (sIdx < chunk.startIndex && sIdx + chunk.startIndex < segments.length) {
                    sIdx += chunk.startIndex;
                    eIdx += chunk.startIndex;
                  }
                  return {
                    ...cand,
                    start_segment_index: sIdx,
                    end_segment_index: eIdx,
                  };
                });
              } catch (err: any) {
                logger.warn(`Failed AI analysis for chunk ${chunkNum}/${chunks.length}: ${err.message}`);
                return [];
              }
            })
          );

          for (const res of batchResults) {
            aiCandidates.push(...res);
          }
        }
      } else {
        // Standard single-window analysis
        logger.info(`Starting AI clip analysis for project ${projectId} (${segments.length} segments, genre: ${genreProfile.displayName})...`);
        const userPrompt = ClipPromptService.buildClipAnalysisPrompt({
          segments,
          durationSeconds: transcript.duration_seconds,
          creatorProfile,
          customNotes: customNotes || project.notes,
          multimodalTimeline,
          genreProfile,
          contentGoal,
          customInstructions: normalizedPrefs.customInstructions,
          topicKeywords: normalizedPrefs.topicKeywords,
        });

        const systemPrompt = ClipPromptService.getSystemPrompt(genreProfile);

        const aiResponse = await this.aiProvider.generateJsonCompletion<AIClipAnalysisResponse>({
          systemPrompt,
          userPrompt,
          temperature: 0.4,
          maxTokens: 3000,
          responseFormat: 'json_object',
        });

        logger.info(`AI clip analysis raw response for ${projectId}: ${JSON.stringify(aiResponse)}`);
        aiCandidates = ClipAnalysisService.parseAIResponse(aiResponse);
      }

      // 5. Fallback for very short videos if LLM produced 0 clips
      if (aiCandidates.length === 0 && segments.length > 0) {
        const seg = segments[0];
        const segDur = seg.end - seg.start;
        if (segDur >= 2.0) {
          logger.info(`Creating fallback clip candidate for short video (duration: ${segDur.toFixed(2)}s)`);
          aiCandidates = [
            {
              start_segment_index: 0,
              end_segment_index: segments.length - 1,
              title: project.title || 'Video Highlight',
              hook: seg.text.slice(0, 50),
              reason: 'Strongest standalone moment in the source clip.',
              category: 'insight',
              hook_score: 85,
              standalone_score: 85,
              insight_score: 85,
              emotion_score: 80,
              platform_score: 85,
            },
          ];
        }
      }

      if (aiCandidates.length === 0) {
        logger.warn(`AI clip analysis returned 0 candidates for project ${projectId}.`);
        return [];
      }

      // 6. Ground segment indexes and derive actual timestamps with multimodal scoring
      const { MultimodalScoringService } = await import('./multimodal/multimodalScoringService.js');

      const groundedCandidates: Array<{
        start_segment_index: number;
        end_segment_index: number;
        start_seconds: number;
        end_seconds: number;
        duration_seconds: number;
        title: string;
        hook: string;
        reason: string;
        category: ClipCandidateCategory;
        genre?: ContentGenre;
        content_goal?: ContentGoal;
        engagement_score: number;
        cold_open?: ColdOpenConfig | null;
        metadata: Record<string, any>;
      }> = [];

      for (const ai of aiCandidates) {
        if (ai.start_segment_index >= segments.length || ai.end_segment_index >= segments.length) {
          // Out of range segment index, reject
          continue;
        }

        const startSeg = segments[ai.start_segment_index];
        const endSeg = segments[ai.end_segment_index];

        const raw_start = Number(startSeg.start.toFixed(3));
        const raw_end = Number(endSeg.end.toFixed(3));

        // Evaluate multimodal scoring and silence boundary snapping with genre intelligence
        const precedingSeg = ai.start_segment_index > 0 ? segments[ai.start_segment_index - 1] : null;
        const candidateText = segments
          .slice(ai.start_segment_index, ai.end_segment_index + 1)
          .map((s) => s.text)
          .join(' ');
        const scored = MultimodalScoringService.scoreCandidate({
          start_seconds: raw_start,
          end_seconds: raw_end,
          title: ai.title,
          hook: ai.hook,
          reason: ai.reason,
          category: ai.category,
          timeline: multimodalTimeline,
          baseHookScore: ai.hook_score,
          baseStandaloneScore: ai.standalone_score,
          baseInsightScore: ai.insight_score,
          precedingSegment:
            precedingSeg && typeof precedingSeg.text === 'string'
              ? { text: precedingSeg.text, end: Number(precedingSeg.end) }
              : null,
          gameplayEvents: genreProfile.genre === 'gaming' ? gameplayEvents : undefined,
          candidateText,
          genreProfile,
          contentGoal,
        });

        // Phase 1: Word-boundary snapping (preventing clips from cutting mid-word)
        const isShortVideo = Boolean(transcript.duration_seconds && transcript.duration_seconds < 15);
        const minDurationLimit = isShortVideo ? 2.0 : Math.max(15.0, genreProfile.targetDuration.min);
        const maxDurationLimit = isShortVideo ? 90.0 : Math.min(90.0, genreProfile.targetDuration.max);

        const wordSnapped = ClipAnalysisService.refineWordBoundaries({
          start_seconds: scored.start_seconds,
          end_seconds: scored.end_seconds,
          words: rawWords,
          maxAdjustmentMs: 150,
          sourceDuration: transcript.duration_seconds,
          minDurationLimit,
          maxDurationLimit,
          preRollMs: 70,
          postRollMs: 150,
        });

        let start_seconds = wordSnapped.start_seconds;
        let end_seconds = wordSnapped.end_seconds;
        let duration_seconds = wordSnapped.duration_seconds;

        // Use hybrid multimodal Vireo Score
        const engagement_score = scored.vireo_score;

        // Question auto-inclusion (advantage B4): when the clip answers a
        // question it doesn't include and the exchange fits the genre clamps,
        // repair the boundary instead of only penalizing completeness.
        let questionInclusion: { extendedBySec: number; includedQuestionText: string } | null = null;
        if (isQaCriticalGenre(genreProfile.genre) && precedingSeg) {
          const inclusion = tryIncludeQuestion(
            {
              start_seconds,
              end_seconds,
              candidateText,
            },
            { start: Number(precedingSeg.start), end: Number(precedingSeg.end), text: String(precedingSeg.text || '') },
            { minDurationSec: minDurationLimit, maxDurationSec: maxDurationLimit }
          );
          if (inclusion) {
            start_seconds = inclusion.start_seconds;
            end_seconds = inclusion.end_seconds;
            duration_seconds = Number((end_seconds - start_seconds).toFixed(3));
            questionInclusion = {
              extendedBySec: inclusion.extendedBySec,
              includedQuestionText: inclusion.includedQuestionText,
            };
          }
        }

        // Duration constraints: strictly minDurationLimit to maxDurationLimit (adaptive for short test videos under 15s)
        if (duration_seconds < minDurationLimit || duration_seconds > maxDurationLimit) {
          logger.info(`Rejected candidate "${ai.title}": duration ${duration_seconds}s outside [${minDurationLimit}s, ${maxDurationLimit}s] window.`);
          continue;
        }



        let cold_open: ColdOpenConfig | null = null;
        if (typeof ai.cold_open_segment_index === 'number' && segments[ai.cold_open_segment_index]) {
          const coSeg = segments[ai.cold_open_segment_index];
          const coStart = Number(coSeg.start.toFixed(3));
          const coEnd = Number(coSeg.end.toFixed(3));
          const coDur = Math.max(1.0, Math.round((coEnd - coStart) * 100) / 100);
          if (coDur >= 1.5 && coDur <= 6.5) {
            cold_open = {
              enabled: true,
              start_seconds: coStart,
              end_seconds: coEnd,
              duration_seconds: coDur,
              teaser_text: coSeg.text?.trim() || ai.hook,
              transition_effect: 'whoosh',
            };
          }
        }

        groundedCandidates.push({
          start_segment_index: ai.start_segment_index,
          end_segment_index: ai.end_segment_index,
          start_seconds,
          end_seconds,
          duration_seconds,
          title: ai.title,
          hook: ai.hook,
          reason: ai.reason,
          category: ai.category,
          genre: genreProfile.genre,
          content_goal: contentGoal,
          engagement_score,
          cold_open,
          metadata: {
            vireo_score: scored.vireo_score,
            explanation: scored.explanation,
            genre: genreProfile.genre,
            layout_mode: genreProfile.recommendedLayoutMode || 'track',
            caption_position: genreProfile.captionSafePlacement || (genreProfile.recommendedLayoutMode === 'split' ? 'center' : 'bottom'),
            content_goal: contentGoal,
            suggested_genre: localSuggestion.genre,
            genre_confidence: localSuggestion.confidence,
            cold_open,
            question_included: questionInclusion,
            was_snapped: scored.was_snapped || wordSnapped.was_snapped,
            silence_snapped: scored.was_snapped,
            word_snapped: wordSnapped.was_snapped,
            matched_start_word: wordSnapped.matched_start_word,
            matched_end_word: wordSnapped.matched_end_word,
          },
        });
      }

      // 7. Deduplicate overlapping moments (0.25 ratio) then SEMANTICALLY
      // (advantage B2): two moments far apart making the same point are
      // duplicates time-overlap can't see. Token-Jaccard fallback (embeddings
      // plug in later without touching this call site).
      const overlapDeduped = deduplicateCandidatesByOverlap(
        groundedCandidates,
        0.25
      );
      const deduped = deduplicateSemantically(
        overlapDeduped.map((c) => ({ ...c, text: (c as any).candidateText || `${c.title} ${c.hook} ${c.reason}`, score: c.engagement_score })),
        { threshold: 0.68, mode: 'token' }
      ).map((c) => {
        const { text: _t, score: _s, ...rest } = c as any;
        return rest as typeof overlapDeduped[number];
      });

      // 8. Adaptive clip count targeting with empirical 4+ floor for long-form content
      const adaptiveTargets = calculateAdaptiveClipCount(
        transcript.duration_seconds || 0,
        deduped.length,
        normalizedPrefs?.targetClipCount
      );

      // Diversity-aware final selection (genre roadmap Phase 4): greedy MMR with a
      // genre-tunable redundancy penalty instead of a flat top-N slice, so the
      // output set covers distinct moments (storytelling strict, gaming looser).
      const topCandidates = selectDiverseCandidates(deduped, {
        maxClips: adaptiveTargets.maxClips,
        redundancyPenalty: genreProfile.redundancyPenalty ?? 0.5,
      });

      // 9a. AI Clip Director: compile structured plans for each selected
      // candidate. Grounded in multimodal timeline + game events + spikes.
      // A failed plan degrades gracefully — candidate persists without one.
      let directorPlans: Record<string, any> = {};
      try {
        const { structureMoments, wordsFromTranscript, energyFromTimeline } = await import('./momentStructurer.js');
        const { buildDirectorPlan } = await import('./directorPlanBuilder.js');
        const { detectReactionSpikes } = await import('../utils/reactionSpikes.js');

        const timelineSegments = multimodalTimeline?.segments ?? [];
        const wordTimings = wordsFromTranscript(
          transcript.words || (transcript as any).words || []
        );
        const energySegments = energyFromTimeline(timelineSegments);
        const spikes = detectReactionSpikes(energySegments);
        const sceneCuts = (multimodalTimeline?.scene_cuts ?? []).map((c: any) => c.timestamp);
        const faceIntervals = (multimodalTimeline?.face_intervals ?? []).map((f: any) => ({ start: f.start, end: f.end }));
        const gameEvents = (gameplayEvents ?? []).map((e) => ({ time: e.time, confidence: e.confidence, type: e.type }));

        const moments = structureMoments({
          durationSec: transcript.duration_seconds || durationMinutes * 60,
          words: wordTimings,
          energySegments,
          spikes,
          sceneCuts,
          faceIntervals,
          gameEvents,
          genre: genreProfile.genre,
        });

        // Match moments to top candidates by temporal overlap
        for (const candidate of topCandidates) {
          const cStart = candidate.start_seconds;
          const cEnd = candidate.end_seconds;
          const matching = moments.find((m) => {
            const shorter = Math.min(m.end - m.start, cEnd - cStart);
            if (shorter <= 0) return false;
            const overlap = Math.max(0, Math.min(cEnd, m.end) - Math.max(cStart, m.start));
            return overlap / shorter > 0.3;
          });
          if (matching) {
            const buildResult = buildDirectorPlan(matching, {
              genre: genreProfile.genre,
              project_id: projectId,
              user_id: userId,
              words: wordTimings,
              layoutMode: genreProfile.recommendedLayoutMode,
            });
            if (buildResult.plan) {
              directorPlans[`${candidate.start_seconds}`] = buildResult.plan;
            }
          }
        }
      } catch (dirErr: any) {
        logger.info(`[DirectorPlan] Moment structuring unavailable for ${projectId}: ${dirErr?.message || dirErr}`);
      }

      // 9. Replace suggestions in one Mongo transaction, preserving selected clips.
      const allProjectCandidates = await replaceSuggestedCandidates(userId, projectId,
        topCandidates.map((candidate) => ({
          start_segment_index: candidate.start_segment_index,
          end_segment_index: candidate.end_segment_index,
          start_seconds: candidate.start_seconds,
          end_seconds: candidate.end_seconds,
          duration_seconds: candidate.duration_seconds,
          title: candidate.title,
          hook: candidate.hook,
          reason: candidate.reason,
          category: candidate.category,
          genre: candidate.genre,
          content_goal: candidate.content_goal,
          engagement_score: candidate.engagement_score,
          cold_open: candidate.cold_open,
          director_plan: directorPlans[`${candidate.start_seconds}`] || null,
          metadata: candidate.metadata || {},
        })));
      return allProjectCandidates as unknown as ClipCandidate[];
    } finally {
      activeClipAnalysisSet.delete(projectId);
    }
    });
  }

  /**
   * Fetches all clip candidates for a project owned by user
   */
  public static async getCandidates(projectId: string, userId: string): Promise<ClipCandidate[]> {
    return await ownerContext.run(userId, async () => {
      const { data: project, error: projErr } = await dataRepository
        .from('projects')
        .select('id, user_id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (projErr) throw new Error(projErr.message);
      if (!project) {
        const err: any = new Error('Project not found or access denied.');
        err.code = 'PROJECT_NOT_FOUND';
        throw err;
      }

      const { data: candidates, error: candErr } = await dataRepository
        .from('clip_candidates')
        .select('*')
        .eq('project_id', projectId)
        .order('engagement_score', { ascending: false });

      if (candErr) throw new Error(candErr.message);
      return (candidates || []) as ClipCandidate[];
    });
  }

  /**
   * Updates candidate status (suggested | selected | dismissed)
   */
  public static async updateCandidateStatus(
    projectId: string,
    candidateId: string,
    userId: string,
    newStatus: ClipCandidateStatus
  ): Promise<ClipCandidate> {
    const validStatuses: ClipCandidateStatus[] = ['suggested', 'selected', 'dismissed'];
    if (!validStatuses.includes(newStatus)) {
      const err: any = new Error(`Invalid status "${newStatus}". Must be one of: ${validStatuses.join(', ')}`);
      err.code = 'INVALID_STATUS';
      throw err;
    }

    return await ownerContext.run(userId, async () => {
      // Verify ownership through project and user_id
      const { data: candidate, error: fetchErr } = await dataRepository
        .from('clip_candidates')
        .select('*')
        .eq('id', candidateId)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
      if (!candidate) {
        const err: any = new Error('Clip candidate not found or access denied.');
        err.code = 'CANDIDATE_NOT_FOUND';
        throw err;
      }

      const { data: updated, error: updateErr } = await dataRepository
        .from('clip_candidates')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId)
        .eq('user_id', userId)
        .select()
        .single();

      if (updateErr) throw new Error(updateErr.message);
      return updated as ClipCandidate;
    });
  }
}
