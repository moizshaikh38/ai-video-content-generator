import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SmartReframeService } from '../services/smartReframeService.js';
import { ViralIntelligenceService } from '../services/viralIntelligenceService.js';
import { TranscriptWord } from '../types/index.js';

describe('Phase 6: Advanced Layouts, Visual Hooks & Pacing Intelligence', () => {
  describe('Screencast & Camera Inset Filter Graph Generation', () => {
    it('1. generates valid FFmpeg split_stacked filter string', () => {
      const filter = SmartReframeService.buildScreencastFilter({
        mode: 'split_stacked',
        screenRatio: 0.6,
        canvasWidth: 1080,
        canvasHeight: 1920,
      });

      assert.ok(filter.includes('[0:v]split=2[scr][spk]'));
      assert.ok(filter.includes('scale=1080:1152'));
      assert.ok(filter.includes('scale=1080:768'));
      assert.ok(filter.includes('vstack[out]'));
    });

    it('2. generates valid circular camera inset bubble with alpha geq mask', () => {
      const filter = SmartReframeService.buildScreencastFilter({
        mode: 'circular_inset',
        insetPosition: 'bottom_right',
        insetDiameter: 340,
        canvasWidth: 1080,
        canvasHeight: 1920,
      });

      assert.ok(filter.includes('[cam]scale=340:340'));
      assert.ok(filter.includes("geq=lum='p(X,Y)':a='if(lte((X-170)*(X-170)+(Y-170)*(Y-170),170*170),255,0)'"));
      // Bottom right: posX = 1080 - 340 - 40 = 700, posY = 1920 - 340 - 180 = 1400
      assert.ok(filter.includes('overlay=x=700:y=1400[out]'));
    });

    it('3. places circular inset in bottom-left when requested', () => {
      const filter = SmartReframeService.buildScreencastFilter({
        mode: 'circular_inset',
        insetPosition: 'bottom_left',
        insetDiameter: 300,
        canvasWidth: 1080,
        canvasHeight: 1920,
      });

      assert.ok(filter.includes('overlay=x=40:y=1440[out]'));
    });
  });

  describe('Viral Pacing Curve & Hook Velocity', () => {
    // 15 words in 4 seconds = 225 WPM (explosive hook)
    const explosiveHookWords: TranscriptWord[] = Array.from({ length: 15 }, (_, i) => ({
      id: `w_${i}`,
      word: `word${i}`,
      start: 0.1 + i * 0.25,
      end: 0.3 + i * 0.25,
    }));

    // Followed by normal pacing and a 1.5s silence gap
    const fullClipWords: TranscriptWord[] = [
      ...explosiveHookWords,
      // pause from 4.05 to 5.5 (1.45s gap)
      { id: 'w_15', word: 'now', start: 5.5, end: 5.8 },
      { id: 'w_16', word: 'let', start: 5.9, end: 6.2 },
      { id: 'w_17', word: 'us', start: 6.3, end: 6.5 },
      { id: 'w_18', word: 'dive', start: 6.6, end: 7.0 },
      { id: 'w_19', word: 'in', start: 7.1, end: 7.4 },
    ];

    it('1. identifies explosive hook velocity (>=180 WPM)', () => {
      const hookMetrics = ViralIntelligenceService.evaluateHookVelocity(fullClipWords, 4.0);
      assert.strictEqual(hookMetrics.rating, 'explosive');
      assert.ok(hookMetrics.hookWpm >= 180);
      assert.ok(hookMetrics.velocityRatio > 1.0);
    });

    it('2. detects speech lull and generates SILENCE_CUT recommendation', () => {
      const analysis = ViralIntelligenceService.analyzePacing(fullClipWords, 8.0);
      assert.ok(analysis.lullSegments.length >= 1);
      // The 1.45s gap between 4.05 and 5.5 should be detected
      const lull = analysis.lullSegments[0];
      assert.ok(lull.durationSec >= 1.0);

      const silenceRec = analysis.recommendations.find((r) => r.type === 'SILENCE_CUT');
      assert.ok(silenceRec, 'Should recommend silence cut for >1.2s lull');
      assert.strictEqual(silenceRec?.priority, 'HIGH');
    });

    it('3. recommends HOOK_TIGHTEN when opening speech is sluggish', () => {
      // Only 3 words in first 4 seconds (45 WPM)
      const slowHookWords: TranscriptWord[] = [
        { id: 'w_0', word: 'Hello', start: 1.0, end: 1.5 },
        { id: 'w_1', word: 'there', start: 2.5, end: 3.0 },
        { id: 'w_2', word: 'everyone', start: 3.5, end: 3.9 },
        { id: 'w_3', word: 'today', start: 4.5, end: 4.9 },
      ];

      const analysis = ViralIntelligenceService.analyzePacing(slowHookWords, 6.0);
      assert.strictEqual(analysis.hookVelocity.rating, 'slow');
      const hookRec = analysis.recommendations.find((r) => r.type === 'HOOK_TIGHTEN');
      assert.ok(hookRec, 'Should recommend tightening slow hook');
    });

    it('4. calculates sliding-window pacing points with energy metric', () => {
      const points = ViralIntelligenceService.calculatePacingCurve(fullClipWords, 8.0, 4.0, 1.0);
      assert.ok(points.length > 0);
      assert.strictEqual(points[0].timeSec, 0);
      assert.ok(points[0].wpm > 0);
      assert.ok(points[0].energy > 0 && points[0].energy <= 1.0);
    });

    it('5. evaluates viral benchmark compliance accurately', () => {
      const analysis = ViralIntelligenceService.analyzePacing(fullClipWords, 8.0);
      const benchmark = ViralIntelligenceService.evaluateViralBenchmark(analysis);
      assert.strictEqual(typeof benchmark.meetsBenchmark, 'boolean');
      assert.strictEqual(typeof benchmark.hookScore, 'number');
      assert.ok(benchmark.feedback.length > 0);
    });
  });
});
