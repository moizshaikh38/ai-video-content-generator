import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const load=source=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const journal=await load(fs.readFileSync('src/lib/renderIntentJournal.ts','utf8'));
const source=fs.readFileSync('src/lib/renderSubmissionRecovery.ts','utf8').replace(/^import .*;\n/gm,'');
const {make}=await load(`export function make(d:any){const {createRenderIntentJournal,renderReceiptMatches}=d;${source.replace('export function','function')};return createRenderSubmissionRecovery;}`);
const create=make(journal),key='11111111-1111-4111-8111-111111111111',nextKey='33333333-3333-4333-8333-333333333333',jobId='22222222-2222-4222-8222-222222222222';
function setup(options={}){
 const data=options.data??new Map(),events=[];let reads=0,ids=0,currentOwner='owner';
 const storage={getItem:k=>{if(options.readBlocked)throw Error('blocked');return data.get(k)??null},setItem:(k,v)=>{if(options.writeBlocked)throw Error('quota exceeded');data.set(k,v)},removeItem:k=>data.delete(k)};
 const clip={id:'clip',user_id:'owner',render_version:4,editor_version:9,...options.clip};
 const d={owner:async()=>currentOwner,storage:()=>storage,newId:()=>++ids===1?key:nextKey,lock:async(_name,work)=>work(),readClip:async()=>{reads++;return clip},request:async(path,request)=>{events.push({path,body:JSON.parse(request.body),storedAtSend:data.size});if(options.error)throw options.error;const body=JSON.parse(request.body);return options.response??{status:'ok',clipId:'clip',jobId,renderVersion:body.expected_render_version+1,editorVersion:body.expected_editor_version}}};
 const s=create(d);return{s,d,data,storage,events,clip,get reads(){return reads},get ids(){return ids},setOwner:v=>{currentOwner=v}};
}
test('intent is persisted before first POST and receipt is journaled for reload',async()=>{const s=setup();const r=await s.s.submit('clip',{render_resolution:'720p'});assert.equal(r.submissionId,key);assert.equal(s.events[0].storedAtSend,1);assert.deepEqual(s.events[0].body,{render_resolution:'720p',submission_id:key,expected_render_version:4,expected_editor_version:9});assert.equal(journal.createRenderIntentJournal(s.storage,()=>key).read('owner','clip').receipt.jobId,jobId)});
test('uncertain response followed by a fresh client retries exactly the original persisted intent despite changed current revisions',async()=>{
 const s=setup({error:Error('lost response')});await assert.rejects(s.s.submit('clip',{render_resolution:'720p'}),{code:'RENDER_ADMISSION_UNCONFIRMED'});const reloaded=setup({data:s.data,clip:{render_version:8,editor_version:12}});await reloaded.s.submit('clip',{render_resolution:'720p'});assert.deepEqual(reloaded.events[0].body,s.events[0].body);assert.equal(reloaded.reads,0);assert.equal(reloaded.ids,0);
});
test('reload recovery only looks up the saved request and never admits absent work',async()=>{
 const s=setup({error:Error('lost')});await assert.rejects(s.s.submit('clip'));const restored=setup({data:s.data});const r=await restored.s.recover('clip');assert.equal(restored.events[0].body.recover_only,true);assert.equal(r.jobId,jobId);assert.equal(restored.reads,0);assert.equal(restored.ids,0);const empty=setup();assert.equal(await empty.s.recover('clip'),null);assert.equal(empty.events.length,0);
});
test('lookup absence retains the same intent and reports pending without a new submission',async()=>{const s=setup({error:Error('lost')});await assert.rejects(s.s.submit('clip'));const restored=setup({data:s.data,error:{status:404,code:'RENDER_SUBMISSION_NOT_FOUND'}});await assert.rejects(restored.s.recover('clip'),{code:'RENDER_RECOVERY_PENDING'});assert.equal(restored.data.size,1);assert.equal(restored.events.length,1);assert.equal(restored.events[0].body.recover_only,true)});
test('saved request with different options blocks replacement and retains the unresolved key',async()=>{const s=setup({error:Error('lost')});await assert.rejects(s.s.submit('clip',{render_resolution:'720p'}));await assert.rejects(s.s.submit('clip',{render_resolution:'1080p'}),{code:'RENDER_RECOVERY_OPTIONS_CONFLICT'});assert.equal(s.events.length,1);assert.equal(s.data.size,1)});
test('blocked/corrupt storage prevents any POST rather than falling back unkeyed',async()=>{for(const options of [{readBlocked:true},{writeBlocked:true}]){const s=setup(options);await assert.rejects(s.s.submit('clip'));assert.equal(s.events.length,0)}const s=setup();s.data.set('vireo-render-intent-v1:'+JSON.stringify(['owner','clip']),'not-json');await assert.rejects(s.s.submit('clip'),{code:'RENDER_RECOVERY_UNVERIFIED'});assert.equal(s.events.length,0)});
test('wrong owner clip cannot seed an intent or POST',async()=>{const s=setup({clip:{user_id:'other'}});await assert.rejects(s.s.submit('clip'));assert.equal(s.events.length,0);assert.equal(s.data.size,0)});
test('journal owner separation keeps another account from recovering or clearing the original intent',async()=>{const s=setup();await s.s.submit('clip');s.setOwner('other');assert.equal(await s.s.recover('clip'),null);await s.s.resolve('clip',key);assert.equal(s.data.size,1);assert.equal(s.events.length,1)});
test('wrong receipt cannot replace a saved intent or claim committed work',async()=>{const s=setup({response:{status:'ok',clipId:'other',jobId,renderVersion:5,editorVersion:9}});await assert.rejects(s.s.submit('clip'),{code:'RENDER_RECEIPT_UNVERIFIED'});assert.equal(s.data.size,1);assert.equal(journal.createRenderIntentJournal(s.storage,()=>key).read('owner','clip').receipt,undefined)});
test('resolving only the matching submission cannot erase a newer intent',async()=>{const s=setup();await s.s.submit('clip');await s.s.resolve('clip',nextKey);assert.equal(s.data.size,1);await s.s.resolve('clip',key);assert.equal(s.data.size,0)});
test('deliberate new render after matching terminal job creates a new key; an active job reuses the existing key',async()=>{
 for(const status of ['queued','processing','completed','failed']){const s=setup();await s.s.submit('clip');Object.assign(s.clip,{render_version:5,editor_version:9,latest_job:{id:jobId,clip_id:'clip',render_version:5,editor_version:9,status}});await s.s.submit('clip');assert.equal(s.events[1].body.submission_id,['completed','failed'].includes(status)?nextKey:key);assert.equal(s.events[1].body.expected_render_version,['completed','failed'].includes(status)?5:4);}
});
test('cross-tab coordination dependency encloses both intent creation and POST',async()=>{const s=setup();const order=[];s.d.lock=async(_name,work)=>{order.push('lock');const value=await work();order.push('unlock');return value};const request=s.d.request;s.d.request=async(...args)=>{assert.deepEqual(order,['lock']);return request(...args)};await create(s.d).submit('clip');assert.deepEqual(order,['lock','unlock'])});
test('journal keeps malformed unknown fields and refuses them rather than resending arbitrary payloads',()=>{const s=setup();const j=journal.createRenderIntentJournal(s.storage,()=>key);assert.throws(()=>j.prepare('owner','clip',4,9,{recover_only:true}),{code:'RENDER_RECOVERY_UNVERIFIED'});assert.equal(s.events.length,0)});
test('serialized simultaneous tabs reuse one key rather than create independent work',async()=>{
 const a=setup();let tail=Promise.resolve();const lock=async(_name,work)=>{const prior=tail;let release;tail=new Promise(r=>release=r);await prior;try{return await work()}finally{release()}};
 a.d.lock=lock;const b=setup({data:a.data});b.d.lock=lock;
 await Promise.all([create(a.d).submit('clip'),create(b.d).submit('clip')]);assert.equal(a.ids+b.ids,1);assert.equal(a.events[0].body.submission_id,b.events[0].body.submission_id);assert.equal(a.events[0].body.expected_render_version,b.events[0].body.expected_render_version);
 // This is a stub lock-order check, not proof of real browser Web Locks.
});
test('known server rejection retains its exact reason and saved key, never automatically retries',async()=>{
 for(const status of [400,401,403,404,409,429]){const error=Object.assign(Error('denied'),{status});const s=setup({error});await assert.rejects(s.s.submit('clip'),e=>e===error);assert.equal(s.events.length,1);assert.equal(s.data.size,1);}
});
test('request binding includes the original verified owner and account change stops before network',async()=>{
 const s=setup();let ownerArg;const request=s.d.request;s.d.request=async(...args)=>{ownerArg=args[2];return request(...args)};await create(s.d).submit('clip');assert.equal(ownerArg,'owner');
 const changed=setup();let calls=0;changed.d.owner=async()=>++calls===1?'owner':'other';await assert.rejects(create(changed.d).submit('clip'),{code:'RENDER_RECOVERY_OWNER_CHANGED'});assert.equal(changed.events.length,0);assert.equal(changed.data.size,1);
});
test('receipt-storage write failure retains the original key for same-key recovery',async()=>{
 const s=setup();const write=s.storage.setItem;let count=0;s.storage.setItem=(...args)=>{if(++count>1)throw Error('storage quota');return write(...args)};await assert.rejects(s.s.submit('clip'),{code:'RENDER_RECOVERY_STORAGE_UNAVAILABLE'});assert.equal(s.events.length,1);const restored=setup({data:s.data});await restored.s.recover('clip');assert.equal(restored.events[0].body.submission_id,key);assert.equal(restored.events[0].body.recover_only,true);
});
test('modified storage that discards writes cannot cause an unjournaled submission',async()=>{
 const s=setup();s.storage.setItem=()=>{};await assert.rejects(s.s.submit('clip'),{code:'RENDER_RECOVERY_STORAGE_UNAVAILABLE'});assert.equal(s.events.length,0);
});
test('changed options after a resolved matching terminal receipt are a deliberate fresh intent',async()=>{
 const s=setup();await s.s.submit('clip',{render_resolution:'720p'});Object.assign(s.clip,{render_version:5,editor_version:9,latest_job:{id:jobId,clip_id:'clip',render_version:5,editor_version:9,status:'failed'}});await s.s.submit('clip',{render_resolution:'1080p'});assert.equal(s.events[1].body.submission_id,nextKey);assert.equal(s.events[1].body.render_resolution,'1080p');
});
const serviceSource=fs.readFileSync('src/services/clipRenderService.ts','utf8');const serviceAst=ts.createSourceFile('service.ts',serviceSource,ts.ScriptTarget.Latest,true);let requestBinding,lockBinding;
function inspect(n){if(ts.isVariableDeclaration(n)&&n.name.getText(serviceAst)==='renderSubmissionRecovery'){const object=n.initializer.arguments[0];for(const p of object.properties){if(p.name?.getText(serviceAst)==='request')requestBinding=p.initializer.getText(serviceAst);if(p.name?.getText(serviceAst)==='lock')lockBinding=p.initializer.getText(serviceAst);}}ts.forEachChild(n,inspect)}inspect(serviceAst);assert(requestBinding&&lockBinding);
const {bind}=await load(`export function bind(supabase:any,backendRequest:any,navigator:any){return {request:${requestBinding},lock:${lockBinding}}}`);
test('actual network adapter pins the token to the verified owner and refuses an alternate account before backend POST',async()=>{
 for(const account of ['owner','other']){const calls=[];const adapter=bind({auth:{getSession:async()=>({data:{session:{user:{id:account},access_token:'fixture-token-not-live'}}})}},async(...args)=>{calls.push(args);return{}},{});if(account==='owner'){await adapter.request('/path',{method:'POST'},'owner');assert.equal(calls[0][2],'fixture-token-not-live');}else{await assert.rejects(adapter.request('/path',{method:'POST'},'owner'),/account changed/);assert.equal(calls.length,0);}}
});
test('actual browser lock adapter refuses missing support instead of running an unlocked submission',async()=>{
 let ran=false;const absent=bind({},()=>{},{});await assert.rejects(absent.lock('name',async()=>{ran=true}),/coordinate/);assert.equal(ran,false);const supported=bind({},()=>{},{locks:{request:async(name,work)=>{assert.equal(name,'expected');return work()}}});assert.equal(await supported.lock('expected',async()=>42),42);
});
test('explicit close clears an unqueued journal only after the exact tombstone acknowledgement',async()=>{
 const s=setup({error:Error('lost')});await assert.rejects(s.s.submit('clip'));s.d.request=async(_path,request,owner)=>{assert.equal(owner,'owner');const body=JSON.parse(request.body);assert.equal(body.cancel_only,true);assert.equal(body.submission_id,key);assert.equal(s.data.size,1);return{status:'ok',cancelled:true,submissionId:key}};assert.equal(await create(s.d).closePending('clip'),null);assert.equal(s.data.size,0);assert.equal(s.events.length,1);
});
test('explicit close recovers an already-committed job and retains its journal for polling',async()=>{
 const s=setup();await s.s.submit('clip');s.d.request=async()=>({status:'ok',clipId:'clip',jobId,renderVersion:5,editorVersion:9});const r=await create(s.d).closePending('clip');assert.equal(r.jobId,jobId);assert.equal(r.submissionId,key);assert.equal(s.data.size,1);
});
test('failed, mismatching or unknown close acknowledgment never forgets the key or submits new work',async()=>{
 for(const response of [{status:'ok',cancelled:true,submissionId:nextKey},{status:'ok',cancelled:false},null]){const s=setup();await s.s.submit('clip');s.d.request=async()=>response;await assert.rejects(create(s.d).closePending('clip'),{code:'RENDER_RECEIPT_UNVERIFIED'});assert.equal(s.data.size,1);assert.equal(s.events.length,1);}
 const s=setup();await s.s.submit('clip');s.d.request=async()=>{throw Error('unknown close response')};await assert.rejects(create(s.d).closePending('clip'));assert.equal(s.data.size,1);
});
