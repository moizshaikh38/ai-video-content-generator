import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/clipRenderReadiness.ts', 'utf8');
const load = async (code) => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
const { waitForClipReady } = await load(source);
const ready = { id: 'clip1', render_status: 'ready', output_storage_path: 'out.mp4' };
const queued = { ...ready, render_status: 'queued', output_storage_path: null };

test('waits through queued, rendering and uploading before returning an output', async () => {
  const states = ['queued', 'rendering', 'uploading', 'ready'];
  const seen = [];
  const result = await waitForClipReady('clip1', { intervalMs: 1, timeoutMs: 100, readClip: async () => ({ ...ready, render_status: states.shift() }), onProgress: c => seen.push(c.render_status) });
  assert.equal(result.output_storage_path, 'out.mp4');
  assert.deepEqual(seen, ['queued', 'rendering', 'uploading', 'ready']);
});
test('ready without an output is not downloadable', async () => {
  await assert.rejects(waitForClipReady('clip1', { intervalMs: 1, timeoutMs: 12, readClip: async () => ({ ...ready, output_storage_path: null }) }), { code: 'RENDER_WAIT_TIMEOUT' });
});
test('stalled request is bounded and receives abort', async () => {
  let signal;
  await assert.rejects(waitForClipReady('clip1', { timeoutMs: 12, readClip: async (_id, s) => { signal = s; return new Promise(() => {}); } }), { code: 'RENDER_WAIT_TIMEOUT' });
  assert.equal(signal.aborted, true);
});
test('failed and draft clips stop without another render', async () => {
  for (const [status, code] of [['failed', 'RENDER_FAILED'], ['draft', 'RENDER_NOT_STARTED']]) {
    await assert.rejects(waitForClipReady('clip1', { readClip: async () => ({ ...queued, render_status: status }) }), { code });
  }
});
test('wrong clip response cannot satisfy the wait', async () => {
  await assert.rejects(waitForClipReady('clip1', { readClip: async () => ({ ...ready, id: 'other' }) }), /did not match/);
});
test('unmount cancellation stops reads and sleep', async () => {
  const controller = new AbortController(); let reads = 0;
  const pending = waitForClipReady('clip1', { signal: controller.signal, readClip: async () => { reads++; controller.abort(); return queued; } });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(reads, 1);
  await assert.rejects(waitForClipReady('clip1', { signal: controller.signal, readClip: async () => { throw new Error('Must not read'); } }), { name: 'AbortError' });
});
test('cancellation before the read microtask does not start a request', async () => {
  const controller = new AbortController(); let reads = 0;
  const pending = waitForClipReady('clip1', { signal: controller.signal, readClip: async () => { reads++; return ready; } });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(reads, 0);
});
test('request errors propagate without retries or new work', async () => {
  let reads = 0;
  await assert.rejects(waitForClipReady('clip1', { readClip: async () => { reads++; throw new Error('Sign in again.'); } }), /Sign in again/);
  assert.equal(reads, 1);
});

