import {isRenderablePresetId,NEW_CAPTION_PRESET_ID}from'./captionPresets.js';
/** Creation/unconfigured boundary only. Never called to migrate saved captions. */
export function newCaptionDefaults(style?:string|null,config?:Record<string,any>|null):{captionStyle:string;captionConfig:Record<string,any>} {
 const captionStyle=style||(isRenderablePresetId(config?.presetId)?config!.presetId:NEW_CAPTION_PRESET_ID);
 return{captionStyle,captionConfig:config?structuredClone(config):{presetId:captionStyle}};
}
