import path from 'node:path';
import os from 'node:os';
import { AppError } from '../types/index.js';
import { config } from '../config/index.js';
import { UrlValidator } from './urlValidator.js';

/**
 * Editor-project source_path validation (audit finding H-3).
 *
 * item.source_path values flow from the client into render inputs: the compiler
 * fetches http(s) URLs server-side and feeds local paths to FFmpeg. Unvalidated,
 * that is an SSRF and arbitrary-file-input surface. Only the following are legal:
 *
 * - unset / empty (most items carry no media);
 * - `https://` URLs on an allowlisted asset host (configurable via EDITOR_ASSET_HOSTS);
 *   loopback hosts are additionally allowed outside production for local dev;
 * - storage keys scoped to the requesting user (`users/{userId}/...`);
 * - absolute paths under the OS temp dir (server-managed overlay cache);
 * - repo-relative paths without traversal (server-managed assets / dev fallback).
 */

export const DEFAULT_EDITOR_ASSET_HOSTS = [
  'media.giphy.com',
  'i.giphy.com',
  'videos.pexels.com',
  'images.pexels.com',
  'cdn.pixabay.com',
  'pixabay.com',
  'img.youtube.com',
  'i.ytimg.com',
];

export function getEditorAssetHostAllowlist(): Set<string> {
  return new Set([...DEFAULT_EDITOR_ASSET_HOSTS, ...config.editorAssetHosts]);
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

export function isAllowedEditorSourcePath(userId: string, value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return true;

  // Remote assets: HTTPS on an allowlisted host only.
  if (/^https?:\/\//i.test(v)) {
    let parsed: URL;
    try {
      parsed = new URL(v);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (!config.isProduction && isLoopbackHost(host)) return true;
    return getEditorAssetHostAllowlist().has(host);
  }

  // Storage keys are user-scoped; another user's key is never legal.
  if (v.startsWith('users/')) {
    return v.startsWith(`users/${userId}/`);
  }

  // Path traversal is never acceptable.
  if (v.includes('..')) return false;

  // Absolute paths: only the server-managed temp area (overlay cache).
  if (path.isAbsolute(v)) {
    const resolved = path.resolve(v);
    const tmp = path.resolve(os.tmpdir());
    return resolved === tmp || resolved.startsWith(tmp + path.sep);
  }

  // Repo-relative path (server-managed assets / local dev source fallback).
  return true;
}

/**
 * Strict validation for client-supplied editor items. Performs an SSRF DNS check
 * on allowlisted https hosts as defense in depth; throws 400 on any violation.
 */
export async function validateEditorSourcePath(userId: string, value: unknown): Promise<void> {
  if (!isAllowedEditorSourcePath(userId, value)) {
    throw new AppError('Editor item source is not allowed.', 400, 'EDITOR_SOURCE_NOT_ALLOWED');
  }
  if (typeof value === 'string' && /^https:\/\//i.test(value.trim())) {
    const host = new URL(value.trim()).hostname.toLowerCase();
    // Allowlisted CDN hosts resolving to internal/private addresses are rejected.
    // Dev-loopback hosts are exempt (explicit non-production allowance above).
    if (config.isProduction || !isLoopbackHost(host)) {
      await UrlValidator.checkSsrf(host);
    }
  }
}

/**
 * Extension for overlay assets, replacing substring sniffing (`includes('.gif')`)
 * which mis-classified paths like `/my.gif.folder/file` or query strings.
 */
export function overlayAssetExtension(value: string): '.gif' | '.png' | '.webp' {
  try {
    const clean = value.split('?')[0].split('#')[0];
    const ext = path.extname(clean).toLowerCase();
    if (ext === '.gif') return '.gif';
    if (ext === '.png') return '.png';
  } catch {
    // fall through
  }
  return '.webp';
}
