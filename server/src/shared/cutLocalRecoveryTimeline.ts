/** Incremental measured cut-local recovery is qualified only on an unedited,
 * speed-one 30fps single-source timeline. Manual picture choices remain owned
 * by their existing channels. Never turn an unsupported recovery into a split. */
export function cutLocalRecoveryTimelineEligible(project:any,clipStart:number,duration:number):boolean{
 const items=(project?.tracks||[]).filter((t:any)=>t.type==='VIDEO'&&!t.hidden).flatMap((t:any)=>t.items||[]).filter((i:any)=>!i.hidden);
 if(items.length!==1||(project.canvas?.fps||30)!==30)return false;
 const i=items[0];return !i.is_title_card&&!i.is_freeze&&!i.transition_in&&(!i.keyframes?.length)&&(i.speed?.speed??1)===1&&
 [i.source_start,i.source_end,i.timeline_start,i.timeline_end,clipStart,duration].every(Number.isFinite)&&
 Math.abs(i.source_start-clipStart)<.001&&Math.abs(i.source_end-clipStart-duration)<.001&&Math.abs(i.timeline_start)<.001&&Math.abs(i.timeline_end-duration)<.001&&
 (i.transform?.scale??1)===1&&(i.transform?.rotation??0)===0&&(i.transform?.position_x??0)===0&&(i.transform?.position_y??0)===0;
}
export function boundCutLocalRecoveryPlan<T extends {split?:unknown;uncertainty?:string;[key:string]:any}>(plan:T[]|null|undefined,eligible:boolean):T[]|null|undefined{
 if(eligible||!plan)return plan;
 return plan.map(s=>s.split&&s.cutLocalRecovery?.version===1&&s.cutLocalRecovery?.kind==='measured-pair'?{...s,split:undefined,kind:'fit',windowW:1,windowH:1,keyframes:[{time:s.start,centerX:.5,centerY:.5}],contextStatus:'unresolved-review-required',uncertainty:'Cut-local Split recovery is not qualified for edited, speed-changed or multi-item timelines. Automatic Fit fallback; manual framing remains available.'}:s);
}
