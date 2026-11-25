import test from 'node:test';import assert from 'node:assert/strict';
import {ProEditorService as P} from '../services/proEditorService.js';import {CaptionService as C} from '../services/captionService.js';
const transcript={duration_seconds:8,text:'Main words. Actual teaser words.',words:[{word:'Main',start:1,end:1.4},{word:'words.',start:1.5,end:2},{word:'Actual',start:5,end:5.4},{word:'teaser',start:5.5,end:6},{word:'words.',start:6.2,end:6.7}],segments:[{text:'Main words.',start:1,end:2},{text:'Actual teaser words.',start:5,end:7}]};
const clip:any={id:'teaser-caption-fixture',project_id:'fixture',user_id:'fixture',start_seconds:0,end_seconds:4,duration_seconds:4,aspect_ratio:'9:16',caption_style:'vireo_comic_default',caption_enabled:true,cold_open:{enabled:true,start_seconds:5,end_seconds:7,duration_seconds:2,teaser_text:'STALE INVENTED PROPOSAL',transition_effect:'whoosh'}};
const cues=(c=clip,t:any=transcript)=>P.buildInitialCandidateEditor(c,'fixture',t).tracks.find(x=>x.type==='CAPTION')!.items[0].caption!.cues;
test('actual fresh editor teaser uses source words and clocks, never proposal text',()=>{const result=cues(),head=result.filter((x:any)=>x.start<2);const expected=C.extractCuesForClipSettings(transcript,{...clip,start_seconds:5,end_seconds:7,trim_start_offset:0,trim_end_offset:0}).cues;assert.deepEqual(head,expected.map((x:any,i:number)=>({...x,id:`teaser-${x.id??i+1}`})));assert(!JSON.stringify(result).includes('STALE'));assert(head.some((x:any)=>x.words?.length));const main=C.extractCuesForClipSettings(transcript,clip).cues;assert.deepEqual(result.filter((x:any)=>x.start>=2).map((x:any)=>({...x,start:Number((x.start-2).toFixed(3)),end:Number((x.end-2).toFixed(3)),words:x.words?.map((w:any)=>({...w,start:Number((w.start-2).toFixed(3)),end:Number((w.end-2).toFixed(3))})) ,tokens:x.tokens?.map((w:any)=>({...w,start:Number((w.start-2).toFixed(3)),end:Number((w.end-2).toFixed(3))}))})),main);});
test('teaser does not inherit main trim offsets or cue-ID manual overrides',()=>{const changed={...clip,trim_start_offset:.5,trim_end_offset:.3,caption_config:{caption_overrides:[{cueId:'cue-1',text:'My corrected main'}]}};const result=cues(changed);assert(result.filter((x:any)=>x.start<2).some((x:any)=>x.text.includes('ACTUAL')));assert(result.filter((x:any)=>x.start>=2).some((x:any)=>x.text==='My corrected main'));assert.equal(new Set(result.map((x:any)=>x.id)).size,result.length);});
test('silence in teaser never fabricates proposal text or main words',()=>{const t={duration_seconds:8,text:'Main words.',words:transcript.words.slice(0,2),segments:[transcript.segments[0],{text:'',start:5,end:7}]},result=cues(clip,t);assert.equal(result.filter((x:any)=>x.start<2).length,0);assert(result.some((x:any)=>x.start>=2));});
test('segment-only teaser remains segment timing rather than invented per-word clocks',()=>{const result=cues(clip,{duration_seconds:8,text:transcript.text,segments:transcript.segments}),head=result.filter((x:any)=>x.start<2);assert.equal(head.length,1);assert(head[0].text.includes('ACTUAL'));assert(!head[0].words?.length);assert.equal(head[0].start,0);assert.equal(head[0].end,2);});
test('disabled cold open preserves ordinary extraction and no transcript creates no invented cues',()=>{const noCold={...clip,cold_open:{...clip.cold_open,enabled:false}};assert.deepEqual(cues(noCold),C.extractCuesForClipSettings(transcript,noCold).cues);assert.deepEqual(cues(noCold,null),[]);assert.throws(()=>cues(clip,null),/Cold-open timing/);});
test('unreliable source clocks retain actual extractor review failure instead of substituting proposal',()=>{assert.throws(()=>cues(clip,{...transcript,words:[{word:'broken',start:6,end:5}]}),/timing|clock|alignment/i);});
test('fresh initialization does not mutate transcript or clip inputs',()=>{const before=JSON.stringify({clip,transcript});cues();assert.equal(JSON.stringify({clip,transcript}),before);});

test('actual fresh init reconciles producer centisecond rounding to one source clock',()=>{const c={...clip,cold_open:{...clip.cold_open,start_seconds:5.001,end_seconds:7.005,duration_seconds:2}};const editor=P.buildInitialCandidateEditor(c,'fixture',{...transcript,segments:[transcript.segments[0],{...transcript.segments[1],start:5.001,end:7.005}]});const video=editor.tracks.find(x=>x.type==='VIDEO')!.items;assert.equal(video[0].timeline_end,2.004);assert.equal(video[0].source_start,5.001);assert.equal(video[0].source_end,7.005);assert.equal(video[1].timeline_start,2.004);assert.equal(editor.canvas.duration,6.004);});
test('actual fresh init rejects invalid mismatched or unbound source intervals before creating captions',()=>{for(const change of [{duration_seconds:3},{start_seconds:NaN},{start_seconds:Infinity},{start_seconds:-1},{end_seconds:5},{end_seconds:9,duration_seconds:4},{duration_seconds:0},{duration_seconds:NaN},{duration_seconds:'2'}])assert.throws(()=>cues({...clip,cold_open:{...clip.cold_open,...change}}),/Cold-open timing/);assert.throws(()=>cues(clip,{...transcript,segments:[]}),/Cold-open timing/);});

