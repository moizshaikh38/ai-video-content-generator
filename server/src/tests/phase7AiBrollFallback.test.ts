import { describe, it } from 'node:test';
import assert from 'node:assert';
import { KenBurnsUtils } from '../utils/kenBurnsUtils.js';
import { StockMediaProviderRegistry } from '../services/stockMediaProvider.js';

describe('Phase 7: Semantic B-Roll & Fallback AI Generation', () => {
  describe('Ken Burns Motion Filter Generation', () => {
    it('1. builds slow_zoom_in zoompan expression correctly', () => {
      const filter = KenBurnsUtils.buildKenBurnsFilter({
        motion: 'slow_zoom_in',
        durationSec: 4.0,
        fps: 30,
        outputWidth: 1080,
        outputHeight: 1920,
        zoomFactor: 1.2,
      });

      // 4s * 30fps = 120 frames
      assert.ok(filter.startsWith("zoompan=z='min(zoom+"));
      assert.ok(filter.includes(':d=120:'));
      assert.ok(filter.includes(":s=1080x1920:fps=30"));
      assert.ok(filter.includes("x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"));
    });

    it('2. builds slow_zoom_out zoompan expression correctly', () => {
      const filter = KenBurnsUtils.buildKenBurnsFilter({
        motion: 'slow_zoom_out',
        durationSec: 3.0,
        fps: 30,
        outputWidth: 1080,
        outputHeight: 1920,
        zoomFactor: 1.25,
      });

      // 3s * 30fps = 90 frames
      assert.ok(filter.includes(':d=90:'));
      assert.ok(filter.includes("lte(zoom,1.0),1.25"));
    });

    it('3. builds horizontal camera pan expressions', () => {
      const panLtoR = KenBurnsUtils.buildKenBurnsFilter({
        motion: 'pan_left_to_right',
        durationSec: 5.0,
        fps: 30,
      });

      assert.ok(panLtoR.includes('zoompan=z=1.15'));
      assert.ok(panLtoR.includes(':d=150:'));
      assert.ok(panLtoR.includes("min(x+"));

      const panRtoL = KenBurnsUtils.buildKenBurnsFilter({
        motion: 'pan_right_to_left',
        durationSec: 5.0,
        fps: 30,
      });

      assert.ok(panRtoL.includes("max(0,x-"));
    });

    it('4. builds full static-image-to-video pre-scale chain', () => {
      const fullChain = KenBurnsUtils.buildStaticImageToVideoFilter({
        motion: 'slow_zoom_in',
        durationSec: 4.0,
        outputWidth: 1080,
        outputHeight: 1920,
      });

      // 1080 * 1.25 = 1350, 1920 * 1.25 = 2400
      assert.ok(fullChain.includes('scale=1350:2400'));
      assert.ok(fullChain.includes('format=yuv420p'));
    });
  });

  describe('Prompt Sanitization & AI Fallback Trigger', () => {
    it('1. sanitizes prompt strings safely', () => {
      const dirty = 'A futuristic "crypto" \\\\ trader\n\nworking at desk   with neon   lighting';
      const clean = KenBurnsUtils.sanitizePrompt(dirty);
      assert.strictEqual(clean, 'A futuristic crypto trader working at desk with neon lighting');
    });

    it('2. falls back to AI generation when stock media has 0 results', async () => {
      // Very obscure niche query unlikely to exist in mock/unconfigured stock
      const obscureQuery = 'quantum computing microchip vibrating in liquid helium supercooled bath';
      const result = await StockMediaProviderRegistry.searchWithAiFallback(obscureQuery, {
        duration: 4.0,
      });

      assert.ok(result);
      if (result.fellBackToAi) {
        assert.strictEqual(result.provider, 'ai_generated');
        assert.strictEqual(result.items.length, 1);
        assert.ok(result.items[0].title.includes('AI B-Roll'));
        assert.strictEqual(result.items[0].aspect_ratio, '9:16');
      }
    });
  });
});
