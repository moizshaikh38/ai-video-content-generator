import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {AppError} from '../types/index.js';
import {primaryVisibleVideoItems} from '../shared/primaryVideoItems.js';
import {visibleEditorAssetItems} from '../shared/visibleEditorAssets.js';
import {isAllowedClientEditorSourcePath} from './editorAssetValidator.js';

/** Production render gate for legacy persisted secondary local inputs. */
export function assertRenderAssetOwnership(project: any, renderDirectory: string): void {
  const root = fs.realpathSync(renderDirectory);
  if (root === fs.realpathSync(os.tmpdir())) {
    throw new AppError('A private render directory is required.', 400, 'EDITOR_ASSET_OWNERSHIP_REQUIRED');
  }
  const primary = new Set(primaryVisibleVideoItems<any>(project));
  for (const item of visibleEditorAssetItems<any>(project)) {
    // The primary input is resolved independently from the owning clip source,
    // not from item.source_path. Never use this exemption for secondary tracks.
    if (primary.has(item)) continue;
    const source = item.source_path;
    if (isAllowedClientEditorSourcePath(project.user_id, source)) continue;
    let authorized = false;
    try {
      const actual = fs.realpathSync(source);
      authorized = actual.startsWith(root + path.sep) && fs.statSync(actual).isFile();
    } catch { /* missing or invalid paths do not establish ownership */ }
    if (!authorized) throw new AppError('A saved editor asset has no verified render ownership. Replace it with an owned library asset.', 409, 'EDITOR_ASSET_OWNERSHIP_REQUIRED');
  }
}

/** Post-preload gate: a legal storage reference is not a usable FFmpeg input.
 * Never silently publish an export with an unresolved visible secondary asset.
 */
export function assertRenderAssetsMaterialized(project: any, renderDirectory: string): void {
  assertRenderAssetOwnership(project, renderDirectory);
  const root = fs.realpathSync(renderDirectory);
  const primary = new Set(primaryVisibleVideoItems<any>(project));
  const consumed = project.tracks.filter((track: any) => !track.hidden &&
    (track.type === 'VIDEO' || track.type === 'OVERLAY' || track.type === 'IMAGE' ||
      track.type === 'AUDIO' && !track.muted || String(track.name || '').toLowerCase().includes('b-roll')))
    .flatMap((track: any) => track.items.filter((item: any) => !item.hidden && item.source_path &&
      !(track.type === 'AUDIO' && (track.muted || item.muted))));
  for (const item of consumed) {
    if (primary.has(item)) continue;
    let ready = false;
    try {
      // Storage keys and remote URLs must first become private local cache paths.
      if (path.isAbsolute(item.source_path)) {
        const actual = fs.realpathSync(item.source_path);
        const stat = fs.statSync(actual);
        ready = actual.startsWith(root + path.sep) && stat.isFile() && stat.size > 0;
      }
    } catch { /* failed preparation is not a completed render */ }
    if (!ready) throw new AppError('A visible editor asset could not be prepared. Replace or retry the asset before exporting.', 409, 'EDITOR_ASSET_NOT_MATERIALIZED');
  }
}
