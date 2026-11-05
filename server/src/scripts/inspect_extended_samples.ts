import path from 'node:path';
import fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import { AudioFeatureService } from '../services/multimodal/audioFeatureService.js';
import { VideoSceneService } from '../services/multimodal/videoSceneService.js';
import { VideoIntelligencePrototype } from '../prototypes/videoIntelligenceEngine.js';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path);

async function inspectExtendedSamples() {
  console.log('Inspecting extended video samples...\n');

  const vStudio = path.resolve(process.cwd(), '../public/demo/creator-studio-demo.mp4');
  const vDemo = path.resolve(process.cwd(), '../public/demo/vireo-demo.mp4');
  const v4k = path.resolve(process.cwd(), '../delete/video_20261011_011105.mp4');

  for (const f of [vStudio, vDemo, v4k]) {
    if (!fs.existsSync(f)) continue;
    const base = path.basename(f);
    const cuts = await VideoSceneService.detectSceneCuts(f, 0.25).catch(() => []);
    const silences = await AudioFeatureService.detectSilenceIntervals(f, -30, 0.3).catch(() => []);
    const vol = await AudioFeatureService.detectAudioVolume(f).catch(() => ({ mean_volume_db: -99, max_volume_db: -99 }));
    console.log(`[${base}]`);
    console.log(`   Scene cuts detected: ${cuts.length}`, cuts.map((c) => `${c.timestamp.toFixed(1)}s (score: ${c.score.toFixed(2)})`).slice(0, 5));
    console.log(`   Silences detected: ${silences.length}`);
    console.log(`   Mean volume: ${vol.mean_volume_db.toFixed(1)} dB (max: ${vol.max_volume_db.toFixed(1)} dB)`);
  }
}

inspectExtendedSamples().catch(console.error);
