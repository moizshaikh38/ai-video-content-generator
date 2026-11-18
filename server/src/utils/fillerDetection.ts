/**
 * Filler-word detection (Platform Quality Roadmap E-3, Descript parity).
 *
 * Deterministic, explainable tiered detection over transcript word tokens:
 *  - Tier 1 (confidence 0.95): disfluencies that are essentially always filler
 *    when standalone (um, uh, erm, …) and discourse backchannels (uh-huh, mm-hm).
 *  - Tier 2 (confidence 0.75): context-dependent markers (like, you know,
 *    i mean, sort/kind of, basically, actually) guarded by conservative
 *    heuristics so real content is never proposed for removal:
 *      • never at a sentence start (frequently content there: "You know what?")
 *      • "like" preceded by a likely subject (i/you/we/they/he/she/people) is
 *        the verb and is kept ("I like pizza").
 *
 * Output is merged time ranges ready for applyBatchRippleCuts — the temporal
 * removal cuts video, audio, and caption cues together through the proven
 * ripple infrastructure.
 */

export interface FillerWordToken {
  text: string;
  start: number;
  end: number;
  sentenceIndex?: number;
}

export type FillerTier = 1 | 2;

export interface FillerRange {
  start: number;
  end: number;
  durationSec: number;
  tier: FillerTier;
  words: string[];
  reason: string;
}

export interface FillerDetectionOptions {
  /** Include tier-2 context-dependent markers (default true). */
  includeTier2?: boolean;
  /** Reject merged ranges longer than this — long runs are usually content or pauses. */
  maxRangeDurationSec?: number;
  /** Discard sub-frame fragments. */
  minRangeDurationSec?: number;
}

const TIER1_SINGLE = new Set([
  'um', 'umm', 'uh', 'uhh', 'uhm', 'ummm', 'er', 'err', 'erm', 'ah', 'ahh',
  'hmm', 'hm', 'huh', 'mmm', 'mm', 'mhm', 'uhhuh', 'uhhuh', 'uhh', 'mmhmm',
]);

const TIER1_PHRASES = ['you know what i mean', 'or something', 'or whatever', 'and stuff', 'and things'];

const TIER2_SINGLE = new Set(['like', 'basically', 'actually', 'literally', 'honestly', 'seriously', 'obviously']);

const TIER2_PHRASES = ['you know', 'i mean', 'sort of', 'kind of', 'ya know', 'you see'];

/** Likely subjects make a following "like" the verb, not a filler. */
const LIKE_SUBJECTS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it', 'people', 'everyone', 'nobody']);

const normalize = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '');

function isSentenceStart(words: FillerWordToken[], index: number): boolean {
  if (index === 0) return true;
  if (typeof words[index].sentenceIndex === 'number' && typeof words[index - 1].sentenceIndex === 'number') {
    return words[index].sentenceIndex !== words[index - 1].sentenceIndex;
  }
  // Fallback: previous token ending in terminal punctuation starts a new sentence.
  return /[.!?]["']?$/.test(words[index - 1].text.trim());
}

interface ScoredFiller {
  index: number;
  length: number;
  tier: FillerTier;
  reason: string;
}

function scoreFillers(words: FillerWordToken[], includeTier2: boolean): ScoredFiller[] {
  const hits: ScoredFiller[] = [];
  const norm = words.map((w) => normalize(w.text));

    const phraseMatch = (index: number, phrase: string): number | null => {
    const parts = phrase.split(' ');
    for (let k = 0; k < parts.length; k++) {
      if (norm[index + k] !== parts[k]) return null;
    }
    return parts.length;
  };

  for (let i = 0; i < norm.length; i++) {
    if (!norm[i]) continue;

    // Tier 1 single-word disfluencies
    if (TIER1_SINGLE.has(norm[i])) {
      hits.push({ index: i, length: 1, tier: 1, reason: `disfluency "${norm[i]}"` });
      continue;
    }

    // Multi-word phrases (tier 1 then tier 2)
    let matched = false;
    for (const phrase of TIER1_PHRASES) {
      const len = phraseMatch(i, phrase);
      if (len) {
        hits.push({ index: i, length: len, tier: 1, reason: `trailing hedge "${phrase}"` });
        i += len - 1;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (!includeTier2) continue;

    if (isSentenceStart(words, i)) continue; // sentence-initial markers are frequently content

    for (const phrase of TIER2_PHRASES) {
      const len = phraseMatch(i, phrase);
      if (len) {
        hits.push({ index: i, length: len, tier: 2, reason: `discourse marker "${phrase}"` });
        i += len - 1;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (TIER2_SINGLE.has(norm[i])) {
      // Verb-use guard for "like": "I/they/... like X"
      if (norm[i] === 'like' && i > 0 && LIKE_SUBJECTS.has(norm[i - 1])) {
        continue;
      }
      hits.push({ index: i, length: 1, tier: 2, reason: `discourse marker "${norm[i]}"` });
    }
  }
  return hits;
}

/** Merges overlapping/adjacent single hits into contiguous removal ranges. */
export function detectFillerRanges(
  words: FillerWordToken[],
  options: FillerDetectionOptions = {}
): FillerRange[] {
  const {
    includeTier2 = true,
    maxRangeDurationSec = 1.5,
    minRangeDurationSec = 0.05,
  } = options;

  if (!Array.isArray(words) || words.length === 0) return [];

  const scored = scoreFillers(words, includeTier2);
  const ranges: FillerRange[] = [];

  for (const hit of scored) {
    const first = words[hit.index];
    const last = words[hit.index + hit.length - 1];
    if (!first || !last) continue;
    const start = first.start;
    const end = last.end;
    const durationSec = end - start;
    if (durationSec <= 0 || durationSec > maxRangeDurationSec) continue;
    if (durationSec < minRangeDurationSec) continue;

    const previous = ranges[ranges.length - 1];
    if (previous && start - previous.end < 0.05) {
      // Merge into the previous range, keeping its (higher) tier.
      previous.end = Math.max(previous.end, end);
      previous.durationSec = previous.end - previous.start;
      previous.words.push(...words.slice(hit.index, hit.index + hit.length).map((w) => w.text));
    } else {
      ranges.push({
        start,
        end,
        durationSec,
        tier: hit.tier,
        words: words.slice(hit.index, hit.index + hit.length).map((w) => w.text),
        reason: hit.reason,
      });
    }
  }

  return ranges.filter((r) => r.durationSec >= minRangeDurationSec && r.durationSec <= maxRangeDurationSec);
}

export interface FillerDetectionSummary {
  totalRanges: number;
  tier1Ranges: number;
  tier2Ranges: number;
  totalDurationSec: number;
  ranges: FillerRange[];
}

export function summarizeFillerRanges(ranges: FillerRange[]): FillerDetectionSummary {
  return {
    totalRanges: ranges.length,
    tier1Ranges: ranges.filter((r) => r.tier === 1).length,
    tier2Ranges: ranges.filter((r) => r.tier === 2).length,
    totalDurationSec: Number(ranges.reduce((acc, r) => acc + r.durationSec, 0).toFixed(3)),
    ranges,
  };
}
