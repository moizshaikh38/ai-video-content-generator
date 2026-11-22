/** Layout channels are replacement fields, never inherited through a scene patch. */
export const SCENE_LAYOUT_FIELDS=['crop','panels','layout_mode','crop_config','manual_placement','manual_source_crop'] as const;
export function effectiveScenePatch(item:any,patch:any){const next={...item};delete next.framing_window;delete next.scene_layout_overrides;for(const key of SCENE_LAYOUT_FIELDS)delete next[key];return {...next,...patch};}
