import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  evaluateSelection,
  NOT_MEASURED_HUMAN_NOTE,
  NOT_MEASURED_LLM_NOTE,
  SelectionMetricReport,
} from './selectionMetrics.js';
import { buildFixtures, fixtureInput } from './syntheticFixtures.js';
import { buildEngineFixtures, EngineFixture } from './engineFixtures.js';
import { MultimodalScoringService } from '../../services/multimodal/multimodalScoringService.js';
import { ClipAnalysisService } from '../../services/clipAnalysisService.js';
import { GenreIntelligenceService } from '../../services/genreIntelligenceService.js';
import { deduplicateCandidatesByOverlap } from '../../utils/wordSnappingUtils.js';
import { selectDiverseCandidates } from '../../utils/diverseSelection.js';
import { MultimodalTimeline, TranscriptWord } from '../../types/index.js';

/**
 * Genre roadmap Phase 0 — reproducible selection benchmark runner.
 *
 * Measures the automatable metrics over synthetic ground-truth fixtures:
 *  1. GOLDEN set (reference moments verbatim) — must be near-perfect; validates
 *     the metric harness itself.
 *  2. DEGRADED set (mid-word starts, dead air, duplicates) — quantifies what the
 *     metrics detect, establishing the measurement floor.
 *
 * LLM selection quality and human-rated dimensions are reported as NOT MEASURED
 * until an approved provider run (Phase 3) supplies recorded candidate output.
 * No network calls, no paid APIs, no database access.
 */

interface FixtureReport {
  fixtureId: string;
  genre: string;
  golden: SelectionMetricReport;
  degraded: SelectionMetricReport;
  goldenSanity: { pass: boolean; failures: string[] };
}

/**
 * Engine-pipeline mode: runs the REAL deterministic post-LLM chain —
 * multimodal scoring → word-boundary refinement → dedup → MMR selection —
 * over reference arcs that satisfy the genre's true duration clamps, then
 * measures the result against ground truth. LLM subscores are proxied by the
 * reference quality scores; everything around the LLM is the actual code.
 */
