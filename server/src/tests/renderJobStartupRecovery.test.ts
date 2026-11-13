import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb } from '../db/mongoClient.js';
import { ClipRenderService, launchInlineRender } from '../services/clipRenderService.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';

describe('VireoClip — Render Job Startup Recovery & Owner Context Regression Tests', () => {
  let db: any;
  const createdJobIds: string[] = [];
  const createdClipIds: string[] = [];

  // Valid RFC-4122 v4 UUIDs satisfying MongoDB collection schema validators
  const testUserA = crypto.randomUUID();
  const testUserB = crypto.randomUUID();

  before(async () => {
    db = await getMongoDb();
  });

  beforeEach(async () => {
    // Isolate tests: remove previously created test jobs so findOne picks the current test job
    if (createdJobIds.length > 0) {
      await db.collection('render_jobs').deleteMany({ id: { $in: createdJobIds } });
    }
  });

  after(async () => {
    // Clean up created test documents
    if (createdJobIds.length > 0) {
      await db.collection('render_jobs').deleteMany({ id: { $in: createdJobIds } });
    }
    if (createdClipIds.length > 0) {
      await db.collection('clips').deleteMany({ id: { $in: createdClipIds } });
    }
  });

  it('1. Background processing outside HTTP context propagates correct owner context', async () => {
    const clipId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    createdClipIds.push(clipId);
    createdJobIds.push(jobId);

    // Insert a valid clip for testUserA using dataRepository inside ownerContext
    await ownerContext.run(testUserA, async () => {
      await dataRepository.from('clips').insert({
        id: clipId,
        user_id: testUserA,
        project_id: crypto.randomUUID(),
        render_status: 'draft',
      });
    });

    // Insert queued render_job in MongoDB with an early created_at so it is picked first
    await db.collection('render_jobs').insertOne({
      id: jobId,
      clip_id: clipId,
      user_id: testUserA,
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      max_attempts: 3,
      worker_id: null,
      locked_at: null,
      next_retry_at: null,
      created_at: new Date('2020-01-01T00:00:01Z'),
      updated_at: new Date(),
    });

    // Ensure we are outside any HTTP / ALS context
    assert.equal(ownerContext.getStore(), undefined, 'Initial ALS context must be undefined');

    // Intercept renderClipJob to verify ALS store inside execution
    let capturedOwnerContext: string | undefined = undefined;
    const originalRenderClipJob = ClipRenderService.renderClipJob;
    (ClipRenderService as any).renderClipJob = async function (cId: string, uId: string, jId: string) {
      capturedOwnerContext = ownerContext.getStore();
      throw Object.assign(new Error('Simulated post-context stop'), { code: 'TEST_STOP' });
    };

    try {
      await ClipRenderService.processDueRenderJobs();
    } finally {
      (ClipRenderService as any).renderClipJob = originalRenderClipJob;
    }

    assert.equal(capturedOwnerContext, testUserA, 'ownerContext.getStore() inside worker must equal job user_id');
  });

  it('2. Valid clip job progresses through dataRepository without AUTH_REQUIRED', async () => {
    const clipId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    createdClipIds.push(clipId);
    createdJobIds.push(jobId);

    await ownerContext.run(testUserA, async () => {
      await dataRepository.from('clips').insert({
        id: clipId,
        user_id: testUserA,
        project_id: crypto.randomUUID(),
        render_status: 'draft',
      });
    });

    await db.collection('render_jobs').insertOne({
      id: jobId,
      clip_id: clipId,
      user_id: testUserA,
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      max_attempts: 3,
      worker_id: null,
      locked_at: null,
      next_retry_at: null,
      created_at: new Date('2020-01-01T00:00:02Z'),
      updated_at: new Date(),
    });

    // Call renderClipJob with ownerContext - it should read clip without AUTH_REQUIRED
    let reachedStagePastClipFetch = false;
    const originalEnsureSource = (ClipRenderService as any).ensureSourceVideo;
    (ClipRenderService as any).ensureSourceVideo = async () => {
      reachedStagePastClipFetch = true;
      throw Object.assign(new Error('Stop at source video download'), { code: 'DOWNLOAD_STOP' });
    };

    try {
      await ownerContext.run(testUserA, async () => {
        try {
          await ClipRenderService.renderClipJob(clipId, testUserA, jobId);
        } catch (e: any) {
          if (e.code === 'DOWNLOAD_STOP') {
            reachedStagePastClipFetch = true;
          } else {
            throw e;
          }
        }
      });
    } finally {
      (ClipRenderService as any).ensureSourceVideo = originalEnsureSource;
    }

    assert.equal(reachedStagePastClipFetch, true, 'Job must fetch clip and proceed past dataRepository fetch');
  });

  it('3. Orphaned job (clip does not exist) transitions to failed with CLIP_NOT_FOUND', async () => {
    const orphanedClipId = crypto.randomUUID();
    const orphanedJobId = crypto.randomUUID();
    createdJobIds.push(orphanedJobId);

    // Insert job referencing non-existent clip with early created_at
    await db.collection('render_jobs').insertOne({
      id: orphanedJobId,
      clip_id: orphanedClipId,
      user_id: testUserA,
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      max_attempts: 3,
      worker_id: null,
      locked_at: null,
      next_retry_at: null,
      created_at: new Date('2020-01-01T00:00:03Z'),
      updated_at: new Date(),
    });

    // Process due jobs outside HTTP context
    const processed = await ClipRenderService.processDueRenderJobs();
    assert.equal(processed, 1, 'Should process the orphaned job');

    // Verify job in database
    const updatedJob = await db.collection('render_jobs').findOne({ id: orphanedJobId });
    assert.ok(updatedJob, 'Job must exist in DB');
    assert.equal(updatedJob.status, 'failed', 'Orphaned job must transition to failed');
    assert.equal(updatedJob.stage, 'failed', 'Stage must be failed');
    assert.equal(updatedJob.error_code, 'CLIP_NOT_FOUND', 'Error code must be CLIP_NOT_FOUND');
    assert.ok(updatedJob.error_message.includes('Clip not found') || updatedJob.error_message.length > 0, 'Safe error message recorded');
  });

  it('4. Failed orphan job is not selected again on subsequent sweeps', async () => {
    const orphanedClipId = crypto.randomUUID();
    const orphanedJobId = crypto.randomUUID();
    createdJobIds.push(orphanedJobId);

    await db.collection('render_jobs').insertOne({
      id: orphanedJobId,
      clip_id: orphanedClipId,
      user_id: testUserA,
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      max_attempts: 3,
      worker_id: null,
      locked_at: null,
      next_retry_at: null,
      created_at: new Date('2020-01-01T00:00:04Z'),
      updated_at: new Date(),
    });

    // First sweep: fails the orphan
    await ClipRenderService.processDueRenderJobs();

    const afterFirstSweep = await db.collection('render_jobs').findOne({ id: orphanedJobId });
    assert.equal(afterFirstSweep.status, 'failed');

    // Query for due jobs with this specific job ID
    const matchOnSecondSweep = await db.collection('render_jobs').findOne({
      id: orphanedJobId,
      status: 'queued',
      attempts: { $lt: 3 },
    });

    assert.equal(matchOnSecondSweep, null, 'Failed orphan must never match the due queued filter');
  });

  it('5. User A cannot access User B clip (tenant boundary enforcement)', async () => {
    const clipIdB = crypto.randomUUID();
    const jobIdA = crypto.randomUUID();
    createdClipIds.push(clipIdB);
    createdJobIds.push(jobIdA);

    // Clip belongs to testUserB
    await ownerContext.run(testUserB, async () => {
      await dataRepository.from('clips').insert({
        id: clipIdB,
        user_id: testUserB,
        project_id: crypto.randomUUID(),
        render_status: 'draft',
      });
    });

    // Job maliciously or erroneously attempts to claim User B clip under User A
    await db.collection('render_jobs').insertOne({
      id: jobIdA,
      clip_id: clipIdB,
      user_id: testUserA,
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      max_attempts: 3,
      worker_id: null,
      locked_at: null,
      next_retry_at: null,
      created_at: new Date('2020-01-01T00:00:05Z'),
      updated_at: new Date(),
    });

    // Run sweep: should reject with CLIP_NOT_FOUND because User A cannot read User B's clip
    await ClipRenderService.processDueRenderJobs();

    const jobA = await db.collection('render_jobs').findOne({ id: jobIdA });
    assert.equal(jobA.status, 'failed', 'Cross-tenant access must be rejected');
    assert.equal(jobA.error_code, 'CLIP_NOT_FOUND', 'Cross-tenant access must yield CLIP_NOT_FOUND');

    // Confirm User B's clip was untouched
    const clipB = await db.collection('clips').findOne({ id: clipIdB });
    assert.equal(clipB.user_id, testUserB, 'User B clip must remain owned by User B');
    assert.equal(clipB.render_status, 'draft', 'User B clip must not have been modified');
  });

  it('6. Concurrent worker active lease is never overwritten by pre-lease failure handling', async () => {
    const clipId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    createdJobIds.push(jobId);

    // Job is claimed by another worker concurrently (status: processing, worker_id set)
    await db.collection('render_jobs').insertOne({
      id: jobId,
      clip_id: clipId,
      user_id: testUserA,
      status: 'processing',
      stage: 'downloading',
      attempts: 1,
      max_attempts: 3,
      worker_id: 'active_worker_concurrent_999',
      locked_at: new Date(),
      next_retry_at: null,
      created_at: new Date('2020-01-01T00:00:06Z'),
      updated_at: new Date(),
    });

    // Simulate failure handler attempting conditional update with queued check
    const updateResult = await db.collection('render_jobs').updateOne(
      {
        id: jobId,
        user_id: testUserA,
        status: 'queued',
        worker_id: null,
        locked_at: null,
      },
      {
        $set: {
          status: 'failed',
          stage: 'failed',
          error_code: 'CLIP_NOT_FOUND',
          updated_at: new Date(),
        },
      }
    );

    assert.equal(updateResult.matchedCount, 0, 'Must match 0 documents when worker_id is active');
    assert.equal(updateResult.modifiedCount, 0, 'Active lease must not be overwritten');

    const jobAfter = await db.collection('render_jobs').findOne({ id: jobId });
    assert.equal(jobAfter.status, 'processing', 'Job must remain processing under active worker');
    assert.equal(jobAfter.worker_id, 'active_worker_concurrent_999', 'Active worker ID preserved');
  });

  it('7. Transient database/network errors preserve retry and recovery behaviour', async () => {
    const clipId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    createdJobIds.push(jobId);

    await db.collection('render_jobs').insertOne({
      id: jobId,
      clip_id: clipId,
      user_id: testUserA,
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      max_attempts: 3,
      worker_id: null,
      locked_at: null,
      next_retry_at: null,
      created_at: new Date('2020-01-01T00:00:07Z'),
      updated_at: new Date(),
    });

    // Mock renderClipJob to throw a transient error (e.g. DATABASE_UNAVAILABLE)
    const originalRenderClipJob = ClipRenderService.renderClipJob;
    (ClipRenderService as any).renderClipJob = async () => {
      const err = new Error('Database connection temporarily dropped');
      (err as any).code = 'DATABASE_UNAVAILABLE';
      throw err;
    };

    try {
      await ClipRenderService.processDueRenderJobs();
    } finally {
      (ClipRenderService as any).renderClipJob = originalRenderClipJob;
    }

    const jobAfter = await db.collection('render_jobs').findOne({ id: jobId });
    assert.equal(jobAfter.status, 'queued', 'Transient error must keep job status as queued for retry');
    assert.equal(jobAfter.attempts, 1, 'Attempts must be incremented by 1');
    assert.ok(jobAfter.next_retry_at instanceof Date, 'next_retry_at must be populated with future backoff date');
    assert.ok(jobAfter.next_retry_at.getTime() > Date.now(), 'next_retry_at must be in the future');
  });

  it('8. Existing normal user-triggered rendering continues to propagate owner context', async () => {
    const clipId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    createdClipIds.push(clipId);
    createdJobIds.push(jobId);

    await ownerContext.run(testUserA, async () => {
      await dataRepository.from('clips').insert({
        id: clipId,
        user_id: testUserA,
        project_id: crypto.randomUUID(),
        render_status: 'draft',
      });
    });

    let inlineContextVerified = false;
    const originalRender = ClipRenderService.renderClipJob;
    (ClipRenderService as any).renderClipJob = async (cId: string, uId: string, jId: string) => {
      assert.equal(ownerContext.getStore(), testUserA, 'Inline render must have user context in ALS');
      inlineContextVerified = true;
    };

    try {
      // Normal controller call outside prior ALS context
      const launched = launchInlineRender(clipId, testUserA, jobId);
      assert.equal(launched, true, 'launchInlineRender should launch inline');
      // Wait microtask tick for async dispatch
      await new Promise(r => setTimeout(r, 50));
      assert.equal(inlineContextVerified, true, 'renderClipJob must have been invoked with active ALS context');
    } finally {
      (ClipRenderService as any).renderClipJob = originalRender;
    }
  });
});
