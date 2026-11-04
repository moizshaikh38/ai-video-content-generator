import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LayoutPickerService, VideoLayoutCategory } from '../services/layoutPickerService.js';

describe('Phase 2: Multimodal Layout Picker Tests', () => {
  it('1. respects explicit user override without running model', async () => {
    const result = await LayoutPickerService.determineLayout(
      '/nonexistent/fake.mp4',
      120.0,
      'split'
    );

    assert.strictEqual(result.layout, 'split');
    assert.strictEqual(result.confidence, 1.0);
    assert.ok(result.reason.includes('User explicitly selected'));
    assert.strictEqual(result.method, 'fallback');
  });

  it('2. falls back safely to track when source video cannot be opened', async () => {
    const result = await LayoutPickerService.determineLayout(
      '/nonexistent/fake.mp4',
      60.0
    );

    assert.strictEqual(result.layout, 'track');
    assert.ok(result.confidence >= 0.5);
  });
});
