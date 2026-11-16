import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpegPath: string = require('ffmpeg-static') as unknown as string;

const SCRIPT = path.resolve(process.cwd(), 'python/smart_reframe.py');
// Model is not committed (232KB binary, opencv_zoo, MIT). Re-download from:
// https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
const LOCAL_MODEL = '/tmp/realmedia/models/face_detection_yunet_2023mar.onnx';

async function makeClip(dir: string): Promise<string> {
  const clip = path.join(dir, 'synthetic.mp4');
  await execFileAsync(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=2',
    '-pix_fmt', 'yuv420p', '-c:v', 'libx264', clip,
  ]);
  return clip;
}

async function runAnalyzer(
  clip: string,
  env: NodeJS.ProcessEnv,
  prelude = '',
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const payload = JSON.stringify({ videoPath: clip, sampleFps: 4 });
  const args = prelude
    ? ['-c', `${prelude}\nimport sys; sys.argv=['smart_reframe.py']; exec(compile(open(${JSON.stringify(SCRIPT)}).read(), 'smart_reframe.py', 'exec'))`]
    : [SCRIPT];
  return new Promise((resolve) => {
    const child = execFile(process.env.PYTHON_PATH || 'python3', args, { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolve({ code: err ? ((err as any).code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin!.end(payload);
  });
}

test('YuNet flag with missing model file fails loudly (no silent Haar fallback)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yunet-guard-'));
  const clip = await makeClip(dir);
  const r = await runAnalyzer(clip, { SMART_REFRAME_YUNET_MODEL: '/nonexistent/model.onnx' });
  assert.equal(r.code, 2, `expected exit 2, got ${r.code}; stdout=${r.stdout.slice(0, 200)}`);
  assert.match(r.stderr, /model file not found/);
  assert.equal(r.stdout.trim(), '', 'no analysis JSON may be emitted on guard failure');
});

test('YuNet flag with corrupt model file fails loudly', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yunet-guard-'));
  const clip = await makeClip(dir);
  const corrupt = path.join(dir, 'corrupt.onnx');
  fs.writeFileSync(corrupt, 'this is not an onnx model');
  const r = await runAnalyzer(clip, { SMART_REFRAME_YUNET_MODEL: corrupt });
  assert.equal(r.code, 2, `expected exit 2, got ${r.code}; stdout=${r.stdout.slice(0, 200)}`);
  assert.match(r.stderr, /failed to load YuNet model/);
});

test('YuNet flag with OpenCV lacking FaceDetectorYN_create fails loudly', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yunet-guard-'));
  const clip = await makeClip(dir);
  const r = await runAnalyzer(
    clip,
    { SMART_REFRAME_YUNET_MODEL: '/nonexistent/model.onnx' },
    'import cv2\nif hasattr(cv2, "FaceDetectorYN_create"): del cv2.FaceDetectorYN_create',
  );
  assert.equal(r.code, 2, `expected exit 2, got ${r.code}; stdout=${r.stdout.slice(0, 200)}`);
  assert.match(r.stderr, /FaceDetectorYN_create/);
});

test('YuNet flag with valid model runs analysis', async (t) => {
  if (!fs.existsSync(LOCAL_MODEL)) {
    t.skip(`YuNet model not present at ${LOCAL_MODEL} (see header comment for download URL)`);
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yunet-guard-'));
  const clip = await makeClip(dir);
  const r = await runAnalyzer(clip, { SMART_REFRAME_YUNET_MODEL: LOCAL_MODEL });
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}; stderr=${r.stderr.slice(0, 300)}`);
  const res = JSON.parse(r.stdout.trim());
  assert.equal(res.status, 'ok');
});

test('Default path (env unset) still runs Haar analyzer with expected schema', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yunet-guard-'));
  const clip = await makeClip(dir);
  const env = { ...process.env };
  delete env.SMART_REFRAME_YUNET_MODEL;
  delete env.SMART_REFRAME_YUNET_THRESHOLD;
  const payload = JSON.stringify({ videoPath: clip, sampleFps: 4 });
  const r = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = execFile(process.env.PYTHON_PATH || 'python3', [SCRIPT], { env }, (err, stdout, stderr) => {
      resolve({ code: err ? ((err as any).code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin!.end(payload);
  });
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}; stderr=${r.stderr.slice(0, 300)}`);
  const res = JSON.parse(r.stdout.trim());
  assert.equal(res.status, 'ok');
  assert.ok(Array.isArray(res.samples));
  assert.ok(Array.isArray(res.scene_cuts));
});
