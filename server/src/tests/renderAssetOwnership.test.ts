import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {assertRenderAssetOwnership}from'../utils/renderAssetOwnership.js';import {editorCachePath}from'../utils/editorCachePath.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-owned-assets-'));const render=path.join(root,'render');fs.mkdirSync(render);const outside=path.join(root,'other-owner.png');fs.writeFileSync(outside,'synthetic bytes');const inside=path.join(render,'owned.png');fs.writeFileSync(inside,'synthetic bytes');fs.symlinkSync(outside,path.join(render,'escape.png'));
const project=(source:string,type='IMAGE'):any=>({user_id:'owner',tracks:[{type:'VIDEO',items:[{id:'v',timeline_start:0,source_path:'ignored-primary-reference'}]},{type,items:[{id:'secondary',source_path:source,timeline_start:0}]}]});
test('actual local file and symlink boundaries reject other owner content',()=>{
 for(const value of [outside,path.join(render,'escape.png'),'package.json',path.join(render,'missing.png')])assert.throws(()=>assertRenderAssetOwnership(project(value),render),{code:'EDITOR_ASSET_OWNERSHIP_REQUIRED'});
 assert.doesNotThrow(()=>assertRenderAssetOwnership(project(inside),render));
 assert.doesNotThrow(()=>assertRenderAssetOwnership(project('users/owner/p/source.png'),render));
 assert.throws(()=>assertRenderAssetOwnership(project(inside),os.tmpdir()),{code:'EDITOR_ASSET_OWNERSHIP_REQUIRED'});
});
test('secondary VIDEO and AUDIO do not receive primary-input exemption',()=>{
 for(const type of ['VIDEO','AUDIO'])assert.throws(()=>assertRenderAssetOwnership(project(outside,type),render),{code:'EDITOR_ASSET_OWNERSHIP_REQUIRED'});
});
test('cache identifiers cannot escape render directory and symlink targets are rejected',()=>{
 const file=editorCachePath(render,'overlay','a/../../other-owner','.png');assert.equal(path.dirname(file),render);assert.match(path.basename(file),/^overlay_[a-f0-9]{64}\.png$/);fs.symlinkSync(outside,file);assert.throws(()=>editorCachePath(render,'overlay','a/../../other-owner','.png'),/symlink/);
});
test('production orchestration checks ownership before and after remote preparation',()=>{
 const service=fs.readFileSync(path.resolve('src/services/clipRenderService.ts'),'utf8');assert.match(service,/assertRenderAssetOwnership\(editorProject, tempDir\);\s*await ProEditorService.preloadRemoteOverlayAssets\(editorProject, tempDir\);\s*assertRenderAssetOwnership\(editorProject, tempDir\)/);
});
// Keep tiny synthetic files as task evidence. No source or shared data cleanup.
