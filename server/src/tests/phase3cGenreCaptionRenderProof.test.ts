import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { CaptionService } from '../services/captionService.js';
import { buildPresetAssScript } from '../shared/captionPresets.js';
import { ProducerPlanningService } from '../services/producerPlanningService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

/**
 * Phase 3c rendered-caption proof: the genre-default caption style resolved by
 * the producer plan flows through the actual cue-extraction -> preset -> ASS ->
 * FFmpeg subtitles burn chain and lands as visible caption pixels, and two
 * different genre styles produce measurably different rendered output.
 *
 * DB-free leg: extractCuesForClipSettings takes the transcript directly; the
 * genre default comes from resolveCaptionStyleDefault (the same call the plan
 * builder makes).
 */

const W = 1080;
const H = 1920;

const TRANSCRIPT = {
  words: [
    { word: 'this', start: 0.2, end: 0.5 },
    { word: 'is', start: 0.5, end: 0.7 },
    { word: 'exactly', start: 0.7, end: 1.1 },
    { word: 'how', start: 1.1, end: 1.3 },
    { word: 'creators', start: 1.3, end: 1.8 },
    { word: 'grow', start: 1.8, end: 2.2 },
    { word: 'faster', start: 2.2, end: 2.7 },
    { word: 'online', start: 2.7, end: 3.1 },
    { word: 'with', start: 3.4, end: 3.6 },
    { word: 'better', start: 3.6, end: 3.9 },
    { word: 'clips', start: 3.9, end: 4.3 },
  ],
};

const renderCaptionFrame = async (
  tmp: string,
  style: string,
  tag: string
): Promise<{ frame: Buffer; pngPath?: string }> => {
  const clip = {
    start_seconds: 0,
    end_seconds: 6,
    trim_start_offset: 0,
    trim_end_offset: 0,
    caption_style: style,
    caption_config: {},
    aspect_ratio: '9:16' as const,
  };
  const { cues, preset } = CaptionService.extractCuesForClipSettings(TRANSCRIPT, clip, '9:16');
  assert.ok(cues.length > 0, `${tag}: cues extracted`);
  // Mirror the render path (captionService.ts:1364): gallery preset styles use
  // the preset ASS builder; legacy styles (e.g. 'karaoke', which has no
  // gallery preset) fall back to buildAssScript. FINDING: genre defaults
  // 'karaoke' (gaming, comedy) hit the legacy path - see audit report.
  const ass = preset
    ? buildPresetAssScript(cues as any, preset)
    : CaptionService.buildAssScript(cues as any, {
        style: style as any,
        position: 'bottom',
        aspectRatio: '9:16',
      });
  const assPath = path.join(tmp, `cap-${tag}.ass`);
  fs.writeFileSync(assPath, ass, 'utf8');

  const srcPath = path.join(tmp, 'src.mp4');
  await execFileAsync(ffmpegBin, [
    '-y', '-f', 'lavfi', '-i', `color=c=0x181818:s=${W}x${H}:d=6:r=30`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', srcPath,
  ]);

  // libass needs the ASS dir relative-safe: escape colons per render path.
  const escapedAss = assPath.replace(/:/g, '\\:').replace(/\\/g, '/');
  const outPath = path.join(tmp, `out-${tag}.mp4`);
  await execFileAsync(ffmpegBin, [
    '-y', '-i', srcPath, '-vf', `subtitles='${escapedAss}'`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', outPath,
  ]);

  const rawPath = path.join(tmp, `frame-${tag}.gray`);
  await execFileAsync(ffmpegBin, [
    '-y', '-ss', '2.5', '-i', outPath, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', rawPath,
  ]);
  const frame = fs.readFileSync(rawPath);

  const evidenceDir = process.env.CAPTION_PROOF_OUT || '';
  let pngPath: string | undefined;
  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    pngPath = path.join(evidenceDir, `caption-${tag}-t2_5.png`);
    await execFileAsync(ffmpegBin, ['-y', '-ss', '2.5', '-i', outPath, '-frames:v', '1', pngPath]);
  }
  return { frame, pngPath };
};

/** Count of bright pixels (caption glyphs/outlines) in the lower two-thirds. */
const captionInk = (frame: Buffer): number => {
  let n = 0;
  const startRow = Math.floor(H / 3);
  for (let i = startRow * W; i < W * H; i++) {
    if (frame[i] > 120) n++;
  }
  return n;
};

describe('Phase 3c genre-default captions: rendered output proof', () => {
  it('genre-default styles burn visible, measurably different caption pixels', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-render-proof-'));

    const gamingStyle = ProducerPlanningService.resolveCaptionStyleDefault('gaming', 'BALANCED').style;
    const eduStyle = ProducerPlanningService.resolveCaptionStyleDefault('education_tutorial', 'BALANCED').style;
    assert.notEqual(gamingStyle, eduStyle, 'test needs two different genre styles');

    const gaming = await renderCaptionFrame(tmp, gamingStyle, 'gaming-karaoke');
    const edu = await renderCaptionFrame(tmp, eduStyle, 'education-clean');

    const inkGaming = captionInk(gaming.frame);
    const inkEdu = captionInk(edu.frame);

    // Captions actually rendered (not an empty burn).
    assert.ok(inkGaming > 500, `gaming captions should render visible pixels, got ${inkGaming}`);
    assert.ok(inkEdu > 500, `education captions should render visible pixels, got ${inkEdu}`);
    // The two genre styles must not collapse into identical rendering.
    assert.notDeepEqual(gaming.frame, edu.frame, 'genre caption styles must render differently');

    fs.rmSync(tmp, { recursive: true, force: true });
  }, 120000);
});
