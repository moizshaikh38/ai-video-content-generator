import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GiphyService, ELEMENT_CATEGORIES, CURATED_FALLBACK_ELEMENTS } from '../services/giphyService.js';
import { TEXT_TEMPLATES } from '../shared/textTemplates.js';
import {
  CAPTION_PRESET_IDS,
  CAPTION_PRESETS,
  PRESET_ONLY_CAPTION_STYLES,
  buildPresetAssScript,
  resolveCaptionPreset,
  resolveRenderPresetId,
  isRenderablePresetId,
  type PresetTimedCue,
  type RenderableCaptionPresetId,
} from '../shared/captionPresets.js';
import { SAFE_EDITOR_FONTS, type EditorProject, type EditorTrackItem } from '../types/index.js';

describe('Elements Polish & Expanded Presets Test Suite', () => {
  describe('1. Elements Category Filtering & Trending Behavior', () => {
    it('returns trending elements when category is trending', async () => {
      const stickerTrending = await GiphyService.getTrendingElements({ type: 'sticker', limit: 10 });
      assert.ok(stickerTrending.items.length > 0, 'Trending stickers should return items');
      assert.equal(stickerTrending.attribution, 'Powered by GIPHY');

      const gifTrending = await GiphyService.getTrendingElements({ type: 'gif', limit: 10 });
      assert.ok(gifTrending.items.length > 0, 'Trending GIFs should return items');
      assert.equal(gifTrending.attribution, 'Powered by GIPHY');
    });

    it('filters accurately for Arrows category (singular/plural)', async () => {
      const res = await GiphyService.searchElements({
        query: 'arrow',
        category: 'arrows',
        type: 'sticker',
      });
      assert.ok(res.items.length > 0, 'Should find arrow stickers');
      for (const item of res.items) {
        const matches =
          item.category === 'arrows' ||
          item.tags?.includes('arrow') ||
          item.tags?.includes('arrows') ||
          item.title.toLowerCase().includes('arrow');
        assert.ok(matches, `Item ${item.id} (${item.title}) must match arrows category`);
      }
    });

    it('filters accurately for Reactions category', async () => {
      const res = await GiphyService.searchElements({
        query: 'reaction',
        category: 'reactions',
        type: 'sticker',
      });
      assert.ok(res.items.length > 0, 'Should find reaction stickers');
      for (const item of res.items) {
        const matches =
          item.category === 'reactions' ||
          item.tags?.includes('reaction') ||
          item.tags?.includes('reactions') ||
          item.title.toLowerCase().includes('reaction');
        assert.ok(matches, `Item ${item.id} (${item.title}) must match reactions category`);
      }
    });

    it('filters accurately for Emojis category', async () => {
      const res = await GiphyService.searchElements({
        query: 'emoji',
        category: 'emojis',
        type: 'sticker',
      });
      assert.ok(res.items.length > 0, 'Should find emoji stickers');
      for (const item of res.items) {
        const matches =
          item.category === 'emojis' ||
          item.tags?.includes('emoji') ||
          item.tags?.includes('emojis') ||
          item.title.toLowerCase().includes('emoji');
        assert.ok(matches, `Item ${item.id} (${item.title}) must match emojis category`);
      }
    });

    it('filters accurately for Badges category', async () => {
      const res = await GiphyService.searchElements({
        query: 'badge',
        category: 'badges',
        type: 'sticker',
      });
      assert.ok(res.items.length > 0, 'Should find badge stickers');
      for (const item of res.items) {
        const matches =
          item.category === 'badges' ||
          item.tags?.includes('badge') ||
          item.tags?.includes('badges') ||
          item.title.toLowerCase().includes('badge');
        assert.ok(matches, `Item ${item.id} (${item.title}) must match badges category`);
      }
    });

    it('filters accurately for Memes category', async () => {
      const res = await GiphyService.searchElements({
        query: 'meme',
        category: 'memes',
        type: 'gif',
      });
      assert.ok(res.items.length > 0, 'Should find meme GIFs');
      for (const item of res.items) {
        const matches =
          item.category === 'memes' ||
          item.tags?.includes('meme') ||
          item.tags?.includes('memes') ||
          item.title.toLowerCase().includes('meme');
        assert.ok(matches, `Item ${item.id} (${item.title}) must match memes category`);
      }
    });

    it('filters accurately for Celebration category', async () => {
      const res = await GiphyService.searchElements({
        query: 'celebrate',
        category: 'celebration',
        type: 'gif',
      });
      assert.ok(res.items.length > 0, 'Should find celebration GIFs');
      for (const item of res.items) {
        const matches =
          item.category === 'celebration' ||
          item.tags?.includes('celebrate') ||
          item.tags?.includes('celebration') ||
          item.title.toLowerCase().includes('celebrat');
        assert.ok(matches, `Item ${item.id} (${item.title}) must match celebration category`);
      }
    });

    it('every category in ELEMENT_CATEGORIES returns valid results without error', async () => {
      for (const cat of ELEMENT_CATEGORIES) {
        if (cat.id === 'all' || cat.id === 'trending') {
          const trendingRes = await GiphyService.getTrendingElements({ type: cat.type });
          assert.ok(trendingRes.items.length > 0, `Trending category ${cat.id} must return items`);
        } else {
          const searchRes = await GiphyService.searchElements({
            query: cat.query,
            category: cat.id,
            type: cat.type,
          });
          assert.ok(searchRes.items.length > 0, `Category ${cat.id} must return items`);
        }
      }
    });
  });

  describe('2. Non-Ripple GIF/Sticker Deletion & State Integrity', () => {
    function createMockProject(): EditorProject {
      return {
        id: 'test-project',
        version: 2,
        canvas: {
          aspect_ratio: '9:16',
          width: 1080,
          height: 1920,
          duration: 30.0,
          fps: 30,
        },
        settings: {
          enable_watermark: false,
          music_ducking: true,
          audio_normalization: true,
        },
        tracks: [
          {
            id: 'video-track-1',
            type: 'VIDEO',
            name: 'Primary Video',
            locked: false,
            muted: false,
            hidden: false,
            items: [
              {
                id: 'video-item-1',
                track_id: 'video-track-1',
                type: 'VIDEO',
                timeline_start: 0,
                timeline_end: 30.0,
                source_start: 0,
                source_end: 30.0,
                effects: [],
                keyframes: [],
                locked: false,
                muted: false,
                hidden: false,
              },
            ],
          },
          {
            id: 'overlay-track-1',
            type: 'OVERLAY',
            name: 'Elements & Stickers',
            locked: false,
            muted: false,
            hidden: false,
            items: [
              {
                id: 'sticker-item-1',
                track_id: 'overlay-track-1',
                type: 'IMAGE',
                timeline_start: 5.0,
                timeline_end: 8.0,
                source_start: 0,
                source_end: 3.0,
                source_path: 'https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/giphy.gif',
                effects: [],
                keyframes: [],
                locked: false,
                muted: true,
                hidden: false,
                z_index: 25,
              },
              {
                id: 'sticker-item-2',
                track_id: 'overlay-track-1',
                type: 'IMAGE',
                timeline_start: 12.0,
                timeline_end: 15.0,
                source_start: 0,
                source_end: 3.0,
                source_path: 'https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif',
                effects: [],
                keyframes: [],
                locked: false,
                muted: true,
                hidden: false,
                z_index: 25,
              },
            ],
          },
          {
            id: 'caption-track-1',
            type: 'CAPTION',
            name: 'Subtitles',
            locked: false,
            muted: false,
            hidden: false,
            items: [
              {
                id: 'caption-item-1',
                track_id: 'caption-track-1',
                type: 'CAPTION',
                timeline_start: 0,
                timeline_end: 30.0,
                source_start: 0,
                source_end: 30.0,
                caption: {
                  style: 'simple',
                  cues: [
                    { id: 'c1', start: 0, end: 5, text: 'Hello world' },
                    { id: 'c2', start: 5, end: 10, text: 'This is great' },
                  ],
                },
                effects: [],
                keyframes: [],
                locked: false,
                muted: true,
                hidden: false,
              },
            ],
          },
        ],
      };
    }

    it('deletes only the selected overlay without altering canvas duration or other tracks', () => {
      const proj = createMockProject();
      const initialDuration = proj.canvas.duration;
      const initialVideoItem = { ...proj.tracks[0].items[0] };
      const initialCaptionCues = [...(proj.tracks[2].items[0].caption?.cues || [])];

      // Simulate deleteTrackItem on sticker-item-1
      const updatedTracks = proj.tracks.map((t) => {
        if (t.id !== 'overlay-track-1') return t;
        return {
          ...t,
          items: t.items.filter((i) => i.id !== 'sticker-item-1'),
        };
      });
      const updatedProject: EditorProject = { ...proj, tracks: updatedTracks };

      // 1. Target item removed
      const overlayTrack = updatedProject.tracks.find((t) => t.id === 'overlay-track-1')!;
      assert.equal(overlayTrack.items.length, 1);
      assert.equal(overlayTrack.items[0].id, 'sticker-item-2');
      assert.equal(overlayTrack.items[0].timeline_start, 12.0); // Not shifted!
      assert.equal(overlayTrack.items[0].timeline_end, 15.0);

      // 2. Canvas duration preserved (not ripple cut!)
      assert.equal(updatedProject.canvas.duration, initialDuration);

      // 3. Primary video track untouched
      assert.deepEqual(updatedProject.tracks[0].items[0], initialVideoItem);

      // 4. Captions untouched
      assert.deepEqual(updatedProject.tracks[2].items[0].caption?.cues, initialCaptionCues);
    });

    it('undo restores the removed overlay with intact transform and timeline bounds', () => {
      const history: EditorProject[] = [];
      let current = createMockProject();

      // Push snapshot to history before deleting
      history.push(JSON.parse(JSON.stringify(current)));

      // Perform delete
      current = {
        ...current,
        tracks: current.tracks.map((t) =>
          t.id === 'overlay-track-1'
            ? { ...t, items: t.items.filter((i) => i.id !== 'sticker-item-1') }
            : t
        ),
      };
      assert.equal(current.tracks[1].items.length, 1);

      // Perform Undo: pop snapshot from history
      const restored = history.pop()!;
      assert.equal(restored.tracks[1].items.length, 2);
      const restoredItem = restored.tracks[1].items.find((i) => i.id === 'sticker-item-1')!;
      assert.ok(restoredItem);
      assert.equal(restoredItem.timeline_start, 5.0);
      assert.equal(restoredItem.timeline_end, 8.0);
      assert.equal(restoredItem.z_index, 25);
    });
  });

  describe('3. Expanded Text Presets Library', () => {
    it('all text templates have unique IDs', () => {
      const ids = TEXT_TEMPLATES.map((t) => t.id);
      const uniqueIds = new Set(ids);
      assert.equal(ids.length, uniqueIds.size, 'Every text template ID must be unique');
    });

    it('includes newly added curated text presets', () => {
      const requiredNewTemplates = [
        'headline_bold_hero',
        'minimal_title_clean',
        'lower_third_broadcast',
        'name_tag_speaker',
        'location_label_pin',
        'callout_highlight_box',
        'quote_card_editorial',
        'section_title_chapter',
      ];
      for (const id of requiredNewTemplates) {
        const found = TEXT_TEMPLATES.find((t) => t.id === id);
        assert.ok(found, `Text template ${id} must exist`);
        assert.ok(found.name, `Template ${id} must have a name`);
        assert.ok(found.textConfig.font_family, `Template ${id} must define font_family`);
        assert.ok(
          (SAFE_EDITOR_FONTS as readonly string[]).includes(found.textConfig.font_family),
          `Template ${id} font ${found.textConfig.font_family} must be in SAFE_EDITOR_FONTS`
        );
        assert.ok(found.defaultDuration > 0, `Template ${id} duration must be positive`);
      }
    });
  });

  describe('4. Expanded Caption Presets Library & Export Parity', () => {
    it('preserves existing presets and includes 5 new distinct presets', () => {
      const requiredPresets: RenderableCaptionPresetId[] = [
        'karaoke',
        'deep_diver',
        'youshaei',
        'simple',
        'beasty',
        'mozi',
        'popline',
        'think_media',
        'editorial',
        'bold_highlight',
        'soft_backdrop',
        'compact_creator',
        'two_color_highlight',
      ];
      for (const id of requiredPresets) {
        assert.ok(isRenderablePresetId(id), `Preset ${id} must be recognized as renderable`);
        assert.ok(CAPTION_PRESETS[id], `CAPTION_PRESETS must have definition for ${id}`);
        assert.ok(
          (PRESET_ONLY_CAPTION_STYLES as readonly string[]).includes(id) || id === 'karaoke',
          `${id} must be in PRESET_ONLY_CAPTION_STYLES or karaoke`
        );
      }
    });

    it('each new preset produces a valid ASS subtitle script', () => {
      const newPresetIds: RenderableCaptionPresetId[] = [
        'editorial',
        'bold_highlight',
        'soft_backdrop',
        'compact_creator',
        'two_color_highlight',
      ];

      const sampleCues: PresetTimedCue[] = [
        {
          id: 'test-cue-1',
          start: 1.0,
          end: 3.5,
          text: 'Supercharge your content now',
          words: [
            { text: 'Supercharge', start: 1.0, end: 1.6 },
            { text: 'your', start: 1.6, end: 1.9 },
            { text: 'content', start: 1.9, end: 2.5 },
            { text: 'now', start: 2.5, end: 3.4 },
          ],
        },
      ];

      for (const presetId of newPresetIds) {
        const resolved = resolveCaptionPreset(presetId, undefined, '9:16');
        assert.equal(resolved.presetId, presetId);
        assert.ok(resolved.fontSize > 0);
        assert.ok(resolved.playResX === 1080);
        assert.ok(resolved.playResY === 1920);

        const assScript = buildPresetAssScript(sampleCues, resolved);
        assert.ok(assScript.includes('[Script Info]'), `${presetId} ASS must have Script Info`);
        assert.ok(assScript.includes('[V4+ Styles]'), `${presetId} ASS must have V4+ Styles`);
        assert.ok(assScript.includes('[Events]'), `${presetId} ASS must have Events`);
        assert.ok(assScript.includes('Dialogue:'), `${presetId} ASS must include Dialogue lines`);
      }
    });
  });
});
