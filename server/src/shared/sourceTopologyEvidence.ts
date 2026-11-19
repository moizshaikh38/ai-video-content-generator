/** Source topology is not a person track or a crop recommendation.
 * This admission boundary binds a diagnostic ledger to the existing item-plan
 * identity. It NEVER certifies detector accuracy, ownership or useful output.
 * No production planner/settings caller uses this developmental contract.
 */
import type {AutomaticPlanIdentity} from './itemAutomaticPlan.js';

export interface SourceTopologyIdentity {
  sourceAssetId:string;sourceVersion:string;sourceSha256:string;
  sourceWidth:number;sourceHeight:number;
  analysisVersion:number;analysisSourceStart:number;analysisSourceEnd:number;
  configurationFingerprint:string;
}
export interface SourceTopologyUnit {
  /** Interval-local camera/view identity, never a person/reidentification ID. */
  id:string;role:'shared-scene'|'independent-view'|'global-graphic'|'attachment'|'unknown';
  rect:{x:number;y:number;width:number;height:number};
  ownerId?:string;
}
export interface SourceTopologyEpoch {
  id:string;
  /** Absolute source seconds, not output timeline or analysis-local seconds. */
  start:number;end:number;
  evidenceKind:'manual'|'measured-candidate'|'procedural-fixture';
  evidenceReference:string;
  coverage:'complete-claimed'|'partial'|'not-sampled';
  /** Unknown/blended ownership cannot silently become opaque ownership. */
  ownership:'opaque-claimed'|'blended'|'unknown';
  units:SourceTopologyUnit[];
}
export interface SourceTopologyLedger {
  schemaVersion:1;identity:SourceTopologyIdentity;epochs:SourceTopologyEpoch[];
}
export type BoundSourceTopology = {
  status:'diagnostic-bound';
  /** Copy of the exact plan identity, including item/range/aspect binding. */
  planIdentity:AutomaticPlanIdentity;
  sourceSha256:string;
  epochs:SourceTopologyEpoch[];
  automaticInferenceVerified:false;
  usefulOutputVerified:false;
} | {status:'unavailable';reason:string};

const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(x:unknown):x is string=>typeof x==='string'&&x.trim().length>0&&x.length<=2048;
const member=(x:unknown,values:readonly string[]):boolean=>typeof x==='string'&&values.includes(x);
const hash=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const identityKeys=['sourceAssetId','sourceVersion','sourceWidth','sourceHeight','analysisVersion','analysisSourceStart','analysisSourceEnd','configurationFingerprint'] as const;

/** Caller supplies freshly verified bytes, not a hash read from the ledger.
 * Structural admission remains diagnostic even if all claims say measured and
 * complete. Semantic qualification requires independent evidence elsewhere.
 * Requires coverage of the full requested interval, splitting at source-layout
 * epochs; it does not interpolate an unknown gap or follow people across cuts.
 */
