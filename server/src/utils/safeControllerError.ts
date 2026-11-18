import type { Response } from 'express';

/** Controllers that handle failures locally must not return server internals. */
export function sendSafeControllerError(
  res: Response,
  error: unknown,
  fallback: { status?: number; code?: string; message: string },
): void {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const suppliedStatus = candidate.statusCode ?? fallback.status ?? 500;
  const status = typeof suppliedStatus === 'number' && Number.isInteger(suppliedStatus) && suppliedStatus >= 400 && suppliedStatus <= 599 ? suppliedStatus : 500;
  const serverError = status >= 500;
  const code = serverError ? 'INTERNAL_ERROR' : typeof candidate.code === 'string' && candidate.code ? candidate.code : fallback.code || 'REQUEST_FAILED';
  const message = serverError ? 'Internal server error' : typeof candidate.message === 'string' && candidate.message ? candidate.message : fallback.message;
  res.status(status).json({ status: 'error', code, message });
}
