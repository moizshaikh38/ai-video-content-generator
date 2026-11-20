import {config} from '../config/index.js';
import {transcriptContentIdentity} from '../shared/transcriptSourceBinding.js';
import {selectionSourceReceipt} from '../shared/selectionSourceReceipt.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { supabaseAuthClient } from '../utils/supabase.js';
import { errorHandler } from '../middleware/errorHandler.js';
import projectRoutes from '../routes/projectRoutes.js';
import { defaultAiProvider } from '../services/aiProviderClient.js';

/**
 * POST /clips/:clipId/hook/regenerate over REAL HTTP + REAL Mongo, with the AI
 * provider mocked (no paid/external calls).
 *
 * Verifies:
 * 1. Happy path: mocked provider returns hook+title -> 200 with that text.
 * 2. Fail-closed path: no provider key available -> 503 HOOK_PROVIDER_UNAVAILABLE,
 *    never fabricated text.
 *
 * Auth: the real requireAuth middleware runs; only the external Supabase
 * verifier is stubbed in-process (same pattern as the round-trip test).
 */
describe('Hook regeneration route (HTTP + Mongo, mocked provider)', () => {
  const userId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const clipId = crypto.randomUUID();
  const TOKEN = 'test-hook-regen-token';
  const sourceKey=`users/${userId}/projects/${projectId}/source/hook-fixture.mp4`;
  let sourceEtag='"hook-fixture"';
  const storage=http.createServer((_req,res)=>{res.setHeader('ETag',sourceEtag);res.setHeader('Content-Length','7');res.end();});
  const oldStorage={r2AccountId:config.r2AccountId,r2AccessKeyId:config.r2AccessKeyId,r2SecretAccessKey:config.r2SecretAccessKey,r2SourceBucket:config.r2SourceBucket,r2Endpoint:config.r2Endpoint};

  let server: http.Server | null = null;
  let baseUrl = '';

  before(async () => {
    await new Promise<void>(r=>storage.listen(0,'127.0.0.1',r));
    const storageAddress=storage.address();assert(storageAddress&&typeof storageAddress!=='string');
    Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${storageAddress.port}`});
    const db = await getMongoDb();
    const now = new Date();

    await db.collection('projects').insertOne({
      id: projectId,
      user_id: userId,
      title: 'Hook regen project',
      source_url: sourceKey,
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
      end_seconds: 70,
      duration_seconds: 60,
      aspect_ratio: '9:16',
      crop_mode: 'smart',
      render_status: 'ready',
      caption_enabled: true,
      caption_style: 'clean',
      created_at: now,
      updated_at: now,
    });

    const words: any[] = [];
    for (let i = 0; i < 60; i++) {
      words.push({ text: `word${i}`, start: 10 + i, end: 10 + i + 0.8 });
    }
    await db.collection('transcripts').insertOne({
      id: crypto.randomUUID(),
      project_id: projectId,
      user_id: userId,
      words,
      created_at: now,
      updated_at: now,
    });

    // Synthetic local source receipt. No cloud storage or speech-provider claim.
    const transcript=await db.collection('transcripts').findOne({project_id:projectId});assert(transcript);
    const binding={version:1,source_receipt:{key:sourceKey,size:7,etag:sourceEtag,sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(transcript)};
    await db.collection('transcripts').updateOne({project_id:projectId},{$set:{source_binding:binding}});
    await db.collection('clips').updateOne({id:clipId},{$set:{source_storage_path:sourceKey,selection_source_receipt:selectionSourceReceipt({...transcript,source_binding:binding},sourceKey)}});

    (supabaseAuthClient.auth as any).getUser = async (token: string) => {
      if (token === TOKEN) {
        return { data: { user: { id: userId, email: 'hook-regen@vireoclip.test' } }, error: null };
      }
      return { data: { user: null }, error: { message: 'invalid JWT' } };
    };

    const app = express();
    app.use(express.json());
    app.use('/api', projectRoutes);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server!.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  after(async () => {
    (defaultAiProvider as any).generateJsonCompletion = undefined;
    delete (defaultAiProvider as any).generateJsonCompletion;
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await new Promise<void>((resolve)=>storage.close(()=>resolve()));
    Object.assign(config,oldStorage);
    await closeMongo();
  });

  it('returns the mocked provider hook and title (200)', async () => {
    (defaultAiProvider as any).generateJsonCompletion = async () => ({
      hook: 'This changes everything',
      title: 'Big Reveal',
    });

    const res = await fetch(`${baseUrl}/api/clips/${clipId}/hook/regenerate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const body: any = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.hook, 'This changes everything');
    assert.equal(body.title, 'Big Reveal');
  });

  it('provider receives only complete speech inside a trimmed short clip',async()=>{
    const db=await getMongoDb();
    await db.collection('clips').updateOne({id:clipId},{$set:{end_seconds:15,trim_start_offset:1,trim_end_offset:1}});
    let prompt='';
    (defaultAiProvider as any).generateJsonCompletion=async(options:any)=>{prompt=options.userPrompt;return{hook:'Short clip',title:'Bounded'};};
    try{
      const res=await fetch(`${baseUrl}/api/clips/${clipId}/hook/regenerate`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`}});
      assert.equal(res.status,200);assert.match(prompt,/word1 word2 word3/);assert.doesNotMatch(prompt,/word0\b|word4\b|word10\b/);
    }finally{await db.collection('clips').updateOne({id:clipId},{$set:{end_seconds:70,trim_start_offset:0,trim_end_offset:0}});}
  });

  it('review-flagged transcript cannot bypass source quality through hook regeneration',async()=>{
    const db=await getMongoDb();
    await db.collection('transcripts').updateOne({project_id:projectId},{$set:{quality_assessment:{version:1,status:'needs_review'}}});
    let calls=0;
    (defaultAiProvider as any).generateJsonCompletion=async()=>{calls++;return{hook:'Should not happen'};};
    try{
      const res=await fetch(`${baseUrl}/api/clips/${clipId}/hook/regenerate`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`}});
      assert.equal(res.status,409);assert.equal((await res.json() as any).code,'TRANSCRIPT_REVIEW_REQUIRED');assert.equal(calls,0);
    }finally{await db.collection('transcripts').updateOne({project_id:projectId},{$unset:{quality_assessment:''}});}
  });

  it('refuses changed transcript or missing selection lineage before any provider call',async()=>{
    const db=await getMongoDb();const original=await db.collection('transcripts').findOne({project_id:projectId});assert(original);
    const clip=await db.collection('clips').findOne({id:clipId});assert(clip);
    let calls=0;(defaultAiProvider as any).generateJsonCompletion=async()=>{calls++;return{hook:'Not allowed'};};
    const check=async()=>{const res=await fetch(`${baseUrl}/api/clips/${clipId}/hook/regenerate`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`}});assert.equal(res.status,409);assert.equal((await res.json() as any).code,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');assert.equal(calls,0);};
    try{
      await db.collection('transcripts').updateOne({project_id:projectId},{$set:{words:[{text:'Unrelated replacement',start:10,end:11}]}});await check();
      await db.collection('transcripts').updateOne({project_id:projectId},{$set:{words:original.words}});
      await db.collection('clips').updateOne({id:clipId},{$unset:{selection_source_receipt:''}});await check();
    }finally{await db.collection('transcripts').updateOne({project_id:projectId},{$set:{words:original.words}});await db.collection('clips').updateOne({id:clipId},{$set:{selection_source_receipt:clip.selection_source_receipt}});}
  });

  it('refuses source object replacement before any provider call',async()=>{
    let calls=0;(defaultAiProvider as any).generateJsonCompletion=async()=>{calls++;return{hook:'Not allowed'};};
    sourceEtag='"replaced-hook-source"';
    try{const res=await fetch(`${baseUrl}/api/clips/${clipId}/hook/regenerate`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`}});assert.equal(res.status,409);assert.equal((await res.json() as any).code,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');assert.equal(calls,0);}finally{sourceEtag='"hook-fixture"';}
  });

  it('fails closed with sanitized 503 when no provider is available', async () => {
    // Remove the instance-level mock so the real provider path (and its key
    // availability check) is exercised.
    delete (defaultAiProvider as any).generateJsonCompletion;
    const origPrimary = (defaultAiProvider as any).primaryProvider.isConfigured;
    const origFallback = (defaultAiProvider as any).fallbackProvider.isConfigured;
    (defaultAiProvider as any).primaryProvider.isConfigured = () => false;
    (defaultAiProvider as any).fallbackProvider.isConfigured = () => false;
    try {
      const res = await fetch(`${baseUrl}/api/clips/${clipId}/hook/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const body: any = await res.json();
      assert.equal(res.status, 503);
      // Server-side provider diagnostics stay private under the shared error contract.
      assert.equal(body.code, 'INTERNAL_ERROR');
      assert.equal(body.message, 'Internal server error');
      assert.ok(!body.hook, 'must never return fabricated hook text');
    } finally {
      (defaultAiProvider as any).primaryProvider.isConfigured = origPrimary;
      (defaultAiProvider as any).fallbackProvider.isConfigured = origFallback;
    }
  });

  it('404s for another user\'s clip', async () => {
    (defaultAiProvider as any).generateJsonCompletion = async () => ({ hook: 'x', title: 'y' });
    const res = await fetch(`${baseUrl}/api/clips/${crypto.randomUUID()}/hook/regenerate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(res.status, 404);
  });
});
