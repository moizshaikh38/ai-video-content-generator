import type{ShotCompositionOptions}from './shotCompositionTypes.js';
import{candidateCompositionOptions}from './automaticLayoutCandidate.js';
import type{AutomaticLayoutPolicy}from './automaticLayoutPolicy.js';
/** Compatibility boundary: the caller still owns source range, freshness and
 * manual precedence. This is not an item-specific cache or persisted plan. */
export interface ShotPlanAnalysisInput {track:{raw_samples?:ShotCompositionOptions['rawSamples'];source_width?:number|null;source_height?:number|null;metadata?:Record<string,any>};candidate?:unknown;layoutPolicy?:AutomaticLayoutPolicy;duration:number}
export function shotPlanOptions(input:ShotPlanAnalysisInput):ShotCompositionOptions{
 const{track,candidate,layoutPolicy,duration}=input,m=track.metadata||{};
 return{...candidateCompositionOptions(candidate),...(m.automatic_gaming_review_enabled===true?{automaticGamingReview:m.automatic_gaming_evidence}:{}),layoutPolicy,allowConversationSplit:m.conversation_split_candidate===true,protectedContentRegions:m.protected_content_regions,automaticFitAspect:m.automatic_fit_aspect==='4:3'?'4:3':undefined,windowScope:m.shot_composition_window_scope==='shot'?'shot':'clip',rawSamples:track.raw_samples,sceneCuts:m.scene_cuts,duration,sourceWidth:track.source_width||1920,sourceHeight:track.source_height||1080};
}
