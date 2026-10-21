import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import {
  generateWordId,
  assignWordIds,
  splitWord,
  mergeWords,
  remapWordIds,
} from '../utils/wordIdentityUtils.js';
import { FilterGraphBuilder } from '../services/ffmpeg/filterGraphBuilder.js';

describe('Phase 0: Baseline & Foundation Integrity Tests', () => {
  describe('Word Identity System', () => {
    it('1. generates deterministic, collision-resistant word IDs', () => {
      const id1 = generateWordId('hello', 1.0, 1.45, 0);
      const id2 = generateWordId('hello', 1.0, 1.45, 0);
      const id3 = generateWordId('world', 1.45, 1.9, 1);

      assert.strictEqual(id1, id2, 'Identical word tokens must produce identical IDs');
      assert.notStrictEqual(id1, id3, 'Different words must produce different IDs');
      assert.ok(id1.startsWith('w_0_'), 'ID must prefix positional index');
    });

    it('2. assignWordIds preserves pre-existing IDs and assigns unique IDs to un-identified words', () => {
      const rawWords = [
        { word: 'Welcome', start: 0.0, end: 0.5 },
        { id: 'custom_fixed_id', word: 'to', start: 0.5, end: 0.7 },
        { word: 'VireoClip', start: 0.7, end: 1.2 },
        { word: 'VireoClip', start: 1.2, end: 1.6 }, // duplicate text immediately after
      ];

      const identified = assignWordIds(rawWords);
      assert.strictEqual(identified.length, 4);
      assert.ok(identified[0].id.startsWith('w_0_'));
      assert.strictEqual(identified[1].id, 'custom_fixed_id', 'Pre-existing ID must be strictly preserved');
      assert.ok(identified[2].id.startsWith('w_2_'));
      assert.ok(identified[3].id.startsWith('w_3_'));

      // Check all IDs are strictly unique
      const ids = identified.map((w) => w.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, 4, 'All assigned IDs within a transcript must be unique');
    });

    it('3. splitWord and mergeWords maintain ID lineage', () => {
      const baseWord = { id: 'w_42_abcdef', word: 'understand', start: 10.0, end: 11.0 };
      const [p1, p2] = splitWord(baseWord, 10.5, 'under', 'stand');

      assert.strictEqual(p1.id, 'w_42_abcdef_p1');
      assert.strictEqual(p2.id, 'w_42_abcdef_p2');
      assert.strictEqual(p1.end, 10.5);
      assert.strictEqual(p2.start, 10.5);

      const merged = mergeWords([p1, p2]);
      assert.ok(merged.id.includes('w_42_abcdef_p1_m2'));
      assert.strictEqual(merged.start, 10.0);
      assert.strictEqual(merged.end, 11.0);
      assert.strictEqual(merged.word, 'under stand');
    });

    it('4. remapWordIds accurately remaps IDs across transcript revisions', () => {
      const oldWords = [
        { id: 'w_0_abc', word: 'The', start: 0.0, end: 0.3 },
        { id: 'w_1_def', word: 'future', start: 0.3, end: 0.8 },
        { id: 'w_2_ghi', word: 'of', start: 0.8, end: 1.0 },
        { id: 'w_3_jkl', word: 'video', start: 1.0, end: 1.5 },
      ];

      // New transcript with slightly shifted Whisper timestamps (+50ms) and minor typo correction
      const newWords = [
        { id: 'w_0_new1', word: 'The', start: 0.05, end: 0.35 },
        { id: 'w_1_new2', word: 'future', start: 0.35, end: 0.85 },
        { id: 'w_2_new3', word: 'of', start: 0.85, end: 1.05 },
        { id: 'w_3_new4', word: 'video', start: 1.05, end: 1.55 },
      ];

      const mapping = remapWordIds(oldWords, newWords);
      assert.strictEqual(mapping.get('w_0_abc'), 'w_0_new1');
      assert.strictEqual(mapping.get('w_1_def'), 'w_1_new2');
      assert.strictEqual(mapping.get('w_2_ghi'), 'w_2_new3');
      assert.strictEqual(mapping.get('w_3_jkl'), 'w_3_new4');
    });
  });

  describe('FFmpeg Filter Graph Builder', () => {
    it('1. compiles raw and structured filters accurately', () => {
      const builder = new FilterGraphBuilder();
      builder.addFilter(['0:v'], 'scale', { w: 1080, h: 1920 }, ['scaled_v']);
      builder.addRawFilter('[scaled_v]fps=fps=30[out_v]');

      const result = builder.compile();
      assert.strictEqual(result, '[0:v]scale=w=1080:h=1920[scaled_v];[scaled_v]fps=fps=30[out_v]');
    });

    it('2. passes inline -filter_complex when graph is short', async () => {
      const builder = new FilterGraphBuilder(['[0:v]scale=1080:1920[v0]']);
      const exec = await builder.compileForExecution(undefined, false, 2048);

      assert.strictEqual(exec.scriptPath, null);
      assert.strictEqual(exec.args[0], '-filter_complex');
      assert.strictEqual(exec.args[1], '[0:v]scale=1080:1920[v0]');
      await exec.cleanup();
    });

    it('3. writes to temporary script file when threshold is exceeded and cleans up', async () => {
      const builder = new FilterGraphBuilder();
      // Add 20 filters to exceed filter count threshold
      for (let i = 0; i < 20; i++) {
        builder.addRawFilter(`[v${i}]scale=1080:1920[v${i + 1}]`);
      }

      const exec = await builder.compileForExecution();
      assert.ok(exec.scriptPath !== null, 'Script path must be populated for long graphs');
      assert.strictEqual(exec.args[0], '-filter_complex_script');
      assert.strictEqual(exec.args[1], exec.scriptPath);

      // Verify file exists on disk and contains full graph
      const content = await fs.readFile(exec.scriptPath, 'utf8');
      assert.ok(content.includes('[v19]scale=1080:1920[v20]'));

      // Test cleanup
      await exec.cleanup();
      await assert.rejects(
        () => fs.access(exec.scriptPath!),
        /ENOENT/,
        'Temporary script file must be deleted upon cleanup'
      );
    });
  });
});
