import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SmartReframeService } from '../services/smartReframeService.js';
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
    // Window is 1.7x subject separation (0.4 * 1.7 = 0.68), clamped to the 0.62 ceiling.
    assert.ok(Math.abs(geom!.speaker1.windowW - 0.62) < 1e-6, `windowW=${geom!.speaker1.windowW}`);
    assert.equal(geom!.speaker1.windowW, geom!.speaker2.windowW);
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

  test('clamps the window for near-overlapping and far-apart subjects', () => {
    const tight = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.45, 0.3, 0.5, 0.3),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(tight);
    assert.equal(tight!.speaker1.windowW, 0.28, 'very tight separation clamps to the 0.28 floor');

    const wide = SmartReframeService.computeSplitSpeakerGeometry({
      rawSamples: twoSubjectSamples(0.12, 0.3, 0.88, 0.3),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(wide);
    assert.equal(wide!.speaker1.windowW, 0.62, 'wide separation clamps to the 0.62 ceiling');
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
