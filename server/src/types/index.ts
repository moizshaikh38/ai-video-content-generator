import { User } from '@supabase/supabase-js';
import { Request } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
}

export interface AppError extends Error {
  statusCode?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}
