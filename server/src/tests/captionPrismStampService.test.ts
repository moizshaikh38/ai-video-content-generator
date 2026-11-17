import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.MONGODB_URI='mongodb://127.0.0.1:27019';process.env.MONGODB_DB_NAME='contract_only_no_connection';
const {CaptionService}=await import('../services/captionService.js');
const {dataRepository}=await import('../db/repositories/dataRepository.js');
test('actual CaptionService reaches Prism Stamp after shared grouping and preserves edit metadata',async()=>{
 const original=dataRepository.from;
 const cue={id:'edited',start:0,end:1.2,text:'Make every',words:[{text:'Make',start:0,end:.5},{text:'every',start:.6,end:1.1}],position_x:.38,position_y:.62,position_anchor:'center'};
 const override={id:'other',start:1.2,end:2,text:'Other preset',words:[{text:'Other',start:1.2,end:1.5},{text:'preset',start:1.6,end:2}],presetOverride:'soft_build'};
 (dataRepository as any).from=(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='editor_projects'?{canvas:{aspect_ratio:'9:16'},tracks:[{type:'CAPTION',items:[{timeline_start:0,timeline_end:2,caption:{style:'vireo_prism_stamp',cues:[cue,override]}}]}]}:null,error:null})};return q;};
 try{
  const clip:any={id:'test',user_id:'u',project_id:'p',start_seconds:0,end_seconds:2,caption_style:'vireo_prism_stamp',caption_position:'bottom',caption_config:{}};
  const result=await CaptionService.generateCaptionsForClip({clip,targetAspectRatio:'9:16'});
  assert.deepEqual(result.cues.slice(0,2).map(c=>[c.text,c.start,c.end]),[['MAKE',0,.5],['EVERY',.6,1.1]]);
  assert.ok(result.cues.slice(0,2).every(c=>c.position_x===.38&&c.position_y===.62&&c.position_anchor==='center'));
  assert.deepEqual(result.cues.slice(0,2).flatMap(c=>c.words!.map(w=>[w.start,w.end])),[[0,.5],[.6,1.1]]);
  assert.equal(result.cues[2].presetOverride,'soft_build');assert.equal(result.cues[2].text,'Other preset');
  assert.match(result.assContent,/\\frz/);assert.match(result.assContent,/\\org\(410.400,1190.400\)/);assert.match(result.assContent,/Style: Default,Montserrat,96/);
 }finally{dataRepository.from=original;}
});
