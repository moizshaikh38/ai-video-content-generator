import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTION_PRESETS, buildPresetCueEvents, getPreviewFrame, getWordRevealState, resolveCaptionPreset, regroupCuesForPreset, type PresetTimedCue } from '../shared/captionPresets.js';
import { CAPTION_REFERENCE_COVERAGE, OPUS_CAPTION_REFERENCE } from '../shared/captionReferenceCatalog.js';
const cue: PresetTimedCue = { id: 'sample', start: 0, end: 2, text: 'Hello world', words: [{ text: 'Hello', start: 0, end: 0.8 }, { text: 'world', start: 1, end: 2 }] };
describe('Evidence-backed caption candidates and shared reveal', () => {
  it('preserves all 44 observed names without claiming unverified parity', () => {
    assert.equal(OPUS_CAPTION_REFERENCE.styles.length, 44);
    assert.equal(new Set(OPUS_CAPTION_REFERENCE.styles).size, 44);
    assert.equal(CAPTION_REFERENCE_COVERAGE.filter(c => c.status === 'verified').length, 0);
    assert.equal(CAPTION_REFERENCE_COVERAGE.filter(c => c.status === 'candidate').length, 3);
    assert.equal(CAPTION_PRESETS.typewriter.qualification,'candidate');
    for (const c of CAPTION_REFERENCE_COVERAGE.filter(c => c.presetId)) assert.equal(resolveCaptionPreset(c.presetId).presetId, c.presetId);
  });
  it('reveals characters, keeps future words hidden and remains deterministic on seek', () => {
    const style = resolveCaptionPreset('typewriter');
    assert.equal(getPreviewFrame(cue, 0, style).words[0].visibleCharacters, 1);
    const first = getPreviewFrame(cue, 0.2, style);
    assert.equal(first.words[0].visibleCharacters, 2);
    assert.equal(first.words[1].opacity, 0);
    assert.equal(getPreviewFrame(cue, 1.9, style).words[1].visibleCharacters, 5);
    const boundaryCue = { ...cue, words: [{text:'started',start:1,end:2.4}] };
    assert.equal(getPreviewFrame(boundaryCue, 1.16, style).words[0].visibleCharacters, 2);
    assert.deepEqual(getPreviewFrame(cue, 0.2, style), first);
  });
  it('soft build progressively reveals complete words with a short fade', () => {
    const style = resolveCaptionPreset('soft_build');
    assert.equal(getPreviewFrame(cue, 0.5, style).words[0].opacity, 1);
    assert.equal(getPreviewFrame(cue, 0.5, style).words[1].opacity, 0);
    assert.ok(Math.abs(getPreviewFrame(cue, 1.05, style).words[1].opacity! - 0.5) < 0.001);
  });
  it('does not fabricate word or character timing for segment-only transcripts', () => {
    const noWords = { ...cue, words: undefined };
    const frame = getPreviewFrame(noWords, 0, resolveCaptionPreset('typewriter'));
    assert.equal(frame.wordTiming, false);
    assert.equal(frame.words[0].visibleCharacters, undefined);
    assert.equal(buildPresetCueEvents(noWords, resolveCaptionPreset('typewriter')).length, 1);
  });
  it('Word Cut is one-word grouping, not a renamed phrase highlight', () => {
    const { cues } = regroupCuesForPreset([cue], resolveCaptionPreset('word_cut'));
    assert.equal(cues.length, 2);
    assert.ok(cues.every(c => c.words?.length === 1));
  });
  it('exports timed alpha masks without injecting raw ASS markup or zero-duration events', () => {
    const events = buildPresetCueEvents(cue, resolveCaptionPreset('typewriter'));
    assert.ok(events.length >= 10);
    assert.ok(events[0].includes('H{\\alpha&HFF&}ello'));
    assert.ok(events[0].includes('world'));
    assert.ok(events[0].includes('\\alpha&HFF&'));
    for (const event of events) { const p = event.split(','); assert.notEqual(p[1], p[2]); }
    const malicious = { ...cue, words: [{text: '{\\pos(1,1)}',start:0,end:2}] };
    assert.ok(!buildPresetCueEvents(malicious, resolveCaptionPreset('typewriter')).join('').includes('{\\pos(1,1)}'));
  });
  it('keeps Unicode surrogate pairs intact', () => {
    assert.equal(getWordRevealState({text:'😀A',start:0,end:1},0,'character').visibleCharacters,1);
  });
  it('retains cue manual positions in generated events', () => {
    const events = buildPresetCueEvents({...cue,position_x:.3,position_y:.8},resolveCaptionPreset('typewriter'));
    assert.ok(events.every(e => e.includes('\\pos(324,1536)')));
  });
});
