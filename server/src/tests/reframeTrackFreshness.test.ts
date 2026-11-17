import test from 'node:test';
import assert from 'node:assert/strict';
import {reframeTrackFreshness as assess} from '../shared/reframeTrackFreshness.js';
const clip={source_storage_path:'source-a.mp4',start_seconds:10,end_seconds:30,trim_start_offset:1,trim_end_offset:2,aspect_ratio:'9:16'};
const track={analyzed_aspect_ratio:'9:16',metadata:{analyzed_source_path:'source-a.mp4',analyzed_source_start:11,analyzed_source_end:28}};
test('exact recorded source range/path/aspect is minimum fresh evidence',()=>assert.equal(assess(clip,track).isStale,false));
test('same trim offsets cannot conceal replacement source or moved source selection',()=>{for(const change of[{source_storage_path:'source-b.mp4'},{start_seconds:15,end_seconds:35},{end_seconds:31}])assert.equal(assess({...clip,...change},track).isStale,true);});
test('legacy tracks without actual source range are unverified, not silently stamped fresh',()=>assert.equal(assess(clip,{analyzed_aspect_ratio:'9:16',metadata:{analyzed_source_path:'source-a.mp4'}}).isStale,true));
test('invalid clocks, trims and changed aspect are stale',()=>{for(const change of[{start_seconds:NaN},{start_seconds:40},{trim_start_offset:-1},{trim_end_offset:50},{aspect_ratio:'1:1'}])assert.equal(assess({...clip,...change},track).isStale,true);});
