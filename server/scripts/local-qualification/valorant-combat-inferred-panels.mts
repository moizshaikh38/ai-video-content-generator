/** Experimental LOCAL inference, ONE stream, not production defaults/manual-role proof. */
import fs from 'node:fs';
Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://127.0.0.1:27019',MONGODB_DB_NAME:'vireo_recovery_qualification'});
const f=JSON.parse(fs.readFileSync('/tmp/vireo-local-restore/valorant-combat-aligned-fixture.json','utf8'));
const candidate=JSON.parse(fs.readFileSync('/tmp/vireo-local-restore/combat-uniform-repro-boundary.json','utf8'));
if(candidate.status!=='experimental_candidate'||candidate.contexts!==3||candidate.distinct_candidate_margin<1.12)throw Error('Ambiguous source boundary, no panel assignment');
const {getMongoDb,closeMongo}=await import('../../src/db/mongoClient.js');const {ProEditorService}=await import('../../src/services/proEditorService.js');const db=await getMongoDb();
try{
 const p=await ProEditorService.getOrCreateEditorProject(f.clip_id,f.user_id);const r=candidate.region;
 const sourceRect={x:r.x/candidate.source_width,y:r.y/candidate.source_height,w:r.w/candidate.source_width,h:r.h/candidate.source_height};
 for(const t of p.tracks){if(t.type!=='VIDEO')t.hidden=true;for(const i of t.items||[]){if(i.audio)i.audio.normalized=false;if(t.type==='VIDEO'){delete i.crop;delete i.framing_window;i.layout_mode='track';i.crop_config={layout_mode:'track',layout_mode_source:'user'};i.panels={layout:'game_screen_first',slots:[{focusX:.5,focusY:.5,scale:1,set:true},{focusX:.5,focusY:.5,scale:1,set:true,sourceRect}]};}}}
 await db.collection('editor_projects').updateOne({id:p.id},{$set:{tracks:p.tracks}});await db.collection('clips').updateOne({id:f.clip_id},{$set:{hook_text:'',title:'',overlay_config:{enabled:false}}});
 fs.writeFileSync('/tmp/vireo-local-restore/valorant-combat-inferred-fixture.json',JSON.stringify({...f,editor_id:p.id,experiment:'three-context inferred camera, selected60/40template; NOT production'},null,2));console.log('EXPERIMENTAL_INFERRED_RECT_ASSIGNED',sourceRect);
}finally{await closeMongo()}
