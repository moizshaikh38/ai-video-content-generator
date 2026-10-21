import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AppError, ClipPreferences, ContentGenre } from '../types/index.js';
import { UrlValidator } from '../utils/urlValidator.js';
import { uploadFile, sourceObjectKey } from './objectStorageService.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { GenreIntelligenceService } from './genreIntelligenceService.js';

const execFileAsync = promisify(execFile);

export interface IngestUrlOptions {
  userId: string;
  projectId?: string;
  url: string;
  title?: string;
  notes?: string;
  clipPreferences?: Partial<ClipPreferences>;
  startTimeSec?: number;
  endTimeSec?: number;
}

export interface IngestUrlResult {
  projectId: string;
  title: string;
  sourceUrl: string;
  fileSize: number;
  durationSeconds: number;
  mimeType: string;
  sourceType: 'url';
}

export interface VideoStreamProbe {
  hasVideo: boolean;
  hasAudio: boolean;
  durationSeconds: number;
  width?: number;
  height?: number;
  codec?: string;
  fps?: number;
  formatName?: string;
}

export interface YouTubeMetadataResult {
  title?: string;
  duration?: number;
  videoId?: string;
  thumbnail?: string;
  channel?: string;
  description?: string;
  categories?: string[];
  tags?: string[];
  chapters?: Array<{ title: string; start_time: number; end_time: number }>;
  suggestedGenre?: ContentGenre;
  genreConfidence?: number;
}

export interface UrlProbeMetadataResult {
  provider: 'youtube' | 'direct';
  normalizedUrl: string;
  title?: string;
  duration?: number;
  thumbnail?: string;
  channel?: string;
  description?: string;
  categories?: string[];
  tags?: string[];
  chapters?: Array<{ title: string; start_time: number; end_time: number }>;
  suggestedGenre?: ContentGenre;
  genreConfidence?: number;
  contentLength?: number;
  contentType?: string;
}

