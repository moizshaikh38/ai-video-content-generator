import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '../utils/logger.js';

// Configure fluent-ffmpeg to use ffmpeg-static binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
  logger.info(`[Audio Extraction] Configured FFmpeg static binary at: ${ffmpegStatic}`);
} else {
  logger.warn('[Audio Extraction] ffmpegStatic path not resolved; relying on system PATH for ffmpeg.');
}

export interface ExtractedAudioResult {
  audioBuffer: Buffer;
  audioPath: string;
  format: 'mp3';
  cleanup: () => void;
}

/**
 * Extracts an MP3 audio track from a video buffer using FFmpeg.
 * Writes temporary files into the OS temp directory, runs extraction,
 * reads the audio buffer, and cleans up the temporary video file.
 * The cleanup function is returned to clean up the temporary audio file when finished.
 */
export async function extractAudioFromVideo(
  videoBuffer: Buffer,
  originalFileName: string
): Promise<ExtractedAudioResult> {
  const tempDir = os.tmpdir();
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const ext = path.extname(originalFileName) || '.mp4';
  const tempVideoPath = path.join(tempDir, `vireo_in_${uniqueId}${ext}`);
  const tempAudioPath = path.join(tempDir, `vireo_out_${uniqueId}.mp3`);

  logger.info(`[Audio Extraction] Writing video buffer to temporary file: ${tempVideoPath}`);
  await fs.promises.writeFile(tempVideoPath, videoBuffer);

  const cleanup = () => {
    try {
      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
    } catch (e: any) {
      logger.warn(`[Audio Extraction] Failed to remove temp video: ${e.message}`);
    }
    try {
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }
    } catch (e: any) {
      logger.warn(`[Audio Extraction] Failed to remove temp audio: ${e.message}`);
    }
  };

  try {
    logger.info(`[Audio Extraction] Extracting audio with FFmpeg: ${tempVideoPath} -> ${tempAudioPath}`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate(128)
        .audioChannels(1) // Mono for speech recognition efficiency
        .audioFrequency(16000) // 16kHz optimal for Whisper speech-to-text
        .format('mp3')
        .on('start', (cmdLine) => {
          logger.info(`[Audio Extraction] FFmpeg command: ${cmdLine}`);
        })
        .on('error', (err) => {
          logger.error(`[Audio Extraction] FFmpeg processing error: ${err.message}`);
          reject(new Error(`FFmpeg audio extraction failed: ${err.message}`));
        })
        .on('end', () => {
          logger.info('[Audio Extraction] FFmpeg processing finished successfully.');
          resolve();
        })
        .save(tempAudioPath);
    });

    if (!fs.existsSync(tempAudioPath)) {
      throw new Error('Extracted audio file does not exist after FFmpeg completion.');
    }

    const audioBuffer = await fs.promises.readFile(tempAudioPath);
    if (audioBuffer.length === 0) {
      throw new Error('Extracted audio file is empty (0 bytes).');
    }

    // Clean up input video immediately to save disk space
    try {
      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
    } catch {
      // Ignore
    }

    logger.info(
      `[Audio Extraction] Audio extracted: ${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB (reduced from ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB video)`
    );

    return {
      audioBuffer,
      audioPath: tempAudioPath,
      format: 'mp3',
      cleanup,
    };
  } catch (err: any) {
    cleanup();
    throw err;
  }
}
