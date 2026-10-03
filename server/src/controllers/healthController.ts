import { Request, Response } from 'express';
import { getHealthStatus } from '../services/healthService.js';

export const checkHealth = (_req: Request, res: Response): void => {
  const health = getHealthStatus();
  res.status(200).json(health);
};