export function bindSourceTopologyLedger(ledger:unknown,plan:AutomaticPlanIdentity,verifiedSourceSha256:string):BoundSourceTopology {
  const fail=(reason:string):BoundSourceTopology=>({status:'unavailable',reason});
  if(!object(plan)||plan.schemaVersion!==1||!text(plan.itemId)||!text(plan.outputAspect)||!text(plan.sourceAssetId)||!text(plan.sourceVersion)||!text(plan.configurationFingerprint)||!Number.isInteger(plan.analysisVersion)||plan.analysisVersion<1||![plan.sourceWidth,plan.sourceHeight].every(x=>Number.isInteger(x)&&x>0)||![plan.sourceStart,plan.sourceEnd,plan.analysisSourceStart,plan.analysisSourceEnd].every(finite)||plan.analysisSourceStart<0||plan.sourceStart<plan.analysisSourceStart||plan.sourceEnd>plan.analysisSourceEnd||plan.sourceEnd<=plan.sourceStart||plan.analysisSourceEnd<=plan.analysisSourceStart)return fail('invalid-plan-identity');
  if(plan.analysisDuration!==undefined&&(!finite(plan.analysisDuration)||plan.analysisDuration<=0||Math.abs(plan.analysisDuration-(plan.analysisSourceEnd-plan.analysisSourceStart))>.000500001))return fail('invalid-plan-duration');
  if(!hash(verifiedSourceSha256))return fail('unverified-source-hash');
  if(!object(ledger)||ledger.schemaVersion!==1||!object(ledger.identity)||!Array.isArray(ledger.epochs)||!ledger.epochs.length||ledger.epochs.length>400)return fail('invalid-ledger');
  const id=ledger.identity;
  if(id.sourceSha256!==verifiedSourceSha256||identityKeys.some(k=>id[k]!==plan[k]))return fail('source-analysis-configuration-mismatch');
  const seenEpochs=new Set<string>();const scoped:SourceTopologyEpoch[]=[];
  let previousEnd:number|undefined;
  for(const raw of ledger.epochs){
    if(!object(raw)||!text(raw.id)||seenEpochs.has(raw.id)||!finite(raw.start)||!finite(raw.end)||raw.start<plan.analysisSourceStart||raw.end>plan.analysisSourceEnd||raw.end<=raw.start||previousEnd!==undefined&&raw.start<previousEnd)return fail('invalid-epoch-order-or-range');
    seenEpochs.add(raw.id);previousEnd=raw.end;
    if(!member(raw.evidenceKind,['manual','measured-candidate','procedural-fixture'])||!text(raw.evidenceReference)||!member(raw.coverage,['complete-claimed','partial','not-sampled'])||!member(raw.ownership,['opaque-claimed','blended','unknown'])||!Array.isArray(raw.units)||raw.units.length>100)return fail('invalid-epoch-evidence');
    if(raw.coverage==='complete-claimed'&&raw.units.length===0)return fail('empty-complete-claim');
    const units=new Map<string,SourceTopologyUnit>();
    for(const u of raw.units){
      if(!object(u)||!text(u.id)||units.has(u.id)||!member(u.role,['shared-scene','independent-view','global-graphic','attachment','unknown'])||!object(u.rect))return fail('invalid-source-unit');
      const r=u.rect;
      if(![r.x,r.y,r.width,r.height].every(finite)||(r.x as number)<0||(r.y as number)<0||(r.width as number)<=0||(r.height as number)<=0||(r.x as number)+(r.width as number)>plan.sourceWidth||(r.y as number)+(r.height as number)>plan.sourceHeight)return fail('source-unit-out-of-bounds');
      if(u.role==='attachment'?!text(u.ownerId):u.ownerId!==undefined)return fail('invalid-attachment-owner');
      units.set(u.id,u as unknown as SourceTopologyUnit);
    }
    for(const u of units.values())if(u.ownerId){const owner=units.get(u.ownerId);if(!owner||owner.id===u.id||!['shared-scene','independent-view','global-graphic'].includes(owner.role))return fail('dangling-or-nested-attachment-owner');const a=u.rect,b=owner.rect;if(a.x<b.x||a.y<b.y||a.x+a.width>b.x+b.width||a.y+a.height>b.y+b.height)return fail('attachment-outside-owner');}
    if(raw.end>plan.sourceStart&&raw.start<plan.sourceEnd)scoped.push({...structuredClone(raw as unknown as SourceTopologyEpoch),start:Math.max(raw.start,plan.sourceStart),end:Math.min(raw.end,plan.sourceEnd)});
  }
  let cursor=plan.sourceStart;
  for(const e of scoped){if(e.start!==cursor)return fail('requested-source-interval-not-covered');cursor=e.end;}
  if(cursor!==plan.sourceEnd)return fail('requested-source-interval-not-covered');
  return {status:'diagnostic-bound',planIdentity:structuredClone(plan),sourceSha256:verifiedSourceSha256,epochs:scoped,automaticInferenceVerified:false,usefulOutputVerified:false};
}
