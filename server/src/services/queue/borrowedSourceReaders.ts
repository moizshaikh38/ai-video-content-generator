/** Tracks only borrowed-source reads, not later uploads/provider/DB work.
 * Register before starting background work. Close before removing its source.
 * Unknown child exit permanently quarantines this source; elapsed time is not proof. */
export class BorrowedSourceReaders {
 private pending=new Set<Promise<void>>();private closed=false;private unsafe=false;
 read<T>(work:()=>Promise<T>):Promise<T>{
  if(this.closed)return Promise.reject(Object.assign(Error('Source reader registration is closed.'),{code:'SOURCE_READERS_CLOSED'}));
  const result=Promise.resolve().then(work);
  const settled=result.then(()=>{},(error:unknown)=>{if((error as {code?:string})?.code==='PROCESS_STOP_UNVERIFIED')this.unsafe=true;});
  this.pending.add(settled);void settled.then(()=>this.pending.delete(settled));
  return result;
 }
 async closeAndWait():Promise<boolean>{this.closed=true;await Promise.all([...this.pending]);return !this.unsafe;}
}
