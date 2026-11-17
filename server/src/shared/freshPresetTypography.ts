import type {CaptionPresetOverrides} from './captionPresets.js';
/** New clip creation and explicit preset selection only. Never apply while
 * resolving/loading a saved clip or editor. The individually qualified legacy Arial Black choices are
 * not bundled; bind fresh choices to the same existing Inter face on both
 * preview and libass. Keep every explicit supplied font/bold choice. */
export function freshPresetTypography(id:string,overrides?:CaptionPresetOverrides):CaptionPresetOverrides|undefined {
 if(!['compact_creator','youshaei','karaoke','beasty','mozi','bold_highlight','two_color_highlight','vireo_oneword','vireo_pill','vireo_lime','vireo_hormozi','vireo_spring','vireo_neon'].includes(id)||overrides?.fontFamily!==undefined)return overrides;
 return {...overrides,fontFamily:'Inter',bold:overrides?.bold??true};
}
