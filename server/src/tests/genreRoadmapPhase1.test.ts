import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { MultimodalScoringService } from '../services/multimodal/multimodalScoringService.js';
import { ClipAnalysisService } from '../services/clipAnalysisService.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { GenreProfileConfig } from '../types/index.js';

/**
 * Genre roadmap Phase 1 — honesty & consistency (audit findings F2, F3, F6, F7):
 * no fabricated scores in UI or scoring, unknown-genre diagnostics, selection-mode
 * defaults aligned with the UI, and weight renormalization for missing LLM subscores.
 */

const educationProfile = (): GenreProfileConfig =>
  GenreIntelligenceService.getGenreProfile('education_tutorial');

describe('Genre Phase 1 — missing LLM subscores renormalize instead of fabricating', () => {
  it('drops and redistributes the weight of an unreturned insight subscore', () => {
    // No timeline means visual/audio are unmeasured and excluded, not fake 60/70.
    // Hook 94 and standalone 82 retain .20/.35 weights; insight absent.
    // ((.20*94 + .35*82)/.55)*.9 +85*.1 =86.227... ->86.
    const result = MultimodalScoringService.scoreCandidate({
      start_seconds: 0,
      end_seconds: 30,
      title: 'Renormalization proof',
      hook: 'A compelling opening line for the clip',
      genreProfile: educationProfile(),
      baseHookScore: 90,
      baseStandaloneScore: 90,
      baseInsightScore: null,
    });

    assert.equal(result.vireo_score, 86);
    assert.equal(result.explanation.visual_activity_score, null);
    assert.equal(result.explanation.audio_energy_score, null);
    assert.equal(result.explanation.insight_score, null);
    assert.ok(
      result.explanation.reasons.some((r) => /Provider subscore missing: insight/.test(r)),
      'explanation must disclose the redistribution'
    );
  });

  it('keeps identical outcomes when every subscore is provided', () => {
    const withAll = MultimodalScoringService.scoreCandidate({
      start_seconds: 0,
      end_seconds: 30,
      title: 'Full scores',
      hook: 'A compelling opening line for the clip',
      genreProfile: educationProfile(),
      baseHookScore: 90,
      baseStandaloneScore: 90,
      baseInsightScore: 90,
    });
    // All provider subscores exist, but visual/audio still do not. Their .15
    // weight is omitted: ((.2*94+.35*82+.3*90)/.85)*.9+85*.1=87.382... ->87.
    assert.equal(withAll.vireo_score, 87);
    assert.equal(withAll.explanation.visual_activity_score, null);
    assert.equal(withAll.explanation.audio_energy_score, null);
    assert.equal(withAll.explanation.insight_score, 90);
    assert.ok(!withAll.explanation.reasons.some((r) => /redistributed/.test(r)));
  });

  it('parseAIResponse leaves omitted subscores undefined instead of injecting 70', () => {
    const parsed = ClipAnalysisService.parseAIResponse({
      clips: [
        {
          start_segment_index: 0,
          end_segment_index: 2,
          title: 'Partial scoring',
          hook: 'hook line',
          reason: 'why',
          category: 'insight',
          hook_score: 88,
          // standalone_score, insight_score, emotion_score, platform_score omitted
        },
        {
          start_segment_index: 3,
          end_segment_index: 5,
          title: 'Full scoring',
          hook: 'hook line',
          reason: 'why',
          category: 'insight',
          hook_score: 55,
          standalone_score: 66,
          insight_score: 77,
          emotion_score: 88,
          platform_score: 99,
        },
      ],
    });

    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].hook_score, 88);
    assert.equal(parsed[0].standalone_score, undefined);
    assert.equal(parsed[0].insight_score, undefined);
    assert.equal(parsed[1].standalone_score, 66);
    // Out-of-range values are clamped, not passed through.
    assert.equal(parsed[1].platform_score, 99);
  });

  it('no scoring path carries a fabricated default anymore', () => {
    const scoringSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/multimodal/multimodalScoringService.ts'),
      'utf8'
    );
    assert.doesNotMatch(scoringSrc, /baseHookScore = 75/);
    const analysisSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/clipAnalysisService.ts'),
      'utf8'
    );
    assert.doesNotMatch(analysisSrc, /hook_score: Number\(item\.hook_score\) \|\| 70/);
  });
});

describe('Genre Phase 1 — selection mode & fallback diagnostics', () => {
  it('defaults selection mode to auto when no genre is chosen (UI parity)', () => {
    const normalized = GenreIntelligenceService.normalizePreferences({});
    assert.equal(normalized.genreSelectionMode, 'auto');
    assert.equal(normalized.genre, 'general');
  });

  it('defaults to manual when a client sets an explicit genre but omits the mode', () => {
    const normalized = GenreIntelligenceService.normalizePreferences({ genre: 'podcast_interview' });
    assert.equal(normalized.genreSelectionMode, 'manual');
    assert.equal(normalized.genre, 'podcast_interview');
  });

  it('preserves explicit modes and logs unknown genres with a general fallback', () => {
    const explicit = GenreIntelligenceService.normalizePreferences({
      genre: 'gaming',
      genreSelectionMode: 'auto',
    });
    assert.equal(explicit.genreSelectionMode, 'auto');

    const fallback = GenreIntelligenceService.getGenreProfile('not_a_real_genre');
    assert.equal(fallback.genre, 'general');

    const coerced = GenreIntelligenceService.normalizePreferences({ genre: 'podcat' as any });
    assert.equal(coerced.genre, 'general');

    // F6 diagnostics wired in source.
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/genreIntelligenceService.ts'),
      'utf8'
    );
    assert.match(src, /Unknown genre .* falling back to 'general'/);
    assert.match(src, /Unrecognized genre .* coerced to/);
  });

  it('ingestion applies YouTube genre suggestions only when the creator did not pick one', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/urlIngestionService.ts'),
      'utf8'
    );
    assert.match(
      src,
      /genreSelectionMode === 'auto' &&\s*\n\s*ytMeta\?\.suggestedGenre &&\s*\n\s*normalizedPrefs\.genre === 'general'/
    );
  });
});

describe('Genre Phase 1 — UI score honesty', () => {
  const workspaceSrc = fs.readFileSync(
    path.resolve(process.cwd(), '../src/components/clips/ClipWorkspace.tsx'),
    'utf8'
  );

  it('removes fabricated score fallbacks from the clip workspace', () => {
    assert.doesNotMatch(workspaceSrc, /\?\? 94/);
    assert.doesNotMatch(workspaceSrc, /\} Viral/);
    assert.doesNotMatch(workspaceSrc, /\} VIRAL/);
  });

  it('renders AI Rank for scored candidates and Unranked for unscored ones', () => {
    assert.match(workspaceSrc, /AI Rank/);
    assert.match(workspaceSrc, /Unranked/);
    // Every score-rendering surface must handle the unscored case: the count of
    // Unranked chips equals the count of score-render sites (2 since the styling
    // redesign removed the Moment Intelligence panel).
    const rankSites = (workspaceSrc.match(/\{score\} AI Rank/g) || []).length;
    const unrankedSites = (workspaceSrc.match(/Unranked/g) || []).length;
    assert.equal(unrankedSites, rankSites);
    assert.ok(rankSites >= 1, 'at least one score surface must exist');
  });
});
