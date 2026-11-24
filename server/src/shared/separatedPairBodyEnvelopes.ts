import type {ReframeSample} from '../types/index.js';
import {associatedBodyEnvelope} from './bodyContext.js';
import {separateParticipantPadding,type ParticipantBounds} from './participantPadding.js';
/** Separate synthetic pair padding only. Every sampled face and body must have
 * one unambiguous owner; all raw rectangles across the shot remain contained.
 * Does not infer a camera boundary, human identity or between-sample safety. */
export function separatedPairBodyEnvelopes(samples:ReframeSample[],ids:[string,string]):ParticipantBounds[]|null{
 if(samples.length<6||ids[0]===ids[1]||samples.some((s,i)=>!Number.isFinite(s.time)||(i>0&&s.time<=samples[i-1].time)||s.faces.some(f=>![f.x,f.y,f.width,f.height,f.center_x,f.center_y,f.confidence].every(Number.isFinite)||f.x<0||f.y<0||f.width<=0||f.height<=0||f.x+f.width>1.001||f.y+f.height>1.001)))return null;
 const padded=ids.map(id=>associatedBodyEnvelope(samples,[id]));if(padded.some(b=>!b))return null;
 // At most one short, internally bracketed detector dropout. Interpolation
 // assigns existing measured bodies only; it never invents a body or cut.
 const gaps=samples.filter(s=>s.faces.length!==2);
 if(gaps.length>1||gaps.length&&samples.length<10)return null;
 const ownershipFaces=(index:number)=>{
  const row=samples[index];if(row.faces.length===2)return row.faces;
  if(row.faces.length!==1||index===0||index===samples.length-1)return null;
  const before=samples[index-1],after=samples[index+1];
  if(before.faces.length!==2||after.faces.length!==2||after.time-before.time>.5||row.time<=before.time||after.time<=row.time)return null;
  if(!ids.includes(row.faces[0].track_id!))return null;
  const missing=ids.find(id=>id!==row.faces[0].track_id)!;
  const a=before.faces.find(f=>f.track_id===missing),b=after.faces.find(f=>f.track_id===missing);
  if(!a||!b||a.confidence<.8||b.confidence<.8||Math.abs(a.center_x-b.center_x)>.08||Math.abs(a.center_y-b.center_y)>.08||a.width/b.width<.7||a.width/b.width>1.4||a.height/b.height<.7||a.height/b.height>1.4)return null;
  const q=(row.time-before.time)/(after.time-before.time),mix=(x:number,y:number)=>x+(y-x)*q;
  return [...row.faces,{...a,x:mix(a.x,b.x),y:mix(a.y,b.y),width:mix(a.width,b.width),height:mix(a.height,b.height),center_x:mix(a.center_x,b.center_x),center_y:mix(a.center_y,b.center_y)}];
 };
 const measured:ParticipantBounds[]=ids.map(()=>({left:1,right:0,top:1,bottom:0}));
 for(let index=0;index<samples.length;index++){
  const s=samples[index],faces=ownershipFaces(index);
  if(!faces||faces.length!==2||new Set(faces.map(f=>f.track_id)).size!==2||faces.some(f=>!ids.includes(f.track_id!)))return null;
  const bodies=s.persons||[];
  if(bodies.length!==2||bodies.some(p=>![p.x,p.y,p.width,p.height,p.confidence].every(Number.isFinite)||p.confidence<.4||p.x<0||p.y<0||p.width<=0||p.height<=0||p.x+p.width>1.001||p.y+p.height>1.001))return null;
  const owners=bodies.map(p=>faces.filter(f=>f.center_x>=p.x&&f.center_x<=p.x+p.width&&f.center_y>=p.y&&f.center_y<=p.y+p.height*.55));
  if(owners.some(a=>a.length!==1)||new Set(owners.map(a=>a[0].track_id)).size!==2)return null;
  bodies.forEach((p,j)=>{const f=owners[j][0],b=measured[ids.indexOf(f.track_id!)];b.left=Math.min(b.left,p.x,f.x);b.right=Math.max(b.right,p.x+p.width,f.x+f.width);b.top=Math.min(b.top,p.y,f.y);b.bottom=Math.max(b.bottom,p.y+p.height,f.y+f.height);});
 }
 return separateParticipantPadding(padded as ParticipantBounds[],measured);
}
