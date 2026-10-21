import { describe, it } from 'node:test';
import assert from 'node:assert';
import { McpServerService } from '../services/mcp/mcpServerService.js';
import { TranscriptWord } from '../types/index.js';

describe('Phase 9: Secure Model Context Protocol (MCP) Server', () => {
  const mockUserId = 'usr_test_agent_123';

  describe('Protocol Compliance & Initialization', () => {
    it('1. responds to initialize with protocol version and capabilities', async () => {
      const response = await McpServerService.handleRpcRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
        },
        mockUserId
      );

      assert.strictEqual(response.jsonrpc, '2.0');
      assert.strictEqual(response.id, 1);
      assert.ok(response.result);
      assert.strictEqual(response.result.protocolVersion, '2024-11-05');
      assert.strictEqual(response.result.serverInfo.name, 'vireoclip-mcp-server');
    });

    it('2. responds to ping request', async () => {
      const response = await McpServerService.handleRpcRequest(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'ping',
        },
        mockUserId
      );

      assert.strictEqual(response.id, 2);
      assert.deepStrictEqual(response.result, {});
    });

    it('3. returns tools/list with all 6 tools and parameter schemas', async () => {
      const response = await McpServerService.handleRpcRequest(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/list',
        },
        mockUserId
      );

      assert.strictEqual(response.id, 3);
      assert.ok(response.result?.tools);
      const toolNames = response.result.tools.map((t: any) => t.name);
      assert.ok(toolNames.includes('list_projects'));
      assert.ok(toolNames.includes('list_clips'));
      assert.ok(toolNames.includes('analyze_clip_pacing'));
      assert.ok(toolNames.includes('apply_style_recipe'));
      assert.ok(toolNames.includes('create_broll_fallback'));
      assert.ok(toolNames.includes('generate_youtube_thumbnail'));
    });

    it('4. rejects invalid JSON-RPC version or missing method', async () => {
      const response = await McpServerService.handleRpcRequest(
        {
          jsonrpc: '1.0' as any,
          id: 4,
          method: '',
        },
        mockUserId
      );

      assert.ok(response.error);
      assert.strictEqual(response.error.code, -32600);
    });

    it('5. returns error for unrecognized method', async () => {
      const response = await McpServerService.handleRpcRequest(
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'custom/unknown_action',
        },
        mockUserId
      );

      assert.ok(response.error);
      assert.strictEqual(response.error.code, -32601);
    });
  });

  describe('Tool Execution via tools/call', () => {
    it('1. executes analyze_clip_pacing tool', async () => {
      const words: TranscriptWord[] = [
        { id: 'w_0', word: 'Start', start: 0.1, end: 0.5 },
        { id: 'w_1', word: 'building', start: 0.6, end: 1.0 },
        { id: 'w_2', word: 'now', start: 1.1, end: 1.4 },
      ];

      const response = await McpServerService.handleRpcRequest(
        {
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: {
            name: 'analyze_clip_pacing',
            arguments: { words, durationSec: 3.0 },
          },
        },
        mockUserId
      );

      assert.strictEqual(response.id, 10);
      assert.ok(response.result?.content?.[0]?.text);
      const parsed = JSON.parse(response.result.content[0].text);
      assert.strictEqual(parsed.totalWords, 3);
      assert.ok(parsed.averageWpm > 0);
    });

    it('2. executes apply_style_recipe tool with .vrecipe.json', async () => {
      const response = await McpServerService.handleRpcRequest(
        {
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: {
            name: 'apply_style_recipe',
            arguments: {
              recipeId: 'hormozi-punchy',
              cues: [{ id: 'c1', start: 1.0, end: 2.0, text: 'VIRAL CLIP' }],
            },
          },
        },
        mockUserId
      );

      assert.strictEqual(response.id, 11);
      assert.ok(response.result?.content?.[0]?.text);
      const parsed = JSON.parse(response.result.content[0].text);
      assert.strictEqual(parsed.recipe.id, 'hormozi-punchy');
      assert.ok(parsed.assScript.includes('Dialogue:'));
      assert.ok(parsed.assScript.includes('VIRAL CLIP'));
    });

    it('3. executes create_broll_fallback with Ken Burns motion', async () => {
      const response = await McpServerService.handleRpcRequest(
        {
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: {
            name: 'create_broll_fallback',
            arguments: {
              prompt: 'high speed financial trading terminal with multiple monitors',
              motion: 'slow_zoom_in',
              durationSec: 4.0,
            },
          },
        },
        mockUserId
      );

      assert.strictEqual(response.id, 12);
      const parsed = JSON.parse(response.result.content[0].text);
      assert.strictEqual(parsed.motion, 'slow_zoom_in');
      assert.ok(parsed.ffmpegFilter.includes('zoompan='));
    });

    it('4. executes generate_youtube_thumbnail tool with title clamp', async () => {
      const longTitle = 'The Most Incredible Secret Trick to Getting 1 Million Views Overnight in 2026';
      const response = await McpServerService.handleRpcRequest(
        {
          jsonrpc: '2.0',
          id: 13,
          method: 'tools/call',
          params: {
            name: 'generate_youtube_thumbnail',
            arguments: {
              title: longTitle,
              style: 'high_contrast_curiosity',
              facePlacement: 'right',
            },
          },
        },
        mockUserId
      );

      assert.strictEqual(response.id, 13);
      const parsed = JSON.parse(response.result.content[0].text);
      assert.strictEqual(parsed.spec.width, 1280);
      assert.strictEqual(parsed.spec.height, 720);
      assert.strictEqual(parsed.spec.isClamped, true);
      assert.ok(parsed.spec.title.length <= 50);
      assert.ok(parsed.ffmpegFilter.includes('drawtext='));
    });

    it('5. returns error when calling non-existent tool', async () => {
      const response = await McpServerService.handleRpcRequest(
        {
          jsonrpc: '2.0',
          id: 14,
          method: 'tools/call',
          params: {
            name: 'non_existent_tool_abc',
          },
        },
        mockUserId
      );

      assert.ok(response.error);
      assert.strictEqual(response.error.code, -32601);
    });
  });
});
