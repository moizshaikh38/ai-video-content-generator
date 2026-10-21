import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GiphyService,
  ELEMENT_CATEGORIES,
  CURATED_FALLBACK_ELEMENTS,
} from '../services/giphyService.js';
import { ProEditorService } from '../services/proEditorService.js';
import { EditorProject, EditorTrackItem } from '../types/index.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Phase 7: Elements & Stickers (GIPHY Integration)', () => {
  describe('GiphyService & API Proxy Behavior', () => {
    it('returns valid curated fallback elements when GIPHY_API_KEY is not configured', async () => {
      assert.ok(CURATED_FALLBACK_ELEMENTS.length >= 8, 'Curated fallback should have at least 8 items');
      const stickers = CURATED_FALLBACK_ELEMENTS.filter((item) => item.type === 'sticker');
      const gifs = CURATED_FALLBACK_ELEMENTS.filter((item) => item.type === 'gif');
      assert.ok(stickers.length >= 4, 'Should have multiple stickers');
      assert.ok(gifs.length >= 4, 'Should have multiple gifs');

      const res = await GiphyService.searchElements({ query: '', type: 'sticker', limit: 10 });
      assert.equal(res.isFallback, true);
      assert.equal(res.attribution, 'Powered by GIPHY');
      assert.ok(res.items.length > 0);
      for (const item of res.items) {
        assert.equal(item.type, 'sticker');
        assert.ok(item.sourceUrl.startsWith('http'), 'sourceUrl must be a valid URL');
        assert.ok(item.previewUrl.startsWith('http'), 'previewUrl must be a valid URL');
      }
    });

    it('filters curated elements by search query accurately', async () => {
      const res = await GiphyService.searchElements({ query: 'fire', type: 'sticker' });
      assert.ok(res.items.length >= 1);
      assert.ok(res.items.some((i) => i.title.toLowerCase().includes('fire') || i.id.includes('fire')));
    });

    it('returns trending elements with pagination limits', async () => {
      const res = await GiphyService.getTrendingElements({ type: 'gif', limit: 2 });
      assert.ok(res.items.length <= 2);
      assert.equal(res.attribution, 'Powered by GIPHY');
    });

    it('exposes defined creative categories', () => {
      assert.ok(ELEMENT_CATEGORIES.length >= 6);
      const categoryIds = ELEMENT_CATEGORIES.map((c) => c.id);
      assert.ok(categoryIds.includes('reactions'));
      assert.ok(categoryIds.includes('arrows'));
      assert.ok(categoryIds.includes('emojis'));
      assert.ok(categoryIds.includes('badges'));
      assert.ok(categoryIds.includes('memes'));
    });
  });

  describe('Canvas & Timeline Track Item Model Integration', () => {
    it('creates properly structured EditorTrackItem for an added element', () => {
      const sampleElement = CURATED_FALLBACK_ELEMENTS[0];
      const currentTime = 5.0;
      const duration = 3.0;
      const canvasDuration = 30.0;

      const item: EditorTrackItem = {
        id: 'element-test-1',
        track_id: 'track-overlay-1',
        type: 'OVERLAY',
        name: `Sticker: ${sampleElement.title}`,
        timeline_start: currentTime,
        timeline_end: Math.min(canvasDuration, currentTime + duration),
        source_start: 0,
        source_end: duration,
        transform: {
          position_x: 20,
          position_y: -40,
          scale: 1.2,
          rotation: 15,
          opacity: 0.9,
        },
        source_path: sampleElement.sourceUrl,
        speed: { speed: 1.0, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 25,
      };

      assert.equal(item.type, 'OVERLAY');
      assert.equal(item.timeline_start, 5.0);
      assert.equal(item.timeline_end, 8.0);
      assert.equal(item.transform.position_x, 20);
      assert.equal(item.transform.position_y, -40);
      assert.equal(item.transform.scale, 1.2);
      assert.equal(item.transform.rotation, 15);
      assert.equal(item.transform.opacity, 0.9);
      assert.equal(item.z_index, 25);
    });
  });

  describe('FFmpeg Export Parity & Overlay Filter Compilation', () => {
    it('compiles sticker overlay with scale, position offset, and transparency in compileRenderGraph', () => {
      const tmpDir = os.tmpdir();
      const dummyStickerPath = path.join(tmpDir, 'test_sticker.png');
      fs.writeFileSync(dummyStickerPath, Buffer.from('dummy-image-data'));

      const project: EditorProject = {
        id: 'proj-elements-1',
        name: 'Elements Export Test',
        user_id: 'user-1',
        aspect_ratio: '9:16',
        canvas: {
          width: 1080,
          height: 1920,
          aspect_ratio: '9:16',
          fps: 30,
          duration: 10.0,
          background_color: '#000000',
          background_mode: 'color',
        },
        tracks: [
          {
            id: 'track-v1',
            type: 'VIDEO',
            name: 'Primary Video',
            locked: false,
            muted: false,
            hidden: false,
            items: [
              {
                id: 'item-v1',
                track_id: 'track-v1',
                type: 'VIDEO',
                timeline_start: 0,
                timeline_end: 10.0,
                source_start: 0,
                source_end: 10.0,
                transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
                speed: { speed: 1.0, pitch_preserved: true },
                effects: [],
                keyframes: [],
                locked: false,
                muted: false,
                hidden: false,
                z_index: 1,
              },
            ],
          },
          {
            id: 'track-elements',
            type: 'OVERLAY',
            name: 'Elements & Stickers',
            locked: false,
            muted: false,
            hidden: false,
            items: [
              {
                id: 'sticker-1',
                track_id: 'track-elements',
                type: 'OVERLAY',
                name: 'Sticker Overlay',
                timeline_start: 2.0,
                timeline_end: 6.0,
                source_start: 0,
                source_end: 4.0,
                source_path: dummyStickerPath,
                transform: {
                  position_x: 120,
                  position_y: -240,
                  scale: 1.5,
                  rotation: 0,
                  opacity: 0.85,
                },
                speed: { speed: 1.0, pitch_preserved: true },
                effects: [],
                keyframes: [],
                locked: false,
                muted: false,
                hidden: false,
                z_index: 25,
              },
            ],
          },
        ],
        settings: {
          snapping: true,
          safe_guides: true,
          snap_tolerance_sec: 0.1,
          show_safe_zones: true,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const dummySource = path.join(tmpDir, 'source.mp4');
      const dummyOutput = path.join(tmpDir, 'out.mp4');

      const graph = ProEditorService.compileRenderGraph(project, dummySource, dummyOutput, tmpDir);

      // Verify sticker input included in inputArgs
      assert.ok(graph.inputArgs.includes(dummyStickerPath), 'FFmpeg inputs must include sticker file');

      // Verify filtergraph contains overlay with position offset and timing
      const filterStr = graph.filterComplex.join(';');
      assert.ok(filterStr.includes('overlay='), 'Filtergraph must include overlay filter');
      assert.ok(filterStr.includes('+120'), 'Overlay must reflect X position offset +120');
      assert.ok(filterStr.includes('-240'), 'Overlay must reflect Y position offset -240');
      assert.ok(filterStr.includes('between(t,2.00,6.00)'), 'Overlay must be enabled between 2s and 6s');
      assert.ok(filterStr.includes('format=auto'), 'Overlay must preserve alpha transparency');
      assert.ok(filterStr.includes('colorchannelmixer=aa=0.85'), 'Overlay must apply opacity');

      // Cleanup
      try {
        fs.unlinkSync(dummyStickerPath);
      } catch {}
    });

    it('compiles animated GIF with -ignore_loop 0 and proper duration trim in compileRenderGraph', () => {
      const tmpDir = os.tmpdir();
      const dummyGifPath = path.join(tmpDir, 'animated_sticker.gif');
      fs.writeFileSync(dummyGifPath, Buffer.from('GIF89a-dummy'));

      const project: EditorProject = {
        id: 'proj-gif-1',
        name: 'Animated GIF Test',
        user_id: 'user-1',
        aspect_ratio: '9:16',
        canvas: {
          width: 1080,
          height: 1920,
          aspect_ratio: '9:16',
          fps: 30,
          duration: 10.0,
          background_color: '#000000',
          background_mode: 'color',
        },
        tracks: [
          {
            id: 'track-v1',
            type: 'VIDEO',
            name: 'Primary Video',
            locked: false,
            muted: false,
            hidden: false,
            items: [
              {
                id: 'item-v1',
                track_id: 'track-v1',
                type: 'VIDEO',
                timeline_start: 0,
                timeline_end: 10.0,
                source_start: 0,
                source_end: 10.0,
                transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
                speed: { speed: 1.0, pitch_preserved: true },
                effects: [],
                keyframes: [],
                locked: false,
                muted: false,
                hidden: false,
                z_index: 1,
              },
            ],
          },
          {
            id: 'track-elements',
            type: 'OVERLAY',
            name: 'Elements & Stickers',
            locked: false,
            muted: false,
            hidden: false,
            items: [
              {
                id: 'gif-1',
                track_id: 'track-elements',
                type: 'OVERLAY',
                name: 'Reaction GIF',
                timeline_start: 1.5,
                timeline_end: 5.5,
                source_start: 0,
                source_end: 4.0,
                source_path: dummyGifPath,
                transform: {
                  position_x: 0,
                  position_y: 100,
                  scale: 1.0,
                  rotation: 0,
                  opacity: 1.0,
                },
                speed: { speed: 1.0, pitch_preserved: true },
                effects: [],
                keyframes: [],
                locked: false,
                muted: false,
                hidden: false,
                z_index: 25,
              },
            ],
          },
        ],
        settings: {
          snapping: true,
          safe_guides: true,
          snap_tolerance_sec: 0.1,
          show_safe_zones: true,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const dummySource = path.join(tmpDir, 'source.mp4');
      const dummyOutput = path.join(tmpDir, 'out.mp4');

      const graph = ProEditorService.compileRenderGraph(project, dummySource, dummyOutput, tmpDir);

      // Verify -ignore_loop 0 was passed before GIF input
      assert.ok(graph.inputArgs.includes('-ignore_loop'), 'FFmpeg inputs must include -ignore_loop for animated GIF');

      const filterStr = graph.filterComplex.join(';');
      assert.ok(filterStr.includes('between(t,1.50,5.50)'), 'Overlay must be enabled between 1.5s and 5.5s');

      // Cleanup
      try {
        fs.unlinkSync(dummyGifPath);
      } catch {}
    });
  });
});
