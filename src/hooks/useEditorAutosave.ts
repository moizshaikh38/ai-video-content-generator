import { getCurrentAuthOwner, ownerMismatch } from '../lib/authOwner';
import { tokenForOwner, AccountChangedError } from '../lib/boundAuth';
import {useState,useEffect,useLayoutEffect,useRef,useCallback} from 'react';
import {journalWrite,journalClear,journalMarkProjectAcked,newJournalSession} from '../lib/editorJournal';
import {beginDrain,endDrain} from '../lib/editorSaveCoordinator';
import {EditorProject,RenderedClip} from '../types';
import {proEditorService} from '../services/proEditorService';
import {clipRenderService} from '../services/clipRenderService';
import {buildClipEditorUpdatePayload} from '../lib/editorSavePayload';
import {acknowledgeEditorVersion,editorSaveStillDirty} from '../lib/editorSaveState';
export type SaveStatus='saved'|'saving'|'dirty'|'error';
export interface UseEditorAutosaveOptions{
 debounceMs?:number;
 onSaved?:(project:EditorProject,clip?:RenderedClip)=>void;
 /** Revision acknowledgement only, before the separate clip sync. */
 onProjectVersionAck?:(project:EditorProject)=>void;
 onError?:(err:Error)=>void;
}
export interface UseEditorAutosaveReturn{saveStatus:SaveStatus;lastSavedAt:Date|null;saveError:string|null;saveNow:()=>Promise<boolean>;markDirty:()=>void}
export function useEditorAutosave(project:EditorProject|null,clip:RenderedClip|null,options:UseEditorAutosaveOptions={}):UseEditorAutosaveReturn{
 const{debounceMs=1200,onSaved,onError,onProjectVersionAck}=options;
 const[saveStatus,setSaveStatus]=useState<SaveStatus>('saved');const[lastSavedAt,setLastSavedAt]=useState<Date|null>(null);const[saveError,setSaveError]=useState<string|null>(null);const[genTick,setGenTick]=useState(0);
 const pending=useRef<EditorProject|null>(project),saving=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),generation=useRef(0),rerun=useRef(false),mounted=useRef(true),leaving=useRef(false);
 const session=useRef(newJournalSession()),journaledGen=useRef(0),editGen=useRef(0),journaledProject=useRef<EditorProject|null>(null),ackedGen=useRef(0),cleanGen=useRef(0),inflightEdit=useRef(0),savingEpoch=useRef(-1),drainOpen=useRef<{clip:string;token:string}|null>(null),clipIdRef=useRef<string|undefined>(clip?.id);clipIdRef.current=clip?.id;
 const closeDrain=()=>{const d=drainOpen.current;if(d){drainOpen.current=null;endDrain(d.clip,d.token);}};
 const previousProjectId=useRef<string|null>(project?.id||null);
 const projectSessionRef=useRef({id:project?.id,epoch:0});
 if(projectSessionRef.current.id!==project?.id){
  // A different project is being rendered: the previous project's edit counters must not reach this render's journal effect (direct A to B with no null render in between). Its in-flight save keeps its own captured generation and is ignored by the epoch check.
  if(projectSessionRef.current.id){editGen.current=0;journaledGen.current=0;journaledProject.current=null;ackedGen.current=0;cleanGen.current=0;}
  projectSessionRef.current={id:project?.id,epoch:projectSessionRef.current.epoch+1};}
 const acknowledged=useRef<{id:string;version:number}|null>(null);const executeRef=useRef<()=>Promise<boolean>>(async()=>false);
 // Do not replace a newer acknowledged revision with a render carrying stale
 // version metadata; all local track/canvas changes are still kept.
 pending.current=acknowledged.current?acknowledgeEditorVersion(project,acknowledged.current):project;
 const executeSave=useCallback(async():Promise<boolean>=>{
  const current=pending.current;if(!current||!clip||current.clip_id!==clip.id){closeDrain();return false;}
  if(saving.current){rerun.current=true;return false;}
  const started=generation.current,startedEdit=editGen.current,sessionEpoch=projectSessionRef.current.epoch;saving.current=true;inflightEdit.current=startedEdit;savingEpoch.current=sessionEpoch;rerun.current=false;setSaveStatus('saving');setSaveError(null);let succeeded=false;
  try{
   const tokenA=await tokenForOwner(current.user_id);
   const updated=await proEditorService.updateEditorProject(current.id,{title:current.title,canvas:current.canvas,tracks:current.tracks,playhead:current.playhead,settings:current.settings,version:current.version},tokenA);
   if(ownerMismatch(current.user_id,getCurrentAuthOwner()))throw new AccountChangedError();
   if((!mounted.current&&!leaving.current)||pending.current?.id!==current.id||sessionEpoch!==projectSessionRef.current.epoch)return false;
   if(!updated||updated.id!==current.id||updated.clip_id!==clip.id||!Number.isSafeInteger(updated.version)||updated.version<=current.version)throw new Error('The editor save response could not be verified. Your local edits are kept.');
   acknowledged.current={id:updated.id,version:updated.version};
   pending.current=acknowledgeEditorVersion(pending.current,updated);
   journalMarkProjectAcked(current,session.current,startedEdit,updated.version);if(startedEdit>ackedGen.current)ackedGen.current=startedEdit;
   if(mounted.current)onProjectVersionAck?.(updated);
   // A Pro acknowledgement never means this separate Quick-clip sync landed. Re-check the account: the credentials are read per request.
   const tokenC=await tokenForOwner(current.user_id);
   const updatedClip=await clipRenderService.updateClipEditor(clip.id,{...buildClipEditorUpdatePayload(current,clip),editorProjectRevision:{id:updated.id,version:updated.version}},tokenC);
   if(ownerMismatch(current.user_id,getCurrentAuthOwner()))throw new AccountChangedError();
   if((!mounted.current&&!leaving.current)||pending.current?.id!==current.id||sessionEpoch!==projectSessionRef.current.epoch)return false;
   if(!updatedClip||updatedClip.id!==clip.id)throw new Error('The clip synchronization response could not be verified. Your local edits are kept.');
   const dirty=editorSaveStillDirty(started,generation.current);
   // Clear only after BOTH acknowledgements, only this session's record, only up to the exact generation that was sent.
   journalClear(current,session.current,startedEdit);if(startedEdit===editGen.current)cleanGen.current=startedEdit;if(mounted.current){setSaveStatus(dirty?'dirty':'saved');setLastSavedAt(new Date());onSaved?.(updated,updatedClip);}succeeded=true;
   if(dirty)rerun.current=true;
   return !dirty;
  }catch(err:any){if(mounted.current&&pending.current?.id===current.id&&sessionEpoch===projectSessionRef.current.epoch){setSaveError(err.message||'Failed to save changes.');setSaveStatus('error');onError?.(err);}return false;}
  finally{
   saving.current=false;
   // Retry only a NEW edit/explicit request after a successful save, never an
   // automatic error/conflict loop. Failed local edits remain visible.
   let chained=false;
   if(leaving.current&&!mounted.current){
    // Page is being left: finish a newer edit now (no debounce), but never loop after a failure or into another project.
    if(rerun.current&&succeeded&&pending.current?.id===current.id&&sessionEpoch===projectSessionRef.current.epoch){rerun.current=false;chained=true;void executeRef.current();}
   }else if(mounted.current&&rerun.current&&(succeeded||pending.current?.id!==current.id||sessionEpoch!==projectSessionRef.current.epoch)){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{timer.current=null;executeRef.current();},debounceMs);}
   // A drain token is released only by real completion of the whole chain (also when React StrictMode remounted this editor).
   if(!chained&&!timer.current)closeDrain();
  }
 },[clip,onSaved,onError,onProjectVersionAck,debounceMs]);
 executeRef.current=executeSave;
 // Journal every ACCEPTED edit from the committed render (never from a replayable state updater). Idempotent per generation.
 useLayoutEffect(()=>{const p=pending.current;if(!p||!clip||p.clip_id!==clip.id||editGen.current===0||editGen.current===cleanGen.current)return;
  // Write once per edit generation, and refresh the same generation if a later committed render carries newer state (a replayed effect can see a stale render first). Never after that generation was acknowledged.
  if(editGen.current===journaledGen.current&&(project===journaledProject.current||editGen.current===ackedGen.current||(saving.current&&editGen.current===inflightEdit.current)))return;
  journaledGen.current=editGen.current;journaledProject.current=project;journalWrite(p,{session:session.current,generation:editGen.current});},[project,clip,genTick]);
 const markDirty=useCallback(()=>{generation.current++;editGen.current++;setGenTick(t=>t+1);setSaveStatus('dirty');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{timer.current=null;executeRef.current();},debounceMs);},[debounceMs]);
 const saveNow=useCallback(async()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}return executeRef.current();},[]);
 useEffect(()=>{
  // A departed project's debounce must never save the next clean project.
  // Keep a timer seeded while an initial document was loading: caption
  // coverage repair can deliberately mark that new document dirty.
  if(previousProjectId.current&&previousProjectId.current!==project?.id){if(timer.current)clearTimeout(timer.current);timer.current=null;rerun.current=false;generation.current++;editGen.current=0;journaledGen.current=0;journaledProject.current=null;ackedGen.current=0;cleanGen.current=0;
   // A drain held for a pending debounce that was just discarded has no work left: release it unless a save is still in flight (its finally releases).
   if(drainOpen.current&&!saving.current)closeDrain();}
  previousProjectId.current=project?.id||null;
  acknowledged.current=null;setSaveStatus(timer.current?'dirty':(saving.current&&savingEpoch.current===projectSessionRef.current.epoch)?'saving':'saved');setSaveError(null);setLastSavedAt(null);
 },[project?.id]);
 // Unsaved-work protection: while an edit is dirty, saving or failed, ask the browser to confirm leaving, and
 // best-effort flush when the page is hidden/closing. A flush during unload is not guaranteed to finish, so the prompt is the guard.
 const statusRef=useRef<SaveStatus>(saveStatus);statusRef.current=saveStatus;
 useEffect(()=>{
  const onBeforeUnload=(e:BeforeUnloadEvent)=>{if(statusRef.current==='saved')return;if(pending.current&&editGen.current>0)journalWrite(pending.current,{session:session.current,generation:editGen.current});e.preventDefault();e.returnValue='';};
  const flush=()=>{if(statusRef.current!=='saved'&&pending.current&&editGen.current>0)journalWrite(pending.current,{session:session.current,generation:editGen.current});if(statusRef.current==='dirty'||statusRef.current==='saving'){if(timer.current){clearTimeout(timer.current);timer.current=null;}void executeRef.current();}};
  const onHide=()=>{if(document.visibilityState==='hidden')flush();};
  window.addEventListener('beforeunload',onBeforeUnload);window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',onHide);
  return()=>{window.removeEventListener('beforeunload',onBeforeUnload);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',onHide);};
 },[]);
 useEffect(()=>{mounted.current=true;leaving.current=false;return()=>{
  // In-app navigation: a pending edit (debounce not yet fired) or a newer edit made while a save is in flight must not be
  // dropped. Drain it: one more save after the in-flight one, with project PATCH + clip sync both completing. A clean state does nothing.
  const hadPending=!!timer.current;if(timer.current)clearTimeout(timer.current);timer.current=null;
  if((saving.current||hadPending||statusRef.current==='error')&&pending.current&&clipIdRef.current&&!drainOpen.current){drainOpen.current={clip:clipIdRef.current,token:beginDrain({clip:clipIdRef.current,user:pending.current.user_id,project:pending.current.id})};}
  if(saving.current){if(hadPending){rerun.current=true;}leaving.current=true;}
  else if(hadPending){leaving.current=true;void executeRef.current();}
  // A failed save has no pending timer: make one best-effort attempt on the way out (single try, never a loop); silent if it fails again.
  else if(statusRef.current==='error'){leaving.current=true;void executeRef.current();}
  mounted.current=false;};},[]);
 return{saveStatus,lastSavedAt,saveError,saveNow,markDirty};
}
