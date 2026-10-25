import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

/**
 * Hardware encoder detection (performance roadmap, Phase 5).
 * Detects available hardware H.264 encoders at startup (cached); returns the
 * best available encoder name and the codec args to use. Falls back to
 * libx264 software encoding with CRF when no hardware encoder is found.
 */

export interface EncoderInfo {
  /** FFmpeg codec name: 'h264_videotoolbox', 'h264_nvenc', 'h264_qsv', or 'libx264'. */
  codec: string;
  /** Whether this is a hardware encoder. */
  hardware: boolean;
}

let cached: EncoderInfo | null = null;

/** The priority order: macOS → NVIDIA → Intel → software fallback. */
const HW_PRIORITY: Array<{ codec: string; match: RegExp }> = [
  { codec: 'h264_videotoolbox', match: /videotoolbox/ },
  { codec: 'h264_nvenc', match: /nvenc/ },
  { codec: 'h264_qsv', match: /qsv/ },
];

export async function detectBestEncoder(force = false): Promise<EncoderInfo> {
  if (cached && !force) return cached;
  try {
    const { stdout } = await execFileAsync(ffmpegBin, ['-hide_banner', '-encoders'], { timeout: 10_000 });
    for (const hw of HW_PRIORITY) {
      if (hw.match.test(stdout)) {
        cached = { codec: hw.codec, hardware: true };
        return cached;
      }
    }
  } catch {
    // ffmpeg-static binary path issue — fall through to software.
  }
  cached = { codec: 'libx264', hardware: false };
  return cached;
}

/**
 * Returns the video codec args for a render. For hardware encoders, uses
 * bitrate mode (hardware encoders don't honor CRF); for libx264, uses CRF.
 */
export function getVideoCodecArgs(encoder: EncoderInfo, crf: number, hwBitrate: string): string[] {
  if (encoder.hardware) {
    return ['-c:v', encoder.codec, '-b:v', hwBitrate, '-maxrate', `${parseInt(hwBitrate) * 15}k`, '-bufsize', `${parseInt(hwBitrate) * 3}k`];
  }
  return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf)];
}
