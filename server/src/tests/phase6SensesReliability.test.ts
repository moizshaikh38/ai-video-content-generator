import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FailoverTranscriptionProvider,
  isFailoverWorthy,
  getTranscriptionProviderWithFailover,
} from '../services/transcription/failoverTranscriptionProvider.js';
import { TranscriptionProvider } from '../services/transcription/transcriptionProvider.js';
import { UrlIngestionService } from '../services/urlIngestionService.js';
import { SmartReframeService } from '../services/smartReframeService.js';
import { NormalizedTranscriptionResult } from '../services/transcription/types.js';

/**
 * Phase 6 — reliability of the senses:
 * transcription provider failover, reframe runtime capability, source-cache retention.
 */

const fakeResult = (text = 'ok'): NormalizedTranscriptionResult =>
  ({
    text,
    language: 'en',
    durationSeconds: 1,
    segments: [],
    words: [],
  }) as unknown as NormalizedTranscriptionResult;

const makeProvider = (name: string, behavior: () => Promise<NormalizedTranscriptionResult>): TranscriptionProvider =>
  ({ name, transcribeAudio: behavior }) as unknown as TranscriptionProvider;

describe('Phase 6 — transcription provider failover', () => {
  it('fails over to the secondary when the primary throws a transient error', async () => {
    const calls: string[] = [];
    const primary = makeProvider('primary', () => {
      calls.push('primary');
      throw new Error('Transcription provider request timed out. Please retry.');
    });
    const secondary = makeProvider('secondary', () => {
      calls.push('secondary');
      return fakeResult('from-secondary');
    });

    const provider = new FailoverTranscriptionProvider(primary, secondary);
    const result = await provider.transcribeAudio(Buffer.from('x'), 'a.mp3', 'audio/mp3');

    assert.deepEqual(calls, ['primary', 'secondary']);
    assert.equal(result.text, 'from-secondary');
    assert.match(provider.name, /failover\(primary→secondary\)/);
  });

  it('wraps both failures in a classified error', async () => {
    const primary = makeProvider('primary', () => {
      throw new Error('primary exploded');
    });
    const secondary = makeProvider('secondary', () => {
      throw new Error('secondary exploded');
    });

    const provider = new FailoverTranscriptionProvider(primary, secondary);
    await assert.rejects(
      () => provider.transcribeAudio(Buffer.from('x'), 'a.mp3', 'audio/mp3'),
      (err: any) => err.code === 'TRANSCRIPTION_PROVIDERS_UNAVAILABLE' && /primary exploded/.test(err.message)
    );
  });

  it('does not fail over on provider-independent client errors (empty buffer, oversized file)', async () => {
    const calls: string[] = [];
    const primary = makeProvider('primary', () => {
      calls.push('primary');
      throw new Error('Audio track exceeds transcription provider limit of 25 MB. Please provide a shorter clip.');
    });
    const secondary = makeProvider('secondary', () => {
      calls.push('secondary');
      return fakeResult();
    });

    const provider = new FailoverTranscriptionProvider(primary, secondary);
    await assert.rejects(() => provider.transcribeAudio(Buffer.from('x'), 'a.mp3', 'audio/mp3'));
    assert.deepEqual(calls, ['primary'], 'secondary must not be invoked for non-failover classes');
  });

  it('behaves as the bare primary when no secondary is configured', async () => {
    const primary = makeProvider('primary', () => fakeResult('only'));
    const provider = new FailoverTranscriptionProvider(primary, null);
    assert.equal(provider.name, 'primary');
    const result = await provider.transcribeAudio(Buffer.from('x'), 'a.mp3', 'audio/mp3');
    assert.equal(result.text, 'only');
  });

  it('classifies timeout/5xx/auth errors as failover-worthy and size errors as not', () => {
    assert.equal(isFailoverWorthy(new Error('Transcription provider request timed out. Please retry.')), true);
    assert.equal(isFailoverWorthy(new Error('Transcription rate limit reached. Please wait a few moments before retrying.')), true);
    assert.equal(isFailoverWorthy(new Error('Transcription provider authentication failed. Please verify provider credentials.')), true);
    assert.equal(isFailoverWorthy(new Error('Audio track exceeds transcription provider limit of 25 MB. Please provide a shorter clip.')), false);
    assert.equal(isFailoverWorthy(new Error('Transcription rejected: provided audio buffer is empty.')), false);
  });

  it('production factory returns a failover-aware provider', () => {
    const provider = getTranscriptionProviderWithFailover();
    assert.ok(provider.name.length > 0);
  });

  it('videoProcessingService uses the failover provider, not the single-provider factory', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/services/videoProcessingService.ts'), 'utf8');
    assert.match(src, /getTranscriptionProviderWithFailover\(\)/);
    assert.doesNotMatch(src, /getTranscriptionProvider\(\)/);
  });
});

describe('Phase 6 — reframe runtime capability', () => {
  it('removes the /tmp/test_venv fallback from python candidate probing', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/services/smartReframeService.ts'), 'utf8');
    assert.doesNotMatch(src, /test_venv/);
  });

  it('checkReframeRuntime returns a cached verdict with python path detail', async () => {
    const first = await SmartReframeService.checkReframeRuntime();
    const second = await SmartReframeService.checkReframeRuntime();
    assert.equal(first, second, 'capability check must be cached (one-time probe)');
    assert.equal(typeof first.available, 'boolean');
    assert.ok(first.pythonPath.length > 0);
  });

  it('readiness surfaces the reframe runtime as an advisory field', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/services/healthService.ts'), 'utf8');
    assert.match(src, /reframeRuntime/);
    assert.match(src, /checkReframeRuntime\(\)/);
  });
});

describe('Phase 6 — source cache retention', () => {
  it('prunes only entries older than the retention window', async () => {
    const cacheDir = UrlIngestionService.getSourceCacheDir();
    fs.mkdirSync(cacheDir, { recursive: true });

    const oldFile = path.join(cacheDir, 'phase6-old.mp4');
    const freshFile = path.join(cacheDir, 'phase6-fresh.mp4');
    fs.writeFileSync(oldFile, 'x');
    fs.writeFileSync(freshFile, 'y');
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, old, old);

    const pruned = await UrlIngestionService.pruneSourceCache(24 * 60 * 60 * 1000);
    assert.ok(pruned >= 1);
    assert.equal(fs.existsSync(oldFile), false);
    assert.equal(fs.existsSync(freshFile), true);

    fs.rmSync(freshFile, { force: true });
  });

  it('is wired into the periodic cleanup timer in production startup', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/index.ts'), 'utf8');
    assert.match(src, /UrlIngestionService\.pruneSourceCache\(\)/);
  });
});
