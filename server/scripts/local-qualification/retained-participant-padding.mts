import fs from 'node:fs';
import path from 'node:path';
import {shotPlanOptions} from '../../src/shared/shotPlanOptions.js';
import {assignParticipantPanels} from '../../src/shared/participantPanels.js';
import {SmartReframeService} from '../../src/services/smartReframeService.js';

// Retained detections only. This script does not acquire/decode media, run a
// detector, call a provider, render a frame, or alter a persisted project.
const inputs=process.argv.slice(2);
if(!inputs.length)throw new Error('Supply one or more retained track JSON paths.');
const results=inputs.map(file=>{
 const track=JSON.parse(fs.readFileSync(file,'utf8'));
 const duration=Number(track.metadata?.clip_duration);
 if(!(duration>0)||!track.metadata?.analyzed_source_sha256)throw new Error('Source-bound retained track and positive clip_duration required.');
 const options=shotPlanOptions({track,duration});
 const baseline=SmartReframeService.computeShotComposition(options);
 const candidate=SmartReframeService.computeShotComposition({...options,participantPanelsReview:true,participantPaddingSeparationReview:true});
 const candidateAssignments=candidate.map(shot=>{
  const samples=track.raw_samples.filter((s:any)=>s.time>=shot.start&&s.time<shot.end);
  const assigned=assignParticipantPanels(samples,track.source_width,track.source_height,{paddingSeparationReview:true});
  let checkedBodies=0,checkedFaces=0;
  if(assigned){
   for(const sample of samples)for(let i=0;i<assigned.trackIds.length;i++){
    const r=assigned.panels.slots[i].sourceRect!;
    const face=sample.faces.find((f:any)=>f.track_id===assigned.trackIds[i]);
    const contains=(b:any)=>r.x<=b.x+1e-12&&r.y<=b.y+1e-12&&r.x+r.w+1e-12>=b.x+b.width&&r.y+r.h+1e-12>=b.y+b.height;
    if(face){if(!contains(face))throw new Error('Face containment regression');checkedFaces++;}
    const bodies=sample.persons.filter((p:any)=>p.confidence>=.4&&face&&face.center_x>=p.x&&face.center_x<=p.x+p.width&&face.center_y>=p.y&&face.center_y<=p.y+p.height*.55);
    if(bodies.length!==1||!contains(bodies[0]))throw new Error('Body containment regression');checkedBodies++;
   }
  }
  return {start:shot.start,end:shot.end,bodyBackedAssignment:assigned,checkedBodies,checkedFaces};
 });
 return {label:path.basename(path.dirname(file)),sourceSha256:track.metadata.analyzed_source_sha256,retainedDetectionsOnly:true,newMediaInferenceOrExport:false,baseline,candidate,candidateAssignments};
});
console.log(JSON.stringify(results,null,2));
