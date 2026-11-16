import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProEditorService} from '../services/proEditorService.js';
test('new editor preserves split contain config and starts with the Quick path clean caption default',()=>{
 const clip:any={id:'test',project_id:'p',user_id:'u',start_seconds:0,end_seconds:8,source_storage_path:'test.mp4',aspect_ratio:'9:16',crop_config:{mode:'smart',layout_mode:'split',split:{speaker1X:.25,speaker2X:.75,fit:'contain',dividerX:.498}}};
 const p=(ProEditorService as any).buildInitialProject(clip,'u',null,null,{clip_id:'test'});
 const v=p.tracks.find((t:any)=>t.type==='VIDEO').items[0];assert.equal(v.layout_mode,'split');assert.deepEqual(v.crop_config,clip.crop_config);assert.notEqual(v.crop_config,clip.crop_config);
 const c=p.tracks.find((t:any)=>t.type==='CAPTION').items[0];if(c)assert.equal(c.caption.style,'clean');
});
