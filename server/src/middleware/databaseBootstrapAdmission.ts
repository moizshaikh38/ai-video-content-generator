import type { Request, Response, NextFunction } from 'express';
import { isDatabaseBootstrapReady } from '../services/databaseBootstrapState.js';

// /health stays available while startup runs. Application requests must not
// reach writes that depend on unique indexes before their bootstrap completes.
export function databaseBootstrapAdmission(_req: Request, res: Response, next: NextFunction): void {
  if (!isDatabaseBootstrapReady()) {
    res.setHeader('Retry-After', '2');
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service is initializing. Retry shortly.',
    });
    return;
  }
  next();
}
