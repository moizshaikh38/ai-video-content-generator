export interface AutomaticLayoutPolicy {defaultLayout:'auto'|'fit'|'fill';allowed: Array<'fit'|'fill'|'split'>}
export function normalizeAutomaticLayoutPolicy(v:any):AutomaticLayoutPolicy|undefined{
 if(v===undefined)return undefined;
 if(!v||!['auto','fit','fill'].includes(v.defaultLayout)||!Array.isArray(v.allowed)||!v.allowed.length||v.allowed.some((x:any)=>!['fit','fill','split'].includes(x)))throw Object.assign(Error('Choose at least one supported automatic layout'),{statusCode:400,code:'INVALID_LAYOUT_POLICY'});
 return {defaultLayout:v.defaultLayout,allowed:[...new Set(v.allowed)] as AutomaticLayoutPolicy['allowed']};
}
/** Allowed choices narrow measured geometry, never justify cropping uncertain
 * content. Review Fit may override the list and must remain marked for Review. */
export function applyAutomaticLayoutPolicy<T extends {start:number;windowW:number;windowH:number;keyframes:any[];split?:any;contextStatus?:string;uncertainty?:string}>(shots:T[],policy:AutomaticLayoutPolicy|undefined,w:number,h:number):T[]{
 if(!policy)return shots;
 return shots.map(s=>{const kind=s.split?'split':Math.abs(s.windowW*w/(s.windowH*h)-9/16)<.01?'fill':'fit';if(policy.allowed.includes(kind))return s;
 const next:any={...s,kind:'fit',windowW:1,windowH:1,keyframes:[{time:s.start,centerX:.5,centerY:.5}]};delete next.split;
 if(!policy.allowed.includes('fit')){next.contextStatus='unresolved-review-required';next.uncertainty='Review Fit: no allowed measured view works. 4:3 can crop side context; review or choose a manual crop.';}
 return next;});
}
/** Conservative legacy bridge. Legacy tracking has no scene-level evidence,
 * so an excluded legacy presentation becomes one review Fit shot. */
export function legacyPolicyFallback(policy:AutomaticLayoutPolicy|undefined,track:any,duration:number):any[]|undefined{
 if(!policy||track?.metadata?.shot_composition_candidate===true)return undefined;
 const kind=track?.layout_mode==='split'?'split':track?.layout_mode==='blur'||!track?.dominant_track_id?'fit':'fill';
 if(policy.allowed.includes(kind))return undefined;
 return presentFit43([{start:0,end:duration,kind:'fit',windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}],contextStatus:'unresolved-review-required',uncertainty:policy.allowed.includes('fit')?'Review Fit: this automatic layout is outside your allowed list.':'Review Fit: no measured allowed layout preserves this scene. Check cropped context before sharing.'}],track.source_width||1920,track.source_height||1080);
}
/** User-selected presentation default: Auto still chooses the layout; every
 * non-portrait Fit sharp band is 4:3. Side-loss is disclosed, never called safe. */
export function presentFit43<T extends {start:number;windowW:number;windowH:number;keyframes:any[];split?:any;contextStatus?:string;uncertainty?:string}>(shots:T[],w:number,h:number):T[]{return shots.map(s=>{
 if(s.split||Math.abs(s.windowW*w/(s.windowH*h)-9/16)<.01)return s;
 const target=4/3,old=s.windowW*w/(s.windowH*h);if(Math.abs(old-target)<.005)return s;
 // Expand the short dimension first. Shrinking a measured tall body into
 //4:3 discards head/feet even when the source has ample horizontal context.
 let width=s.windowW,height=s.windowH;
 if(old>target){height=Math.min(1,width*w/(target*h));width=Math.min(width,height*target*h/w);}
 else {width=Math.min(1,height*target*h/w);height=Math.min(height,width*w/(target*h));}
 const cropped=width<s.windowW-1e-7||height<s.windowH-1e-7;
 return {...s,windowW:width,windowH:height,contextStatus:'unresolved-review-required',
 uncertainty:cropped?'4:3 Fit crops source context. Review side content and framing before sharing.':'4:3 Fit expands the measured window. Other context remains unresolved; review before sharing.',
 keyframes:s.keyframes.map(k=>({...k,centerX:Math.max(width/2,Math.min(1-width/2,k.centerX)),centerY:Math.max(height/2,Math.min(1-height/2,k.centerY))}))};
});}
export function legacyFit43Plan(track:any,duration:number,group:any,lowConfidence:boolean):any[]|undefined{
 if(track?.metadata?.shot_composition_candidate===true||track?.layout_mode==='split'||track?.layout_mode==='screencast')return undefined;
 if(!group&&!lowConfidence&&track?.dominant_track_id&&track?.layout_mode!=='blur')return undefined;
 const g=group||{windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]};
 return presentFit43([{...g,start:0,end:duration,windowH:g.windowH||1,kind:'fit',contextStatus:'unresolved-review-required',uncertainty:'4:3 Fit can crop side context. Review before sharing.'}],track.source_width||1920,track.source_height||1080);
}
