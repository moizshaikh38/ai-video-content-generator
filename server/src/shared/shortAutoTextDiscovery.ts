/** Request bounded OCR only on a newly analyzed explicit portrait Auto choice.
 * The decoder rechecks duration, geometry and frame budgets independently.
 * This adds measured constraints, never establishes absence of context. */
export function shortAutoTextDiscovery(clip:{aspect_ratio?:string;crop_config?:{mode?:string;layout_mode_source?:string}|null},duration:number):boolean {
 return clip.aspect_ratio==='9:16'&&clip.crop_config?.mode==='smart'&&clip.crop_config.layout_mode_source==='auto'&&Number.isFinite(duration)&&duration>0&&duration<=12;
}
