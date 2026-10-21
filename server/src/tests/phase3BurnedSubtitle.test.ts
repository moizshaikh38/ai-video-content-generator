import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BurnedSubtitleService,
  FaceBoundingBox,
} from '../services/burnedSubtitleService.js';

describe('Phase 3: Burned Subtitle & Safe Placement Tests', () => {
  describe('Face-Aware Hook Placement', () => {
    it('1. moves hook position to avoid overlapping a face in the upper third', () => {
      // Face occupies y: 0.15 to 0.30 (speaker's head in upper third)
      const faceBoxes: FaceBoundingBox[] = [
        { x: 0.35, y: 0.15, width: 0.3, height: 0.15 },
      ];

      const result = BurnedSubtitleService.computeFaceAwareHookPosition(
        faceBoxes,
        [0.18, 0.25, 0.50, 0.72]
      );

      // Should avoid 0.18 and 0.25, picking 0.50 (center) or 0.72 (lower)
      assert.ok(result.yPercent >= 0.50, `Expected hook yPercent >= 0.50, got ${result.yPercent}`);
      assert.ok(result.reason.includes('zero face obstruction') || result.reason.includes('minimizing face collision'));
    });

    it('2. defaults to upper third when no faces are present', () => {
      const result = BurnedSubtitleService.computeFaceAwareHookPosition([]);
      assert.strictEqual(result.yPercent, 0.18);
    });

    it('3. respects mobile safe zones (never places in top 12% or bottom 20%)', () => {
      const result = BurnedSubtitleService.computeFaceAwareHookPosition(
        [],
        [0.05, 0.10, 0.20, 0.85, 0.95] // 0.05 and 0.10 are inside top 12%; 0.85 and 0.95 inside bottom 20%
      );

      assert.strictEqual(result.yPercent, 0.20, 'Must only select candidates strictly inside safe zone');
    });
  });

  describe('Split-Seam Caption Placement', () => {
    it('1. calculates exact seam position and ASS tag for 1080x1920 canvas', () => {
      const seam = BurnedSubtitleService.computeSplitSeamCaptionPosition(1080, 1920, 0.5);

      assert.strictEqual(seam.posX, 540);
      assert.strictEqual(seam.posY, 960);
      assert.strictEqual(seam.assAlignmentTag, '{\\an5\\pos(540,960)}');
    });

    it('2. supports asymmetric split ratios (e.g. 60/40 screencast)', () => {
      const seam = BurnedSubtitleService.computeSplitSeamCaptionPosition(1080, 1920, 0.6);

      assert.strictEqual(seam.posX, 540);
      assert.strictEqual(seam.posY, 1152);
      assert.strictEqual(seam.assAlignmentTag, '{\\an5\\pos(540,1152)}');
    });
  });

  describe('Burned Subtitle Detection', () => {
    it('1. handles empty frame paths gracefully', async () => {
      const result = await BurnedSubtitleService.detectBurnedSubtitles([]);
      assert.strictEqual(result.hasBurnedSubtitles, false);
      assert.strictEqual(result.bandHeightRatio, 0);
    });
  });
});
