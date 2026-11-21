import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import{getMongoDb}from'../db/mongoClient.js';import{persistGenreProjectUpdate}from'../db/repositories/genreProjectRepository.js';
import{applySemanticGenreReceipt}from'../shared/semanticGenreEvidence.js';import{sourceObjectReceiptMatches,type SourceObjectReceipt}from'../shared/sourceObjectReceipt.js';
import{GenreIntelligenceService as G}from'./genreIntelligenceService.js';import{assertTranscriptReusable}from'./transcriptSourceBindingService.js';
import{ClipRenderService}from'./clipRenderService.js';import{headObject}from'./objectStorageService.js';import{reviewSourceGenreFree}from'./sourceGenreReviewService.js';import{config}from'../config/index.js';import{AppError}from'../types/index.js';import{logger}from'../utils/logger.js';
/** An explicit free-mode analysis may enrich an old, valid transcript without
 * repeating STT or charging transcription credits. Valid receipts are reused. */
export async function refreshStoredGenreReview(userId:string,projectId:string):Promise<'disabled'|'manual'|'reused'|'unavailable'|'reviewed'>{
 if(process.env.VIREO_AUTO_GENRE_REVIEW!=='free')return'disabled';
 const db=await getMongoDb(),project=await db.collection('projects').findOne({id:projectId,user_id:userId});
 if(!project)return'unavailable';if(project.clip_preferences?.genreSelectionMode==='manual')return'manual';
 const transcript=await db.collection('transcripts').findOne({project_id:projectId,user_id:userId});
 const duration=Number(transcript?.duration_seconds),text=transcript?.transcript_text;
 if(!transcript||typeof text!=='string'||!text||!Number.isFinite(duration)||duration<3||duration>7200)return'unavailable';
 await assertTranscriptReusable(transcript,project.source_url||'');
 const sha=transcript.source_binding?.source_receipt?.sha256;
 const base=G.classifyVideoGenreLocally({transcriptText:text});
 if(applySemanticGenreReceipt(base,project.semantic_genre_receipt,sha,duration,text).semanticEvidence)return'reused';
 if(!config.openrouterApiKey)return'unavailable';
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vireo-retained-genre-')),source=path.join(dir,'source.mp4'),snapshot:{receipt?:SourceObjectReceipt}={};
 try{
  await ClipRenderService.ensureSourceVideo(project.source_url,source,{snapshotOut:snapshot});
  if(snapshot.receipt?.sha256!==sha)throw new AppError('Source changed before genre review.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
  const receipt=await reviewSourceGenreFree({source,transcriptText:text,transcriptSegments:transcript.segments,out:path.join(dir,'review'),apiKey:config.openrouterApiKey,model:process.env.VIREO_AUTO_GENRE_MODEL||'nvidia/nemotron-3.5-super-vl:free'});
  if(receipt.sourceSha256!==sha||!sourceObjectReceiptMatches(snapshot.receipt,project.source_url,await headObject('source',project.source_url)))throw new AppError('Source changed during genre review.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
  const freshTranscript=await db.collection('transcripts').findOne({project_id:projectId,user_id:userId});
  if(freshTranscript?.transcript_text!==text||Number(freshTranscript?.duration_seconds)!==duration)throw new AppError('Transcript changed during genre review.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
  const suggestion=applySemanticGenreReceipt(base,receipt,sha,duration,text);
  const payload:Record<string,unknown>={semantic_genre_receipt:receipt,updated_at:new Date()};
  if(project.clip_preferences)payload.clip_preferences={...project.clip_preferences,suggested_genre:suggestion.genre,genre_confidence:suggestion.confidence,genre_evidence:suggestion.evidence,genre_semantic_evidence:suggestion.semanticEvidence,genre_review_status:suggestion.semanticEvidence?.status==='suggested'?'suggested':'review-required'};
  await persistGenreProjectUpdate(userId,projectId,project.source_url,project.clip_preferences,payload);
  return'reviewed';
 }catch(error:any){if(error?.code==='TRANSCRIPT_SOURCE_REVIEW_REQUIRED')throw error;logger.warn('Optional retained-source genre review unavailable; no transcription repeated.',{code:'GENRE_REVIEW_UNAVAILABLE'});return'unavailable';}
 finally{await fs.rm(dir,{recursive:true,force:true});}
}
