import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const transpile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const moduleFrom = source => import('data:text/javascript;base64,'+Buffer.from(transpile(source)).toString('base64'));
const saveState = await moduleFrom(fs.readFileSync('src/lib/editorSaveState.ts','utf8'));
const limitsText=fs.readFileSync('src/types/index.ts','utf8'),li=limitsText.indexOf('export const EDITOR_RESOURCE_LIMITS'),limitsBlock=limitsText.slice(li,limitsText.indexOf(';',li)+1);
const memStorage=()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))},removeItem:k=>{m.delete(k)},key:i=>[...m.keys()][i]??null,get length(){return m.size}}};
const authBundle=await moduleFrom(`const supabase={auth:{getSession:async()=>({data:{session:{access_token:'harness-token',user:{id:'owner'}}}}),refreshSession:async()=>({error:null,data:{session:null}})}};\n`+fs.readFileSync('src/lib/authOwner.ts','utf8')+'\n'+fs.readFileSync('src/lib/boundAuth.ts','utf8').replace(/^import .*;\n/gm,''));
const saveCoordinator=await moduleFrom(fs.readFileSync('src/lib/editorSaveCoordinator.ts','utf8'));
const journal=await moduleFrom(`const useSyncExternalStore=(sub:any,get:any)=>get();const window={localStorage:${memStorage}};${limitsBlock.replace('export const','const')}\n`+fs.readFileSync('src/lib/editorJournal.ts','utf8').replace(/^import .*;\n/gm,''));
const source=fs.readFileSync('src/hooks/useEditorAutosave.ts','utf8').replace(/^import .*;\n/gm,'').replace('export function useEditorAutosave','function useEditorAutosave');
const {make}=await moduleFrom(`export function make(d:any){const {useState,useRef,useCallback,useEffect,useLayoutEffect,proEditorService,clipRenderService,buildClipEditorUpdatePayload,acknowledgeEditorVersion,editorSaveStillDirty,setTimeout,clearTimeout,journalWrite,journalClear,journalMarkProjectAcked,newJournalSession,window,document,tokenForOwner,AccountChangedError,getCurrentAuthOwner,ownerMismatch,beginDrain,endDrain}=d;${source};return useEditorAutosave;}`);
const project=id=>({id,clip_id:'clip:'+id,user_id:'owner',version:1,title:id,canvas:{},tracks:[],settings:{},playhead:0});
function setup(over={}){
  let cursor=0,nextTimer=0;const slots=[],pendingEffects=[],timers=new Map(),events=[];
  authBundle.setCurrentAuthOwner('owner');
  const d={...saveState,...journal,...authBundle,...saveCoordinator,window:{addEventListener:()=>{},removeEventListener:()=>{}},document:{addEventListener:()=>{},removeEventListener:()=>{},visibilityState:'visible'},
    useState:initial=>{const index=cursor++;slots[index]??={value:initial};return[slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value}];},
    useRef:initial=>{const index=cursor++;slots[index]??={current:initial};return slots[index];},
    useCallback:fn=>fn,
    useEffect:(effect,deps)=>{const index=cursor++,old=slots[index];if(!old||deps.some((dep,i)=>dep!==old.deps[i])){pendingEffects.push(()=>{old?.cleanup?.();slots[index]={deps,cleanup:effect()}})}},
    useLayoutEffect:(effect,deps)=>{const index=cursor++,old=slots[index];if(!old||deps.some((dep,i)=>dep!==old.deps[i])){pendingEffects.push(()=>{old?.cleanup?.();slots[index]={deps,cleanup:effect()}})}},
    setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),
    buildClipEditorUpdatePayload:()=>({}),
    proEditorService:{updateEditorProject:async(id,payload)=>{events.push(['pro',id]);return{...project(id),version:payload.version+1}}},
    clipRenderService:{updateClipEditor:async id=>{events.push(['quick',id]);return{id}}},
  };
  Object.assign(d,over);const hook=make(d);
  function render(id='a',version){cursor=0;const h=hook(id?{...project(id),...(version===undefined?{}:{version})}:null,id?{id:'clip:'+id}:null,{onSaved:()=>events.push(['saved']),onProjectVersionAck:()=>events.push(['ack'])});while(pendingEffects.length)pendingEffects.shift()();return h;}
  return{d,events,timers,render,flushTimers:async()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());await new Promise(r=>setTimeout(r,0));}};
}
test('pending autosave for a departed project cannot save the newly opened clean project',async()=>{const s=setup();s.render('a').markDirty();s.render('b');await s.flushTimers();assert.deepEqual(s.events,[]);});
test('explicit save returns true only after both project and clip synchronization',async()=>{const s=setup();assert.equal(await s.render().saveNow(),true);assert.deepEqual(s.events,[['pro','a'],['ack'],['quick','clip:a'],['saved']]);});
test('Quick sync failure is not a Saved receipt and does not automatically retry',async()=>{const s=setup();s.d.clipRenderService.updateClipEditor=async()=>{throw Error('sync failed')};assert.equal(await s.render().saveNow(),false);await s.flushTimers();assert(!s.events.some(e=>e[0]==='saved'));assert.equal(s.events.filter(e=>e[0]==='pro').length,1);});
test('navigation while Pro save is pending does not sync the old clip or acknowledge it into the new editor',async()=>{const s=setup();let resolve;s.d.proEditorService.updateEditorProject=()=>new Promise(r=>resolve=r);const pending=s.render('a').saveNow();await new Promise(r=>setTimeout(r));s.render('b');resolve({...project('a'),version:2});assert.equal(await pending,false);assert.deepEqual(s.events,[]);});
test('a wrong-project save response cannot be used to sync a Quick clip',async()=>{const s=setup();s.d.proEditorService.updateEditorProject=async()=>({...project('other'),version:2});assert.equal(await s.render('a').saveNow(),false);assert(!s.events.some(e=>e[0]==='quick'));});
test('a wrong-clip sync response cannot be reported as Saved',async()=>{const s=setup();s.d.clipRenderService.updateClipEditor=async()=>({id:'wrong'});assert.equal(await s.render('a').saveNow(),false);assert(!s.events.some(e=>e[0]==='saved'));});

