import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const uri = process.env.MONGODB_URI;
assert(uri && ['127.0.0.1', 'localhost'].includes(new URL(uri).hostname), 'A loopback-only Mongo replica-set URI is required. Remote databases are refused.');
const fixtureDatabase = 'vireo_local_qualification_' + crypto.randomUUID().replaceAll('-', '');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-local-qualification-'));
console.log('Synthetic local qualification output:', out);
Object.assign(process.env, { NODE_ENV: 'test', VIREO_SERVICE_ROLE: 'api', VIREO_RENDER_ADMISSION_V1: '1', MONGODB_URI: uri, MONGODB_DB_NAME: fixtureDatabase, SUPABASE_URL: 'http://127.0.0.1:5998', SUPABASE_SECRET_KEY: 'fixture', OPENROUTER_API_KEY: '', GROQ_API_KEY: 'fixture', SMART_REFRAME_ENABLED: 'false', REFRAME_AUTO_GENERATE: 'false', VIREO_FFMPEG_THREADS: '1', VIREO_RENDER_MAX_CONCURRENT: '1', RENDER_FFMPEG_PRESET: 'ultrafast', VIREO_RENDER_PROCESS_MODE: 'combined' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = p => import(root + '/dist/' + p + '.js');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const source = out + '/source.mp4';
if (!fs.existsSync(source))
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=24:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-threads', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', source], { timeout: 10000 });
const bytes = fs.readFileSync(source);
let etag = '"local-render-source"', denyUploads = true, moveDuringProvider = false, uploadDenials = 0;
const objects = new Map(), requests = [];
let sourceGets = 0, providerCalls = 0;
const server = http.createServer(async (req, res) => { try {
    const url = new URL(req.url, 'http://localhost'), key = decodeURIComponent(url.pathname);
    if (key === '/auth/v1/user') {
        const tok = req.headers.authorization;
        const id = tok === 'Bearer synthetic-owner' ? u : tok === 'Bearer synthetic-other' ? other : null;
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(id ? 200 : 401);
        res.end(JSON.stringify(id ? { id, aud: 'authenticated', role: 'authenticated', email: (id === u ? 'owner' : 'other') + '@fixture.invalid' } : { message: 'fixture token denied' }));
        return;
    }
    requests.push({ method: req.method, key });
    if (req.method === 'HEAD' || req.method === 'GET') {
        const data = key.startsWith('/source/') ? bytes : objects.get(key);
        if (!data) {
            res.writeHead(404).end();
            return;
        }
        if (req.headers['if-match'] && req.headers['if-match'] !== etag) {
            res.writeHead(412).end();
            return;
        }
        res.setHeader('Content-Type', key.endsWith('.jpg') ? 'image/jpeg' : 'video/mp4');
        res.setHeader('ETag', etag);
        res.setHeader('Content-Length', data.length);
        if (req.method === 'GET') {
            if (key.startsWith('/source/'))
                sourceGets++;
            res.end(data);
        }
        else
            res.end();
        return;
    }
    const chunks = [];
    for await (const b of req)
        chunks.push(b);
    const data = Buffer.concat(chunks);
    if (req.method === 'PUT') {
        if (denyUploads && key.endsWith('.mp4')) {
            uploadDenials++;
            res.setHeader('Content-Type', 'application/xml');
            res.writeHead(503);
            res.end('<Error><Code>ServiceUnavailable</Code><Message>Local injected outage</Message></Error>');
            return;
        }
        objects.set(key, data);
        res.setHeader('ETag', '"synthetic-upload"');
        res.end();
        return;
    }
    if (req.method === 'POST' && url.searchParams.has('delete')) {
        res.setHeader('Content-Type', 'application/xml');
        res.end('<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>');
        return;
    }
    res.writeHead(400).end();
}
catch (e) {
    console.error(e);
    res.writeHead(500).end();
} });
await new Promise(r => server.listen(0, '127.0.0.1', r));
process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
const { config } = await mod('config/index');
Object.assign(config, { r2AccountId: 'fixture', r2AccessKeyId: 'fixture', r2SecretAccessKey: 'fixture', r2SourceBucket: 'source', r2ClipsBucket: 'clips', r2Endpoint: `http://127.0.0.1:${server.address().port}`, transcriptionProvider: 'groq', openrouterApiKey: '', multimodalAutoAnalysis: false, gameEventsAuto: false, smartReframeEnabled: false, reframeAutoGenerate: false, renderPreset: 'ultrafast', clipRenderTimeoutMs: 30000 });
const { getMongoDb, closeMongo } = await mod('db/mongoClient');
const { bootstrapMongo } = await mod('db/bootstrapMongo');
await bootstrapMongo();
const db = await getMongoDb();
const { GroqTranscriptionProvider: G } = await mod('services/transcription/groqTranscriptionProvider');
const original = G.prototype.transcribeAudio;
G.prototype.transcribeAudio = async () => { providerCalls++; if (moveDuringProvider)
    etag = '"source-replaced-during-stt"'; return { text: 'Local service render check.', language: 'en', durationSeconds: 3, segments: [{ start: .2, end: 2.8, text: 'Local service render check.' }], words: [{ start: .2, end: .7, word: 'Local' }, { start: .7, end: 1.3, word: 'service' }, { start: 1.3, end: 2, word: 'render' }, { start: 2, end: 2.8, word: 'check.' }], provenance: { provider: 'qualification-stub', model: 'synthetic' } }; };
