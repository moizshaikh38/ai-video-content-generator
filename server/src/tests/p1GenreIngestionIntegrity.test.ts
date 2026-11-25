import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const origMongoUri = process.env.MONGODB_URI;
const origMongoDb = process.env.MONGODB_DB_NAME;
const origYtDlpPath = process.env.YT_DLP_PATH;

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/test_fixture',
  MONGODB_DB_NAME: 'test_fixture',
});

const { ingestProjectUrl } = await import('../controllers/projectController.js');
const { EntitlementService } = await import('../services/entitlementService.js');
const { UrlIngestionService } = await import('../services/urlIngestionService.js');
const { GenreIntelligenceService } = await import('../services/genreIntelligenceService.js');
const { dataRepository } = await import('../db/repositories/dataRepository.js');
const { AppError } = await import('../types/index.js');

const origResolveEntitlements = EntitlementService.resolveUserEntitlements;
const origIngestUrlToProject = UrlIngestionService.ingestUrlToProject;
const origDataRepoFrom = dataRepository.from.bind(dataRepository);
const tmpDirs: string[] = [];

after(() => {
  EntitlementService.resolveUserEntitlements = origResolveEntitlements;
  UrlIngestionService.ingestUrlToProject = origIngestUrlToProject;
  (dataRepository as any).from = origDataRepoFrom;
  if (origYtDlpPath === undefined) delete process.env.YT_DLP_PATH;
  else process.env.YT_DLP_PATH = origYtDlpPath;
  if (origMongoUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = origMongoUri;
  if (origMongoDb === undefined) delete process.env.MONGODB_DB_NAME;
  else process.env.MONGODB_DB_NAME = origMongoDb;
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

function makeFakeYtDlp(stderrText: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p1-ytdlp-'));
  tmpDirs.push(dir);
  const logFile = path.join(dir, 'calls.log');
  const scriptPath = path.join(dir, 'yt-dlp');
  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(logFile)}, process.argv.slice(2).join(' ') + '\\n');
process.stderr.write(${JSON.stringify(stderrText)});
process.exit(1);
`,
    { mode: 0o755 }
  );
  return {
    scriptPath,
    callCount: () =>
      fs.existsSync(logFile)
        ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).length
        : 0,
  };
}

test('F-A1: ingestProjectUrl preserves ingestion-derived genre when client sends auto/default clip_preferences', async () => {
  EntitlementService.resolveUserEntitlements = async () =>
    ({
      planId: 'pro',
      displayName: 'Pro',
      isUnlimited: true,
      limits: { maxProjects: 999, maxFileSizeBytes: 1024 * 1024 * 1024, maxDurationSeconds: 3600 },
    }) as any;

  let storedProject: any = null;
  let updateCalls = 0;

  UrlIngestionService.ingestUrlToProject = async (opts: any) => {
    const normalized = GenreIntelligenceService.normalizePreferences(opts.clipPreferences, opts.notes);
    storedProject = {
      id: 'proj-yt-auto',
      user_id: opts.userId,
      clip_preferences: {
        ...normalized,
        genre: 'gaming',
        suggestedGenre: 'gaming',
        genreConfidence: 0.91,
      },
    };
    return {
      projectId: 'proj-yt-auto',
      title: 'Gaming Highlight',
      sourceUrl: 'source/proj-yt-auto.mp4',
      fileSize: 1024,
      durationSeconds: 60,
      mimeType: 'video/mp4',
      sourceType: 'url',
    };
  };

  (dataRepository as any).from = (table: string) => {
    assert.equal(table, 'projects');
    return {
      update() {
        updateCalls++;
        return { eq() { return this; } };
      },
      select() {
        return {
          eq() { return this; },
          async single() { return { data: storedProject, error: null }; },
        };
      },
    };
  };

  const req: any = {
    user: { id: 'user-1', email: 'user1@example.invalid' },
    body: {
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      clip_preferences: { genre: 'general', genreSelectionMode: 'auto' },
    },
    requestId: 'req-fa1-auto',
  };
  const { res, getResult } = makeMockRes();
  await ingestProjectUrl(req, res);

  const { statusCode, payload } = getResult();
  assert.equal(statusCode, 201);
  assert.equal(updateCalls, 0, 'controller must not overwrite ingestion-derived clip_preferences');
  assert.equal(payload.project.clip_preferences.genre, 'gaming');
  assert.equal(payload.project.clip_preferences.suggestedGenre, 'gaming');
  assert.equal(payload.project.clip_preferences.genreConfidence, 0.91);
  assert.equal(payload.project.clip_preferences.genreSelectionMode, 'auto');
});

test('F-A1: ingestProjectUrl keeps explicit manual genre authoritative', async () => {
  EntitlementService.resolveUserEntitlements = async () =>
    ({
      planId: 'pro',
      displayName: 'Pro',
      isUnlimited: true,
      limits: { maxProjects: 999, maxFileSizeBytes: 1024 * 1024 * 1024, maxDurationSeconds: 3600 },
    }) as any;

  let storedProject: any = null;
  UrlIngestionService.ingestUrlToProject = async (opts: any) => {
    const normalized = GenreIntelligenceService.normalizePreferences(opts.clipPreferences, opts.notes);
    storedProject = {
      id: 'proj-yt-manual',
      user_id: opts.userId,
      clip_preferences: normalized,
    };
    return {
      projectId: 'proj-yt-manual',
      title: 'Manual Podcast',
      sourceUrl: 'source/proj-yt-manual.mp4',
      fileSize: 1024,
      durationSeconds: 60,
      mimeType: 'video/mp4',
      sourceType: 'url',
    };
  };

  (dataRepository as any).from = () => ({
    select() {
      return {
        eq() { return this; },
        async single() { return { data: storedProject, error: null }; },
      };
    },
  });

  const req: any = {
    user: { id: 'user-1', email: 'user1@example.invalid' },
    body: {
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      clip_preferences: { genre: 'podcast_interview', genreSelectionMode: 'manual' },
    },
    requestId: 'req-fa1-manual',
  };
  const { res, getResult } = makeMockRes();
  await ingestProjectUrl(req, res);

  const { statusCode, payload } = getResult();
  assert.equal(statusCode, 201);
  assert.equal(payload.project.clip_preferences.genre, 'podcast_interview');
  assert.equal(payload.project.clip_preferences.genreSelectionMode, 'manual');
});

for (const [label, stderr, expectedCode] of [
  ['private video', 'ERROR: [youtube] abcdefghijk: Private video. Sign in if you have been granted access to this video\n', 'YOUTUBE_PRIVATE_VIDEO'],
  ['removed video', 'ERROR: [youtube] abcdefghijk: This video has been removed by the uploader\n', 'YOUTUBE_VIDEO_REMOVED'],
  ['members-only', 'ERROR: [youtube] abcdefghijk: Join this channel to get access to members-only content like this video, and other exclusive perks.\n', 'YOUTUBE_MEMBERS_ONLY'],
  ['bot challenge', "ERROR: [youtube] abcdefghijk: Sign in to confirm you're not a bot.\n", 'YOUTUBE_BOT_CHALLENGE'],
  ['rate limited', 'ERROR: [youtube] abcdefghijk: HTTP Error 429: Too Many Requests\n', 'YOUTUBE_RATE_LIMITED'],
] as const) {
  test(`F-A2: terminal YouTube probe failure (${label}) surfaces AppError ${expectedCode} immediately`, async () => {
    const fake = makeFakeYtDlp(stderr);
    process.env.YT_DLP_PATH = fake.scriptPath;

    await assert.rejects(
      UrlIngestionService.fetchYouTubeMetadata('https://www.youtube.com/watch?v=abcdefghijk', 2000),
      (err: unknown) => err instanceof AppError && err.code === expectedCode
    );
    assert.equal(fake.callCount(), 1, 'terminal probe error must fail fast without cycling strategies');
  });
}

test('F-A2: recoverable YouTube probe failures return empty metadata so download recovery can proceed', async () => {
  const fake = makeFakeYtDlp('ERROR: [youtube] abcdefghijk: Requested format is not available\n');
  process.env.YT_DLP_PATH = fake.scriptPath;

  const result = await UrlIngestionService.fetchYouTubeMetadata('https://www.youtube.com/watch?v=abcdefghijk', 2000);
  assert.deepEqual(result, {});
  assert.ok(fake.callCount() >= 2, 'recoverable failure should exhaust probe strategies before returning {}');
});

test('F-E1: normalizePreferences supports snake_case and camelCase genre metadata without duplicating keys', () => {
  const snake = GenreIntelligenceService.normalizePreferences({
    genre: 'general',
    genre_selection_mode: 'auto',
    suggested_genre: 'gaming',
    genre_confidence: 0.87,
  } as any);

  assert.equal(snake.genreSelectionMode, 'auto');
  assert.equal(snake.suggestedGenre, 'gaming');
  assert.equal(snake.genreConfidence, 0.87);
  assert.equal('suggested_genre' in snake, false);
  assert.equal('genre_confidence' in snake, false);

  const camel = GenreIntelligenceService.normalizePreferences({
    genre: 'general',
    genreSelectionMode: 'auto',
    suggestedGenre: 'education_tutorial',
    genreConfidence: 0.92,
  });

  assert.equal(camel.genreSelectionMode, 'auto');
  assert.equal(camel.suggestedGenre, 'education_tutorial');
  assert.equal(camel.genreConfidence, 0.92);

  const invalid = GenreIntelligenceService.normalizePreferences({
    suggested_genre: 'nonexistent_genre',
    genre_confidence: Number.NaN,
  } as any);
  assert.equal(invalid.suggestedGenre, undefined);
  assert.equal(invalid.genreConfidence, undefined);
});

test('F-E1: default general does not accidentally lock manual selection, while explicit manual general stays manual', () => {
  const suggestion = GenreIntelligenceService.classifyVideoGenreLocally({
    transcriptText: 'What a clutch headshot! Watch this gameplay clip, boss fight combo and respawn.',
  });
  assert.equal(suggestion.genre, 'gaming');

  const defaultGeneral = GenreIntelligenceService.normalizePreferences({ genre: 'general' });
  assert.equal(defaultGeneral.genre, 'general');
  assert.equal(defaultGeneral.genreSelectionMode, 'auto');

  const appliedFromDefault = GenreIntelligenceService.applyGenreSuggestion(defaultGeneral, suggestion);
  assert.equal(appliedFromDefault.genre, 'gaming');

  const coercedUnknown = GenreIntelligenceService.normalizePreferences({ genre: 'not_a_real_genre' as any });
  assert.equal(coercedUnknown.genre, 'general');
  assert.equal(coercedUnknown.genreSelectionMode, 'auto');

  const explicitManualGeneral = GenreIntelligenceService.normalizePreferences({
    genre: 'general',
    genreSelectionMode: 'manual',
  });
  assert.equal(explicitManualGeneral.genreSelectionMode, 'manual');
  assert.equal(GenreIntelligenceService.applyGenreSuggestion(explicitManualGeneral, suggestion).genre, 'general');

  const explicitManualSnake = GenreIntelligenceService.normalizePreferences({
    genre: 'general',
    genre_selection_mode: 'manual',
  } as any);
  assert.equal(explicitManualSnake.genreSelectionMode, 'manual');
  assert.equal(GenreIntelligenceService.applyGenreSuggestion(explicitManualSnake, suggestion).genre, 'general');
});
