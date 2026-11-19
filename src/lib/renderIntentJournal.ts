export interface StoredRenderIntent {
  version: 1;
  owner: string;
  clipId: string;
  body: Record<string, unknown> & {submission_id: string; expected_render_version: number; expected_editor_version: number};
  receipt?: {status:'ok';clipId:string;jobId:string;renderVersion:number;editorVersion:number};
}
const unavailable = () => Object.assign(new Error('Render recovery storage is unavailable. No new render was submitted. Restore browser storage before trying again.'), {code:'RENDER_RECOVERY_STORAGE_UNAVAILABLE'});
const corrupt = () => Object.assign(new Error('A saved render request could not be verified. It was kept for review; no new render was submitted.'), {code:'RENDER_RECOVERY_UNVERIFIED'});
const uuid = (value: unknown): value is string => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value)&&Number(value)>0&&Number(value)<Number.MAX_SAFE_INTEGER;
export function renderReceiptMatches(receipt:any, intent:StoredRenderIntent): boolean {
  return receipt?.status==='ok' && receipt.clipId===intent.clipId && uuid(receipt.jobId) &&
    receipt.renderVersion===intent.body.expected_render_version+1 && receipt.editorVersion===intent.body.expected_editor_version;
}
/** A non-secret local recovery journal, scoped by authenticated owner and clip.
 * No automatic expiry: uncertainty never silently becomes a fresh request.
 */
export function createRenderIntentJournal(storage: Pick<Storage,'getItem'|'setItem'|'removeItem'>, newId:()=>string) {
  const key=(owner:string,clipId:string)=>'vireo-render-intent-v1:'+JSON.stringify([owner,clipId]);
  function read(owner:string,clipId:string):StoredRenderIntent|null {
    let raw:string|null;try{raw=storage.getItem(key(owner,clipId));}catch{throw unavailable();}
    if(raw===null)return null;
    let item:any;try{item=JSON.parse(raw);}catch{throw corrupt();}
    if(item?.version!==1||item.owner!==owner||item.clipId!==clipId||!uuid(item.body?.submission_id)||
       !revision(item.body.expected_render_version)||!revision(item.body.expected_editor_version)||
       (item.body.caption_enabled!==undefined&&typeof item.body.caption_enabled!=='boolean')||
       (item.body.caption_style!==undefined&&(typeof item.body.caption_style!=='string'||!item.body.caption_style.trim()))||
       (item.body.render_resolution!==undefined&&!['720p','1080p','1440p','2160p'].includes(item.body.render_resolution))||
       Object.keys(item.body).some(k=>!['submission_id','expected_render_version','expected_editor_version','caption_enabled','caption_style','render_resolution'].includes(k))||
       (item.receipt!==undefined&&!renderReceiptMatches(item.receipt,item)))throw corrupt();
    return item;
  }
  function write(intent:StoredRenderIntent){
    try{storage.setItem(key(intent.owner,intent.clipId),JSON.stringify(intent));}catch{throw unavailable();}
    const saved=read(intent.owner,intent.clipId);
    if(JSON.stringify(saved)!==JSON.stringify(intent))throw unavailable();
  }
  return {read,
    prepare(owner:string,clipId:string,renderVersion:number,editorVersion:number,options:Record<string,unknown>={}):StoredRenderIntent {
      if(!owner||!clipId||!revision(renderVersion)||!revision(editorVersion))throw corrupt();
      const existing=read(owner,clipId);
      if(existing)throw Object.assign(new Error('Resolve the saved render request before starting a different render.'),{code:'RENDER_RECOVERY_PENDING'});
      const id=newId();if(!uuid(id))throw unavailable();
      const intent:StoredRenderIntent={version:1,owner,clipId,body:{...options,submission_id:id,expected_render_version:renderVersion,expected_editor_version:editorVersion}};
      write(intent);return intent;
    },
    saveReceipt(intent:StoredRenderIntent,receipt:StoredRenderIntent['receipt']){
      if(!renderReceiptMatches(receipt,intent))throw corrupt();
      const current=read(intent.owner,intent.clipId);
      if(current?.body.submission_id!==intent.body.submission_id)throw corrupt();
      write({...intent,receipt:{status:'ok',clipId:receipt!.clipId,jobId:receipt!.jobId,renderVersion:receipt!.renderVersion,editorVersion:receipt!.editorVersion}});
    },
    resolve(owner:string,clipId:string,submissionId:string){
      const current=read(owner,clipId);
      if(!current||current.body.submission_id!==submissionId)return;
      try{storage.removeItem(key(owner,clipId));if(storage.getItem(key(owner,clipId))!==null)throw unavailable();}catch{throw unavailable();}
    },
  };
}
