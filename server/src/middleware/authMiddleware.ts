import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { supabaseAuthClient, isServerSupabaseConfigured } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      status: 'error',
      message: 'Authentication required. Missing Bearer token in Authorization header.',
    });
    return;
  }

  const token = authHeader.split(' ')[1]?.trim();

  if (!token) {
    res.status(401).json({
      status: 'error',
      message: 'Authentication token is empty.',
    });
    return;
  }

  // Handle local development demo token fallback when Supabase is not configured
  if (token === 'demo-token' && !isServerSupabaseConfigured) {
    req.user = {
      id: 'demo-user-id',
      email: 'demo@vireo.app',
      app_metadata: {},
      user_metadata: { full_name: 'Demo Creator' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as any;
    next();
    return;
  }

  try {
    const { data: { user }, error } = await supabaseAuthClient.auth.getUser(token);

    if (error || !user) {
      logger.warn(`Auth failed for token from ${req.ip}:`, error?.message || 'User not found');
      res.status(401).json({
        status: 'error',
        message: 'Invalid or expired authentication token.',
      });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error('Unexpected error validating auth token:', err);
    res.status(401).json({
      status: 'error',
      message: 'Failed to authenticate request.',
    });
  }
};
