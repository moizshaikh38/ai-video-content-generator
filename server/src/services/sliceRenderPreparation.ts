/** Qualification-only execution of a staged plan. Normal exports select this
 * only through an explicit, disabled-by-default qualification flag. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import ffmpegStatic from 'ffmpeg-static';
import type {CompiledRenderGraph} from './proEditorService.js';import {buildSliceRenderStaging} from './sliceRenderStaging.js';
export interface SlicePreparationOptions {parentDirectory?:string;timeoutMs?:number;maxDiskBytes?:number;maxRssKiB?:number;ffmpegPath?:string}
export interface PreparedSliceRender {finalGraph:CompiledRenderGraph;directory:string;peakRssKiB:number;intermediateBytes:number;cleanup:()=>void}
export async function prepareSliceRender(graph:CompiledRenderGraph,options:SlicePreparationOptions={}):Promise<PreparedSliceRender|null>{
 const count=graph.sliceStaging?.stages.length||0;
 if(!buildSliceRenderStaging(graph,Array.from({length:count},(_,i)=>`/qualification-only/slice-${i}.nut`)))return null;
 const timeoutMs=options.timeoutMs??60000,maxDiskBytes=options.maxDiskBytes??256*1024*1024,maxRssKiB=options.maxRssKiB??420000;
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>120000||!Number.isSafeInteger(maxDiskBytes)||maxDiskBytes<1||maxDiskBytes>512*1024*1024||!Number.isSafeInteger(maxRssKiB)||maxRssKiB<1||maxRssKiB>500000)throw Error('Invalid offline slice preparation limits.');
 const directory=fs.mkdtempSync(path.join(options.parentDirectory||os.tmpdir(),'vireo-slices-'));
 const cleanup=()=>fs.rmSync(directory,{recursive:true,force:true});
 let peakRssKiB=0,intermediateBytes=0;const deadline=Date.now()+timeoutMs;
 try{
  const plan=buildSliceRenderStaging(graph,Array.from({length:count},(_,i)=>path.join(directory,`slice-${i}.nut`)))!;
  for(const stage of plan.stages){
   const remaining=deadline-Date.now();if(remaining<=0)throw Error('Slice preparation deadline exceeded.');
   await new Promise<void>((resolve,reject)=>{
    const child=spawn(options.ffmpegPath||(ffmpegStatic as unknown as string),['-y','-nostdin','-v','error','-filter_complex_threads','1',...stage.inputArgs,'-filter_complex',stage.filterComplex.join(';'),'-map',stage.videoMap,'-map',stage.audioMap,...stage.codecArgs,stage.outputPath],{stdio:['ignore','ignore','pipe']});
    let detail='',failure:Error|undefined;const stop=(message:string)=>{failure??=Error(message);child.kill('SIGKILL');};
    child.stderr.on('data',buffer=>{detail=(detail+String(buffer)).slice(-16384);});
    const timer=setTimeout(()=>stop('Slice preparation deadline exceeded.'),remaining);
    const check=()=>{
     try{
      intermediateBytes=fs.readdirSync(directory).reduce((sum,name)=>sum+fs.statSync(path.join(directory,name)).size,0);
      if(intermediateBytes>maxDiskBytes)stop('Slice preparation temporary disk limit exceeded.');
      if(child.pid){const status=fs.readFileSync(`/proc/${child.pid}/status`,'utf8');const rss=Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]||0);peakRssKiB=Math.max(peakRssKiB,rss);if(rss>maxRssKiB)stop('Slice preparation memory safety limit exceeded.');}
     }catch(error:any){if(error.code!=='ENOENT')stop('Slice preparation resource check failed.');}
    };
    const monitor=setInterval(check,50);
    child.once('error',error=>{failure??=error;});
    child.once('close',code=>{clearTimeout(timer);clearInterval(monitor);check();if(failure)reject(failure);else if(code!==0)reject(Error(`Slice preparation FFmpeg failed (${code}): ${detail}`));else resolve();});
   });
   if(!fs.statSync(stage.outputPath).size)throw Error('Slice preparation produced an empty intermediate.');
  }
  return {finalGraph:plan.finalGraph,directory,peakRssKiB,intermediateBytes,cleanup};
 }catch(error){cleanup();throw error;}
}
