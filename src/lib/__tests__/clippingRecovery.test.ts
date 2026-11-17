import test from 'node:test';
import assert from 'node:assert/strict';
import { clippingStartErrorMessage, transcriptReviewRequired, projectClippingFailure } from '../clippingRecovery.js';

test('source mismatch becomes a review gate, not a generic retry', () => {
  const failure = {code: 'TRANSCRIPT_SOURCE_REVIEW_REQUIRED', message: 'storage internals'};
  assert.equal(transcriptReviewRequired(failure), true);
  assert.match(clippingStartErrorMessage(failure), /could not be verified against the current video/);
  assert.doesNotMatch(clippingStartErrorMessage(failure), /storage internals|Please retry/);
});
test('persisted source-review code survives project restoration', () => {
  const failure = projectClippingFailure({error_code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED', transcript_quality_status:'needs_review'});
  assert.equal(failure.code, 'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
  assert.equal(transcriptReviewRequired(failure), true);
});
test('legacy review flags fail closed when there is no stored code', () => {
  assert.equal(transcriptReviewRequired(projectClippingFailure({transcript_quality_status:'needs_review'})), true);
});
test('ordinary failure and cancellation keep their existing recovery', () => {
  assert.equal(transcriptReviewRequired({code:'NETWORK_ERROR'}), false);
  assert.equal(transcriptReviewRequired(projectClippingFailure({error_message:'Temporary failure'})), false);
  assert.equal(clippingStartErrorMessage({name:'AbortError'}),'Upload was cancelled.');
  assert.equal(clippingStartErrorMessage({message:'Network unavailable'}),'Network unavailable');
});
