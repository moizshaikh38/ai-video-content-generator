import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/lib/landingReturnPath.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {landingReturnPath,authPathWithReturn}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('only the creation route and its query survive authentication',()=>{
 for(const path of ['/projects/new','/projects/new?url=https%3A%2F%2Fvideo.example%2Fclip.mp4'])assert.equal(landingReturnPath('?next='+encodeURIComponent(path)),path);
 for(const path of ['https://outside.invalid','//outside.invalid','\\\\outside.invalid','/\\outside.invalid','javascript:alert(1)','/projects/new/../../outside','/projects/new#outside','/projects/newer','/%2f%2foutside.invalid','/dashboard?next=//outside.invalid','\n//outside.invalid'])assert.equal(landingReturnPath('?next='+encodeURIComponent(path)),'/dashboard');
});
test('query content cannot change the origin or creation pathname',()=>{
 for(const payload of ['//outside.invalid','\\\\outside.invalid','https://outside.invalid','%2f%2foutside.invalid','\r\n//outside.invalid']){
  const path='/projects/new?url='+encodeURIComponent(payload),destination=landingReturnPath('?next='+encodeURIComponent(path));
  const resolved=new URL(destination,'https://local.invalid');assert.equal(resolved.origin,'https://local.invalid');assert.equal(resolved.pathname,'/projects/new');
 }
});
test('state fallback obeys same allowlist and explicit next wins',()=>{
 assert.equal(landingReturnPath('',{pathname:'//outside.invalid'}),'/dashboard');
 assert.equal(landingReturnPath('',{pathname:'/projects/new',search:'?url=abc'}),'/projects/new?url=abc');
 assert.equal(landingReturnPath('?next='+encodeURIComponent('//outside.invalid'),{pathname:'/projects/new'}),'/dashboard');
});
test('login/signup round trip preserves encoded creation query exactly',()=>{
 const path='/projects/new?url='+encodeURIComponent('https://video.invalid/a?x=1&y=2');
 for(const base of ['/login','/signup']){const url=new URL(authPathWithReturn(base,path),'https://local.invalid');assert.equal(url.pathname,base);assert.equal(landingReturnPath(url.search),path);assert.equal(authPathWithReturn(base,'/dashboard'),base);}
});
// This is a targeted application-return-path regression, not proof that the
// router package advisory or every navigation sink is unreachable.
