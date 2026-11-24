/** Current automatic shot compositor normalizes its internal concat to this rate. */
export const AUTOMATIC_SHOT_FPS=30;
/** ASS cannot represent sub-centiseconds. Resolve a picture boundary no later
 * than its first new frame. Speed/output conversion happens after shot concat. */
export function automaticShotCaptionCut(sourceOffset:number,timelineStart:number,speed:number,outputFps=AUTOMATIC_SHOT_FPS){
 const sourceTick=Math.round(sourceOffset*AUTOMATIC_SHOT_FPS)/AUTOMATIC_SHOT_FPS;
 const outputTick=Math.round(sourceTick/speed*outputFps)/outputFps;
 return Math.floor((timelineStart+outputTick)*100+1e-7)/100;
}
/** Live Auto selection uses the same two-stage source/output frame clock as
 * the picture compositor. Return source-relative seconds for existing callers;
 * manual layouts keep their independent source-time selection. */
export function automaticShotPreviewTime(plan:Array<{start:number;end:number}>,sourceTime:number,sourceStart:number,timelineStart:number,playhead:number,speed:number,clipStart:number,outputFps=AUTOMATIC_SHOT_FPS):number {
 if(sourceStart<clipStart)return sourceTime-clipStart;
 const start=sourceStart-clipStart;
 const frameTime=(offset:number)=>Math.round(Math.round(offset*AUTOMATIC_SHOT_FPS)/AUTOMATIC_SHOT_FPS/speed*outputFps)/outputFps;
 const elapsed=playhead-timelineStart;
 const shot=plan.find(s=>elapsed>=frameTime(Math.max(start,s.start)-start)-1e-7&&elapsed<frameTime(s.end-start)-1e-7);
 return shot?Math.min(shot.end-1e-6,Math.max(start,shot.start)+Math.max(0,elapsed-frameTime(Math.max(start,shot.start)-start))*speed+1e-6):sourceTime-clipStart;
}
