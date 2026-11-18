import {test} from 'node:test';import assert from 'node:assert/strict';
import {SmartReframeService as S} from '../services/smartReframeService.js';
const face=(track_id:string,cx:number)=>({track_id,x:cx-.05,y:.2,width:.1,height:.15,center_x:cx,center_y:.275,confidence:.95});
const make=()=>({status:'ready',source_width:910,source_height:480,metadata:{analyzed_source_sha256:'a'.repeat(64),scene_cuts:[],protected_content_regions:[]},raw_samples:Array.from({length:16},(_,i)=>({time:i*.25,faces:[face('a',.2),face('b',.8)],persons:[{x:.02,y:.14,width:.31,height:.84,confidence:.95},{x:.67,y:.14,width:.31,height:.84,confidence:.95}]}))});
const auto={layout_mode_source:'auto'};
test('explicit ordinary Auto can use already measured stable pair without experimental metadata',()=>{const p=S.explicitAutoLayoutPlan(make(),auto,4);assert.ok(p?.[0].split);assert.equal(p![0].split!.dividerX,.5)});
test('ownership, freshness, source binding and allowed layouts gate the bridge',()=>{
 for(const config of [undefined,{}, {layout_mode_source:'user'},{layout_mode_source:'genre_recommendation'}, {...auto,layoutPolicy:{allowed:['fit']}}])assert.equal(S.explicitAutoLayoutPlan(make(),config,4),undefined);
 for(const edit of [(t:any)=>t.isStale=true,(t:any)=>t.sourceObjectVerified=false,(t:any)=>t.status='pending',(t:any)=>delete t.metadata.analyzed_source_sha256,(t:any)=>t.metadata.shot_composition_candidate=true]){const t=make();edit(t);assert.equal(S.explicitAutoLayoutPlan(t,auto,4),undefined)}
});
test('missing/crossing bodies, one person, crowds and changing identities never gain split',()=>{
 for(const edit of [(s:any)=>s.persons=[],(s:any)=>s.persons[0].width=.7,(s:any)=>s.faces=s.faces.slice(0,1),(s:any)=>s.faces.push(face('c',.5)),(s:any,i:number)=>s.faces[0].track_id=i<8?'a':'new']){const t=make();t.raw_samples.forEach(edit);assert.equal(S.explicitAutoLayoutPlan(t,auto,4),undefined)}
});
test('protected text or measured hand crossing vetoes even an explicit split-only policy',()=>{
 const t=make();(t.metadata.protected_content_regions as any[]).push({start:0,end:4,x:0,y:0,width:.2,height:.1,confidence:.9});const protectedPlan=S.explicitAutoLayoutPlan(t,auto,4);assert.equal(protectedPlan?.[0].split,undefined);assert.equal(protectedPlan?.[0].presentationProtection?.reason,'measured-context');
 const h=make();(h.raw_samples[3] as any).hands=[{x:.45,y:.6,width:.12,height:.1,confidence:.95}];assert.equal(S.explicitAutoLayoutPlan(h,{...auto,layoutPolicy:{allowed:['split']}},4),undefined);
});
test('mixed shots preserve review Fit locally and keep only eligible pair split',()=>{const t=make();t.raw_samples.slice(0,8).forEach(s=>s.faces=s.faces.slice(0,1));(t.metadata.scene_cuts as number[]).push(2);const p=S.explicitAutoLayoutPlan(t,auto,4)!;assert.equal(p.length,2);assert.equal(p[0].kind,'fit');assert.equal(p[0].contextStatus,'unresolved-review-required');assert.ok(p[1].split)});

test('known action, scene, screen context and embedded-camera evidence veto ordinary pair split',()=>{for(const policy of ['screen_content','action_context','scene_context']){const t:any=make();t.metadata.content_framing_decision={policy};assert.equal(S.explicitAutoLayoutPlan(t,auto,4),undefined)}const t:any=make();t.metadata.content_framing_decision={evidence:{possibleEmbeddedCamera:true}};assert.equal(S.explicitAutoLayoutPlan(t,auto,4),undefined)});
test('generic face anchor metadata is not evidence of an embedded camera',()=>{const t:any=make();t.metadata.facecam_box={x:.2,y:.2,w:.1,h:.2};t.metadata.facecam_track_id='a';assert.ok(S.explicitAutoLayoutPlan(t,auto,4)?.[0].split)});

