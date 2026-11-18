import type{ReframeSample}from'../types/index.js';import{PANEL_RECTS,type ItemPanels}from'./panelLayouts.js';
/** Explicit manual face-window review only. This does not replace automatic
 * body/context protection. Extra/unmatched bodies, missing faces, identity
 * changes and crossed windows abstain. Not whole-body or speaker evidence. */
export function expandedThreeManualReview(samples:ReframeSample[],width:number,height:number):ItemPanels|undefined{
 if(samples.length<6||![width,height].every(Number.isFinite)||!(width>0&&height>0))return;
 const ids=[...new Set(samples.flatMap(s=>s.faces.map(f=>f.track_id)))];if(ids.length!==3||ids.some(id=>!id))return;
 if(samples.some(s=>s.faces.length!==3||new Set(s.faces.map(f=>f.track_id)).size!==3||s.faces.some(f=>!ids.includes(f.track_id)||![f.x,f.y,f.width,f.height,f.center_x,f.center_y,f.confidence].every(Number.isFinite)||f.confidence<.7||f.width*f.height<.002||f.x<0||f.y<0||f.x+f.width>1||f.y+f.height>1)))return;
 for(const s of samples){const bodies=(s.persons||[]).filter(p=>p.confidence>=.4);if(bodies.length!==3)return;const owners=bodies.map(p=>s.faces.filter(f=>f.center_x>=p.x&&f.center_x<=p.x+p.width&&f.center_y>=p.y&&f.center_y<=p.y+p.height*.55).map(f=>f.track_id));if(owners.some(o=>o.length!==1)||new Set(owners.flat()).size!==3)return;}
 const mean=(id:typeof ids[number])=>samples.reduce((q,s)=>q+s.faces.find(f=>f.track_id===id)!.center_x,0)/samples.length;ids.sort((a,b)=>mean(a)-mean(b));
 for(const id of ids){const faces=samples.map(s=>s.faces.find(f=>f.track_id===id)!);const x=mean(id),y=faces.reduce((q,f)=>q+f.center_y,0)/faces.length;if(faces.some(f=>Math.hypot(f.center_x-x,f.center_y-y)>.12))return;}
 const bounds=ids.map(id=>{const faces=samples.map(s=>s.faces.find(f=>f.track_id===id)!);return{left:Math.min(...faces.map(f=>f.x-f.width*.35)),right:Math.max(...faces.map(f=>f.x+f.width*1.35)),top:Math.min(...faces.map(f=>f.y-f.height*.9)),bottom:Math.max(...faces.map(f=>f.y+f.height*1.6))}});
 const slots=[];for(let i=0;i<3;i++){const b=bounds[i],ratio=PANEL_RECTS.three[i].w*9/(PANEL_RECTS.three[i].h*16)*height/width,w=Math.max(b.right-b.left,(b.bottom-b.top)*ratio),h=w/ratio,lo=i?(bounds[i-1].right+b.left)/2:0,hi=i<2?(b.right+bounds[i+1].left)/2:1;if(w>hi-lo||h>1)return;const x=Math.max(lo,Math.min(hi-w,(b.left+b.right-w)/2)),y=Math.max(0,Math.min(1-h,(b.top+b.bottom-h)/2));if(x>b.left+1e-9||x+w<b.right-1e-9||y>b.top+1e-9||y+h<b.bottom-1e-9)return;const r={x,y,w,h};if(samples.some(s=>s.faces.some(f=>f.track_id!==ids[i]&&f.x<r.x+r.w&&f.x+f.width>r.x&&f.y<r.y+r.h&&f.y+f.height>r.y)))return;slots.push({focusX:.5,focusY:.5,scale:1,set:true,fit:'contain' as const,sourceRect:r});}
 return{layout:'three',slots};
}
