/** A supervisor timeout stops waiting, not the underlying schema operation.
 * Reuse that attempt until it settles, rather than starting overlapping writers. */
export class DatabaseBootstrapAttempt {
 private attempt:Promise<void>|null=null;
 constructor(private readonly bootstrap:()=>Promise<void>){}
 async wait(timeoutMs:number):Promise<void>{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw Error('Bootstrap wait deadline must be a positive integer');
  if(!this.attempt){
   const attempt=Promise.resolve().then(this.bootstrap);
   this.attempt=attempt;
   // A real failure may retry. A supervisor timeout must not clear ownership.
   void attempt.catch(()=>{if(this.attempt===attempt)this.attempt=null;});
  }
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([
   this.attempt,
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(`MongoDB bootstrap wait timeout (${timeoutMs}ms); underlying attempt remains owned`)),timeoutMs);}),
  ]);}finally{if(timer)clearTimeout(timer);}
 }
}
