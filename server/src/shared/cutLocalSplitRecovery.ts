import type {AutomaticLayoutPolicy} from './automaticLayoutPolicy.js';
interface Scene {start:number;end:number;split?:unknown;contextStatus?:string;uncertainty?:string;[key:string]:unknown}
/** Recover only an aligned, already body-gated shot proposal. This is geometry,
 * not a human/animation or speaker classifier. Keep every other baseline byte.
 * Callers own current source binding, detector provenance and shot eligibility. */
export function recoverCutLocalSplits<T extends Scene>(baseline:T[],candidate:T[],policy?:AutomaticLayoutPolicy):T[]{
 if(policy&&!policy.allowed.includes('split'))return baseline;
 if(!baseline.length||baseline.length!==candidate.length||baseline.some((s,i)=>Math.abs(s.start-candidate[i].start)>.001||Math.abs(s.end-candidate[i].end)>.001))return baseline;
 return baseline.map((shot,i)=>{
  const proposed=candidate[i];
  if(!proposed.split)return shot;
  return {...proposed,cutLocalRecovery:{version:1,kind:'measured-pair'},contextStatus:'unresolved-review-required',uncertainty:'Measured scene-local two-subject Split. Human identity, animation, speech and between-sample movement are not verified. Review or repair this scene.'};
 });
}
