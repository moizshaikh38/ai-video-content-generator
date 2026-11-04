import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClipPosterService, PosterClip } from '../services/clipPosterService.js';

const base: PosterClip = {
  id: '33333333-3333-4333-8333-333333333333',
  user_id: '11111111-1111-4111-8111-111111111111',
  project_id: '22222222-2222-4222-8222-222222222222',
  start_seconds: 120,
  end_seconds: 150,
  render_version: 2,
  source_storage_path: 'users/u/projects/p/source/video.mp4',
};
const prefix = `users/${base.user_id}/projects/${base.project_id}/clips/${base.id}/poster/`;

describe('ClipPosterService', () => {
  it('uses the rendered output (versioned) when the clip is rendered, else the source window', () => {
    assert.equal(ClipPosterService.expectedKey(base), `${prefix}source.jpg`);
    const rendered = { ...base, render_status: 'ready', output_storage_path: 'users/u/render.mp4' };
    assert.equal(ClipPosterService.expectedKey(rendered), `${prefix}render-v2.jpg`);
    assert.equal(ClipPosterService.expectedKey({ ...rendered, render_version: 3 }), `${prefix}render-v3.jpg`, 're-render gets a new poster');
  });

  it('seeks within the clip: from 0 in the rendered file, from start_seconds in the source', () => {
    assert.deepEqual(ClipPosterService.frameTimes(base, true), [3, 0]);
    assert.deepEqual(ClipPosterService.frameTimes(base, false), [123, 120]);
  });

  it('never signs a stale poster from an older render', async () => {
    const stale = { ...base, render_status: 'ready', output_storage_path: 'x', render_version: 3, poster_key: `${prefix}render-v2.jpg` };
    assert.equal(await ClipPosterService.signedUrlIfReady(stale), null);
    assert.equal(await ClipPosterService.signedUrlIfReady({ ...base, poster_key: null }), null);
  });
});
