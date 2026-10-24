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
    // Education weights: hook .20, standalone .35, insight .30, audio .05, visual .10.
    // Inputs: hook 90, standalone 90, insight omitted, no timeline (visual 60, audio 70).
    // Signal adjustments: hook text ≥10 chars → hook 94; 30s below the 35s genre min → standalone 82.
    // Renormalized: (0.2*94 + 0.35*82 + 0.1*60 + 0.05*70) / 0.70 = 57/0.7 = 81.43
    // platform_fit (30s < 35s min but ≤ 60s) = 85 → overall = 81.43*0.9 + 85*0.1 = 81.79 → 82.
    // The old fabricated-70 insight would have scored 79.
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

    assert.equal(result.vireo_score, 82);
    assert.equal(result.explanation.insight_score, null);
    assert.ok(
      result.explanation.reasons.some((r) => /insight subscore/.test(r)),
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
    // Manual: hook 94 (+4 text), standalone 82 (−8 duration), insight 90, visual 60, audio 70
    // → (0.2*94 + 0.35*82 + 0.3*90 + 0.1*60 + 0.05*70)/1.0 = 84 → 84*0.9 + 85*0.1 = 84.1 → 84
    assert.equal(withAll.vireo_score, 84);
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
    assert.ok((workspaceSrc.match(/Unranked/g) || []).length >= 3, 'all three score surfaces must handle unscored candidates');
  });
});
