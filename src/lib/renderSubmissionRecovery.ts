import {createRenderIntentJournal, renderReceiptMatches, type StoredRenderIntent} from './renderIntentJournal';
export interface RenderRecoveryDependencies {
  owner:()=>Promise<string>;
  request:(path:string,options?:RequestInit,owner?:string)=>Promise<any>;
  readClip:(id:string)=>Promise<any>;
  storage:()=>Storage;
  newId:()=>string;
  lock:<T>(name:string,work:()=>Promise<T>)=>Promise<T>;
}
export function createRenderSubmissionRecovery(d:RenderRecoveryDependencies){
  const context=async(clipId:string)=>{
    const owner=await d.owner();if(!owner)throw Error('Please sign in again.');
    const journal=createRenderIntentJournal(d.storage(),d.newId);
    return{owner,journal,lockName:'vireo-render-submit-v1:'+JSON.stringify([owner,clipId])};
  };
  const send=async(intent:StoredRenderIntent,journal:ReturnType<typeof createRenderIntentJournal>,recoverOnly:boolean)=>{
    let receipt:any;
    if(await d.owner()!==intent.owner)throw Object.assign(new Error('The signed-in account changed. No render request was sent.'),{code:'RENDER_RECOVERY_OWNER_CHANGED'});
    try{receipt=await d.request(`/clips/${intent.clipId}/render`,{method:'POST',body:JSON.stringify({...intent.body,...(recoverOnly?{recover_only:true}:{})})},intent.owner);}
    catch(error:any){
      // Retain the intent on every rejection. Absence at a point in time does
      // not exclude a still-committing original request, and never resets a key.
      if(error?.code==='RENDER_SUBMISSION_NOT_FOUND')throw Object.assign(new Error('The saved render request has not been confirmed. It was kept. Use Render to retry the same request; no new request was started on reload.'),{code:'RENDER_RECOVERY_PENDING'});
      if(!error?.status||error.status>=500)throw Object.assign(new Error('The render request could not be confirmed. Its recovery key is saved. Reopen the clip to recover it or retry the same saved request.'),{code:'RENDER_ADMISSION_UNCONFIRMED',status:error?.status,cause:error});
      throw error;
    }
    if(!renderReceiptMatches(receipt,intent))throw Object.assign(new Error('The saved render receipt could not be verified. Its request was kept; no automatic retry was sent.'),{code:'RENDER_RECEIPT_UNVERIFIED'});
    journal.saveReceipt(intent,receipt);
    return{...receipt,submissionId:intent.body.submission_id};
  };
  return{
    async submit(clipId:string,options:Record<string,unknown>={}){
      const c=await context(clipId);
      return d.lock(c.lockName,async()=>{
        let intent=c.journal.read(c.owner,clipId);
        if(intent?.receipt){
          const current=await d.readClip(clipId);
          if(current?.id!==clipId||current.user_id!==c.owner)throw Error('The saved clip does not match the authenticated owner.');
          const r=intent.receipt,j=current.latest_job;
          const superseded=typeof current.render_version==='number'&&current.render_version>r.renderVersion ||
            current.render_version===r.renderVersion&&typeof current.editor_version==='number'&&current.editor_version!==r.editorVersion;
          const terminal=j?.id===r.jobId&&j.clip_id===clipId&&j.render_version===r.renderVersion&&j.editor_version===r.editorVersion&&['completed','failed'].includes(j.status);
          if(superseded||terminal){c.journal.resolve(c.owner,clipId,intent.body.submission_id);intent=null;}
        }
        if(intent){
          const original=Object.fromEntries(Object.entries(intent.body).filter(([key])=>!['submission_id','expected_render_version','expected_editor_version'].includes(key)));
          if(JSON.stringify(Object.entries(original).sort())!==JSON.stringify(Object.entries(options).sort()))throw Object.assign(new Error('A saved render request uses different options. Reopen the clip to recover it before starting another render.'),{code:'RENDER_RECOVERY_OPTIONS_CONFLICT'});
          return send(intent,c.journal,false);
        }
        const clip=await d.readClip(clipId);
        if(clip?.id!==clipId||clip.user_id!==c.owner)throw Error('The saved clip does not match the authenticated owner.');
        intent=c.journal.prepare(c.owner,clipId,clip.render_version??1,clip.editor_version??1,options);
        return send(intent,c.journal,false);
      });
    },
    async recover(clipId:string){
      const c=await context(clipId);
      return d.lock(c.lockName,async()=>{const intent=c.journal.read(c.owner,clipId);return intent?send(intent,c.journal,true):null;});
    },
    async closePending(clipId:string){
      const c=await context(clipId);
      return d.lock(c.lockName,async()=>{
        const intent=c.journal.read(c.owner,clipId);if(!intent)return null;
        if(await d.owner()!==c.owner)throw Error('The signed-in account changed. No request was sent.');
        const result=await d.request(`/clips/${clipId}/render`,{method:'POST',body:JSON.stringify({...intent.body,cancel_only:true})},c.owner);
        if(result?.status==='ok'&&result.cancelled===true&&result.submissionId===intent.body.submission_id){
          c.journal.resolve(c.owner,clipId,intent.body.submission_id);return null;
        }
        if(!renderReceiptMatches(result,intent))throw Object.assign(new Error('The saved request could not be resolved. Its recovery key was kept.'),{code:'RENDER_RECEIPT_UNVERIFIED'});
        c.journal.saveReceipt(intent,result);return{...result,submissionId:intent.body.submission_id};
      });
    },
    async resolve(clipId:string,submissionId?:string){
      if(!submissionId)return;
      const c=await context(clipId);
      await d.lock(c.lockName,async()=>{c.journal.resolve(c.owner,clipId,submissionId)});
    },
  };
}
