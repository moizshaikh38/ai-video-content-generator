import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SmartReframeService } from '../services/smartReframeService.js';

describe('screencast facecam-region inset (burned-in facecam recordings)', () => {
  const box = { x: 0.8594, y: 0.1167, w: 0.0641, h: 0.1139 };

  it('crops the given facecam region in the inset branch when provided', () => {
    const filter = SmartReframeService.buildScreencastFilter({
      mode: 'rounded_card_inset',
      insetPosition: 'top_right',
      facecamBox: box,
    });
    assert.match(filter, /\[cam\]crop=w='in_w\*[0-9.]+':h='in_h\*[0-9.]+':x='in_w\*[0-9.]+':y='in_h\*[0-9.]+',scale=/);
    assert.match(filter, /overlay=x=\d+:y=\d+\[out\]/);
  });

  it('legacy full-frame inset behavior is unchanged when no box is given', () => {
    const filter = SmartReframeService.buildScreencastFilter({
      mode: 'rounded_card_inset',
      insetPosition: 'top_right',
    });
    assert.match(filter, /\[cam\]scale=\d+:\d+:force_original_aspect_ratio=increase,crop=\d+:\d+\[card\]/);
  });

  it('findStaticFacecamBox returns the static track median box and ignores moving tracks', () => {
    const mk = (t: number, track: string, x: number, y: number) => ({
      time: t,
      faces: [{ x, y, width: 0.06, height: 0.11, center_x: x + 0.03, center_y: y + 0.055, confidence: 0.9, track_id: track }],
    });
    const samples = [];
    for (let i = 0; i < 20; i++) {
      samples.push(mk(i * 0.25, 'cam', 0.86 + (i % 2) * 0.001, 0.12));
    }
    for (let i = 0; i < 20; i++) {
      samples.push(mk(i * 0.25 + 100, 'moving', 0.1 + i * 0.03, 0.4));
    }
    const found = SmartReframeService.findStaticFacecamBox(samples as any);
    assert.ok(found, 'expected a static track to be found');
    assert.ok(Math.abs(found.x - 0.86) < 0.01 && Math.abs(found.y - 0.12) < 0.01);
  });

  it('findStaticFacecamBox returns null when tracks move', () => {
    const samples = [];
    for (let i = 0; i < 20; i++) {
      samples.push({
        time: i * 0.25,
        faces: [{ x: 0.1 + i * 0.03, y: 0.4, width: 0.06, height: 0.11, center_x: 0.13 + i * 0.03, center_y: 0.455, confidence: 0.9, track_id: 'moving' }],
      });
    }
    assert.equal(SmartReframeService.findStaticFacecamBox(samples as any), null);
  });
});
