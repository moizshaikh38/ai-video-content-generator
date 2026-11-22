import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTranscriptUsable} from '../services/transcription/transcriptQuality.js';
import {CaptionService} from '../services/captionService.js';

const nested = (secondWord = 'words.') => ({
  transcript_text:'Source words.',
  segments:[{start:0,end:2,text:'Source words.',words:[
    {word:'Source',start:0,end:1}, {word:secondWord,start:1,end:2}
  ]}]
});

test('early reuse rejects the same nested-word text mismatch as the caption extractor', () => {
  for(const rootWords of [undefined, []]) {
    for(const quality of [undefined, {version:1,status:'unverified',diagnostics:'unavailable',issues:[],detected_language:'en'}]) {
      const record:any={...nested('changed.'),words:rootWords,quality_assessment:quality};
      const before=structuredClone(record);
      assert.throws(()=>CaptionService.extractClipCues(record,0,2),{code:'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED'});
      assert.throws(()=>assertTranscriptUsable(record),{code:'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED',statusCode:409});
      assert.deepEqual(record,before);
    }
  }
});

test('matching timed nested words still use real word timing without text or clock edits', () => {
  const record=nested(),before=structuredClone(record);
  assert.doesNotThrow(()=>assertTranscriptUsable(record));
  const result=CaptionService.extractClipCues(record,0,2);
  assert.equal(result.timingMode,'word');
  assert.equal(result.cues.flatMap(c=>c.tokens.map(t=>t.text)).join(' '),'Source words.');
  assert.deepEqual(record,before);
});

test('root words retain the same precedence as caption extraction, not duplicate or unused nested text', () => {
  const record={...nested('changed.'),words:nested().segments[0].words},before=structuredClone(record);
  assert.doesNotThrow(()=>assertTranscriptUsable(record));
  assert.equal(CaptionService.extractClipCues(record,0,2).timingMode,'word');
  assert.deepEqual(record,before);
});

test('genuine segment-only legacy input still has no invented word timings', () => {
  const record={transcript_text:'Source words.',segments:[{start:0,end:2,text:'Source words.'}]};
  const before=structuredClone(record);
  assert.doesNotThrow(()=>assertTranscriptUsable(record));
  assert.equal(CaptionService.extractClipCues(record,0,2).timingMode,'segment');
  assert.deepEqual(record,before);
});
