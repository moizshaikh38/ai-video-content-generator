import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

export type VideoEncoderCodec = 'h264_qsv' | 'h264_nvenc' | 'libx264';

export interface EncoderCapabilities {
  preferredCodec: VideoEncoderCodec;
  isHardwareAccelerated: boolean;
  qsvAvailable: boolean;
  nvencAvailable: boolean;
  lastCheckedAt: number;
}

export interface EncoderFlags {
  codec: VideoEncoderCodec;
  isHardware: boolean;
  initArgs: string[];
  videoCodecArgs: string[];
  qualityArgs: string[];
}

/**
 * HardwareEncoderService provides dynamic runtime discovery, capability validation,
 * and resilient fallback for GPU video encoding.
 *
 * Supported encoders (in evaluation order):
 * 1. Intel QuickSync Video (`h264_qsv`): tested via hardware device initialization.
 * 2. NVIDIA NVENC (`h264_nvenc`): tested via driver probe.
 * 3. Software reference (`libx264`): guaranteed universal fallback.
 */
export class HardwareEncoderService {
  private static cachedCapabilities: EncoderCapabilities | null = null;
  private static probePromise: Promise<EncoderCapabilities> | null = null;

  /**
   * Probes hardware encoding capabilities with a fast, non-blocking 1-frame test.
   * Caches result in memory for the lifetime of the process.
   */
  public static async getCapabilities(forceRefresh = false): Promise<EncoderCapabilities> {
    if (!forceRefresh && this.cachedCapabilities) {
      return this.cachedCapabilities;
    }

    if (this.probePromise) {
      return this.probePromise;
    }

    this.probePromise = this.probeHardwareEncoders();
    try {
      this.cachedCapabilities = await this.probePromise;
      return this.cachedCapabilities;
    } finally {
      this.probePromise = null;
    }
  }

  private static async probeHardwareEncoders(): Promise<EncoderCapabilities> {
    let qsvAvailable = false;
    let nvencAvailable = false;

    // 1. Probe Intel QSV
    try {
      await execFileAsync(
        ffmpegBin,
        [
          '-v', 'error',
          '-init_hw_device', 'qsv=hw',
          '-filter_hw_device', 'hw',
          '-f', 'lavfi',
          '-i', 'nullsrc=s=128x128:d=0.04',
          '-c:v', 'h264_qsv',
          '-f', 'null',
          '-',
        ],
        { timeout: 5000 }
      );
      qsvAvailable = true;
      logger.info('[HardwareEncoder] Intel QuickSync (h264_qsv) verified and active.');
    } catch {
      // Intel QSV probe unavailable
    }

    // 2. Probe NVIDIA NVENC
    try {
      await execFileAsync(
        ffmpegBin,
        [
          '-v', 'error',
          '-f', 'lavfi',
          '-i', 'nullsrc=s=128x128:d=0.04',
          '-c:v', 'h264_nvenc',
          '-f', 'null',
          '-',
        ],
        { timeout: 5000 }
      );
      nvencAvailable = true;
      logger.info('[HardwareEncoder] NVIDIA NVENC (h264_nvenc) verified and active.');
    } catch {
      // NVIDIA NVENC probe unavailable
    }

    // Determine preferred encoder
    let preferredCodec: VideoEncoderCodec = 'libx264';
    if (qsvAvailable) {
      preferredCodec = 'h264_qsv';
    } else if (nvencAvailable) {
      preferredCodec = 'h264_nvenc';
    }

    const caps: EncoderCapabilities = {
      preferredCodec,
      isHardwareAccelerated: preferredCodec !== 'libx264',
      qsvAvailable,
      nvencAvailable,
      lastCheckedAt: Date.now(),
    };

    logger.info(`[HardwareEncoder] Active encoder selected: ${caps.preferredCodec} (hardware: ${caps.isHardwareAccelerated})`);
    return caps;
  }

  /**
   * Builds FFmpeg argument flags for the requested or auto-detected codec.
   */
  public static async getEncoderFlags(requestedCodec?: VideoEncoderCodec | 'auto'): Promise<EncoderFlags> {
    const caps = await this.getCapabilities();
    let targetCodec: VideoEncoderCodec;

    if (!requestedCodec || requestedCodec === 'auto') {
      targetCodec = caps.preferredCodec;
    } else {
      targetCodec = requestedCodec;
    }

    switch (targetCodec) {
      case 'h264_qsv':
        return {
          codec: 'h264_qsv',
          isHardware: true,
          initArgs: ['-init_hw_device', 'qsv=hw', '-filter_hw_device', 'hw'],
          videoCodecArgs: ['-c:v', 'h264_qsv'],
          qualityArgs: ['-preset', 'faster', '-global_quality', '23'],
        };
      case 'h264_nvenc':
        return {
          codec: 'h264_nvenc',
          isHardware: true,
          initArgs: [],
          videoCodecArgs: ['-c:v', 'h264_nvenc'],
          qualityArgs: ['-preset', 'p4', '-cq', '23'],
        };
      case 'libx264':
      default:
        return {
          codec: 'libx264',
          isHardware: false,
          initArgs: [],
          videoCodecArgs: ['-c:v', 'libx264'],
          qualityArgs: ['-preset', config.renderPreset || 'faster', '-crf', '22'],
        };
    }
  }

  /**
   * Resilient execution wrapper:
   * Executes a render closure with the optimal hardware encoder.
   * If hardware encoder fails during execution, automatically catches the error,
   * resets device context, and retries with software libx264 fallback.
   */
  public static async executeWithFallback<T>(
    renderFn: (flags: EncoderFlags) => Promise<T>,
    requestedCodec?: VideoEncoderCodec | 'auto'
  ): Promise<T> {
    const primaryFlags = await this.getEncoderFlags(requestedCodec);

    try {
      return await renderFn(primaryFlags);
    } catch (primaryErr: any) {
      if (!primaryFlags.isHardware) {
        // Already software, cannot fall back further
        throw primaryErr;
      }

      logger.warn(`[HardwareEncoder] Hardware render with ${primaryFlags.codec} failed: ${primaryErr.message}. Falling back to libx264 software encoder.`);

      const fallbackFlags: EncoderFlags = {
        codec: 'libx264',
        isHardware: false,
        initArgs: [],
        videoCodecArgs: ['-c:v', 'libx264'],
        qualityArgs: ['-preset', config.renderPreset || 'faster', '-crf', '22'],
      };

      return await renderFn(fallbackFlags);
    }
  }

  /**
   * Test hook: clears cache for unit tests.
   */
  public static clearCache(): void {
    this.cachedCapabilities = null;
    this.probePromise = null;
  }
}
