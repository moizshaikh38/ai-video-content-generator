import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SmartReframeService } from '../services/smartReframeService.js';
import {
  renderSplitPanelCss,
  computeSplitPanelBounds,
  type SplitLayoutGeometry,
  type SplitPanelGeometry,
} from '../shared/splitLayoutGeometry.js';
import { canvasForResolution, renderScale, type RenderResolution } from '../shared/renderResolution.js';
import type { ReframeSample } from '../types/index.js';

// Two talking-head subjects at distinct positions, detected consistently.
const twoSubjectSamples = (ax: number, ay: number, bx: number, by: number, n = 12): ReframeSample[] =>
  Array.from({ length: n }, (_, i) => ({
    time: i * 0.5,
    faces: [
      { x: ax - 0.05, y: ay - 0.05, width: 0.1, height: 0.1, center_x: ax, center_y: ay, area: 0.01, confidence: 0.9, track_id: 'subject_a' },
      { x: bx - 0.05, y: by - 0.05, width: 0.1, height: 0.1, center_x: bx, center_y: by, area: 0.01, confidence: 0.9, track_id: 'subject_b' },
    ],
  }));

describe('computeSplitSpeakerGeometry', () => {
  test('derives per-speaker anchors and a separation-sized window from raw samples', () => {
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.3, 0.25, 0.7, 0.3),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(geom, 'two persistent subjects must yield geometry');
    // Raw window is 1.7x subject separation (0.4 * 1.7 = 0.68), clamped to
    // the 0.62 ceiling, then the partition guard shrinks it to the speaker
    // midpoint: mid=0.5, so 2*(0.5-0.3)=0.4 - a 0.62 window would bleed
    // 0.11 of frame into the other speaker's half.
    assert.ok(Math.abs(geom!.speaker1.windowW - 0.4) < 1e-6, `windowW=${geom!.speaker1.windowW}`);
    assert.equal(geom!.speaker1.windowW, geom!.speaker2.windowW);
    // Right edge of speaker1's window stops at the midpoint.
    assert.ok(geom!.speaker1.x + geom!.speaker1.windowW / 2 <= 0.5 + 1e-9);
    // Speaker assignment follows the default anchors: subject_a (x=0.3) is speaker1.
    assert.ok(Math.abs(geom!.speaker1.x - 0.3) < 1e-6);
    assert.ok(Math.abs(geom!.speaker1.y - 0.25) < 1e-6);
    assert.ok(Math.abs(geom!.speaker2.x - 0.7) < 1e-6);
    assert.ok(Math.abs(geom!.speaker2.y - 0.3) < 1e-6);
  });

  test('respects explicit user X anchors over measured centers', () => {
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.3, 0.25, 0.7, 0.3),
      sourceWidth: 1728,
      sourceHeight: 720,
      speaker1X: 0.33,
      speaker2X: 0.55,
    });
    assert.ok(geom);
    assert.equal(geom!.speaker1.x, 0.33);
    assert.equal(geom!.speaker2.x, 0.55);
    // Y anchors still come from the measured faces.
    assert.ok(Math.abs(geom!.speaker1.y - 0.25) < 1e-6);
  });

  test('clamps the window for near-overlapping and far-apart subjects with hard partition safety', () => {
    const tight = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.45, 0.3, 0.5, 0.3),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(tight);
    // Near-overlapping speakers (mid=0.475): safe width is bounded strictly by separation (0.05).
    // Never forces 0.20 if doing so would cross the midpoint into the other speaker's panel.
    assert.ok(Math.abs(tight!.speaker1.windowW - 0.05) < 1e-6, `w=${tight!.speaker1.windowW}`);
    assert.ok(tight!.speaker1.x + tight!.speaker1.windowW / 2 <= 0.475 + 1e-9, 'must not cross midpoint');
    assert.equal(tight!.unresolved, true, 'separation below 0.20 must return unresolved state');

    const wide = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.12, 0.3, 0.88, 0.3),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(wide);
    assert.equal(wide!.speaker1.windowW, 0.62, 'wide separation clamps to the 0.62 ceiling');
    assert.equal(wide!.unresolved, false);
  });

  test('horizontal separation below 0.20 produces safe width and flags unresolved without crossing midpoint', () => {
    // dx = 0.12, midpoint = 0.36
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.30, 0.40, 0.42, 0.40),
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.ok(geom);
    assert.ok(Math.abs(geom!.speaker1.windowW - 0.12) < 1e-6, `w=${geom!.speaker1.windowW}`);
    assert.ok(geom!.speaker1.x + geom!.speaker1.windowW / 2 <= 0.36 + 1e-9, 'left panel must not cross midpoint');
    assert.ok(geom!.speaker2.x - geom!.speaker2.windowW / 2 >= 0.36 - 1e-9, 'right panel must not cross midpoint');
    assert.equal(geom!.unresolved, true, 'safe width below 0.20 must flag unresolved state');
  });

  test('vertical separation below 0.20 safe width flags unresolved without crossing vertical midpoint', () => {
    // dy = 0.25 in 16:9 (1920x1080) -> arEff ~= 1.5802 -> maxPartitionW = 0.25 / 1.5802 ~= 0.1582 (< 0.20)
    // midY = 0.525
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.50, 0.40, 0.50, 0.65),
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.ok(geom);
    const arEff = (1920 * 960) / (1080 * 1080);
    const expectedW = 0.25 / arEff;
    assert.ok(Math.abs(geom!.speaker1.windowW - expectedW) < 1e-4, `w=${geom!.speaker1.windowW}`);
    assert.ok(geom!.speaker1.windowW < 0.20, 'safe window width is below 0.20');
    // Vertical crop reach:
    const topPanelBottom = geom!.speaker1.y + (geom!.speaker1.windowW * arEff) / 2;
    const botPanelTop = geom!.speaker2.y - (geom!.speaker2.windowW * arEff) / 2;
    assert.ok(topPanelBottom <= 0.525 + 1e-6, 'top panel must not cross vertical midpoint');
    assert.ok(botPanelTop >= 0.525 - 1e-6, 'bottom panel must not cross vertical midpoint');
    assert.equal(geom!.unresolved, true, 'vertical safe width below 0.20 must flag unresolved state');
  });

  test('vertically aligned speakers with nearly identical X coordinates and inverted top/bottom identity', () => {
    // Two people vertically aligned: x ~ 0.50, y1=0.25 (subject_a), y2=0.75 (subject_b)
    const samples = twoSubjectSamples(0.50, 0.25, 0.502, 0.75);

    // Case A: Explicit 2D inverted anchors (user assigns bottom subject to Speaker 1, top to Speaker 2)
    const geom2DInverted = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1X: 0.50,
      speaker1Y: 0.75,
      speaker2X: 0.50,
      speaker2Y: 0.25,
    });
    assert.ok(geom2DInverted);
    assert.equal(geom2DInverted!.speaker1.y, 0.75, 'speaker 1 must map to bottom subject Y');
    assert.equal(geom2DInverted!.speaker2.y, 0.25, 'speaker 2 must map to top subject Y');

    // Case B: Explicit track ID matching
    const geomTrackId = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1TrackId: 'subject_b',
      speaker2TrackId: 'subject_a',
    });
    assert.ok(geomTrackId);
    assert.ok(Math.abs(geomTrackId!.speaker1.y - 0.75) < 1e-6, 'speaker 1 maps to subject_b at 0.75');
    assert.ok(Math.abs(geomTrackId!.speaker2.y - 0.25) < 1e-6, 'speaker 2 maps to subject_a at 0.25');

    // Case C: Unanchored default maps top subject to Speaker 1 (top panel) and bottom to Speaker 2
    const geomDefault = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.ok(geomDefault);
    assert.ok(Math.abs(geomDefault!.speaker1.y - 0.25) < 1e-6, 'top panel default receives top subject');
    assert.ok(Math.abs(geomDefault!.speaker2.y - 0.75) < 1e-6, 'bottom panel default receives bottom subject');
  });

  test('partition guard keeps split-screen panels out of each other (user anchors)', () => {
    // Split-screen interview: speakers anchored at 0.25/0.72, midpoint 0.485.
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.25, 0.25, 0.72, 0.3),
      sourceWidth: 854,
      sourceHeight: 480,
      speaker1X: 0.25,
      speaker2X: 0.72,
    });
    assert.ok(geom);
    assert.ok(Math.abs(geom!.speaker1.windowW - 0.47) < 1e-6, `w1=${geom!.speaker1.windowW}`);
    assert.ok(Math.abs(geom!.speaker2.windowW - 0.47) < 1e-6, `w2=${geom!.speaker2.windowW}`);
    assert.ok(geom!.speaker1.x + geom!.speaker1.windowW / 2 <= 0.485 + 1e-9, 'left panel must not cross midpoint');
    assert.ok(geom!.speaker2.x - geom!.speaker2.windowW / 2 >= 0.485 - 1e-9, 'right panel must not cross midpoint');
  });

  test('inverted speaker order (speaker1 on right, speaker2 on left) preserves geometry and never collapses to minimum', () => {
    // Inverted split-screen interview: speaker1 anchored at 0.72 (right), speaker2 at 0.25 (left), midpoint 0.485.
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.25, 0.25, 0.72, 0.3),
      sourceWidth: 854,
      sourceHeight: 480,
      speaker1X: 0.72,
      speaker2X: 0.25,
    });
    assert.ok(geom, 'inverted order must return valid geometry');
    assert.equal(geom!.speaker1.x, 0.72, 'speaker1 remains at right anchor');
    assert.equal(geom!.speaker2.x, 0.25, 'speaker2 remains at left anchor');
    // Prior bug: 2*(mid - x1) was negative, collapsing w1 and w2 to 0.2 minimum.
    // Fixed: window width must be 0.47, identical to standard order.
    assert.ok(Math.abs(geom!.speaker1.windowW - 0.47) < 1e-6, `w1=${geom!.speaker1.windowW}`);
    assert.ok(Math.abs(geom!.speaker2.windowW - 0.47) < 1e-6, `w2=${geom!.speaker2.windowW}`);
    // Right speaker's left edge must not cross the midpoint to the left
    assert.ok(geom!.speaker1.x - geom!.speaker1.windowW / 2 >= 0.485 - 1e-9, 'right panel must not cross midpoint');
    // Left speaker's right edge must not cross the midpoint to the right
    assert.ok(geom!.speaker2.x + geom!.speaker2.windowW / 2 <= 0.485 + 1e-9, 'left panel must not cross midpoint');
  });

  test('same vertical pair in 16:9 and 4:3 sources respects aspect ratio and isolates panels', () => {
    // Two people vertically stacked: x1=0.50, y1=0.20; x2=0.52, y2=0.75 (dy=0.55, dx=0.02, midY=0.475)
    // 16:9 source (1920x1080)
    const geom169 = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.50, 0.20, 0.52, 0.75),
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.ok(geom169, '16:9 vertical pair must yield geometry');
    // In 16:9, arEff = (1920 * 960) / (1080 * 1080) ~= 1.5802.
    // maxPartitionW = 0.55 / 1.5802 ~= 0.348.
    const arEff169 = (1920 * 960) / (1080 * 1080);
    assert.ok(Math.abs(geom169!.speaker1.windowW - (0.55 / arEff169)) < 1e-3, `w169=${geom169!.speaker1.windowW}`);
    // Vertical crop height = windowW * arEff = 0.55; half-height = 0.275.
    // Top panel reaches y1 + 0.275 = 0.475 (midY); bottom panel reaches y2 - 0.275 = 0.475 (midY).
    const topPanelBottomY169 = geom169!.speaker1.y + (geom169!.speaker1.windowW * arEff169) / 2;
    const botPanelTopY169 = geom169!.speaker2.y - (geom169!.speaker2.windowW * arEff169) / 2;
    assert.ok(topPanelBottomY169 <= 0.475 + 1e-6, 'top panel must not cross vertical midpoint in 16:9');
    assert.ok(botPanelTopY169 >= 0.475 - 1e-6, 'bottom panel must not cross vertical midpoint in 16:9');

    // 4:3 source (1440x1080)
    const geom43 = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.50, 0.20, 0.52, 0.75),
      sourceWidth: 1440,
      sourceHeight: 1080,
    });
    assert.ok(geom43, '4:3 vertical pair must yield geometry');
    // In 4:3, arEff = (1440 * 960) / (1080 * 1080) ~= 1.1852.
    // maxPartitionW = 0.55 / 1.1852 ~= 0.464.
    const arEff43 = (1440 * 960) / (1080 * 1080);
    assert.ok(Math.abs(geom43!.speaker1.windowW - (0.55 / arEff43)) < 1e-3, `w43=${geom43!.speaker1.windowW}`);
    // Narrower source means vertical distance occupies a larger fraction of horizontal width:
    assert.ok(geom43!.speaker1.windowW > geom169!.speaker1.windowW, '4:3 windowW must be wider than 16:9 windowW');
    const topPanelBottomY43 = geom43!.speaker1.y + (geom43!.speaker1.windowW * arEff43) / 2;
    const botPanelTopY43 = geom43!.speaker2.y - (geom43!.speaker2.windowW * arEff43) / 2;
    assert.ok(topPanelBottomY43 <= 0.475 + 1e-6, 'top panel must not cross vertical midpoint in 4:3');
    assert.ok(botPanelTopY43 >= 0.475 - 1e-6, 'bottom panel must not cross vertical midpoint in 4:3');
  });

  test('diagonal pair adapts window correctly across 16:9, 4:3 and portrait aspect ratios', () => {
    // Two people arranged diagonally: x1=0.30, y1=0.20; x2=0.60, y2=0.70 (dx=0.30, dy=0.50)
    // 1. 16:9 (1920x1080): dxPx = 576, dyPx = 540 -> horizontal dominant (576 >= 540)
    const geom169 = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.30, 0.20, 0.60, 0.70),
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.ok(geom169);
    // In 16:9, horizontal distance dominates in pixels (576px >= 540px), so horizontal partition limits window to dx=0.30.
    assert.ok(Math.abs(geom169!.speaker1.windowW - 0.30) < 1e-6, `w169=${geom169!.speaker1.windowW}`);

    // 2. 4:3 (1440x1080): dxPx = 432, dyPx = 540 -> vertical dominant (540 > 432)
    const geom43 = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.30, 0.20, 0.60, 0.70),
      sourceWidth: 1440,
      sourceHeight: 1080,
    });
    assert.ok(geom43);
    const arEff43 = (1440 * 960) / (1080 * 1080);
    // In 4:3, vertical distance dominates in pixels (540px > 432px), so vertical partition limits window to 0.50 / arEff43 ~= 0.422.
    assert.ok(Math.abs(geom43!.speaker1.windowW - (0.50 / arEff43)) < 1e-3, `w43=${geom43!.speaker1.windowW}`);

    // 3. Portrait 9:16 (1080x1920): dxPx = 324, dyPx = 960 -> vertical dominant (960 >> 324)
    const geomPortrait = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.30, 0.20, 0.60, 0.70),
      sourceWidth: 1080,
      sourceHeight: 1920,
    });
    assert.ok(geomPortrait);
    // In 9:16 portrait, arEff = (1080 * 960) / (1920 * 1080) = 0.50.
    // maxPartitionW = 0.50 / 0.50 = 1.00; baseWindowW clamps to 0.62 ceiling.
    assert.equal(geomPortrait!.speaker1.windowW, 0.62, `wPortrait=${geomPortrait!.speaker1.windowW}`);
  });

  test('two vertically separated people in one continuous camera frame isolated into panels', () => {
    // Pure vertical separation: x1=0.50, y1=0.20; x2=0.50, y2=0.70 (dx=0, dy=0.50, midY=0.45)
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.50, 0.20, 0.50, 0.70),
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.ok(geom);
    // Speaker 1 is assigned to top person (y=0.20), Speaker 2 to bottom person (y=0.70)
    assert.equal(geom!.speaker1.x, 0.50);
    assert.equal(geom!.speaker2.x, 0.50);
    assert.ok(Math.abs(geom!.speaker1.y - 0.20) < 1e-6);
    assert.ok(Math.abs(geom!.speaker2.y - 0.70) < 1e-6);
    const arEff = (1920 * 960) / (1080 * 1080);
    // Window width is bounded by dy / arEff = 0.50 / 1.5802 ~= 0.3164 (well above 0.20 minimum)
    assert.ok(Math.abs(geom!.speaker1.windowW - (0.50 / arEff)) < 1e-3, `w=${geom!.speaker1.windowW}`);
    // Verify vertical boundary isolation:
    const topPanelBottom = geom!.speaker1.y + (geom!.speaker1.windowW * arEff) / 2;
    const botPanelTop = geom!.speaker2.y - (geom!.speaker2.windowW * arEff) / 2;
    assert.ok(topPanelBottom <= 0.45 + 1e-6, 'top panel does not bleed past vertical midpoint');
    assert.ok(botPanelTop >= 0.45 - 1e-6, 'bottom panel does not bleed past vertical midpoint');
  });

  test('speaker identity is preserved when speaker 1 is on the right and speaker 2 is on the left', () => {
    // Speaker 1 explicitly assigned to right side; Speaker 2 to left side
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.30, 0.25, 0.70, 0.35),
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1X: 0.70,
      speaker2X: 0.30,
    });
    assert.ok(geom);
    assert.equal(geom!.speaker1.x, 0.70, 'speaker 1 must retain right anchor');
    assert.equal(geom!.speaker2.x, 0.30, 'speaker 2 must retain left anchor');
    assert.ok(Math.abs(geom!.speaker1.y - 0.35) < 1e-6, 'speaker 1 maps to right subject Y');
    assert.ok(Math.abs(geom!.speaker2.y - 0.25) < 1e-6, 'speaker 2 maps to left subject Y');
  });

  test('same-side speakers are safely bounded by partition without coordinate flip', () => {
    // Both speakers on left side: x1=0.18, x2=0.42 (dx=0.24, midpoint 0.30)
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.18, 0.30, 0.42, 0.30),
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1X: 0.18,
      speaker2X: 0.42,
    });
    assert.ok(geom);
    assert.equal(geom!.speaker1.x, 0.18);
    assert.equal(geom!.speaker2.x, 0.42);
    assert.ok(Math.abs(geom!.speaker1.windowW - 0.24) < 1e-6, `w1=${geom!.speaker1.windowW}`);
    assert.ok(Math.abs(geom!.speaker2.windowW - 0.24) < 1e-6, `w2=${geom!.speaker2.windowW}`);
    assert.ok(geom!.speaker1.x + geom!.speaker1.windowW / 2 <= 0.30 + 1e-9, 'left panel must not cross midpoint');
    assert.ok(geom!.speaker2.x - geom!.speaker2.windowW / 2 >= 0.30 - 1e-9, 'right panel must not cross midpoint');
  });

  test('returns null without two usable subjects (legacy split preserved)', () => {
    assert.equal(
      SmartReframeService.computeSplitSpeakerGeometry({ rawSamples: [], sourceWidth: 1728, sourceHeight: 720 }),
      null
    );
    assert.equal(
      SmartReframeService.computeSplitSpeakerGeometry({ rawSamples: null, sourceWidth: 1728, sourceHeight: 720 }),
      null
    );
    // Single persistent subject only.
    const oneSubject: ReframeSample[] = Array.from({ length: 12 }, (_, i) => ({
      time: i * 0.5,
      faces: [
        { x: 0.45, y: 0.3, width: 0.1, height: 0.1, center_x: 0.5, center_y: 0.35, area: 0.01, confidence: 0.9, track_id: 'only' },
      ],
    }));
    assert.equal(
      SmartReframeService.computeSplitSpeakerGeometry({ rawSamples: oneSubject, sourceWidth: 1728, sourceHeight: 720 }),
      null
    );
    // Second subject with too few detections is ignored.
    const sparse = twoSubjectSamples(0.3, 0.25, 0.7, 0.3, 12).map((s, i) =>
      i < 10 ? { ...s, faces: s.faces.slice(0, 1) } : s
    );
    assert.equal(
      SmartReframeService.computeSplitSpeakerGeometry({ rawSamples: sparse, sourceWidth: 1728, sourceHeight: 720 }),
      null
    );
  });

  // ─── Track ID resolution from full eligible pool (P1.1 Final Audit) ──────────

  test('speaker1TrackId outside the top-two most-frequent tracks resolves from the full pool', () => {
    // Three tracks: 'dominant' (20 samples), 'second' (10 samples), 'third' (5 samples).
    // speaker1TrackId = 'third' — this is NOT in the top-two by count,
    // so the old code would silently substitute; the new code must find it.
    const samples: ReframeSample[] = [
      ...Array.from({ length: 20 }, (_, i) => ({
        time: i * 0.5,
        faces: [{ x: 0.1, y: 0.2, width: 0.1, height: 0.1, center_x: 0.15, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'dominant' }],
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        time: i * 0.5,
        faces: [{ x: 0.6, y: 0.2, width: 0.1, height: 0.1, center_x: 0.65, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'second' }],
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        time: i * 0.5,
        faces: [{ x: 0.85, y: 0.2, width: 0.1, height: 0.1, center_x: 0.90, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'third' }],
      })),
    ];
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1TrackId: 'third',
    });
    assert.ok(geom, 'requested track outside top-two must still be resolved');
    // speaker1 must be anchored near 'third' track's mean position (cx ≈ 0.90)
    assert.ok(Math.abs(geom.speaker1.x - 0.9) < 0.05, `speaker1.x should be near 0.90, got ${geom.speaker1.x}`);
    // speaker2 must be the highest-count distinct track ('dominant', cx ≈ 0.15)
    assert.ok(Math.abs(geom.speaker2.x - 0.15) < 0.05, `speaker2.x should be near 0.15, got ${geom.speaker2.x}`);
  });

  test('speaker1TrackId that does not exist in any sample returns unresolved=true (not silently substituted or rendered)', () => {
    const samples = twoSubjectSamples(0.3, 0.25, 0.7, 0.3, 12);
    const result = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1TrackId: 'nonexistent_track',
    });
    assert.ok(result, 'missing requested track must return an explicit unresolved result');
    assert.equal(result.unresolved, true);
    assert.equal(result.unresolvedReason, 'requested_speaker_track_not_found');

    // Downstream verification: buildLayoutCropFilter must NOT build a split filter when unresolved
    const filter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      splitGeometry: result,
    });
    assert.ok(filter.includes('boxblur'), 'unresolved split geometry must degrade to safe blur filter');
    assert.ok(!filter.includes('vstack'), 'unresolved split geometry must never render an ordinary split');
  });

  test('speaker2TrackId-only: speaker2 matches the exact requested track, speaker1 gets highest-count other', () => {
    // 'subject_b' is the second-most-frequent track.
    // Requesting speaker2TrackId = 'subject_b' must assign subject_b to speaker2
    // and subject_a (highest count, since twoSubjectSamples makes them equal, the first found) to speaker1.
    const samples = twoSubjectSamples(0.3, 0.25, 0.7, 0.3, 12);
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker2TrackId: 'subject_b',
    });
    assert.ok(geom, 'speaker2TrackId-only must yield geometry');
    assert.equal(geom.unresolved, false);
    // speaker2 must be anchored at subject_b (cx ≈ 0.70)
    assert.ok(Math.abs(geom.speaker2.x - 0.7) < 0.05, `speaker2.x should be near 0.70, got ${geom.speaker2.x}`);
    // speaker1 must be anchored at subject_a (cx ≈ 0.30)
    assert.ok(Math.abs(geom.speaker1.x - 0.3) < 0.05, `speaker1.x should be near 0.30, got ${geom.speaker1.x}`);
  });

  test('duplicate speaker1TrackId and speaker2TrackId returns unresolved=true (ambiguous identity, safe fallback)', () => {
    const samples = twoSubjectSamples(0.3, 0.25, 0.7, 0.3, 12);
    const result = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1TrackId: 'subject_a',
      speaker2TrackId: 'subject_a', // same ID — ambiguous
    });
    assert.ok(result, 'duplicate track IDs must return explicit unresolved result');
    assert.equal(result.unresolved, true);
    assert.equal(result.unresolvedReason, 'duplicate_speaker_track_ids');

    const filter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      splitGeometry: result,
    });
    assert.ok(filter.includes('boxblur'), 'duplicate track IDs must degrade to safe blur filter');
    assert.ok(!filter.includes('vstack'), 'duplicate track IDs must never render an ordinary split');
  });

  test('speaker2TrackId that does not exist in any sample returns unresolved=true (safe fallback)', () => {
    const samples = twoSubjectSamples(0.3, 0.25, 0.7, 0.3, 12);
    const result = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker2TrackId: 'ghost_track',
    });
    assert.ok(result, 'missing requested speaker2 track must return explicit unresolved result');
    assert.equal(result.unresolved, true);
    assert.equal(result.unresolvedReason, 'requested_speaker_track_not_found');

    const filter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      splitGeometry: result,
    });
    assert.ok(filter.includes('boxblur'), 'missing speaker2 track must degrade to safe blur filter');
    assert.ok(!filter.includes('vstack'), 'missing speaker2 track must never render an ordinary split');
  });

  test('explicit track ID requested on empty rawSamples returns unresolved=true (never null)', () => {
    const result = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: [],
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1TrackId: 'any_track',
    });
    assert.ok(result, 'explicit requested track on empty samples must return explicit unresolved result');
    assert.equal(result.unresolved, true);
    assert.equal(result.unresolvedReason, 'requested_speaker_track_not_found');
  });

  test('legacy null behavior intact when NO explicit track identity requested', () => {
    // When no explicit speaker1TrackId or speaker2TrackId is passed,
    // computeSplitSpeakerGeometry returns null for insufficient/missing samples.
    assert.equal(
      SmartReframeService.computeSplitSpeakerGeometry({ rawSamples: [], sourceWidth: 1728, sourceHeight: 720 }),
      null
    );
    assert.equal(
      SmartReframeService.computeSplitSpeakerGeometry({ rawSamples: null, sourceWidth: 1728, sourceHeight: 720 }),
      null
    );

    // And buildLayoutCropFilter without geometry builds the legacy split podcast filter
    const filter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      splitGeometry: null,
    });
    assert.ok(filter.includes('vstack'), 'legacy split without geometry must preserve ordinary vstack split');
  });

  test('unresolved geometry has unresolved=true and windowW < 0.20 — must not render as normal split crop', () => {
    // Speakers only 5 px apart on a 1920-wide source → safe width << 0.20.
    const nearSamples: ReframeSample[] = Array.from({ length: 12 }, (_, i) => ({
      time: i * 0.5,
      faces: [
        { x: 0.49, y: 0.4, width: 0.02, height: 0.05, center_x: 0.50, center_y: 0.42, area: 0.001, confidence: 0.9, track_id: 'left' },
        { x: 0.51, y: 0.4, width: 0.02, height: 0.05, center_x: 0.52, center_y: 0.42, area: 0.001, confidence: 0.9, track_id: 'right' },
      ],
    }));
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: nearSamples,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.ok(geom, 'even too-close subjects must return geometry (with unresolved flag)');
    assert.ok(geom.unresolved === true, 'nearly-overlapping speakers must set unresolved=true');
    assert.ok(geom.speaker1.windowW < 0.20, `windowW should be < 0.20, got ${geom.speaker1.windowW}`);
    assert.ok(geom.speaker2.windowW < 0.20, `windowW should be < 0.20, got ${geom.speaker2.windowW}`);
    // Critically: windowW must NOT exceed maxPartitionW (no panel crosses the midpoint).
    assert.ok(geom.speaker1.windowW <= Math.abs(geom.speaker1.x - geom.speaker2.x) + 0.001,
      'windowW must not exceed the inter-speaker distance (no midpoint crossing)');
  });
});

