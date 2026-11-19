import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/hooks/useEditorRender.ts', 'utf8').replace(/^import .*;\n/gm, '');
const js = ts.transpileModule(`export function make(d:any){const {useState,useCallback,useRef,useEffect,clipRenderService,setInterval,clearInterval,Date}=d;${source.replace('export function useEditorRender', 'function useEditorRender')} return useEditorRender;}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { make } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const receipt={status:'ok',clipId:'c',jobId:'job',renderVersion:2,editorVersion:4};
function current(overrides={}){return{id:'c',render_version:2,editor_version:4,render_status:'queued',...overrides,latest_job:overrides.latest_job===null?null:{id:'job',clip_id:'c',render_version:2,editor_version:4,status:'queued',...overrides.latest_job}};}
function setup() {
  const state = [], effects = [], events = [], refs = [], intervals = new Map();
  let now = 0, nextInterval = 0;
  const d = {
    useState: initial => { const i = state.length; state.push(initial); return [initial, value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef: current => { const ref={current};refs.push(ref);return ref; }, useCallback: fn => fn, useEffect: effect => effects.push(effect),
    Date: { now: () => now },
    setInterval: fn => { const id = ++nextInterval; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id),
    clipRenderService: {
      closePendingRender:async()=>null,recoverRender:async()=>null,resolveRender:async()=>{},
      renderClip: async () => {events.push('render');return receipt;},
      getClip: async () => current(),
      getPreviewUrl: async () => 'url:c',
    },
  };
  const h = make(d)({ clipId: 'c', onRenderComplete: (...args) => events.push(['complete', ...args]), onRenderError: message => events.push(['error', message]) });
  const cleanups = effects.map(effect => effect());
  return { d, h, state, events, refs, intervals, tick: () => Promise.all([...intervals.values()].map(fn => fn())), advance: ms => { now += ms; }, cleanup: () => cleanups.forEach(fn => fn?.()) };
}
test('same-tick Studio render clicks submit once before state rerenders', async () => {
  const s = setup(); let resolve, calls = 0;
  s.d.clipRenderService.renderClip = () => { calls++; return new Promise(r => resolve = r); };
  const first = s.h.triggerRender(); assert.equal(await s.h.triggerRender(), false);
  resolve(receipt); assert.equal(await first, true); assert.equal(calls, 1); assert.equal(s.intervals.size, 1);
});
test('unmount while render request is pending cannot start a new polling interval', async () => {
  const s = setup(); let resolve;
  s.d.clipRenderService.renderClip = () => new Promise(r => resolve = r);
  const first = s.h.triggerRender(); s.cleanup(); resolve(receipt);
  assert.equal(await first, false); assert.equal(s.intervals.size, 0);
});
test('slow status reads never overlap and late navigation responses do not write state', async () => {
  const s = setup(); let resolve, reads = 0;
  s.d.clipRenderService.getClip = () => { reads++; return new Promise(r => resolve = r); };
  await s.h.triggerRender(); const first = s.tick(); await s.tick(); assert.equal(reads, 1);
  s.cleanup(); const before = [...s.state]; resolve({ id: 'c', render_status: 'ready', output_storage_path: 'out' }); await first;
  assert.deepEqual(s.state, before); assert(!s.events.some(e => Array.isArray(e) && e[0] === 'complete'));
});
test('successful queued reads are bounded too, without declaring a failed encode or retrying', async () => {
  const s = setup(); await s.h.triggerRender(); s.advance(300_000); await s.tick();
  assert.equal(s.intervals.size, 0); assert.equal(s.state[2], 'waiting'); assert.equal(s.events.filter(e => e === 'render').length, 1);
  assert.match(s.state[3], /clip is saved/);
});
test('Studio progress comes from server job data, not simulated polling increments', async () => {
  const s = setup(); s.d.clipRenderService.getClip = async () => current({ render_status: 'rendering', latest_job: { status:'processing',progress: 37, stage: 'encoding' } });
  await s.h.triggerRender(); await s.tick(); await s.tick(); assert.equal(s.state[1], 37); assert.equal(s.state[2], 'encoding');
});
test('ready without output cannot claim render success', async () => {
  const s = setup(); s.d.clipRenderService.getClip = async () => current({ render_status: 'ready', output_storage_path: null,latest_job:{status:'completed'} });
  await s.h.triggerRender(); await s.tick(); assert.equal(s.state[4], null); assert.equal(s.intervals.size, 1);
});
test('verified output reports success but late preview read cannot call back into another clip', async () => {
  const s = setup(); let resolve;
  s.d.clipRenderService.getClip = async () => current({ render_status: 'ready', output_storage_path: 'out',latest_job:{status:'completed'} });
  s.d.clipRenderService.getPreviewUrl = () => new Promise(r => resolve = r);
  await s.h.triggerRender(); const tick = s.tick(); await new Promise(r => setTimeout(r, 0)); s.cleanup(); resolve('url:c'); await tick;
  assert(!s.events.some(e => Array.isArray(e) && e[0] === 'complete'));
});
test('transient status failures are not reported as failed renders', async () => {
  const s = setup(); s.d.clipRenderService.getClip = async () => { throw Error('offline'); };
  await s.h.triggerRender(); await s.tick(); assert.equal(s.state[3], null); assert.equal(s.intervals.size, 1);
});
test('current failed render stops checking and reports its actual error', async () => {
  const s = setup(); s.d.clipRenderService.getClip = async () => current({ render_status: 'failed', render_error_message: 'source unavailable',latest_job:{status:'failed'} });
  await s.h.triggerRender(); await s.tick(); assert.equal(s.intervals.size, 0); assert.equal(s.state[3], 'source unavailable');
});

test('a late export callback cannot submit a new render after Studio unmounts',async()=>{const s=setup();s.cleanup();assert.equal(await s.h.triggerRender(),false);assert(!s.events.includes('render'));});
test('a stale trigger callback cannot render the previous clip after props change',async()=>{const s=setup();s.refs.find(ref=>ref.current==='c').current='other';assert.equal(await s.h.triggerRender(),false);assert(!s.events.includes('render'));});
test('stale ready snapshots and unrelated jobs cannot complete the receipt-bound request',async()=>{
 for(const fresh of [current({render_version:1,render_status:'ready',output_storage_path:'old',latest_job:{status:'completed'}}),current({render_status:'ready',output_storage_path:'other',latest_job:{id:'other',status:'completed'}}),current({render_status:'ready',output_storage_path:'old',latest_job:null}),current({render_status:'ready',output_storage_path:'old',latest_job:{status:'processing'}})]){
  const s=setup();s.d.clipRenderService.getClip=async()=>fresh;await s.h.triggerRender();await s.tick();assert.equal(s.state[4],null);assert.equal(s.intervals.size,1);assert(!s.events.some(e=>Array.isArray(e)&&e[0]==='complete'));
 }
});
test('superseding render or editor revision stops with changed-state explanation rather than success',async()=>{
 for(const fresh of [current({render_version:3}),current({editor_version:5})]){const s=setup();s.d.clipRenderService.getClip=async()=>fresh;await s.h.triggerRender();await s.tick();assert.equal(s.intervals.size,0);assert.equal(s.state[2],'superseded');assert.equal(s.state[4],null);assert.match(s.state[3],/changed after/);}
});
test('a failed matching job reports failure even if the displayed clip has not yet caught up',async()=>{
 const s=setup();s.d.clipRenderService.getClip=async()=>current({latest_job:{status:'failed',error_message:'saved source unavailable'}});await s.h.triggerRender();await s.tick();assert.equal(s.intervals.size,0);assert.equal(s.state[3],'saved source unavailable');assert.equal(s.state[4],null);
});
test('completion waits for a receipt-pinned preview and never claims success after its read fails',async()=>{
 const s=setup();s.d.clipRenderService.getClip=async()=>current({render_status:'ready',output_storage_path:'out',latest_job:{status:'completed'}});let args;
 s.d.clipRenderService.getPreviewUrl=async(...values)=>{args=values;throw Error('temporary read error')};await s.h.triggerRender();await s.tick();assert.deepEqual(args,['c',receipt]);assert.equal(s.state[4],null);assert.equal(s.intervals.size,1);
 s.d.clipRenderService.getPreviewUrl=async()=> 'pinned-preview';await s.tick();assert.equal(s.intervals.size,0);assert.match(s.state[4],/Revision v2/);assert(s.events.some(e=>Array.isArray(e)&&e[0]==='complete'&&e[2]==='pinned-preview'));
});

test('permanent preview-read rejection stops for review rather than claiming a failed encode or waiting five minutes',async()=>{
 const s=setup();s.d.clipRenderService.getClip=async()=>current({render_status:'ready',output_storage_path:'out',latest_job:{status:'completed'}});s.d.clipRenderService.getPreviewUrl=async()=>{throw Object.assign(Error('Clip inputs changed. Reopen the clip.'),{status:409,code:'RENDER_INPUT_CHANGED'})};await s.h.triggerRender();await s.tick();assert.equal(s.intervals.size,0);assert.equal(s.state[2],'review');assert.match(s.state[3],/Reopen/);assert.equal(s.state[4],null);
});

test('mount recovery uses lookup-only service and resumes matching receipt polling without a fresh submit',async()=>{
 const s=setup();let recoveries=0;s.d.clipRenderService.recoverRender=async()=>{recoveries++;return{...receipt,submissionId:'saved'}};await new Promise(r=>setTimeout(r,0));assert.equal(recoveries,1);assert(!s.events.includes('render'));assert.equal(s.intervals.size,1);
 s.d.clipRenderService.getClip=async()=>current({latest_job:{status:'failed',error_message:'previous encode failed'}});let resolved;s.d.clipRenderService.resolveRender=async(...args)=>{resolved=args};await s.tick();assert.deepEqual(resolved,['c','saved']);assert.equal(s.state[3],'previous encode failed');
});
test('reload recovery absence/uncertainty cannot fall through into a fresh submission',async()=>{
 const s=setup();s.d.clipRenderService.recoverRender=async()=>{throw Object.assign(Error('Saved request remains pending'),{code:'RENDER_RECOVERY_PENDING'})};await new Promise(r=>setTimeout(r,0));assert(!s.events.includes('render'));assert.equal(s.intervals.size,0);assert.match(s.state[3],/remains pending/);
});
test('explicit saved-request resolution closes only unqueued work and never starts a fresh render',async()=>{
 const s=setup();await new Promise(r=>setTimeout(r,0));let calls=0;s.d.clipRenderService.closePendingRender=async()=>{calls++;return null};await s.h.resolveSavedRequest();assert.equal(calls,1);assert(!s.events.includes('render'));assert.equal(s.intervals.size,0);assert.equal(s.state[2],'idle');assert.match(s.state[3],/No render was started/);
});
test('explicit resolution of an admitted request resumes read-only receipt recovery instead of cancelling it',async()=>{
 const s=setup();await new Promise(r=>setTimeout(r,0));s.d.clipRenderService.closePendingRender=async()=>receipt;s.d.clipRenderService.recoverRender=async()=>receipt;await s.h.resolveSavedRequest();assert(!s.events.includes('render'));assert.equal(s.intervals.size,1);
});
test('late close response after unmount cannot resume recovery or write completion state',async()=>{
 const s=setup();await new Promise(r=>setTimeout(r,0));let resolve;s.d.clipRenderService.closePendingRender=()=>new Promise(r=>resolve=r);const pending=s.h.resolveSavedRequest();s.cleanup();const before=[...s.state];resolve(receipt);await pending;assert.deepEqual(s.state,before);assert.equal(s.intervals.size,0);
});
