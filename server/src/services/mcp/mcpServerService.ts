/**
 * VireoClip Model Context Protocol (MCP) Server Service
 *
 * Implements Phase 9: Secure Model Context Protocol (MCP) Server.
 * Exposes VireoClip video creation capabilities to external AI agents
 * via JSON-RPC 2.0 with strict tenant isolation and authentication.
 */

import { ViralIntelligenceService } from '../viralIntelligenceService.js';
import { RecipeService } from '../recipeService.js';
import { KenBurnsUtils, KenBurnsMotionStyle } from '../../utils/kenBurnsUtils.js';
import { ThumbnailStudioService, YouTubeThumbnailStyle } from '../thumbnailStudioService.js';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { logger } from '../../utils/logger.js';
import { TranscriptWord } from '../../types/index.js';

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export class McpServerService {
  /**
   * Available MCP tools exposed to external AI agents
   */
  public static readonly TOOLS: McpToolDefinition[] = [
    {
      name: 'list_projects',
      description: 'Lists all video projects belonging to the authenticated user.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of projects to return (default: 20)' },
        },
      },
    },
    {
      name: 'list_clips',
      description: 'Lists video clips for a given project belonging to the authenticated user.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'The project UUID' },
        },
        required: ['projectId'],
      },
    },
    {
      name: 'analyze_clip_pacing',
      description: 'Calculates words-per-minute pacing curves, Hook Velocity, and viral retention recommendations.',
      inputSchema: {
        type: 'object',
        properties: {
          words: {
            type: 'array',
            description: 'Transcript words with id, word, start, and end timestamps',
            items: { type: 'object' },
          },
          durationSec: { type: 'number', description: 'Total duration of the clip in seconds' },
        },
        required: ['words'],
      },
    },
    {
      name: 'apply_style_recipe',
      description: 'Loads and validates a declarative .vrecipe.json caption style recipe and generates ASS subtitle format.',
      inputSchema: {
        type: 'object',
        properties: {
          recipeId: {
            type: 'string',
            description: 'Built-in recipe ID (hormozi-punchy, mrbeast-hyper, aliabdaal-clean, dev-tutorial)',
          },
          cues: { type: 'array', description: 'Timed caption cues to format' },
        },
        required: ['recipeId'],
      },
    },
    {
      name: 'create_broll_fallback',
      description: 'Generates Ken Burns motion filter and prompt specifications for AI image B-roll fallback.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Visual concept prompt for B-roll' },
          motion: {
            type: 'string',
            enum: ['slow_zoom_in', 'slow_zoom_out', 'pan_left_to_right', 'pan_right_to_left'],
            description: 'Ken Burns motion style',
          },
          durationSec: { type: 'number', description: 'Clip duration in seconds (default: 3.5)' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'generate_youtube_thumbnail',
      description: 'Generates YouTube 1280x720 thumbnail specifications with safe-zone compliance and mobile title truncation.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Thumbnail headline text' },
          style: {
            type: 'string',
            enum: ['bold_text_face', 'cinematic_minimal', 'high_contrast_curiosity'],
            description: 'Thumbnail art direction',
          },
          facePlacement: {
            type: 'string',
            enum: ['left', 'right', 'center'],
            description: 'Detected speaker face placement',
          },
        },
        required: ['title'],
      },
    },
  ];

  /**
   * Main entry point to process an authenticated MCP JSON-RPC 2.0 request
   */
  public static async handleRpcRequest(
    request: McpJsonRpcRequest,
    userId: string
  ): Promise<McpJsonRpcResponse> {
    const id = request.id ?? null;

    if (!request || request.jsonrpc !== '2.0' || !request.method) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0" and method is required' },
      };
    }

    try {
      switch (request.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: { name: 'vireoclip-mcp-server', version: '1.0.0' },
              capabilities: { tools: {} },
            },
          };

        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: { tools: this.TOOLS },
          };

        case 'tools/call':
          return await this.handleToolCall(request.params, userId, id);

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: "${request.method}"` },
          };
      }
    } catch (err: any) {
      logger.error('[McpServer] RPC execution error', { error: err.message, method: request.method });
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: 'Internal error', data: err.message },
      };
    }
  }

  /**
   * Dispatches tool calls ensuring tenant isolation
   */
  private static async handleToolCall(
    params: any,
    userId: string,
    id: string | number | null
  ): Promise<McpJsonRpcResponse> {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (!toolName) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: 'Missing tool name in params' },
      };
    }

    switch (toolName) {
      case 'list_projects': {
        const limit = Math.max(1, Math.min(50, Number(args.limit) || 20));
        const { data: projects, error } = await dataRepository
          .from('projects')
          .select('id, title, video_status, duration_seconds, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) {
          throw new Error(`Database error: ${error.message}`);
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ projects: projects || [] }, null, 2) }],
          },
        };
      }

      case 'list_clips': {
        if (!args.projectId) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'projectId argument is required' },
          };
        }

        // Verify project ownership
        const { data: project } = await dataRepository
          .from('projects')
          .select('id')
          .eq('id', args.projectId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!project) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32004, message: 'Project not found or access denied (tenant isolation)' },
          };
        }

        const { data: clips } = await dataRepository
          .from('clips')
          .select('id, title, virality_score, start_seconds, end_seconds, aspect_ratio, status')
          .eq('project_id', args.projectId)
          .eq('user_id', userId);

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ clips: clips || [] }, null, 2) }],
          },
        };
      }

      case 'analyze_clip_pacing': {
        const words = args.words as TranscriptWord[];
        if (!Array.isArray(words)) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'words array is required' },
          };
        }

        const analysis = ViralIntelligenceService.analyzePacing(words, args.durationSec);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }],
          },
        };
      }

      case 'apply_style_recipe': {
        const recipeId = args.recipeId;
        const recipe = await RecipeService.loadRecipe(recipeId);
        const cues = args.cues || [];
        const assScript = RecipeService.generateAssScriptFromRecipe({ cues, recipe });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    recipe: { id: recipe.id, name: recipe.name, typography: recipe.typography },
                    assScript,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        };
      }

      case 'create_broll_fallback': {
        const prompt = KenBurnsUtils.sanitizePrompt(args.prompt);
        const motion = (args.motion as KenBurnsMotionStyle) || 'slow_zoom_in';
        const durationSec = Math.max(1.0, Math.min(15.0, Number(args.durationSec) || 3.5));

        const filter = KenBurnsUtils.buildStaticImageToVideoFilter({
          motion,
          durationSec,
          outputWidth: 1080,
          outputHeight: 1920,
        });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    prompt,
                    motion,
                    durationSec,
                    ffmpegFilter: filter,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        };
      }

      case 'generate_youtube_thumbnail': {
        const spec = ThumbnailStudioService.generateThumbnailSpec({
          title: args.title,
          style: args.style as YouTubeThumbnailStyle,
          facePlacement: args.facePlacement,
        });
        const ffmpegFilter = ThumbnailStudioService.buildThumbnailFilter(spec);

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ spec, ffmpegFilter }, null, 2),
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool not found: "${toolName}"` },
        };
    }
  }
}
