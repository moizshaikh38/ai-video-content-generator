import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPresetAssScript,
  buildPresetCueEvents,
  getPreviewFrame,
  getPreviewCss,
  resolveCaptionPreset,
  PresetTimedCue,
} from '../shared/captionPresets.js';

describe('Multi-Preset (Line-by-Line) & Word-by-Word (Token-Level) Customization Engine', () => {
  const baseStyle = resolveCaptionPreset('vireo_clean', undefined, '9:16');

  it('Tier 1: Generates standard single-style ASS when no overrides are present', () => {
    const cues: PresetTimedCue[] = [
      {
        id: 'cue-1',
        start: 0.0,
        end: 2.0,
        text: 'Standard clean line',
        words: [
          { text: 'Standard', start: 0.0, end: 0.6 },
          { text: 'clean', start: 0.6, end: 1.2 },
          { text: 'line', start: 1.2, end: 2.0 },
        ],
      },
    ];

    const script = buildPresetAssScript(cues, baseStyle);
    assert.match(script, /Style: Default/);
    assert.doesNotMatch(script, /Style: Style_/);
    assert.match(script, /Dialogue: 0,0:00:00\.00,.*Default,,0,0,0,,/);
  });

  it('Tier 2: Emits multiple [V4+ Styles] and routes cues to their specific preset styles', () => {
    const cues: PresetTimedCue[] = [
      {
        id: 'cue-1',
        start: 0.0,
        end: 2.0,
        text: 'First line clean',
        words: [
          { text: 'First', start: 0.0, end: 0.6 },
          { text: 'line', start: 0.6, end: 1.2 },
          { text: 'clean', start: 1.2, end: 2.0 },
        ],
      },
      {
        id: 'cue-2',
        start: 2.0,
        end: 4.5,
        text: 'Second line neon glow',
        presetOverride: 'vireo_neon',
        words: [
          { text: 'Second', start: 2.0, end: 2.8 },
          { text: 'line', start: 2.8, end: 3.6 },
          { text: 'neon', start: 3.6, end: 4.5 },
        ],
      },
      {
        id: 'cue-3',
        start: 4.5,
        end: 6.5,
        text: 'Third line pill capsule',
        presetOverride: 'vireo_pill',
        words: [
          { text: 'Third', start: 4.5, end: 5.1 },
          { text: 'line', start: 5.1, end: 5.8 },
          { text: 'pill', start: 5.8, end: 6.5 },
        ],
      },
    ];

    const script = buildPresetAssScript(cues, baseStyle);

    // [V4+ Styles] assertions
    assert.match(script, /Style: Default,/);
    assert.match(script, /Style: Style_vireo_neon,/);
    assert.match(script, /Style: Style_vireo_pill,/);

    // Dialogue style targeting assertions
    assert.match(script, /Dialogue: 0,0:00:00\.00,0:00:00\.60,Default,,0,0,0,,/);
    assert.match(script, /Dialogue: 0,0:00:02\.00,0:00:02\.80,Style_vireo_neon,,0,0,0,,/);
    assert.match(script, /Dialogue: 0,0:00:04\.50,0:00:05\.10,Style_vireo_pill,,0,0,0,,/);
  });

  it('Tier 3: Injects inline ASS tags for word-by-word custom styles', () => {
    const cue: PresetTimedCue = {
      id: 'cue-custom-words',
      start: 0.0,
      end: 3.0,
      text: 'This is INSANE and golden',
      words: [
        { text: 'This', start: 0.0, end: 0.5 },
        { text: 'is', start: 0.5, end: 1.0 },
        {
          text: 'INSANE',
          start: 1.0,
          end: 2.0,
          customStyle: {
            fontSizeMultiplier: 1.3,
            effect: 'pop',
            color: '#FF0055',
            uppercase: true,
          },
        },
        {
          text: 'and',
          start: 2.0,
          end: 2.5,
        },
        {
          text: 'golden',
          start: 2.5,
          end: 3.0,
          customStyle: {
            effect: 'glow',
            color: '#FACC15',
            highlightColor: '#FACC15',
          },
        },
      ],
    };

    const events = buildPresetCueEvents(cue, baseStyle);
    assert.ok(events.length > 0);

    // Check active slice for INSANE: should include scale and custom color tags
    const insaneSlice = events.find((e) => e.includes('0:00:01.00') && e.includes('0:00:02.00'));
    assert.ok(insaneSlice, 'Expected slice for active word INSANE');
    assert.match(insaneSlice, /\\fscx/);
    assert.match(insaneSlice, /\\fscy/);

    // Check golden slice: should include glow tags
    const goldenSlice = events.find((e) => e.includes('0:00:02.50') && e.includes('0:00:03.00'));
    assert.ok(goldenSlice, 'Expected slice for active word golden');
    assert.match(goldenSlice, /\\blur/);
  });

  it('Canvas Preview Parity: getPreviewFrame and getPreviewCss apply token custom styles', () => {
    const springStyle = resolveCaptionPreset('vireo_spring', undefined, '9:16');
    const cue: PresetTimedCue = {
      id: 'preview-cue',
      start: 0.0,
      end: 2.0,
      text: 'Viral capsule test',
      words: [
        { text: 'Viral', start: 0.0, end: 0.6 },
        {
          text: 'capsule',
          start: 0.6,
          end: 1.4,
          customStyle: {
            effect: 'pill',
            pillColor: '#ED3A7C',
            fontSizeMultiplier: 1.2,
            uppercase: true,
          },
        },
        { text: 'test', start: 1.4, end: 2.0 },
      ],
    };

    // Frame at time = 0.8s (word "capsule" is active)
    const frame = getPreviewFrame(cue, 0.8, springStyle);
    assert.equal(frame.words.length, 3);
    const capsuleWord = frame.words[1];
    assert.equal(capsuleWord.text, 'capsule');
    assert.ok(capsuleWord.active);
    assert.deepEqual(capsuleWord.customStyle, {
      effect: 'pill',
      pillColor: '#ED3A7C',
      fontSizeMultiplier: 1.2,
      uppercase: true,
    });

    // Check CSS computation
    const cssBundle = getPreviewCss(springStyle, 1.0);
    const wordCss = cssBundle.word(capsuleWord);
    assert.equal(wordCss.backgroundColor, '#ED3A7C');
    assert.equal(wordCss.borderRadius, '9999px');
    assert.equal(wordCss.textTransform, 'uppercase');
  });
});
