import test from'node:test';import assert from'node:assert/strict';import{sparseEmojiProjectInput,suppressStaleCaptionEmojis}from'../shared/sparseCaptionEmojiProject.js';
const make=()=>({canvas:{duration:5},tracks:[{id:'cap',type:'CAPTION',hidden:false,items:[{id:'c',timeline_start:0,timeline_end:5,source_start:0,source_end:5,speed:{speed:1},caption:{cues:[{id:'cue',start:0,end:1,text:'great idea',words:[{text:'great',start:0,end:.2},{text:'idea',start:.2,end:.6}]}]}}]}]});
test('only a single known unshifted caption timeline supplies decoration clocks',()=>{assert.equal(sparseEmojiProjectInput(make()).status,'ready');for(const field of ['timeline_start','source_start','source_end','timeline_end']){const p=make();(p.tracks[0].items[0]as any)[field]=2;assert.equal(sparseEmojiProjectInput(p).status,'unavailable',field)}const p=make();p.tracks[0].items[0].speed.speed=2;assert.equal(sparseEmojiProjectInput(p).status,'unavailable')});
test('caption word/text/timing changes or captions-off suppress stale emojis in output without changing saved tracks',()=>{const p:any=make(),input=sparseEmojiProjectInput(p);assert.equal(input.status,'ready');if(input.status!=='ready')return;p.tracks.push({id:'emoji',type:'IMAGE',hidden:false,caption_emoji:{version:1,sourceSignature:input.signature},items:[]});assert.equal(suppressStaleCaptionEmojis(p).tracks[1].hidden,false);for(const mutate of [(q:any)=>q.tracks[0].hidden=true,(q:any)=>q.tracks[0].items[0].caption.cues[0].text='different',(q:any)=>q.tracks[0].items[0].caption.cues[0].words[0].end=.19]){const q=structuredClone(p);mutate(q);assert.equal(suppressStaleCaptionEmojis(q).tracks[1].hidden,true);assert.equal(q.tracks[1].hidden,false)}assert.equal(p.tracks[1].hidden,false)});

test('new emoji reviews bind caption style, position and canvas geometry',()=>{
 const base:any=make(),input=sparseEmojiProjectInput(base);assert.equal(input.status,'ready');if(input.status!=='ready')return;
 base.tracks.push({id:'emoji',type:'IMAGE',hidden:false,caption_emoji:{version:1,sourceSignature:input.signature},items:[]});
 for(const change of [(p:any)=>p.tracks[0].items[0].caption.position_y=.4,(p:any)=>p.tracks[0].items[0].caption.font_size=88,(p:any)=>p.tracks[0].items[0].caption.cues[0].position_y=.25,(p:any)=>p.tracks[0].items[0].transform={position_y:20},(p:any)=>p.canvas.aspect_ratio='1:1',(p:any)=>p.canvas.width=720]){
  const p=structuredClone(base);change(p);assert.equal(suppressStaleCaptionEmojis(p).tracks[1].hidden,true);assert.equal(p.tracks[1].hidden,false);
 }
});
test('new emoji reviews become stale when visible picture panels or overlays change',()=>{
 const base:any=make();base.tracks.unshift({id:'video',type:'VIDEO',items:[{id:'v',transform:{scale:1},crop_config:{layout_mode:'track'}}]});
 const input=sparseEmojiProjectInput(base);if(input.status!=='ready')throw Error('fixture');base.tracks.push({id:'emoji',type:'IMAGE',hidden:false,caption_emoji:{version:1,sourceSignature:input.signature},items:[]});
 for(const change of [(p:any)=>p.tracks[0].items[0].crop_config.layout_mode='split',(p:any)=>p.tracks[0].items[0].panels={layout:'gameplay'},(p:any)=>p.tracks[0].items[0].automatic_framing={enabled:false},(p:any)=>p.tracks[0].items[0].scene_layout_overrides=[{start:0,end:1,layout:'split'}],(p:any)=>p.tracks.push({id:'title',type:'TEXT',items:[{id:'title-item',text:{content:'New title'}}]})]){
  const p=structuredClone(base);change(p);assert.equal(suppressStaleCaptionEmojis(p).tracks[2].hidden,true);
 }
});
test('audio changes, playhead and emoji edits do not invalidate reviewed visual context',()=>{
 const p:any=make();const input=sparseEmojiProjectInput(p);if(input.status!=='ready')throw Error('fixture');p.tracks.push({id:'emoji',type:'IMAGE',hidden:false,caption_emoji:{version:1,sourceSignature:input.signature},items:[{id:'e',transform:{position_y:10}}]});
 p.tracks.push({id:'audio',type:'AUDIO',items:[{id:'a',audio:{volume:.5}}]});p.playhead=3;p.tracks[1].items[0].transform.position_y=20;
 assert.equal(suppressStaleCaptionEmojis(p).tracks[1].hidden,false);
});
test('historical text-clock-only reviews retain their existing rendering contract',()=>{
 const p:any=make(),input=sparseEmojiProjectInput(p);if(input.status!=='ready')throw Error('fixture');p.tracks.push({id:'emoji',type:'IMAGE',hidden:false,caption_emoji:{version:1,sourceSignature:input.legacySignature},items:[]});
 assert.equal(suppressStaleCaptionEmojis(p).tracks[1].hidden,false);p.tracks[0].items[0].caption.cues[0].text='Changed';assert.equal(suppressStaleCaptionEmojis(p).tracks[1].hidden,true);
});

test('malformed saved cue/word/track arrays make emoji review unavailable rather than throwing',()=>{
 for(const mutate of [(p:any)=>p.tracks={},(p:any)=>p.tracks=[null],(p:any)=>p.tracks[0].items={},(p:any)=>p.tracks[0].items=[null],(p:any)=>p.tracks[0].items[0].caption.cues=[null],(p:any)=>p.tracks[0].items[0].caption.cues[0].words={},(p:any)=>p.tracks[0].items[0].caption.cues[0].words=[null],(p:any)=>p.tracks.push({type:'TEXT',items:{}})]){
  const p:any=make();mutate(p);let result:ReturnType<typeof sparseEmojiProjectInput>|undefined;assert.doesNotThrow(()=>{result=sparseEmojiProjectInput(p)});assert.equal(result?.status,'unavailable');
 }
});
test('malformed caption clocks suppress only the saved emoji track without deleting or rewriting it',()=>{
 const p:any=make(),input=sparseEmojiProjectInput(p);if(input.status!=='ready')throw Error('fixture');p.tracks.push({id:'emoji',type:'IMAGE',hidden:false,caption_emoji:{version:1,sourceSignature:input.signature},items:[]});p.tracks[0].items[0].caption.cues[0].words={};const before=JSON.stringify(p);const out=suppressStaleCaptionEmojis(p);assert.equal(out.tracks[1].hidden,true);assert.equal(JSON.stringify(p),before);assert.deepEqual({...out.tracks[1],hidden:false},p.tracks[1]);
});