test('returning to the same clip after navigation cannot accept an earlier visit save response',async()=>{const s=setup();let resolve;s.d.proEditorService.updateEditorProject=()=>new Promise(r=>resolve=r);const pending=s.render('a').saveNow();await new Promise(r=>setTimeout(r));s.render('b');s.render('a');resolve({...project('a'),version:2});assert.equal(await pending,false);assert.deepEqual(s.events,[]);});
test('an initial caption-coverage repair timer survives loading the first document',async()=>{const s=setup();s.render(null).markDirty();s.render('a');await s.flushTimers();assert(s.events.some(e=>e[0]==='saved'));});
test('navigation through a loading state cancels only the departed project timer',async()=>{const s=setup();s.render('a').markDirty();s.render(null);s.render('b');await s.flushTimers();assert.deepEqual(s.events,[]);});

const conflictError=()=>Object.assign(new Error('This editor project changed elsewhere. Your local edits are kept. Reload or reconcile before saving again.'),{code:'EDITOR_REVISION_CONFLICT',status:409});
test('a server revision conflict is reported as a conflict, a transient failure is not, and neither retries automatically',async()=>{
  const c=setup();c.d.proEditorService.updateEditorProject=async()=>{c.events.push(['pro','a']);throw conflictError()};
  assert.equal(await c.render().saveNow(),false);let h=c.render();
  assert.equal(h.saveStatus,'error');assert.equal(h.saveConflict,true);assert.match(h.saveError,/changed elsewhere/);
  await c.flushTimers();assert.equal(c.events.filter(e=>e[0]==='pro').length,1);assert(!c.events.some(e=>e[0]==='saved'));
  const t=setup();t.d.proEditorService.updateEditorProject=async()=>{t.events.push(['pro','a']);throw Object.assign(new Error('Request failed (503).'),{status:503})};
  assert.equal(await t.render().saveNow(),false);h=t.render();assert.equal(h.saveStatus,'error');assert.equal(h.saveConflict,false);
  const other=setup();other.d.proEditorService.updateEditorProject=async()=>{throw Object.assign(new Error('x'),{status:409,code:'SOMETHING_ELSE'})};
  assert.equal(await other.render().saveNow(),false);assert.equal(other.render().saveConflict,false);
});
test('retrying in a conflict keeps the conflict and never claims Saved',async()=>{
  const c=setup();c.d.proEditorService.updateEditorProject=async()=>{c.events.push(['pro','a']);throw conflictError()};
  await c.render().saveNow();assert.equal(await c.render().saveNow(),false);assert.equal(await c.render().saveNow(),false);
  const h=c.render();assert.equal(h.saveStatus,'error');assert.equal(h.saveConflict,true);assert(!c.events.some(e=>e[0]==='saved'));assert.equal(c.events.filter(e=>e[0]==='pro').length,3);
});
test('a higher rendered revision alone does not clear a conflict; only the loader acknowledging a newer loaded revision does, and it writes nothing',async()=>{
  const c=setup();c.d.proEditorService.updateEditorProject=async()=>{c.events.push(['pro','a']);throw conflictError()};
  await c.render().saveNow();c.render();let h=c.render('a',5);h=c.render('a',5);assert.equal(h.saveConflict,true);assert.equal(h.saveStatus,'error');
  const writes=c.events.filter(e=>e[0]==='pro').length;
  h.acknowledgeExternalLoad(1);h=c.render('a',5);assert.equal(h.saveConflict,true,'a load that is not newer than the conflicting revision is ignored');
  h.acknowledgeExternalLoad(2);h=c.render('a',2);assert.equal(h.saveConflict,false);assert.equal(h.saveStatus,'saved');assert.equal(h.saveError,null);
  await c.flushTimers();assert.equal(c.events.filter(e=>e[0]==='pro').length,writes);assert(!c.events.some(e=>e[0]==='saved'));
});
test('an edit made after the loaded revision is acknowledged is dirty and saves; acknowledging with no conflict is a no-op',async()=>{
  const c=setup();let fail=true;c.d.proEditorService.updateEditorProject=async(id,payload)=>{c.events.push(['pro',id,payload.version]);if(fail)throw conflictError();return{...project(id),version:payload.version+1}};
  let h=c.render();h.markDirty();h=c.render();h.acknowledgeExternalLoad(9);h=c.render();assert.equal(h.saveStatus,'dirty','no conflict open: acknowledge does nothing');
  await c.flushTimers();h=c.render();assert.equal(h.saveConflict,true);
  h.acknowledgeExternalLoad(2);fail=false;h=c.render('a',2);assert.equal(h.saveStatus,'saved');
  h.markDirty();h=c.render('a',2);assert.equal(h.saveStatus,'dirty');await c.flushTimers();const last=c.events.filter(e=>e[0]==='pro').pop();assert.equal(last[2],2,'the new edit saves against the loaded revision');h=c.render('a',3);assert.equal(h.saveStatus,'saved');
});
test('a newer revision does not hide a transient (non-conflict) failure',async()=>{
  const t=setup();t.d.proEditorService.updateEditorProject=async()=>{throw Object.assign(new Error('Request failed (503).'),{status:503})};
  await t.render().saveNow();t.render();let h=t.render('a',2);h.acknowledgeExternalLoad(2);h=t.render('a',2);assert.equal(h.saveStatus,'error');assert.equal(h.saveConflict,false);
});
test('an accepted reload fences a save that was already in flight: a late conflict or a late success cannot reinstate stale state',async()=>{
  for(const outcome of ['reject','resolve']){
    const c=setup();let calls=0,release;
    c.d.proEditorService.updateEditorProject=(id,payload)=>{calls++;c.events.push(['pro',id,payload.version]);if(calls===1)throw conflictError();return new Promise((res,rej)=>{release=()=>outcome==='reject'?rej(conflictError()):res({...project(id),version:payload.version+1})})};
    await c.render().saveNow();let h=c.render();assert.equal(h.saveConflict,true);
    h.markDirty();h=c.render();await c.flushTimers();assert.equal(calls,2,'edit in conflict issues one new request (left pending)');
    h.acknowledgeExternalLoad(2);h=c.render('a',2);assert.equal(h.saveStatus,'saved');
    release();await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));h=c.render('a',2);
    assert.equal(h.saveConflict,false,outcome+': late result must not reinstate the conflict');assert.equal(h.saveStatus,'saved',outcome);assert(!c.events.some(e=>e[0]==='saved'||e[0]==='ack'),outcome+': late result must not acknowledge the old project');
  }
});
test('an edit made after an accepted reload, while the older request is still pending, is not lost',async()=>{
  const c=setup();let calls=0,release;
  c.d.proEditorService.updateEditorProject=(id,payload)=>{calls++;c.events.push(['pro',id,payload.version]);if(calls===1)throw conflictError();if(calls===2)return new Promise((res,rej)=>{release=()=>rej(conflictError())});return Promise.resolve({...project(id),version:payload.version+1})};
  await c.render().saveNow();let h=c.render();h.markDirty();h=c.render();await c.flushTimers();assert.equal(calls,2);
  h.acknowledgeExternalLoad(2);h=c.render('a',2);h.markDirty();h=c.render('a',2);await c.flushTimers();assert.equal(h.saveStatus,'dirty');
  release();for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,0));await c.flushTimers()}
  assert.equal(calls,3,'the new edit saves after the fenced request settles');assert.equal(c.events.filter(e=>e[0]==='pro').pop()[2],2);
  h=c.render('a',3);assert.equal(h.saveStatus,'saved');assert.equal(h.saveConflict,false);
});
test('a conflict is dropped on project switch and a later acknowledge cannot force Saved over unrelated dirty edits',async()=>{
  const c=setup();c.d.proEditorService.updateEditorProject=async(id)=>{c.events.push(['pro',id]);throw conflictError()};
  await c.render('a').saveNow();c.render('a');let h=c.render('b');h=c.render('b');assert.equal(h.saveConflict,false);
  h.markDirty();h=c.render('b');h.acknowledgeExternalLoad(99);h=c.render('b');assert.equal(h.saveStatus,'dirty');
});
test('edits made in a hard conflict keep the conflict visible and issue their own request; nothing says Saved',async()=>{
  const c=setup();c.d.proEditorService.updateEditorProject=async(id)=>{c.events.push(['pro',id]);throw conflictError()};
  await c.render().saveNow();let h=c.render();assert.equal(h.saveConflict,true);
  for(let i=0;i<2;i++){h.markDirty();h=c.render();assert.equal(h.saveStatus,'dirty');assert.equal(h.saveConflict,true,'Reload stays offered while the edit is dirty');await c.flushTimers();h=c.render();assert.equal(h.saveConflict,true);assert.equal(h.saveStatus,'error');}
  assert.equal(c.events.filter(e=>e[0]==='pro').length,3);assert(!c.events.some(e=>e[0]==='saved'));
});

