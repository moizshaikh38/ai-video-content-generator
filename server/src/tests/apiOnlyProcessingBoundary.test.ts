import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://127.0.0.1:1',MONGODB_DB_NAME:'api_role_no_connect',SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SECRET_KEY:'fixture',R2_ACCOUNT_ID:'fixture',R2_ACCESS_KEY_ID:'fixture',R2_SECRET_ACCESS_KEY:'fixture'});
const USER='11111111-1111-4111-8111-111111111111',PROJECT='22222222-2222-4222-8222-222222222222';
const {processProject}=await import('../controllers/projectController.js');
const {dataRepository}=await import('../db/repositories/dataRepository.js');
const {CreditWalletService}=await import('../services/creditWalletService.js');
const {ProjectPosterService:P}=await import('../services/projectPosterService.js');
const {config}=await import('../config/index.js');
const originalFrom=dataRepository.from,originalReserve=CreditWalletService.reserveCredits,originalGenerate=P.generate;
const role=process.env.VIREO_SERVICE_ROLE;
let reads=0,reserves=0,generates=0;
let project:any={id:PROJECT,user_id:USER,source_type:'upload',source_url:'source.mp4',video_status:'uploaded'};
function req(overrides:any={}){return {user:{id:USER},params:{id:PROJECT},headers:{},body:{},...overrides}as any;}
function response(){return {code:200,body:null as any,status(n:number){this.code=n;return this},json(b:any){this.body=b;return this}}as any;}
test('API-only new processing is rejected before credits/provider/local launch; owner read retained',async()=>{
 process.env.VIREO_SERVICE_ROLE='api';
 dataRepository.from=(()=>{reads++;return{select(){return this},eq(){return this},maybeSingle:async()=>({data:project,error:null})}})as any;
 CreditWalletService.reserveCredits=(async()=>{reserves++;throw Error('must not reserve')})as any;
 const res=response();await processProject(req(),res);assert.equal(res.code,503);assert.equal(res.body.code,'PROCESSING_DISPATCH_UNAVAILABLE');assert.equal(reads,1);assert.equal(reserves,0);
});
test('API-only dispatch response does not bypass unauthenticated request',async()=>{const before=reads,res=response();await processProject(req({user:null}),res);assert.equal(res.code,401);assert.equal(reads,before);assert.equal(reserves,0)});
test('API-only dispatch response does not bypass invalid project id',async()=>{const before=reads,res=response();await processProject(req({params:{id:'invalid'}}),res);assert.equal(res.code,400);assert.equal(reads,before)});
test('API-only response preserves owner-filtered missing project result',async()=>{const old=project;project=null;try{const res=response();await processProject(req(),res);assert.equal(res.code,404);assert.equal(reserves,0)}finally{project=old}});
test('API-only invalid recover request remains explicit reconciliation error, no dispatch',async()=>{const res=response();await processProject(req({body:{recover_only:true}}),res);assert.equal(res.code,409);assert.equal(res.body.code,'PROCESSING_ATTEMPT_CHANGED');assert.equal(reserves,0)});
test('combined core admission still reaches existing provider prerequisite',async()=>{process.env.VIREO_SERVICE_ROLE='combined';const old={p:config.transcriptionProvider,g:config.groqApiKey,o:config.openrouterApiKey};Object.assign(config,{transcriptionProvider:'groq',groqApiKey:'',openrouterApiKey:''});try{const res=response();await processProject(req(),res);assert.equal(res.body.code,'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED');assert.equal(reserves,0)}finally{Object.assign(config,{transcriptionProvider:old.p,groqApiKey:old.g,openrouterApiKey:old.o})}});
test('worker core admission retains existing provider prerequisite',async()=>{process.env.VIREO_SERVICE_ROLE='worker';const old={p:config.transcriptionProvider,g:config.groqApiKey};Object.assign(config,{transcriptionProvider:'groq',groqApiKey:''});try{const res=response();await processProject(req(),res);assert.equal(res.body.code,'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED')}finally{Object.assign(config,{transcriptionProvider:old.p,groqApiKey:old.g})}});
test('API-only missing poster never starts source generation',async()=>{process.env.VIREO_SERVICE_ROLE='api';P.generate=(async()=>{generates++;throw Error('must not generate')})as any;assert.equal(await P.getPosterUrl(project),null);assert.equal(generates,0)});
test('API-only durable poster reuses signed object URL without generation',async()=>{const canonical=P.posterKey(USER,PROJECT);const url=await P.getPosterUrl({...project,poster_key:canonical});assert(url?.includes('X-Amz-Signature='));assert(url?.includes('/vireo-rendered-clips/users/'));assert.equal(generates,0)});
test('combined missing poster still reaches generation',async()=>{process.env.VIREO_SERVICE_ROLE='combined';P.generate=(async()=>{generates++;return null})as any;assert.equal(await P.getPosterUrl(project),null);assert.equal(generates,1)});
test('worker missing poster still reaches generation',async()=>{process.env.VIREO_SERVICE_ROLE='worker';assert.equal(await P.getPosterUrl(project),null);assert.equal(generates,2)});
test('restore patched collaborators',()=>{dataRepository.from=originalFrom;CreditWalletService.reserveCredits=originalReserve;P.generate=originalGenerate;if(role===undefined)delete process.env.VIREO_SERVICE_ROLE;else process.env.VIREO_SERVICE_ROLE=role});
