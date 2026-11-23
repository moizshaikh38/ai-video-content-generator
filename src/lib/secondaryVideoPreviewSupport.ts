/** Only neutral saved VIDEO geometry has a corresponding secondary renderer.
 * Unknown/decorated channels abstain instead of showing a convincing wrong view. */
export function secondaryVideoPreviewSupported(item:any):boolean{
 if(item.type!=='VIDEO'||typeof item.source_asset_id!=='string'||!item.source_asset_id||typeof item.source_path!=='string'||!item.source_path.startsWith('users/'))return false;
 if(![item.timeline_start,item.timeline_end,item.source_start,item.source_end].every(Number.isFinite)||item.timeline_start<0||item.source_start<0||item.timeline_end<=item.timeline_start||Math.abs((item.source_end-item.source_start)-(item.timeline_end-item.timeline_start))>.001)return false;
 if((item.speed?.speed??1)!==1||item.speed?.speed_ramp)return false;
 const t=item.transform;
 if(t&&((t.position_x??0)!==0||(t.position_y??0)!==0||(t.scale??1)!==1||(t.rotation??0)!==0||(t.opacity??1)!==1||t.position_space!==undefined))return false;
 if(item.effects?.length||item.keyframes?.length)return false;
 for(const key of['crop_config','crop_mode','layout_mode','manual_source_crop','manual_placement','tracker','scene_layout_overrides','panels','framing_window','automatic_framing','color','filter','mask','chroma_key','transition_in','transition_out','is_title_card','is_freeze','freeze_source_time'])if(item[key]!==undefined&&item[key]!==null)return false;
 const c=item.crop;
 if(c){if(!['fit','fill'].includes(c.mode)||(c.focusX??.5)!==.5||(c.focusY??.5)!==.5||(c.scale??1)!==1)return false;
  for(const key of['band','choice','left','right','top','bottom'])if(c[key]!==undefined&&c[key]!==null)return false;
 }
 return true;
}