export class UrlIngestionService {
  /**
   * Probes video metadata (duration, streams, codecs, fps) using ffmpeg CLI.
   */
  public static async probeVideoFile(filePath: string): Promise<VideoStreamProbe> {
    if (!fs.existsSync(filePath)) {
      throw new AppError('Could not verify media streams in the downloaded file.', 400, 'INVALID_MEDIA');
    }

    const ffmpegPath = (ffmpegStatic as unknown as string) || 'ffmpeg';

    try {
      // Execute ffmpeg -i <file> and inspect stderr output
      const { stderr } = await execFileAsync(ffmpegPath, ['-i', filePath], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      }).catch((err) => {
        // ffmpeg exits with code 1 when no output file is given, but stderr contains the full stream info
        return { stderr: err.stderr || err.stdout || '' };
      });

      const output = String(stderr || '');

      // Parse duration: Duration: 00:00:06.02, start: ...
      const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
      let durationSeconds = 0;
      if (durationMatch) {
        const hours = parseFloat(durationMatch[1]);
        const minutes = parseFloat(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        durationSeconds = hours * 3600 + minutes * 60 + seconds;
      }

      const hasVideo = /Stream #\d+:\d+.*Video:/i.test(output);
      const hasAudio = /Stream #\d+:\d+.*Audio:/i.test(output);

      if (output.includes('Invalid data found when processing input') || (!hasVideo && !hasAudio)) {
        throw new AppError('Could not verify media streams in the downloaded file.', 400, 'INVALID_MEDIA');
      }

      // Extract specific video stream line for isolated parsing
      const videoStreamLine = output.split('\n').find((line) => /Stream #\d+:\d+.*Video:/i.test(line)) || '';

      // Extract resolution if video stream present (e.g., 720x1280 or 1920x1080)
      const resMatch =
        videoStreamLine.match(/(?:,\s*|\s+)(\d{2,5})x(\d{2,5})(?:\s*\[|\s*,|\s+|$)/) ||
        output.match(/Stream #\d+:\d+.*Video:.*,\s*(\d{2,5})x(\d{2,5})/i) ||
        output.match(/(\d{2,5})x(\d{2,5})/);
      const width = resMatch ? parseInt(resMatch[1], 10) : undefined;
      const height = resMatch ? parseInt(resMatch[2], 10) : undefined;

      // Extract codec name (e.g., h264, vp9, av1, hevc)
      let codec: string | undefined = undefined;
      const codecMatch = videoStreamLine.match(/Video:\s*([^,\s(]+)/i);
      if (codecMatch) {
        const rawCodec = codecMatch[1].toLowerCase();
        if (rawCodec.startsWith('av01') || rawCodec.startsWith('av1')) {
          codec = 'av1';
        } else if (rawCodec.startsWith('vp09') || rawCodec.startsWith('vp9')) {
          codec = 'vp9';
        } else {
          codec = rawCodec;
        }
      }

      // Extract fps if present
      let fps: number | undefined = undefined;
      const fpsMatch = videoStreamLine.match(/(\d+(?:\.\d+)?)\s*fps/i);
      if (fpsMatch) {
        fps = parseFloat(fpsMatch[1]);
      }

      return {
        hasVideo,
        hasAudio,
        durationSeconds: Number(durationSeconds.toFixed(2)),
        width,
        height,
        codec,
        fps,
      };
    } catch (err: any) {
      logger.error('Failed to probe video file with ffmpeg', { error: err.message, filePath });
      throw new AppError('Could not verify media streams in the downloaded file.', 400, 'INVALID_MEDIA');
    }
  }

  /**
   * Downloads a video from a validated URL with redirect verification, byte limit tracking, and timeout.
   */
  public static async downloadToTempFile(
    initialUrl: string,
    maxBytes: number = config.maxVideoBytes,
    timeoutMs: number = 60000
  ): Promise<{ tempFilePath: string; totalBytes: number; contentType: string }> {
    const tempDir = os.tmpdir();
    const tempFileName = `vireo-ingest-${Date.now()}-${crypto.randomUUID()}.tmp`;
    const tempFilePath = path.join(tempDir, tempFileName);

    let currentUrl = initialUrl;
    let redirectCount = 0;
    const maxRedirects = 5;

    let response: Response | null = null;

    const streamController = new AbortController();
    let streamTimer: NodeJS.Timeout | null = null;

    const resetStreamTimer = () => {
      if (streamTimer) clearTimeout(streamTimer);
      streamTimer = setTimeout(() => {
        streamController.abort(new Error('STREAM_TIMEOUT'));
      }, timeoutMs);
    };

    resetStreamTimer();

    // Follow redirects manually to validate SSRF on every hop
    while (redirectCount <= maxRedirects) {
      if (streamController.signal.aborted) {
        throw new AppError('Video download timed out. Please verify the URL host or choose a smaller file.', 408, 'DOWNLOAD_TIMEOUT');
      }

      try {
        response = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: streamController.signal,
          headers: {
            'User-Agent': 'VireoClip/1.0 (Media Ingestion; +https://vireoclip.ai)',
            Accept: 'video/*,*/*;q=0.8',
          },
        });
        resetStreamTimer();
      } catch (fetchErr: any) {
        if (fetchErr.name === 'AbortError' || streamController.signal.aborted) {
          throw new AppError('Video download timed out. Please verify the URL host or choose a smaller file.', 408, 'DOWNLOAD_TIMEOUT');
        }
        throw new AppError(`Failed to connect to video host: ${fetchErr.message}`, 502, 'HOST_CONNECTION_FAILED');
      }

      // Check for redirect (301, 302, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new AppError('Redirect response was missing Location header.', 502, 'REDIRECT_FAILED');
        }

        const nextUrl = new URL(location, currentUrl).toString();
        // Re-validate target URL for SSRF before following
        await UrlValidator.validateVideoUrl(nextUrl);

        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      break;
    }

    if (!response || !response.ok) {
      if (streamTimer) clearTimeout(streamTimer);
      const status = response?.status || 502;
      throw new AppError(`Remote server returned HTTP ${status} when fetching video.`, 502, 'REMOTE_FETCH_FAILED');
    }

    // Check declared Content-Length
    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const declaredBytes = parseInt(contentLengthHeader, 10);
      if (!isNaN(declaredBytes) && declaredBytes > maxBytes) {
        if (streamTimer) clearTimeout(streamTimer);
        streamController.abort();
        throw new AppError(
          `Video exceeds maximum allowed file size of ${Math.round(maxBytes / (1024 * 1024))} MB.`,
          400,
          'FILE_SIZE_EXCEEDED'
        );
      }
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';

    // Stream to disk and strictly track downloaded byte count
    const body = response.body;
    if (!body) {
      if (streamTimer) clearTimeout(streamTimer);
      throw new AppError('Empty response body from remote server.', 502, 'EMPTY_RESPONSE');
    }

    const fileStream = fs.createWriteStream(tempFilePath, { flags: 'wx' });
    let bytesWritten = 0;

    try {
      const reader = body.getReader();

      while (true) {
        if (streamController.signal.aborted) {
          throw new AppError(
            'Video download timed out. Please verify the URL host or choose a smaller file.',
            408,
            'DOWNLOAD_TIMEOUT'
          );
        }

        const { done, value } = await reader.read();
        resetStreamTimer();

        if (done) break;

        bytesWritten += value.length;
        if (bytesWritten > maxBytes) {
          streamController.abort();
          throw new AppError(
            `Downloaded video exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`,
            400,
            'FILE_SIZE_EXCEEDED'
          );
        }

        // Respect WriteStream backpressure: when buffer is full, wait for 'drain' before reading next chunk
        const canWriteMore = fileStream.write(Buffer.from(value));
        if (!canWriteMore) {
          await new Promise<void>((resolve, reject) => {
            const onDrain = () => {
              fileStream.removeListener('error', onError);
              resolve();
            };
            const onError = (err: Error) => {
              fileStream.removeListener('drain', onDrain);
              reject(err);
            };
            fileStream.once('drain', onDrain);
            fileStream.once('error', onError);
          });
          resetStreamTimer();
        }
      }

      if (streamTimer) clearTimeout(streamTimer);

      await new Promise<void>((resolve, reject) => {
        fileStream.end(() => resolve());
        fileStream.on('error', reject);
      });

      return {
        tempFilePath,
        totalBytes: bytesWritten,
        contentType,
      };
    } catch (streamErr: any) {
      if (streamTimer) clearTimeout(streamTimer);
      try {
        streamController.abort();
      } catch {}
      fileStream.destroy();
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {
        // cleanup ignore
      }

      if (streamErr instanceof AppError) {
        throw streamErr;
      }

      if (
        streamErr.name === 'AbortError' ||
        streamErr.code === 'DOWNLOAD_TIMEOUT' ||
        streamController.signal.aborted ||
        streamErr.message?.includes('STREAM_TIMEOUT')
      ) {
        throw new AppError(
          'Video download timed out. Please verify the URL host or choose a smaller file.',
          408,
          'DOWNLOAD_TIMEOUT'
        );
      }
      throw streamErr;
    }
  }

  /**
   * Resolves the path to the Python executable capable of running yt-dlp.
   */
  public static getPythonPath(): string {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
      return process.env.PYTHON_PATH;
    }
    const candidates = [
      path.resolve(process.cwd(), 'python_embed/python.exe'),
      path.resolve(process.cwd(), 'server/python_embed/python.exe'),
      path.resolve(process.cwd(), '../server/python_embed/python.exe'),
      path.resolve(process.cwd(), 'server/python/.venv/Scripts/python.exe'),
      path.resolve(process.cwd(), 'python/.venv/Scripts/python.exe'),
      path.resolve(process.cwd(), 'server/python/.venv/bin/python'),
      path.resolve(process.cwd(), 'python/.venv/bin/python'),
      path.resolve(process.cwd(), '../server/python/.venv/bin/python'),
      'python3',
      'python',
    ];

    for (const c of candidates) {
      if ((c.includes('/') || c.includes('\\')) && fs.existsSync(c)) {
        return c;
      }
    }
    return 'python3';
  }

