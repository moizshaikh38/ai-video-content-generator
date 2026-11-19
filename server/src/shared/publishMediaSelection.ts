import {AppError} from '../types/index.js';

export interface PublishMediaSelection {
  version:1;clipId:string;owner:string;projectId:string;objectKey:string;
  renderVersion:number|null;editorVersion:number|null;renderedEditorVersion:number|null;renderedEditorDigest:string|null;
  bytes:number;etag:string;objectVersionId:string|null;
}
const changed=()=>new AppError('The video selected for this post changed. Review the post and choose its video again; no different render was published.',409,'PUBLISH_MEDIA_CHANGED');
const revision=(v:any):number|null=>v===undefined||v===null?null:Number.isSafeInteger(v)&&v>0?v:NaN;
export function selectPublishMedia(clip:any,head:{size:number;etag?:string;versionId?:string}):PublishMediaSelection {
  if(!clip||clip.render_status!=='ready'||typeof clip.output_storage_path!=='string'||!clip.output_storage_path||
    ![clip.id,clip.user_id,clip.project_id].every(v=>typeof v==='string'&&!!v)||
    !Number.isSafeInteger(head.size)||head.size<=0||typeof head.etag!=='string'||!head.etag.trim()||head.etag.startsWith('W/'))throw new AppError('The selected video could not be verified in storage. No post was queued.',503,'PUBLISH_MEDIA_UNVERIFIED');
  const result:PublishMediaSelection={version:1,clipId:clip.id,owner:clip.user_id,projectId:clip.project_id,objectKey:clip.output_storage_path,
    renderVersion:revision(clip.render_version),editorVersion:revision(clip.editor_version),renderedEditorVersion:revision(clip.rendered_editor_version),
    renderedEditorDigest:clip.rendered_editor_digest??null,bytes:head.size,etag:head.etag,objectVersionId:typeof head.versionId==='string'&&head.versionId.trim()&&head.versionId!=='null'?head.versionId:null};
  if([result.renderVersion,result.editorVersion,result.renderedEditorVersion].some(v=>v!==null&&!Number.isSafeInteger(v))||
    (result.renderedEditorDigest!==null&&(typeof result.renderedEditorDigest!=='string'||!/^[a-f0-9]{64}$/.test(result.renderedEditorDigest))))throw changed();
  const attemptPrefix=`users/${result.owner}/projects/${result.projectId}/clips/${result.clipId}/v${result.renderVersion}/attempts/`;
  const immutableAttempt=result.renderVersion!==null&&result.objectKey.startsWith(attemptPrefix)&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/render\.mp4$/i.test(result.objectKey.slice(attemptPrefix.length));
  if(!result.objectVersionId&&!immutableAttempt)throw new AppError('This older video output has no immutable publish identity. It was not queued or re-rendered. Review its publish selection before trying again.',409,'PUBLISH_MEDIA_UNPINNABLE');
  return result;
}
/** New posts are pinned. Legacy posts without this field keep their old path;
 * never backfill a selected output from today's mutable clip pointer. */
export function assertPublishMediaSelection(post:any,clip:any):PublishMediaSelection|null {
  const value=post.media_selection;
  if(value===undefined)return null;
  if(!value||value.version!==1||value.owner!==post.user_id||value.clipId!==post.clip_id||value.projectId!==post.project_id||
    !clip||clip.user_id!==value.owner||clip.project_id!==value.projectId||clip.id!==value.clipId||clip.render_status!=='ready'||
    clip.output_storage_path!==value.objectKey||revision(clip.render_version)!==value.renderVersion||revision(clip.editor_version)!==value.editorVersion||
    revision(clip.rendered_editor_version)!==value.renderedEditorVersion||(clip.rendered_editor_digest??null)!==value.renderedEditorDigest||
    !Number.isSafeInteger(value.bytes)||value.bytes<=0||typeof value.etag!=='string'||!value.etag.trim()||
    (value.objectVersionId!==null&&typeof value.objectVersionId!=='string'))throw changed();
  try{selectPublishMedia(clip,{size:value.bytes,etag:value.etag,versionId:value.objectVersionId??undefined});}catch{throw changed();}
  return value;
}
export function assertPublishObjectSelection(selection:PublishMediaSelection|null,head:{size:number;etag?:string;versionId?:string}):void {
  if(selection&&(head.size!==selection.bytes||head.etag!==selection.etag||(selection.objectVersionId!==null&&head.versionId!==selection.objectVersionId)))throw changed();
}
