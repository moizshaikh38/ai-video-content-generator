import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ProEditorService} from '../services/proEditorService.js';
import {MongoClient} from 'mongodb';
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
 const update=service.slice(service.indexOf('public static async updateEditorProject('),service.indexOf('public static async prepareEditorRevision('));
 assert.ok(update.indexOf('await this.prepareEditorRevision')<update.indexOf('await saveEditorRevision'));
 const prepare=service.slice(service.indexOf('public static async prepareEditorRevision('));
 assert.ok(prepare.indexOf('await validateClientEditorSourcePath')<prepare.indexOf('const expectedVersion=dto.version'));

});

test('actual public-save service rejects a client file path before persistence connection',async()=>{
 const oldGet=ProEditorService.getEditorProject,oldConnect=MongoClient.prototype.connect;let connects=0;
 (ProEditorService as any).getEditorProject=async()=>({id:user,user_id:user,version:1,canvas:{aspect_ratio:'9:16'},tracks:[]});
 (MongoClient.prototype as any).connect=async()=>{connects++;throw Error('PERSISTENCE_CONNECTION_MUST_NOT_BE_REACHED');};
 try{for(const input of [path.join(os.tmpdir(),'other-user-asset.mp4'),'server/public/other-owner.mp4','package.json','users/another-owner/source.mp4'])await assert.rejects(ProEditorService.updateEditorProject(user,user,{version:1,tracks:[{id:'v',type:'VIDEO',items:[{id:'i',type:'VIDEO',source_path:input,source_start:0,source_end:1,timeline_start:0,timeline_end:1}]}]} as any,{clientSupplied:true}),{code:'EDITOR_SOURCE_NOT_ALLOWED'});assert.equal(connects,0);}finally{ProEditorService.getEditorProject=oldGet;MongoClient.prototype.connect=oldConnect;}
});
