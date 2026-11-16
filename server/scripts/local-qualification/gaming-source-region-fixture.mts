/** Local isolated fixture assignment from measured evidence, not production automatic routing. */
import fs from 'node:fs';import assert from 'node:assert/strict';
Object.assign(process.env,{MONGODB_URI:'mongodb://127.0.0.1:27019',MONGODB_DB_NAME:'vireo_recovery_qualification'});
const {getMongoDb,closeMongo}=await import('../../src/db/mongoClient.js');
const fixture=JSON.parse(fs.readFileSync('/tmp/vireo-local-restore/gaming-fixture.json','utf8'));
const evidence=JSON.parse(fs.readFileSync('/tmp/vireo-local-restore/gaming-boundary-candidate.json','utf8'));
assert.equal(evidence.status,'experimental_candidate');
const r=evidence.region,W=evidence.source_width,H=evidence.source_height;
const sourceRect={x:r.x/W,y:r.y/H,w:r.w/W,h:r.h/H};
const raw=JSON.parse(fs.readFileSync('/tmp/vireo-local-restore/actual-gaming-yunet-630.json','utf8'));
const med=(a:number[])=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
const cy=med(raw.samples.map((s:any)=>(s.faces[0].y+s.faces[0].height/2)*H));
const cropH=r.w/(720/384),focusY=Math.min(1,Math.max(0,(cy-r.y-cropH/2)/(r.h-cropH)));
const oldKey=fixture.source_key;fixture.source_key=oldKey.replace(/[^/]+$/, 'valorant-630-638.mp4');
const db=await getMongoDb();try{
 const p=await db.collection('editor_projects').findOne({id:fixture.editor_id});assert.ok(p);
 const v=p.tracks.find((t:any)=>t.type==='VIDEO').items[0];
 v.source_path=fixture.source_key;v.source_start=0;v.source_end=8;v.timeline_start=0;v.timeline_end=8;delete v.crop;delete v.framing_window;
 v.panels={layout:'gameplay',slots:[{focusX:.5,focusY,scale:1,set:true,sourceRect},{focusX:.5,focusY:.5,scale:1,set:true}]};
 for(const t of p.tracks){if(t.type==='VIDEO')t.items=[v];else t.hidden=true;}
 p.canvas.duration=8;
 await db.collection('editor_projects').updateOne({id:p.id},{$set:{tracks:p.tracks,canvas:p.canvas,playhead:2}});
 await db.collection('clips').updateOne({id:fixture.clip_id},{$set:{source_storage_path:fixture.source_key,start_seconds:0,end_seconds:8,duration_seconds:8,caption_enabled:false}});
 fs.writeFileSync('/tmp/vireo-local-restore/gaming-fixture.json',JSON.stringify(fixture,null,2));
 fs.writeFileSync('/tmp/vireo-local-restore/gaming-source-region-result.json',JSON.stringify({fixture,sourceRect,focusY},null,2));console.log('REGION_FIXTURE',sourceRect,focusY);
}finally{await closeMongo();}
