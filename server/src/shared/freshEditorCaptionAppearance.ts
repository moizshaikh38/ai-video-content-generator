import {isRenderablePresetId,resolveCaptionPreset,type CaptionPresetOverrides} from './captionPresets.js';

/** Fresh editor initialization only. Never apply to an existing saved editor.
 * The legacy white/yellow defaults must not override a clip preset's palette. */
export function freshEditorCaptionAppearance(style:string,config:{presetId?:string;presetOverrides?:CaptionPresetOverrides}|null|undefined,aspect:string){
 const id=isRenderablePresetId(style)?style:config?.presetId&&isRenderablePresetId(config.presetId)?config.presetId:null;
 if(!id)return {primary_color:'#FFFFFF',highlight_color:'#FACC15',animation:'highlight' as const};
 const preset=resolveCaptionPreset(id,config?.presetOverrides,aspect);
 return {primary_color:preset.textColor,highlight_color:preset.activeColor,animation:config?.presetOverrides?.wordAnimationType??(preset.cueMotion?'none' as const:undefined),...(config?.presetOverrides?.wordAnimationScale!==undefined?{animation_scale:config.presetOverrides.wordAnimationScale}:{})};
}
