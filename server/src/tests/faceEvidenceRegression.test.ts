import fs from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SmartReframeService as S} from '../services/smartReframeService.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/faceEvidenceMeasurements.json',import.meta.url),'utf8'));
test('source-inspected latch regressions stay unknown despite score, valid landmarks and persistence',()=>{
 const latch=fixture.rows.filter((r:any)=>r.label.description==='door latch');assert.equal(latch.length,3);
 for(const row of latch){assert.equal(row.diagnostic,'plausible-topology');const e=row.face_evidence,[x,y,w,h]=row.rect;const f=S.validateDetection({x:x/e.source_width,y:y/e.source_height,width:w/e.source_width,height:h/e.source_height,confidence:.79,mouth_score:.168,face_evidence:e})!;assert.ok(f);assert.equal(f.face_evidence!.verification.state,'unknown');assert.equal(f.face_evidence!.landmarks!.length,5);}
});
test('source-separated samples demonstrate why topology must not authorize rejection or verification',()=>{
 const rows=fixture.rows;assert.equal(rows.filter((r:any)=>r.split==='development'&&r.label.label==='real-face'&&r.diagnostic==='suspicious').length,1);
 assert.equal(rows.filter((r:any)=>r.split==='held-out'&&r.label.label==='nonface'&&r.diagnostic==='plausible-topology').length,4);
 for(const r of rows)assert.equal(r.face_evidence.verification.state,'unknown');
});