// Exercise the actual handler bodies with fake services, not a React/UI or backend test.
const home = fs.readFileSync('src/components/dashboard/HomeClippingWorkflow.tsx', 'utf8');
const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const bodies = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['handleExportClip', 'handleBatchExport', 'handleEditClip'].includes(node.name.text)) bodies[node.name.text] = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(bodies.handleExportClip && bodies.handleBatchExport);
const names = ['setCreationRecoveryTarget', 'activeProjectId', 'exportRequestRef', 'candidateExportsRef', 'setIsExportingClipId', 'setExportStatusMessage', 'aspectRatio', 'captionsEnabled', 'clipPreferences', 'clipRenderService', 'waitForClipReady', 'triggerBrowserDownload', 'setErrorMessage', 'setWorkflowState', 'setTimeout', 'navigate'];
const factory = await load(`export function make(deps:any) { const {${names.join(',')}}=deps; return ${bodies.handleExportClip}; }`);
const editFactory = await load(`export function make(deps:any) { const {${names.join(',')}}=deps; return ${bodies.handleEditClip}; }`);
const batchFactory = await load(`export function make(deps:any) { const {selectedClipIds,candidates,handleExportClip}=deps; return ${bodies.handleBatchExport}; }`);
function setup() {
  const events = []; let creates = 0; let state = 'queued';
  const deps = {
    setCreationRecoveryTarget:()=>{}, navigate: url => events.push('navigate:' + url), activeProjectId: 'project1', exportRequestRef: { current: null }, candidateExportsRef: { current: new Map() },
    setIsExportingClipId: () => {}, setExportStatusMessage: () => {}, aspectRatio: '9:16', captionsEnabled: true, clipPreferences: { captionStyle: 'simple' },
    clipRenderService: {
      createClipFromCandidate: async () => { events.push('create'); creates++; return { clip: queued }; },
      getClip: async () => { events.push('read:' + state); return state === 'ready' ? ready : queued; },
      getDownloadUrl: async () => { events.push('download-url'); return { signedUrl: 'test-download', filename: 'clip.mp4' }; },
    },
    waitForClipReady: (id, options) => waitForClipReady(id, { ...options, intervalMs: 1, timeoutMs: 15 }),
    triggerBrowserDownload: async () => { events.push('browser-download'); }, setErrorMessage: () => events.push('error'), setWorkflowState: () => {}, setTimeout: () => {},
  };
  return { deps, events, get creates() { return creates; }, setState(s) { state = s; } };
}
test('actual Home handler waits, then asks for URL and downloads', async () => {
  const s = setup(); s.setState('ready');
  assert.equal(await factory.make(s.deps)('candidate1', true), true);
  assert.deepEqual(s.events, ['create', 'read:ready', 'download-url', 'browser-download']);
});
test('actual Home handler timeout then Export reuses the same queued render', async () => {
  const s = setup(); const handler = factory.make(s.deps);
  assert.equal(await handler('candidate1', true), false);
  assert.equal(s.events.includes('download-url'), false);
  s.setState('ready');
  assert.equal(await handler('candidate1', true), true);
  assert.equal(s.creates, 1);
});
test('actual Home handler ignores concurrent Export before another create', async () => {
  const s = setup(); const handler = factory.make(s.deps);
  const first = handler('candidate1', true);
  assert.equal(await handler('candidate2', true), false);
  await first;
  assert.equal(s.creates, 1);
});
test('actual Home existing rendered clip never queues a new render', async () => {
  const s = setup(); s.setState('ready');
  assert.equal(await factory.make(s.deps)('clip1', false), true);
  assert.equal(s.creates, 0);
});
test('actual Home changed generation settings do not reuse an old configuration', async () => {
  const s = setup(); s.setState('ready');
  assert.equal(await factory.make(s.deps)('candidate1', true), true);
  s.deps.aspectRatio = '1:1';
  assert.equal(await factory.make(s.deps)('candidate1', true), true);
  assert.equal(s.creates, 2);
});
test('actual Home download failure retries URL without a second render', async () => {
  const s = setup(); s.setState('ready'); const handler = factory.make(s.deps);
  const original = s.deps.clipRenderService.getDownloadUrl;
  s.deps.clipRenderService.getDownloadUrl = async () => { throw new Error('Network error'); };
  assert.equal(await handler('candidate1', true), false);
  s.deps.clipRenderService.getDownloadUrl = original;
  assert.equal(await handler('candidate1', true), true);
  assert.equal(s.creates, 1);
});
test('actual Home navigation cancellation prevents URL and browser download', async () => {
  const s = setup();
  s.deps.clipRenderService.getClip = async () => { s.deps.exportRequestRef.current.abort(); return queued; };
  assert.equal(await factory.make(s.deps)('candidate1', true), false);
  assert.equal(s.events.includes('download-url'), false);
  assert.equal(s.events.includes('browser-download'), false);
});
test('actual Home batch stops after failed export instead of starting more renders', async () => {
  const seen = [];
  await batchFactory.make({ selectedClipIds: new Set(['a','b']), candidates: [{ id:'a' }, { id:'b' }], handleExportClip: async id => { seen.push(id); return false; } })();
  assert.deepEqual(seen, ['a']);
});

test('same-tick Edit clicks create one candidate clip and open one editor', async()=>{const s=setup();let resolve;s.deps.clipRenderService.createClipFromCandidate=()=>{s.events.push('create');return new Promise(r=>resolve=r)};const edit=editFactory.make(s.deps);const first=edit('candidate1',true);await edit('candidate1',true);resolve({clip:queued});await first;assert.deepEqual(s.events,['create','navigate:/clips/clip1/edit']);});
test('Edit reuses an already-created Export clip with matching settings', async()=>{const s=setup();s.setState('ready');await factory.make(s.deps)('candidate1',true);await editFactory.make(s.deps)('candidate1',true);assert.equal(s.creates,1);assert(s.events.includes('navigate:/clips/clip1/edit'));});
test('Export after Edit reuses the same saved candidate clip', async()=>{const s=setup();s.setState('ready');await editFactory.make(s.deps)('candidate1',true);await factory.make(s.deps)('candidate1',true);assert.equal(s.creates,1);assert(s.events.includes('browser-download'));});
test('Edit completion after leaving review cannot navigate back into the old clip', async()=>{const s=setup();let resolve;s.deps.clipRenderService.createClipFromCandidate=()=>new Promise(r=>resolve=r);const pending=editFactory.make(s.deps)('candidate1',true);s.deps.exportRequestRef.current.abort();resolve({clip:queued});await pending;assert(!s.events.some(e=>e.startsWith('navigate:')));});
test('Export cannot queue a second clip while Edit creation is outstanding', async()=>{const s=setup();let resolve,calls=0;s.deps.clipRenderService.createClipFromCandidate=()=>{calls++;return new Promise(r=>resolve=r)};const pending=editFactory.make(s.deps)('candidate1',true);assert.equal(await factory.make(s.deps)('candidate1',true),false);resolve({clip:queued});await pending;assert.equal(calls,1);});
