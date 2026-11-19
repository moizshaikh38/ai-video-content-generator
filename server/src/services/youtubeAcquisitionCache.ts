import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/** Original exact-acquisition reuse. Not an audio-first or arbitrary range assembler.
 * Call only AFTER a fresh metadata admission check; unavailable admission is a miss.
 * User, video, exact source interval, and acquisition profile must all match.
 */
export interface YouTubeAcquisitionKey {userId:string;videoId:string;startSec?:number;endSec?:number;profile:string}
interface Receipt {version:1;key:string;sha256:string;bytes:number;createdAt:number;contentType:string}
const HOUR=60*60*1000, MAX_ENTRY=32*1024*1024, FLOOR=1024*1024*1024;
export class YouTubeAcquisitionCache {
 constructor(private root=path.join(os.tmpdir(),'vireo-youtube-acquisitions-v1'),private now=()=>Date.now()){}
 private key(input:YouTubeAcquisitionKey):string|null {
  if(!input.userId||input.userId.length>200||!/^[A-Za-z0-9_-]{11}$/.test(input.videoId)||!input.profile||input.profile.length>1000)return null;
  if(input.startSec!==undefined&&(!Number.isFinite(input.startSec)||input.startSec<0))return null;
  if(input.endSec!==undefined&&(!Number.isFinite(input.endSec)||input.endSec<=(input.startSec??0)))return null;
  return crypto.createHash('sha256').update(JSON.stringify([input.userId,input.videoId,input.startSec??null,input.endSec??null,input.profile])).digest('hex');
 }
 private async digest(file:string):Promise<string>{const h=crypto.createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
 private async regular(file:string){const s=await fs.lstat(file);return s.isFile()&&!s.isSymbolicLink()?s:null;}
 private async space(bytes:number){const s=await fs.statfs(os.tmpdir());return Number(s.bavail)*Number(s.bsize)>=FLOOR+bytes;}
 private async safeRoot(){await fs.mkdir(this.root,{recursive:true,mode:0o700});const s=await fs.lstat(this.root);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Invalid acquisition cache root');}
 async take(input:YouTubeAcquisitionKey,freshAdmission:boolean,maxBytes:number):Promise<{tempFilePath:string;totalBytes:number;contentType:string}|null>{
  const key=this.key(input);if(!key||!freshAdmission||!(maxBytes>0))return null;
  let tmp:string|undefined;
  try{
   const root=await fs.lstat(this.root);if(!root.isDirectory()||root.isSymbolicLink())return null;
   const dir=path.join(this.root,key),sdir=await fs.lstat(dir);if(!sdir.isDirectory()||sdir.isSymbolicLink())return null;
   const receipt=path.join(dir,'receipt.json'),file=path.join(dir,'source.mp4');const rs=await this.regular(receipt);if(!rs||rs.size>2048)return null;
   const r=JSON.parse(await fs.readFile(receipt,'utf8')) as Receipt;const age=this.now()-r.createdAt;
   if(r.version!==1||r.key!==key||!Number.isFinite(r.createdAt)||age<0||age>HOUR||!Number.isInteger(r.bytes)||r.bytes<=0||r.bytes>Math.min(maxBytes,MAX_ENTRY)||r.contentType!=='video/mp4'||!/^[a-f0-9]{64}$/.test(r.sha256))return null;
   const s=await this.regular(file);if(!s||s.size!==r.bytes||await this.digest(file)!==r.sha256||!await this.space(r.bytes))return null;
   // Caller owns only this private copy. Shared cache files are never returned.
   tmp=path.join(os.tmpdir(),'yt-reused-'+crypto.randomUUID()+'.mp4');await fs.copyFile(file,tmp,fs.constants.COPYFILE_EXCL);await fs.chmod(tmp,0o600);
   if(await this.digest(tmp)!==r.sha256)throw new Error('Acquisition copy changed');
   return {tempFilePath:tmp,totalBytes:r.bytes,contentType:'video/mp4'};
  }catch{if(tmp)await fs.unlink(tmp).catch(()=>{});return null;}
 }
 async put(input:YouTubeAcquisitionKey,file:string,freshAdmission:boolean,contentType:string):Promise<boolean>{
  const key=this.key(input);if(!key||!freshAdmission||contentType!=='video/mp4')return false;
  let stage:string|undefined,lock:string|undefined;
  try{
   const s=await this.regular(file);if(!s||s.size<=0||s.size>MAX_ENTRY||!await this.space(s.size))return false;
   await this.safeRoot();
   // Cross-process admission lock. Contention/stale lock is a cache miss, never bypassed.
   const lockPath=path.join(this.root,'.write-lock');await fs.mkdir(lockPath,{mode:0o700});lock=lockPath;
   await this.prune();
   // Fixed total footprint: at most four small completed acquisitions globally.
   const entries=(await fs.readdir(this.root,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^[a-f0-9]{64}$/.test(e.name));
   if(entries.length>=4)return false;
   const dest=path.join(this.root,key);try{await fs.lstat(dest);return false;}catch(e:any){if(e.code!=='ENOENT')throw e;}
   stage=await fs.mkdtemp(path.join(this.root,'.stage-'));await fs.chmod(stage,0o700);const copy=path.join(stage,'source.mp4');await fs.copyFile(file,copy,fs.constants.COPYFILE_EXCL);await fs.chmod(copy,0o600);
   const sha256=await this.digest(copy);if(await this.digest(file)!==sha256)throw new Error('Acquisition changed while saving');
   const r:Receipt={version:1,key,sha256,bytes:s.size,createdAt:this.now(),contentType:'video/mp4'};await fs.writeFile(path.join(stage,'receipt.json'),JSON.stringify(r),{mode:0o600,flag:'wx'});await fs.rename(stage,dest);stage=undefined;return true;
  }catch{return false;}finally{if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});if(lock)await fs.rmdir(lock).catch(()=>{});}
 }
 async prune(){
  try{for(const e of await fs.readdir(this.root,{withFileTypes:true})){
   if(!e.isDirectory()||!/^[a-f0-9]{64}$/.test(e.name))continue;
   const dir=path.join(this.root,e.name);const s=await fs.lstat(dir);if(s.isSymbolicLink())continue;
   // Receipt timestamp is not trusted for deletion outside this cache namespace.
   if(this.now()-s.mtimeMs>HOUR)await fs.rm(dir,{recursive:true,force:true});
  }}catch{/* Optional reuse cannot prevent ordinary acquisition. */}
 }
}
export const youtubeAcquisitionCache=new YouTubeAcquisitionCache();