const u = crypto.randomUUID(), other = crypto.randomUUID(), p = crypto.randomUUID(), cand = crypto.randomUUID(), key = 'fixture/' + crypto.randomUUID() + '.mp4';
let receipt, apiServer;
const statuses = [];
try {
    const { processProjectVideo } = await mod('services/videoProcessingService');
    const { selectionSourceReceipt } = await mod('shared/selectionSourceReceipt');
    const { createClipWithJob } = await mod('db/repositories/clipRepository');
    const { ClipRenderService } = await mod('services/clipRenderService');
    const { ownerContext } = await mod('db/repositories/dataRepository');
    const { EntitlementService } = await mod('services/entitlementService');
    const { setDatabaseBootstrapState } = await mod('services/databaseBootstrapState');
    setDatabaseBootstrapState('ready');
    const { default: app } = await mod('index');
    apiServer = app.listen(0, '127.0.0.1');
    await new Promise(r => apiServer.once('listening', r));
    const base = `http://127.0.0.1:${apiServer.address().port}`;
    const api = async (method, path, body, token = 'synthetic-owner') => { const res = await fetch(base + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); const data = await res.json(); statuses.push({ method, path, status: res.status, code: data.code }); return { status: res.status, data }; };
    await db.collection('projects').insertOne({ id: p, user_id: u, title: 'Synthetic local render qualification', source_type: 'fixture', source_url: key, storage_path: key, duration_seconds: 3, created_at: new Date(), updated_at: new Date() });
    const { CreditRepository } = await mod('db/repositories/creditRepository');
    const { CreditWalletService } = await mod('services/creditWalletService');
    const { SubtitleStudioService } = await mod('services/subtitleStudioService');
    await CreditRepository.grantCredits({ userId: u, amount: 20, type: 'manual_adjustment', idempotencyKey: 'synthetic-local-' + u, description: 'Isolated local qualification fixture' });
    const before = (await CreditWalletService.getWalletSummary(u)).available_credits;
    assert.equal(before, 20);
    const path = '/api/subtitles/projects/' + p + '/transcribe';
    assert.equal((await api('POST', path, {}, null)).status, 401);
    assert.equal((await api('POST', path, {}, 'invalid-fixture')).status, 401);
    assert([403, 404].includes((await api('POST', path, {}, 'synthetic-other')).status));
    const initial = await api('POST', path, {});
    assert.equal(initial.status, 200, JSON.stringify(initial));
    const result = initial.data;
    assert.equal(result.isReusedTranscript, false);
    assert.equal(result.creditsCharged, 1);
    assert.equal(providerCalls, 1);
    const afterFirst = (await CreditWalletService.getWalletSummary(u)).available_credits;
    assert.equal(afterFirst, 19);
    const again = await api('POST', path, {});
    assert.equal(again.status, 200);
    const reused = again.data;
    assert.equal(reused.isReusedTranscript, true);
    assert.equal(reused.creditsCharged, 0);
    assert.equal((await CreditWalletService.getWalletSummary(u)).available_credits, 19);
    assert.equal(providerCalls, 1);
    const transcript = await db.collection('transcripts').findOne({ project_id: p, user_id: u });
    assert(transcript?.source_binding);
    await db.collection('clip_candidates').insertOne({ id: cand, project_id: p, user_id: u, start_seconds: 0, end_seconds: 3, status: 'suggested', metadata: { selection_source_receipt: selectionSourceReceipt(transcript, key) }, created_at: new Date(), updated_at: new Date() });
    const entitlements = await EntitlementService.resolveUserEntitlements(u);
    assert.equal(entitlements.planId, 'free');
    assert.equal(entitlements.watermarkRequired, true);
    const creation = { creation_id: crypto.randomUUID(), candidateId: cand, aspectRatio: '16:9', cropMode: 'center', caption_enabled: true, caption_style: 'vireo_comic_default' };
    const creationPath = '/api/projects/' + p + '/clips';
    const prepared = await api('POST', creationPath, { ...creation, prepare_only: true });
    assert.equal(prepared.status, 200, JSON.stringify(prepared));
    assert(prepared.data.preparation);
    const admitted = await api('POST', creationPath, { ...creation, preparation: prepared.data.preparation });
    assert.equal(admitted.status, 202, JSON.stringify(admitted));
    const created = admitted.data;
    const repeated = await api('POST', creationPath, { ...creation, preparation: prepared.data.preparation });
    assert.equal(repeated.status, 200, JSON.stringify(repeated));
    assert.equal(repeated.data.clip.id, created.clip.id);
    assert.equal(await db.collection('render_jobs').countDocuments({ user_id: u }), 1);
    await ownerContext.run(u, () => ClipRenderService.renderClipJob(created.clip.id, u, created.renderJob.id));
    const queuedClip = await db.collection('clips').findOne({ id: created.clip.id }), queuedJob = await db.collection('render_jobs').findOne({ id: created.renderJob.id });
    assert.equal(queuedClip.render_status, 'queued');
    assert.equal(queuedJob.status, 'queued');
    assert.equal(queuedJob.attempts, 1);
    assert.equal(queuedJob.error_code, 'STORAGE_UNAVAILABLE');
    assert(queuedJob.next_retry_at instanceof Date);
    assert(queuedClip.updated_at instanceof Date);
    assert(queuedJob.updated_at instanceof Date);
    assert(!queuedClip.output_storage_path);
    assert.equal(objects.size, 0);
    assert.equal((await CreditWalletService.getWalletSummary(u)).available_credits, 19);
    assert.equal(providerCalls, 1);
    const waitingDownload = await api('GET', '/api/clips/' + created.clip.id + '/download-url');
    assert.equal(waitingDownload.status, 400);
    assert.equal(waitingDownload.data.code, 'CLIP_NOT_READY');
    const retryDelayMs = Math.max(0, queuedJob.next_retry_at - Date.now() + 50);
    assert(retryDelayMs < 10000);
    denyUploads = false;
    await new Promise(r => setTimeout(r, retryDelayMs));
    await ownerContext.run(u, () => ClipRenderService.renderClipJob(created.clip.id, u, created.renderJob.id));
    const clip = await db.collection('clips').findOne({ id: created.clip.id }), job = await db.collection('render_jobs').findOne({ id: created.renderJob.id });
    fs.writeFileSync(out + '/state.json', JSON.stringify({ clip, job }, null, 2));
    assert.equal(job?.attempts, 2);
    assert.equal(job?.status, 'completed', JSON.stringify({ clip, job }));
    assert.equal(clip?.render_status, 'ready');
    assert(clip.updated_at instanceof Date);
    assert(job.updated_at instanceof Date);
    assert.equal(clip.is_watermarked, true);
    const rendered = objects.get('/clips/' + clip.output_storage_path);
    assert(rendered?.length);
    fs.writeFileSync(out + '/rendered.mp4', rendered);
    const downloadPath = '/api/clips/' + created.clip.id + '/download-url';
    assert.equal((await api('GET', downloadPath, null, null)).status, 401);
    assert([403, 404].includes((await api('GET', downloadPath, null, 'synthetic-other')).status));
    const downloaded = await api('GET', downloadPath);
    assert.equal(downloaded.status, 200, JSON.stringify(downloaded));
    const download = downloaded.data;
    assert.equal(new URL(download.signedUrl).hostname, '127.0.0.1');
    const response = await fetch(download.signedUrl);
    assert.equal(response.status, 200);
    const received = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(received, rendered);
    const usage = await (await mod('db/repositories/renderQuotaRepository')).readRenderUsageCount(db, u);
    assert.equal(usage, 1);
    for (const [k, data] of objects)
        if (k.endsWith('.jpg'))
            fs.writeFileSync(out + '/poster.jpg', data);
    const failProject = crypto.randomUUID(), failedKey = 'fixture/' + crypto.randomUUID() + '.mp4';
    await db.collection('projects').insertOne({ id: failProject, user_id: u, title: 'Synthetic stale during transcription', source_type: 'fixture', source_url: failedKey, storage_path: failedKey, duration_seconds: 3, created_at: new Date(), updated_at: new Date() });
    moveDuringProvider = true;
    const failedResponse = await api('POST', '/api/subtitles/projects/' + failProject + '/transcribe', {});
    assert.equal(failedResponse.status, 409);
    assert.equal(failedResponse.data.code, 'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    assert.equal((await CreditWalletService.getWalletSummary(u)).available_credits, 19);
    assert.equal(await db.collection('transcripts').countDocuments({ project_id: failProject, user_id: u }), 0);
    assert.equal((await db.collection('projects').findOne({ id: failProject })).error_code, 'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    assert.equal(providerCalls, 2);
    const released = await db.collection('credit_reservations').findOne({ user_id: u, 'metadata.projectId': failProject });
    assert.equal(released?.status, 'released');
    receipt = { reportedCommit: process.env.VIREO_QUALIFICATION_COMMIT || 'unidentified-working-tree', fixtureDatabase, entry: 'actual compiled HTTP routes with loopback synthetic auth provider: Subtitle transcribe/reuse, prepared creation/replay, credit settlement, Free quota, executor service, and signed download', auth: 'real middleware and Supabase client call to explicit loopback synthetic identity provider, not hosted auth', http: statuses, creationReplaySameJob: true, localV1Flag: true, renderUploadFailure: { injected503: uploadDenials, afterFailure: 'queued, no output reference, Dates preserved, signed download refused', retryDelayMs, recoveredSameJob: true, finalAttempts: job.attempts, renderQuotaUsage: usage }, staleDuringTranscription: { status: failedResponse.status, creditsPreserved: 19, reservationStatus: released.status, transcriptStored: false, reviewRequired: true }, creditsBefore: before, creditsAfterInitial: afterFirst, creditsAfterReuse: 19, transcriptionCredits: result.creditsCharged, reuseCredits: reused.creditsCharged, renderQuotaPolicy: (await mod('db/repositories/renderQuotaRepository')).renderQuotaPolicy(entitlements), renderQuotaUsage: usage, downloadBytesMatched: true, sourceGetRequests: sourceGets, providerCalls, provider: 'explicit synthetic STT stub, no provider-network call', plan: entitlements.planId, captionStyle: clip.caption_style, watermark: clip.is_watermarked, clipStatus: clip.render_status, jobStatus: job.status, renderedBytes: rendered.length, outputWidth: clip.render_output_width, outputHeight: clip.render_output_height, requestedResolution: clip.render_resolution_requested, effectiveResolution: clip.render_resolution_effective, poster: Boolean(clip.poster_key), encodedAudioReview: clip.encoded_audio_review, sourceTextReview: clip.reframe_metadata?.source_subtitle_review, requests, limits: 'Synthetic3s source, local HTTP S3 emulator, local Mongo; explicit single FFmpeg thread and ultrafast preset; manual center crop/no CV; no hosted auth, real upload/provider, actual paid subscription, browser UI, real speech accuracy or long-load proof' };
    fs.writeFileSync(out + '/receipt.json', JSON.stringify(receipt, null, 2));
    console.log('LOCAL_COMPILED_SERVICE_RENDER_PASS', JSON.stringify(receipt));
}
finally {
    G.prototype.transcribeAudio = original;
    assert.equal(db.databaseName, fixtureDatabase);
    assert(fixtureDatabase.startsWith('vireo_local_qualification_'));
    await db.dropDatabase();
    if (apiServer) {
        apiServer.closeAllConnections();
        await new Promise(r => apiServer.close(r));
    }
    await closeMongo();
    server.closeAllConnections();
    await new Promise(r => server.close(r));
}
