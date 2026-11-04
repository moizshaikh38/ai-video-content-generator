import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NleExportService } from '../services/nleExportService.js';
import { EditorProject, EditorTrack } from '../types/index.js';

function createMockProject(): EditorProject {
  const videoTrack: EditorTrack = {
    id: 'track-v1',
    type: 'VIDEO',
    name: 'Main Video',
    locked: false,
    muted: false,
    hidden: false,
    items: [
      {
        id: 'slice-1',
        track_id: 'track-v1',
        type: 'VIDEO',
        timeline_start: 0,
        timeline_end: 5.0,
        source_start: 0,
        source_end: 5.0,
        speed: { speed: 1.0, pitch_preserved: true },
        transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 0,
      },
      {
        id: 'slice-2',
        track_id: 'track-v1',
        type: 'VIDEO',
        timeline_start: 5.0,
        timeline_end: 28.0,
        source_start: 7.0,
        source_end: 30.0,
        speed: { speed: 1.0, pitch_preserved: true },
        transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 0,
      },
    ],
  };

  const captionTrack: EditorTrack = {
    id: 'track-c1',
    type: 'CAPTION',
    name: 'Kinetic Subtitles',
    locked: false,
    muted: false,
    hidden: false,
    items: [
      {
        id: 'cap-1',
        track_id: 'track-c1',
        type: 'CAPTION',
        timeline_start: 0,
        timeline_end: 28.0,
        source_start: 0,
        source_end: 28.0,
        speed: { speed: 1.0, pitch_preserved: true },
        transform: { position_x: 0, position_y: 720, scale: 1.0, rotation: 0, opacity: 1.0 },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 10,
        caption: {
          style: 'bold',
          position: 'bottom',
          primary_color: '#FFFFFF',
          highlight_color: '#FF6B35',
          font_family: 'Arial Black',
          font_weight: 'black',
          uppercase: true,
          stroke_width: 3,
          stroke_color: '#000000',
          shadow_enabled: true,
          shadow_blur: 6,
          max_lines: 1,
          cues: [
            {
              id: 'cue-1',
              start: 1.0,
              end: 3.5,
              text: 'Hook that stops the scroll',
            },
            {
              id: 'cue-2',
              start: 8.0,
              end: 11.5,
              text: 'Viral retention secret',
            },
          ],
        },
      },
    ],
  };

  return {
    id: 'proj-p2-test',
    user_id: 'user-p2',
    clip_id: 'clip-p2',
    version: 1,
    canvas: {
      aspect_ratio: '9:16',
      width: 1080,
      height: 1920,
      fps: 30,
      duration: 28.0,
      background_color: '#000000',
    },
    tracks: [videoTrack, captionTrack],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe('Phase P2: Pro Typography & NLE XML Export Bridge', () => {
  it('P2.1: Stores and verifies pro typography properties on EditorCaptionItem', () => {
    const project = createMockProject();
    const captionItem = project.tracks.find((t) => t.type === 'CAPTION')?.items[0];
    assert.ok(captionItem?.caption, 'Caption item must exist');

    assert.equal(captionItem.caption.font_family, 'Arial Black');
    assert.equal(captionItem.caption.font_weight, 'black');
    assert.equal(captionItem.caption.uppercase, true);
    assert.equal(captionItem.caption.stroke_width, 3);
    assert.equal(captionItem.caption.shadow_enabled, true);
    assert.equal(captionItem.caption.shadow_blur, 6);
    assert.equal(captionItem.caption.max_lines, 1);
  });

  it('P2.2: Generates valid Premiere Pro / DaVinci Resolve FCP 7 XML (.xml) with multi-slice cuts', () => {
    const project = createMockProject();
    const clipMock = {
      id: 'clip-p2',
      title: 'Top 5 Creator Habits',
      source_storage_path: 'https://cdn.vireoclip.ai/raw/habits.mp4',
    };

    const xml = NleExportService.generatePremiereXml(project, clipMock as any);

    // Verify XML structure
    assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<!DOCTYPE xmeml>/);
    assert.match(xml, /<xmeml version="5">/);
    assert.match(xml, /<name>Top 5 Creator Habits<\/name>/);

    // Verify format dimensions (1080x1920 at 30fps)
    assert.match(xml, /<timebase>30<\/timebase>/);
    assert.match(xml, /<width>1080<\/width>/);
    assert.match(xml, /<height>1920<\/height>/);

    // Verify Slice 1 (0 to 5s => frame 0 to 150)
    assert.match(xml, /<start>0<\/start>/);
    assert.match(xml, /<end>150<\/end>/);
    assert.match(xml, /<in>0<\/in>/);
    assert.match(xml, /<out>150<\/out>/);

    // Verify Slice 2 (5 to 28s on timeline => frame 150 to 840, source start 7s => in 210)
    assert.match(xml, /<start>150<\/start>/);
    assert.match(xml, /<end>840<\/end>/);
    assert.match(xml, /<in>210<\/in>/);
    assert.match(xml, /<out>900<\/out>/);

    // Verify Caption Markers
    assert.match(xml, /<marker>/);
    assert.match(xml, /<name>Hook that stops the scroll<\/name>/);
    assert.match(xml, /<in>30<\/in>/);
    assert.match(xml, /<out>105<\/out>/);
    assert.match(xml, /<name>Viral retention secret<\/name>/);
  });

  it('P2.3: Generates valid Final Cut Pro X XML (.fcpxml) with nested timeline markers', () => {
    const project = createMockProject();
    const clipMock = {
      id: 'clip-p2',
      title: 'Top 5 Creator Habits',
      source_storage_path: 'https://cdn.vireoclip.ai/raw/habits.mp4',
    };

    const fcpxml = NleExportService.generateFcpxml(project, clipMock as any);

    // Verify FCPXML structure
    assert.match(fcpxml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(fcpxml, /<!DOCTYPE fcpxml>/);
    assert.match(fcpxml, /<fcpxml version="1\.9">/);
    assert.match(fcpxml, /width="1080" height="1920"/);

    // Verify spine contains sliced asset clips
    assert.match(fcpxml, /<asset-clip name="Slice 1" ref="r2" offset="0s" duration="5s" start="0s">/);
    assert.match(fcpxml, /<asset-clip name="Slice 2" ref="r2" offset="5s" duration="23s" start="7s">/);

    // Verify embedded marker inside Slice 1
    assert.match(fcpxml, /<marker start="1\.000s" duration="2\.500s" value="Hook that stops the scroll" \/>/);

    // Verify combined method
    const combined = NleExportService.generatePremiereAndFcpxml(project, clipMock as any);
    assert.ok(combined.premiereXml.length > 500);
    assert.ok(combined.fcpxml.length > 500);
    assert.equal(combined.filenameBase, 'top_5_creator_habits');
  });
});
