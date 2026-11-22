import{effectiveScenePatch}from'./sceneLayoutFields.js';
/** Explicit destination geometry, independent of source focus and tracker state. */
export interface ManualVideoPlacement {version:1;space:'canvas_normalized';x:number;y:number;w:number;h:number}
export function validManualPlacement(r:unknown):r is ManualVideoPlacement {
 const p=r as ManualVideoPlacement;return !!p&&p.version===1&&p.space==='canvas_normalized'&&[p.x,p.y,p.w,p.h].every(Number.isFinite)&&p.x>=0&&p.y>=0&&p.w>=.02&&p.h>=.02&&p.x+p.w<=1.000000001&&p.y+p.h<=1.000000001;
}
export function placementPixels(p:ManualVideoPlacement,w:number,h:number){if(!validManualPlacement(p))throw Error('Invalid manual video placement');return {x:Math.round(p.x*w),y:Math.round(p.y*h),w:Math.max(2,Math.round(p.w*w/2)*2),h:Math.max(2,Math.round(p.h*h/2)*2)};}
export function containedPicture(sw:number,sh:number,cw:number,ch:number):ManualVideoPlacement{const k=Math.min(cw/sw,ch/sh);const w=sw*k/cw,h=sh*k/ch;return {version:1,space:'canvas_normalized',x:(1-w)/2,y:(1-h)/2,w,h};}
/** Deliberately narrow first contract. Other composition contracts are not silently flattened. */
export function placementSupported(i:any,canvas?:any){const t=i?.transform;return (!canvas?.aspect_ratio||['9:16','1:1','16:9'].includes(canvas.aspect_ratio))&& !i?.hidden&&i?.type==='VIDEO'&&['fit','blur'].includes(i?.crop?.mode)&&(i.crop.scale??1)===1&&!canvas?.background_corner_radius&&!i.panels&&!i.framing_window&&!i.is_title_card&&!i.is_freeze&&!i.keyframes?.length&&(!t||(!t.position_x&&!t.position_y&&(t.scale??1)===1&&!t.rotation&&(t.opacity??1)===1));}
/** Pointer math in normalized output coordinates. Resize keeps source/destination aspect constant. */
export function dragPlacement(p:ManualVideoPlacement,dx:number,dy:number,corner?:string):ManualVideoPlacement{
 if(!corner)return {...p,x:Math.max(0,Math.min(1-p.w,p.x+dx)),y:Math.max(0,Math.min(1-p.h,p.y+dy))};
 const left=corner.includes('w'),top=corner.includes('n');const ax=left?p.x+p.w:p.x,ay=top?p.y+p.h:p.y;
 const raw=Math.max(.02/p.w,.02/p.h,1+((left?-dx:dx)/p.w+(top?-dy:dy)/p.h)/2);
 const max=Math.min((left?ax:1-ax)/p.w,(top?ay:1-ay)/p.h);const k=Math.min(raw,max),w=p.w*k,h=p.h*k;return {...p,x:left?ax-w:ax,y:top?ay-h:ay,w,h};
}
export function assertManualPlacement(i:any,canvas?:any){if(i.manual_placement===undefined&&i.manual_source_crop===undefined)return;if(!validManualPlacement(i.manual_placement)||!placementSupported(i,canvas))throw Error('Manual placement needs review: use Fit/Blur without conflicting transform, zoom, panels or rounded corners.');const s=i.manual_source_crop;if(s===undefined)throw Error('Manual placement requires a source-bound picture window.');if(s!==undefined&&(!validManualSourceCrop(s)||s.source_path!==i.source_path||s.source_asset_id!==i.source_asset_id))throw Error('Manual source crop does not match this video.');if(canvas?.aspect_ratio&&s){const ar=canvas.aspect_ratio==='16:9'?16/9:canvas.aspect_ratio==='1:1'?1:9/16;const pictureAspect=i.manual_placement.w/i.manual_placement.h*ar,sourceAspect=s.w*s.source_width/(s.h*s.source_height);if(Math.abs(pictureAspect/sourceAspect-1)>.01)throw Error('Manual picture aspect changed. Restore original framing before changing aspect ratio.');}}
export function manualPlacementFilter(i:any,cw:number,ch:number,canvas?:any,decoded?:{width:number;height:number}|null){
 assertManualPlacement(i,canvas);const r=placementPixels(i.manual_placement,cw,ch),s=i.manual_source_crop;
 if(s&&(!decoded||decoded.width!==s.source_width||decoded.height!==s.source_height))throw Error('Manual source crop dimensions need review.');
 const raw=String(canvas?.background_color||'000000').replace('#','');const color=/^[0-9a-f]{6}$/i.test(raw)?raw:'000000';const tag='vmp'+String(i.id).replace(/[^a-z0-9]/gi,'').slice(-20);
 const src=sourceCropPixels(s);const crop=`crop=${src.w}:${src.h}:${src.x}:${src.y},`;
 const fg=`${crop}scale=${r.w}:${r.h}:force_original_aspect_ratio=increase,crop=${r.w}:${r.h}:(iw-ow)/2:(ih-oh)/2`;
 const bg=i.crop.mode==='blur'?`scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch},boxblur=${Math.max(1,Math.round(25*cw/1080))}:5,eq=brightness=-0.15:contrast=0.95`:`scale=${cw}:${ch},drawbox=x=0:y=0:w=${cw}:h=${ch}:color=0x${color}:t=fill`;
 return `split=2[${tag}b][${tag}f];[${tag}b]${bg}[${tag}bg];[${tag}f]${fg}[${tag}fg];[${tag}bg][${tag}fg]overlay=${Math.min(cw-r.w,r.x)}:${Math.min(ch-r.h,r.y)}:format=auto`;
}
export interface ManualSourceCrop {version:1;space:'source_normalized';x:number;y:number;w:number;h:number;source_width:number;source_height:number;source_path:string;source_asset_id:string}
export function validManualSourceCrop(r:unknown):r is ManualSourceCrop{const s=r as ManualSourceCrop;return !!s&&s.version===1&&s.space==='source_normalized'&&[s.x,s.y,s.w,s.h,s.source_width,s.source_height].every(Number.isFinite)&&s.x>=0&&s.y>=0&&s.w>=.02&&s.h>=.02&&s.x+s.w<=1.000000001&&s.y+s.h<=1.000000001&&Number.isSafeInteger(s.source_width)&&Number.isSafeInteger(s.source_height)&&s.source_width>0&&s.source_height>0&&typeof s.source_path==='string'&&s.source_path.length>0&&typeof s.source_asset_id==='string'&&s.source_asset_id.length>0;}
export function materializeFit(i:any,canvas:any,sw:number,sh:number,cw:number,ch:number){
 const band=(canvas.fit_band??i.crop?.band)==='4:3'&&(canvas.aspect_ratio??'9:16')==='9:16';const aspect=band?4/3:sw/sh;
 let w=1,h=1;if(sw/sh>aspect)w=sh*aspect/sw;else h=sw/aspect/sh;
 const source:ManualSourceCrop={version:1,space:'source_normalized',x:(1-w)*(i.crop?.focusX??.5),y:(1-h)*(i.crop?.focusY??.5),w,h,source_width:sw,source_height:sh,source_path:i.source_path,source_asset_id:i.source_asset_id};
 const space=cw*(canvas.background_spacing??0)/100;const k=Math.min((cw-2*space)/(sw*w),(ch-2*space)/(sh*h));const dw=sw*w*k/cw,dh=sh*h*k/ch;
 return {source,destination:{version:1,space:'canvas_normalized',x:(1-dw)/2,y:(1-dh)/2,w:dw,h:dh} as ManualVideoPlacement};
}
/** YUV420 crop coordinates are explicit even decoded-source pixels in both channels. */
export function sourceCropPixels(s:ManualSourceCrop){const even=(n:number)=>Math.max(2,Math.floor(n/2)*2);const w=Math.min(s.source_width,even(s.w*s.source_width)),h=Math.min(s.source_height,even(s.h*s.source_height));return{x:Math.max(0,Math.min(s.source_width-w,Math.floor(s.x*s.source_width/2)*2)),y:Math.max(0,Math.min(s.source_height-h,Math.floor(s.y*s.source_height/2)*2)),w,h};}
export function sourcePreviewStyle(s:ManualSourceCrop,d:{x:number;y:number;w:number;h:number}){const r=sourceCropPixels(s);const k=Math.max(d.w/r.w,d.h/r.h),w=s.source_width*k,h=s.source_height*k;const x=d.x+(d.w-r.w*k)/2-r.x*k,y=d.y+(d.h-r.h*k)/2-r.y*k;return{position:'absolute' as const,left:x,top:y,width:w,height:h,maxWidth:'none',objectFit:'fill' as const,transform:'none',clipPath:`inset(${(d.y-y)/h*100}% ${(x+w-d.x-d.w)/w*100}% ${(y+h-d.y-d.h)/h*100}% ${(d.x-x)/w*100}%)`};}

/** Persist only the displayed scene; all other item/source data is retained. */
export function placementUpdate(item:any,sourceTime:number,destination:ManualVideoPlacement|undefined,source?:ManualSourceCrop){
 const patch={manual_placement:destination,...(source?{manual_source_crop:source}:destination===undefined?{manual_source_crop:undefined}:{})};
 const selected=item.scene_layout_overrides?.find((o:any)=>sourceTime>=o.start&&(sourceTime<o.end||(Math.abs(sourceTime-item.source_end)<=1e-9&&Math.abs(o.end-item.source_end)<=1e-9)));
 return selected?{scene_layout_overrides:item.scene_layout_overrides.map((o:any)=>o===selected?{...o,patch:{...o.patch,...patch}}:o)}:patch;
}

export function assertPlacementTree(item:any,canvas?:any){assertManualPlacement(item,canvas);for(const scene of item.scene_layout_overrides??[])assertManualPlacement(effectiveScenePatch(item,scene.patch),canvas);}
