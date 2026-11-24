import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.MONGODB_URI='mongodb://127.0.0.1:27019';process.env.MONGODB_DB_NAME='contract_only_no_connection';
const {CaptionService}=await import('../services/captionService.js');
const {dataRepository}=await import('../db/repositories/dataRepository.js');

test('actual CaptionService export groups Word Cut after placement, preserves timings and override boundaries',async()=>{
 const original=dataRepository.from;
 const words=[{text:'hay',start:0,end:.3},{text:'in',start:.6,end:.9}];
 const cue={id:'input',start:0,end:1,text:'hay in',words,position_x:.6,position_y:.65,position_anchor:'center'};
 const override={id:'other',start:1,end:2,text:'Keep other',words:[{text:'Keep',start:1,end:1.3},{text:'other',start:1.5,end:1.8}],presetOverride:'soft_build'};
 let style='word_cut';
 (dataRepository as any).from=(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='editor_projects'?{clip_id:'test-clip',user_id:'test-user',tracks:[{type:'CAPTION',items:[{timeline_start:0,timeline_end:2,caption:{style,cues:[cue,override]}}]}]}:null,error:null})};return q;};
 try{
 const clip:any={id:'test-clip',user_id:'test-user',project_id:'test-project',start_seconds:0,end_seconds:2,caption_style:style,caption_position:'bottom',caption_config:{}};
 const result=await CaptionService.generateCaptionsForClip({clip,targetAspectRatio:'9:16'});
 assert.deepEqual(result.cues.slice(0,2).map(c=>[c.text,c.start,c.end]),[['hay',0,.6],['in',.6,.9]]);
 assert.equal(result.cues[0].words![0].end,.3);
 assert.equal(result.cues[0].position_anchor,'center');assert.equal(result.cues[0].position_x,.6);
 assert.equal(result.cues[2].presetOverride,'soft_build');assert.equal(result.cues[2].text,'Keep other');
 assert.match(result.assContent,/0:00:00\.30,0:00:00\.60[^\n]*hay/);assert.doesNotMatch(result.assContent,/hay in/);
 style='chip_background';const unchanged=await CaptionService.generateCaptionsForClip({clip:{...clip,caption_style:style},targetAspectRatio:'9:16'});assert.equal(unchanged.cues[0].text,'hay in');assert.equal(unchanged.cues.length,2);
 }finally{dataRepository.from=original;}
});


test('actual editor Chip export bounds a long cue independently of video item duration',async()=>{
 const original=dataRepository.from;
 const words='To get started clipping with AI today'.split(' ').map((text,n)=>({text,start:n*.55,end:(n+1)*.55}));
 const long={id:'long',start:0,end:4,text:words.map(w=>w.text).join(' '),words,position_x:.5,position_y:.8,position_anchor:'center'};
 const run=async(duration:number)=>{
  (dataRepository as any).from=(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='editor_projects'?{clip_id:'test',user_id:'u',canvas:{aspect_ratio:'9:16'},tracks:[{type:'VIDEO',items:[{timeline_start:0,timeline_end:duration,source_start:0,source_end:duration}]},{type:'CAPTION',items:[{timeline_start:0,timeline_end:4,caption:{style:'chip_background',cues:[long]}}]}]}:null,error:null})};return q;};
  const clip:any={id:'test',user_id:'u',project_id:'p',start_seconds:0,end_seconds:4,caption_style:'chip_background',caption_position:'bottom',caption_config:{}};
  return CaptionService.generateCaptionsForClip({clip,targetAspectRatio:'9:16'});
 };
 try{for(const duration of [2,4]){
  const r=await run(duration);
  assert.ok(r.cues.length>1);assert.ok(r.cues.every(c=>(c.words?.length??0)<=4));
  assert.deepEqual(r.cues.flatMap(c=>c.words?.map(w=>w.text)||[]),words.map(w=>w.text));
  assert.ok(r.cues.every(c=>c.position_x===.5&&c.position_y===.8));
 }}finally{dataRepository.from=original;}
});

test('actual caption export rejects a saved editor project bound to another clip or owner',async()=>{
 const original=dataRepository.from;
 const cue={id:'c',start:0,end:1,text:'hay',words:[{text:'hay',start:0,end:.3}]};
 const row=(extra:any)=>({...extra,tracks:[{type:'CAPTION',items:[{timeline_start:0,timeline_end:1,caption:{style:'word_cut',cues:[cue]}}]}]});
 const clip:any={id:'test-clip',user_id:'test-user',project_id:'test-project',start_seconds:0,end_seconds:1,caption_style:'word_cut',caption_position:'bottom',caption_config:{}};
 try{for(const extra of [{clip_id:'other-clip',user_id:'test-user'},{clip_id:'test-clip',user_id:'other-user'},{}]){
  (dataRepository as any).from=(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='editor_projects'?row(extra):null,error:null})};return q};
  await assert.rejects(CaptionService.generateCaptionsForClip({clip,targetAspectRatio:'9:16'}),(e:any)=>e?.code==='CAPTION_SOURCE_MISMATCH');
 }}finally{dataRepository.from=original;}
});
