import {trackerEvidenceRange} from './trackerEvidence.js';
export type SourceRect={x:number;y:number;w:number;h:number};
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
function centerAt(ks:any[],t:number){let n=0;while(n+1<ks.length&&ks[n+1].time<=t)n++;const a=ks[n],b=ks[Math.min(n+1,ks.length-1)],f=b.time>a.time?clamp((t-a.time)/(b.time-a.time),0,1):0;return {x:a.centerX+(b.centerX-a.centerX)*f,y:a.centerY+(b.centerY-a.centerY)*f};}
/** Only a trailing, same-scene, full-canvas solo handoff. No evidence is
 * extended. Split/Fit/manual/frozen/stale/near-cut cases keep existing behavior. */
export function trackerHandoffSpec(item:any,plan:any[],sourceW:number,sourceH:number,clipStart=0){
 const r=trackerEvidenceRange(item?.tracker),tr=item?.tracker;
 if(!r||item.crop||item.panels||item.framing_window||item.crop_config?.layout_mode_source==='user'||item.automatic_framing?.enabled===false||item.is_freeze||item.is_title_card||sourceW!==tr.source_width||sourceH!==tr.source_height||![sourceW,sourceH,clipStart].every(Number.isFinite)||sourceW<=0||sourceH<=0)return null;
 if(!Array.isArray(plan)||![item.source_start,item.source_end].every(Number.isFinite)||item.source_end<=item.source_start||sourceW/sourceH<9/16||tr.keyframes.some((k:any)=>k.centerX<0||k.centerX>1||k.centerY<0||k.centerY>1))return null;
 const speed=item.speed?.speed??1;if(!Number.isFinite(speed)||speed!==1||!Number.isFinite(item.source_end)||r.end>=item.source_end-.05)return null;const duration=Math.min(.4*speed,(r.end-r.start)/2),start=r.end-duration;
 if(start<item.source_start)return null;
 const s=plan.find(s=>s&&[s.start,s.end,s.windowW,s.windowH].every(Number.isFinite)&&s.kind==='solo'&&!s.split&&!s.contextStatus&&start-clipStart>=s.start+.001&&r.end-clipStart<s.end-.001);
 if(!s||duration<.1||!Array.isArray(s.keyframes)||!s.keyframes.length||s.keyframes.some((k:any,n:number)=>!k||![k.time,k.centerX,k.centerY].every(Number.isFinite)||k.centerX<0||k.centerX>1||k.centerY<0||k.centerY>1||(n>0&&k.time<=s.keyframes[n-1].time))||s.keyframes[0].time>start-clipStart||s.keyframes[s.keyframes.length-1].time<r.end-clipStart)return null;
 const w=Math.round(s.windowW*sourceW),h=Math.round(s.windowH*sourceH);
 if(w<1||h<1||w>sourceW||h>sourceH||Math.abs(w/h-9/16)>.004)return null;
 return {start,end:r.end,duration,sourceW,sourceH,clipStart,shot:s,tracker:tr,w,h};
}
export function trackerHandoffRect(spec:NonNullable<ReturnType<typeof trackerHandoffSpec>>,sourceTime:number):SourceRect|null{
 if(!Number.isFinite(sourceTime)||sourceTime<spec.start||sourceTime>spec.end)return null;
 const{sourceW:W,sourceH:H,w,h}=spec,a=centerAt(spec.tracker.keyframes,sourceTime),b=centerAt(spec.shot.keyframes,sourceTime-spec.clipStart),tw=H*9/16;
 const ar={x:clamp(a.x*W-tw/2,0,W-tw),y:0,w:tw,h:H},br={x:clamp(b.x*W-w/2,0,W-w),y:clamp(b.y*H-h/2,0,H-h),w,h};
 let u=clamp((sourceTime-spec.start)/spec.duration,0,1);u=u*u*(3-2*u);
 return {x:ar.x+(br.x-ar.x)*u,y:ar.y+(br.y-ar.y)*u,w:ar.w+(br.w-ar.w)*u,h:ar.h+(br.h-ar.h)*u};
}
/** Sample the same pure geometry at a bounded30Hz source clock. perspective
 * maps the selected rectangle, then restores its9:16geometry at output size. */
export function buildTrackerHandoffFilter(spec:NonNullable<ReturnType<typeof trackerHandoffSpec>>,sliceStart:number,sliceDuration:number,outputW:number,outputH:number){
 if(![sliceStart,sliceDuration,outputW,outputH].every(Number.isFinite)||outputW<=0||outputH<=0||sliceDuration<=0||sliceStart>spec.start||sliceStart+sliceDuration<spec.end-1e-5)return null;
 const rows:Array<{t:number;r:SourceRect}>=[];
 for(let t=spec.start;t<spec.end;t+=1/30){const r=trackerHandoffRect(spec,t);if(r)rows.push({t:t-sliceStart,r});}rows.push({t:spec.end-sliceStart,r:trackerHandoffRect(spec,spec.end)!});
 // FFmpeg perspective counts its first input frame as1, not0.
 const expr=(field:keyof SourceRect)=>{let s=String(rows[rows.length-1]!.r[field]);for(let n=rows.length-2;n>=0;n--){const a=rows[n],b=rows[n+1];s=`if(lte((in-1)/30\\,${b.t.toFixed(6)})\\,${a.r[field].toFixed(6)}+(${(b.r[field]-a.r[field]).toFixed(6)})*max(0\\,(in-1)/30-${a.t.toFixed(6)})/${(b.t-a.t).toFixed(6)}\\,${s})`;}return s;};
 // This fragment is only for the handoff interval; the normal tracker filter
 // compiles earlier measured frames separately.
 const x=expr('x'),y=expr('y'),w=expr('w'),h=expr('h');
 return `fps=30,perspective=x0='${x}':y0='${y}':x1='(${x})+(${w})':y1='${y}':x2='${x}':y2='(${y})+(${h})':x3='(${x})+(${w})':y3='(${y})+(${h})':sense=source:eval=frame:interpolation=cubic,scale=${outputW}:${outputH},setsar=1`;
}
