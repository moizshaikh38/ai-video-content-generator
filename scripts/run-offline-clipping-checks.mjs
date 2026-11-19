import { spawnSync } from 'node:child_process';

// Explicit allowlist: these tests extract source with TypeScript and supply fake
// services. Do not glob the test directory: other tests start applications,
// connect databases/providers, run browsers, or encode media.
const tests = [
  'clip-speech-cut-contract',
  'clip-render-readiness',
  'clip-workspace-recovery',
  'workspace-search-recovery',
  'workspace-preview-recovery',
  'home-result-recovery',
  'home-restore-recovery',
  'home-generation-recovery',
  'history-read-recovery',
  'history-preview-recovery',
  'clip-service-read-contract',
  'render-service-read-contract',
  'render-worker-read-contract',
  'render-prelease-outcome-contract',
  'render-queue-recovery-contract',
  'render-admission-contract',
  'render-submission-contract',
  'candidate-creation-contract',
  'candidate-creation-client',
  'candidate-creation-ui-contract',
  'candidate-editor-baseline-contract',
  'render-submission-close-contract',
  'render-submission-recovery-client',
  'render-plan-preflight-contract',
  'render-receipt-client-contract',
  'render-preview-receipt-contract',
  'render-freshness-guard-contract',
  'publish-owner-readiness-contract',
  'youtube-upload-stream-contract',
  'selection-source-read-contract',
  'render-controller-queue-contract',
  'editor-render-queue-contract',
  'editor-render-recovery',
  'editor-load-recovery',
  'editor-autosave-recovery',
  'editor-caption-save-contract',
  'editor-caption-text-contract',
  'clip-count-preference-contract',
  'hook-display-mode-contract',
].map(name => `scripts/${name}.test.mjs`);

// Run one test process at a time. The 192 MiB V8 heap cap is not a total-RSS
// guarantee and is not a substitute for resource monitoring on runtime work.
const result = spawnSync(process.execPath, [
  '--max-old-space-size=192', '--test', '--test-concurrency=1', ...tests,
], { stdio: 'inherit', cwd: new URL('../', import.meta.url), timeout: 30_000 });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
