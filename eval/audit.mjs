import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const METRICS=['selectionHitRate','cleanBoundaryRate','targetCoverage','speakerCropCorrectness','jitter','layoutFlickerCount','captionAccuracy','qaPassRate','timeToResultSeconds'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const text=x=>typeof x==='string'&&x.trim().length>0;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const url=x=>{if(!text(x))return false;try{return ['https:','http:'].includes(new URL(x).protocol)}catch{return false}};
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function auditManifest(manifest,{verifyFiles=false,root=process.cwd()}={}){
 const errors=[],seen=new Set(),hashes=new Set(),groups=new Map(),admitted=[];
 if(!record(manifest)||manifest?.schemaVersion!==1||manifest?.splitPolicy!=='source-group-disjoint-frozen-before-tuning'||!Array.isArray(manifest?.clips))return {status:'blocked',errors:['Invalid manifest contract'],admittedCount:0,devCount:0,holdoutCount:0,sourceGroups:0,qualityPass:false,metrics:METRICS.map(name=>({name,status:'not-measured',value:null}))};
 for(const c of manifest.clips){
  const before=errors.length,id=c?.id||'missing-id';
  if(!record(c)||!text(c.id)||seen.has(c.id))errors.push(id+': missing/duplicate ID');seen.add(c?.id);
  if(c?.kind!=='real-source'||!hash(c?.sha256)||!text(c?.sourceGroup)||!['dev','holdout'].includes(c?.split))errors.push(id+': real source/hash/group/split required');
  if(!record(c?.origin)||!url(c.origin.url)||!record(c?.rights)||!text(c.rights.basis)||!text(c.rights.evidence)||c.rights.verified!==true)errors.push(id+': source-specific rights evidence unverified');
  if(!Number.isFinite(c?.durationSeconds)||c.durationSeconds<=0||!['podcast','talking_head','gaming_facecam','gaming_no_facecam','screen_share','sports','comedy','lecture_news'].includes(c?.genre)||!['en','hi','hi-en','other'].includes(c?.language))errors.push(id+': duration/genre/language unverified');
  if(c?.split==='holdout'&&(c?.exposure!=='sealed-unseen'||!text(c?.sealedAt)||!Number.isFinite(Date.parse(c.sealedAt))||!text(c?.custodian)||c?.usedForTuning!==false))errors.push(id+': holdout must be sealed unseen before tuning');
  if(c?.split==='dev'&&c?.exposure!=='exposed-dev')errors.push(id+': dev exposure must be explicit');
  if(hash(c?.sha256)){if(hashes.has(c.sha256))errors.push(id+': duplicate source bytes');hashes.add(c.sha256);}
  if(c?.sourceGroup){const prior=groups.get(c.sourceGroup);if(prior&&prior!==c.split)errors.push(id+': source-group leakage across splits');groups.set(c.sourceGroup,c.split);}
  for(const key of ['sourceReferenceSha256','selectionReferenceSha256','visualReferenceSha256','captionReferenceSha256'])if(!record(c?.references)||!hash(c.references[key]))errors.push(id+': missing '+key);
  if(verifyFiles){if(!text(c?.path))errors.push(id+': local source unavailable');else {try{const p=path.resolve(root,c.path);if(sha(fs.readFileSync(p))!==c.sha256)errors.push(id+': source byte hash mismatch')}catch{errors.push(id+': source unreadable')}}}
  if(errors.length===before)admitted.push(c);
 }
 const dev=admitted.filter(c=>c.split==='dev').length,holdout=admitted.filter(c=>c.split==='holdout').length;
 if(admitted.length<20)errors.push('Need at least20admitted real source clips');
 if(!holdout||holdout/admitted.length<.2||holdout/admitted.length>.4)errors.push('Need frozen holdout approximately30percent');
 for(const tag of ['podcast','talking_head','gaming_facecam','gaming_no_facecam','screen_share','sports','comedy','lecture_news'])if(!admitted.some(c=>c.genre===tag))errors.push('Missing coverage: '+tag);
 if(!admitted.some(c=>['hi','hi-en'].includes(c.language)))errors.push('Hindi/Hinglish coverage absent');
 return {status:errors.length?'blocked':'admission-ready-baseline-not-measured',errors,admittedCount:admitted.length,devCount:dev,holdoutCount:holdout,sourceGroups:new Set(admitted.map(c=>c.sourceGroup)).size,metrics:METRICS.map(name=>({name,status:'not-measured',value:null})),qualityPass:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=process.argv[2]||fileURLToPath(new URL('./manifest.json',import.meta.url));
 try{const report=auditManifest(JSON.parse(fs.readFileSync(input,'utf8')),{verifyFiles:true,root:path.dirname(input)});console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='blocked'?2:0}catch(error){console.error('Evaluation admission failed: '+error.message);process.exitCode=2}
}
