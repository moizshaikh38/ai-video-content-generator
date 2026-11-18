/** Feature-gated analyzer routing only, not default activation or saved-edit
 * mutation. Modern explicit Auto provenance is not a pinned manual layout. */
export function adaptiveSceneEligible(clip:{aspect_ratio?:string;crop_config?:{mode?:string;layout_mode?:string;layout_mode_source?:string}|null},enabled:boolean):boolean {
 if(!enabled||clip.aspect_ratio!=='9:16')return false;
 const c=clip.crop_config;
 return !c?.layout_mode||c.layout_mode_source==='genre_recommendation'||(c.layout_mode_source==='auto'&&c.mode==='smart');
}
