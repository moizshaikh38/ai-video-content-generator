import {createOrderedWordBoundarySafety} from '../../shared/orderedWordBoundarySafety.js';
import {
  SceneCutPoint,
  AudioSilenceInterval,
  FacePresenceInterval,
  AudioIntelligenceWord,
  AudioIntelligenceSegment,
  BoundaryOptimizationInfo,
} from '../../types/index.js';

export interface ShotBoundaryFusionOptions {
  rawStart: number;
  rawEnd: number;
  words?: AudioIntelligenceWord[];
  segments?: AudioIntelligenceSegment[];
  sceneCuts?: SceneCutPoint[];
  silenceIntervals?: AudioSilenceInterval[];
  faceIntervals?: Array<{ start: number; end: number; dominant_face_ratio?: number; average_confidence?: number }>;
  totalVideoDuration?: number;
  targetDuration?: {
    min: number;
    max: number;
    optimal?: number;
  };
  preferShotCutAlignment?: boolean;
}

export interface ShotBoundaryFusionResult {
  start: number;
  end: number;
  duration: number;
  boundaryOptimization: BoundaryOptimizationInfo;
  startsOnCut: boolean;
  endsOnCut: boolean;
  nearestPriorCut?: number;
  nearestPosteriorCut?: number;
  warnings: string[];
}

