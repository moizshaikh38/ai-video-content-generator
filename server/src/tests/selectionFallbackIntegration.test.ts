import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
test('real selection persistence distinguishes unranked fallback and blocks review/invalid inputs before provider use',async()=>{
 Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://127.0.0.1:27020',MONGODB_DB_NAME:'vireo_selection_fallback_qualification',SUPABASE_URL:'http://127.0.0.1:5998',SUPABASE_SECRET_KEY:'fixture',OPENROUTER_API_KEY:'',GROQ_API_KEY:''});
 const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');const {ClipAnalysisService}=await import('../services/clipAnalysisService.js');const db=await getMongoDb();let calls=0,returnProposal=false;const provider={generateJsonCompletion:async()=>{calls++;return {clips:returnProposal?[{start_segment_index:0,end_segment_index:1,title:'Provider proposal',hook:'Source opening',reason:'Proposal without subscores',category:'insight'}]:[]}}};const service=new ClipAnalysisService(provider as any);const ids:string[]=[];
 try{
  for(const kind of ['review','invalid','long','short','unscored']){
   const id=crypto.randomUUID(),user=crypto.randomUUID();ids.push(id);await db.collection('projects').insertOne({id,user_id:user,title:'Selection fixture',status:'ready'});await db.collection('transcripts').insertOne({id:crypto.randomUUID(),project_id:id,user_id:user,transcript_text:'Opening statement. Ending statement.',duration_seconds:kind==='long'?120:8,segments:kind==='invalid'?[{end:8,text:'missing clock'}]:[{start:0,end:3,text:'Opening statement.'},{start:3,end:8,text:'Ending statement.'}],...(kind==='review'?{quality_assessment:{status:'needs_review'}}:{})});
   const before=calls;returnProposal=kind==='unscored';
   if(kind==='review'||kind==='invalid'){
    await assert.rejects(service.analyzeAndPersistClips({projectId:id,userId:user}),(error:any)=>error.code===(kind==='review'?'TRANSCRIPT_REVIEW_REQUIRED':'CLIP_SEGMENTS_INVALID'));assert.equal(calls,before);assert.equal(await db.collection('clip_candidates').countDocuments({project_id:id}),0);
    const {analyzeProjectClips}=await import('../controllers/clipController.js');let status=0,payload:any;await analyzeProjectClips({user:{id:user},params:{id},body:{}} as any,{status(value:number){status=value;return this},json(value:any){payload=value;return this}} as any);assert.equal(status,409);assert.equal(payload.code,kind==='review'?'TRANSCRIPT_REVIEW_REQUIRED':'CLIP_SEGMENTS_INVALID');
   }else if(kind==='long'){
    assert.deepEqual(await service.analyzeAndPersistClips({projectId:id,userId:user}),[]);assert.equal(await db.collection('clip_candidates').countDocuments({project_id:id}),0);
   }else{
    const candidates=await service.analyzeAndPersistClips({projectId:id,userId:user});assert.equal(candidates.length,1);assert.equal(candidates[0].metadata?.ranking_status,'unranked');assert.equal(candidates[0].metadata?.vireo_score,null);if(kind==='short')assert.equal(candidates[0].metadata?.explanation,null);else assert.ok(candidates[0].metadata?.explanation);assert.equal(candidates[0].hook,kind==='short'?'':'Source opening');assert.equal(candidates[0].engagement_score,0);assert.equal(candidates[0].metadata?.selection_origin,kind==='short'?'short-source-fallback':'provider-proposal');
   }
  }
 }finally{for(const collection of ['projects','transcripts','clip_candidates'])await db.collection(collection).deleteMany(collection==='projects'?{id:{$in:ids}}:{project_id:{$in:ids}});await closeMongo();}
});
