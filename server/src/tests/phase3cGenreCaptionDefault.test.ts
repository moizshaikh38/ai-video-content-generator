import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProducerPlanningService } from '../services/producerPlanningService.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { CaptionStyle, ClipRecord, ContentGenre } from '../types/index.js';

/**
 * Phase 3c: genre-aware caption default wiring.
 *
 * The genre profiles' producerDefaults.captionStyle existed but was never
 * consumed: every BALANCED-mode producer plan hardcoded the 'highlight'
 * caption style. Now the genre default fills the BALANCED default, while
 * LIGHT/AGGRESSIVE (explicit user intensity choices) keep their styles.
 */

const genreDefault = (g: ContentGenre): CaptionStyle | undefined =>
  GenreIntelligenceService.getGenreProfile(g).producerDefaults.captionStyle;

describe('resolveCaptionStyleDefault precedence', () => {
  it('BALANCED mode takes the genre profile caption default', () => {
    for (const genre of ['podcast_interview', 'gaming', 'storytelling', 'motivation'] as ContentGenre[]) {
      const expected = genreDefault(genre);
      const res = ProducerPlanningService.resolveCaptionStyleDefault(genre, 'BALANCED');
      assert.equal(res.style, expected, `${genre} should resolve its own default`);
      assert.equal(res.genreApplied, expected !== 'highlight');
    }
  });

  it('BALANCED mode without a genre keeps the previous highlight default', () => {
    const res = ProducerPlanningService.resolveCaptionStyleDefault(undefined, 'BALANCED');
    assert.equal(res.style, 'highlight');
    assert.equal(res.genreApplied, false);
  });

  it('LIGHT keeps clean regardless of genre (explicit minimal choice)', () => {
    const res = ProducerPlanningService.resolveCaptionStyleDefault('gaming', 'LIGHT');
    assert.equal(res.style, 'clean');
    assert.equal(res.genreApplied, false);
  });

  it('AGGRESSIVE keeps bold regardless of genre (explicit loud choice)', () => {
    const res = ProducerPlanningService.resolveCaptionStyleDefault('podcast_interview', 'AGGRESSIVE');
    assert.equal(res.style, 'bold');
    assert.equal(res.genreApplied, false);
  });

  it('every genre default is a valid caption style consumed by the renderer', () => {
    // If a genre profile named a style the render path does not know, the
    // wiring would produce an unrenderable op. The CaptionStyle union is
    // compile-time; this pins the runtime values too.
    const known: CaptionStyle[] = [
      'clean', 'bold', 'minimal', 'podcast', 'highlight', 'karaoke',
      'deep_diver', 'youshaei', 'simple', 'beasty', 'mozi', 'popline',
    ];
    for (const genre of [
      'podcast_interview', 'education_tutorial', 'motivation', 'business_finance',
      'gaming', 'sports', 'news_politics', 'comedy_entertainment', 'storytelling',
      'product_marketing', 'general',
    ] as ContentGenre[]) {
      const res = ProducerPlanningService.resolveCaptionStyleDefault(genre, 'BALANCED');
      assert.ok(known.includes(res.style), `${genre} resolved unknown style ${res.style}`);
    }
  });
});

describe('evaluateCaptionStyle wiring (the actual op builder)', () => {
  const dummyClip = (genre?: string): ClipRecord => ({
    id: 'd9b1a7d6-3e4f-4d9a-9e12-7f8e9a0b1c2d',
    project_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    user_id: 'test-user',
    title: 'Test Clip',
    start_seconds: 10.0,
    end_seconds: 25.0,
    duration_seconds: 15.0,
    aspect_ratio: '9:16',
    crop_mode: 'center',
    source_storage_path: 'sources/dummy.mp4',
    render_status: 'draft',
    genre,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as ClipRecord);

  it('BALANCED plan op carries the genre default style for a gaming clip', () => {
    const op = ProducerPlanningService.evaluateCaptionStyle(dummyClip('gaming'), 'tiktok', 'BALANCED', null);
    assert.ok(op);
    assert.equal(op.parameters.style, genreDefault('gaming'));
    assert.match(op.reason, /Gaming/);
  });

  it('BALANCED plan op falls back to highlight without a genre', () => {
    const op = ProducerPlanningService.evaluateCaptionStyle(dummyClip(undefined), 'tiktok', 'BALANCED', null);
    assert.ok(op);
    assert.equal(op.parameters.style, 'highlight');
  });

  it('AGGRESSIVE plan op stays bold even with a genre set', () => {
    const op = ProducerPlanningService.evaluateCaptionStyle(dummyClip('gaming'), 'tiktok', 'AGGRESSIVE', null);
    assert.ok(op);
    assert.equal(op.parameters.style, 'bold');
  });
});

describe('genre op toggles: hook banner and punch-in (previously dead config)', () => {
  it('toggles mirror each genre profile exactly', () => {
    for (const genre of [
      'podcast_interview', 'education_tutorial', 'motivation', 'business_finance',
      'gaming', 'sports', 'news_politics', 'comedy_entertainment', 'storytelling',
      'product_marketing', 'general',
    ] as ContentGenre[]) {
      const pd = GenreIntelligenceService.getGenreProfile(genre).producerDefaults;
      assert.equal(ProducerPlanningService.resolveGenreOpToggle(genre, 'hookBannerEnabled'), Boolean(pd.hookBannerEnabled), `${genre} hook`);
      assert.equal(ProducerPlanningService.resolveGenreOpToggle(genre, 'punchInClimax'), Boolean(pd.punchInClimax), `${genre} punch`);
    }
  });

  it('spot-checks the actual profile values (test assumptions stay honest)', () => {
    // As of this audit: hook banner only for education_tutorial and
    // product_marketing; punch-in only for motivation, gaming, comedy.
    assert.equal(ProducerPlanningService.resolveGenreOpToggle('gaming', 'punchInClimax'), true);
    assert.equal(ProducerPlanningService.resolveGenreOpToggle('gaming', 'hookBannerEnabled'), false);
    assert.equal(ProducerPlanningService.resolveGenreOpToggle('education_tutorial', 'hookBannerEnabled'), true);
    assert.equal(ProducerPlanningService.resolveGenreOpToggle('podcast_interview', 'punchInClimax'), false);
  });

  it('no genre keeps the previous always-on behavior', () => {
    assert.equal(ProducerPlanningService.resolveGenreOpToggle(undefined, 'hookBannerEnabled'), true);
    assert.equal(ProducerPlanningService.resolveGenreOpToggle(undefined, 'punchInClimax'), true);
  });

  it('evaluatePunchIn returns null for a punch-in-disabled genre, op otherwise', () => {
    const off = ProducerPlanningService.evaluatePunchIn(10, 25, [], null, 'BALANCED', 'podcast_interview');
    assert.equal(off, null);
    const on = ProducerPlanningService.evaluatePunchIn(10, 25, [], null, 'BALANCED', 'gaming');
    assert.ok(on);
    assert.equal(on.type, 'PUNCH_IN');
  });
});
