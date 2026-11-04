/**
 * Title-card export: compiles a project with an intro title card + video, runs a real
 * FFmpeg render, and probes that the output opens on the solid-colour card (with text) and
 * then shows real video — i.e. the card is actually burned into the exported file.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { ProEditorService } from '../services/proEditorService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';
const SAMPLE_VIDEO = path.resolve(process.cwd(), '..', 'public/demo/landing/clips/mrbeast-clip-01.mp4');

describe('ProEditorService drawtext/colour sanitizers', () => {
  it('sanitizes hex colours and rejects junk', () => {
    assert.equal(ProEditorService.sanitizeHexColor('#1A2B3C'), '1A2B3C');
    assert.equal(ProEditorService.sanitizeHexColor('ffffff'), 'FFFFFF');
    assert.equal(ProEditorService.sanitizeHexColor('red', '000000'), '000000');
    assert.equal(ProEditorService.sanitizeHexColor(undefined), '0B0D12');
  });

  it('strips drawtext-special characters to prevent filter injection', () => {
    assert.equal(ProEditorService.escapeDrawtext("Hi:there'%\\{x}"), 'Hitherex');
    assert.equal(ProEditorService.escapeDrawtext('My Intro!'), 'My Intro!');
    assert.equal(ProEditorService.escapeDrawtext('Chapter 2 — "Go"'), 'Chapter 2 Go');
    assert.ok(!ProEditorService.escapeDrawtext("a:b'c").includes(':'));
    assert.ok(!ProEditorService.escapeDrawtext("a:b'c").includes("'"));
  });

  it('includes a title-card colour segment in the compiled graph', () => {
    const project: any = {
      canvas: { duration: 8, aspect_ratio: '9:16', width: 1080, height: 1920, fps: 30 },
      tracks: [
        {
          id: 'tv', type: 'VIDEO', name: 'Main Video', hidden: false, items: [
            { id: 'card', type: 'IMAGE', is_title_card: true, title_card_text: 'Intro', background_color: '#101418',
              timeline_start: 0, timeline_end: 3, source_start: 0, source_end: 3, transform: {}, keyframes: [], effects: [] },
            { id: 'v', type: 'VIDEO', timeline_start: 3, timeline_end: 8, source_start: 0, source_end: 5, transform: {}, keyframes: [], effects: [] },
          ],
        },
      ],
    };
    const graph = ProEditorService.compileRenderGraph(project, '/src.mp4', '/out.mp4', os.tmpdir());
    const fc = graph.filterComplex.join('\n');
    assert.ok(graph.inputArgs.join(' ').includes('color=c=0x101418'), 'colour source added');
    assert.ok(graph.inputArgs.join(' ').includes('anullsrc'), 'silent audio added for the card');
    assert.ok(fc.includes("drawtext=text='Intro'"), 'card text drawn');
    assert.ok(fc.includes('concat=n=2'), 'card + video concatenated');
  });
});

describe('Title card: real FFmpeg export', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-titlecard-'));
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it(
    'burns the intro card into the exported video, then shows real footage',
    { skip: fs.existsSync(SAMPLE_VIDEO) ? false : 'sample video missing' },
    async () => {
      const project: any = {
        canvas: { duration: 8, aspect_ratio: '9:16', width: 1080, height: 1920, fps: 30 },
        tracks: [
          {
            id: 'tv', type: 'VIDEO', name: 'Main Video', hidden: false, items: [
              { id: 'card', type: 'IMAGE', is_title_card: true, title_card_text: 'Intro', background_color: '#101418',
                timeline_start: 0, timeline_end: 3, source_start: 0, source_end: 3, transform: {}, keyframes: [], effects: [] },
              { id: 'v', type: 'VIDEO', timeline_start: 3, timeline_end: 8, source_start: 2, source_end: 7, transform: {}, keyframes: [], effects: [] },
            ],
          },
        ],
      };
      const out = path.join(tmp, 'out.mp4');
      const graph = ProEditorService.compileRenderGraph(project, SAMPLE_VIDEO, out, tmp);
      const args = [
        '-y', '-t', '8',
        ...graph.inputArgs,
        '-filter_complex', graph.filterComplex.join(';'),
        '-map', graph.videoMap, '-map', graph.audioMap,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
        '-c:a', 'aac', '-b:a', '96k', '-pix_fmt', 'yuv420p', out,
      ];
      await execFileAsync(ffmpegBin, args, { timeout: 120000 });
      assert.ok(fs.existsSync(out) && fs.statSync(out).size > 0, 'export produced a file');

      // Probe duration ≈ 8s.
      const { stdout } = await execFileAsync(ffmpegBin.replace(/ffmpeg$/, 'ffprobe'), [
        '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out,
      ]).catch(async () => {
        // ffprobe may not sit beside ffmpeg-static; fall back to extracting frames only.
        return { stdout: '' };
      });
      if (stdout.trim()) {
        assert.ok(Math.abs(parseFloat(stdout) - 8) < 0.6, `~8s output, got ${stdout.trim()}`);
      }

      // Frame during the card (t=1): near-uniform dark background.
      const cardFrame = path.join(tmp, 'card.rgb');
      await execFileAsync(ffmpegBin, ['-y', '-ss', '1', '-i', out, '-frames:v', '1', '-vf', 'scale=120:213,format=rgb24', '-f', 'rawvideo', cardFrame]);
      const card = fs.readFileSync(cardFrame);
      let dark = 0;
      let white = 0;
      for (let i = 0; i < card.length; i += 3) {
        const r = card[i], g = card[i + 1], b = card[i + 2];
        if (r < 40 && g < 40 && b < 45) dark++;
        if (r > 200 && g > 200 && b > 200) white++;
      }
      const px = card.length / 3;
      assert.ok(dark / px > 0.6, `card frame should be mostly dark bg (got ${(dark / px).toFixed(2)})`);
      assert.ok(white > 20, `card frame should contain white text pixels (got ${white})`);

      // Frame during the footage (t=5): NOT the uniform card.
      const vidFrame = path.join(tmp, 'vid.rgb');
      await execFileAsync(ffmpegBin, ['-y', '-ss', '5', '-i', out, '-frames:v', '1', '-vf', 'scale=120:213,format=rgb24', '-f', 'rawvideo', vidFrame]);
      const vid = fs.readFileSync(vidFrame);
      let vidDark = 0;
      for (let i = 0; i < vid.length; i += 3) {
        if (vid[i] < 40 && vid[i + 1] < 40 && vid[i + 2] < 45) vidDark++;
      }
      assert.ok(vidDark / (vid.length / 3) < 0.6, 'footage frame is not the solid card');
    }
  );
});
