import fs from'node:fs';import path from'node:path';import os from'node:os';import crypto from'node:crypto';
import{dataRepository}from'../db/repositories/dataRepository.js';import{AppError,isValidUUID}from'../types/index.js';import{isAllowedClientEditorSourcePath}from'../utils/editorAssetValidator.js';import{EDITOR_OVERLAY_MAX_BYTES,EDITOR_OVERLAY_TIMEOUT_MS}from'../utils/boundedAssetResponse.js';import{downloadObjectToFile,headObject,computeFileStreamSha256}from'./objectStorageService.js';import{sourceObjectReceiptMatches}from'../shared/sourceObjectReceipt.js';
/** Bounded PROJECT_SOURCE library materialization. No bucket guessing, shared
 * caches, local-key fallback or persisted reference rewrite. Other source kinds
 * remain unresolved and the existing post-preload gate fails closed. */
export async function prepareEditorProjectSourceAsset(userId:string,item:any,tmpDir:string):Promise<string|null>{
 const key=item.source_path;
 if(typeof key!=='string'||!key.startsWith('users/'))return null;
 if(!isAllowedClientEditorSourcePath(userId,key)||!isValidUUID(item.source_asset_id))throw new AppError('Select this source from your media library again.',409,'EDITOR_SOURCE_IDENTITY_REQUIRED');
 const root=fs.realpathSync(tmpDir),tempRoot=fs.realpathSync(os.tmpdir());
 if(root===tempRoot||!root.startsWith(tempRoot+path.sep))throw new AppError('A private render directory is required.',400,'EDITOR_ASSET_OWNERSHIP_REQUIRED');
 const{data:asset,error}=await dataRepository.from('media_assets').select('*').eq('id',item.source_asset_id).eq('user_id',userId).maybeSingle();
 if(error||!asset||asset.source_type!=='PROJECT_SOURCE')return null;
 if(asset.storage_path!==key||!isValidUUID(asset.project_id))throw new AppError('The library source identity changed. Select it again.',409,'EDITOR_SOURCE_IDENTITY_REQUIRED');
 const load=()=>dataRepository.from('projects').select('*').eq('id',asset.project_id).eq('user_id',userId).maybeSingle();
 const initial=await load();if(initial.error||!initial.data||initial.data.source_storage_path!==key)throw new AppError('The project source changed. Select it again.',409,'EDITOR_SOURCE_IDENTITY_REQUIRED');
 const before=await headObject('source',key);
 if(!Number.isSafeInteger(before.size)||before.size<=0||before.size>EDITOR_OVERLAY_MAX_BYTES||!before.etag||before.etag.startsWith('W/'))throw new AppError('This source cannot be prepared within the editor asset budget.',409,'EDITOR_SOURCE_UNAVAILABLE');
 const ext=path.extname(key).toLowerCase();if(!/^\.(mp4|mov|mkv|webm|m4v)$/.test(ext))throw new AppError('This source format needs separate media preparation.',409,'EDITOR_SOURCE_UNAVAILABLE');
 const child=fs.mkdtempSync(path.join(root,'project-source-'));const file=path.join(child,crypto.randomUUID()+ext);
 try{
  const download=await downloadObjectToFile('source',key,file,{timeoutMs:EDITOR_OVERLAY_TIMEOUT_MS,requireStreamingSha256:true,requireSnapshotReceipt:true,expectedObject:{size:before.size,etag:before.etag,versionId:before.versionId},maxBytes:EDITOR_OVERLAY_MAX_BYTES});
  const after=await headObject('source',key),current=await load(),digest=await computeFileStreamSha256(file);
  const{data:currentAsset,error:assetError}=await dataRepository.from('media_assets').select('*').eq('id',item.source_asset_id).eq('user_id',userId).maybeSingle();
  if(current.error||!current.data||current.data.source_storage_path!==key||assetError||!currentAsset||currentAsset.source_type!=='PROJECT_SOURCE'||currentAsset.project_id!==asset.project_id||currentAsset.storage_path!==key||before.versionId!==after.versionId||before.etag!==after.etag||before.size!==after.size||!sourceObjectReceiptMatches(download.sourceReceipt,key,after,digest)||download.sha256!==digest||fs.statSync(file).size!==before.size)throw new AppError('The source changed during preparation. Select it again.',409,'EDITOR_SOURCE_IDENTITY_REQUIRED');
  return file;
 }catch(error){fs.rmSync(child,{recursive:true,force:true});throw error;}
}
