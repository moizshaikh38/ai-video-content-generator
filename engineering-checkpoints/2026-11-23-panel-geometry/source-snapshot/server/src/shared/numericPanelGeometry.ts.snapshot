import type {PanelRect} from './panelLayouts.js';

/** Arithmetic only. Authority, source identity, edit ownership and timeline
 * validation remain the responsibility of the real product callers. */
export interface NumericPanelInput {
  target:PanelRect;
  base:PanelRect;
  fit:'cover'|'contain';
  scale:number;
  focusX:number;
  focusY:number;
  backdrop:'black'|'blur';
}
export interface NumericPanel {
  target:PanelRect;
  view:PanelRect;
  foreground:{width:number;height:number;x:number;y:number};
  backdrop?:{view:PanelRect;blurRadius:number};
}
export interface NumericPanelGeometry {
  source:{width:number;height:number};
  output:{width:number;height:number};
  panels:NumericPanel[];
}
const floorEven=(n:number)=>Math.floor(n/2)*2;
const even=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&Number.isInteger(n)&&n%2===0;
const rect=(r:PanelRect)=>!!r&&[r.x,r.y,r.w,r.h].every(even)&&r.x>=0&&r.y>=0&&r.w>=2&&r.h>=2;
const within=(r:PanelRect,w:number,h:number)=>rect(r)&&r.x+r.w<=w&&r.y+r.h<=h;
const copy=(r:PanelRect):PanelRect=>({x:r.x,y:r.y,w:r.w,h:r.h});
function cover(base:PanelRect,target:PanelRect,scale:number,x:number,y:number):PanelRect {
  const a=target.w/target.h;
  const w=Math.max(2,floorEven(Math.min(base.w,base.h*a)/scale));
  const h=Math.max(2,floorEven(Math.min(base.h,base.w/a)/scale));
  return{x:base.x+floorEven((base.w-w)*x),y:base.y+floorEven((base.h-h)*y),w,h};
}
/** Receives already chosen, explicit source/target pixels. It never chooses
 * semantic roles, substitutes a layout, changes a source rect or persists. */
export function materializeNumericPanels(
 source:{width:number;height:number},output:{width:number;height:number},inputs:NumericPanelInput[]
):NumericPanelGeometry|undefined {
 if(!source||!output||![source.width,source.height,output.width,output.height].every(n=>even(n)&&n>=2&&n<=16384)||!Array.isArray(inputs)||inputs.length<1||inputs.length>4)return;
 for(const p of inputs){
  if(!p||!within(p.target,output.width,output.height)||!within(p.base,source.width,source.height)||!['contain','cover'].includes(p.fit)||!['black','blur'].includes(p.backdrop)||![p.scale,p.focusX,p.focusY].every(Number.isFinite)||p.scale<1||p.scale>4||p.focusX<0||p.focusX>1||p.focusY<0||p.focusY>1)return;
 }
 // The ordinary layouts must tile exactly, without gaps or overlaps.
 if(inputs.reduce((sum,p)=>sum+p.target.w*p.target.h,0)!==output.width*output.height)return;
 for(let i=0;i<inputs.length;i++)for(let j=0;j<i;j++){
  const a=inputs[i].target,b=inputs[j].target;
  if(Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y))return;
 }
 const panels=inputs.map((p):NumericPanel=>{
  const target=copy(p.target),base=copy(p.base);
  if(p.fit==='cover')return{target,view:cover(base,target,p.scale,p.focusX,p.focusY),foreground:{width:target.w,height:target.h,x:0,y:0}};
  const k=Math.min(target.w/base.w,target.h/base.h);
  const width=Math.max(2,floorEven(base.w*k)),height=Math.max(2,floorEven(base.h*k));
  return{target,view:base,foreground:{width,height,x:floorEven((target.w-width)/2),y:floorEven((target.h-height)/2)},...(p.backdrop==='blur'?{backdrop:{view:cover(base,target,1,.5,.5),blurRadius:Math.max(1,Math.min(Math.round(output.width/540*16),Math.floor(Math.min(target.w,target.h)/2)-1))}}:{})};
 });
 const result={source:{...source},output:{...output},panels};
 return validNumericPanels(result)?result:undefined;
}
export function validNumericPanels(g:NumericPanelGeometry):boolean {
 try{
  if(!g||![g.source.width,g.source.height,g.output.width,g.output.height].every(n=>even(n)&&n>=2&&n<=16384)||!Array.isArray(g.panels)||g.panels.length<1||g.panels.length>4)return false;
  for(const p of g.panels){
   const f=p.foreground,t=p.target;
   if(!within(t,g.output.width,g.output.height)||!within(p.view,g.source.width,g.source.height)||![f.width,f.height,f.x,f.y].every(even)||f.width<2||f.height<2||f.x<0||f.y<0||f.x+f.width>t.w||f.y+f.height>t.h)return false;
   if(p.backdrop&&(!within(p.backdrop.view,g.source.width,g.source.height)||!Number.isInteger(p.backdrop.blurRadius)||p.backdrop.blurRadius<1||p.backdrop.blurRadius>=Math.min(t.w,t.h)/2))return false;
  }
  if(g.panels.reduce((sum,p)=>sum+p.target.w*p.target.h,0)!==g.output.width*g.output.height)return false;
  for(let i=0;i<g.panels.length;i++)for(let j=0;j<i;j++){
   const a=g.panels[i].target,b=g.panels[j].target;
   if(Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y))return false;
  }
  return true;
 }catch{return false;}
}
/** CSS placement is scaled FROM physical output pixels, never independently
 * rounded on the 360x640 display canvas. Blur kernels still differ. */
