import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const serverDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),options={};let command=[];
// Linux ownership mirrors the analyzer supervisor: detached process group,
// group kill on every close/error/timeout, then /proc verification before exit.
async function owned(file,args,{env,capture=false,timeout=0}){
 const child=spawn(file,args,{env,cwd:serverDir,detached:true,stdio:capture?['ignore','pipe','pipe']:'inherit',shell:false});
 let output='',error,bytes=0;
 const kill=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')error??=Error('Could not stop owned process group.');}};
 const stop=()=>{error??=Error('Local process interrupted.');kill();};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 const timer=timeout?setTimeout(()=>{error??=Error('Local detector probe exceeded its 8-second budget.');kill();},timeout):null;
 if(capture){
  child.stdout.on('data',b=>{bytes+=b.length;if(bytes>16384){error??=Error('Probe output limit exceeded.');kill();}else output+=b;});
  child.stderr.on('data',b=>{bytes+=b.length;if(bytes>16384){error??=Error('Probe output limit exceeded.');kill();}});
 }
 child.on('error',()=>{error??=Error('Local process could not start.');});
 const code=await new Promise(resolve=>child.once('close',resolve));
 if(timer)clearTimeout(timer);kill();
 try{
  if(child.pid){
   const deadline=Date.now()+1500;
   while(true){
    let running=false;
    for(const name of fs.readdirSync('/proc')){
     if(!/^\d+$/.test(name))continue;
     try{const stat=fs.readFileSync('/proc/'+name+'/stat','utf8');const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');if(Number(fields[2])===child.pid&&!['Z','X'].includes(fields[0])){running=true;break;}}
     catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}
    }
    if(!running)break;
    if(Date.now()>=deadline)throw Error('Owned process group exit could not be verified.');
    await new Promise(r=>setTimeout(r,10));
   }
  }
 }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
 if(error)throw error;
 return {code,output};
}
try{
 if(process.platform!=='linux')throw Error('This bounded local launcher requires Linux process-group supervision.');
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--'){command=args.slice(i+1);break;}
  if(arg==='--check'){options.check=true;continue;}
  if(!['--python','--person-model','--face-model'].includes(arg)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Use --python PATH --person-model PATH --face-model PATH, then --check or -- COMMAND [ARGS].');
  if(options[arg])throw Error('Duplicate option.');options[arg]=args[++i];
 }
 if(Boolean(options.check)===Boolean(command.length))throw Error('Select either --check or -- COMMAND [ARGS].');
 for(const name of ['--python','--person-model','--face-model']){
  if(!options[name]||!fs.existsSync(options[name])||!fs.statSync(options[name]).isFile())throw Error('Provide existing local Python, NanoDet and YuNet files. No models are downloaded.');
 }
 const env={...process.env,PYTHON_PATH:path.resolve(options['--python']),SMART_REFRAME_PERSON_MODEL:path.resolve(options['--person-model']),SMART_REFRAME_YUNET_MODEL:path.resolve(options['--face-model']),SMART_REFRAME_ENABLED:'true',REFRAME_AUTO_GENERATE:'true'};
 const probe=await owned(env.PYTHON_PATH,[path.join(serverDir,'python/reframe_runtime_probe.py')],{env,capture:true,timeout:8000});
 if(probe.code!==0)throw Error('Local detector probe failed. App not launched.');
 const result=JSON.parse(probe.output);
 if(result.available!==true||result.face?.kind!=='yunet'||result.face?.status!=='available'||result.person?.status!=='available')throw Error('Local face/person detectors unavailable. App not launched. Check dependencies, NanoDet checksum and model compatibility.');
 console.log('Local CV enabled for this process only. NanoDet checksum and blank inference passed; YuNet blank inference passed. No accuracy or crop-safety guarantee.');
 if(!options.check){const app=await owned(command[0],command.slice(1),{env});process.exitCode=app.code??1;}
}catch(error){
 console.error(error instanceof SyntaxError?'Invalid local detector probe response.':error.message);
 console.error('Local CV command failed. Supply existing --python PATH --person-model PATH --face-model PATH and either --check or -- COMMAND [ARGS]. No persistent settings changed or models downloaded.');
 process.exitCode=1;
}
