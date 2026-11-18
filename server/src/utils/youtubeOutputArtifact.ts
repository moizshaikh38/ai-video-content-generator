import fs from 'node:fs';import path from 'node:path';import {AppError}from '../types/index.js';
const CONTAINERS:Record<string,string>={mp4:'video/mp4',mkv:'video/x-matroska',webm:'video/webm',mov:'video/quicktime'};
/** Select only the completed merge target. Fragment/sidecar/partial files are not
 * a successful source even when the downloader exits zero. ffprobe is still required. */
export function resolveYouTubeOutputArtifact(directory:string,uniqueId:string):{tempFilePath:string;contentType:string}{
 const candidates=Object.entries(CONTAINERS).flatMap(([ext,contentType])=>{
  const tempFilePath=path.join(directory,`${uniqueId}.${ext}`);
  try{const st=fs.lstatSync(tempFilePath);return st.isFile()&&!st.isSymbolicLink()?[{tempFilePath,contentType}]:[];}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
 });
 const mp4=candidates.find(c=>c.contentType==='video/mp4');
 if(mp4)return mp4;
 if(candidates.length===1)return candidates[0];
 throw new AppError(candidates.length?'The downloader produced ambiguous final video files. Import stopped.':'Downloaded YouTube video file was not generated.',502,'YOUTUBE_DOWNLOAD_FAILED');
}
