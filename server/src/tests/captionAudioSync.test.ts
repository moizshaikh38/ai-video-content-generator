/**
 * Caption ↔ audio synchronisation verification against real media.
 *
 * Everything else in the caption suite asserts on arithmetic in isolation. This file is the
 * only place that closes the loop end to end on real bytes:
 *
 *   1. Synthesises a source MP4 whose audio stream deliberately starts at a non-zero PTS
 *      (~1.2s after the video stream) and which contains one unmistakable audio event
 *      (a 1 kHz tone burst) at a known position.
 *   2. Runs the production audio extractor over it and *measures* where the tone landed in
 *      the extracted MP3 — this is the stand-in for Whisper, which likewise only ever sees
 *      the extracted MP3 and reports timestamps in that file's own coordinates. The expected
 *      value is never recomputed from the fixture's construction parameters.
 *   3. Feeds that measured timestamp through the production rebasing path
 *      (CaptionService.extractClipCues) and the production ASS writer
 *      (CaptionService.buildAssScript).
 *   4. Renders a clip with burned-in captions using the same seek + filter chain as
 *      ClipRenderService, then measures where the tone landed in the *rendered* clip.
 *   5. Asserts the caption is actually on screen at the frame where the tone is audible,
 *      and is NOT on screen well before or after it.
 *
 * Step 5 is sensitive to a timing error in either direction: shifting the transcript→clip
 * conversion by the source's A/V start-PTS delta (a plausible-looking "fix") moves the
 * caption ~1.2s early, which breaks both the "visible at the tone" and the
 * "blank before the tone" assertions. That sensitivity is what makes this a real test.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { CaptionService } from '../services/captionService.js';
import { buildCropFilter } from '../services/clipRenderService.js';
import { extractAudioFromVideo, probeAvStartTimes } from '../services/audioExtractionService.js';
import type { ClipAspectRatio, TimedCaptionCue } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

// Fixture construction parameters. Only used to BUILD the fixture — never as expected values.
const SOURCE_DURATION_SEC = 12;
const TONE_START_IN_AUDIO_SEC = 4.0;
const TONE_LENGTH_SEC = 0.6;
const AUDIO_STREAM_ITSOFFSET_SEC = 1.2;

// Clip window used for the render, in source/video-timeline seconds.
const CLIP_START_SEC = 3.0;
const CLIP_END_SEC = 9.0;

const ASPECT: ClipAspectRatio = '9:16';
/** Bottom slab of the 1080x1920 output frame where bottom-positioned captions live. */
const CAPTION_CROP = 'crop=1080:760:0:1140';
const LUMA_THRESHOLD = 110;
/** A bare "BEEP" at preset sizes paints several thousand bright pixels; 300 is a wide margin. */
const MIN_CAPTION_PIXELS = 300;
const MAX_BLANK_PIXELS = 20;

