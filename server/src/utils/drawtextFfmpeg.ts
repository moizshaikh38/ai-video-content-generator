import { execFileSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from './logger.js';

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

let renderResolved: string | undefined;
let renderResolvedHasDrawtext = false;
let renderResolvedIsOverride = false;

/**
 * Whether the resolved render binary actually supports drawtext, and whether
 * it came from an explicit FFMPEG_BIN override. Render paths use this to
 * fail with a clear capability error instead of ffmpeg's opaque
 * "Filter not found" when no drawtext-capable binary exists. An explicit
 * FFMPEG_BIN override is preserved as the operator's intent (warn-only).
 */
export function renderFfmpegCapability(): { hasDrawtext: boolean; isOverride: boolean } {
  getRenderFfmpeg();
  return { hasDrawtext: renderResolvedHasDrawtext, isOverride: renderResolvedIsOverride };
}

/**
 * The binary every fluent-ffmpeg render path must use. fluent-ffmpeg's
 * setFfmpegPath writes a SHARED process-wide module cache, so any module
 * that pins a different binary at import time silently overrides the render
 * binary for the whole process (import order picks the winner). All
 * module-level setFfmpegPath callers must use this same resolution so the
 * cache holds one consistent value: FFMPEG_BIN override (honored even
 * without drawtext, with a warning), then the bundled binary when it has
 * drawtext, then well-known system ffmpeg paths, and finally the bundled
 * binary again as last resort.
 */
export function getRenderFfmpeg(): string {
  if (renderResolved !== undefined) return renderResolved;
  const override = process.env.FFMPEG_BIN;
  if (override) {
    renderResolvedIsOverride = true;
    renderResolvedHasDrawtext = probeDrawtextSupport(override);
    if (!renderResolvedHasDrawtext) {
      logger.warn(`[FFmpeg] FFMPEG_BIN (${override}) lacks drawtext support; watermark, headline and text-overlay renders will fail with this binary. Point FFMPEG_BIN at a full ffmpeg build (libfreetype enabled).`);
    }
    renderResolved = override;
    return renderResolved;
  }
  const bundled = (ffmpegStatic as unknown as string) || 'ffmpeg';
  if (probeDrawtextSupport(bundled)) {
    renderResolvedHasDrawtext = true;
    renderResolved = bundled;
    return renderResolved;
  }
  for (const candidate of ['ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg']) {
    if (candidate === bundled) continue;
    if (probeDrawtextSupport(candidate)) {
      logger.warn(`[FFmpeg] Bundled ffmpeg lacks drawtext support; falling back to ${candidate} so watermark/text overlays render.`);
      renderResolvedHasDrawtext = true;
      renderResolved = candidate;
      return renderResolved;
    }
  }
  logger.warn('[FFmpeg] No ffmpeg with drawtext support found; renders that burn watermark, headline or caption text must fail explicitly. Set FFMPEG_BIN to a full ffmpeg build.');
  renderResolved = bundled;
  return renderResolved;
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
