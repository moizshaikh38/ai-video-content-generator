import {describe,it} from 'node:test';import assert from 'node:assert/strict';
import{embeddedCameraPanelReview as propose}from'../shared/embeddedCameraPanelReview.js';
import{panelSourceWindow}from'../shared/panelLayouts.js';
const sha='a'.repeat(64);
const fixture=()=>({sha256:sha,sourceStart:.18,sourceEnd:4.52,sourceWidth:960,sourceHeight:540,receipt:{schema_version:1,source_sha256:sha,source_start:.18,source_end:4.52,duration_seconds:4.34,sample_clock:'interval-relative',proposals:[{box:{x:.01,y:.50,w:.185,h:.25},anchor_track_ids:['a'],anchor_samples:12,observed_frames:8,sampled_frames:8},{box:{x:.01,y:.50,w:.195,h:.239},anchor_track_ids:['a'],anchor_samples:12,observed_frames:8,sampled_frames:8}]}});
describe('explicit camera-like geometry review, not a boundary or identity claim',()=>{
 it('encloses nearby alternative edges and gives compiler-disjoint source windows',()=>{const p=propose(fixture())!;assert(p);assert.equal(p.enclosure.w,.195);assert.equal(p.enclosure.h,.25);assert.match(p.limitations.join(' '),/not certified/);const[a,b]=p.panels.slots.map(s=>panelSourceWindow(s,960,540,1));assert(Math.min(a.x+a.w,b.x+b.w)<=Math.max(a.x,b.x)||Math.min(a.y+a.h,b.y+b.h)<=Math.max(a.y,b.y));});
 it('accepts one persistent rectangle without inventing other alternatives',()=>{const f=fixture();f.receipt.proposals.length=1;assert(propose(f));});
 for(const [name,change]of Object.entries({version:(f:any)=>f.receipt.schema_version=0,hash:(f:any)=>f.receipt.source_sha256='b'.repeat(64),start:(f:any)=>f.receipt.source_start=0,end:(f:any)=>f.receipt.source_end=5,duration:(f:any)=>f.receipt.duration_seconds=5,clock:(f:any)=>f.receipt.sample_clock='source-relative',anchors:(f:any)=>f.receipt.proposals[1].anchor_track_ids=['b'],multipleAnchors:(f:any)=>f.receipt.proposals[0].anchor_track_ids=['a','b'],observations:(f:any)=>f.receipt.proposals[0].observed_frames=6,noninteger:(f:any)=>f.receipt.proposals[0].sampled_frames=8.2,outside:(f:any)=>f.receipt.proposals[0].box.x=-.1,distant:(f:any)=>f.receipt.proposals[1].box.x=.6,missing:(f:any)=>f.receipt.proposals=[],dimensions:(f:any)=>f.sourceWidth=0}))it('rejects '+name,()=>{const f=fixture();change(f);assert.equal(propose(f),null);});
});

import {SmartReframeService as S}from'../services/smartReframeService.js';
const routeFixture=()=>{const f=fixture();return{status:'ready',sourceObjectVerified:true,source_width:f.sourceWidth,source_height:f.sourceHeight,metadata:{analyzed_source_sha256:sha,analyzed_source_start:f.sourceStart,analyzed_source_end:f.sourceEnd,embedded_camera_panel_review:f.receipt,embedded_camera_panel_review_enabled:true,scene_cuts:[]},raw_samples:[]};};
describe('local review activation is explicit and source-bound',()=>{
 it('uses a source-verified explicitly enabled review only',()=>assert(S.explicitAutoLayoutPlan(routeFixture(),{layout_mode_source:'auto'},4.34)?.[0].split?.focusPanels));
 for(const[name,change]of Object.entries({off:(t:any,c:any)=>t.metadata.embedded_camera_panel_review_enabled=false,absent:(t:any,c:any)=>delete t.metadata.embedded_camera_panel_review_enabled,user:(t:any,c:any)=>c.layout_mode_source='user',legacy:(t:any,c:any)=>delete c.layout_mode_source,stale:(t:any,c:any)=>t.isStale=true,unverified:(t:any,c:any)=>delete t.sourceObjectVerified,changedSource:(t:any,c:any)=>t.metadata.analyzed_source_sha256='b'.repeat(64),cuts:(t:any,c:any)=>t.metadata.scene_cuts=[1],policy:(t:any,c:any)=>c.layoutPolicy={allowed:['fit']}}))it('does not activate for '+name,()=>{const t=routeFixture(),c:any={layout_mode_source:'auto'};change(t,c);assert.equal(S.explicitAutoLayoutPlan(t,c,4.34),undefined);});
 it('does not transplant to another duration',()=>assert.equal(S.explicitAutoLayoutPlan(routeFixture(),{layout_mode_source:'auto'},3),undefined));
});
import{embeddedCameraMeasurementEligible as eligible}from'../shared/embeddedCameraPanelReview.js';
describe('fresh optional decoding gate',()=>{
 const f=()=>({flag:'1',sourceReceipt:{key:'source'},layoutSource:'auto',aspect:'9:16',duration:4.34,sceneCuts:[]});
 it('permits the explicit short verified source review',()=>assert(eligible(f())));
 for(const[name,change]of Object.entries({off:(x:any)=>x.flag='0',absent:(x:any)=>delete x.flag,boolean:(x:any)=>x.flag=true,receipt:(x:any)=>x.sourceReceipt=undefined,user:(x:any)=>x.layoutSource='user',legacy:(x:any)=>delete x.layoutSource,aspect:(x:any)=>x.aspect='16:9',long:(x:any)=>x.duration=16,zero:(x:any)=>x.duration=0,nan:(x:any)=>x.duration=NaN,cuts:(x:any)=>x.sceneCuts=[1],missingCuts:(x:any)=>x.sceneCuts=undefined}))it('does not decode '+name,()=>{const x=f();change(x);assert.equal(eligible(x),false);});
});
