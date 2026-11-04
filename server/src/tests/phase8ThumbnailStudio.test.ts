import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ThumbnailStudioService } from '../services/thumbnailStudioService.js';

describe('Phase 8: YouTube Thumbnail Studio (1280x720)', () => {
  describe('Mobile Title Clamp (<= 50 characters)', () => {
    it('1. keeps titles under 50 characters unchanged', () => {
      const shortTitle = 'How I Made $10,000 in 30 Days';
      const result = ThumbnailStudioService.clampMobileTitle(shortTitle);
      assert.strictEqual(result.isClamped, false);
      assert.strictEqual(result.title, shortTitle);
      assert.ok(result.title.length <= 50);
    });

    it('2. clamps long titles cleanly at word boundary <= 50 chars', () => {
      const longTitle = 'The Ultimate Complete Step-By-Step Secret Blueprint to Scaling Your Online Business';
      const result = ThumbnailStudioService.clampMobileTitle(longTitle);
      assert.strictEqual(result.isClamped, true);
      assert.ok(result.title.length <= 50, `Expected <= 50 chars, got ${result.title.length}`);
      assert.ok(result.title.endsWith('...'));
      // Should not cut in the middle of a word
      assert.ok(!result.title.includes('Secret Blueprint to Scaling Your Online Business'));
    });
  });

  describe('1280x720 Specification & Safe Zones', () => {
    it('1. enforces 1280x720 canvas dimensions', () => {
      const spec = ThumbnailStudioService.generateThumbnailSpec({
        title: 'Stop Doing This In 2026',
        style: 'bold_text_face',
      });

      assert.strictEqual(spec.width, 1280);
      assert.strictEqual(spec.height, 720);
      assert.strictEqual(spec.safeZones.timestampBadgeAvoided, true);
    });

    it('2. positions text on opposite side of detected face', () => {
      // Face on right -> text on left
      const specRightFace = ThumbnailStudioService.generateThumbnailSpec({
        title: 'AI is Changing Everything',
        facePlacement: 'right',
      });
      assert.strictEqual(specRightFace.textPosition.x, 80);

      // Face on left -> text on right
      const specLeftFace = ThumbnailStudioService.generateThumbnailSpec({
        title: 'AI is Changing Everything',
        facePlacement: 'left',
      });
      assert.strictEqual(specLeftFace.textPosition.x, 640);
    });

    it('3. avoids bottom-right timestamp badge (180x60) safe zone', () => {
      const spec = ThumbnailStudioService.generateThumbnailSpec({
        title: 'Important Tech Update',
        facePlacement: 'left',
      });

      // Bottom-right timestamp badge occupies x: 1100..1280, y: 660..720
      const textBottom = spec.textPosition.y + 120;
      const textRight = spec.textPosition.x + spec.textPosition.maxWidth;
      if (textRight > 1100) {
        assert.ok(textBottom <= 620, 'Text must not overlap bottom-right timestamp badge');
      }
    });

    it('4. configures distinct typography for 3 thumbnail styles', () => {
      const boldSpec = ThumbnailStudioService.generateThumbnailSpec({
        title: 'Test Title',
        style: 'bold_text_face',
      });
      assert.strictEqual(boldSpec.typography.fontFamily, 'Arial Black');
      assert.strictEqual(boldSpec.typography.textColor, '#FFFFFF');

      const curiositySpec = ThumbnailStudioService.generateThumbnailSpec({
        title: 'Test Title',
        style: 'high_contrast_curiosity',
      });
      assert.strictEqual(curiositySpec.typography.textColor, '#FFE600');
      assert.strictEqual(curiositySpec.typography.strokeWidth, 6);

      const minimalSpec = ThumbnailStudioService.generateThumbnailSpec({
        title: 'Test Title',
        style: 'cinematic_minimal',
      });
      assert.strictEqual(minimalSpec.typography.fontFamily, 'Inter');
    });
  });

  describe('FFmpeg Filter Generation', () => {
    it('1. builds valid 1280x720 drawtext filter string', () => {
      const spec = ThumbnailStudioService.generateThumbnailSpec({
        title: "Don't Miss This",
        style: 'bold_text_face',
      });

      const filter = ThumbnailStudioService.buildThumbnailFilter(spec);
      assert.ok(filter.startsWith('scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720'));
      assert.ok(filter.includes("drawtext=text='Don'\\''t Miss This'"));
      assert.ok(filter.includes('fontsize=80'));
      assert.ok(filter.includes('borderw=5'));
    });

    it('2. includes vignette in cinematic_minimal filter string', () => {
      const spec = ThumbnailStudioService.generateThumbnailSpec({
        title: 'Cinematic Story',
        style: 'cinematic_minimal',
      });

      const filter = ThumbnailStudioService.buildThumbnailFilter(spec);
      assert.ok(filter.includes('vignette=PI/4'));
      assert.ok(filter.includes('x=(w-text_w)/2'));
    });
  });
});
