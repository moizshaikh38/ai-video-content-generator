import test from 'node:test';import assert from 'node:assert/strict';
import {editorReframeSourceKey as key} from '../shared/editorReframeSourceKey.js';
const clip={id:'clip',start_seconds:24,end_seconds:36,source_storage_path:'source.mp4'};
const project={canvas:{aspect_ratio:'9:16'},tracks:[{type:'VIDEO',items:[{source_start:24,source_end:36,source_path:'source.mp4',speed:{speed:1}}]}]};
test('aspect, source window and speed invalidate source key',()=>{const base=key(clip,project);assert.notEqual(key(clip,{...project,canvas:{aspect_ratio:'1:1'}}),base);assert.notEqual(key({...clip,start_seconds:25},project),base);assert.notEqual(key(clip,{...project,tracks:[{type:'VIDEO',items:[{...project.tracks[0].items[0],source_start:25}]}]}),base);assert.notEqual(key(clip,{...project,tracks:[{type:'VIDEO',items:[{...project.tracks[0].items[0],speed:{speed:2}}]}]}),base);});
test('playhead and unrelated canvas edits do not refetch',()=>{const p={...project,playhead:7,canvas:{...project.canvas,background_color:'#123456'}};assert.equal(key(clip,p),key(clip,project));});
