import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedEditorSourcePath, validateEditorSourcePath } from '../utils/editorAssetValidator.js';
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
for (const value of [
  `users/${owner}/../../${other}/source.mp4`,
  `users/${owner}/%2e%2e/${other}/source.mp4`,
  `users/${owner}/source%2f..%2fother.mp4`,
  `users/${owner}/source%5cother.mp4`,
  `users/${owner}/bad\u0000.mp4`,
  `users/${owner}/bad\\name.mp4`,
  'file:///tmp/another-owner.mp4', 'concat:one.mp4|two.mp4',
  'subfile,,start,0,end,2,,:/tmp/input.mp4',
  'ftp://media.giphy.com/asset.gif',
]) {
  test(`reject unsafe editor input ${JSON.stringify(value)}`, async () => {
    assert.equal(isAllowedEditorSourcePath(owner, value), false);
    await assert.rejects(validateEditorSourcePath(owner, value), (error: any) => error.code === 'EDITOR_SOURCE_NOT_ALLOWED');
  });
}
test('safe user key and ordinary CDN assets remain allowed', () => {
  assert.equal(isAllowedEditorSourcePath(owner, `users/${owner}/project/source.mp4`), true);
  assert.equal(isAllowedEditorSourcePath(owner, `users/${other}/project/source.mp4`), false);
  assert.equal(isAllowedEditorSourcePath(owner, 'https://media.giphy.com/media/x/giphy.gif'), true);
});
