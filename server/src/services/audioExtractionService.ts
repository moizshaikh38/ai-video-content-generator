import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

// Configure fluent-ffmpeg to use ffmpeg-static binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
  logger.info(`Configured FFmpeg static binary at: ${ffmpegStatic}`);
} else {
  logger.warn('ffmpegStatic path not resolved; relying on system PATH for ffmpeg.');
}

const execFileAsync = promisify(execFile);

/**
 * Start-of-stream presentation timestamps read from the source container.
 *
 * `avStartOffsetSec` is a *diagnostic* measurement (audio stream start_time minus
 * video stream start_time). It is recorded on the transcript so caption/audio drift
 * reports can be correlated with the source container, but it is deliberately NOT
 * applied as a correction when rebasing transcript seconds into clip-local cues.
 *
 * Reason (measured, see server/src/tests/captionAudioSync.test.ts): extraction below
 * runs `aresample=async=1:first_pts=0`, which *pads* a leading audio gap with silence
 * rather than sliding the audio earlier, so the extracted MP3 keeps container-absolute
 * audio positions with the container start time (`format.start_time`) as its zero.
 * ClipRenderService's `-ss` seek resolves against that same container start time, so the
 * two zero points already coincide and the required correction is identically zero.
 * Subtracting `avStartOffsetSec` would introduce the very drift it looks like it fixes.
 */
export interface AvStartTimes {
  videoStartTimeSec: number;
  audioStartTimeSec: number;
  containerStartTimeSec: number;
  avStartOffsetSec: number;
  /** false when ffprobe was unavailable or returned nothing usable (all values fall back to 0). */
  probed: boolean;
}

const UNPROBED_AV_START_TIMES: AvStartTimes = {
  videoStartTimeSec: 0,
  audioStartTimeSec: 0,
  containerStartTimeSec: 0,
  avStartOffsetSec: 0,
  probed: false,
};

function parseStartTime(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reads the video/audio stream start timestamps of a media container via ffprobe.
 * Never throws: a missing ffprobe binary or an unparsable probe degrades to all-zero
 * values with `probed: false`, leaving existing behaviour untouched.
 */
export async function probeAvStartTimes(filePath: string): Promise<AvStartTimes> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'stream=index,codec_type,start_time',
        '-show_entries', 'format=start_time',
        '-of', 'json',
        filePath,
      ],
      { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }
    );

    const probe = JSON.parse(stdout) as {
      streams?: Array<{ codec_type?: string; start_time?: string }>;
      format?: { start_time?: string };
    };

    const streams = Array.isArray(probe.streams) ? probe.streams : [];
    const videoStart = parseStartTime(streams.find((st) => st?.codec_type === 'video')?.start_time);
    const audioStart = parseStartTime(streams.find((st) => st?.codec_type === 'audio')?.start_time);
    const containerStart = parseStartTime(probe.format?.start_time);

    if (videoStart === null && audioStart === null && containerStart === null) {
      return { ...UNPROBED_AV_START_TIMES };
    }

    const videoStartTimeSec = Number((videoStart ?? 0).toFixed(6));
    const audioStartTimeSec = Number((audioStart ?? 0).toFixed(6));

    return {
      videoStartTimeSec,
      audioStartTimeSec,
      containerStartTimeSec: Number((containerStart ?? Math.min(videoStartTimeSec, audioStartTimeSec)).toFixed(6)),
      avStartOffsetSec: Number((audioStartTimeSec - videoStartTimeSec).toFixed(6)),
      probed: true,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`ffprobe A/V start-time probe failed for ${filePath}: ${msg}. Defaulting offset to 0.`);
    return { ...UNPROBED_AV_START_TIMES };
  }
}

export interface ExtractedAudioResult {
  audioBuffer: Buffer;
  audioPath: string;
  format: 'mp3';
  cleanup: () => void;
  /** Source-container A/V start timestamps measured before extraction (diagnostic). */
  avStartTimes: AvStartTimes;
}

/**
 * Extracts an MP3 audio track from a video buffer using FFmpeg with explicit timeout protection.
 * Writes temporary files into the OS temp directory, runs extraction,
 * reads the audio buffer, and cleans up the temporary video file.
 * The cleanup function is returned to clean up the temporary audio file when finished.
 */
