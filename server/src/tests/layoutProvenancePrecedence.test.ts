/**
 * Layout provenance precedence regression suite.
 *
 * Defect: a GPT genre classification (e.g. a documentary labeled
 * 'education_tutorial') stamped the genre profile's recommendedLayoutMode
 * ('screencast') onto every candidate; clip creation copied it into
 * crop_config.layout_mode, and the reframe analysis returned it as
 * preferredMode BEFORE consulting measured face samples. Documentary footage
 * rendered as split_stacked screencast: the same content wide on top and
 * zoomed below. Measured with the NASA Moon Base source (15 Nov 2026).
 *
 * Fix: CropConfig.layout_mode_source marks the stamp 'genre_recommendation';
 * SmartReframeService.resolveLayoutWithProvenance demotes it to a fallback
 * hint. 'screencast' now requires a measured screen signal (static facecam
 * track) so the gaming facecam layout keeps working while faceless sources
 * get the measured layout.
 */

import assert from 'node:assert/strict';
import { SmartReframeService } from '../services/smartReframeService.js';
import { NormalizedFaceDetection, ReframeSample } from '../types/index.js';

let passed = 0;
let total = 0;

async function it(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function face(cx: number, cy = 0.5): NormalizedFaceDetection {
  return { x: cx - 0.05, y: cy - 0.1, width: 0.1, height: 0.2, center_x: cx, center_y: cy, confidence: 0.9 };
}

function samplesWithFaces(facesPerSample: NormalizedFaceDetection[][], count = 20): ReframeSample[] {
  const out: ReframeSample[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ time: i * 0.5, faces: facesPerSample[i % facesPerSample.length] });
  }
  return out;
}

const noFaceSamples = samplesWithFaces([[]]); // 100% faceless: documentary / B-roll
const singleFaceSamples = samplesWithFaces([[face(0.5)]]); // one persistent centered subject
const twoShotSamples = samplesWithFaces([[face(0.2), face(0.8)]]); // two-shot conversation

async function run() {
  console.log('\n[LayoutProvenance] determineOptimalLayoutMode fallback semantics');

  await it('empty samples keep the historical blur default when no fallback is given', () => {
    const r = SmartReframeService.determineOptimalLayoutMode([]);
    assert.equal(r.layoutMode, 'blur');
  });

  await it('empty samples honor the caller fallback hint', () => {
    const r = SmartReframeService.determineOptimalLayoutMode([], { fallbackMode: 'screencast' });
    assert.equal(r.layoutMode, 'screencast');
  });

  await it('preferredMode still short-circuits measurement (authoritative path unchanged)', () => {
    const r = SmartReframeService.determineOptimalLayoutMode(singleFaceSamples, { preferredMode: 'screencast' });
    assert.equal(r.layoutMode, 'screencast');
  });

  await it('measured no-face outcome is blur even when a screencast fallback exists', () => {
    const r = SmartReframeService.determineOptimalLayoutMode(noFaceSamples, { fallbackMode: 'screencast' });
    assert.equal(r.layoutMode, 'blur');
  });

  console.log('\n[LayoutProvenance] resolveLayoutWithProvenance precedence');

  await it('user-chosen crop layout wins over measurement', () => {
    const r = SmartReframeService.resolveLayoutWithProvenance({
      cropLayoutMode: 'screencast',
      cropLayoutSource: 'user',
      samples: noFaceSamples,
      facecamSuggestionPresent: false,
    });
    assert.equal(r.layoutMode, 'screencast');
  });

  await it('legacy unknown-provenance crop layout wins over measurement (preserved behavior)', () => {
    const r = SmartReframeService.resolveLayoutWithProvenance({
      cropLayoutMode: 'screencast',
      cropLayoutSource: 'legacy_unknown',
      samples: noFaceSamples,
      facecamSuggestionPresent: false,
    });
    assert.equal(r.layoutMode, 'screencast');
  });

  await it('crop layout without a source marker is treated as legacy and wins', () => {
    const r = SmartReframeService.resolveLayoutWithProvenance({
      cropLayoutMode: 'screencast',
      samples: noFaceSamples,
      facecamSuggestionPresent: false,
    });
    assert.equal(r.layoutMode, 'screencast');
  });

  await it('NASA regression: genre-stamped screencast on faceless documentary yields measured blur', () => {
    const r = SmartReframeService.resolveLayoutWithProvenance({
      cropLayoutMode: 'screencast',
      cropLayoutSource: 'genre_recommendation',
      samples: noFaceSamples,
      facecamSuggestionPresent: false,
    });
    assert.equal(r.layoutMode, 'blur');
  });

  await it('genre-stamped screencast without a facecam signal yields measured track, not split_stacked', () => {
    const r = SmartReframeService.resolveLayoutWithProvenance({
      cropLayoutMode: 'screencast',
      cropLayoutSource: 'genre_recommendation',
      samples: singleFaceSamples,
      facecamSuggestionPresent: false,
    });
    assert.equal(r.layoutMode, 'track');
  });

  await it('genre-stamped screencast WITH a static facecam signal keeps the screencast layout (gaming)', () => {
    const r = SmartReframeService.resolveLayoutWithProvenance({
      cropLayoutMode: 'screencast',
      cropLayoutSource: 'genre_recommendation',
      samples: singleFaceSamples,
      facecamSuggestionPresent: true,
    });
    assert.equal(r.layoutMode, 'screencast');
  });

  await it('measured two-shot conversation beats a genre screencast hint even with a facecam-like track', () => {
    const r = SmartReframeService.resolveLayoutWithProvenance({
      cropLayoutMode: 'screencast',
      cropLayoutSource: 'genre_recommendation',
      samples: twoShotSamples,
      facecamSuggestionPresent: true,
    });
    assert.equal(r.layoutMode, 'split');
    assert.ok(typeof r.speaker1X === 'number' && typeof r.speaker2X === 'number');
  });

  await it('project genre profile hint (no crop layout) engages screencast only with the facecam signal', () => {
    const withSignal = SmartReframeService.resolveLayoutWithProvenance({
      genrePreferredLayoutMode: 'screencast',
      samples: singleFaceSamples,
      facecamSuggestionPresent: true,
    });
    assert.equal(withSignal.layoutMode, 'screencast');
    const withoutSignal = SmartReframeService.resolveLayoutWithProvenance({
      genrePreferredLayoutMode: 'screencast',
      samples: noFaceSamples,
      facecamSuggestionPresent: false,
    });
    assert.equal(withoutSignal.layoutMode, 'blur');
  });

  await it('genre hint survives when measurement is unavailable (empty samples)', () => {
    const r = SmartReframeService.resolveLayoutWithProvenance({
      cropLayoutMode: 'screencast',
      cropLayoutSource: 'genre_recommendation',
      samples: [],
      facecamSuggestionPresent: false,
    });
    assert.equal(r.layoutMode, 'screencast');
  });

  console.log(`\n  ${passed}/${total} layout provenance tests passed`);
  if (passed !== total) process.exitCode = 1;
}

run();
