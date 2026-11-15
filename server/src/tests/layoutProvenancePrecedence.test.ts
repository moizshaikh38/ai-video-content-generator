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

function face(cx: number, cy = 0.5, w = 0.1, h = 0.2): NormalizedFaceDetection {
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h, center_x: cx, center_y: cy, confidence: 0.9 };
}

// A tiny detection: 0.5% of frame - distant person in a wide shot.
const tinyFace = (cx: number) => face(cx, 0.5, 0.05, 0.1);
// An anchorable close subject: 4% of frame.
const closeFace = (cx: number) => face(cx, 0.5, 0.2, 0.2);

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

  console.log('\n[LayoutProvenance] track anchorability (area rule)');

  await it('tiny distant faces everywhere never anchor a tight crop (NASA pattern -> blur)', () => {
    const r = SmartReframeService.determineOptimalLayoutMode(samplesWithFaces([[tinyFace(0.5)]]));
    assert.equal(r.layoutMode, 'blur');
  });

  await it('mixed-shot clip with anchorable subject in only 25% of samples fits full frame', () => {
    // 3 tiny-face samples per 1 close-face sample, matching the measured NASA ratio.
    const mixed = samplesWithFaces([[tinyFace(0.5)], [tinyFace(0.6)], [tinyFace(0.4)], [closeFace(0.5)]], 40);
    const r = SmartReframeService.determineOptimalLayoutMode(mixed);
    assert.equal(r.layoutMode, 'blur');
  });

  await it('anchorable subject in 60% of samples keeps track', () => {
    const mostlyClose = samplesWithFaces([[closeFace(0.5)], [closeFace(0.52)], [closeFace(0.48)], [tinyFace(0.5)], [tinyFace(0.6)]], 40);
    const r = SmartReframeService.determineOptimalLayoutMode(mostlyClose);
    assert.equal(r.layoutMode, 'track');
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

  await it('SMALL static facecam (typical gameplay capture) engages screencast via the genre hint', () => {
    // Regression coverage for the 15 Nov 2026 fixture verification: a 0.5%-of-frame
    // static face measures 'blur' under the anchor rule; the facecam suggestion must
    // still let the genre hint engage.
    const smallFacecamSamples = samplesWithFaces([[tinyFace(0.9)]]);
    const r = SmartReframeService.resolveLayoutWithProvenance({
      cropLayoutMode: 'screencast',
      cropLayoutSource: 'genre_recommendation',
      samples: smallFacecamSamples,
      facecamSuggestionPresent: true,
    });
    assert.equal(r.layoutMode, 'screencast');
  });

  await it('tiny faces WITHOUT a facecam signal keep measured blur (NASA pattern guard)', () => {
    const r = SmartReframeService.resolveLayoutWithProvenance({
      cropLayoutMode: 'screencast',
      cropLayoutSource: 'genre_recommendation',
      samples: samplesWithFaces([[tinyFace(0.5)]]),
      facecamSuggestionPresent: false,
    });
    assert.equal(r.layoutMode, 'blur');
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

  // estimateSpeakerAnchors: credible two-speaker anchor estimation for manual
  // Split picks (same spatial rule as the split decision, no prevalence gate).
  await it('estimateSpeakerAnchors: two-shot samples yield measured anchors', () => {
    const a = SmartReframeService.estimateSpeakerAnchors(samplesWithFaces([[face(0.31), face(0.59)]]));
    assert.ok(a, 'anchors present');
    assert.equal(a!.speaker1X, 0.31);
    assert.equal(a!.speaker2X, 0.59);
  });

  await it('estimateSpeakerAnchors: sparse two-speaker evidence still anchors (below the 20% decision gate)', () => {
    // 2 of 36 samples qualify - exactly the tos-twoshot failure mode where the
    // split DECISION correctly stays off but anchors should still be measured.
    const per: NormalizedFaceDetection[][] = [[face(0.31), face(0.59)], [face(0.32), face(0.6)], ...Array.from({ length: 34 }, () => [face(0.5)])];
    const a = SmartReframeService.estimateSpeakerAnchors(samplesWithFaces(per, 36));
    assert.ok(a, 'anchors present from 2 qualifying samples');
    assert.ok(Math.abs(a!.speaker1X - 0.315) < 0.01);
    assert.ok(Math.abs(a!.speaker2X - 0.595) < 0.01);
  });

  await it('estimateSpeakerAnchors: single-subject and faceless clips return null (no fabricated anchors)', () => {
    assert.equal(SmartReframeService.estimateSpeakerAnchors(singleFaceSamples), null);
    assert.equal(SmartReframeService.estimateSpeakerAnchors(noFaceSamples), null);
    assert.equal(SmartReframeService.estimateSpeakerAnchors([]), null);
  });

  await it('estimateSpeakerAnchors: one stray two-face sample is not credible', () => {
    const per: NormalizedFaceDetection[][] = [[face(0.2), face(0.8)], ...Array.from({ length: 19 }, () => [face(0.5)])];
    assert.equal(SmartReframeService.estimateSpeakerAnchors(samplesWithFaces(per, 20)), null);
  });

  await it('estimateSpeakerAnchors: near-center pair (0.40/0.55) still anchors both windows', () => {
    // two people side by side near center: each gets centered in their half
    const a = SmartReframeService.estimateSpeakerAnchors(samplesWithFaces([[face(0.4), face(0.55)]]));
    assert.ok(a);
    assert.equal(a!.speaker1X, 0.4);
    assert.equal(a!.speaker2X, 0.55);
  });

  await it('estimateSpeakerAnchors: same-side pair is not two-speaker geometry', () => {
    assert.equal(SmartReframeService.estimateSpeakerAnchors(samplesWithFaces([[face(0.2), face(0.35)]])), null);
    // and a pair below the 0.15 separation floor
    assert.equal(SmartReframeService.estimateSpeakerAnchors(samplesWithFaces([[face(0.45), face(0.55)]])), null);
  });

  console.log(`\n  ${passed}/${total} layout provenance tests passed`);
  if (passed !== total) process.exitCode = 1;
}

run();
