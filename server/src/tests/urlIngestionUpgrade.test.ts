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
import { config } from '../config/index.js';

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
    it('accurately probes real media fixture when present', async (t) => {
      // Find candidate local fixture in project tree
      const candidates = [
        path.resolve(process.cwd(), 'artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'),
        path.resolve(process.cwd(), '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'),
        path.resolve(process.cwd(), 'demo/creators/joe-rogan/source.mp4'),
        path.resolve(process.cwd(), '../demo/creators/joe-rogan/source.mp4'),
      ];

      const fixture = candidates.find((c) => fs.existsSync(c));
      if (!fixture) {
        // Missing media is not positive probe coverage.
        t.skip('No historical real-media fixture is available.');
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
    const realPrivateClassifier = UrlValidator.isPrivateIp;
    before(() => {
      // Fixture-only allowance for the real local streaming server. Product
      // download code rejects loopback, even in development. These cases test
      // transport limits, not public-address classification.
      UrlValidator.isPrivateIp = (ip: string) => ip === '127.0.0.1' ? false : realPrivateClassifier.call(UrlValidator, ip);
    });
    after(() => { UrlValidator.isPrivateIp = realPrivateClassifier; });
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
      // Two exact motivation keywords yield a 0.30 heuristic score, not a probability.
      assert.equal(suggestion.confidence, 0.3);
      assert.equal(suggestion.evidence?.confidenceIsProbability, false);
      assert.deepEqual(suggestion.evidence?.matchedKeywords?.motivation, ['discipline','mindset']);
    });
  });

  // =========================================================================
  // 4. Cache Seeding & ClipRenderService Immediate Cache Hit
  // =========================================================================
  describe('4. Legacy path-only cache seeding is not immutable identity', () => {
    it('ignores unverified seeded bytes and reuses only a receipt from the current object download', async () => {
      const payload=Buffer.from('CURRENT_REMOTE_SOURCE'),etag='"url-fixture-v1"';let gets=0,heads=0;
      const storage=http.createServer((req,res)=>{res.setHeader('Content-Length',payload.length);res.setHeader('ETag',etag);if(req.method==='HEAD'){heads++;res.end();}else{gets++;res.end(payload);}});
      await new Promise<void>(resolve=>storage.listen(0,'127.0.0.1',resolve));
      const old={r2AccountId:config.r2AccountId,r2AccessKeyId:config.r2AccessKeyId,r2SecretAccessKey:config.r2SecretAccessKey,r2SourceBucket:config.r2SourceBucket,r2Endpoint:config.r2Endpoint};
      Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:'http://127.0.0.1:'+(storage.address() as any).port});
      const key='fixture/'+crypto.randomUUID()+'.mp4',cacheDir=path.join(os.tmpdir(),'vireo-source-cache');fs.mkdirSync(cacheDir,{recursive:true});
      const legacy=path.join(cacheDir,crypto.createHash('sha256').update(key).digest('hex')+'.mp4');
      const bound=path.join(cacheDir,crypto.createHash('sha256').update(JSON.stringify([key,etag,payload.length])).digest('hex')+'.mp4');
      fs.writeFileSync(legacy,'UNVERIFIED_LEGACY_BYTES');
      try{
        const first=path.join(tmpDir,'current-source'),second=path.join(tmpDir,'reused-source');
        assert.equal(await ClipRenderService.ensureSourceVideo(key,first),'downloaded');assert.deepEqual(fs.readFileSync(first),payload);assert.equal(gets,1);
        assert.equal(await ClipRenderService.ensureSourceVideo(key,second),'cache_hit');assert.deepEqual(fs.readFileSync(second),payload);assert.equal(gets,1);assert(heads>=3,'initial download and reuse verify object identity');
      }finally{Object.assign(config,old);storage.closeAllConnections();await new Promise<void>(resolve=>storage.close(()=>resolve()));for(const file of [legacy,bound,bound+'.receipt.json'])fs.rmSync(file,{force:true});}
    });
  });

  // =========================================================================
  // 5. probeUrlMetadata Helper
  // =========================================================================
  describe('5. probeUrlMetadata Static Helper', () => {
    it('returns direct provider metadata for direct media URLs without full download', async () => {
      const origValidate = UrlValidator.validateVideoUrl;
      const originalPrivate=UrlValidator.isPrivateIp;
      UrlValidator.isPrivateIp=(ip:string)=>ip==='127.0.0.1'?false:originalPrivate.call(UrlValidator,ip);
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
        UrlValidator.isPrivateIp = originalPrivate;
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
