import { it } from 'node:test';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { composeQuickVideoGraph } from '../services/clipRenderService.js';
import { SmartReframeService } from '../services/smartReframeService.js';

const execFileAsync = promisify(execFile);

/**
 * Regression: smart renders resolving to a labeled layout graph (screencast/split)
 * previously went through fluent-ffmpeg videoFilters (-vf), where link labels are
 * illegal - every such clip failed permanently ("Filter not found" / label errors).
 * composeQuickVideoGraph must route labeled graphs to -filter_complex shape with a
 * single [0:v] input pad and a labeled [out_v] final output, and the composed graph
 * must actually parse and run in ffmpeg.
 */
async function runTests() {
  await it('simple chains stay label-free and get [0:v]/[out_v] pads', () => {
    const { graph, labeled } = composeQuickVideoGraph(['scale=1080:1920,crop=1080:1920', 'drawtext=text=\'wm\'']);
    assert.equal(labeled, false);
    assert.ok(graph.startsWith('[0:v]'));
    assert.ok(graph.endsWith('[out_v]'));
    assert.ok(!graph.includes('[0:v]['), 'no double input pad');
  });

  await it('labeled screencast graph is stripped of duplicate input pad and labeled', () => {
    const screencast = SmartReframeService.buildScreencastFilter({ mode: 'split_stacked' });
    const { graph, labeled } = composeQuickVideoGraph([screencast, 'drawtext=text=\'wm\'']);
    assert.equal(labeled, true);
    assert.ok(!graph.includes('[0:v][0:v]'), 'duplicate input pad must be stripped');
    assert.ok(graph.endsWith('[out_v]'));
  });

  await it('composed screencast graph actually parses and renders in ffmpeg', async () => {
    const screencast = SmartReframeService.buildScreencastFilter({ mode: 'split_stacked' });
    const { graph } = composeQuickVideoGraph([screencast, 'drawtext=text=\'VireoClip\'']);
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quickgraph-')), 'out.mp4');
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=duration=1:size=1080x608:rate=10',
      '-filter_complex', graph,
      '-map', '[out_v]',
      '-c:v', 'libx264', '-t', '1', out,
    ], { timeout: 60000 });
    const stat = fs.statSync(out);
    assert.ok(stat.size > 10000, 'rendered output should exist');
  });
}

await runTests();
