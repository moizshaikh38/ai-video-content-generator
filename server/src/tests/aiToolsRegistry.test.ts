/**
 * AI Tools registry invariants: guards the guided-preview panel's contract so it can never
 * show a fake Apply. Imports the frontend pure module directly (same cross-tree pattern as the
 * caption/waveform/introOutro modules) and runs under the backend test runner.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_TOOL_GROUPS,
  ALL_AI_TOOLS,
  isActivatable,
  findAiTool,
} from '../../../src/lib/aiToolsRegistry.js';

describe('AI Tools registry', () => {
  it('has the three required groups in order', () => {
    assert.deepEqual(
      AI_TOOL_GROUPS.map((g) => g.id),
      ['audio_cleanup', 'broll_voice', 'visual_enhance'],
    );
  });

  it('every tool id is unique', () => {
    const ids = ALL_AI_TOOLS.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate tool id');
  });

  it('ready/limited tools route to a real target; soon tools never do', () => {
    for (const tool of ALL_AI_TOOLS) {
      if (tool.status === 'soon') {
        assert.equal(tool.target, undefined, `${tool.id} must not expose a target`);
        assert.equal(tool.actionLabel, undefined, `${tool.id} must not expose an action label`);
        assert.ok(tool.missing && tool.missing.length > 0, `${tool.id} must explain what is missing`);
        assert.equal(isActivatable(tool), false);
      } else {
        assert.ok(tool.target, `${tool.id} must have a navigation target`);
        const hasRoute = Boolean(tool.target?.tab || tool.target?.aiTool);
        assert.ok(hasRoute, `${tool.id} target must name a tab or aiTool`);
        assert.ok(tool.actionLabel && tool.actionLabel.length > 0, `${tool.id} needs an action label`);
        assert.equal(isActivatable(tool), true);
      }
    }
  });

  it('limited tools explain their limitation', () => {
    for (const tool of ALL_AI_TOOLS) {
      if (tool.status === 'limited') {
        assert.ok(tool.limitation && tool.limitation.length > 0, `${tool.id} must explain its limitation`);
      }
    }
  });

  it('every tool has description, preview and expected result for the hover card', () => {
    for (const tool of ALL_AI_TOOLS) {
      assert.ok(tool.label, `${tool.id} missing label`);
      assert.ok(tool.description, `${tool.id} missing description`);
      assert.ok(tool.preview, `${tool.id} missing preview key`);
      assert.ok(tool.expectedResult, `${tool.id} missing expected result`);
    }
  });

  it('targets only reference known tabs and AI workspaces', () => {
    const KNOWN_TABS = new Set([
      'transcript', 'captions', 'layout', 'text', 'audio',
      'broll', 'translate', 'brand', 'media', 'elements', 'ai_tools',
    ]);
    const KNOWN_AI = new Set([
      'producer', 'translate', 'content_pack', 'hook_lab',
      'thumbnail_lab', 'autopilot', 'ab_studio', 'copilot',
    ]);
    for (const tool of ALL_AI_TOOLS) {
      if (tool.target?.tab) assert.ok(KNOWN_TABS.has(tool.target.tab), `${tool.id} unknown tab ${tool.target.tab}`);
      if (tool.target?.aiTool) assert.ok(KNOWN_AI.has(tool.target.aiTool), `${tool.id} unknown aiTool ${tool.target.aiTool}`);
    }
  });

  it('findAiTool resolves known ids and rejects unknown', () => {
    assert.ok(findAiTool('remove_filler'));
    assert.equal(findAiTool('does_not_exist'), undefined);
  });
});