export class ShotBoundaryFusionService {
  private static readonly TERMINAL_PUNCTUATION_REGEX = /[.!?।॥]+[\"'”’)]*$/;
  private static readonly CLAUSE_PUNCTUATION_REGEX = /[,;—–-]+$/;
  private static readonly INCOMPLETE_CONJUNCTIONS = new Set([
    'and', 'but', 'or', 'so', 'because', 'although', 'though', 'since',
    'if', 'when', 'while', 'as', 'that', 'which', 'who', 'whereas', 'where',
  ]);

  /**
   * Main fusion method: Calculates optimal [start, end] boundaries by fusing
   * transcript words, sentence syntax, scene cuts, and silence intervals.
   */
  public static optimizeBoundaries(
    options: ShotBoundaryFusionOptions
  ): ShotBoundaryFusionResult {
    const {
      rawStart,
      rawEnd,
      words = [],
      segments = [],
      sceneCuts = [],
      silenceIntervals = [],
      faceIntervals = [],
      totalVideoDuration = Math.max(rawEnd, 120),
      targetDuration = { min: 10, max: 60, optimal: 30 },
      preferShotCutAlignment = true,
    } = options;

    const warnings: string[] = [];
    const minDur = Math.max(1.5, targetDuration.min);
    const maxDur = Math.min(Math.max(minDur, targetDuration.max), totalVideoDuration);

    let currentStart = Number(Math.max(0, Math.min(rawStart, totalVideoDuration - 0.5)).toFixed(3));
    let currentEnd = Number(Math.min(totalVideoDuration, Math.max(currentStart + 0.5, rawEnd)).toFixed(3));

    // Sort words and scene cuts chronologically
    const sortedWords = [...words]
      .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.start >= 0 && w.end > w.start && typeof w.word === 'string')
      // Output/candidate times are millisecond precision. Normalize provider
      // float noise once so a rounded endpoint is not a false partial word.
      .map((w) => ({...w,start:Number(w.start.toFixed(3)),end:Number(w.end.toFixed(3))}))
      .filter((w) => w.end > w.start)
      .sort((a, b) => a.start - b.start);

    // Duration expansion/contraction probes many candidate edges. Index the
    // same normalized clocks once instead of scanning all words per edge.
    const safeEdge = createOrderedWordBoundarySafety(sortedWords);

    const sortedCuts = [...sceneCuts]
      .map((c) => c.timestamp)
      .filter((t) => typeof t === 'number' && t >= 0 && t <= totalVideoDuration)
      .sort((a, b) => a - b);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: WORD & SENTENCE SYNTACTIC SNAPPING
    // ──────────────────────────────────────────────────────────────────────────
    let wasSentencePreserved = false;
    let initialSpokenWordStart = currentStart;
    let finalSpokenWordEnd = currentEnd;

    if (sortedWords.length > 0) {
      // 1A: Start Word Snapping (Never start in the middle of a spoken word)
      const intersectingStartWord = sortedWords.find((w) => currentStart >= w.start && currentStart < w.end);
      if (intersectingStartWord) {
        currentStart = intersectingStartWord.start;
        initialSpokenWordStart = intersectingStartWord.start;
      } else {
        // Find next upcoming word
        const nextWord = sortedWords.find((w) => w.start >= currentStart);
        if (nextWord) {
          initialSpokenWordStart = nextWord.start;
          if (nextWord.start - currentStart < 1.5) {
            currentStart = nextWord.start;
          }
        }
      }

      // 1B: Sentence-Start Alignment
      // Look back up to 1.5s to see if a sentence started shortly before currentStart
      const wordsBefore = sortedWords.filter((w) => w.end <= currentStart && currentStart - w.end <= 1.5);
      if (wordsBefore.length > 0) {
        const lastWordBefore = wordsBefore[wordsBefore.length - 1];
        const hasTerminalBefore = this.TERMINAL_PUNCTUATION_REGEX.test(lastWordBefore.word.trim());
        if (hasTerminalBefore) {
          // Sentence ended right before currentStart, perfect natural beginning
          wasSentencePreserved = true;
        }
      }

      // 1C: End Word Snapping (Never cut in the middle of a spoken word)
      const intersectingEndWord = sortedWords.find((w) => currentEnd > w.start && currentEnd <= w.end);
      if (intersectingEndWord) {
        currentEnd = intersectingEndWord.end;
        finalSpokenWordEnd = intersectingEndWord.end;
      } else {
        // Find preceding word
        const prevWords = sortedWords.filter((w) => w.end <= currentEnd);
        if (prevWords.length > 0) {
          finalSpokenWordEnd = prevWords[prevWords.length - 1].end;
        }
      }

      // 1D: Terminal Punctuation Lookahead (Avoid trailing off mid-sentence)
      // Look ahead up to 2.0s for terminal punctuation (. ! ?)
      const lastSpokenWord = sortedWords.filter((w) => w.end <= finalSpokenWordEnd).at(-1);
      const endingAlreadyComplete = lastSpokenWord && this.TERMINAL_PUNCTUATION_REGEX.test(lastSpokenWord.word.trim());
      const lookaheadWords = endingAlreadyComplete ? [] : sortedWords.filter(
        (w) => w.start >= finalSpokenWordEnd && w.end - finalSpokenWordEnd <= 2.2
      );

      let terminalFound = false;
      for (const w of lookaheadWords) {
        const durIfExtended = w.end - currentStart;
        if (durIfExtended <= maxDur && this.TERMINAL_PUNCTUATION_REGEX.test(w.word.trim())) {
          currentEnd = w.end;
          finalSpokenWordEnd = w.end;
          terminalFound = true;
          wasSentencePreserved = true;
          break;
        }
      }

      // 1E: Incomplete conjunction protection (Don't end on "and", "because", "but")
      const candidateEndingWords = sortedWords.filter((w) => w.start >= currentStart && w.end <= currentEnd + 0.1);
      if (candidateEndingWords.length > 0) {
        const lastCandidateWord = candidateEndingWords[candidateEndingWords.length - 1];
        if (this.TERMINAL_PUNCTUATION_REGEX.test(lastCandidateWord.word.trim())) {
          wasSentencePreserved = true;
        }
        const cleanWord = lastCandidateWord.word.toLowerCase().replace(/[^a-z]/g, '');
        if (this.INCOMPLETE_CONJUNCTIONS.has(cleanWord)) {
          // If we have room, look for the next word
          const nextWordAfter = sortedWords.find((w) => w.start >= lastCandidateWord.end);
          if (nextWordAfter && nextWordAfter.end - currentStart <= maxDur) {
            currentEnd = nextWordAfter.end;
            finalSpokenWordEnd = nextWordAfter.end;
            if (this.TERMINAL_PUNCTUATION_REGEX.test(nextWordAfter.word.trim())) {
              wasSentencePreserved = true;
            }
          } else if (candidateEndingWords.length > 1) {
            // Otherwise step back before the conjunction
            const prevWord = candidateEndingWords[candidateEndingWords.length - 2];
            currentEnd = prevWord.end;
            finalSpokenWordEnd = prevWord.end;
            if (this.TERMINAL_PUNCTUATION_REGEX.test(prevWord.word.trim())) {
              wasSentencePreserved = true;
            }
          }
        }
      }
    } else {
      warnings.push('Sparse or missing transcript words; relying on scene cuts and audio envelope.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: SHOT-AWARE BOUNDARY ALIGNMENT
    // ──────────────────────────────────────────────────────────────────────────
    let wasShotBoundarySnapped = false;
    let startsOnCut = false;
    let endsOnCut = false;
    let nearestPriorCut: number | undefined;
    let nearestPosteriorCut: number | undefined;

    if (preferShotCutAlignment && sortedCuts.length > 0) {
      // Find nearest prior cut before speech starts
      const priorCuts = sortedCuts.filter((t) => t <= initialSpokenWordStart);
      if (priorCuts.length > 0) {
        nearestPriorCut = priorCuts[priorCuts.length - 1];
        const gapBeforeSpeech = initialSpokenWordStart - nearestPriorCut;

        // If a cut occurred shortly before speech (within 0.2s to 1.2s), snap start to the cut!
        // This eliminates the awkward visual sliver of the previous camera shot.
        if (gapBeforeSpeech >= 0.1 && gapBeforeSpeech <= 1.2) {
          const durationWithCut = currentEnd - nearestPriorCut;
          const crossesPriorSpeech = sortedWords.some((w) => w.start < initialSpokenWordStart && w.end > nearestPriorCut!);
          if (durationWithCut <= maxDur && !crossesPriorSpeech) {
            currentStart = Number(nearestPriorCut.toFixed(3));
            wasShotBoundarySnapped = true;
            startsOnCut = true;
          }
        }
      }

      // Find nearest posterior cut after speech concludes
      const posteriorCuts = sortedCuts.filter((t) => t >= finalSpokenWordEnd);
      if (posteriorCuts.length > 0) {
        nearestPosteriorCut = posteriorCuts[0];
        const gapAfterSpeech = nearestPosteriorCut - finalSpokenWordEnd;

        // If a cut occurs shortly after speech ends (within 0.1s to 0.8s), snap end to the cut!
        // This eliminates a flash frame of the subsequent camera shot.
        if (gapAfterSpeech >= 0.1 && gapAfterSpeech <= 0.8) {
          const durationWithCut = nearestPosteriorCut - currentStart;
          const crossesFollowingSpeech = sortedWords.some((w) => w.end > finalSpokenWordEnd && w.start < nearestPosteriorCut!);
          if (durationWithCut <= maxDur && durationWithCut >= minDur && !crossesFollowingSpeech) {
            currentEnd = Number(nearestPosteriorCut.toFixed(3));
            wasShotBoundarySnapped = true;
            endsOnCut = true;
          }
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: SILENCE & PAUSE TRIMMING
    // ──────────────────────────────────────────────────────────────────────────
    let leadingSilenceTrimmedSec = 0;
    let trailingSilenceTrimmedSec = 0;

    // Check leading dead air (gap between currentStart and initial speech)
    if (!startsOnCut && initialSpokenWordStart > currentStart) {
      const leadingGap = initialSpokenWordStart - currentStart;
      if (leadingGap > 0.35) {
        const trimmedStart = initialSpokenWordStart - 0.15; // Preserve 150ms natural breath pause
        leadingSilenceTrimmedSec = Number((trimmedStart - currentStart).toFixed(3));
        currentStart = Math.max(0, trimmedStart);
      }
    }

    // Check trailing dead air (gap between final speech and currentEnd)
    if (!endsOnCut && currentEnd > finalSpokenWordEnd) {
      const trailingGap = currentEnd - finalSpokenWordEnd;
      if (trailingGap > 0.45) {
        const trimmedEnd = finalSpokenWordEnd + 0.2; // Preserve 200ms natural acoustic decay
        trailingSilenceTrimmedSec = Number((currentEnd - trimmedEnd).toFixed(3));
        currentEnd = Math.min(totalVideoDuration, trimmedEnd);
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 4: DURATION ENFORCEMENT & SAFETY CLAMPING
    // ──────────────────────────────────────────────────────────────────────────
    let wasWordBoundaryAdjusted = false;
    let finalDuration = currentEnd - currentStart;

    if (finalDuration < minDur) {
      // Need expansion to reach minimum viable clip duration
      const deficit = minDur - finalDuration;
      const expandEnd = Math.min(totalVideoDuration, currentEnd + deficit);
      const remainingDeficit = minDur - (expandEnd - currentStart);
      const expandStart = Math.max(0, currentStart - remainingDeficit);
      // Expanding by elapsed seconds can land inside a word and discard an
      // otherwise usable candidate at final validation. Prefer the nearest
      // complete-word edge inside the same duration limits. Narrative scoring
      // is still invalidated by the caller when the spoken scope changes.
      const safeEnds=safeEdge(currentStart)?[expandEnd,...sortedWords.map(w=>w.end)]
        .filter(t=>t>=expandEnd&&t<=totalVideoDuration&&t-currentStart>=minDur&&t-currentStart<=maxDur&&safeEdge(t))
        .sort((a,b)=>a-b):[];
      const completeEnd=safeEnds.find(t=>t-expandEnd<=2.2&&sortedWords.some(w=>w.end===t&&this.TERMINAL_PUNCTUATION_REGEX.test(w.word.trim())));
      const safeEnd=completeEnd??safeEnds[0];
      const safeStart=safeEnd===undefined&&safeEdge(currentEnd)?[expandStart,...sortedWords.map(w=>w.start)]
        .filter(t=>t>=0&&t<=currentStart&&currentEnd-t>=minDur&&currentEnd-t<=maxDur&&safeEdge(t))
        .sort((a,b)=>b-a)[0]:undefined;
      currentStart = Number((safeEnd!==undefined?currentStart:safeStart??expandStart).toFixed(3));
      currentEnd = Number((safeEnd??(safeStart!==undefined?currentEnd:expandEnd)).toFixed(3));
      finalDuration = currentEnd - currentStart;
      wasWordBoundaryAdjusted=safeEnd!==undefined||safeStart!==undefined;
      warnings.push(`Expanded boundary by ${(finalDuration-(minDur-deficit)).toFixed(1)}s to fulfill minimum clip duration.`);
    }

    if (finalDuration > maxDur) {
      // Need contraction to respect maximum short-form constraint
      const excess = finalDuration - maxDur;
      const ceiling = currentStart + maxDur;
      const safeEndWords = sortedWords.filter((w) => w.end <= ceiling && w.end - currentStart >= minDur &&
        safeEdge(w.end));
      const terminalEnds = safeEndWords.filter((w) => this.TERMINAL_PUNCTUATION_REGEX.test(w.word.trim()));
      const chosen = terminalEnds.at(-1) ?? safeEndWords.at(-1);
      currentEnd = Number((chosen?.end ?? ceiling).toFixed(3));
      wasWordBoundaryAdjusted = Boolean(chosen);
      endsOnCut = false;
      finalDuration = currentEnd - currentStart;
      warnings.push(`Clamped boundary by ${(excess).toFixed(1)}s to respect maximum clip duration.`);
    }

    // Final integrity checks
    currentStart = Math.max(0, Number(currentStart.toFixed(3)));
    currentEnd = Math.min(totalVideoDuration, Number(currentEnd.toFixed(3)));
    finalDuration = Number((currentEnd - currentStart).toFixed(3));

    if (isNaN(currentStart) || isNaN(currentEnd) || currentStart >= currentEnd) {
      warnings.push('Invalid boundary calculation; resetting to safe raw bounds.');
      currentStart = Math.max(0, rawStart);
      currentEnd = Math.min(totalVideoDuration, Math.max(currentStart + minDur, rawEnd));
      finalDuration = currentEnd - currentStart;
    }

    // Duration enforcement must not quietly reintroduce a partial spoken word.
    // An impossible duration/word combination is rejected by the live caller.
    const wordBoundarySafe = safeEdge(currentStart) && safeEdge(currentEnd);
    const finalWords = sortedWords.filter((w) => w.start >= currentStart && w.end <= currentEnd);
    if (sortedWords.length > 0) {
      wasSentencePreserved = wordBoundarySafe && Boolean(finalWords.length &&
        this.TERMINAL_PUNCTUATION_REGEX.test(finalWords[finalWords.length - 1].word.trim()));
    }
    if (!wordBoundarySafe) warnings.push('No word-safe boundary satisfies the selected duration; reject this candidate.');
    startsOnCut = startsOnCut && nearestPriorCut === currentStart;
    endsOnCut = endsOnCut && nearestPosteriorCut === currentEnd;
    wasShotBoundarySnapped = startsOnCut || endsOnCut;

    return {
      start: currentStart,
      end: currentEnd,
      duration: finalDuration,
      boundaryOptimization: {
        originalStart: rawStart,
        originalEnd: rawEnd,
        snappedStart: currentStart,
        snappedEnd: currentEnd,
        wasShotBoundarySnapped,
        wasSentencePreserved,
        wasWordBoundaryAdjusted,
        wordBoundarySafe,
        leadingSilenceTrimmedSec,
        trailingSilenceTrimmedSec,
      },
      startsOnCut,
      endsOnCut,
      nearestPriorCut,
      nearestPosteriorCut,
      warnings,
    };
  }
}
