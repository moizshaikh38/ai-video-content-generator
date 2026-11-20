import {candidateAutoHookTitle} from '../../shared/autoHookTitle.js';
import {ensureRenderQuotaFence,assertTransactionalRenderQuota,type RenderQuotaPolicy} from './renderQuotaRepository.js';
import {editorRenderSnapshot} from '../../shared/editorRenderSnapshot.js';
import {assertPanelViewsAssigned} from '../../shared/panelLayouts.js';
import {validateRecord} from '../schemaValidation.js';
import {candidateCreationKey,candidatePreparationDigest,creationDigest,creationConflict,findCandidateCreation,type CandidateCreationIntent} from './candidateCreationRepository.js';
import type {Db,ClientSession} from 'mongodb';
import {freshCandidateOverlay} from '../../shared/freshClipPresentationDefaults.js';
import {selectionSourceReceiptMatches} from '../../shared/selectionSourceReceipt.js';
import {newCaptionDefaults} from '../../shared/newCaptionDefaults.js';
import crypto from 'node:crypto';
import { getMongoClient, getMongoDb } from '../mongoClient.js';
import { AppError, ClipAspectRatio, ClipCropMode } from '../../types/index.js';

export interface CandidateCreationPreparation {intent:CandidateCreationIntent; policy:unknown;buildEditor:(clip:any,transcript:any,preferences:any)=>any}
/** Shared immutable render template. Read errors propagate; no fallback source. */
export async function readCandidateCreationTemplate(db:Db, session:ClientSession,projectId:string,candidateId:string,userId:string,
  aspectRatio:ClipAspectRatio,cropMode:ClipCropMode,options?:{caption_enabled?:boolean;caption_style?:string;caption_config?:any}) {
      const project = await db.collection('projects').findOne({ id: projectId, user_id: userId }, { session });
      if (!project) throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
      if (!project.source_url || project.video_status === 'uploading') {
        throw new AppError('Project source video is not uploaded.', 409, 'SOURCE_VIDEO_NOT_FOUND');
      }
      const candidate = await db.collection('clip_candidates').findOne({
        id: candidateId, project_id: projectId, user_id: userId,
      }, { session });
      if (!candidate) throw new AppError('Clip candidate not found.', 404, 'CANDIDATE_NOT_FOUND');
      const transcript = await db.collection('transcripts').findOne({project_id:projectId,user_id:userId},{session});
      if (!transcript || !selectionSourceReceiptMatches(candidate.metadata?.selection_source_receipt,transcript,project.source_url)) {
        throw new AppError('Candidate source or transcript is stale or unverified. Review before creating a clip.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
      }
      const start = Number(candidate.start_seconds);
      const end = Number(candidate.end_seconds);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
        throw new AppError('Candidate timestamps are invalid.', 400, 'INVALID_TIMESTAMPS');
      }
      const candidateMeta = (candidate as any)?.metadata || {};
      const automaticDefault=project.clip_preferences?.framingDefaults?.version===1&&project.clip_preferences.framingDefaults.layout==='auto'&&String(cropMode)==='smart';
      const layoutMode = automaticDefault?'track':candidateMeta.layout_mode || 'track';
      // Candidates analyzed before provenance tracking carry no marker; treat
      // them as 'legacy_unknown' so their layout keeps historical precedence.
      const layoutModeSource = automaticDefault?'auto':candidateMeta.layout_mode_source || 'legacy_unknown';
      const captionPos = candidateMeta.caption_position || (layoutMode === 'split' ? 'center' : 'bottom');
      const coldOpen = (candidate as any)?.cold_open || candidateMeta.cold_open || null;
      const template = {
        project_id: projectId, candidate_id: candidateId, user_id: userId,
        start_seconds: start, end_seconds: end, duration_seconds: end - start,
        aspect_ratio: aspectRatio, crop_mode: cropMode, render_status: 'queued',
        crop_config: {
          mode: project.clip_preferences?.layoutPolicy?.defaultLayout==='fit'?'fit_blur':project.clip_preferences?.layoutPolicy?.defaultLayout==='fill'?'manual':cropMode,
          layoutPolicy:project.clip_preferences?.layoutPolicy,
          layout_mode: layoutMode,
          layout_mode_source: layoutModeSource,
        },
        caption_position: captionPos,
        caption_enabled: options?.caption_enabled !== undefined ? Boolean(options.caption_enabled) : true,
        // New captions use the house style. Explicit choices/config are preserved.
        caption_style: newCaptionDefaults(options?.caption_style,options?.caption_config,{freshSelection:true}).captionStyle,
        caption_config: newCaptionDefaults(options?.caption_style,options?.caption_config,{freshSelection:true}).captionConfig,
        // Carried for the automatic render headline (Opus-parity): burned at
        // render time unless an explicit overlay config opts out.
        title: (candidate as any)?.title || null,
        ...candidateAutoHookTitle(project.clip_preferences,candidate),
        ...(freshCandidateOverlay(candidateMeta)?{overlay_config:freshCandidateOverlay(candidateMeta)}:{}),
        cold_open: coldOpen,
        selection_source_receipt: candidateMeta.selection_source_receipt,
        source_storage_path: project.source_url, source_object_key: project.source_url,
        output_object_key: null, render_version: 1, editor_version: 1,
      };

      return {template,project,candidate,transcript};
}
async function fenceCreationInputs(db:Db,session:ClientSession,inputs:Awaited<ReturnType<typeof readCandidateCreationTemplate>>,owner:string){
  for(const [name,row] of [['projects',inputs.project],['clip_candidates',inputs.candidate],['transcripts',inputs.transcript]] as const){
    const filter=row._id!==undefined?{_id:row._id,user_id:owner}:{id:row.id,user_id:owner};
    const result=await db.collection(name).updateOne(filter,{$inc:{creation_admission_serial:1}},{session});
    if(result.matchedCount!==1)throw creationConflict();
  }
}
export async function prepareCandidateCreation(projectId:string,candidateId:string,userId:string,aspectRatio:ClipAspectRatio,cropMode:ClipCropMode,
  options:{caption_enabled?:boolean;caption_style?:string;caption_config?:any},creation:CandidateCreationPreparation){
  const db=await getMongoDb(),client=await getMongoClient(),session=client.startSession();
  try{return await session.withTransaction(async()=>{
    const prior=await findCandidateCreation(db,userId,creation.intent,session);if(prior)return prior;
    const inputs=await readCandidateCreationTemplate(db,session,projectId,candidateId,userId,aspectRatio,cropMode,options);
    await fenceCreationInputs(db,session,inputs,userId);
    const now=new Date(),plannedClipId=crypto.randomUUID();
    if(typeof creation.buildEditor!=='function')throw new AppError('The prepared Studio baseline is required.',503,'CREATION_BASELINE_REQUIRED');
    const initialEditor=creation.buildEditor({id:plannedClipId,...inputs.template,created_at:now,updated_at:now},inputs.transcript,inputs.project.clip_preferences);
    validateRecord('editor_projects',initialEditor);assertPanelViewsAssigned(initialEditor);
    if(initialEditor.clip_id!==plannedClipId||initialEditor.user_id!==userId||initialEditor.project_id!==projectId||initialEditor.version!==1)throw creationConflict();
    const editorInputIdentity=creationDigest({template:inputs.template,preferences:inputs.project.clip_preferences??null});
    const preparation=candidatePreparationDigest(inputs.template,creation.policy,initialEditor);
    await db.collection<any>('candidate_creations').insertOne({_id:candidateCreationKey(userId,creation.intent.id),user_id:userId,id:creation.intent.id,version:1,
      project_id:projectId,candidate_id:candidateId,fingerprint:creation.intent.fingerprint,state:'prepared',preparation,
      baseline_version:1,planned_clip_id:plannedClipId,initial_editor:JSON.parse(JSON.stringify(initialEditor)),editor_input_identity:editorInputIdentity,
      snapshot:JSON.parse(JSON.stringify(inputs.template)),policy:JSON.parse(JSON.stringify(creation.policy)),created_at:new Date()},{session});
    return{status:'ok',prepared:true,creationId:creation.intent.id,preparation};
  },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10000});}
  catch(error){const prior=await findCandidateCreation(db,userId,creation.intent);if(prior)return prior;throw error;}
  finally{await session.endSession();}
}

