import{resolveSceneLayoutItem}from'./sceneLayoutOverrides.js';
/** Resolve the same visible saved scene as paused preview before wheel zoom.
 * A raw base crop is not the displayed scene crop. Gaps/hidden/locked scenes
 * are not a target, and destination placement keeps its own resize controls. */
export function previewWheelCrop(project:any,playhead:number,deltaY:number):{itemId:string;crop:any}|null{
 if(!project||!Number.isFinite(playhead)||!Number.isFinite(deltaY)||deltaY===0)return null;
 for(const track of project.tracks??[]){
  if(track.type!=='VIDEO'||track.hidden)continue;
  for(const base of track.items??[]){
   if(base.hidden||!(playhead>=base.timeline_start&&(playhead<base.timeline_end||(playhead===project.canvas?.duration&&playhead===base.timeline_end))))continue;
   const item=resolveSceneLayoutItem(base,base.source_start+(playhead-base.timeline_start)*(base.speed?.speed||1));
   if(track.locked||item.locked||item.manual_placement)return null;
   const crop=item.crop,scale=Math.min(4,Math.max(1,Number(((crop?.scale??1)*(deltaY<0?1.1:1/1.1)).toFixed(3))));
   return{itemId:item.id,crop:{mode:crop?.mode??(item.crop_mode==='fit'?'fit':'custom'),focusX:crop?.focusX??.5,focusY:crop?.focusY??.5,scale}};
  }
 }
 return null;
}
