import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isAllowedClientEditorSourcePath, isAllowedEditorSourcePath, validateClientEditorSourcePath } from '../utils/editorAssetValidator.js';
const user='11111111-1111-4111-8111-111111111111';
for(const input of [path.join(os.tmpdir(),'other-user-asset.mp4'),'server/public/other-owner.mp4','package.json','./server/public/music.mp3','/etc/example-not-read']){
 test(`client cannot grant a server file input: ${input}`,async()=>{
  assert.equal(isAllowedClientEditorSourcePath(user,input),false);
  await assert.rejects(validateClientEditorSourcePath(user,input),(error:any)=>error.code==='EDITOR_SOURCE_NOT_ALLOWED');
 });
}
test('client owned storage and CDN references remain available',()=>{
 for(const input of [undefined,null,'',`users/${user}/projects/p/source/a.mp4`,'https://media.giphy.com/media/x/giphy.gif'])assert.equal(isAllowedClientEditorSourcePath(user,input),true);
 assert.equal(isAllowedClientEditorSourcePath(user,'users/another-owner/source.mp4'),false);
});
test('trusted internal generated file policy is not conflated with client authority',()=>{
 assert.equal(isAllowedEditorSourcePath(user,path.join(os.tmpdir(),'generated-card.png')),true);
 assert.equal(isAllowedClientEditorSourcePath(user,path.join(os.tmpdir(),'generated-card.png')),false);
});
test('public PATCH opts into client validation before revision persistence',()=>{
 const controller=fs.readFileSync(path.resolve('src/controllers/proEditorController.ts'),'utf8');
 const service=fs.readFileSync(path.resolve('src/services/proEditorService.ts'),'utf8');
 assert.match(controller,/updateEditorProject\(projectId, userId, req\.body \|\| \{\}, \{clientSupplied:true\}\)/);
 assert.match(service,/if \(options\.clientSupplied\) await validateClientEditorSourcePath\(userId, item\.source_path\)/);
 assert.ok(service.indexOf('await validateClientEditorSourcePath')<service.indexOf('const expectedVersion=dto.version'));
});
