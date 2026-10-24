import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  isAllowedEditorSourcePath,
  validateEditorSourcePath,
  overlayAssetExtension,
  DEFAULT_EDITOR_ASSET_HOSTS,
} from '../utils/editorAssetValidator.js';
import { config } from '../config/index.js';

/**
 * Phase 4 — editor source_path security (audit finding H-3).
 * item.source_path values become server-side fetches and FFmpeg inputs.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('Phase 4 — editor source path validation', () => {
  it('allows empty and unset sources', () => {
    assert.equal(isAllowedEditorSourcePath(USER, undefined), true);
    assert.equal(isAllowedEditorSourcePath(USER, null), true);
    assert.equal(isAllowedEditorSourcePath(USER, ''), true);
  });

  it('allows storage keys scoped to the requesting user and rejects other users', () => {
    assert.equal(isAllowedEditorSourcePath(USER, `users/${USER}/projects/p/source/f.mp4`), true);
    assert.equal(isAllowedEditorSourcePath(USER, `users/${OTHER}/projects/p/source/f.mp4`), false);
  });

  it('allows https assets on allowlisted hosts and rejects unknown hosts', () => {
    assert.equal(isAllowedEditorSourcePath(USER, 'https://media.giphy.com/media/x/giphy.gif'), true);
    assert.ok(DEFAULT_EDITOR_ASSET_HOSTS.includes('media.giphy.com'));
    assert.equal(isAllowedEditorSourcePath(USER, 'https://evil.example.com/giphy.gif'), false);
  });

  it('rejects plain http remote sources', () => {
    assert.equal(isAllowedEditorSourcePath(USER, 'http://media.giphy.com/media/x/giphy.gif'), false);
  });

  it('rejects path traversal in relative and storage paths', () => {
    assert.equal(isAllowedEditorSourcePath(USER, 'users/x/../../etc/passwd'), false);
    assert.equal(isAllowedEditorSourcePath(USER, 'server/public/../../secrets.env'), false);
  });

  it('allows absolute paths only under the OS temp dir', () => {
    assert.equal(isAllowedEditorSourcePath(USER, path.join(os.tmpdir(), 'overlay_x.webp')), true);
    assert.equal(isAllowedEditorSourcePath(USER, '/etc/passwd'), false);
    assert.equal(isAllowedEditorSourcePath(USER, '/Users/someone/secret.mp4'), false);
  });

  it('allows repo-relative server-managed paths and rejects non-string values', () => {
    assert.equal(isAllowedEditorSourcePath(USER, 'server/public/music/bed.mp3'), true);
    assert.equal(isAllowedEditorSourcePath(USER, 42), false);
    assert.equal(isAllowedEditorSourcePath(USER, { path: '/etc/passwd' }), false);
  });

  it('strict validator rejects disallowed sources with a classified error', async () => {
    await assert.rejects(
      () => validateEditorSourcePath(USER, `users/${OTHER}/projects/p/source/f.mp4`),
      (err: any) => err.code === 'EDITOR_SOURCE_NOT_ALLOWED'
    );
    await assert.rejects(
      () => validateEditorSourcePath(USER, 'https://evil.example.com/x.gif'),
      (err: any) => err.code === 'EDITOR_SOURCE_NOT_ALLOWED'
    );
  });

  it('strict validator passes own storage keys without network access', async () => {
    await assert.doesNotReject(() => validateEditorSourcePath(USER, `users/${USER}/projects/p/source/f.mp4`));
  });

  it('dev-loopback https hosts are allowed outside production without an SSRF DNS rejection', async () => {
    if (config.isProduction) {
      assert.equal(isAllowedEditorSourcePath(USER, 'https://localhost:5173/asset.mp4'), false);
    } else {
      assert.equal(isAllowedEditorSourcePath(USER, 'https://localhost:5173/asset.mp4'), true);
      await assert.doesNotReject(() => validateEditorSourcePath(USER, 'https://localhost:5173/asset.mp4'));
    }
  });
});

describe('Phase 4 — overlay extension resolution', () => {
  it('resolves extensions from the path, not substring matching', () => {
    assert.equal(overlayAssetExtension('https://media.giphy.com/media/x/giphy.gif'), '.gif');
    assert.equal(overlayAssetExtension('https://cdn.example.com/sticker.png?w=100'), '.png');
    assert.equal(overlayAssetExtension('https://cdn.example.com/sticker'), '.webp');
    // Substring sniffing would mis-classify this as .gif.
    assert.equal(overlayAssetExtension('https://cdn.example.com/my.gif.folder/file'), '.webp');
  });
});

describe('Phase 4 — service wiring guards', () => {
  const serviceSource = fs.readFileSync(path.resolve(process.cwd(), 'src/services/proEditorService.ts'), 'utf8');

  it('updateEditorProject validates every item source path', () => {
    assert.match(serviceSource, /await validateEditorSourcePath\(userId, item\.source_path\)/);
  });

  it('compile and preload paths skip disallowed assets instead of rendering them', () => {
    const occurrences = serviceSource.match(/isAllowedEditorSourcePath\(project\.user_id/g) || [];
    assert.ok(occurrences.length >= 3, `expected overlay, audio and preload guards, found ${occurrences.length}`);
  });

  it('substring extension sniffing is gone from overlay handling', () => {
    assert.doesNotMatch(serviceSource, /source_path\.includes\('\.gif'\)/);
    assert.match(serviceSource, /overlayAssetExtension\(/);
  });
});
