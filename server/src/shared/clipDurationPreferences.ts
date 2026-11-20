import {AppError} from '../types/index.js';
export const CLIP_DURATION_PREFERENCES=['auto','0-30','15-30','30-60','60-90','60-120','120-180'] as const;
export type ClipDurationPreference=typeof CLIP_DURATION_PREFERENCES[number];
export function normalizeDurationPreference(value:unknown):ClipDurationPreference {
 if(value==null||value==='')return 'auto';
 if(!(CLIP_DURATION_PREFERENCES as readonly unknown[]).includes(value))throw new AppError('Choose a supported clip duration range.',400,'INVALID_CLIP_DURATION');
 return value as ClipDurationPreference;
}
/** 0-30 is a display bucket, never permission to emit zero-length/incomplete clips. */
export function configuredDurationTarget(value:ClipDurationPreference,fallback:{min:number;max:number;optimal:number}){
 const ranges:Record<string,{min:number;max:number;optimal:number}>={
  '0-30':{min:15,max:30,optimal:24},'15-30':{min:15,max:30,optimal:24},'30-60':{min:30,max:60,optimal:45},
  '60-90':{min:60,max:90,optimal:75},'60-120':{min:60,max:120,optimal:90},'120-180':{min:120,max:180,optimal:150}};
 return {...(ranges[value]||fallback)};
}
/** Shared prompt/preflight/final-selection bounds. Existing short-source review
 * exception applies only to short buckets, never a requested one/two-minute clip. */
export function effectiveClipDurationBounds(target:{min:number;max:number},sourceDuration?:number|null){
 const short=Number.isFinite(sourceDuration)&&Number(sourceDuration)>0&&Number(sourceDuration)<15;
 return {min:short&&target.min<30?2:Math.max(15,target.min),max:Math.min(180,target.max,Number.isFinite(sourceDuration)&&Number(sourceDuration)>0?Number(sourceDuration):Infinity)};
}
