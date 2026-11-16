/** TEST-ONLY fixture backend for the EditorShell template integration proof.
 * Real express + real projectRoutes + REAL SmartReframeService analysis; only
 * the Supabase verifier is stubbed (labeled pattern, same as the round-trip
 * test). Serves on :5000 (the client default apiBase). CORS is wide open
 * here only because this is a local fixture for the harness.
 */
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import { getMongoDb } from '/tmp/avcg/server/src/db/mongoClient.js';
import { ownerContext } from '/tmp/avcg/server/src/db/repositories/dataRepository.js';
import { supabaseAuthClient } from '/tmp/avcg/server/src/utils/supabase.js';
import { errorHandler } from '/tmp/avcg/server/src/middleware/errorHandler.js';
import projectRoutes from '/tmp/avcg/server/src/routes/projectRoutes.js';
import { SmartReframeService } from '/tmp/avcg/server/src/services/smartReframeService.js';

const SRC = '/tmp/realmedia/tos-twoshot.mp4';
// REUSE_* env vars skip fixture creation + analysis (fixture persists in Mongo
// from a prior boot) so the backend starts in seconds on repeat runs.
const REUSE = !!process.env.REUSE_CLIP_ID;
const userId = process.env.REUSE_USER_ID || crypto.randomUUID();
const projectId = process.env.REUSE_PROJECT_ID || crypto.randomUUID();
const clipId = process.env.REUSE_CLIP_ID || crypto.randomUUID();
const TOKEN = 'editorshell-proof-token';

const db = await getMongoDb();
ownerContext.enterWith(userId);
if (!REUSE) {
  const now = new Date();
  await db.collection('projects').insertOne({
    id: projectId, user_id: userId, title: 'EditorShell template proof', status: 'READY',
    created_at: now, updated_at: now,
  });
  await db.collection('clips').insertOne({
    id: clipId, project_id: projectId, user_id: userId, candidate_id: crypto.randomUUID(),
    start_seconds: 0, end_seconds: 9, duration_seconds: 9,
    aspect_ratio: '9:16', crop_mode: 'smart', crop_config: { mode: 'smart' },
    render_status: 'ready', caption_enabled: true,
    source_storage_path: SRC,
    title: 'Two shot template clip',
    created_at: now, updated_at: now,
  });
  console.log('fixture clip', clipId);

  // REAL analysis so GET /clips/:id/reframe serves real measured anchors.
  const track = await SmartReframeService.analyzeClipFraming(clipId, userId, { localSourcePath: SRC });
  console.log('track ready:', track.status, 'anchors:', (track.metadata as any)?.speaker1X, (track.metadata as any)?.speaker2X);
}

(supabaseAuthClient.auth as any).getUser = async (token: string) =>
  token === TOKEN
    ? { data: { user: { id: userId, email: 'editorshell-proof@vireoclip.test' } }, error: null }
    : { data: { user: null }, error: { message: 'invalid JWT' } };

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});
app.use(express.json({ limit: '25mb' }));
app.use('/api', projectRoutes);
app.use(errorHandler);
const server = http.createServer(app);
server.listen(Number(process.env.PORT) || 5000, () => console.log(`BACKEND_READY clip=${clipId} project=${projectId} user=${userId} token=${TOKEN}`));
