import {
  BenchCandidate,
  BenchReferenceMoment,
  BenchSilence,
  BenchWord,
  SelectionMetricsInput,
} from './selectionMetrics.js';

/**
 * Genre roadmap Phase 0 — synthetic fixture corpus with ground truth.
 *
 * Each fixture is a scripted transcript (exact word/sentence timings), derived
 * silence intervals, and human-style reference moments: the "good clip" arcs a
 * rater would mark, plus known traps (mid-word cut points, dead air, duplicates).
 * Metrics over the GOLDEN candidate set must be perfect — that validates the
 * metric harness itself before any engine output is measured.
 */

export interface SelectionFixture {
  id: string;
  genre: string;
  description: string;
  words: BenchWord[];
  references: BenchReferenceMoment[];
  silence: BenchSilence[];
  /** Reference-moment candidates as a rater would select them (metric sanity set). */
  goldenCandidates: BenchCandidate[];
  /** Deliberately degraded selections (mid-word starts, dead air, duplicates). */
  degradedCandidates: BenchCandidate[];
}

interface SentenceSpec {
  text: string;
  /** Seconds of silence before this sentence starts (dead air). */
  leadPause?: number;
  /** Seconds between words (defaults 0.05). */
  interWordPause?: number;
  wordDuration?: number;
  isReference?: boolean;
  refId?: string;
  refDescription?: string;
}

interface FixtureSpec {
  id: string;
  genre: string;
  description: string;
  sentences: SentenceSpec[];
  /** Mid-word offset (fraction into the word) for the degraded set's first candidate. */
  trapWordIndex?: number;
}

function buildFixture(spec: FixtureSpec): SelectionFixture {
  const words: BenchWord[] = [];
  const silence: BenchSilence[] = [];
  const references: BenchReferenceMoment[] = [];
  let t = 0;

  spec.sentences.forEach((sentence, sentenceIndex) => {
    if (sentence.leadPause && sentence.leadPause > 0) {
      silence.push({ start: t, end: t + sentence.leadPause });
      t += sentence.leadPause;
    }
    const sentenceStart = t;
    const tokens = sentence.text.split(/\s+/).filter(Boolean);
    const wordDur = sentence.wordDuration ?? 0.4;
    const gap = sentence.interWordPause ?? 0.05;
    tokens.forEach((token, i) => {
      const start = t;
      t += wordDur;
      words.push({ start, end: t, text: token, sentenceIndex });
      if (i < tokens.length - 1) {
        t += gap;
      }
    });
    if (sentence.isReference) {
      references.push({
        id: sentence.refId ?? `ref-${sentenceIndex}`,
        start: sentenceStart,
        end: t,
        description: sentence.refDescription ?? sentence.text.slice(0, 60),
      });
    }
    t += 0.2; // sentence gap (not counted as dead-air silence — below trap threshold)
  });

  const goldenCandidates: BenchCandidate[] = references.map((ref, i) => ({
    start: ref.start,
    end: ref.end,
    score: 90 - i * 2,
  }));

  // Degraded set: one candidate starting mid-word inside the trap word, one
  // straddling a long dead-air region, one near-duplicate of the first golden.
  const degraded: BenchCandidate[] = [];
  const trapIndex = spec.trapWordIndex ?? 2;
  const trapWord = words[Math.min(trapIndex, words.length - 1)];
  degraded.push({
    start: trapWord.start + (trapWord.end - trapWord.start) / 2,
    end: words[Math.min(trapIndex + 6, words.length - 1)].end,
    score: 95,
  });
  if (silence.length > 0) {
    const s = silence[0];
    degraded.push({ start: s.start + 0.05, end: s.end + 1.0, score: 88 });
  }
  if (references.length > 0) {
    const ref = references[0];
    degraded.push({ start: ref.start + 0.1, end: ref.end - 0.1, score: 92 });
  }

  return {
    id: spec.id,
    genre: spec.genre,
    description: spec.description,
    words,
    references,
    silence,
    goldenCandidates,
    degradedCandidates: degraded,
  };
}

export function buildFixtures(): SelectionFixture[] {
  return [
    buildFixture({
      id: 'podcast_complete_arcs',
      genre: 'podcast_interview',
      description: 'Two-speaker conversation, complete opinion arcs as references, one long dead-air region.',
      sentences: [
        { text: 'welcome back to the show', leadPause: 0.4 },
        { text: 'I think remote work is fundamentally broken for new hires', isReference: true, refId: 'ref-opinion', refDescription: 'Complete contrarian opinion' },
        { text: 'and here is the data that convinced me', isReference: true, refId: 'ref-data', refDescription: 'Payoff with evidence' },
        { text: 'yeah I have seen the same thing with my team', leadPause: 3.0 },
        { text: 'the onboarding numbers dropped almost forty percent' },
        { text: 'so what would you actually change first' },
      ],
    }),
    buildFixture({
      id: 'gaming_lowdialogue',
      genre: 'gaming',
      description: 'Sparse commentary over long quiet stretches — the low-dialogue trap.',
      sentences: [
        { text: 'okay okay here we go', wordDuration: 0.3 },
        { text: 'no way no way no way', wordDuration: 0.25, isReference: true, refId: 'ref-clutch', refDescription: 'Clutch reaction' },
        { text: 'that was the luckiest shot of my life', leadPause: 6.0, isReference: true, refId: 'ref-payoff', refDescription: 'Payoff after silence' },
        { text: 'chat clip that immediately', wordDuration: 0.3 },
      ],
    }),
    buildFixture({
      id: 'tutorial_steps',
      genre: 'education_tutorial',
      description: 'Step-by-step tutorial with tight pacing and complete instruction arcs.',
      sentences: [
        { text: 'step one open the terminal', wordDuration: 0.35 },
        { text: 'step two install the package with one command', wordDuration: 0.35, isReference: true, refId: 'ref-step', refDescription: 'Complete instruction' },
        { text: 'step three verify it works before moving on', wordDuration: 0.35, isReference: true, refId: 'ref-verify', refDescription: 'Verification step' },
        { text: 'and that is the whole setup', wordDuration: 0.35 },
      ],
      trapWordIndex: 5,
    }),
  ];
}

export function fixtureInput(
  fixture: SelectionFixture,
  candidates: BenchCandidate[],
  humanRanking?: number[] | null
): SelectionMetricsInput {
  return {
    words: fixture.words,
    references: fixture.references,
    candidates,
    silence: fixture.silence,
    humanRanking: humanRanking ?? null,
  };
}
