import { BenchCandidate, BenchReferenceMoment, BenchSilence, BenchWord } from './selectionMetrics.js';

/**
 * Genre roadmap Phase 0 (engine-pipeline mode) — fixtures whose reference arcs
 * satisfy REAL genre duration clamps, so the actual deterministic chain
 * (multimodal scoring → word-boundary refinement → dedup → MMR selection) can
 * run against ground truth without an LLM. The LLM subscores are proxied by the
 * reference quality scores; what is being measured is everything AROUND the LLM.
 */

export interface EngineFixture {
  id: string;
  genre: string;
  words: BenchWord[];
  silence: BenchSilence[];
  references: BenchReferenceMoment[];
  /** One candidate per reference arc, ranked by reference quality. */
  goldenCandidates: BenchCandidate[];
}

interface ArcSpec {
  sentences: string[];
  wordDuration: number;
  interWordPause?: number;
}

interface EngineFixtureSpec {
  id: string;
  genre: string;
  arcs: ArcSpec[];
  /** Filler sentences after the last arc (not part of any reference). */
  tailSentences?: string[];
  interArcSilenceSec?: number;
}

function buildEngineFixture(spec: EngineFixtureSpec): EngineFixture {
  const words: BenchWord[] = [];
  const silence: BenchSilence[] = [];
  const references: BenchReferenceMoment[] = [];
  const goldenCandidates: BenchCandidate[] = [];
  let t = 0;
  let sentenceIndex = 0;
  let globalWordIndex = 0;

  spec.arcs.forEach((arc, arcIdx) => {
    if (arcIdx > 0) {
      const silenceStart = t + 0.2;
      const silenceEnd = silenceStart + (spec.interArcSilenceSec ?? 1.5);
      silence.push({ start: silenceStart, end: silenceEnd });
      t = silenceEnd;
    }

    const arcStart = t;
    arc.sentences.forEach((sentence) => {
      const tokens = sentence.split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        words.push({ start: t, end: t + arc.wordDuration, text: token, sentenceIndex });
        globalWordIndex++;
        t += arc.wordDuration + (arc.interWordPause ?? 0.05);
      }
      t += 0.1; // sentence gap
      sentenceIndex++;
    });

    const reference: BenchReferenceMoment = {
      id: `arc-${arcIdx}`,
      start: arcStart,
      end: words[globalWordIndex - 1].end,
      description: arc.sentences[0].slice(0, 50),
    };
    references.push(reference);
    goldenCandidates.push({
      start: reference.start,
      end: reference.end,
      score: 90 - arcIdx * 2,
    });
  });

  for (const sentence of spec.tailSentences ?? []) {
    for (const token of sentence.split(/\s+/).filter(Boolean)) {
      words.push({ start: t, end: t + 0.5, text: token, sentenceIndex });
      t += 0.55;
    }
    t += 0.1;
    sentenceIndex++;
  }

  return {
    id: spec.id,
    genre: spec.genre,
    words,
    silence,
    references,
    goldenCandidates,
  };
}

export function buildEngineFixtures(): EngineFixture[] {
  return [
    buildEngineFixture({
      id: 'podcast_engine',
      genre: 'podcast_interview', // clamps 30–75s
      arcs: [
        {
          sentences: [
            'I think remote work is fundamentally broken for new hires',
            'the data from our own team showed it clearly last year',
            'onboarding numbers dropped almost forty percent after we went remote',
            'new people need hallway conversations to learn the culture',
            'so we built a hybrid mentorship program instead',
            'and the retention numbers recovered within two quarters',
          ],
          wordDuration: 0.62,
        },
        {
          sentences: [
            'my guest believes every startup should hire slowly',
            'he kept his team at twelve people for three years',
            'profitability arrived before the team ever doubled',
            'growth at all costs almost killed his first company',
            'so now he optimizes for durable revenue per head',
            'and that philosophy shows in every hire he makes',
          ],
          wordDuration: 0.62,
        },
        {
          sentences: [
            'the best product decisions come from support tickets',
            'she reads fifty tickets every single week herself',
            'that is where the real language of the customer lives',
            'roadmaps built from tickets rarely fail quietly',
            'so she moved the whole planning process onto them',
            'and the churn complaints dropped within a quarter',
          ],
          wordDuration: 0.62,
        },
      ],
    }),
    buildEngineFixture({
      id: 'gaming_engine',
      genre: 'gaming', // clamps 15–45s
      arcs: [
        {
          sentences: [
            'okay final circle two teams left standing',
            'they are pushing us from the north side',
            'hold this angle wait for the rotate',
            'there there there double knock down',
            'one more push and the win is ours',
            'that is the streak finished lets go',
          ],
          wordDuration: 0.5,
        },
        {
          sentences: [
            'this boss took me forty attempts all week',
            'phase two is the wall for most players',
            'dodge the sweep then punish the recovery',
            'and that is the no damage clear done',
            'chat we finally did it together',
          ],
          wordDuration: 0.5,
        },
      ],
      tailSentences: ['subscribe if that helped you today', 'next run we go for the record'],
    }),
  ];
}