import {ClipRenderService as R} from '../services/clipRenderService.js';import {getClipEditorData} from '../controllers/clipController.js';
test('actual editor aggregate propagates teaser review failure and controller returns safe409',async()=>{const getClip=R.getClip,initialize=P.getOrCreateEditorProject;let status=0,body:any;R.getClip=async()=>({...clip,source_storage_path:null}) as any;P.getOrCreateEditorProject=async()=>{throw Object.assign(Error('Cold-open timing needs review before creating the editor. The teaser source interval and duration must agree.'),{code:'COLD_OPEN_TIMING_REVIEW_REQUIRED',statusCode:409})};try{await assert.rejects(()=>R.getClipEditorData(clip.id,'fixture'),(e:any)=>e.code==='COLD_OPEN_TIMING_REVIEW_REQUIRED');const req:any={user:{id:'11111111-1111-4111-8111-111111111111'},params:{clipId:'22222222-2222-4222-8222-222222222222'}};const res:any={set(){return this},status(n:number){status=n;return this},json(v:any){body=v;return this}};await getClipEditorData(req,res);assert.equal(status,409);assert.equal(body.code,'COLD_OPEN_TIMING_REVIEW_REQUIRED');assert.match(body.message,/timing needs review/);assert.equal(body.editorProject,undefined);}finally{R.getClip=getClip;P.getOrCreateEditorProject=initialize;}});

test('matched final transcript segment owns interval even with absent or rounded-low duration',()=>{for(const duration_seconds of [undefined,null,6.99,7,8]){const t={...transcript,duration_seconds,segments:[transcript.segments[0],{...transcript.segments[1],start:5.0001,end:7.0049}]};const c={...clip,cold_open:{...clip.cold_open,start_seconds:5,end_seconds:7.005,duration_seconds:2}};const editor=P.buildInitialCandidateEditor(c,'fixture',t);assert.equal(editor.tracks.find(x=>x.type==='VIDEO')!.items[0].timeline_end,2.005);}});
test('unmatched reversed nonfinite source segment evidence cannot admit a teaser',()=>{for(const segment of [{start:5,end:7.001},{start:7,end:5},{start:NaN,end:7},{start:5,end:Infinity},{start:'5',end:7}])assert.throws(()=>cues(clip,{...transcript,segments:[segment]}),/Cold-open timing/);});

test('fresh editor initialization validates cold-open teaser against sentence-refined selection segments when coarse provider segments hold matching words',()=>{
  const coarseTranscript={
    duration_seconds:50.94,
    text:'Way too close dude. All I did was throw a chameleon at him! Wait, I think bro.',
    segments:[
      {start:0,end:18.22,text:'Way too close dude.'},
      {start:30,end:50.94,text:'All I did was throw a chameleon at him! Wait, I think bro.'},
    ],
    words:[
      {word:'Way',start:0.78,end:0.96},{word:'too',start:0.96,end:1.16},{word:'close',start:1.16,end:1.6},{word:'dude.',start:1.6,end:18.32},
      {word:'All',start:30,end:30.2},{word:'I',start:30.2,end:30.3},{word:'did',start:30.3,end:30.5},{word:'was',start:30.5,end:30.7},
      {word:'throw',start:30.7,end:31},{word:'a',start:31,end:31.1},{word:'chameleon',start:31.1,end:31.6},{word:'at',start:31.6,end:31.8},{word:'him!',start:31.8,end:32.06},
      {word:'Wait,',start:49.48,end:49.86},{word:'I',start:49.86,end:49.98},{word:'think',start:49.98,end:50.18},{word:'bro.',start:50.18,end:50.48},
    ],
  };
  const coarseClip:any={
    ...clip,
    start_seconds:0.78,end_seconds:32.06,duration_seconds:31.28,
    cold_open:{enabled:true,start_seconds:30,end_seconds:32.06,duration_seconds:2.06,teaser_text:'All I did was throw a chameleon at him!',transition_effect:'whoosh'},
  };
  const editor=P.buildInitialCandidateEditor(coarseClip,'fixture',coarseTranscript);
  const video=editor.tracks.find(x=>x.type==='VIDEO')!.items;
  assert.equal(video[0].source_start,30);
  assert.equal(video[0].source_end,32.06);
  assert.equal(video[0].timeline_start,0);
  assert.equal(video[0].timeline_end,2.06);
  assert.equal(editor.canvas.duration,33.34);
  // Mismatched duration still fails even when coarse segments are refined
  assert.throws(()=>P.buildInitialCandidateEditor({...coarseClip,cold_open:{...coarseClip.cold_open,duration_seconds:3}},'fixture',coarseTranscript),/Cold-open timing/);
});
