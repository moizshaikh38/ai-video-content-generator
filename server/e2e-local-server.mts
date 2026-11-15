// Standalone API server for Studio E2E: real routes, stubbed Supabase verifier.
import express from 'express';
import cors from 'cors';
const { supabaseAuthClient } = await import('/tmp/avcg/server/src/utils/supabase.js');
const USER_ID = '11111111-1111-4111-8111-111111111111';
(supabaseAuthClient.auth as any).getUser = async (token: string) => {
  if (token === 'e2e-studio-token') {
    return { data: { user: { id: USER_ID, email: 'e2e@vireoclip.test' } }, error: null };
  }
  return { data: { user: null }, error: { message: 'invalid JWT' } };
};
const { getMongoDb } = await import('/tmp/avcg/server/src/db/mongoClient.js');
await getMongoDb();
await getMongoDb().then(db => db.collection('clips').updateOne({ id: '0dbae5cd-6b3b-4386-8fa6-94355fe66d01' }, { $set: { caption_style: 'simple', caption_config: { presetId: 'simple' } } }));
const { default: apiRouter } = await import('/tmp/avcg/server/src/routes/index.js');
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    console.log('REQ', req.method, req.path, '->', res.statusCode, Date.now() - t0 + 'ms');
  });
  next();
});
app.use('/api', apiRouter);
app.use((err: any, req: any, res: any, next: any) => {
  res.status(err.statusCode || 500).json({ status: 'error', code: err.code || 'INTERNAL_ERROR', message: err.message });
});
app.listen(5599, () => console.log('e2e api on 5599'));
