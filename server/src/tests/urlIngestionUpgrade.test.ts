import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { UrlIngestionService } from '../services/urlIngestionService.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import { UrlValidator } from '../utils/urlValidator.js';
import { AppError } from '../types/index.js';

describe('UrlIngestionService Upgrade Test Suite', { concurrency: 1 }, () => {
  let testServer: http.Server;
  let testServerPort: number;
  let testServerBaseUrl: string;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-ingest-upgrade-test-'));

  before(async () => {
    // Start lightweight mock HTTP server for deterministic streaming tests
    await new Promise<void>((resolve) => {
      testServer = http.createServer((req, res) => {
        res.setHeader('Connection', 'close');
        const url = req.url || '';

        if (url === '/valid-video.mp4') {
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': '10240',
            'Connection': 'close',
          });
          // Send 10KB of dummy data in 1KB chunks
          const chunk = Buffer.alloc(1024, 0x41);
          for (let i = 0; i < 10; i++) {
            res.write(chunk);
          }
          res.end();
          return;
        }

        if (url === '/oversized-header.mp4') {
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': `${100 * 1024 * 1024}`, // 100MB
            'Connection': 'close',
          });
          res.end();
          return;
        }

        if (url === '/oversized-stream.mp4') {
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Connection': 'close',
            // No Content-Length header to test mid-stream byte limit enforcement
          });
          // Send 100KB chunks continuously
          const bigChunk = Buffer.alloc(64 * 1024, 0x42);
          const interval = setInterval(() => {
            if (res.writableEnded || res.destroyed) {
              clearInterval(interval);
              return;
            }
            res.write(bigChunk);
          }, 10);
          interval.unref();

          req.on('close', () => {
            clearInterval(interval);
            if (!res.writableEnded) res.destroy();
            req.socket?.destroy();
          });
          return;
        }

        if (url === '/stalled-stream.mp4') {
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': '50000',
            'Connection': 'close',
          });
          res.write(Buffer.from('INITIAL_CHUNK_HEADER'));
          const stallTimer = setTimeout(() => {
            try {
              if (!res.writableEnded) res.end();
              req.socket?.destroy();
            } catch {}
          }, 600);
          stallTimer.unref();

          req.on('close', () => {
            clearTimeout(stallTimer);
            if (!res.writableEnded) {
              res.destroy();
            }
            req.socket?.destroy();
          });
          // Intentionally stall: never write anything else and never close
          return;
        }

        if (url === '/backpressure.mp4') {
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Connection': 'close',
          });
          // Send 300KB in 30 chunks
          const chunk = Buffer.alloc(10240, 0x43);
          for (let i = 0; i < 30; i++) {
            res.write(chunk);
          }
          res.end();
          return;
        }

        res.writeHead(404, { 'Connection': 'close' });
        res.end();
      });

      testServer.listen(0, '127.0.0.1', () => {
        const addr = testServer.address() as any;
        testServerPort = addr.port;
        testServerBaseUrl = `http://127.0.0.1:${testServerPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    try {
      if (typeof (testServer as any).closeAllConnections === 'function') {
        (testServer as any).closeAllConnections();
      }
    } catch {}
    await new Promise<void>((resolve) => {
      testServer.close(() => resolve());
    });

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. probeVideoFile Accuracy & Stream Detection
  // =========================================================================
  describe('1. probeVideoFile with Real FFmpeg Output', () => {
    it('accurately probes real media fixture when present', async () => {
      // Find candidate local fixture in project tree
      const candidates = [
        path.resolve(process.cwd(), 'artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'),
        path.resolve(process.cwd(), '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'),
        path.resolve(process.cwd(), 'demo/creators/joe-rogan/source.mp4'),
        path.resolve(process.cwd(), '../demo/creators/joe-rogan/source.mp4'),
      ];

      const fixture = candidates.find((c) => fs.existsSync(c));
      if (!fixture) {
        // Skip on CI without fixtures
        return;
      }

      const probe = await UrlIngestionService.probeVideoFile(fixture);
      assert.equal(probe.hasVideo, true, 'Fixture must have video stream');
      assert.equal(probe.hasAudio, true, 'Fixture must have audio stream');
      assert.ok(probe.durationSeconds > 0, 'Duration must be positive');
      assert.ok(typeof probe.width === 'number' && probe.width >= 320, 'Width must be valid');
      assert.ok(typeof probe.height === 'number' && probe.height >= 240, 'Height must be valid');
      assert.ok(typeof probe.codec === 'string' && probe.codec.length > 0, 'Codec must be identified');
    });

    it('throws INVALID_MEDIA (400) when probing a non-existent or corrupted file', async () => {
      const nonExistent = path.join(tmpDir, 'does_not_exist.mp4');
      await assert.rejects(
        async () => UrlIngestionService.probeVideoFile(nonExistent),
        (err: any) => {
          assert.equal(err.code, 'INVALID_MEDIA');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. downloadToTempFile Stream Timeout, Backpressure & Byte Bounds
  // =========================================================================
  describe('2. downloadToTempFile Stream Safeguards & Backpressure', { concurrency: 1 }, () => {
    it('enforces Content-Length header limit before downloading (FILE_SIZE_EXCEEDED)', async () => {
      const testUrl = `${testServerBaseUrl}/oversized-header.mp4`;
      const maxBytes = 1024 * 1024; // 1MB

      await assert.rejects(
        async () => UrlIngestionService.downloadToTempFile(testUrl, maxBytes, 5000),
        (err: any) => {
          assert.equal(err.code, 'FILE_SIZE_EXCEEDED');
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes('exceeds maximum allowed'));
          return true;
        }
      );
    });

    it('aborts mid-stream when downloaded bytes exceed maxBytes limit (FILE_SIZE_EXCEEDED)', async () => {
      const testUrl = `${testServerBaseUrl}/oversized-stream.mp4`;
      const maxBytes = 128 * 1024; // 128KB limit

      await assert.rejects(
        async () => UrlIngestionService.downloadToTempFile(testUrl, maxBytes, 5000),
        (err: any) => {
          assert.equal(err.code, 'FILE_SIZE_EXCEEDED');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    it('triggers DOWNLOAD_TIMEOUT (408) when body streaming stalls past timeoutMs', async () => {
      const testUrl = `${testServerBaseUrl}/stalled-stream.mp4`;
      const timeoutMs = 300; // 300ms timeout for deterministic test

      await assert.rejects(
        async () => UrlIngestionService.downloadToTempFile(testUrl, 1024 * 1024, timeoutMs),
        (err: any) => {
          assert.equal(err.code, 'DOWNLOAD_TIMEOUT');
          assert.equal(err.statusCode, 408);
          assert.ok(err.message.includes('timed out'));
          return true;
        }
      );
    });

    it('respects WriteStream backpressure and downloads valid stream cleanly', async () => {
      const testUrl = `${testServerBaseUrl}/backpressure.mp4`;
      const result = await UrlIngestionService.downloadToTempFile(testUrl, 1024 * 1024, 5000);

      assert.ok(fs.existsSync(result.tempFilePath));
      assert.equal(result.totalBytes, 300 * 1024);
      assert.equal(result.contentType, 'video/mp4');

      // Cleanup
      try {
        fs.unlinkSync(result.tempFilePath);
      } catch {}
    });
  });

  // =========================================================================
  // 3. YouTube Rich Metadata Extraction & Local Genre Classification
  // =========================================================================
  describe('3. YouTube Metadata Extraction & Local Genre Classification', () => {
    it('classifies YouTube gaming metadata tags and title accurately', () => {
      const combinedGaming = 'EPIC Clutch in Warzone 2 Ranked Gameplay speedrun gameplay highlights esports';
      const suggestion = GenreIntelligenceService.classifyVideoGenreLocally({
        transcriptText: combinedGaming,
        sceneCutRatePerMin: 12.0,
      });

      assert.equal(suggestion.genre, 'gaming');
      assert.ok(suggestion.confidence >= 0.7);
    });

    it('classifies YouTube business & finance metadata accurately', () => {
      const combinedFinance = 'How to Scale a B2B SaaS to $10M ARR revenue margin cashflow investing valuation';
      const suggestion = GenreIntelligenceService.classifyVideoGenreLocally({
        transcriptText: combinedFinance,
      });

      assert.equal(suggestion.genre, 'business_finance');
      assert.ok(suggestion.confidence >= 0.7);
    });

    it('classifies YouTube tutorial & educational step-by-step metadata accurately', () => {
      const combinedTutorial = 'Full Python Tutorial for Beginners: Step by Step Guide how to install and setup workflow';
      const suggestion = GenreIntelligenceService.classifyVideoGenreLocally({
        transcriptText: combinedTutorial,
      });

      assert.equal(suggestion.genre, 'education_tutorial');
      assert.ok(suggestion.confidence >= 0.6);
    });

    it('classifies YouTube motivation & mindset speeches accurately', () => {
      const combinedMotivation = 'The Discipline Mindset: Why Most People Fail and How to Stay Relentless inspiring speech';
      const suggestion = GenreIntelligenceService.classifyVideoGenreLocally({
        transcriptText: combinedMotivation,
      });

      assert.equal(suggestion.genre, 'motivation');
      assert.ok(suggestion.confidence >= 0.5);
    });
  });

  // =========================================================================
  // 4. Cache Seeding & ClipRenderService Immediate Cache Hit
  // =========================================================================
  describe('4. vireo-source-cache Seeding & Instant Cache Hit Integration', () => {
    it('seeds shared cache so ensureSourceVideo produces an instant cache_hit without R2 fetch', async () => {
      const cacheDir = path.join(os.tmpdir(), 'vireo-source-cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const mockKey = `users/user-123/projects/proj-456/source/ingested-video-${Date.now()}.mp4`;
      const hash = crypto.createHash('sha256').update(mockKey).digest('hex');
      const cachedFile = path.join(cacheDir, `${hash}.mp4`);
      const testContent = 'MOCK_SOURCE_VIDEO_PAYLOAD_FOR_CACHE_HIT_TEST';

      // Simulate cache seeding performed by UrlIngestionService
      fs.writeFileSync(cachedFile, testContent);

      const targetPath = path.join(tmpDir, `rendered_target_${Date.now()}.mp4`);

      // Call ClipRenderService.ensureSourceVideo
      const sourceResolution = await ClipRenderService.ensureSourceVideo(mockKey, targetPath);

      assert.equal(sourceResolution, 'cache_hit', 'ensureSourceVideo must recognize seeded cache file');
      assert.ok(fs.existsSync(targetPath), 'Target path must be populated');
      assert.equal(fs.readFileSync(targetPath, 'utf8'), testContent);

      // Cleanup
      try {
        fs.unlinkSync(cachedFile);
        fs.unlinkSync(targetPath);
      } catch {}
    });
  });

  // =========================================================================
  // 5. probeUrlMetadata Helper
  // =========================================================================
  describe('5. probeUrlMetadata Static Helper', () => {
    it('returns direct provider metadata for direct media URLs without full download', async () => {
      const origValidate = UrlValidator.validateVideoUrl;
      (UrlValidator as any).validateVideoUrl = async (u: string) => ({
        normalizedUrl: u,
        hostname: '127.0.0.1',
        inferredFilename: 'valid-video.mp4',
        provider: 'direct_media',
      });

      try {
        const directUrl = `${testServerBaseUrl}/valid-video.mp4`;
        const probeResult = await UrlIngestionService.probeUrlMetadata(directUrl);

        assert.equal(probeResult.provider, 'direct');
        assert.equal(probeResult.title, 'valid-video');
        assert.equal(probeResult.contentLength, 10240);
        assert.equal(probeResult.contentType, 'video/mp4');
      } finally {
        UrlValidator.validateVideoUrl = origValidate;
      }
    });

    it('rejects unsupported protocols (ftp://, file://) in probeUrlMetadata', async () => {
      await assert.rejects(
        async () => UrlIngestionService.probeUrlMetadata('file:///etc/passwd'),
        (err: any) => err.code === 'UNSUPPORTED_PROTOCOL'
      );
    });
  });
});
