import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MockDubbingProvider } from '../services/distribution/dubbingAdapter.js';
import { SocialPublisherAdapter } from '../services/distribution/socialPublisherAdapter.js';

describe('Phase 10: Optional Integrations & Distribution Adapters', () => {
  describe('Multilingual Audio Dubbing Adapter', () => {
    const dubbingProvider = new MockDubbingProvider();

    it('1. discovers supported dubbing languages', () => {
      const languages = dubbingProvider.getSupportedLanguages();
      assert.ok(languages.includes('es'));
      assert.ok(languages.includes('fr'));
      assert.ok(languages.includes('ja'));
      assert.ok(languages.includes('hi'));
    });

    it('2. executes dubbing pipeline for supported language', async () => {
      const result = await dubbingProvider.dubClip({
        clipId: 'clip_abc_123',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        transcriptText: 'Hello world this is a test',
      });

      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.targetLanguage, 'es');
      assert.ok(result.dubbedAudioUrl?.includes('.mp3'));
      assert.ok(result.wordAlignmentOffsetSec !== undefined);
    });

    it('3. rejects unsupported target language cleanly', async () => {
      const result = await dubbingProvider.dubClip({
        clipId: 'clip_abc_123',
        targetLanguage: 'elvish' as any,
      });

      assert.strictEqual(result.status, 'failed');
      assert.ok(result.error?.includes('not supported'));
    });
  });

  describe('Social Publisher Adapter', () => {
    it('1. clamps title to 100 characters for YouTube Shorts', () => {
      const longTitle = 'A'.repeat(120);
      const sanitized = SocialPublisherAdapter.sanitizeForPlatform({
        clipId: 'clip_1',
        platform: 'youtube_shorts',
        videoUrl: 'https://cdn.example.com/video.mp4',
        title: longTitle,
      });

      assert.ok(sanitized.title.length <= 100);
      assert.ok(sanitized.title.endsWith('...'));
    });

    it('2. clamps text to 280 characters for X/Twitter', () => {
      const longTitle = 'B'.repeat(300);
      const sanitized = SocialPublisherAdapter.sanitizeForPlatform({
        clipId: 'clip_2',
        platform: 'x_twitter',
        videoUrl: 'https://cdn.example.com/video.mp4',
        title: longTitle,
      });

      assert.ok(sanitized.title.length <= 280);
    });

    it('3. appends hashtags to description seamlessly', () => {
      const sanitized = SocialPublisherAdapter.sanitizeForPlatform({
        clipId: 'clip_3',
        platform: 'tiktok',
        videoUrl: 'https://cdn.example.com/video.mp4',
        title: 'Check out this video',
        description: 'Amazing content here',
        tags: ['viral', '#growth', 'tech'],
      });

      assert.ok(sanitized.description.includes('Amazing content here'));
      assert.ok(sanitized.description.includes('#viral #growth #tech'));
    });

    it('4. distinguishes scheduled vs immediate publication', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const scheduledResult = await SocialPublisherAdapter.publish({
        clipId: 'clip_4',
        platform: 'instagram_reels',
        videoUrl: 'https://cdn.example.com/video.mp4',
        title: 'Future post',
        scheduledAt: futureDate,
      });

      assert.strictEqual(scheduledResult.status, 'scheduled');
      assert.ok(scheduledResult.externalPostId);

      const immediateResult = await SocialPublisherAdapter.publish({
        clipId: 'clip_5',
        platform: 'instagram_reels',
        videoUrl: 'https://cdn.example.com/video.mp4',
        title: 'Immediate post',
      });

      assert.strictEqual(immediateResult.status, 'published');
    });

    it('5. rejects payload missing videoUrl', async () => {
      const rejected = await SocialPublisherAdapter.publish({
        clipId: 'clip_6',
        platform: 'linkedin',
        videoUrl: '',
        title: 'Invalid post',
      });

      assert.strictEqual(rejected.status, 'rejected');
      assert.ok(rejected.error?.includes('Video URL is required'));
    });
  });
});
