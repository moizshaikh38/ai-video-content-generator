import fs from'node:fs';import path from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';import{execFileSync}from'node:child_process';import crypto from'node:crypto';
import{SmartReframeService as S}from'../../src/services/smartReframeService.js';import{legacyFit43Plan as after}from'../../src/shared/automaticLayoutPolicy.js';
const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('New report path required');
const oldPath=fileURLToPath(new URL('../../src/shared/.fallback-baseline-'+process.pid+'.ts',import.meta.url));let before:typeof after;
try{fs.writeFileSync(oldPath,execFileSync('git',['show','dc8f54a3da8fc2ffc9ca7a64546251106eb2ad3c:server/src/shared/automaticLayoutPolicy.ts'],{encoding:'utf8'}),{flag:'wx'});before=(await import(pathToFileURL(oldPath).href)).legacyFit43Plan}finally{fs.rmSync(oldPath,{force:true})}
const rows:any[]=[];const seen=new Set<string>();
for(const dir of fs.readdirSync('/downloads')){
 const file=path.join('/downloads',dir,'fresh-normal-track.json');if(!fs.existsSync(file))continue;let t:any;const bytes=fs.readFileSync(file);try{t=JSON.parse(bytes.toString())}catch{continue}
 const source=t.metadata?.analyzed_source_sha256;if(!source||t.metadata.shot_composition_candidate===true||!t.raw_samples?.length)continue;
 // Select one distinct recorded track state per source and analysis payload.
 const key=source+':'+crypto.createHash('sha256').update(JSON.stringify([t.raw_samples,t.metadata?.dominant_score,t.layout_mode,t.dominant_track_id])).digest('hex');if(seen.has(key))continue;seen.add(key);
 const duration=t.metadata?.clip_duration||t.smoothed_keyframes?.at(-1)?.time;
 const group=S.computeGroupFrameGeometry({rawSamples:t.raw_samples,sourceWidth:t.source_width,sourceHeight:t.source_height});
 const args=[t,duration,group,S.isLowConfidenceTrack(t)] as const;const old=before(...args),next=after(...args);
 const counts=new Map<string,number>();for(const row of t.raw_samples)for(const id of new Set(row.faces.filter((f:any)=>f.confidence>=.8&&f.track_id).map((f:any)=>f.track_id)))counts.set(id as string,(counts.get(id as string)||0)+1);
 const persistent=[...counts].filter(([,n])=>n>=Math.max(3,t.raw_samples.length*.35)).map(([id])=>id);
 const loss=(plan:any[]|undefined)=>{if(!plan)return null;let count=0,total=0;for(const row of t.raw_samples){const p=plan.find(p=>p.start<=row.time&&p.end>row.time);if(!p||p.split)continue;const k=p.keyframes.reduce((a:any,b:any)=>Math.abs(a.time-row.time)<Math.abs(b.time-row.time)?a:b);for(const f of row.faces.filter((f:any)=>f.confidence>=.8&&persistent.includes(f.track_id))){total++;if(f.x<k.centerX-p.windowW/2-1e-8||f.x+f.width>k.centerX+p.windowW/2+1e-8||f.y<k.centerY-p.windowH/2-1e-8||f.y+f.height>k.centerY+p.windowH/2+1e-8)count++}}return{total,outside:count}};
 const ordinaryPlanChanges=Object.fromEntries([['default',{layout_mode_source:'auto'}],['fit-only',{layout_mode_source:'auto',layoutPolicy:{allowed:['fit']}}]].map(([name,cfg])=>{const explicit=S.explicitAutoLayoutPlan(t,cfg,duration);return[name,{explicitPlanPresent:!!explicit,changed:JSON.stringify(explicit||old)!==JSON.stringify(explicit||next)}]}));
 rows.push({file,ordinaryPlanChanges,sourceSha256:source,persistentFaceTracks:persistent.length,fallbackPresent:!!next,changed:JSON.stringify(old)!==JSON.stringify(next),beforeLoss:loss(old),afterLoss:loss(next),beforeWindow:old?.map(s=>[s.windowW,s.windowH]),afterWindow:next?.map(s=>[s.windowW,s.windowH]),timingsPreserved:JSON.stringify(old?.map(s=>s.keyframes.map((k:any)=>k.time)))===JSON.stringify(next?.map(s=>s.keyframes.map((k:any)=>k.time)))});
}
const report={scope:'Recorded ordinary tracks only; direct old/new helper comparison with current shared group geometry. Not fresh inference, independent corpus or visual quality.',distinctSourceHashes:new Set(rows.map(r=>r.sourceSha256)).size,trackStates:rows.length,fallbackStates:rows.filter(r=>r.fallbackPresent).length,changedStates:rows.filter(r=>r.changed).length,rows};fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:rows.filter(r=>r.changed)}));
