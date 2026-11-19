import {useState,useEffect,useRef,useCallback} from 'react';
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
 const[saveStatus,setSaveStatus]=useState<SaveStatus>('saved');const[lastSavedAt,setLastSavedAt]=useState<Date|null>(null);const[saveError,setSaveError]=useState<string|null>(null);
 const pending=useRef<EditorProject|null>(project),saving=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),generation=useRef(0),rerun=useRef(false),mounted=useRef(true);
 const previousProjectId=useRef<string|null>(project?.id||null);
 const projectSessionRef=useRef({id:project?.id,epoch:0});
 if(projectSessionRef.current.id!==project?.id){projectSessionRef.current={id:project?.id,epoch:projectSessionRef.current.epoch+1};}
 const acknowledged=useRef<{id:string;version:number}|null>(null);const executeRef=useRef<()=>Promise<boolean>>(async()=>false);
 // Do not replace a newer acknowledged revision with a render carrying stale
 // version metadata; all local track/canvas changes are still kept.
 pending.current=acknowledged.current?acknowledgeEditorVersion(project,acknowledged.current):project;
 const executeSave=useCallback(async():Promise<boolean>=>{
  const current=pending.current;if(!current||!clip||current.clip_id!==clip.id)return false;
  if(saving.current){rerun.current=true;return false;}
  const started=generation.current,sessionEpoch=projectSessionRef.current.epoch;saving.current=true;rerun.current=false;setSaveStatus('saving');setSaveError(null);let succeeded=false;
  try{
   const updated=await proEditorService.updateEditorProject(current.id,{title:current.title,canvas:current.canvas,tracks:current.tracks,playhead:current.playhead,settings:current.settings,version:current.version});
   if(!mounted.current||pending.current?.id!==current.id||sessionEpoch!==projectSessionRef.current.epoch)return false;
   if(!updated||updated.id!==current.id||updated.clip_id!==clip.id||!Number.isSafeInteger(updated.version)||updated.version<=current.version)throw new Error('The editor save response could not be verified. Your local edits are kept.');
   acknowledged.current={id:updated.id,version:updated.version};
   pending.current=acknowledgeEditorVersion(pending.current,updated);
   onProjectVersionAck?.(updated);
   // A Pro acknowledgement never means this separate Quick-clip sync landed.
   const updatedClip=await clipRenderService.updateClipEditor(clip.id,{...buildClipEditorUpdatePayload(current,clip),editorProjectRevision:{id:updated.id,version:updated.version}});
   if(!mounted.current||pending.current?.id!==current.id||sessionEpoch!==projectSessionRef.current.epoch)return false;
   if(!updatedClip||updatedClip.id!==clip.id)throw new Error('The clip synchronization response could not be verified. Your local edits are kept.');
   const dirty=editorSaveStillDirty(started,generation.current);setSaveStatus(dirty?'dirty':'saved');setLastSavedAt(new Date());onSaved?.(updated,updatedClip);succeeded=true;
   if(dirty)rerun.current=true;
   return !dirty;
  }catch(err:any){if(mounted.current&&pending.current?.id===current.id&&sessionEpoch===projectSessionRef.current.epoch){setSaveError(err.message||'Failed to save changes.');setSaveStatus('error');onError?.(err);}return false;}
  finally{
   saving.current=false;
   // Retry only a NEW edit/explicit request after a successful save, never an
   // automatic error/conflict loop. Failed local edits remain visible.
   if(mounted.current&&rerun.current&&(succeeded||pending.current?.id!==current.id||sessionEpoch!==projectSessionRef.current.epoch)){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{executeRef.current();},debounceMs);}
  }
 },[clip,onSaved,onError,onProjectVersionAck,debounceMs]);
 executeRef.current=executeSave;
 const markDirty=useCallback(()=>{generation.current++;setSaveStatus('dirty');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{executeRef.current();},debounceMs);},[debounceMs]);
 const saveNow=useCallback(async()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}return executeRef.current();},[]);
 useEffect(()=>{
  // A departed project's debounce must never save the next clean project.
  // Keep a timer seeded while an initial document was loading: caption
  // coverage repair can deliberately mark that new document dirty.
  if(previousProjectId.current&&previousProjectId.current!==project?.id){if(timer.current)clearTimeout(timer.current);timer.current=null;rerun.current=false;generation.current++;}
  previousProjectId.current=project?.id||null;
  acknowledged.current=null;setSaveStatus(timer.current?'dirty':'saved');setSaveError(null);setLastSavedAt(null);
 },[project?.id]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
 return{saveStatus,lastSavedAt,saveError,saveNow,markDirty};
}