/** Verify relationships and create clip plus initial render job in one transaction. */
export async function createClipWithJob(projectId: string, candidateId: string, userId: string,
  aspectRatio: ClipAspectRatio, cropMode: ClipCropMode,
  options?: { caption_enabled?: boolean; caption_style?: string; caption_config?: any },creation?:CandidateCreationPreparation,quotaPolicy?:RenderQuotaPolicy) {
  const client = await getMongoClient();
  const db = await getMongoDb();
  await ensureRenderQuotaFence(db,userId);
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      let prepared:any;
      if(creation){
        const prior=await findCandidateCreation(db,userId,creation.intent,session);
        if(prior?.clip)return prior;
        if(prior?.cancelled)throw new AppError('This creation request was closed. No clip was created for this key.',409,'CREATION_INTENT_CANCELLED');
        if(!prior?.prepared||!creation.intent.preparation||prior.preparation!==creation.intent.preparation)throw creationConflict();
        prepared=await db.collection<any>('candidate_creations').findOne({_id:candidateCreationKey(userId,creation.intent.id),user_id:userId},{session});
        if(prepared?.baseline_version!==1)throw new AppError('This older preparation has no admitted Studio baseline. Resolve it before preparing a new request.',409,'CREATION_BASELINE_REQUIRED');
      }
      const inputs=await readCandidateCreationTemplate(db,session,projectId,candidateId,userId,aspectRatio,cropMode,options);
      if(creation){
        if(candidatePreparationDigest(inputs.template,creation.policy,prepared.initial_editor)!==creation.intent.preparation||creationDigest({template:inputs.template,preferences:inputs.project.clip_preferences??null})!==prepared.editor_input_identity)throw new AppError('Candidate, source, project defaults or plan choices changed. Resolve the prepared request before starting a new clip.',409,'CREATION_INPUT_CHANGED');
        await fenceCreationInputs(db,session,inputs,userId);
      }
      const {candidate}=inputs;
      const now=new Date();
      await assertTransactionalRenderQuota(db,session,userId,quotaPolicy,now);
      const template=creation?JSON.parse(JSON.stringify(inputs.template)):inputs.template;
      const clip={id:creation?prepared.planned_clip_id:crypto.randomUUID(),...template,created_at:now,updated_at:now};
      const initialEditor=creation?{...prepared.initial_editor,created_at:new Date(prepared.initial_editor.created_at),updated_at:new Date(prepared.initial_editor.updated_at)}:null;
      if(initialEditor){validateRecord('editor_projects',initialEditor);assertPanelViewsAssigned(initialEditor);}
      const renderJob = {
        id: crypto.randomUUID(), clip_id: clip.id, user_id: userId,
        status: 'queued', progress: 0, stage: 'queued', attempts: 0,
        ...(creation?{render_version:1,editor_version:1,admission_version:1,editor_project_snapshot:editorRenderSnapshot(initialEditor),worker_id:null,locked_at:null,max_attempts:3,next_retry_at:null}:{}),
        created_at: now, updated_at: now,
      };
      await db.collection('clips').insertOne(clip, { session });
      if(initialEditor)await db.collection('editor_projects').insertOne(initialEditor,{session});
      await db.collection('render_jobs').insertOne(renderJob, { session });
      if (candidate.status === 'suggested') await db.collection('clip_candidates').updateOne({
        id: candidateId, project_id: projectId, user_id: userId, status: 'suggested',
      }, { $set: { status: 'selected', updated_at: now } }, { session });
      const receipt={
        clip: { ...clip, created_at: now.toISOString(), updated_at: now.toISOString() },
        renderJob: { ...renderJob, created_at: now.toISOString(), updated_at: now.toISOString() },
      };
      if(creation){
        const stored=await db.collection<any>('candidate_creations').updateOne({_id:candidateCreationKey(userId,creation.intent.id),user_id:userId,state:'prepared',preparation:creation.intent.preparation,fingerprint:creation.intent.fingerprint},
          {$set:{state:'admitted',receipt,updated_at:now}},{session});
        if(stored.matchedCount!==1)throw creationConflict();
      }
      return{...receipt,...(creation?{creationId:creation.intent.id,preparation:creation.intent.preparation,replayed:false}:{})};
    },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10000});
  } catch(error){
    if(creation){const prior=await findCandidateCreation(db,userId,creation.intent);if(prior?.clip)return prior;}
    throw error;
  } finally {
    await session.endSession();
  }
}
