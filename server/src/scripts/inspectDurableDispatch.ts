import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {inspectDurableDispatch} from '../services/durableDispatchInspectionService.js';
import {getMongoDb,closeMongo} from '../db/mongoClient.js';
/** Operator-only read. No HTTP route, discovery scan, mutation or recovery. */
export async function runDispatchInspection(args:string[]):Promise<void>{
 const values:Record<string,string>={};
 if(args.length!==8)throw Error('INVALID_INSPECTION_ARGUMENTS');
 for(let i=0;i<args.length;i+=2){const name=args[i];if(!['--stage','--owner','--project','--job-key'].includes(name)||values[name]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('INVALID_INSPECTION_ARGUMENTS');values[name]=args[i+1];}
 if(!['core','selection'].includes(values['--stage'])||!/^[a-f0-9]{64}$/.test(values['--job-key']))throw Error('INVALID_INSPECTION_ARGUMENTS');
 try{const result=await inspectDurableDispatch(await getMongoDb(),{stage:values['--stage'] as 'core'|'selection',userId:values['--owner'],projectId:values['--project'],jobKey:values['--job-key']});console.log(JSON.stringify(result));}finally{await closeMongo();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runDispatchInspection(process.argv.slice(2)).catch(()=>{
  // Database errors can include connection strings, source data or credentials.
  // Never print the original exception or echo caller arguments.
  console.error('Dispatch inspection failed. Check exact arguments and database access. No recovery was performed.');process.exitCode=1;
 });
}
