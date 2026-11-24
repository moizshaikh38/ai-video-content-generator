import type {ReframeSample} from '../types/index.js';
import {associatedBodyEnvelope} from './bodyContext.js';
import {separateParticipantPadding,type ParticipantBounds} from './participantPadding.js';
/** Separate synthetic pair padding only. Every sampled face and body must have
 * one unambiguous owner; all raw rectangles across the shot remain contained.
 * Does not infer a camera boundary, human identity or between-sample safety. */
export function separatedPairBodyEnvelopes(samples:ReframeSample[],ids:[string,string]):ParticipantBounds[]|null{
 if(samples.length<6||ids[0]===ids[1])return null;
 const padded=ids.map(id=>associatedBodyEnvelope(samples,[id]));if(padded.some(b=>!b))return null;
 const measured:ParticipantBounds[]=ids.map(()=>({left:1,right:0,top:1,bottom:0}));
 for(const s of samples){
  if(s.faces.length!==2||new Set(s.faces.map(f=>f.track_id)).size!==2||s.faces.some(f=>!ids.includes(f.track_id!)))return null;
  const bodies=s.persons||[];
  if(bodies.length!==2||bodies.some(p=>![p.x,p.y,p.width,p.height,p.confidence].every(Number.isFinite)||p.confidence<.4||p.x<0||p.y<0||p.width<=0||p.height<=0||p.x+p.width>1.001||p.y+p.height>1.001))return null;
  const owners=bodies.map(p=>s.faces.filter(f=>f.center_x>=p.x&&f.center_x<=p.x+p.width&&f.center_y>=p.y&&f.center_y<=p.y+p.height*.55));
  if(owners.some(a=>a.length!==1)||new Set(owners.map(a=>a[0].track_id)).size!==2)return null;
  bodies.forEach((p,j)=>{const f=owners[j][0],b=measured[ids.indexOf(f.track_id!)];b.left=Math.min(b.left,p.x,f.x);b.right=Math.max(b.right,p.x+p.width,f.x+f.width);b.top=Math.min(b.top,p.y,f.y);b.bottom=Math.max(b.bottom,p.y+p.height,f.y+f.height);});
 }
 return separateParticipantPadding(padded as ParticipantBounds[],measured);
}
