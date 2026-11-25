import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const replicaUri = process.env.VIREO_AUTHORIZED_TEST_REPLICA_URI;
const testDbName = `vireo_stage1_receipt_${process.pid}_${crypto.randomUUID().slice(0, 8)}`;

function isAuthorizedIsolatedTestUri(uri: string | undefined): boolean {
  if (!uri) return false;
  if (process.env.MONGODB_URI && uri === process.env.MONGODB_URI) return false;
  try {
    const parsed = new URL(uri);
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) && uri.includes('replicaSet=');
  } catch {
    return false;
  }
}

test(
  'replaceSuggestedCandidates persists selection_completion_receipt atomically on authorized isolated replicaSet',
  { skip: !isAuthorizedIsolatedTestUri(replicaUri) && 'BLOCKED: VIREO_AUTHORIZED_TEST_REPLICA_URI not set or not an isolated local replicaSet URI' },
  async () => {
    assert.ok(testDbName.startsWith('vireo_stage1_receipt_'), 'Must use isolated ephemeral test DB name');
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = replicaUri!;
    process.env.MONGODB_DB_NAME = testDbName;

    const { getMongoDb, closeMongo } = await import('../db/mongoClient.js');
    const { replaceSuggestedCandidates } = await import('../db/repositories/clipCandidateRepository.js');
    const { withSelectionOutcomeStatus } = await import('../services/coreSelectionStatusService.js');
    const { selectionContextIdentity } = await import('../shared/selectionContextIdentity.js');
    const { selectionSourceReceipt } = await import('../shared/selectionSourceReceipt.js');
    const { transcriptContentIdentity } = await import('../shared/transcriptSourceBinding.js');

    const db = await getMongoDb();
    assert.equal(db.databaseName, testDbName);
    const hello = await db.admin().command({ hello: 1 });
    assert.ok(typeof hello?.setName === 'string' && hello.setName.length > 0, 'Must point to a real replicaSet');

    const userId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const key = `users/${userId}/projects/${projectId}/source/video.mp4`;
    const context = selectionContextIdentity({ clip_preferences: { genre: 'general' }, notes: 'n' });
    const transcript: any = {
      id: crypto.randomUUID(),
      project_id: projectId,
      user_id: userId,
      text: 'hello world',
      segments: [{ start: 0, end: 2, text: 'hello world' }],
      words: [
        { word: 'hello', start: 0, end: 1 },
        { word: 'world', start: 1, end: 2 },
      ],
      source_binding: {
        version: 1,
        source_receipt: { key, size: 100, etag: '"e1"', sha256: 'a'.repeat(64) },
        prepared_audio_sha256: 'b'.repeat(64),
        requests: [{ sha256: 'b'.repeat(64), bytes: 100, status: 'completed' }],
      },
    };
    transcript.source_binding.transcript_content_sha256 = transcriptContentIdentity(transcript);
    const receipt = selectionSourceReceipt(transcript, key);

    try {
      await db.collection('projects').insertOne({
        id: projectId,
        user_id: userId,
        title: 'Fixture',
        source_type: 'upload',
        source_url: key,
        video_status: 'transcribed',
        clip_preferences: { genre: 'general' },
        notes: 'n',
        processing_attempt_id: 'att-1',
        processing_completed_run_token: 'run-1',
      });
      await db.collection('transcripts').insertOne(transcript);

      // 1. Completed empty writes completed_empty receipt atomically
      const emptyPublished = await replaceSuggestedCandidates(userId, projectId, [], receipt, context);
      assert.equal(emptyPublished.length, 0);
      const afterEmpty = await db.collection('projects').findOne({ id: projectId });
      assert.equal(afterEmpty?.selection_completion_receipt?.outcome, 'completed_empty');
      assert.equal(afterEmpty?.selection_completion_receipt?.fence, afterEmpty?.clip_selection_fence);
      const dtoEmpty = await withSelectionOutcomeStatus(db, userId, afterEmpty!);
      assert.deepEqual(dtoEmpty.selection_outcome_status, { state: 'completed_empty', savedCount: 0 });

      // 2. Selected candidates are preserved and deletion after nonempty completion does not become completed_empty
      await db.collection('clip_candidates').insertOne({
        id: crypto.randomUUID(),
        project_id: projectId,
        user_id: userId,
        start_segment_index: 0,
        end_segment_index: 0,
        start_seconds: 0,
        end_seconds: 2,
        duration_seconds: 2,
        title: 'Kept selected',
        status: 'selected',
        metadata: { selection_source_receipt: receipt },
      });
      const withSelected = await replaceSuggestedCandidates(userId, projectId, [], receipt, context);
      assert.equal(withSelected.length, 1);
      const afterNonempty = await db.collection('projects').findOne({ id: projectId });
      assert.equal(afterNonempty?.selection_completion_receipt?.outcome, 'completed');
      assert.equal(afterNonempty?.selection_completion_receipt?.saved_count, 1);
      assert.equal(afterNonempty?.selection_completion_receipt?.suggested_count, 0);

      await db.collection('clip_candidates').deleteMany({ project_id: projectId, user_id: userId });
      const afterDelete = await db.collection('projects').findOne({ id: projectId });
      const dtoAfterDelete = await withSelectionOutcomeStatus(db, userId, afterDelete!);
      assert.deepEqual(dtoAfterDelete.selection_outcome_status, { state: 'completed', savedCount: 1 });

      // 3. Stale context aborts transaction without overwriting prior receipt
      await assert.rejects(
        replaceSuggestedCandidates(userId, projectId, [], receipt, 'stale-context'),
        { code: 'CLIP_SELECTION_CONTEXT_CHANGED' }
      );
      const afterAbort = await db.collection('projects').findOne({ id: projectId });
      assert.equal(afterAbort?.selection_completion_receipt?.fence, afterNonempty?.clip_selection_fence);

      // 4. Transaction failure AFTER candidate insert/delete (missing dispatchOwner job) rolls back BOTH candidates and receipt atomically
      const preFailCandidate = {
        start_segment_index: 0,
        end_segment_index: 0,
        start_seconds: 0,
        end_seconds: 2,
        duration_seconds: 2,
        title: 'Should roll back',
      };
      await assert.rejects(
        replaceSuggestedCandidates(userId, projectId, [preFailCandidate], receipt, context, {
          jobId: 'nonexistent-job',
          workerId: 'worker-1',
          context,
        }),
        { code: 'CLIP_SELECTION_OWNER_CHANGED' }
      );
      const candidatesAfterRollback = await db.collection('clip_candidates').find({ project_id: projectId }).toArray();
      assert.equal(candidatesAfterRollback.length, 0);
      const projectAfterRollback = await db.collection('projects').findOne({ id: projectId });
      assert.equal(projectAfterRollback?.selection_completion_receipt?.fence, afterNonempty?.clip_selection_fence);
    } finally {
      await db.dropDatabase();
      await closeMongo();
    }
  }
);