const moving=()=>({status:'ready',source_width:1920,source_height:1080,metadata:{analyzed_source_sha256:'b'.repeat(64),scene_cuts:[],protected_content_regions:[]},raw_samples:Array.from({length:40},(_,i)=>({time:i*.25,faces:[],persons:[{x:.3+i*.001,y:.2,width:.12,height:.6,confidence:.9}]}))});
test('complete face-less single-body evidence proposes full-height portrait without zoom',()=>{const p=S.explicitAutoLayoutPlan(moving(),auto,10);assert.equal(p?.[0].windowH,1);assert.equal(p?.[0].windowW,9/16*1080/1920);assert.equal(p?.[0].split,undefined);assert.equal(p?.[0].contextStatus,'unresolved-review-required')});
test('body portrait rejects missing samples, multiple bodies and faces; context gets protected Fit',()=>{for(const edit of [(t:any)=>t.raw_samples[8].persons=[],(t:any)=>t.raw_samples[8].persons.push({...t.raw_samples[8].persons[0],x:.7}),(t:any)=>t.raw_samples[8].faces=[face('a',.35)]]){const t=moving();edit(t);assert.equal(S.explicitAutoLayoutPlan(t,auto,10),undefined)}const t=moving();(t.metadata.protected_content_regions as any[])=[{start:0,end:10,x:0,y:0,width:.2,height:.2,confidence:.9}];const p=S.explicitAutoLayoutPlan(t,auto,10)!;assert.equal(p[0].kind,'fit');assert.equal(p[0].presentationProtection?.reason,'measured-context')});
test('body portrait honors Fill exclusions, stale and manual ownership',()=>{assert.equal(S.explicitAutoLayoutPlan(moving(),{...auto,layoutPolicy:{allowed:['fit','split']}},10),undefined);assert.equal(S.explicitAutoLayoutPlan({...moving(),isStale:true},auto,10),undefined);assert.equal(S.explicitAutoLayoutPlan(moving(),{layout_mode_source:'user'},10),undefined)});

test('cut body proposal respects excluded Fit and manual ownership',()=>{const t:any=moving();t.metadata.scene_cuts=[5];assert.equal(S.explicitAutoLayoutPlan(t,{...auto,layoutPolicy:{allowed:['fill']}},10),undefined);assert.equal(S.explicitAutoLayoutPlan(t,{layout_mode_source:'user'},10),undefined);const p=S.explicitAutoLayoutPlan(t,auto,10)!;assert.equal(p.length,2);assert.ok(p.every(s=>!s.split&&s.windowH===1&&s.contextStatus==='unresolved-review-required'))});

test('cut scenes reuse body evidence locally and keep an unrelated face scene in review Fit',()=>{
 const t:any=moving();t.metadata.scene_cuts=[5];t.raw_samples.slice(20).forEach((s:any)=>{s.faces=[face('new',.8)];s.persons=[]});
 const p=S.explicitAutoLayoutPlan(t,auto,10)!;assert.equal(p.length,2);assert.equal(p[0].kind,'solo');assert.equal(p[0].end,5);assert.equal(p[0].windowW,9/16*1080/1920);assert.equal(p[1].kind,'fit');assert.equal(p[1].start,5);assert.equal(p[1].keyframes[0].centerX,.5);
 assert.ok(p[0].keyframes.every(k=>k.time<5));
 const fitOnly=S.explicitAutoLayoutPlan(t,{...auto,layoutPolicy:{allowed:['fit','split']}},10)!;assert.ok(fitOnly.every(s=>s.kind==='fit'));
});
test('shot-local body rejects incomplete, protected, short, multi-body and face-bearing scenes',()=>{
 for(const edit of [(t:any)=>t.raw_samples[4].persons=[],(t:any)=>t.raw_samples[4].persons.push({...t.raw_samples[4].persons[0]}),(t:any)=>t.raw_samples[4].faces=[face('x',.35)],(t:any)=>t.metadata.protected_content_regions=[{start:0,end:5,x:0,y:0,width:.2,height:.1,confidence:.9}]]){
 const t:any=moving();t.metadata.scene_cuts=[5];edit(t);const p=S.explicitAutoLayoutPlan(t,auto,10)!;assert.equal(p[0].kind,'fit');assert.equal(p[1].kind,'solo');
 }
 const t:any=moving();t.metadata.scene_cuts=[.75];assert.equal(S.explicitAutoLayoutPlan(t,auto,10)![0].kind,'fit');
});

test('synthetic faced multi-person montage cannot gain body portrait or split from shot-local extension',()=>{
 // Distinct game-like multi-person/faced samples remain review Fit on every cut.
 const t:any=moving();t.metadata.scene_cuts=[3,6];t.raw_samples.forEach((s:any)=>{s.faces=[face('game-a',.25),face('game-b',.75)];s.persons=[]});
 const p=S.explicitAutoLayoutPlan(t,auto,10)!;assert.ok(p.every(s=>s.kind==='fit'&&!s.split));
});

