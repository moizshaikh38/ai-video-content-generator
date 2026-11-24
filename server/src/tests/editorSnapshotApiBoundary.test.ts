import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://127.0.0.1:1',MONGODB_DB_NAME:'snapshot_api_no_connect'});
const {captureEditorSnapshot}=await import('../controllers/proEditorController.js');
const {ProEditorService:S}=await import('../services/proEditorService.js');
const {dataRepository:D}=await import('../db/repositories/dataRepository.js');
const {AppError}=await import('../types/index.js');
const user='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';
const old={get:S.getEditorProject,capture:S.captureSnapshot,from:D.from,role:process.env.VIREO_SERVICE_ROLE};
let reads=0,clips=0,captures=0,downloaded=0,missing=false;
S.getEditorProject=(async(id:string,owner:string)=>{reads++;assert.equal(id,project);assert.equal(owner,user);if(missing)throw new AppError('Editor project not found.',404,'PROJECT_NOT_FOUND');return {clip_id:'clip-fixture'};})as any;
D.from=(()=>{clips++;return{select(){return this},eq(){return this},single:async()=>({data:{source_storage_path:'/not-opened/source.mp4'}})}})as any;
S.captureSnapshot=async(source:string,time:number)=>{captures++;assert.equal(source,'/not-opened/source.mp4');assert.equal(time,2);throw new AppError('Fixture reached existing capture entry.',409,'FIXTURE_CAPTURE_REACHED');};
function request(extra:any={}){return{user:{id:user},params:{id:project},body:{timestamp:2},...extra}as any;}
function response(){return{code:200,body:null as any,status(n:number){this.code=n;return this},json(b:any){this.body=b;return this},download(){downloaded++;assert.fail('No fixture output exists');}}as any;}
function counts(){return{reads,clips,captures,downloaded};}
test('API snapshot keeps owned lookup but refuses before clip source lookup, capture or output',async()=>{process.env.VIREO_SERVICE_ROLE='api';const before=counts(),r=response();await captureEditorSnapshot(request(),r);assert.equal(r.code,503);assert.equal(r.body.code,'PROCESSING_DISPATCH_UNAVAILABLE');assert.deepEqual(counts(),{...before,reads:before.reads+1});});
test('API snapshot authentication remains first',async()=>{process.env.VIREO_SERVICE_ROLE='api';const before=counts(),r=response();await captureEditorSnapshot(request({user:null}),r);assert.equal(r.code,401);assert.equal(r.body.code,'AUTH_REQUIRED');assert.deepEqual(counts(),before);});
test('API snapshot invalid ID does not read editor',async()=>{process.env.VIREO_SERVICE_ROLE='api';const before=counts(),r=response();await captureEditorSnapshot(request({params:{id:'invalid'}}),r);assert.equal(r.code,400);assert.equal(r.body.code,'INVALID_UUID');assert.deepEqual(counts(),before);});
test('API snapshot preserves owned missing editor response before dispatch refusal',async()=>{process.env.VIREO_SERVICE_ROLE='api';const before=counts(),r=response();missing=true;try{await captureEditorSnapshot(request(),r);assert.equal(r.code,404);assert.equal(r.body.code,'PROJECT_NOT_FOUND');assert.deepEqual(counts(),{...before,reads:before.reads+1});}finally{missing=false;}});
for(const role of ['combined','worker'])test(role+' snapshot retains existing capture path',async()=>{process.env.VIREO_SERVICE_ROLE=role;const before=counts(),r=response();await captureEditorSnapshot(request(),r);assert.equal(r.code,409);assert.equal(r.body.code,'FIXTURE_CAPTURE_REACHED');assert.deepEqual(counts(),{...before,reads:before.reads+1,clips:before.clips+1,captures:before.captures+1});});
test('restore snapshot collaborators',()=>{S.getEditorProject=old.get;S.captureSnapshot=old.capture;D.from=old.from;if(old.role===undefined)delete process.env.VIREO_SERVICE_ROLE;else process.env.VIREO_SERVICE_ROLE=old.role;});
