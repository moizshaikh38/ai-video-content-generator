import {test} from 'node:test';import assert from 'node:assert/strict';
Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SECRET_KEY:'fixture'});
const {SmartReframeService:S}=await import('../services/smartReframeService.js');
const {ClipRenderService:R}=await import('../services/clipRenderService.js');
const face=(id:string,cx:number)=>({track_id:id,x:cx-.05,y:.2,width:.1,height:.15,center_x:cx,center_y:.275,confidence:.95});
const mk=(regs:any[],layout='split'):any=>({status:'ready',isStale:false,sourceObjectVerified:true,source_width:910,source_height:480,layout_mode:layout,dominant_track_id:'a',detected_face_count:2,smoothed_keyframes:[{time:0,centerX:.2,centerY:.5}],
 metadata:{analyzed_source_sha256:'a'.repeat(64),scene_cuts:[],protected_content_regions:regs},raw_samples:Array.from({length:16},(_,i)=>({time:i*.25,faces:[face('a',.2),face('b',.8)],persons:[{x:.02,y:.14,width:.31,height:.84,confidence:.95},{x:.67,y:.14,width:.31,height:.84,confidence:.95}]}))});
const auto={layout_mode_source:'auto'};const seam={start:0,end:4,x:.38,y:.35,width:.24,height:.2,confidence:.9};
test('ordinary Auto keeps the planner protected full-source Fit when a supplied region crosses a pair seam, retaining its valid reason',()=>{
 const p=S.explicitAutoLayoutPlan(mk([seam]),auto,4)!;assert.ok(p);assert.equal(p.length,1);
 assert.equal(p[0].kind,'fit');assert.equal(p[0].windowW,1);assert.equal(p[0].windowH,1);assert.equal(p[0].split,undefined);
 assert.equal(p[0].presentationProtection?.preserveWindow,true);assert.equal(p[0].presentationProtection?.reason,'measured-subject-conflict');
});
const origGet=(S as any).getReframeTrack;
test('consumer renders the protected Fit, not the measured split, and unprotected pair keeps its existing plan',async()=>{
 try{
 for(const [regs,expectPanels] of [[[seam],false],[[],true]] as any){
  const track=mk(regs);(S as any).getReframeTrack=async()=>track;
  const r=await R.resolveReframeDecision({id:'c',user_id:'u',aspect_ratio:'9:16',crop_config:{mode:'smart',layout_mode_source:'auto'}} as any,4,1,'a'.repeat(64));
  assert.equal(r.layoutMode,'track');assert.equal((r.metadata as any).reason,'automatic_layout_plan');
  assert.equal(/focus_p/.test(r.cropFilter),expectPanels);assert.ok(!/vstack/.test(r.cropFilter));assert.equal(/boxblur/.test(r.cropFilter),!expectPanels);
 }
 }finally{(S as any).getReframeTrack=origGet}
});
test('gate stays closed for stale, unbound, user-owned and low-confidence-region inputs',()=>{
 const stale=mk([seam]);stale.isStale=true;assert.equal(S.explicitAutoLayoutPlan(stale,auto,4),undefined);
 const unbound=mk([seam]);unbound.sourceObjectVerified=false;assert.equal(S.explicitAutoLayoutPlan(unbound,auto,4),undefined);
 assert.equal(S.explicitAutoLayoutPlan(mk([seam]),{layout_mode_source:'user'},4),undefined);
 const low=S.explicitAutoLayoutPlan(mk([{...seam,confidence:.5}]),auto,4);assert.ok(!low||!low.every(s=>s.kind==='fit'&&s.presentationProtection?.preserveWindow));
});
