import test from 'node:test';import assert from 'node:assert/strict';
import {ClipPromptService as P}from '../services/clipPromptService.js';
const segments=[{start:60,end:70,text:'This source sentence is the supplied window.'}];
const timeline=():any=>({duration_seconds:120,scene_cuts:[{timestamp:1,score:.9},{timestamp:65,score:.9}],segments:[{start:60,end:70,visual_activity_score:85}],keyframes:[{timestamp:1,ocr_text:'OUTSIDE_WINDOW_TITLE'},{timestamp:65,ocr_text:'IN_WINDOW_TITLE'}],summary_metadata:{average_visual_activity:99,ocr_status:'detected'}});
const prompt=(t:any)=>P.buildClipAnalysisPrompt({segments,durationSeconds:10,startIndexOffset:42,multimodalTimeline:t});
test('legacy global arrays cannot supply whole-source cut counts or visual averages',()=>{
 const t=timeline(),text=prompt(t);assert(!text.includes('Total Scene Cuts Detected:'));assert(!text.includes('Average Visual Activity:'));assert(!text.includes('OUTSIDE_WINDOW_TITLE'));assert(text.includes('[OCR: "IN_WINDOW_TITLE"]'));
});
test('completed inline evidence remains tied to the supplied segment window',()=>{
 const t=timeline();t.signal_evidence={sceneCuts:{status:'completed',scope:'whole-source',method:'fixture'}};const before=structuredClone(t),text=prompt(t);assert(text.includes('[42] (60.0s - 70.0s) [SCENE_CUT] [HIGH_CUT_ACTIVITY] [OCR: "IN_WINDOW_TITLE"]'));assert(!text.includes('OUTSIDE_WINDOW_TITLE'));assert.deepEqual(t,before);
});
test('sparse optional timeline metadata never blocks transcript-only prompting',()=>{
 const text=prompt({duration_seconds:120});assert(text.includes('This source sentence is the supplied window.'));assert(!text.includes('undefined'));assert(!text.includes('Average Visual Activity:'));
});
test('a short final window cannot lower the full-source clip minimum',()=>{
 const text=P.buildClipAnalysisPrompt({segments:[{start:1192,end:1200,text:'Retained source words.'}],durationSeconds:8,sourceDurationSeconds:1200,startIndexOffset:401});assert(text.includes('supplied window span ~8s; full source ~1200s; timestamps and segment indexes remain source-relative'));assert(text.includes('Each clip MUST span between 20 seconds and 60 seconds'));assert(!text.includes('This video is short'));assert(text.includes('[401] (1192.0s - 1200.0s)'));
});
test('a genuinely short whole source retains the established short-source exception',()=>{
 const text=P.buildClipAnalysisPrompt({segments:[{start:0,end:8,text:'Retained source words.'}],durationSeconds:8});assert(text.includes('This video is short (~8s). Clips may span between 2 seconds and 8 seconds.'));
});
test('long-window caller supplies full-source duration and skips impossible windows before provider invocation',async()=>{
 const fs=await import('node:fs');const source=fs.readFileSync(new URL('../services/clipAnalysisService.ts',import.meta.url),'utf8');const start=source.indexOf('const chunkNum = i + batchIdx + 1;');assert(start>0);const block=source.slice(start,source.indexOf('const parsed = ClipAnalysisService.parseAIResponse(aiResponse);',start));assert(block.includes('sourceDurationSeconds: transcript.duration_seconds'));const guard=block.indexOf('if (chunk.durationSeconds < minimumAcceptedDuration)');assert(guard>=0);assert(guard<block.indexOf('ClipPromptService.buildClipAnalysisPrompt'));assert(guard<block.indexOf('this.aiProvider.generateJsonCompletion'));assert(/if \(chunk.durationSeconds < minimumAcceptedDuration\) \{[\s\S]*?return \[\];/.test(block));
});
