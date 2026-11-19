import type {NormalizedFaceDetection,ReframeSample} from '../types/index.js';

/** A bounded framing interpolation, not a claim of person identity. Two
 * repeated nearby face boxes can bracket a detector gap in one continuous
 * shot. Missing detections alone never authorize a stationary hold. */
export function bracketedFaceGap(sampleTime:number,previousTime:number,previous:NormalizedFaceDetection|null,samples:ReframeSample[]):{x:number;y:number;w:number;h:number}|null {
  if(!previous||!previous.track_id||!Number.isFinite(sampleTime)||sampleTime<=previousTime||Number(previous.confidence)<.8)return null;
  const valid=(f:NormalizedFaceDetection)=>[f.x,f.y,f.width,f.height,f.center_x,f.center_y,f.confidence].every(Number.isFinite)&&f.width>0&&f.height>0&&f.x>=0&&f.y>=0&&f.x+f.width<=1.001&&f.y+f.height<=1.001&&Number(f.confidence)>=.8;
  const near=(f:NormalizedFaceDetection)=>valid(f)&&valid(previous)&&Math.abs(f.center_x-previous.center_x)<=Math.max(.02,previous.width)&&Math.abs(f.center_y-previous.center_y)<=Math.max(.02,previous.height*.75)&&f.width/previous.width>=.65&&f.width/previous.width<=1.55&&f.height/previous.height>=.65&&f.height/previous.height<=1.55;
  if(!valid(previous))return null;
  const past=samples.filter(s=>s.time>=previousTime-.75&&s.time<=previousTime);
  if(past.filter(s=>s.faces.length===1&&s.faces[0].track_id===previous.track_id&&near(s.faces[0])).length<2)return null;
  const future=samples.find(s=>s.time>previousTime&&s.faces.length>0);
  if(!future||future.time<sampleTime||future.time-previousTime>5||future.faces.length!==1)return null;
  const next=future.faces[0];if(!next.track_id||!near(next))return null;
  const confirming=samples.filter(s=>s.time>=future.time&&s.time<=future.time+.75&&s.faces.length>0);
  if(confirming.length<2||confirming.some(s=>s.faces.length!==1||s.faces[0].track_id!==next.track_id||!near(s.faces[0])))return null;
  // An observed second person is not detector fragmentation. Keep the existing
  // uncertainty fallback rather than interpolating from one person to another.
  if(samples.some(s=>s.faces.some(f=>f.track_id===previous.track_id)&&s.faces.some(f=>f.track_id===next.track_id&&f.track_id!==previous.track_id)))return null;
  const p=(sampleTime-previousTime)/(future.time-previousTime);
  return{x:previous.x+(next.x-previous.x)*p,y:previous.y+(next.y-previous.y)*p,w:previous.width+(next.width-previous.width)*p,h:previous.height+(next.height-previous.height)*p};
}
