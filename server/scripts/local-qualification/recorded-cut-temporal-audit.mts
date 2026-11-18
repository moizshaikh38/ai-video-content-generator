import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import{SmartReframeService as S}from '../../src/services/smartReframeService.js';import{applyWordEnergyFusion as fuse}from '../../src/utils/wordEnergyFusion.js';
const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('New JSON output required');
const rows:any[]=[];
for(const dir of fs.readdirSync('/downloads')){
 const file=path.join('/downloads',dir,'fresh-normal-track.json');if(!fs.existsSync(file))continue;
 const bytes=fs.readFileSync(file);let t:any;try{t=JSON.parse(bytes.toString())}catch{continue}
 const cuts=t.metadata?.scene_cuts;if(!cuts?.length||!t.raw_samples?.length)continue;
 const duration=t.metadata?.clip_duration??t.smoothed_keyframes?.at(-1)?.time;if(!(duration>0))continue;
 const frames=S.smoothAndGenerateKeyframes({samples:t.raw_samples,dominantTrackId:t.dominant_track_id,duration,sourceWidth:t.source_width,sourceHeight:t.source_height,aspectRatio:'9:16',sceneCuts:cuts});
 // Deliberately controlled timing windows, not source words or transcription.
 const words=cuts.map((c:number)=>({start:Math.max(0,c-.2),end:Math.min(duration,c+.2)}));const fused=fuse(frames,words,{sourceCutTimes:cuts});
 const protectedAnchors=frames.filter(k=>cuts.some((c:number)=>k.time===Math.round(c*1000)/1000));
 const mismatches=protectedAnchors.filter(k=>!fused.some(f=>f.time===k.time&&f.centerX===k.centerX&&f.centerY===k.centerY));
 const strictlyIncreasing=fused.every((k,i)=>i===0||k.time>fused[i-1].time);
 rows.push({file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceWidth:t.source_width,sourceHeight:t.source_height,cuts:cuts.length,existingMeasuredAnchors:protectedAnchors.length,mismatches:mismatches.length,strictlyIncreasing});
}
const result={scope:'Recomputed default smoother from existing recorded samples; stress word windows are controlled and not source transcript. Temporal invariants only, no new analyzer, camera identity, visual quality or independent-corpus accuracy claim.',tracks:rows.length,existingMeasuredAnchors:rows.reduce((n,r)=>n+r.existingMeasuredAnchors,0),mismatches:rows.reduce((n,r)=>n+r.mismatches,0),nonIncreasingTracks:rows.filter(r=>!r.strictlyIncreasing).length,rows};
fs.writeFileSync(out,JSON.stringify(result,null,2));assert.equal(result.mismatches,0);assert.equal(result.nonIncreasingTracks,0);console.log(JSON.stringify({...result,rows:undefined}));
