/** Bounded source-cut evidence request for newly analyzed explicit smart Auto.
 * Cuts separate camera windows, never establish subjects or crop safety.
 * Source dimensions/fps are independently checked by the decoder. */
export function shortAutoCutDiscovery(clip:{aspect_ratio?:string;crop_config?:{mode?:string;layout_mode_source?:string}|null},duration:number):boolean {
 return clip.aspect_ratio==='9:16'&&clip.crop_config?.mode==='smart'&&clip.crop_config.layout_mode_source==='auto'&&Number.isFinite(duration)&&duration>0&&duration<=30;
}
