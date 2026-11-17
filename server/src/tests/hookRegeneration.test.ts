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

  let server: http.Server | null = null;
  let baseUrl = '';

  before(async () => {
    const db = await getMongoDb();
    const now = new Date();

    await db.collection('projects').insertOne({
      id: projectId,
      user_id: userId,
      title: 'Hook regen project',
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

  it('fails closed with 503 HOOK_PROVIDER_UNAVAILABLE when no provider is available', async () => {
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
      assert.equal(body.code, 'HOOK_PROVIDER_UNAVAILABLE');
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
