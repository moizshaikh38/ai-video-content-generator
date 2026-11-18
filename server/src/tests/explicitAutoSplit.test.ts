import {test} from 'node:test';import assert from 'node:assert/strict';
import {SmartReframeService as S} from '../services/smartReframeService.js';
const face=(track_id:string,cx:number)=>({track_id,x:cx-.05,y:.2,width:.1,height:.15,center_x:cx,center_y:.275,confidence:.95});
const make=()=>({status:'ready',source_width:910,source_height:480,metadata:{analyzed_source_sha256:'a'.repeat(64),scene_cuts:[],protected_content_regions:[]},raw_samples:Array.from({length:16},(_,i)=>({time:i*.25,faces:[face('a',.2),face('b',.8)],persons:[{x:.02,y:.14,width:.31,height:.84,confidence:.95},{x:.67,y:.14,width:.31,height:.84,confidence:.95}]}))});
const auto={layout_mode_source:'auto'};
test('explicit ordinary Auto can use already measured stable pair without experimental metadata',()=>{const p=S.explicitAutoSplitPlan(make(),auto,4);assert.ok(p?.[0].split);assert.equal(p![0].split!.dividerX,.5)});
test('ownership, freshness, source binding and allowed layouts gate the bridge',()=>{
 for(const config of [undefined,{}, {layout_mode_source:'user'},{layout_mode_source:'genre_recommendation'}, {...auto,layoutPolicy:{allowed:['fit','fill']}}])assert.equal(S.explicitAutoSplitPlan(make(),config,4),undefined);
 for(const edit of [(t:any)=>t.isStale=true,(t:any)=>t.sourceObjectVerified=false,(t:any)=>t.status='pending',(t:any)=>delete t.metadata.analyzed_source_sha256,(t:any)=>t.metadata.shot_composition_candidate=true]){const t=make();edit(t);assert.equal(S.explicitAutoSplitPlan(t,auto,4),undefined)}
});
test('missing/crossing bodies, one person, crowds and changing identities never gain split',()=>{
 for(const edit of [(s:any)=>s.persons=[],(s:any)=>s.persons[0].width=.7,(s:any)=>s.faces=s.faces.slice(0,1),(s:any)=>s.faces.push(face('c',.5)),(s:any,i:number)=>s.faces[0].track_id=i<8?'a':'new']){const t=make();t.raw_samples.forEach(edit);assert.equal(S.explicitAutoSplitPlan(t,auto,4),undefined)}
});
test('protected text or measured hand crossing vetoes even an explicit split-only policy',()=>{
 const t=make();(t.metadata.protected_content_regions as any[]).push({start:0,end:4,x:0,y:0,width:.2,height:.1,confidence:.9});assert.equal(S.explicitAutoSplitPlan(t,auto,4),undefined);
 const h=make();(h.raw_samples[3] as any).hands=[{x:.45,y:.6,width:.12,height:.1,confidence:.95}];assert.equal(S.explicitAutoSplitPlan(h,{...auto,layoutPolicy:{allowed:['split']}},4),undefined);
});
test('mixed solo/pair clip stays legacy rather than adopting a new mixed-shot policy',()=>{const t=make();t.raw_samples.slice(0,8).forEach(s=>s.faces=s.faces.slice(0,1));(t.metadata.scene_cuts as number[]).push(2);assert.equal(S.explicitAutoSplitPlan(t,auto,4),undefined)});