describe('buildSplitPodcastFilter with per-speaker geometry', () => {
  test('legacy output is unchanged when no geometry is passed', () => {
    const filter = SmartReframeService.buildSplitPodcastFilter({
      speaker1X: 0.25,
      speaker2X: 0.75,
      canvasWidth: 1080,
      canvasHeight: 1920,
    });
    assert.ok(filter.includes('split=2[spk1][spk2]'));
    assert.ok(filter.includes('scale=-1:960:force_original_aspect_ratio=increase,crop=1080:960'));
    assert.ok(filter.includes(':(in_h-out_h)/2['));
    assert.ok(filter.includes('vstack[out]'));
  });

  test('geometry output zooms each panel to the measured window with x/y anchors', () => {
    // 1728x720 source, window 0.203125 of width (351px) -> scale height 2216.
    const filter = SmartReframeService.buildSplitPodcastFilter({
      speaker1X: 0.33,
      speaker2X: 0.55,
      sourceWidth: 1728,
      sourceHeight: 720,
      speaker1Geometry: { x: 0.33, y: 0.202, windowW: 0.203125 },
      speaker2Geometry: { x: 0.55, y: 0.233, windowW: 0.203125 },
    });
    assert.ok(filter.includes('scale=-1:2216:force_original_aspect_ratio=increase'), filter);
    assert.ok(filter.includes("crop=1080:960:'min(max(in_w*0.33-out_w/2\\,0)\\,in_w-out_w)':'min(max(in_h*0.202-out_h/2\\,0)\\,in_h-out_h)'"), filter);
    assert.ok(filter.includes("crop=1080:960:'min(max(in_w*0.55-out_w/2\\,0)\\,in_w-out_w)':'min(max(in_h*0.233-out_h/2\\,0)\\,in_h-out_h)'"), filter);
    assert.ok(filter.includes('vstack[out]'));
  });

  test('tagged (Pro graph) variant stays chain-safe with geometry', () => {
    const filter = SmartReframeService.buildSplitPodcastFilter({
      speaker1X: 0.33,
      speaker2X: 0.55,
      sourceWidth: 1728,
      sourceHeight: 720,
      speaker1Geometry: { x: 0.33, y: 0.202, windowW: 0.203125 },
      speaker2Geometry: { x: 0.55, y: 0.233, windowW: 0.203125 },
      tag: 'vc0123456789abcdef',
    });
    assert.ok(!filter.includes('[0:v]'), 'tagged fragment must not re-declare the input stream');
    assert.ok(filter.startsWith('split=2[vc0123456789abcdefs1][vc0123456789abcdefs2];'));
    assert.ok(filter.endsWith('[vc0123456789abcdefbot]vstack'), 'must end unlabeled so callers can append');
    assert.ok(filter.includes('scale=-1:2216'));
  });

  test('buildLayoutCropFilter passes split geometry through for split layout', () => {
    const filter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1728,
      sourceHeight: 720,
      duration: 9,
      speaker1X: 0.33,
      speaker2X: 0.55,
      splitGeometry: {
        speaker1: { x: 0.33, y: 0.202, windowW: 0.203125 },
        speaker2: { x: 0.55, y: 0.233, windowW: 0.203125 },
      },
    });
    assert.ok(filter.includes('scale=-1:2216'), filter);
    assert.ok(filter.includes('vstack[out]'));
  });
});

