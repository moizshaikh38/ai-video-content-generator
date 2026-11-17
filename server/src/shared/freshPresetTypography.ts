import type {CaptionPresetOverrides} from './captionPresets.js';
/** New clip creation and explicit preset selection only. Never apply while
 * resolving/loading a saved clip or editor. Compact's legacy Arial Black is
 * not bundled; bind fresh choices to the same existing Inter face on both
 * preview and libass. Keep every explicit supplied font/bold choice. */
export function freshPresetTypography(id:string,overrides?:CaptionPresetOverrides):CaptionPresetOverrides|undefined {
 if(id!=='compact_creator'||overrides?.fontFamily!==undefined)return overrides;
 return {...overrides,fontFamily:'Inter',bold:overrides?.bold??true};
}
