import {buildGamingSceneEvidence} from './buildGamingSceneEvidence.js';
import type {GamingSceneEvidence} from './normalGamingScenePlan.js';

/** The model may label measured region IDs, never supply crop coordinates. */
export function bindMeasuredGamingRegions(measured:unknown,roles:unknown):{evidence:GamingSceneEvidence;cameraRegionId:string}|undefined {
 try {
  const m=measured as any,r=roles as any;
  if(m?.version!==1||m.status!=='geometry-candidates-awaiting-independent-roles'||m.clockCoverageVerified!==true||!Array.isArray(m.regions)||![1,2].includes(m.regions.length)||!Array.isArray(m.presentationTimes)||m.decodedFrames!==m.presentationFrames||m.presentationFrames!==m.presentationTimes.length||r?.sourceSha256!==m.sourceSha256||r.sourceStart!==m.sourceStart||r.sourceEnd!==m.sourceEnd||r.sourceWidth!==m.sourceWidth||r.sourceHeight!==m.sourceHeight||!Array.isArray(r.regionDefinitions)||r.regionDefinitions.length!==m.regions.length||!Array.isArray(r.frames)||r.frames.length!==5) return;
  const ids=m.regions.map((q:any)=>q.id);
  if(new Set(ids).size!==ids.length||ids.some((id:any)=>!['A','B'].includes(id))) return;
  for(const q of m.regions){
   const definition=r.regionDefinitions.find((v:any)=>v.id===q.id);
   if(!definition||!Array.isArray(definition.rect)||definition.rect.length!==4||definition.rect.some((v:any,i:number)=>v!==q.rect[i])) return;
  }
  for(const q of m.regions){
   if(!Array.isArray(q.rect)||q.rect.length!==4||!q.rect.every(Number.isInteger)||q.rect[0]<0||q.rect[1]<0||q.rect[2]<=q.rect[0]||q.rect[3]<=q.rect[1]||q.rect[2]>m.sourceWidth||q.rect[3]>m.sourceHeight||q.supportedFrames!==m.decodedFrames) return;
  }
  for(let i=0;i<5;i++){
   const f=r.frames[i];if(f?.index!==i||f.form!=='gameplay'||f.gameActionOutsideCamera!=='visible'||!Array.isArray(f.regions)||f.regions.length!==ids.length||new Set(f.regions.map((v:any)=>v.id)).size!==ids.length||f.regions.some((v:any)=>!ids.includes(v.id))) return;
  }
  const cameras=m.regions.filter((q:any)=>r.frames.every((f:any)=>f.regions.find((v:any)=>v.id===q.id)?.kind==='camera_image'));
  if(cameras.length!==1) return;
  const selected=cameras[0],other=m.regions.find((q:any)=>q.id!==selected.id);
  if(other&&!r.frames.every((f:any)=>f.regions.find((v:any)=>v.id===other.id)?.kind==='camera_plus_graphics')) return;
  const common={sourceSha256:m.sourceSha256,sourceStart:m.sourceStart,sourceEnd:m.sourceEnd,sourceWidth:m.sourceWidth,sourceHeight:m.sourceHeight,decodedFrames:m.decodedFrames,selectedPresentationFrames:m.presentationFrames,clockCoverageVerified:true};
  let geometry:any,normalizedRoles:any;
  if(selected.method==='native-closed-perimeter-v1'){
   if(other||selected.guardPixels!==2*Math.max(2,Math.round(Math.min(m.sourceWidth,m.sourceHeight)*.006))) return;
   geometry={...common,candidates:[{rect:selected.rect,supported:selected.supportedFrames,minimumSide:selected.minimumSide,minimumEdge:selected.minimumEdge}]};
   normalizedRoles={...r,sourceWidth:m.sourceWidth,sourceHeight:m.sourceHeight,regionAEnclosure:selected.rect,frames:r.frames.map((f:any)=>({index:f.index,form:f.form,regionA:'filmed_person_camera',gameActionOutsideA:f.gameActionOutsideCamera}))};
  } else if(selected.method==='native-side-seams-v1'){
   if(!other||other.method!==selected.method||other.guardPixels!==selected.guardPixels||!Number.isFinite(other.minimumPerFrameSeamContrast)||other.minimumPerFrameSeamContrast<6) return;
   geometry={...common,status:'source-bound-role-and-seam-candidate',cameraRect:selected.rect,selectedRegion:'A',supportedFrames:selected.supportedFrames,minimumPerFrameSeamContrast:selected.minimumPerFrameSeamContrast,edgeBandPixels:Math.max(2,Math.round(Math.min(m.sourceWidth,m.sourceHeight)*.003)),guardPixels:selected.guardPixels};
   normalizedRoles={...r,boxes:{A:selected.rect,B:other.rect},frames:r.frames.map((f:any)=>({index:f.index,form:f.form,gameActionOutsideCamera:f.gameActionOutsideCamera,regions:[{id:'A',kind:'camera_image'},{id:'B',kind:'camera_plus_graphics'}]}))};
  } else return;
  const evidence=buildGamingSceneEvidence({source:{sha256:m.sourceSha256,start:m.sourceStart,end:m.sourceEnd,width:m.sourceWidth,height:m.sourceHeight},presentationTimes:m.presentationTimes,nominalFps:m.nominalFps,geometry,roles:normalizedRoles});
  return evidence?{evidence,cameraRegionId:selected.id}:undefined;
 } catch {return;}
}
