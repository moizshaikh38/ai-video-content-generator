import { test } from 'node:test';import assert from 'node:assert/strict';
import { buildClipEditorUpdatePayload } from '../../../src/lib/editorSavePayload.js';
test('ripple-cut source envelope includes all original slices, not first short slice',()=>{
 const clip:any={id:'c',start_seconds:10.99,end_seconds:35.99,source_storage_path:'source.mp4'};
 const p:any={canvas:{aspect_ratio:'9:16'},tracks:[{type:'VIDEO',items:[
  {type:'VIDEO',source_asset_id:'c',source_start:10.99,source_end:12.09},
  {type:'VIDEO',source_asset_id:'c',source_start:13.12,source_end:35.99},
  {type:'VIDEO',source_asset_id:'b-roll',source_path:'other.mp4',source_start:0,source_end:99},
 ]}]};const payload=buildClipEditorUpdatePayload(p,clip);
 assert.equal(payload.trimStartOffset,0);assert.equal(payload.trimEndOffset,0);
 p.tracks[0].items[1].source_end=33.99;assert.equal(buildClipEditorUpdatePayload(p,clip).trimEndOffset,2);
});
