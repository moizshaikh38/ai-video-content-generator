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

describe('screencast background composition + config passthrough', () => {
  const box = { x: 0.8594, y: 0.1167, w: 0.0641, h: 0.1139 };

  it('blur background fills the canvas with a blurred cover and fits the source', () => {
    const filter = SmartReframeService.buildScreencastFilter({
      mode: 'rounded_card_inset',
      insetPosition: 'top_right',
      background: 'blur',
      facecamBox: box,
    });
    assert.match(filter, /gblur=sigma=40/);
    assert.match(filter, /\[bgb\]\[fgf\]overlay=\(W-w\)\/2:\(H-h\)\/2\[bg\]/);
    assert.doesNotMatch(filter, /color=black/);
  });

  it('legacy output is byte-unchanged when background is omitted', () => {
    const legacy = SmartReframeService.buildScreencastFilter({ mode: 'rounded_card_inset' });
    const explicit = SmartReframeService.buildScreencastFilter({ mode: 'rounded_card_inset', background: 'black' });
    assert.equal(explicit, legacy);
    assert.match(legacy, /pad=1080:1920:\(ow-iw\)\/2:\(oh-ih\)\/2:color=black/);
  });

  it('buildLayoutCropFilter passes screencast background and facecamBox through', () => {
    const filter = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'screencast',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      screencastMode: 'rounded_card_inset',
      screencastInsetPosition: 'top_right',
      screencastBackground: 'blur',
      screencastFacecamBox: box,
    });
    assert.match(filter, /gblur=sigma=40/);
    assert.match(filter, /\[cam\]crop=w='in_w\*[0-9.]+':h='in_h\*[0-9.]+'/);
    assert.match(filter, /overlay=x=\d+:y=\d+\[out\]/);
  });

  it('buildLayoutCropFilter without screencast extras keeps legacy screencast output', () => {
    const viaDispatch = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'screencast',
      aspectRatio: '9:16',
      sourceWidth: 1920,
      sourceHeight: 1080,
      duration: 10,
      screencastMode: 'rounded_card_inset',
    });
    const direct = SmartReframeService.buildScreencastFilter({ mode: 'rounded_card_inset' });
    assert.equal(viaDispatch, direct);
  });
});

describe('analysis-side facecam suggestion', () => {
  const mkSamples = () => {
    const samples: any[] = [];
    for (let i = 0; i < 20; i++) {
      samples.push({
        time: i * 0.25,
        faces: [
          { x: 0.86 + (i % 2) * 0.001, y: 0.12, width: 0.06, height: 0.11, center_x: 0.89, center_y: 0.175, confidence: 0.9, track_id: 'cam' },
          { x: 0.3 + Math.sin(i) * 0.05, y: 0.3, width: 0.12, height: 0.2, center_x: 0.36 + Math.sin(i) * 0.05, center_y: 0.4, confidence: 0.9, track_id: 'player' },
        ],
      });
    }
    return samples;
  };

  it('findStaticFacecamTrack returns the static track id and box', () => {
    const found = SmartReframeService.findStaticFacecamTrack(mkSamples());
    assert.ok(found);
    assert.equal(found.trackId, 'cam');
    assert.ok(Math.abs(found.box.x - 0.86) < 0.01);
  });

  it('dominant selection can exclude the facecam track and pick the moving subject', () => {
    const samples = mkSamples();
    const { tracks } = (SmartReframeService as any).associateTracks(samples);
    const facecam = SmartReframeService.findStaticFacecamTrack(samples);
    assert.ok(facecam);
    const without = new Map(tracks);
    without.delete(facecam.trackId);
    const withPick = SmartReframeService.selectDominantTrack(tracks, samples.length);
    const withoutPick = SmartReframeService.selectDominantTrack(without, samples.length);
    assert.notEqual(withoutPick.dominantTrackId, null);
    assert.ok(without.has(withoutPick.dominantTrackId!), 'pick must come from the remaining tracks');
    // Sanity: with the static cam track present, selection may land on it;
    // after exclusion it must not.
    assert.notEqual(withoutPick.dominantTrackId, facecam.trackId);
    void withPick;
  });
});

describe('facecam config resolution (clear vs absent semantics)', () => {
  const box = { x: 0.8594, y: 0.1167, w: 0.0641, h: 0.1139 };
  const meta = { facecam_box: box };

  it('absent key falls back to the analysis suggestion', () => {
    assert.deepEqual(SmartReframeService.resolveFacecamBox({}, meta), box);
    assert.deepEqual(SmartReframeService.resolveFacecamBox(undefined, meta), box);
  });

  it('explicit null is an opt-out: suggestion must NOT resurrect', () => {
    assert.equal(SmartReframeService.resolveFacecamBox({ facecamBox: null }, meta), undefined);
  });

  it('user-set box wins over the suggestion', () => {
    const user = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    assert.deepEqual(SmartReframeService.resolveFacecamBox({ facecamBox: user }, meta), user);
  });

  it('no config and no suggestion means no box', () => {
    assert.equal(SmartReframeService.resolveFacecamBox(undefined, undefined), undefined);
    assert.equal(SmartReframeService.resolveFacecamBox({}, {}), undefined);
  });

  it('malformed suggestion is ignored', () => {
    assert.equal(SmartReframeService.resolveFacecamBox({}, { facecam_box: { x: 'bad' } }), undefined);
  });
});
