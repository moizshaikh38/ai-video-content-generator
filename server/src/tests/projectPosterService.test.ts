import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { ProjectPosterService } from '../services/projectPosterService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';

/** Reads width/height from a baseline or progressive JPEG's SOF marker. */
function jpegSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('no SOF marker');
}

describe('ProjectPosterService', () => {
  let tmp: string;
  let video4k: string;
  let videoSmall: string;

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-test-'));
    video4k = path.join(tmp, 'wide.mp4');
    videoSmall = path.join(tmp, 'small.mp4');
    const make = (out: string, size: string, seconds: number) =>
      execFileAsync(ffmpegBin, [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=25:duration=${seconds}`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', out,
      ]);
    await make(video4k, '2560x1440', 4);
    await make(videoSmall, '640x360', 1);
  });

  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('stores the poster under the project prefix so project deletion removes it', () => {
    assert.equal(
      ProjectPosterService.posterKey(USER, PROJECT),
      `users/${USER}/projects/${PROJECT}/poster/poster-v1.jpg`,
    );
  });

  it('picks a frame a little way in, inside short videos too', () => {
    assert.equal(ProjectPosterService.frameTime(undefined), 1.5);
    assert.equal(ProjectPosterService.frameTime(0), 1.5);
    assert.equal(ProjectPosterService.frameTime(30), 3);
    assert.equal(ProjectPosterService.frameTime(600), 8);
    assert.equal(ProjectPosterService.frameTime(1), 0.5); // never past the end
  });

  it('seeks before -i and caps width at 1280 without upscaling', () => {
    const args = ProjectPosterService.buildArgs('in.mp4', 2, 'out.jpg');
    assert.ok(args.indexOf('-ss') < args.indexOf('-i'), '-ss must come before -i for fast seeking');
    assert.ok(args.includes("scale='min(1280,iw)':-2"));
    assert.deepEqual(args.slice(-2), ['-y', 'out.jpg']);
  });

  it('extracts an HD JPEG from a large source', async () => {
    const out = path.join(tmp, 'wide.jpg');
    await execFileAsync(ffmpegBin, ProjectPosterService.buildArgs(video4k, ProjectPosterService.frameTime(4), out));
    const { width, height } = jpegSize(out);
    assert.equal(width, 1280);
    assert.equal(height, 720);
  });

  it('keeps small sources at their own size', async () => {
    const out = path.join(tmp, 'small.jpg');
    await execFileAsync(ffmpegBin, ProjectPosterService.buildArgs(videoSmall, ProjectPosterService.frameTime(1), out));
    const { width, height } = jpegSize(out);
    assert.equal(width, 640);
    assert.equal(height, 360);
  });
});
