import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const origMongoUri = process.env.MONGODB_URI;
const origMongoDb = process.env.MONGODB_DB_NAME;

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/test_fixture',
  MONGODB_DB_NAME: 'test_fixture',
});

const { ingestProjectUrl } = await import('../controllers/projectController.js');
const { EntitlementService } = await import('../services/entitlementService.js');
const { UrlIngestionService } = await import('../services/urlIngestionService.js');
const { BurnedSubtitleService } = await import('../services/burnedSubtitleService.js');

const origResolveEntitlements = EntitlementService.resolveUserEntitlements;
const origIngestUrlToProject = UrlIngestionService.ingestUrlToProject;
const origPythonPath = process.env.PYTHON_PATH;
const origYtDlpPath = process.env.YT_DLP_PATH;
const origCwd = process.cwd();

after(() => {
  EntitlementService.resolveUserEntitlements = origResolveEntitlements;
  UrlIngestionService.ingestUrlToProject = origIngestUrlToProject;
  if (origPythonPath === undefined) delete process.env.PYTHON_PATH;
  else process.env.PYTHON_PATH = origPythonPath;
  if (origYtDlpPath === undefined) delete process.env.YT_DLP_PATH;
  else process.env.YT_DLP_PATH = origYtDlpPath;
  if (origMongoUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = origMongoUri;
  if (origMongoDb === undefined) delete process.env.MONGODB_DB_NAME;
  else process.env.MONGODB_DB_NAME = origMongoDb;
  process.chdir(origCwd);
});

function makeMockRes() {
  let statusCode = 200;
  let payload: any = null;
  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: any) {
      payload = body;
      return res;
    },
  };
  return { res, getResult: () => ({ statusCode, payload }) };
}

test('ingestProjectUrl exposes explicit user-facing codes on 5xx while masking internal 5xx errors', async () => {
  EntitlementService.resolveUserEntitlements = async () => ({
    planId: 'pro',
    displayName: 'Pro',
    isUnlimited: true,
    limits: {
      maxProjects: 999,
      maxFileSizeBytes: 1024 * 1024 * 1024,
      maxDurationSeconds: 3600,
    },
  }) as any;

  for (const code of [
    'YOUTUBE_DOWNLOAD_FAILED',
    'PLATFORM_IMPORT_UNAVAILABLE',
    'FILE_SIZE_EXCEEDED',
    'NO_VIDEO_STREAM',
    'DURATION_EXCEEDED',
    'LIVE_SOURCE_NOT_SUPPORTED',
  ]) {
    UrlIngestionService.ingestUrlToProject = async () => {
      throw Object.assign(new Error(`User-facing failure for ${code}`), {
        statusCode: 502,
        code,
      });
    };

    const req: any = {
      user: { id: 'fixture-user', email: 'fixture@example.invalid' },
      body: { url: 'https://example.invalid/video.mp4' },
      requestId: 'req-fixture',
    };
    const { res, getResult } = makeMockRes();
    await ingestProjectUrl(req, res);
    const { statusCode, payload } = getResult();
    assert.equal(statusCode, 502);
    assert.equal(payload.status, 'error');
    assert.equal(payload.code, code);
    assert.equal(payload.message, `User-facing failure for ${code}`);
  }

  // Non-allowlisted 5xx errors must remain masked so internals/secrets never leak.
  UrlIngestionService.ingestUrlToProject = async () => {
    throw Object.assign(new Error('SQL/Mongo connection string leaked'), {
      statusCode: 500,
      code: 'ECONNREFUSED',
    });
  };
  const req: any = {
    user: { id: 'fixture-user', email: 'fixture@example.invalid' },
    body: { url: 'https://example.invalid/video.mp4' },
    requestId: 'req-fixture-internal',
  };
  const { res, getResult } = makeMockRes();
  await ingestProjectUrl(req, res);
  const { statusCode, payload } = getResult();
  assert.equal(statusCode, 500);
  assert.equal(payload.status, 'error');
  assert.equal(payload.code, 'INTERNAL_ERROR');
  assert.equal(payload.message, 'Internal server error');
});

test('UrlIngestionService resolves PYTHON_PATH / YT_DLP_PATH overrides and module-relative candidates regardless of cwd', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-path-resolve-'));
  try {
    const fakePython = path.join(tmpDir, 'custom-python');
    const fakeYtDlp = path.join(tmpDir, 'custom-yt-dlp');
    fs.writeFileSync(fakePython, '');
    fs.writeFileSync(fakeYtDlp, '');

    process.env.PYTHON_PATH = fakePython;
    process.env.YT_DLP_PATH = fakeYtDlp;
    assert.equal(UrlIngestionService.getPythonPath(), fakePython);
    assert.deepEqual(UrlIngestionService.resolveYtDlpCommand(), {
      command: fakeYtDlp,
      prefixArgs: [],
    });

    delete process.env.PYTHON_PATH;
    delete process.env.YT_DLP_PATH;
    process.chdir(tmpDir);

    const resolvedPy = UrlIngestionService.getPythonPath();
    assert.ok(typeof resolvedPy === 'string' && resolvedPy.length > 0);
    const resolvedYt = UrlIngestionService.resolveYtDlpCommand();
    assert.ok(typeof resolvedYt.command === 'string' && resolvedYt.command.length > 0);
    assert.ok(Array.isArray(resolvedYt.prefixArgs));
  } finally {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('BurnedSubtitleService preserves Linux process-group supervision and non-Linux fallback contract', async () => {
  const source = fs.readFileSync(
    new URL('../services/burnedSubtitleService.ts', import.meta.url),
    'utf8'
  );
  assert.match(source, /process\.platform\s*===\s*'linux'\s*\?\s*supervisedExecFile\(/);
  assert.match(source, /:\s*execFileAsync\(/);
  assert.match(
    source,
    /\(process\.platform\s*===\s*'linux'\s*&&\s*error\?\.code\s*===\s*'SUPERVISION_UNAVAILABLE'\)/
  );

  // Aborted review must still throw abort reason instead of silently returning unknown.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-burned-abort-'));
  try {
    const controller = new AbortController();
    controller.abort(Object.assign(new Error('Cancelled by fixture'), { code: 'WORK_CANCELLED' }));
    const dummySource = path.join(tmpDir, 'source.mp4');
    fs.writeFileSync(dummySource, 'fixture');
    await assert.rejects(
      BurnedSubtitleService.reviewVideo({
        sourcePath: dummySource,
        start: 0,
        duration: 5,
        sourceSha256: 'a'.repeat(64),
        tempDirectory: tmpDir,
        sourceWidth: 1280,
        sourceHeight: 720,
        signal: controller.signal,
      }),
      { code: 'WORK_CANCELLED' }
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
