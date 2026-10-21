import { Request, Response } from 'express';
import { getHealthStatus, getReadinessStatus } from '../services/healthService.js';

export const checkHealth = async (_req: Request, res: Response): Promise<void> => {
  const health = getHealthStatus();
  res.status(200).json(health);
};

export const checkReadiness = async (_req: Request, res: Response): Promise<void> => {
  const readiness = await getReadinessStatus();
  res.status(readiness.status === 'ready' ? 200 : 503).json(readiness);
};