test('hard conflict: Reload stays offered while a new attempt is in flight',async()=>{
  const c=setup();let calls=0,release;c.d.proEditorService.updateEditorProject=(id)=>{calls++;if(calls===1)throw conflictError();return new Promise((res,rej)=>{release=()=>rej(conflictError())})};
  await c.render().saveNow();let h=c.render();h.markDirty();h=c.render();await c.flushTimers();h=c.render();
  assert.equal(h.saveStatus,'saving');assert.equal(h.saveConflict,true,'conflict flag stays true while the attempt is pending');
  release();await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));h=c.render();assert.equal(h.saveConflict,true);assert.equal(h.saveStatus,'error');
});
const tick=async(n=3)=>{for(let i=0;i<n;i++)await new Promise(r=>setTimeout(r,0))};
test('a reload accepted while the Pro-save token is awaited sends no obsolete Pro PATCH',async()=>{
  const tokenCalls=[];let release;const s=setup({tokenForOwner:()=>{tokenCalls.push(1);return tokenCalls.length===1?Promise.resolve('t'):new Promise(r=>{release=()=>r('t')})}});
  s.d.proEditorService.updateEditorProject=async()=>{s.events.push(['pro','a']);throw conflictError()};
  await s.render().saveNow();let h=s.render();assert.equal(h.saveConflict,true);
  h.markDirty();h=s.render();await s.flushTimers();assert.equal(tokenCalls.length,2,'second attempt is waiting on its Pro token');
  h.acknowledgeExternalLoad(2);h=s.render('a',2);release();await tick();
  assert.equal(s.events.filter(e=>e[0]==='pro').length,1,'no PATCH after the reload was accepted');h=s.render('a',2);assert.equal(h.saveStatus,'saved');assert.equal(h.saveConflict,false);
});
test('a reload accepted while the Quick-sync token is awaited sends no obsolete Quick sync',async()=>{
  const tokenCalls=[];let release;const s=setup({tokenForOwner:()=>{tokenCalls.push(1);return tokenCalls.length===3?new Promise(r=>{release=()=>r('t')}):Promise.resolve('t')}});
  let pro=0;s.d.proEditorService.updateEditorProject=async(id,payload)=>{pro++;s.events.push(['pro',id]);if(pro===1)throw conflictError();return{...project(id),version:payload.version+1}};
  await s.render().saveNow();let h=s.render();h.markDirty();h=s.render();await s.flushTimers();
  assert.equal(tokenCalls.length,3,'attempt two reached its Quick token wait (its Pro write already started, which cannot be cancelled)');assert.equal(pro,2);
  h.acknowledgeExternalLoad(2);h=s.render('a',2);release();await tick();
  assert(!s.events.some(e=>e[0]==='quick'),'no Quick sync after the reload was accepted');assert(!s.events.some(e=>e[0]==='saved'));h=s.render('a',2);assert.equal(h.saveStatus,'saved');
});
test('a delayed Quick response from before an accepted reload is ignored',async()=>{
  let rel;const s=setup();let pro=0;s.d.proEditorService.updateEditorProject=async(id,payload)=>{pro++;s.events.push(['pro',id]);if(pro===1)throw conflictError();return{...project(id),version:payload.version+1}};
  s.d.clipRenderService.updateClipEditor=()=>new Promise(r=>{rel=()=>r({id:'clip:a'})});
  await s.render().saveNow();let h=s.render();h.markDirty();h=s.render();await s.flushTimers();assert(rel,'Quick sync is pending');
  h.acknowledgeExternalLoad(2);h=s.render('a',2);rel();await tick();h=s.render('a',2);
  assert.equal(h.saveStatus,'saved');assert(!s.events.some(e=>e[0]==='saved'),'late Quick response must not report Saved for the old project');
});
test('a repair edit marked dirty in the same tick as the acknowledge survives and saves against the loaded revision',async()=>{
  const c=setup();let fail=true;const writes=[];c.d.proEditorService.updateEditorProject=async(id,payload)=>{writes.push(payload.version);if(fail)throw conflictError();return{...project(id),version:payload.version+1}};
  await c.render().saveNow();let h=c.render();assert.equal(h.saveConflict,true);
  h.acknowledgeExternalLoad(5);h.markDirty();fail=false;h=c.render('a',5);assert.equal(h.saveStatus,'dirty','repair edit stays dirty after the acknowledge');
  await c.flushTimers();assert.deepEqual(writes,[1,5]);h=c.render('a',6);assert.equal(h.saveStatus,'saved');
});

