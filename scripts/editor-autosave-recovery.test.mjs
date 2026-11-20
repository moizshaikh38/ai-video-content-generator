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
function setup(){
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
  const hook=make(d);
  function render(id='a'){cursor=0;const h=hook(id?project(id):null,id?{id:'clip:'+id}:null,{onSaved:()=>events.push(['saved']),onProjectVersionAck:()=>events.push(['ack'])});while(pendingEffects.length)pendingEffects.shift()();return h;}
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
