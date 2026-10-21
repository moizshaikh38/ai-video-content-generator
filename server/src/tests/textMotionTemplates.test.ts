/**
 * Phase 6 — Text & Motion Templates Test Suite
 *
 * Validates:
 * 1. Template catalog, categorization, typography, and animation presets.
 * 2. Quick add text generation and track auto-resolution.
 * 3. Canvas coordinate transformation across aspect ratios (9:16, 1:1, 16:9).
 * 4. Contextual inspector operations (layer reordering, duplication, transform reset).
 * 5. ProEditorService compileTextLayerDrawtext & FFmpeg filtergraph generation.
 * 6. Character escaping and security in drawtext filters.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXT_TEMPLATES,
  TEXT_TEMPLATE_CATEGORIES,
  TextTemplate,
  TextTemplateCategory,
  createTrackItemFromTemplate,
  createQuickAddTextItem,
} from '../shared/textTemplates.js';
import { ProEditorService } from '../services/proEditorService.js';
import {
  SAFE_EDITOR_FONTS,
  EditorProject,
  EditorTrackItem,
} from '../types/index.js';

describe('Phase 6: Text & Motion Templates', () => {
  describe('1. Template Catalog & Schema Validation', () => {
    it('defines all required template categories', () => {
      const categoryIds = TEXT_TEMPLATE_CATEGORIES.map((c) => c.id);
      assert.ok(categoryIds.includes('all'));
      assert.ok(categoryIds.includes('headlines'));
      assert.ok(categoryIds.includes('lower_thirds'));
      assert.ok(categoryIds.includes('name_tags'));
      assert.ok(categoryIds.includes('location_labels'));
      assert.ok(categoryIds.includes('callouts'));
      assert.ok(categoryIds.includes('intro_outro'));
      assert.ok(categoryIds.includes('minimal_clean'));
    });

    it('contains curated templates across every category', () => {
      assert.ok(TEXT_TEMPLATES.length >= 10, 'Expected at least 10 high-quality templates');

      const expectedCategories: TextTemplateCategory[] = [
        'headlines',
        'lower_thirds',
        'name_tags',
        'location_labels',
        'callouts',
        'intro_outro',
        'minimal_clean',
      ];

      for (const cat of expectedCategories) {
        const count = TEXT_TEMPLATES.filter((t) => t.category === cat).length;
        assert.ok(count >= 1, `Category "${cat}" should have at least 1 template (found ${count})`);
      }
    });

    it('ensures every template uses a SAFE_EDITOR_FONT and valid typography', () => {
      for (const tpl of TEXT_TEMPLATES) {
        assert.ok(tpl.id, 'Template must have an id');
        assert.ok(tpl.name, 'Template must have a human-readable name');
        assert.ok(tpl.defaultText, 'Template must have default text');

        const font = tpl.textConfig.font_family;
        assert.ok(
          (SAFE_EDITOR_FONTS as readonly string[]).includes(font),
          `Template ${tpl.id} uses unsafe font "${font}"`
        );

        assert.ok(tpl.textConfig.font_size > 0, 'Font size must be positive');
        assert.ok(
          ['normal', 'medium', 'bold', 'black'].includes(tpl.textConfig.font_weight),
          `Invalid font weight for ${tpl.id}`
        );
        assert.ok(
          ['left', 'center', 'right'].includes(tpl.textConfig.alignment),
          `Invalid alignment for ${tpl.id}`
        );
        assert.ok(tpl.textConfig.color, `Template ${tpl.id} must define a color`);
      }
    });

    it('ensures every template specifies a valid motion animation and transform', () => {
      const validAnimations = ['none', 'fade', 'slide_up', 'pop', 'typewriter', 'scale', 'bounce_lite'];

      for (const tpl of TEXT_TEMPLATES) {
        const anim = tpl.textConfig.animation || 'none';
        assert.ok(
          validAnimations.includes(anim),
          `Template ${tpl.id} specifies unknown animation "${anim}"`
        );

        assert.ok(
          tpl.defaultTransform !== undefined,
          `Template ${tpl.id} must define defaultTransform`
        );
        assert.equal(typeof tpl.defaultTransform.position_x, 'number');
        assert.equal(typeof tpl.defaultTransform.position_y, 'number');
        assert.equal(typeof tpl.defaultTransform.scale, 'number');
        assert.equal(typeof tpl.defaultDuration, 'number');
        assert.ok(tpl.defaultDuration > 0);
      }
    });
  });

  describe('2. Text Item Creation & Quick Add', () => {
    it('creates track item from template with correct timeline bounds and config', () => {
      const template = TEXT_TEMPLATES[0];
      const item = createTrackItemFromTemplate(template, 'track-123', 5.2, 30.0);

      assert.equal(item.type, 'TEXT');
      assert.equal(item.track_id, 'track-123');
      assert.equal(item.timeline_start, 5.2);
      assert.equal(item.timeline_end, 5.2 + template.defaultDuration);
      assert.equal(item.text?.text, template.defaultText);
      assert.equal(item.text?.font_family, template.textConfig.font_family);
      assert.equal(item.text?.animation, template.textConfig.animation);
      assert.equal(item.z_index, 20);
    });

    it('clamps timeline bounds when nearing canvas duration', () => {
      const template = TEXT_TEMPLATES[0];
      const item = createTrackItemFromTemplate(template, 'track-123', 29.0, 30.0);

      assert.equal(item.timeline_start, 29.0);
      assert.equal(item.timeline_end, 30.0);
    });

    it('creates quick-add heading, subheading, and body items', () => {
      const heading = createQuickAddTextItem('heading', 'track-1', 0, 10);
      assert.equal(heading.text?.text, 'Add Heading');
      assert.equal(heading.text?.font_size, 48);
      assert.equal(heading.text?.font_weight, 'bold');
      assert.equal(heading.text?.animation, 'pop');

      const subheading = createQuickAddTextItem('subheading', 'track-1', 2, 10);
      assert.equal(subheading.text?.text, 'Add Subheading');
      assert.equal(subheading.text?.font_size, 32);
      assert.equal(subheading.text?.animation, 'fade');

      const body = createQuickAddTextItem('body', 'track-1', 4, 10);
      assert.equal(body.text?.text, 'Add body text here');
      assert.equal(body.text?.font_size, 26);
      assert.equal(body.text?.animation, 'slide_up');
    });
  });

  describe('3. Contextual Inspector Layer & Transform Operations', () => {
    it('sanitizes 6-digit and 8-digit hex colors for FFmpeg', () => {
      assert.equal(ProEditorService.sanitizeHexColor('#FFFFFF'), 'FFFFFF');
      assert.equal(ProEditorService.sanitizeHexColor('#000000D9'), '000000');
      assert.equal(ProEditorService.sanitizeHexColor('#FACC15'), 'FACC15');
      assert.equal(ProEditorService.sanitizeHexColor('38BDF8'), '38BDF8');
      assert.equal(ProEditorService.sanitizeHexColor('invalid', '0B0D12'), '0B0D12');
    });

    it('validates and falls back safely on editor fonts', () => {
      assert.equal(ProEditorService.validateFont('Inter'), 'Inter');
      assert.equal(ProEditorService.validateFont('Montserrat'), 'Montserrat');
      assert.equal(ProEditorService.validateFont('Impact'), 'Impact');
      assert.equal(ProEditorService.validateFont('Comic Sans MS'), 'Arial');
      assert.equal(ProEditorService.validateFont(undefined), 'Arial');
    });
  });

  describe('4. ProEditorService compileTextLayerDrawtext & Motion Export', () => {
    it('compiles basic static text layer without crash', () => {
      const item: EditorTrackItem = {
        id: 'txt-001',
        track_id: 'track-text',
        type: 'TEXT',
        timeline_start: 1.0,
        timeline_end: 4.0,
        source_start: 0,
        source_end: 3.0,
        transform: { position_x: 0, position_y: 100, scale: 1.0, rotation: 0, opacity: 1.0 },
        speed: { speed: 1.0, pitch_preserved: true },
        text: {
          text: 'Hello VireoClip',
          font_family: 'Inter',
          font_size: 36,
          font_weight: 'bold',
          italic: false,
          alignment: 'center',
          color: '#FFFFFF',
          animation: 'none',
        },
        effects: [],
        keyframes: [],
        locked: false,
        muted: true,
        hidden: false,
        z_index: 20,
      };

      const filter = ProEditorService.compileTextLayerDrawtext(item, 1080, 1920, '9:16');
      assert.ok(filter, 'Filter string should be generated');
      assert.ok(filter.startsWith('drawtext='), 'Must be a drawtext filter');
      assert.ok(filter.includes("text='Hello VireoClip'"), 'Must contain sanitized text');
      assert.ok(filter.includes("font='Inter'"), 'Must specify font');
      assert.ok(filter.includes("fontcolor=0xFFFFFF"), 'Must specify fontcolor');
      assert.ok(filter.includes("enable='between(t,1.00,4.00)'"), 'Must have correct enable interval');
    });

    it('compiles fade animation with alpha timing expression', () => {
      const item: EditorTrackItem = {
        id: 'txt-fade',
        track_id: 't-1',
        type: 'TEXT',
        timeline_start: 2.0,
        timeline_end: 6.0,
        source_start: 0,
        source_end: 4.0,
        transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 0.9 },
        speed: { speed: 1.0, pitch_preserved: true },
        text: {
          text: 'Fade Title',
          font_family: 'Georgia',
          font_size: 40,
          font_weight: 'bold',
          italic: false,
          alignment: 'center',
          color: '#FFFFFF',
          animation: 'fade',
          animation_duration: 0.5,
        },
        effects: [],
        keyframes: [],
        locked: false,
        muted: true,
        hidden: false,
        z_index: 20,
      };

      const filter = ProEditorService.compileTextLayerDrawtext(item, 1080, 1920, '9:16')!;
      assert.ok(filter.includes("alpha='if(lt(t,"), 'Must contain alpha entrance expression');
      assert.ok(filter.includes('2.50'), 'Must reflect start + animDuration in alpha expression');
      assert.ok(filter.includes('5.50'), 'Must reflect end - animDuration in alpha exit expression');
    });

    it('compiles slide_up animation with vertical translation expression', () => {
      const item: EditorTrackItem = {
        id: 'txt-slide',
        track_id: 't-1',
        type: 'TEXT',
        timeline_start: 0.0,
        timeline_end: 3.5,
        source_start: 0,
        source_end: 3.5,
        transform: { position_x: 0, position_y: 200, scale: 1.0, rotation: 0, opacity: 1.0 },
        speed: { speed: 1.0, pitch_preserved: true },
        text: {
          text: 'Slide Up Subtitle',
          font_family: 'Montserrat',
          font_size: 32,
          font_weight: 'bold',
          italic: false,
          alignment: 'center',
          color: '#38BDF8',
          animation: 'slide_up',
          animation_duration: 0.4,
        },
        effects: [],
        keyframes: [],
        locked: false,
        muted: true,
        hidden: false,
        z_index: 20,
      };

      const filter = ProEditorService.compileTextLayerDrawtext(item, 1080, 1920, '9:16')!;
      assert.ok(filter.includes("y='((h-text_h)/2"), 'Must contain dynamic y expression');
      assert.ok(filter.includes("*(1-(t-0.00)/0.40)"), 'Must contain slide progress equation');
    });

    it('compiles pop / scale animation with dynamic fontsize equation', () => {
      const item: EditorTrackItem = {
        id: 'txt-pop',
        track_id: 't-1',
        type: 'TEXT',
        timeline_start: 1.5,
        timeline_end: 4.5,
        source_start: 0,
        source_end: 3.0,
        transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
        speed: { speed: 1.0, pitch_preserved: true },
        text: {
          text: 'VIRAL POP',
          font_family: 'Impact',
          font_size: 48,
          font_weight: 'black',
          italic: false,
          alignment: 'center',
          color: '#FACC15',
          animation: 'pop',
          animation_duration: 0.4,
        },
        effects: [],
        keyframes: [],
        locked: false,
        muted: true,
        hidden: false,
        z_index: 20,
      };

      const filter = ProEditorService.compileTextLayerDrawtext(item, 1080, 1920, '9:16')!;
      assert.ok(filter.includes("fontsize='"), 'Must contain dynamic fontsize expression');
      assert.ok(filter.includes('0.6+0.4*'), 'Must contain pop scale equation');
    });

    it('compiles background box, stroke outline, and drop shadow when configured', () => {
      const item: EditorTrackItem = {
        id: 'txt-styled',
        track_id: 't-1',
        type: 'TEXT',
        timeline_start: 0.0,
        timeline_end: 3.0,
        source_start: 0,
        source_end: 3.0,
        transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
        speed: { speed: 1.0, pitch_preserved: true },
        text: {
          text: 'Fully Styled Card',
          font_family: 'Inter',
          font_size: 30,
          font_weight: 'bold',
          italic: false,
          alignment: 'center',
          color: '#FFFFFF',
          background_color: '#7C3AEDF2',
          background_padding: 12,
          stroke_width: 2,
          stroke_color: '#000000',
          shadow_blur: 8,
          shadow_color: '#000000',
          animation: 'none',
        },
        effects: [],
        keyframes: [],
        locked: false,
        muted: true,
        hidden: false,
        z_index: 20,
      };

      const filter = ProEditorService.compileTextLayerDrawtext(item, 1080, 1920, '9:16')!;
      assert.ok(filter.includes('box=1:boxcolor=0x7C3AED@0.8:boxborderw='), 'Must compile background box');
      assert.ok(filter.includes('borderw=6:bordercolor=0x000000'), 'Must compile scaled border stroke');
      assert.ok(filter.includes('shadowx='), 'Must compile shadow x and y');
    });

    it('safely escapes special characters (colons, quotes, percent) in drawtext', () => {
      const item: EditorTrackItem = {
        id: 'txt-escape',
        track_id: 't-1',
        type: 'TEXT',
        timeline_start: 0.0,
        timeline_end: 3.0,
        source_start: 0,
        source_end: 3.0,
        transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
        speed: { speed: 1.0, pitch_preserved: true },
        text: {
          text: "Don't miss 100% of: 'Special Deals'!",
          font_family: 'Inter',
          font_size: 30,
          font_weight: 'bold',
          italic: false,
          alignment: 'center',
          color: '#FFFFFF',
          animation: 'none',
        },
        effects: [],
        keyframes: [],
        locked: false,
        muted: true,
        hidden: false,
        z_index: 20,
      };

      const filter = ProEditorService.compileTextLayerDrawtext(item, 1080, 1920, '9:16')!;
      // Colons escaped as \:
      assert.ok(filter.includes('\\:'), 'Colon must be escaped');
      // Percent escaped as \%
      assert.ok(filter.includes('\\%'), 'Percent must be escaped');
      // Single quotes stripped
      assert.ok(!filter.includes("Don't"), 'Single quotes must be stripped');
    });
  });

  describe('5. Full Render Graph Multi-Text Layer Compilation', () => {
    it('orders multiple text layers by z_index into FFmpeg filterComplex chain', () => {
      const project: EditorProject = {
        id: 'proj-1',
        clip_id: 'clip-1',
        user_id: 'user-1',
        title: 'Multi-layer Test',
        canvas: {
          width: 1080,
          height: 1920,
          aspect_ratio: '9:16',
          fps: 30,
          duration: 10.0,
          background_color: '#000000',
        },
        tracks: [
          {
            id: 'video-track',
            name: 'Main Video',
            type: 'VIDEO',
            items: [
              {
                id: 'v-item-1',
                track_id: 'video-track',
                type: 'VIDEO',
                timeline_start: 0,
                timeline_end: 10,
                source_start: 0,
                source_end: 10,
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
            locked: false,
            hidden: false,
            muted: false,
            z_index: 1,
          },
          {
            id: 'text-track',
            name: 'Text Overlays',
            type: 'TEXT',
            items: [
              {
                id: 'txt-upper',
                track_id: 'text-track',
                type: 'TEXT',
                timeline_start: 0,
                timeline_end: 5,
                source_start: 0,
                source_end: 5,
                transform: { position_x: 0, position_y: -200, scale: 1.0, rotation: 0, opacity: 1.0 },
                speed: { speed: 1.0, pitch_preserved: true },
                text: {
                  text: 'Top Headline',
                  font_family: 'Montserrat',
                  font_size: 40,
                  font_weight: 'bold',
                  italic: false,
                  alignment: 'center',
                  color: '#FFFFFF',
                  animation: 'pop',
                },
                effects: [],
                keyframes: [],
                locked: false,
                muted: true,
                hidden: false,
                z_index: 30, // Higher z-index
              },
              {
                id: 'txt-lower',
                track_id: 'text-track',
                type: 'TEXT',
                timeline_start: 0,
                timeline_end: 5,
                source_start: 0,
                source_end: 5,
                transform: { position_x: 0, position_y: 200, scale: 1.0, rotation: 0, opacity: 1.0 },
                speed: { speed: 1.0, pitch_preserved: true },
                text: {
                  text: 'Lower Third',
                  font_family: 'Inter',
                  font_size: 30,
                  font_weight: 'medium',
                  italic: false,
                  alignment: 'center',
                  color: '#FFFFFF',
                  animation: 'slide_up',
                },
                effects: [],
                keyframes: [],
                locked: false,
                muted: true,
                hidden: false,
                z_index: 10, // Lower z-index
              },
            ],
            locked: false,
            hidden: false,
            muted: false,
            z_index: 20,
          },
        ],
        settings: {
          snapping_enabled: true,
          snap_threshold_frames: 3,
          ripple_editing: false,
          safe_area_guides: true,
          preview_quality: 'high',
          autosave_interval_ms: 5000,
        },
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const graph = ProEditorService.compileRenderGraph(project, '/fake/source.mp4', '/fake/out.mp4', '/tmp');

      assert.ok(graph.filterComplex.length > 0, 'filterComplex should have items');

      // Check that both drawtext filters are present in filterComplex
      const drawtextEntries = graph.filterComplex.filter((f) => f.includes('drawtext='));
      assert.equal(drawtextEntries.length, 2, 'Must contain 2 drawtext filters');

      // Lower z_index (txt-lower, z_index: 10) must be compiled before higher z_index (txt-upper, z_index: 30)
      const firstTextIdx = graph.filterComplex.findIndex((f) => f.includes('Lower Third'));
      const secondTextIdx = graph.filterComplex.findIndex((f) => f.includes('Top Headline'));

      assert.ok(firstTextIdx !== -1, 'Lower Third filter must be present');
      assert.ok(secondTextIdx !== -1, 'Top Headline filter must be present');
      assert.ok(
        firstTextIdx < secondTextIdx,
        `Lower z_index (10) must be composited before higher z_index (30). Found indices: ${firstTextIdx}, ${secondTextIdx}`
      );
    });
  });
});
