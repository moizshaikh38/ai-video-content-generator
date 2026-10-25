/**
 * Question auto-inclusion (clipping advantage B4): mechanical completeness.
 *
 * The unheard-question penalty already docks standalone score when a clip
 * ANSWERS a question it never includes. This pass repairs the boundary
 * instead: when the question segment directly precedes the candidate and
 * including it fits the genre duration clamps, extend the start backward —
 * the viewer gets the question AND the answer by construction.
 *
 * Pure function; ordering-safe; returns null when repair isn't possible
 * (too long, not a question, or the candidate already contains one).
 */

export interface InclusionSegment {
  start: number;
  end: number;
  text: string;
}

export interface QuestionInclusionCandidate {
  start_seconds: number;
  end_seconds: number;
  /** Transcript text inside the candidate window (used to check for '?'). */
  candidateText: string;
}

export interface QuestionInclusionResult {
  start_seconds: number;
  end_seconds: number;
  extendedBySec: number;
  includedQuestionText: string;
}

/** Genres where preserving the Q&A exchange is core to the rubric. */
const QA_CRITICAL_GENRES = new Set(['podcast_interview', 'news_politics', 'education_tutorial']);

export function isQaCriticalGenre(genre: string | undefined | null): boolean {
  return QA_CRITICAL_GENRES.has(String(genre || ''));
}

/**
 * Attempts to extend `candidate` backward to include `preceding` when:
 *  - preceding ends right before (or slightly overlapping) the candidate start,
 *  - preceding poses a question and the candidate itself does not,
 *  - the extended duration stays within [minDurationSec, maxDurationSec].
 * Returns the repaired bounds or null. Never throws.
 */
export function tryIncludeQuestion(
  candidate: QuestionInclusionCandidate,
  preceding: InclusionSegment | null | undefined,
  options: { minDurationSec: number; maxDurationSec: number; maxLeadSec?: number }
): QuestionInclusionResult | null {
  if (!preceding || typeof preceding.text !== 'string') return null;
  if (!preceding.text.includes('?')) return null;
  if ((candidate.candidateText || '').includes('?')) return null;

  const { minDurationSec, maxDurationSec, maxLeadSec = 12 } = options;
  const gap = candidate.start_seconds - preceding.end;
  if (gap < -0.35 || gap > 1.5) return null; // not directly adjacent

  const questionDur = preceding.end - preceding.start;
  if (questionDur <= 0 || questionDur > maxLeadSec) return null; // monologue, not a question

  const newStart = Math.min(preceding.start, candidate.start_seconds);
  const newDuration = candidate.end_seconds - newStart;
  if (newDuration > maxDurationSec) return null; // would violate the clamp
  if (newDuration < minDurationSec) return null;

  return {
    start_seconds: Number(newStart.toFixed(3)),
    end_seconds: Number(candidate.end_seconds.toFixed(3)),
    extendedBySec: Number((candidate.start_seconds - newStart).toFixed(3)),
    includedQuestionText: preceding.text.trim().slice(0, 200),
  };
}
