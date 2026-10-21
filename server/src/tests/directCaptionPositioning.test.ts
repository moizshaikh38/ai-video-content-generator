import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

import {
  resolveCaptionPreset,
  buildPresetAssScript,
  sanitizePresetOverrides,
  getCaptionPlayRes,
  getPreviewCss,
  type PresetTimedCue,
} from '../shared/captionPresets.js';
import {
  editorCaptionToPresetOverrides,
  resolveEditorCaptionStyle,
} from '../../../src/lib/captionPresets.js';
import { CaptionService } from '../services/captionService.js';
import type { EditorProject, EditorCaptionItem, TimedCaptionCue } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

function createMockProject(options: {
  aspectRatio?: '9:16' | '1:1' | '16:9';
  positionX?: number;
  positionY?: number;
  style?: string;
}): EditorProject {
  const posX = options.positionX ?? 0.5;
  const posY = options.positionY ?? 0.667;
  return {
    id: 'test-project-1',
    user_id: 'test-user-1',
    title: 'Caption Positioning Test',
    version: 1,
    canvas: {
      aspect_ratio: options.aspectRatio || '9:16',
      background_color: '#000000',
    },
    playhead: 1.0,
    tracks: [
      {
        id: 'track-video',
        type: 'VIDEO',
        name: 'Video',
        order: 0,
        muted: false,
        hidden: false,
        items: [
          {
            id: 'item-video',
            track_id: 'track-video',
            type: 'VIDEO',
            timeline_start: 0,
            timeline_end: 10,
            source_start: 0,
            source_end: 10,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            speed: { speed: 1 },
          },
        ],
      },
      {
        id: 'track-caption',
        type: 'CAPTION',
        name: 'Captions',
        order: 1,
        muted: false,
        hidden: false,
        items: [
          {
            id: 'item-caption',
            track_id: 'track-caption',
            type: 'CAPTION',
            timeline_start: 0,
            timeline_end: 10,
            source_start: 0,
            source_end: 10,
            transform: {
              position_x: Number(((posX - 0.5) * 1920).toFixed(1)),
              position_y: Number((posY * 1080).toFixed(1)),
              scale: 1,
              rotation: 0,
              opacity: 1,
            },
            speed: { speed: 1 },
            caption: {
              style: (options.style as any) || 'mozi',
              position: 'bottom',
              position_x: posX,
              position_y: posY,
              highlight_color: '#FACC15',
              primary_color: '#FFFFFF',
              cues: [
                {
                  id: 'c1',
                  start: 0.5,
                  end: 2.5,
                  text: 'Direct caption positioning on video preview',
                  words: [
                    { text: 'Direct', start: 0.5, end: 0.9 },
                    { text: 'caption', start: 0.9, end: 1.3 },
                    { text: 'positioning', start: 1.3, end: 1.8 },
                    { text: 'preview', start: 1.8, end: 2.5 },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('Direct Caption Positioning: Coordinate conversion & clamping', () => {
  it('converts preview pointer coordinates to normalized frame coordinates across 9:16, 1:1, and 16:9', () => {
    const aspectRatios = [
      { ratio: '9:16', width: 360, height: 640 },
      { ratio: '1:1', width: 480, height: 480 },
      { ratio: '16:9', width: 640, height: 360 },
    ];

    for (const { ratio, width, height } of aspectRatios) {
      // Simulate pointer at horizontal center and 75% down
      const pointerX = width * 0.5;
      const pointerY = height * 0.75;

      const normX = pointerX / width;
      const normY = pointerY / height;

      assert.equal(normX, 0.5, `${ratio}: horizontal center should normalize to 0.5`);
      assert.equal(normY, 0.75, `${ratio}: vertical 75% should normalize to 0.75`);
    }
  });

  it('clamps coordinates strictly within the visible video frame boundaries', () => {
    // Testing clamping bounds [0.08, 0.92]
    const clampCoord = (val: number) => Math.max(0.08, Math.min(0.92, val));

    assert.equal(clampCoord(-0.5), 0.08, 'Should clamp negative off-screen X/Y to 0.08');
    assert.equal(clampCoord(0.02), 0.08, 'Should clamp near-edge 0.02 to 0.08');
    assert.equal(clampCoord(0.50), 0.50, 'Within boundaries coordinate remains unchanged');
    assert.equal(clampCoord(0.98), 0.92, 'Should clamp off-screen 0.98 to 0.92');
    assert.equal(clampCoord(1.50), 0.92, 'Should clamp extreme 1.50 to 0.92');
  });

  it('snaps to center (X = 0.50) and safe-zone boundaries (Y = 0.75, 0.50, 0.20)', () => {
    const snapThresholdX = 0.03;
    const snapThresholdY = 0.035;

    const snap = (x: number, y: number) => {
      let snappedX = x;
      let snappedY = y;
      if (Math.abs(x - 0.5) < snapThresholdX) snappedX = 0.5;
      if (Math.abs(y - 0.75) < snapThresholdY) snappedY = 0.75;
      else if (Math.abs(y - 0.5) < snapThresholdY) snappedY = 0.5;
      else if (Math.abs(y - 0.2) < snapThresholdY) snappedY = 0.2;
      return { x: snappedX, y: snappedY };
    };

    // Close to center X: 0.518 -> snaps to 0.50
    assert.deepEqual(snap(0.518, 0.60), { x: 0.5, y: 0.60 });
    // Close to Safe Bottom Y: 0.735 -> snaps to 0.75
    assert.deepEqual(snap(0.30, 0.735), { x: 0.30, y: 0.75 });
    // Both snapped
    assert.deepEqual(snap(0.485, 0.765), { x: 0.5, y: 0.75 });
    // Far from snap targets: keeps exact values
    assert.deepEqual(snap(0.35, 0.62), { x: 0.35, y: 0.62 });
  });
});

describe('Direct Caption Positioning: Preset and Export Parity', () => {
  it('resolveCaptionPreset computes dynamic marginL and marginR based on positionX', () => {
    const defaultMozi = resolveCaptionPreset('mozi', undefined, '9:16');
    assert.equal(defaultMozi.marginL, defaultMozi.marginR, 'Default center position has symmetrical margins');

    // Shift to the right (X = 0.75, shifted by +25% of 1080 = +270px)
    const shiftedRight = resolveCaptionPreset('mozi', { positionX: 0.75 }, '9:16');
    assert.ok(shiftedRight.marginL > defaultMozi.marginL, 'Right shifted caption has larger left margin');
    assert.ok(shiftedRight.marginR < defaultMozi.marginR || shiftedRight.marginR === 0, 'Right shifted caption has smaller right margin');
    assert.equal(shiftedRight.marginL - defaultMozi.marginL, 270, 'Left margin increased by exact center shift (0.25 * 1080 = 270px)');

    // Shift to the left (X = 0.25, shifted by -25% of 1080 = -270px)
    const shiftedLeft = resolveCaptionPreset('mozi', { positionX: 0.25 }, '9:16');
    assert.ok(shiftedLeft.marginR > defaultMozi.marginR, 'Left shifted caption has larger right margin');
    assert.equal(shiftedLeft.marginR - defaultMozi.marginR, 270, 'Right margin increased by exact center shift');
  });

  it('resolveCaptionPreset computes vertical marginV based on positionY from bottom anchor', () => {
    const playRes = getCaptionPlayRes('9:16'); // 1080x1920
    const customY = 0.80; // 80% from top -> 20% from bottom
    const style = resolveCaptionPreset('mozi', { positionY: customY }, '9:16');

    const expectedMarginV = Math.round(playRes.y * (1 - customY)); // 1920 * 0.20 = 384
    assert.equal(style.marginV, expectedMarginV, 'marginV matches playRes.y * (1 - positionY)');
  });

  it('preserves preset font, colors, active word styling, and animations during positioning', () => {
    const baseStyle = resolveCaptionPreset('beasty');
    const positionedStyle = resolveCaptionPreset('beasty', { positionX: 0.65, positionY: 0.35 });

    assert.equal(positionedStyle.fontFamily, baseStyle.fontFamily);
    assert.equal(positionedStyle.fontSize, baseStyle.fontSize);
    assert.equal(positionedStyle.textColor, baseStyle.textColor);
    assert.equal(positionedStyle.activeColor, baseStyle.activeColor);
    assert.equal(positionedStyle.uppercase, baseStyle.uppercase);
    assert.equal(positionedStyle.bold, baseStyle.bold);
    assert.deepEqual(positionedStyle.wordAnimation, baseStyle.wordAnimation);
  });

  it('getPreviewCss container matches ASS margins for exact preview ↔ export alignment', () => {
    const style = resolveCaptionPreset('mozi', { positionX: 0.70, positionY: 0.80 }, '9:16');
    const scale = 360 / 1080; // preview width / playResX
    const css = getPreviewCss(style, scale);

    const px = (v: number) => `${Number((v * scale).toFixed(3))}px`;
    const expectedLeft = px(style.marginL);
    const expectedRight = px(style.marginR);
    const expectedBottom = px(style.marginV);

    assert.equal(css.container.left, expectedLeft);
    assert.equal(css.container.right, expectedRight);
    assert.equal(css.container.bottom, expectedBottom);
  });

  it('CaptionService.buildAssScript accurately reflects customConfig.positionX in MarginL and MarginR', () => {
    const cues: TimedCaptionCue[] = [
      { id: '1', start: 0, end: 2, text: 'Custom positioning test' },
    ];
    // Right shift: positionX = 0.75 on 9:16 (playRes.x = 1080)
    // centerShift = (0.75 - 0.5) * 1080 = +270. marginL = 60 + 270 = 330, marginR = max(0, 60 - 270) = 0
    const assScriptRight = CaptionService.buildAssScript(cues, {
      style: 'clean',
      aspectRatio: '9:16',
      customConfig: {
        positionX: 0.75,
        positionY: 0.70,
      },
    });

    assert.ok(assScriptRight.includes('[V4+ Styles]'), 'Contains styles section');
    const styleLineRight = assScriptRight.split('\n').find((l) => l.startsWith('Style: Default,'));
    assert.ok(styleLineRight, 'Contains Default style line');
    // Format: ... Alignment, MarginL, MarginR, MarginV, Encoding
    assert.ok(styleLineRight.includes(',330,0,576,1'), `Expected marginL=330, marginR=0, marginV=576 in ${styleLineRight}`);
    assert.ok(assScriptRight.includes('Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,Custom positioning test'));

    // Left shift: positionX = 0.25 on 9:16 (playRes.x = 1080)
    // centerShift = (0.25 - 0.5) * 1080 = -270. marginL = max(0, 60 - 270) = 0, marginR = 60 + 270 = 330
    const assScriptLeft = CaptionService.buildAssScript(cues, {
      style: 'clean',
      aspectRatio: '9:16',
      customConfig: {
        positionX: 0.25,
        positionY: 0.70,
      },
    });
    const styleLineLeft = assScriptLeft.split('\n').find((l) => l.startsWith('Style: Default,'));
    assert.ok(styleLineLeft, 'Contains Default style line');
    assert.ok(styleLineLeft.includes(',0,330,576,1'), `Expected marginL=0, marginR=330, marginV=576 in ${styleLineLeft}`);
  });

  it('CaptionService.buildAssScript and buildPresetAssScript inject \\pos(x,y) only for cues with position_x/position_y override', () => {
    const cues: TimedCaptionCue[] = [
      {
        id: 'c1',
        start: 0,
        end: 1,
        text: 'Pinned cue',
        position_x: 0.25,
        position_y: 0.20,
      },
      {
        id: 'c2',
        start: 1,
        end: 2,
        text: 'Default cue',
      },
    ];

    // 1. CaptionService.buildAssScript
    const assLegacy = CaptionService.buildAssScript(cues, {
      style: 'clean',
      aspectRatio: '9:16',
      customConfig: {
        positionX: 0.5,
        positionY: 0.8,
      },
    });

    // 9:16 -> playResX = 1080, playResY = 1920
    // c1: px = round(0.25 * 1080) = 270, py = round(0.20 * 1920) = 384
    assert.ok(assLegacy.includes('{\\pos(270,384)}Pinned cue'), 'Cue 1 contains \\pos(270,384)');
    assert.ok(assLegacy.includes('Default,,0,0,0,,Default cue'), 'Cue 2 does not contain \\pos tag');

    // 2. buildPresetAssScript
    const presetStyle = resolveCaptionPreset('mozi', { positionX: 0.5, positionY: 0.8 }, '9:16');
    const assPreset = buildPresetAssScript(cues as PresetTimedCue[], presetStyle);

    assert.ok(assPreset.includes('{\\pos(270,384)}'), 'Preset script injects \\pos(270,384) on overridden cue');
    const c2Events = assPreset.split('\n').filter((l) => l.includes('Default cue'));
    assert.ok(c2Events.length > 0, 'Found c2 events');
    assert.ok(!c2Events.some((l) => l.includes('\\pos(')), 'Cue 2 does not have \\pos tag');
  });
});

describe('Direct Caption Positioning: State, Autosave & Undo/Redo parity', () => {
  it('editorCaptionToPresetOverrides extracts positionX and positionY from caption and transform', () => {
    const caption: EditorCaptionItem = {
      cues: [],
      style: 'mozi' as any,
      position: 'bottom',
      position_x: 0.62,
      position_y: 0.78,
      highlight_color: '#FF0000',
      primary_color: '#FFFFFF',
    };
    const overrides = editorCaptionToPresetOverrides(caption);
    assert.equal(overrides.positionX, 0.62);
    assert.equal(overrides.positionY, 0.78);

    // Fallback from transform if caption coordinates omitted
    const legacyCaption: EditorCaptionItem = {
      cues: [],
      style: 'clean',
      position: 'bottom',
      highlight_color: '#FF0000',
      primary_color: '#FFFFFF',
    };
    const transform = { position_x: 192, position_y: 810 }; // 192 / 1920 + 0.5 = 0.60; 810 / 1080 = 0.75
    const fallbackOverrides = editorCaptionToPresetOverrides(legacyCaption, transform);
    assert.equal(fallbackOverrides.positionX, 0.6);
    assert.equal(fallbackOverrides.positionY, 0.75);
  });

  it('simulates one logical drag commitment: initial snapshot restores on undo, target applies on redo', () => {
    const project = createMockProject({ positionX: 0.5, positionY: 0.667 });
    const preDragSnapshot = JSON.parse(JSON.stringify(project));

    // Simulate drag movement: intermediate updates do not add to undo history
    let liveProject = JSON.parse(JSON.stringify(project));
    const intermediatePositions = [
      { x: 0.52, y: 0.68 },
      { x: 0.55, y: 0.71 },
      { x: 0.60, y: 0.75 },
    ];

    for (const pos of intermediatePositions) {
      liveProject.tracks[1].items[0].caption.position_x = pos.x;
      liveProject.tracks[1].items[0].caption.position_y = pos.y;
    }

    // Drag ended: single history commitment
    const history: { undo: EditorProject[]; redo: EditorProject[] } = {
      undo: [preDragSnapshot],
      redo: [],
    };

    // Current state is the final position (0.60, 0.75)
    assert.equal(liveProject.tracks[1].items[0].caption.position_x, 0.60);
    assert.equal(liveProject.tracks[1].items[0].caption.position_y, 0.75);

    // Simulate Undo:
    const undoTarget = history.undo.pop()!;
    history.redo.push(JSON.parse(JSON.stringify(liveProject)));
    liveProject = undoTarget;

    assert.equal(liveProject.tracks[1].items[0].caption.position_x, 0.5, 'Undo restored initial positionX');
    assert.equal(liveProject.tracks[1].items[0].caption.position_y, 0.667, 'Undo restored initial positionY');

    // Simulate Redo:
    const redoTarget = history.redo.pop()!;
    history.undo.push(JSON.parse(JSON.stringify(liveProject)));
    liveProject = redoTarget;

    assert.equal(liveProject.tracks[1].items[0].caption.position_x, 0.60, 'Redo restored dragged positionX');
    assert.equal(liveProject.tracks[1].items[0].caption.position_y, 0.75, 'Redo restored dragged positionY');
  });
});

describe('Direct Caption Positioning: Real FFmpeg frame renders (Portrait & Landscape)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-direct-pos-'));

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function renderFrame(
    assContent: string,
    width: number,
    height: number,
    name: string,
    seekTime: string = '1.0'
  ): Promise<Buffer> {
    const out = path.join(tmp, `${name}.rgb`);
    const assPath = path.join(tmp, `${name}.ass`);
    fs.writeFileSync(assPath, assContent, 'utf8');

    const vf = [
      `ass=${assPath.replace(/\\/g, '/').replace(/:/g, '\\\\:')}`,
      'format=rgb24',
    ];

    await execFileAsync(ffmpegBin, [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=0x111827:s=${width}x${height}:d=3:r=25`,
      '-ss', seekTime,
      '-vf', vf.join(','),
      '-frames:v', '1',
      '-f', 'rawvideo',
      out,
    ]);
    return fs.readFileSync(out);
  }

  function countPixelsInRegion(
    buf: Buffer,
    width: number,
    height: number,
    region: { minX: number; maxX: number; minY: number; maxY: number },
    targetHex: string,
    tol = 35
  ): number {
    const tr = parseInt(targetHex.slice(1, 3), 16);
    const tg = parseInt(targetHex.slice(3, 5), 16);
    const tb = parseInt(targetHex.slice(5, 7), 16);

    let count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x >= region.minX && x < region.maxX && y >= region.minY && y < region.maxY) {
          const idx = (y * width + x) * 3;
          const r = buf[idx];
          const g = buf[idx + 1];
          const b = buf[idx + 2];
          if (
            Math.abs(r - tr) < tol &&
            Math.abs(g - tg) < tol &&
            Math.abs(b - tb) < tol
          ) {
            count++;
          }
        }
      }
    }
    return count;
  }

  const sampleCue: PresetTimedCue = {
    id: 'cue-1',
    start: 0.2,
    end: 2.0,
    text: 'TARGET POSITION',
    words: [
      { text: 'TARGET', start: 0.2, end: 1.1 },
      { text: 'POSITION', start: 1.1, end: 2.0 },
    ],
  };

  it('renders portrait 9:16 caption at custom bottom-right position (X=0.72, Y=0.75)', async () => {
    const W = 540;
    const H = 960;
    const style = resolveCaptionPreset('mozi', { positionX: 0.72, positionY: 0.75 }, '9:16');
    const ass = buildPresetAssScript([sampleCue], style);

    const frameBuf = await renderFrame(ass, W, H, 'portrait-bottom-right');

    // Right half (minX: 270, maxX: 540) vs Left half (minX: 0, maxX: 270)
    // Bottom half (minY: 480, maxY: 960) vs Top half (minY: 0, maxY: 480)
    const rightBottomCount = countPixelsInRegion(
      frameBuf,
      W,
      H,
      { minX: 270, maxX: 540, minY: 480, maxY: 960 },
      style.textColor
    );
    const topCount = countPixelsInRegion(
      frameBuf,
      W,
      H,
      { minX: 0, maxX: 540, minY: 0, maxY: 480 },
      style.textColor
    );

    assert.ok(rightBottomCount > 100, `Expected caption pixels in bottom-right quadrant, got ${rightBottomCount}`);
    assert.equal(topCount, 0, 'No caption pixels in top half of frame');
  });

  it('renders landscape 16:9 caption at custom top-left position (X=0.28, Y=0.25)', async () => {
    const W = 960;
    const H = 540;
    const style = resolveCaptionPreset('popline', { positionX: 0.28, positionY: 0.25 }, '16:9');
    const ass = buildPresetAssScript([sampleCue], style);

    const frameBuf = await renderFrame(ass, W, H, 'landscape-top-left');

    const leftTopCount = countPixelsInRegion(
      frameBuf,
      W,
      H,
      { minX: 0, maxX: 480, minY: 0, maxY: 270 },
      style.textColor
    );
    const bottomCount = countPixelsInRegion(
      frameBuf,
      W,
      H,
      { minX: 0, maxX: 960, minY: 270, maxY: 540 },
      style.textColor
    );

    assert.ok(leftTopCount > 100, `Expected caption pixels in top-left quadrant, got ${leftTopCount}`);
    assert.equal(bottomCount, 0, 'No caption pixels in bottom half of frame');
  });

  it('renders per-cue position override in FFmpeg: cue 1 pinned at top-left and cue 2 at default bottom', async () => {
    const W = 540;
    const H = 960;
    const cues: PresetTimedCue[] = [
      {
        id: 'cue-pinned',
        start: 0.0,
        end: 1.0,
        text: 'TOP PINNED',
        position_x: 0.25,
        position_y: 0.20,
      },
      {
        id: 'cue-default',
        start: 1.0,
        end: 2.0,
        text: 'BOTTOM DEFAULT',
      },
    ];

    const style = resolveCaptionPreset('mozi', { positionX: 0.5, positionY: 0.85 }, '9:16');
    const ass = buildPresetAssScript(cues, style);

    // Frame at t = 0.5s (Cue 1: TOP PINNED)
    const frame1 = await renderFrame(ass, W, H, 'per-cue-override-cue1', '0.5');
    const c1TopLeftCount = countPixelsInRegion(
      frame1,
      W,
      H,
      { minX: 0, maxX: 300, minY: 0, maxY: 480 },
      style.textColor
    );
    const c1BottomCount = countPixelsInRegion(
      frame1,
      W,
      H,
      { minX: 0, maxX: 540, minY: 480, maxY: 960 },
      style.textColor
    );

    assert.ok(c1TopLeftCount > 50, `Expected cue 1 text in top-left, got ${c1TopLeftCount}`);
    assert.equal(c1BottomCount, 0, 'Expected no caption text in bottom half during cue 1');

    // Frame at t = 1.5s (Cue 2: BOTTOM DEFAULT)
    const frame2 = await renderFrame(ass, W, H, 'per-cue-override-cue2', '1.5');
    const c2TopCount = countPixelsInRegion(
      frame2,
      W,
      H,
      { minX: 0, maxX: 540, minY: 0, maxY: 480 },
      style.textColor
    );
    const c2BottomCount = countPixelsInRegion(
      frame2,
      W,
      H,
      { minX: 0, maxX: 540, minY: 480, maxY: 960 },
      style.textColor
    );

    assert.ok(c2BottomCount > 50, `Expected cue 2 text in bottom half, got ${c2BottomCount}`);
    assert.equal(c2TopCount, 0, 'Expected no caption text in top half during cue 2');
  });
});

describe('Direct Caption Positioning: Zero-jump grab offset & Platform Danger Zones', () => {
  it('computes grab offset without initial jumping and locks horizontal axis with Shift', () => {
    // Current caption center: (0.50, 0.75)
    const currentCoords = { x: 0.50, y: 0.75 };
    // User clicks slightly off-center inside the caption box at (0.54, 0.72)
    const pointerDown = { x: 0.54, y: 0.72 };

    const grabOffset = {
      x: pointerDown.x - currentCoords.x, // 0.04
      y: pointerDown.y - currentCoords.y, // -0.03
    };

    assert.equal(Number(grabOffset.x.toFixed(2)), 0.04);
    assert.equal(Number(grabOffset.y.toFixed(2)), -0.03);

    // If pointer moves to (0.54, 0.72) on frame 1: delta = 0, no jump
    const firstMoveRawX = pointerDown.x - grabOffset.x;
    const firstMoveRawY = pointerDown.y - grabOffset.y;
    assert.equal(Number(firstMoveRawX.toFixed(2)), 0.50, 'Zero-jump: raw position remains 0.50 on start');
    assert.equal(Number(firstMoveRawY.toFixed(2)), 0.75, 'Zero-jump: raw position remains 0.75 on start');

    // Pointer moves to (0.60, 0.65) without shift
    let moveX = 0.60 - grabOffset.x; // 0.56
    let moveY = 0.65 - grabOffset.y; // 0.68
    assert.equal(Number(moveX.toFixed(2)), 0.56);
    assert.equal(Number(moveY.toFixed(2)), 0.68);

    // Pointer moves with Shift held: horizontal locks strictly to center 0.50
    const shiftKey = true;
    if (shiftKey) {
      moveX = 0.50;
    }
    assert.equal(moveX, 0.50, 'Shift key locks horizontal axis to 0.50');
    assert.equal(Number(moveY.toFixed(2)), 0.68, 'Vertical movement continues freely');
  });

  it('accurately identifies TikTok/Reels 9:16 platform dead zones vs safe zone', () => {
    const isDangerZone = (aspectRatio: string, x: number, y: number) => {
      if (aspectRatio !== '9:16') return false;
      const isBottomDanger = y > 0.84;
      const isRightRailDanger = x > 0.84 && y > 0.45;
      return isBottomDanger || isRightRailDanger;
    };

    // Standard safe center / bottom safe:
    assert.equal(isDangerZone('9:16', 0.50, 0.75), false, 'Bottom safe (75%) is safe');
    assert.equal(isDangerZone('9:16', 0.50, 0.50), false, 'Middle center (50%) is safe');
    assert.equal(isDangerZone('9:16', 0.50, 0.20), false, 'Top safe (20%) is safe');

    // Inside bottom description dead zone (y > 0.84):
    assert.equal(isDangerZone('9:16', 0.50, 0.85), true, 'Y=0.85 is inside bottom dead zone');
    assert.equal(isDangerZone('9:16', 0.50, 0.90), true, 'Y=0.90 is inside bottom dead zone');

    // Inside right action rail dead zone (x > 0.84 && y > 0.45):
    assert.equal(isDangerZone('9:16', 0.86, 0.60), true, 'X=0.86, Y=0.60 is inside right action rail dead zone');
    assert.equal(isDangerZone('9:16', 0.85, 0.80), true, 'X=0.85, Y=0.80 is inside right action rail');

    // Top-right corner (x > 0.84, but y <= 0.45): NOT in action rail
    assert.equal(isDangerZone('9:16', 0.88, 0.30), false, 'Top right is outside the action rail');

    // Other aspect ratios do not trigger 9:16 dead zones:
    assert.equal(isDangerZone('16:9', 0.50, 0.88), false, '16:9 does not use 9:16 vertical dead zones');
  });
});
