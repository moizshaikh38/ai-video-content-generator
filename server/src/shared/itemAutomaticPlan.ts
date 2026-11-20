import {normalizePanels}from './panelLayouts.js';
import type{ShotCompositionOptions}from './shotCompositionTypes.js';
export interface AutomaticPlanIdentity {
 schemaVersion:1;itemId:string;sourceAssetId:string;sourceVersion:string;analysisVersion:number;
 sourceStart:number;sourceEnd:number;analysisSourceStart:number;analysisSourceEnd:number;
 /** Analyzer duration can be rounded to milliseconds; source bounds remain exact. */
 analysisDuration?:number;
 sourceWidth:number;sourceHeight:number;outputAspect:string;configurationFingerprint:string;
}
export type AutomaticShotPlan=Array<{start:number;end:number;windowW:number;windowH:number;keyframes:Array<{time:number;centerX:number;centerY:number}>;kind:'group'|'solo'|'fit';split?:unknown;[key:string]:unknown}>;
export interface ItemAutomaticPlanInput {item:{id:string;source_start:number;source_end:number;source_asset_id?:string|null;crop?:unknown;panels?:unknown;framing_window?:unknown;tracker?:{enabled?:boolean};crop_config?:{layout_mode_source?:string}};identity:AutomaticPlanIdentity;analysisFresh:boolean;options:ShotCompositionOptions}
export type ItemAutomaticPlanResult={status:'ready';identity:AutomaticPlanIdentity;shots:AutomaticShotPlan}|{status:'bypassed'|'unavailable';reason:string};
export const MAX_ANALYSIS_DURATION_ROUNDING_SECONDS=.000500001;
const planDuration=(id:AutomaticPlanIdentity)=>id.analysisDuration??(id.analysisSourceEnd-id.analysisSourceStart);
const numberKeys=['analysisVersion','sourceStart','sourceEnd','analysisSourceStart','analysisSourceEnd','sourceWidth','sourceHeight'] as const;
export function validAutomaticPlanIdentity(v:unknown):v is AutomaticPlanIdentity {
 if(!v||typeof v!=='object'||Array.isArray(v))return false;const x=v as AutomaticPlanIdentity;
 return (x.analysisDuration===undefined||(Number.isFinite(x.analysisDuration)&&x.analysisDuration>0&&Math.abs(x.analysisDuration-(x.analysisSourceEnd-x.analysisSourceStart))<=MAX_ANALYSIS_DURATION_ROUNDING_SECONDS))&&x.schemaVersion===1&&['itemId','sourceAssetId','sourceVersion','outputAspect','configurationFingerprint'].every(k=>typeof(x as any)[k]==='string'&&(x as any)[k].length>0)&&numberKeys.every(k=>Number.isFinite(x[k]))&&Number.isInteger(x.analysisVersion)&&x.analysisVersion>0&&x.sourceWidth>0&&x.sourceHeight>0&&x.sourceStart>=0&&x.sourceEnd>x.sourceStart&&x.analysisSourceStart>=0&&x.analysisSourceEnd>x.analysisSourceStart&&x.sourceStart>=x.analysisSourceStart-1e-6&&x.sourceEnd<=x.analysisSourceEnd+1e-6;
}
/** Exact identity equality. Speed, text, audio and camera freeze are intentionally
 * absent: they do not change which source frames the layout describes. */
export function sameAutomaticPlanIdentity(a:unknown,b:unknown):boolean {
 if(!validAutomaticPlanIdentity(a)||!validAutomaticPlanIdentity(b))return false;
 const keys:Array<keyof AutomaticPlanIdentity>=['schemaVersion','itemId','sourceAssetId','sourceVersion','analysisVersion','sourceStart','sourceEnd','analysisSourceStart','analysisSourceEnd','analysisDuration','sourceWidth','sourceHeight','outputAspect','configurationFingerprint'];return keys.every(k=>a[k]===b[k]);
}
export function validAutomaticShotPlan(shots:unknown,duration:number):shots is AutomaticShotPlan {
 if(!Array.isArray(shots)||!shots.length||shots.length>400||!Number.isFinite(duration)||duration<=0)return false;
 let end=0;
 if(Math.abs(shots[shots.length-1]?.end-duration)>1e-6)return false;
 return shots.every(s=>{if(!s||typeof s!=='object'||Array.isArray(s)||![s.start,s.end,s.windowW,s.windowH].every(Number.isFinite)||s.start<0||s.end<=s.start||s.end>duration+1e-6||Math.abs(s.start-end)>1e-6||s.windowW<=0||s.windowW>1||s.windowH<=0||s.windowH>1||!['fit','solo','group'].includes(s.kind)||!Array.isArray(s.keyframes)||!s.keyframes.length||s.keyframes.length>400)return false;if(s.split){const p=s.split as any;if(![p.speaker1X,p.speaker2X,p.dividerX].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||p.focusPanels&&!normalizePanels(p.focusPanels))return false;}end=s.end;let time=-Infinity;return s.keyframes.every((k:any)=>{if(!k||typeof k!=='object'||Array.isArray(k))return false;const ok=[k.time,k.centerX,k.centerY].every(Number.isFinite)&&k.time>=s.start-1e-6&&k.time<=s.end+1e-6&&k.time>=time&&k.centerX>=s.windowW/2-1e-6&&k.centerX<=1-s.windowW/2+1e-6&&k.centerY>=s.windowH/2-1e-6&&k.centerY<=1-s.windowH/2+1e-6;time=k.time;return ok})});
}
/** Review boundary only. Caller must supply a genuine effective scene item and
 * source/config identity. It must never stamp identity onto an unrelated plan. */
export function resolveItemAutomaticPlan(input:ItemAutomaticPlanInput,compute:(options:ShotCompositionOptions)=>AutomaticShotPlan):ItemAutomaticPlanResult {
 const item=input.item;
 if(item.crop||item.panels||item.framing_window||item.tracker?.enabled||item.crop_config?.layout_mode_source==='user')return{status:'bypassed',reason:'manual-framing-precedence'};
 if(!input.analysisFresh)return{status:'unavailable',reason:'analysis-stale-or-unverified'};
 const id=input.identity;if(!validAutomaticPlanIdentity(id)||id.itemId!==item.id||id.sourceStart!==item.source_start||id.sourceEnd!==item.source_end||(item.source_asset_id&&item.source_asset_id!==id.sourceAssetId))return{status:'unavailable',reason:'item-source-identity-mismatch'};
 if(id.outputAspect!=='9:16')return{status:'bypassed',reason:'output-aspect-not-supported'};
 if(id.sourceWidth!==input.options.sourceWidth||id.sourceHeight!==input.options.sourceHeight||Math.abs(planDuration(id)-input.options.duration)>1e-6)return{status:'unavailable',reason:'analysis-geometry-range-mismatch'};
 const shots=compute(input.options);if(!validAutomaticShotPlan(shots,input.options.duration))return{status:'unavailable',reason:'invalid-computed-geometry'};
 return{status:'ready',identity:structuredClone(id),shots:structuredClone(shots)};
}
export function acceptItemAutomaticPlan(result:ItemAutomaticPlanResult,expected:AutomaticPlanIdentity):AutomaticShotPlan|null{return result.status==='ready'&&sameAutomaticPlanIdentity(result.identity,expected)&&validAutomaticShotPlan(result.shots,planDuration(expected))?structuredClone(result.shots):null}
