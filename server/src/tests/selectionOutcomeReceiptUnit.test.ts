import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripSelectionInternalFields,
  withSelectionOutcomeStatus,
} from '../services/coreSelectionStatusService.js';
import { selectionContextIdentity } from '../shared/selectionContextIdentity.js';
import { selectionSourceReceipt } from '../shared/selectionSourceReceipt.js';
import { transcriptContentIdentity } from '../shared/transcriptSourceBinding.js';

function makeTranscript(key: string) {
  const base: any = {
    id: 'tr-1',
    project_id: 'proj-1',
    user_id: 'user-1',
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
  base.source_binding.transcript_content_sha256 = transcriptContentIdentity(base);
  return base;
}

function makeFakeDb(transcript: any, jobs: any[] = []) {
  return {
    collection(name: string) {
      if (name === 'transcripts') {
        return {
          async findOne() {
            return transcript;
          },
        };
      }
      if (name === 'clip_selection_jobs') {
        return {
          find() {
            return {
              async toArray() {
                return jobs;
              },
            };
          },
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    },
  } as any;
}

test('stripSelectionInternalFields omits server-only selection_completion_receipt from project DTOs', () => {
  const raw = {
    id: 'proj-1',
    user_id: 'user-1',
    selection_completion_receipt: { version: 1, outcome: 'completed_empty', saved_count: 0, fence: 'f1' },
  };
  const stripped = stripSelectionInternalFields(raw);
  assert.equal('selection_completion_receipt' in stripped, false);
  assert.equal(stripped.id, 'proj-1');
});

test('withSelectionOutcomeStatus validates owner, source, context, fence, attempt and transcript receipt', async () => {
  const key = 'users/user-1/projects/proj-1/source/video.mp4';
  const transcript = makeTranscript(key);
  const receipt = selectionSourceReceipt(transcript, key);
  const context = selectionContextIdentity({ clip_preferences: { genre: 'general' }, notes: 'n' });
  const baseProject = {
    id: 'proj-1',
    user_id: 'user-1',
    source_url: key,
    video_status: 'transcribed',
    clip_preferences: { genre: 'general' },
    notes: 'n',
    clip_selection_fence: 'fence-1',
    processing_attempt_id: 'att-1',
    processing_completed_run_token: 'run-1',
    selection_completion_receipt: {
      version: 1,
      outcome: 'completed_empty',
      saved_count: 0,
      suggested_count: 0,
      fence: 'fence-1',
      selection_job_id: null,
      processing_attempt_id: 'att-1',
      processing_run_token: 'run-1',
      context,
      source_receipt: receipt,
      completed_at: new Date(),
    },
  };

  // Valid completed_empty
  const valid = await withSelectionOutcomeStatus(makeFakeDb(transcript), 'user-1', baseProject);
  assert.deepEqual(valid.selection_outcome_status, { state: 'completed_empty', savedCount: 0 });
  assert.equal('selection_completion_receipt' in valid, false);

  // Nonempty completed receipt must never become completed_empty even if candidates are later deleted
  const nonempty = await withSelectionOutcomeStatus(makeFakeDb(transcript), 'user-1', {
    ...baseProject,
    selection_completion_receipt: {
      ...baseProject.selection_completion_receipt,
      outcome: 'completed',
      saved_count: 2,
    },
  });
  assert.deepEqual(nonempty.selection_outcome_status, { state: 'completed', savedCount: 2 });

  // Stale fence -> unknown
  const staleFence = await withSelectionOutcomeStatus(makeFakeDb(transcript), 'user-1', {
    ...baseProject,
    clip_selection_fence: 'fence-newer',
  });
  assert.equal(staleFence.selection_outcome_status.state, 'unknown');

  // Changed settings/context -> review_required
  const staleContext = await withSelectionOutcomeStatus(makeFakeDb(transcript), 'user-1', {
    ...baseProject,
    notes: 'different-notes',
  });
  assert.equal(staleContext.selection_outcome_status.state, 'review_required');
  assert.equal(staleContext.selection_outcome_status.code, 'CLIP_SELECTION_CONTEXT_CHANGED');

  // Changed source_url -> review_required
  const staleSource = await withSelectionOutcomeStatus(makeFakeDb(transcript), 'user-1', {
    ...baseProject,
    source_url: 'users/user-1/projects/proj-1/source/other.mp4',
  });
  assert.equal(staleSource.selection_outcome_status.state, 'review_required');

  // Missing identity -> unknown
  const missingIdentity = await withSelectionOutcomeStatus(makeFakeDb(transcript), 'user-1', {
    ...baseProject,
    processing_attempt_id: null,
    processing_completed_run_token: null,
    selection_completion_receipt: {
      ...baseProject.selection_completion_receipt,
      processing_attempt_id: null,
      processing_run_token: null,
      selection_job_id: null,
    },
  });
  assert.equal(missingIdentity.selection_outcome_status.state, 'unknown');

  // Legacy project without receipt -> unknown
  const legacy = await withSelectionOutcomeStatus(makeFakeDb(transcript), 'user-1', {
    id: 'proj-1',
    user_id: 'user-1',
    video_status: 'transcribed',
  });
  assert.equal(legacy.selection_outcome_status.state, 'unknown');

  // Wrong owner -> unknown
  const wrongOwner = await withSelectionOutcomeStatus(makeFakeDb(transcript), 'user-2', baseProject);
  assert.equal(wrongOwner.selection_outcome_status.state, 'unknown');

  // Bound standalone clip_selection_jobs (sole bound job, no completion receipt yet) -> selection_pending
  const activeStandaloneJob = {
    id: 'job-2',
    user_id: 'user-1',
    project_id: 'proj-1',
    source_url: key,
    source_receipt: receipt,
    context,
    status: 'processing',
  };
  const projectWithoutReceipt = {
    ...baseProject,
    clip_selection_fence: null,
    selection_completion_receipt: null,
  };
  const pendingJobResult = await withSelectionOutcomeStatus(makeFakeDb(transcript, [activeStandaloneJob]), 'user-1', projectWithoutReceipt);
  assert.deepEqual(pendingJobResult.selection_outcome_status, { state: 'selection_pending' });

  // Bound failed standalone job (sole bound job) -> failed
  const failedStandaloneJob = {
    ...activeStandaloneJob,
    status: 'failed',
    result_code: 'CLIP_SELECTION_PROVIDER_FAILED',
  };
  const failedJobResult = await withSelectionOutcomeStatus(makeFakeDb(transcript, [failedStandaloneJob]), 'user-1', projectWithoutReceipt);
  assert.deepEqual(failedJobResult.selection_outcome_status, { state: 'failed', code: 'CLIP_SELECTION_PROVIDER_FAILED' });

  // Newer unbound job must NOT hide the current bound job
  const unboundNewerJob = {
    ...activeStandaloneJob,
    id: 'job-unbound-newer',
    source_url: 'users/user-1/projects/proj-1/source/different.mp4',
    status: 'failed',
  };
  const boundNotHidden = await withSelectionOutcomeStatus(makeFakeDb(transcript, [unboundNewerJob, activeStandaloneJob]), 'user-1', projectWithoutReceipt);
  assert.deepEqual(boundNotHidden.selection_outcome_status, { state: 'selection_pending' });

  // Stale same-context queued job must NOT override a newer completion receipt for the bound completed job
  const completedJob = { ...activeStandaloneJob, id: 'job-completed', status: 'completed' };
  const staleQueuedJob = { ...activeStandaloneJob, id: 'job-stale-queued', status: 'queued' };
  const projectWithCompletedReceipt = {
    ...baseProject,
    selection_completion_receipt: {
      ...baseProject.selection_completion_receipt,
      selection_job_id: 'job-completed',
    },
  };
  const staleNotOverride = await withSelectionOutcomeStatus(
    makeFakeDb(transcript, [staleQueuedJob, completedJob]),
    'user-1',
    projectWithCompletedReceipt
  );
  assert.deepEqual(staleNotOverride.selection_outcome_status, { state: 'completed_empty', savedCount: 0 });

  // Multiple bound jobs (out-of-order / ambiguous without an unambiguous completed receipt) -> unknown
  const multipleAmbiguous = await withSelectionOutcomeStatus(
    makeFakeDb(transcript, [activeStandaloneJob, failedStandaloneJob]),
    'user-1',
    projectWithoutReceipt
  );
  assert.deepEqual(multipleAmbiguous.selection_outcome_status, { state: 'unknown' });

  // Unbound standalone job alone must be ignored -> falls back to valid completion receipt
  const unboundResult = await withSelectionOutcomeStatus(makeFakeDb(transcript, [unboundNewerJob]), 'user-1', baseProject);
  assert.deepEqual(unboundResult.selection_outcome_status, { state: 'completed_empty', savedCount: 0 });
});

test('confirmProjectUpload idempotent branch strips selection_completion_receipt', async () => {
  const fs = await import('node:fs');
  const controllerSrc = fs.readFileSync(new URL('../controllers/projectController.ts', import.meta.url), 'utf8');
  const idempotentSlice = controllerSrc.slice(
    controllerSrc.indexOf("if (project.video_status === 'uploaded'"),
    controllerSrc.indexOf('if (!project.pending_upload_key')
  );
  assert.match(idempotentSlice, /stripSelectionInternalFields\(project\)/);
});
