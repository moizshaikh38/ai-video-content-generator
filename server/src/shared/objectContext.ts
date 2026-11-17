import type {ReframeSample} from '../types/index.js';
/** Repeated non-person geometry is a crop constraint, never permission to crop
 * other content or a claim that the class is the story's subject. No tracking IDs. */
export function persistentObjectRegions(samples:ReframeSample[]){
 if(samples.length<6)return [];
 const groups=new Map<number,{x:number;y:number;width:number;height:number;confidence:number}[]>();
 const sightings=new Map<number,number>();
 for(const sample of samples){
  const seen=new Set<number>();
  for(const r of sample.objects||[]){
   if(!Number.isInteger(r.class_id)||r.class_id<1||r.class_id>79||![r.x,r.y,r.width,r.height,r.confidence].every(Number.isFinite)||r.confidence<.7||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1.001||r.y+r.height>1.001||r.width*r.height<.015)continue;
   const g=groups.get(r.class_id)||[];g.push(r);groups.set(r.class_id,g);seen.add(r.class_id);
  }
  for(const id of seen)sightings.set(id,(sightings.get(id)||0)+1);
 }
 return [...groups].filter(([id])=>(sightings.get(id)||0)>=Math.max(3,Math.ceil(samples.length*.5))).map(([class_id,boxes])=>{
  const x=Math.max(0,Math.min(...boxes.map(b=>b.x))-.025),y=Math.max(0,Math.min(...boxes.map(b=>b.y))-.025);
  const right=Math.min(1,Math.max(...boxes.map(b=>b.x+b.width))+.025),bottom=Math.min(1,Math.max(...boxes.map(b=>b.y+b.height))+.025);
  return {class_id,x,y,width:right-x,height:bottom-y,confidence:Math.min(...boxes.map(b=>b.confidence)),sampleCount:sightings.get(class_id)!};
 });
}
