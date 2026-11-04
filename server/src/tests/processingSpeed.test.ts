import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {
  planAudioChunks,
  mergeChunkTranscripts,
  CHUNK_OVERLAP_SEC,
} from '../services/transcription/chunkedTranscription.js';
import { downloadTimeoutForSize } from '../services/objectStorageService.js';
import type { NormalizedTranscriptionResult, NormalizedTranscriptWord } from '../services/transcription/types.js';

/** What a Whisper window would return for the words of `all` that fall inside it, on the window's own clock. */
function windowResult(all: NormalizedTranscriptWord[], startSec: number, endSec: number, jitter = 0): NormalizedTranscriptionResult {
  const inside = all.filter((w) => w.start >= startSec && w.end <= endSec);
  const words = inside.map((w) => ({ word: w.word, start: w.start - startSec + jitter, end: w.end - startSec + jitter }));
  // One segment per 4 words, text with punctuation like Whisper's.
  const segments = [];
  for (let i = 0; i < words.length; i += 4) {
    const group = words.slice(i, i + 4);
    segments.push({ start: group[0].start, end: group[group.length - 1].end, text: group.map((w) => w.word).join(' ') + '.' });
  }
  return { text: segments.map((s) => s.text).join(' '), language: 'en', durationSeconds: endSec - startSec, segments, words };
}

