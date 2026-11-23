import {expandSceneLayoutItem} from '../../server/src/shared/sceneLayoutOverrides';
/** State of all effective video scenes, not a promise about measured framing. */
export function framingStrategyState(project:{tracks:Array<{type:string;locked?:boolean;items:any[]}>}){
 let locked=0,editable=0;const modes=new Set<string>();
 for(const track of project.tracks){if(track.type!=='VIDEO')continue;for(const item of track.items){if(track.locked||item.locked)locked++;else editable++;
  let scenes:any[];try{scenes=expandSceneLayoutItem(item)}catch{modes.add('review');continue}
  for(const scene of scenes){const manual=scene.tracker?.enabled||scene.framing_window||scene.panels||scene.manual_placement||scene.manual_source_crop;
   const center=!manual&&scene.crop_mode==='center'&&(!scene.crop||(['fill','custom'].includes(scene.crop.mode)&&scene.crop.focusX===.5&&scene.crop.focusY===.5&&scene.crop.scale===1));
   modes.add(center?'center':manual||scene.crop||scene.crop_config?.layout_mode_source==='user'?'manual':scene.crop_mode||'smart');
  }
 }}
 return {mode:modes.size===1?[...modes][0]:modes.size>1?'mixed':'none',locked,editable};
}
