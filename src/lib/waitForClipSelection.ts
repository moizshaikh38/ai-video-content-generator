/** A saved async selection is submitted once. Every continuation is a GET;
 * uncertainty never causes a second generation request. No UI/timer ownership. */
export async function waitForClipSelection<T extends{projectId:string;candidates:any[];selectionJobId?:string;selectionStatus?:string;queued?:boolean}>(initial:T,projectId:string,read:(jobId:string)=>Promise<T>,options:{sleep?:(ms:number)=>Promise<void>;maxReads?:number}={}):Promise<T>{
 if(!initial.queued)return initial;
 const jobId=initial.selectionJobId;if(!jobId||initial.projectId!==projectId)throw Error('Saved selection request could not be verified. No new generation was started.');
 const sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 for(let i=0;i<(options.maxReads??240);i++){
  await sleep(2500);const data=await read(jobId);
  if(data.projectId!==projectId||data.selectionJobId!==jobId)throw Error('Saved selection response did not match this request. No new generation was started.');
  if(data.selectionStatus==='completed'){if(!Array.isArray(data.candidates))throw Error('Saved clip candidates could not be loaded.');return data;}
  if(['failed','review_required','cancelled'].includes(data.selectionStatus||''))throw Error('Saved clip selection stopped or needs review. Your source is saved. No new generation was started.');
  if(!['queued','processing'].includes(data.selectionStatus||''))throw Error('Saved clip selection status is unknown. Reload to check the saved request; no new generation was started.');
 }
 throw Error('Clip selection is still saved on the server. Reopen this project to check it; no new generation was started.');
}
