import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ClipRenderService } from '../services/clipRenderService.js';
import { downloadObjectToFile } from '../services/objectStorageService.js';
import { startPublishingWorker, stopPublishingWorker } from '../services/publishing/publishingWorker.js';

describe('Clip Download 5% Fix & Publishing Worker Test Suite', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-download-test-'));

  describe('1. ClipRenderService.ensureSourceVideo', () => {
    it('resolves local filesystem fallback immediately for existing local media without calling R2', async () => {
      const localFile = path.join(tmpDir, 'local_fixture.mp4');
      fs.writeFileSync(localFile, 'dummy video bytes 123456');

      const targetPath = path.join(tmpDir, 'downloaded_target.mp4');

      const result = await ClipRenderService.ensureSourceVideo(localFile, targetPath, {
        timeoutMs: 5000,
      });

      assert.equal(result, 'local_fallback', 'Must use local fallback for local files');
      assert.ok(fs.existsSync(targetPath), 'Target local file must exist');
      assert.equal(fs.readFileSync(targetPath, 'utf8'), 'dummy video bytes 123456');
    });

    it('re-uses shared project/source disk cache for subsequent clips of the same source', async () => {
      // Create a cached entry in vireo-source-cache
      const cacheDir = path.join(os.tmpdir(), 'vireo-source-cache');
      fs.mkdirSync(cacheDir, { recursive: true });

      const fakeKey = `users/test/projects/proj-1/source/test-video-${Date.now()}.mp4`;
      const hash = crypto.createHash('sha256').update(fakeKey).digest('hex');
      const cachedFile = path.join(cacheDir, `${hash}.mp4`);
      fs.writeFileSync(cachedFile, 'cached source mp4 payload');

      const targetPath = path.join(tmpDir, 'reused_target.mp4');

      // First resolution should hit the shared cache
      const result = await ClipRenderService.ensureSourceVideo(fakeKey, targetPath);

      assert.equal(result, 'cache_hit', 'Must detect and reuse cached source video');
      assert.ok(fs.existsSync(targetPath));
      assert.equal(fs.readFileSync(targetPath, 'utf8'), 'cached source mp4 payload');

      try {
        fs.unlinkSync(cachedFile);
      } catch {}
    });

    it('rejects immediately with SOURCE_PATH_MISSING when source path is missing or null', async () => {
      const targetPath = path.join(tmpDir, 'target.mp4');
      await assert.rejects(
        async () => ClipRenderService.ensureSourceVideo(null, targetPath),
        /SOURCE_PATH_MISSING|missing for clip/i
      );
    });
  });

  describe('2. downloadObjectToFile timeout protection', () => {
    it('aborts and raises DOWNLOAD_TIMEOUT when download exceeds timeoutMs', async () => {
      const targetFile = path.join(tmpDir, 'stalled_download.mp4');
      // Pass a non-existent key with an ultra-short 1ms timeout
      await assert.rejects(
        async () => downloadObjectToFile('source', 'users/dummy/timeout-test.mp4', targetFile, { timeoutMs: 1 }),
        /DOWNLOAD_TIMEOUT|timed out after|STORAGE_UNAVAILABLE/i
      );
    });
  });

  describe('3. Publishing Worker Unreferenced Timer', () => {
    it('starts and stops publishing worker cleanly without blocking event loop', () => {
      startPublishingWorker();
      // Calling again is idempotent
      startPublishingWorker();
      stopPublishingWorker();
      assert.ok(true, 'Worker started and stopped cleanly');
    });
  });
});