async function runFfmpeg(args: string[]): Promise<string> {
  try {
    const { stderr } = await execFileAsync(ffmpegBin, ['-hide_banner', '-nostdin', ...args], {
      timeout: 180000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stderr || '';
  } catch (err: any) {
    // silencedetect/null-muxer runs report on stderr; surface it for diagnosis on failure.
    if (err?.stderr) throw new Error(`ffmpeg failed: ${String(err.stderr).slice(-2000)}`);
    throw err;
  }
}

async function ffmpegStderr(args: string[]): Promise<string> {
  const { stderr } = await execFileAsync(ffmpegBin, ['-hide_banner', '-nostats', '-nostdin', ...args], {
    timeout: 180000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stderr || '';
}

/**
 * Measures the onset of the first non-silent audio in a media file, in that file's own
 * timebase, using ffmpeg's silencedetect. This is a measurement of the actual rendered
 * bytes, not a recomputation of how the fixture was built.
 */
async function measureFirstAudioOnset(mediaPath: string): Promise<number> {
  const stderr = await ffmpegStderr([
    '-i', mediaPath,
    '-vn',
    '-af', 'silencedetect=noise=-40dB:d=0.2',
    '-f', 'null', '-',
  ]);
  const match = stderr.match(/silence_end:\s*([0-9.]+)/);
  assert.ok(match, `silencedetect found no silence→sound transition in ${path.basename(mediaPath)}`);
  return Number(match![1]);
}

/**
 * Counts pixels brighter than LUMA_THRESHOLD inside the caption band of the frame shown at
 * `atSec` of `clipPath`. Returns 0 for an all-black frame.
 */
async function countCaptionPixelsAt(clipPath: string, atSec: number): Promise<number> {
  const { stdout } = await execFileAsync(
    ffmpegBin,
    [
      '-hide_banner', '-nostats', '-nostdin', '-loglevel', 'error',
      '-ss', atSec.toFixed(3),
      '-i', clipPath,
      '-frames:v', '1',
      '-vf', `${CAPTION_CROP},format=gray`,
      '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
    ],
    { timeout: 120000, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' }
  );
  const frame = stdout as unknown as Buffer;
  assert.ok(frame.length > 0, `No frame decoded at t=${atSec.toFixed(3)}s`);
  let bright = 0;
  for (let i = 0; i < frame.length; i++) {
    if (frame[i] > LUMA_THRESHOLD) bright++;
  }
  return bright;
}

async function hasFfprobe(): Promise<boolean> {
  try {
    await execFileAsync('ffprobe', ['-version'], { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

describe('Caption ↔ audio synchronisation on real media', () => {
  const tempDir = path.join(os.tmpdir(), `vireo-capsync-${crypto.randomUUID()}`);
  const tonePath = path.join(tempDir, 'tone.wav');
  const blackPath = path.join(tempDir, 'black.mp4');
  const sourcePath = path.join(tempDir, 'source.mp4');

  let ffprobeAvailable = false;

  before(async () => {
    fs.mkdirSync(tempDir, { recursive: true });
    ffprobeAvailable = await hasFfprobe();

    // A 1 kHz tone gated to a single burst, silence everywhere else.
    const gateEnd = TONE_START_IN_AUDIO_SEC + TONE_LENGTH_SEC;
    await runFfmpeg([
      '-y', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `sine=frequency=1000:sample_rate=44100:duration=${SOURCE_DURATION_SEC}`,
      '-af', `volume=0:enable='not(between(t,${TONE_START_IN_AUDIO_SEC},${gateEnd}))'`,
      tonePath,
    ]);

    // Pure black video: any non-black pixel in the output is burned-in caption text.
    await runFfmpeg([
      '-y', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `color=c=black:s=640x360:r=30:d=${SOURCE_DURATION_SEC}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      blackPath,
    ]);

    // Mux them with the audio stream deliberately offset, producing a non-zero audio start PTS.
    await runFfmpeg([
      '-y', '-loglevel', 'error',
      '-i', blackPath,
      '-itsoffset', String(AUDIO_STREAM_ITSOFFSET_SEC), '-i', tonePath,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac',
      sourcePath,
    ]);

    assert.ok(fs.existsSync(sourcePath), 'Fixture source MP4 must exist');
  });

  it('fixture really does carry a non-zero audio start PTS', async (t) => {
    if (!ffprobeAvailable) {
      t.skip('ffprobe is not available on PATH');
      return;
    }
    const probed = await probeAvStartTimes(sourcePath);
    assert.equal(probed.probed, true, 'ffprobe must report stream start times for the fixture');
    assert.equal(probed.videoStartTimeSec, 0, 'Fixture video stream starts at 0');
    assert.ok(
      probed.audioStartTimeSec > 1.0 && probed.audioStartTimeSec < 1.3,
      `Fixture audio stream must start ~1.2s in, got ${probed.audioStartTimeSec}s`
    );
    assert.ok(
      Math.abs(probed.avStartOffsetSec - probed.audioStartTimeSec) < 1e-6,
      'With video starting at 0 the A/V offset equals the audio start time'
    );
    // eslint-disable-next-line no-console
    console.log(
      `[captionAudioSync] fixture av_start_offset_sec=${probed.avStartOffsetSec}s ` +
        `(video=${probed.videoStartTimeSec}s audio=${probed.audioStartTimeSec}s container=${probed.containerStartTimeSec}s)`
    );
  });

  it('production extraction preserves container-absolute audio positions', async () => {
    const extracted = await extractAudioFromVideo(sourcePath, 'source.mp4');
    try {
      assert.ok(extracted.audioBuffer.length > 0, 'Extraction must produce audio bytes');
      assert.ok(fs.existsSync(extracted.audioPath), 'Extracted MP3 must exist on disk');

      const onsetInExtractedAudio = await measureFirstAudioOnset(extracted.audioPath);
      const onsetInSourceContainer = await measureFirstAudioOnset(sourcePath);

      // The decisive measurement: aresample=async=1:first_pts=0 pads the leading audio gap with
      // silence instead of sliding the tone earlier, so the extracted MP3 (what the transcriber
      // sees) keeps the same absolute position as the source container.
      assert.ok(
        Math.abs(onsetInExtractedAudio - onsetInSourceContainer) < 0.05,
        `Extracted MP3 must keep the tone at its container-absolute position: ` +
          `source=${onsetInSourceContainer.toFixed(3)}s extracted=${onsetInExtractedAudio.toFixed(3)}s`
      );
      // eslint-disable-next-line no-console
      console.log(
        `[captionAudioSync] tone onset: source container=${onsetInSourceContainer.toFixed(3)}s ` +
          `extracted mp3=${onsetInExtractedAudio.toFixed(3)}s ` +
          `(probed av_start_offset=${extracted.avStartTimes.avStartOffsetSec}s)`
      );
    } finally {
      extracted.cleanup();
    }
  });

  it('burns the caption on screen at the frame where the word is audible', async () => {
    // 1. Transcribe-by-measurement: the only timestamp fed forward is the one measured from
    //    the MP3 the production extractor produced, exactly as a transcriber would report it.
    const extracted = await extractAudioFromVideo(sourcePath, 'source.mp4');
    let wordStart: number;
    try {
      wordStart = await measureFirstAudioOnset(extracted.audioPath);
    } finally {
      extracted.cleanup();
    }

    const transcript = {
      words: [
        { word: 'BEEP', start: wordStart, end: Number((wordStart + TONE_LENGTH_SEC).toFixed(3)) },
      ],
      segments: [],
      av_start_offset_sec: extracted.avStartTimes.avStartOffsetSec,
    };

    // 2. Production rebasing: absolute transcript seconds → clip-local cue seconds.
    const { timingMode, cues } = CaptionService.extractClipCues(
      transcript,
      CLIP_START_SEC,
      CLIP_END_SEC,
      0,
      0,
      { maxWordsPerCue: 4, uppercase: true }
    );

    assert.equal(timingMode, 'word', 'Word timestamps must drive word-level timing');
    assert.equal(cues.length, 1, 'Exactly one cue expected for a single detected word');
    const cue: TimedCaptionCue = cues[0];
    assert.ok(cue.text.includes('BEEP'), `Cue text must carry the word, got "${cue.text}"`);

    // 3. Production ASS writer.
    const assContent = CaptionService.buildAssScript(cues, {
      style: 'clean',
      position: 'bottom',
      aspectRatio: ASPECT,
      timingMode,
    });
    assert.ok(/^Dialogue:/m.test(assContent), 'ASS script must contain a Dialogue event');
    const assPath = path.join(tempDir, 'subtitles.ass');
    fs.writeFileSync(assPath, assContent, 'utf-8');

    // 4. Render with the same seek + filter chain ClipRenderService uses. fluent-ffmpeg's
    //    setStartTime is an alias of seekInput, i.e. `-ss` BEFORE `-i` (input seeking), which is
    //    what makes clip-relative ASS timings correct: the filter graph receives timestamps
    //    rebased to 0. The explicit-args branch of ClipRenderService places `-ss` before `-i`
    //    for the same reason. Output seeking would feed the ass filter un-rebased source
    //    timestamps and the captions would never appear.
    const clipPath = path.join(tempDir, 'rendered.mp4');
    const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const durationSec = Number((CLIP_END_SEC - CLIP_START_SEC).toFixed(3));
    await runFfmpeg([
      '-y', '-loglevel', 'error',
      '-ss', CLIP_START_SEC.toFixed(3),
      '-i', sourcePath,
      '-t', durationSec.toFixed(3),
      '-vf', `${buildCropFilter(ASPECT)},ass=${safeAss}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      clipPath,
    ]);
    assert.ok(fs.existsSync(clipPath), 'Rendered clip must exist');

    // 5. Where the tone ACTUALLY is in the rendered output — measured from the output itself.
    const audibleAt = await measureFirstAudioOnset(clipPath);
    assert.ok(
      audibleAt > 0.3 && audibleAt < durationSec - 0.3,
      `Tone must be audible well inside the rendered clip, got ${audibleAt.toFixed(3)}s`
    );

    const atTone = Number((audibleAt + 0.15).toFixed(3));
    const beforeTone = Number((audibleAt - 0.9).toFixed(3));
    const afterTone = Number((audibleAt + 1.6).toFixed(3));

    const pixelsAtTone = await countCaptionPixelsAt(clipPath, atTone);
    const pixelsBefore = beforeTone > 0.05 ? await countCaptionPixelsAt(clipPath, beforeTone) : 0;
    const pixelsAfter =
      afterTone < durationSec - 0.1 ? await countCaptionPixelsAt(clipPath, afterTone) : 0;

    // eslint-disable-next-line no-console
    console.log(
      `[captionAudioSync] cue=${cue.start.toFixed(3)}–${cue.end.toFixed(3)}s ` +
        `tone audible at ${audibleAt.toFixed(3)}s | bright px: before(${beforeTone.toFixed(2)}s)=${pixelsBefore} ` +
        `at(${atTone.toFixed(2)}s)=${pixelsAtTone} after(${afterTone.toFixed(2)}s)=${pixelsAfter}`
    );

    assert.ok(
      pixelsAtTone >= MIN_CAPTION_PIXELS,
      `Caption must be burned on screen at the moment the word is audible ` +
        `(t=${atTone.toFixed(3)}s, bright pixels=${pixelsAtTone}). Cue was rendered at ` +
        `${cue.start.toFixed(3)}–${cue.end.toFixed(3)}s, so caption and audio are out of sync.`
    );
    assert.ok(
      pixelsBefore <= MAX_BLANK_PIXELS,
      `Caption must NOT be on screen 0.9s before the word is audible ` +
        `(t=${beforeTone.toFixed(3)}s, bright pixels=${pixelsBefore}) — captions are running early.`
    );
    assert.ok(
      pixelsAfter <= MAX_BLANK_PIXELS,
      `Caption must be gone 1.6s after the word is audible ` +
        `(t=${afterTone.toFixed(3)}s, bright pixels=${pixelsAfter}) — captions are running late.`
    );
  });

  it('reports the measured A/V start offset of the bundled real sample', async (t) => {
    if (!ffprobeAvailable) {
      t.skip('ffprobe is not available on PATH');
      return;
    }
    const samplePath = path.resolve(process.cwd(), '../public/demo/landing/clips/mrbeast-clip-01.mp4');
    if (!fs.existsSync(samplePath)) {
      t.skip(`Bundled sample video not present at ${samplePath}`);
      return;
    }
    const probed = await probeAvStartTimes(samplePath);
    assert.equal(probed.probed, true, 'ffprobe must report stream start times for the sample');
    assert.ok(Number.isFinite(probed.avStartOffsetSec), 'Offset must be a finite number');
    // eslint-disable-next-line no-console
    console.log(
      `[captionAudioSync] mrbeast-clip-01.mp4 av_start_offset_sec=${probed.avStartOffsetSec}s ` +
        `(video=${probed.videoStartTimeSec}s audio=${probed.audioStartTimeSec}s container=${probed.containerStartTimeSec}s)`
    );
  });

  it('degrades to a zero offset when ffprobe cannot read the file', async () => {
    const missing = path.join(tempDir, 'does-not-exist.mp4');
    const probed = await probeAvStartTimes(missing);
    assert.equal(probed.probed, false, 'An unreadable file must report probed=false');
    assert.equal(probed.avStartOffsetSec, 0, 'Unprobed sources must default to a zero offset');
  });
});