export async function extractAudioFromVideo(
  videoBuffer: Buffer | string,
  originalFileName: string = 'video.mp4',
  options: {
    /** Known source duration; lets the bitrate be chosen up front instead of encoding twice. */
    durationHintSec?: number | null;
    /** Largest MP3 the caller can send on. Defaults to the 25 MB single-request provider limit. */
    maxAudioBytes?: number;
  } = {}
): Promise<ExtractedAudioResult> {
  if (!videoBuffer || videoBuffer.length === 0) {
    throw new Error('Video buffer is empty.');
  }

  const ownsTempVideo = typeof videoBuffer !== 'string';
  const tempDir = os.tmpdir();
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const ext = (originalFileName ? path.extname(originalFileName) : (typeof videoBuffer === 'string' ? path.extname(videoBuffer) : '.mp4')) || '.mp4';
  const tempVideoPath = typeof videoBuffer === 'string' ? videoBuffer : path.join(tempDir, `vireo_in_${uniqueId}${ext}`);
  const tempAudioPath = path.join(tempDir, `vireo_out_${uniqueId}.mp3`);

  const sourceSize = typeof videoBuffer === 'string' ? (await fs.promises.stat(videoBuffer)).size : videoBuffer.length;
  if (ownsTempVideo) {
    logger.info(`Writing video buffer (${(sourceSize / (1024 * 1024)).toFixed(2)} MB) to temporary file: ${tempVideoPath}`);
    await fs.promises.writeFile(tempVideoPath, videoBuffer);
  }

  const cleanup = () => {
    try {
      if (ownsTempVideo && fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Failed to remove temp video: ${msg}`);
    }
    try {
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Failed to remove temp audio: ${msg}`);
    }
  };

  try {
    // Record how far the source's audio stream starts from its video stream. The extraction
    // below normalises the MP3 to start at the container's zero, so this is captured purely
    // as a diagnostic; see AvStartTimes for why it is not subtracted from caption timings.
    // The probe only reads headers, so it runs alongside the encode instead of ahead of it.
    const avStartTimesProbe = probeAvStartTimes(tempVideoPath);
    avStartTimesProbe.then((avStartTimes) => {
      if (!avStartTimes.probed) return;
      logger.info(
        `Source A/V start times: video=${avStartTimes.videoStartTimeSec}s audio=${avStartTimes.audioStartTimeSec}s ` +
          `container=${avStartTimes.containerStartTimeSec}s av_start_offset=${avStartTimes.avStartOffsetSec}s`
      );
    });

    logger.info(`Extracting audio with FFmpeg: ${tempVideoPath} -> ${tempAudioPath}`);

    const extractWithBitrate = (bitrateKbps: number): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        let killed = false;
        const ffmpegCommand = ffmpeg(tempVideoPath)
          .noVideo()
          .audioCodec('libmp3lame')
          .audioBitrate(bitrateKbps)
          .audioChannels(1) // Mono for speech recognition efficiency
          .audioFrequency(16000) // 16kHz optimal for Whisper speech-to-text
          .audioFilters('aresample=async=1:first_pts=0')
          .outputOptions(['-avoid_negative_ts', 'make_zero'])
          .format('mp3');

        // Enforce timeout (H5)
        const timeoutId = setTimeout(() => {
          killed = true;
          logger.error(`FFmpeg process timed out after ${config.ffmpegTimeoutMs}ms. Killing process...`);
          try {
            ffmpegCommand.kill('SIGKILL');
          } catch {
            // Process may have already exited
          }
          reject(new Error(`FFmpeg audio extraction timed out after ${config.ffmpegTimeoutMs / 1000}s.`));
        }, config.ffmpegTimeoutMs);

        ffmpegCommand
          .on('start', (cmdLine) => {
            logger.info(`FFmpeg process started (${bitrateKbps}k): ${cmdLine}`);
          })
          .on('error', (err) => {
            clearTimeout(timeoutId);
            if (killed) return;
            logger.error(`FFmpeg processing error: ${err.message}`);
            reject(new Error(`FFmpeg audio extraction failed: ${err.message}`));
          })
          .on('end', () => {
            clearTimeout(timeoutId);
            if (killed) return;
            logger.info(`FFmpeg processing finished successfully at ${bitrateKbps}k.`);
            resolve();
          })
          .save(tempAudioPath);
      });
    };

    const maxAudioBytes = options.maxAudioBytes ?? 25 * 1024 * 1024;
    const reencodeAboveBytes = maxAudioBytes - 1024 * 1024;
    // 64 kbps mono is ~8 KB/s plus framing. When the duration is known and 64k can't fit, go
    // straight to 32k: a long video used to be encoded once at 64k, measured, then encoded again.
    const durationHintSec = Number(options.durationHintSec) || 0;
    const firstBitrate = durationHintSec > 0 && durationHintSec * 8200 > reencodeAboveBytes ? 32 : 64;

    // Extract at 64 kbps mono (enables up to ~53 min speech under 25MB with crisp Whisper accuracy)
    await extractWithBitrate(firstBitrate);
    const avStartTimes = await avStartTimesProbe;

    if (!fs.existsSync(tempAudioPath)) {
      throw new Error('Extracted audio file does not exist after FFmpeg completion.');
    }

    let audioSize = (await fs.promises.stat(tempAudioPath)).size;

    // If extracted MP3 exceeds 24MB, automatically re-encode at 32 kbps mono (enables up to 105 min podcasts under 25MB)
    if (firstBitrate === 64 && audioSize > reencodeAboveBytes) {
      logger.warn(
        `Extracted audio (${(audioSize / (1024 * 1024)).toFixed(2)} MB) exceeds ${(reencodeAboveBytes / (1024 * 1024)).toFixed(0)} MB; re-encoding at 32 kbps mono for Whisper compliance.`
      );
      try {
        if (fs.existsSync(tempAudioPath)) {
          fs.unlinkSync(tempAudioPath);
        }
      } catch {}

      await extractWithBitrate(32);
      audioSize = (await fs.promises.stat(tempAudioPath)).size;
    }

    if (audioSize > maxAudioBytes) {
      throw new Error(`Extracted audio exceeds the transcription provider limit of ${(maxAudioBytes / (1024 * 1024)).toFixed(0)} MB. Please provide a shorter video.`);
    }
    const audioBuffer = await fs.promises.readFile(tempAudioPath);
    if (audioBuffer.length === 0) {
      throw new Error('Extracted audio file is empty (0 bytes).');
    }

    // Clean up temporary input video immediately if we own it to save disk space
    try {
      if (ownsTempVideo && fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
    } catch {
      // Ignore
    }

    logger.info(
      `Audio extracted: ${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB (reduced from ${(sourceSize / (1024 * 1024)).toFixed(2)} MB video)`
    );

    return {
      audioBuffer,
      audioPath: tempAudioPath,
      format: 'mp3',
      cleanup,
      avStartTimes,
    };
  } catch (err) {
    cleanup();
    throw err;
  }
}