describe('Parallel transcription windows', () => {
  it('plans 2–8 overlapping windows that tile the whole duration', () => {
    for (const total of [480, 1200, 2700, 7200]) {
      const plans = planAudioChunks(total);
      assert.ok(plans.length >= 2 && plans.length <= 8, `${total}s → ${plans.length} windows`);
      assert.equal(plans[0].ownStartSec, 0);
      assert.equal(plans[plans.length - 1].ownEndSec, total);
      for (let i = 1; i < plans.length; i += 1) {
        assert.equal(plans[i].ownStartSec, plans[i - 1].ownEndSec, 'ownership is contiguous');
        assert.ok(plans[i].startSec <= plans[i].ownStartSec - CHUNK_OVERLAP_SEC + 1e-6, 'window starts before its span');
        assert.ok(plans[i - 1].startSec + plans[i - 1].durationSec >= plans[i].ownStartSec + CHUNK_OVERLAP_SEC - 1e-6, 'previous window runs past the boundary');
      }
    }
    assert.equal(planAudioChunks(2700).length, 8, 'a 45-min video uses all 8 windows');
  });

  it('merges windows back onto the source clock with every word exactly once', () => {
    const total = 900;
    // A word every 0.4s, 0.3s long, including ones that sit right on each boundary.
    const all: NormalizedTranscriptWord[] = [];
    for (let t = 0.1, n = 0; t + 0.3 < total; t += 0.4, n += 1) {
      all.push({ word: `w${n}`, start: Number(t.toFixed(3)), end: Number((t + 0.3).toFixed(3)) });
    }
    const plans = planAudioChunks(total);
    const parts = plans.map((plan) => ({ plan, result: windowResult(all, plan.startSec, plan.startSec + plan.durationSec) }));
    const merged = mergeChunkTranscripts(parts, total);

    assert.equal(merged.words.length, all.length, 'no word lost or duplicated');
    merged.words.forEach((w, i) => {
      assert.equal(w.word, all[i].word);
      assert.ok(Math.abs(w.start - all[i].start) < 0.002, `${w.word} keeps its source time`);
    });
    for (let i = 1; i < merged.segments.length; i += 1) {
      assert.ok(merged.segments[i].start >= merged.segments[i - 1].start, 'segments are in order');
    }
    const segmentWords = merged.segments.flatMap((s) => s.text.replace(/\./g, '').split(/\s+/));
    assert.deepEqual(segmentWords, all.map((w) => w.word), 'segment text covers the transcript once, in order');
    assert.equal(merged.durationSeconds, total);
  });

  it('drops the second copy of a boundary word that both windows timed slightly differently', () => {
    const plans = planAudioChunks(600);
    const boundary = plans[1].ownStartSec;
    const left = { plan: plans[0], result: { text: 'hello.', language: 'en', durationSeconds: 0,
      segments: [{ start: boundary - 0.3, end: boundary - 0.01, text: 'Hello.' }],
      words: [{ word: 'Hello', start: boundary - 0.3, end: boundary - 0.01 }] } };
    const shift = plans[1].startSec;
    const right = { plan: plans[1], result: { text: 'hello there.', language: 'en', durationSeconds: 0,
      segments: [{ start: boundary - shift - 0.28, end: boundary - shift + 0.6, text: 'hello there.' }],
      words: [
        { word: 'hello', start: boundary - shift - 0.28 + 0.3, end: boundary - shift + 0.3 }, // midpoint just past the boundary
        { word: 'there', start: boundary - shift + 0.35, end: boundary - shift + 0.6 },
      ] } };
    const rest = plans.slice(2).map((plan) => ({ plan, result: { text: '', language: 'en', durationSeconds: 0, segments: [], words: [] } }));
    const merged = mergeChunkTranscripts([left, right, ...rest], 600);
    assert.deepEqual(merged.words.map((w) => w.word), ['Hello', 'there']);
  });

  it('keeps the tail when the recorded duration was short', () => {
    const plans = planAudioChunks(600);
    const last = plans[plans.length - 1];
    const parts = plans.map((plan) => ({ plan, result: { text: '', language: 'en', durationSeconds: 0, segments: [], words: [] as NormalizedTranscriptWord[] } }));
    parts[parts.length - 1].result = {
      text: 'late words.', language: 'en', durationSeconds: 0,
      segments: [{ start: 600 - last.startSec + 5, end: 600 - last.startSec + 6, text: 'late words.' }],
      words: [{ word: 'late', start: 600 - last.startSec + 5, end: 600 - last.startSec + 5.4 },
        { word: 'words', start: 600 - last.startSec + 5.5, end: 600 - last.startSec + 6 }],
    };
    const merged = mergeChunkTranscripts(parts, 600);
    assert.deepEqual(merged.words.map((w) => w.word), ['late', 'words']);
    assert.ok((merged.durationSeconds || 0) >= 606);
  });

  it('is wired into processing: one encode at a chosen bitrate, parallel windows for transcription', () => {
    const processing = fs.readFileSync(path.resolve(process.cwd(), 'src/services/videoProcessingService.ts'), 'utf8');
    assert.match(processing, /transcribeAudioFast\(\s*provider,\s*extractedAudio,\s*posterRow\?\.duration_seconds/);
    assert.match(processing, /durationHintSec: posterRow\?\.duration_seconds/);
    const extraction = fs.readFileSync(path.resolve(process.cwd(), 'src/services/audioExtractionService.ts'), 'utf8');
    assert.match(extraction, /firstBitrate === 64 && audioSize > reencodeAboveBytes/, 'no second encode when 32k was chosen up front');
    const render = fs.readFileSync(path.resolve(process.cwd(), 'src/services/clipRenderService.ts'), 'utf8');
    assert.match(render, /fs\.linkSync\(sourcePath, targetLocalPath\)/, 'cached sources are hard-linked, not copied');
    assert.doesNotMatch(render, /fs\.copyFileSync\(cachedFile, targetLocalPath\)/);
  });
});

describe('Parallel ranged source download', () => {
  it('scales the timeout with object size instead of failing big files at 60s', () => {
    assert.equal(downloadTimeoutForSize(1024, 60000), 60000, 'small files keep the caller timeout');
    const gb = 1024 * 1024 * 1024;
    assert.ok(downloadTimeoutForSize(gb, 60000) > 15 * 60 * 1000, '1 GB gets more than 15 min');
    assert.equal(downloadTimeoutForSize(50 * gb, 60000), 30 * 60 * 1000, 'capped at 30 min');
  });

  it('downloads a large object byte-for-byte with concurrent ranged GETs', async (t) => {
    const body = crypto.randomBytes(40 * 1024 * 1024 + 12345);
    let rangedGets = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const server = http.createServer((req, res) => {
      res.setHeader('ETag', '"abc"');
      if (req.method === 'HEAD') {
        res.setHeader('Content-Length', String(body.length));
        res.end();
        return;
      }
      const match = /bytes=(\d+)-(\d+)/.exec(String(req.headers.range || ''));
      if (!match) {
        res.setHeader('Content-Length', String(body.length));
        res.end(body);
        return;
      }
      rangedGets += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const start = Number(match[1]);
      const end = Number(match[2]);
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${body.length}`);
      res.setHeader('Content-Length', String(end - start + 1));
      setTimeout(() => {
        res.end(body.subarray(start, end + 1));
        inFlight -= 1;
      }, 20);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_ENDPOINT = `http://127.0.0.1:${address.port}`;
    const { config } = await import('../config/index.js');
    Object.assign(config, {
      r2AccountId: 'test-account', r2AccessKeyId: 'test-key', r2SecretAccessKey: 'test-secret',
      r2Endpoint: `http://127.0.0.1:${address.port}`,
    });
    const { downloadObjectToFile } = await import('../services/objectStorageService.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-ranged-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const out = path.join(dir, 'source.mp4');

    await downloadObjectToFile('source', 'users/u/projects/p/source/big.mp4', out);

    assert.ok(fs.readFileSync(out).equals(body), 'file matches byte for byte');
    assert.equal(rangedGets, Math.ceil(body.length / (8 * 1024 * 1024)));
    assert.ok(maxInFlight > 1, `parts ran concurrently (max ${maxInFlight})`);
  });
});
