import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleEditorAssetItems} from '../shared/visibleEditorAssets.js';
// Pure selector only. No service import/network/filesystem/subprocess/hooks.
test('hidden item and track asset paths never enter preloading work',()=>{
 const visible={id:'visible',source_path:'https://media.giphy.com/visible.gif'},hidden={id:'hidden',hidden:true,source_path:'https://media.giphy.com/hidden.gif'},hiddenTrack={id:'hidden-track',source_path:'https://media.giphy.com/hidden-track.gif'};
 const project={tracks:[{items:[visible,hidden,{id:'empty'}]},{hidden:true,items:[hiddenTrack]}]};
 assert.deepEqual(visibleEditorAssetItems(project),[visible]);
 assert.equal(hidden.source_path,'https://media.giphy.com/hidden.gif');
 assert.equal(hiddenTrack.source_path,'https://media.giphy.com/hidden-track.gif');
});
test('visible media kinds retain source references without saved-array mutation',()=>{
 const paths=['main','secondary-video','audio','image','overlay'];
 const project={tracks:paths.map(source_path=>({items:[{source_path}]}))};
 const before=JSON.stringify(project),selected=visibleEditorAssetItems(project);
 assert.deepEqual(selected.map(i=>i.source_path),paths);assert.equal(JSON.stringify(project),before);
 assert.equal(selected[3],project.tracks[3].items[0]);
 selected[3].source_path='/tmp/cache.png';assert.equal(project.tracks[3].items[0].source_path,'/tmp/cache.png');
 assert.equal(selected[0].source_path,'main');
});
test('toggling visibility reuses saved asset intent on the next render copy',()=>{
 const item={hidden:true,source_path:'https://media.giphy.com/preserved.gif'},project={tracks:[{items:[item]}]};
 assert.deepEqual(visibleEditorAssetItems(project),[]);
 item.hidden=false;assert.deepEqual(visibleEditorAssetItems(project),[item]);
 assert.deepEqual(visibleEditorAssetItems({tracks:[]}),[]);
});
