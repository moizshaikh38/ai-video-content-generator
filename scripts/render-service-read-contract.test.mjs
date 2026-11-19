import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('server/src/services/clipRenderService.ts','utf8');
const ast=ts.createSourceFile('render.ts',source,ts.ScriptTarget.Latest,true);const bodies=[];
function visit(n){if(ts.isMethodDeclaration(n)&&['getClip','getProjectClips'].includes(n.name.getText(ast)))bodies.push(n.getText(ast));ts.forEachChild(n,visit);}visit(ast);assert.equal(bodies.length,2);
const js=ts.transpileModule(`export function make(d:any){const {isMongoConfigured,dataRepository,logger}=d;return class{${bodies.join('\n')}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup({configured=true,clipError=null,jobError=null,clips=[],clip=null}={}){return make({isMongoConfigured:configured,logger:{error:()=>{}},dataRepository:{from:table=>{const result=()=>table==='clips'?{data:clips,error:clipError}:{data:null,error:jobError};const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>table==='clips'?{data:clip,error:clipError}:result(),then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject)};return q}}});}
test('an actual empty saved-clip query remains a known empty result',async()=>{assert.deepEqual(await setup().getProjectClips('p','u'),[]);});
test('unconfigured database cannot be reported as an empty library',async()=>{await assert.rejects(()=>setup({configured:false}).getProjectClips('p','u'),{code:'SERVICE_UNAVAILABLE'});});
test('library database failure does not become successful empty clips',async()=>{await assert.rejects(()=>setup({clipError:{message:'read failed',code:'DATABASE_UNAVAILABLE'}}).getProjectClips('p','u'),{code:'DATABASE_UNAVAILABLE'});});
test('missing or malformed database results are not known empty lists',async()=>{for(const clips of [null,undefined,{},'invalid']){if(clips===undefined)continue;await assert.rejects(()=>setup({clips}).getProjectClips('p','u'),/response is invalid/);}});
test('latest render-job read failure remains a failure, not missing progress',async()=>{await assert.rejects(()=>setup({clips:[{id:'c'}],jobError:{message:'job read failed'}}).getProjectClips('p','u'),{code:'DATABASE_UNAVAILABLE'});});
test('a real clip without any render job remains readable',async()=>{const s=setup({clip:{id:'c'}});assert.deepEqual(await s.getClip('c','u'),{id:'c',latest_job:null});});
test('single-clip database failure is not mislabeled as clip not found',async()=>{await assert.rejects(()=>setup({clipError:{message:'offline',code:'DATABASE_UNAVAILABLE'}}).getClip('c','u'),{code:'DATABASE_UNAVAILABLE'});});
test('a confirmed absent clip still produces not-found',async()=>{await assert.rejects(()=>setup().getClip('c','u'),{code:'CLIP_NOT_FOUND'});});
test('single-clip job metadata failure remains explicit',async()=>{await assert.rejects(()=>setup({clip:{id:'c'},jobError:{message:'offline'}}).getClip('c','u'),{code:'DATABASE_UNAVAILABLE'});});
