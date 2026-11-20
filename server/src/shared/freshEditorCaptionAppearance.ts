import {isRenderablePresetId,resolveCaptionPreset,type CaptionPresetOverrides} from './captionPresets.js';

/** Fresh editor initialization only. Never apply to an existing saved editor.
 * The legacy white/yellow defaults must not override a clip preset's palette. */
export function freshEditorCaptionAppearance(style:string,config:{presetId?:string;presetOverrides?:CaptionPresetOverrides;positionX?:number;positionY?:number}|null|undefined,aspect:string){
 // Only explicit clip coordinates transfer. Materialized derived defaults do not.
 const po=config?.presetOverrides;
 const x=config?.positionX??(po as any)?.positionX;
 const y=config?.positionY??((po as any)?.positionYDerived===true?undefined:po?.positionY);
 const coordinates={...(typeof x==='number'&&Number.isFinite(x)?{position_x:Math.min(.92,Math.max(.08,x))}:{}),...(typeof y==='number'&&Number.isFinite(y)?{position_y:Math.min(.92,Math.max(.08,y))}:{}),...((typeof x==='number'&&Number.isFinite(x))||(typeof y==='number'&&Number.isFinite(y))?{position_explicit:true}:{})};
 const id=isRenderablePresetId(style)?style:config?.presetId&&isRenderablePresetId(config.presetId)?config.presetId:null;
 if(!id)return {...coordinates,primary_color:'#FFFFFF',highlight_color:'#FACC15',animation:'highlight' as const};
 const overrides=config?.presetOverrides;
 const preset=resolveCaptionPreset(id,overrides,aspect);
 return {...coordinates,...(overrides?.fontFamily!==undefined?{font_family:preset.fontFamily}:{}),...(overrides?.fontSize!==undefined?{font_size:preset.fontSize}:{}),...(overrides?.bold!==undefined?{font_weight:preset.fontWeight??(preset.bold?'bold' as const:'regular' as const)}:{}),primary_color:preset.textColor,highlight_color:preset.activeColor,animation:config?.presetOverrides?.wordAnimationType??(preset.cueMotion?'none' as const:undefined),...(config?.presetOverrides?.wordAnimationScale!==undefined?{animation_scale:config.presetOverrides.wordAnimationScale}:{})};
}
