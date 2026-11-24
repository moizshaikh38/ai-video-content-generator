import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertSavedRenderCurrent, enforceSavedRenderFreshness} from '../services/renderFreshnessGuard.js';
import {editorRenderSnapshot} from '../shared/editorRenderSnapshot.js';

function fixture() {
  const editor:any={id:'editor',version:2,canvas:{width:1080,height:1920},tracks:[]};
  const clip:any={id:'clip',user_id:'owner',project_id:'project',render_status:'ready',render_version:2,editor_version:3,output_storage_path:'immutable-attempt.mp4',source_storage_path:'source.mp4',selection_source_receipt:{version:1}};
  clip.latest_job={id:'job',clip_id:clip.id,user_id:clip.user_id,status:'completed',render_version:2,editor_version:3,editor_project_snapshot:editorRenderSnapshot(editor)};
  const state={editor:editor as any,current:structuredClone(clip) as any};
  const db:any={collection(name:string){return{async findOne(){return name==='editor_projects'?state.editor:state.current}}}};
  return{clip,state,db};
}
const rejectsCode=(fn:()=>Promise<void>,code:string)=>assert.rejects(fn,(e:any)=>e.statusCode===409&&e.code===code);
test('current completed saved editor passes read-only signing guard',async()=>{const f=fixture(),before=JSON.stringify(f);await assertSavedRenderCurrent(f.db,f.clip,'owner');assert.equal(JSON.stringify(f),before)});
test('pending projection and changed saved editor reject',async()=>{for(const mutate of [(f:any)=>f.clip.editor_project_sync_pending={id:'editor',version:3},(f:any)=>f.state.editor.version++,(f:any)=>f.state.editor.tracks=[{id:'new'}]]){const f=fixture();mutate(f);await rejectsCode(()=>assertSavedRenderCurrent(f.db,f.clip,'owner'),'RENDER_INPUT_CHANGED')}});
test('missing or malformed job snapshot is unverified, never backfilled',async()=>{for(const mutate of [(f:any)=>delete f.clip.latest_job,(f:any)=>delete f.clip.latest_job.editor_project_snapshot,(f:any)=>f.clip.latest_job.editor_project_snapshot.digest='invalid']){const f=fixture();mutate(f);await rejectsCode(()=>assertSavedRenderCurrent(f.db,f.clip,'owner'),'RENDER_FRESHNESS_UNVERIFIED')}});
test('explicit no-editor snapshot passes only while no editor exists',async()=>{const f=fixture();f.clip.latest_job.editor_project_snapshot=null;f.state.editor=null;await assertSavedRenderCurrent(f.db,f.clip,'owner');f.state.editor={id:'new',version:1,tracks:[]};await rejectsCode(()=>assertSavedRenderCurrent(f.db,f.clip,'owner'),'RENDER_INPUT_CHANGED')});
test('job status, owner and version mismatches reject',async()=>{for(const patch of [{status:'processing'},{clip_id:'other'},{user_id:'other'},{editor_version:4},{render_version:3}]){const f=fixture();Object.assign(f.clip.latest_job,patch);await rejectsCode(()=>assertSavedRenderCurrent(f.db,f.clip,'owner'),'RENDER_INPUT_CHANGED')}});
test('interleaved save, source or output changes reject at final read',async()=>{for(const patch of [{editor_version:4},{editor_project_sync_pending:{id:'editor',version:3}},{output_storage_path:'other-attempt.mp4'},{source_storage_path:'other.mp4'},{selection_source_receipt:{version:2}},{render_status:'queued'}]){const f=fixture();Object.assign(f.state.current,patch);await rejectsCode(()=>assertSavedRenderCurrent(f.db,f.clip,'owner'),'RENDER_INPUT_CHANGED')}});
test('wrong caller and deleted clip fail without exposing artifact',async()=>{const f=fixture();await assert.rejects(()=>assertSavedRenderCurrent(f.db,f.clip,'other'),(e:any)=>e.statusCode===404);f.state.current=null;await assert.rejects(()=>assertSavedRenderCurrent(f.db,f.clip,'owner'),(e:any)=>e.statusCode===404)});
test('compatibility flag absent or zero skips only optional guard',async()=>{const prior=process.env.VIREO_SAVED_RENDER_FRESHNESS_V1;try{for(const value of [undefined,'0']){if(value===undefined)delete process.env.VIREO_SAVED_RENDER_FRESHNESS_V1;else process.env.VIREO_SAVED_RENDER_FRESHNESS_V1=value;await enforceSavedRenderFreshness({}as any,'owner')}}finally{if(prior===undefined)delete process.env.VIREO_SAVED_RENDER_FRESHNESS_V1;else process.env.VIREO_SAVED_RENDER_FRESHNESS_V1=prior}});
