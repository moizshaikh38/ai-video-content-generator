import type {GamingSceneEvidence} from './normalGamingScenePlan.js';

export interface GamingEvidenceBuildInput {
 source:{sha256:string;start:number;end:number;width:number;height:number};
 /** Actual ffprobe presentation timestamps, relative to source.start. */
 presentationTimes:number[];
 nominalFps:number;
 geometry:unknown;
 roles:unknown;
}
const near=(a:unknown,b:number)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=.001;
const sameBox=(a:unknown,b:number[])=>Array.isArray(a)&&a.length===4&&a.every((v,i)=>v===b[i]);
/** Join independently measured geometry, source clock and semantic roles.
 * This does not verify storage, grant ownership, call a provider, write a track,
 * or certify HUD/action safety. The normal consumer still owns those gates. */
export function buildGamingSceneEvidence(input:GamingEvidenceBuildInput):GamingSceneEvidence|undefined {
 try {
  const {source:s,presentationTimes:pts,nominalFps:fps}=input,g=input.geometry as any,r=input.roles as any;
  const duration=s.end-s.start;
  if(!/^[a-f0-9]{64}$/.test(s.sha256)||![s.start,s.end,s.width,s.height,fps].every(Number.isFinite)||s.start<0||duration<3||duration>30||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<=0||s.height<=0||s.width*s.height>1920*1080||fps<10||fps>240) return;
  if(!g||!r||g.sourceSha256!==s.sha256||r.sourceSha256!==s.sha256||!near(g.sourceStart,s.start)||!near(g.sourceEnd,s.end)||!near(r.sourceStart,s.start)||!near(r.sourceEnd,s.end)||g.sourceWidth!==s.width||g.sourceHeight!==s.height||g.clockCoverageVerified!==true) return;
  if(!Array.isArray(pts)||pts.length<8||pts.length>Math.ceil(duration*fps)*2+2||pts.length!==g.decodedFrames||pts.length!==g.selectedPresentationFrames||pts.some((p,i)=>!Number.isFinite(p)||p<0||p>=duration||(i>0&&p<=pts[i-1]))||pts[0]>1.1/fps||duration-pts[pts.length-1]>2.1/fps) return;
  const maximumFrameGap=Math.max(...pts.slice(1).map((v,i)=>v-pts[i]));if(maximumFrameGap>2.1/fps) return;
  if(typeof r.model!=='string'||!r.model.endsWith(':free')||r.providerCostUsd!==0||!Array.isArray(r.times)||r.times.length!==5||!Array.isArray(r.frames)||r.frames.length!==5||r.times.some((t:unknown,i:number)=>!near(t,Number((i/4*(duration-.12)).toFixed(3))))) return;
  let box:number[],guard:number,method:GamingSceneEvidence['geometry']['method'];
  const frames:GamingSceneEvidence['semantics']['frames']=[];
  if(Array.isArray(g.candidates)) {
   const complete=g.candidates.filter((c:any)=>c.supported===pts.length&&Array.isArray(c.rect)&&c.rect.length===4&&c.rect.every(Number.isFinite)&&c.minimumSide>=.85&&c.minimumEdge>=.7);
   const encloses=(a:any,b:any)=>!sameBox(a.rect,b.rect)&&a.rect[0]<=b.rect[0]&&a.rect[1]<=b.rect[1]&&a.rect[2]>=b.rect[2]&&a.rect[3]>=b.rect[3];
   const outer=complete.filter((c:any)=>!complete.some((q:any)=>encloses(q,c)));
   if(outer.length!==1||!sameBox(r.regionAEnclosure,outer[0].rect)) return;
   box=outer[0].rect;guard=2*Math.max(2,Math.round(Math.min(s.width,s.height)*.006));method='native-closed-perimeter-v1';
   for(let i=0;i<5;i++){const f=r.frames[i];if(f?.index!==i||f.form!=='gameplay'||f.regionA!=='filmed_person_camera'||f.gameActionOutsideA!=='visible') return;frames.push({time:r.times[i],form:f.form,cameraRole:'filmed_camera',gameOutsideCamera:f.gameActionOutsideA});}
  } else {
   if(g.status!=='source-bound-role-and-seam-candidate'||g.supportedFrames!==pts.length||!Number.isFinite(g.minimumPerFrameSeamContrast)||g.minimumPerFrameSeamContrast<6||g.selectedRegion!=='A'||!Array.isArray(g.cameraRect)||!sameBox(r.boxes?.A,g.cameraRect)||g.guardPixels!==2*g.edgeBandPixels||g.edgeBandPixels!==Math.max(2,Math.round(Math.min(s.width,s.height)*.003))) return;
   box=g.cameraRect;guard=g.guardPixels;method='native-side-seams-v1';
   if(!Array.isArray(r.boxes?.B)||sameBox(r.boxes.B,box)) return;
   for(let i=0;i<5;i++){const f=r.frames[i];if(f?.index!==i||f.form!=='gameplay'||f.gameActionOutsideCamera!=='visible'||!Array.isArray(f.regions)||f.regions.length!==2||f.regions.filter((v:any)=>v.id==='A'&&v.kind==='camera_image').length!==1||f.regions.filter((v:any)=>v.id==='B'&&v.kind==='camera_plus_graphics').length!==1) return;frames.push({time:r.times[i],form:f.form,cameraRole:'filmed_camera',gameOutsideCamera:f.gameActionOutsideCamera});}
  }
  if(box.length!==4||!box.every(Number.isInteger)||box[0]<0||box[1]<0||box[2]<=box[0]||box[3]<=box[1]||box[2]>s.width||box[3]>s.height) return;
  const x=Math.max(0,box[0]-guard),y=Math.max(0,box[1]-guard),xx=Math.min(s.width,box[2]+guard),yy=Math.min(s.height,box[3]+guard);
  const camera={x:x/s.width,y:y/s.height,w:(xx-x)/s.width,h:(yy-y)/s.height};
  return {version:1,sourceSha256:s.sha256,sourceStart:s.start,sourceEnd:s.end,sourceWidth:s.width,sourceHeight:s.height,camera,exclusion:{...camera},geometry:{method,decodedFrames:pts.length,supportedFrames:pts.length,presentationFrames:pts.length,firstFrameTime:pts[0],lastFrameTime:pts[pts.length-1],maximumFrameGap,framePeriod:1/fps,clock:'interval-relative-presentation-v1'},semantics:{model:r.model,providerCostUsd:0,sampling:'uniform-five-source-regions-v1',frames}};
 } catch {return;}
}
