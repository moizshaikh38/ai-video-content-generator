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
