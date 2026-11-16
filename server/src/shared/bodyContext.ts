import type {ReframeSample, NormalizedPersonRegion} from '../types/index.js';

const valid=(p:NormalizedPersonRegion)=>[p.x,p.y,p.width,p.height,p.confidence].every(Number.isFinite)&&p.x>=0&&p.y>=0&&p.width>0&&p.height>0&&p.x+p.width<=1.001&&p.y+p.height<=1.001&&p.confidence>=.4;
/** Person boxes need persistent face anchors. They do not establish speech,
 * camera boundaries or unseen/occluded limbs. Missing evidence is not absence. */
export function associatedBodyEnvelope(samples:ReframeSample[],trackIds:string[]):{left:number;right:number;top:number;bottom:number}|null {
  if(!trackIds.length)return null;
  const boxes:NormalizedPersonRegion[]=[];
  for(const id of trackIds){
    let sightings=0,matches=0;
    for(const sample of samples){
      const face=sample.faces.find(f=>f.track_id===id);
      if(!face)continue;
      sightings++;
      const eligible=(sample.persons||[]).filter(valid).filter(p=>{
        const overlapX=Math.max(0,Math.min(p.x+p.width,face.x+face.width)-Math.max(p.x,face.x));
        const overlapY=Math.max(0,Math.min(p.y+p.height,face.y+face.height)-Math.max(p.y,face.y));
        if(overlapX*overlapY<face.width*face.height*.8||p.width<face.width*1.05||p.width*p.height<face.width*face.height*1.6)return false;
        if(face.center_y>p.y+p.height*.55)return false;
        return !sample.faces.some(f=>f!==face&&f.width*f.height>=face.width*face.height*.35&&f.center_x>p.x&&f.center_x<p.x+p.width&&f.center_y>p.y&&f.center_y<p.y+p.height*.55);
      }).sort((a,b)=>a.width*a.height-b.width*b.height);
      if(eligible.length){boxes.push(eligible[0]);matches++;}
    }
    if(matches<3||matches<Math.max(1,sightings)*.7)return null;
  }
  if(!boxes.length)return null;
  const faces=samples.flatMap(s=>s.faces.filter(f=>trackIds.includes(f.track_id||'')));
  return {left:Math.max(0,Math.min(...boxes.map(b=>b.x-b.width*.07),...faces.map(f=>f.x))-.015),
    right:Math.min(1,Math.max(...boxes.map(b=>b.x+b.width*1.07),...faces.map(f=>f.x+f.width))+.015),
    top:Math.max(0,Math.min(...boxes.map(b=>b.y),...faces.map(f=>f.y))-.025),
    bottom:Math.min(1,Math.max(...boxes.map(b=>b.y+b.height),...faces.map(f=>f.y+f.height))+.025)};
}
