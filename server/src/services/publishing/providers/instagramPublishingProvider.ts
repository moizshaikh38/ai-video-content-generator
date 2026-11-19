import {AppError} from '../../../types/index.js';
import {META_GRAPH_BASE} from '../../social/metaGraphVersion.js';
import type {SocialPublishingProvider,PlatformPublishCapabilities,PublishExecutionRequest,PublishExecutionResult} from '../types.js';

/** Native Facebook Login flow. A container is durable preparation, not a post.
 * Only the worker's checkpointed continuation may call media_publish once. */
export class InstagramPublishingProvider implements SocialPublishingProvider {
  readonly platform='instagram' as const;
  readonly pendingMaxDurationMs=5*60*1000;
  getCapabilities():PlatformPublishCapabilities {
    return {supportsVideo:true,supportsTextOnly:false,maxDescriptionLength:2200,maxVideoDurationSeconds:900,
      maxVideoSizeBytes:1024*1024*1024,supportedMediaFormats:['mp4','mov'],supportsScheduling:true,
      notes:'Requires a selected Instagram Professional account, Facebook Login app approval and instagram_content_publish authorization. Processing confirmation can remain pending.'};
  }
  validatePublishRequest(payload:any,hasMedia:boolean):{valid:boolean;errors:string[]} {
    const errors:string[]=[];
    if(!hasMedia)errors.push('Instagram Reels publishing requires a rendered video clip.');
    const caption=payload.caption||payload.description||'';
    if(caption.length>2200)errors.push('Instagram caption cannot exceed 2200 characters.');
    if(payload.privacy!=='public')errors.push('Instagram cannot be posted as private or unlisted by this integration. Explicitly choose public/account audience.');
    return {valid:!errors.length,errors};
  }
  private id(value:unknown,code='INSTAGRAM_CONTAINER_UNVERIFIED'):string {
    if(typeof value!=='string'||!/^\d+$/.test(value))throw new AppError('Instagram did not return a usable selected account or receipt ID.',502,code);
    return value;
  }
  private async graph(token:string,path:string,params?:Record<string,string>):Promise<any> {
    const response=await fetch(`${META_GRAPH_BASE}/${path}`,{
      method:params?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Bearer ${token}`,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
      ...(params?{body:new URLSearchParams(params).toString()}:{}),
    });
    const data=await response.json();
    if(!response.ok||data?.error)throw new AppError('Instagram request could not be confirmed. The saved container will not be re-uploaded.',response.status>=500?502:400,'INSTAGRAM_REQUEST_UNCONFIRMED');
    return data;
  }
  async publish(request:PublishExecutionRequest):Promise<PublishExecutionResult> {
    const validation=this.validatePublishRequest(request.payload,Boolean(request.mediaUrl));
    if(!validation.valid)throw new AppError(validation.errors.join(' '),400,'INSTAGRAM_VISIBILITY_UNSUPPORTED');
    const account=this.id(request.providerAccountId,'INSTAGRAM_ACCOUNT_REQUIRED');
    if(!request.grantedScopes?.includes('instagram_content_publish'))throw new AppError('Instagram publishing permission is missing. No post was sent.',403,'INSTAGRAM_PUBLISH_SCOPE_REQUIRED');
    const current=await this.graph(request.accessToken,`${account}?fields=id,username`);
    if(current.id!==account||typeof current.username!=='string'||!current.username.trim())throw new AppError('Selected Instagram account could not be verified. No replacement account will be used.',409,'INSTAGRAM_ACCOUNT_UNVERIFIED');
    const data=await this.graph(request.accessToken,`${account}/media`,{media_type:'REELS',video_url:request.mediaUrl!,caption:request.payload.caption||request.payload.description||request.payload.title||''});
    const receipt=this.id(data.id);
    return {outcome:'pending',providerPostId:receipt,metadata:{creationId:receipt,selectedAccountId:account,confirmation:'container_created',publishDispatchStarted:false}};
  }
  /** Read-only reconciliation, including after an uncertain media_publish response. */
  async resolvePending(token:string,receiptId:string):Promise<PublishExecutionResult> {
    const receipt=this.id(receiptId);
    const data=await this.graph(token,`${receipt}?fields=status_code,status`),state=data.status_code;
    if(state==='ERROR'||state==='EXPIRED')throw new AppError('Instagram reported that the saved container failed or expired. No automatic new upload will be made.',409,'INSTAGRAM_SUBMISSION_FAILED');
    if(!['FINISHED','IN_PROGRESS','PUBLISHED'].includes(state))throw new AppError('Instagram returned an unrecognized container state.',502,'INSTAGRAM_STATUS_UNVERIFIED');
    // The container state proves publication but does not supply its media ID.
    // Preserve that distinction and never manufacture a permalink or media ID.
    return {outcome:state==='PUBLISHED'?'published':'pending',providerPostId:receipt,providerPostUrl:null,
      metadata:{creationId:receipt,confirmation:state,...(state==='PUBLISHED'?{providerIdKind:'container_receipt',publicationVerified:true,captionAttachmentVerified:false}: {})}};
  }
  async continuePending(request:PublishExecutionRequest,receiptId:string,metadata:Record<string,any>,checkpoint:(metadata:Record<string,any>)=>Promise<void>):Promise<PublishExecutionResult> {
    const account=this.id(request.providerAccountId,'INSTAGRAM_ACCOUNT_REQUIRED'),receipt=this.id(receiptId);
    if(metadata.selectedAccountId!==account||metadata.creationId!==receipt)throw new AppError('Saved Instagram container is not bound to this selected account.',409,'INSTAGRAM_SUBMISSION_BINDING_CHANGED');
    if(!request.grantedScopes?.includes('instagram_content_publish'))throw new AppError('Instagram publishing permission is missing. Existing container needs review.',403,'INSTAGRAM_PUBLISH_SCOPE_REQUIRED');
    const status=await this.resolvePending(request.accessToken,receipt);
    if(status.outcome==='published'||status.metadata?.confirmation!=='FINISHED')return {...status,metadata:{...metadata,...status.metadata}};
    if(metadata.publishDispatchStarted)return {...status,metadata:{...metadata,...status.metadata,confirmation:'publish_outcome_unknown'}};
    // Persist this irreversible boundary BEFORE the external call. A crash in
    // either direction never authorizes a second media_publish request.
    const started={...metadata,publishDispatchStarted:true,confirmation:'publish_dispatch_started'};
    await checkpoint(started);
    const data=await this.graph(request.accessToken,`${account}/media_publish`,{creation_id:receipt});
    const mediaId=this.id(data.id,'INSTAGRAM_PUBLISH_UNVERIFIED');
    const warnings=[data.config_issue,data.caption_add_on_attachment_status].filter(v=>typeof v==='string'&&v.length<256);
    return {outcome:'published',providerPostId:mediaId,providerPostUrl:null,metadata:{...started,instagramMediaId:mediaId,providerIdKind:'media_id',confirmation:'media_publish_id',
      publicationVerified:true,captionAttachmentVerified:!data.config_issue,partialSuccess:warnings.length>0,warnings}};
  }
  isRetryableError(error:any):boolean{return error?.statusCode>=500||error?.status>=500;}
  normalizePublishError(error:any):{code:string;message:string;retryable:boolean}{return {code:error?.code||'INSTAGRAM_PUBLISH_FAILED',message:error instanceof Error?error.message:'Instagram outcome is unconfirmed',retryable:this.isRetryableError(error)};}
}
