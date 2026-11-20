import fs from 'node:fs/promises';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import {supervisedExecFile} from './queue/supervisedExecFile.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseSubtitleOcrTsv, sourceSubtitleReviewInputSupported, timedSourceSubtitleSamples, type SourceSubtitleOcrSample, type SubtitleOcrFrame } from '../shared/subtitleOcrEvidence.js';
const execFileAsync = promisify(execFile);

export interface BurnedSubtitleAnalysisResult {
  /** Suspected lower-band source text, not semantic subtitle verification. Never auto-remove captions. */
  hasBurnedSubtitles: boolean;
  status: 'suspected-source-text' | 'not-observed' | 'unavailable';
  sampledFrames: number;
  analyzedFrames: number;
  bandHeightRatio: number; // e.g., 0.12 (12% of frame height)
  confidence: number;      // 0.0 to 1.0
  recommendedCropFilter?: string; // e.g. "crop=iw:ih*(1-0.12):0:0"
  reason: string;
  samples?: SourceSubtitleOcrSample[];
}

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SafeZoneProfile {
  topInsetPercent: number;    // default 12%
  bottomInsetPercent: number; // default 20%
  rightInsetPercent: number;  // default 15%
  leftInsetPercent: number;   // default 4%
}

export const DEFAULT_MOBILE_SAFE_ZONE: SafeZoneProfile = {
  topInsetPercent: 0.12,
  bottomInsetPercent: 0.20,
  rightInsetPercent: 0.15,
  leftInsetPercent: 0.04,
};

/**
 * Phase 3: Burned-in Subtitle & Safe Placement Service
 * Inspired by OpenShorts (MIT License):
 * Detects hardcoded source subtitles in the bottom band to avoid double-text collisions,
 * positions captions along the seam in split layouts, and dynamically places hook text
 * where it obscures the least face area.
 */
export class BurnedSubtitleService {
  private static reviewBusy = false;
  /** Export review only. Decode existing bytes, never acquire or modify source.
   * Fresh dedicated directory, bounded five stills/20s, sequential single-thread
   * children; callers retain unknown when OCR or the resource budget is absent. */
  public static async reviewVideo(input: {sourcePath:string;start:number;duration:number;sourceSha256:string;tempDirectory:string;sourceWidth?:number;sourceHeight?:number;signal?:AbortSignal}) {
    const unknown:BurnedSubtitleAnalysisResult={hasBurnedSubtitles:false,status:'unavailable',sampledFrames:0,analyzedFrames:0,bandHeightRatio:0,confidence:0,reason:'Source text review unavailable; subtitle presence remains unknown.'};
    const bind=(result:BurnedSubtitleAnalysisResult)=>({...result,sourceSha256:input.sourceSha256,sourceStart:input.start,sourceEnd:input.start+input.duration,semanticVerification:'unknown' as const,captionSettingsChanged:false as const,geometryCoverage:'sparse-positive-only' as const,establishesTextAbsence:false as const,samples:timedSourceSubtitleSamples(result.samples||[],input.start,input.duration)});
    if(!sourceSubtitleReviewInputSupported(input))return bind(unknown);
    if(this.reviewBusy)return bind({...unknown,reason:'Local source text reviewer is busy; subtitle presence remains unknown.'});
    const stat=await fs.statfs(input.tempDirectory);
    if(stat.bavail*stat.bsize<1024**3+20*1024**2)return bind({...unknown,reason:'Source text review skipped to preserve disk margin; subtitle presence remains unknown.'});
    const dir=await fs.mkdtemp(path.join(input.tempDirectory,'subtitle-review-'));
    this.reviewBusy=true;
    let stopVerified=true;
    const deadline=Date.now()+20000;
    const run=async(binary:string,args:string[])=>{
      if(input.signal?.aborted)throw input.signal.reason;
      const timeoutMs=Math.min(2500,deadline-Date.now());if(timeoutMs<=0)throw Error('Review budget exhausted');
      return supervisedExecFile(binary==='tesseract'?'env':binary,binary==='tesseract'?['OMP_THREAD_LIMIT=1',binary,...args]:args,{timeoutMs,maxBuffer:1024*1024,signal:input.signal});
    };
    try{
      const paths:string[]=[];
      for(let i=0;i<5;i++){
        const file=path.join(dir,`sample-${i}.png`);
        await run((ffmpegStatic as unknown as string)||'ffmpeg',['-v','error','-threads','1','-filter_threads','1','-ss',String(input.start+input.duration*(i+.2)/5),'-i',input.sourcePath,'-frames:v','1','-vf','scale=w=min(1280\\,iw):h=-2',file]);
        paths.push(file);
      }
      const result=await this.detectBurnedSubtitles(paths,async(file)=>{
        const {stdout}=await run('tesseract',[file,'stdout','--psm','11','tsv']);
        return parseSubtitleOcrTsv(stdout);
      });
      return bind(result);
    }catch(error:any){
      if(error?.code==='PROCESS_STOP_UNVERIFIED')stopVerified=false;
      if(input.signal?.aborted||['WORK_CANCELLED','PROCESS_STOP_UNVERIFIED','SUPERVISION_UNAVAILABLE'].includes(error?.code))throw error;
      return bind(unknown);
    }finally{if(stopVerified){await fs.rm(dir,{recursive:true,force:true});this.reviewBusy=false;}}
  }

