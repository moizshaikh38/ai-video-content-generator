import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SmartReframeService } from '../services/smartReframeService.js';

// Regression: Sintel 2.5-3.25 shot anchored at centerX 0.0352 (empty snow)
// because a single tiny low-confidence edge detection at the shot's first
// sample was adopted as the shot's only track. The gated path rejects it.
describe('shot single-track presence gate (SMART_REFRAME_SHOT_TRACK_GATE)', () => {
  const mkSamples = () => {
    const samples: any[] = [];
    // Shot 1 (0-2.5): steady real track near center-left
    for (let i = 0; i < 10; i++) {
      samples.push({ time: i * 0.25, faces: [{ x: 0.4, y: 0.2, width: 0.15, height: 0.25, center_x: 0.475, center_y: 0.325, confidence: 0.92, track_id: 'real' }] });
    }
    // Shot 2 (2.5-3.25): one lone tiny low-conf edge detection, then nothing
    samples.push({ time: 2.5, faces: [{ x: 0.0125, y: 0.4, width: 0.045, height: 0.08, center_x: 0.035, center_y: 0.44, confidence: 0.78, track_id: 'edge-fp' }] });
    samples.push({ time: 2.75, faces: [] });
    samples.push({ time: 3.0, faces: [] });
    return samples;
  };
  const baseParams = () => ({
    samples: mkSamples(),
    dominantTrackId: 'real',
    duration: 3.25,
    sceneCuts: [2.5],
    aspectRatio: '9:16' as const,
    sourceWidth: 1280,
    sourceHeight: 720,
  });

  it('default (flag unset): legacy adoption parks the shot on the edge detection', () => {
    delete process.env.SMART_REFRAME_SHOT_TRACK_GATE;
    const kfs = SmartReframeService.smoothAndGenerateKeyframes(baseParams());
    const inShot = kfs.filter((k) => k.time >= 2.5 && k.time < 3.25);
    assert.ok(inShot.length > 0, 'expected keyframes inside the second shot');
    const minX = Math.min(...inShot.map((k) => k.centerX));
    assert.ok(minX < 0.1, `expected legacy far-left anchor, got min ${minX} in ${JSON.stringify(inShot)}`);
  });

  it('gated: lone detection is rejected and the shot eases to center', () => {
    process.env.SMART_REFRAME_SHOT_TRACK_GATE = '1';
    try {
      const kfs = SmartReframeService.smoothAndGenerateKeyframes(baseParams());
      const inShot = kfs.filter((k) => k.time >= 2.5 && k.time < 3.25);
      assert.ok(inShot.length > 0);
      for (const k of inShot) {
        assert.ok(k.centerX > 0.35, `expected near-center, got ${k.centerX} at t=${k.time}`);
      }
    } finally {
      delete process.env.SMART_REFRAME_SHOT_TRACK_GATE;
    }
  });

  it('gated: a persistent single track in the shot is still adopted', () => {
    process.env.SMART_REFRAME_SHOT_TRACK_GATE = '1';
    try {
      const params = baseParams();
      // Give the second shot a persistent (3-sample) track off-center
      params.samples[10].faces = [{ x: 0.7, y: 0.2, width: 0.12, height: 0.2, center_x: 0.76, center_y: 0.3, confidence: 0.9, track_id: 'solo' }];
      params.samples[11].faces = [{ x: 0.7, y: 0.2, width: 0.12, height: 0.2, center_x: 0.76, center_y: 0.3, confidence: 0.9, track_id: 'solo' }];
      params.samples[12].faces = [{ x: 0.7, y: 0.2, width: 0.12, height: 0.2, center_x: 0.76, center_y: 0.3, confidence: 0.9, track_id: 'solo' }];
      const kfs = SmartReframeService.smoothAndGenerateKeyframes(params);
      const inShot = kfs.filter((k) => k.time >= 2.5 && k.time <= 3.26);
      assert.ok(inShot.some((k) => k.centerX > 0.6), `expected adoption of persistent track, got ${JSON.stringify(inShot)}`);
    } finally {
      delete process.env.SMART_REFRAME_SHOT_TRACK_GATE;
    }
  });
});
