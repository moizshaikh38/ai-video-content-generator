/** Body-only group guard for a measured ordinary Auto Fit, never action or identity inference.
 * Requires dense repeated multi-body observations. It does not invent ball, screen or HUD regions.
 */
export function bodyGroupFitProposal(samples:any[],duration:number,sourceW:number,sourceH:number){
 if(![duration,sourceW,sourceH].every(Number.isFinite)||duration<2||sourceW<=0||sourceH<=0||sourceW/sourceH<=4/3)return null;
 if(!Array.isArray(samples)||samples.length<8)return null;
 const rows=samples.filter(s=>Number.isFinite(s?.time)&&s.time>=0&&s.time<duration).sort((a,b)=>a.time-b.time);
 if(rows.length<8||rows.some(s=>!Array.isArray(s.faces)||s.faces.length||!Array.isArray(s.persons)))return null;
 const times=rows.map(s=>s.time);
 if(times[0]>.35||duration-times.at(-1)!>.6||times.some((t,i)=>i>0&&(t-times[i-1]>.6||t<=times[i-1])))return null;
 const valid=(p:any)=>p&&[p.x,p.y,p.width,p.height,p.confidence].every(Number.isFinite)&&p.x>=0&&p.y>=0&&p.width>0&&p.height>0&&p.x+p.width<=1&&p.y+p.height<=1&&p.width*p.height>=.002&&p.confidence>=.5;
 const boxes=rows.map(s=>s.persons.filter(valid));
 if(boxes.filter(b=>b.length>=2).length/rows.length<.8)return null;
 const all=boxes.flat(),left=Math.max(0,Math.min(...all.map(p=>p.x))-.025),right=Math.min(1,Math.max(...all.map(p=>p.x+p.width))+.025);
 const width=4/3*sourceH/sourceW,low=Math.max(width/2,right-width/2),high=Math.min(1-width/2,left+width/2);
 // Repeated group presence is not proof that a lone distant box is real.
 // Both lateral extremes must recur across distinct sampled times.
 const repeated=(side:'left'|'right')=>{
   const t=rows.filter((_,i)=>boxes[i].some(p=>side==='left'?p.x<=left+.08:p.x+p.width>=right-.08)).map(s=>s.time);
   return t.length>=3&&t.at(-1)!-t[0]>=.5;
 };
 if(!repeated('left')||!repeated('right'))return null;
 if(low>high)return {start:0,end:duration,kind:'fit' as const,windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}],presentationProtection:{preserveWindow:true as const,reason:'measured-subject-conflict' as const},contextStatus:'unresolved-review-required' as const,uncertainty:'Full-source Fit: repeated body-only group measurements do not fit the preferred 4:3 view. Person identity, missed bodies, objects and action remain unverified.'};
 const centerX=Math.max(low,Math.min(high,.5));
 if(Math.abs(centerX-.5)<1e-7)return null;
 return {start:0,end:duration,kind:'fit' as const,windowW:width,windowH:1,keyframes:[{time:0,centerX,centerY:.5}],contextStatus:'unresolved-review-required' as const,uncertainty:'4:3 Fit anchored to repeated body-only group measurements. Person identity, missed bodies, side objects and action remain unverified.'};
}
