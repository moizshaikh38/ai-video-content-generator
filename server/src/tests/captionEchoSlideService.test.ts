import {test} from 'node:test';import assert from 'node:assert/strict';
process.env.MONGODB_URI='mongodb://127.0.0.1:27019';process.env.MONGODB_DB_NAME='contract_only_no_connection';
const {CaptionService}=await import('../services/captionService.js');const {dataRepository}=await import('../db/repositories/dataRepository.js');
test('actual CaptionService emits phrase Echo Slide with real timing, two lines and another preset boundary intact',async()=>{
 const original=dataRepository.from;
 const words='Extraordinary ideas deserve room'.split(' ').map((text,i)=>({text,start:Number((i*.6).toFixed(3)),end:Number(((i+1)*.6).toFixed(3))}));
 const cue={id:'phrase',start:0,end:2.4,text:words.map(w=>w.text).join(' '),words,position_x:.4,position_y:.62,position_anchor:'center'};
 const override={id:'other',start:2.4,end:3,text:'Other',words:[{text:'Other',start:2.4,end:3}],presetOverride:'soft_build'};
 (dataRepository as any).from=(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='editor_projects'?{canvas:{aspect_ratio:'9:16'},tracks:[{type:'CAPTION',items:[{timeline_start:0,timeline_end:3,caption:{style:'vireo_echo_slide',cues:[cue,override]}}]}]}:null,error:null})};return q;};
 try{
  const clip:any={id:'test',user_id:'u',project_id:'p',start_seconds:0,end_seconds:3,caption_style:'vireo_echo_slide',caption_position:'bottom',caption_config:{}};
  const result=await CaptionService.generateCaptionsForClip({clip,targetAspectRatio:'9:16'});
  assert.equal(result.cues.length,2);assert.equal(result.cues[0].words?.length,4);assert.ok(result.cues[0].text.includes('\\N'));
  assert.deepEqual(result.cues[0].words?.map(w=>[w.start,w.end]),words.map(w=>[w.start,w.end]));assert.equal(result.cues[0].position_anchor,'center');assert.equal(result.cues[0].position_x,.4);
  assert.equal(result.cues[1].presetOverride,'soft_build');assert.equal(result.cues[1].text,'Other');
  assert.match(result.assContent,/Style: Default,Inter,88/);assert.match(result.assContent,/\\org\(\d+\.\d+,1190.400\)/);assert.match(result.assContent,/\\alpha&HFF&/);
 }finally{dataRepository.from=original;}
});
