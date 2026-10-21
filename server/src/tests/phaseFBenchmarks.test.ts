import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { SmartReframeService } from '../services/smartReframeService.js';
import { CaptionService } from '../services/captionService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const FIXTURE_ROGAN_PLASMA = path.join(
  REPO_ROOT,
  'public/demo/landing/review_proxies/joe-rogan-plasma-00m02s-00m20s-review.mp4'
);
const FIXTURE_MRBEAST = path.join(
  REPO_ROOT,
  'public/demo/landing/review_proxies/mrbeast-challenge-06m48s-07m22s-review.mp4'
);
const FIXTURE_RONALDO = path.join(
  REPO_ROOT,
  'public/demo/landing/clips/ronaldo-clip-01.mp4'
);
const FIXTURE_ROGAN_BUREAUCRATS = path.join(
  REPO_ROOT,
  'public/demo/landing/review_proxies/joe-rogan-bureaucrats-17m58s-18m14s-review.mp4'
);

describe('Phase F — Regression Suite & Local Fixture Benchmarks', () => {
  it('1. verifies all 4 local fixture media files exist and are readable', () => {
    assert.ok(fs.existsSync(FIXTURE_ROGAN_PLASMA), 'Joe Rogan Plasma fixture must exist');
    assert.ok(fs.existsSync(FIXTURE_MRBEAST), 'MrBeast Challenge fixture must exist');
    assert.ok(fs.existsSync(FIXTURE_RONALDO), 'Ronaldo Clip fixture must exist');
    assert.ok(fs.existsSync(FIXTURE_ROGAN_BUREAUCRATS), 'Joe Rogan Bureaucrats fixture must exist');

    assert.ok(fs.statSync(FIXTURE_ROGAN_PLASMA).size > 100000);
    assert.ok(fs.statSync(FIXTURE_MRBEAST).size > 100000);
    assert.ok(fs.statSync(FIXTURE_RONALDO).size > 100000);
    assert.ok(fs.statSync(FIXTURE_ROGAN_BUREAUCRATS).size > 100000);
  });

  it('2. executes shot-aware smart reframe render on Joe Rogan podcast fixture', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-benchmark-reframe-'));
    const outVideo = path.join(tmpDir, 'rogan_reframed_916.mp4');

    try {
      // Keyframe sequence with an instantaneous hard cut at 1.5s
      const keyframes = [
        { time: 0.0, centerX: 0.35, centerY: 0.38 },
        { time: 1.499, centerX: 0.35, centerY: 0.38 },
        { time: 1.500, centerX: 0.65, centerY: 0.38 },
        { time: 3.0, centerX: 0.65, centerY: 0.38 },
      ];

      const cropFilter = SmartReframeService.buildSmartCropFilter(
        keyframes,
        '9:16',
        1920,
        1080,
        3.0
      );

      // Render 2 seconds through FFmpeg with real video
      await execFileAsync(
        ffmpegBin,
        [
          '-y',
          '-ss', '0',
          '-t', '2.0',
          '-i', FIXTURE_ROGAN_PLASMA,
          '-vf', cropFilter,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-an',
          outVideo,
        ],
        { timeout: 30000 }
      );

      assert.ok(fs.existsSync(outVideo), 'Rendered output video must exist');
      const stat = fs.statSync(outVideo);
      assert.ok(stat.size > 20000, `Output video must have valid size (got ${stat.size} bytes)`);
    } finally {
      try {
        if (fs.existsSync(outVideo)) fs.unlinkSync(outVideo);
        fs.rmdirSync(tmpDir);
      } catch {}
    }
  });

  it('3. burns kinetic styled ASS captions onto Ronaldo sports fixture', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-benchmark-caption-'));
    const outVideo = path.join(tmpDir, 'ronaldo_captioned.mp4');
    const assFile = path.join(tmpDir, 'subtitles.ass');

    try {
      const assContent = `[Script Info]
Title: Ronaldo Sports Test
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,64,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,240,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.10,0:00:01.80,Default,,0,0,0,,{\\b1}WORLD CLASS FINISH{\\b0}
`;
      fs.writeFileSync(assFile, assContent);

      const safeAss = assFile.replace(/\\/g, '/').replace(/:/g, '\\\\:');

      await execFileAsync(
        ffmpegBin,
        [
          '-y',
          '-ss', '0',
          '-t', '1.5',
          '-i', FIXTURE_RONALDO,
          '-vf', `ass=${safeAss}`,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-an',
          outVideo,
        ],
        { timeout: 30000 }
      );

      assert.ok(fs.existsSync(outVideo), 'Captioned video must exist');
      assert.ok(fs.statSync(outVideo).size > 15000);
    } finally {
      try {
        if (fs.existsSync(assFile)) fs.unlinkSync(assFile);
        if (fs.existsSync(outVideo)) fs.unlinkSync(outVideo);
        fs.rmdirSync(tmpDir);
      } catch {}
    }
  });

  it('4. executes multi-slice timeline render on Joe Rogan Bureaucrats fixture', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-benchmark-slice-'));
    const outVideo = path.join(tmpDir, 'rogan_multislice.mp4');

    try {
      // Concat 2 slices: 0-1s and 2-3s (skipping 1-2s dead space)
      const filterComplex = [
        '[0:v]trim=start=0:end=1,setpts=PTS-STARTPTS[v0]',
        '[0:a]atrim=start=0:end=1,asetpts=PTS-STARTPTS[a0]',
        '[0:v]trim=start=2:end=3,setpts=PTS-STARTPTS[v1]',
        '[0:a]atrim=start=2:end=3,asetpts=PTS-STARTPTS[a1]',
        '[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]',
      ].join(';');

      await execFileAsync(
        ffmpegBin,
        [
          '-y',
          '-i', FIXTURE_ROGAN_BUREAUCRATS,
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          outVideo,
        ],
        { timeout: 30000 }
      );

      assert.ok(fs.existsSync(outVideo), 'Multi-slice output video must exist');
      assert.ok(fs.statSync(outVideo).size > 20000);

      // Verify duration is approximately 2.0s
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'json',
        outVideo,
      ]);
      const probe = JSON.parse(stdout);
      const duration = parseFloat(probe.format?.duration || '0');
      assert.ok(duration >= 1.8 && duration <= 2.2, `Expected ~2.0s duration, got ${duration}s`);
    } finally {
      try {
        if (fs.existsSync(outVideo)) fs.unlinkSync(outVideo);
        fs.rmdirSync(tmpDir);
      } catch {}
    }
  });
});
