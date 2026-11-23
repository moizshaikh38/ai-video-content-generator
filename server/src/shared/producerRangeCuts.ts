import crypto from 'node:crypto';
/** Producer cuts use absolute source seconds. Source seconds remain source seconds; union once
 * before deriving output duration or cut-local clocks. */
export type Range={start:number;end:number};
const q=(n:number)=>Number(n.toFixed(6));
export function cutUnion(ranges:Range[],start:number,end:number):Range[]{
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('invalid-source-window');
 const sorted=ranges.filter(r=>r&&Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start).map(r=>({start:Math.max(start,r.start),end:Math.min(end,r.end)})).filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start);
 const out:Range[]=[];for(const r of sorted){const p=out.at(-1);if(p&&r.start<=p.end)p.end=Math.max(p.end,r.end);else out.push({...r});}return out;
}
export function retained(ranges:Range[],start:number,end:number):Range[]{const cuts=cutUnion(ranges,start,end);let a=start;const out:Range[]=[];for(const r of cuts){if(r.start>a)out.push({start:a,end:r.start});a=r.end;}if(a<end)out.push({start:a,end});return out;}
export function cutClock(t:number,cuts:Range[]):number{return q(t-cuts.reduce((n,r)=>n+Math.max(0,Math.min(t,r.end)-r.start),0));}
export function mapMain(ranges:Range[],main:{source_start:number;source_end:number;timeline_start:number;timeline_end:number}){
 const {source_start:start,source_end:end,timeline_start:offset,timeline_end}=main;
 if(![start,end,offset,timeline_end].every(Number.isFinite)||start<0||offset<0||Math.abs(timeline_end-offset-(end-start))>.000001)throw Error('nonlinear-main');
 const cuts=cutUnion(ranges,start,end),total=cuts.reduce((n,r)=>n+r.end-r.start,0);
 if(end-start-total<1)throw Error('short-main');
 const timelineCuts=cuts.map(r=>({start:q(offset+r.start-start),end:q(offset+r.end-start)}));
 const slices=retained(cuts,start,end).map(r=>({source_start:r.start,source_end:r.end,timeline_start:cutClock(q(offset+r.start-start),timelineCuts),timeline_end:cutClock(q(offset+r.end-start),timelineCuts)}));
 if(slices.some(s=>s.timeline_end-s.timeline_start<.1-1e-6))throw Error('short-slice');
 return {cuts,timelineCuts,slices,total:q(total),mainDuration:q(end-start-total)};
}
export function rebaseWord<T extends {start:number;end:number;originalTimedParts?:any[]}>(word:T,cuts:Range[]):T{
 if(!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.end<=word.start||cuts.some(r=>word.start<r.end&&word.end>r.start))throw Error('speech-intersection');
 return {...word,start:cutClock(word.start,cuts),end:cutClock(word.end,cuts),...(word.originalTimedParts?{originalTimedParts:word.originalTimedParts.map(p=>rebaseWord(p,cuts))}:{})};
}
export function splitScaleKey(key:{time:number;value:number},main:any,mapping:ReturnType<typeof mapMain>){
 const a=main.source_start+key.time,b=a+2.5;
 if(mapping.cuts.some(r=>a<r.end&&b>r.start))throw Error('punch-crosses-cut');
 return mapping.slices.map(s=>a>=s.source_start&&a<s.source_end?{...key,time:q(a-s.source_start)}:undefined);
}

