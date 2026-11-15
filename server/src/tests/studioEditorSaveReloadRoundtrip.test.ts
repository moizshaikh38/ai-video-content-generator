import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { supabaseAuthClient } from '../utils/supabase.js';
import { errorHandler } from '../middleware/errorHandler.js';
import projectRoutes from '../routes/projectRoutes.js';

/**
 * Studio editor save -> reload round-trip over REAL HTTP + REAL Mongo.
 *
 * Exercises the exact payload shape the studio editor (EditorShell via
 * useEditorAutosave -> buildClipEditorUpdatePayload) sends to
 * PATCH /api/clips/:clipId/editor, then reloads via GET /api/clips/:clipId/editor
 * and asserts the caption config round-trips - including single-word mode
 * (presetOverrides.maxWordsPerCue = 1), which the legacy top-level
 * captionConfig.maxWordsPerCue sanitizer used to clamp to a minimum of 2.
 *
 * Auth: the real requireAuth middleware runs; only the external Supabase
 * verifier (supabaseAuthClient.auth.getUser) is stubbed in-process, the same
 * pattern as blk01PublishModalClipValidation.test.ts. Production auth code is
 * unchanged. This does NOT verify the hosted Supabase/prod deployment.
 */
describe('Studio editor save -> reload round-trip (HTTP + Mongo)', () => {
  const userId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const clipId = crypto.randomUUID();
  const TOKEN = 'test-studio-roundtrip-token';

  let server: http.Server | null = null;
  let baseUrl = '';

  before(async () => {
    const db = await getMongoDb();
    const now = new Date();

    await db.collection('projects').insertOne({
      id: projectId,
      user_id: userId,
      title: 'Round-trip project',
      status: 'READY',
      created_at: now,
      updated_at: now,
    });

    await db.collection('clips').insertOne({
      id: clipId,
      project_id: projectId,
      user_id: userId,
      candidate_id: crypto.randomUUID(),
      start_seconds: 10,
      end_seconds: 40,
      duration_seconds: 30,
      aspect_ratio: '9:16',
      crop_mode: 'smart',
      render_status: 'ready',
      caption_enabled: true,
      caption_style: 'karaoke',
      caption_config: { presetId: 'karaoke' },
      caption_position: 'bottom',
      created_at: now,
      updated_at: now,
    });

    (supabaseAuthClient.auth as any).getUser = async (token: string) => {
      if (token === TOKEN) {
        return { data: { user: { id: userId, email: 'studio-roundtrip@vireoclip.test' } }, error: null };
      }
      return { data: { user: null }, error: { message: 'invalid JWT' } };
    };

    const app = express();
    app.use(express.json());
    app.use('/api', projectRoutes);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    const db = await getMongoDb();
    await db.collection('clips').deleteMany({ user_id: userId });
    await db.collection('projects').deleteMany({ user_id: userId });
    await new Promise((r) => setTimeout(r, 400));
    await closeMongo(true);
  });

  async function patchEditor(body: Record<string, any>): Promise<{ status: number; json: any }> {
    const res = await fetch(`${baseUrl}/clips/${clipId}/editor`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  }

  async function getEditor(): Promise<{ status: number; json: any }> {
    const res = await fetch(`${baseUrl}/clips/${clipId}/editor`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    return { status: res.status, json: await res.json() };
  }

  it('1. Single-word mode save -> reload keeps maxWordsPerCue: 1 (no clamp to 2)', async () => {
    // Exact shape the studio sends after flipping Word Mode to "Single word"
    // (from buildClipEditorUpdatePayload; presetOverrides serialized by
    // editorCaptionToPresetOverrides).
    const payload = {
      aspectRatio: '9:16',
      trimStartOffset: 0,
      trimEndOffset: 0,
      captionEnabled: true,
      captionStyle: 'clean',
      captionPosition: 'bottom',
      captionConfig: {
        presetId: 'simple',
        presetOverrides: {
          textColor: '#FFFFFF',
          activeColor: '#FFE500',
          maxWordsPerCue: 1,
          wordAnimationType: 'pop',
          maxLines: 1,
          position: 'bottom',
          positionY: 0.62,
          positionX: 0,
        },
        caption_overrides: [
          { id: 'cue-1', cueId: 'cue-1', text: 'Remotely operated vehicles', start: 0, end: 1.8 },
        ],
      },
    };

    const patch = await patchEditor(payload);
    assert.equal(patch.status, 200, `PATCH failed: ${JSON.stringify(patch.json)}`);
    assert.equal(patch.json.clip.caption_config?.presetOverrides?.maxWordsPerCue, 1);
    assert.equal(patch.json.clip.caption_config?.presetOverrides?.maxLines, 1);

    const reload = await getEditor();
    assert.equal(reload.status, 200, `GET failed: ${JSON.stringify(reload.json)}`);
    const cfg = reload.json.clip.caption_config;
    assert.equal(cfg?.presetId, 'simple');
    assert.equal(cfg?.presetOverrides?.maxWordsPerCue, 1, 'single-word mode must survive save->reload');
    assert.equal(cfg?.presetOverrides?.maxLines, 1);
    assert.equal(cfg?.presetOverrides?.activeColor, '#FFE500');
    assert.equal(cfg?.presetOverrides?.positionY, 0.62);
    assert.ok(Array.isArray(cfg?.caption_overrides), 'caption_overrides should persist');
    assert.equal(cfg?.caption_overrides?.[0]?.text, 'Remotely operated vehicles');
  });

  it('2. Legacy top-level captionConfig.maxWordsPerCue: 1 is no longer clamped to 2', async () => {
    const patch = await patchEditor({ captionConfig: { maxWordsPerCue: 1, maxLines: 1 } });
    assert.equal(patch.status, 200, `PATCH failed: ${JSON.stringify(patch.json)}`);
    assert.equal(patch.json.clip.caption_config?.maxWordsPerCue, 1);
    assert.equal(patch.json.clip.caption_config?.maxLines, 1);
  });

  it('3. Phrase mode restore: overrides replaced, not merged into stale state', async () => {
    const patch = await patchEditor({
      captionEnabled: true,
      captionStyle: 'clean',
      captionConfig: {
        presetId: 'simple',
        presetOverrides: { textColor: '#FFFFFF', activeColor: '#FFE500', wordAnimationType: 'pop', position: 'bottom' },
      },
    });
    assert.equal(patch.status, 200, `PATCH failed: ${JSON.stringify(patch.json)}`);
    const cfg = patch.json.clip.caption_config;
    assert.equal(cfg?.presetOverrides?.maxWordsPerCue, undefined, 'phrase mode must not keep stale maxWordsPerCue');

    const reload = await getEditor();
    assert.equal(reload.json.clip.caption_config?.presetOverrides?.maxWordsPerCue, undefined);
  });

  it('4. Auth still enforced: no token -> 401, wrong user -> 404', async () => {
    const noAuth = await fetch(`${baseUrl}/clips/${clipId}/editor`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(noAuth.status, 401);

    const otherUserClipId = crypto.randomUUID();
    const patch = await patchEditor({ captionEnabled: false });
    assert.notEqual(patch.status, 401);
    const missing = await fetch(`${baseUrl}/clips/${otherUserClipId}/editor`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(missing.status, 404);
  });

  it('5. Framing parity: studio crop_mode (incl. fit) round-trips into clip.crop_config', async () => {
    // The studio Framing panel writes crop_mode on the video track item;
    // buildClipEditorUpdatePayload now maps it to cropConfig so the render
    // path (which reads clip.crop_config) honors the studio's choice.
    const patch = await patchEditor({ cropConfig: { mode: 'fit', focusX: 0.5, focusY: 0.5 } });
    assert.equal(patch.status, 200, `PATCH failed: ${JSON.stringify(patch.json)}`);
    assert.equal(patch.json.clip.crop_config?.mode, 'fit');

    const reload = await getEditor();
    assert.equal(reload.json.clip.crop_config?.mode, 'fit', 'fit mode must survive save->reload');

    // Unknown modes still sanitize to center
    const bad = await patchEditor({ cropConfig: { mode: 'bogus' } });
    assert.equal(bad.json.clip.crop_config?.mode, 'center');
  });

  it('6. Render honors fit: buildFitFilter produces letterbox pad, not fill-crop', async () => {
    const { buildFitFilter } = await import('../services/clipRenderService.js');
    const f = buildFitFilter('9:16');
    assert.ok(f.includes('force_original_aspect_ratio=decrease'), 'fit must scale down, not crop');
    assert.ok(f.includes('pad=1080:1920'), 'fit must pad to canvas');
    assert.ok(!f.includes('crop='), 'fit must not crop');
  });

  it('7. Beyond-candidate extend: negative trimEndOffset bounded by source duration', async () => {
    // Source duration unknown on the project -> extension rejected.
    const unknown = await patchEditor({ trimEndOffset: -5 });
    assert.equal(unknown.status, 400, `expected 400, got ${unknown.status}: ${JSON.stringify(unknown.json)}`);
    assert.equal(unknown.json?.error?.code || unknown.json?.code, 'EXTEND_BEYOND_SOURCE');

    // With a 120s source, extending the tail by 5s (end 40 -> 45) is allowed and persists.
    const db = await getMongoDb();
    await db.collection('projects').updateOne({ id: projectId }, { $set: { duration_seconds: 120 } });
    const ok = await patchEditor({ trimEndOffset: -5 });
    assert.equal(ok.status, 200, `PATCH failed: ${JSON.stringify(ok.json)}`);
    assert.equal(Number(ok.json.clip.trim_end_offset), -5);

    // Save -> reload must preserve the negative offset (no clamp on the read path).
    const reload = await getEditor();
    assert.equal(
      Number(reload.json.clip.trim_end_offset),
      -5,
      `reload must preserve negative trim_end_offset, got ${JSON.stringify(reload.json.clip.trim_end_offset)}`
    );

    // Extending past the source end (40 + 200 > 120) is rejected.
    const tooFar = await patchEditor({ trimEndOffset: -200 });
    assert.equal(tooFar.status, 400);
    assert.equal(tooFar.json?.error?.code || tooFar.json?.code, 'EXTEND_BEYOND_SOURCE');

    // Restore the neutral trim so later assertions see the base state.
    const reset = await patchEditor({ trimEndOffset: 0 });
    assert.equal(reset.status, 200);
  });
});
