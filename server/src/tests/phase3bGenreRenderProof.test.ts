import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { SmartReframeService } from '../services/smartReframeService.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { ReframeSample } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

/**
 * Phase 3b rendered-footage proof: the same moving-subject source rendered
 * through the genre-tuned smart-crop filter for two different genres produces
 * visibly different framing, and the tighter genre config keeps the subject
 * closer to the frame center in the actual output pixels.
 *
 * Chain under test: synthetic detection samples -> smoothAndGenerateKeyframes
 * (genre reframeConfig) -> buildSmartCropFilter -> real FFmpeg render ->
 * measured subject position in output frame.
 */

const SRC_W = 1280;
const SRC_H = 720;
const DURATION = 4;
// The bright block moves from x=100 to x=980 (center 140 -> 1020, i.e. 0.11 -> 0.80 normalized).
const blockCenterX = (t: number): number => (100 + 40 + (880 * t) / DURATION) / SRC_W;

const makeSamples = (): ReframeSample[] => {
  const samples: ReframeSample[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i * 0.25;
    const cx = blockCenterX(t);
    samples.push({
      time: t,
      faces: [
        {
          x: cx - 0.06,
          y: 0.4,
          width: 0.12,
          height: 0.12,
          center_x: cx,
          center_y: 0.5,
          confidence: 0.95,
          track_id: 't1',
        },
      ],
    });
  }
  return samples;
};

/** Mean x of the brightest pixels (the white block) in a grayscale raw frame. */
const brightCentroidX = (raw: Buffer, w: number, h: number): number => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (raw[i] > 220) {
      sum += (i % w) / w;
      n++;
    }
  }
  return n > 0 ? sum / n : -1;
};

/** Bounding box of the brightest pixels, normalized to the frame. */
const brightBounds = (raw: Buffer, w: number, h: number) => {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (raw[i] > 220) {
      const x = (i % w) / w;
      const y = Math.floor(i / w) / h;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      n++;
    }
  }
  return { minX, maxX, minY, maxY, count: n };
};

describe('Phase 3b genre-tuned reframe: rendered output proof', () => {
  it('rendered 9:16 output keeps the subject better centered with the tighter genre config', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'genre-render-proof-'));
    const srcPath = path.join(tmp, 'src.mp4');

    // Dark background + one bright 80x80 block sweeping left -> right.
    // (drawbox in this ffmpeg build does not animate; overlay does.)
    await execFileAsync(ffmpegBin, [
      '-y',
      '-f', 'lavfi', '-i', `color=c=0x202020:s=${SRC_W}x${SRC_H}:d=${DURATION}:r=30`,
      '-f', 'lavfi', '-i', `color=c=white:s=80x80:d=${DURATION}:r=30`,
      '-filter_complex', `[0:v][1:v]overlay=x='100+880*t/${DURATION}':y=320,format=yuv420p[v]`,
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
      srcPath,
    ]);

    const samples = makeSamples();
    const podcast = GenreIntelligenceService.getGenreProfile('podcast_interview').reframeConfig;
    const gaming = GenreIntelligenceService.getGenreProfile('gaming').reframeConfig;

    const renderWith = async (cfg: typeof podcast, tag: string): Promise<string> => {
      const kfs = SmartReframeService.smoothAndGenerateKeyframes({
        samples,
        dominantTrackId: 't1',
        duration: DURATION,
        deadZone: cfg.deadZone,
        maxVelocity: cfg.maxVelocity,
        smoothingAlpha: cfg.smoothingAlpha,
        aspectRatio: '9:16',
        sourceWidth: SRC_W,
        sourceHeight: SRC_H,
      });
      const filter = SmartReframeService.buildSmartCropFilter(kfs, '9:16', SRC_W, SRC_H, DURATION);
      const out = path.join(tmp, `out-${tag}.mp4`);
      await execFileAsync(ffmpegBin, [
        '-y', '-i', srcPath, '-vf', filter, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', out,
      ]);
      return out;
    };

    const outPodcast = await renderWith(podcast, 'podcast');
    const outGaming = await renderWith(gaming, 'gaming');

    // At t=3s the block is far right (normalized x ~0.72). Grab the frame from
    // each render and measure where the block landed in the 9:16 output.
    const frameAt = async (video: string, tag: string): Promise<Buffer> => {
      const rawPath = path.join(tmp, `frame-${tag}.gray`);
      await execFileAsync(ffmpegBin, [
        '-y', '-ss', '3', '-i', video, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', rawPath,
      ]);
      return fs.readFileSync(rawPath);
    };

    // Output is 1080x1920 after the smart crop filter's scale/crop chain.
    const W = 1080;
    const H = 1920;
    const podcastFrame = await frameAt(outPodcast, 'podcast');
    const gamingFrame = await frameAt(outGaming, 'gaming');
    const podcastX = brightCentroidX(podcastFrame, W, H);
    const gamingX = brightCentroidX(gamingFrame, W, H);

    assert.ok(podcastX >= 0 && gamingX >= 0, 'subject must be visible in both renders');
    // Both genre crops follow the right-moving subject (no frozen-center regression).
    assert.ok(podcastX > 0.5, `podcast crop should follow the subject right of center, got ${podcastX}`);
    // The tighter gaming config must keep the subject closer to frame center.
    assert.ok(
      Math.abs(gamingX - 0.5) < Math.abs(podcastX - 0.5),
      `gaming should center the subject better (gaming=${gamingX}, podcast=${podcastX})`
    );

    // Subject retention: the whole bright block must fit inside the frame in
    // BOTH renders - steadiness tuning may not cut the subject off.
    for (const [tag, frame] of [
      ['podcast', podcastFrame],
      ['gaming', gamingFrame],
    ] as const) {
      const b = brightBounds(frame, W, H);
      assert.ok(b.count > 0, `${tag}: subject pixels present`);
      assert.ok(b.minX > 0.005, `${tag}: subject clipped at left edge (minX=${b.minX})`);
      assert.ok(b.maxX < 0.995, `${tag}: subject clipped at right edge (maxX=${b.maxX})`);
      // The block is 80px in a 1280-wide source scaled x2.666 -> ~213px wide
      // (0.197 of the 1080-wide output). A clipped block loses width.
      assert.ok(
        b.maxX - b.minX > 0.15,
        `${tag}: subject partially out of frame (width=${(b.maxX - b.minX).toFixed(3)})`
      );
    }

    // Save rendered evidence frames for visual inspection.
    const evidenceDir = process.env.GENRE_PROOF_OUT || '';
    if (evidenceDir) {
      fs.mkdirSync(evidenceDir, { recursive: true });
      for (const [tag, video] of [
        ['podcast', outPodcast],
        ['gaming', outGaming],
      ] as const) {
        await execFileAsync(ffmpegBin, [
          '-y', '-ss', '3', '-i', video, '-frames:v', '1', path.join(evidenceDir, `render-${tag}-t3.png`),
        ]);
        await execFileAsync(ffmpegBin, [
          '-y', '-ss', '0.5', '-i', video, '-frames:v', '1', path.join(evidenceDir, `render-${tag}-t0_5.png`),
        ]);
      }
      await execFileAsync(ffmpegBin, [
        '-y', '-ss', '3', '-i', srcPath, '-frames:v', '1', path.join(evidenceDir, 'source-t3.png'),
      ]);
    }

    fs.rmSync(tmp, { recursive: true, force: true });
  }, 120000);
});