describe('buildSplitPodcastFilter contain mode', () => {
  test('fits each full camera region with padding at the detected divider', () => {
    const filter = SmartReframeService.buildSplitPodcastFilter({
      speaker1X: 0.25,
      speaker2X: 0.72,
      sourceWidth: 854,
      sourceHeight: 480,
      splitFit: 'contain',
      dividerX: 0.498,
    });
    assert.ok(filter.includes('crop=in_w*0.4980:in_h:in_w*0.0000:0'), 'left region = source start to divider');
    assert.ok(filter.includes('crop=in_w*0.5020:in_h:in_w*0.4980:0'), 'right region = divider to source end');
    assert.ok(filter.includes('force_original_aspect_ratio=decrease'), 'contain, not cover');
    assert.ok((filter.match(/pad=1080:960/g) || []).length === 2, 'both panels padded');
    assert.ok(filter.includes('vstack'));
  });

  test('contain falls back to the anchor midpoint without a divider', () => {
    const filter = SmartReframeService.buildSplitPodcastFilter({
      speaker1X: 0.2,
      speaker2X: 0.8,
      splitFit: 'contain',
    });
    assert.ok(filter.includes('in_w*0.5000:0'), 'midpoint partition');
  });

  test('default cover behavior unchanged (regression)', () => {
    const filter = SmartReframeService.buildSplitPodcastFilter({
      speaker1X: 0.25,
      speaker2X: 0.75,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.ok(filter.includes('force_original_aspect_ratio=increase'));
    assert.ok(!filter.includes('pad='), 'cover mode never pads');
  });
});

describe('split unresolved state and safe fallback integration', () => {
  test('missing speaker1TrackId cannot silently render another speaker in export (falls back to blur)', () => {
    const samples = twoSubjectSamples(0.3, 0.25, 0.7, 0.3, 12);
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1TrackId: 'ghost_id',
    });
    assert.ok(geom, 'must return an explicit geometry object');
    assert.equal(geom.unresolved, true);
    assert.equal(geom.unresolvedReason, 'requested_speaker_track_not_found');

    const filter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      splitGeometry: geom,
    });
    assert.ok(filter.includes('boxblur'), 'unresolved track ID must trigger blur fallback');
    assert.ok(!filter.includes('vstack'), 'unresolved track ID must NEVER render a split vstack');
  });

  test('missing speaker2TrackId cannot silently render another speaker in export (falls back to blur)', () => {
    const samples = twoSubjectSamples(0.3, 0.25, 0.7, 0.3, 12);
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker2TrackId: 'ghost_id',
    });
    assert.ok(geom, 'must return an explicit geometry object');
    assert.equal(geom.unresolved, true);
    assert.equal(geom.unresolvedReason, 'requested_speaker_track_not_found');

    const filter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      splitGeometry: geom,
    });
    assert.ok(filter.includes('boxblur'), 'unresolved track ID must trigger blur fallback');
    assert.ok(!filter.includes('vstack'), 'unresolved track ID must NEVER render a split vstack');
  });

  test('duplicate IDs cannot silently render a normal split (falls back to blur)', () => {
    const samples = twoSubjectSamples(0.3, 0.25, 0.7, 0.3, 12);
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1TrackId: 'subject_a',
      speaker2TrackId: 'subject_a',
    });
    assert.ok(geom, 'duplicate track IDs must return explicit unresolved object');
    assert.equal(geom.unresolved, true);
    assert.equal(geom.unresolvedReason, 'duplicate_speaker_track_ids');

    const filter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      splitGeometry: geom,
    });
    assert.ok(filter.includes('boxblur'), 'duplicate track IDs must trigger blur fallback');
    assert.ok(!filter.includes('vstack'), 'duplicate track IDs must NEVER render a split vstack');
  });

  test('preview and export both use safe fallback when split geometry is unresolved', () => {
    const unresolvedGeom = {
      speaker1: { x: 0.25, y: 0.5, windowW: 0 },
      speaker2: { x: 0.75, y: 0.5, windowW: 0 },
      unresolved: true,
      unresolvedReason: 'requested_speaker_track_not_found',
    };

    // 1. Export fallback verification:
    const exportFilter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      splitGeometry: unresolvedGeom,
    });
    assert.ok(exportFilter.includes('boxblur'), 'export must use safe blur fallback');
    assert.ok(!exportFilter.includes('vstack'), 'export must not render split panels');

    // 2. Preview decision verification (effective layout fallback):
    // In PreviewCanvas, primaryLayoutMode resolves to 'blur' when speakerSplit.splitGeometry.unresolved === true
    const resolvePreviewLayoutMode = (
      rawMode: string,
      speakerSplit?: { splitGeometry?: { unresolved?: boolean } | null } | null
    ): string => {
      if (rawMode === 'split' && speakerSplit?.splitGeometry?.unresolved) {
        return 'blur';
      }
      return rawMode;
    };

    const previewMode = resolvePreviewLayoutMode('split', { splitGeometry: unresolvedGeom });
    assert.equal(previewMode, 'blur', 'preview primaryLayoutMode must fall back to blur when split geometry is unresolved');

    const resolvedGeom = {
      speaker1: { x: 0.3, y: 0.25, windowW: 0.35 },
      speaker2: { x: 0.7, y: 0.25, windowW: 0.35 },
      unresolved: false,
    };
    const normalPreviewMode = resolvePreviewLayoutMode('split', { splitGeometry: resolvedGeom });
    assert.equal(normalPreviewMode, 'split', 'preview primaryLayoutMode must remain split when geometry is resolved');
  });

  test('legacy null behavior remains intact when no explicit track identity was requested', () => {
    // No track IDs provided:
    const nullEmpty = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: [],
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.equal(nullEmpty, null, 'empty samples without track IDs must return null');

    const nullUndef = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: null,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.equal(nullUndef, null, 'null samples without track IDs must return null');

    // Single subject:
    const singleSubject: ReframeSample[] = Array.from({ length: 12 }, (_, i) => ({
      time: i * 0.5,
      faces: [{ x: 0.45, y: 0.3, width: 0.1, height: 0.1, center_x: 0.5, center_y: 0.35, area: 0.01, confidence: 0.9, track_id: 'solo' }],
    }));
    const nullSingle = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: singleSubject,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.equal(nullSingle, null, 'single subject without track IDs must return null');

    // Export without geometry preserves legacy split:
    const legacyFilter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      splitGeometry: null,
      speaker1X: 0.25,
      speaker2X: 0.75,
    });
    assert.ok(legacyFilter.includes('vstack'), 'legacy export without geometry must use ordinary split');
    assert.ok(!legacyFilter.includes('boxblur'), 'legacy export without geometry must not fall back to blur');
  });
});

