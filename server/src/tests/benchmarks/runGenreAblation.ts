import * as fs from 'node:fs';
import * as path from 'node:path';
import { ClipPromptService } from '../../services/clipPromptService.js';
import { ClipAnalysisService } from '../../services/clipAnalysisService.js';
import { defaultAiProvider } from '../../services/aiProviderClient.js';
import { GenreIntelligenceService } from '../../services/genreIntelligenceService.js';
import { ContentGenre, TranscriptSegment } from '../../types/index.js';
import { evaluateSelection, BenchCandidate } from './selectionMetrics.js';
import { buildFixtures, SelectionFixture } from './syntheticFixtures.js';

/**
 * Genre roadmap Phase 3 — genre-ablation experiment scaffold (DESIGN, not run).
 *
 * Proves whether genre selection changes outcomes the right way: the SAME
 * fixture transcript is analyzed under four arms and the resulting candidate
 * sets are scored with the Phase 0 metric harness:
 *
 *   Arm A: correct genre (the fixture's ground-truth genre)
 *   Arm B: a plausible but incorrect genre
 *   Arm C: generic baseline (no genre → 'general')
 *   Arm D: correct genre + a natural-language creator intent
 *
 * EXECUTION GATE: this script spends paid LLM tokens. It runs ONLY when
 * ABLATION_APPROVED=on AND a provider key is configured; otherwise it prints
 * the experimental design and exits with status NOT RUN. Never wire it into
 * CI. Per the audit rules, do not run it without explicit owner approval.
 */

const WRONG_GENRE_BY_FIXTURE: Record<string, ContentGenre> = {
  podcast_complete_arcs: 'education_tutorial',
  gaming_lowdialogue: 'news_politics',
  tutorial_steps: 'motivation',
};

const INTENT_BY_FIXTURE: Record<string, string> = {
  podcast_complete_arcs: 'Find moments where the guests disagree with each other',
  gaming_lowdialogue: 'Find the biggest clutch plays and reactions',
  tutorial_steps: 'Find the steps that could be followed without watching the screen',
};

function fixtureToSegments(fixture: SelectionFixture): TranscriptSegment[] {
  const bySentence = new Map<number, { start: number; end: number; text: string[] }>();
  for (const w of fixture.words) {
    const entry = bySentence.get(w.sentenceIndex) || { start: w.start, end: w.end, text: [] };
    entry.start = Math.min(entry.start, w.start);
    entry.end = Math.max(entry.end, w.end);
    entry.text.push(w.text);
    bySentence.set(w.sentenceIndex, entry);
  }
  return [...bySentence.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, e]) => ({ start: e.start, end: e.end, text: e.text.join(' ') }));
}

async function runArm(
  fixture: SelectionFixture,
  segments: TranscriptSegment[],
  genre: ContentGenre
): Promise<BenchCandidate[]> {
  const genreProfile = GenreIntelligenceService.getGenreProfile(genre);
  const systemPrompt = ClipPromptService.getSystemPrompt(genreProfile);
  const userPrompt = ClipPromptService.buildClipAnalysisPrompt({
    segments,
    durationSeconds: segments[segments.length - 1]?.end ?? 0,
    genreProfile,
    contentGoal: genreProfile.defaultGoal,
  });

  const response = await defaultAiProvider.generateJsonCompletion<{
    clips?: Array<Record<string, unknown>>;
  }>({ systemPrompt, userPrompt, temperature: 0.4, maxTokens: 2000, responseFormat: 'json_object' });

  const parsed = ClipAnalysisService.parseAIResponse(response);
  return parsed
    .filter((c) => c.start_segment_index < segments.length && c.end_segment_index < segments.length)
    .map((c) => ({
      start: segments[c.start_segment_index].start,
      end: segments[c.end_segment_index].end,
      score:
        c.hook_score !== undefined || c.standalone_score !== undefined || c.insight_score !== undefined
          ? ((c.hook_score ?? 0) + (c.standalone_score ?? 0) + (c.insight_score ?? 0)) /
            Math.max(1, [c.hook_score, c.standalone_score, c.insight_score].filter((v) => v !== undefined).length)
          : undefined,
    }));
}

async function run(): Promise<void> {
  const approved = process.env.ABLATION_APPROVED === 'on';
  const hasProviderKey = Boolean(
    process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY
  );

  const design = {
    experiment: 'genre-ablation-v0',
    arms: ['correct_genre', 'wrong_genre', 'general_baseline', 'genre_plus_intent'],
    metrics: 'Phase 0 selectionMetrics (P@K, R@K, boundary error, truncation, dead air, redundancy)',
    acceptance:
      'Correct-genre arm must beat wrong-genre and general arms on genre-relevant dimensions without degrading boundary integrity. Rank arms per fixture.',
  };

  if (!approved || !hasProviderKey) {
    console.log('Genre ablation NOT RUN — paid LLM execution requires explicit approval.');
    console.log(JSON.stringify({ status: 'NOT_RUN', reason: !approved ? 'ABLATION_APPROVED!=on' : 'no provider key configured', design }, null, 2));
    return;
  }

  console.log('ABLATION_APPROVED=on — running paid ablation across 4 arms x fixtures...');
  const fixtures = buildFixtures();
  const results: Array<Record<string, unknown>> = [];

  for (const fixture of fixtures) {
    const segments = fixtureToSegments(fixture);
    const correctGenre = fixture.genre as ContentGenre;
    const arms: Array<{ arm: string; genre: ContentGenre; intent?: string }> = [
      { arm: 'correct_genre', genre: correctGenre },
      { arm: 'wrong_genre', genre: WRONG_GENRE_BY_FIXTURE[fixture.id] ?? 'general' },
      { arm: 'general_baseline', genre: 'general' },
      { arm: 'genre_plus_intent', genre: correctGenre, intent: INTENT_BY_FIXTURE[fixture.id] },
    ];

    const armReports: Record<string, unknown> = {};
    for (const armSpec of arms) {
      try {
        const candidates = await runArm(fixture, segments, armSpec.genre);
        const report = evaluateSelection({
          words: fixture.words,
          references: fixture.references,
          candidates,
          silence: fixture.silence,
        });
        armReports[armSpec.arm] = { genre: armSpec.genre, ...report };
      } catch (err: any) {
        armReports[armSpec.arm] = { genre: armSpec.genre, error: err.message };
      }
    }

    results.push({ fixtureId: fixture.id, genre: correctGenre, arms: armReports });
  }

  const outDir = path.resolve(process.cwd(), 'benchmark-results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'genre-ablation.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), design, results }, null, 2));
  console.log(`Ablation complete. Report written to ${outPath}`);
}

run();
