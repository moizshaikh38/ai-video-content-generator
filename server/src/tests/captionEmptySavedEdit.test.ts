import test from 'node:test';
import assert from 'node:assert/strict';
import {CaptionService} from '../services/captionService.js';
import {editorProjectCoveredEnd,hasAuthoritativeCaptionCues,mergeExtendedCues} from '../services/captionExtendMerge.js';
test('empty edit requires real explicit coverage; malformed and legacy empty do not acquire it',()=>{
 assert.equal(hasAuthoritativeCaptionCues({cues:[]}),false);
 for(const marker of [null,NaN,Infinity,-1,'10'])assert.equal(hasAuthoritativeCaptionCues({cues:[],cues_covered_end:marker}),false);
 assert.equal(hasAuthoritativeCaptionCues({cues:[],cues_covered_end:10}),true);
});
test('empty saved item remains available to export aggregation with its coverage',()=>{
 const proj={tracks:[{type:'CAPTION',items:[{timeline_start:0,timeline_end:10,caption:{cues:[],cues_covered_end:10,style:'clean'}}]}]};
 assert.deepEqual(CaptionService.extractEditorCuesFromProject(proj)?.cues,[]);
 assert.equal(editorProjectCoveredEnd(proj),10);
 const merged=mergeExtendedCues([],[{start:1,end:2,text:'deleted'},{start:11,end:12,text:'new'}],10);
 assert.deepEqual(merged.cues.map(c=>c.text),['new']);
});