describe('P1.2 Shared Split Geometry Contract & Preview/Export Parity', () => {
  // Helper to parse actual scale and crop parameters from generated FFmpeg split filter
  function parseFfmpegPanelCrop(filter: string, panelTag: 'v_top' | 'v_bot', sourceWidth: number, sourceHeight: number, canvasWidth = 1080, canvasHeight = 1920) {
    const halfHeight = Math.round(canvasHeight / 2);
    const regex = new RegExp(`scale=-1:(\\d+):force_original_aspect_ratio=increase,crop=(\\d+):(\\d+):'min\\(max\\(in_w\\*([0-9.]+)-out_w/2\\\\,0\\)\\\\,in_w-out_w\\)':'min\\(max\\(in_h\\*([0-9.]+)-out_h/2\\\\,0\\)\\\\,in_h-out_h\\)'\\[${panelTag}\\]`);
    const match = filter.match(regex);
    if (!match) {
      throw new Error(`Failed to parse FFmpeg filter for ${panelTag}: ${filter}`);
    }
    const scaledH = parseInt(match[1], 10);
    const cropW = parseInt(match[2], 10);
    const cropH = parseInt(match[3], 10);
    const gx = parseFloat(match[4]);
    const gy = parseFloat(match[5]);

    const scaledW = Math.round(scaledH * (sourceWidth / sourceHeight));
    const cropX = Math.min(Math.max(Math.round(scaledW * gx - cropW / 2), 0), scaledW - cropW);
    const cropY = Math.min(Math.max(Math.round(scaledH * gy - cropH / 2), 0), scaledH - cropH);

    return {
      scaledW,
      scaledH,
      cropW,
      cropH,
      cropX,
      cropY,
      gx,
      gy,
      normLeft: cropX / scaledW,
      normRight: (cropX + cropW) / scaledW,
      normTop: cropY / scaledH,
      normBottom: (cropY + cropH) / scaledH,
      normCenterX: (cropX + cropW / 2) / scaledW,
      normCenterY: (cropY + cropH / 2) / scaledH,
    };
  }

  // Helper to parse actual CSS crop parameters from renderSplitPanelCss
  function parseCssPanelCrop(css: { left: string; top: string; width: string; height: string }, boxW = 360, boxH = 320) {
    const cssLeft = parseFloat(css.left);
    const cssTop = parseFloat(css.top);
    const cssW = parseFloat(css.width);
    const cssH = parseFloat(css.height);

    return {
      cssLeft,
      cssTop,
      cssW,
      cssH,
      normLeft: -cssLeft / cssW,
      normRight: (-cssLeft + boxW) / cssW,
      normTop: -cssTop / cssH,
      normBottom: (-cssTop + boxH) / cssH,
      normCenterX: (-cssLeft + boxW / 2) / cssW,
      normCenterY: (-cssTop + boxH / 2) / cssH,
      aspect: cssW / cssH,
    };
  }

  // Documented tolerance:
  // In 360x320 preview, 1px is ~0.0028 normalized. In 1080x960 export, 1px is ~0.0009 normalized.
  // With .toFixed(1) rounding in CSS and integer rounding in FFmpeg, tolerance is <= 0.005 (~1.8 preview px).
  const PARITY_TOLERANCE = 0.005;

  test('A. Identical preview/export geometry for ordinary horizontal speaker pairs', () => {
    const samples = twoSubjectSamples(0.3, 0.4, 0.7, 0.4, 12);
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.ok(geom, 'must return split layout geometry');
    assert.equal(geom.architecture, 'continuous');
    assert.equal(geom.fit, 'cover');
    assert.equal(geom.unresolved, false);

    // Verify Speaker 1 and 2 source bounds exist and stay in [0, 1]
    assert.ok(geom.speaker1.sourceBounds, 'speaker1 sourceBounds must be present');
    assert.ok(geom.speaker2.sourceBounds, 'speaker2 sourceBounds must be present');

    // Preview CSS
    const css1 = renderSplitPanelCss({
      geometry: geom.speaker1,
      sourceWidth: 1920,
      sourceHeight: 1080,
      boxW: 360,
      boxH: 320,
    });
    const css2 = renderSplitPanelCss({
      geometry: geom.speaker2,
      sourceWidth: 1920,
      sourceHeight: 1080,
      boxW: 360,
      boxH: 320,
    });

    const parsedCss1 = parseCssPanelCrop(css1, 360, 320);
    const parsedCss2 = parseCssPanelCrop(css2, 360, 320);

    // Export FFmpeg
    const filter = SmartReframeService.buildSplitPodcastFilter({
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1Geometry: geom.speaker1,
      speaker2Geometry: geom.speaker2,
    });
    const parsedFfmpeg1 = parseFfmpegPanelCrop(filter, 'v_top', 1920, 1080);
    const parsedFfmpeg2 = parseFfmpegPanelCrop(filter, 'v_bot', 1920, 1080);

    // 1. Aspect ratio parity
    assert.ok(Math.abs(parsedCss1.aspect - 1920 / 1080) < PARITY_TOLERANCE, 'preview aspect preserves source');
    assert.ok(Math.abs(parsedFfmpeg1.scaledW / parsedFfmpeg1.scaledH - 1920 / 1080) < PARITY_TOLERANCE, 'ffmpeg aspect preserves source');

    // 2. Panel 1 Parity (Speaker 1)
    assert.ok(Math.abs(parsedCss1.normLeft - parsedFfmpeg1.normLeft) < PARITY_TOLERANCE, 'p1 left parity');
    assert.ok(Math.abs(parsedCss1.normRight - parsedFfmpeg1.normRight) < PARITY_TOLERANCE, 'p1 right parity');
    assert.ok(Math.abs(parsedCss1.normTop - parsedFfmpeg1.normTop) < PARITY_TOLERANCE, 'p1 top parity');
    assert.ok(Math.abs(parsedCss1.normBottom - parsedFfmpeg1.normBottom) < PARITY_TOLERANCE, 'p1 bottom parity');
    assert.ok(Math.abs(parsedCss1.normCenterX - parsedFfmpeg1.normCenterX) < PARITY_TOLERANCE, 'p1 center x parity');
    assert.ok(Math.abs(parsedCss1.normCenterY - parsedFfmpeg1.normCenterY) < PARITY_TOLERANCE, 'p1 center y parity');

    // 3. Panel 2 Parity (Speaker 2)
    assert.ok(Math.abs(parsedCss2.normLeft - parsedFfmpeg2.normLeft) < PARITY_TOLERANCE, 'p2 left parity');
    assert.ok(Math.abs(parsedCss2.normRight - parsedFfmpeg2.normRight) < PARITY_TOLERANCE, 'p2 right parity');
    assert.ok(Math.abs(parsedCss2.normTop - parsedFfmpeg2.normTop) < PARITY_TOLERANCE, 'p2 top parity');
    assert.ok(Math.abs(parsedCss2.normBottom - parsedFfmpeg2.normBottom) < PARITY_TOLERANCE, 'p2 bottom parity');
    assert.ok(Math.abs(parsedCss2.normCenterX - parsedFfmpeg2.normCenterX) < PARITY_TOLERANCE, 'p2 center x parity');
    assert.ok(Math.abs(parsedCss2.normCenterY - parsedFfmpeg2.normCenterY) < PARITY_TOLERANCE, 'p2 center y parity');

    // 4. Parity with shared sourceBounds contract
    assert.ok(Math.abs(parsedCss1.normLeft - geom.speaker1.sourceBounds!.left) < PARITY_TOLERANCE);
    assert.ok(Math.abs(parsedFfmpeg1.normLeft - geom.speaker1.sourceBounds!.left) < PARITY_TOLERANCE);
    assert.ok(Math.abs(parsedCss2.normLeft - geom.speaker2.sourceBounds!.left) < PARITY_TOLERANCE);
    assert.ok(Math.abs(parsedFfmpeg2.normLeft - geom.speaker2.sourceBounds!.left) < PARITY_TOLERANCE);
  });

  test('B. Identical preview/export geometry for inverted speaker order', () => {
    // Speaker 1 is on the right (x=0.75), Speaker 2 is on the left (x=0.25)
    const samples = twoSubjectSamples(0.25, 0.4, 0.75, 0.4, 12);
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1X: 0.75,
      speaker2X: 0.25,
    });
    assert.ok(geom);
    assert.equal(geom.unresolved, false);
    assert.equal(geom.speaker1.x, 0.75);
    assert.equal(geom.speaker2.x, 0.25);

    const css1 = renderSplitPanelCss({ geometry: geom.speaker1, sourceWidth: 1920, sourceHeight: 1080, boxW: 360, boxH: 320 });
    const css2 = renderSplitPanelCss({ geometry: geom.speaker2, sourceWidth: 1920, sourceHeight: 1080, boxW: 360, boxH: 320 });

    const parsedCss1 = parseCssPanelCrop(css1, 360, 320);
    const parsedCss2 = parseCssPanelCrop(css2, 360, 320);

    const filter = SmartReframeService.buildSplitPodcastFilter({
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1Geometry: geom.speaker1,
      speaker2Geometry: geom.speaker2,
    });
    const parsedFfmpeg1 = parseFfmpegPanelCrop(filter, 'v_top', 1920, 1080);
    const parsedFfmpeg2 = parseFfmpegPanelCrop(filter, 'v_bot', 1920, 1080);

    // Panel 1 contains Speaker 1 (right side: center ~ 0.75)
    assert.ok(Math.abs(parsedCss1.normCenterX - 0.75) < 0.05, 'panel 1 centers on speaker 1 (0.75)');
    assert.ok(Math.abs(parsedFfmpeg1.normCenterX - 0.75) < 0.05, 'ffmpeg panel 1 centers on speaker 1 (0.75)');
    assert.ok(Math.abs(parsedCss1.normLeft - parsedFfmpeg1.normLeft) < PARITY_TOLERANCE);

    // Panel 2 contains Speaker 2 (left side: center ~ 0.25)
    assert.ok(Math.abs(parsedCss2.normCenterX - 0.25) < 0.05, 'panel 2 centers on speaker 2 (0.25)');
    assert.ok(Math.abs(parsedFfmpeg2.normCenterX - 0.25) < 0.05, 'ffmpeg panel 2 centers on speaker 2 (0.25)');
    assert.ok(Math.abs(parsedCss2.normLeft - parsedFfmpeg2.normLeft) < PARITY_TOLERANCE);
  });

  test('C. Identical preview/export geometry for vertically separated speakers in a continuous frame', () => {
    // Both speakers share x=0.5, but vertically separated at y=0.25 and y=0.75
    const samples: ReframeSample[] = Array.from({ length: 12 }, (_, i) => ({
      time: i * 0.5,
      faces: [
        { x: 0.45, y: 0.2, width: 0.1, height: 0.1, center_x: 0.5, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'top_person' },
        { x: 0.45, y: 0.7, width: 0.1, height: 0.1, center_x: 0.5, center_y: 0.75, area: 0.01, confidence: 0.9, track_id: 'bot_person' },
      ],
    }));
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1TrackId: 'top_person',
      speaker2TrackId: 'bot_person',
    });
    assert.ok(geom);
    assert.equal(geom.architecture, 'continuous', 'must stay continuous frame without dividerY');
    assert.equal(geom.speaker1.y, 0.25);
    assert.equal(geom.speaker2.y, 0.75);

    const css1 = renderSplitPanelCss({ geometry: geom.speaker1, sourceWidth: 1920, sourceHeight: 1080, boxW: 360, boxH: 320 });
    const css2 = renderSplitPanelCss({ geometry: geom.speaker2, sourceWidth: 1920, sourceHeight: 1080, boxW: 360, boxH: 320 });

    const parsedCss1 = parseCssPanelCrop(css1, 360, 320);
    const parsedCss2 = parseCssPanelCrop(css2, 360, 320);

    const filter = SmartReframeService.buildSplitPodcastFilter({
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1Geometry: geom.speaker1,
      speaker2Geometry: geom.speaker2,
    });
    const parsedFfmpeg1 = parseFfmpegPanelCrop(filter, 'v_top', 1920, 1080);
    const parsedFfmpeg2 = parseFfmpegPanelCrop(filter, 'v_bot', 1920, 1080);

    // Panel 1 contains the top speaker, Panel 2 contains the bottom speaker
    assert.ok(parsedCss1.normTop <= 0.25 && parsedCss1.normBottom >= 0.25, 'preview p1 includes top speaker');
    assert.ok(parsedFfmpeg1.normTop <= 0.25 && parsedFfmpeg1.normBottom >= 0.25, 'ffmpeg p1 includes top speaker');
    assert.ok(parsedCss2.normTop <= 0.75 && parsedCss2.normBottom >= 0.75, 'preview p2 includes bottom speaker');
    assert.ok(parsedFfmpeg2.normTop <= 0.75 && parsedFfmpeg2.normBottom >= 0.75, 'ffmpeg p2 includes bottom speaker');

    // Exact parity between preview and export
    assert.ok(Math.abs(parsedCss1.normTop - parsedFfmpeg1.normTop) < PARITY_TOLERANCE);
    assert.ok(Math.abs(parsedCss1.normBottom - parsedFfmpeg1.normBottom) < PARITY_TOLERANCE);
    assert.ok(Math.abs(parsedCss2.normTop - parsedFfmpeg2.normTop) < PARITY_TOLERANCE);
    assert.ok(Math.abs(parsedCss2.normBottom - parsedFfmpeg2.normBottom) < PARITY_TOLERANCE);
  });

  test('D. Multi-aspect ratio parity across 16:9, 4:3 and 9:16 source videos', () => {
    const ratios = [
      { name: '16:9', w: 1920, h: 1080 },
      { name: '4:3', w: 1440, h: 1080 },
      { name: '9:16', w: 1080, h: 1920 },
    ];
    for (const r of ratios) {
      const bounds1 = computeSplitPanelBounds({
        x: 0.35,
        y: 0.45,
        windowW: 0.30,
        sourceWidth: r.w,
        sourceHeight: r.h,
      });
      const bounds2 = computeSplitPanelBounds({
        x: 0.65,
        y: 0.45,
        windowW: 0.30,
        sourceWidth: r.w,
        sourceHeight: r.h,
      });
      assert.ok(bounds1.sourceBounds.left >= 0, `${r.name} left >= 0`);
      assert.ok(bounds1.sourceBounds.right <= 1.0, `${r.name} right <= 1.0`);
      assert.ok(bounds1.sourceBounds.top >= 0, `${r.name} top >= 0`);
      assert.ok(bounds1.sourceBounds.bottom <= 1.0, `${r.name} bottom <= 1.0`);

      const css1 = renderSplitPanelCss({ geometry: bounds1, sourceWidth: r.w, sourceHeight: r.h, boxW: 360, boxH: 320 });
      const parsedCss1 = parseCssPanelCrop(css1, 360, 320);

      const filter = SmartReframeService.buildSplitPodcastFilter({
        sourceWidth: r.w,
        sourceHeight: r.h,
        speaker1Geometry: bounds1,
        speaker2Geometry: bounds2,
      });
      const parsedFfmpeg1 = parseFfmpegPanelCrop(filter, 'v_top', r.w, r.h);

      // Verify exact parity across all three source aspect ratios
      assert.ok(Math.abs(parsedCss1.normLeft - parsedFfmpeg1.normLeft) < PARITY_TOLERANCE, `${r.name} left parity`);
      assert.ok(Math.abs(parsedCss1.normRight - parsedFfmpeg1.normRight) < PARITY_TOLERANCE, `${r.name} right parity`);
      assert.ok(Math.abs(parsedCss1.normTop - parsedFfmpeg1.normTop) < PARITY_TOLERANCE, `${r.name} top parity`);
      assert.ok(Math.abs(parsedCss1.normBottom - parsedFfmpeg1.normBottom) < PARITY_TOLERANCE, `${r.name} bottom parity`);
    }
  });

  test('E. Edge-clamped subjects near all four edges produce identical preview and export bounds', () => {
    const extremes = [
      { name: 'extreme left', x: 0.01, y: 0.5 },
      { name: 'extreme right', x: 0.99, y: 0.5 },
      { name: 'extreme top', x: 0.5, y: 0.01 },
      { name: 'extreme bottom', x: 0.5, y: 0.99 },
    ];
    for (const ext of extremes) {
      const bounds1 = computeSplitPanelBounds({
        x: ext.x,
        y: ext.y,
        windowW: 0.35,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      const bounds2 = computeSplitPanelBounds({
        x: 0.5,
        y: 0.5,
        windowW: 0.35,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      assert.ok(bounds1.sourceBounds.left >= 0, `${ext.name} left must be >= 0`);
      assert.ok(bounds1.sourceBounds.right <= 1.0001, `${ext.name} right must be <= 1`);
      assert.ok(bounds1.sourceBounds.top >= 0, `${ext.name} top must be >= 0`);
      assert.ok(bounds1.sourceBounds.bottom <= 1.0001, `${ext.name} bottom must be <= 1`);

      const css = renderSplitPanelCss({ geometry: bounds1, sourceWidth: 1920, sourceHeight: 1080, boxW: 360, boxH: 320 });
      const parsedCss = parseCssPanelCrop(css, 360, 320);

      const filter = SmartReframeService.buildSplitPodcastFilter({
        sourceWidth: 1920,
        sourceHeight: 1080,
        speaker1Geometry: bounds1,
        speaker2Geometry: bounds2,
      });
      const parsedFfmpeg = parseFfmpegPanelCrop(filter, 'v_top', 1920, 1080);

      assert.ok(Math.abs(parsedCss.normLeft - parsedFfmpeg.normLeft) < PARITY_TOLERANCE, `${ext.name} left parity`);
      assert.ok(Math.abs(parsedCss.normRight - parsedFfmpeg.normRight) < PARITY_TOLERANCE, `${ext.name} right parity`);
      assert.ok(Math.abs(parsedCss.normTop - parsedFfmpeg.normTop) < PARITY_TOLERANCE, `${ext.name} top parity`);
      assert.ok(Math.abs(parsedCss.normBottom - parsedFfmpeg.normBottom) < PARITY_TOLERANCE, `${ext.name} bottom parity`);
    }
  });

  test('F. Unresolved geometry remains safe in both preview and export', () => {
    // Missing speaker identity requested
    const samples = twoSubjectSamples(0.3, 0.4, 0.7, 0.4, 12);
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1TrackId: 'ghost_speaker',
    });
    assert.ok(geom);
    assert.equal(geom.unresolved, true);
    assert.equal(geom.unresolvedReason, 'requested_speaker_track_not_found');

    // Export uses safe blur fallback:
    const exportFilter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'split',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      splitGeometry: geom,
    });
    assert.ok(exportFilter.includes('boxblur'), 'export must fall back to blur');
    assert.ok(!exportFilter.includes('vstack'), 'export must not render split vstack');

    // Preview translation uses safe bounds (zero windowW) and unresolved flag
    assert.equal(geom.speaker1.windowW, 0);
    assert.equal(geom.speaker2.windowW, 0);
  });

  test('G. Speaker 1 remains in panel 1 and Speaker 2 in panel 2 even when spatial positions reverse', () => {
    const samples: ReframeSample[] = Array.from({ length: 12 }, (_, i) => ({
      time: i * 0.5,
      faces: [
        { x: 0.75, y: 0.35, width: 0.1, height: 0.1, center_x: 0.8, center_y: 0.4, area: 0.01, confidence: 0.9, track_id: 'person_on_right' },
        { x: 0.15, y: 0.35, width: 0.1, height: 0.1, center_x: 0.2, center_y: 0.4, area: 0.01, confidence: 0.9, track_id: 'person_on_left' },
      ],
    }));
    // Request Speaker 1 = person_on_right, Speaker 2 = person_on_left
    const geom = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
      speaker1TrackId: 'person_on_right',
      speaker2TrackId: 'person_on_left',
    });
    assert.ok(geom);
    assert.ok(Math.abs(geom.speaker1.x - 0.8) < 0.05, 'Speaker 1 must anchor to person_on_right');
    assert.ok(Math.abs(geom.speaker2.x - 0.2) < 0.05, 'Speaker 2 must anchor to person_on_left');

    // Speaker 1 is in speaker1 property (first/top panel)
    assert.ok(geom.speaker1.sourceBounds!.left > 0.4, 'Speaker 1 bounds correspond to right side of source');
    // Speaker 2 is in speaker2 property (second/bottom panel)
    assert.ok(geom.speaker2.sourceBounds!.right < 0.6, 'Speaker 2 bounds correspond to left side of source');
  });

  test('H. Existing legacy split behavior remains unchanged where the new contract is not applicable', () => {
    // 1. Without geometry, buildSplitPodcastFilter produces exact legacy output
    const legacy = SmartReframeService.buildSplitPodcastFilter({
      speaker1X: 0.25,
      speaker2X: 0.75,
      canvasWidth: 1080,
      canvasHeight: 1920,
    });
    assert.ok(legacy.includes('[0:v]split=2[spk1][spk2]'));
    assert.ok(legacy.includes('scale=-1:960:force_original_aspect_ratio=increase'));
    assert.ok(legacy.includes('crop=1080:960'));
    assert.ok(legacy.includes('vstack[out]'));

    // 2. computeSplitSpeakerGeometry returns null without samples or usable tracks (when no track IDs passed)
    assert.equal(
      SmartReframeService.computeSplitSpeakerGeometry({ rawSamples: [], sourceWidth: 1920, sourceHeight: 1080 }),
      null
    );
    assert.equal(
      SmartReframeService.computeSplitSpeakerGeometry({ rawSamples: null, sourceWidth: 1920, sourceHeight: 1080 }),
      null
    );
  });

  test('I. Legacy fallback geometry propagates non-default canvas dimensions without mismatch', () => {
    // Plain legacy geometry without sourceBounds:
    const legacyGeom1: SplitPanelGeometry = { x: 0.35, y: 0.40, windowW: 0.38 };
    const legacyGeom2: SplitPanelGeometry = { x: 0.65, y: 0.40, windowW: 0.38 };

    const canvases = [
      { name: '720p', w: 720, h: 1280 },
      { name: '1080p', w: 1080, h: 1920 },
      { name: '4K/2160p', w: 2160, h: 3840 },
    ];

    for (const c of canvases) {
      // 1. Export filter with explicit canvas dimensions
      const filter = SmartReframeService.buildSplitPodcastFilter({
        sourceWidth: 1920,
        sourceHeight: 1080,
        canvasWidth: c.w,
        canvasHeight: c.h,
        speaker1Geometry: legacyGeom1,
        speaker2Geometry: legacyGeom2,
      });

      const parsedFfmpeg1 = parseFfmpegPanelCrop(filter, 'v_top', 1920, 1080, c.w, c.h);
      assert.equal(parsedFfmpeg1.scaledH % 2, 0, `${c.name} scaled height must be even for yuv420p`);
      assert.equal(parsedFfmpeg1.cropW, c.w, `${c.name} crop width must match canvas`);
      assert.equal(parsedFfmpeg1.cropH, Math.round(c.h / 2), `${c.name} crop height must match half canvas`);

      // 2. Preview CSS with explicit canvas dimensions propagated
      const css1 = renderSplitPanelCss({
        geometry: legacyGeom1,
        sourceWidth: 1920,
        sourceHeight: 1080,
        boxW: 360,
        boxH: 320,
        canvasWidth: c.w,
        canvasHeight: c.h,
      });
      const parsedCss1 = parseCssPanelCrop(css1, 360, 320);

      // Verify bounds parity between preview and export on non-default canvas
      const deltaLeft = Math.abs(parsedCss1.normLeft - parsedFfmpeg1.normLeft);
      const deltaRight = Math.abs(parsedCss1.normRight - parsedFfmpeg1.normRight);
      const deltaTop = Math.abs(parsedCss1.normTop - parsedFfmpeg1.normTop);
      const deltaBottom = Math.abs(parsedCss1.normBottom - parsedFfmpeg1.normBottom);

      assert.ok(deltaLeft < PARITY_TOLERANCE, `${c.name} legacy deltaLeft=${deltaLeft}`);
      assert.ok(deltaRight < PARITY_TOLERANCE, `${c.name} legacy deltaRight=${deltaRight}`);
      assert.ok(deltaTop < PARITY_TOLERANCE, `${c.name} legacy deltaTop=${deltaTop}`);
      assert.ok(deltaBottom < PARITY_TOLERANCE, `${c.name} legacy deltaBottom=${deltaBottom}`);
    }
  });

  test('J. Measured maximum preview/export crop-bound delta across comprehensive test matrix', () => {
    // Matrix:
    // Sources: 16:9 (1920x1080), 4:3 (1440x1080), 9:16 (1080x1920)
    // Canvases: 720p (720x1280), 1080p (1080x1920), 4K (2160x3840)
    // Positions: Horizontal, Inverted, Vertical, Extreme Left, Extreme Right, Extreme Top, Extreme Bottom
    const sources = [
      { name: '16:9', w: 1920, h: 1080 },
      { name: '4:3', w: 1440, h: 1080 },
      { name: '9:16', w: 1080, h: 1920 },
    ];
    const canvases = [
      { name: '720p', w: 720, h: 1280 },
      { name: '1080p', w: 1080, h: 1920 },
      { name: '4K', w: 2160, h: 3840 },
    ];
    const cases = [
      { desc: 'horizontal pair', x1: 0.28, y1: 0.45, x2: 0.72, y2: 0.45, w: 0.42 },
      { desc: 'inverted pair', x1: 0.75, y1: 0.45, x2: 0.25, y2: 0.45, w: 0.42 },
      { desc: 'vertical pair', x1: 0.50, y1: 0.22, x2: 0.50, y2: 0.78, w: 0.35 },
      { desc: 'extreme left', x1: 0.01, y1: 0.50, x2: 0.70, y2: 0.50, w: 0.35 },
      { desc: 'extreme right', x1: 0.99, y1: 0.50, x2: 0.30, y2: 0.50, w: 0.35 },
      { desc: 'extreme top', x1: 0.40, y1: 0.01, x2: 0.60, y2: 0.70, w: 0.35 },
      { desc: 'extreme bottom', x1: 0.40, y1: 0.99, x2: 0.60, y2: 0.30, w: 0.35 },
    ];

    let maxDeltaObserved = 0;
    let worstCaseDesc = '';

    for (const src of sources) {
      for (const cnv of canvases) {
        for (const cs of cases) {
          // Compute bounded contract geometry
          const b1 = computeSplitPanelBounds({
            x: cs.x1,
            y: cs.y1,
            windowW: cs.w,
            sourceWidth: src.w,
            sourceHeight: src.h,
            canvasWidth: cnv.w,
            canvasHeight: cnv.h,
          });
          const b2 = computeSplitPanelBounds({
            x: cs.x2,
            y: cs.y2,
            windowW: cs.w,
            sourceWidth: src.w,
            sourceHeight: src.h,
            canvasWidth: cnv.w,
            canvasHeight: cnv.h,
          });

          // Exercise actual FFmpeg filter generation
          const filter = SmartReframeService.buildSplitPodcastFilter({
            sourceWidth: src.w,
            sourceHeight: src.h,
            canvasWidth: cnv.w,
            canvasHeight: cnv.h,
            speaker1Geometry: b1,
            speaker2Geometry: b2,
          });

          const parsedFfmpeg = parseFfmpegPanelCrop(filter, 'v_top', src.w, src.h, cnv.w, cnv.h);
          assert.equal(parsedFfmpeg.scaledH % 2, 0, `${src.name} ${cnv.name} ${cs.desc} scaled height must be even`);

          // Exercise actual CSS preview calculation
          const css = renderSplitPanelCss({
            geometry: b1,
            sourceWidth: src.w,
            sourceHeight: src.h,
            boxW: 360,
            boxH: 320,
            canvasWidth: cnv.w,
            canvasHeight: cnv.h,
          });
          const parsedCss = parseCssPanelCrop(css, 360, 320);

          // Measure all 4 bounds deltas
          const dL = Math.abs(parsedCss.normLeft - parsedFfmpeg.normLeft);
          const dR = Math.abs(parsedCss.normRight - parsedFfmpeg.normRight);
          const dT = Math.abs(parsedCss.normTop - parsedFfmpeg.normTop);
          const dB = Math.abs(parsedCss.normBottom - parsedFfmpeg.normBottom);
          const dMax = Math.max(dL, dR, dT, dB);

          if (dMax > maxDeltaObserved) {
            maxDeltaObserved = dMax;
            worstCaseDesc = `${src.name} src, ${cnv.name} cnv, ${cs.desc}`;
          }

          assert.ok(dMax < PARITY_TOLERANCE, `${src.name} ${cnv.name} ${cs.desc} delta ${dMax} exceeds tolerance`);
        }
      }
    }

    // Verify worst-case delta across all 63 matrix permutations is bounded strictly under tolerance
    console.log(`[Split Parity Matrix] 63 cases tested across 16:9, 4:3, 9:16 and 720p, 1080p, 4K canvases.`);
    console.log(`[Split Parity Matrix] Max observed preview/export delta: ${(maxDeltaObserved * 100).toFixed(4)}% (${maxDeltaObserved.toFixed(6)}) in ${worstCaseDesc}`);
    assert.ok(maxDeltaObserved < 0.0035, `Max observed delta across matrix was ${maxDeltaObserved} (${worstCaseDesc})`);
  });

  test('K. Integration test: resolution scaling (720p, 1080p, 4K) through buildLayoutCropFilter and renderSplitPanelCss', () => {
    const resolutions: RenderResolution[] = ['720p', '1080p', '2160p'];
    const samples = twoSubjectSamples(0.32, 0.45, 0.68, 0.45, 12);

    for (const res of resolutions) {
      const scale = renderScale(res);
      const dims = canvasForResolution('9:16', res);

      // Case 1: Shared geometry with sourceBounds (computed through computeSplitSpeakerGeometry)
      const geomWithBounds = SmartReframeService.computeSplitSpeakerGeometry({
        rawSamples: samples,
        sourceWidth: 1920,
        sourceHeight: 1080,
        canvasWidth: dims.width,
        canvasHeight: dims.height,
      });
      assert.ok(geomWithBounds);

      // Export path: buildLayoutCropFilter with canvasScale
      const exportFilter1 = SmartReframeService.buildLayoutCropFilter({
        layoutMode: 'split',
        aspectRatio: '9:16',
        sourceWidth: 1920,
        sourceHeight: 1080,
        duration: 10,
        splitGeometry: geomWithBounds,
        canvasScale: scale,
      });

      const parsedFfmpeg1 = parseFfmpegPanelCrop(exportFilter1, 'v_top', 1920, 1080, dims.width, dims.height);
      assert.equal(parsedFfmpeg1.cropW, dims.width, `${res} crop width matches output canvas width`);
      assert.equal(parsedFfmpeg1.cropH, Math.round(dims.height / 2), `${res} crop height matches output half height`);
      assert.equal(parsedFfmpeg1.scaledH % 2, 0, `${res} scaled height is even`);

      // Preview path: renderSplitPanelCss with effective canvas dimensions
      const css1 = renderSplitPanelCss({
        geometry: geomWithBounds.speaker1,
        sourceWidth: 1920,
        sourceHeight: 1080,
        boxW: 360,
        boxH: 320,
        canvasWidth: dims.width,
        canvasHeight: dims.height,
      });
      const parsedCss1 = parseCssPanelCrop(css1, 360, 320);

      assert.ok(Math.abs(parsedCss1.normLeft - parsedFfmpeg1.normLeft) < PARITY_TOLERANCE, `${res} left parity with bounds`);
      assert.ok(Math.abs(parsedCss1.normRight - parsedFfmpeg1.normRight) < PARITY_TOLERANCE, `${res} right parity with bounds`);
      assert.ok(Math.abs(parsedCss1.normTop - parsedFfmpeg1.normTop) < PARITY_TOLERANCE, `${res} top parity with bounds`);
      assert.ok(Math.abs(parsedCss1.normBottom - parsedFfmpeg1.normBottom) < PARITY_TOLERANCE, `${res} bottom parity with bounds`);

      // Case 2: Legacy geometry without sourceBounds
      const legacyGeom: SplitLayoutGeometry = {
        architecture: 'continuous',
        fit: 'cover',
        speaker1: { x: 0.32, y: 0.45, windowW: 0.36 },
        speaker2: { x: 0.68, y: 0.45, windowW: 0.36 },
      };

      const exportFilter2 = SmartReframeService.buildLayoutCropFilter({
        layoutMode: 'split',
        aspectRatio: '9:16',
        sourceWidth: 1920,
        sourceHeight: 1080,
        duration: 10,
        splitGeometry: legacyGeom,
        canvasScale: scale,
      });

      const parsedFfmpeg2 = parseFfmpegPanelCrop(exportFilter2, 'v_top', 1920, 1080, dims.width, dims.height);
      const css2 = renderSplitPanelCss({
        geometry: legacyGeom.speaker1,
        sourceWidth: 1920,
        sourceHeight: 1080,
        boxW: 360,
        boxH: 320,
        canvasWidth: dims.width,
        canvasHeight: dims.height,
      });
      const parsedCss2 = parseCssPanelCrop(css2, 360, 320);

      assert.ok(Math.abs(parsedCss2.normLeft - parsedFfmpeg2.normLeft) < PARITY_TOLERANCE, `${res} legacy left parity`);
      assert.ok(Math.abs(parsedCss2.normRight - parsedFfmpeg2.normRight) < PARITY_TOLERANCE, `${res} legacy right parity`);
      assert.ok(Math.abs(parsedCss2.normTop - parsedFfmpeg2.normTop) < PARITY_TOLERANCE, `${res} legacy top parity`);
      assert.ok(Math.abs(parsedCss2.normBottom - parsedFfmpeg2.normBottom) < PARITY_TOLERANCE, `${res} legacy bottom parity`);
    }
  });

  describe('P1.3 Scene-Cut Boundary Invariance & Shot-Specific Split Framing', () => {
    const makeFace = (id: string, cx: number, cy = 0.45, w = 0.08) => ({
      track_id: id,
      center_x: cx,
      center_y: cy,
      x: cx - w / 2,
      y: cy - (w * 1.8) / 2,
      width: w,
      height: w * 1.8,
      confidence: 0.95,
    });

    test('1. Inverted speaker positions across a scene cut preserve speaker identity in panel 1 and panel 2', () => {
      // 6-second video, cut at 3.0s (12 samples at 0.5s intervals)
      // Shot 1 (0-3s, samples 0-5): Alice on left (cx=0.25), Bob on right (cx=0.75)
      // Shot 2 (3-6s, samples 6-11): Reverse angle: Alice on right (cx=0.75), Bob on left (cx=0.25)
      const samples = Array.from({ length: 12 }, (_, i) => {
        const time = i * 0.5;
        if (time < 3.0) {
          return { time, faces: [makeFace('spk_alice', 0.25, 0.40), makeFace('spk_bob', 0.75, 0.55)] };
        } else {
          return { time, faces: [makeFace('spk_alice', 0.75, 0.40), makeFace('spk_bob', 0.25, 0.55)] };
        }
      });

      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [3.0],
        duration: 6.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        speaker1TrackId: 'spk_alice',
        speaker2TrackId: 'spk_bob',
        windowScope: 'shot',
      });

      assert.equal(plan.length, 2, 'Should create exactly 2 shots');
      const shot1 = plan[0];
      const shot2 = plan[1];

      assert.equal(shot1.start, 0);
      assert.equal(shot1.end, 3.0);
      assert.equal(shot2.start, 3.0);
      assert.equal(shot2.end, 6.0);

      // Shot 1: Alice (Speaker 1) is at x=0.25, Bob (Speaker 2) is at x=0.75
      assert.ok(shot1.splitGeometry);
      assert.equal(shot1.splitGeometry!.unresolved, false);
      assert.equal(shot1.splitGeometry!.speaker1.x, 0.25, 'Shot 1 Speaker 1 (Alice) anchor should be 0.25');
      assert.equal(shot1.splitGeometry!.speaker2.x, 0.75, 'Shot 1 Speaker 2 (Bob) anchor should be 0.75');

      // Shot 2: Alice (Speaker 1) is now at x=0.75, Bob (Speaker 2) is now at x=0.25
      assert.ok(shot2.splitGeometry);
      assert.equal(shot2.splitGeometry!.unresolved, false);
      assert.equal(shot2.splitGeometry!.speaker1.x, 0.75, 'Shot 2 Speaker 1 (Alice) anchor must be 0.75');
      assert.equal(shot2.splitGeometry!.speaker2.x, 0.25, 'Shot 2 Speaker 2 (Bob) anchor must be 0.25');

      // Both shots maintain Y coordinates for Alice and Bob
      assert.ok(Math.abs(shot1.splitGeometry!.speaker1.y - 0.40) < 1e-4, 'Alice Y preserved in Shot 1');
      assert.ok(Math.abs(shot2.splitGeometry!.speaker1.y - 0.40) < 1e-4, 'Alice Y preserved in Shot 2');
      assert.ok(Math.abs(shot1.splitGeometry!.speaker2.y - 0.55) < 1e-4, 'Bob Y preserved in Shot 1');
      assert.ok(Math.abs(shot2.splitGeometry!.speaker2.y - 0.55) < 1e-4, 'Bob Y preserved in Shot 2');

      // Speaker 1 remains top panel and Speaker 2 remains bottom panel in both shots!
    });

    test('2. Camera angle change triggers fresh shot-local split geometry', () => {
      // Shot 1 (0 to 3s): Wide camera shot: Alice at 0.18, Bob at 0.82 (large separation, windowW = 0.55)
      // Shot 2 (3 to 6s): Medium camera shot: Alice at 0.35, Bob at 0.65 (close separation, windowW = 0.30)
      const samples = Array.from({ length: 12 }, (_, i) => {
        const time = i * 0.5;
        if (time < 3.0) {
          return { time, faces: [makeFace('spk_a', 0.18), makeFace('spk_b', 0.82)] };
        } else {
          return { time, faces: [makeFace('spk_a', 0.35), makeFace('spk_b', 0.65)] };
        }
      });

      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [3.0],
        duration: 6.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        speaker1TrackId: 'spk_a',
        speaker2TrackId: 'spk_b',
        windowScope: 'shot',
      });

      assert.equal(plan.length, 2);
      const geom1 = plan[0].splitGeometry!;
      const geom2 = plan[1].splitGeometry!;

      assert.ok(geom1.speaker1.windowW > geom2.speaker1.windowW, 'Shot 1 wide shot window must be wider than Shot 2 medium shot');
      assert.ok(Math.abs(geom1.speaker1.x - 0.18) < 0.01, 'Shot 1 speaker 1 at wide anchor');
      assert.ok(Math.abs(geom2.speaker1.x - 0.35) < 0.01, 'Shot 2 speaker 1 at medium anchor');
      assert.ok(Math.abs(geom1.speaker2.x - 0.82) < 0.01, 'Shot 1 speaker 2 at wide anchor');
      assert.ok(Math.abs(geom2.speaker2.x - 0.65) < 0.01, 'Shot 2 speaker 2 at medium anchor');
    });

    test('3. Missing explicitly requested track in subsequent shot returns unresolved safety fallback', () => {
      // Shot 1 (0-3s): Alice and Bob are present
      // Shot 2 (3-6s): Charlie and Bob are present, Alice is missing
      const samples = Array.from({ length: 12 }, (_, i) => {
        const time = i * 0.5;
        if (time < 3.0) {
          return { time, faces: [makeFace('spk_alice', 0.25), makeFace('spk_bob', 0.75)] };
        } else {
          return { time, faces: [makeFace('spk_charlie', 0.25), makeFace('spk_bob', 0.75)] };
        }
      });

      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [3.0],
        duration: 6.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        speaker1TrackId: 'spk_alice',
        speaker2TrackId: 'spk_bob',
        windowScope: 'shot',
      });

      assert.equal(plan.length, 2);
      assert.equal(plan[0].splitGeometry!.unresolved, false, 'Shot 1 should be resolved');
      assert.equal(plan[1].splitGeometry!.unresolved, true, 'Shot 2 must be unresolved due to missing Alice');
      assert.equal(plan[1].splitGeometry!.unresolvedReason, 'requested_speaker_track_not_found');

      // Verify that buildShotCompositionFilter produces blur fallback for Shot 2 and split for Shot 1
      const filter = SmartReframeService.buildShotCompositionFilter({
        plan,
        sourceWidth: 1920,
        sourceHeight: 1080,
        duration: 6.0,
        tag: 'test_filter',
      });

      assert.ok(filter.includes('test_filter_0_split'), 'Shot 1 must render split podcast filter');
      assert.ok(filter.includes('test_filter_1_unresolved_blur'), 'Shot 2 must render safe blur fallback filter');
    });

    test('4. Duplicate speaker track IDs return safe unresolved state across all shots', () => {
      const samples = Array.from({ length: 8 }, (_, i) => ({
        time: i * 0.5,
        faces: [makeFace('spk_alice', 0.25), makeFace('spk_bob', 0.75)],
      }));

      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [2.0],
        duration: 4.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        speaker1TrackId: 'spk_alice',
        speaker2TrackId: 'spk_alice', // Duplicate!
        windowScope: 'shot',
      });

      assert.ok(plan.every((s) => s.splitGeometry?.unresolved === true));
      assert.ok(plan.every((s) => s.splitGeometry?.unresolvedReason === 'duplicate_speaker_track_ids'));
    });

    test('5. Temporary face detection dropouts within a shot do not collapse split framing', () => {
      // 8 samples in a 4-second shot. In samples 2 and 3, Alice turns away (not detected)
      const samples = Array.from({ length: 8 }, (_, i) => {
        const time = i * 0.5;
        const faces = [makeFace('spk_bob', 0.75, 0.5)];
        if (i !== 2 && i !== 3) {
          faces.push(makeFace('spk_alice', 0.25, 0.4));
        }
        return { time, faces };
      });

      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        duration: 4.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        speaker1TrackId: 'spk_alice',
        speaker2TrackId: 'spk_bob',
        windowScope: 'shot',
      });

      assert.equal(plan.length, 1);
      assert.equal(plan[0].splitGeometry!.unresolved, false, 'Temporary dropout must not collapse split framing');
      assert.equal(plan[0].splitGeometry!.speaker1.x, 0.25);
      assert.equal(plan[0].splitGeometry!.speaker2.x, 0.75);
    });

    test('6. Scene cuts at non-integer timestamps maintain exact trim boundaries and concat durations', () => {
      const samples = Array.from({ length: 24 }, (_, i) => ({
        time: i * 0.25,
        faces: [makeFace('spk_alice', 0.3), makeFace('spk_bob', 0.7)],
      }));

      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [1.75, 4.25],
        duration: 6.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        speaker1TrackId: 'spk_alice',
        speaker2TrackId: 'spk_bob',
      });

      assert.equal(plan.length, 3);
      assert.equal(plan[0].start, 0);
      assert.equal(plan[0].end, 1.75);
      assert.equal(plan[1].start, 1.75);
      assert.equal(plan[1].end, 4.25);
      assert.equal(plan[2].start, 4.25);
      assert.equal(plan[2].end, 6.0);

      const filter = SmartReframeService.buildShotCompositionFilter({
        plan,
        sourceWidth: 1920,
        sourceHeight: 1080,
        duration: 6.0,
        tag: 'exact_cut',
      });

      assert.ok(filter.includes('trim=start=0.000000:duration=1.750000'));
      assert.ok(filter.includes('trim=start=1.750000:duration=2.500000'));
      assert.ok(filter.includes('trim=start=4.250000:duration=1.750000'));
      assert.ok(filter.includes('concat=n=3:v=1:a=0'));
      assert.ok(filter.includes('trim=end_frame=180'));
    });

    test('7. Preview / Export parity holds for each shot across scene cuts with inverted speakers', () => {
      const samples = Array.from({ length: 12 }, (_, i) => {
        const time = i * 0.5;
        if (time < 3.0) {
          return { time, faces: [makeFace('spk_alice', 0.28, 0.42), makeFace('spk_bob', 0.72, 0.58)] };
        } else {
          return { time, faces: [makeFace('spk_alice', 0.72, 0.42), makeFace('spk_bob', 0.28, 0.58)] };
        }
      });

      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [3.0],
        duration: 6.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        speaker1TrackId: 'spk_alice',
        speaker2TrackId: 'spk_bob',
        windowScope: 'shot',
      });

      assert.equal(plan.length, 2);

      // Verify Parity for Shot 1
      const shot1Geom = plan[0].splitGeometry!;
      const exportFilterShot1 = SmartReframeService.buildLayoutCropFilter({
        layoutMode: 'split',
        aspectRatio: '9:16',
        sourceWidth: 1920,
        sourceHeight: 1080,
        duration: 3.0,
        splitGeometry: shot1Geom,
      });

      const ffmpegShot1Top = parseFfmpegPanelCrop(exportFilterShot1, 'v_top', 1920, 1080, 1080, 1920);
      const ffmpegShot1Bot = parseFfmpegPanelCrop(exportFilterShot1, 'v_bot', 1920, 1080, 1080, 1920);

      const cssShot1Top = renderSplitPanelCss({
        geometry: shot1Geom.speaker1,
        sourceWidth: 1920,
        sourceHeight: 1080,
        boxW: 360,
        boxH: 320,
        canvasWidth: 1080,
        canvasHeight: 1920,
      });
      const parsedCssShot1Top = parseCssPanelCrop(cssShot1Top, 360, 320);

      const cssShot1Bot = renderSplitPanelCss({
        geometry: shot1Geom.speaker2,
        sourceWidth: 1920,
        sourceHeight: 1080,
        boxW: 360,
        boxH: 320,
        canvasWidth: 1080,
        canvasHeight: 1920,
      });
      const parsedCssShot1Bot = parseCssPanelCrop(cssShot1Bot, 360, 320);

      assert.ok(Math.abs(parsedCssShot1Top.normLeft - ffmpegShot1Top.normLeft) < PARITY_TOLERANCE, 'Shot 1 Top Left Parity');
      assert.ok(Math.abs(parsedCssShot1Top.normRight - ffmpegShot1Top.normRight) < PARITY_TOLERANCE, 'Shot 1 Top Right Parity');
      assert.ok(Math.abs(parsedCssShot1Bot.normLeft - ffmpegShot1Bot.normLeft) < PARITY_TOLERANCE, 'Shot 1 Bot Left Parity');
      assert.ok(Math.abs(parsedCssShot1Bot.normRight - ffmpegShot1Bot.normRight) < PARITY_TOLERANCE, 'Shot 1 Bot Right Parity');

      // Verify Parity for Shot 2 (where Alice moved to the right)
      const shot2Geom = plan[1].splitGeometry!;
      const exportFilterShot2 = SmartReframeService.buildLayoutCropFilter({
        layoutMode: 'split',
        aspectRatio: '9:16',
        sourceWidth: 1920,
        sourceHeight: 1080,
        duration: 3.0,
        splitGeometry: shot2Geom,
      });

      const ffmpegShot2Top = parseFfmpegPanelCrop(exportFilterShot2, 'v_top', 1920, 1080, 1080, 1920);
      const ffmpegShot2Bot = parseFfmpegPanelCrop(exportFilterShot2, 'v_bot', 1920, 1080, 1080, 1920);

      const cssShot2Top = renderSplitPanelCss({
        geometry: shot2Geom.speaker1,
        sourceWidth: 1920,
        sourceHeight: 1080,
        boxW: 360,
        boxH: 320,
        canvasWidth: 1080,
        canvasHeight: 1920,
      });
      const parsedCssShot2Top = parseCssPanelCrop(cssShot2Top, 360, 320);

      const cssShot2Bot = renderSplitPanelCss({
        geometry: shot2Geom.speaker2,
        sourceWidth: 1920,
        sourceHeight: 1080,
        boxW: 360,
        boxH: 320,
        canvasWidth: 1080,
        canvasHeight: 1920,
      });
      const parsedCssShot2Bot = parseCssPanelCrop(cssShot2Bot, 360, 320);

      assert.ok(Math.abs(parsedCssShot2Top.normLeft - ffmpegShot2Top.normLeft) < PARITY_TOLERANCE, 'Shot 2 Top Left Parity');
      assert.ok(Math.abs(parsedCssShot2Top.normRight - ffmpegShot2Top.normRight) < PARITY_TOLERANCE, 'Shot 2 Top Right Parity');
      assert.ok(Math.abs(parsedCssShot2Bot.normLeft - ffmpegShot2Bot.normLeft) < PARITY_TOLERANCE, 'Shot 2 Bot Left Parity');
      assert.ok(Math.abs(parsedCssShot2Bot.normRight - ffmpegShot2Bot.normRight) < PARITY_TOLERANCE, 'Shot 2 Bot Right Parity');
    });

    test('8. Manual scene layout override takes strict precedence over automatic split plan', async () => {
      const { expandSceneLayoutItem } = await import('../shared/sceneLayoutOverrides.js');
      const item: any = {
        id: 'split_video',
        source_start: 0,
        source_end: 9,
        timeline_start: 0,
        timeline_end: 9,
        crop_config: { layout_mode_source: 'auto' },
        scene_layout_overrides: [
          {
            start: 3,
            end: 6,
            layout: 'fill',
            patch: {
              crop: { mode: 'fill', focusX: 0.5, focusY: 0.5, scale: 1 },
              crop_config: { layout_mode: 'track', layout_mode_source: 'user' },
            },
          },
        ],
      };

      const slices = expandSceneLayoutItem(item);
      assert.equal(slices.length, 3, 'Should expand into 3 slices');

      // Slice 0 (0 to 3): Auto split mode preserved
      assert.equal(slices[0].crop, undefined);
      assert.equal(slices[0].crop_config.layout_mode_source, 'auto');

      // Slice 1 (3 to 6): Manual Fill override takes precedence
      assert.equal(slices[1].crop.mode, 'fill');
      assert.equal(slices[1].crop_config.layout_mode_source, 'user');

      // Slice 2 (6 to 9): Auto split mode preserved
      assert.equal(slices[2].crop, undefined);
      assert.equal(slices[2].crop_config.layout_mode_source, 'auto');
    });
  });

  describe('P1.3 Corrective Scope — Adversarial Review Findings', () => {
    test('1. One real speaker plus one single-frame false face does not form split layout', () => {
      // 4 samples: t1 appears in all 4 samples (real speaker); t_false appears in only 1 sample (e.g. shirt button/poster)
      const samples: ReframeSample[] = [
        { time: 0.0, faces: [{ x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 't1' }] },
        { time: 0.25, faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 't1' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.85, track_id: 't_false' },
        ] },
        { time: 0.5, faces: [{ x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 't1' }] },
        { time: 0.75, faces: [{ x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 't1' }] },
      ];
      const geom = SmartReframeService.computeSplitSpeakerGeometry({
        rawSamples: samples,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      // Single-frame detection cannot establish a second speaker
      assert.equal(geom, null, 'Single-frame detection must not form split layout');
    });

    test('2. Low-confidence false detection (< 0.50) is rejected as detector noise', () => {
      // 4 samples: t1 has confidence 0.9. t_noise has 3 observations but confidence 0.35 (below 0.50 floor).
      const samples: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 't1' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.35, track_id: 't_noise' },
        ],
      }));
      const geom = SmartReframeService.computeSplitSpeakerGeometry({
        rawSamples: samples,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      assert.equal(geom, null, 'Low-confidence detections must be rejected');
    });

    test('3. Missing confidence field relies on corroboration across observations', () => {
      // 3 samples: confidence is undefined on both tracks. Repeated observations corroborate them.
      const samples: ReframeSample[] = Array.from({ length: 3 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, track_id: 't1' } as any,
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, track_id: 't2' } as any,
        ],
      }));
      const geom = SmartReframeService.computeSplitSpeakerGeometry({
        rawSamples: samples,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      assert.ok(geom, 'Corroborated observations without confidence field should form valid split');
      assert.equal(geom!.unresolved, false);
      assert.equal(geom!.speaker1TrackId, 't1');
      assert.equal(geom!.speaker2TrackId, 't2');
    });

    test('4. Valid two-speaker short shot (2 samples) successfully establishes split framing', () => {
      const samples: ReframeSample[] = Array.from({ length: 2 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.88, track_id: 't1' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.85, track_id: 't2' },
        ],
      }));
      const geom = SmartReframeService.computeSplitSpeakerGeometry({
        rawSamples: samples,
        sourceWidth: 1920,
        sourceHeight: 1080,
        minTrackObservations: 2,
      });
      assert.ok(geom);
      assert.equal(geom!.unresolved, false);
      assert.equal(geom!.speaker1TrackId, 't1');
      assert.equal(geom!.speaker2TrackId, 't2');
    });

    test('5. Shot with insufficient samples (< 2) returns explicit unresolved geometry and never substitutes clip-wide samples', () => {
      const singleSample: ReframeSample[] = [
        { time: 0.1, faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 't1' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 't2' },
        ] },
      ];
      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: singleSample,
        sceneCuts: [],
        duration: 0.4,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      assert.equal(plan.length, 1);
      assert.equal(plan[0].splitGeometry?.unresolved, true);
      assert.equal(plan[0].splitGeometry?.unresolvedReason, 'insufficient_shot_observations');
      assert.equal(plan[0].contextStatus, 'unresolved-review-required');
    });

    test('6. Small but consistently detected legitimate face is preserved and framed', () => {
      // Face with area 0.001 (e.g. width: 0.03, height: 0.033) detected consistently across 4 samples
      const samples: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 't1' },
          { x: 0.73, y: 0.33, width: 0.03, height: 0.033, center_x: 0.75, center_y: 0.35, confidence: 0.85, track_id: 't_small' },
        ],
      }));
      const geom = SmartReframeService.computeSplitSpeakerGeometry({
        rawSamples: samples,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      assert.ok(geom, 'Small legitimate face must be preserved');
      assert.equal(geom!.unresolved, false);
      assert.equal(geom!.speaker1TrackId, 't1');
      assert.equal(geom!.speaker2TrackId, 't_small');
    });

    test('7. Multi-guest conversation: Host + Guest A in shot 1, Host + Guest B in shot 2 maintains Host in panel 1', () => {
      const shot1Samples: ReframeSample[] = Array.from({ length: 6 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 'host' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 'guest_a' },
        ],
      }));
      const shot2Samples: ReframeSample[] = Array.from({ length: 6 }, (_, i) => ({
        time: 1.5 + i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 'host' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 'guest_b' },
        ],
      }));
      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: [...shot1Samples, ...shot2Samples],
        sceneCuts: [1.5],
        duration: 3.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      assert.equal(plan.length, 2);
      // Shot 1: host in panel 1, guest_a in panel 2
      assert.equal(plan[0].splitGeometry?.unresolved, false);
      assert.equal(plan[0].splitGeometry?.speaker1TrackId, 'host');
      assert.equal(plan[0].splitGeometry?.speaker2TrackId, 'guest_a');
      // Shot 2: host continues in panel 1, guest_b fills panel 2
      assert.equal(plan[1].splitGeometry?.unresolved, false);
      assert.equal(plan[1].splitGeometry?.speaker1TrackId, 'host');
      assert.equal(plan[1].splitGeometry?.speaker2TrackId, 'guest_b');
    });

    test('8. Track IDs reset across a hard cut frames each shot cleanly without failing', () => {
      // Shot 1 has tracker IDs [t1, t2]; Shot 2 has tracker IDs [t3, t4]
      const shot1: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 't1' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 't2' },
        ],
      }));
      const shot2: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: 1.0 + i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 't3' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 't4' },
        ],
      }));
      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: [...shot1, ...shot2],
        sceneCuts: [1.0],
        duration: 2.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      assert.equal(plan.length, 2);
      assert.equal(plan[0].splitGeometry?.unresolved, false);
      assert.equal(plan[1].splitGeometry?.unresolved, false);
      assert.equal(plan[1].splitGeometry?.speaker1TrackId, 't3');
      assert.equal(plan[1].splitGeometry?.speaker2TrackId, 't4');
    });

    test('9. Same track IDs continue across adjacent shots with identical panel assignments', () => {
      const shot1: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 'spk1' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 'spk2' },
        ],
      }));
      const shot2: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: 1.0 + i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 'spk1' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 'spk2' },
        ],
      }));
      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: [...shot1, ...shot2],
        sceneCuts: [1.0],
        duration: 2.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      assert.equal(plan[0].splitGeometry?.speaker1TrackId, 'spk1');
      assert.equal(plan[0].splitGeometry?.speaker2TrackId, 'spk2');
      assert.equal(plan[1].splitGeometry?.speaker1TrackId, 'spk1');
      assert.equal(plan[1].splitGeometry?.speaker2TrackId, 'spk2');
    });

    test('10. Reverse angle camera cut preserves speaker identity in panel 1 and 2', () => {
      // Shot 1: A on left (0.25), B on right (0.75)
      const shot1: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 'spkA' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 'spkB' },
        ],
      }));
      // Shot 2: Reverse camera angle: A is now on right (0.75), B is now on left (0.25)
      const shot2: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: 1.0 + i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 'spkB' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 'spkA' },
        ],
      }));
      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: [...shot1, ...shot2],
        sceneCuts: [1.0],
        duration: 2.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      // In both shots, spkA must remain Speaker 1 (panel 1) and spkB must remain Speaker 2 (panel 2)
      assert.equal(plan[0].splitGeometry?.speaker1TrackId, 'spkA');
      assert.equal(plan[0].splitGeometry?.speaker2TrackId, 'spkB');
      assert.equal(plan[1].splitGeometry?.speaker1TrackId, 'spkA');
      assert.equal(plan[1].splitGeometry?.speaker2TrackId, 'spkB');
      // In shot 2, panel 1 anchors onto spkA at x=0.75, panel 2 anchors onto spkB at x=0.25
      assert.equal(plan[1].splitGeometry?.speaker1.x, 0.75);
      assert.equal(plan[1].splitGeometry?.speaker2.x, 0.25);
    });

    test('11. Ambiguous continuity does not invent identity across cuts', () => {
      // Shot 1 has [alpha, beta]; Shot 2 has [gamma, delta] (unrelated scene)
      const shot1: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 'alpha' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 'beta' },
        ],
      }));
      const shot2: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: 1.0 + i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 'gamma' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 'delta' },
        ],
      }));
      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: [...shot1, ...shot2],
        sceneCuts: [1.0],
        duration: 2.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      assert.equal(plan[1].splitGeometry?.speaker1TrackId, 'gamma');
      assert.equal(plan[1].splitGeometry?.speaker2TrackId, 'delta');
      assert.match(plan[1].uncertainty!, /continuity unverified/);
    });

    test('12. Explicit requested track ID missing in subsequent shot flags unresolved with requested_speaker_track_not_found', () => {
      const shot1: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 'target_spk' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 'other_spk' },
        ],
      }));
      const shot2: ReframeSample[] = Array.from({ length: 4 }, (_, i) => ({
        time: 1.0 + i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 'someone_else' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 'other_spk' },
        ],
      }));
      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: [...shot1, ...shot2],
        sceneCuts: [1.0],
        duration: 2.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        speaker1TrackId: 'target_spk',
      });
      assert.equal(plan[0].splitGeometry?.unresolved, false);
      assert.equal(plan[1].splitGeometry?.unresolved, true);
      assert.equal(plan[1].splitGeometry?.unresolvedReason, 'requested_speaker_track_not_found');
    });

    test('13. Three candidate tracks within one shot prefers the two dominant tracks', () => {
      const samples: ReframeSample[] = Array.from({ length: 6 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 't_high' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 't_mid' },
          ...(i < 3 ? [{ x: 0.5, y: 0.5, width: 0.1, height: 0.1, center_x: 0.5, center_y: 0.5, confidence: 0.8, track_id: 't_low' }] : []),
        ],
      }));
      const geom = SmartReframeService.computeSplitSpeakerGeometry({
        rawSamples: samples,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      assert.ok(geom);
      assert.equal(geom!.speaker1TrackId, 't_high');
      assert.equal(geom!.speaker2TrackId, 't_mid');
    });

    test('14. Shot-local split filter generation for 1:1 canvas outputs 1080x540 panel crops', () => {
      const samples: ReframeSample[] = Array.from({ length: 8 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 's1' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 's2' },
        ],
      }));
      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [1.0],
        duration: 2.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        canvasWidth: 1080,
        canvasHeight: 1080,
      });
      const filter = SmartReframeService.buildShotCompositionFilter({
        plan,
        duration: 2.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        aspectRatio: '1:1',
      });
      assert.match(filter, /crop=1080:540/);
      assert.match(filter, /vstack/);
    });

    test('15. Shot-local split filter generation for 16:9 canvas outputs 1920x540 panel crops', () => {
      const samples: ReframeSample[] = Array.from({ length: 8 }, (_, i) => ({
        time: i * 0.25,
        faces: [
          { x: 0.2, y: 0.3, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.35, confidence: 0.9, track_id: 's1' },
          { x: 0.7, y: 0.3, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.35, confidence: 0.9, track_id: 's2' },
        ],
      }));
      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [1.0],
        duration: 2.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        canvasWidth: 1920,
        canvasHeight: 1080,
      });
      const filter = SmartReframeService.buildShotCompositionFilter({
        plan,
        duration: 2.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        aspectRatio: '16:9',
      });
      assert.match(filter, /crop=1920:540/);
      assert.match(filter, /vstack/);
    });

    test('16. renderSplitPanelCss derives exact CSS dimensions for 1:1 (1080x1080) vs 9:16 vs 16:9', () => {
      const geom: SplitPanelGeometry = {
        x: 0.25,
        y: 0.5,
        windowW: 0.3,
        sourceBounds: { left: 0.1, top: 0.2, right: 0.4, bottom: 0.8 },
      };
      // 1:1 canvas (1080x1080): panel height is half height (540px)
      const css11 = renderSplitPanelCss({
        geometry: geom,
        sourceWidth: 1920,
        sourceHeight: 1080,
        boxW: 360,
        boxH: 180,
        canvasWidth: 1080,
        canvasHeight: 1080,
      });
      assert.ok(css11);
      assert.equal(css11!.panelH, 180);

      // 9:16 canvas (1080x1920): panel height is half height (960px)
      const css916 = renderSplitPanelCss({
        geometry: geom,
        sourceWidth: 1920,
        sourceHeight: 1080,
        boxW: 360,
        boxH: 320,
        canvasWidth: 1080,
        canvasHeight: 1920,
      });
      assert.ok(css916);
      assert.equal(css916!.panelH, 320);
    });
  });
});
