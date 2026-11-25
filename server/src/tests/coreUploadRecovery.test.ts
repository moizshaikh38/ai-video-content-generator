import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const workflow = fs.readFileSync(new URL('../../../src/components/dashboard/HomeClippingWorkflow.tsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../../../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
// Source guards complement the real local browser/API upload + repeated-retry proof.
// They do not stand in for production auth, storage, transcription or selection.
test('confirmed upload becomes a reusable project before starting processing', () => {
  const confirmed = workflow.indexOf('setUploadProgress(100)');
  const processing = workflow.indexOf('await projectService.startProcessing(projectId)', confirmed);
  const code = workflow.slice(confirmed, processing);
  assert.match(code, /setSelectedSource\(\{ \.\.\.selectedSource, type: 'project', projectId, file: undefined \}\)/);
  assert.match(code, /setActiveProjectStatus\('uploaded'\)/);
  assert.match(code, /onRefreshProjects\(\)/);
});
test('URL source also becomes a reusable project before processing', () => {
  const branch = workflow.indexOf("else if (selectedSource.type === 'url'");
  const processing = workflow.indexOf('await projectService.startProcessing(projectId)', branch);
  assert.match(workflow.slice(branch, processing), /setSelectedSource\(\{ \.\.\.selectedSource, type: 'project', projectId \}\)/);
});
test('reload restores uploaded source as project, without invalid upload source type', () => {
  const recovery = workflow.slice(workflow.indexOf('// Fetch project and restore state'), workflow.indexOf('// Local storage parse error ignored'));
  assert.match(recovery, /type: 'project'/);
  assert.doesNotMatch(recovery, /type: \(proj\.source_type as any\)/);
  assert.match(recovery, /else if \(status === 'uploaded'\)/);
  assert.match(recovery, /setWorkflowState\('source_selected'\)/);
  assert.match(recovery, /The previous upload did not finish/);
});
test('direct-upload fallback is restricted to unresolved URL source errors', () => {
  assert.match(workflow, /selectedSource\?\.type === 'url' && <div/);
  assert.match(workflow, /Your source upload is saved\. Retry processing without uploading the video again\./);
});
test('uploaded source does not pretend to be actively queued or processing', () => {
  const active = dashboard.slice(dashboard.indexOf('const activeStatuses'), dashboard.indexOf('const completeStatuses'));
  assert.doesNotMatch(active, /'uploaded'/);
  assert.match(dashboard, /Source saved\. Processing has not started\./);
});

test('provider setup errors use creator-facing copy without exposing environment instructions', async () => {
  const { clippingStartErrorMessage } = await import('../../../src/lib/clippingRecovery.ts');
  const message = clippingStartErrorMessage({ code: 'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED', message: 'Set GROQ_API_KEY in server environment.' });
  assert.match(message, /Video processing is temporarily unavailable/);
  assert.doesNotMatch(message, /GROQ|API_KEY|environment|provider/);
  assert.equal(clippingStartErrorMessage({ name: 'AbortError' }), 'Upload was cancelled.');
  assert.equal(clippingStartErrorMessage({ message: 'The source file is too large.' }), 'The source file is too large.');
});

test('failed transfer retry reuses the existing project rather than consuming another project slot', () => {
  assert.match(workflow, /projectId = selectedSource\.projectId \|\| crypto\.randomUUID\(\)/);
  assert.match(workflow, /if \(!selectedSource\.projectId\) \{\s*await projectService\.createProjectAsync/);
  assert.match(workflow, /setSelectedSource\(\{ \.\.\.selectedSource, projectId \}\)/);
});

test('late metadata merges only into the current file selection and preserves its project ID', () => {
  assert.match(workflow, /setSelectedSource\(\(current\) => current\?\.type === 'file' && current\.file === file\s*\? \{ \.\.\.current, duration \}\s*: current\)/);
  assert.doesNotMatch(workflow, /source\.duration = tempVideo\.duration;\s*setSelectedSource\(\{ \.\.\.source \}\)/);
});

test('empty analysis review uses truthful outcome resolution instead of silently inviting another paid run', async () => {
  const empty = workflow.slice(workflow.indexOf('} else if (!hasResults && forceShowReview)'), workflow.indexOf('} catch {', workflow.indexOf('} else if (!hasResults && forceShowReview)')));
  assert.match(empty, /resolveEmptySelectionOutcome\(projectData\)/);
  assert.doesNotMatch(empty, /setWorkflowState\('source_selected'\)/);
  const { resolveEmptySelectionOutcome, COMPLETED_EMPTY_SELECTION_MESSAGE, UNKNOWN_EMPTY_SELECTION_MESSAGE } = await import('../../../src/lib/clippingRecovery.ts');
  assert.deepEqual(resolveEmptySelectionOutcome({ video_status: 'transcribed', selection_outcome_status: { state: 'completed_empty', savedCount: 0 } }), {
    workflowState: 'error',
    message: COMPLETED_EMPTY_SELECTION_MESSAGE,
  });
  assert.deepEqual(resolveEmptySelectionOutcome({ video_status: 'transcribed' }), {
    workflowState: 'error',
    message: UNKNOWN_EMPTY_SELECTION_MESSAGE,
  });
  assert.equal(resolveEmptySelectionOutcome({ video_status: 'transcribing', selection_outcome_status: { state: 'source_processing' } }).workflowState, 'processing');
  assert.equal(resolveEmptySelectionOutcome({ selection_outcome_status: { state: 'selection_pending', code: 'OUTBOX_PENDING' } }).message, 'Saved request is queued for clip selection...');
});

test('read-only recovery polling never calls handlePostProcessingReady or analyzeClips while explicit Generate remains enabled', () => {
  assert.match(workflow, /readOnlyProcessingRecoveryRef\.current = true;\s*setWorkflowState\('processing'\)/);
  assert.match(workflow, /const handleGenerateClips[\s\S]*readOnlyProcessingRecoveryRef\.current = false;/);
  const pollSlice = workflow.slice(
    workflow.indexOf('// 3. Polling Loop while in \'processing\' state'),
    workflow.indexOf('handlePostProcessingReady(activeProjectId);', workflow.indexOf('// 3. Polling Loop while in \'processing\' state')) + 60
  );
  assert.match(pollSlice, /outcome\?\.state === 'selection_pending'/);
  assert.match(pollSlice, /if \(readOnlyProcessingRecoveryRef\.current && \['completed', 'transcribed'\]\.includes\(status\)\)/);
  assert.match(pollSlice, /await loadResults\(activeProjectId, true, proj\)/);
});

test('transcription-only project is not counted as a completed clipping job', () => {
  const complete = dashboard.slice(dashboard.indexOf('const completeStatuses'), dashboard.indexOf('const failedStatuses'));
  assert.doesNotMatch(complete, /'transcribed'/);
  assert.match(dashboard, /Transcript ready\. Clip selection and export are separate steps\./);
});