test('ordinary body proposal cannot discard independently repeated side objects',()=>{
 const side={class_id:8,x:.02,y:.55,width:.18,height:.2,confidence:.9};
 const t:any=moving();t.raw_samples.forEach((s:any)=>s.objects=[side]);
 assert.equal(S.explicitAutoLayoutPlan(t,auto,10),undefined);
 t.metadata.scene_cuts=[5];t.raw_samples.slice(20).forEach((s:any)=>s.objects=[]);
 const p=S.explicitAutoLayoutPlan(t,auto,10)!;assert.equal(p[0].kind,'fit');assert.equal(p[1].kind,'solo');
 const inside:any=moving();inside.raw_samples.forEach((s:any)=>s.objects=[{...side,x:.34,width:.08}]);
 assert.equal(S.explicitAutoLayoutPlan(inside,auto,10)?.[0].kind,'solo');
 // A one-frame object observation is not a persistent constraint or absence proof.
 const sparse:any=moving();sparse.raw_samples[0].objects=[side];assert.equal(S.explicitAutoLayoutPlan(sparse,auto,10)?.[0].kind,'solo');
});

test('ordinary cut fallback preserves measured-context Fit without spreading it into other shots',()=>{
 const t:any=moving();t.metadata.scene_cuts=[5];t.metadata.protected_content_regions=[{start:0,end:5,x:0,y:.8,width:1,height:.1,confidence:.95}];
 const p=S.explicitAutoLayoutPlan(t,auto,10)!;assert.equal(p[0].kind,'fit');assert.equal(p[0].windowW,1);assert.equal(p[0].windowH,1);assert.equal(p[0].presentationProtection?.preserveWindow,true);assert.equal(p[1].kind,'solo');
 const objects:any=moving();objects.metadata.scene_cuts=[5];objects.raw_samples.slice(0,20).forEach((s:any)=>{s.persons=[];s.objects=[{class_id:8,x:0,y:.3,width:1,height:.3,confidence:.95}]});
 const q=S.explicitAutoLayoutPlan(objects,auto,10)!;assert.equal(q[0].windowW,1);assert.equal(q[0].presentationProtection?.preserveWindow,true);assert.equal(q[1].kind,'solo');
});

test('ordinary cut Fit re-centers repeated off-center faces without shrinking or moving other shots',()=>{
 const t:any=make();t.source_width=1920;t.source_height=1080;t.metadata.scene_cuts=[2];t.raw_samples.forEach((s:any,i:number)=>{s.persons=[];s.faces=[face(i<8?'left':'right',i<8?.12:.88)]});
 const original=JSON.stringify(t),p=S.explicitAutoLayoutPlan(t,auto,4)!;assert.equal(JSON.stringify(t),original);assert.equal(p.length,2);
 for(let i=0;i<2;i++){assert.equal(p[i].windowW,.75);assert.equal(p[i].windowH,1);assert.equal(p[i].keyframes[0].time,i*2);const f=t.raw_samples[i*8].faces[0],c=p[i].keyframes[0].centerX;assert.ok(c-.375<=f.x-.025+1e-9);assert.ok(c+.375>=f.x+f.width+.025-1e-9);}
 assert.ok(p[0].keyframes[0].centerX<.5);assert.ok(p[1].keyframes[0].centerX>.5);
});
test('ordinary cut Fit preserves two repeated incompatible faces, not a transient detector flash',()=>{
 const t:any=make();t.source_width=1920;t.source_height=1080;t.metadata.scene_cuts=[2];t.raw_samples.forEach((s:any,i:number)=>{s.persons=[];s.faces=i<8?[face('a',.08),face('b',.92)]:[face('c',.5),...(i===8?[face('flash',.95)]:[])]});
 const p=S.explicitAutoLayoutPlan(t,auto,4)!;assert.equal(p[0].windowW,1);assert.equal(p[0].presentationProtection?.reason,'persistent-face-conflict');assert.equal(p[1].windowW,.75);assert.equal(p[1].keyframes[0].centerX,.5);
});
test('ordinary Fit anchoring never changes a planner-protected source window or manual ownership',()=>{
 const t:any=make();t.source_width=1920;t.source_height=1080;t.metadata.scene_cuts=[2];t.metadata.protected_content_regions=[{start:0,end:4,x:0,y:.1,width:1,height:.8,confidence:.95}];t.raw_samples.forEach((s:any)=>{s.persons=[];s.faces=[face('a',.1),face('b',.9)]});
 const p=S.explicitAutoLayoutPlan(t,auto,4)!;assert.ok(p.every(s=>s.windowW===1&&s.windowH===1&&s.keyframes[0].centerX===.5));assert.ok(p.every(s=>s.presentationProtection?.preserveWindow));assert.equal(S.explicitAutoLayoutPlan(t,{layout_mode_source:'user'},4),undefined);
});
