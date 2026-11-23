import{admitGameEventEvidence}from '../shared/gameEventEvidence.js';import type{SelectionSourceReceipt}from '../shared/selectionSourceReceipt.js';
import {supervisedExecFile} from './queue/supervisedExecFile.js';
import type {BorrowedSourceReaders} from './queue/borrowedSourceReaders.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

import { getMongoDb, isMongoConfigured } from '../db/mongoClient.js';
import { logger } from '../utils/logger.js';
import {
  EnergySegment,
} from '../utils/reactionSpikes.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

/** Disabled legacy vision path. It supplied labels instead of image payloads.
 * Frame extraction remains available for isolated qualification, but public
 * analysis/getter entries return no events until a real producer is qualified. */
export interface GameEvent {
  time: number;
  type: 'kill' | 'multi_kill' | 'death' | 'victory' | 'defeat' | 'clutch' | 'achievement' | 'reaction' | 'other';
  game?: string;
  confidence: number;
  corroborated_by_audio: boolean;
  note?: string;
}

export interface GameEventAnalysis {
  project_id: string;
  game?: string;
  events: GameEvent[];
  created_at: string;
}

const MAX_FRAMES = 24; // ~1 frame per 2.5s of a 60s clip; scales to caps
const FRAME_JPEG_QUALITY = '4';

interface FrameSample {
  time: number;
  base64: string;
}

async function extractFrames(localSourcePath: string, startSec: number, durationSec: number): Promise<FrameSample[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-gameframes-'));
  const count = Math.max(4, Math.min(MAX_FRAMES, Math.ceil(durationSec / 2.5)));
  const interval = durationSec / count;
  const frames: FrameSample[] = [];
  let cleanupSafe=true;
  try {
    for (let i = 0; i < count; i++) {
      const t = startSec + i * interval;
      const out = path.join(dir, `f${i}.jpg`);
      await GameEventService.executeFrameProcess(localSourcePath,t,out);
      if (fs.existsSync(out) && fs.statSync(out).size > 0) {
        frames.push({ time: Number(t.toFixed(2)), base64: fs.readFileSync(out).toString('base64') });
      }
    }
  } catch(error:any){if(error?.code==='PROCESS_STOP_UNVERIFIED'){cleanupSafe=false;logger.error('[GameEvents] Frame scratch quarantined pending child exit proof',{dir,processGroupId:error.owned_process_group});}throw error;
  } finally {
    if(cleanupSafe)fs.rmSync(dir, { recursive: true, force: true });
  }
  return frames;
}

export class GameEventService {
  static async executeFrameProcess(input:string,at:number,out:string):Promise<void>{
    const args=['-y','-ss',at.toFixed(2),'-i',input,'-frames:v','1','-vf','scale=640:-2','-q:v',FRAME_JPEG_QUALITY,out];
    if(process.platform==='linux')await supervisedExecFile(ffmpegBin,args,{timeoutMs:20000,maxBuffer:4*1024*1024});
    else await execFileAsync(ffmpegBin,args,{timeout:20000});
  }
  static extractFrames(input:string,start:number,duration:number,readers?:BorrowedSourceReaders):Promise<FrameSample[]>{
    const read=()=>extractFrames(input,start,duration);
    return readers?readers.read(read):read();
  }
  /** Compatibility entry, disabled without extraction, provider or write effects. */
  public static async analyzeLocalVideo(
    projectId: string,
    userId: string,
    localSourcePath: string,
    startSec: number,
    durationSec: number,
    energySegments: EnergySegment[] = [],
    sourceReaders?:BorrowedSourceReaders
  ): Promise<GameEventAnalysis> {
    // Disabled v1: the legacy request never supplied image bytes to the model.
    // A flag, frame label or stored row cannot certify actual vision evidence.
    // Preserve all rows and avoid extraction, provider calls and writes until
    // an independently qualified owner/source-bound image producer exists.
    return {project_id:projectId,events:[],created_at:new Date().toISOString()};
  }

  /** Normal selection must reject legacy text-only/unbound rows. The caller
   * has already verified the current selection transcript and object receipt.
   * No provider calls, row migration or new permissions at this read boundary. */
  public static async getFreshEvents(projectId:string,userId:string,selection:SelectionSourceReceipt,durationSeconds:number):Promise<GameEventAnalysis|null>{
    if(!isMongoConfigured)return null;
    const db=await getMongoDb();
    const row=await db.collection('game_events').findOne({project_id:projectId,user_id:userId});
    return admitGameEventEvidence(row,{projectId,userId,selection,durationSeconds});
  }

  /** Legacy entry cannot bypass disabled game evidence admission. */
  public static async getEvents(projectId: string): Promise<GameEventAnalysis | null> {
    // Compatibility entry must not bypass the disabled evidence contract.
    return null;
  }
}
