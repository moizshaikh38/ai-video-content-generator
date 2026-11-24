import type {ReframeSample, NormalizedPersonRegion} from '../types/index.js';

export const validPersonBox=(p:NormalizedPersonRegion)=>[p.x,p.y,p.width,p.height,p.confidence].every(Number.isFinite)&&p.x>=0&&p.y>=0&&p.width>0&&p.height>0&&p.x+p.width<=1.001&&p.y+p.height<=1.001&&p.confidence>=.4;
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
      const eligible=(sample.persons||[]).filter(validPersonBox).filter(p=>{
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

/** Follow one continuously observed body, anchored by repeated face/body
 * matches. A missing face is allowed; a missing/ambiguous body, competing
 * face, long sampling gap or implausible jump rejects this path. This is
 * shot-local geometry, not identity, speech or semantic importance. */
export function anchoredSingleBodyPath(samples:ReframeSample[],trackId:string,sourceWidth:number,sourceHeight:number):{
  windowW:number;windowH:number;keyframes:Array<{time:number;centerX:number;centerY:number}>;
}|null {
  if(samples.length<6||!associatedBodyEnvelope(samples,[trackId])||!(sourceWidth>0&&sourceHeight>0))return null;
  const ordered=[...samples].sort((a,b)=>a.time-b.time);
  const points:Array<{time:number;left:number;right:number;top:number;bottom:number;cx:number;cy:number;area:number}>=[];
  for(const s of ordered){
    const bodies=(s.persons||[]).filter(validPersonBox);
    if(bodies.length!==1||!Number.isFinite(s.time))return null;
    const p=bodies[0];
    if(p.height<.2||p.width<.04)return null;
    // A second visible face outside this body means this is not a one-body shot.
    if(s.faces.some(f=>f.center_x<p.x-.02||f.center_x>p.x+p.width+.02||f.center_y<p.y-.02||f.center_y>p.y+p.height+.02))return null;
    const previous=points.at(-1),cx=p.x+p.width/2,cy=p.y+p.height/2;
    if(previous){
      const dt=s.time-previous.time;
      if(dt<=0||dt>.6||Math.hypot(cx-previous.cx,cy-previous.cy)/dt>.5)return null;
      const area=p.width*p.height,oldArea=previous.area;
      if(Math.max(area/oldArea,oldArea/area)>2.5)return null;
    }
    const faces=s.faces;
    points.push({time:s.time,cx,cy,area:p.width*p.height,
      left:Math.max(0,Math.min(p.x-p.width*.07,...faces.map(f=>f.x))-.025),
      right:Math.min(1,Math.max(p.x+p.width*1.07,...faces.map(f=>f.x+f.width))+.025),
      top:Math.max(0,Math.min(p.y,...faces.map(f=>f.y))-.035),
      bottom:Math.min(1,Math.max(p.y+p.height,...faces.map(f=>f.y+f.height))+.035)});
  }
  if(points.at(-1)!.time-points[0].time<1)return null;
  // Smooth centers before bounding the window, not after. The final constant
  // dimensions are sized against ALL original observations after interpolation.
  // At most32 knots avoids the renderer's40-knot decimation budget.
  const smoothed=points.map(p=>{
    const nearby=points.filter(q=>Math.abs(q.time-p.time)<=.55);
    return {time:p.time,centerX:nearby.reduce((n,q)=>n+q.cx,0)/nearby.length,centerY:nearby.reduce((n,q)=>n+q.cy,0)/nearby.length};
  });
  let keyframes=points.length<=32?smoothed:Array.from({length:32},(_,i)=>smoothed[Math.round(i*(points.length-1)/31)]);
  const at=(t:number)=>{
    let i=0;while(i+1<keyframes.length&&keyframes[i+1].time<=t)i++;
    const a=keyframes[i],b=keyframes[Math.min(i+1,keyframes.length-1)];
    const f=b.time>a.time?Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time))):0;
    return {x:a.centerX+(b.centerX-a.centerX)*f,y:a.centerY+(b.centerY-a.centerY)*f};
  };
  let windowW=.25,windowH=.25;
  for(let iteration=0;iteration<12;iteration++){
    for(const p of points){const c=at(p.time);windowW=Math.max(windowW,2*(c.x-p.left),2*(p.right-c.x));windowH=Math.max(windowH,2*(c.y-p.top),2*(p.bottom-c.y));}
    windowH=Math.min(1,windowH);windowW=Math.min(1,Math.max(windowW,windowH*sourceHeight/sourceWidth*9/16));
    keyframes=keyframes.map(k=>({...k,centerX:Math.max(windowW/2,Math.min(1-windowW/2,k.centerX)),centerY:Math.max(windowH/2,Math.min(1-windowH/2,k.centerY))}));
  }
  // Never silently accept a numerically or physically impossible constraint.
  if(points.some(p=>{const c=at(p.time);return c.x-windowW/2>p.left+.00001||c.x+windowW/2<p.right-.00001||c.y-windowH/2>p.top+.00001||c.y+windowH/2<p.bottom-.00001;}))return null;
  const left=Math.min(...points.map(p=>p.left)),right=Math.max(...points.map(p=>p.right));
  const top=Math.min(...points.map(p=>p.top)),bottom=Math.max(...points.map(p=>p.bottom));
  // Do not add camera motion for a subject that already fits nearly as well
  // in a locked window. Complete path bounds also bridge face dropouts here.
  const staticH=Math.max(.25,bottom-top),staticW=Math.max(.25,right-left,staticH*sourceHeight/sourceWidth*9/16);
  if(staticW<=windowW*1.08&&staticH<=windowH*1.08)return {windowW:staticW,windowH:staticH,keyframes:[{time:points[0].time,
    centerX:Math.max(staticW/2,Math.min(1-staticW/2,(left+right)/2)),centerY:Math.max(staticH/2,Math.min(1-staticH/2,(top+bottom)/2))}]};
  return {windowW,windowH,keyframes};
}
