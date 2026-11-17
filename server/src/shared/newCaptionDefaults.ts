import {freshPresetTypography}from './freshPresetTypography.js';
import {isRenderablePresetId,NEW_CAPTION_PRESET_ID}from'./captionPresets.js';
/** Creation/unconfigured boundary only. Never called to migrate saved captions. */
export function newCaptionDefaults(style?:string|null,config?:Record<string,any>|null,options?:{freshSelection?:boolean}):{captionStyle:string;captionConfig:Record<string,any>} {
 const captionStyle=style||(isRenderablePresetId(config?.presetId)?config!.presetId:NEW_CAPTION_PRESET_ID);
 const captionConfig=config?structuredClone(config):{presetId:captionStyle};
 if(!style&&captionConfig.presetId===undefined)captionConfig.presetId=captionStyle;
 if(options?.freshSelection){const next=freshPresetTypography(captionStyle,captionConfig.presetOverrides);if(next!==captionConfig.presetOverrides)captionConfig.presetOverrides=next;}
 return{captionStyle,captionConfig};
}
