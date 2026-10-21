/**
 * VireoClip MCP Routes
 *
 * Implements Phase 9: Secure Model Context Protocol (MCP) Streamable-HTTP / JSON-RPC endpoint.
 */

import { Router, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { McpServerService, McpJsonRpcRequest } from '../services/mcp/mcpServerService.js';

const router = Router();

/**
 * GET /api/mcp
 * Endpoint discovery and MCP server status
 */
router.get(
  '/',
  asyncHandler(async (_req, res: Response) => {
    res.json({
      name: 'vireoclip-mcp-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      endpoints: {
        rpc: '/api/mcp',
      },
      toolsCount: McpServerService.TOOLS.length,
    });
  })
);

/**
 * POST /api/mcp
 * Authenticated JSON-RPC 2.0 tool execution endpoint
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32001, message: 'Authentication required' },
      });
      return;
    }

    const rpcRequest = req.body as McpJsonRpcRequest;
    const rpcResponse = await McpServerService.handleRpcRequest(rpcRequest, userId);

    res.json(rpcResponse);
  })
);

export default router;
