/** Current automatic shot compositor normalizes its internal concat to this rate. */
export const AUTOMATIC_SHOT_FPS=30;
/** ASS cannot represent sub-centiseconds. Resolve a picture boundary no later
 * than its first new frame. Speed/output conversion happens after shot concat. */
export function automaticShotCaptionCut(sourceOffset:number,timelineStart:number,speed:number,outputFps=AUTOMATIC_SHOT_FPS){
 const sourceTick=Math.round(sourceOffset*AUTOMATIC_SHOT_FPS)/AUTOMATIC_SHOT_FPS;
 const outputTick=Math.round(sourceTick/speed*outputFps)/outputFps;
 return Math.floor((timelineStart+outputTick)*100+1e-7)/100;
}