test('a known conflict survives a later non-conflict failure (503 or token failure) until an accepted newer reload; transient-only never becomes a conflict',async()=>{
  for(const kind of ['503','token']){
    let calls=0,failToken=false;const s=setup({tokenForOwner:()=>failToken?Promise.reject(Object.assign(new Error('token unavailable'),{status:401})):Promise.resolve('t')});
    s.d.proEditorService.updateEditorProject=async(id,payload)=>{calls++;s.events.push(['pro',id,payload.version]);if(calls===1)throw conflictError();throw Object.assign(new Error('Request failed (503).'),{status:503})};
    await s.render().saveNow();let h=s.render();assert.equal(h.saveConflict,true);
    if(kind==='token')failToken=true;
    h.markDirty();h=s.render();await s.flushTimers();h=s.render();
    assert.equal(h.saveStatus,'error',kind);assert.equal(h.saveConflict,true,kind+': conflict kept after a non-conflict failure');
    h.acknowledgeExternalLoad(2);h=s.render('a',2);assert.equal(h.saveConflict,false,kind+': accepted newer reload clears it');assert.equal(h.saveStatus,'saved',kind);assert.equal(h.saveError,null,kind);
  }
  const t=setup();t.d.proEditorService.updateEditorProject=async()=>{throw Object.assign(new Error('Request failed (503).'),{status:503})};
  await t.render().saveNow();let h=t.render();h.markDirty();h=t.render();await t.flushTimers();h=t.render();assert.equal(h.saveConflict,false);assert.equal(h.saveStatus,'error');h.acknowledgeExternalLoad(2);h=t.render('a',2);assert.equal(h.saveStatus,'error','a transient-only error is not cleared by a reload acknowledge');
});