  /**
   * Resolves the command and prefix arguments required to invoke yt-dlp,
   * supporting standalone yt-dlp executables, venv binaries, and Python module execution ('-m yt_dlp').
   */
  public static resolveYtDlpCommand(): { command: string; prefixArgs: string[] } {
    if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
      return { command: process.env.YT_DLP_PATH, prefixArgs: [] };
    }

    const standaloneCandidates = [
      path.resolve(process.cwd(), 'yt-dlp'),
      path.resolve(process.cwd(), 'server/yt-dlp'),
      path.resolve(process.cwd(), '../server/yt-dlp'),
      path.resolve(process.cwd(), 'yt-dlp.exe'),
      path.resolve(process.cwd(), 'server/yt-dlp.exe'),
      path.resolve(process.cwd(), 'python/.venv/bin/yt-dlp'),
      path.resolve(process.cwd(), 'server/python/.venv/bin/yt-dlp'),
      path.resolve(process.cwd(), '../server/python/.venv/bin/yt-dlp'),
      path.resolve(process.cwd(), 'python/.venv/Scripts/yt-dlp.exe'),
      path.resolve(process.cwd(), 'server/python/.venv/Scripts/yt-dlp.exe'),
    ];

    for (const bin of standaloneCandidates) {
      if (fs.existsSync(bin)) {
        return { command: bin, prefixArgs: [] };
      }
    }

