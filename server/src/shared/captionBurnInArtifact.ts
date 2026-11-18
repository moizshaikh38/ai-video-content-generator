import fs from'node:fs';import{AppError}from'../types/index.js';
export interface CaptionBurnInArtifact{cues:unknown[];assContent:string}
/** An empty, successfully generated interval is valid. Nonempty requested
 * captions must have the exact generated ASS on disk before encoding starts. */
export function verifiedCaptionAssPath(result:CaptionBurnInArtifact,filePath:string):string|null{
 if(!Array.isArray(result.cues))throw new AppError('Caption generation returned an invalid cue result.',500,'CAPTION_OUTPUT_INVALID');
 if(result.cues.length===0)return null;
 if(!result.assContent||!/^Dialogue:/m.test(result.assContent))throw new AppError('Caption generation returned no subtitle dialogue for the requested cues.',500,'CAPTION_OUTPUT_INVALID');
 let content:string;
 try{const stat=fs.statSync(filePath);if(!stat.isFile()||stat.size===0)throw new Error('No subtitle file');content=fs.readFileSync(filePath,'utf8');}catch{throw new AppError('The requested subtitle file is missing or unreadable. Export was stopped.',500,'CAPTION_OUTPUT_MISSING');}
 if(content!==result.assContent)throw new AppError('The subtitle file does not match the generated captions. Export was stopped.',500,'CAPTION_OUTPUT_MISMATCH');
 return filePath;
}
