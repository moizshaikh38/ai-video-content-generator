/** Bounded integration baseline, explicit alternate media and isolated local DB.
 * No production connectivity, live provider or historical-asset equivalence. */
import fs from'node:fs';import path from'node:path';import os from'node:os';import crypto from'node:crypto';import{spawnSync}from'node:child_process';
const source=process.env.VIREO_QUALIFICATION_MEDIA;if(!source||!fs.existsSync(source))throw Error('Set VIREO_QUALIFICATION_MEDIA to an explicit existing local source.');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-cleanclip-baseline-')),media=path.join(dir,'explicit-alternate.mp4');fs.copyFileSync(source,media);
const sha256=crypto.createHash('sha256').update(fs.readFileSync(media)).digest('hex');
const out=process.env.VIREO_BASELINE_RESULTS;if(!out)throw Error('Set VIREO_BASELINE_RESULTS to a new local evidence directory.');if(fs.existsSync(out))throw Error('Use a fresh evidence directory, not an earlier run.');fs.mkdirSync(out,{recursive:true});
const tests=['audioSidechainAssetGuard','phase4EditorAssetSecurity','hookRegeneration','audioPipelineUpgrade','phase20AudioStudio','phase24HookLab'].map(n=>'src/tests/'+n+'.test.ts');
const env={...process.env,NODE_ENV:'test',MONGODB_URI:'mongodb://127.0.0.1:27019',MONGODB_DB_NAME:'vireo_cleanclip_baseline_'+crypto.randomUUID().replaceAll('-',''),SUPABASE_URL:'http://127.0.0.1:5998',SUPABASE_SECRET_KEY:'isolated-fixture-not-real',OPENROUTER_API_KEY:'',GROQ_API_KEY:'',OPENAI_API_KEY:'',VIREO_QUALIFICATION_MEDIA:media,VIREO_QUALIFICATION_OUTPUT:path.join(out,'bounded-normalized.mp4')};
// Real test auth remains stubbed in-process, with the normal middleware intact.
const git=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();const started=new Date().toISOString();
const r=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=1',...tests],{env,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
fs.writeFileSync(path.join(out,'tests.log'),r.stdout+'\n'+r.stderr);const counts=Object.fromEntries([...r.stdout.matchAll(/^# (tests|pass|fail|cancelled|skipped) (\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({git,started,finished:new Date().toISOString(),media:{explicitAlternateSource:source,sha256,copy:media},database:env.MONGODB_DB_NAME,tests,counts,exitCode:r.status,signal:r.signal,error:r.error?.message,scope:'Local integration mechanics with mocked auth/provider inputs. Missing historical launch source not recovered. HookLab transcript/pack synthetic, no STT or editorial-quality proof. Real normalization2.5s render is bounded, not performance/4K qualification.'},null,2));console.log(JSON.stringify({out,counts,exitCode:r.status}));process.exitCode=r.status??1;
