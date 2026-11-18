import { JobReliabilityService } from '../services/queue/jobReliabilityService.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateOutputFile, type OutputProbeRunner } from '../shared/outputValidation.js';

const valid = { streams: [{ codec_type: 'video', width: 720, height: 1280 }, { codec_type: 'audio' }], format: { duration: '20.0' } };
const options = { expectAudio: true, expectDimensions: { width: 720, height: 1280 } };
const runner = (value: unknown): OutputProbeRunner => async () => ({ stdout: JSON.stringify(value) });
const rejected = (run: OutputProbeRunner, duration = 20) => assert.rejects(() => validateOutputFile('/not-read.mp4', duration, options, run), { code: 'OUTPUT_VALIDATION_FAILED' });

test('verified output dimensions returned; ffprobe execution and buffer are bounded', async () => {
  const run: OutputProbeRunner = async (file, args, limits) => {
    assert.equal(file, 'ffprobe');
    assert(args.includes('stream=codec_type,width,height'));
    assert.equal(args.at(-1), '/not-read.mp4');
    assert.deepEqual(limits, { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    return { stdout: JSON.stringify(valid) };
  };
  assert.deepEqual(await validateOutputFile('/not-read.mp4', 20, options, run), { width: 720, height: 1280 });
});
for (const code of ['ENOENT', 'ETIMEDOUT', 'EACCES', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER']) {
  test(`probe failure ${code} fails closed without leaking raw stderr`, async () => {
    const run: OutputProbeRunner = async () => { throw Object.assign(new Error('private-process-detail'), { code }); };
    await assert.rejects(() => validateOutputFile('/not-read.mp4', 20, options, run), (e: any) => e.code === 'OUTPUT_VALIDATION_FAILED' && !e.message.includes('private-process-detail'));
  });
}
test('malformed JSON and null probes fail closed', async () => {
  await rejected(async () => ({ stdout: '{broken' }));
  await rejected(runner(null));
});
test('missing streams, frame size and audio cannot pass', async () => {
  for (const streams of [[], [{ codec_type: 'audio' }], [{ codec_type: 'video' }], [{ codec_type: 'video', width: 720, height: 1280 }], [{ codec_type: 'video', width: 720.5, height: 1280 }, { codec_type: 'audio' }]]) {
    await rejected(runner({ ...valid, streams }));
  }
});
test('wrong dimensions and missing/invalid/drifting durations fail closed', async () => {
  await rejected(runner({ ...valid, streams: [{ codec_type: 'video', width: 1280, height: 720 }, { codec_type: 'audio' }] }));
  for (const duration of [undefined, '', '20garbage', 'NaN', '-1', '0', '21']) await rejected(runner({ ...valid, format: { duration } }));
});
test('muted export needs no audio, but still needs valid video', async () => {
  const probe = { ...valid, streams: [valid.streams[0]] };
  assert.deepEqual(await validateOutputFile('/not-read.mp4', 20, { expectAudio: false }, runner(probe)), { width: 720, height: 1280 });
});
test('invalid expected duration rejects before any probe', async () => {
  let calls = 0;
  for (const duration of [NaN, Infinity, 0, -1]) await rejected(async () => { calls++; return { stdout: '' }; }, duration);
  assert.equal(calls, 0);
});
test('ordinary orchestration delegates gate before upload; caption dimensions use bounded video probe', () => {
  const s = fs.readFileSync(new URL('../services/clipRenderService.ts', import.meta.url), 'utf8');
  assert(s.indexOf('validateRenderedOutput(outputPath, expectedDurationSec') < s.indexOf("await uploadFile('clips'"));
  assert.match(s, /return validateOutputFile\(filePath, expectedDurationSec, options\)/);
  assert.match(s, /const dimensions = await ClipRenderService.probeSourceDimensions\(sourcePath\)/);
  assert(!s.includes('accepting render without stream checks'));
});

test('output validation failures are permanent even when a raw probe cause says timeout', () => {
  assert.equal(JobReliabilityService.isTransientError({ code: 'OUTPUT_VALIDATION_FAILED', message: 'probe timed out' }), false);
});
