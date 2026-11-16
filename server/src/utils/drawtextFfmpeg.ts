import { execFileSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

/**
 * drawtext (compile-time text measurement probe in ProEditorService) needs
 * libfreetype, which the bundled ffmpeg-static build lacks. Mirrors the
 * fallback chain ClipRenderService uses for renders: FFMPEG_BIN override,
 * then the bundled binary if it supports drawtext, then well-known system
 * ffmpeg paths. Memoized: the -filters probe is a process spawn, so it must
 * not run once per compile. Returns null when no drawtext-capable binary
 * exists; callers degrade (legacy per-line boxes) in that case.
 */
function probeDrawtextSupport(bin: string): boolean {
  try {
    const out = execFileSync(bin, ['-hide_banner', '-filters'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    }).toString();
    return /(^|\s)drawtext\s/.test(out);
  } catch {
    return false;
  }
}

let resolved: string | null | undefined;

export function getDrawtextFfmpeg(): string | null {
  if (resolved !== undefined) return resolved;
  const override = process.env.FFMPEG_BIN;
  if (override) {
    resolved = probeDrawtextSupport(override) ? override : null;
    return resolved;
  }
  const bundled = (ffmpegStatic as unknown as string) || 'ffmpeg';
  if (probeDrawtextSupport(bundled)) {
    resolved = bundled;
    return resolved;
  }
  for (const candidate of ['ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg']) {
    if (candidate === bundled) continue;
    if (probeDrawtextSupport(candidate)) {
      resolved = candidate;
      return resolved;
    }
  }
  resolved = null;
  return resolved;
}
