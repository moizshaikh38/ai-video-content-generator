import fs from'node:fs';import path from'node:path';import os from'node:os';import crypto from'node:crypto';
import{dataRepository}from'../db/repositories/dataRepository.js';import{AppError,isValidUUID}from'../types/index.js';import{isAllowedClientEditorSourcePath}from'../utils/editorAssetValidator.js';import{EDITOR_OVERLAY_MAX_BYTES,EDITOR_OVERLAY_TIMEOUT_MS}from'../utils/boundedAssetResponse.js';import{downloadObjectToFile,headObject,computeFileStreamSha256}from'./objectStorageService.js';import{sourceObjectReceiptMatches}from'../shared/sourceObjectReceipt.js';
const identityError=()=>new AppError('The library media identity changed. Select it again.',409,'EDITOR_SOURCE_IDENTITY_REQUIRED');
/** Bounded library source/output materialization. No bucket guessing, shared
 * caches, local-key fallback or persisted reference rewrite. Ready output is
 * identity only, not proof that its bytes match the latest saved editor. */
export async function prepareEditorProjectSourceAsset(userId:string,item:any,tmpDir:string):Promise<string|null>{
 const key=item.source_path;
 if(typeof key!=='string'||!key.startsWith('users/'))return null;
 if(!isAllowedClientEditorSourcePath(userId,key)||!isValidUUID(item.source_asset_id))throw identityError();
 const root=fs.realpathSync(tmpDir),tempRoot=fs.realpathSync(os.tmpdir());
 if(root===tempRoot||!root.startsWith(tempRoot+path.sep))throw new AppError('A private render directory is required.',400,'EDITOR_ASSET_OWNERSHIP_REQUIRED');
 const loadAsset=()=>dataRepository.from('media_assets').select('*').eq('id',item.source_asset_id).eq('user_id',userId).maybeSingle();
 const{data:asset,error}=await loadAsset();
 if(error||!asset||!['PROJECT_SOURCE','GENERATED_CLIP'].includes(asset.source_type))return null;
 if(!isValidUUID(asset.project_id))throw identityError();
 const generated=asset.source_type==='GENERATED_CLIP';
 if(generated&&!isValidUUID(asset.clip_id))throw identityError();
 if(!generated&&asset.storage_path!==key)throw identityError();
 const bucket=generated?'clips':'source';
 const load=()=>dataRepository.from(generated?'clips':'projects').select('*').eq('id',generated?asset.clip_id:asset.project_id).eq('user_id',userId).maybeSingle();
 const snapshot=(record:any)=>{
  if(!record)return null;
  if(generated){
   if(record.render_status!=='ready'||record.project_id!==asset.project_id||record.output_storage_path!==key||record.source_storage_path===key)return null;
   return JSON.stringify([record.id,record.user_id,record.project_id,record.output_storage_path,record.source_storage_path,record.render_status,record.render_version??null,record.editor_version??null,record.rendered_editor_version??null,record.rendered_editor_digest??null,record.editor_project_sync_pending??null]);
  }
  return record.source_storage_path===key?JSON.stringify([record.id,record.user_id,record.source_storage_path]):null;
 };
 const initial=await load(),bound=snapshot(initial.data);if(initial.error||!bound)throw identityError();
 const before=await headObject(bucket,key);
 if(!Number.isSafeInteger(before.size)||before.size<=0||before.size>EDITOR_OVERLAY_MAX_BYTES||!before.etag||before.etag.startsWith('W/'))throw new AppError('This source cannot be prepared within the editor asset budget.',409,'EDITOR_SOURCE_UNAVAILABLE');
 const ext=path.extname(key).toLowerCase();if(!/^\.(mp4|mov|mkv|webm|m4v)$/.test(ext))throw new AppError('This source format needs separate media preparation.',409,'EDITOR_SOURCE_UNAVAILABLE');
 const child=fs.mkdtempSync(path.join(root,generated?'generated-clip-':'project-source-'));const file=path.join(child,crypto.randomUUID()+ext);
 try{
  const download=await downloadObjectToFile(bucket,key,file,{timeoutMs:EDITOR_OVERLAY_TIMEOUT_MS,requireStreamingSha256:true,requireSnapshotReceipt:true,expectedObject:{size:before.size,etag:before.etag,versionId:before.versionId},maxBytes:EDITOR_OVERLAY_MAX_BYTES});
  const after=await headObject(bucket,key),current=await load(),digest=await computeFileStreamSha256(file);
  const{data:currentAsset,error:assetError}=await loadAsset();
  const assetCurrent=currentAsset&&currentAsset.source_type===asset.source_type&&currentAsset.project_id===asset.project_id&&
    (generated?currentAsset.clip_id===asset.clip_id:currentAsset.storage_path===key);
  if(current.error||snapshot(current.data)!==bound||assetError||!assetCurrent||before.versionId!==after.versionId||before.etag!==after.etag||before.size!==after.size||!sourceObjectReceiptMatches(download.sourceReceipt,key,after,digest)||download.sha256!==digest||fs.statSync(file).size!==before.size)throw identityError();
  return file;
 }catch(error){fs.rmSync(child,{recursive:true,force:true});throw error;}
}