  /** Bounded local OCR, with explicit unknown when unavailable. Geometry only:
   * logos and lower thirds may resemble subtitles. No destructive crop advice.
   * Does not alter caption settings or introduce a provider call. */
  public static async detectBurnedSubtitles(
    framePaths: string[],
    probe: (path: string) => Promise<SubtitleOcrFrame | null> = async (path) => {
      const { stdout } = await execFileAsync('tesseract', [path, 'stdout', '--psm', '11', 'tsv'], {
        timeout: 2500, maxBuffer: 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: '1' },
      });
      return parseSubtitleOcrTsv(stdout);
    },
  ): Promise<BurnedSubtitleAnalysisResult> {
    // Evenly bound caller input; never launch concurrent OCR jobs.
    const paths = Array.isArray(framePaths) ? [...new Set(framePaths.filter(p => typeof p === 'string' && p))].slice(0, 5) : [];
    let analyzedFrames = 0, candidateFrames = 0, minTop = 1;
    const samples:SourceSubtitleOcrSample[]=paths.map((_,sampleIndex)=>({sampleIndex,status:'unavailable',candidateTop:null}));
    for (const [sampleIndex,path] of paths.entries()) {
      try {
        const stat = await fs.stat(path);
        if (!stat.isFile() || stat.size < 24 || stat.size > 12 * 1024 * 1024) continue;
        const frame = await probe(path);
        if (!frame || (frame.candidateTop!==null&&(!Number.isFinite(frame.candidateTop)||frame.candidateTop<.72||frame.candidateTop>=1))) continue;
        samples[sampleIndex]={sampleIndex,status:frame.candidateTop===null?'not-observed':'suspected-source-text',candidateTop:frame.candidateTop};
        analyzedFrames++;
        if (frame.candidateTop !== null) { candidateFrames++; minTop = Math.min(minTop, frame.candidateTop); }
      } catch(error:any) {
        if(['WORK_CANCELLED','PROCESS_STOP_UNVERIFIED','SUPERVISION_UNAVAILABLE'].includes(error?.code))throw error;
        /* Missing OCR binary, timeout and unreadable input remain unknown. */
      }
    }
    const supported = analyzedFrames >= 2;
    const hasBurned = supported && candidateFrames > 0;
    return {
      hasBurnedSubtitles: hasBurned,
      status: !supported ? 'unavailable' : hasBurned ? 'suspected-source-text' : 'not-observed',
      sampledFrames: paths.length, analyzedFrames, samples,
      bandHeightRatio: hasBurned ? Number((1 - minTop).toFixed(4)) : 0,
      // This is sample support, not probability that the text is a subtitle.
      confidence: supported ? candidateFrames / analyzedFrames : 0,
      reason: !supported ? 'Insufficient local OCR evidence; source subtitle presence is unknown.'
        : hasBurned ? 'Lower-band source text observed in one or more samples. Review duplicate captions; text may be a logo or lower third. No automatic crop or caption removal.'
        : 'No repeated lower-band source text observed in these samples. This does not establish that subtitles are absent.',
    };
  }

  /**
   * Computes the vertical hook text coordinate (as a fraction of canvas height 0.0–1.0)
   * that covers the minimum face area while respecting platform safe zones.
   */
  public static computeFaceAwareHookPosition(
    faceBoxes: FaceBoundingBox[],
    candidateYPositions = [0.18, 0.25, 0.50, 0.72],
    safeZone: SafeZoneProfile = DEFAULT_MOBILE_SAFE_ZONE
  ): { yPercent: number; reason: string } {
    const minY = safeZone.topInsetPercent;
    const maxY = 1.0 - safeZone.bottomInsetPercent;

    // Filter candidate positions strictly within mobile safe zones
    const validCandidates = candidateYPositions.filter((y) => y >= minY && y <= maxY);
    if (validCandidates.length === 0) {
      return { yPercent: 0.2, reason: 'Default safe position (no candidates inside safe zone).' };
    }

    if (!Array.isArray(faceBoxes) || faceBoxes.length === 0) {
      // Default to upper third when no face is present
      return { yPercent: validCandidates[0], reason: 'No faces detected; positioned in upper safe third.' };
    }

    // Evaluate collision penalty for each candidate position
    // Hook text occupies roughly 8% of canvas height centered at candidate Y
    const hookHeight = 0.08;

    let bestY = validCandidates[0];
    let minCollisionScore = Infinity;

    for (const candidateY of validCandidates) {
      const hookTop = candidateY - hookHeight / 2;
      const hookBottom = candidateY + hookHeight / 2;

      let collisionScore = 0;

      for (const face of faceBoxes) {
        const faceTop = face.y;
        const faceBottom = face.y + face.height;

        // Calculate vertical overlap between hook text and face
        const overlapTop = Math.max(hookTop, faceTop);
        const overlapBottom = Math.min(hookBottom, faceBottom);
        const overlap = Math.max(0, overlapBottom - overlapTop);

        if (overlap > 0) {
          // Weight collision by face area
          collisionScore += overlap * face.width;
        }
      }

      if (collisionScore < minCollisionScore) {
        minCollisionScore = collisionScore;
        bestY = candidateY;
      }
    }

    const reason = minCollisionScore === 0
      ? `Positioned at ${Math.round(bestY * 100)}% height with zero face obstruction.`
      : `Positioned at ${Math.round(bestY * 100)}% height minimizing face collision (score: ${minCollisionScore.toFixed(3)}).`;

    return { yPercent: Number(bestY.toFixed(3)), reason };
  }

  /**
   * Computes the caption position for stacked two-speaker layouts (SPLIT).
   * Places subtitles directly on the horizontal dividing seam using ASS {\an5} middle alignment.
   */
  public static computeSplitSeamCaptionPosition(
    canvasWidth = 1080,
    canvasHeight = 1920,
    seamRatio = 0.5
  ): { posX: number; posY: number; assAlignmentTag: string } {
    const posX = Math.round(canvasWidth / 2);
    const posY = Math.round(canvasHeight * seamRatio);

    return {
      posX,
      posY,
      assAlignmentTag: `{\\an5\\pos(${posX},${posY})}`,
    };
  }
}
