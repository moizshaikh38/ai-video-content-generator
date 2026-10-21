import { SmartReframeService } from '../services/smartReframeService.js';
import { ClipAnalysisService } from '../services/clipAnalysisService.js';
import { ViralCloneService } from '../services/viralCloneService.js';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface McpCallToolRequest {
  name: string;
  arguments?: Record<string, any>;
}

export interface McpCallToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export class VireoMcpServer {
  /**
   * Returns list of supported MCP tools for AI agents (Claude, Cursor, Antigravity).
   */
  public static listTools(): McpToolDefinition[] {
    return [
      {
        name: 'vireoclip_get_system_status',
        description: 'Returns VireoClip system health, supported reframing layouts, and available caption presets.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'vireoclip_calculate_clip_targets',
        description: 'Calculates dynamic optimal candidate clip density based on video duration (from OpenShorts).',
        inputSchema: {
          type: 'object',
          properties: {
            durationSeconds: { type: 'number', description: 'Duration of the source video in seconds' },
          },
          required: ['durationSeconds'],
        },
      },
      {
        name: 'vireoclip_generate_hook_variants',
        description: 'Generates 5 viral hook variations (contrarian, curiosity, stat, story, question) for any video concept (from Hypit).',
        inputSchema: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Topic or opening sentence of the clip' },
          },
          required: ['topic'],
        },
      },
      {
        name: 'vireoclip_get_layout_filter',
        description: 'Generates exact FFmpeg video filter for vertical layouts (track, split, screencast, blur).',
        inputSchema: {
          type: 'object',
          properties: {
            layoutMode: { type: 'string', enum: ['track', 'split', 'screencast', 'blur'], description: 'Layout mode' },
            aspectRatio: { type: 'string', enum: ['9:16', '1:1', '16:9'], default: '9:16' },
            speaker1X: { type: 'number', description: 'Normalized center X for Speaker 1 (split mode)' },
            speaker2X: { type: 'number', description: 'Normalized center X for Speaker 2 (split mode)' },
          },
          required: ['layoutMode'],
        },
      },
      {
        name: 'vireoclip_deduplicate_candidates',
        description: 'Applies 25% overlap deduplication on clip candidates to eliminate redundant social clips.',
        inputSchema: {
          type: 'object',
          properties: {
            candidates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  start_seconds: { type: 'number' },
                  end_seconds: { type: 'number' },
                  engagement_score: { type: 'number' },
                },
                required: ['start_seconds', 'end_seconds', 'engagement_score'],
              },
            },
            overlapThreshold: { type: 'number', default: 0.25 },
          },
          required: ['candidates'],
        },
      },
    ];
  }

  /**
   * Dispatches and executes an MCP tool call from an AI agent.
   */
  public static async callTool(request: McpCallToolRequest): Promise<McpCallToolResponse> {
    const { name, arguments: args = {} } = request;

    try {
      switch (name) {
        case 'vireoclip_get_system_status': {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'ready',
                  name: 'VireoClip AI Video Pipeline',
                  version: '2.5.0',
                  supported_layouts: ['track', 'split', 'screencast', 'blur'],
                  features: [
                    'MediaPipe Face Detection',
                    '2-Person Podcast Split Stack',
                    'Dynamic Density Scaling',
                    '25% Overlap Deduplication',
                    'Word-Anchored Effect Timeline',
                    'Zero-Clip Auto-Relaxation',
                    'Model Context Protocol (MCP) Server',
                  ],
                }, null, 2),
              },
            ],
          };
        }

        case 'vireoclip_calculate_clip_targets': {
          const duration = Number(args.durationSeconds) || 0;
          const targets = ClipAnalysisService.calculateDynamicClipTargets(duration);
          return {
            content: [{ type: 'text', text: JSON.stringify(targets, null, 2) }],
          };
        }

        case 'vireoclip_generate_hook_variants': {
          const topic = String(args.topic || '');
          const variants = ViralCloneService.generateHookVariants(topic);
          return {
            content: [{ type: 'text', text: JSON.stringify({ variants }, null, 2) }],
          };
        }

        case 'vireoclip_get_layout_filter': {
          const layoutMode = args.layoutMode || 'track';
          const filter = SmartReframeService.buildLayoutCropFilter({
            layoutMode,
            aspectRatio: args.aspectRatio || '9:16',
            sourceWidth: 1920,
            sourceHeight: 1080,
            duration: 30,
            speaker1X: args.speaker1X,
            speaker2X: args.speaker2X,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify({ layoutMode, filter }, null, 2) }],
          };
        }

        case 'vireoclip_deduplicate_candidates': {
          const candidates = Array.isArray(args.candidates) ? args.candidates : [];
          const thresh = Number(args.overlapThreshold) || 0.25;
          const deduped = ClipAnalysisService.deduplicateCandidates(candidates, thresh);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  original_count: candidates.length,
                  deduplicated_count: deduped.length,
                  removed_duplicates: candidates.length - deduped.length,
                  candidates: deduped,
                }, null, 2),
              },
            ],
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown MCP tool: ${name}` }],
          };
      }
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Tool error (${name}): ${err.message}` }],
      };
    }
  }
}