function runEnginePipeline(fixture: EngineFixture): {
  report: SelectionMetricReport;
  stageCounts: { scored: number; refined: number; deduped: number; selected: number };
  sanity: { pass: boolean; failures: string[] };
} {
  const profile = GenreIntelligenceService.getGenreProfile(fixture.genre);
  const minLimit = Math.max(15, profile.targetDuration.min);
  const maxLimit = Math.min(90, profile.targetDuration.max);
  const sourceDuration = fixture.words[fixture.words.length - 1].end + 0.5;

  const timeline: MultimodalTimeline = {
    project_id: fixture.id,
    duration_seconds: sourceDuration,
    scene_cuts: [],
    silence_intervals: fixture.silence.map((s) => ({
      start: s.start,
      end: s.end,
      duration: Number((s.end - s.start).toFixed(3)),
    })),
    face_intervals: [],
    segments: (() => {
      const bySentence = new Map<number, { start: number; end: number; text: string[] }>();
      for (const w of fixture.words) {
        const e = bySentence.get(w.sentenceIndex) || { start: w.start, end: w.end, text: [] };
        e.start = Math.min(e.start, w.start);
        e.end = Math.max(e.end, w.end);
        e.text.push(w.text);
        bySentence.set(w.sentenceIndex, e);
      }
      return [...bySentence.values()].map((e) => ({
        start: e.start,
        end: e.end,
        transcript_text: e.text.join(' '),
        scene_cut_count: 0,
        visual_activity_score: 60,
        has_face_presence: true,
        face_confidence: 0.9,
        audio_energy_db: -20,
        has_silence_boundary_start: false,
        has_silence_boundary_end: false,
      }));
    })(),
    keyframes: [],
    summary_metadata: {
      total_scene_cuts: 0,
      average_visual_activity: 60,
      silence_ratio:
        fixture.silence.reduce((a, s) => a + (s.end - s.start), 0) / Math.max(1, sourceDuration),
      face_presence_ratio: 1,
      ocr_status: 'none',
    },
  };

  const words: TranscriptWord[] = fixture.words.map((w) => ({
    word: w.text,
    start: w.start,
    end: w.end,
  })) as TranscriptWord[];

  // Stage 1: real scorer (LLM subscores proxied by reference quality scores).
  let chain = fixture.goldenCandidates.map((c, i) => {
    const scored = MultimodalScoringService.scoreCandidate({
      start_seconds: c.start,
      end_seconds: c.end,
      title: `arc-${i}`,
      hook: fixture.references[i]?.description ?? 'reference arc',
      timeline,
      baseHookScore: c.score,
      baseStandaloneScore: c.score,
      baseInsightScore: c.score,
      genreProfile: profile,
      contentGoal: profile.defaultGoal,
    });
    return {
      start_seconds: scored.start_seconds,
      end_seconds: scored.end_seconds,
      engagement_score: scored.vireo_score,
      score: scored.vireo_score,
    };
  });
  const scoredCount = chain.length;

  // Stage 2: word-boundary refinement + genre clamp rejection (mirrors analyzeClips).
  chain = chain
    .map((c) => {
      const refined = ClipAnalysisService.refineWordBoundaries({
        start_seconds: c.start_seconds,
        end_seconds: c.end_seconds,
        words,
        maxAdjustmentMs: 150,
        sourceDuration,
        minDurationLimit: minLimit,
        maxDurationLimit: maxLimit,
        preRollMs: 70,
        postRollMs: 150,
      });
      return { ...c, start_seconds: refined.start_seconds, end_seconds: refined.end_seconds };
    })
    .filter((c) => {
      const d = c.end_seconds - c.start_seconds;
      return d >= minLimit - 0.001 && d <= maxLimit + 0.001;
    });
  const refinedCount = chain.length;

  // Stages 3+4: dedup then genre-weighted MMR selection.
  const deduped = deduplicateCandidatesByOverlap(chain, 0.25);
  const selected = selectDiverseCandidates(deduped, {
    maxClips: fixture.goldenCandidates.length,
    redundancyPenalty: profile.redundancyPenalty ?? 0.5,
  });

  const candidates = selected.map((c) => ({
    start: c.start_seconds,
    end: c.end_seconds,
    score: c.engagement_score,
  }));

  const report = evaluateSelection({
    words: fixture.words,
    references: fixture.references,
    candidates,
    silence: fixture.silence,
  });

  const failures: string[] = [];
  if (report.midWordRate !== 0) failures.push('mid-word boundaries introduced by the chain');
  if (report.referenceRecall !== 1) failures.push('chain dropped a ground-truth reference arc');
  if (report.redundancyRate > 0.05) failures.push('chain selected overlapping arcs');
  if (report.meanBoundaryErrorSec === null || report.meanBoundaryErrorSec > 1.0) {
    failures.push('boundary error exceeds 1.0s');
  }
  const durationsOk = candidates.every(
    (c) => c.end - c.start >= minLimit - 0.001 && c.end - c.start <= maxLimit + 0.001
  );
  if (!durationsOk) failures.push('selected durations violate genre clamps');

  return {
    report,
    stageCounts: { scored: scoredCount, refined: refinedCount, deduped: deduped.length, selected: selected.length },
    sanity: { pass: failures.length === 0, failures },
  };
}

const GOLDEN_SANITY_RULES: Array<{ name: string; check: (g: SelectionMetricReport) => boolean }> = [
  { name: 'no mid-word boundaries', check: (g) => g.midWordRate === 0 },
  { name: 'no mid-sentence boundaries', check: (g) => g.midSentenceRate === 0 },
  { name: 'no truncation', check: (g) => g.endTruncationRate === 0 },
  { name: 'no dead air', check: (g) => g.deadAirRate === 0 },
  { name: 'full reference recall', check: (g) => g.referenceRecall === 1 },
  { name: 'zero redundancy', check: (g) => g.redundancyRate === 0 },
];

