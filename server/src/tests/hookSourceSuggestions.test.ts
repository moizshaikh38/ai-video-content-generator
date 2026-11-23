import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';process.env.SUPABASE_URL='http://127.0.0.1:1';process.env.SUPABASE_SECRET_KEY='fixture';
const {HookLabService:H}=await import('../services/hookLabService.js');
const suggest=(texts:string[]) => (H as any).synthesizeGroundedHooks(texts.map((text,i)=>({text,start:10+i*2,end:11+i*2})),texts.join(' '),undefined,[]);
test('future interview suggestions do not invent advice, outcomes or questions',()=>{
 const text='She is also kind of like a refugee in a way.';const out=suggest([text]);assert.equal(out.length,1);assert.equal(out[0].text,text);assert.equal(out[0].hook_type,'DIRECT');assert.equal(out[0].delivery_mode,'SPOKEN_REWRITE');assert.deepEqual(out[0].source_evidence.map((e:any)=>[e.text,e.start_seconds,e.end_seconds]),[[text,10,11]]);
});
test('eligible question and warning remain exact whole utterances with matching overlays',()=>{
 const source=['Who is Pax?','Never leave your teammates behind.'];const out=suggest(source);assert(out.some((v:any)=>v.hook_type==='QUESTION'));assert(out.some((v:any)=>v.hook_type==='CONTRARIAN'));
 for(const v of out){assert(source.includes(v.text));if(v.text_overlay_plan)assert.equal(v.text_overlay_plan.text,v.text);assert.match(v.source_evidence[0].reason,/Not semantic/);}
});
test('long input is not character-truncated, empty or malformed text is not fabricated',()=>{assert.deepEqual(suggest(['word '.repeat(110),'','\u0000']),[]);const out=suggest(['short','word '.repeat(110)]);assert.equal(out.length,1);assert.equal(out[0].text,'short');});
test('verbatim fragment is not described as proven complete or effective',()=>{const out=suggest(['Hunted down.']);assert.equal(out[0].text,'Hunted down.');assert.match(out[0].source_evidence[0].reason,/Not semantic completeness or hook-quality proof/);});

test('valid whole utterance beyond100chars is retained up to existing500char product limit',()=>{const text='The actor describes the refugee character and the dangerous journey she takes in pursuit of freedom and liberation.';assert(text.length>100);assert.equal(suggest([text])[0].text,text);});
