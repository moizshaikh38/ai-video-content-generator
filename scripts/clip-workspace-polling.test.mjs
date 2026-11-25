import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('P0-F: ClipWorkspace active render polling excludes drafts, avoids [projectId, myClips] thrash, and guards overlap', () => {
  const src = fs.readFileSync(new URL('../src/components/clips/ClipWorkspace.tsx', import.meta.url), 'utf8');
  const start = src.indexOf('const hasActiveRenders = myClips.some');
  assert.notEqual(start, -1, 'hasActiveRenders must be derived before the polling effect');
  const block = src.slice(start, src.indexOf('// Handle Find Clips', start));

  // Must not poll for unrendered draft clips
  assert.match(block, /\['queued',\s*'rendering',\s*'uploading'\]\.includes\(c\.render_status\)/);
  assert.doesNotMatch(block, /'draft'/);

  // Must depend on [projectId, hasActiveRenders], not [projectId, myClips]
  assert.match(block, /\},\s*\[projectId,\s*hasActiveRenders\]\)/);
  assert.doesNotMatch(block, /\},\s*\[projectId,\s*myClips\]\)/);

  // Must guard overlapping requests and clean up interval
  assert.match(block, /let inFlight = false/);
  assert.match(block, /if \(!current \|\| inFlight\) return/);
  assert.match(block, /clearInterval\(interval\)/);
});
