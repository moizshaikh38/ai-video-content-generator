import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/lib/clippingRecovery.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {transcriptReviewRequired,clippingStartErrorMessage,projectClippingFailure,projectTranscriptReviewRequired}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const codes=['TRANSCRIPT_SOURCE_REVIEW_REQUIRED','TRANSCRIPT_REVIEW_REQUIRED','TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED'];
test('all exact backend transcript review codes use review recovery',()=>{
  for(const code of codes)assert.equal(transcriptReviewRequired({code}),true,code);
});
test('unknown and near-matching errors do not become review flags',()=>{
  for(const code of ['DATABASE_UNAVAILABLE','TRANSCRIPT_REVIEW_REQUIRED ','TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED_EXTRA','',undefined])assert.equal(transcriptReviewRequired({code}),false);
});
test('word-text mismatch has review instructions rather than raw setup diagnostics',()=>{
  const message=clippingStartErrorMessage({code:'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED',message:'PRIVATE_FIXTURE_DIAGNOSTIC'});
  assert(message.includes('Review the source audio and transcript'));
  assert(!message.includes('PRIVATE_FIXTURE_DIAGNOSTIC'));
});
test('legacy saved review state and all exact saved error codes stay review-only',()=>{
  assert.equal(projectTranscriptReviewRequired({transcript_quality_status:'needs_review'}),true);
  for(const error_code of codes)assert.equal(projectTranscriptReviewRequired({error_code}),true);
  assert.equal(projectClippingFailure({transcript_quality_status:'needs_review'}).code,'TRANSCRIPT_REVIEW_REQUIRED');
});
test('explicit read-only review remains blocked without a persisted project error',()=>{
  assert.equal(projectTranscriptReviewRequired({},true),true);
  assert.equal(projectTranscriptReviewRequired(undefined,true),true);
});
test('ordinary unflagged projects retain their existing processing path',()=>{
  assert.equal(projectTranscriptReviewRequired({}),false);
  assert.equal(projectTranscriptReviewRequired({error_code:'DATABASE_UNAVAILABLE'}),false);
  assert.equal(projectTranscriptReviewRequired(undefined),false);
});

const projectSource=fs.readFileSync(new URL('../src/pages/ProjectDetailPage.tsx',import.meta.url),'utf8');
const projectAst=ts.createSourceFile('ProjectDetailPage.tsx',projectSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function findNode(root,predicate){if(predicate(root))return root;let found;ts.forEachChild(root,node=>{if(!found)found=findNode(node,predicate);});return found;}
async function makeCallback(expression,names){const code=ts.transpileModule(`export function make(d:any){const {${names.join(',')}}=d;return ${expression}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).make;}
const effect=findNode(projectAst,n=>ts.isCallExpression(n)&&n.expression.getText(projectAst)==='useEffect'&&n.arguments[0]?.getText(projectAst).includes('hasAttemptedAutoStart.current'));
const retry=findNode(projectAst,n=>ts.isVariableDeclaration(n)&&n.name.getText(projectAst)==='handleRetryProcessing');
assert(effect&&retry);
const callbackNames=['project','id','reviewOnly','hasAttemptedAutoStart','projectTranscriptReviewRequired','projectService','setQuotaError','setIsQuotaModalOpen','setActionError','setIsRetrying','refreshData'];
const makeAuto=await makeCallback(effect.arguments[0].getText(projectAst),callbackNames);
const makeRetry=await makeCallback(retry.initializer.getText(projectAst),callbackNames);
const blocked=[...codes.map(error_code=>({project:{error_code}})),{project:{transcript_quality_status:'needs_review'}},{reviewOnly:true}];
for(const [label,make]of[['auto-start',makeAuto],['manual retry',makeRetry]])test(`actual ProjectDetail ${label} callback blocks review and preserves ordinary starts`,async()=>{
 for(const fixture of [...blocked,{}, {project:{error_code:'DATABASE_UNAVAILABLE'}}]){
  let processCalls=0;const project={id:'fixture',video_status:'uploaded',source_url:'fixture/source.mp4',...fixture.project};
  const d={project,id:'fixture',reviewOnly:Boolean(fixture.reviewOnly),hasAttemptedAutoStart:{current:false},projectTranscriptReviewRequired,projectService:{startProcessing:async()=>{processCalls++;return{success:true}}},setQuotaError(){},setIsQuotaModalOpen(){},setActionError(){},setIsRetrying(){},refreshData:async()=>{}};
  await make(d)();assert.equal(processCalls,projectTranscriptReviewRequired(project,d.reviewOnly)?0:1,JSON.stringify(fixture));
 }
});
test('review query parsing is explicit and survives a new URL parse',async()=>{
 const node=findNode(projectAst,n=>ts.isVariableDeclaration(n)&&n.name.getText(projectAst)==='reviewOnly');assert(node);
 const evaluate=await makeCallback(node.initializer.getText(projectAst),['searchParams']);
 for(const [query,expected]of[['?review=transcript',true],['',false],['?review=false',false],['?review=transcript-extra',false]])assert.equal(evaluate({searchParams:new URLSearchParams(query)}),expected);
});
test('actual Home review action selects the read-only project route',async()=>{
 const text=fs.readFileSync(new URL('../src/components/dashboard/HomeClippingWorkflow.tsx',import.meta.url),'utf8');const ast=ts.createSourceFile('Home.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const button=findNode(ast,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='button'&&n.children.some(c=>ts.isJsxText(c)&&c.getText(ast).includes('Open Project for Review')));assert(button);
 const attr=button.openingElement.attributes.properties.find(n=>ts.isJsxAttribute(n)&&n.name.getText(ast)==='onClick');assert(attr);
 const make=await makeCallback(attr.initializer.expression.getText(ast),['navigate','activeProjectId']);let route;make({navigate:value=>{route=value},activeProjectId:'review-fixture'})();assert.equal(route,'/projects/review-fixture?review=transcript');
});
