import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { UploadLifecycleService } from '../services/uploadLifecycleService.js';
import { deleteProjectRecords } from '../db/repositories/deletionRepository.js';
import * as objectStorageService from '../services/objectStorageService.js';
import { AppError } from '../types/index.js';

describe('Phase 4B.4 — Phase 2.2: Upload Lifecycle & Orphan Prevention Integration Tests', () => {
  const userId = crypto.randomUUID();
  const crossTenantUserId = crypto.randomUUID();
  let projectId: string;

  // Track simulated objects in mock S3
  const mockStorage = new Map<string, { size: number; contentType: string }>();

  // Backups of original functions
  const originalHeadObject = UploadLifecycleService.headObjectFn;

  before(async () => {
    // Mock headObject for storage integration
    UploadLifecycleService.headObjectFn = async (bucket: string, key: string) => {
      const found = mockStorage.get(key);
      if (!found) {
        throw new AppError('Uploaded object was not found.', 404, 'UPLOAD_NOT_FOUND');
      }
      return found;
    };

    projectId = crypto.randomUUID();
    const db = await getMongoDb();
    await db.collection('projects').insertOne({
      id: projectId,
      user_id: userId,
      title: 'Lifecycle Test Project',
      video_status: 'uploading',
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  after(async () => {
    UploadLifecycleService.headObjectFn = originalHeadObject;
    const db = await getMongoDb();
    await db.collection('projects').deleteMany({ id: projectId });
    await db.collection('project_upload_attempts').deleteMany({ project_id: projectId });
    await closeMongo();
  });

  it('1. Reproduces K1 → missed confirmation → K2 grant → K2 confirm → K1 becomes orphan cleanup candidate', async () => {
    const db = await getMongoDb();
    const k1 = `users/${userId}/projects/${projectId}/source/${crypto.randomUUID()}-clip1.mp4`;
    const k2 = `users/${userId}/projects/${projectId}/source/${crypto.randomUUID()}-clip1.mp4`;

    // Step 1: First upload grant creates attempt K1
    const attempt1ExpiresAt = new Date(Date.now() - 3 * 3600 * 1000); // 3 hours in the past
    const attempt1 = await UploadLifecycleService.recordAttempt({
      userId,
      projectId,
      objectKey: k1,
      fileName: 'clip1.mp4',
      fileSize: 1048576,
      contentType: 'video/mp4',
      expiresAt: attempt1ExpiresAt,
    });
    assert.strictEqual(attempt1.status, 'pending');

    // Step 2: K1 upload successfully reaches R2
    mockStorage.set(k1, { size: 1048576, contentType: 'video/mp4' });

    // Step 3: Browser missed confirmation (network timeout, K1 remains unconfirmed)

    // Step 4: User retries upload on the same project -> Second grant creates K2
    const attempt2ExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins in future
    const attempt2 = await UploadLifecycleService.recordAttempt({
      userId,
      projectId,
      objectKey: k2,
      fileName: 'clip1.mp4',
      fileSize: 1048576,
      contentType: 'video/mp4',
      expiresAt: attempt2ExpiresAt,
    });
    assert.strictEqual(attempt2.status, 'pending');

    // Step 5: K2 successfully uploads to R2
    mockStorage.set(k2, { size: 1048576, contentType: 'video/mp4' });

    // Step 6: K2 confirmed
    const confirm2 = await UploadLifecycleService.confirmAttempt({
      userId,
      projectId,
      attemptId: attempt2.id,
      objectKey: k2,
    });
    assert.strictEqual(confirm2.status, 'confirmed');

    // Update project canonical source to K2
    await db.collection('projects').updateOne(
      { id: projectId },
      {
        $set: {
          source_url: k2,
          source_object_key: k2,
          video_status: 'uploaded',
          updated_at: new Date(),
        },
      }
    );

    // Verify attempt1 is now superseded
    const updatedAttempt1 = await UploadLifecycleService.getAttempt({
      userId,
      projectId,
      attemptId: attempt1.id,
    });
    assert.strictEqual(updatedAttempt1?.status, 'superseded');

    // Step 7: Candidate discovery (Dry Run) identifies K1 as cleanup candidate
    const discovery = await UploadLifecycleService.discoverCleanupCandidates({
      userId,
      projectId,
      gracePeriodMs: 60 * 60 * 1000, // 1 hour grace
    });

    const candidateKeys = discovery.candidates.map((c) => c.key);
    assert.ok(candidateKeys.includes(k1), 'K1 must be identified as an orphan cleanup candidate');
    assert.ok(!candidateKeys.includes(k2), 'Canonical K2 must NOT be a cleanup candidate');
  });

  it('2. K1 cannot be a candidate before presigned URL expiry and safety grace period', async () => {
    const kActive = `users/${userId}/projects/${projectId}/source/${crypto.randomUUID()}-active.mp4`;
    // Attempt expires 10 minutes in the future
    const activeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await UploadLifecycleService.recordAttempt({
      userId,
      projectId,
      objectKey: kActive,
      fileName: 'active.mp4',
      fileSize: 500000,
      contentType: 'video/mp4',
      expiresAt: activeExpiresAt,
    });
    mockStorage.set(kActive, { size: 500000, contentType: 'video/mp4' });

    const discovery = await UploadLifecycleService.discoverCleanupCandidates({
      userId,
      projectId,
      gracePeriodMs: 2 * 3600 * 1000,
    });

    const candidateKeys = discovery.candidates.map((c) => c.key);
    assert.ok(!candidateKeys.includes(kActive), 'Active/in-grace upload must NOT be a cleanup candidate');
  });

  it('3. K1 cannot be a candidate if referenced by an active downstream video analysis job', async () => {
    const db = await getMongoDb();
    const busyProjId = crypto.randomUUID();
    const kBusy = `users/${userId}/projects/${busyProjId}/source/${crypto.randomUUID()}-busy.mp4`;
    // Attempt expired 50 hours ago
    const pastExpires = new Date(Date.now() - 50 * 3600 * 1000);

    await db.collection('projects').insertOne({
      id: busyProjId,
      user_id: userId,
      title: 'Busy Project',
      video_status: 'uploading',
      created_at: pastExpires,
      updated_at: pastExpires,
    });

    // Record attempt directly with past expiry and 'superseded' status
    const attempt: any = {
      id: crypto.randomUUID(),
      project_id: busyProjId,
      user_id: userId,
      object_key: kBusy,
      file_name: 'busy.mp4',
      file_size: 500000,
      content_type: 'video/mp4',
      status: 'superseded',
      expires_at: pastExpires,
      created_at: pastExpires,
      updated_at: pastExpires,
    };
    await db.collection('project_upload_attempts').insertOne(attempt);
    mockStorage.set(kBusy, { size: 500000, contentType: 'video/mp4' });

    // Insert an active video_analysis_job
    const jobId = crypto.randomUUID();
    await db.collection('video_analysis_jobs').insertOne({
      id: jobId,
      user_id: userId,
      project_id: busyProjId,
      status: 'queued',
      created_at: new Date(),
    });

    try {
      const discovery = await UploadLifecycleService.discoverCleanupCandidates({
        userId,
        projectId: busyProjId,
        gracePeriodMs: 3600 * 1000,
      });

      const candidateKeys = discovery.candidates.map((c) => c.key);
      assert.ok(!candidateKeys.includes(kBusy), 'Must skip when an active video analysis job is running');
      assert.ok(discovery.skipped.some((s) => s.reason === 'ACTIVE_VIDEO_ANALYSIS_JOB'), 'Must list reason as ACTIVE_VIDEO_ANALYSIS_JOB');
    } finally {
      await db.collection('video_analysis_jobs').deleteOne({ id: jobId });
      await db.collection('projects').deleteOne({ id: busyProjId });
      await db.collection('project_upload_attempts').deleteMany({ project_id: busyProjId });
    }
  });

  it('4. Stale K1 confirmation cannot replace newer canonical K2 upload (fencing check)', async () => {
    const db = await getMongoDb();
    const staleProjId = crypto.randomUUID();
    const kStale = `users/${userId}/projects/${staleProjId}/source/${crypto.randomUUID()}-stale.mp4`;

    await db.collection('projects').insertOne({
      id: staleProjId,
      user_id: userId,
      title: 'Stale Test Project',
      video_status: 'uploaded',
      source_url: `users/${userId}/projects/${staleProjId}/source/canonical.mp4`,
      source_object_key: `users/${userId}/projects/${staleProjId}/source/canonical.mp4`,
      created_at: new Date(),
      updated_at: new Date(Date.now() + 1000), // Updated after stale attempt
    });

    const staleAttempt = await UploadLifecycleService.recordAttempt({
      userId,
      projectId: staleProjId,
      objectKey: kStale,
      fileName: 'stale.mp4',
      fileSize: 500000,
      contentType: 'video/mp4',
      expiresAt: new Date(Date.now() - 3600 * 1000),
    });

    try {
      // Attempting to confirm stale attempt against a project that already has a newer canonical upload
      await assert.rejects(
        async () => {
          await UploadLifecycleService.confirmAttempt({
            userId,
            projectId: staleProjId,
            attemptId: staleAttempt.id,
            objectKey: kStale,
          });
        },
        (err: any) => {
          return err?.code === 'STALE_UPLOAD_CONFIRMATION';
        },
        'Stale confirmation must be rejected with STALE_UPLOAD_CONFIRMATION'
      );
    } finally {
      await db.collection('projects').deleteOne({ id: staleProjId });
      await db.collection('project_upload_attempts').deleteMany({ project_id: staleProjId });
    }
  });

  it('5. Duplicate confirmation is safe and idempotent', async () => {
    const kDup = `users/${userId}/projects/${projectId}/source/${crypto.randomUUID()}-dup.mp4`;
    const dupAttempt = await UploadLifecycleService.recordAttempt({
      userId,
      projectId,
      objectKey: kDup,
      fileName: 'dup.mp4',
      fileSize: 1000,
      contentType: 'video/mp4',
      expiresAt: new Date(Date.now() + 600000),
    });

    const first = await UploadLifecycleService.confirmAttempt({
      userId,
      projectId,
      attemptId: dupAttempt.id,
      objectKey: kDup,
    });
    assert.strictEqual(first.status, 'confirmed');

    const second = await UploadLifecycleService.confirmAttempt({
      userId,
      projectId,
      attemptId: dupAttempt.id,
      objectKey: kDup,
    });
    assert.strictEqual(second.status, 'already_confirmed');
  });

  it('6. Cross-tenant attempt confirmation is rejected with 403', async () => {
    const kCross = `users/${userId}/projects/${projectId}/source/${crypto.randomUUID()}-cross.mp4`;
    const attempt = await UploadLifecycleService.recordAttempt({
      userId,
      projectId,
      objectKey: kCross,
      fileName: 'cross.mp4',
      fileSize: 1000,
      contentType: 'video/mp4',
      expiresAt: new Date(Date.now() + 600000),
    });

    await assert.rejects(
      async () => {
        await UploadLifecycleService.confirmAttempt({
          userId: crossTenantUserId, // Attacker user id
          projectId,
          attemptId: attempt.id,
          objectKey: kCross,
        });
      },
      (err: any) => {
        return err.statusCode === 404 || err.statusCode === 403;
      }
    );
  });

  it('7. Project deletion cascades to project_upload_attempts', async () => {
    const tempProjId = crypto.randomUUID();
    const db = await getMongoDb();
    await db.collection('projects').insertOne({
      id: tempProjId,
      user_id: userId,
      title: 'Temp Deletion Project',
      video_status: 'uploading',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await UploadLifecycleService.recordAttempt({
      userId,
      projectId: tempProjId,
      objectKey: `users/${userId}/projects/${tempProjId}/source/${crypto.randomUUID()}-temp.mp4`,
      fileName: 'temp.mp4',
      fileSize: 1000,
      contentType: 'video/mp4',
      expiresAt: new Date(Date.now() + 600000),
    });

    const beforeAttempts = await db.collection('project_upload_attempts').find({ project_id: tempProjId }).toArray();
    assert.strictEqual(beforeAttempts.length, 1);

    // Call deleteProjectRecords
    await deleteProjectRecords(userId, tempProjId);

    const afterAttempts = await db.collection('project_upload_attempts').find({ project_id: tempProjId }).toArray();
    assert.strictEqual(afterAttempts.length, 0, 'Upload attempts must be cleaned up on project deletion');
  });

  it('8. Two concurrent upload grants for the same project [MongoDB Integration + Storage Mock]', async () => {
    const grantProjId = crypto.randomUUID();
    const db = await getMongoDb();
    await db.collection('projects').insertOne({
      id: grantProjId,
      user_id: userId,
      title: 'Concurrent Grant Project',
      video_status: 'uploading',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const keyA = `users/${userId}/projects/${grantProjId}/source/${crypto.randomUUID()}-a.mp4`;
    const keyB = `users/${userId}/projects/${grantProjId}/source/${crypto.randomUUID()}-b.mp4`;

    // Execute 2 grants concurrently
    const [grantA, grantB] = await Promise.all([
      UploadLifecycleService.recordAttempt({
        userId,
        projectId: grantProjId,
        objectKey: keyA,
        fileName: 'a.mp4',
        fileSize: 1000,
        contentType: 'video/mp4',
        expiresAt: new Date(Date.now() + 600000),
      }),
      UploadLifecycleService.recordAttempt({
        userId,
        projectId: grantProjId,
        objectKey: keyB,
        fileName: 'b.mp4',
        fileSize: 2000,
        contentType: 'video/mp4',
        expiresAt: new Date(Date.now() + 600000),
      }),
    ]);

    assert.ok(grantA.id && grantB.id);
    assert.notStrictEqual(grantA.id, grantB.id);

    const recorded = await db.collection('project_upload_attempts').find({ project_id: grantProjId }).toArray();
    assert.strictEqual(recorded.length, 2);

    await db.collection('projects').deleteOne({ id: grantProjId });
    await db.collection('project_upload_attempts').deleteMany({ project_id: grantProjId });
  });

  it('9. Two concurrent confirmations racing K1 and K2 with CAS [MongoDB Integration]', async () => {
    const raceProjId = crypto.randomUUID();
    const db = await getMongoDb();
    const k1Key = `users/${userId}/projects/${raceProjId}/source/${crypto.randomUUID()}-k1.mp4`;
    const k2Key = `users/${userId}/projects/${raceProjId}/source/${crypto.randomUUID()}-k2.mp4`;

    // Initially project has pending_upload_key set to k2 (k2 was the latest grant)
    await db.collection('projects').insertOne({
      id: raceProjId,
      user_id: userId,
      title: 'Race Project',
      pending_upload_key: k2Key,
      pending_upload_size: 2000,
      pending_upload_mime_type: 'video/mp4',
      pending_upload_expires_at: new Date(Date.now() + 600000),
      video_status: 'uploading',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const [att1, att2] = await Promise.all([
      UploadLifecycleService.recordAttempt({
        userId,
        projectId: raceProjId,
        objectKey: k1Key,
        fileName: 'k1.mp4',
        fileSize: 1000,
        contentType: 'video/mp4',
        expiresAt: new Date(Date.now() + 600000),
      }),
      UploadLifecycleService.recordAttempt({
        userId,
        projectId: raceProjId,
        objectKey: k2Key,
        fileName: 'k2.mp4',
        fileSize: 2000,
        contentType: 'video/mp4',
        expiresAt: new Date(Date.now() + 600000),
      }),
    ]);

    // Simulate CAS execution for K1:
    const casK1 = await db.collection('projects').findOneAndUpdate(
      {
        id: raceProjId,
        user_id: userId,
        pending_upload_key: k1Key, // CAS fails because pending_upload_key is k2Key!
        video_status: { $in: ['uploading', 'pending'] },
      },
      {
        $set: {
          source_url: k1Key,
          source_object_key: k1Key,
          pending_upload_key: null,
          video_status: 'uploaded',
        },
      },
      { returnDocument: 'after' }
    );
    assert.strictEqual(casK1, null, 'CAS for stale K1 must fail to match when K2 is active');

    // Simulate CAS execution for K2:
    const casK2 = await db.collection('projects').findOneAndUpdate(
      {
        id: raceProjId,
        user_id: userId,
        pending_upload_key: k2Key, // Matches!
        video_status: { $in: ['uploading', 'pending'] },
      },
      {
        $set: {
          source_url: k2Key,
          source_object_key: k2Key,
          pending_upload_key: null,
          video_status: 'uploaded',
        },
      },
      { returnDocument: 'after' }
    );
    assert.ok(casK2, 'CAS for canonical K2 must succeed');
    assert.strictEqual(casK2.source_url, k2Key);

    await db.collection('projects').deleteOne({ id: raceProjId });
    await db.collection('project_upload_attempts').deleteMany({ project_id: raceProjId });
  });

  it('10. K1 cannot overwrite K2 after K2 becomes canonical [MongoDB Integration]', async () => {
    const finalProjId = crypto.randomUUID();
    const db = await getMongoDb();
    const k1Key = `users/${userId}/projects/${finalProjId}/source/${crypto.randomUUID()}-k1.mp4`;
    const k2Key = `users/${userId}/projects/${finalProjId}/source/${crypto.randomUUID()}-k2.mp4`;

    const past = new Date(Date.now() - 3600000);
    const future = new Date(Date.now() + 3600000);

    const att1 = await UploadLifecycleService.recordAttempt({
      userId,
      projectId: finalProjId,
      objectKey: k1Key,
      fileName: 'k1.mp4',
      fileSize: 1000,
      contentType: 'video/mp4',
      expiresAt: past,
    });

    await db.collection('projects').insertOne({
      id: finalProjId,
      user_id: userId,
      title: 'Finalized Project',
      source_url: k2Key,
      source_object_key: k2Key,
      pending_upload_key: null,
      video_status: 'uploaded',
      created_at: past,
      updated_at: future, // Project canonical source updated after att1 creation
    });

    await assert.rejects(
      async () => {
        await UploadLifecycleService.confirmAttempt({
          userId,
          projectId: finalProjId,
          attemptId: att1.id,
          objectKey: k1Key,
        });
      },
      (err: any) => {
        return err.statusCode === 409 && err.code === 'STALE_UPLOAD_CONFIRMATION';
      }
    );

    const projectAfter = await db.collection('projects').findOne({ id: finalProjId });
    assert.strictEqual(projectAfter?.source_url, k2Key, 'Canonical source must remain K2');

    await db.collection('projects').deleteOne({ id: finalProjId });
    await db.collection('project_upload_attempts').deleteMany({ project_id: finalProjId });
  });

  it('11. CAS failure does not return false success [Contract & MongoDB Integration]', async () => {
    const db = await getMongoDb();
    const projId = crypto.randomUUID();
    const key = `users/${userId}/projects/${projId}/source/test.mp4`;

    await db.collection('projects').insertOne({
      id: projId,
      user_id: userId,
      title: 'CAS Mismatch Project',
      pending_upload_key: 'different_key.mp4',
      video_status: 'uploading',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const res = await db.collection('projects').findOneAndUpdate(
      {
        id: projId,
        user_id: userId,
        pending_upload_key: key,
        video_status: { $in: ['uploading', 'pending'] },
      },
      {
        $set: { source_url: key, video_status: 'uploaded' },
      }
    );

    assert.strictEqual(res, null, 'Unmatched CAS returns null rather than reporting success');
    await db.collection('projects').deleteOne({ id: projId });
  });

  it('12. Crash after attempt confirmation reconciles safely on retry [MongoDB Integration]', async () => {
    const db = await getMongoDb();
    const crashProjId = crypto.randomUUID();
    const key = `users/${userId}/projects/${crashProjId}/source/${crypto.randomUUID()}-crash.mp4`;

    await db.collection('projects').insertOne({
      id: crashProjId,
      user_id: userId,
      title: 'Crash Project',
      pending_upload_key: key,
      pending_upload_size: 1000,
      pending_upload_mime_type: 'video/mp4',
      pending_upload_expires_at: new Date(Date.now() + 600000),
      video_status: 'uploading',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const attempt = await UploadLifecycleService.recordAttempt({
      userId,
      projectId: crashProjId,
      objectKey: key,
      fileName: 'crash.mp4',
      fileSize: 1000,
      contentType: 'video/mp4',
      expiresAt: new Date(Date.now() + 600000),
    });

    // Step 1 of confirmation completes (Attempt marked confirmed):
    const confRes1 = await UploadLifecycleService.confirmAttempt({
      userId,
      projectId: crashProjId,
      attemptId: attempt.id,
      objectKey: key,
    });
    assert.strictEqual(confRes1.status, 'confirmed');

    // Simulate crash before Step 2 (project update).
    // Now client retries confirmation:
    // confirmAttempt is called again:
    const confRes2 = await UploadLifecycleService.confirmAttempt({
      userId,
      projectId: crashProjId,
      attemptId: attempt.id,
      objectKey: key,
    });
    // Must return 'already_confirmed' idempotently:
    assert.strictEqual(confRes2.status, 'already_confirmed');

    // Step 2 executes:
    const casResult = await db.collection('projects').findOneAndUpdate(
      {
        id: crashProjId,
        user_id: userId,
        pending_upload_key: key,
        video_status: { $in: ['uploading', 'pending'] },
      },
      {
        $set: {
          source_url: key,
          source_object_key: key,
          pending_upload_key: null,
          video_status: 'uploaded',
        },
      },
      { returnDocument: 'after' }
    );

    assert.ok(casResult);
    assert.strictEqual(casResult.source_url, key);
    assert.strictEqual(casResult.video_status, 'uploaded');

    await db.collection('projects').deleteOne({ id: crashProjId });
    await db.collection('project_upload_attempts').deleteMany({ project_id: crashProjId });
  });

  it('13. Historical transcripts.source_url blocks cleanup candidate [MongoDB Integration + Storage Mock]', async () => {
    const db = await getMongoDb();
    const histProjId = crypto.randomUUID();
    const kHist = `users/${userId}/projects/${histProjId}/source/${crypto.randomUUID()}-hist.mp4`;
    const past = new Date(Date.now() - 50 * 3600 * 1000); // 50 hours ago (beyond grace)

    await db.collection('projects').insertOne({
      id: histProjId,
      user_id: userId,
      title: 'Hist Project',
      video_status: 'uploading',
      created_at: past,
      updated_at: past,
    });

    await db.collection('project_upload_attempts').insertOne({
      id: crypto.randomUUID(),
      project_id: histProjId,
      user_id: userId,
      object_key: kHist,
      file_name: 'hist.mp4',
      file_size: 1000,
      content_type: 'video/mp4',
      status: 'superseded',
      expires_at: past,
      created_at: past,
      updated_at: past,
    });
    mockStorage.set(kHist, { size: 1000, contentType: 'video/mp4' });

    // Insert historical transcript referencing kHist
    const transcriptId = crypto.randomUUID();
    await db.collection('transcripts').insertOne({
      id: transcriptId,
      user_id: userId,
      project_id: histProjId,
      source_url: kHist,
      transcript_text: 'historical text',
      created_at: new Date(),
    });

    const discovery = await UploadLifecycleService.discoverCleanupCandidates({
      userId,
      projectId: histProjId,
      gracePeriodMs: 3600 * 1000,
    });

    const candidateKeys = discovery.candidates.map((c) => c.key);
    assert.ok(!candidateKeys.includes(kHist), 'Historical transcript reference must block cleanup');
    assert.ok(discovery.skipped.some((s) => s.reason === 'PERSISTENT_TRANSCRIPT_REFERENCE'));

    await db.collection('transcripts').deleteOne({ id: transcriptId });
    await db.collection('projects').deleteOne({ id: histProjId });
    await db.collection('project_upload_attempts').deleteMany({ project_id: histProjId });
  });

  it('14. Discovered persistent source references in clips and media_assets block cleanup [MongoDB Integration + Storage Mock]', async () => {
    const db = await getMongoDb();
    const clipProjId = crypto.randomUUID();
    const kClip = `users/${userId}/projects/${clipProjId}/source/${crypto.randomUUID()}-clip.mp4`;
    const past = new Date(Date.now() - 50 * 3600 * 1000);

    await db.collection('projects').insertOne({
      id: clipProjId,
      user_id: userId,
      title: 'Clip Ref Project',
      video_status: 'uploading',
      created_at: past,
      updated_at: past,
    });

    await db.collection('project_upload_attempts').insertOne({
      id: crypto.randomUUID(),
      project_id: clipProjId,
      user_id: userId,
      object_key: kClip,
      file_name: 'clip.mp4',
      file_size: 1000,
      content_type: 'video/mp4',
      status: 'superseded',
      expires_at: past,
      created_at: past,
      updated_at: past,
    });
    mockStorage.set(kClip, { size: 1000, contentType: 'video/mp4' });

    // Seed clip referencing kClip
    const clipId = crypto.randomUUID();
    await db.collection('clips').insertOne({
      id: clipId,
      user_id: userId,
      project_id: clipProjId,
      source_storage_path: kClip,
      created_at: new Date(),
    });

    const discovery = await UploadLifecycleService.discoverCleanupCandidates({
      userId,
      projectId: clipProjId,
      gracePeriodMs: 3600 * 1000,
    });

    assert.ok(!discovery.candidates.map((c) => c.key).includes(kClip));
    assert.ok(discovery.skipped.some((s) => s.reason === 'PERSISTENT_CLIP_REFERENCE'));

    await db.collection('clips').deleteOne({ id: clipId });
    await db.collection('projects').deleteOne({ id: clipProjId });
    await db.collection('project_upload_attempts').deleteMany({ project_id: clipProjId });
  });

  it('15. Transient HEAD/storage failure is safely skipped without candidate classification [Storage Mock]', async () => {
    const db = await getMongoDb();
    const transProjId = crypto.randomUUID();
    const kTrans = `users/${userId}/projects/${transProjId}/source/${crypto.randomUUID()}-trans.mp4`;
    const past = new Date(Date.now() - 50 * 3600 * 1000);

    await db.collection('projects').insertOne({
      id: transProjId,
      user_id: userId,
      title: 'Transient Project',
      video_status: 'uploading',
      created_at: past,
      updated_at: past,
    });

    await db.collection('project_upload_attempts').insertOne({
      id: crypto.randomUUID(),
      project_id: transProjId,
      user_id: userId,
      object_key: kTrans,
      file_name: 'trans.mp4',
      file_size: 1000,
      content_type: 'video/mp4',
      status: 'superseded',
      expires_at: past,
      created_at: past,
      updated_at: past,
    });

    // Make mock headObject throw a 500 error simulating S3 network outage
    const currentHead = UploadLifecycleService.headObjectFn;
    UploadLifecycleService.headObjectFn = async (bucket: string, key: string) => {
      if (key === kTrans) {
        throw new AppError('S3 endpoint timeout 500', 500, 'STORAGE_TIMEOUT');
      }
      return currentHead(bucket, key);
    };

    try {
      const discovery = await UploadLifecycleService.discoverCleanupCandidates({
        userId,
        projectId: transProjId,
        gracePeriodMs: 3600 * 1000,
      });

      assert.ok(!discovery.candidates.map((c) => c.key).includes(kTrans), 'Must not classify as candidate on transient failure');
      assert.ok(discovery.skipped.some((s) => s.reason.startsWith('TRANSIENT_STORAGE_ERROR')));
    } finally {
      UploadLifecycleService.headObjectFn = currentHead;
      await db.collection('projects').deleteOne({ id: transProjId });
      await db.collection('project_upload_attempts').deleteMany({ project_id: transProjId });
    }
  });

  it('16. Pagination and repeated discovery are idempotent and do not skip records [MongoDB Integration + Storage Mock]', async () => {
    const db = await getMongoDb();
    const pagProjId = crypto.randomUUID();
    const past = new Date(Date.now() - 50 * 3600 * 1000);

    await db.collection('projects').insertOne({
      id: pagProjId,
      user_id: userId,
      title: 'Pagination Project',
      video_status: 'uploading',
      created_at: past,
      updated_at: past,
    });

    const keys: string[] = [];
    for (let i = 0; i < 5; i++) {
      const k = `users/${userId}/projects/${pagProjId}/source/${crypto.randomUUID()}-p${i}.mp4`;
      keys.push(k);
      await db.collection('project_upload_attempts').insertOne({
        id: crypto.randomUUID(),
        project_id: pagProjId,
        user_id: userId,
        object_key: k,
        file_name: `p${i}.mp4`,
        file_size: 1000,
        content_type: 'video/mp4',
        status: 'superseded',
        expires_at: past,
        created_at: new Date(past.getTime() + i * 1000),
        updated_at: past,
      });
      mockStorage.set(k, { size: 1000, contentType: 'video/mp4' });
    }

    // Run page 1 (limit 3, skip 0)
    const page1 = await UploadLifecycleService.discoverCleanupCandidates({
      userId,
      projectId: pagProjId,
      limit: 3,
      skip: 0,
      gracePeriodMs: 3600 * 1000,
    });
    assert.strictEqual(page1.candidates.length, 3);

    // Run page 2 (limit 3, skip 3)
    const page2 = await UploadLifecycleService.discoverCleanupCandidates({
      userId,
      projectId: pagProjId,
      limit: 3,
      skip: 3,
      gracePeriodMs: 3600 * 1000,
    });
    assert.strictEqual(page2.candidates.length, 2);

    // Discovered keys in page 1 and page 2 must be disjoint and together equal 5
    const combined = [...page1.candidates.map((c) => c.key), ...page2.candidates.map((c) => c.key)];
    assert.strictEqual(combined.length, 5);
    assert.strictEqual(new Set(combined).size, 5);

    // Repeated call is completely idempotent
    const rerun = await UploadLifecycleService.discoverCleanupCandidates({
      userId,
      projectId: pagProjId,
      limit: 3,
      skip: 0,
      gracePeriodMs: 3600 * 1000,
    });
    assert.deepStrictEqual(
      page1.candidates.map((c) => c.key),
      rerun.candidates.map((c) => c.key)
    );

    await db.collection('projects').deleteOne({ id: pagProjId });
    await db.collection('project_upload_attempts').deleteMany({ project_id: pagProjId });
  });
});
