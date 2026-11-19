import type {Db} from 'mongodb';
import {AppError} from '../../types/index.js';
import type {TranscriptionProvider} from './transcriptionProvider.js';
import {OpenRouterTranscriptionProvider,MAI_MODEL} from './openRouterTranscriptionProvider.js';

export const TIER_POLICY = 'free-turbo-paid-mai-v1';
export const TURBO_MODEL = 'openai/whisper-large-v3-turbo';
export interface TierTranscriptionSelection {
  policy: typeof TIER_POLICY;
  planId: 'free' | 'creator' | 'pro' | 'studio' | 'developer';
  model: typeof TURBO_MODEL | typeof MAI_MODEL;
}
/** Input must come from the server's canonical entitlement resolver, not a DTO. */
export function selectTierTranscription(planId: unknown): TierTranscriptionSelection {
  if (!['free','creator','pro','studio','developer'].includes(String(planId))) {
    throw new AppError('The transcription entitlement could not be verified. No audio was sent.',409,'TRANSCRIPTION_ENTITLEMENT_REVIEW_REQUIRED');
  }
  return {policy:TIER_POLICY,planId:planId as TierTranscriptionSelection['planId'],model:['creator','pro','studio'].includes(String(planId)) ? MAI_MODEL : TURBO_MODEL};
}
export function readTierSelection(value: unknown): TierTranscriptionSelection {
  const v=value as TierTranscriptionSelection;
  if (!v || v.policy!==TIER_POLICY || selectTierTranscription(v.planId).model!==v.model) {
    throw new AppError('The saved transcription selection needs review. No new provider was selected.',409,'TRANSCRIPTION_POLICY_REVIEW_REQUIRED');
  }
  return v;
}
/** Persist before audio transmission; upgrade/downgrade cannot switch a retry's
 * model or cause a paid re-transcription of a reusable transcript. */
export async function freezeTierSelection(db:Db,userId:string,attemptId:string|undefined,resolvePlan:()=>Promise<unknown>):Promise<TierTranscriptionSelection> {
  if (!attemptId) throw new AppError('A verified processing attempt is required for tiered transcription.',409,'TRANSCRIPTION_POLICY_REVIEW_REQUIRED');
  const collection=db.collection('credit_reservations'),filter={user_id:userId,attempt_id:attemptId};
  const before=await collection.findOne(filter);
  if (!before) throw new AppError('Processing reservation was not found. No audio was sent.',409,'TRANSCRIPTION_POLICY_REVIEW_REQUIRED');
  if (before.metadata?.transcriptionPolicy !== undefined) return readTierSelection(before.metadata.transcriptionPolicy);
  const choice=selectTierTranscription(await resolvePlan());
  await collection.updateOne({...filter,'metadata.transcriptionPolicy':{$exists:false}},{$set:{'metadata.transcriptionPolicy':choice}},{writeConcern:{w:'majority'}});
  const saved=await collection.findOne(filter);
  return readTierSelection(saved?.metadata?.transcriptionPolicy);
}
export function createTierTranscriptionProvider(selection:TierTranscriptionSelection):TranscriptionProvider {
  const choice=readTierSelection(selection),delegate=new OpenRouterTranscriptionProvider(choice.model);
  return {name:'openrouter',allowWholeFileFallback:false,async transcribeAudio(audio,fileName,mimeType,options){
    // No silent premium-to-budget fallback. MAI uses automatic language detection
    // and verbatim text, retaining mid-utterance Hindi/English rather than translating.
    const result=await delegate.transcribeAudio(audio,fileName,mimeType,options);
    return {...result,provenance:{...result.provenance!,routing_policy:choice.policy,plan_at_selection:choice.planId}};
  }};
}
