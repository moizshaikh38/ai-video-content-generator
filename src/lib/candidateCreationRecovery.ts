export interface CandidateCreationDependencies {
  owner:()=>Promise<string>; request:(path:string,options:RequestInit,owner:string)=>Promise<any>;
  storage:()=>Storage;newId:()=>string;lock:<T>(name:string,work:()=>Promise<T>)=>Promise<T>;
}
export interface CandidateCreationInput {candidateId:string;aspectRatio:string;cropMode:string;caption_enabled?:boolean;caption_style?:string;caption_config?:any}
interface SavedCreation {version:1;owner:string;projectId:string;input:CandidateCreationInput;id:string;preparation?:string;receipt?:{clipId:string;jobId:string}}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const token=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(message:string,code='CREATION_RECOVERY_UNVERIFIED')=>Object.assign(new Error(message),{code});
const canonical=(v:any):string=>JSON.stringify(v,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const validInput=(v:any)=>v&&uuid(v.candidateId)&&['9:16','1:1','16:9'].includes(v.aspectRatio)&&['smart','center','fit'].includes(v.cropMode)&&
  (v.caption_enabled===undefined||typeof v.caption_enabled==='boolean')&&(v.caption_style===undefined||typeof v.caption_style==='string'&&!!v.caption_style.trim())&&
  (v.caption_config===undefined||v.caption_config!==null&&typeof v.caption_config==='object'&&!Array.isArray(v.caption_config))&&
  Object.keys(v).every(k=>['candidateId','aspectRatio','cropMode','caption_enabled','caption_style','caption_config'].includes(k))&&canonical(v).length<=32768;
export function candidateCreationReceiptMatches(result:any,item:SavedCreation):boolean{
  const clip=result?.clip,job=result?.renderJob;
  return result?.status==='ok'&&result.creationId===item.id&&token(result.preparation)&&(!item.preparation||result.preparation===item.preparation)&&
    uuid(clip?.id)&&clip.user_id===item.owner&&clip.project_id===item.projectId&&clip.candidate_id===item.input.candidateId&&clip.render_version===1&&clip.editor_version===1&&
    uuid(job?.id)&&job.clip_id===clip.id&&job.user_id===item.owner&&job.render_version===1&&job.editor_version===1&&
    (!item.receipt||item.receipt.clipId===clip.id&&item.receipt.jobId===job.id);
}
/** Separate creation journal. A slot is one original option set, not permanent
 * candidate deduplication. Home retains reuse receipts; Workspace keeps the receipt too. Only an explicitly new variant may
 * replace a verified known receipt with a fresh local intent.
 * No uncertain intent is removed without a server tombstone. */
export function createCandidateCreationRecovery(d:CandidateCreationDependencies){
  async function context(projectId:string,input:CandidateCreationInput){
    const normalized=JSON.parse(JSON.stringify(input));
    if(!uuid(projectId)||!validInput(normalized))throw fail('The candidate creation inputs could not be verified. No request was sent.');
    const owner=await d.owner();if(!owner)throw fail('Please sign in again.');
    const key='vireo-candidate-creation-v1:'+canonical([owner,projectId,normalized]);
    const storage=d.storage();
    const read=():SavedCreation|null=>{
      let raw;try{raw=storage.getItem(key)}catch{throw fail('Browser storage is unavailable. No new creation was submitted.','CREATION_RECOVERY_STORAGE_UNAVAILABLE')}
      if(raw===null)return null;
      let item:any;try{item=JSON.parse(raw)}catch{throw fail('The saved creation request could not be read. It was kept; no new clip was created.')}
      if(item?.version!==1||item.owner!==owner||item.projectId!==projectId||!uuid(item.id)||!validInput(item.input)||canonical(item.input)!==canonical(normalized)||
        (item.preparation!==undefined&&!token(item.preparation))||(item.receipt!==undefined&&(!item.preparation||!uuid(item.receipt.clipId)||!uuid(item.receipt.jobId)))||
        Object.keys(item).some(k=>!['version','owner','projectId','input','id','preparation','receipt'].includes(k)))throw fail('The saved creation request could not be verified. It was kept; no new clip was created.');
      return item;
    };
    const write=(item:SavedCreation)=>{try{storage.setItem(key,JSON.stringify(item));}catch{throw fail('Browser storage could not save this creation request. Its original key was kept.','CREATION_RECOVERY_STORAGE_UNAVAILABLE')}
      if(canonical(read())!==canonical(item))throw fail('Browser storage did not retain this creation request. No new request was sent.','CREATION_RECOVERY_STORAGE_UNAVAILABLE');};
    const remove=(id:string)=>{const current=read();if(current?.id!==id)return;try{storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('not removed')}catch{throw fail('The saved request could not be cleared. Its identity was kept.','CREATION_RECOVERY_STORAGE_UNAVAILABLE')}};
    return{owner,key,read,write,remove,projectId,input:normalized as CandidateCreationInput};
  }
  type Context=Awaited<ReturnType<typeof context>>;
  async function send(c:Context,item:SavedCreation,mode?:'prepare_only'|'recover_only'|'cancel_only'){
    if(await d.owner()!==item.owner)throw fail('The signed-in account changed. No creation request was sent.','CREATION_RECOVERY_OWNER_CHANGED');
    let result:any;
    try{result=await d.request(`/projects/${item.projectId}/clips${mode==='recover_only'?'/recover':''}`,{method:'POST',body:JSON.stringify({...item.input,creation_id:item.id,...(item.preparation?{preparation:item.preparation}:{}),...(mode?{[mode]:true}:{})})},item.owner)}
    catch(error:any){if(error?.code==='CREATION_INTENT_NOT_FOUND')throw fail('The saved creation has not been confirmed. It was kept. Retry the same action to continue; reload did not create a clip.','CREATION_RECOVERY_PENDING');
      if(!error?.status||error.status>=500)throw fail('The creation request could not be confirmed. Its key is saved. Retry the same action to recover it, not a new request.','CREATION_ADMISSION_UNCONFIRMED');throw error;}
    if(candidateCreationReceiptMatches(result,item)){
      c.write({...item,preparation:result.preparation,receipt:{clipId:result.clip.id,jobId:result.renderJob.id}});return result;
    }
    if(mode==='cancel_only'&&result?.status==='ok'&&result.deleted===true&&result.creationId===item.id&&token(result.preparation)&&(!item.preparation||result.preparation===item.preparation)&&uuid(result.clipId)&&uuid(result.jobId)&&(!item.receipt||item.receipt.clipId===result.clipId&&item.receipt.jobId===result.jobId)){c.remove(item.id);return null;}
    if(mode==='cancel_only'&&!item.receipt&&result?.status==='ok'&&result.cancelled===true&&result.creationId===item.id){c.remove(item.id);return null;}
    if(mode&&mode!=='cancel_only'&&!item.receipt&&result?.status==='ok'&&result.prepared===true&&result.creationId===item.id&&token(result.preparation)&&(!item.preparation||item.preparation===result.preparation)){
      c.write({...item,preparation:result.preparation});return null;
    }
    throw fail('The saved creation response could not be verified. Its key was kept; no automatic replacement was sent.');
  }
  return{
    async listProject(projectId:string):Promise<CandidateCreationInput[]>{
      if(!uuid(projectId))throw fail('A valid project is required for saved creation recovery.');
      const owner=await d.owner();if(!owner)throw fail('Please sign in again.');
      const prefix='vireo-candidate-creation-v1:'+canonical([owner,projectId]).slice(0,-1)+',';
      const inputs:CandidateCreationInput[]=[];
      try{const storage=d.storage(),count=storage.length;
        if(!Number.isSafeInteger(count)||count<0||count>10000)throw Error('storage index unavailable');
        for(let i=0;i<count;i++){const key=storage.key(i);if(!key?.startsWith(prefix))continue;
          const slot=JSON.parse(key.slice('vireo-candidate-creation-v1:'.length));
          if(!Array.isArray(slot)||slot.length!==3||slot[0]!==owner||slot[1]!==projectId||!validInput(slot[2]))throw Error('invalid saved slot');
          inputs.push(slot[2]);
        }
      }catch{throw fail('Saved creation requests could not be listed. They were kept; reload did not create work.','CREATION_RECOVERY_STORAGE_UNAVAILABLE');}
      return inputs;
    },
    async submit(projectId:string,input:CandidateCreationInput,newVariant=false){
      const c=await context(projectId,input);return d.lock(c.key,async()=>{
        let item=c.read(),replacementId:string|undefined;
        if(newVariant&&item){
          if(!item.receipt)throw fail('Resolve or recover the saved creation before requesting a new variant. Its original identity was kept.','CREATION_VARIANT_PENDING');
          await send(c,item,'recover_only');
          replacementId=d.newId();if(!uuid(replacementId)||replacementId===item.id)throw fail('A distinct creation identity is unavailable. The original receipt was kept.');
          c.remove(item.id);item=null;
        }
        if(!item){const id=replacementId??d.newId();if(!uuid(id))throw fail('A safe creation identity is unavailable.');item={version:1,owner:c.owner,projectId,input:c.input,id};c.write(item);}
        if(item.receipt)return send(c,item,'recover_only');
        if(!item.preparation){const recovered=await send(c,item,'prepare_only');if(recovered)return recovered;item=c.read();if(!item?.preparation)throw fail('Creation inputs were not saved.');}
        return send(c,item);
      });
    },
    async recover(projectId:string,input:CandidateCreationInput){const c=await context(projectId,input);return d.lock(c.key,async()=>{const item=c.read();return item?send(c,item,'recover_only'):null;});},
    async close(projectId:string,input:CandidateCreationInput){const c=await context(projectId,input);return d.lock(c.key,async()=>{const item=c.read();if(!item)throw fail('No saved creation key is available here. Existing work cannot be closed by guessing its identity.','CREATION_RECOVERY_NOT_FOUND');return send(c,item,'cancel_only');});},

  };
}