export function cutProducerProject(project:any,main:any,ranges:Range[],words:Array<{start:number;end:number}>,saved:boolean){
 const before=JSON.stringify(project);const mapping=mapMain(ranges,main);if(!mapping.cuts.length)throw Error('no-selected-cut');
 if(!words.length)throw Error('word-evidence-required');
 if(words.some(w=>mapping.cuts.some(r=>w.start<r.end&&w.end>r.start)))throw Error('speech-intersection');
 const primary=project.tracks.find((t:any)=>t.type==='VIDEO'&&!t.hidden);
 if(!primary?.items.includes(main)||main.locked||primary.locked||main.is_freeze||main.is_title_card)throw Error('unsupported-main');
 if(Math.abs(project.canvas.duration-main.timeline_end)>.001)throw Error('canvas-main-mismatch');
 const all=project.tracks.flatMap((t:any)=>t.items.map((item:any)=>({item,track:t})));
 for(const {item:i,track:t}of all){
  if(![i.timeline_start,i.timeline_end,i.source_start,i.source_end].every(Number.isFinite)||i.timeline_start<0||i.timeline_end<=i.timeline_start)throw Error('invalid-item-clock');
  if(i.type==='CAPTION'&&i.timeline_start>0&&(i.caption?.cues||[]).some((c:any)=>c.start<i.timeline_start-.05))throw Error('relative-caption-clock');
  if(i.timeline_end<=mapping.timelineCuts[0].start)continue;
  if(t.locked||i.locked||i.is_freeze||i.is_title_card||i.speed?.speed_ramp||(i.speed?.speed??1)!==1||i.scene_layout_overrides?.length||i.tracker?.enabled||i.transition_in||i.transition_out||i.framing_window||i.manual_placement||i.manual_source_crop)throw Error('unsupported-clock');
  if(i.type==='VIDEO'&&i!==main)throw Error('secondary-picture');
  if(i.keyframes?.length&&(i!==main||saved||i.keyframes.length!==1||i.keyframes[0].property!=='scale'))throw Error('saved-keyframes');
 }
 const cuts=mapping.timelineCuts;const mapCue=(c:any)=>{
  const shift=(list:any[])=>list.map(w=>rebaseWord(w,cuts));
  if(!c.words?.length&&!c.tokens?.length&&cuts.some(r=>c.start<r.end&&c.end>r.start))throw Error('untimed-caption-intersection');
  if(![c.start,c.end].every(Number.isFinite)||c.start<0||c.end<=c.start)throw Error('invalid-caption-clock');
  const start=cutClock(c.start,cuts),end=cutClock(c.end,cuts);if(end<=start)throw Error('empty-caption');
  return {...c,start,end,...(Array.isArray(c.words)?{words:shift(c.words)}:{}),...(Array.isArray(c.tokens)?{tokens:shift(c.tokens)}:{})};
 };
 const pieces=(i:any)=>{
  const localCuts=cutUnion(cuts,i.timeline_start,i.timeline_end),bounds=[i.timeline_start,...localCuts.flatMap(r=>[r.start,r.end]),i.timeline_end];
  const kept=[];for(let n=0;n<bounds.length-1;n++){const a=bounds[n],b=bounds[n+1];if(b<=a||localCuts.some(r=>a>=r.start&&b<=r.end))continue;kept.push({a,b});}
  return kept.map(({a,b},n)=>({...structuredClone(i),id:n?crypto.randomUUID():i.id,timeline_start:cutClock(a,cuts),timeline_end:cutClock(b,cuts),source_start:i.source_start+(a-i.timeline_start),source_end:Math.min(i.source_end,i.source_start+(b-i.timeline_start)),keyframes:[]}));
 };
 const next=structuredClone(project);next.tracks=project.tracks.map((t:any)=>({...structuredClone(t),items:t.items.flatMap((i:any)=>{
  if(i.timeline_end<=cuts[0].start)return[structuredClone(i)];
  if(i===main){const keys=i.keyframes?.length?splitScaleKey(i.keyframes[0],i,mapping):[];return mapping.slices.map((s,n)=>({...structuredClone(i),...s,id:n?crypto.randomUUID():i.id,keyframes:keys[n]?[{...keys[n],id:crypto.randomUUID()}]:[]}));}
  if(i.type==='CAPTION')return[{...structuredClone(i),timeline_start:cutClock(i.timeline_start,cuts),timeline_end:cutClock(i.timeline_end,cuts),source_start:cutClock(i.source_start,cuts),source_end:cutClock(i.source_end,cuts),caption:{...structuredClone(i.caption),cues:(i.caption?.cues||[]).map(mapCue),...(Number.isFinite(i.caption?.cues_covered_end)?{cues_covered_end:cutClock(i.caption.cues_covered_end,cuts)}:{})}}];
  if(i.type==='TEXT'){const start=cutClock(i.timeline_start,cuts),end=cutClock(i.timeline_end,cuts);return end>start?[{...structuredClone(i),timeline_start:start,timeline_end:end}]:[];}
  if(i.type==='AUDIO')return pieces(i);
  throw Error('unsupported-layer');
 })}));next.canvas.duration=project.canvas.duration-mapping.total;next.settings={...project.settings,producer_range_cut_v1:{source_start:main.source_start,source_end:main.source_end,cuts:mapping.cuts}};next.playhead=Math.min(next.canvas.duration,cutClock(project.playhead||0,cuts));if(JSON.stringify(project)!==before)throw Error('input-mutated');return{next,mapping};
}