function run(): void {
  const fixtures = buildFixtures();
  const reports: FixtureReport[] = fixtures.map((fixture) => {
    const golden = evaluateSelection(fixtureInput(fixture, fixture.goldenCandidates));
    const degraded = evaluateSelection(fixtureInput(fixture, fixture.degradedCandidates));
    const failures = GOLDEN_SANITY_RULES.filter((r) => !r.check(golden)).map((r) => r.name);
    return {
      fixtureId: fixture.id,
      genre: fixture.genre,
      golden,
      degraded,
      goldenSanity: { pass: failures.length === 0, failures },
    };
  });

  // Engine-pipeline mode: the real deterministic chain vs ground truth.
  const engineReports = buildEngineFixtures().map((fixture) => {
    const run = runEnginePipeline(fixture);
    return {
      fixtureId: fixture.id,
      genre: fixture.genre,
      stageCounts: run.stageCounts,
      metrics: run.report,
      sanity: run.sanity,
    };
  });
  const engineSanityPass = engineReports.every((r) => r.sanity.pass);

  const allSanityPass = reports.every((r) => r.goldenSanity.pass) && engineSanityPass;

  const report = {
    generatedAt: new Date().toISOString(),
    runner: 'selection-benchmark-v0',
    modelVersion: 'not-applicable (deterministic metric harness; no LLM invoked)',
    hardware: `${os.cpus().length} CPUs / ${os.platform()} ${os.arch()}`,
    harnessSanity: {
      pass: allSanityPass,
      note: allSanityPass
        ? 'Golden sets score perfectly and the real deterministic engine chain preserves ground truth on every fixture.'
        : 'SANITY FAILED: either the metric harness or the deterministic engine chain is broken. Do not trust results until fixed.',
    },
    fixtures: reports,
    enginePipeline: {
      note: 'Real deterministic chain (score → refine → dedup → MMR) over genre-clamped reference arcs. LLM subscores proxied by reference quality scores — the LLM itself is NOT MEASURED here.',
      fixtures: engineReports,
    },
    unmeasured: {
      llm_selection: NOT_MEASURED_LLM_NOTE,
      human_rated: NOT_MEASURED_HUMAN_NOTE,
      latency_and_cost: 'NOT MEASURED: requires an approved end-to-end run; this runner executes no models.',
    },
  };

  const outDir = path.resolve(process.cwd(), 'benchmark-results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'selection-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // Console summary
  for (const r of reports) {
    console.log(
      `[${r.fixtureId}] golden: midWord=${r.golden.midWordRate} trunc=${r.golden.endTruncationRate} dead=${r.golden.deadAirRate.toFixed(3)} redundancy=${r.golden.redundancyRate} recall=${r.golden.referenceRecall} | degraded: midWord=${r.degraded.midWordRate} dead=${r.degraded.deadAirRate.toFixed(3)} redundancy=${r.degraded.redundancyRate.toFixed(3)}`
    );
  }
  for (const r of engineReports) {
    console.log(
      `[${r.fixtureId}] engine(${r.stageCounts.scored}→${r.stageCounts.selected}): midWord=${r.metrics.midWordRate} recall=${r.metrics.referenceRecall} redundancy=${r.metrics.redundancyRate} meanBoundaryErr=${r.metrics.meanBoundaryErrorSec?.toFixed(2) ?? 'n/a'} | sanity ${r.sanity.pass ? 'PASS' : 'FAIL: ' + r.sanity.failures.join('; ')}`
    );
  }
  console.log(`Harness sanity: ${allSanityPass ? 'PASS' : 'FAIL'}`);
  console.log(`Report written to ${outPath}`);

  if (!allSanityPass) {
    process.exitCode = 1;
  }
}

run();