export function numericPanelLayers(g:NumericPanelGeometry,width:number,height:number){
 if(!validNumericPanels(g)||![width,height].every(n=>Number.isFinite(n)&&n>0))return;
 const sx=width/g.output.width,sy=height/g.output.height;
 const place=(r:PanelRect,w:number,h:number,x:number,y:number)=>{
  const kx=w/r.w,ky=h/r.h;
  return{left:(x-r.x*kx)*sx,top:(y-r.y*ky)*sy,width:g.source.width*kx*sx,height:g.source.height*ky*sy,clipPath:`inset(${r.y/g.source.height*100}% ${(g.source.width-r.x-r.w)/g.source.width*100}% ${(g.source.height-r.y-r.h)/g.source.height*100}% ${r.x/g.source.width*100}%)`};
 };
 return g.panels.map(p=>({target:{left:p.target.x*sx,top:p.target.y*sy,width:p.target.w*sx,height:p.target.h*sy},foreground:place(p.view,p.foreground.width,p.foreground.height,p.foreground.x,p.foreground.y),...(p.backdrop?{backdrop:{...place(p.backdrop.view,p.target.w,p.target.h,0,0),blurRadius:p.backdrop.blurRadius*sx}}:{})}));
}
/** Chain-safe numeric fragment, with no input/output labels at its boundary.
 * The input stream must still be the validated unscaled source pixel grid. */
export function numericPanelsFilter(g:NumericPanelGeometry,tag:string):string|undefined {
 if(!validNumericPanels(g)||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(tag))return;
 const crop=(r:PanelRect)=>`crop=${r.w}:${r.h}:${r.x}:${r.y}`;
 const parts=[`split=${g.panels.length}${g.panels.map((_,i)=>`[${tag}_i${i}]`).join('')}`];
 g.panels.forEach((p,i)=>{
  const f=p.foreground,t=p.target;
  if(p.backdrop){
   parts.push(`[${tag}_i${i}]split=2[${tag}_fgsrc${i}][${tag}_bgsrc${i}]`,`[${tag}_bgsrc${i}]${crop(p.backdrop.view)},scale=${t.w}:${t.h},boxblur=${p.backdrop.blurRadius}:4,eq=brightness=-0.15[${tag}_bg${i}]`,`[${tag}_fgsrc${i}]${crop(p.view)},scale=${f.width}:${f.height}[${tag}_fg${i}]`,`[${tag}_bg${i}][${tag}_fg${i}]overlay=${f.x}:${f.y},setsar=1[${tag}_p${i}]`);
  }else parts.push(`[${tag}_i${i}]${crop(p.view)},scale=${f.width}:${f.height},pad=${t.w}:${t.h}:${f.x}:${f.y}:color=black,setsar=1[${tag}_p${i}]`);
 });
 // xstack preserves the declared targets for all existing 2/3/4-view layouts.
 parts.push(g.panels.length===1?`[${tag}_p0]null`:g.panels.map((_,i)=>`[${tag}_p${i}]`).join('')+`xstack=inputs=${g.panels.length}:layout=${g.panels.map(p=>`${p.target.x}_${p.target.y}`).join('|')}:fill=black`);
 return parts.join(';');
}
export function numericPanelSeam(g:NumericPanelGeometry):number|undefined {
 if(!validNumericPanels(g)||g.panels.length<2)return;
 return(g.panels[0].target.y+g.panels[0].target.h)/g.output.height;
}
