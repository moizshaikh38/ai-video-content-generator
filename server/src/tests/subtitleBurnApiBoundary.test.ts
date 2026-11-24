import test,{after} from 'node:test';import assert from 'node:assert/strict';
Object.assign(process.env,{NODE_ENV:'test'});
const {SubtitleStudioService:S}=await import('../services/subtitleStudioService.js');
const {EntitlementService:E}=await import('../services/entitlementService.js');
const {AppError}=await import('../types/index.js');
const old={get:S.getProject,ent:E.resolveUserEntitlements,fetch:globalThis.fetch,run:(S as any).runBurnWorker,role:process.env.VIREO_SERVICE_ROLE};
let missing=false,reads=0,entitlements=0,network=0,launches=0;
let project:any;function fresh(){project={source_url:'fixture-source',subtitle_cues:[{start:0,end:1,text:'Fixture'}],subtitle_export_status:'idle'};}
S.getProject=(async(id:string,owner:string)=>{reads++;assert.equal(id,'project');assert.equal(owner,'owner');if(missing)throw new AppError('Subtitle project not found.',404,'PROJECT_NOT_FOUND');return{project,transcript:null,previewUrl:null,exportDownloadUrl:null};})as any;
E.resolveUserEntitlements=(async()=>{entitlements++;throw Error('No entitlement lookup expected');})as any;
globalThis.fetch=(async()=>{network++;throw Error('No source access expected');})as any;
(S as any).runBurnWorker=async()=>{launches++;throw Error('No worker launch expected');};
after(()=>{S.getProject=old.get;E.resolveUserEntitlements=old.ent;globalThis.fetch=old.fetch;(S as any).runBurnWorker=old.run;if(old.role===undefined)delete process.env.VIREO_SERVICE_ROLE;else process.env.VIREO_SERVICE_ROLE=old.role;});
function noWork(){assert.equal(entitlements,0);assert.equal(network,0);assert.equal(launches,0);}
test('API new subtitle burn refuses before source binding, entitlement, admission or launch',async()=>{process.env.VIREO_SERVICE_ROLE='api';fresh();const before=structuredClone(project),count=reads;await assert.rejects(S.exportBurnedVideo('project','owner'),{code:'PROCESSING_DISPATCH_UNAVAILABLE',statusCode:503});assert.equal(reads,count+1);assert.deepEqual(project,before);noWork();});
test('API missing owned subtitle project keeps404',async()=>{process.env.VIREO_SERVICE_ROLE='api';fresh();missing=true;try{await assert.rejects(S.exportBurnedVideo('project','owner'),{code:'PROJECT_NOT_FOUND',statusCode:404});noWork();}finally{missing=false;}});
test('API missing source keeps existing input validation',async()=>{process.env.VIREO_SERVICE_ROLE='api';fresh();project.source_url=null;await assert.rejects(S.exportBurnedVideo('project','owner'),{code:'SOURCE_VIDEO_MISSING',statusCode:400});noWork();});
test('API absent subtitle cues keeps existing input validation',async()=>{process.env.VIREO_SERVICE_ROLE='api';fresh();project.subtitle_cues=[];await assert.rejects(S.exportBurnedVideo('project','owner'),{code:'NO_SUBTITLES',statusCode:400});noWork();});
for(const state of ['status','token'])test('API existing burn '+state+' readback remains available',async()=>{process.env.VIREO_SERVICE_ROLE='api';fresh();if(state==='status')project.subtitle_export_status='rendering';else project.subtitle_export_run_token='running-fixture';const before=structuredClone(project);assert.equal((await S.exportBurnedVideo('project','owner')).exportStatus,'rendering');assert.deepEqual(project,before);noWork();});
for(const role of ['combined','worker'])test(role+' new burn retains original source-bound transcript prerequisite',async()=>{process.env.VIREO_SERVICE_ROLE=role;fresh();await assert.rejects(S.exportBurnedVideo('project','owner'),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED',statusCode:409});noWork();});