    const pythonBin = this.getPythonPath();
    return { command: pythonBin, prefixArgs: ['-m', 'yt_dlp'] };
  }

  /**
   * Resolves a cookies file if provided via environment variable, file path, or secret.
   */
  private static getCookiesFilePath(): string | null {
    if (config.youtubeCookiesPath && fs.existsSync(config.youtubeCookiesPath)) {
      return config.youtubeCookiesPath;
    }
    const directPath = path.resolve(process.cwd(), 'cookies.txt');
    if (fs.existsSync(directPath)) {
      return directPath;
    }
    const serverPath = path.resolve(process.cwd(), 'server/cookies.txt');
    if (fs.existsSync(serverPath)) {
      return serverPath;
    }

    const content = config.youtubeCookiesContent?.trim();
    if (content) {
      try {
        const dest = path.join(os.tmpdir(), 'vireo-yt-cookies.txt');
        let rawContent = content;
        if (!content.includes('\n') && content.length > 20) {
          try {
            const decoded = Buffer.from(content, 'base64').toString('utf8');
            if (decoded.includes('\t') || decoded.includes('cookie') || decoded.includes('Netscape')) {
              rawContent = decoded;
            }
          } catch {}
        }
        fs.writeFileSync(dest, rawContent, { mode: 0o600 });
        return dest;
      } catch (err: any) {
        logger.warn('Failed to write temporary YouTube cookies file', { error: err.message });
      }
    }

    return null;
  }

  /**
   * Common yt-dlp arguments optimized for datacenter and cloud provider resilience.
   * Uses mobile and TV player clients to bypass aggressive datacenter web challenges.
   */
  private static getCommonYtDlpArgs(): string[] {
    const playerClient = process.env.YOUTUBE_PLAYER_CLIENT || 'android,ios';
    const commonArgs = [
      '--no-warnings',
      '--no-playlist',
      '--socket-timeout', '20',
      '--extractor-args', `youtube:player_client=${playerClient}`,
    ];

    const cookiesFile = this.getCookiesFilePath();
    if (cookiesFile) {
      commonArgs.push('--cookies', cookiesFile);
    }

    if (config.youtubeProxy) {
      commonArgs.push('--proxy', config.youtubeProxy);
    }

    return commonArgs;
  }

  /**
   * Fetches metadata for a public YouTube video using yt-dlp without downloading media.
   * Extracts rich metadata (chapters, categories, tags, channel, thumbnail) and computes
   * local genre suggestions.
   */
  public static async fetchYouTubeMetadata(
    url: string,
    timeoutMs = 25000
  ): Promise<YouTubeMetadataResult> {
    const { command: dlCommand, prefixArgs } = this.resolveYtDlpCommand();
    const commonArgs = this.getCommonYtDlpArgs();
    const args = [...prefixArgs, ...commonArgs, '--dump-json', '--skip-download', url];

    try {
      const { stdout } = await execFileAsync(dlCommand, args, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });

      const info = JSON.parse(stdout);

      const title = typeof info.title === 'string' ? info.title.trim() : undefined;
      const duration = typeof info.duration === 'number' ? info.duration : undefined;
      const videoId = typeof info.id === 'string' ? info.id : undefined;

      const thumbnail =
        typeof info.thumbnail === 'string'
          ? info.thumbnail
          : Array.isArray(info.thumbnails) && info.thumbnails.length > 0
          ? info.thumbnails[info.thumbnails.length - 1]?.url
          : undefined;

      const channel =
        typeof info.uploader === 'string' && info.uploader.trim()
          ? info.uploader.trim()
          : typeof info.channel === 'string' && info.channel.trim()
          ? info.channel.trim()
          : undefined;

      const description =
        typeof info.description === 'string'
          ? info.description.slice(0, 1000).trim()
          : undefined;

      const categories = Array.isArray(info.categories)
        ? info.categories.map((c: any) => String(c).trim()).filter(Boolean)
        : undefined;

      const tags = Array.isArray(info.tags)
        ? info.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 25)
        : undefined;

      const chapters = Array.isArray(info.chapters)
        ? info.chapters
            .map((ch: any) => ({
              title: String(ch.title || '').trim(),
              start_time: Number(ch.start_time || 0),
              end_time: Number(ch.end_time || 0),
            }))
            .filter((ch: any) => ch.title && ch.end_time > ch.start_time)
        : undefined;

      let suggestedGenre: ContentGenre | undefined = undefined;
      let genreConfidence: number | undefined = undefined;

      const combinedText = [
        title,
        description,
        ...(categories || []),
        ...(tags || []),
        ...(chapters ? chapters.map((c: { title: string }) => c.title) : []),
      ]
        .filter(Boolean)
        .join(' ');

      if (combinedText.trim()) {
        try {
          const suggestion = GenreIntelligenceService.classifyVideoGenreLocally({
            transcriptText: combinedText,
          });
          suggestedGenre = suggestion.genre;
          genreConfidence = suggestion.confidence;
        } catch {
          // Fallback ignore
        }
      }

      return {
        title,
        duration,
        videoId,
        thumbnail,
        channel,
        description,
        categories,
        tags,
        chapters,
        suggestedGenre,
        genreConfidence,
      };
    } catch (err: any) {
      const stderr = String(err.stderr || '');
      logger.warn('yt-dlp metadata probe warning', { error: err.message, stderr });

      if (
        stderr.includes('Sign in to confirm you’re not a bot') ||
        stderr.includes("Sign in to confirm you're not a bot") ||
        stderr.includes('bot detection')
      ) {
        throw new AppError(
          'YouTube is temporarily blocking datacenter requests (bot challenge). Please configure YOUTUBE_COOKIES in Render settings or upload the video directly.',
          429,
          'YOUTUBE_RATE_LIMITED'
        );
      }
      if (stderr.includes('Private video') || stderr.includes('Sign in if you') || stderr.includes('this video is private')) {
        throw new AppError('This YouTube video is private and cannot be imported.', 400, 'YOUTUBE_PRIVATE_VIDEO');
      }
      if (stderr.includes('Video unavailable') || stderr.includes('This video is unavailable') || stderr.includes('has been removed')) {
        throw new AppError('This YouTube video is unavailable or has been removed.', 400, 'YOUTUBE_VIDEO_UNAVAILABLE');
      }
      if (
        stderr.includes('age-restricted') ||
        stderr.includes('confirm your age') ||
        stderr.includes('Sign in to confirm your age') ||
        stderr.includes('Sign in to view this video')
      ) {
        throw new AppError('This YouTube video has access or age restrictions and cannot be imported.', 400, 'YOUTUBE_ACCESS_RESTRICTED');
      }

      // If metadata probe fails for non-fatal reasons, return empty object so download step can try
      return {};
    }
  }

  /**
   * Downloads a public YouTube video to a bounded local temporary MP4 file using yt-dlp and FFmpeg.
   * Prefers fast H.264 video with AAC audio, supports concurrent fragments, and handles partial range windows.
   */
  public static async downloadYouTubeToTempFile(
    url: string,
    maxBytes: number = config.maxVideoBytes,
    timeoutMs: number = 120000,
    range?: { startSec?: number; endSec?: number }
  ): Promise<{ tempFilePath: string; totalBytes: number; contentType: string; title?: string }> {
    const tempDir = os.tmpdir();
    const uniqueId = `yt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const outTemplate = path.join(tempDir, `${uniqueId}.%(ext)s`);
    const expectedMp4 = path.join(tempDir, `${uniqueId}.mp4`);

    const { command: dlCommand, prefixArgs } = this.resolveYtDlpCommand();
    const commonArgs = this.getCommonYtDlpArgs();
    const ffmpegPath = (ffmpegStatic as unknown as string) || 'ffmpeg';
    const ffmpegDir = path.dirname(ffmpegPath);

    // Format selection: prefer hardware/FFmpeg-friendly H.264 (avc1) with m4a audio, falling back gracefully
    const formatSpec =
      'bestvideo[ext=mp4][vcodec^=avc1][height<=1080]+bestaudio[ext=m4a]/bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/best[height<=1080]/best';

    const args = [
      ...prefixArgs,
      ...commonArgs,
      '--concurrent-fragments', '4',
      '--ffmpeg-location', ffmpegDir,
      '-f', formatSpec,
      '--merge-output-format', 'mp4',
      '--max-filesize', `${Math.round(maxBytes / (1024 * 1024))}M`,
    ];

    if (range && (range.startSec !== undefined || range.endSec !== undefined)) {
      const s = Math.max(0, range.startSec ?? 0);
      const e = range.endSec !== undefined ? range.endSec : 'inf';
      if (typeof e === 'number' && e > s) {
        const windowDur = e - s;
        if (windowDur > 7200) {
          throw new AppError('Video duration exceeds the maximum allowed limit of 2 hours.', 400, 'YOUTUBE_DURATION_TOO_LONG');
        }
      }
      args.push('--download-sections', `*${s}-${e}`, '--force-keyframes-at-cuts');
    }

    args.push('-o', outTemplate, url);

    logger.info(`Starting YouTube download via yt-dlp: ${url} (maxBytes: ${maxBytes}, range: ${JSON.stringify(range || 'full')})`);

    try {
      await execFileAsync(dlCommand, args, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (dlErr: any) {
      // Find and delete any incomplete fragments
      try {
        const files = fs.readdirSync(tempDir).filter((f) => f.startsWith(uniqueId));
        for (const f of files) {
          fs.unlinkSync(path.join(tempDir, f));
        }
      } catch {}

      const stderr = String(dlErr.stderr || '');
      logger.error('yt-dlp download failed', { error: dlErr.message, stderr });

      if (dlErr.killed || dlErr.code === 'ETIMEDOUT' || dlErr.signal === 'SIGTERM') {
        throw new AppError('YouTube download timed out. The video took too long to download.', 408, 'YOUTUBE_TIMEOUT');
      }
      if (stderr.includes('File is larger than max-filesize') || stderr.includes('max-filesize')) {
        throw new AppError(`YouTube video exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`, 400, 'YOUTUBE_FILE_TOO_LARGE');
      }
      if (stderr.includes('Private video') || stderr.includes('this video is private')) {
        throw new AppError('This YouTube video is private and cannot be imported.', 400, 'YOUTUBE_PRIVATE_VIDEO');
      }
      if (stderr.includes('Video unavailable') || stderr.includes('This video is unavailable')) {
        throw new AppError('This YouTube video is unavailable.', 400, 'YOUTUBE_VIDEO_UNAVAILABLE');
      }
      if (
        stderr.includes('Sign in to confirm you’re not a bot') ||
        stderr.includes("Sign in to confirm you're not a bot") ||
        stderr.includes('bot detection')
      ) {
        throw new AppError(
          'YouTube is temporarily blocking datacenter requests (bot challenge). Please configure YOUTUBE_COOKIES in Render settings or upload the video directly.',
          429,
          'YOUTUBE_RATE_LIMITED'
        );
      }
      if (
        stderr.includes('age-restricted') ||
        stderr.includes('confirm your age') ||
        stderr.includes('Sign in to confirm your age') ||
        stderr.includes('Sign in to view this video')
      ) {
        throw new AppError('This YouTube video has access or age restrictions and cannot be imported.', 400, 'YOUTUBE_ACCESS_RESTRICTED');
      }
      if (
        stderr.includes('No module named yt_dlp') ||
        dlErr.message.includes('ENOENT') ||
        dlErr.message.includes('not found') ||
        stderr.includes('command not found')
      ) {
        throw new AppError('YouTube downloader utility is not configured or available on the server.', 500, 'YOUTUBE_DOWNLOADER_UNAVAILABLE');
      }

      throw new AppError('Could not download this YouTube video. Please verify that the video is publicly accessible.', 400, 'YOUTUBE_DOWNLOAD_FAILED');
    }

    // Identify final merged output file
    let finalPath = expectedMp4;
    if (!fs.existsSync(finalPath)) {
      // Check if yt-dlp left .mkv or other extension
      const matches = fs.readdirSync(tempDir).filter((f) => f.startsWith(uniqueId));
      if (matches.length > 0) {
        finalPath = path.join(tempDir, matches[0]);
      } else {
        throw new AppError('Downloaded YouTube video file was not generated.', 500, 'YOUTUBE_DOWNLOAD_FAILED');
      }
    }

    const stats = fs.statSync(finalPath);
    if (stats.size === 0) {
      try { fs.unlinkSync(finalPath); } catch {}
      throw new AppError('Downloaded YouTube video file is empty.', 500, 'YOUTUBE_DOWNLOAD_FAILED');
    }

    if (stats.size > maxBytes) {
      try { fs.unlinkSync(finalPath); } catch {}
      throw new AppError(`Downloaded YouTube video exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`, 400, 'YOUTUBE_FILE_TOO_LARGE');
    }

    return {
      tempFilePath: finalPath,
      totalBytes: stats.size,
      contentType: 'video/mp4',
    };
  }

  /**
   * Lightweight pre-ingest URL probe returning video metadata and auto-suggested genre in ~1s
   * without downloading the media payload.
   */
  public static async probeUrlMetadata(url: string, timeoutMs = 15000): Promise<UrlProbeMetadataResult> {
    const validated = await UrlValidator.validateVideoUrl(url);

    if (validated.provider === 'youtube') {
      const meta = await this.fetchYouTubeMetadata(validated.normalizedUrl, timeoutMs);
      return {
        provider: 'youtube',
        normalizedUrl: validated.normalizedUrl,
        title: meta.title,
        duration: meta.duration,
        thumbnail: meta.thumbnail,
        channel: meta.channel,
        description: meta.description,
        categories: meta.categories,
        tags: meta.tags,
        chapters: meta.chapters,
        suggestedGenre: meta.suggestedGenre,
        genreConfidence: meta.genreConfidence,
      };
    }

    // Direct public media URL
    let contentLength: number | undefined = undefined;
    let contentType: string | undefined = undefined;

    try {
      const headRes = await fetch(validated.normalizedUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': 'VireoClip/1.0 (Media Ingestion; +https://vireoclip.ai)' },
        signal: AbortSignal.timeout(Math.min(timeoutMs, 5000)),
      });
      if (headRes.ok) {
        const cl = headRes.headers.get('content-length');
        if (cl) contentLength = parseInt(cl, 10);
        contentType = headRes.headers.get('content-type') || undefined;
      }
    } catch {
      // Ignore head failures
    }

    return {
      provider: 'direct',
      normalizedUrl: validated.normalizedUrl,
      title: validated.inferredFilename.replace(/\.[^.]+$/, ''),
      contentLength,
      contentType,
    };
  }

  /**
   * High-level workflow orchestrating URL validation, temporary download, FFmpeg probe,
   * R2 upload, source cache seeding, and project database persistence.
   */
  public static async ingestUrlToProject(options: IngestUrlOptions): Promise<IngestUrlResult> {
    const { userId, url, title, notes, clipPreferences, startTimeSec, endTimeSec } = options;
    const projectId = options.projectId || crypto.randomUUID();

    // 1. Server-side URL & SSRF Validation
    const validated = await UrlValidator.validateVideoUrl(url);

    let tempFile: string | null = null;
    let ytMetaTitle: string | undefined = undefined;
    let ytMeta: YouTubeMetadataResult | undefined = undefined;

    const range =
      startTimeSec !== undefined || endTimeSec !== undefined
        ? { startSec: startTimeSec, endSec: endTimeSec }
        : undefined;

    try {
      let download: { tempFilePath: string; totalBytes: number; contentType: string };

      if (validated.provider === 'youtube') {
        // YouTube Ingestion Path via yt-dlp
        logger.info(`Starting YouTube video ingestion: ${validated.normalizedUrl} (ID: ${validated.youtubeVideoId}) for project ${projectId}`);

        // Quick metadata pre-fetch for title, duration bounds, chapters, and auto-genre
        ytMeta = await this.fetchYouTubeMetadata(validated.normalizedUrl).catch(() => ({}));
        if (ytMeta.title) ytMetaTitle = ytMeta.title;

        // Duration guard: if range is specified, validate range window; otherwise validate full duration
        if (range && (range.startSec !== undefined || range.endSec !== undefined)) {
          const s = Math.max(0, range.startSec ?? 0);
          const e = range.endSec !== undefined ? range.endSec : (ytMeta.duration ?? 0);
          if (typeof e === 'number' && e > s) {
            const windowDur = e - s;
            if (windowDur > 7200) {
              throw new AppError('Video duration exceeds the maximum allowed limit of 2 hours.', 400, 'YOUTUBE_DURATION_TOO_LONG');
            }
          }
        } else if (ytMeta.duration && ytMeta.duration > 7200) {
          throw new AppError('Video duration exceeds the maximum allowed limit of 2 hours.', 400, 'YOUTUBE_DURATION_TOO_LONG');
        }

        download = await this.downloadYouTubeToTempFile(validated.normalizedUrl, config.maxVideoBytes, 120000, range);
      } else {
        // Direct Public Media URL Path
        logger.info(`Starting secure download for URL: ${validated.hostname} for project ${projectId}`);
        download = await this.downloadToTempFile(validated.normalizedUrl);
      }

      tempFile = download.tempFilePath;

      // 3. Probe video file with FFmpeg to verify streams and duration
      logger.info(`Probing downloaded video for project ${projectId} (${download.totalBytes} bytes)`);
      const probe = await this.probeVideoFile(tempFile);

      if (!probe.hasVideo) {
        throw new AppError('The downloaded file does not contain a valid video stream.', 400, 'NO_VIDEO_STREAM');
      }

      // Max duration check: 2 hours (7200s)
      if (probe.durationSeconds > 7200) {
        throw new AppError('Video duration exceeds the maximum allowed limit of 2 hours.', 400, 'DURATION_EXCEEDED');
      }

      // 4. Upload verified source to Cloudflare R2
      const filename = validated.inferredFilename.endsWith('.mp4')
        ? validated.inferredFilename
        : `${validated.inferredFilename}.mp4`;
      const key = sourceObjectKey(userId, projectId, filename);
      const mime = download.contentType.includes('video') ? download.contentType : 'video/mp4';

      logger.info(`Uploading ingested video to Cloudflare R2: ${key}`);
      await uploadFile('source', key, tempFile, download.totalBytes, mime);

      // 5. Seed project source disk cache (vireo-source-cache) so subsequent services get instant cache hit
      const cacheDir = path.join(os.tmpdir(), 'vireo-source-cache');
      try {
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        const hash = crypto.createHash('sha256').update(key).digest('hex');
        const cachedFile = path.join(cacheDir, `${hash}.mp4`);
        fs.copyFileSync(tempFile, cachedFile);
        logger.info(`Seeded project source cache for ${key} at ${cachedFile}`);
      } catch (cacheErr: any) {
        logger.warn('Failed to seed vireo-source-cache', { error: cacheErr.message });
      }

      // 6. Normalize clip preferences and attach auto-genre suggestions
      let normalizedPrefs = GenreIntelligenceService.normalizePreferences(clipPreferences, notes);
      if (normalizedPrefs.genreSelectionMode === 'auto' && ytMeta?.suggestedGenre) {
        normalizedPrefs = {
          ...normalizedPrefs,
          genre: ytMeta.suggestedGenre,
          suggestedGenre: ytMeta.suggestedGenre,
          genreConfidence: ytMeta.genreConfidence ?? 0.85,
        };
      }

      // 7. Create Project Record in MongoDB in 'uploaded' state
      const projectTitle = title?.trim() || ytMetaTitle || validated.inferredFilename.replace(/\.[^.]+$/, '') || 'Ingested Video';
      const projectRecord: any = {
        id: projectId,
        user_id: userId,
        title: projectTitle.slice(0, 255),
        source_type: 'url',
        source_url: key,
        source_storage_path: key,
        source_object_key: key,
        file_size: download.totalBytes,
        mime_type: mime,
        video_status: 'uploaded',
        duration_seconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        clip_preferences: normalizedPrefs,
        notes: String(notes || '').trim().slice(0, 2000),
      };

      if (validated.provider === 'youtube') {
        projectRecord.metadata = {
          source_provider: 'youtube',
          youtube_video_id: validated.youtubeVideoId,
          original_url: validated.normalizedUrl,
          ingested_at: new Date().toISOString(),
          original_title: ytMetaTitle,
          thumbnail: ytMeta?.thumbnail,
          channel: ytMeta?.channel,
          description: ytMeta?.description,
          categories: ytMeta?.categories,
          tags: ytMeta?.tags,
          chapters: ytMeta?.chapters,
          suggested_genre: ytMeta?.suggestedGenre,
          genre_confidence: ytMeta?.genreConfidence,
          selected_range: range,
        };
      } else {
        projectRecord.metadata = {
          source_provider: 'direct',
          original_url: validated.normalizedUrl,
          ingested_at: new Date().toISOString(),
          codec: probe.codec,
          fps: probe.fps,
        };
      }

      const { data: createdProject, error: dbErr } = await dataRepository
        .from('projects')
        .insert(projectRecord)
        .select()
        .single();

      if (dbErr) {
        logger.error('Failed to create project record in MongoDB after URL ingestion', { error: dbErr.message });
        throw new AppError('Failed to save project record in database.', 500, 'DB_ERROR');
      }

      return {
        projectId,
        title: projectTitle,
        sourceUrl: key,
        fileSize: download.totalBytes,
        durationSeconds: probe.durationSeconds,
        mimeType: mime,
        sourceType: 'url',
      };
    } finally {
      // 8. Guarantee temp file cleanup
      if (tempFile) {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            logger.info(`Cleaned up temp ingest file: ${tempFile}`);
          }
        } catch (cleanupErr: any) {
          logger.warn(`Failed to cleanup temp file ${tempFile}: ${cleanupErr.message}`);
        }
      }
    }
  }
}
