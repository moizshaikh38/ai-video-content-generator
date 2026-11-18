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
 const t=make();(t.metadata.protected_content_regions as any[]).push({start:0,end:4,x:0,y:0,width:.2,height:.1,confidence:.9});assert.equal(S.explicitAutoLayoutPlan(t,auto,4),undefined);
 const h=make();(h.raw_samples[3] as any).hands=[{x:.45,y:.6,width:.12,height:.1,confidence:.95}];assert.equal(S.explicitAutoLayoutPlan(h,{...auto,layoutPolicy:{allowed:['split']}},4),undefined);
});
test('mixed solo/pair clip stays legacy rather than adopting a new mixed-shot policy',()=>{const t=make();t.raw_samples.slice(0,8).forEach(s=>s.faces=s.faces.slice(0,1));(t.metadata.scene_cuts as number[]).push(2);assert.equal(S.explicitAutoLayoutPlan(t,auto,4),undefined)});

test('known action, scene, screen context and embedded-camera evidence veto ordinary pair split',()=>{for(const policy of ['screen_content','action_context','scene_context']){const t:any=make();t.metadata.content_framing_decision={policy};assert.equal(S.explicitAutoLayoutPlan(t,auto,4),undefined)}const t:any=make();t.metadata.content_framing_decision={evidence:{possibleEmbeddedCamera:true}};assert.equal(S.explicitAutoLayoutPlan(t,auto,4),undefined)});
test('generic face anchor metadata is not evidence of an embedded camera',()=>{const t:any=make();t.metadata.facecam_box={x:.2,y:.2,w:.1,h:.2};t.metadata.facecam_track_id='a';assert.ok(S.explicitAutoLayoutPlan(t,auto,4)?.[0].split)});

const moving=()=>({status:'ready',source_width:1920,source_height:1080,metadata:{analyzed_source_sha256:'b'.repeat(64),scene_cuts:[],protected_content_regions:[]},raw_samples:Array.from({length:40},(_,i)=>({time:i*.25,faces:[],persons:[{x:.3+i*.001,y:.2,width:.12,height:.6,confidence:.9}]}))});
test('complete face-less single-body evidence proposes full-height portrait without zoom',()=>{const p=S.explicitAutoLayoutPlan(moving(),auto,10);assert.equal(p?.[0].windowH,1);assert.equal(p?.[0].windowW,9/16*1080/1920);assert.equal(p?.[0].split,undefined);assert.equal(p?.[0].contextStatus,'unresolved-review-required')});
test('body portrait rejects missing samples, multiple bodies, cuts, faces and context outside portrait',()=>{for(const edit of [(t:any)=>t.raw_samples[8].persons=[],(t:any)=>t.raw_samples[8].persons.push({...t.raw_samples[8].persons[0],x:.7}),(t:any)=>t.metadata.scene_cuts=[5],(t:any)=>t.raw_samples[8].faces=[face('a',.35)],(t:any)=>t.metadata.protected_content_regions=[{start:0,end:10,x:0,y:0,width:.2,height:.2,confidence:.9}]]){const t=moving();edit(t);assert.equal(S.explicitAutoLayoutPlan(t,auto,10),undefined)}});
test('body portrait honors Fill exclusions, stale and manual ownership',()=>{assert.equal(S.explicitAutoLayoutPlan(moving(),{...auto,layoutPolicy:{allowed:['fit','split']}},10),undefined);assert.equal(S.explicitAutoLayoutPlan({...moving(),isStale:true},auto,10),undefined);assert.equal(S.explicitAutoLayoutPlan(moving(),{layout_mode_source:'user'},10),undefined)});
