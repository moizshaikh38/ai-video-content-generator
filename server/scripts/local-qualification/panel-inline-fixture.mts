/** LOCAL ONLY: existing Beast source synthetic panel UI fixture. No paid calls. */
import fs from 'node:fs';
Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://127.0.0.1:27019',MONGODB_DB_NAME:'vireo_recovery_qualification'});
const f=JSON.parse(fs.readFileSync('/tmp/vireo-local-restore/beast-aligned-fixture.json','utf8'));
const {getMongoDb,closeMongo}=await import('../../src/db/mongoClient.js');
const db=await getMongoDb();try{
 const p=await db.collection('editor_projects').findOne({id:f.editor_id});if(!p)throw Error('missing fixture');
 for(const t of p.tracks)if(t.type==='VIDEO')for(const i of t.items){delete i.framing_window;delete i.crop;i.panels={layout:'gameplay',slots:[{focusX:.35,focusY:.5,scale:1,set:true},{focusX:.7,focusY:.5,scale:1,set:true}]};i.layout_mode='track';i.crop_config={layout_mode:'track',layout_mode_source:'user'};}
 await db.collection('editor_projects').updateOne({id:f.editor_id},{$set:{tracks:p.tracks,'canvas.fit_band':'4:3'}});
}finally{await closeMongo()}
