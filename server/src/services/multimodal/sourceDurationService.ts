import {measuredMultimodalDuration} from '../../shared/measuredMultimodalDuration.js';
import {supervisedExecFile} from '../queue/supervisedExecFile.js';
import ffprobeStatic from 'ffprobe-static';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const execute=promisify(execFile);
/** Bounded metadata-only probe of the exact local source used by this pass. */
export async function probeMultimodalSourceDuration(sourcePath:string):Promise<number>{
 const binary=typeof process.env.FFPROBE_PATH==='string'&&process.env.FFPROBE_PATH?process.env.FFPROBE_PATH:(ffprobeStatic as any)?.path||'ffprobe';
 const args=['-v','error','-show_entries','stream=codec_type,duration,duration_ts,time_base,start_time:stream_disposition=attached_pic:stream_tags=DURATION:format=format_name','-of','json',sourcePath];
 const result=process.platform==='linux'?await supervisedExecFile(binary,args,{timeoutMs:10000,maxBuffer:64000}):await execute(binary,args,{timeout:10000,maxBuffer:64000});
 return measuredMultimodalDuration(JSON.parse(String(result.stdout)));
}
