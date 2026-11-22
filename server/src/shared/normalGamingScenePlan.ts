import type {ItemPanels, PanelRect} from './panelLayouts.js';

export interface GamingSceneEvidence {
  version: 1;
  sourceSha256: string;
  sourceStart: number;
  sourceEnd: number;
  sourceWidth: number;
  sourceHeight: number;
  camera: PanelRect;
  exclusion: PanelRect;
  geometry: {
    method: 'native-closed-perimeter-v1' | 'native-side-seams-v1';
    decodedFrames: number;
    supportedFrames: number;
    presentationFrames: number;
    firstFrameTime: number;
    lastFrameTime: number;
    maximumFrameGap: number;
    framePeriod: number;
    clock: 'interval-relative-presentation-v1';
  };
  semantics: {
    model: string;
    providerCostUsd: 0;
    sampling: 'uniform-five-source-regions-v1';
    frames: Array<{time: number; form: string; cameraRole: string; gameOutsideCamera: string}>;
  };
}

function rect(value: unknown): value is PanelRect {
  if (!value || typeof value !== 'object') return false;
  const r = value as PanelRect;
  return [r.x,r.y,r.w,r.h].every(v=>typeof v==='number' && Number.isFinite(v)) &&
    r.x>=0 && r.y>=0 && r.w>=.01 && r.h>=.01 && r.x+r.w<=1 && r.y+r.h<=1;
}
const close=(a:number,b:number)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=.001;

/** Source-derived candidate on the ordinary Auto selector. This never infers
 * camera roles from face counts, accepts review flags as evidence, or changes
 * manual ownership. Side-region loss remains an explicit review limitation. */
export function normalGamingScenePlan(track:any,crop:any,duration:number,outputAspect:unknown): Array<{
  start:number;end:number;kind:'group';windowW:number;windowH:number;
  keyframes:Array<{time:number;centerX:number;centerY:number}>;
  split:{speaker1X:number;speaker2X:number;dividerX:number;focusPanels:ItemPanels};
  contextStatus:'unresolved-review-required';uncertainty:string;requiredAspect:'9:16';
}> | undefined {
  if(outputAspect!=='9:16'||crop?.mode!=='smart'||crop?.layout_mode_source!=='auto'||
     track?.status!=='ready'||track.isStale||track.sourceObjectVerified!==true||
     track.analyzed_aspect_ratio!=='9:16'||!Number.isFinite(duration)||duration<3||duration>30||
     (crop.layoutPolicy && (!Array.isArray(crop.layoutPolicy.allowed)||!crop.layoutPolicy.allowed.includes('split')))) return;
  const m=track.metadata,e=m?.gaming_source_scene_evidence as GamingSceneEvidence;
  if(m?.shot_composition_candidate===true||(m?.source_scene_context&&track.sourceSceneContextVerified!==true)) return;
  if(!e||e.version!==1||!/^[a-f0-9]{64}$/.test(e.sourceSha256)||e.sourceSha256!==m.analyzed_source_sha256||
     !close(e.sourceStart,m.analyzed_source_start)||!close(e.sourceEnd,m.analyzed_source_end)||
     !close(e.sourceEnd-e.sourceStart,duration)||e.sourceStart<0||
     e.sourceWidth!==track.source_width||e.sourceHeight!==track.source_height||
     !Number.isInteger(e.sourceWidth)||!Number.isInteger(e.sourceHeight)||e.sourceWidth<=0||e.sourceHeight<=0||
     !rect(e.camera)||!rect(e.exclusion)||e.camera.w*e.camera.h>.2) return;
  const c=e.camera,q=e.exclusion;
  if(q.x>c.x+1e-9||q.y>c.y+1e-9||q.x+q.w<c.x+c.w-1e-9||q.y+q.h<c.y+c.h-1e-9) return;
  const g=e.geometry;
  if(!g||!['native-closed-perimeter-v1','native-side-seams-v1'].includes(g.method)||
     ![g.decodedFrames,g.supportedFrames,g.presentationFrames].every(Number.isInteger)||g.decodedFrames<8||
     g.supportedFrames!==g.decodedFrames||g.presentationFrames!==g.decodedFrames||
     g.clock!=='interval-relative-presentation-v1'||!Number.isFinite(g.framePeriod)||g.framePeriod<=0||g.framePeriod>.1||
     !Number.isFinite(g.firstFrameTime)||g.firstFrameTime<0||g.firstFrameTime>g.framePeriod*1.1||
     !Number.isFinite(g.lastFrameTime)||g.lastFrameTime>=duration||duration-g.lastFrameTime>g.framePeriod*2.1||
     !Number.isFinite(g.maximumFrameGap)||g.maximumFrameGap<=0||g.maximumFrameGap>g.framePeriod*2.1||
     g.lastFrameTime-g.firstFrameTime>(g.decodedFrames-1)*g.maximumFrameGap+.001) return;
  const s=e.semantics;
  if(!s||typeof s.model!=='string'||!s.model.endsWith(':free')||s.providerCostUsd!==0||
     s.sampling!=='uniform-five-source-regions-v1'||!Array.isArray(s.frames)||s.frames.length!==5||
     s.frames.some((f,i)=>!f||!close(f.time,Number((i/4*Math.max(0,duration-.12)).toFixed(3)))||
       f.form!=='gameplay'||f.cameraRole!=='filmed_camera'||f.gameOutsideCamera!=='visible')) return;
  // Largest independently disjoint context rectangle. Do not center-cover the
  // game or invent hidden pixels underneath a burned-in webcam.
  const candidates:PanelRect[]=[{x:0,y:0,w:q.x,h:1},{x:q.x+q.w,y:0,w:1-q.x-q.w,h:1},
    {x:0,y:0,w:1,h:q.y},{x:0,y:q.y+q.h,w:1,h:1-q.y-q.h}];
  const main=candidates.sort((a,b)=>b.w*b.h-a.w*a.h)[0];
  if(!rect(main)||main.w*main.h<.5) return;
  const topFraction=(9/16)/(c.w*e.sourceWidth/(c.h*e.sourceHeight));
  if(!Number.isFinite(topFraction)||topFraction<.25||topFraction>.5) return;
  const slot=(sourceRect:PanelRect)=>({focusX:.5,focusY:.5,scale:1,set:true,fit:'contain' as const,backdrop:'blur' as const,sourceRect});
  return [{start:0,end:duration,kind:'group',windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}],
    split:{speaker1X:.25,speaker2X:.75,dividerX:.5,focusPanels:{layout:'gameplay',topFraction,slots:[slot(c),slot(main)]}},
    requiredAspect:'9:16',contextStatus:'unresolved-review-required',
    uncertainty:'Measured camera and source context views. Main view excludes the strip beside the camera, which may contain HUD, alerts or action. Five semantic samples do not certify unseen scene meaning. Review side context before sharing.'}];
}
