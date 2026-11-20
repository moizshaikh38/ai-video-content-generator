import fs from 'node:fs';
import {AppError} from '../types/index.js';
import {pinnedPublicMediaFetch} from '../utils/pinnedHttpsAssetFetch.js';
import {driveDownloadConfirmation,type CloudVideoSource} from '../shared/cloudVideoSource.js';
/** No ambient credentials. Each redirect is DNS-pinned by the owning downloader.
 * Public-file confirmation is bounded and never accepts arbitrary form actions. */
export async function downloadCloudVideo(source:CloudVideoSource,maxBytes:number,download:(url:string,max:number)=>Promise<{tempFilePath:string;totalBytes:number;contentType:string}>){
 const first=await download(source.downloadUrl,maxBytes);
 const html=/text\/html|application\/xhtml/i.test(first.contentType);
 if(!html)return first;
 let next:string|null=null;try{const st=fs.statSync(first.tempFilePath);if(st.size<=1024*1024)next=driveDownloadConfirmation(fs.readFileSync(first.tempFilePath,'utf8'),source)}finally{fs.rmSync(first.tempFilePath,{force:true})}
 if(!next)throw new AppError('This file is not publicly downloadable. Check share permissions and download access, or upload the video file.',403,'CLOUD_VIDEO_ACCESS_REQUIRED');
 const final=await download(next,maxBytes);if(/text\/html|application\/xhtml/i.test(final.contentType)){fs.rmSync(final.tempFilePath,{force:true});throw new AppError('Google Drive did not provide downloadable video. Check permissions, quota and download restrictions.',403,'CLOUD_VIDEO_ACCESS_REQUIRED')}return final;
}
export async function probeCloudVideo(source:CloudVideoSource){
 const response=await pinnedPublicMediaFetch(source.downloadUrl,AbortSignal.timeout(8000),{method:'HEAD',httpsOnly:true});
 const contentLength=Number(response.headers.get('content-length'))||undefined,contentType=response.headers.get('content-type')||undefined;await response.body?.cancel();
 // HEAD may redirect or lack public metadata. Import remains the proof of access.
 return{provider:source.provider,normalizedUrl:source.normalizedUrl,title:source.provider==='google_drive'?'Google Drive video':'Dropbox video',...(response.ok?{contentLength,contentType}:{})};
}
